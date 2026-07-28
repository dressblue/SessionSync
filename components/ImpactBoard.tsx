"use client";

import { useState } from "react";
import { anchorLabels } from "@/lib/likert";

export type ImpactScale = { name: string; anchorSet: string; allowNA: boolean };
export type ImpactEntry = {
  id: string;
  text: string;
  ratings: (number | null)[];
  name: string;
  participantId: string | null;
  mine: boolean;
  highlighted: boolean;
};

// Form value for one scale: a 1–5 number, "na" (chosen N/A), or null (unanswered).
type Pick = number | "na" | null;

const pill = (active: boolean) =>
  `w-8 h-8 rounded-md border text-xs font-semibold transition ${
    active
      ? "bg-indigo-600 border-indigo-600 text-white"
      : "border-slate-300 text-slate-600 hover:bg-slate-100"
  }`;

export function ImpactBoard({
  topic,
  scales,
  entries,
  canAdd,
  canModerate,
  onAdd,
  onDelete,
  onHighlight,
  presentation = false,
}: {
  topic: string;
  scales: ImpactScale[];
  entries: ImpactEntry[];
  canAdd: boolean;
  canModerate: boolean;
  onAdd: (text: string, ratings: (number | null)[]) => void;
  onDelete: (entryId: string) => void;
  onHighlight: (entryId: string, highlighted: boolean) => void;
  presentation?: boolean;
}) {
  const [text, setText] = useState("");
  const [picks, setPicks] = useState<Pick[]>(() => scales.map(() => null));
  const [filter, setFilter] = useState("");

  const reset = () => {
    setText("");
    setPicks(scales.map(() => null));
  };
  const complete = text.trim().length > 0 && picks.every((p) => p !== null);
  const submit = () => {
    if (!complete) return;
    onAdd(
      text.trim(),
      picks.map((p) => (p === "na" ? null : (p as number)))
    );
    reset();
  };
  const setPick = (si: number, v: Pick) =>
    setPicks((prev) => prev.map((x, i) => (i === si ? v : x)));

  const label = (si: number, val: number | null) => {
    if (val == null) return "N/A";
    const a = anchorLabels(scales[si].anchorSet);
    return a[val - 1] ? `${val} · ${a[val - 1]}` : String(val);
  };

  // Distinct authors (for the facilitator's per-participant filter).
  const authors = Array.from(
    new Map(
      entries.filter((e) => e.participantId).map((e) => [e.participantId!, e.name])
    ).entries()
  );
  const shown = filter ? entries.filter((e) => e.participantId === filter) : entries;
  const ordered = [...shown].sort(
    (a, b) => Number(b.highlighted) - Number(a.highlighted)
  );

  return (
    <div className="flex flex-col gap-4">
      {/* add-an-entry form */}
      {canAdd && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 flex flex-col gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={topic ? `${topic}…` : "Your comment…"}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {scales.map((s, si) => {
            const a = anchorLabels(s.anchorSet);
            return (
              <div key={si} className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-slate-600 w-32 shrink-0 truncate">
                  {s.name}
                </span>
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setPick(si, v)}
                    title={a[v - 1]}
                    className={pill(picks[si] === v)}
                  >
                    {v}
                  </button>
                ))}
                {s.allowNA && (
                  <button
                    type="button"
                    onClick={() => setPick(si, "na")}
                    className={`rounded-md border px-2 h-8 text-xs font-semibold transition ${
                      picks[si] === "na"
                        ? "bg-slate-600 border-slate-600 text-white"
                        : "border-slate-300 text-slate-500 hover:bg-slate-100"
                    }`}
                  >
                    N/A
                  </button>
                )}
                <span className="text-[10px] text-slate-400 ml-1">
                  {a[0]} → {a[4]}
                </span>
              </div>
            );
          })}
          <button
            onClick={submit}
            disabled={!complete}
            className="self-start rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-40"
          >
            + Add entry
          </button>
        </div>
      )}

      {/* facilitator: filter to one participant's entries */}
      {canModerate && authors.length > 1 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Show entries by</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs bg-white"
          >
            <option value="">Everyone ({entries.length})</option>
            {authors.map(([pid, name]) => (
              <option key={pid} value={pid}>
                {name} ({entries.filter((e) => e.participantId === pid).length})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* entries (highlighted first) */}
      <div className="flex flex-col gap-2">
        {ordered.length === 0 && (
          <p className="text-sm text-slate-400">No entries yet.</p>
        )}
        {ordered.map((e) => (
          <div
            key={e.id}
            className={`rounded-lg border p-3 ${
              e.highlighted
                ? "border-amber-400 bg-amber-50 ring-1 ring-amber-300"
                : "border-slate-200 bg-white"
            }`}
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className={`font-medium ${presentation ? "text-lg" : "text-sm"}`}>
                  {e.text}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {scales.map((s, si) => (
                    <span
                      key={si}
                      className="text-[11px] rounded-md bg-slate-100 px-2 py-0.5 text-slate-600"
                    >
                      <span className="font-semibold">{s.name}:</span>{" "}
                      {label(si, e.ratings[si] ?? null)}
                    </span>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">{e.name}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {canModerate && (
                  <button
                    onClick={() => onHighlight(e.id, !e.highlighted)}
                    title={
                      e.highlighted ? "Un-highlight" : "Highlight for discussion"
                    }
                    className={`rounded-md px-1.5 py-1 text-base leading-none ${
                      e.highlighted
                        ? "text-amber-500"
                        : "text-slate-300 hover:text-amber-500"
                    }`}
                  >
                    ★
                  </button>
                )}
                {(e.mine || canModerate) && (
                  <button
                    onClick={() => {
                      if (confirm("Delete this entry?")) onDelete(e.id);
                    }}
                    title="Delete entry"
                    aria-label="Delete entry"
                    className="rounded-md px-1.5 py-1 text-slate-300 hover:text-rose-500"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path
                        fillRule="evenodd"
                        d="M8.75 1a1 1 0 0 0-.95.68L7.32 3H4a1 1 0 0 0 0 2h.11l.86 11.14A2 2 0 0 0 6.96 18h6.08a2 2 0 0 0 1.99-1.86L15.89 5H16a1 1 0 1 0 0-2h-3.32l-.48-1.32A1 1 0 0 0 11.25 1h-2.5ZM9 7.25a.75.75 0 0 0-1.5 0v6a.75.75 0 0 0 1.5 0v-6Zm3.5 0a.75.75 0 0 0-1.5 0v6a.75.75 0 0 0 1.5 0v-6Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
