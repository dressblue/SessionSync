import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/viewer";

// Remove a student from the roster. Admin-only. Their past session seats stay
// (attendance record); only the roster entry + its durable link are revoked.
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ cid: string; sid: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { cid, sid } = await ctx.params;
  await query(
    `DELETE FROM course_students WHERE id = $1 AND course_id = $2`,
    [sid, cid]
  );
  return NextResponse.json({ ok: true });
}
