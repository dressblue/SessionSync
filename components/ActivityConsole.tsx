"use client";

import { useState } from "react";
import type { ActivityState } from "./useSessionState";
import { ActivityPanel } from "./ActivityPanel";

interface Props {
  sessionId: string;
  authHeaders: Record<string, string>;
  activity: ActivityState | null;
  /** The facilitator's own roster seat — enables participating like a student. */
  myParticipantId?: string;
  onChanged: () => void;
}

type Kind = "vote" | "likert" | "columns" | "reveal" | "wheel" | "whiteboard";
type Sourcing = "facilitator" | "participants";

const LIST_KINDS: Kind[] = ["vote", "likert", "reveal", "wheel"];

// Facilitator's activity station: build & push a population vote, a scoring
// survey (likert), or a moderated comment board; watch live results; for
// participant-sourced surveys, advance from collecting to voting/rating.
export function ActivityConsole({
  sessionId,
  authHeaders,
  activity,
  myParticipantId,
  onChanged,
}: Props) {
  const [kind, setKind] = useState<Kind>("vote");
  const [sourcing, setSourcing] = useState<Sourcing>("facilitator");
  const [prompt, setPrompt] = useState("");
  const [listText, setListText] = useState("");
  const [columns, setColumns] = useState<string[]>(["", ""]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(path: string, method: string, body?: unknown) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      onChanged();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function push(e: React.FormEvent) {
    e.preventDefault();
    const list = listText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const body: Record<string, unknown> = { kind, prompt };
    if (kind === "columns") {
      body.columns = columns.map((c) => c.trim()).filter(Boolean);
    } else if (
      (kind === "vote" || kind === "likert") &&
      sourcing === "participants"
    ) {
      body.sourcing = "participants";
    } else if (kind === "vote") {
      body.options = list;
    } else if (LIST_KINDS.includes(kind)) {
      body.items = list;
    }
    const ok = await call(`/api/sessions/${sessionId}/activities`, "POST", body);
    if (ok) {
      setPrompt("");
      setListText("");
      setColumns(["", ""]);
    }
  }

  if (activity) {
    return (
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-semibold">
            Live activity{" "}
            <span className="text-xs font-normal text-slate-400">
              — participants see this now
            </span>
          </h2>
          <div className="flex items-center gap-2">
            {activity.kind !== "whiteboard" &&
              !(activity.kind === "vote" && activity.phase !== "collect") && (
                <button
                  onClick={() =>
                    call(`/api/sessions/${sessionId}/activities`, "POST", {
                      kind: "vote",
                      prompt: activity.prompt,
                      fromActivityId: activity.id,
                    })
                  }
                  disabled={busy}
                  title="Turn this activity's content into vote options"
                  className="rounded-lg border border-indigo-300 text-indigo-700 px-3 py-1.5 text-xs font-medium hover:bg-indigo-50 disabled:opacity-40"
                >
                  ↻ To vote
                </button>
              )}
            {activity.kind !== "whiteboard" &&
              !(activity.kind === "likert" && activity.phase !== "collect") && (
                <button
                  onClick={() =>
                    call(`/api/sessions/${sessionId}/activities`, "POST", {
                      kind: "likert",
                      prompt: activity.prompt,
                      fromActivityId: activity.id,
                    })
                  }
                  disabled={busy}
                  title="Turn this activity's content into items to score 1–5"
                  className="rounded-lg border border-indigo-300 text-indigo-700 px-3 py-1.5 text-xs font-medium hover:bg-indigo-50 disabled:opacity-40"
                >
                  ↻ To scoring
                </button>
              )}
            {activity.phase === "collect" && (
              <button
                onClick={() =>
                  call(
                    `/api/sessions/${sessionId}/activities/${activity.id}`,
                    "PATCH",
                    { advance: true }
                  )
                }
                disabled={busy}
                className="rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40"
              >
                {activity.kind === "vote" ? "Open the vote" : "Start scoring"}
              </button>
            )}
            <button
              onClick={() =>
                call(
                  `/api/sessions/${sessionId}/activities/${activity.id}`,
                  "PATCH",
                  { status: "closed" }
                )
              }
              disabled={busy}
              className="rounded-lg border border-rose-300 text-rose-700 px-3 py-1.5 text-xs font-medium hover:bg-rose-50 disabled:opacity-40"
            >
              Close activity
            </button>
          </div>
        </div>
        <ActivityPanel
          activity={activity}
          sessionId={sessionId}
          participantId={myParticipantId}
          moderationHeaders={authHeaders}
          onChanged={onChanged}
        />
        <p className="mt-2 text-xs text-slate-400">
          You participate like a student — vote, comment, rate, draw.
          Moderation: ✓ highlights an entry for everyone; − hides it from
          participants (struck through for you; ↺ restores it). ↻ converts
          this activity&apos;s content into a new vote or scoring survey.
        </p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </section>
    );
  }

  const segBtn = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-xs font-semibold transition ${
      active
        ? "bg-white text-indigo-700 shadow-sm"
        : "text-slate-500 hover:text-slate-700"
    }`;

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h2 className="font-semibold mb-3">Push an activity</h2>
      <div className="flex flex-wrap gap-1 bg-slate-100 rounded-lg p-1 mb-3 w-fit">
        {(
          [
            ["vote", "Vote"],
            ["likert", "Scoring survey"],
            ["columns", "Comment board"],
            ["reveal", "Reveal"],
            ["wheel", "Wheel"],
            ["whiteboard", "Whiteboard"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={segBtn(kind === k)}
          >
            {label}
          </button>
        ))}
      </div>

      {(kind === "vote" || kind === "likert") && (
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-3 w-fit">
          {(
            [
              ["facilitator", "I provide the choices"],
              ["participants", "Participants suggest first"],
            ] as const
          ).map(([s, label]) => (
            <button
              key={s}
              type="button"
              onClick={() => setSourcing(s)}
              className={segBtn(sourcing === s)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={push} className="flex flex-col gap-2">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            kind === "vote"
              ? "Question, e.g. Which risk concerns you most?"
              : kind === "likert"
                ? "Prompt, e.g. Rate how strongly each applies to you"
                : kind === "reveal"
                  ? "Heading, e.g. The 5 Traits of the 24:7 Dad"
                  : kind === "wheel"
                    ? "Heading, e.g. How the 5 Traits connect"
                    : kind === "whiteboard"
                      ? "Prompt, e.g. Sketch your support network"
                      : "Prompt, e.g. Answer both questions below"
          }
          maxLength={300}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        {kind === "columns" ? (
          <div className="flex flex-col gap-1.5">
            {columns.map((c, i) => (
              <div key={i} className="flex gap-1.5">
                <input
                  value={c}
                  onChange={(e) =>
                    setColumns((cols) =>
                      cols.map((v, j) => (j === i ? e.target.value : v))
                    )
                  }
                  placeholder={`Column ${i + 1} title (e.g. a question)`}
                  maxLength={120}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {columns.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setColumns((cols) => cols.filter((_, j) => j !== i))
                    }
                    className="rounded-lg border border-slate-200 px-2.5 text-xs text-slate-400 hover:text-rose-500 hover:border-rose-200"
                    aria-label={`Remove column ${i + 1}`}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {columns.length < 4 && (
              <button
                type="button"
                onClick={() => setColumns((cols) => [...cols, ""])}
                className="self-start rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50"
              >
                + Add column ({columns.length}/4)
              </button>
            )}
            <p className="text-[11px] text-slate-400">
              1–3 columns show as a stack of titled cells; 4 shows as a 2×2
              grid. You can highlight (✓) or hide entries as they arrive.
            </p>
          </div>
        ) : kind === "whiteboard" ? (
          <p className="text-[11px] text-slate-400">
            Opens a shared drawing canvas. Everyone gets a pen (colors, two
            widths, undo); you also get Clear all.
          </p>
        ) : kind === "reveal" || kind === "wheel" ? (
          <textarea
            value={listText}
            onChange={(e) => setListText(e.target.value)}
            rows={5}
            placeholder={
              "One item per line — add a note after a | \nSelf-Awareness | How well do I know myself?\nCaring for Self | How well do I care for myself?"
            }
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        ) : sourcing === "facilitator" ? (
          <textarea
            value={listText}
            onChange={(e) => setListText(e.target.value)}
            rows={4}
            placeholder={
              kind === "vote"
                ? "One option per line (2–8)\nChocolate\nVanilla"
                : "One item to score per line (1–12)"
            }
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        ) : (
          <p className="text-[11px] text-slate-400">
            Participants will suggest the{" "}
            {kind === "vote" ? "options" : "items"} first. You can hide
            off-topic suggestions, then open the{" "}
            {kind === "vote" ? "vote" : "1–5 scoring"} when the list is ready.
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !prompt.trim()}
          className="self-start rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 transition"
        >
          Push to participants
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </section>
  );
}
