import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  getCourse,
  getFacilitatorFromRequest,
  isCourseFacilitator,
} from "@/lib/facilitators";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ cid: string }> }
) {
  const { cid } = await ctx.params;
  const facilitator = await getFacilitatorFromRequest(req);
  if (!facilitator || !(await isCourseFacilitator(cid, facilitator.id))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const course = await getCourse(cid);
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  const [sessions, team] = await Promise.all([
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
    query<{ id: string; name: string; role: string }>(
      `SELECT f.id, f.name, cf.role FROM course_facilitators cf
       JOIN facilitators f ON f.id = cf.facilitator_id
       WHERE cf.course_id = $1 ORDER BY cf.added_at ASC`,
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
    },
    team: team.rows,
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
