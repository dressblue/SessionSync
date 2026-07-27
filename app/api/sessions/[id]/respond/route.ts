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
    items?: string[];
    phase?: string;
    scale?: number;
    richItems?: unknown[];
    revealed?: number;
    answerRevealed?: boolean;
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
    await query(
      `INSERT INTO activity_responses (id, activity_id, participant_id, value)
       VALUES ($1, $2, $3, $4)`,
      [randomUUID(), activity.id, participantId, value]
    );
    return NextResponse.json({ ok: true });
  }

  // Word sort: place/unplace a word into a column. A word may live in several
  // columns (one response row per word+column). Shared board — anyone can move.
  if (activity.kind === "sort") {
    const words = config.words ?? [];
    const columns = config.columns ?? [];
    const word = typeof body?.word === "string" ? body.word : "";
    const col = Number(body?.col);
    if (
      !words.includes(word) ||
      !Number.isInteger(col) ||
      col < 0 ||
      col >= columns.length
    ) {
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
  if (participantId) {
    await query(
      `DELETE FROM activity_responses WHERE id = $1 AND participant_id = $2`,
      [entryId, participantId]
    );
  } else if (await authorizeSession(req, id)) {
    await query(
      `DELETE FROM activity_responses
       WHERE id = $1 AND participant_id IS NULL
         AND activity_id IN (SELECT id FROM activities WHERE session_id = $2)`,
      [entryId, id]
    );
  } else {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
