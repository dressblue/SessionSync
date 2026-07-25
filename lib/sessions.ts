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

export type ActivityKind =
  | "vote"
  | "columns"
  | "likert"
  | "reveal"
  | "wheel"
  | "whiteboard";

export interface ActivityRow {
  id: string;
  session_id: string;
  kind: ActivityKind;
  prompt: string;
  config: string;
  status: "open" | "closed";
}

export interface RichItem {
  title: string;
  note: string;
}

export interface Stroke {
  id: string;
  mine: boolean;
  c: string;
  w: number;
  p: [number, number][];
}

export interface ActivityPayload {
  id: string;
  kind: ActivityKind;
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
    highlighted: boolean;
    hidden: boolean;
  }[];
  // likert
  phase?: "collect" | "rate";
  scale?: number;
  items?: string[];
  ratings?: { avg: number | null; count: number; mine: number | null }[];
  // reveal / wheel
  richItems?: RichItem[];
  revealed?: number;
  total?: number;
  active?: number;
  // whiteboard
  strokes?: Stroke[];
  /** Who has responded (vote/likert/collect): participant id + response count. */
  responders?: { id: string; count: number }[];
}

export interface StepRow {
  id: string;
  session_id: string;
  position: number;
  title: string;
  kind: string;
  content: string;
}

export interface StepToolRow {
  id: string;
  step_id: string;
  kind: "vote" | "columns" | "likert";
  prompt: string;
  config: string;
  position: number;
}

export interface ParticipantRow {
  id: string;
  name: string;
  joined_at: string;
  last_seen: string;
  facilitator_id?: string | null;
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

// Response-row conventions by kind:
//  vote choices     -> column_index NULL, value = option index
//  columns entries  -> column_index >= 0 (column), value = text
//  collect entries  -> column_index = -1, value = suggested option/item text
//  likert ratings   -> column_index >= 0 (item index), value = rating 1..scale
const COLLECT_COLUMN = -1;

export interface ResponseJoinRow {
  id: string;
  participant_id: string | null;
  column_index: number | null;
  value: string;
  name: string | null;
  highlighted: boolean;
  hidden: boolean;
}

export interface ActivityConfig {
  options?: string[];
  columns?: string[];
  items?: string[];
  phase?: "collect" | "rate";
  scale?: number;
  richItems?: RichItem[];
  revealed?: number;
  active?: number;
}

export function parseActivityConfig(activity: ActivityRow): ActivityConfig {
  try {
    return JSON.parse(activity.config);
  } catch {
    return {};
  }
}

export async function fetchActivityResponses(
  activityId: string
): Promise<ResponseJoinRow[]> {
  const responses = await query<ResponseJoinRow>(
    `SELECT r.id, r.participant_id, r.column_index, r.value, r.highlighted, r.hidden, p.name
     FROM activity_responses r
     LEFT JOIN participants p ON p.id = r.participant_id
     WHERE r.activity_id = $1
     ORDER BY r.created_at ASC`,
    [activityId]
  );
  return responses.rows;
}

/**
 * The text content of an activity, used when converting one tool into
 * another (e.g. comment-board entries become vote options). Hidden entries
 * are excluded — moderation carries through the conversion.
 */
export function extractActivityTexts(
  activity: ActivityRow,
  rows: ResponseJoinRow[]
): string[] {
  const config = parseActivityConfig(activity);
  let texts: string[];
  if (config.phase === "collect") {
    texts = rows
      .filter((r) => r.column_index === COLLECT_COLUMN && !r.hidden)
      .map((r) => r.value);
  } else if (activity.kind === "columns") {
    texts = rows
      .filter((r) => (r.column_index ?? 0) >= 0 && !r.hidden)
      .map((r) => r.value);
  } else if (activity.kind === "vote") {
    texts = config.options ?? [];
  } else if (activity.kind === "likert") {
    texts = config.items ?? [];
  } else if (activity.kind === "reveal" || activity.kind === "wheel") {
    texts = (config.richItems ?? []).map((i) => i.title);
  } else {
    texts = [];
  }
  // Dedupe case-insensitively, keep first spelling, cap the list.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of texts) {
    const norm = t.trim().toLowerCase();
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(t.trim());
    if (out.length >= 12) break;
  }
  return out;
}

