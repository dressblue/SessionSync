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
    `SELECT id FROM participants WHERE id = $1 AND session_id = $2`,
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
    // Self-heal: the client holds a valid id whose seat was removed (roster
    // reset). Re-create it with the same id + supplied name so they can act
    // immediately without waiting for the next heartbeat poll.
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
    items?: string[];
    phase?: string;
    scale?: number;
    richItems?: unknown[];
    revealed?: number;
  } = {};
  try {
    config = JSON.parse(activity.config);
  } catch {
    /* treated as empty below */
  }

  // Word cloud: submit a word into the single shared bucket (column 0).
  if (activity.kind === "wordcloud") {
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

  if (activity.kind === "vote") {
    const option = body?.option;
    const max = (config.options ?? []).length;
    if (!Number.isInteger(option) || option < 0 || option >= max) {
      return NextResponse.json({ error: "Invalid option" }, { status: 400 });
    }
    // One vote per participant; re-voting replaces the earlier choice.
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
