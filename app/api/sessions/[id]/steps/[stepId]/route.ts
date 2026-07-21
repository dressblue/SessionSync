import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { authorizeSession, getSteps } from "@/lib/sessions";

type Ctx = { params: Promise<{ id: string; stepId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id, stepId } = await ctx.params;
  const session = await authorizeSession(req, id);
  if (!session) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);

  if (body?.move === "up" || body?.move === "down") {
    const steps = await getSteps(id);
    const idx = steps.findIndex((s) => s.id === stepId);
    if (idx === -1) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 });
    }
    const swapIdx = body.move === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= steps.length) {
      return NextResponse.json({ ok: true }); // already at the edge
    }
    const a = steps[idx];
    const b = steps[swapIdx];
    await query(`UPDATE steps SET position = $1 WHERE id = $2`, [b.position, a.id]);
    await query(`UPDATE steps SET position = $1 WHERE id = $2`, [a.position, b.id]);
    return NextResponse.json({ ok: true });
  }

  const title = typeof body?.title === "string" ? body.title.trim() : null;
  const content = typeof body?.content === "string" ? body.content : null;
  if (title === null && content === null) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  if (title !== null) {
    await query(
      `UPDATE steps SET title = $1 WHERE id = $2 AND session_id = $3`,
      [title.slice(0, 200), stepId, id]
    );
  }
  if (content !== null) {
    await query(
      `UPDATE steps SET content = $1 WHERE id = $2 AND session_id = $3`,
      [content, stepId, id]
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { id, stepId } = await ctx.params;
  const session = await authorizeSession(req, id);
  if (!session) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  await query(`DELETE FROM steps WHERE id = $1 AND session_id = $2`, [stepId, id]);
  // Compact positions and keep the current-step pointer in range.
  const steps = await getSteps(id);
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].position !== i) {
      await query(`UPDATE steps SET position = $1 WHERE id = $2`, [i, steps[i].id]);
    }
  }
  if (session.current_step >= steps.length && steps.length > 0) {
    await query(`UPDATE sessions SET current_step = $1 WHERE id = $2`, [
      steps.length - 1,
      id,
    ]);
  }
  return NextResponse.json({ ok: true });
}
