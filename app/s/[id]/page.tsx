"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSessionState } from "@/components/useSessionState";
import { Markdown } from "@/components/Markdown";
import { NotesPad } from "@/components/NotesPad";
import { ActivityPanel } from "@/components/ActivityPanel";

interface Identity {
  participantId: string;
  name: string;
}

type SideTab = "agenda" | "notes" | "materials" | "downloads";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ParticipantView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [checked, setChecked] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [sideTab, setSideTab] = useState<SideTab>("agenda");
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  const refreshEpochRef = useRef<number | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    // A personal resume link (?p=participantId) lets the same participant
    // continue from any device; it wins over whatever this device has stored.
    const p = searchParams.get("p");
    if (p) {
      setIdentity({ participantId: p, name: "" });
      setChecked(true);
      return;
    }
    const raw = localStorage.getItem(`ss_participant_${id}`);
    if (raw) {
      try {
        setIdentity(JSON.parse(raw));
      } catch {
        localStorage.removeItem(`ss_participant_${id}`);
      }
    }
    setChecked(true);
  }, [id, searchParams]);

  useEffect(() => {
    if (checked && !identity) router.replace("/join");
  }, [checked, identity, router]);

  const { state, error, refresh } = useSessionState(id, {
    participantId: identity?.participantId,
  });

  // Once state arrives, resolve the display name from the roster and persist
  // the identity on this device (covers the resume-link path).
  useEffect(() => {
    if (!state || !identity) return;
    const me = state.participants.find((p) => p.id === identity.participantId);
    if (me && me.name !== identity.name) {
      const next = { participantId: identity.participantId, name: me.name };
      setIdentity(next);
      localStorage.setItem(`ss_participant_${id}`, JSON.stringify(next));
    }
  }, [state, identity, id]);

  // Facilitator-pushed refresh: hard-reload when the epoch increases.
  useEffect(() => {
    if (!state) return;
    const epoch = state.session.refreshEpoch;
    if (refreshEpochRef.current === null) {
      refreshEpochRef.current = epoch;
    } else if (epoch > refreshEpochRef.current) {
      window.location.reload();
    }
  }, [state]);

  const onlineCount = useMemo(
    () => state?.participants.filter((p) => p.online).length ?? 0,
    [state]
  );

  if (!checked || !identity) return null;

  if (!state) {
    return (
      <main className="flex-1 flex items-center justify-center text-slate-500">
        {error ?? "Connecting…"}
      </main>
    );
  }

  const { session, steps, activity, materials, files } = state;
  const current = steps[session.currentStep];
  const resumeUrl = origin
    ? `${origin}/s/${id}?p=${identity.participantId}`
    : "";

  const tabBtn = (tab: SideTab, label: string) => (
    <button
      onClick={() => setSideTab(tab)}
      className={`flex-1 rounded-md px-1 py-1.5 text-[11px] font-semibold transition ${
        sideTab === tab
          ? "bg-white text-indigo-700 shadow-sm"
          : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => setSideOpen((v) => !v)}
          className="lg:hidden rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600"
        >
          Panel
        </button>
        <div className="min-w-0">
          <h1 className="font-semibold truncate">{session.title}</h1>
          <p className="text-xs text-slate-500">
            {session.status === "live" && steps.length > 0
              ? `Step ${session.currentStep + 1} of ${steps.length}`
              : session.status === "lobby"
                ? "Waiting to start"
                : session.status === "ended"
                  ? "Session ended"
                  : ""}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {onlineCount} online
          </span>
          {identity.name && (
            <span className="hidden sm:inline text-slate-400">
              you: {identity.name}
            </span>
          )}
          <button
            onClick={() => window.location.reload()}
            title="Refresh my screen"
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            ↻ Refresh
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-amber-50 text-amber-800 text-xs px-4 py-1.5 border-b border-amber-200">
          Reconnecting… ({error})
        </div>
      )}

      <div className="flex-1 flex min-h-0 relative">
        {/* Side panel: tabbed agenda / notes (footprint shared, more tabs later) */}
        <aside
          className={`${
            sideOpen ? "absolute inset-y-0 left-0 z-20 shadow-xl" : "hidden"
          } lg:static lg:flex flex-col w-80 shrink-0 bg-white border-r border-slate-200`}
        >
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 m-3 mb-2">
            {tabBtn("agenda", "Agenda")}
            {tabBtn("notes", "Notes")}
            {tabBtn("materials", "Materials")}
            {tabBtn("downloads", "Downloads")}
          </div>

          <div
            className={`flex-1 min-h-0 flex-col overflow-y-auto ${
              sideTab === "agenda" ? "flex" : "hidden"
            }`}
          >
            <ol className="flex-1">
              {steps.map((s, i) => {
                const isCurrent =
                  session.status === "live" && i === session.currentStep;
                const isPast = session.status === "live" && i < session.currentStep;
                return (
                  <li
                    key={s.id}
                    className={`px-4 py-2.5 text-sm border-l-2 ${
                      isCurrent
                        ? "border-indigo-600 bg-indigo-50 text-indigo-900 font-medium"
                        : isPast
                          ? "border-transparent text-slate-400"
                          : "border-transparent text-slate-600"
                    }`}
                  >
                    <span className="mr-2 text-xs text-slate-400">{i + 1}</span>
                    {s.title}
                  </li>
                );
              })}
              {steps.length === 0 && (
                <li className="px-4 py-2.5 text-sm text-slate-400">
                  No agenda yet
                </li>
              )}
            </ol>
            {resumeUrl && (
              <div className="border-t border-slate-100 p-4">
                <p className="text-xs text-slate-400 mb-1.5">
                  Moving to another device?
                </p>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(resumeUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    } catch {
                      /* clipboard unavailable; nothing to fall back to */
                    }
                  }}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  {copied ? "Copied!" : "Copy my personal link"}
                </button>
              </div>
            )}
          </div>

          <div
            className={`flex-1 min-h-0 ${sideTab === "notes" ? "block" : "hidden"}`}
          >
            <NotesPad
              sessionId={id}
              participantId={identity.participantId}
              sessionTitle={session.title}
            />
          </div>

          <div
            className={`flex-1 min-h-0 overflow-y-auto px-3 pb-3 ${
              sideTab === "materials" ? "block" : "hidden"
            }`}
          >
            <p className="text-xs text-slate-400 mb-2">
              What you&apos;ll need for this course and session.
            </p>
            <ul className="flex flex-col gap-2">
              {materials.map((m) => (
                <li
                  key={m.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <p className="text-sm font-medium flex items-start gap-1.5">
                    <span className="text-indigo-500 mt-0.5">•</span>
                    <span>
                      {m.title}
                      {!m.courseWide && (
                        <span className="ml-1.5 text-[10px] uppercase font-semibold text-slate-400">
                          this session
                        </span>
                      )}
                    </span>
                  </p>
                  {m.note && (
                    <p className="text-xs text-slate-500 mt-0.5 pl-4">{m.note}</p>
                  )}
                </li>
              ))}
              {materials.length === 0 && (
                <li className="text-sm text-slate-400">
                  Nothing listed yet — your facilitator will add needed items
                  here.
                </li>
              )}
            </ul>
          </div>

          <div
            className={`flex-1 min-h-0 overflow-y-auto px-3 pb-3 ${
              sideTab === "downloads" ? "block" : "hidden"
            }`}
          >
            <p className="text-xs text-slate-400 mb-2">
              Files provided by your facilitator.
            </p>
            <ul className="flex flex-col gap-2">
              {files.map((f) => (
                <li
                  key={f.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 flex items-center gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {f.title}
                      {!f.courseWide && (
                        <span className="ml-1.5 text-[10px] uppercase font-semibold text-slate-400">
                          this session
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {f.filename} · {formatSize(f.size)}
                    </p>
                  </div>
                  <a
                    href={`/api/files/${f.id}`}
                    download={f.filename}
                    className="shrink-0 rounded-lg bg-indigo-600 text-white px-2.5 py-1.5 text-xs font-medium hover:bg-indigo-700"
                  >
                    Download
                  </a>
                </li>
              ))}
              {files.length === 0 && (
                <li className="text-sm text-slate-400">
                  No downloads yet — PDFs and checklists your facilitator
                  shares will appear here.
                </li>
              )}
            </ul>
          </div>
        </aside>
        {sideOpen && (
          <div
            className="absolute inset-0 z-10 bg-slate-900/20 lg:hidden"
            onClick={() => setSideOpen(false)}
          />
        )}

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {session.status === "lobby" && (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 py-16">
              <div className="w-3 h-3 rounded-full bg-indigo-500 animate-pulse mb-4" />
              <h2 className="text-xl font-semibold">You&apos;re in</h2>
              <p className="text-slate-500 mt-1 max-w-sm">
                The facilitator hasn&apos;t started the session yet. This screen
                will update automatically.
              </p>
            </div>
          )}

          {session.status !== "lobby" && activity && (
            <div className="max-w-3xl mx-auto px-6 py-10">
              {current && (
                <p className="text-xs text-slate-400 mb-3">
                  Step {session.currentStep + 1}: {current.title}
                </p>
              )}
              <ActivityPanel
                activity={activity}
                sessionId={id}
                participantId={identity.participantId}
                onChanged={refresh}
              />
            </div>
          )}

          {session.status === "live" && !activity && current && (
            <div className="max-w-3xl mx-auto px-6 py-10">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 mb-1">
                Step {session.currentStep + 1} of {steps.length}
              </p>
              <h2 className="text-2xl font-bold mb-4">{current.title}</h2>
              <Markdown>{current.content}</Markdown>
            </div>
          )}

          {session.status === "live" && !activity && !current && (
            <div className="h-full flex items-center justify-center text-slate-500">
              The facilitator hasn&apos;t added any agenda steps yet.
            </div>
          )}

          {session.status === "ended" && !activity && (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 py-16">
              <h2 className="text-xl font-semibold">Session ended</h2>
              <p className="text-slate-500 mt-1">
                Thanks for participating
                {identity.name ? `, ${identity.name}` : ""}.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function ParticipantPage() {
  return (
    <Suspense>
      <ParticipantView />
    </Suspense>
  );
}
