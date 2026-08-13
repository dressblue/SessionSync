"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ActivityEntry {
  id: string;
  column: number;
  value: string;
  name: string;
  mine: boolean;
  highlighted: boolean;
  hidden: boolean;
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
  | "sort"
  | "impact1"
  | "impact2"
  | "impact3"
  | "impact4"
  | "survey"
  | "slides"
  | "checklist"
  | "blocks"
  | "secrets"
  | "build";

export interface RichItem {
  title: string;
  note: string;
}

export interface WorkflowNode {
  id: string;
  title: string;
  note: string;
  x: number;
  y: number;
}
export interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
  label: string;
}
export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  startId: string;
}

// A whiteboard element. Freehand pen (legacy, no `k`) keeps { c, w, p }; every
// other kind carries `k` + a normalized (0..1) bounding box and its own fields.
export type WBAnchor = { id?: string; x?: number; y?: number };
export interface Stroke {
  id: string;
  mine: boolean;
  // pen (freehand)
  c?: string;
  w?: number;
  p?: [number, number][];
  // objects
  k?:
    | "rect"
    | "rrect"
    | "ellipse"
    | "triangle"
    | "diamond"
    | "cloud"
    | "line"
    | "arrow"
    | "text"
    | "sticky"
    | "stamp"
    | "art"
    | "table"
    | "conn";
  x?: number;
  y?: number;
  bw?: number;
  bh?: number;
  f?: string | null; // fill (shapes) / background (sticky)
  sw?: number; // stroke width
  t?: string; // text / label
  fs?: number; // font size (text)
  ch?: string; // stamp emoji
  art?: string; // art-piece id (face parts etc.) for k="art"
  rows?: number; // table rows
  cols?: number; // table columns
  cells?: string[]; // table cell text, row-major
  z?: number; // layer order (higher = front)
  rot?: number; // rotation in degrees about the element's box center
  g?: string; // group id — elements sharing a `g` select/move/delete together
  arrow?: boolean; // connector arrowhead
  dash?: boolean; // connector dashed line
  a?: WBAnchor; // connector endpoints (anchored to {id} or free {x,y})
  b?: WBAnchor;
}

