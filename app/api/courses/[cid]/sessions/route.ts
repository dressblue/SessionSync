import { NextResponse } from "next/server";
import { getFacilitator } from "@/lib/viewer";
import { query } from "@/lib/db";
import {
  getCourse,
  isCourseFacilitator,
} from "@/lib/facilitators";
import { createSession } from "@/lib/sessions";

export async function POST(
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
  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  const res = await query<{ next: number }>(
    `SELECT COALESCE(MAX(position), 0) + 1 AS next FROM sessions WHERE course_id = $1`,
    [cid]
  );
  const session = await createSession(title.slice(0, 200), cid, res.rows[0].next);
  return NextResponse.json({ id: session.id, title: session.title });
}
