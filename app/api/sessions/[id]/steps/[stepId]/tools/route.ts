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
  const kind = body?.kind;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!["vote", "likert", "columns"].includes(kind)) {
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
  if (Array.isArray(body?.items)) config.items = body.items;
  if (body?.sourcing === "participants") config.sourcing = "participants";

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
