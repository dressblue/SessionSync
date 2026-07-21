"use client";

import { useState } from "react";
import type { ActivityState } from "./useSessionState";

interface Props {
  activity: ActivityState;
  sessionId: string;
  /** Absent for the facilitator's read-only results view. */
  participantId?: string;
  onChanged: () => void;
}

// Column layouts per spec: 1-3 titled cells render as a vertical stack,
// 4 renders as a 2x2 grid.
function columnGridClass(count: number): string {
  return count === 4 ? "grid grid-cols-1 sm:grid-cols-2 gap-4" : "flex flex-col gap-4";
}

export function ActivityPanel({ activity, sessionId, participantId, onChanged }: Props) {
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  async function send(body: Record<string, unknown>, method = "POST") {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/sessions/${sessionId}/respond`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId, ...body }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (activity.kind === "vote") {
    const { options = [], votes } = activity;
    const counts = votes?.counts ?? options.map(() => 0);
    const total = votes?.total ?? 0;
    const myVote = votes?.myVote ?? null;
    return (
      <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 mb-1">
          Vote
        </p>
        <h3 className="text-lg font-semibold mb-4">{activity.prompt}</h3>
        <div className="flex flex-col gap-2">
          {options.map((opt, i) => {
            const pct = total > 0 ? Math.round((counts[i] / total) * 100) : 0;
            const chosen = myVote === i;
            return (
              <button
                key={i}
                disabled={!participantId || busy}
                onClick={() => send({ option: i })}
                className={`relative overflow-hidden text-left rounded-lg border px-4 py-3 transition ${
                  chosen
                    ? "border-indigo-500 ring-1 ring-indigo-500"
                    : "border-slate-200 hover:border-slate-300"
                } ${participantId ? "cursor-pointer" : "cursor-default"}`}
              >
                <span
                  className="absolute inset-y-0 left-0 bg-indigo-100"
                  style={{ width: `${pct}%` }}
                />
                <span className="relative flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">
                    {chosen && <span className="text-indigo-600 mr-1.5">✓</span>}
                    {opt}
                  </span>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {counts[i]} · {pct}%
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          {total} vote{total === 1 ? "" : "s"} cast
          {participantId
            ? myVote !== null
              ? " — tap another option to change yours"
              : " — tap an option to vote"
            : ""}
        </p>
      </div>
    );
  }

  const { columns = [], entries = [] } = activity;
  return (
    <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 mb-1">
        Feedback
      </p>
      <h3 className="text-lg font-semibold mb-4">{activity.prompt}</h3>
      <div className={columnGridClass(columns.length)}>
        {columns.map((title, ci) => {
          const cellEntries = entries.filter((e) => e.column === ci);
          return (
            <div
              key={ci}
              className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex flex-col"
            >
              <p className="text-sm font-semibold text-slate-700 mb-2">{title}</p>
              <ul className="flex flex-wrap gap-1.5 mb-2 min-h-6">
                {cellEntries.map((e) => (
                  <li
                    key={e.id}
                    className="group inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 px-2.5 py-1 text-xs"
                    title={`from ${e.name}`}
                  >
                    <span>{e.value}</span>
                    <span className="text-slate-400">· {e.name.split(" ")[0]}</span>
                    {e.mine && (
                      <button
                        onClick={() => send({ entryId: e.id }, "DELETE")}
                        className="text-slate-300 hover:text-rose-500"
                        aria-label="Remove entry"
                      >
                        ×
                      </button>
                    )}
                  </li>
                ))}
                {cellEntries.length === 0 && (
                  <li className="text-xs text-slate-400">No entries yet</li>
                )}
              </ul>
              {participantId && (
                <form
                  className="mt-auto flex gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const value = (drafts[ci] ?? "").trim();
                    if (!value) return;
                    send({ value, column: ci });
                    setDrafts((d) => ({ ...d, [ci]: "" }));
                  }}
                >
                  <input
                    value={drafts[ci] ?? ""}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [ci]: e.target.value }))
                    }
                    placeholder="Add a word or phrase"
                    maxLength={160}
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={busy || !(drafts[ci] ?? "").trim()}
                    className="rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-indigo-700 disabled:opacity-40"
                  >
                    Add
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
