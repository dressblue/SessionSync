import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { authorizeSession, type ActivityRow } from "@/lib/sessions";

type Ctx = { params: Promise<{ id: string; aid: string }> };

// Facilitator activity management:
//  { status: "closed" } — close; participants return to the agenda step.
//  { advance: true }    — collect phase -> voting/rating phase: the visible
//                         (non-hidden) participant suggestions become the
//                         options/items.
// Responses are retained after close for a future export/report feature.
export async function PATCH(req: Request, ctx: Ctx) {
  const { id, aid } = await ctx.params;
  const session = await authorizeSession(req, id);
  if (!session) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);

  if (body?.advance === true) {
    const res = await query<ActivityRow>(
      `SELECT * FROM activities WHERE id = $1 AND session_id = $2 AND status = 'open'`,
      [aid, id]
    );
    const activity = res.rows[0];
    if (!activity) {
      return NextResponse.json({ error: "Activity not open" }, { status: 404 });
    }
    let config: Record<string, unknown> = {};
    try {
      config = JSON.parse(activity.config);
    } catch {
      /* rebuilt below */
    }
    if (config.phase !== "collect") {
      return NextResponse.json(
        { error: "Activity is not collecting suggestions" },
        { status: 409 }
      );
    }
    const entries = await query<{ value: string }>(
      `SELECT value FROM activity_responses
       WHERE activity_id = $1 AND column_index = -1 AND hidden = false
       ORDER BY created_at ASC`,
      [aid]
    );
    // Dedupe case-insensitively, keep first spelling, cap the list.
    const seen = new Set<string>();
    const list: string[] = [];
    for (const r of entries.rows) {
      const norm = r.value.trim().toLowerCase();
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      list.push(r.value.trim());
      if (list.length >= 12) break;
    }
    if (list.length < (activity.kind === "vote" ? 2 : 1)) {
      return NextResponse.json(
        { error: "Not enough suggestions yet to open this phase" },
        { status: 409 }
      );
    }
    config.phase = "rate";
    if (activity.kind === "vote") config.options = list;
    else config.items = list;
    await query(`UPDATE activities SET config = $1 WHERE id = $2`, [
      JSON.stringify(config),
      aid,
    ]);
    return NextResponse.json({ ok: true, count: list.length });
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
