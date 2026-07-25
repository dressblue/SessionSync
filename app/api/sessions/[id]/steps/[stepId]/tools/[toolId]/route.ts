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
  const kind = body?.kind;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (
    !["vote", "likert", "columns", "reveal", "wheel", "whiteboard"].includes(kind)
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
  if (body?.sourcing === "participants") config.sourcing = "participants";
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
