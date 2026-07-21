import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { authorizeSession } from "@/lib/sessions";

// Facilitator moderation of a single participant entry:
//  { highlighted: boolean } — check-mark an entry for the group
//  { hidden: boolean }      — hide from participants (facilitator still sees it)
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; rid: string }> }
) {
  const { id, rid } = await ctx.params;
  const session = await authorizeSession(req, id);
  if (!session) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const updates: string[] = [];
  const params: unknown[] = [];
  if (typeof body?.highlighted === "boolean") {
    params.push(body.highlighted);
    updates.push(`highlighted = $${params.length}`);
  }
  if (typeof body?.hidden === "boolean") {
    params.push(body.hidden);
    updates.push(`hidden = $${params.length}`);
  }
  if (updates.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  params.push(rid, id);
  await query(
    `UPDATE activity_responses SET ${updates.join(", ")}
     WHERE id = $${params.length - 1}
       AND activity_id IN (SELECT id FROM activities WHERE session_id = $${params.length})`,
    params
  );
  return NextResponse.json({ ok: true });
}
