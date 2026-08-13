"use client";

import { useEffect, useState } from "react";
import type { ActivityState, RosterEntry } from "./useSessionState";
import { LikertLegend } from "./LikertChart";
import { LIKERT_COLORS } from "@/lib/likert";

type Secrets = NonNullable<ActivityState["secrets"]>;
type Door = Secrets["doors"][number];

interface Props {
  secrets: Secrets;
  canModerate: boolean;
  participantId?: string;
  roster?: RosterEntry[];
  /** Projector mode — wall only, larger, no controls. */
  present?: boolean;
  /** Report mode — static, facilitator detail. */
  readOnly?: boolean;
  /** Author submits/replaces their one secret. */
  onSubmit?: (text: string) => void;
  /** The active reader opens an available door. */
  onSelectDoor?: (doorId: string) => void;
  /** A participant rates the door in the open familiarity round. */
  onScore?: (doorId: string, score: number) => void;
  /** Facilitator flow control (PATCH secrets action). */
  onManage?: (body: Record<string, unknown>) => void;
}

// A wall of anonymous "doors", each hiding one member's secret. During collect
// everyone submits; during selection the facilitator names a reader who opens a
// door — its text shows only to that reader (author hidden) and the facilitator,
// who then seals it. The wall (door states) is shared with the whole room.
export function SecretsWall({
  secrets,
  canModerate,
  participantId,
  roster,
  present = false,
  readOnly = false,
  onSubmit,
  onSelectDoor,
  onScore,
  onManage,
}: Props) {
  const { phase, doors } = secrets;
  const canSubmit = (!!participantId || canModerate) && !readOnly && !present;
  const readers = (roster ?? []).filter((r) => !r.isFacilitator);
  // Resolve the active reader's name from the roster (every viewer has it) so
  // the turn banner names them even if that reader hasn't submitted a secret.
  const activeReaderName =
    (secrets.activeReaderId &&
      roster?.find((r) => r.id === secrets.activeReaderId)?.name) ||
    secrets.activeReaderName ||
    null;

  if (phase === "collect") {
    return (
      <CollectPhase
        secrets={secrets}
        canModerate={canModerate}
        canSubmit={canSubmit}
        present={present}
        onSubmit={onSubmit}
        onManage={onManage}
      />
    );
  }

  // ---- Selection phase ----
  const myOpenDoor = doors.find(
    (d) => d.status === "opened" && d.text && !canModerate
  );
  // The facilitator follows along on every open door in full (with the author).
  const openDoors = doors.filter((d) => d.status === "opened" && d.text);
  // Tally of who has read (opened or sealed doors carry the reader's name);
  // and, from the roster, who hasn't had a turn yet.
  const readNames = Array.from(
    new Set(
      doors
        .filter((d) => d.status !== "available" && d.readerName)
        .map((d) => d.readerName as string)
    )
  );
  const readSet = new Set(readNames.map((n) => n.toLowerCase()));
  const notYet = readers
    .map((r) => r.name)
    .filter((n) => !readSet.has(n.toLowerCase()));
  const sealedCount = doors.filter((d) => d.status === "sealed").length;

  return (
    <div className="flex flex-col gap-4">
      {/* Turn banner */}
      {!present && !readOnly && (
        <TurnBanner
          secrets={secrets}
          activeReaderName={activeReaderName}
          myOpenIndex={myOpenDoor?.index ?? null}
          canModerate={canModerate}
          readers={readers}
          readSet={readSet}
          onManage={onManage}
        />
      )}

      {/* Familiarity scoring round (when the facilitator has opened one). */}
      {secrets.scoringDoorId && !readOnly && (
        <ScorePanel
          secrets={secrets}
          canModerate={canModerate}
          present={present}
          canRate={!!participantId && !canModerate}
          onScore={onScore}
          onManage={onManage}
        />
      )}

      {/* Facilitator tally: who has read, who's still waiting, wall progress. */}
      {canModerate && !present && !readOnly && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold uppercase tracking-wide text-slate-500">
              Read so far ({readNames.length}/{doors.length}):
            </span>
            {readNames.length ? (
              readNames.map((n) => (
                <span
                  key={n}
                  className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700"
                >
                  ✓ {n}
                </span>
              ))
            ) : (
              <span className="text-slate-400">no one yet</span>
            )}
          </div>
          {notYet.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold uppercase tracking-wide text-slate-500">
                Not yet:
              </span>
              {notYet.map((n) => (
                <span
                  key={n}
                  className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-600"
                >
                  {n}
                </span>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-[11px] text-slate-400">
            {sealedCount} of {doors.length} door
            {doors.length === 1 ? "" : "s"} sealed.
          </p>
        </div>
      )}

      {/* Facilitator follows along on every open door — full text + author. */}
      {canModerate &&
        openDoors.map((d) => (
          <div
            key={d.id}
            className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4"
          >
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
              Door #{d.index} · now being read
              {d.readerName ? ` by ${d.readerName}` : ""}
              {d.author ? ` · written by ${d.author}` : ""}
            </p>
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-900">
              {d.text}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {secrets.scoreEnabled && secrets.scoringDoorId !== d.id && (
                <button
                  onClick={() => onManage?.({ action: "score", secretId: d.id })}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                >
                  Score familiarity
                </button>
              )}
              <button
                onClick={() => onManage?.({ action: "seal", secretId: d.id })}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
              >
                Mark revealed 🔒
              </button>
            </div>
          </div>
        ))}

      {/* The reader's private secret to perform */}
      {myOpenDoor && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
            Your door · read this to yourself
          </p>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-900">
            {myOpenDoor.text}
          </p>
          <p className="mt-2 text-xs text-amber-700">
            Now tell it to the group as if it were your own secret — you don’t
            know who wrote it, and neither should they.
          </p>
        </div>
      )}

      {/* The wall */}
      <div
        className={`grid gap-3 ${
          present
            ? "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5"
            : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4"
        }`}
      >
        {doors.map((d) => (
          <DoorCell
            key={d.id}
            door={d}
            present={present}
            canModerate={canModerate}
            readers={readers}
            readSet={readSet}
            onSelectDoor={onSelectDoor}
            onManage={onManage}
          />
        ))}
        {doors.length === 0 && (
          <p className="col-span-full text-sm text-slate-400">
            No secrets were submitted.
          </p>
        )}
      </div>

      {/* Facilitator: return an open pick to the wall, or reclose submissions */}
      {canModerate && !present && !readOnly && (
        <div className="flex flex-wrap items-center gap-4">
          {openDoors.length > 0 && (
            <button
              onClick={() => onManage?.({ action: "returnPick" })}
              className="text-xs font-medium text-amber-700 underline hover:text-amber-900"
              title="Send the opened door back to the wall (unread), reshuffle the wall, and let the same reader pick a different one"
            >
              ↩ Return their pick &amp; reshuffle (let them choose again)
            </button>
          )}
          <button
            onClick={() => onManage?.({ action: "phase", value: "collect" })}
            className="text-xs text-slate-400 underline hover:text-slate-600"
          >
            Reopen submissions
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- Collect phase ----------
function CollectPhase({
  secrets,
  canModerate,
  canSubmit,
  present,
  onSubmit,
  onManage,
}: {
  secrets: Secrets;
  canModerate: boolean;
  canSubmit: boolean;
  present: boolean;
  onSubmit?: (text: string) => void;
  onManage?: (body: Record<string, unknown>) => void;
}) {
  const [draft, setDraft] = useState(secrets.myText ?? "");
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setDraft(secrets.myText ?? "");
  }, [secrets.myText, dirty]);

  if (present) {
    return (
      <div className="rounded-xl border border-slate-300 bg-slate-50 p-8 text-center">
        <p className="text-5xl">🧱</p>
        <p className="mt-3 text-2xl font-semibold text-slate-800">
          {secrets.submittedCount} secret
          {secrets.submittedCount === 1 ? "" : "s"} sealed behind the wall
        </p>
        <p className="mt-1 text-slate-500">Waiting for everyone to submit…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {canSubmit && (
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Your secret {secrets.mySubmitted && "· submitted ✓"}
          </label>
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setDirty(true);
            }}
            rows={3}
            maxLength={800}
            placeholder="Write a secret in a sentence or two. It's anonymous — only the facilitator can see who wrote it."
            className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="mt-1 flex items-center gap-3">
            <button
              onClick={() => {
                onSubmit?.(draft.trim());
                setDirty(false);
              }}
              disabled={!dirty}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              {secrets.mySubmitted ? "Update" : "Submit"} secret
            </button>
            {secrets.mySubmitted && (
              <button
                onClick={() => {
                  onSubmit?.("");
                  setDraft("");
                  setDirty(false);
                }}
                className="text-xs text-slate-400 underline hover:text-rose-600"
              >
                Withdraw
              </button>
            )}
            <span className="text-[11px] text-slate-400">
              {secrets.submittedCount} submitted so far
            </span>
          </div>
        </div>
      )}

      {!canSubmit && (
        <p className="text-sm text-slate-500">
          {secrets.mySubmitted
            ? "Your secret is in. Waiting for the facilitator to open the wall."
            : "Waiting for the facilitator to open the wall."}
        </p>
      )}

      {/* Facilitator: private list + open the wall */}
      {canModerate && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Submitted secrets · only you can see these
          </p>
          {secrets.doors.length === 0 ? (
            <p className="text-xs text-slate-400">No secrets yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {secrets.doors.map((d) => (
                <li key={d.id} className="text-sm">
                  <span className="mr-1 inline-block rounded bg-slate-200 px-1.5 text-xs font-semibold text-slate-600">
                    {d.index}
                  </span>
                  <span className="text-slate-800">{d.text}</span>
                  <span className="text-xs text-slate-400"> — {d.author}</span>
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={() => onManage?.({ action: "phase", value: "select" })}
            disabled={secrets.submittedCount < 1}
            className="mt-3 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-40"
          >
            Open the wall →
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- Turn banner + reader picker (facilitator) ----------
function TurnBanner({
  secrets,
  activeReaderName,
  myOpenIndex,
  canModerate,
  readers,
  readSet,
  onManage,
}: {
  secrets: Secrets;
  activeReaderName: string | null;
  myOpenIndex: number | null;
  canModerate: boolean;
  readers: RosterEntry[];
  readSet: Set<string>;
  onManage?: (body: Record<string, unknown>) => void;
}) {
  const pickedIndex = secrets.activeReaderDoorIndex;
  if (canModerate) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
          Whose turn:
        </span>
        <select
          value={secrets.activeReaderId ?? ""}
          onChange={(e) =>
            onManage?.({ action: "setReader", participantId: e.target.value || null })
          }
          className="rounded-lg border border-indigo-300 bg-white px-2 py-1 text-sm"
        >
          <option value="">— no one —</option>
          {readers.map((r) => {
            const done = readSet.has(r.name.toLowerCase());
            return (
              <option key={r.id} value={r.id}>
                {done ? "✓ " : "• "}
                {r.name}
                {done ? " (read)" : " — not yet"}
                {r.online ? "" : " · offline"}
              </option>
            );
          })}
        </select>
        {activeReaderName && (
          <span className="text-sm text-indigo-700">
            {pickedIndex != null
              ? `${activeReaderName} has selected Door ${pickedIndex}`
              : `${activeReaderName} is choosing…`}
          </span>
        )}
      </div>
    );
  }

  // Participant view of whose turn it is. It's-your-turn-to-pick glows rose;
  // once they've selected (or it isn't their turn) it returns to the calm blue.
  const myTurnToPick = secrets.iAmActiveReader && myOpenIndex == null;
  return (
    <div
      className={`rounded-xl p-3 text-sm ${
        myTurnToPick
          ? "border-2 border-rose-400 bg-rose-50 text-rose-800 ring-2 ring-rose-200"
          : "border border-indigo-200 bg-indigo-50 text-indigo-800"
      }`}
    >
      {secrets.iAmActiveReader ? (
        myOpenIndex != null ? (
          <strong>You have selected Door {myOpenIndex} — read it below.</strong>
        ) : (
          <strong>Your turn — pick a door on the wall (not your own).</strong>
        )
      ) : activeReaderName ? (
        <>
          <strong>{activeReaderName}</strong>{" "}
          {pickedIndex != null
            ? `has selected Door ${pickedIndex}.`
            : "is choosing a door…"}
        </>
      ) : (
        "Watch the wall — the facilitator will name who picks next."
      )}
    </div>
  );
}

// ---------- One door on the wall ----------
function DoorCell({
  door,
  present,
  canModerate,
  readers,
  readSet,
  onSelectDoor,
  onManage,
}: {
  door: Door;
  present: boolean;
  canModerate: boolean;
  readers: RosterEntry[];
  readSet: Set<string>;
  onSelectDoor?: (doorId: string) => void;
  onManage?: (body: Record<string, unknown>) => void;
}) {
  const base =
    "relative rounded-lg border p-3 flex flex-col items-center justify-center text-center min-h-[92px] transition";
  const sealed = door.status === "sealed";
  const opened = door.status === "opened";

  const tone = sealed
    ? "border-slate-700 bg-slate-800 text-slate-300"
    : opened
      ? "border-amber-400 bg-amber-50 text-amber-800"
      : door.selectableByMe
        ? "border-indigo-400 bg-white text-slate-700 ring-2 ring-indigo-300 cursor-pointer hover:bg-indigo-50"
        : "border-slate-300 bg-gradient-to-b from-slate-100 to-slate-200 text-slate-600";

  const clickable = door.selectableByMe && !present && !canModerate;

  return (
    <div
      className={`${base} ${tone}`}
      onClick={clickable ? () => onSelectDoor?.(door.id) : undefined}
      role={clickable ? "button" : undefined}
    >
      {/* Door face */}
      <span className={present ? "text-3xl" : "text-2xl"}>
        {sealed ? "🔒" : opened ? "🔓" : "🚪"}
      </span>
      <span className={`mt-1 font-semibold ${present ? "text-lg" : "text-sm"}`}>
        #{door.index}
      </span>

      {door.mine && (
        <span className="mt-0.5 rounded-full bg-white/80 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-600 ring-1 ring-indigo-200">
          your secret
        </span>
      )}
      {(opened || sealed) && door.readerName && (
        <span className="mt-0.5 text-[10px] leading-tight">
          {sealed ? "read by " : "reading: "}
          {door.readerName}
        </span>
      )}
      {door.selectableByMe && !canModerate && (
        <span className="mt-0.5 text-[10px] font-medium text-indigo-600">
          tap to open
        </span>
      )}

      {/* Facilitator: author/text peek + per-door controls */}
      {canModerate && !present && (
        <div className="mt-2 w-full border-t border-white/30 pt-2">
          {door.text && (
            <p className="mb-1 line-clamp-3 text-left text-[11px] text-slate-500">
              “{door.text}” — {door.author}
            </p>
          )}
          {door.status === "available" && (
            <div className="flex flex-col gap-1">
              <select
                value=""
                onChange={(e) =>
                  onManage?.({
                    action: "push",
                    secretId: door.id,
                    participantId: e.target.value || null,
                  })
                }
                className="rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px] text-slate-700"
                title="Force this door to be the only option for a reader"
              >
                <option value="">
                  {door.pushedToName ? `pushed → ${door.pushedToName}` : "Push to…"}
                </option>
                {door.pushedToName && <option value="">— clear push —</option>}
                {readers.map((r) => {
                  const done = readSet.has(r.name.toLowerCase());
                  return (
                    <option key={r.id} value={r.id}>
                      {done ? "✓ " : "• "}
                      {r.name}
                      {done ? " (read)" : " — not yet"}
                    </option>
                  );
                })}
              </select>
              <button
                onClick={() => onManage?.({ action: "open", secretId: door.id })}
                className="rounded bg-slate-700 px-1.5 py-0.5 text-[11px] font-medium text-white hover:bg-slate-600"
              >
                I’ll read it
              </button>
            </div>
          )}
          {door.status === "opened" && (
            <button
              onClick={() => onManage?.({ action: "seal", secretId: door.id })}
              className="w-full rounded bg-rose-600 px-1.5 py-0.5 text-[11px] font-semibold text-white hover:bg-rose-500"
            >
              Mark revealed 🔒
            </button>
          )}
          {door.status === "sealed" && (
            <button
              onClick={() => onManage?.({ action: "reset", secretId: door.id })}
              className="w-full rounded border border-slate-500 px-1.5 py-0.5 text-[11px] text-slate-300 hover:bg-slate-700"
            >
              Reopen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Familiarity scoring round ----------
function ScorePanel({
  secrets,
  canModerate,
  present,
  canRate,
  onScore,
  onManage,
}: {
  secrets: Secrets;
  canModerate: boolean;
  present: boolean;
  canRate: boolean;
  onScore?: (doorId: string, score: number) => void;
  onManage?: (body: Record<string, unknown>) => void;
}) {
  const doorId = secrets.scoringDoorId!;
  const anchors = secrets.scoreAnchors;
  const summary =
    secrets.scoreAvg != null
      ? `${secrets.scoreAvg.toFixed(1)} avg · ${secrets.scoreCount} rated`
      : "no ratings yet";

  // Facilitator: individual scores + summary + reveal-to-continue.
  if (canModerate) {
    return (
      <div className="rounded-xl border-2 border-indigo-300 bg-indigo-50 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
            Familiarity scores · Door {secrets.scoringDoorIndex}
          </p>
          <span className="text-sm font-semibold text-indigo-800">{summary}</span>
        </div>
        {anchors.length === 5 && <LikertLegend anchors={anchors} className="mb-2" />}
        {secrets.scores.length === 0 ? (
          <p className="text-xs text-slate-500">Waiting for ratings…</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {secrets.scores
              .slice()
              .sort((a, b) => b.score - a.score)
              .map((s, i) => (
                <li
                  key={`${s.name}-${i}`}
                  className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-700 ring-1 ring-indigo-200"
                >
                  {s.name}: <span className="font-semibold">{s.score}</span>
                </li>
              ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => onManage?.({ action: "stopScore" })}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white"
          >
            Stop scoring
          </button>
          <button
            onClick={() => onManage?.({ action: "seal", secretId: doorId })}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
          >
            Reveal &amp; continue 🔒
          </button>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          Individual scores are visible only to you; participants see just the
          average.
        </p>
      </div>
    );
  }

  // Projector: summary only.
  if (present) {
    return (
      <div className="rounded-xl border-2 border-indigo-300 bg-indigo-50 p-6 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">
          How familiar is this story?
        </p>
        <p className="mt-1 text-3xl font-bold text-indigo-800">{summary}</p>
      </div>
    );
  }

  // Participant: rate + see only the summary — styled like the Scoring tool.
  const scale = anchors.length || 5;
  const fivePoint = scale === 5;
  return (
    <div className="rounded-xl border-2 border-indigo-300 bg-indigo-50 p-4">
      <p className="mb-2 text-sm font-semibold text-indigo-800">
        How familiar is this story to you?
      </p>
      {fivePoint && <LikertLegend anchors={anchors} className="mb-3" />}
      {canRate && (
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Your response
        </p>
      )}
      {canRate ? (
        <div className="flex items-center gap-1.5">
          {Array.from({ length: scale }, (_, s) => s + 1).map((v) => {
            const color = fivePoint ? (LIKERT_COLORS[v - 1] ?? "#4f46e5") : "#4f46e5";
            const selected = secrets.myScore === v;
            const muted = secrets.myScore != null && !selected;
            return (
              <button
                key={v}
                onClick={() => onScore?.(doorId, v)}
                title={anchors[v - 1] ?? String(v)}
                className={`h-9 w-9 rounded-md text-sm font-bold transition ${
                  selected
                    ? "text-white ring-2 ring-slate-700 ring-offset-1 scale-110"
                    : muted
                      ? "border border-slate-200 bg-slate-100 text-slate-400 hover:bg-slate-200"
                      : "text-white hover:opacity-90"
                }`}
                style={muted ? undefined : { backgroundColor: color }}
              >
                {v}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-slate-500">Rating in progress…</p>
      )}
      {fivePoint && (
        <p className="mt-2 text-[11px] text-slate-400">
          1 = {anchors[0]} · {scale} = {anchors[scale - 1]}
        </p>
      )}
      <p className="mt-1 text-xs text-indigo-700">
        {secrets.myScore ? "Your rating is in. " : ""}
        Group average: <span className="font-semibold">{summary}</span>
      </p>
    </div>
  );
}
