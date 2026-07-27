import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/viewer";

// Every course with its owner and counts. Admin-only. Each course is
// manageable via the normal /course/[cid] page (admins bypass the owner gate).
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const res = await query<{
    id: string;
    title: string;
    code: string;
    session_count: number;
    facilitator_count: number;
    owner: string | null;
    is_template: boolean;
    template_id: string | null;
    starts_at: string | null;
    ends_at: string | null;
    cohort_label: string;
  }>(
    `SELECT c.id, c.title, c.code, c.is_template, c.template_id,
       c.starts_at, c.ends_at, c.cohort_label,
       (SELECT COUNT(*)::int FROM sessions s WHERE s.course_id = c.id) AS session_count,
       (SELECT COUNT(*)::int FROM course_facilitators cf WHERE cf.course_id = c.id) AS facilitator_count,
       (SELECT f.name FROM course_facilitators cfo
          JOIN facilitators f ON f.id = cfo.facilitator_id
          WHERE cfo.course_id = c.id AND cfo.role = 'owner' LIMIT 1) AS owner
     FROM courses c
     ORDER BY c.is_template DESC, c.created_at DESC`
  );
  return NextResponse.json({
    courses: res.rows.map((c) => ({
      id: c.id,
      title: c.title,
      code: c.code,
      sessionCount: c.session_count,
      facilitatorCount: c.facilitator_count,
      owner: c.owner,
      isTemplate: c.is_template,
      templateId: c.template_id,
      startsAt: c.starts_at,
      endsAt: c.ends_at,
      cohortLabel: c.cohort_label,
    })),
  });
}
