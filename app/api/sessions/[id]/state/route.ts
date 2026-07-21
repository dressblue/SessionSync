import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  getActiveActivity,
  getParticipants,
  getSession,
  getSteps,
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

  const participantId = new URL(req.url).searchParams.get("participantId");
  if (participantId) {
    await query(
      `UPDATE participants SET last_seen = now() WHERE id = $1 AND session_id = $2`,
      [participantId, id]
    );
  }

  const [steps, participants, activity] = await Promise.all([
    getSteps(id),
    getParticipants(id),
    getActiveActivity(session, participantId),
  ]);
  const now = Date.now();

  return NextResponse.json({
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
    },
    activity,
    steps: steps.map((s) => ({
      id: s.id,
      title: s.title,
      kind: s.kind,
      content: s.content,
    })),
    participants: participants.map((p) => ({
      id: p.id,
      name: p.name,
      online: now - new Date(p.last_seen).getTime() < ONLINE_WINDOW_MS,
    })),
  });
}
