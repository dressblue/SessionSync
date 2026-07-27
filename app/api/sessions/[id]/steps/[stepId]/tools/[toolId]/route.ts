import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { authorizeSession } from "@/lib/sessions";

// Edit a saved tool in place: kind, prompt, and its choices/config.
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; stepId: string; toolId: string }> }
) {
  const { id, stepId, toolId } = await ctx.params;
  const session = await authorizeSession(req, id);
  if (!session) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);

  // Reorder within the step: swap this tool with its neighbour. Positions are
  // normalized to array order (handles legacy rows that all share position 0).
  if (body?.move === "up" || body?.move === "down") {
    const step = await query<{ id: string }>(
      `SELECT id FROM steps WHERE id = $1 AND session_id = $2`,
      [stepId, id]
    );
    if (!step.rows[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const list = (
      await query<{ id: string }>(
        `SELECT id FROM step_tools WHERE step_id = $1
         ORDER BY position ASC, created_at ASC`,
        [stepId]
      )
    ).rows;
    const idx = list.findIndex((t) => t.id === toolId);
    const swap = body.move === "up" ? idx - 1 : idx + 1;
    if (idx !== -1 && swap >= 0 && swap < list.length) {
      const order = list.map((t) => t.id);
      [order[idx], order[swap]] = [order[swap], order[idx]];
      for (let i = 0; i < order.length; i++) {
        await query(`UPDATE step_tools SET position = $1 WHERE id = $2`, [
          i,
          order[i],
        ]);
      }
    }
    return NextResponse.json({ ok: true });
  }

  const kind = body?.kind;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (
    !["vote", "likert", "columns", "reveal", "wheel", "workflow", "whiteboard", "exhibit", "video", "timer", "wordcloud"].includes(kind)
  ) {
    return NextResponse.json({ error: "Unknown tool kind" }, { status: 400 });
  }
  if (!prompt) {
    return NextResponse.json({ error: "A prompt is required" }, { status: 400 });
  }
  const config: Record<string, unknown> = {};
  if (Array.isArray(body?.options)) config.options = body.options;
  if (Array.isArray(body?.columns)) config.columns = body.columns;
  if (Array.isArray(body?.items)) config.items = body.items;
  if (body?.graph && typeof body.graph === "object") config.graph = body.graph;
  if (body?.sourcing === "participants") config.sourcing = "participants";
  if (typeof body?.anchorSet === "string") config.anchorSet = body.anchorSet;
  if (typeof body?.exhibit === "string") config.exhibit = body.exhibit;
  if (typeof body?.fileId === "string") config.fileId = body.fileId;
  if (typeof body?.url === "string") config.url = body.url;
  if (typeof body?.text === "string") config.text = body.text;
  if (typeof body?.minutes === "number") config.minutes = body.minutes;
  await query(
    `UPDATE step_tools SET kind = $1, prompt = $2, config = $3
     WHERE id = $4
       AND step_id IN (SELECT id FROM steps WHERE id = $5 AND session_id = $6)`,
    [kind, prompt.slice(0, 300), JSON.stringify(config), toolId, stepId, id]
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string; stepId: string; toolId: string }> }
) {
  const { id, stepId, toolId } = await ctx.params;
  const session = await authorizeSession(req, id);
  if (!session) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  await query(
    `DELETE FROM step_tools WHERE id = $1
       AND step_id IN (SELECT id FROM steps WHERE id = $2 AND session_id = $3)`,
    [toolId, stepId, id]
  );
  return NextResponse.json({ ok: true });
}
