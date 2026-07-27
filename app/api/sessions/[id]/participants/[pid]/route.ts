import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { authorizeSession } from "@/lib/sessions";

// Terminate an individual participant. Their seat is flagged removed (not
// deleted) so the state/respond self-heal can't resurrect it; the participant's
// app sees `removed` on its next poll and drops to the "you've left" screen.
// Only student seats can be removed — never a facilitator's own roster seat.
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string; pid: string }> }
) {
  const { id, pid } = await ctx.params;
  if (!(await authorizeSession(req, id))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  await query(
    `UPDATE participants SET removed_at = now()
       WHERE id = $1 AND session_id = $2 AND facilitator_id IS NULL`,
    [pid, id]
  );
  return NextResponse.json({ ok: true });
}
