"use client";

import { useState } from "react";
import type { ActivityState } from "./useSessionState";
import { ActivityPanel } from "./ActivityPanel";

interface Props {
  sessionId: string;
  facilitatorKey: string;
  activity: ActivityState | null;
  onChanged: () => void;
}

// Facilitator's activity station: build & push a vote or column feedback,
// watch live results, close to return everyone to the agenda step.
export function ActivityConsole({
  sessionId,
  facilitatorKey,
  activity,
  onChanged,
}: Props) {
  const [kind, setKind] = useState<"vote" | "columns">("vote");
  const [prompt, setPrompt] = useState("");
  const [optionsText, setOptionsText] = useState("");
  const [columns, setColumns] = useState<string[]>(["", ""]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(path: string, method: string, body?: unknown) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(path, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-facilitator-key": facilitatorKey,
        },
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
    const body =
      kind === "vote"
        ? {
            kind,
            prompt,
            options: optionsText
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
          }
        : { kind, prompt, columns: columns.map((c) => c.trim()).filter(Boolean) };
    const ok = await call(`/api/sessions/${sessionId}/activities`, "POST", body);
    if (ok) {
      setPrompt("");
      setOptionsText("");
      setColumns(["", ""]);
    }
  }

  if (activity) {
    return (
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-semibold">
            Live activity{" "}
            <span className="text-xs font-normal text-slate-400">
              — participants see this now
            </span>
          </h2>
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
        <ActivityPanel
          activity={activity}
          sessionId={sessionId}
          onChanged={onChanged}
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </section>
    );
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h2 className="font-semibold mb-3">Push an activity</h2>
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-3 w-fit">
        {(
          [
            ["vote", "Vote"],
            ["columns", "Column feedback"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              kind === k
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={push} className="flex flex-col gap-2">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            kind === "vote"
              ? "Question, e.g. Which risk concerns you most?"
              : "Prompt, e.g. One word for each: what worked, what didn't"
          }
          maxLength={300}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        {kind === "vote" ? (
          <textarea
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            rows={4}
            placeholder={"One option per line (2–6)\nOption A\nOption B"}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        ) : (
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
                  placeholder={`Column ${i + 1} title`}
                  maxLength={80}
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
              1–3 columns show as a stack of titled cells; 4 shows as a 2×2 grid.
            </p>
          </div>
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
