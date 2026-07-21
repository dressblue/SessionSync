"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ActivityState {
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

export interface StatePayload {
  session: {
    id: string;
    title: string;
    code: string;
    status: "lobby" | "live" | "ended";
    currentStep: number;
    refreshEpoch: number;
  };
  activity: ActivityState | null;
  steps: { id: string; title: string; kind: string; content: string }[];
  participants: { id: string; name: string; online: boolean }[];
}

// Poll-based sync transport. Deliberately a thin seam: swapping in a push
// service (Liveblocks/Ably) later only replaces this hook.
export function useSessionState(
  sessionId: string,
  opts: { participantId?: string; intervalMs?: number } = {}
) {
  const { participantId, intervalMs = 1500 } = opts;
  const [state, setState] = useState<StatePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stoppedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tick = useCallback(async () => {
    try {
      const qs = participantId
        ? `?participantId=${encodeURIComponent(participantId)}`
        : "";
      const res = await fetch(`/api/sessions/${sessionId}/state${qs}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      setState(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection lost");
    }
  }, [sessionId, participantId]);

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
