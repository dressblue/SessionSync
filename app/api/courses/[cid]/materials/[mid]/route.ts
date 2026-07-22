import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  getFacilitatorFromRequest,
  isCourseFacilitator,
} from "@/lib/facilitators";

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ cid: string; mid: string }> }
) {
  const { cid, mid } = await ctx.params;
  const facilitator = await getFacilitatorFromRequest(req);
  if (!facilitator || !(await isCourseFacilitator(cid, facilitator.id))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  await query(
    `DELETE FROM course_materials WHERE id = $1 AND course_id = $2`,
    [mid, cid]
  );
  return NextResponse.json({ ok: true });
}
