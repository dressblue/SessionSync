import { cache } from "react";
import { randomUUID } from "crypto";
import { auth, currentUser } from "@clerk/nextjs/server";
import { query } from "./db";

export interface Facilitator {
  id: string;
  name: string;
  email: string | null;
  clerkUserId: string;
  isAdmin: boolean;
}

interface FacRow {
  id: string;
  name: string;
  email: string | null;
  clerk_user_id: string;
  is_admin: boolean;
}

// Bootstrap admins: any verified email listed here is auto-promoted on sign-in.
// Solves the chicken-and-egg of creating the first admin (there's no in-app way
// to grant admin without already being one).
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

const toFacilitator = (r: FacRow): Facilitator => ({
  id: r.id,
  name: r.name,
  email: r.email,
  clerkUserId: r.clerk_user_id,
  isAdmin: !!r.is_admin,
});

/** The signed-in facilitator, but only if they are a global admin. */
export async function requireAdmin(): Promise<Facilitator | null> {
  const f = await getFacilitator();
  return f?.isAdmin ? f : null;
}

/**
 * Resolve — and lazily provision — the facilitator row for the signed-in Clerk
 * user. Returns null when nobody is signed in. Request-cached so the many
 * authorization checks in a single request resolve to one DB round-trip.
 *
 * Facilitators self-provision (there is no admin allowlist): anyone signed in
 * becomes a facilitator, but reaches a course only by entering its invite code.
 */
export const getFacilitator = cache(async (): Promise<Facilitator | null> => {
  const { userId } = await auth();
  if (!userId) return null;
  const user = await currentUser();
  if (!user) return null;

  // Only ever trust a *verified* email. Matching an unverified address would
  // let someone attach an existing facilitator row by claiming its email.
  const primaryId = user.primaryEmailAddressId;
  const verified =
    user.emailAddresses.find(
      (e) => e.id === primaryId && e.verification?.status === "verified"
    ) ??
    user.emailAddresses.find((e) => e.verification?.status === "verified");
  const email = verified?.emailAddress?.toLowerCase() ?? null;

  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.username ||
    email ||
    "Facilitator";

  const f = await ensureFacilitator(userId, email, name);
  // Auto-promote allowlisted emails (bootstrap admins).
  if (email && ADMIN_EMAILS.has(email) && !f.isAdmin) {
    await query(`UPDATE facilitators SET is_admin = true WHERE id = $1`, [f.id]);
    return { ...f, isAdmin: true };
  }
  return f;
});

async function ensureFacilitator(
  clerkUserId: string,
  email: string | null,
  name: string
): Promise<Facilitator> {
  // 1. Already linked to this Clerk user.
  const linked = await query<FacRow>(
    `SELECT id, name, email, clerk_user_id, is_admin FROM facilitators
       WHERE clerk_user_id = $1`,
    [clerkUserId]
  );
  if (linked.rows[0]) return toFacilitator(linked.rows[0]);

  // 2. Adopt an existing unlinked row by verified email — this is how a
  //    pre-Clerk facilitator carries their course memberships forward.
  if (email) {
    const adopted = await query<FacRow>(
      `UPDATE facilitators SET clerk_user_id = $1, name = $2
         WHERE lower(email) = $3 AND clerk_user_id IS NULL
       RETURNING id, name, email, clerk_user_id, is_admin`,
      [clerkUserId, name.slice(0, 120), email]
    );
    if (adopted.rows[0]) return toFacilitator(adopted.rows[0]);
  }

  // 3. First time we've seen this person — create a fresh facilitator.
  // ON CONFLICT DO NOTHING + re-read makes this safe against the race where a
  // browser fires several requests at once on first sign-in (each would
  // otherwise try to insert the same clerk_user_id).
  const id = randomUUID();
  await query(
    `INSERT INTO facilitators (id, name, email, clerk_user_id)
       VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [id, name.slice(0, 120), email, clerkUserId]
  );
  const row = await query<FacRow>(
    `SELECT id, name, email, clerk_user_id, is_admin FROM facilitators
       WHERE clerk_user_id = $1`,
    [clerkUserId]
  );
  return toFacilitator(row.rows[0]);
}
