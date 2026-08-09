"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useSessionState } from "@/components/useSessionState";
import { ActivityPanel } from "@/components/ActivityPanel";
import { Markdown } from "@/components/Markdown";
import { SpotlightBanner, SpotlightCard } from "@/components/SpotlightMessage";

// Read-only projector view. The facilitator shares THIS window in Zoom/Teams
// while driving from the console in another. No identity, no inputs, no side
// panel — it just mirrors what participants see, large and clean. `publicView`
// forces the participant-facing state even when the facilitator is signed in,
// so moderation never lands on the shared screen.
function Presenter() {
  const { id } = useParams<{ id: string }>();
  const { state, error } = useSessionState(id, {
    publicView: true,
    intervalMs: 2000,
  });
  const [fs, setFs] = useState(false);
  const epochRef = useRef<number | null>(null);

  // Follow the facilitator's push-refresh.
  useEffect(() => {
    if (!state?.session) return;
    const e = state.session.refreshEpoch;
    if (epochRef.current === null) epochRef.current = e;
    else if (e > epochRef.current) window.location.reload();
  }, [state]);

  // Text-size control (from the console): scale the ROOT font-size so every
  // rem-based size on the projector grows/shrinks, without touching px/vector
  // art (whiteboard) or the % layout. Zoom (below) is the scale-everything lever.
  const textScale = state?.session?.presenterTextScale ?? 1;
  useEffect(() => {
    const root = document.documentElement;
    root.style.fontSize = `${16 * textScale}px`;
    return () => {
      root.style.fontSize = "";
    };
  }, [textScale]);

  useEffect(() => {
    const onChange = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // A distinctive tab/window title so it's obvious which window to screen-share.
  useEffect(() => {
    const prev = document.title;
    document.title = "▶ SHARE THIS — SessionSync Presenter";
    return () => {
      document.title = prev;
    };
  }, []);

  const centered = (node: React.ReactNode) => (
    <div className="min-h-screen flex items-center justify-center bg-white text-center px-10">
      {node}
    </div>
  );

  if (!state || !state.session) {
    return centered(
      <p className="text-2xl text-slate-400">{error ?? "Connecting…"}</p>
    );
  }

  const { session, steps, activities, spotlight } = state;
  const current = steps[session.currentStep];

  const showStep =
    session.status === "live" && steps.length > 0 && session.currentStep >= 0;
  const brandBar = (
    // One tight line: session name on the left, current step name on the right.
    <header className="shrink-0 flex items-center gap-4 px-8 py-3 border-b border-slate-100">
      <div className="min-w-0 flex items-baseline gap-2">
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-widest text-indigo-500">
          SessionSync
        </span>
        <h1 className="min-w-0 truncate text-lg font-bold text-slate-800">
          {session.title}
        </h1>
      </div>
      <div className="ml-auto flex min-w-0 items-baseline gap-3">
        {showStep && current && (
          <p className="min-w-0 truncate text-lg font-semibold uppercase tracking-wide text-indigo-500 text-right">
            {current.title}
          </p>
        )}
        {showStep && (
          <span className="shrink-0 text-sm font-medium text-slate-400">
            {session.currentStep + 1} / {steps.length}
          </span>
        )}
        <button
          onClick={() =>
            fs
              ? document.exitFullscreen()
              : document.documentElement.requestFullscreen?.()
          }
          title={fs ? "Exit full screen" : "Full screen"}
          className="shrink-0 self-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
        >
          {fs ? "Exit full screen" : "⤢ Full screen"}
        </button>
      </div>
    </header>
  );

  let body: React.ReactNode;
  if (spotlight && spotlight.style === "card") {
    // A presented message takes over the projector until the facilitator clears it.
    body = (
      <div className="flex-1 flex items-center justify-center py-12">
        <SpotlightCard spotlight={spotlight} present />
      </div>
    );
  } else if (session.status === "lobby") {
    body = (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-10">
        <div className="w-4 h-4 rounded-full bg-indigo-500 animate-pulse mb-6" />
        <h2 className="text-4xl font-bold text-slate-800">Starting soon</h2>
        <p className="text-xl text-slate-400 mt-3">{session.title}</p>
      </div>
    );
  } else if (session.status === "ended") {
    body = (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-10">
        <h2 className="text-4xl font-bold text-slate-800">Session ended</h2>
        <p className="text-xl text-slate-400 mt-3">Thanks for joining.</p>
      </div>
    );
  } else if (activities.length > 0) {
    // Live activity/activities — the room watches these fill in. Uses ~90% of the
    // width and stretches tall so a single tool fills the projector: the grid
    // grows to fill the column and each panel fills its cell.
    const single = activities.length === 1;
    body = (
      // Step name now lives in the header, so the tool starts right at the top.
      // px-8 matches the header, so the tool's left border lines up with the
      // session name and its right border with the Full-screen button.
      <div className="flex-1 flex flex-col overflow-y-auto w-full px-8 py-6">
        <div
          className={`grid flex-1 min-h-[72vh] gap-8 items-stretch [&>*]:min-w-0 [&>*]:flex [&>*]:flex-col [&>*>*]:flex-1 ${single ? "" : "xl:grid-cols-2"}`}
        >
          {activities.map((a) => (
            <ActivityPanel
              key={a.id}
              activity={a}
              sessionId={id}
              roster={state.participants}
              presentation
              onChanged={() => {}}
            />
          ))}
        </div>
      </div>
    );
  } else if (current) {
    // The current "slide" — step title + content, large for across-the-room.
    body = (
      <div className="flex-1 overflow-y-auto w-[90%] max-w-[2000px] mx-auto px-6 py-12">
        <h2 className="text-5xl font-bold text-slate-900 mb-8 leading-tight">
          {current.title}
        </h2>
        <div className="prose prose-2xl max-w-none prose-slate">
          <Markdown>{current.content}</Markdown>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-10">
        <div className="w-4 h-4 rounded-full bg-indigo-500 animate-pulse mb-6" />
        <h2 className="text-3xl font-bold text-slate-800">One moment…</h2>
        <p className="text-lg text-slate-400 mt-3">
          The facilitator will bring up the next thing shortly.
        </p>
      </div>
    );
  }

  // Zoom control (from the console): scale the WHOLE projector uniformly —
  // text, shapes, whiteboard, charts — via CSS zoom. Independent of textScale.
  const zoomScale = session.presenterZoomScale ?? 1;
  return (
    <div
      className="min-h-screen flex flex-col bg-white"
      style={zoomScale !== 1 ? { zoom: zoomScale } : undefined}
    >
      {brandBar}
      {spotlight && spotlight.style === "banner" && (
        <SpotlightBanner spotlight={spotlight} />
      )}
      {body}
    </div>
  );
}

export default function PresenterPage() {
  return (
    <Suspense>
      <Presenter />
    </Suspense>
  );
}
