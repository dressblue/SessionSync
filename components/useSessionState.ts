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
  | "wordcloud";

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

export interface Stroke {
  id: string;
  mine: boolean;
  c: string;
  w: number;
  p: [number, number][];
}

export interface ActivityState {
  id: string;
  kind: ActivityKind;
  prompt: string;
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
  items?: string[];
  graph?: WorkflowGraph;
  sourcing?: "participants";
  anchorSet?: string;
  exhibit?: "file" | "url" | "text";
  fileId?: string;
  url?: string;
  text?: string;
  minutes?: number;
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
