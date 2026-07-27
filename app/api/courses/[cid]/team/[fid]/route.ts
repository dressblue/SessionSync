import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getFacilitator } from "@/lib/viewer";

async function ownerOf(courseId: string, facilitatorId: string) {
  const res = await query<{ role: string }>(
    `SELECT role FROM course_facilitators
       WHERE course_id = $1 AND facilitator_id = $2`,
    [courseId, facilitatorId]
  );
  return res.rows[0]?.role === "owner";
}

// Remove a co-facilitator from the course team. Owner-only. The owner cannot be
// removed (there must always be an owner), and you cannot remove yourself here.
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ cid: string; fid: string }> }
) {
  const { cid, fid } = await ctx.params;
  const facilitator = await getFacilitator();
  if (!facilitator || !(facilitator.isAdmin || (await ownerOf(cid, facilitator.id)))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (fid === facilitator.id) {
    return NextResponse.json(
      { error: "You can't remove yourself" },
      { status: 400 }
    );
  }
  await query(
    `DELETE FROM course_facilitators
       WHERE course_id = $1 AND facilitator_id = $2 AND role <> 'owner'`,
    [cid, fid]
  );
  return NextResponse.json({ ok: true });
}
