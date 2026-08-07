import { NextResponse } from "next/server";
import { getFacilitator } from "@/lib/viewer";
import { isCourseFacilitator } from "@/lib/facilitators";
import { query } from "@/lib/db";

// Remove a deck from a course. Deletes only the row — the Blob object may be
// shared with cohort clones (deepCopyCourse copies the row by reference), so it
// is left in place (orphaned-Blob cleanup is a follow-up).
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ cid: string; deckId: string }> }
) {
  const { cid, deckId } = await ctx.params;
  const facilitator = await getFacilitator();
  if (!facilitator || !(await isCourseFacilitator(cid, facilitator.id))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  await query(
    `DELETE FROM course_decks WHERE id = $1 AND course_id = $2`,
    [deckId, cid]
  );
  return NextResponse.json({ ok: true });
}
