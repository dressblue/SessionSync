import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import {
  cohortAccessError,
  getSessionByCode,
  type SessionRow,
} from "@/lib/sessions";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!code || !name) {
    return NextResponse.json({ error: "Code and name are required" }, { status: 400 });
  }
  const raw = code.trim().toUpperCase();
  // Course sessions are entered with a rotating 24-hour student key.
  const keyed = await query<SessionRow>(
    `SELECT * FROM sessions WHERE join_key = $1 ORDER BY join_key_expires DESC LIMIT 1`,
    [raw]
  );
  let session: SessionRow | null = keyed.rows[0] ?? null;
  if (session) {
    if (
      !session.join_key_expires ||
      new Date(session.join_key_expires).getTime() <= Date.now()
    ) {
      return NextResponse.json(
        { error: "That session key has expired — ask your facilitator for a fresh one" },
        { status: 410 }
      );
    }
  } else {
    // Legacy standalone sessions still join by their stable code.
    const byCode = await getSessionByCode(raw);
    session = byCode && !byCode.course_id ? byCode : null;
  }
  if (!session) {
    return NextResponse.json({ error: "No session found for that key" }, { status: 404 });
  }
  // Cohort access window: templates never joinable; cohorts only in-window.
  const windowErr = await cohortAccessError(session.course_id);
  if (windowErr) {
    return NextResponse.json({ error: windowErr }, { status: 403 });
  }
  // Names must be unique within a session so the facilitator can identify every
  // player (essential for flow-controlled tools like Secrets). A name already
  // held by an ONLINE participant is rejected — pick another. A stale/offline
  // seat with the same name is treated as the same person reconnecting and is
  // reclaimed (device switch, dropped tab) rather than duplicated.
  const trimmed = name.slice(0, 80).trim();
  const existing = await query<{
    id: string;
    last_seen: string;
    removed_at: string | null;
  }>(
    `SELECT id, last_seen, removed_at FROM participants
     WHERE session_id = $1 AND lower(name) = lower($2)
     ORDER BY last_seen DESC LIMIT 1`,
    [session.id, trimmed]
  );
  // Slightly wider than the 12s online window so a mid-heartbeat reload of the
  // same tab still reads as "in use" rather than a hijack opportunity.
  const NAME_BUSY_MS = 20_000;
  const prior = existing.rows[0];
  if (
    prior &&
    !prior.removed_at &&
    Date.now() - new Date(prior.last_seen).getTime() < NAME_BUSY_MS
  ) {
    return NextResponse.json(
      {
        error:
          "That name is already in use in this session — please choose a different name.",
        nameTaken: true,
      },
      { status: 409 }
    );
  }
  let participantId: string;
  if (prior) {
    participantId = prior.id;
    // Rejoining reclaims the seat — and clears any facilitator termination, so
    // a re-joined participant isn't immediately booted by the removed check.
    await query(
      `UPDATE participants SET last_seen = now(), removed_at = NULL WHERE id = $1`,
      [participantId]
    );
  } else {
    participantId = randomUUID();
    await query(
      `INSERT INTO participants (id, session_id, name) VALUES ($1, $2, $3)`,
      [participantId, session.id, trimmed]
    );
  }
  return NextResponse.json({
    sessionId: session.id,
    participantId,
    title: session.title,
  });
}
