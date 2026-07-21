"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSessionState } from "@/components/useSessionState";
import { Markdown } from "@/components/Markdown";

interface Identity {
  participantId: string;
  name: string;
}

function ParticipantView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [checked, setChecked] = useState(false);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

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

  const { state, error } = useSessionState(id, {
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

  const { session, steps } = state;
  const current = steps[session.currentStep];
  const resumeUrl = origin
    ? `${origin}/s/${id}?p=${identity.participantId}`
    : "";

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => setAgendaOpen((v) => !v)}
          className="lg:hidden rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600"
        >
          Agenda
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
        </div>
      </header>

      {error && (
        <div className="bg-amber-50 text-amber-800 text-xs px-4 py-1.5 border-b border-amber-200">
          Reconnecting… ({error})
        </div>
      )}

      <div className="flex-1 flex min-h-0 relative">
        {/* Agenda sidebar */}
        <aside
          className={`${
            agendaOpen ? "absolute inset-y-0 left-0 z-20 shadow-xl" : "hidden"
          } lg:static lg:flex lg:flex-col w-64 shrink-0 bg-white border-r border-slate-200 overflow-y-auto`}
        >
          <p className="px-4 pt-4 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Agenda
          </p>
          <ol className="flex-1">
            {steps.map((s, i) => {
              const isCurrent = session.status === "live" && i === session.currentStep;
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
                    /* clipboard unavailable; the URL is visible below */
                  }
                }}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                {copied ? "Copied!" : "Copy my personal link"}
              </button>
            </div>
          )}
        </aside>
        {agendaOpen && (
          <div
            className="absolute inset-0 z-10 bg-slate-900/20 lg:hidden"
            onClick={() => setAgendaOpen(false)}
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

          {session.status === "live" && current && (
            <div className="max-w-3xl mx-auto px-6 py-10">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 mb-1">
                Step {session.currentStep + 1} of {steps.length}
              </p>
              <h2 className="text-2xl font-bold mb-4">{current.title}</h2>
              <Markdown>{current.content}</Markdown>
            </div>
          )}

          {session.status === "live" && !current && (
            <div className="h-full flex items-center justify-center text-slate-500">
              The facilitator hasn&apos;t added any agenda steps yet.
            </div>
          )}

          {session.status === "ended" && (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 py-16">
              <h2 className="text-xl font-semibold">Session ended</h2>
              <p className="text-slate-500 mt-1">
                Thanks for participating{identity.name ? `, ${identity.name}` : ""}.
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
