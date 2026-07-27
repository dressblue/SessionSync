import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import { authorizeSession, getSession } from "@/lib/sessions";
import { getFacilitator } from "@/lib/viewer";

type Ctx = { params: Promise<{ id: string }> };

// Post a chat message. Participants send with their participantId; the
// facilitator is resolved via their Clerk session.
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const text =
    typeof body?.body === "string" ? body.body.trim().slice(0, 1000) : "";
  if (!text) {
    return NextResponse.json({ error: "Empty message" }, { status: 400 });
  }

  const rawPid =
    typeof body?.participantId === "string" ? body.participantId : "";
  // Targeting: a message goes to the group (default), the facilitator
  // privately, or one participant (a DM).
  const wantFacilitator = body?.toFacilitator === true;
  const rawTo =
    typeof body?.toParticipantId === "string" ? body.toParticipantId : "";
  let participantId: string | null = null;
  let senderName = "";
  let fromFacilitator = false;

  if (rawPid) {
    const p = await query<{ name: string }>(
      `SELECT name FROM participants
         WHERE id = $1 AND session_id = $2 AND removed_at IS NULL`,
      [rawPid, id]
    );
    if (p.rows[0]) {
      participantId = rawPid;
      senderName =
        (typeof body?.name === "string" && body.name.trim()) ||
        p.rows[0].name ||
        "Guest";
    }
  }
  if (!participantId) {
    // Not a valid participant — must be the facilitator.
    if (!(await authorizeSession(req, id))) {
      return NextResponse.json({ error: "Not in this session" }, { status: 403 });
    }
    const f = await getFacilitator();
    senderName = f?.name ?? "Facilitator";
    fromFacilitator = true;
  }

  // Resolve the target, validating any addressed participant belongs here.
  let toParticipantId: string | null = null;
  let toFacilitator = false;
  const mode = session.chat_mode ?? "group";

  if (fromFacilitator) {
    // The facilitator can always broadcast to the group or DM any participant.
    if (rawTo) {
      const t = await query<{ id: string }>(
        `SELECT id FROM participants
           WHERE id = $1 AND session_id = $2 AND removed_at IS NULL`,
        [rawTo, id]
      );
      if (!t.rows[0]) {
        return NextResponse.json({ error: "Unknown recipient" }, { status: 400 });
      }
      toParticipantId = rawTo;
    }
  } else {
    // Participant sender — the session's chat_mode governs what's allowed.
    if (wantFacilitator) {
      toFacilitator = true; // always permitted, in every mode
    } else if (rawTo) {
      // A DM to another participant — only in 'open' mode.
      if (mode !== "open") {
        return NextResponse.json(
          { error: "Direct messages between participants are turned off" },
          { status: 403 }
        );
      }
      if (rawTo === participantId) {
        return NextResponse.json({ error: "Cannot message yourself" }, { status: 400 });
      }
      const t = await query<{ id: string }>(
        `SELECT id FROM participants
           WHERE id = $1 AND session_id = $2 AND removed_at IS NULL`,
        [rawTo, id]
      );
      if (!t.rows[0]) {
        return NextResponse.json({ error: "Unknown recipient" }, { status: 400 });
      }
      toParticipantId = rawTo;
    } else {
      // Group message — blocked when the room is facilitator-only.
      if (mode === "facilitator") {
        return NextResponse.json(
          { error: "This session only allows messaging the facilitator" },
          { status: 403 }
        );
      }
    }
  }

  await query(
    `INSERT INTO messages (id, session_id, participant_id, sender_name, from_facilitator, body, to_participant_id, to_facilitator)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      randomUUID(),
      id,
      participantId,
      senderName.slice(0, 80),
      fromFacilitator,
      text,
      toParticipantId,
      toFacilitator,
    ]
  );
  return NextResponse.json({ ok: true });
}

// Facilitator-only controls: set the chat mode (who participants may message),
// or spotlight / clear a message for the whole room.
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!(await authorizeSession(req, id))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);

  // Spotlight a message to the room, or clear it (spotlight: null).
  if ("spotlight" in (body ?? {})) {
    const s = body.spotlight;
    if (s === null) {
      await query(
        `UPDATE sessions SET spotlight_message_id = NULL, spotlight_style = NULL WHERE id = $1`,
        [id]
      );
      return NextResponse.json({ ok: true });
    }
    const messageId = typeof s?.messageId === "string" ? s.messageId : "";
    const style = s?.style === "card" ? "card" : "banner";
    if (!messageId) {
      return NextResponse.json({ error: "messageId required" }, { status: 400 });
    }
    // The message must belong to this session.
    const m = await query<{ id: string }>(
      `SELECT id FROM messages WHERE id = $1 AND session_id = $2`,
      [messageId, id]
    );
    if (!m.rows[0]) {
      return NextResponse.json({ error: "Unknown message" }, { status: 400 });
    }
    await query(
      `UPDATE sessions SET spotlight_message_id = $1, spotlight_style = $2 WHERE id = $3`,
      [messageId, style, id]
    );
    return NextResponse.json({ ok: true });
  }

  const mode = body?.chatMode;
  if (mode !== "group" && mode !== "facilitator" && mode !== "open") {
    return NextResponse.json({ error: "Invalid chat mode" }, { status: 400 });
  }
  await query(`UPDATE sessions SET chat_mode = $1 WHERE id = $2`, [mode, id]);
  return NextResponse.json({ ok: true });
}

// Delete a message. The facilitator can remove any; a participant can remove
// their own.
export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const messageId =
    typeof body?.messageId === "string" ? body.messageId : "";
  const rawPid =
    typeof body?.participantId === "string" ? body.participantId : "";
  if (!messageId) {
    return NextResponse.json({ error: "messageId required" }, { status: 400 });
  }
  if (await authorizeSession(req, id)) {
    await query(`DELETE FROM messages WHERE id = $1 AND session_id = $2`, [
      messageId,
      id,
    ]);
  } else if (rawPid) {
    await query(
      `DELETE FROM messages WHERE id = $1 AND session_id = $2 AND participant_id = $3`,
      [messageId, id, rawPid]
    );
  } else {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
