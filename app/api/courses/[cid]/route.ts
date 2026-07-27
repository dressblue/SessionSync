import { NextResponse } from "next/server";
import { getFacilitator } from "@/lib/viewer";
import { query } from "@/lib/db";
import {
  getCourse,
  isCourseFacilitator,
} from "@/lib/facilitators";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ cid: string }> }
) {
  const { cid } = await ctx.params;
  const facilitator = await getFacilitator();
  if (!facilitator || !(await isCourseFacilitator(cid, facilitator.id))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const course = await getCourse(cid);
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  const [sessions, team, materials, files] = await Promise.all([
    query<{
      id: string;
      title: string;
      position: number;
      status: string;
      join_key: string | null;
      join_key_expires: string | null;
    }>(
      `SELECT id, title, position, status, join_key, join_key_expires
       FROM sessions WHERE course_id = $1 ORDER BY position ASC, created_at ASC`,
      [cid]
    ),
    query<{
      id: string;
      name: string;
      email: string | null;
      role: string;
      pending: boolean;
    }>(
      `SELECT f.id, f.name, f.email, cf.role,
              (f.clerk_user_id IS NULL) AS pending
       FROM course_facilitators cf
       JOIN facilitators f ON f.id = cf.facilitator_id
       WHERE cf.course_id = $1 ORDER BY cf.added_at ASC`,
      [cid]
    ),
    query<{ id: string; title: string; note: string; session_id: string | null }>(
      `SELECT id, title, note, session_id FROM course_materials
       WHERE course_id = $1 ORDER BY position ASC, created_at ASC`,
      [cid]
    ),
    query<{
      id: string;
      title: string;
      filename: string;
      size: number;
      session_id: string | null;
    }>(
      `SELECT id, title, filename, size, session_id FROM course_files
       WHERE course_id = $1 ORDER BY position ASC, created_at ASC`,
      [cid]
    ),
  ]);
  const now = Date.now();
  return NextResponse.json({
    course: {
      id: course.id,
      title: course.title,
      description: course.description,
      code: course.code,
      isTemplate: course.is_template,
      templateId: course.template_id,
      startsAt: course.starts_at,
      endsAt: course.ends_at,
      cohortLabel: course.cohort_label,
    },
    // (DELETE handler below removes the whole course.)
    me: {
      id: facilitator.id,
      role: team.rows.find((t) => t.id === facilitator.id)?.role ?? "facilitator",
      isAdmin: facilitator.isAdmin,
    },
    team: team.rows,
    materials: materials.rows.map((m) => ({
      id: m.id,
      title: m.title,
      note: m.note,
      sessionId: m.session_id,
    })),
    files: files.rows.map((f) => ({
      id: f.id,
      title: f.title,
      filename: f.filename,
      size: f.size,
      sessionId: f.session_id,
    })),
    sessions: sessions.rows.map((s) => ({
      id: s.id,
      title: s.title,
      position: s.position,
      status: s.status,
      joinKey: s.join_key,
      joinKeyExpires: s.join_key_expires,
      joinKeyActive:
        !!s.join_key &&
        !!s.join_key_expires &&
        new Date(s.join_key_expires).getTime() > now,
    })),
  });
}

// Delete a course and everything under it. Owner (of this course) or admin only.
// sessions.course_id has no FK, so sessions are deleted explicitly first (which
// CASCADEs steps → step_tools, activities → responses, participants, notes,
// messages); deleting the course row then CASCADEs course_facilitators,
// course_students, course_materials, course_files.
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ cid: string }> }
) {
  const { cid } = await ctx.params;
  const facilitator = await getFacilitator();
  if (!facilitator) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const owner = await query(
    `SELECT 1 FROM course_facilitators
       WHERE course_id = $1 AND facilitator_id = $2 AND role = 'owner'`,
    [cid, facilitator.id]
  );
  if (!facilitator.isAdmin && owner.rows.length === 0) {
    return NextResponse.json(
      { error: "Only the course owner or an admin can delete a course" },
      { status: 403 }
    );
  }
  const course = await getCourse(cid);
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  await query(`DELETE FROM sessions WHERE course_id = $1`, [cid]);
  await query(`DELETE FROM courses WHERE id = $1`, [cid]);
  return NextResponse.json({ ok: true });
}
