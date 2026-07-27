import { randomUUID, randomBytes } from "crypto";
import { query } from "./db";
import { isCourseFacilitator } from "./facilitators";
import { getFacilitator } from "./viewer";
import { anchorLabels } from "./likert";

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
  chat_mode: "group" | "facilitator" | "open";
  spotlight_message_id: string | null;
  spotlight_style: "banner" | "card" | null;
}

export type ActivityKind =
  | "vote"
  | "quiz"
  | "columns"
  | "likert"
  | "reveal"
  | "wheel"
  | "workflow"
  | "whiteboard"
  | "exhibit"
  | "video"
  | "timer"
  | "wordcloud"
  | "sort";

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

// A workflow is a directed graph of steps. A node with more than one outgoing
// edge is a branch; each edge's label is a choice the facilitator picks.
export interface WorkflowNode {
  id: string;
  title: string;
  note: string; // 1–2 sentences of supplemental guidance
  x: number; // canvas position (px)
  y: number;
}
export interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
  label: string; // the choice text, e.g. "They agree" / "Still upset"
}
export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  startId: string;
}

// Derive a graph from a workflow config, converting a legacy linear
// (richItems) workflow into a straight chain so old activities still play.
export function resolveWorkflowGraph(config: {
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  startId?: string;
  richItems?: RichItem[];
}): WorkflowGraph {
  if (config.nodes && config.nodes.length > 0) {
    const nodes = config.nodes;
    const ids = new Set(nodes.map((n) => n.id));
    const edges = (config.edges ?? []).filter(
      (e) => ids.has(e.from) && ids.has(e.to)
    );
    const startId =
      config.startId && ids.has(config.startId) ? config.startId : nodes[0].id;
    return { nodes, edges, startId };
  }
  // Legacy: chain the richItems left-to-right.
  const items = config.richItems ?? [];
  const nodes: WorkflowNode[] = items.map((it, i) => ({
    id: `n${i}`,
    title: it.title,
    note: it.note,
    x: 40 + i * 220,
    y: 60,
  }));
  const edges: WorkflowEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({ id: `e${i}`, from: nodes[i].id, to: nodes[i + 1].id, label: "" });
  }
  return { nodes, edges, startId: nodes[0]?.id ?? "" };
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
  // quiz — a poll with a correct answer, withheld until the facilitator reveals
  quiz?: {
    total: number; // how many have answered
    counts: number[]; // per-option tallies — empty for participants pre-reveal
    myChoice: number | null;
    revealed: boolean;
    correctIndex: number | null; // null for participants until revealed
    correctCount: number | null; // how many got it right — null until revealed
  };
  entries?: {
    id: string;
    column: number;
    value: string;
    name: string;
    mine: boolean;
    highlighted: boolean;
    hidden: boolean;
  }[];
  // wordcloud — grouped words with downvote weighting
  cloud?: {
    text: string;
    count: number; // submissions (S)
    downvotes: number; // D
    weight: number; // max(0, S - D) → drives size
    mine: boolean; // did the viewer downvote it
    hidden: boolean; // facilitator-hidden, or shrunk to nothing
    ids: string[]; // submission response ids (for facilitator hide/restore)
  }[];
  // likert
  phase?: "collect" | "rate";
  scale?: number;
  items?: string[];
  ratings?: {
    avg: number | null;
    count: number;
    mine: number | null;
    dist: number[];
  }[];
  anchorSet?: string;
  anchors?: string[];
  // reveal / wheel
  richItems?: RichItem[];
  revealed?: number;
  total?: number;
  active?: number;
  // workflow — a facilitator-driven step graph (supports branching)
  workflow?: {
    current: string; // active node id
    step: { title: string; note: string } | null; // current node — everyone
    choices: { to: string; label: string; title: string }[]; // branch options from current
    total: number; // node count
    visited: number; // steps taken so far (history depth + 1)
    atStart: boolean;
    isEnd: boolean; // current node has no outgoing edges
    showMap: boolean; // facilitator is showing the whole map to the room
    graph: WorkflowGraph | null; // the full map — facilitator, or everyone when showMap
    history: string[]; // visited node ids — facilitator only
  };
  // whiteboard
  strokes?: Stroke[];
  /** Who has responded (vote/likert/collect): participant id + response count. */
  responders?: { id: string; count: number }[];
  // exhibit (presented content)
  exhibit?: "file" | "url" | "text";
  fileId?: string;
  filename?: string;
  mime?: string;
  url?: string;
  text?: string;
  mediaType?: "image" | "pdf" | "link";
  // sort (drag words into facilitator-defined columns; a word may go in many).
  // `columns` reuses the existing comment-board field above.
  words?: string[];
  placements?: { id: string; word: string; col: number; mine: boolean }[];
  // video (synchronized playback)
  video?: {
    provider: "youtube" | "video";
    ref: string; // youtube id, or a playable src url
    title: string;
    playing: boolean;
    t0: number; // anchor position in seconds
    at: string; // ISO server time when the anchor was set
  };
  // timer (synchronized countdown)
  timer?: {
    label: string;
    durationSec: number; // the reset duration
    remainingSec: number; // remaining at the anchor moment
    running: boolean;
    at: string; // ISO server time when the anchor was set
  };
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

