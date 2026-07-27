import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/viewer";
import { deepCopyCourse } from "@/lib/sessions";

const APP_BASE_URL =
  (process.env.APP_BASE_URL ?? "").replace(/\/$/, "") ||
  "https://sessionsync-three.vercel.app";

// List every facilitator with their course memberships. Admin-only.
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const people = await query<{
    id: string;
    name: string;
    email: string | null;
    is_admin: boolean;
    pending: boolean;
  }>(
    `SELECT id, name, email, is_admin, (clerk_user_id IS NULL) AS pending
       FROM facilitators ORDER BY is_admin DESC, name ASC`
  );
  const memberships = await query<{
    facilitator_id: string;
    course_id: string;
    title: string;
    role: string;
  }>(
    `SELECT cf.facilitator_id, c.id AS course_id, c.title, cf.role
       FROM course_facilitators cf JOIN courses c ON c.id = cf.course_id`
  );
  const byFac = new Map<string, { id: string; title: string; role: string }[]>();
  for (const m of memberships.rows) {
    const list = byFac.get(m.facilitator_id) ?? [];
    list.push({ id: m.course_id, title: m.title, role: m.role });
    byFac.set(m.facilitator_id, list);
  }
  return NextResponse.json({
    facilitators: people.rows.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      isAdmin: !!p.is_admin,
      pending: !!p.pending,
      courses: byFac.get(p.id) ?? [],
    })),
  });
}

// Invite a facilitator by email. Admin-only. Optionally, in one step:
//   • grant support rights on one or more existing courses (`courseIds`), and/or
//   • clone an existing course or template into a fresh working course that the
//     invited facilitator owns (`clone: { sourceId, title?, startsAt?, endsAt?,
//     cohortLabel? }`).
// Mirrors the per-course team invite: pre-create an email-keyed row so the
// invitee is adopted on first sign-in; Clerk email is best-effort.
export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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

  // Courses to grant support (facilitator) rights on. `courseIds` is the current
  // shape; `courseId` is kept for backward compatibility.
  const grantIds = new Set<string>();
  if (Array.isArray(body?.courseIds)) {
    for (const x of body.courseIds) if (typeof x === "string" && x) grantIds.add(x);
  }
  if (typeof body?.courseId === "string" && body.courseId) grantIds.add(body.courseId);

  // Optional clone spec.
  const clone =
    body?.clone && typeof body.clone === "object" ? body.clone : null;
  const cloneSourceId =
    clone && typeof clone.sourceId === "string" ? clone.sourceId : "";
  if (cloneSourceId) {
    const src = await query<{ id: string }>(
      `SELECT id FROM courses WHERE id = $1`,
      [cloneSourceId]
    );
    if (!src.rows[0]) {
      return NextResponse.json(
        { error: "Clone source course not found" },
        { status: 400 }
      );
    }
  }

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

  // Clone the source into a fresh working course owned by the invitee.
  let clonedCourse: { id: string; code: string; title: string } | null = null;
  if (cloneSourceId) {
    const title =
      typeof clone.title === "string" && clone.title.trim()
        ? clone.title.trim()
        : undefined;
    const startsAt =
      typeof clone.startsAt === "string" && clone.startsAt ? clone.startsAt : null;
    const endsAt =
      typeof clone.endsAt === "string" && clone.endsAt ? clone.endsAt : null;
    const cohortLabel =
      typeof clone.cohortLabel === "string" ? clone.cohortLabel : "";
    const res = await deepCopyCourse(cloneSourceId, {
      isTemplate: false,
      title,
      startsAt,
      endsAt,
      cohortLabel,
      ownerFacilitatorId: facilitatorId,
    });
    // The invitee owns the clone already; don't also add a facilitator grant.
    grantIds.delete(res.id);
    const srcTitle = await query<{ title: string }>(
      `SELECT title FROM courses WHERE id = $1`,
      [res.id]
    );
    clonedCourse = { id: res.id, code: res.code, title: srcTitle.rows[0]?.title ?? "" };
  }

  // Grant support rights on each existing course that resolves.
  let grantedCount = 0;
  for (const cid of grantIds) {
    const course = await query<{ id: string }>(
      `SELECT id FROM courses WHERE id = $1`,
      [cid]
    );
    if (course.rows[0]) {
      await query(
        `INSERT INTO course_facilitators (course_id, facilitator_id, role)
           VALUES ($1, $2, 'facilitator') ON CONFLICT DO NOTHING`,
        [cid, facilitatorId]
      );
      grantedCount++;
    }
  }

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
    /* already-invited / existing account / mis-config — row + grants stand */
  }

  return NextResponse.json({ ok: true, invited, grantedCount, clonedCourse });
}
