import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import { getSession, type ActivityRow } from "@/lib/sessions";

async function getOpenActivity(session: {
  active_activity: string | null;
}): Promise<ActivityRow | null> {
  if (!session.active_activity) return null;
  const res = await query<ActivityRow>(
    `SELECT * FROM activities WHERE id = $1 AND status = 'open'`,
    [session.active_activity]
  );
  return res.rows[0] ?? null;
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
  const participantId =
    typeof body?.participantId === "string" ? body.participantId : "";
  if (!participantId || !(await verifyParticipant(id, participantId))) {
    return NextResponse.json({ error: "Unknown participant" }, { status: 403 });
  }
  const activity = await getOpenActivity(session);
  if (!activity) {
    return NextResponse.json({ error: "No open activity" }, { status: 409 });
  }

  let config: { options?: string[]; columns?: string[] } = {};
  try {
    config = JSON.parse(activity.config);
  } catch {
    /* treated as empty below */
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
      [randomUUID(), activity.id, participantId, column, value.slice(0, 160)]
    );
  }
  return NextResponse.json({ ok: true });
}

// Participant removes one of their own column entries.
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
  if (!participantId || !entryId) {
    return NextResponse.json({ error: "entryId required" }, { status: 400 });
  }
  await query(
    `DELETE FROM activity_responses WHERE id = $1 AND participant_id = $2`,
    [entryId, participantId]
  );
  return NextResponse.json({ ok: true });
}
