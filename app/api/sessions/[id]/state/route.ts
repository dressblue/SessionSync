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
  if (participantId) {
    const upd = await query(
      `UPDATE participants SET last_seen = now()
       WHERE id = $1 AND session_id = $2 RETURNING id`,
      [participantId, id]
    );
    // Self-heal: if this participant's row is gone (e.g. the roster was
    // reset) but we know their name, re-create the seat with the same id so
    // their notes and ability to respond survive without a rejoin.
    if (upd.rows.length === 0 && participantName) {
      await query(
        `INSERT INTO participants (id, session_id, name)
         VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
        [participantId, id, participantName.slice(0, 80)]
      );
    }
  }

  // Facilitator polls carry auth headers; their view includes hidden entries
  // (flagged) and each step's attached tools.
  const facilitatorView = !!(await authorizeSession(req, id));
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

  return NextResponse.json({
    build: process.env.NEXT_PUBLIC_BUILD ?? "dev",
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
  });
}