/**
 * Whether a student may enter a course session right now. Returns a
 * human-readable reason to BLOCK, or null to allow. Templates are never
 * joinable; a cohort is joinable only within its [starts_at, ends_at] window.
 * Legacy standalone sessions (no course_id) are always allowed.
 */
export async function cohortAccessError(
  courseId: string | null
): Promise<string | null> {
  if (!courseId) return null;
  const c = await query<{
    is_template: boolean;
    starts_at: string | null;
    ends_at: string | null;
  }>(`SELECT is_template, starts_at, ends_at FROM courses WHERE id = $1`, [
    courseId,
  ]);
  const course = c.rows[0];
  if (!course) return null;
  if (course.is_template) return "This is a course template, not a live cohort.";
  const now = Date.now();
  if (course.starts_at && new Date(course.starts_at).getTime() > now) {
    return `This cohort opens on ${new Date(course.starts_at).toLocaleDateString()}.`;
  }
  if (course.ends_at && new Date(course.ends_at).getTime() < now) {
    return `This cohort ended on ${new Date(course.ends_at).toLocaleDateString()}.`;
  }
  return null;
}

export interface DeepCopyOpts {
  title?: string;
  isTemplate: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  cohortLabel?: string;
  ownerFacilitatorId: string;
}

/**
 * Deep-copy a course's STRUCTURE into a new course: sessions → steps →
 * step_tools, plus course_materials and course_files (bytes copied). Live/runtime
 * data (rosters, participants, activities, chat, notes) is NOT copied. Used for
 * both "save as template" (isTemplate:true) and "create cohort" (isTemplate:false,
 * with a date-window). The new course's team starts with `ownerFacilitatorId` as
 * owner. Returns the new course id + code.
 */
