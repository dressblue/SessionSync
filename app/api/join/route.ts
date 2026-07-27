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
  // Rejoining with the same name reclaims the existing identity (reconnect or
  // device switch) instead of creating a roster duplicate.
  const trimmed = name.slice(0, 80).trim();
  const existing = await query<{ id: string }>(
    `SELECT id FROM participants WHERE session_id = $1 AND lower(name) = lower($2)`,
    [session.id, trimmed]
  );
  let participantId: string;
  if (existing.rows[0]) {
    participantId = existing.rows[0].id;
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