export interface ActivityState {
  id: string;
  kind: ActivityKind;
  prompt: string;
  // The step_tool this activity was launched from (if any).
  stepToolId?: string;
  // slides — facilitator-driven PDF slide player over a course deck's range.
  slides?: {
    deckUrl: string;
    startPage: number;
    endPage: number;
    currentPage: number;
  };
  // checklist — statements × named columns (`columns` above holds the labels).
  statements?: { text: string; mode: "single" | "multi" }[];
  displayOnly?: boolean;
  checklistResponses?: {
    id: string;
    s: number;
    selected: number[];
    name: string;
    participantId: string | null;
    mine: boolean;
  }[];
  // blocks — one question, N answer blocks (optional titles); logged per block.
  blockCount?: number;
  blockLabels?: string[];
  blockResponses?: {
    id: string;
    block: number;
    value: string;
    name: string;
    participantId: string | null;
    mine: boolean;
  }[];
  phase?: "collect" | "rate";
  options?: string[];
  columns?: string[];
  votes?: { counts: number[]; total: number; myVote: number | null };
  quiz?: {
    total: number;
    counts: number[];
    myChoice: number | null;
    revealed: boolean;
    correctIndex: number | null;
    correctCount: number | null;
  };
  entries?: ActivityEntry[];
  cloud?: {
    text: string;
    count: number;
    downvotes: number;
    weight: number;
    mine: boolean;
    hidden: boolean;
    ids: string[];
  }[];
  seedTotal?: number;
  seedHidden?: number;
  shuffle?: number;
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
  richItems?: RichItem[];
  revealed?: number;
  total?: number;
  active?: number;
  workflow?: {
    current: string;
    step: { title: string; note: string } | null;
    choices: { to: string; label: string; title: string }[];
    total: number;
    visited: number;
    atStart: boolean;
    isEnd: boolean;
    showMap: boolean;
    graph: WorkflowGraph | null;
    history: string[];
  };
  strokes?: Stroke[];
  responders?: { id: string; count: number }[];
  exhibit?: "file" | "url" | "text";
  fileId?: string;
  filename?: string;
  mime?: string;
  url?: string;
  text?: string;
  mediaType?: "image" | "pdf" | "link";
  words?: string[];
  placements?: { id: string; word: string; col: number; mine: boolean; highlighted: boolean }[];
  topic?: string;
  scales?: { name: string; anchorSet: string; allowNA: boolean }[];
  impactEntries?: {
    id: string;
    text: string;
    ratings: (number | null)[];
    name: string;
    participantId: string | null;
    mine: boolean;
    highlighted: boolean;
  }[];
  surveyMode?: "single" | "multi";
  questions?: { text: string; options: string[]; mode?: "single" | "multi"; commentLabel?: string }[];
  surveyResponses?: {
    id: string;
    q: number;
    selected: number[];
    comment: string;
    name: string;
    participantId: string | null;
    mine: boolean;
  }[];
  // secrets — anonymous secrets on a wall of doors (see lib/sessions.ts).
  secrets?: {
    phase: "collect" | "select";
    submittedCount: number;
    mySubmitted: boolean;
    myText: string | null;
    activeReaderId: string | null;
    activeReaderName: string | null;
    iAmActiveReader: boolean;
    activeReaderDoorIndex: number | null;
    facilitatorReading: boolean;
    scoreEnabled: boolean;
    scoreAnchors: string[];
    scoringDoorId: string | null;
    scoringDoorIndex: number | null;
    myScore: number | null;
    scoreCount: number;
    scoreAvg: number | null;
    scores: { name: string; score: number }[];
    doors: {
      id: string;
      index: number;
      status: "available" | "opened" | "sealed";
      mine: boolean;
      selectableByMe: boolean;
      readerName: string | null;
      pushedToName: string | null;
      author: string | null;
      text: string | null;
      scoreCount: number;
      scoreAvg: number | null;
      scoreDist: number[];
    }[];
  };
  // build — themed per-participant construction canvas (see lib/sessions.ts).
  build?: {
    topic: string;
    topicLabel: string;
    prompt: string;
    pieces: { label: string; items: string[] }[];
    presentingId: string | null;
    presentingName: string | null;
    myElements: Stroke[];
    sharedWith: string[];
    watching: { ownerId: string | null; ownerName: string; elements: Stroke[] }[];
    gallery?: {
      ownerId: string | null;
      ownerName: string;
      elements: Stroke[];
      count: number;
    }[];
  };
  video?: {
    provider: "youtube" | "video";
    ref: string;
    title: string;
    playing: boolean;
    t0: number;
    at: string;
  };
  timer?: {
    label: string;
    durationSec: number;
    remainingSec: number;
    running: boolean;
    at: string;
  };
}

export interface RosterEntry {
  id: string;
  name: string;
  online: boolean;
  isFacilitator: boolean;
}

export interface StepTool {
  id: string;
  kind: ActivityKind;
  prompt: string;
  options?: string[];
  columns?: string[];
  words?: string[];
  items?: string[];
  topic?: string;
  scales?: { name: string; anchorSet: string; allowNA: boolean }[];
  mode?: "single" | "multi";
  questions?: { text: string; options: string[]; mode?: "single" | "multi"; commentLabel?: string }[];
  graph?: WorkflowGraph;
  sourcing?: "participants";
  anchorSet?: string;
  exhibit?: "file" | "url" | "text";
  fileId?: string;
  url?: string;
  text?: string;
  minutes?: number;
  mediaType?: "image" | "pdf" | "link";
  deckId?: string;
  startPage?: number;
  endPage?: number;
  statements?: { text: string; mode: "single" | "multi" }[];
  displayOnly?: boolean;
  blocks?: number;
  blockLabels?: string[];
  scoreAnchorSet?: string;
}

export interface VideoState {
  provider: "youtube" | "video";
  ref: string;
  title: string;
  playing: boolean;
  t0: number;
  at: string;
}

