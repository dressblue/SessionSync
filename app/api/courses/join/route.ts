import { NextResponse } from "next/server";
import { getFacilitator } from "@/lib/viewer";
import { query } from "@/lib/db";
import {
  getCourseByCode,
} from "@/lib/facilitators";

// A facilitator joins a course team using the stable course code.
export async function POST(req: Request) {
  const facilitator = await getFacilitator();
  if (!facilitator) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";
  const course = await getCourseByCode(code);
  if (!course) {
    return NextResponse.json(
      { error: "No course found for that code" },
      { status: 404 }
    );
  }
  await query(
    `INSERT INTO course_facilitators (course_id, facilitator_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [course.id, facilitator.id]
  );
  return NextResponse.json({ id: course.id, title: course.title });
}
