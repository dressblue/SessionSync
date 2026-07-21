import { randomUUID, randomBytes } from "crypto";
import { query } from "./db";
import {
  getFacilitatorFromRequest,
  isCourseFacilitator,
} from "./facilitators";

export type SessionStatus = "lobby" | "live" | "ended";

export interface SessionRow {
  id: string;
  title: string;
  code: string;
  facilitator_key: string;
  status: SessionStatus;
  current_step: number;
  refresh_epoch: number;
  active_activity: string | null;
  course_id: string | null;
  position: number;
  join_key: string | null;
  join_key_expires: string | null;
}

export interface ActivityRow {
  id: string;
  session_id: string;
  kind: "vote" | "columns";
  prompt: string;
  config: string;
  status: "open" | "closed";
}

export interface ActivityPayload {
  id: string;
  kind: "vote" | "columns";
  prompt: string;
  options?: string[];
  columns?: string[];
  votes?: { counts: number[]; total: number; myVote: number | null };
  entries?: {
    id: string;
    column: number;
    value: string;
    name: string;
    mine: boolean;
  }[];
}

export interface StepRow {
  id: string;
  session_id: string;
  position: number;
  title: string;
  kind: string;
  content: string;
}

export interface ParticipantRow {
  id: string;
  name: string;
  joined_at: string;
  last_seen: string;
}

// Unambiguous alphabet: no 0/O, 1/I/L.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function makeCode(length = 6): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

export async function createSession(
  title: string,
  courseId: string | null = null,
  position = 0
): Promise<SessionRow> {
  const id = randomUUID();
  const facilitatorKey = randomBytes(24).toString("base64url");
  // Retry on the (unlikely) code collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode();
    try {
      const res = await query<SessionRow>(
        `INSERT INTO sessions (id, title, code, facilitator_key, course_id, position)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [id, title, code, facilitatorKey, courseId, position]
      );
      return res.rows[0];
    } catch (err) {
      if (attempt === 4) throw err;
    }
  }
  throw new Error("unreachable");
}

export async function getSession(id: string): Promise<SessionRow | null> {
  const res = await query<SessionRow>(`SELECT * FROM sessions WHERE id = $1`, [id]);
  return res.rows[0] ?? null;
}

export async function getSessionByCode(code: string): Promise<SessionRow | null> {
  const res = await query<SessionRow>(
    `SELECT * FROM sessions WHERE code = $1`,
    [code.trim().toUpperCase()]
  );
  return res.rows[0] ?? null;
}

/** Returns the session only if the facilitator key matches; otherwise null. */
export async function getAuthorizedSession(
  id: string,
  key: string | null
): Promise<SessionRow | null> {
  if (!key) return null;
  const session = await getSession(id);
  if (!session || session.facilitator_key !== key) return null;
  return session;
}

/**
 * Facilitator authorization for a session: either the legacy per-session
 * secret key, or a signed-in facilitator who is on the session's course team.
 */
export async function authorizeSession(
  req: Request,
  sessionId: string
): Promise<SessionRow | null> {
  const session = await getSession(sessionId);
  if (!session) return null;
  const legacy = req.headers.get("x-facilitator-key");
  if (legacy && legacy === session.facilitator_key) return session;
  if (session.course_id) {
    const facilitator = await getFacilitatorFromRequest(req);
    if (
      facilitator &&
      (await isCourseFacilitator(session.course_id, facilitator.id))
    ) {
      return session;
    }
  }
  return null;
}

export async function getSteps(sessionId: string): Promise<StepRow[]> {
  const res = await query<StepRow>(
    `SELECT * FROM steps WHERE session_id = $1 ORDER BY position ASC`,
    [sessionId]
  );
  return res.rows;
}

/** The currently open activity with live results, shaped for the state poll. */
export async function getActiveActivity(
  session: SessionRow,
  viewerParticipantId: string | null
): Promise<ActivityPayload | null> {
  if (!session.active_activity) return null;
  const res = await query<ActivityRow>(
    `SELECT * FROM activities WHERE id = $1 AND status = 'open'`,
    [session.active_activity]
  );
  const activity = res.rows[0];
  if (!activity) return null;

  let config: { options?: string[]; columns?: string[] } = {};
  try {
    config = JSON.parse(activity.config);
  } catch {
    /* malformed config renders as empty */
  }

  const responses = await query<{
    id: string;
    participant_id: string;
    column_index: number | null;
    value: string;
    name: string | null;
  }>(
    `SELECT r.id, r.participant_id, r.column_index, r.value, p.name
     FROM activity_responses r
     LEFT JOIN participants p ON p.id = r.participant_id
     WHERE r.activity_id = $1
     ORDER BY r.created_at ASC`,
    [activity.id]
  );

  const payload: ActivityPayload = {
    id: activity.id,
    kind: activity.kind,
    prompt: activity.prompt,
  };

  if (activity.kind === "vote") {
    const options = config.options ?? [];
    const counts = options.map(() => 0);
    let myVote: number | null = null;
    for (const r of responses.rows) {
      const idx = Number(r.value);
      if (Number.isInteger(idx) && idx >= 0 && idx < counts.length) {
        counts[idx]++;
        if (viewerParticipantId && r.participant_id === viewerParticipantId) {
          myVote = idx;
        }
      }
    }
    payload.options = options;
    payload.votes = {
      counts,
      total: counts.reduce((a, b) => a + b, 0),
      myVote,
    };
  } else {
    payload.columns = config.columns ?? [];
    payload.entries = responses.rows.map((r) => ({
      id: r.id,
      column: r.column_index ?? 0,
      value: r.value,
      name: r.name ?? "Unknown",
      mine: !!viewerParticipantId && r.participant_id === viewerParticipantId,
    }));
  }
  return payload;
}

export async function getParticipants(sessionId: string): Promise<ParticipantRow[]> {
  const res = await query<ParticipantRow>(
    `SELECT id, name, joined_at, last_seen FROM participants
     WHERE session_id = $1 ORDER BY joined_at ASC`,
    [sessionId]
  );
  return res.rows;
}
