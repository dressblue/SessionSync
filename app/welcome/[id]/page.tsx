"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useSessionState } from "@/components/useSessionState";
import { shareOrigin } from "@/lib/appOrigin";

// A full-screen "arrivals" board the facilitator projects as people join a
// Zoom room or meeting space: a large QR to scan, plus the URL and code typed
// by hand. Public, read-only, no identity — like the presenter view.
function Welcome() {
  const { id } = useParams<{ id: string }>();
  const { state, error } = useSessionState(id, {
    publicView: true,
    intervalMs: 4000,
  });
  const [fs, setFs] = useState(false);

  useEffect(() => {
    const onChange = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // A distinctive tab/window title so it's obvious which window to screen-share.
  useEffect(() => {
    const prev = document.title;
    document.title = "▶ SHARE THIS — SessionSync Join Screen";
    return () => {
      document.title = prev;
    };
  }, []);

  if (!state || !state.session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-center px-10">
        <p className="text-2xl text-slate-400">{error ?? "Connecting…"}</p>
      </div>
    );
  }

  const { session } = state;
  const isCourse = !!session.courseId;
  const keyActive =
    !!session.joinKey &&
    !!session.joinKeyExpires &&
    new Date(session.joinKeyExpires).getTime() > Date.now();
  const code = isCourse ? (keyActive ? session.joinKey : null) : session.code;
  const origin = shareOrigin();
  const joinUrl = origin && code ? `${origin}/join?code=${code}` : "";

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="shrink-0 flex items-center gap-3 px-8 py-4 border-b border-slate-100">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-indigo-500">
            SessionSync
          </p>
          <h1 className="text-lg font-bold truncate text-slate-800">
            {session.title}
          </h1>
        </div>
        <button
          onClick={() =>
            fs
              ? document.exitFullscreen()
              : document.documentElement.requestFullscreen?.()
          }
          className="ml-auto rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
        >
          {fs ? "Exit full screen" : "⤢ Full screen"}
        </button>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-8 py-4 text-center">
        <h2 className="text-3xl font-bold text-slate-900 mb-1">Scan to join</h2>
        <p className="text-lg text-slate-400 mb-5">
          Point your phone camera at the code
        </p>

        {joinUrl ? (
          <>
            <div className="rounded-2xl border border-slate-200 shadow-sm p-5 bg-white">
              <QRCodeSVG value={joinUrl} size={280} level="M" marginSize={2} />
            </div>

            {/* Always-visible manual join: the code sits right under the QR so
                it can't scroll off in a shorter window. */}
            <div className="mt-6 w-full max-w-2xl rounded-2xl bg-slate-50 border border-slate-200 px-6 py-5">
              <p className="text-base text-slate-500">
                Can&apos;t scan? Go to{" "}
                <span className="font-semibold text-slate-700">
                  {origin?.replace(/^https?:\/\//, "")}/join
                </span>
              </p>
              <div className="mt-3 flex items-center justify-center gap-4">
                <span className="text-lg uppercase tracking-wide text-slate-400">
                  {isCourse ? "Key" : "Session ID"}
                </span>
                <span className="font-mono text-4xl tracking-[0.25em] font-bold text-indigo-700 break-all">
                  {code}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-10 py-14 max-w-xl">
            <p className="text-2xl font-semibold text-amber-700">
              No active join code
            </p>
            <p className="text-lg text-amber-600 mt-2">
              {isCourse
                ? "Generate a student key from the facilitator console, then reopen this screen."
                : "This session has no join code."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WelcomePage() {
  return (
    <Suspense>
      <Welcome />
    </Suspense>
  );
}
