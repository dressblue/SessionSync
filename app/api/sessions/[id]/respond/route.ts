import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import { authorizeSession, getSession, type ActivityRow } from "@/lib/sessions";

// Up to two activities can be open; the client says which one it's
// answering. A missing activityId is honored only when exactly one is open.
async function getTargetActivity(
  sessionId: string,
  activityId: string | null
): Promise<ActivityRow | null> {
  const res = await query<ActivityRow>(
    `SELECT * FROM activities WHERE session_id = $1 AND status = 'open'
     ORDER BY created_at ASC`,
    [sessionId]
  );
  if (activityId) return res.rows.find((a) => a.id === activityId) ?? null;
  return res.rows.length === 1 ? res.rows[0] : null;
}

async function verifyParticipant(sessionId: string, participantId: string) {
  const res = await query<{ id: string }>(
    `SELECT id FROM participants
       WHERE id = $1 AND session_id = $2 AND removed_at IS NULL`,
    [participantId, sessionId]
  );
  return !!res.rows[0];
}

// Participant responds to the open activity.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const rawParticipantId =
    typeof body?.participantId === "string" ? body.participantId : "";
  // Participants respond with their id; the facilitator (whiteboard drawing)
  // responds via auth headers and is stored with a NULL participant.
  let participantId: string | null = null;
  if (rawParticipantId && (await verifyParticipant(id, rawParticipantId))) {
    participantId = rawParticipantId;
  } else if (rawParticipantId && typeof body?.name === "string" && body.name.trim()) {
    // Self-heal a genuinely-missing seat (e.g. after a roster reset) — but
    // never resurrect one the facilitator terminated.
    const existing = await query<{ removed_at: string | null }>(
      `SELECT removed_at FROM participants WHERE id = $1 AND session_id = $2`,
      [rawParticipantId, id]
    );
    if (existing.rows[0]) {
      // Row exists but verifyParticipant failed → it was removed.
      return NextResponse.json(
        { error: "You've been removed from this session", removed: true },
        { status: 403 }
      );
    }
    await query(
      `INSERT INTO participants (id, session_id, name)
       VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [rawParticipantId, id, body.name.trim().slice(0, 80)]
    );
    participantId = rawParticipantId;
  } else if (!(await authorizeSession(req, id))) {
    return NextResponse.json({ error: "Unknown participant" }, { status: 403 });
  }
  const activity = await getTargetActivity(
    id,
    typeof body?.activityId === "string" ? body.activityId : null
  );
  if (!activity) {
    return NextResponse.json({ error: "No open activity" }, { status: 409 });
  }
  if (participantId === null && activity.kind !== "whiteboard") {
    return NextResponse.json(
      { error: "Only participants can respond to this activity" },
      { status: 403 }
    );
  }

  let config: {
    options?: string[];
    columns?: string[];
    words?: string[];
    scales?: { name: string; anchorSet: string; allowNA: boolean }[];
    questions?: {
      text: string;
      options: string[];
      mode?: "single" | "multi";
    }[];
    items?: string[];
    phase?: string;
    scale?: number;
    richItems?: unknown[];
    revealed?: number;
    answerRevealed?: boolean;
    statements?: { text: string; mode?: "single" | "multi" }[];
    displayOnly?: boolean;
    blocks?: number;
  } = {};
  try {
    config = JSON.parse(activity.config);
  } catch {
    /* treated as empty below */
  }

  // Word cloud: submissions (column 0), participant downvotes (column -2).
  if (activity.kind === "wordcloud") {
    // Participant downvote toggle — shrinks/hides a word (column -2, one per
    // participant per word).
    if (body?.action === "downvote") {
      const word =
        typeof body?.value === "string" ? body.value.trim().toLowerCase() : "";
      if (!word || !participantId) {
        return NextResponse.json({ error: "Nothing to vote on" }, { status: 400 });
      }
      const existing = await query<{ id: string }>(
        `SELECT id FROM activity_responses
           WHERE activity_id = $1 AND participant_id = $2
             AND column_index = -2 AND lower(value) = $3`,
        [activity.id, participantId, word]
      );
      if (existing.rows[0]) {
        await query(`DELETE FROM activity_responses WHERE id = $1`, [
          existing.rows[0].id,
        ]);
      } else {
        await query(
          `INSERT INTO activity_responses (id, activity_id, participant_id, column_index, value)
           VALUES ($1, $2, $3, -2, $4)`,
          [randomUUID(), activity.id, participantId, word.slice(0, 60)]
        );
      }
      return NextResponse.json({ ok: true });
    }

    // Facilitator: clear a word's downvotes (restore it). Facilitator-gated.
    if (body?.action === "clearDownvotes") {
      if (!(await authorizeSession(req, id))) {
        return NextResponse.json({ error: "Not authorized" }, { status: 403 });
      }
      const word =
        typeof body?.value === "string" ? body.value.trim().toLowerCase() : "";
      if (word) {
        await query(
          `DELETE FROM activity_responses
             WHERE activity_id = $1 AND column_index = -2 AND lower(value) = $2`,
          [activity.id, word]
        );
      }
      return NextResponse.json({ ok: true });
    }

    // Facilitator: seed several words at once. Facilitator-gated.
    if (Array.isArray(body?.words)) {
      if (!(await authorizeSession(req, id))) {
        return NextResponse.json({ error: "Not authorized" }, { status: 403 });
      }
      const words = (body.words as unknown[])
        .map((w) => (typeof w === "string" ? w.trim() : ""))
        .filter(Boolean)
        .slice(0, 60);
      for (const w of words) {
        await query(
          `INSERT INTO activity_responses (id, activity_id, participant_id, column_index, value)
           VALUES ($1, $2, $3, 0, $4)`,
          [randomUUID(), activity.id, participantId, w.slice(0, 60)]
        );
      }
      return NextResponse.json({ ok: true, added: words.length });
    }

    // Single word submission (participant or facilitator seat).
    const value = typeof body?.value === "string" ? body.value.trim() : "";
    if (!value) {
      return NextResponse.json({ error: "Nothing to add" }, { status: 400 });
    }
    await query(
      `INSERT INTO activity_responses (id, activity_id, participant_id, column_index, value)
       VALUES ($1, $2, $3, 0, $4)`,
      [randomUUID(), activity.id, participantId, value.slice(0, 60)]
    );
    return NextResponse.json({ ok: true });
  }

  // Reveal: contribute a word/phrase against a revealed item.
  if (activity.kind === "reveal") {
    const items = config.richItems ?? [];
    const revealed = Math.min(config.revealed ?? 0, items.length);
    const value = typeof body?.value === "string" ? body.value.trim() : "";
    const itemIndex = body?.itemIndex;
    if (!value) {
      return NextResponse.json({ error: "Nothing to add" }, { status: 400 });
    }
    if (
      !Number.isInteger(itemIndex) ||
      itemIndex < 0 ||
      itemIndex >= revealed
    ) {
      return NextResponse.json(
        { error: "That item isn't open for input yet" },
        { status: 400 }
      );
    }
    await query(
      `INSERT INTO activity_responses (id, activity_id, participant_id, column_index, value)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), activity.id, participantId, itemIndex, value.slice(0, 160)]
    );
    return NextResponse.json({ ok: true });
  }

  if (activity.kind === "whiteboard") {
    // Shared sanitizers for placed objects (kept tight so stored JSON is clean).
    const num = (v: unknown, lo: number, hi: number, dflt: number) =>
      typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
    const str = (v: unknown, cap: number) =>
      typeof v === "string" ? v.slice(0, cap) : undefined;
    const ELEMENT_KINDS = [
      "rect", "rrect", "ellipse", "triangle", "diamond", "cloud",
      "line", "arrow", "text", "sticky", "stamp", "table", "conn",
    ];
    const cellArray = (v: unknown) =>
      Array.isArray(v)
        ? (v as unknown[]).slice(0, 64).map((c) => (typeof c === "string" ? c.slice(0, 120) : ""))
        : [];
    const anchor = (v: unknown) => {
      if (!v || typeof v !== "object") return {};
      const o = v as Record<string, unknown>;
      const out: { id?: string; x?: number; y?: number } = {};
      if (typeof o.id === "string" && o.id.length <= 40) out.id = o.id;
      if (typeof o.x === "number" && isFinite(o.x)) out.x = Math.min(1, Math.max(0, o.x));
      if (typeof o.y === "number" && isFinite(o.y)) out.y = Math.min(1, Math.max(0, o.y));
      return out;
    };

    // Add a placed object (client-generated id so connectors can reference it).
    if (body?.element && typeof body.element === "object") {
      const e = body.element as Record<string, unknown>;
      const k = typeof e.k === "string" && ELEMENT_KINDS.includes(e.k) ? e.k : null;
      const elId =
        typeof e.id === "string" && e.id.length >= 8 && e.id.length <= 40 ? e.id : null;
      if (!k || !elId) {
        return NextResponse.json({ error: "Invalid element" }, { status: 400 });
      }
      let el: Record<string, unknown>;
      if (k === "conn") {
        el = {
          k,
          arrow: !!e.arrow,
          a: anchor(e.a),
          b: anchor(e.b),
          c: str(e.c, 20) ?? "#0f172a",
          sw: num(e.sw, 0.5, 20, 3),
        };
        if (e.dash) el.dash = true;
      } else {
        el = {
          k,
          x: num(e.x, 0, 1, 0),
          y: num(e.y, 0, 1, 0),
          bw: num(e.bw, -1, 1, 0.1),
          bh: num(e.bh, -1, 1, 0.1),
          c: str(e.c, 20) ?? "#0f172a",
          sw: num(e.sw, 0.5, 20, 3),
        };
        const f = str(e.f, 20);
        if (f) el.f = f;
        const t = str(e.t, 500);
        if (t !== undefined) el.t = t;
        if (k === "text") el.fs = num(e.fs, 8, 200, 24);
        if (k === "stamp") el.ch = str(e.ch, 8) ?? "⭐";
        if (k === "table") {
          el.rows = Math.round(num(e.rows, 1, 8, 3));
          el.cols = Math.round(num(e.cols, 1, 8, 3));
          el.cells = cellArray(e.cells);
        }
      }
      if (typeof e.z === "number" && isFinite(e.z)) el.z = e.z;
      const g = str(e.g, 40);
      if (g) el.g = g;
      const value = JSON.stringify(el);
      if (value.length > 4000) {
        return NextResponse.json({ error: "Element too large" }, { status: 400 });
      }
      await query(
        `INSERT INTO activity_responses (id, activity_id, participant_id, value)
         VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
        [elId, activity.id, participantId, value]
      );
      return NextResponse.json({ ok: true, id: elId });
    }

    // Move / resize / relabel a placed object (own element, or facilitator).
    if (body?.elUpdate && typeof body.elUpdate === "object") {
      const u = body.elUpdate as Record<string, unknown>;
      const elId = typeof u.id === "string" ? u.id : null;
      if (!elId) {
        return NextResponse.json({ error: "Invalid update" }, { status: 400 });
      }
      const rows = await query<{ value: string; participant_id: string | null }>(
        `SELECT value, participant_id FROM activity_responses
           WHERE id = $1 AND activity_id = $2`,
        [elId, activity.id]
      );
      const row = rows.rows[0];
      if (!row) {
        return NextResponse.json({ error: "Element not found" }, { status: 404 });
      }
      // The element's owner may edit it. So may the session moderator — a
      // facilitator carries their own participant seat (non-null participantId),
      // so they won't match a participant's element or a facilitator-drawn
      // NULL-owner one; fall back to an auth check to grant them any-element edit.
      const owns =
        participantId !== null && row.participant_id === participantId;
      if (!owns && !(await authorizeSession(req, id))) {
        return NextResponse.json({ error: "Not your element" }, { status: 403 });
      }
      let cur: Record<string, unknown> = {};
      try {
        cur = JSON.parse(row.value);
      } catch {
        /* replaced below */
      }
      const patch: Record<string, unknown> = {};
      if ("x" in u) patch.x = num(u.x, 0, 1, 0);
      if ("y" in u) patch.y = num(u.y, 0, 1, 0);
      if ("bw" in u) patch.bw = num(u.bw, -1, 1, 0.1);
      if ("bh" in u) patch.bh = num(u.bh, -1, 1, 0.1);
      if ("t" in u) patch.t = str(u.t, 500) ?? "";
      if ("c" in u) patch.c = str(u.c, 20) ?? cur.c;
      if ("f" in u) patch.f = str(u.f, 20) ?? null;
      if ("fs" in u) patch.fs = num(u.fs, 8, 200, 24);
      if ("z" in u && typeof u.z === "number" && isFinite(u.z)) patch.z = u.z;
      if ("g" in u) patch.g = str(u.g, 40) || null; // "" / null clears the group
      if ("cells" in u) patch.cells = cellArray(u.cells);
      const value = JSON.stringify({ ...cur, ...patch });
      if (value.length > 4000) {
        return NextResponse.json({ error: "Element too large" }, { status: 400 });
      }
      await query(`UPDATE activity_responses SET value = $1 WHERE id = $2`, [
        value,
        elId,
      ]);
      return NextResponse.json({ ok: true });
    }

    const stroke = body?.stroke;
    const points = Array.isArray(stroke?.p) ? stroke.p : [];
    const valid =
      typeof stroke?.c === "string" &&
      stroke.c.length <= 20 &&
      typeof stroke?.w === "number" &&
      stroke.w >= 1 &&
      stroke.w <= 16 &&
      points.length >= 2 &&
      points.length <= 800 &&
      points.every(
        (pt: unknown) =>
          Array.isArray(pt) &&
          pt.length === 2 &&
          pt.every((n) => typeof n === "number" && n >= 0 && n <= 1)
      );
    if (!valid) {
      return NextResponse.json({ error: "Invalid stroke" }, { status: 400 });
    }
    const value = JSON.stringify({
      c: stroke.c,
      w: stroke.w,
      p: points.map((pt: [number, number]) => [
        Math.round(pt[0] * 1000) / 1000,
        Math.round(pt[1] * 1000) / 1000,
      ]),
    });
    if (value.length > 30_000) {
      return NextResponse.json({ error: "Stroke too large" }, { status: 400 });
    }
    const strokeId =
      typeof stroke.id === "string" && stroke.id.length >= 8 && stroke.id.length <= 40
        ? stroke.id
        : randomUUID();
    await query(
      `INSERT INTO activity_responses (id, activity_id, participant_id, value)
       VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
      [strokeId, activity.id, participantId, value]
    );
    return NextResponse.json({ ok: true, id: strokeId });
  }

  // Word sort: place/unplace a word into a column. A word may live in several
  // columns (one response row per word+column). Shared board — anyone can move.
  // Words can also be ADDED to the bank live (column_index = -1 rows).
  if (activity.kind === "sort") {
    const words = config.words ?? [];
    const columns = config.columns ?? [];
    const word = typeof body?.word === "string" ? body.word.trim() : "";

    // Add a word to the shared list — facilitator or participant.
    if (body?.action === "addword") {
      if (!word) {
        return NextResponse.json({ error: "Enter a word" }, { status: 400 });
      }
      const added = await query<{ value: string }>(
        `SELECT DISTINCT value FROM activity_responses
         WHERE activity_id = $1 AND column_index = -1`,
        [activity.id]
      );
      const bank = new Set([...words, ...added.rows.map((r) => r.value)]);
      if (bank.has(word)) return NextResponse.json({ ok: true }); // already there
      if (bank.size >= 80) {
        return NextResponse.json(
          { error: "The word list is full (80 max)" },
          { status: 400 }
        );
      }
      await query(
        `INSERT INTO activity_responses (id, activity_id, participant_id, column_index, value)
         VALUES ($1, $2, $3, -1, $4)`,
        [randomUUID(), activity.id, participantId, word.slice(0, 160)]
      );
      return NextResponse.json({ ok: true });
    }

    const col = Number(body?.col);
    // The word must be in the live bank (authored list or a live addition).
    const inBank =
      words.includes(word) ||
      !!(
        await query<{ one: number }>(
          `SELECT 1 AS one FROM activity_responses
           WHERE activity_id = $1 AND column_index = -1 AND value = $2 LIMIT 1`,
          [activity.id, word]
        )
      ).rows[0];
    if (!inBank || !Number.isInteger(col) || col < 0 || col >= columns.length) {
      return NextResponse.json({ error: "Invalid placement" }, { status: 400 });
    }
    if (body?.action === "unplace") {
      await query(
        `DELETE FROM activity_responses
         WHERE activity_id = $1 AND column_index = $2 AND value = $3`,
        [activity.id, col, word]
      );
      return NextResponse.json({ ok: true });
    }
    // place (default) — dedupe: at most one row per (word, column).
    const existing = await query<{ id: string }>(
      `SELECT id FROM activity_responses
       WHERE activity_id = $1 AND column_index = $2 AND value = $3 LIMIT 1`,
      [activity.id, col, word]
    );
    if (!existing.rows[0]) {
      await query(
        `INSERT INTO activity_responses (id, activity_id, participant_id, column_index, value)
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), activity.id, participantId, col, word.slice(0, 160)]
      );
    }
    return NextResponse.json({ ok: true });
  }

  // Impact: add a row = a comment + 1–3 five-point ratings (null = N/A where
  // the scale allows it). Anyone may add; entries are edited by delete + re-add.
  if (
    activity.kind === "impact1" ||
    activity.kind === "impact2" ||
    activity.kind === "impact3" ||
    activity.kind === "impact4"
  ) {
    const scales = config.scales ?? [];
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    const rawRatings = Array.isArray(body?.ratings) ? body.ratings : [];
    if (!text) {
      return NextResponse.json({ error: "Enter a comment" }, { status: 400 });
    }
    const ratings: (number | null)[] = [];
    for (let i = 0; i < scales.length; i++) {
      const r = rawRatings[i];
      if (r === null || r === undefined || r === "") {
        if (!scales[i].allowNA) {
          return NextResponse.json(
            { error: `Rate "${scales[i].name}"` },
            { status: 400 }
          );
        }
        ratings.push(null);
      } else {
        const n = Number(r);
        if (!Number.isInteger(n) || n < 1 || n > 5) {
          return NextResponse.json({ error: "Invalid rating" }, { status: 400 });
        }
        ratings.push(n);
      }
    }
    await query(
      `INSERT INTO activity_responses (id, activity_id, participant_id, column_index, value)
       VALUES ($1, $2, $3, 0, $4)`,
      [
        randomUUID(),
        activity.id,
        participantId,
        JSON.stringify({ text: text.slice(0, 500), ratings }),
      ]
    );
    return NextResponse.json({ ok: true });
  }

  // Survey: save one question's answer (selected option indices + comment).
  // Stored one row per participant per question at column_index = question
  // index; re-answering replaces the prior row.
  if (activity.kind === "survey") {
    const questions = config.questions ?? [];
    const qi = Number(body?.questionIndex);
    if (!Number.isInteger(qi) || qi < 0 || qi >= questions.length) {
      return NextResponse.json({ error: "Unknown question" }, { status: 400 });
    }
    const optCount = questions[qi].options.length;
    let selected = Array.isArray(body?.selected)
      ? (body.selected as unknown[])
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n >= 0 && n < optCount)
      : [];
    selected = Array.from(new Set(selected));
    if (questions[qi].mode !== "multi") selected = selected.slice(0, 1);
    const comment =
      typeof body?.comment === "string" ? body.comment.trim().slice(0, 500) : "";
    await query(
      `DELETE FROM activity_responses
       WHERE activity_id = $1 AND participant_id = $2 AND column_index = $3`,
      [activity.id, participantId, qi]
    );
    // Keep a row only if the participant chose something or left a comment.
    if (selected.length || comment) {
      await query(
        `INSERT INTO activity_responses (id, activity_id, participant_id, column_index, value)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          randomUUID(),
          activity.id,
          participantId,
          qi,
          JSON.stringify({ selected, comment }),
        ]
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (activity.kind === "checklist") {
    if (config.displayOnly) {
      return NextResponse.json(
        { error: "This checklist is display-only" },
        { status: 400 }
      );
    }
    const statements = config.statements ?? [];
    const columns = config.columns ?? [];
    const si = Number(body?.statementIndex);
    if (!Number.isInteger(si) || si < 0 || si >= statements.length) {
      return NextResponse.json({ error: "Unknown statement" }, { status: 400 });
    }
    let selected = Array.isArray(body?.selected)
      ? (body.selected as unknown[])
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n >= 0 && n < columns.length)
      : [];
    selected = Array.from(new Set(selected));
    if (statements[si].mode !== "multi") selected = selected.slice(0, 1);
    // One row per (participant, statement); rewrite on each toggle.
    await query(
      `DELETE FROM activity_responses
       WHERE activity_id = $1 AND participant_id = $2 AND column_index = $3`,
      [activity.id, participantId, si]
    );
    if (selected.length) {
      await query(
        `INSERT INTO activity_responses (id, activity_id, participant_id, column_index, value)
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), activity.id, participantId, si, JSON.stringify({ selected })]
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (activity.kind === "blocks") {
    const n = Math.min(10, Math.max(1, config.blocks ?? 3));
    const bi = Number(body?.block);
    if (!Number.isInteger(bi) || bi < 0 || bi >= n) {
      return NextResponse.json({ error: "Unknown block" }, { status: 400 });
    }
    const value = typeof body?.value === "string" ? body.value.trim() : "";
    // One answer per (participant, block); re-submitting replaces it and an
    // empty value clears it. column_index = block index → logged per block.
    await query(
      `DELETE FROM activity_responses
       WHERE activity_id = $1 AND participant_id = $2 AND column_index = $3`,
      [activity.id, participantId, bi]
    );
    if (value) {
      await query(
        `INSERT INTO activity_responses (id, activity_id, participant_id, column_index, value)
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), activity.id, participantId, bi, value.slice(0, 500)]
      );
    }
    return NextResponse.json({ ok: true });
  }

  // Collect phase (participant-sourced vote/likert): suggestions land in the
  // reserved collect column (-1) for facilitator moderation.
  if (config.phase === "collect") {
    const value = typeof body?.value === "string" ? body.value.trim() : "";
    if (!value) {
      return NextResponse.json({ error: "Nothing to add" }, { status: 400 });
    }
    await query(
      `INSERT INTO activity_responses (id, activity_id, participant_id, column_index, value)
       VALUES ($1, $2, $3, -1, $4)`,
      [randomUUID(), activity.id, participantId, value.slice(0, 160)]
    );
    return NextResponse.json({ ok: true });
  }

  if (activity.kind === "likert") {
    const itemIndex = body?.itemIndex;
    const rating = body?.rating;
    const items = config.items ?? [];
    const scale = config.scale ?? 5;
    if (
      !Number.isInteger(itemIndex) ||
      itemIndex < 0 ||
      itemIndex >= items.length ||
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > scale
    ) {
      return NextResponse.json({ error: "Invalid rating" }, { status: 400 });
    }
    // One rating per participant per item; re-rating replaces it.
    await query(
      `DELETE FROM activity_responses
       WHERE activity_id = $1 AND participant_id = $2 AND column_index = $3`,
      [activity.id, participantId, itemIndex]
    );
    await query(
      `INSERT INTO activity_responses (id, activity_id, participant_id, column_index, value)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), activity.id, participantId, itemIndex, String(rating)]
    );
    return NextResponse.json({ ok: true });
  }

  if (activity.kind === "vote" || activity.kind === "quiz") {
    // Once a quiz answer is revealed, choices are locked (no changing to the
    // correct one after the fact).
    if (activity.kind === "quiz" && config.answerRevealed) {
      return NextResponse.json(
        { error: "The answer has been revealed", removed: false },
        { status: 409 }
      );
    }
    const option = body?.option;
    const max = (config.options ?? []).length;
    if (!Number.isInteger(option) || option < 0 || option >= max) {
      return NextResponse.json({ error: "Invalid option" }, { status: 400 });
    }
    // One answer per participant; re-answering replaces the earlier choice.
    await query(
      `DELETE FROM activity_responses WHERE activity_id = $1 AND participant_id = $2`,
      [activity.id, participantId]
    );
    await query(
      `INSERT INTO activity_responses (id, activity_id, participant_id, value)
       VALUES ($1, $2, $3, $4)`,
      [randomUUID(), activity.id, participantId, String(option)]
    );
  } else {
    const value = typeof body?.value === "string" ? body.value.trim() : "";
    const column = body?.column;
    const max = (config.columns ?? []).length;
    if (!value) {
      return NextResponse.json({ error: "Nothing to add" }, { status: 400 });
    }
    if (!Number.isInteger(column) || column < 0 || column >= max) {
      return NextResponse.json({ error: "Invalid column" }, { status: 400 });
    }
    await query(
      `INSERT INTO activity_responses (id, activity_id, participant_id, column_index, value)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), activity.id, participantId, column, value.slice(0, 280)]
    );
  }
  return NextResponse.json({ ok: true });
}

// Remove one of your own entries/strokes. Participants pass their id; the
// facilitator (auth headers) can remove their own NULL-participant strokes.
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const participantId =
    typeof body?.participantId === "string" ? body.participantId : "";
  const entryId = typeof body?.entryId === "string" ? body.entryId : "";
  if (!entryId) {
    return NextResponse.json({ error: "entryId required" }, { status: 400 });
  }
  // First try deleting the caller's own element (participants may only remove
  // what they contributed).
  if (participantId) {
    const own = await query<{ id: string }>(
      `DELETE FROM activity_responses WHERE id = $1 AND participant_id = $2 RETURNING id`,
      [entryId, participantId]
    );
    if (own.rows.length) return NextResponse.json({ ok: true });
  }
  // Otherwise fall back to moderator authority: a facilitator may delete any
  // element in their session — a participant's, or a facilitator-drawn
  // NULL-owner one — even though they also carry a participant seat.
  if (await authorizeSession(req, id)) {
    await query(
      `DELETE FROM activity_responses
       WHERE id = $1
         AND activity_id IN (SELECT id FROM activities WHERE session_id = $2)`,
      [entryId, id]
    );
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Not authorized" }, { status: 403 });
}
