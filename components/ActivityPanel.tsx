"use client";

import { useState } from "react";
import type { ActivityEntry, ActivityState } from "./useSessionState";

interface Props {
  activity: ActivityState;
  sessionId: string;
  /** Absent for the facilitator's view. */
  participantId?: string;
  /** Present for facilitators: enables highlight/hide moderation. */
  moderationHeaders?: Record<string, string>;
  onChanged: () => void;
}

// Column layouts per spec: 1-3 titled cells render as a vertical stack,
// 4 renders as a 2x2 grid.
function columnGridClass(count: number): string {
  return count === 4 ? "grid grid-cols-1 sm:grid-cols-2 gap-4" : "flex flex-col gap-4";
}

export function ActivityPanel({
  activity,
  sessionId,
  participantId,
  moderationHeaders,
  onChanged,
}: Props) {
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const canModerate = !!moderationHeaders;

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

  async function moderate(entryId: string, body: Record<string, boolean>) {
    if (!moderationHeaders || busy) return;
    setBusy(true);
    try {
      await fetch(`/api/sessions/${sessionId}/responses/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...moderationHeaders },
        body: JSON.stringify(body),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const entryChip = (e: ActivityEntry) => (
    <li
      key={e.id}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
        e.hidden
          ? "border-dashed border-slate-300 bg-slate-50 text-slate-400"
          : e.highlighted
            ? "border-indigo-400 bg-indigo-50 text-indigo-900"
            : "border-slate-200 bg-white"
      }`}
      title={`from ${e.name}`}
    >
      {e.highlighted && !e.hidden && (
        <span className="text-indigo-600 font-bold">✓</span>
      )}
      <span className={e.hidden ? "line-through" : ""}>{e.value}</span>
      <span className="text-slate-400">· {e.name.split(" ")[0]}</span>
      {canModerate && (
        <span className="flex items-center gap-0.5 ml-0.5">
          <button
            onClick={() => moderate(e.id, { highlighted: !e.highlighted })}
            className={`px-0.5 ${
              e.highlighted
                ? "text-indigo-600"
                : "text-slate-300 hover:text-indigo-500"
            }`}
            title={e.highlighted ? "Remove highlight" : "Highlight"}
            aria-label="Toggle highlight"
          >
            ✓
          </button>
          <button
            onClick={() => moderate(e.id, { hidden: !e.hidden })}
            className="px-0.5 text-slate-300 hover:text-rose-500"
            title={e.hidden ? "Unhide" : "Hide from participants"}
            aria-label="Toggle hidden"
          >
            {e.hidden ? "↺" : "−"}
          </button>
        </span>
      )}
      {!canModerate && e.mine && (
        <button
          onClick={() => send({ entryId: e.id }, "DELETE")}
          className="text-slate-300 hover:text-rose-500"
          aria-label="Remove entry"
        >
          ×
        </button>
      )}
    </li>
  );

  const suggestionForm = (placeholder: string) =>
    participantId ? (
      <form
        className="mt-3 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const value = (drafts[0] ?? "").trim();
          if (!value) return;
          send({ value });
          setDrafts((d) => ({ ...d, 0: "" }));
        }}
      >
        <input
          value={drafts[0] ?? ""}
          onChange={(e) => setDrafts((d) => ({ ...d, 0: e.target.value }))}
          placeholder={placeholder}
          maxLength={160}
          className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={busy || !(drafts[0] ?? "").trim()}
          className="rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-40"
        >
          Add
        </button>
      </form>
    ) : null;

  const header = (label: string) => (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 mb-1">
        {label}
      </p>
      <h3 className="text-lg font-semibold mb-4">{activity.prompt}</h3>
    </>
  );

  // ---- Collect phase (participant-sourced vote/likert) ----
  if (activity.phase === "collect") {
    const entries = activity.entries ?? [];
    return (
      <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-6">
        {header(
          activity.kind === "vote" ? "Vote — gathering options" : "Survey — gathering items"
        )}
        <p className="text-sm text-slate-500 mb-2">
          {participantId
            ? "Suggest options below — the facilitator will open the " +
              (activity.kind === "vote" ? "vote" : "scoring") +
              " once the list is ready."
            : "Suggestions arrive live. Hide any that shouldn't make the list, then start the next phase."}
        </p>
        <ul className="flex flex-wrap gap-1.5 min-h-6">
          {entries.map(entryChip)}
          {entries.length === 0 && (
            <li className="text-xs text-slate-400">No suggestions yet</li>
          )}
        </ul>
        {suggestionForm("Suggest an option")}
      </div>
    );
  }

  // ---- Population vote ----
  if (activity.kind === "vote") {
    const { options = [], votes } = activity;
    const counts = votes?.counts ?? options.map(() => 0);
    const total = votes?.total ?? 0;
    const myVote = votes?.myVote ?? null;
    return (
      <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-6">
        {header("Vote")}
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

  // ---- Scoring survey (likert) ----
  if (activity.kind === "likert") {
    const items = activity.items ?? [];
    const scale = activity.scale ?? 5;
    const ratings = activity.ratings ?? [];
    return (
      <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-6">
        {header("Scoring survey")}
        <p className="text-xs text-slate-400 mb-3">
          1 = lowest, {scale} = highest
        </p>
        <ul className="flex flex-col gap-3">
          {items.map((item, i) => {
            const r = ratings[i] ?? { avg: null, count: 0, mine: null };
            return (
              <li
                key={i}
                className="rounded-lg border border-slate-200 p-3 flex flex-wrap items-center gap-2"
              >
                <span className="text-sm font-medium min-w-0 flex-1">{item}</span>
                <span className="flex items-center gap-1">
                  {Array.from({ length: scale }, (_, s) => s + 1).map((v) => (
                    <button
                      key={v}
                      disabled={!participantId || busy}
                      onClick={() => send({ itemIndex: i, rating: v })}
                      className={`w-7 h-7 rounded-md border text-xs font-semibold transition ${
                        r.mine === v
                          ? "bg-indigo-600 border-indigo-600 text-white"
                          : "border-slate-300 text-slate-500 hover:border-indigo-400"
                      } ${participantId ? "" : "cursor-default"}`}
                    >
                      {v}
                    </button>
                  ))}
                </span>
                <span className="text-xs text-slate-500 tabular-nums w-20 text-right">
                  {r.avg !== null ? `avg ${r.avg}` : "—"} ({r.count})
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  // ---- Moderated comment board (columns) ----
  const { columns = [], entries = [] } = activity;
  return (
    <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-6">
      {header("Feedback")}
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
                {cellEntries.map(entryChip)}
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
                    placeholder="Add a comment"
                    maxLength={280}
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
