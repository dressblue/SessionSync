"use client";

import { useState } from "react";
import type {
  ActivityEntry,
  ActivityState,
  RosterEntry,
} from "./useSessionState";
import { Whiteboard } from "./Whiteboard";
import { Markdown } from "./Markdown";
import { LikertChart, LikertLegend } from "./LikertChart";
import { VideoPlayer } from "./VideoPlayer";
import { TimerDisplay } from "./TimerDisplay";
import { WordCloud } from "./WordCloud";
import { SurveyBoard } from "./SurveyBoard";
import { ChecklistBoard } from "./ChecklistBoard";
import { BlocksBoard } from "./BlocksBoard";
import { CardSort } from "./CardSort";
import { ImpactBoard } from "./ImpactBoard";
import { WorkflowBuilder } from "./WorkflowBuilder";
import dynamic from "next/dynamic";
import { LIKERT_COLORS, anchorLabels } from "@/lib/likert";

// pdf.js is heavy — load the slide renderer only when a slides activity shows.
const SlidePlayer = dynamic(() => import("./SlidePlayer"), { ssr: false });

interface Props {
  activity: ActivityState;
  sessionId: string;
  /** Absent for the facilitator's view. */
  participantId?: string;
  /** Sent with responses so a reset seat self-heals on the server. */
  participantName?: string;
  /** Present for facilitators: enables highlight/hide moderation. */
  moderationHeaders?: Record<string, string>;
  /** Session roster — enables the who's-responded strip. */
  roster?: RosterEntry[];
  /** Projector/presenter mode — scale visuals up for across-the-room viewing. */
  presentation?: boolean;
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
  participantName,
  moderationHeaders,
  roster,
  presentation = false,
  onChanged,
}: Props) {
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const canModerate = !!moderationHeaders;

  async function send(
    body: Record<string, unknown>,
    method = "POST",
    gate = true
  ) {
    if (gate && busy) return;
    if (gate) setBusy(true);
    try {
      await fetch(`/api/sessions/${sessionId}/respond`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(moderationHeaders ?? {}),
        },
        body: JSON.stringify({
          participantId,
          name: participantName,
          activityId: activity.id,
          ...body,
        }),
      });
      onChanged();
    } finally {
      if (gate) setBusy(false);
    }
  }

  // Facilitator-only presentation controls (reveal count, wheel spotlight,
  // whiteboard clear) — PATCH on the activity itself.
  async function manage(body: Record<string, unknown>) {
    if (!moderationHeaders || busy) return;
    setBusy(true);
    try {
      await fetch(`/api/sessions/${sessionId}/activities/${activity.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...moderationHeaders },
        body: JSON.stringify(body),
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

  // For facilitators, the chip itself is a binary toggle: click to feature
  // the word large in the box header, click again to clear it.
  const entryChip = (e: ActivityEntry) => (
    <li
      key={e.id}
      onClick={
        canModerate && !e.hidden
          ? () => moderate(e.id, { highlighted: !e.highlighted })
          : undefined
      }
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
        e.hidden
          ? "border-dashed border-slate-300 bg-slate-50 text-slate-400"
          : e.highlighted
            ? "border-amber-400 bg-amber-50 text-amber-900"
            : "border-slate-200 bg-white"
      } ${canModerate && !e.hidden ? "cursor-pointer select-none hover:border-amber-300" : ""}`}
      title={
        canModerate
          ? e.highlighted
            ? "Click to stop featuring"
            : "Click to feature this for the group"
          : `from ${e.name}`
      }
    >
      {e.highlighted && !e.hidden && (
        <span className="text-amber-600 font-bold">★</span>
      )}
      <span className={e.hidden ? "line-through" : ""}>{e.value}</span>
      <span className="text-slate-400">· {e.name.split(" ")[0]}</span>
      {canModerate && (
        <button
          onClick={(ev) => {
            ev.stopPropagation();
            moderate(e.id, { hidden: !e.hidden });
          }}
          className="px-0.5 text-slate-300 hover:text-rose-500"
          title={e.hidden ? "Unhide" : "Hide from participants"}
          aria-label="Toggle hidden"
        >
          {e.hidden ? "↺" : "−"}
        </button>
      )}
      {!canModerate && e.mine && (
        <button
          onClick={(ev) => {
            ev.stopPropagation();
            send({ entryId: e.id }, "DELETE");
          }}
          className="text-slate-300 hover:text-rose-500"
          aria-label="Remove entry"
        >
          ×
        </button>
      )}
    </li>
  );

  // Featured words render large and contrasting in the box's title segment,
  // right side — the facilitator's way of drawing the group's attention.
  const featuredHeader = (label: string) => {
    const featured = (activity.entries ?? []).filter(
      (e) => e.highlighted && !e.hidden
    );
    return (
      <div className="flex items-start justify-between gap-6 mb-4">
        <div
          className={`min-w-0 ${
            presentation
              ? "flex flex-wrap items-baseline gap-x-3 gap-y-1"
              : ""
          }`}
        >
          <p
            className={`shrink-0 font-semibold uppercase tracking-wide text-indigo-600 ${
              presentation ? "text-sm" : "text-xs mb-1"
            }`}
          >
            {label}
          </p>
          <h3
            className={`min-w-0 font-semibold ${
              presentation ? "text-xl" : "text-lg"
            }`}
          >
            {activity.prompt}
          </h3>
        </div>
        {featured.length > 0 && (
          <div className="shrink-0 max-w-[55%] text-right flex flex-col items-end gap-0.5">
            {featured.map((e) => (
              <span
                key={e.id}
                className="reveal-in text-3xl font-extrabold text-amber-600 leading-tight"
              >
                {e.value}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

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

  const header = (label: string) =>
    presentation ? (
      // Presenter: tool type + tool name share one line to save vertical space.
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="shrink-0 text-sm font-semibold uppercase tracking-wide text-indigo-600">
          {label}
        </p>
        {activity.prompt && (
          <h3 className="min-w-0 text-xl font-semibold">{activity.prompt}</h3>
        )}
      </div>
    ) : (
      <>
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 mb-1">
          {label}
        </p>
        <h3 className="text-lg font-semibold mb-4">{activity.prompt}</h3>
      </>
    );

  // Who's responded — the accountability strip for aggregating tools. Shows
  // participation status only, never what anyone chose.
  const responderStrip = (unitLabel: string, itemsTotal?: number) => {
    if (!roster || roster.length === 0) return null;
    const counts = new Map(
      (activity.responders ?? []).map((r) => [r.id, r.count])
    );
    const doneCount = roster.filter((p) => counts.has(p.id)).length;
    return (
      <div className="mt-4 border-t border-slate-100 pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
          {unitLabel} — {doneCount} of {roster.length}
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {roster.map((p) => {
            const count = counts.get(p.id);
            const done =
              count !== undefined &&
              (itemsTotal === undefined || count >= itemsTotal);
            return (
              <li
                key={p.id}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs border ${
                  done
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : count !== undefined
                      ? "border-amber-300 bg-amber-50 text-amber-800"
                      : "border-slate-200 bg-slate-50 text-slate-400"
                }`}
              >
                {done ? "✓" : count !== undefined ? "…" : "○"} {p.name}
                {itemsTotal !== undefined && count !== undefined && !done && (
                  <span className="text-[10px]">
                    {count}/{itemsTotal}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  // ---- Collect phase (participant-sourced vote/likert) ----
  if (activity.phase === "collect") {
    const entries = activity.entries ?? [];
    return (
      <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-6">
        {featuredHeader(
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
        {responderStrip("Suggestions in")}
      </div>
    );
  }

  // ---- Progressive reveal with per-item word capture ----
  if (activity.kind === "reveal") {
    const items = activity.richItems ?? [];
    const revealed = activity.revealed ?? 0;
    const total = activity.total ?? items.length;
    const entries = activity.entries ?? [];
    return (
      <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-6">
        {header("Reveal")}
        <ol className="flex flex-col gap-2">
          {items.map((item, i) => {
            const isRevealed = i < revealed;
            if (!canModerate && !isRevealed) return null;
            const words = entries.filter((e) => e.column === i);
            const featured = words.filter((e) => e.highlighted && !e.hidden);
            return (
              <li
                key={i}
                className={`rounded-lg border px-4 py-3 transition ${
                  isRevealed
                    ? "border-indigo-200 bg-indigo-50/60 reveal-in"
                    : "border-dashed border-slate-200 opacity-40"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold flex items-center gap-2">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          isRevealed
                            ? "bg-indigo-600 text-white"
                            : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        {i + 1}
                      </span>
                      {item.title}
                    </p>
                    {item.note && (
                      <p className="text-xs text-slate-500 mt-1 pl-8">
                        {item.note}
                      </p>
                    )}
                  </div>
                  {/* Selected word(s), spotlighted large in the upper right */}
                  {featured.length > 0 && (
                    <div className="shrink-0 max-w-[45%] text-right flex flex-col items-end gap-0.5 leading-none">
                      {featured.map((fw) => (
                        <span
                          key={fw.id}
                          className="reveal-in text-2xl sm:text-3xl font-extrabold text-amber-500 leading-none"
                        >
                          {fw.value}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {isRevealed && (
                  <div className="mt-2 pl-8">
                    {(words.length > 0 || canModerate) && (
                      <ul className="flex flex-wrap gap-1.5 mb-2">
                        {words.map(entryChip)}
                      </ul>
                    )}
                    {participantId && (
                      <form
                        className="flex gap-1.5"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const value = (drafts[i] ?? "").trim();
                          if (!value) return;
                          send({ itemIndex: i, value });
                          setDrafts((d) => ({ ...d, [i]: "" }));
                        }}
                      >
                        <input
                          value={drafts[i] ?? ""}
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [i]: e.target.value }))
                          }
                          placeholder="Add a word or thought…"
                          maxLength={160}
                          className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <button
                          type="submit"
                          disabled={busy || !(drafts[i] ?? "").trim()}
                          className="rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-indigo-700 disabled:opacity-40"
                        >
                          Add
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <div className="mt-3 flex items-center gap-2">
          <p className="text-xs text-slate-400">
            {revealed} of {total} revealed
          </p>
          {canModerate && (
            <span className="ml-auto flex gap-1.5">
              <button
                onClick={() => manage({ reveal: revealed - 1 })}
                disabled={busy || revealed === 0}
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Hide last
              </button>
              <button
                onClick={() => manage({ reveal: revealed + 1 })}
                disabled={busy || revealed >= total}
                className="rounded-lg bg-indigo-600 text-white px-3 py-1 text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40"
              >
                Reveal next →
              </button>
            </span>
          )}
        </div>
      </div>
    );
  }

  // ---- Wheel (interconnected items with spotlight) ----
  if (activity.kind === "wheel") {
    const items = activity.richItems ?? [];
    const active = activity.active ?? -1;
    const n = items.length;
    const CX = 260;
    const CY = 250;
    const R = 168;
    const pos = (i: number) => {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      return [CX + R * Math.cos(angle), CY + R * Math.sin(angle)] as const;
    };
    const pairs: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) pairs.push([i, j]);
    }
    const activeItem = active >= 0 ? items[active] : null;
    return (
      <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-6">
        {header("Network")}
        <div style={{ perspective: 1000 }}>
          <svg
            viewBox="0 0 520 500"
            className="w-full max-w-xl mx-auto"
            style={{ transform: "rotateX(14deg)" }}
          >
            <circle
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke="#e2e8f0"
              strokeWidth={1.5}
            />
            {pairs.map(([i, j]) => {
              const [x1, y1] = pos(i);
              const [x2, y2] = pos(j);
              const touchesActive = i === active || j === active;
              return (
                <line
                  key={`${i}-${j}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={touchesActive ? "#818cf8" : "#e2e8f0"}
                  strokeWidth={touchesActive ? 2.5 : 1}
                  className="transition-all duration-300"
                />
              );
            })}
            {items.map((item, i) => {
              const [x, y] = pos(i);
              const isActive = i === active;
              const words = item.title.split(" ");
              const lines =
                words.length > 1
                  ? [
                      words.slice(0, Math.ceil(words.length / 2)).join(" "),
                      words.slice(Math.ceil(words.length / 2)).join(" "),
                    ]
                  : [item.title];
              return (
                <g
                  key={i}
                  onClick={() =>
                    canModerate && manage({ active: isActive ? -1 : i })
                  }
                  className={canModerate ? "cursor-pointer" : ""}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r={isActive ? 60 : 50}
                    fill={isActive ? "#4f46e5" : "#f8fafc"}
                    stroke={isActive ? "#4f46e5" : "#cbd5e1"}
                    strokeWidth={2}
                    className="transition-all duration-300"
                    style={
                      isActive
                        ? { filter: "drop-shadow(0 6px 12px rgba(79,70,229,.35))" }
                        : undefined
                    }
                  />
                  {lines.map((line, li) => (
                    <text
                      key={li}
                      x={x}
                      y={y + (li - (lines.length - 1) / 2) * 14 + 4}
                      textAnchor="middle"
                      fontSize={12.5}
                      fontWeight={600}
                      fill={isActive ? "#ffffff" : "#334155"}
                    >
                      {line}
                    </text>
                  ))}
                </g>
              );
            })}
          </svg>
        </div>
        <div className="mt-3 min-h-12 text-center">
          {activeItem ? (
            <div className="reveal-in">
              <p className="text-sm font-semibold text-indigo-700">
                {activeItem.title}
              </p>
              {activeItem.note && (
                <p className="text-sm text-slate-600 mt-0.5">{activeItem.note}</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              {canModerate
                ? "Click a segment to spotlight it for everyone."
                : "Your facilitator will spotlight each area as it's discussed."}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ---- Workflow (facilitator-driven step graph, with branching) ----
  if (activity.kind === "workflow") {
    const wf = activity.workflow;
    if (!wf || wf.total === 0) return null;
    const {
      current,
      step,
      choices,
      visited,
      atStart,
      isEnd,
      showMap,
      graph,
      history,
    } = wf;
    // The predecessor for the word-sequence breadcrumb: the step we came from
    // (history), else a graph edge that points at the current step.
    const nodeTitleById = (id: string) =>
      graph?.nodes.find((n) => n.id === id)?.title ?? "";
    const prevId =
      history.length > 0
        ? history[history.length - 1]
        : (graph?.edges.find((e) => e.to === current)?.from ?? null);
    const prevTitle = prevId ? nodeTitleById(prevId) : null;
    return (
      <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-6">
        {header("Workflow")}
        <p
          className={`font-semibold uppercase tracking-wide text-slate-400 ${
            presentation ? "text-sm" : "text-[11px]"
          }`}
        >
          Step {visited}
          {isEnd ? " · final" : ""}
        </p>

        {/* Word sequence: predecessor → current → successor(s). Facilitator only
            (revealing the next steps to participants would break "no peeking"). */}
        {canModerate && (prevTitle || choices.length > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            {prevTitle && prevId && (
              <>
                <button
                  onClick={() =>
                    manage({ workflow: { action: "goto", nodeId: prevId } })
                  }
                  disabled={busy}
                  title="Go to the previous step"
                  className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                >
                  {prevTitle}
                </button>
                <span className="text-slate-300">→</span>
              </>
            )}
            <span className="rounded-md bg-indigo-600 px-2 py-1 font-semibold text-white">
              {step?.title ?? "—"}
            </span>
            {choices.length > 0 && <span className="text-slate-300">→</span>}
            {choices.map((c) => (
              <button
                key={c.to}
                onClick={() =>
                  manage({ workflow: { action: "goto", nodeId: c.to } })
                }
                disabled={busy}
                title="Go to this step"
                className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
              >
                {c.label ? `${c.label}: ${c.title}` : c.title}
              </button>
            ))}
            {isEnd && (
              <span className="text-[11px] font-medium text-emerald-600">
                ✓ end
              </span>
            )}
          </div>
        )}

        {/* Current step — highlighted, large on the projector */}
        {step && (
          <div
            key={current}
            className="reveal-in mt-1.5 rounded-xl border-2 border-indigo-500 bg-indigo-50/40 px-4 py-3"
          >
            <h3
              className={`font-bold text-slate-900 ${
                presentation ? "text-3xl" : "text-xl"
              }`}
            >
              {step.title}
            </h3>
            {step.note && (
              <div
                className={`mt-2 prose prose-slate max-w-none ${
                  presentation ? "prose-lg" : "prose-sm"
                }`}
              >
                <Markdown>{step.note}</Markdown>
              </div>
            )}
          </div>
        )}

        {/* Facilitator: Back / Restart + the live map. Navigation happens by
            clicking a step or a connector on the map, or a chip in the sequence
            above — so no separate Continue/choice buttons are needed. */}
        {canModerate ? (
          <>
            {isEnd && (
              <p className="mt-4 text-sm font-medium text-emerald-600">
                ✓ End of this path.
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => manage({ workflow: { action: "back" } })}
                disabled={busy || history.length === 0}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                ← Back
              </button>
              <button
                onClick={() => manage({ workflow: { action: "restart" } })}
                disabled={busy || atStart}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-40"
              >
                ↺ Restart
              </button>
              {/* Show the whole flow on participants' + the projector screen. */}
              <button
                onClick={() =>
                  manage({ workflow: { action: "showMap", value: !showMap } })
                }
                disabled={busy}
                className={`ml-auto rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${
                  showMap
                    ? "bg-emerald-600 text-white hover:bg-emerald-500"
                    : "border border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {showMap ? "✓ Showing map to room" : "Show map to room"}
              </button>
            </div>

            {/* Live map — click any step or connector to jump there */}
            {graph && (
              <div className="mt-4">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Map — click a step or connector to jump
                </p>
                <WorkflowBuilder
                  value={graph}
                  readOnly
                  currentId={current}
                  visited={history}
                  height={520}
                  onSelect={(nodeId) =>
                    manage({ workflow: { action: "goto", nodeId } })
                  }
                />
              </div>
            )}
          </>
        ) : showMap && graph ? (
          /* Participant / projector: the facilitator is showing the whole flow,
             auto-fit to the screen with the current step highlighted. */
          <div className="mt-4">
            <WorkflowBuilder
              value={graph}
              readOnly
              currentId={current}
              height={presentation ? 460 : 320}
            />
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-400">
            Your facilitator is guiding this workflow.
          </p>
        )}
      </div>
    );
  }

  // ---- Word cloud ----
  if (activity.kind === "wordcloud") {
    const cloud = activity.cloud ?? [];
    async function toggleWord(ids: string[], hide: boolean) {
      if (!moderationHeaders || busy) return;
      setBusy(true);
      try {
        await Promise.all(
          ids.map((rid) =>
            fetch(`/api/sessions/${sessionId}/responses/${rid}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json", ...moderationHeaders },
              body: JSON.stringify({ hidden: hide }),
            })
          )
        );
        onChanged();
      } finally {
        setBusy(false);
      }
    }
    return (
      <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-6">
        {header("Word cloud")}
        <WordCloud
          cloud={cloud}
          canModerate={canModerate}
          readOnly={!participantId && !canModerate}
          present={presentation}
          shuffle={activity.shuffle}
          onDownvote={(word) => send({ value: word, action: "downvote" })}
          onHide={toggleWord}
          onClearDownvotes={(word) => send({ value: word, action: "clearDownvotes" })}
        />
        {canModerate && (cloud?.length ?? 0) > 1 && (
          <div className="mt-3">
            <button
              onClick={() => manage({ shuffle: true })}
              disabled={busy}
              title="Re-arrange the words so participants re-read the whole set"
              className="rounded-lg border border-indigo-300 text-indigo-700 px-3 py-1.5 text-sm font-medium hover:bg-indigo-50 disabled:opacity-50"
            >
              🔀 Shuffle layout
            </button>
          </div>
        )}
        {canModerate && (activity.seedTotal ?? 0) > 0 && (
          <div className="mt-3">
            {(activity.seedHidden ?? 0) > 0 ? (
              <button
                onClick={() => manage({ revealSeeds: true })}
                disabled={busy}
                className="rounded-lg bg-amber-500 text-white px-3 py-1.5 text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
              >
                🌱 Reveal {activity.seedHidden} seeded word
                {activity.seedHidden === 1 ? "" : "s"}
              </button>
            ) : (
              <button
                onClick={() => manage({ revealSeeds: false })}
                disabled={busy}
                className="rounded-lg border border-slate-300 text-slate-600 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
              >
                Hide seeded words ({activity.seedTotal})
              </button>
            )}
          </div>
        )}
        {participantId && !canModerate && (
          <form
            className="mt-4 flex gap-1.5"
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
              placeholder="Add a word — submit as many as you like"
              maxLength={60}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={busy || !(drafts[0] ?? "").trim()}
              className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-40"
            >
              Add
            </button>
          </form>
        )}
        {canModerate && (
          <form
            className="mt-4 flex flex-col gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const words = (drafts[1] ?? "")
                .split(/[,\n]/)
                .map((s) => s.trim())
                .filter(Boolean);
              if (!words.length) return;
              send({ words });
              setDrafts((d) => ({ ...d, 1: "" }));
            }}
          >
            <p className="text-[11px] text-slate-400">
              Seed the cloud — words separated by commas or new lines.
              Participants add their own and tap to shrink.
            </p>
            <div className="flex gap-1.5">
              <input
                value={drafts[1] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, 1: e.target.value }))}
                placeholder="courage, patience, listening, presence"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={busy || !(drafts[1] ?? "").trim()}
                className="rounded-lg border border-indigo-300 text-indigo-700 px-4 py-2 text-sm font-medium hover:bg-indigo-50 disabled:opacity-40"
              >
                Add words
              </button>
            </div>
          </form>
        )}
        {responderStrip("Contributed")}
      </div>
    );
  }

  // ---- Countdown timer ----
  if (activity.kind === "timer" && activity.timer) {
    return (
      <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-6">
        {header("Timer")}
        <TimerDisplay
          timer={activity.timer}
          canControl={canModerate}
          onControl={(action, seconds) =>
            manage({ timer: { action, seconds } })
          }
        />
      </div>
    );
  }

  // ---- Video: synchronized playback the facilitator drives ----
  if (activity.kind === "video" && activity.video) {
    return (
      <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-6">
        {header("Video")}
        {activity.video.title && (
          <p className="text-sm font-medium -mt-2 mb-3">{activity.video.title}</p>
        )}
        <VideoPlayer
          video={activity.video}
          canControl={canModerate}
          onControl={(action, pos) => manage({ video: { action, pos } })}
        />
      </div>
    );
  }

  // ---- Slides: facilitator-driven PDF slide player over a deck's page range ----
  if (activity.kind === "slides") {
    const s = activity.slides;
    if (!s) {
      return (
        <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-6">
          {header("Slides")}
          <p className="text-sm text-slate-400">Preparing the deck…</p>
        </div>
      );
    }
    const total = s.endPage - s.startPage + 1;
    const idx = s.currentPage - s.startPage + 1;
    return (
      <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-6">
        {header("Slides — presented by your facilitator")}
        <SlidePlayer
          url={s.deckUrl}
          page={s.currentPage}
          presentation={presentation}
        />
        {canModerate ? (
          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              onClick={() => manage({ slides: { action: "prev" } })}
              disabled={busy || s.currentPage <= s.startPage}
              className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-40"
            >
              ← Prev
            </button>
            <span className="text-xs text-slate-500 tabular-nums">
              Slide {idx} of {total}{" "}
              <span className="text-slate-400">(p. {s.currentPage})</span>
            </span>
            <button
              onClick={() => manage({ slides: { action: "next" } })}
              disabled={busy || s.currentPage >= s.endPage}
              className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        ) : (
          <p className="mt-2 text-center text-xs text-slate-400">
            Your facilitator is guiding these slides.
          </p>
        )}
      </div>
    );
  }

  // ---- Exhibit: presented file / link / rich-text excerpt ----
  if (activity.kind === "exhibit") {
    return (
      <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-6">
        {header("Presented by your facilitator")}
        {activity.exhibit === "file" && activity.fileId && (
          <>
            {activity.mime?.startsWith("image/") ? (
              <img
                src={`/api/files/${activity.fileId}?inline=1`}
                alt={activity.filename ?? "Presented image"}
                className="max-w-full rounded-lg border border-slate-200"
              />
            ) : activity.mime === "application/pdf" ? (
              <iframe
                src={`/api/files/${activity.fileId}?inline=1`}
                title={activity.filename ?? "Presented document"}
                className="w-full h-[70vh] rounded-lg border border-slate-200"
              />
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
                <p className="text-sm font-medium mb-1">{activity.filename}</p>
                <p className="text-xs text-slate-400 mb-3">
                  This document opens in its own application.
                </p>
              </div>
            )}
            <a
              href={`/api/files/${activity.fileId}`}
              download={activity.filename}
              className="mt-3 inline-block rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700"
            >
              Download {activity.filename}
            </a>
          </>
        )}
        {activity.exhibit === "url" &&
          activity.url &&
          (() => {
            const u = activity.url;
            // Prefer the stored mediaType; fall back to the URL extension so
            // uploaded images/PDFs render inline instead of as a "web link".
            const kind =
              activity.mediaType ??
              (/\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(u)
                ? "image"
                : /\.pdf(\?|$)/i.test(u)
                  ? "pdf"
                  : "link");
            if (kind === "image") {
              return (
                <img
                  src={u}
                  alt={activity.prompt}
                  className="max-w-full mx-auto rounded-lg border border-slate-200"
                />
              );
            }
            if (kind === "pdf") {
              return (
                <iframe
                  src={u}
                  title={activity.prompt}
                  className="w-full h-[70vh] rounded-lg border border-slate-200"
                />
              );
            }
            return (
              <>
                <iframe
                  src={u}
                  title={activity.prompt}
                  sandbox="allow-scripts allow-same-origin allow-popups"
                  className="w-full h-[60vh] rounded-lg border border-slate-200 bg-white"
                />
                <p className="mt-2 text-xs text-slate-400">
                  Some sites don&apos;t allow embedding — if the frame is blank,
                  use the button.
                </p>
                <a
                  href={u}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700"
                >
                  Open link in a new tab
                </a>
              </>
            );
          })()}
        {activity.exhibit === "text" && activity.text && (
          <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-5">
            <Markdown>{activity.text}</Markdown>
          </div>
        )}
      </div>
    );
  }

  // ---- Shared whiteboard ----
  if (activity.kind === "whiteboard") {
    return (
      <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-6">
        {header("Whiteboard")}
        <Whiteboard
          strokes={activity.strokes ?? []}
          canDraw={!!participantId || canModerate}
          canModerate={canModerate}
          onStroke={(stroke) => send({ stroke }, "POST", false)}
          onElement={(element) => send({ element }, "POST", false)}
          onElementUpdate={(elUpdate) => send({ elUpdate }, "POST", false)}
          onUndo={(entryId) => send({ entryId }, "DELETE")}
          onClear={() => manage({ clear: true })}
        />
      </div>
    );
  }

  // ---- Word sort: drag words into facilitator-defined columns ----
  if (activity.kind === "sort") {
    return (
      <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-6">
        {header("Word sort")}
        <CardSort
          words={activity.words ?? []}
          columns={activity.columns ?? []}
          placements={activity.placements ?? []}
          onPlace={(word, col) => send({ action: "place", word, col }, "POST", false)}
          onUnplace={(word, col) =>
            send({ action: "unplace", word, col }, "POST", false)
          }
          onAddWord={(word) => send({ action: "addword", word }, "POST", false)}
          canModerate={canModerate}
          onHighlight={(placementId, highlighted) =>
            moderate(placementId, { highlighted })
          }
          readOnly={!participantId && !canModerate}
          presentation={presentation}
        />
      </div>
    );
  }

  // ---- Impact: a comment + 1–3 five-point scales per entry ----
  if (
    activity.kind === "impact1" ||
    activity.kind === "impact2" ||
    activity.kind === "impact3" ||
    activity.kind === "impact4"
  ) {
    return (
      <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-6">
        {header("Impact")}
        <ImpactBoard
          topic={activity.topic ?? activity.prompt ?? ""}
          scales={activity.scales ?? []}
          entries={activity.impactEntries ?? []}
          canAdd={!!participantId || canModerate}
          canModerate={canModerate}
          onAdd={(text, ratings) => send({ text, ratings }, "POST", false)}
          onDelete={(entryId) => send({ entryId }, "DELETE")}
          onHighlight={(entryId, highlighted) =>
            moderate(entryId, { highlighted })
          }
          presentation={presentation}
        />
      </div>
    );
  }

  // ---- Survey: several questions, single/multi-select + a comment each ----
  if (activity.kind === "survey") {
    return (
      <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-6">
        {header("Survey")}
        <SurveyBoard
          questions={activity.questions ?? []}
          responses={activity.surveyResponses ?? []}
          canAnswer={!!participantId}
          showResults
          onAnswer={(q, selected, comment) =>
            send({ questionIndex: q, selected, comment }, "POST", false)
          }
          presentation={presentation}
        />
      </div>
    );
  }

  if (activity.kind === "checklist") {
    return (
      <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-6">
        {header("Checklist")}
        <ChecklistBoard
          columns={activity.columns ?? []}
          statements={activity.statements ?? []}
          responses={activity.checklistResponses ?? []}
          displayOnly={!!activity.displayOnly}
          canAnswer={!!participantId}
          showResults={canModerate || !participantId}
          onAnswer={(si, selected) =>
            send({ statementIndex: si, selected }, "POST", false)
          }
          presentation={presentation}
        />
      </div>
    );
  }

  if (activity.kind === "blocks") {
    return (
      <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-6">
        {header("Blocks")}
        <BlocksBoard
          blockCount={activity.blockCount ?? 3}
          labels={activity.blockLabels}
          responses={activity.blockResponses ?? []}
          canModerate={canModerate}
          participantId={participantId}
          present={presentation}
          onSubmit={(block, value) => send({ block, value }, "POST", false)}
        />
      </div>
    );
  }

  // ---- Population vote ----
  // ---- Quiz: a poll with a correct answer, revealed on the facilitator's cue ----
  if (activity.kind === "quiz") {
    const { options = [], quiz } = activity;
    const revealed = quiz?.revealed ?? false;
    const showAnswer = revealed || canModerate;
    const counts = quiz?.counts ?? [];
    const haveCounts = counts.length === options.length;
    const total = quiz?.total ?? 0;
    const myChoice = quiz?.myChoice ?? null;
    const correctIndex = quiz?.correctIndex ?? null;
    const answered = myChoice !== null;
    const locked = revealed; // answers freeze once the reveal happens
    return (
      <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-6">
        {header("Quiz")}
        <div className="flex flex-col gap-2">
          {options.map((opt, i) => {
            const chosen = myChoice === i;
            const isCorrect = correctIndex === i;
            const pct =
              showAnswer && haveCounts && total > 0
                ? Math.round((counts[i] / total) * 100)
                : 0;
            let cls = "border-slate-200 hover:border-slate-300";
            if (showAnswer && isCorrect)
              cls = "border-green-500 ring-1 ring-green-500 bg-green-50";
            else if (revealed && chosen && !isCorrect)
              cls = "border-rose-400 ring-1 ring-rose-400 bg-rose-50";
            else if (chosen) cls = "border-indigo-500 ring-1 ring-indigo-500";
            const interactive = !!participantId && !locked && !canModerate;
            return (
              <button
                key={i}
                disabled={!interactive || busy}
                onClick={() => interactive && send({ option: i })}
                className={`relative overflow-hidden text-left rounded-lg border px-4 py-3 transition ${cls} ${
                  interactive ? "cursor-pointer" : "cursor-default"
                }`}
              >
                {showAnswer && haveCounts && (
                  <span
                    className="absolute inset-y-0 left-0 bg-slate-100"
                    style={{ width: `${pct}%` }}
                  />
                )}
                <span className="relative flex items-center justify-between gap-3">
                  <span className="text-sm font-medium flex items-center gap-1.5">
                    {showAnswer && isCorrect && (
                      <span className="text-green-600">✓</span>
                    )}
                    {revealed && chosen && !isCorrect && (
                      <span className="text-rose-500">✗</span>
                    )}
                    {!showAnswer && chosen && (
                      <span className="text-indigo-600">●</span>
                    )}
                    {opt}
                    {canModerate && isCorrect && !revealed && (
                      <span className="text-[10px] uppercase font-semibold text-green-600 ml-1">
                        answer
                      </span>
                    )}
                  </span>
                  {showAnswer && haveCounts && (
                    <span className="text-xs text-slate-500 tabular-nums">
                      {counts[i]} · {pct}%
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          {revealed
            ? answered
              ? myChoice === correctIndex
                ? "✓ You got it right!"
                : "Not quite — the correct answer is highlighted."
              : `${total} answered`
            : participantId
              ? answered
                ? "Answer locked in — waiting for the reveal."
                : "Tap your answer."
              : `${total} answered`}
        </p>
        {canModerate && (
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => manage({ revealAnswer: !revealed })}
              disabled={busy}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
                revealed
                  ? "border border-slate-300 text-slate-600 hover:bg-slate-50"
                  : "bg-green-600 text-white hover:bg-green-700"
              }`}
            >
              {revealed ? "Hide answer" : "Reveal answer"}
            </button>
            {revealed && quiz?.correctCount != null && (
              <span className="text-xs text-slate-500 tabular-nums">
                {quiz.correctCount} of {total} correct
              </span>
            )}
          </div>
        )}
        {responderStrip("Answered")}
      </div>
    );
  }

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
        {responderStrip("Votes in")}
      </div>
    );
  }

  // ---- Scoring survey (likert), diverging distribution chart ----
  if (activity.kind === "likert") {
    const items = activity.items ?? [];
    const scale = activity.scale ?? 5;
    const ratings = activity.ratings ?? [];
    const anchors = activity.anchors ?? anchorLabels(activity.anchorSet);
    const fivePoint = scale === 5 && anchors.length === 5;
    return (
      <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-6">
        {header("Scoring survey")}

        {/* Live distribution — the enhanced results view */}
        {fivePoint && (
          <div className="mb-5">
            <LikertChart
              items={items}
              ratings={ratings.map((r) => ({
                avg: r.avg,
                count: r.count,
                dist: r.dist ?? [],
              }))}
              anchors={anchors}
            />
          </div>
        )}

        {/* Rating input — a copy of the colour key sits right above the stack
            so the scale is legible without scrolling back to the chart. */}
        {fivePoint && (
          <LikertLegend
            anchors={anchors}
            className="mb-2 justify-end border-t border-slate-100 pt-3"
          />
        )}
        {participantId && (
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
            Your response
          </p>
        )}
        <ul className="flex flex-col gap-2.5">
          {items.map((item, i) => {
            const r = ratings[i] ?? { avg: null, count: 0, mine: null, dist: [] };
            return (
              <li
                key={i}
                className="rounded-lg border border-slate-200 p-3 flex flex-wrap items-center gap-2"
              >
                <span className="text-sm font-medium min-w-0 flex-1">{item}</span>
                <span className="flex items-center gap-1.5">
                  {Array.from({ length: scale }, (_, s) => s + 1).map((v) => {
                    const color = fivePoint
                      ? (LIKERT_COLORS[v - 1] ?? "#4f46e5")
                      : "#4f46e5";
                    const selected = r.mine === v;
                    // Once a rating is chosen, the other buttons go light gray
                    // so the selection stands out; before any choice, all show
                    // their scale color.
                    const muted = r.mine != null && !selected;
                    return (
                      <button
                        key={v}
                        disabled={!participantId || busy}
                        onClick={() => send({ itemIndex: i, rating: v })}
                        title={anchors[v - 1] ?? String(v)}
                        className={`w-8 h-8 rounded-md text-xs font-bold transition ${
                          selected
                            ? "text-white ring-2 ring-offset-1 ring-slate-700 scale-110"
                            : muted
                              ? "bg-slate-100 text-slate-400 border border-slate-200 hover:bg-slate-200"
                              : "text-white hover:opacity-90"
                        } ${participantId ? "" : "cursor-default"}`}
                        style={muted ? undefined : { backgroundColor: color }}
                      >
                        {v}
                      </button>
                    );
                  })}
                </span>
                {!fivePoint && (
                  <span className="text-xs text-slate-500 tabular-nums w-20 text-right">
                    {r.avg !== null ? `avg ${r.avg}` : "—"} ({r.count})
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {fivePoint && (
          <p className="mt-2 text-[11px] text-slate-400">
            1 = {anchors[0]} · {scale} = {anchors[scale - 1]}
          </p>
        )}
        {responderStrip("Scores in", items.length)}
      </div>
    );
  }

  // ---- Moderated comment board (columns) ----
  const { columns = [], entries = [] } = activity;
  return (
    <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-6">
      {featuredHeader("Feedback")}
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
