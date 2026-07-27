"use client";

import { useState } from "react";
import type {
  ActivityState,
  RosterEntry,
  StatePayload,
  WorkflowGraph,
} from "./useSessionState";
import { ActivityPanel } from "./ActivityPanel";
import { WorkflowBuilder } from "./WorkflowBuilder";
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
  myParticipantName?: string;
  roster?: RosterEntry[];
  onChanged: () => void;
}

type Kind =
  | "vote"
  | "quiz"
  | "likert"
  | "columns"
  | "reveal"
  | "wheel"
  | "workflow"
  | "whiteboard"
  | "exhibit"
  | "video"
  | "timer"
  | "wordcloud"
  | "sort";
type Sourcing = "facilitator" | "participants";

const KIND_LABEL: Record<string, string> = {
  vote: "Vote",
  quiz: "Quiz",
  likert: "Scoring survey",
  columns: "Comment board",
  reveal: "Reveal",
  wheel: "Network",
  workflow: "Workflow",
  whiteboard: "Whiteboard",
  exhibit: "Presented",
  video: "Video",
  timer: "Timer",
  wordcloud: "Word cloud",
  sort: "Word sort",
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
  myParticipantName,
  roster,
  onChanged,
}: Props) {
  const [kind, setKind] = useState<Kind>("vote");
  const [sourcing, setSourcing] = useState<Sourcing>("facilitator");
  const [prompt, setPrompt] = useState("");
  const [listText, setListText] = useState("");
  const [graph, setGraph] = useState<WorkflowGraph | null>(null);
  const [columns, setColumns] = useState<string[]>(["", ""]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [anchorSet, setAnchorSet] = useState("agreement");
  const [exhibitType, setExhibitType] = useState<"file" | "url" | "text">("file");
  const [exhibitFileId, setExhibitFileId] = useState("");
  const [exhibitUrl, setExhibitUrl] = useState("");
  const [videoSource, setVideoSource] = useState<"url" | "file">("url");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoFileId, setVideoFileId] = useState("");
  const [timerMin, setTimerMin] = useState(5);
  const [exhibitText, setExhibitText] = useState("");
  const [correctIndex, setCorrectIndex] = useState(0);

  // Live-parsed answer lines for the quiz builder (mark-correct radios).
  const quizOptions = listText
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

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
    } else if (kind === "video") {
      if (videoSource === "file") body.fileId = videoFileId;
      else body.url = videoUrl;
    } else if (kind === "timer") {
      body.minutes = timerMin;
    } else if (kind === "quiz") {
      body.options = list;
      body.correctIndex = Math.min(correctIndex, Math.max(0, list.length - 1));
    } else if (kind === "workflow") {
      body.graph = graph;
      if (!prompt.trim()) {
        const start =
          graph?.nodes.find((n) => n.id === graph.startId) ?? graph?.nodes[0];
        body.prompt = start?.title || "Workflow";
      }
    } else if (
      (kind === "vote" || kind === "likert") &&
      sourcing === "participants"
    ) {
      body.sourcing = "participants";
    } else if (kind === "vote") {
      body.options = list;
    } else if (kind === "sort") {
      body.words = list;
      body.columns = columns.map((c) => c.trim()).filter(Boolean);
    } else if (kind !== "whiteboard") {
      body.items = list;
    }
    if (kind === "likert") body.anchorSet = anchorSet;
    const ok = await call(`/api/sessions/${sessionId}/activities`, "POST", body);
    if (ok) {
      setPrompt("");
      setListText("");
      setGraph(null);
      setColumns(["", ""]);
      setExhibitUrl("");
      setExhibitText("");
      setVideoUrl("");
      setCorrectIndex(0);
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
            activity.kind !== "video" &&
            activity.kind !== "timer" &&
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
        participantName={myParticipantName}
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
                ["quiz", "Quiz"],
                ["likert", "Scoring survey"],
                ["columns", "Comment board"],
                ["reveal", "Reveal"],
                ["wheel", "Network"],
                ["workflow", "Workflow"],
                ["whiteboard", "Whiteboard"],
                ["exhibit", "Present"],
                ["video", "Video"],
                ["timer", "Timer"],
                ["wordcloud", "Word cloud"],
                ["sort", "Word sort"],
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
                  : kind === "quiz"
                    ? "Quiz question, e.g. Which trait is about handling feelings?"
                  : kind === "likert"
                    ? "Prompt, e.g. Rate how strongly each applies to you"
                    : kind === "reveal"
                      ? "Heading, e.g. The 5 Traits of the 24:7 Dad"
                      : kind === "wheel"
                        ? "Heading, e.g. How the 5 Traits connect"
                        : kind === "workflow"
                          ? "Workflow name, e.g. Repair Conversation"
                        : kind === "whiteboard"
                          ? "Prompt, e.g. Sketch your support network"
                          : kind === "exhibit"
                            ? "Heading, e.g. This week's handout"
                            : kind === "video"
                              ? "Video title (optional)"
                              : kind === "timer"
                                ? "Label (optional), e.g. Small-group discussion"
                                : kind === "wordcloud"
                                  ? "Question, e.g. One word for a great dad"
                                  : "Prompt, e.g. Answer both questions below"
              }
              maxLength={300}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />

            {kind === "sort" ? (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-500">
                  Words to sort (one per line)
                </label>
                <textarea
                  value={listText}
                  onChange={(e) => setListText(e.target.value)}
                  rows={5}
                  placeholder={"One word or phrase per line"}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <label className="text-xs font-semibold text-slate-500 mt-1">
                  Columns (2–4)
                </label>
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
                      maxLength={120}
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {columns.length > 2 && (
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
                  Participants drag each word into a column — a word can go in
                  more than one.
                </p>
              </div>
            ) : kind === "columns" ? (
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
            ) : kind === "timer" ? (
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  Countdown length:
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={timerMin}
                    onChange={(e) =>
                      setTimerMin(Math.max(1, Number(e.target.value) || 1))
                    }
                    className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  minutes
                </label>
                <div className="flex gap-1.5">
                  {[1, 2, 5, 10, 15].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTimerMin(m)}
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                        timerMin === m
                          ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                          : "border-slate-300 text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400">
                  A big countdown shows on every screen; your Start / Pause /
                  Reset / +1 min drive it. You can start it now or later.
                </p>
              </div>
            ) : kind === "video" ? (
              <div className="flex flex-col gap-2">
                <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
                  {(
                    [
                      ["url", "YouTube / web link"],
                      ["file", "Course video file"],
                    ] as const
                  ).map(([t, label]) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setVideoSource(t)}
                      className={segBtn(videoSource === t)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {videoSource === "url" ? (
                  <input
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://youtube.com/watch?v=…  or a direct .mp4 URL"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                ) : files.filter((f) => f.filename.match(/\.(mp4|webm|mov|m4v)$/i)).length > 0 ? (
                  <select
                    value={videoFileId}
                    onChange={(e) => setVideoFileId(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    <option value="">Choose a video from the course library…</option>
                    {files
                      .filter((f) => f.filename.match(/\.(mp4|webm|mov|m4v)$/i))
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.title} ({f.filename})
                        </option>
                      ))}
                  </select>
                ) : (
                  <p className="text-xs text-slate-400">
                    No video files in the course library — upload one from the
                    course page, or paste a YouTube/direct link instead.
                  </p>
                )}
                <p className="text-[11px] text-slate-400">
                  Everyone gets the player; your Play / Pause / Restart drives
                  all screens in sync. Participants tap once to start watching.
                </p>
              </div>
            ) : kind === "quiz" ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={listText}
                  onChange={(e) => setListText(e.target.value)}
                  rows={4}
                  placeholder={"One answer per line (2–8)\nSelf-Awareness\nCaring for Self\nFathering Skills"}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {quizOptions.length >= 2 ? (
                  <div className="flex flex-col gap-1 rounded-lg bg-slate-50 border border-slate-200 p-2.5">
                    <p className="text-[11px] font-medium text-slate-500 mb-0.5">
                      Mark the correct answer:
                    </p>
                    {quizOptions.map((opt, i) => (
                      <label
                        key={i}
                        className="flex items-center gap-2 text-sm cursor-pointer"
                      >
                        <input
                          type="radio"
                          name="quiz-correct"
                          checked={correctIndex === i}
                          onChange={() => setCorrectIndex(i)}
                          className="accent-green-600"
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    Add at least two answers, then mark the correct one. It stays
                    hidden from participants until you reveal it.
                  </p>
                )}
              </div>
            ) : kind === "wordcloud" ? (
              <p className="text-[11px] text-slate-400">
                Participants submit words; each renders sized by how often
                it&apos;s submitted. Click a word to hide it.
              </p>
            ) : kind === "workflow" ? (
              <WorkflowBuilder value={graph} onChange={setGraph} height={360} />
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
              disabled={
                busy ||
                (kind === "video"
                  ? videoSource === "url"
                    ? !videoUrl.trim()
                    : !videoFileId
                  : kind === "timer"
                    ? false
                    : kind === "quiz"
                      ? !prompt.trim() || quizOptions.length < 2
                      : kind === "workflow"
                        ? (graph?.nodes.length ?? 0) < 2
                        : !prompt.trim())
              }
              className="self-start rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 transition"
            >
              {kind === "video"
                ? "Start video for all"
                : kind === "timer"
                  ? "Show timer"
                  : "Push to participants"}
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
