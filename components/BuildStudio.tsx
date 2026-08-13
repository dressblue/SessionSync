"use client";

import { useState } from "react";
import type { ActivityState, RosterEntry, Stroke } from "./useSessionState";
import { Whiteboard } from "./Whiteboard";
import { boardToSvg, VIEW_W, VIEW_H } from "@/lib/whiteboard";

type Build = NonNullable<ActivityState["build"]>;

interface Props {
  build: Build;
  canModerate: boolean;
  participantId?: string;
  presentation?: boolean;
  roster?: RosterEntry[];
  onStroke: (el: Record<string, unknown>) => Promise<void>;
  onElement: (el: Record<string, unknown>) => Promise<void>;
  onElementUpdate: (u: Record<string, unknown>) => void;
  onUndo: (entryId: string) => void;
  onClear: () => void;
  onShareToggle: (peerId: string) => void;
  onPresent: (participantId: string | null) => void;
}

// A read-only snapshot of a canvas (a peer's / presented / gallery build).
function CanvasView({
  elements,
  className = "",
}: {
  elements: Stroke[];
  className?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      className={`w-full rounded-lg border border-slate-200 bg-white ${className}`}
      style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
      dangerouslySetInnerHTML={{ __html: boardToSvg(elements) }}
    />
  );
}

// The "Build" tool: each participant constructs privately on their own canvas
// from a themed bucket; the facilitator can present any build to the whole room;
// a builder can share a live read-only view with chosen peers.
export function BuildStudio({
  build,
  canModerate,
  participantId,
  presentation = false,
  roster,
  onStroke,
  onElement,
  onElementUpdate,
  onUndo,
  onClear,
  onShareToggle,
  onPresent,
}: Props) {
  const [enlarged, setEnlarged] = useState<string | null>(null);

  // ---- Projector: only the presented build ----
  if (presentation) {
    const shown = build.watching.find((w) => w.ownerId === build.presentingId);
    return (
      <div>
        {shown ? (
          <>
            <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-indigo-600">
              Presented by {shown.ownerName}
            </p>
            <CanvasView elements={shown.elements} />
          </>
        ) : (
          <div className="rounded-xl border border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
            <p className="text-4xl">🧱</p>
            <p className="mt-2">{build.prompt}</p>
            <p className="mt-1 text-sm">
              Waiting for the facilitator to present a build…
            </p>
          </div>
        )}
      </div>
    );
  }

  const canBuild = !!participantId || canModerate;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
          Build · {build.topicLabel}
        </p>
        <p className="text-sm text-slate-700">{build.prompt}</p>
      </div>

      {/* The builder's own canvas (facilitator builds too) */}
      {canBuild && (
        <Whiteboard
          strokes={build.myElements}
          canDraw
          canModerate={false}
          stampGroups={build.pieces}
          onStroke={onStroke}
          onElement={onElement}
          onElementUpdate={onElementUpdate}
          onUndo={onUndo}
          onClear={onClear}
        />
      )}

      {/* Participant: share with specific peers */}
      {!canModerate && participantId && (
        <SharePicker
          roster={roster}
          participantId={participantId}
          sharedWith={build.sharedWith}
          onShareToggle={onShareToggle}
        />
      )}

      {/* Read-only views the viewer may see (peers who shared + presented) */}
      {build.watching.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {build.watching.map((w) => (
            <div key={w.ownerId ?? "fac"}>
              <p className="mb-1 text-xs font-semibold text-slate-500">
                {w.ownerId === build.presentingId
                  ? `Presented by ${w.ownerName}`
                  : `Live from ${w.ownerName}`}
              </p>
              <CanvasView elements={w.elements} />
            </div>
          ))}
        </div>
      )}

      {/* Facilitator: gallery of every build + present controls */}
      {canModerate && build.gallery && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            All builds ({build.gallery.length})
            {build.presentingId && " · presenting one to the room"}
          </p>
          {build.gallery.length === 0 ? (
            <p className="text-sm text-slate-400">No one has started building yet.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {build.gallery.map((g) => {
                const presenting = build.presentingId === g.ownerId;
                return (
                  <div
                    key={g.ownerId ?? "fac"}
                    className={`rounded-xl border p-2 ${
                      presenting
                        ? "border-rose-400 ring-2 ring-rose-200"
                        : "border-slate-200"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-slate-700">
                        {g.ownerName}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {g.count} piece{g.count === 1 ? "" : "s"}
                      </span>
                    </div>
                    <button
                      onClick={() =>
                        setEnlarged(enlarged === (g.ownerId ?? "fac") ? null : (g.ownerId ?? "fac"))
                      }
                      className="block w-full"
                      title="Click to enlarge"
                    >
                      <CanvasView elements={g.elements} />
                    </button>
                    <button
                      onClick={() => onPresent(presenting ? null : g.ownerId)}
                      className={`mt-1.5 w-full rounded-lg px-2 py-1 text-xs font-semibold ${
                        presenting
                          ? "bg-rose-600 text-white hover:bg-rose-500"
                          : "bg-indigo-600 text-white hover:bg-indigo-500"
                      }`}
                    >
                      {presenting ? "Stop presenting" : "Present to group"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Enlarged gallery view */}
          {enlarged && (
            <div className="mt-3">
              {(() => {
                const g = build.gallery.find(
                  (x) => (x.ownerId ?? "fac") === enlarged
                );
                if (!g) return null;
                return (
                  <>
                    <p className="mb-1 text-xs font-semibold text-slate-500">
                      {g.ownerName}
                    </p>
                    <CanvasView elements={g.elements} />
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SharePicker({
  roster,
  participantId,
  sharedWith,
  onShareToggle,
}: {
  roster?: RosterEntry[];
  participantId: string;
  sharedWith: string[];
  onShareToggle: (peerId: string) => void;
}) {
  const peers = (roster ?? []).filter(
    (r) => !r.isFacilitator && r.id !== participantId
  );
  if (peers.length === 0) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Share my build with…
      </p>
      <div className="flex flex-wrap gap-1.5">
        {peers.map((p) => {
          const on = sharedWith.includes(p.id);
          return (
            <button
              key={p.id}
              onClick={() => onShareToggle(p.id)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                on
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {on ? "✓ " : ""}
              {p.name}
              {p.online ? "" : " (offline)"}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        Chosen peers see your build update live, read-only. Tap again to stop.
      </p>
    </div>
  );
}
