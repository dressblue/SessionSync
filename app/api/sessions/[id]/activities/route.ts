import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import {
  authorizeSession,
  extractActivityTexts,
  fetchActivityResponses,
  type ActivityRow,
  type WorkflowNode,
  type WorkflowEdge,
} from "@/lib/sessions";

const cleanList = (v: unknown, max: number): string[] =>
  Array.isArray(v)
    ? v
        .map((o: unknown) => (typeof o === "string" ? o.trim() : ""))
        .filter(Boolean)
        .slice(0, max)
    : [];

const str = (v: unknown, max: number) =>
  (typeof v === "string" ? v : "").slice(0, max);
const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);

// Validate a workflow graph coming from the visual builder. Returns null if it
// isn't a usable graph (fewer than two nodes), so the caller can fall back.
function sanitizeWorkflowGraph(
  raw: unknown
): { nodes: WorkflowNode[]; edges: WorkflowEdge[]; startId: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as { nodes?: unknown; edges?: unknown; startId?: unknown };
  if (!Array.isArray(g.nodes)) return null;
  const nodes: WorkflowNode[] = g.nodes
    .slice(0, 60)
    .map((n) => n as Record<string, unknown>)
    .filter((n) => typeof n.id === "string" && str(n.title, 160).trim())
    .map((n) => ({
      id: n.id as string,
      title: str(n.title, 160).trim(),
      note: str(n.note, 800),
      x: num(n.x),
      y: num(n.y),
    }));
  if (nodes.length < 2) return null;
  const ids = new Set(nodes.map((n) => n.id));
  const edges: WorkflowEdge[] = (Array.isArray(g.edges) ? g.edges : [])
    .slice(0, 200)
    .map((e) => e as Record<string, unknown>)
    .filter(
      (e) =>
        typeof e.from === "string" &&
        typeof e.to === "string" &&
        ids.has(e.from) &&
        ids.has(e.to)
    )
    .map((e, i) => ({
      id: typeof e.id === "string" ? e.id : `e${i}`,
      from: e.from as string,
      to: e.to as string,
      label: str(e.label, 120),
    }));
  const startId =
    typeof g.startId === "string" && ids.has(g.startId)
      ? g.startId
      : nodes[0].id;
  return { nodes, edges, startId };
}

