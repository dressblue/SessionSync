"use client";

import { useState } from "react";
import type { ActivityState, RosterEntry, StatePayload } from "./useSessionState";
import { ActivityPanel } from "./ActivityPanel";
import { LIKERT_ANCHOR_LABELS } from "@/lib/likert";

interface Props {
  sessionId: string;
  authHeaders: Record<string, string>;
  activities: ActivityState[];
  pastActivities: StatePayload["pastActivities"];
  /** Course library files, selectable for Present exhibits. */
  files: StatePayload["files"];
  /** The facilitator's own roster seat — enables participating like a student. */
  myParticipantId?: string;
  roster?: RosterEntry[];
  onChanged: () => void;
}

type Kind =
  | "vote"
  | "likert"
  | "columns"
  | "reveal"
  | "wheel"
  | "whiteboard"
  | "exhibit";
type Sourcing = "facilitator" | "participants";

const KIND_LABEL: Record<string, string> = {
  vote: "Vote",
  likert: "Scoring survey",
  columns: "Comment board",
  reveal: "Reveal",
  wheel: "Wheel",
  whiteboard: "Whiteboard",
  exhibit: "Presented",
};

// Facilitator's activity station: up to two activities run side by side
// (e.g. a reveal plus a comment board about it). Closing saves the content
// for the session record; anything saved can be reopened.
export function ActivityConsole({
  sessionId,
  authHeaders,
  activities,
  pastActivities,
  files,
  myParticipantId,
  roster,
  onChanged,
}: Props) {
  const [kind, setKind] = useState<Kind>("vote");
  const [sourcing, setSourcing] = useState<Sourcing>("facilitator");
  const [prompt, setPrompt] = useState("");
  const [listText, setListText] = useState("");
  const [columns, setColumns] = useState<string[]>(["", ""]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [anchorSet, setAnchorSet] = useState("agreement");
  const [exhibitType, setExhibitType] = useState<"file" | "url" | "text">("file");
  const [exhibitFileId, setExhibitFileId] = useState("");
  const [exhibitUrl, setExhibitUrl] = useState("");
  const [exhibitText, setExhibitText] = useState("");

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
    } else if (kind === "exhibit") {
      body.exhibit = exhibitType;
      if (exhibitType === "file") body.fileId = exhibitFileId;
      else if (exhibitType === "url") body.url = exhibitUrl;
      else body.text = exhibitText;
    } else if (
      (kind === "vote" || kind === "likert") &&
      sourcing === "participants"
    ) {
      body.sourcing = "participants";
    } else if (kind === "vote") {
      body.options = list;
    } else if (kind !== "whiteboard") {
      body.items = list;
    }
    if (kind === "likert") body.anchorSet = anchorSet;
    const ok = await call(`/api/sessions/${sessionId}/activities`, "POST", body);
    if (ok) {
      setPrompt("");
      setListText("");
      setColumns(["", ""]);
      setExhibitUrl("");
      setExhibitText("");
    }
  }

  const segBtn = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-xs font-semibold transition ${
      active
        ? "bg-white text-indigo-700 shadow-sm"
        : "text-slate-500 hover:text-slate-700"
    }`;

  const liveCard = (activity: ActivityState) => (
    <section
      key={activity.id}
      className="bg-white rounded-xl border border-slate-200 shadow-sm p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="font-semibold">
          Live activity{" "}
          <span className="text-xs font-normal text-slate-400">
            — participants see this now
          </span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {activity.kind !== "whiteboard" &&
            activity.kind !== "exhibit" &&
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
            activity.kind !== "exhibit" &&
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
            title="Content is kept for the session record and can be reopened"
            className="rounded-lg border border-rose-300 text-rose-700 px-3 py-1.5 text-xs font-medium hover:bg-rose-50 disabled:opacity-40"
          >
            Save & close
          </button>
        </div>
      </div>
      <ActivityPanel
        activity={activity}
        sessionId={sessionId}
        participantId={myParticipantId}
        moderationHeaders={authHeaders}
        roster={roster}
        onChanged={onChanged}
      />
    </section>
  );

  return (
    <>
      {activities.map(liveCard)}
      {activities.length > 0 && (
        <p className="text-xs text-slate-400 -my-3 px-1">
          You participate like a student — vote, comment, rate, draw. ★ chips
          feature words large in the header; − hides an entry; ↻ converts
          content into a new vote or scoring survey. Save & close keeps
          everything for the session report.
        </p>
      )}

      {activities.length < 2 && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold mb-1">
            {activities.length === 0 ? "Push an activity" : "Add a second activity"}
          </h2>
          {activities.length === 1 && (
            <p className="text-xs text-slate-500 mb-3">
              Runs alongside the live activity — participants see both, side by
              side on wide screens.
            </p>
          )}
          <div className="flex flex-wrap gap-1 bg-slate-100 rounded-lg p-1 mb-3 mt-2 w-fit">
            {(
              [
                ["vote", "Vote"],
                ["likert", "Scoring survey"],
                ["columns", "Comment board"],
                ["reveal", "Reveal"],
                ["wheel", "Wheel"],
                ["whiteboard", "Whiteboard"],
                ["exhibit", "Present"],
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

          {kind === "likert" && (
            <label className="flex items-center gap-2 text-xs text-slate-500 mb-3">
              Response scale:
              <select
                value={anchorSet}
                onChange={(e) => setAnchorSet(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white"
              >
                {Object.entries(LIKERT_ANCHOR_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
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
                          : kind === "exhibit"
                            ? "Heading, e.g. This week's handout"
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
                  grid. Click entries to feature them; − hides them.
                </p>
              </div>
            ) : kind === "exhibit" ? (
              <div className="flex flex-col gap-2">
                <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
                  {(
                    [
                      ["file", "Course file"],
                      ["url", "Web link"],
                      ["text", "Text excerpt"],
                    ] as const
                  ).map(([t, label]) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setExhibitType(t)}
                      className={segBtn(exhibitType === t)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {exhibitType === "file" ? (
                  files.length > 0 ? (
                    <select
                      value={exhibitFileId}
                      onChange={(e) => setExhibitFileId(e.target.value)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                    >
                      <option value="">Choose a file from the course library…</option>
                      {files.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.title} ({f.filename})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-xs text-slate-400">
                      No files in the course library yet — upload PDFs, images,
                      or documents from the course page first. Images and PDFs
                      display inline; Word/Excel offer a download.
                    </p>
                  )
                ) : exhibitType === "url" ? (
                  <input
                    value={exhibitUrl}
                    onChange={(e) => setExhibitUrl(e.target.value)}
                    placeholder="https://…"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                ) : (
                  <textarea
                    value={exhibitText}
                    onChange={(e) => setExhibitText(e.target.value)}
                    rows={6}
                    placeholder={"The excerpt to present (Markdown supported)\n\n> Quote or passage participants should read together"}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                )}
              </div>
            ) : kind === "whiteboard" ? null : (kind === "vote" ||
                kind === "likert") &&
              sourcing === "participants" ? (
              <p className="text-[11px] text-slate-400">
                Participants will suggest the{" "}
                {kind === "vote" ? "options" : "items"} first. Hide off-topic
                suggestions, then open the{" "}
                {kind === "vote" ? "vote" : "1–5 scoring"} when the list is
                ready.
              </p>
            ) : (
              <textarea
                value={listText}
                onChange={(e) => setListText(e.target.value)}
                rows={4}
                placeholder={
                  kind === "vote"
                    ? "One option per line (2–8)\nChocolate\nVanilla"
                    : kind === "likert"
                      ? "One item to score per line (1–12)"
                      : "One item per line — note after a |\nSelf-Awareness | How well do I know myself?"
                }
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
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
      )}

      {pastActivities.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            className="w-full flex items-center justify-between text-left"
          >
            <h2 className="font-semibold">
              Saved activities{" "}
              <span className="text-xs font-normal text-slate-400">
                — {pastActivities.length} kept for the session report
              </span>
            </h2>
            <span className="text-slate-400 text-sm">
              {historyOpen ? "▾" : "▸"}
            </span>
          </button>
          {historyOpen && (
            <ul className="mt-3 flex flex-col gap-1.5">
              {pastActivities.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <span className="text-[10px] font-bold uppercase text-indigo-500 shrink-0">
                    {KIND_LABEL[a.kind] ?? a.kind}
                  </span>
                  <span className="min-w-0 truncate">{a.prompt}</span>
                  <span className="text-xs text-slate-400 shrink-0">
                    {a.responseCount} response{a.responseCount === 1 ? "" : "s"}
                  </span>
                  <button
                    onClick={() =>
                      call(
                        `/api/sessions/${sessionId}/activities/${a.id}`,
                        "PATCH",
                        { reopen: true }
                      )
                    }
                    disabled={busy || activities.length >= 2}
                    title={
                      activities.length >= 2
                        ? "Two activities are already live"
                        : "Bring this back for participants, content intact"
                    }
                    className="ml-auto shrink-0 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                  >
                    Reopen
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && activities.length === 2 && (
            <p className="mt-2 text-sm text-red-600">{error}</p>
          )}
        </section>
      )}
    </>
  );
}
