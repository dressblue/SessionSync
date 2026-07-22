import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import {
  getFacilitatorFromRequest,
  isCourseFacilitator,
} from "@/lib/facilitators";

// Add a needed-item entry. session_id absent/null = course-wide.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ cid: string }> }
) {
  const { cid } = await ctx.params;
  const facilitator = await getFacilitatorFromRequest(req);
  if (!facilitator || !(await isCourseFacilitator(cid, facilitator.id))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  const sessionId =
    typeof body?.sessionId === "string" && body.sessionId ? body.sessionId : null;
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (sessionId) {
    const s = await query<{ id: string }>(
      `SELECT id FROM sessions WHERE id = $1 AND course_id = $2`,
      [sessionId, cid]
    );
    if (!s.rows[0]) {
      return NextResponse.json({ error: "Session not in course" }, { status: 400 });
    }
  }
  const pos = await query<{ next: number }>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM course_materials WHERE course_id = $1`,
    [cid]
  );
  const id = randomUUID();
  await query(
    `INSERT INTO course_materials (id, course_id, session_id, title, note, position)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, cid, sessionId, title.slice(0, 200), note.slice(0, 500), pos.rows[0].next]
  );
  return NextResponse.json({ id });
}
