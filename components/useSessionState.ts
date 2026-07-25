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
  | "columns"
  | "likert"
  | "reveal"
  | "wheel"
  | "whiteboard"
  | "exhibit";

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

export interface ActivityState {
  id: string;
  kind: ActivityKind;
  prompt: string;
  phase?: "collect" | "rate";
  options?: string[];
  columns?: string[];
  votes?: { counts: number[]; total: number; myVote: number | null };
  entries?: ActivityEntry[];
  scale?: number;
  items?: string[];
  ratings?: { avg: number | null; count: number; mine: number | null }[];
  richItems?: RichItem[];
  revealed?: number;
  total?: number;
  active?: number;
  strokes?: Stroke[];
  responders?: { id: string; count: number }[];
  exhibit?: "file" | "url" | "text";
  fileId?: string;
  filename?: string;
  mime?: string;
  url?: string;
  text?: string;
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
  sourcing?: "participants";
  exhibit?: "file" | "url" | "text";
  fileId?: string;
  url?: string;
  text?: string;
}

export interface StatePayload {
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
}

// Poll-based sync transport. Deliberately a thin seam: swapping in a push
// service (Liveblocks/Ably) later only replaces this hook.
export function useSessionState(
  sessionId: string,
  opts: {
    participantId?: string;
    intervalMs?: number;
    headers?: Record<string, string>;
  } = {}
) {
  const { participantId, intervalMs = 1500, headers } = opts;
  const headersKey = JSON.stringify(headers ?? {});
  const [state, setState] = useState<StatePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stoppedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPayloadRef = useRef<string>("");
  const failStreakRef = useRef(0);

  const tick = useCallback(async () => {
    try {
      const qs = participantId
        ? `?participantId=${encodeURIComponent(participantId)}`
        : "";
      const res = await fetch(`/api/sessions/${sessionId}/state${qs}`, {
        cache: "no-store",
        headers: JSON.parse(headersKey),
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
        setState(JSON.parse(text));
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
  }, [sessionId, participantId, headersKey]);

  useEffect(() => {
    stoppedRef.current = false;
    const loop = async () => {
      await tick();
      if (!stoppedRef.current) {
        timerRef.current = setTimeout(loop, intervalMs);
      }
    };
    loop();
    return () => {
      stoppedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [tick, intervalMs]);

  // Immediate re-fetch, used after facilitator mutations for a snappy UI.
  const refresh = useCallback(() => void tick(), [tick]);

  return { state, error, refresh };
}
