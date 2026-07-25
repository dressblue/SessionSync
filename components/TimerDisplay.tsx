"use client";

import { useEffect, useState } from "react";

interface TimerState {
  label: string;
  durationSec: number;
  remainingSec: number;
  running: boolean;
  at: string;
}

interface Props {
  timer: TimerState;
  canControl: boolean;
  onControl: (action: "start" | "pause" | "reset" | "add", seconds?: number) => void;
}

function remainingNow(t: TimerState): number {
  if (!t.running) return Math.max(0, t.remainingSec);
  const elapsed = (Date.now() - Date.parse(t.at)) / 1000;
  return Math.max(0, t.remainingSec - (isFinite(elapsed) ? elapsed : 0));
}

function fmt(sec: number): string {
  const s = Math.ceil(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? h + ":" : ""}${mm}:${String(ss).padStart(2, "0")}`;
}

// Synchronized countdown. Everyone computes the remaining time from the
// facilitator's anchor (remaining + running + timestamp), ticking locally so
// there's no per-poll churn — the anchor only changes on a facilitator action.
export function TimerDisplay({ timer, canControl, onControl }: Props) {
  const [now, setNow] = useState(() => remainingNow(timer));

  useEffect(() => {
    setNow(remainingNow(timer));
    if (!timer.running) return;
    const iv = setInterval(() => setNow(remainingNow(timer)), 250);
    return () => clearInterval(iv);
  }, [timer.running, timer.remainingSec, timer.at]);

  const done = now <= 0;
  const urgent = !done && now <= 10 && timer.running;

  return (
    <div className="flex flex-col items-center gap-4">
      {timer.label && (
        <p className="text-sm font-medium text-slate-600 text-center">
          {timer.label}
        </p>
      )}
      <div
        className={`font-mono font-extrabold tabular-nums leading-none text-6xl sm:text-7xl transition-colors ${
          done
            ? "text-rose-600"
            : urgent
              ? "text-rose-500 animate-pulse"
              : "text-slate-900"
        }`}
      >
        {done ? "0:00" : fmt(now)}
      </div>
      {done ? (
        <p className="text-lg font-semibold text-rose-600">Time&apos;s up!</p>
      ) : (
        <p className="text-xs text-slate-400">
          {timer.running ? "Counting down" : "Paused"}
        </p>
      )}

      {canControl && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {timer.running ? (
            <button
              onClick={() => onControl("pause")}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100"
            >
              ❚❚ Pause
            </button>
          ) : (
            <button
              onClick={() => onControl("start")}
              className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700"
            >
              ▶ {done ? "Restart" : "Start"}
            </button>
          )}
          <button
            onClick={() => onControl("add", 60)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            +1 min
          </button>
          <button
            onClick={() => onControl("reset")}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            ↺ Reset
          </button>
        </div>
      )}
    </div>
  );
}
