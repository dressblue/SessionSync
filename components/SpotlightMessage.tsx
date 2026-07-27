"use client";

import type { SpotlightMessage as Spot } from "./useSessionState";

// A chat message the facilitator has promoted to the whole room. Two looks:
// a slim pinned banner, or a full presented card (for the projector). Both can
// carry an optional Clear control for the facilitator's own view.

export function SpotlightBanner({
  spotlight,
  onClear,
}: {
  spotlight: Spot;
  onClear?: () => void;
}) {
  return (
    <div className="shrink-0 flex items-start gap-3 bg-amber-50 border-y border-amber-200 px-6 py-3">
      <span className="mt-0.5 text-lg leading-none text-amber-500">★</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">
          Spotlight · {spotlight.name}
        </p>
        <p className="whitespace-pre-wrap break-words text-sm text-slate-800">
          {spotlight.body}
        </p>
      </div>
      {onClear && (
        <button
          onClick={onClear}
          className="shrink-0 text-xs font-medium text-amber-700 hover:text-amber-900"
        >
          Clear
        </button>
      )}
    </div>
  );
}

export function SpotlightCard({
  spotlight,
  present = false,
  onClear,
}: {
  spotlight: Spot;
  present?: boolean;
  onClear?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 text-center">
      <span
        className="mb-4 text-amber-400"
        style={{ fontSize: present ? 52 : 34 }}
      >
        ★
      </span>
      <blockquote
        className={`font-semibold leading-snug text-slate-900 ${
          present ? "max-w-5xl text-5xl" : "max-w-3xl text-2xl"
        }`}
      >
        <span className="whitespace-pre-wrap break-words">
          &ldquo;{spotlight.body}&rdquo;
        </span>
      </blockquote>
      <p
        className={`mt-6 text-slate-400 ${present ? "text-2xl" : "text-base"}`}
      >
        — {spotlight.name}
      </p>
      {onClear && (
        <button
          onClick={onClear}
          className="mt-8 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-500 hover:bg-slate-50"
        >
          Clear spotlight
        </button>
      )}
    </div>
  );
}
