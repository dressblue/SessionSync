import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  authorizeSession,
  getOpenActivities,
  getParticipants,
  getPastActivities,
  getSession,
  getSessionFiles,
  getSessionMaterials,
  getSteps,
  getStepTools,
} from "@/lib/sessions";

const ONLINE_WINDOW_MS = 12_000;

// Shared poll endpoint for facilitator and participants. A participantId query
// param doubles as the heartbeat: polling keeps that participant marked online.
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const participantId = url.searchParams.get("participantId");
  const participantName = url.searchParams.get("name");
  let removed = false;
  if (participantId) {
    const upd = await query(
      `UPDATE participants SET last_seen = now()
       WHERE id = $1 AND session_id = $2 AND removed_at IS NULL RETURNING id`,
      [participantId, id]
    );
    if (upd.rows.length === 0) {
      // The heartbeat didn't land: either the seat is gone (self-heal) or the
      // facilitator terminated it. Distinguish so we never resurrect a kicked
      // participant.
      const existing = await query<{ removed_at: string | null }>(
        `SELECT removed_at FROM participants WHERE id = $1 AND session_id = $2`,
        [participantId, id]
      );
      if (existing.rows[0]) {
        removed = !!existing.rows[0].removed_at;
      } else if (participantName) {
        // Seat genuinely missing (e.g. a roster reset) — re-create it so their
        // notes and ability to respond survive without a rejoin.
        await query(
          `INSERT INTO participants (id, session_id, name)
           VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
          [participantId, id, participantName.slice(0, 80)]
        );
      }
    }
  }

  // A terminated participant gets a minimal payload so their app can show the
  // removed screen and stop — without leaking the ongoing session state.
  if (removed) {
    return NextResponse.json({
      build: process.env.NEXT_PUBLIC_BUILD ?? "dev",
      removed: true,
    });
  }

  // Facilitator polls carry the Clerk cookie; their view includes hidden
  // entries (flagged) and each step's attached tools. The presenter/projector
  // view (?view=public) forces the participant-facing view even for a
  // logged-in facilitator, so moderation never lands on the shared screen.
  const forcePublic = url.searchParams.get("view") === "public";
  // The projector poll doubles as a presenter-presence heartbeat, so the
  // console can offer its size controls only while a presenter screen is open.
  if (forcePublic) {
    await query(`UPDATE sessions SET presenter_seen_at = now() WHERE id = $1`, [
      id,
    ]);
  }
  const facilitatorView = !forcePublic && !!(await authorizeSession(req, id));
  const [steps, participants, activities, toolsByStep, materials, files, past] =
    await Promise.all([
      getSteps(id),
      getParticipants(id),
      getOpenActivities(session, participantId, facilitatorView),
      facilitatorView
        ? getStepTools(id)
        : Promise.resolve({} as Awaited<ReturnType<typeof getStepTools>>),
      getSessionMaterials(session),
      getSessionFiles(session),
      facilitatorView ? getPastActivities(id) : Promise.resolve([]),
    ]);
  const now = Date.now();

  // Chat rides the poll for participants and the facilitator, but is never sent
  // to the public presenter screen. Messages are scoped: the facilitator sees
  // everything; a participant sees group messages plus any DM they sent or
  // received (including their private line to the facilitator).
  const chatCols = `id, participant_id, sender_name, from_facilitator, body,
                    to_participant_id, to_facilitator, created_at`;
  type ChatRow = {
    id: string;
    participant_id: string | null;
    sender_name: string;
    from_facilitator: boolean;
    body: string;
    to_participant_id: string | null;
    to_facilitator: boolean;
    created_at: string;
  };
  let messages: ChatRow[] = [];
  if (!forcePublic) {
    if (facilitatorView) {
      messages = (
        await query<ChatRow>(
          `SELECT ${chatCols} FROM messages WHERE session_id = $1
             ORDER BY created_at DESC LIMIT 100`,
          [id]
        )
      ).rows.reverse();
    } else if (participantId) {
      messages = (
        await query<ChatRow>(
          `SELECT ${chatCols} FROM messages
             WHERE session_id = $1 AND (
               (to_participant_id IS NULL AND to_facilitator = false)  -- group
               OR participant_id = $2                                  -- sent by me
               OR to_participant_id = $2                               -- addressed to me
             )
             ORDER BY created_at DESC LIMIT 100`,
          [id, participantId]
        )
      ).rows.reverse();
    } else {
      // Anonymous poll (no participant id yet): only the public group thread.
      messages = (
        await query<ChatRow>(
          `SELECT ${chatCols} FROM messages
             WHERE session_id = $1
               AND to_participant_id IS NULL AND to_facilitator = false
             ORDER BY created_at DESC LIMIT 100`,
          [id]
        )
      ).rows.reverse();
    }
  }

  // A spotlighted chat message is promoted to the whole room (participants +
  // the public presenter screen), so it rides every poll — not scoped. If the
  // underlying message was deleted, the spotlight resolves to null.
  let spotlight:
    | { id: string; name: string; body: string; style: "banner" | "card" }
    | null = null;
  const spotId = (session as { spotlight_message_id?: string | null })
    .spotlight_message_id;
  if (spotId) {
    const sm = await query<{ sender_name: string; body: string }>(
      `SELECT sender_name, body FROM messages WHERE id = $1 AND session_id = $2`,
      [spotId, id]
    );
    if (sm.rows[0]) {
      const style = (session as { spotlight_style?: string | null })
        .spotlight_style;
      spotlight = {
        id: spotId,
        name: sm.rows[0].sender_name,
        body: sm.rows[0].body,
        style: style === "card" ? "card" : "banner",
      };
    }
  }

  return NextResponse.json({
    build: process.env.NEXT_PUBLIC_BUILD ?? "dev",
    spotlight,
    session: {
      id: session.id,
      title: session.title,
      code: session.code,
      status: session.status,
      currentStep: session.current_step,
      refreshEpoch: session.refresh_epoch,
      courseId: session.course_id,
      joinKey: session.join_key,
      joinKeyExpires: session.join_key_expires,
      chatMode:
        (session as { chat_mode?: string }).chat_mode === "facilitator" ||
        (session as { chat_mode?: string }).chat_mode === "open"
          ? (session as { chat_mode?: string }).chat_mode
          : "group",
      // Presenter sizing (read by the projector, driven from the console).
      presenterTextScale:
        (session as { presenter_text_scale?: number }).presenter_text_scale ?? 1,
      presenterZoomScale:
        (session as { presenter_zoom_scale?: number }).presenter_zoom_scale ?? 1,
      // Only the facilitator needs to know a projector is live (to reveal the
      // size controls); recent = a public poll within the last ~7s.
      presenterLive: facilitatorView
        ? (() => {
            const seen = (session as { presenter_seen_at?: string | null })
              .presenter_seen_at;
            return !!seen && now - new Date(seen).getTime() < 7000;
          })()
        : false,
    },
    activities,
    pastActivities: past,
    materials: materials.map((m) => ({
      id: m.id,
      title: m.title,
      note: m.note,
      courseWide: m.session_id === null,
    })),
    files: files.map((f) => ({
      id: f.id,
      title: f.title,
      filename: f.filename,
      size: f.size,
      courseWide: f.session_id === null,
    })),
    steps: steps.map((s) => ({
      id: s.id,
      title: s.title,
      kind: s.kind,
      content: s.content,
      tools: (toolsByStep[s.id] ?? []).map((t) => {
        let config: Record<string, unknown> = {};
        try {
          config = JSON.parse(t.config);
        } catch {
          /* empty config */
        }
        return { id: t.id, kind: t.kind, prompt: t.prompt, ...config };
      }),
    })),
    participants: participants.map((p) => ({
      id: p.id,
      name: p.name,
      online: now - new Date(p.last_seen).getTime() < ONLINE_WINDOW_MS,
      isFacilitator: !!(p as { facilitator_id?: string | null }).facilitator_id,
    })),
    messages: messages.map((m) => ({
      id: m.id,
      name: m.sender_name,
      body: m.body,
      at: m.created_at,
      fromFacilitator: m.from_facilitator,
      fromParticipantId: m.participant_id,
      toParticipantId: m.to_participant_id,
      toFacilitator: m.to_facilitator,
      // A DM is any message not addressed to the whole group.
      direct: m.to_participant_id !== null || m.to_facilitator,
      mine: facilitatorView
        ? m.from_facilitator
        : !!participantId && m.participant_id === participantId,
    })),
  });
}
