import { NextResponse } from "next/server";
import { getFacilitator } from "@/lib/viewer";
import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import {
  makeCode,
  type CourseRow,
} from "@/lib/facilitators";

export async function GET(req: Request) {
  const facilitator = await getFacilitator();
  if (!facilitator) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const res = await query<
    CourseRow & { session_count: number; facilitator_count: number }
  >(
    `SELECT c.*,
       (SELECT COUNT(*)::int FROM sessions s WHERE s.course_id = c.id) AS session_count,
       (SELECT COUNT(*)::int FROM course_facilitators cf2 WHERE cf2.course_id = c.id) AS facilitator_count
     FROM courses c
     JOIN course_facilitators cf ON cf.course_id = c.id
     WHERE cf.facilitator_id = $1
     ORDER BY c.created_at DESC`,
    [facilitator.id]
  );
  return NextResponse.json({
    courses: res.rows.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      code: c.code,
      sessionCount: c.session_count,
      facilitatorCount: c.facilitator_count,
      isTemplate: c.is_template,
      templateId: c.template_id,
      startsAt: c.starts_at,
      endsAt: c.ends_at,
      cohortLabel: c.cohort_label,
    })),
  });
}

export async function POST(req: Request) {
  const facilitator = await getFacilitator();
  if (!facilitator) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const description =
    typeof body?.description === "string" ? body.description.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  const id = randomUUID();
  // The course code is deliberately stable — it's the collaboration key
  // facilitators use to join the course team.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await query(
        `INSERT INTO courses (id, title, description, code, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, title.slice(0, 200), description.slice(0, 2000), makeCode(8), facilitator.id]
      );
      break;
    } catch (err) {
      if (attempt === 4) throw err;
    }
  }
  await query(
    `INSERT INTO course_facilitators (course_id, facilitator_id, role)
     VALUES ($1, $2, 'owner')`,
    [id, facilitator.id]
  );
  const res = await query<CourseRow>(`SELECT * FROM courses WHERE id = $1`, [id]);
  return NextResponse.json(res.rows[0]);
}