// Facilitator pushes a new activity. Any open activity is closed first —
// one activity is live at a time.
//
// Kinds:
//  vote    — population survey (pick one, live head-count)
//  likert  — scoring survey (rate each item 1..scale, live averages)
//  columns — moderated comment board (1–4 titled columns)
// vote and likert accept sourcing: "participants" — options/items are
// collected from the group first (phase "collect"), then the facilitator
// advances to the voting/rating phase.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const session = await authorizeSession(req, id);
  if (!session) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const kind = body?.kind;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const sourced = body?.sourcing === "participants";
  // Video, timer, and file/exhibit carry their own content; their heading is
  // optional. Everything else needs a prompt.
  const promptOptional =
    kind === "video" ||
    kind === "timer" ||
    (kind === "exhibit" && body?.exhibit === "file");
  if (!prompt && !promptOptional) {
    return NextResponse.json({ error: "A prompt is required" }, { status: 400 });
  }

  // Transform: seed this activity's choices from another activity's content
  // (e.g. comment-board entries become vote options). Hidden entries are
  // excluded, so moderation carries through.
  if (typeof body?.fromActivityId === "string" && body.fromActivityId) {
    const src = await query<ActivityRow>(
      `SELECT * FROM activities WHERE id = $1 AND session_id = $2`,
      [body.fromActivityId, id]
    );
    if (!src.rows[0]) {
      return NextResponse.json(
        { error: "Source activity not found" },
        { status: 404 }
      );
    }
    const rows = await fetchActivityResponses(src.rows[0].id);
    const texts = extractActivityTexts(src.rows[0], rows);
    if (kind === "vote") body.options = texts;
    else if (kind === "likert") body.items = texts;
    else {
      return NextResponse.json(
        { error: "Can only convert into a vote or scoring survey" },
        { status: 400 }
      );
    }
  }

  let config: Record<string, unknown>;
  if (kind === "vote") {
    if (sourced) {
      config = { phase: "collect" };
    } else {
      const options = cleanList(body?.options, 8);
      if (options.length < 2) {
        return NextResponse.json(
          { error: "A vote needs at least two options" },
          { status: 400 }
        );
      }
      config = { options };
    }
  } else if (kind === "quiz") {
    const options = cleanList(body?.options, 8);
    if (options.length < 2) {
      return NextResponse.json(
        { error: "A quiz needs at least two answers" },
        { status: 400 }
      );
    }
    const correctIndex = Number(body?.correctIndex);
    if (
      !Number.isInteger(correctIndex) ||
      correctIndex < 0 ||
      correctIndex >= options.length
    ) {
      return NextResponse.json(
        { error: "Mark which answer is correct" },
        { status: 400 }
      );
    }
    config = { options, correctIndex, answerRevealed: false };
  } else if (kind === "likert") {
    const scale = 5;
    const anchorSet =
      typeof body?.anchorSet === "string" ? body.anchorSet : "agreement";
    if (sourced) {
      config = { phase: "collect", scale, anchorSet };
    } else {
      const items = cleanList(body?.items, 12);
      if (items.length < 1) {
        return NextResponse.json(
          { error: "A scoring survey needs at least one item" },
          { status: 400 }
        );
      }
      config = { items, scale, anchorSet };
    }
  } else if (kind === "columns") {
    const columns = cleanList(body?.columns, 4);
    if (columns.length < 1) {
      return NextResponse.json(
        { error: "Column feedback needs at least one titled column" },
        { status: 400 }
      );
    }
    config = { columns };
  } else if (kind === "reveal" || kind === "wheel") {
    // Items arrive as "Title | optional note" lines.
    const richItems = cleanList(body?.items, 12).map((line) => {
      const [title, ...rest] = line.split("|");
      return { title: title.trim().slice(0, 120), note: rest.join("|").trim().slice(0, 300) };
    });
    if (richItems.length < (kind === "wheel" ? 3 : 1)) {
      return NextResponse.json(
        {
          error:
            kind === "wheel"
              ? "A wheel needs at least three items"
              : "A reveal needs at least one item",
        },
        { status: 400 }
      );
    }
    config =
      kind === "reveal" ? { richItems, revealed: 0 } : { richItems, active: -1 };
  } else if (kind === "workflow") {
    // Preferred: a graph from the visual builder. Fallback: "Title | note" lines.
    const graph = sanitizeWorkflowGraph(body?.graph);
    if (graph) {
      config = {
        nodes: graph.nodes,
        edges: graph.edges,
        startId: graph.startId,
        current: graph.startId,
        history: [],
      };
    } else {
      const richItems = cleanList(body?.items, 40).map((line) => {
        const [title, ...rest] = line.split("|");
        return {
          title: title.trim().slice(0, 160),
          note: rest.join("|").trim().slice(0, 800),
        };
      });
      if (richItems.length < 2) {
        return NextResponse.json(
          { error: "A workflow needs at least two steps" },
          { status: 400 }
        );
      }
      config = { richItems, current: 0 };
    }
  } else if (kind === "whiteboard") {
    config = {};
  } else if (kind === "exhibit") {
    const exhibit = body?.exhibit;
    if (exhibit === "file") {
      const fileId = typeof body?.fileId === "string" ? body.fileId : "";
      // Guard: an empty or malformed id would crash the uuid lookup (500).
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fileId)) {
        return NextResponse.json(
          { error: "This file isn't available in this course — re-attach it from the library." },
          { status: 400 }
        );
      }
      const file = await query<{ filename: string; mime: string }>(
        `SELECT filename, mime FROM course_files
         WHERE id = $1 AND course_id = $2`,
        [fileId, session.course_id]
      );
      if (!file.rows[0]) {
        return NextResponse.json(
          { error: "This file isn't available in this course — re-attach it from the library." },
          { status: 400 }
        );
      }
      config = {
        exhibit: "file",
        fileId,
        filename: file.rows[0].filename,
        mime: file.rows[0].mime,
      };
    } else if (exhibit === "url") {
      const url = typeof body?.url === "string" ? body.url.trim() : "";
      if (!/^https?:\/\/.+/.test(url)) {
        return NextResponse.json(
          { error: "Enter a full http(s) link" },
          { status: 400 }
        );
      }
      config = {
        exhibit: "url",
        url: url.slice(0, 2000),
        ...(body?.mediaType === "image" ||
        body?.mediaType === "pdf" ||
        body?.mediaType === "link"
          ? { mediaType: body.mediaType }
          : {}),
      };
    } else if (exhibit === "text") {
      const text = typeof body?.text === "string" ? body.text.trim() : "";
      if (!text) {
        return NextResponse.json(
          { error: "Enter the excerpt to present" },
          { status: 400 }
        );
      }
      config = { exhibit: "text", text: text.slice(0, 20_000) };
    } else {
      return NextResponse.json(
        { error: "Choose what to present: a file, a link, or text" },
        { status: 400 }
      );
    }
  } else if (kind === "video") {
    const now = new Date().toISOString();
    const fileId = typeof body?.fileId === "string" ? body.fileId : "";
    if (fileId) {
      const file = await query<{ filename: string; mime: string }>(
        `SELECT filename, mime FROM course_files WHERE id = $1 AND course_id = $2`,
        [fileId, session.course_id]
      );
      if (!file.rows[0] || !file.rows[0].mime.startsWith("video/")) {
        return NextResponse.json(
          { error: "Pick a video file from the course library" },
          { status: 400 }
        );
      }
      config = {
        provider: "video",
        fileId,
        title: prompt || file.rows[0].filename,
        playing: false,
        t0: 0,
        at: now,
      };
    } else {
      const url = typeof body?.url === "string" ? body.url.trim() : "";
      if (!/^https?:\/\/.+/.test(url)) {
        return NextResponse.json(
          { error: "Enter a YouTube link or a direct video URL" },
          { status: 400 }
        );
      }
      const yt = url.match(
        /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/
      );
      config = yt
        ? { provider: "youtube", ref: yt[1], title: prompt, playing: false, t0: 0, at: now }
        : { provider: "video", ref: url.slice(0, 2000), title: prompt, playing: false, t0: 0, at: now };
    }
  } else if (kind === "wordcloud") {
    config = {};
  } else if (kind === "timer") {
    const mins =
      typeof body?.minutes === "number" && body.minutes > 0 ? body.minutes : 5;
    const secs =
      typeof body?.seconds === "number" && body.seconds >= 0 ? body.seconds : 0;
    const durationSec = Math.min(24 * 3600, Math.round(mins * 60 + secs));
    config = {
      label: prompt,
      durationSec,
      remainingSec: durationSec,
      running: false,
      at: new Date().toISOString(),
    };
  } else if (kind === "sort") {
    const words = cleanList(body?.words, 60);
    const columns = cleanList(body?.columns, 4);
    if (words.length < 1) {
      return NextResponse.json(
        { error: "Add at least one word to sort" },
        { status: 400 }
      );
    }
    if (columns.length < 2) {
      return NextResponse.json(
        { error: "A word sort needs at least two columns" },
        { status: 400 }
      );
    }
    config = { words, columns };
  } else if (
    kind === "impact1" ||
    kind === "impact2" ||
    kind === "impact3" ||
    kind === "impact4"
  ) {
    // A comment/word + 1–3 five-point scales per entry; N/A optional per scale.
    const n =
      kind === "impact4"
        ? 4
        : kind === "impact3"
          ? 3
          : kind === "impact2"
            ? 2
            : 1;
    const raw = Array.isArray(body?.scales) ? body.scales : [];
    const scales = Array.from({ length: n }, (_, i) => {
      const s = (raw[i] ?? {}) as {
        name?: unknown;
        anchorSet?: unknown;
        allowNA?: unknown;
      };
      return {
        name:
          typeof s.name === "string" && s.name.trim()
            ? s.name.trim().slice(0, 60)
            : `Scale ${i + 1}`,
        anchorSet: typeof s.anchorSet === "string" ? s.anchorSet : "agreement",
        allowNA: !!s.allowNA,
      };
    });
    config = { scales };
  } else if (kind === "survey") {
    // Several questions, each with 1–4 answers; single- or multi-select for the
    // whole tool, plus a per-question comment participants fill in.
    const rawQ = Array.isArray(body?.questions) ? body.questions : [];
    const questions = rawQ
      .map((q: unknown) => {
        const qq = (q ?? {}) as {
          text?: unknown;
          options?: unknown;
          mode?: unknown;
          commentLabel?: unknown;
        };
        const text =
          typeof qq.text === "string" ? qq.text.trim().slice(0, 200) : "";
        const options = (Array.isArray(qq.options) ? qq.options : [])
          .map((o) => (typeof o === "string" ? o.trim().slice(0, 120) : ""))
          .filter(Boolean)
          .slice(0, 4);
        return {
          text,
          options,
          mode: qq.mode === "multi" ? "multi" : "single",
          commentLabel:
            typeof qq.commentLabel === "string"
              ? qq.commentLabel.trim().slice(0, 120)
              : "",
        };
      })
      .filter(
        (q: { text: string; options: string[] }) => q.text && q.options.length >= 1
      )
      .slice(0, 20);
    if (!questions.length) {
      return NextResponse.json(
        { error: "Add at least one question with an answer" },
        { status: 400 }
      );
    }
    config = { questions };
  } else {
    return NextResponse.json({ error: "Unknown activity kind" }, { status: 400 });
  }

  // Up to two activities run at once (e.g. a reveal plus a comment board
  // about it). Pushing beyond that saves & closes the oldest open one.
  const open = await query<{ id: string }>(
    `SELECT id FROM activities WHERE session_id = $1 AND status = 'open'
     ORDER BY created_at ASC`,
    [id]
  );
  if (open.rows.length >= 2) {
    await query(`UPDATE activities SET status = 'closed' WHERE id = $1`, [
      open.rows[0].id,
    ]);
  }
  const activityId = randomUUID();
  await query(
    `INSERT INTO activities (id, session_id, kind, prompt, config)
     VALUES ($1, $2, $3, $4, $5)`,
    [activityId, id, kind, prompt.slice(0, 300), JSON.stringify(config)]
  );

  // Seed a word cloud with facilitator words in the same request (atomic — no
  // fragile second call). Stored as submissions (column 0) with a NULL
  // participant, and HIDDEN so the cloud launches with "no words" — the
  // facilitator reveals them on cue (PATCH { revealSeeds: true }).
  if (kind === "wordcloud" && Array.isArray(body?.seedWords)) {
    const seed = (body.seedWords as unknown[])
      .map((w) => (typeof w === "string" ? w.trim() : ""))
      .filter(Boolean)
      .slice(0, 80);
    for (const w of seed) {
      await query(
        `INSERT INTO activity_responses (id, activity_id, participant_id, column_index, value, hidden)
         VALUES ($1, $2, NULL, 0, $3, TRUE)`,
        [randomUUID(), activityId, w.slice(0, 60)]
      );
    }
  }

  return NextResponse.json({ id: activityId });
}
