import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  authorizeSession,
  resolveWorkflowGraph,
  type ActivityRow,
} from "@/lib/sessions";

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

  // Reopen a saved (closed) activity, content intact.
  if (body?.reopen === true) {
    const open = await query<{ id: string }>(
      `SELECT id FROM activities WHERE session_id = $1 AND status = 'open'`,
      [id]
    );
    if (open.rows.length >= 2) {
      return NextResponse.json(
        { error: "Two activities are already live — save & close one first" },
        { status: 409 }
      );
    }
    await query(
      `UPDATE activities SET status = 'open' WHERE id = $1 AND session_id = $2`,
      [aid, id]
    );
    return NextResponse.json({ ok: true });
  }

  // Reveal (or re-hide) a seeded word cloud's facilitator words. Seeds are the
  // NULL-participant column-0 rows; revealing un-hides them all at once.
  if (typeof body?.revealSeeds === "boolean") {
    await query(
      `UPDATE activity_responses SET hidden = $1
       WHERE activity_id = $2 AND participant_id IS NULL AND column_index = 0`,
      [!body.revealSeeds, aid]
    );
    return NextResponse.json({ ok: true });
  }

  // Re-shuffle a word cloud's layout: bump a seed in its config so every viewer
  // re-lays-out and participants re-scan the whole set of words.
  if (body?.shuffle === true) {
    const res = await query<ActivityRow>(
      `SELECT * FROM activities WHERE id = $1 AND session_id = $2`,
      [aid, id]
    );
    const activity = res.rows[0];
    if (!activity) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    let config: Record<string, unknown> = {};
    try {
      config = JSON.parse(activity.config);
    } catch {
      /* empty */
    }
    const next =
      (typeof config.shuffle === "number" ? config.shuffle : 0) + 1;
    await query(
      `UPDATE activities SET config = $1 WHERE id = $2 AND session_id = $3`,
      [JSON.stringify({ ...config, shuffle: next }), aid, id]
    );
    return NextResponse.json({ ok: true, shuffle: next });
  }

  // Timer transport: start/pause/reset/add against the countdown anchor.
  if (body?.timer && typeof body.timer === "object") {
    const res = await query<ActivityRow>(
      `SELECT * FROM activities WHERE id = $1 AND session_id = $2 AND status = 'open'`,
      [aid, id]
    );
    const activity = res.rows[0];
    if (!activity || activity.kind !== "timer") {
      return NextResponse.json({ error: "No timer activity" }, { status: 404 });
    }
    const config = (() => {
      try {
        return JSON.parse(activity.config);
      } catch {
        return {};
      }
    })() as {
      label?: string;
      durationSec?: number;
      remainingSec?: number;
      running?: boolean;
      at?: string;
    };
    const dur = config.durationSec ?? 300;
    // Current remaining given the existing anchor.
    const curRemaining = config.running
      ? Math.max(
          0,
          (config.remainingSec ?? dur) -
            (Date.now() - Date.parse(config.at ?? new Date().toISOString())) / 1000
        )
      : config.remainingSec ?? dur;
    const now = new Date().toISOString();
    const t = body.timer as { action?: string; seconds?: number };
    if (t.action === "start") {
      config.running = true;
      config.remainingSec = curRemaining <= 0 ? dur : curRemaining;
      config.at = now;
    } else if (t.action === "pause") {
      config.running = false;
      config.remainingSec = curRemaining;
      config.at = now;
    } else if (t.action === "reset") {
      config.running = false;
      config.remainingSec = dur;
      config.at = now;
    } else if (t.action === "add") {
      const add = typeof t.seconds === "number" ? t.seconds : 60;
      config.durationSec = Math.min(24 * 3600, dur + add);
      config.remainingSec = Math.max(0, curRemaining + add);
      config.at = now;
    } else {
      return NextResponse.json({ error: "Unknown timer action" }, { status: 400 });
    }
    await query(`UPDATE activities SET config = $1 WHERE id = $2`, [
      JSON.stringify(config),
      aid,
    ]);
    return NextResponse.json({ ok: true });
  }

  // Video transport: set the play/pause anchor that participants sync to.
  if (body?.video && typeof body.video === "object") {
    const res = await query<ActivityRow>(
      `SELECT * FROM activities WHERE id = $1 AND session_id = $2 AND status = 'open'`,
      [aid, id]
    );
    const activity = res.rows[0];
    if (!activity || activity.kind !== "video") {
      return NextResponse.json({ error: "No video activity" }, { status: 404 });
    }
    let config: Record<string, unknown> = {};
    try {
      config = JSON.parse(activity.config);
    } catch {
      /* rebuilt below */
    }
    const v = body.video as { action?: string; pos?: number };
    const pos = typeof v.pos === "number" && v.pos >= 0 ? v.pos : 0;
    if (v.action === "play") {
      config.playing = true;
      config.t0 = pos;
      config.at = new Date().toISOString();
    } else if (v.action === "pause") {
      config.playing = false;
      config.t0 = pos;
      config.at = new Date().toISOString();
    } else if (v.action === "seek") {
      config.t0 = pos;
      config.at = new Date().toISOString();
    } else if (v.action === "restart") {
      config.playing = false;
      config.t0 = 0;
      config.at = new Date().toISOString();
    } else {
      return NextResponse.json({ error: "Unknown video action" }, { status: 400 });
    }
    await query(`UPDATE activities SET config = $1 WHERE id = $2`, [
      JSON.stringify(config),
      aid,
    ]);
    return NextResponse.json({ ok: true });
  }

  // Quiz: reveal (or re-hide) the correct answer for everyone.
  if (typeof body?.revealAnswer === "boolean") {
    const res = await query<ActivityRow>(
      `SELECT * FROM activities WHERE id = $1 AND session_id = $2 AND status = 'open'`,
      [aid, id]
    );
    const activity = res.rows[0];
    if (!activity || activity.kind !== "quiz") {
      return NextResponse.json({ error: "No quiz activity" }, { status: 404 });
    }
    let config: Record<string, unknown> = {};
    try {
      config = JSON.parse(activity.config);
    } catch {
      /* rebuilt below */
    }
    config.answerRevealed = body.revealAnswer;
    await query(`UPDATE activities SET config = $1 WHERE id = $2`, [
      JSON.stringify(config),
      aid,
    ]);
    return NextResponse.json({ ok: true });
  }

  // Workflow: move through the step graph. Actions:
  //   goto {nodeId}  — jump to a node (a branch choice, or a click on the map)
  //   back           — pop the visited history
  //   restart        — return to the start and clear history
  if (body?.workflow && typeof body.workflow === "object") {
    const res = await query<ActivityRow>(
      `SELECT * FROM activities WHERE id = $1 AND session_id = $2 AND status = 'open'`,
      [aid, id]
    );
    const activity = res.rows[0];
    if (!activity || activity.kind !== "workflow") {
      return NextResponse.json({ error: "Workflow not open" }, { status: 404 });
    }
    let config: Record<string, unknown> = {};
    try {
      config = JSON.parse(activity.config);
    } catch {
      /* rebuilt below */
    }
    const graph = resolveWorkflowGraph(config);
    const ids = new Set(graph.nodes.map((n) => n.id));
    let current =
      typeof config.current === "string" ? config.current : graph.startId;
    if (typeof config.current === "number")
      current = graph.nodes[config.current]?.id ?? graph.startId;
    if (!ids.has(current)) current = graph.startId;
    const history: string[] = Array.isArray(config.history)
      ? (config.history as string[])
      : [];

    const w = body.workflow as {
      action?: string;
      nodeId?: string;
      value?: boolean;
    };
    if (w.action === "showMap") {
      config.showMap = !!w.value;
    } else if (w.action === "goto" && typeof w.nodeId === "string") {
      if (!ids.has(w.nodeId)) {
        return NextResponse.json({ error: "Unknown step" }, { status: 400 });
      }
      if (w.nodeId !== current) history.push(current);
      current = w.nodeId;
    } else if (w.action === "back") {
      const prev = history.pop();
      if (prev) current = prev;
    } else if (w.action === "restart") {
      current = graph.startId;
      history.length = 0;
    } else {
      return NextResponse.json(
        { error: "Unknown workflow action" },
        { status: 400 }
      );
    }
    config.current = current;
    config.history = history.slice(-200);
    await query(`UPDATE activities SET config = $1 WHERE id = $2`, [
      JSON.stringify(config),
      aid,
    ]);
    return NextResponse.json({ ok: true });
  }

  // Slide player: the facilitator advances through the deck's page range and
  // every screen follows on the next poll.
  //   goto {page} | next | prev  — move within [startPage, endPage]
  if (body?.slides && typeof body.slides === "object") {
    const res = await query<ActivityRow>(
      `SELECT * FROM activities WHERE id = $1 AND session_id = $2 AND status = 'open'`,
      [aid, id]
    );
    const activity = res.rows[0];
    if (!activity || activity.kind !== "slides") {
      return NextResponse.json({ error: "Slides not open" }, { status: 404 });
    }
    let config: Record<string, unknown> = {};
    try {
      config = JSON.parse(activity.config);
    } catch {
      /* nothing to move */
    }
    const startPage = typeof config.startPage === "number" ? config.startPage : 1;
    const endPage =
      typeof config.endPage === "number" ? config.endPage : startPage;
    const cur =
      typeof config.current === "number" ? config.current : startPage;
    const s = body.slides as { action?: string; page?: number };
    let next = cur;
    if (s.action === "goto" && typeof s.page === "number") next = s.page;
    else if (s.action === "next") next = cur + 1;
    else if (s.action === "prev") next = cur - 1;
    else {
      return NextResponse.json(
        { error: "Unknown slides action" },
        { status: 400 }
      );
    }
    config.current = Math.min(Math.max(startPage, Math.floor(next)), endPage);
    await query(`UPDATE activities SET config = $1 WHERE id = $2`, [
      JSON.stringify(config),
      aid,
    ]);
    return NextResponse.json({ ok: true });
  }

  // Secrets — facilitator flow control:
  //   { action:"phase", value:"select"|"collect" }  open / reclose the wall
  //   { action:"setReader", participantId|null }     whose turn to pick
  //   { action:"push", secretId, participantId|null } pre-assign a door
  //   { action:"open", secretId }                     facilitator reads it
  //   { action:"seal", secretId }                     mark revealed → lock
  //   { action:"reset", secretId }                    return a door to the wall
  if (body?.secrets && typeof body.secrets === "object") {
    const res = await query<ActivityRow>(
      `SELECT * FROM activities WHERE id = $1 AND session_id = $2 AND status = 'open'`,
      [aid, id]
    );
    const activity = res.rows[0];
    if (!activity || activity.kind !== "secrets") {
      return NextResponse.json({ error: "No secrets activity" }, { status: 404 });
    }
    let config: {
      phase?: string;
      activeReaderId?: string | null;
      shuffle?: number;
      scoringDoorId?: string | null;
    } = {};
    try {
      config = JSON.parse(activity.config);
    } catch {
      /* rebuilt below */
    }
    const s = body.secrets as {
      action?: string;
      value?: string;
      secretId?: string;
      participantId?: string | null;
    };
    const nameFor = async (pid: string) => {
      const r = await query<{ name: string }>(
        `SELECT name FROM participants
         WHERE id = $1 AND session_id = $2 AND removed_at IS NULL`,
        [pid, id]
      );
      return r.rows[0]?.name ?? null;
    };
    const patchDoor = async (
      secretId: string,
      fn: (v: Record<string, unknown>) => Record<string, unknown>,
      status?: number
    ) => {
      const row = await query<{ value: string; column_index: number | null }>(
        `SELECT value, column_index FROM activity_responses
         WHERE id = $1 AND activity_id = $2`,
        [secretId, aid]
      );
      if (!row.rows[0]) return false;
      let v: Record<string, unknown> = {};
      try {
        v = JSON.parse(row.rows[0].value);
      } catch {
        /* empty */
      }
      const next = fn(v);
      if (typeof status === "number") {
        await query(
          `UPDATE activity_responses SET value = $1, column_index = $2 WHERE id = $3`,
          [JSON.stringify(next), status, secretId]
        );
      } else {
        await query(`UPDATE activity_responses SET value = $1 WHERE id = $2`, [
          JSON.stringify(next),
          secretId,
        ]);
      }
      return true;
    };

    if (s.action === "phase") {
      config.phase = s.value === "select" ? "select" : "collect";
      if (config.phase === "collect") config.activeReaderId = null;
    } else if (s.action === "setReader") {
      const pid = typeof s.participantId === "string" ? s.participantId : null;
      config.activeReaderId = pid && (await nameFor(pid)) ? pid : null;
    } else if (s.action === "push" && typeof s.secretId === "string") {
      const pid = typeof s.participantId === "string" ? s.participantId : null;
      const pn = pid ? await nameFor(pid) : null;
      const ok = await patchDoor(s.secretId, (v) => ({ ...v, p: pid, pn }));
      if (!ok) return NextResponse.json({ error: "Door not found" }, { status: 404 });
    } else if (s.action === "open" && typeof s.secretId === "string") {
      const ok = await patchDoor(
        s.secretId,
        (v) => ({ ...v, r: "facilitator", rn: "Facilitator" }),
        1
      );
      if (!ok) return NextResponse.json({ error: "Door not found" }, { status: 404 });
    } else if (s.action === "score" && typeof s.secretId === "string") {
      // Open a familiarity-rating round on this door.
      config.scoringDoorId = s.secretId;
    } else if (s.action === "stopScore") {
      config.scoringDoorId = null;
    } else if (s.action === "seal" && typeof s.secretId === "string") {
      const ok = await patchDoor(s.secretId, (v) => v, 2);
      if (!ok) return NextResponse.json({ error: "Door not found" }, { status: 404 });
      // Sealing ends the turn — clear the active reader and any scoring round.
      config.activeReaderId = null;
      config.scoringDoorId = null;
    } else if (s.action === "returnPick") {
      // Return every opened (unsealed) door to the wall — reader stays active —
      // and reshuffle the wall so the returned secret can't be spotted again.
      const opened = await query<{ id: string; value: string }>(
        `SELECT id, value FROM activity_responses
         WHERE activity_id = $1 AND column_index = 1`,
        [aid]
      );
      for (const row of opened.rows) {
        let v: Record<string, unknown> = {};
        try {
          v = JSON.parse(row.value);
        } catch {
          /* empty */
        }
        const { r, rn, ...rest } = v as Record<string, unknown> & {
          r?: unknown;
          rn?: unknown;
        };
        void r;
        void rn;
        await query(
          `UPDATE activity_responses SET value = $1, column_index = 0 WHERE id = $2`,
          [JSON.stringify(rest), row.id]
        );
      }
      config.shuffle = (typeof config.shuffle === "number" ? config.shuffle : 0) + 1;
      config.scoringDoorId = null;
    } else if (s.action === "shuffle") {
      config.shuffle = (typeof config.shuffle === "number" ? config.shuffle : 0) + 1;
    } else if (s.action === "reset" && typeof s.secretId === "string") {
      const ok = await patchDoor(
        s.secretId,
        (v) => {
          const { r, rn, ...rest } = v as Record<string, unknown> & {
            r?: unknown;
            rn?: unknown;
          };
          void r;
          void rn;
          return rest;
        },
        0
      );
      if (!ok) return NextResponse.json({ error: "Door not found" }, { status: 404 });
    } else {
      return NextResponse.json({ error: "Unknown secrets action" }, { status: 400 });
    }
    await query(`UPDATE activities SET config = $1 WHERE id = $2`, [
      JSON.stringify(config),
      aid,
    ]);
    return NextResponse.json({ ok: true });
  }

  // Presentation controls: reveal count, wheel spotlight, whiteboard clear.
  if (
    typeof body?.reveal === "number" ||
    typeof body?.active === "number" ||
    body?.clear === true
  ) {
    const res = await query<ActivityRow>(
      `SELECT * FROM activities WHERE id = $1 AND session_id = $2 AND status = 'open'`,
      [aid, id]
    );
    const activity = res.rows[0];
    if (!activity) {
      return NextResponse.json({ error: "Activity not open" }, { status: 404 });
    }
    if (body.clear === true) {
      await query(`DELETE FROM activity_responses WHERE activity_id = $1`, [aid]);
      return NextResponse.json({ ok: true });
    }
    let config: { richItems?: unknown[]; revealed?: number; active?: number } = {};
    try {
      config = JSON.parse(activity.config);
    } catch {
      /* rebuilt below */
    }
    const len = config.richItems?.length ?? 0;
    if (typeof body.reveal === "number") {
      config.revealed = Math.min(len, Math.max(0, Math.round(body.reveal)));
    }
    if (typeof body.active === "number") {
      config.active = Math.min(len - 1, Math.max(-1, Math.round(body.active)));
    }
    await query(`UPDATE activities SET config = $1 WHERE id = $2`, [
      JSON.stringify(config),
      aid,
    ]);
    return NextResponse.json({ ok: true });
  }

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

// Permanently remove an activity and its responses — used to prune a stale or
// duplicate launch from the session report. Clears the pointer if it was live.
export async function DELETE(req: Request, ctx: Ctx) {
  const { id, aid } = await ctx.params;
  const session = await authorizeSession(req, id);
  if (!session) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  await query(
    `UPDATE sessions SET active_activity = NULL WHERE id = $1 AND active_activity = $2`,
    [id, aid]
  );
  await query(`DELETE FROM activity_responses WHERE activity_id = $1`, [aid]);
  await query(`DELETE FROM activities WHERE id = $1 AND session_id = $2`, [
    aid,
    id,
  ]);
  return NextResponse.json({ ok: true });
}
