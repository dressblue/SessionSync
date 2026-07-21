import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { authorizeSession } from "@/lib/sessions";

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
