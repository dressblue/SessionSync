import { randomUUID } from "crypto";
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

  // Move this tool to another step, or clone a copy into another step. Both
  // land at the end of the target step's tool list. Target must belong to the
  // same session.
  if (
    typeof body?.moveToStepId === "string" ||
    typeof body?.cloneToStepId === "string"
  ) {
    const isClone = typeof body?.cloneToStepId === "string";
    const targetStepId = (isClone ? body.cloneToStepId : body.moveToStepId) as string;
    // The target step may be in another session — as long as it belongs to the
    // same course (the facilitator's authorization covers the whole course
    // team). IS NOT DISTINCT FROM keeps standalone (null-course) sessions
    // matching themselves.
    const target = await query<{ id: string }>(
      `SELECT st.id FROM steps st
       JOIN sessions ts ON ts.id = st.session_id
       JOIN sessions ss ON ss.id = $2
       WHERE st.id = $1 AND ts.course_id IS NOT DISTINCT FROM ss.course_id`,
      [targetStepId, id]
    );
    if (!target.rows[0]) {
      return NextResponse.json({ error: "Target step not found" }, { status: 404 });
    }
    const src = await query<{ kind: string; prompt: string; config: string }>(
      `SELECT kind, prompt, config FROM step_tools
       WHERE id = $1 AND step_id IN (SELECT id FROM steps WHERE id = $2 AND session_id = $3)`,
      [toolId, stepId, id]
    );
    if (!src.rows[0]) {
      return NextResponse.json({ error: "Tool not found" }, { status: 404 });
    }
    const pos = await query<{ next: number }>(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM step_tools WHERE step_id = $1`,
      [targetStepId]
    );
    if (isClone) {
      await query(
        `INSERT INTO step_tools (id, step_id, kind, prompt, config, position)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), targetStepId, src.rows[0].kind, src.rows[0].prompt, src.rows[0].config, pos.rows[0].next]
      );
    } else {
      await query(
        `UPDATE step_tools SET step_id = $1, position = $2 WHERE id = $3`,
        [targetStepId, pos.rows[0].next, toolId]
      );
    }
    return NextResponse.json({ ok: true });
  }

  const kind = body?.kind;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (
    !["vote", "likert", "columns", "reveal", "wheel", "workflow", "whiteboard", "exhibit", "video", "timer", "wordcloud", "sort", "impact1", "impact2", "impact3", "impact4", "survey", "slides"].includes(kind)
  ) {
    return NextResponse.json({ error: "Unknown tool kind" }, { status: 400 });
  }
  if (!prompt) {
    return NextResponse.json({ error: "A prompt is required" }, { status: 400 });
  }
  const config: Record<string, unknown> = {};
  if (Array.isArray(body?.options)) config.options = body.options;
  if (Array.isArray(body?.columns)) config.columns = body.columns;
  if (Array.isArray(body?.words)) config.words = body.words;
  if (Array.isArray(body?.scales)) config.scales = body.scales;
  if (body?.mode === "single" || body?.mode === "multi") config.mode = body.mode;
  if (Array.isArray(body?.questions)) config.questions = body.questions;
  if (Array.isArray(body?.items)) config.items = body.items;
  if (body?.graph && typeof body.graph === "object") config.graph = body.graph;
  if (body?.sourcing === "participants") config.sourcing = "participants";
  if (typeof body?.anchorSet === "string") config.anchorSet = body.anchorSet;
  if (typeof body?.exhibit === "string") config.exhibit = body.exhibit;
  if (typeof body?.fileId === "string") config.fileId = body.fileId;
  if (typeof body?.url === "string") config.url = body.url;
  if (typeof body?.text === "string") config.text = body.text;
  if (typeof body?.minutes === "number") config.minutes = body.minutes;
  if (typeof body?.mediaType === "string") config.mediaType = body.mediaType;
  if (typeof body?.deckId === "string") config.deckId = body.deckId;
  if (typeof body?.startPage === "number") config.startPage = body.startPage;
  if (typeof body?.endPage === "number") config.endPage = body.endPage;
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