/** Shape an activity + its responses for a viewer (poll payload / report). */
export function buildActivityPayload(
  activity: ActivityRow,
  responseRows: ResponseJoinRow[],
  viewerParticipantId: string | null,
  facilitatorView = false
): ActivityPayload {
  const config = parseActivityConfig(activity);

  const payload: ActivityPayload = {
    id: activity.id,
    kind: activity.kind,
    prompt: activity.prompt,
  };
  if (config.phase) payload.phase = config.phase;

  // Hidden entries stay visible (flagged) to facilitators, disappear for
  // participants; highlights are visible to everyone.
  const entriesFrom = (rows: ResponseJoinRow[]) =>
    rows
      .filter((r) => facilitatorView || !r.hidden)
      .map((r) => ({
        id: r.id,
        column: r.column_index ?? 0,
        value: r.value,
        name: r.name ?? "Facilitator",
        mine: !!viewerParticipantId && r.participant_id === viewerParticipantId,
        highlighted: r.highlighted,
        hidden: r.hidden,
      }));

  // Who has responded, for the accountability strip on aggregating tools.
  const respondersFrom = (rows: ResponseJoinRow[]) => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (!r.participant_id) continue;
      counts.set(r.participant_id, (counts.get(r.participant_id) ?? 0) + 1);
    }
    return [...counts].map(([id, count]) => ({ id, count }));
  };

  if (config.phase === "collect") {
    const collectRows = responseRows.filter(
      (r) => r.column_index === COLLECT_COLUMN
    );
    payload.entries = entriesFrom(collectRows);
    payload.responders = respondersFrom(collectRows);
    if (activity.kind === "likert") payload.scale = config.scale ?? 5;
    return payload;
  }

  // Presentation tools: reveal (progressive disclosure) and wheel (spotlight).
  if (activity.kind === "reveal") {
    const items = config.richItems ?? [];
    const revealed = Math.min(config.revealed ?? 0, items.length);
    payload.revealed = revealed;
    payload.total = items.length;
    // Participants only ever receive what's been revealed.
    payload.richItems = facilitatorView ? items : items.slice(0, revealed);
    return payload;
  }
  if (activity.kind === "wheel") {
    payload.richItems = config.richItems ?? [];
    payload.active = config.active ?? -1;
    return payload;
  }
  if (activity.kind === "whiteboard") {
    payload.strokes = responseRows
      .slice(-1000)
      .map((r) => {
        try {
          const s = JSON.parse(r.value) as { c: string; w: number; p: [number, number][] };
          return {
            id: r.id,
            mine:
              (!!viewerParticipantId && r.participant_id === viewerParticipantId) ||
              (facilitatorView && r.participant_id === null),
            c: s.c,
            w: s.w,
            p: s.p,
          };
        } catch {
          return null;
        }
      })
      .filter((s): s is Stroke => s !== null);
    return payload;
  }

  const responses = { rows: responseRows };
  if (activity.kind === "vote") {
    const options = config.options ?? [];
    const counts = options.map(() => 0);
    let myVote: number | null = null;
    for (const r of responses.rows) {
      if (r.column_index !== null && r.column_index !== undefined) continue;
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
    payload.responders = respondersFrom(
      responseRows.filter(
        (r) =>
          (r.column_index === null || r.column_index === undefined) &&
          Number.isInteger(Number(r.value)) &&
          Number(r.value) >= 0 &&
          Number(r.value) < options.length
      )
    );
  } else if (activity.kind === "likert") {
    const items = config.items ?? [];
    const scale = config.scale ?? 5;
    payload.items = items;
    payload.scale = scale;
    payload.ratings = items.map((_, i) => {
      const rows = responses.rows.filter(
        (r) =>
          r.column_index === i &&
          Number(r.value) >= 1 &&
          Number(r.value) <= scale
      );
      const sum = rows.reduce((a, r) => a + Number(r.value), 0);
      const mineRow = viewerParticipantId
        ? rows.find((r) => r.participant_id === viewerParticipantId)
        : undefined;
      return {
        avg: rows.length ? Math.round((sum / rows.length) * 10) / 10 : null,
        count: rows.length,
        mine: mineRow ? Number(mineRow.value) : null,
      };
    });
    payload.responders = respondersFrom(
      responseRows.filter(
        (r) =>
          (r.column_index ?? -1) >= 0 &&
          (r.column_index ?? 0) < items.length &&
          Number(r.value) >= 1 &&
          Number(r.value) <= scale
      )
    );
  } else {
    payload.columns = config.columns ?? [];
    payload.entries = entriesFrom(
      responses.rows.filter((r) => (r.column_index ?? 0) >= 0)
    );
  }
  return payload;
}

