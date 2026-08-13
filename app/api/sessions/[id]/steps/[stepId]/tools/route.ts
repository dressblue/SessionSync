import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import { authorizeSession } from "@/lib/sessions";

// Attach a reusable tool to an agenda step. The stored spec mirrors the
// activities POST body, so launching a tool is a one-click re-post.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; stepId: string }> }
) {
  const { id, stepId } = await ctx.params;
  const session = await authorizeSession(req, id);
  if (!session) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);

  // Clone a tool straight from the library into this step (config is already a
  // complete, launch-ready spec — no per-kind validation/assembly needed).
  if (typeof body?.fromTemplateId === "string" && body.fromTemplateId) {
    const step = await query<{ id: string }>(
      `SELECT id FROM steps WHERE id = $1 AND session_id = $2`,
      [stepId, id]
    );
    if (!step.rows[0]) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 });
    }
    const t = await query<{ kind: string; prompt: string; config: string }>(
      `SELECT kind, prompt, config FROM tool_templates WHERE id = $1`,
      [body.fromTemplateId]
    );
    if (!t.rows[0]) {
      return NextResponse.json(
        { error: "Library tool not found" },
        { status: 404 }
      );
    }
    const pos = await query<{ next: number }>(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM step_tools WHERE step_id = $1`,
      [stepId]
    );
    const toolId = randomUUID();
    await query(
      `INSERT INTO step_tools (id, step_id, kind, prompt, config, position)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [toolId, stepId, t.rows[0].kind, t.rows[0].prompt, t.rows[0].config, pos.rows[0].next]
    );
    return NextResponse.json({ id: toolId });
  }

  // Save a live (or past) activity straight to this step — the facilitator has
  // already seen how it renders, so its stored spec (kind + prompt + config) is
  // copied verbatim into a launch-ready step tool.
  if (typeof body?.fromActivityId === "string" && body.fromActivityId) {
    const step = await query<{ id: string }>(
      `SELECT id FROM steps WHERE id = $1 AND session_id = $2`,
      [stepId, id]
    );
    if (!step.rows[0]) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 });
    }
    const a = await query<{ kind: string; prompt: string; config: string }>(
      `SELECT kind, prompt, config FROM activities WHERE id = $1 AND session_id = $2`,
      [body.fromActivityId, id]
    );
    if (!a.rows[0]) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }
    const pos = await query<{ next: number }>(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM step_tools WHERE step_id = $1`,
      [stepId]
    );
    const toolId = randomUUID();
    await query(
      `INSERT INTO step_tools (id, step_id, kind, prompt, config, position)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [toolId, stepId, a.rows[0].kind, a.rows[0].prompt, a.rows[0].config, pos.rows[0].next]
    );
    return NextResponse.json({ id: toolId });
  }

  const kind = body?.kind;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (
    !["vote", "likert", "columns", "reveal", "wheel", "workflow", "whiteboard", "exhibit", "video", "timer", "wordcloud", "sort", "impact1", "impact2", "impact3", "impact4", "survey", "slides", "checklist", "blocks"].includes(kind)
  ) {
    return NextResponse.json({ error: "Unknown tool kind" }, { status: 400 });
  }
  if (!prompt) {
    return NextResponse.json({ error: "A prompt is required" }, { status: 400 });
  }
  const step = await query<{ id: string }>(
    `SELECT id FROM steps WHERE id = $1 AND session_id = $2`,
    [stepId, id]
  );
  if (!step.rows[0]) {
    return NextResponse.json({ error: "Step not found" }, { status: 404 });
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
  if (Array.isArray(body?.statements)) config.statements = body.statements;
  if (typeof body?.displayOnly === "boolean") config.displayOnly = body.displayOnly;
  if (typeof body?.blocks === "number") config.blocks = body.blocks;
  if (Array.isArray(body?.blockLabels)) config.blockLabels = body.blockLabels;

  const pos = await query<{ next: number }>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM step_tools WHERE step_id = $1`,
    [stepId]
  );
  const toolId = randomUUID();
  await query(
    `INSERT INTO step_tools (id, step_id, kind, prompt, config, position)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [toolId, stepId, kind, prompt.slice(0, 300), JSON.stringify(config), pos.rows[0].next]
  );
  return NextResponse.json({ id: toolId });
}
