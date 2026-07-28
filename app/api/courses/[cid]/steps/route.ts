import { NextResponse } from "next/server";
import { getFacilitator } from "@/lib/viewer";
import { query } from "@/lib/db";
import { isCourseFacilitator } from "@/lib/facilitators";

// All sessions in a course with their steps — used by the tool Move/Copy picker
// so a tool can be relocated to a step in another session (e.g. 4.5 → 5.5).
export async function GET(
  req: Request,
  ctx: { params: Promise<{ cid: string }> }
) {
  const { cid } = await ctx.params;
  const facilitator = await getFacilitator();
  if (!facilitator || !(await isCourseFacilitator(cid, facilitator.id))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const rows = await query<{
    sessionId: string;
    sessionTitle: string;
    sessionPos: number;
    stepId: string;
    stepTitle: string;
    stepPos: number;
  }>(
    `SELECT s.id AS "sessionId", s.title AS "sessionTitle", s.position AS "sessionPos",
            st.id AS "stepId", st.title AS "stepTitle", st.position AS "stepPos"
     FROM sessions s
     JOIN steps st ON st.session_id = s.id
     WHERE s.course_id = $1
     ORDER BY s.position ASC, s.created_at ASC, st.position ASC`,
    [cid]
  );
  const bySession = new Map<
    string,
    {
      sessionId: string;
      sessionTitle: string;
      sessionPos: number;
      steps: { id: string; title: string; pos: number }[];
    }
  >();
  for (const r of rows.rows) {
    let g = bySession.get(r.sessionId);
    if (!g) {
      g = {
        sessionId: r.sessionId,
        sessionTitle: r.sessionTitle,
        sessionPos: r.sessionPos,
        steps: [],
      };
      bySession.set(r.sessionId, g);
    }
    g.steps.push({ id: r.stepId, title: r.stepTitle, pos: r.stepPos });
  }
  return NextResponse.json({ sessions: [...bySession.values()] });
}