/** The currently open activity with live results, shaped for the state poll. */
export async function getActiveActivity(
  session: SessionRow,
  viewerParticipantId: string | null,
  facilitatorView = false
): Promise<ActivityPayload | null> {
  if (!session.active_activity) return null;
  const res = await query<ActivityRow>(
    `SELECT * FROM activities WHERE id = $1 AND status = 'open'`,
    [session.active_activity]
  );
  const activity = res.rows[0];
  if (!activity) return null;
  const rows = await fetchActivityResponses(activity.id);
  return buildActivityPayload(activity, rows, viewerParticipantId, facilitatorView);
}

export interface SessionReport {
  session: { id: string; title: string; status: string };
  course: { title: string; description: string } | null;
  generatedAt: string;
  participants: {
    name: string;
    joinedAt: string;
    isFacilitator: boolean;
  }[];
  steps: { title: string }[];
  activities: (ActivityPayload & { status: string; createdAt: string })[];
}

/** Everything that happened in a session, for the close-out report. */
export async function getSessionReport(
  session: SessionRow
): Promise<SessionReport> {
  const [steps, participants, activitiesRes, course] = await Promise.all([
    getSteps(session.id),
    query<ParticipantRow & { facilitator_id: string | null }>(
      `SELECT id, name, joined_at, last_seen, facilitator_id FROM participants
       WHERE session_id = $1 ORDER BY joined_at ASC`,
      [session.id]
    ),
    query<ActivityRow & { created_at: string }>(
      `SELECT * FROM activities WHERE session_id = $1 ORDER BY created_at ASC`,
      [session.id]
    ),
    session.course_id
      ? query<{ title: string; description: string }>(
          `SELECT title, description FROM courses WHERE id = $1`,
          [session.course_id]
        )
      : Promise.resolve(null),
  ]);

  const activities = await Promise.all(
    activitiesRes.rows.map(async (a) => {
      const rows = await fetchActivityResponses(a.id);
      return {
        ...buildActivityPayload(a, rows, null, true),
        status: a.status,
        createdAt: a.created_at,
      };
    })
  );

  return {
    session: { id: session.id, title: session.title, status: session.status },
    course: course?.rows[0] ?? null,
    generatedAt: new Date().toISOString(),
    participants: participants.rows.map((p) => ({
      name: p.name,
      joinedAt: p.joined_at,
      isFacilitator: !!p.facilitator_id,
    })),
    steps: steps.map((s) => ({ title: s.title })),
    activities,
  };
}

export interface MaterialItem {
  id: string;
  title: string;
  note: string;
  session_id: string | null;
}

export interface FileItem {
  id: string;
  title: string;
  filename: string;
  mime: string;
  size: number;
  session_id: string | null;
}

/** Needed items visible in this session: course-wide + session-scoped. */
export async function getSessionMaterials(
  session: SessionRow
): Promise<MaterialItem[]> {
  if (!session.course_id) return [];
  const res = await query<MaterialItem>(
    `SELECT id, title, note, session_id FROM course_materials
     WHERE course_id = $1 AND (session_id IS NULL OR session_id = $2)
     ORDER BY position ASC, created_at ASC`,
    [session.course_id, session.id]
  );
  return res.rows;
}

/** Downloadable files visible in this session (metadata only). */
export async function getSessionFiles(session: SessionRow): Promise<FileItem[]> {
  if (!session.course_id) return [];
  const res = await query<FileItem>(
    `SELECT id, title, filename, mime, size, session_id FROM course_files
     WHERE course_id = $1 AND (session_id IS NULL OR session_id = $2)
     ORDER BY position ASC, created_at ASC`,
    [session.course_id, session.id]
  );
  return res.rows;
}

export async function getStepTools(
  sessionId: string
): Promise<Record<string, StepToolRow[]>> {
  const res = await query<StepToolRow>(
    `SELECT t.* FROM step_tools t
     JOIN steps s ON s.id = t.step_id
     WHERE s.session_id = $1
     ORDER BY t.position ASC, t.created_at ASC`,
    [sessionId]
  );
  const map: Record<string, StepToolRow[]> = {};
  for (const t of res.rows) {
    (map[t.step_id] ??= []).push(t);
  }
  return map;
}

export async function getParticipants(sessionId: string): Promise<ParticipantRow[]> {
  const res = await query<ParticipantRow>(
    `SELECT id, name, joined_at, last_seen, facilitator_id FROM participants
     WHERE session_id = $1 ORDER BY joined_at ASC`,
    [sessionId]
  );
  return res.rows;
}
