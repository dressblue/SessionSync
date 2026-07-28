"use client";

import { Fragment, useState } from "react";
import { anchorLabels, LIKERT_COLORS } from "@/lib/likert";

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

  // One scale value rendered with the Likert diverging palette (navy → green),
  // or a neutral N/A chip. Used inside the per-participant summary table.
  const valueCell = (si: number, val: number | null) => {
    if (val == null) {
      return (
        <span className="inline-flex items-center justify-center rounded px-2 h-6 text-[11px] font-semibold text-slate-400 bg-slate-100 border border-slate-200">
          N/A
        </span>
      );
    }
    const color = LIKERT_COLORS[val - 1] ?? "#4f46e5";
    const a = anchorLabels(scales[si].anchorSet);
    return (
      <span className="inline-flex items-center gap-1.5">
        <span
          className="w-6 h-6 rounded text-white text-[11px] font-bold flex items-center justify-center shrink-0"
          style={{ backgroundColor: color }}
        >
          {val}
        </span>
        <span className="text-xs text-slate-600">{a[val - 1] ?? val}</span>
      </span>
    );
  };

  // Distinct authors (for the facilitator's per-participant filter).
  const authors = Array.from(
    new Map(
      entries.filter((e) => e.participantId).map((e) => [e.participantId!, e.name])
    ).entries()
  );
  const shown = filter
    ? entries.filter((e) => e.participantId === filter)
    : entries;

  // Group entries by author so each participant's responses sit together,
  // separated by a rule. Highlighted entries float to the top of their group.
  const groups: { pid: string; name: string; items: ImpactEntry[] }[] = [];
  const groupIndex = new Map<string, number>();
  for (const e of shown) {
    const key = e.participantId ?? "facilitator";
    let idx = groupIndex.get(key);
    if (idx === undefined) {
      idx = groups.length;
      groupIndex.set(key, idx);
      groups.push({ pid: key, name: e.name, items: [] });
    }
    groups[idx].items.push(e);
  }
  for (const g of groups) {
    g.items.sort((a, b) => Number(b.highlighted) - Number(a.highlighted));
  }

  const showActions = canModerate || shown.some((e) => e.mine);
  const colCount = 1 + scales.length + (showActions ? 1 : 0);

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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {scales.map((s, si) => {
              const a = anchorLabels(s.anchorSet);
              return (
                <div
                  key={si}
                  className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-2.5"
                >
                  <span className="text-xs font-semibold text-slate-700 break-words">
                    {s.name}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {a[0]} → {a[4]}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((v) => {
                      const color = LIKERT_COLORS[v - 1] ?? "#4f46e5";
                      const selected = picks[si] === v;
                      const muted = picks[si] != null && !selected;
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setPick(si, v)}
                          title={a[v - 1]}
                          className={`w-8 h-8 rounded-md text-xs font-bold transition ${
                            selected
                              ? "text-white ring-2 ring-offset-1 ring-slate-700 scale-110"
                              : muted
                                ? "bg-slate-100 text-slate-400 border border-slate-200 hover:bg-slate-200"
                                : "text-white hover:opacity-90"
                          }`}
                          style={muted ? undefined : { backgroundColor: color }}
                        >
                          {v}
                        </button>
                      );
                    })}
                    {s.allowNA && (
                      <button
                        type="button"
                        onClick={() => setPick(si, "na")}
                        className={`rounded-md border px-2 h-8 text-xs font-semibold transition ${
                          picks[si] === "na"
                            ? "bg-slate-600 border-slate-600 text-white ring-2 ring-offset-1 ring-slate-700"
                            : "border-slate-300 text-slate-500 hover:bg-slate-100"
                        }`}
                      >
                        N/A
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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

      {/* summary: one row per response, grouped by participant. The scale
          header columns show even with no entries so the configured order
          is always documented (e.g. in the session report). */}
      {scales.length === 0 && groups.length === 0 ? (
        <p className="text-sm text-slate-400">No entries yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-200">
                <th className="py-2 pr-3 font-semibold align-bottom">
                  {topic || "Response"}
                </th>
                {scales.map((s, si) => (
                  <th
                    key={si}
                    className="py-2 px-3 font-semibold align-bottom"
                  >
                    {s.name}
                  </th>
                ))}
                {showActions && <th className="py-2 pl-3" />}
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 && (
                <tr>
                  <td
                    colSpan={colCount}
                    className="py-3 text-sm text-slate-400"
                  >
                    No entries yet.
                  </td>
                </tr>
              )}
              {groups.map((g, gi) => (
                <Fragment key={g.pid}>
                  <tr className={gi > 0 ? "border-t-2 border-slate-300" : ""}>
                    <td
                      colSpan={colCount}
                      className="pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-500"
                    >
                      {g.name}
                    </td>
                  </tr>
                  {g.items.map((e) => (
                    <tr
                      key={e.id}
                      className={`border-b border-slate-100 ${
                        e.highlighted ? "bg-amber-50" : ""
                      }`}
                    >
                      <td
                        className={`py-2 pr-3 font-medium break-words align-top ${
                          presentation ? "text-base" : "text-sm"
                        }`}
                      >
                        {e.text}
                      </td>
                      {scales.map((s, si) => (
                        <td
                          key={si}
                          className="py-2 px-3 align-top whitespace-nowrap"
                        >
                          {valueCell(si, e.ratings[si] ?? null)}
                        </td>
                      ))}
                      {showActions && (
                        <td className="py-2 pl-3 align-top text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            {canModerate && (
                              <button
                                onClick={() =>
                                  onHighlight(e.id, !e.highlighted)
                                }
                                title={
                                  e.highlighted
                                    ? "Un-highlight"
                                    : "Highlight for discussion"
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
                                  if (confirm("Delete this entry?"))
                                    onDelete(e.id);
                                }}
                                title="Delete entry"
                                aria-label="Delete entry"
                                className="rounded-md px-1.5 py-1 text-slate-300 hover:text-rose-500"
                              >
                                <svg
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                  className="w-4 h-4"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M8.75 1a1 1 0 0 0-.95.68L7.32 3H4a1 1 0 0 0 0 2h.11l.86 11.14A2 2 0 0 0 6.96 18h6.08a2 2 0 0 0 1.99-1.86L15.89 5H16a1 1 0 1 0 0-2h-3.32l-.48-1.32A1 1 0 0 0 11.25 1h-2.5ZM9 7.25a.75.75 0 0 0-1.5 0v6a.75.75 0 0 0 1.5 0v-6Zm3.5 0a.75.75 0 0 0-1.5 0v6a.75.75 0 0 0 1.5 0v-6Z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
