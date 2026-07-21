import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAuthorizedSession } from "@/lib/sessions";

// Close an activity: participants return to the current agenda step.
// Responses are retained for a future export/report feature.
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; aid: string }> }
) {
  const { id, aid } = await ctx.params;
  const session = await getAuthorizedSession(id, req.headers.get("x-facilitator-key"));
  if (!session) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  await query(
    `UPDATE activities SET status = 'closed' WHERE id = $1 AND session_id = $2`,
    [aid, id]
  );
  await query(
    `UPDATE sessions SET active_activity = NULL WHERE id = $1 AND active_activity = $2`,
    [id, aid]
  );
  return NextResponse.json({ ok: true });
}