export interface StatePayload {
  build?: string;
  // Set when the facilitator has terminated this participant; the rest of the
  // payload is then absent, so callers must check this before reading `session`.
  removed?: boolean;
  session: {
    id: string;
    title: string;
    code: string;
    status: "lobby" | "live" | "ended";
    currentStep: number;
    refreshEpoch: number;
    courseId: string | null;
    joinKey: string | null;
    joinKeyExpires: string | null;
    chatMode: "group" | "facilitator" | "open";
    /** Presenter-screen sizing, driven from the console. */
    presenterTextScale: number;
    presenterZoomScale: number;
    /** True (facilitator view only) while a projector screen is polling. */
    presenterLive: boolean;
    /** When on, the presenter screen shows the join QR (overriding tool/step). */
    presentQr: boolean;
  };
  activities: ActivityState[];
  pastActivities: {
    id: string;
    kind: ActivityKind;
    prompt: string;
    createdAt: string;
    responseCount: number;
  }[];
  materials: { id: string; title: string; note: string; courseWide: boolean }[];
  files: {
    id: string;
    title: string;
    filename: string;
    size: number;
    courseWide: boolean;
  }[];
  steps: {
    id: string;
    title: string;
    kind: string;
    content: string;
    tools: StepTool[];
  }[];
  participants: RosterEntry[];
  messages?: ChatMessage[];
  /** A chat message the facilitator has promoted to the whole room. */
  spotlight?: SpotlightMessage | null;
}

export interface SpotlightMessage {
  id: string;
  name: string;
  body: string;
  style: "banner" | "card";
}

export interface ChatMessage {
  id: string;
  name: string;
  body: string;
  at: string;
  fromFacilitator: boolean;
  /** The sender's participant id (null when the facilitator sent it). */
  fromParticipantId: string | null;
  /** DM target: a participant id, or null for group / facilitator-private. */
  toParticipantId: string | null;
  /** True when a participant addressed the facilitator privately. */
  toFacilitator: boolean;
  /** Any message not addressed to the whole group. */
  direct: boolean;
  mine: boolean;
}

// Poll-based sync transport. Deliberately a thin seam: swapping in a push
// service (Liveblocks/Ably) later only replaces this hook.
export function useSessionState(
  sessionId: string,
  opts: {
    participantId?: string;
    participantName?: string;
    intervalMs?: number;
    /** Force the participant-facing view even for a logged-in facilitator
     *  (the projector/presenter screen). */
    publicView?: boolean;
  } = {}
) {
  const { participantId, participantName, intervalMs = 1500, publicView } = opts;
  const [state, setState] = useState<StatePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastPayloadRef = useRef<string>("");
  const failStreakRef = useRef(0);

  const tick = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (participantId) params.set("participantId", participantId);
      if (participantId && participantName) params.set("name", participantName);
      if (publicView) params.set("view", "public");
      const qs = params.toString() ? `?${params}` : "";
      // Facilitator elevation rides the Clerk session cookie (sent
      // automatically on same-origin requests); students send none.
      const res = await fetch(`/api/sessions/${sessionId}/state${qs}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      // Only touch React state when the payload actually changed — otherwise
      // every poll re-renders the whole page (replaying animations and
      // jiggling layout) even though nothing is different.
      const text = await res.text();
      failStreakRef.current = 0;
      if (text !== lastPayloadRef.current) {
        lastPayloadRef.current = text;
        const payload = JSON.parse(text) as StatePayload;
        // Auto-heal stale clients: if the server was deployed after this
        // bundle was built, reload once to pick up the new code. The
        // sessionStorage guard prevents a reload loop if caching interferes.
        const myBuild = process.env.NEXT_PUBLIC_BUILD;
        if (
          payload.build &&
          myBuild &&
          payload.build !== "dev" &&
          myBuild !== "dev" &&
          payload.build !== myBuild &&
          sessionStorage.getItem("ss_build_reload") !== payload.build
        ) {
          sessionStorage.setItem("ss_build_reload", payload.build);
          window.location.reload();
          return;
        }
        setState(payload);
      }
      setError(null);
    } catch (e) {
      // A single dropped poll is normal on real networks; only surface the
      // reconnect notice after consecutive failures.
      failStreakRef.current += 1;
      if (failStreakRef.current >= 3) {
        setError(e instanceof Error ? e.message : "Connection lost");
      }
    }
  }, [sessionId, participantId, participantName, publicView]);

  useEffect(() => {
    // Cancellation must be scoped to THIS loop instance. A shared ref gets
    // reset by the next effect run, which let a superseded loop (still
    // awaiting its in-flight poll, with old headers/participant) resurrect
    // itself and run forever alongside the new one — alternating payloads
    // and flickering facilitator-only panels.
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const loop = async () => {
      await tick();
      if (!stopped) {
        timer = setTimeout(loop, intervalMs);
      }
    };
    loop();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [tick, intervalMs]);

  // Immediate re-fetch, used after facilitator mutations for a snappy UI.
  const refresh = useCallback(() => void tick(), [tick]);

  return { state, error, refresh };
}
