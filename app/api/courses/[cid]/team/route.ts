import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { query } from "@/lib/db";
import { getFacilitator } from "@/lib/viewer";
import { getCourse } from "@/lib/facilitators";

const APP_BASE_URL =
  (process.env.APP_BASE_URL ?? "").replace(/\/$/, "") ||
  "https://sessionsync-three.vercel.app";

async function ownerOf(courseId: string, facilitatorId: string) {
  const res = await query<{ role: string }>(
    `SELECT role FROM course_facilitators
       WHERE course_id = $1 AND facilitator_id = $2`,
    [courseId, facilitatorId]
  );
  return res.rows[0]?.role === "owner";
}

// Invite a co-facilitator by email. Owner-only. Pre-creates (or reuses) a
// facilitator row keyed to the email so that when the invitee signs in with
// Clerk, ensureFacilitator() adopts this row — arriving already on the team.
// A Clerk email invitation is sent best-effort; the team grant alone is enough
// for them to gain access once they sign in with that email.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ cid: string }> }
) {
  const { cid } = await ctx.params;
  const facilitator = await getFacilitator();
  if (!facilitator || !(facilitator.isAdmin || (await ownerOf(cid, facilitator.id)))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const course = await getCourse(cid);
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "A valid email is required" },
      { status: 400 }
    );
  }

  // Find-or-create the facilitator row for this email.
  const existing = await query<{ id: string }>(
    `SELECT id FROM facilitators WHERE lower(email) = $1 LIMIT 1`,
    [email]
  );
  let facilitatorId = existing.rows[0]?.id;
  if (!facilitatorId) {
    facilitatorId = randomUUID();
    await query(
      `INSERT INTO facilitators (id, name, email) VALUES ($1, $2, $3)`,
      [facilitatorId, email, email]
    );
  }

  // Grant course-team membership (idempotent).
  await query(
    `INSERT INTO course_facilitators (course_id, facilitator_id, role)
       VALUES ($1, $2, 'facilitator') ON CONFLICT DO NOTHING`,
    [cid, facilitatorId]
  );

  // Best-effort Clerk email invitation — non-fatal if it fails (e.g. the person
  // already has an account; the team grant already lets them in).
  let invited = false;
  try {
    const clerk = await clerkClient();
    await clerk.invitations.createInvitation({
      emailAddress: email,
      notify: true,
      ignoreExisting: true,
      redirectUrl: `${APP_BASE_URL}/dashboard`,
    });
    invited = true;
  } catch {
    /* already-invited / existing account / mis-config — grant still stands */
  }

  return NextResponse.json({ ok: true, invited });
}