export async function deepCopyCourse(
  sourceId: string,
  opts: DeepCopyOpts
): Promise<{ id: string; code: string }> {
  const src = await query<{ title: string; description: string }>(
    `SELECT title, description FROM courses WHERE id = $1`,
    [sourceId]
  );
  if (!src.rows[0]) throw new Error("source course not found");

  const newId = randomUUID();
  const title = (opts.title ?? src.rows[0].title).slice(0, 200);
  let code = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    code = makeCode(8);
    try {
      await query(
        `INSERT INTO courses
           (id, title, description, code, created_by, is_template, template_id,
            starts_at, ends_at, cohort_label)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          newId,
          title,
          src.rows[0].description,
          code,
          opts.ownerFacilitatorId,
          opts.isTemplate,
          opts.isTemplate ? null : sourceId,
          opts.startsAt ?? null,
          opts.endsAt ?? null,
          (opts.cohortLabel ?? "").slice(0, 120),
        ]
      );
      break;
    } catch (err) {
      if (attempt === 4) throw err;
    }
  }

  await query(
    `INSERT INTO course_facilitators (course_id, facilitator_id, role)
     VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`,
    [newId, opts.ownerFacilitatorId]
  );

  // sessions → steps → step_tools
  const sessions = await query<{ id: string; title: string; position: number }>(
    `SELECT id, title, position FROM sessions
       WHERE course_id = $1 ORDER BY position ASC, created_at ASC`,
    [sourceId]
  );
  const sessionIdMap = new Map<string, string>();
  for (const s of sessions.rows) {
    const ns = await createSession(s.title, newId, s.position);
    sessionIdMap.set(s.id, ns.id);
    const steps = await query<{
      id: string;
      title: string;
      kind: string;
      content: string;
      position: number;
    }>(
      `SELECT id, title, kind, content, position FROM steps
         WHERE session_id = $1 ORDER BY position ASC`,
      [s.id]
    );
    for (const st of steps.rows) {
      const newStepId = randomUUID();
      await query(
        `INSERT INTO steps (id, session_id, position, title, kind, content)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [newStepId, ns.id, st.position, st.title, st.kind, st.content]
      );
      const tools = await query<{
        kind: string;
        prompt: string;
        config: string;
        position: number;
      }>(
        `SELECT kind, prompt, config, position FROM step_tools
           WHERE step_id = $1 ORDER BY position ASC`,
        [st.id]
      );
      for (const t of tools.rows) {
        await query(
          `INSERT INTO step_tools (id, step_id, kind, prompt, config, position)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [randomUUID(), newStepId, t.kind, t.prompt, t.config, t.position]
        );
      }
    }
  }

  const mapSession = (sid: string | null) =>
    sid ? (sessionIdMap.get(sid) ?? null) : null;

  // course_materials (course-wide session_id stays null)
  const mats = await query<{
    session_id: string | null;
    title: string;
    note: string;
    position: number;
  }>(
    `SELECT session_id, title, note, position FROM course_materials WHERE course_id = $1`,
    [sourceId]
  );
  for (const m of mats.rows) {
    await query(
      `INSERT INTO course_materials (id, course_id, session_id, title, note, position)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [randomUUID(), newId, mapSession(m.session_id), m.title, m.note, m.position]
    );
  }

  // course_files (copy the bytes)
  const files = await query<{
    session_id: string | null;
    title: string;
    filename: string;
    mime: string;
    size: number;
    data: Buffer;
    position: number;
  }>(
    `SELECT session_id, title, filename, mime, size, data, position
       FROM course_files WHERE course_id = $1`,
    [sourceId]
  );
  for (const f of files.rows) {
    await query(
      `INSERT INTO course_files
         (id, course_id, session_id, title, filename, mime, size, data, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        randomUUID(),
        newId,
        mapSession(f.session_id),
        f.title,
        f.filename,
        f.mime,
        f.size,
        f.data,
        f.position,
      ]
    );
  }

  return { id: newId, code };
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
 * Facilitator authorization for a session: the signed-in Clerk facilitator must
 * be on the session's course team. The `req` argument is retained for call-site
 * compatibility — Clerk resolves identity from the request context, not headers.
 */
export async function authorizeSession(
  _req: Request,
  sessionId: string
): Promise<SessionRow | null> {
  const session = await getSession(sessionId);
  if (!session || !session.course_id) return null;
  const facilitator = await getFacilitator();
  if (!facilitator) return null;
  // Admins can manage any course (including templates) even without a team row.
  if (facilitator.isAdmin) return session;
  if (await isCourseFacilitator(session.course_id, facilitator.id)) {
    return session;
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
  anchorSet?: string;
  // quiz
  correctIndex?: number;
  answerRevealed?: boolean;
  // workflow — a step graph (branching). Legacy linear workflows still carry
  // richItems + a numeric current; new ones carry nodes/edges/startId and a
  // node-id current + history.
  current?: number | string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  startId?: string;
  history?: string[];
  showMap?: boolean;
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
  } else if (activity.kind === "columns" || activity.kind === "wordcloud") {
    texts = rows
      .filter((r) => (r.column_index ?? 0) >= 0 && !r.hidden)
      .map((r) => r.value);
  } else if (activity.kind === "vote" || activity.kind === "quiz") {
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
    // Words the room contributed against each item (column_index = item index).
    // Participants only see words for items that have been revealed.
    payload.entries = entriesFrom(
      responseRows.filter((r) => {
        const idx = r.column_index;
        if (idx === null || idx === undefined || idx < 0 || idx >= items.length)
          return false;
        if (!facilitatorView && idx >= revealed) return false;
        return true;
      })
    );
    return payload;
  }
  if (activity.kind === "wheel") {
    payload.richItems = config.richItems ?? [];
    payload.active = config.active ?? -1;
    return payload;
  }
  if (activity.kind === "workflow") {
    const graph = resolveWorkflowGraph(config);
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    // current is a node id (new) or a numeric index (legacy). Fall back to start.
    let currentId =
      typeof config.current === "string" ? config.current : graph.startId;
    if (typeof config.current === "number")
      currentId = graph.nodes[config.current]?.id ?? graph.startId;
    if (!byId.has(currentId)) currentId = graph.startId;
    const node = byId.get(currentId) ?? null;
    const outgoing = graph.edges.filter((e) => e.from === currentId);
    const history = Array.isArray(config.history) ? config.history : [];
    // When the facilitator turns on "show map to room", the whole graph goes to
    // participants too — otherwise they only ever see the current step.
    const showMap = !!config.showMap;
    payload.workflow = {
      current: currentId,
      step: node ? { title: node.title, note: node.note } : null,
      // Branch options are visible to everyone (the room sees where it can go).
      choices: outgoing.map((e) => ({
        to: e.to,
        label: e.label,
        title: byId.get(e.to)?.title ?? "",
      })),
      total: graph.nodes.length,
      visited: history.length + 1,
      atStart: currentId === graph.startId,
      isEnd: outgoing.length === 0,
      showMap,
      graph: facilitatorView || showMap ? graph : null,
      history: facilitatorView ? history : [],
    };
    return payload;
  }
  if (activity.kind === "timer") {
    const c = config as ActivityConfig & {
      label?: string;
      durationSec?: number;
      remainingSec?: number;
      running?: boolean;
      at?: string;
    };
    payload.timer = {
      label: c.label ?? "",
      durationSec: c.durationSec ?? 300,
      remainingSec: c.remainingSec ?? c.durationSec ?? 300,
      running: !!c.running,
      at: c.at ?? new Date(0).toISOString(),
    };
    return payload;
  }
  if (activity.kind === "video") {
    const c = config as ActivityConfig & {
      provider?: "youtube" | "video";
      ref?: string;
      fileId?: string;
      title?: string;
      playing?: boolean;
      t0?: number;
      at?: string;
    };
    const ref = c.provider === "video" && c.fileId
      ? `/api/files/${c.fileId}?inline=1`
      : (c.ref ?? "");
    payload.video = {
      provider: c.provider ?? "video",
      ref,
      title: c.title ?? "",
      playing: !!c.playing,
      t0: c.t0 ?? 0,
      at: c.at ?? new Date(0).toISOString(),
    };
    return payload;
  }
  if (activity.kind === "exhibit") {
    const c = config as ActivityConfig & {
      exhibit?: "file" | "url" | "text";
      fileId?: string;
      filename?: string;
      mime?: string;
      url?: string;
      text?: string;
      mediaType?: "image" | "pdf" | "link";
    };
    payload.exhibit = c.exhibit;
    payload.fileId = c.fileId;
    payload.filename = c.filename;
    payload.mime = c.mime;
    payload.url = c.url;
    payload.text = c.text;
    payload.mediaType = c.mediaType;
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
  if (activity.kind === "sort") {
    const c = config as { words?: string[]; columns?: string[] };
    payload.words = c.words ?? [];
    payload.columns = c.columns ?? [];
    payload.placements = responseRows
      .filter(
        (r) =>
          typeof r.column_index === "number" &&
          r.column_index >= 0 &&
          typeof r.value === "string"
      )
      .map((r) => ({
        id: r.id,
        word: r.value,
        col: r.column_index as number,
        mine:
          (!!viewerParticipantId && r.participant_id === viewerParticipantId) ||
          (facilitatorView && r.participant_id === null),
      }));
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
  } else if (activity.kind === "quiz") {
    const options = config.options ?? [];
    const counts = options.map(() => 0);
    const correctIndex =
      typeof config.correctIndex === "number" ? config.correctIndex : -1;
    let myChoice: number | null = null;
    let correctCount = 0;
    for (const r of responses.rows) {
      if (r.column_index !== null && r.column_index !== undefined) continue;
      const idx = Number(r.value);
      if (Number.isInteger(idx) && idx >= 0 && idx < counts.length) {
        counts[idx]++;
        if (idx === correctIndex) correctCount++;
        if (viewerParticipantId && r.participant_id === viewerParticipantId) {
          myChoice = idx;
        }
      }
    }
    const revealed = !!config.answerRevealed;
    // The correct answer and the per-option tallies stay hidden from
    // participants until the facilitator reveals — no peeking at the payload.
    const showAnswer = revealed || facilitatorView;
    payload.options = options;
    payload.quiz = {
      total: counts.reduce((a, b) => a + b, 0),
      counts: showAnswer ? counts : [],
      myChoice,
      revealed,
      correctIndex: showAnswer ? correctIndex : null,
      correctCount: showAnswer ? correctCount : null,
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
    payload.anchorSet = config.anchorSet ?? "agreement";
    payload.anchors = anchorLabels(config.anchorSet);
    payload.ratings = items.map((_, i) => {
      const rows = responses.rows.filter(
        (r) =>
          r.column_index === i &&
          Number(r.value) >= 1 &&
          Number(r.value) <= scale
      );
      const sum = rows.reduce((a, r) => a + Number(r.value), 0);
      const dist = Array.from({ length: scale }, () => 0);
      for (const r of rows) dist[Number(r.value) - 1]++;
      const mineRow = viewerParticipantId
        ? rows.find((r) => r.participant_id === viewerParticipantId)
        : undefined;
      return {
        avg: rows.length ? Math.round((sum / rows.length) * 10) / 10 : null,
        count: rows.length,
        mine: mineRow ? Number(mineRow.value) : null,
        dist,
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
  } else if (activity.kind === "wordcloud") {
    // Submissions live in column 0; participant downvotes in column -2.
    const subs = responseRows.filter((r) => r.column_index === 0);
    const downs = responseRows.filter((r) => r.column_index === -2);
    const groups = new Map<
      string,
      {
        text: string;
        s: number;
        d: number;
        ids: string[];
        allHidden: boolean;
        mine: boolean;
      }
    >();
    for (const r of subs) {
      const key = r.value.trim().toLowerCase();
      if (!key) continue;
      const g = groups.get(key) ?? {
        text: r.value.trim(),
        s: 0,
        d: 0,
        ids: [],
        allHidden: true,
        mine: false,
      };
      g.ids.push(r.id);
      g.s += 1;
      if (!r.hidden) g.allHidden = false;
      groups.set(key, g);
    }
    for (const r of downs) {
      const key = r.value.trim().toLowerCase();
      const g = groups.get(key);
      if (!g) continue; // a downvote for a word nobody submitted — ignore
      g.d += 1;
      if (viewerParticipantId && r.participant_id === viewerParticipantId) {
        g.mine = true;
      }
    }
    // A word hides only once its downvotes exceed its submissions by
    // HIDE_MARGIN — so it visibly shrinks as it's downvoted but takes real
    // group consensus to remove (a word one person added needs HIDE_MARGIN + 1
    // downvotes to disappear). Bump this to make removal harder.
    const HIDE_MARGIN = 2;
    payload.cloud = [...groups.values()].map((g) => {
      const net = g.s - g.d;
      return {
        text: g.text,
        count: g.s,
        downvotes: g.d,
        // Natural (submission-based) weight. Downvotes shrink the rendered size
        // client-side by up to 50% (floored, so it stays readable) and outline
        // the word; it hides once net drops past -HIDE_MARGIN.
        weight: g.s,
        mine: g.mine,
        hidden: g.allHidden || net <= -HIDE_MARGIN,
        ids: g.ids,
      };
    });
    // Keep entries (visible submissions) for the close-out report.
    payload.entries = entriesFrom(subs);
    payload.responders = respondersFrom(subs);
  } else {
    payload.columns = config.columns ?? [];
    payload.entries = entriesFrom(
      responses.rows.filter((r) => (r.column_index ?? 0) >= 0)
    );
  }
  return payload;
}

export const MAX_OPEN_ACTIVITIES = 2;

/** All currently open activities (up to 2), shaped for the state poll. */
export async function getOpenActivities(
  session: SessionRow,
  viewerParticipantId: string | null,
  facilitatorView = false
): Promise<ActivityPayload[]> {
  const res = await query<ActivityRow>(
    `SELECT * FROM activities WHERE session_id = $1 AND status = 'open'
     ORDER BY created_at ASC LIMIT ${MAX_OPEN_ACTIVITIES}`,
    [session.id]
  );
  return Promise.all(
    res.rows.map(async (a) => {
      const rows = await fetchActivityResponses(a.id);
      return buildActivityPayload(a, rows, viewerParticipantId, facilitatorView);
    })
  );
}

export interface PastActivity {
  id: string;
  kind: ActivityKind;
  prompt: string;
  createdAt: string;
  responseCount: number;
}

/** Closed activities — the session's saved record, reopenable at will. */
export async function getPastActivities(
  sessionId: string
): Promise<PastActivity[]> {
  const res = await query<
    ActivityRow & { created_at: string; response_count: number }
  >(
    `SELECT a.*, a.created_at,
       (SELECT COUNT(*)::int FROM activity_responses r WHERE r.activity_id = a.id) AS response_count
     FROM activities a
     WHERE a.session_id = $1 AND a.status = 'closed'
     ORDER BY a.created_at DESC`,
    [sessionId]
  );
  return res.rows.map((a) => ({
    id: a.id,
    kind: a.kind,
    prompt: a.prompt,
    createdAt: a.created_at,
    responseCount: a.response_count,
  }));
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
     WHERE session_id = $1 AND removed_at IS NULL ORDER BY joined_at ASC`,
    [sessionId]
  );
  return res.rows;
}
