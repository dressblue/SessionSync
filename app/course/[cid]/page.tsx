"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  facilitatorHeaders,
  loadFacilitatorIdentity,
  type FacilitatorIdentity,
} from "@/components/identity";

interface CourseDetail {
  course: { id: string; title: string; description: string; code: string };
  team: { id: string; name: string; role: string }[];
  sessions: {
    id: string;
    title: string;
    position: number;
    status: string;
    joinKey: string | null;
    joinKeyExpires: string | null;
    joinKeyActive: boolean;
  }[];
}

function expiryLabel(expires: string | null): string {
  if (!expires) return "";
  const ms = new Date(expires).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  return hours > 0 ? `expires in ${hours}h ${mins}m` : `expires in ${mins}m`;
}

export default function CoursePage() {
  const { cid } = useParams<{ cid: string }>();
  const router = useRouter();
  const [identity, setIdentity] = useState<FacilitatorIdentity | null>(null);
  const [checked, setChecked] = useState(false);
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [newSession, setNewSession] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setIdentity(loadFacilitatorIdentity());
    setChecked(true);
  }, []);

  const load = useCallback(async () => {
    if (!identity) return;
    const res = await fetch(`/api/courses/${cid}`, {
      headers: facilitatorHeaders(identity),
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not load course");
      return;
    }
    setDetail(data);
  }, [cid, identity]);

  useEffect(() => {
    load();
  }, [load]);

  async function addSession(e: React.FormEvent) {
    e.preventDefault();
    if (!identity || !newSession.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/courses/${cid}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...facilitatorHeaders(identity),
        },
        body: JSON.stringify({ title: newSession }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Could not add session");
      }
      setNewSession("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add session");
    } finally {
      setBusy(false);
    }
  }

  async function generateKey(sessionId: string) {
    if (!identity || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/joinkey`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...facilitatorHeaders(identity),
        },
        body: JSON.stringify({ ttlHours: 24 }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Could not generate key");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate key");
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, tag: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  if (!checked) return null;

  if (!identity) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 text-center">
        <div>
          <h1 className="text-xl font-semibold">Facilitator sign-in needed</h1>
          <p className="text-slate-500 mt-2">
            Set up your facilitator identity first, then open this course.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-4 rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700"
          >
            Go to the portal
          </button>
        </div>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="flex-1 flex items-center justify-center text-slate-500">
        {error ?? "Loading course…"}
      </main>
    );
  }

  const { course, team, sessions } = detail;

  return (
    <div className="flex-1 min-h-screen">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <div className="min-w-0">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            ← My courses
          </button>
          <h1 className="text-xl font-bold truncate">{course.title}</h1>
        </div>
        <span className="ml-auto text-sm text-slate-500">{identity.name}</span>
      </header>

      {error && (
        <div className="bg-amber-50 text-amber-800 text-sm px-6 py-2 border-b border-amber-200">
          {error}
        </div>
      )}

      <div className="max-w-6xl mx-auto px-6 py-6 grid gap-6 lg:grid-cols-3 items-start">
        <div className="lg:col-span-2 flex flex-col gap-6">
          {course.description && (
            <p className="text-sm text-slate-600 bg-white rounded-xl border border-slate-200 shadow-sm p-5 whitespace-pre-line">
              {course.description}
            </p>
          )}

          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold mb-3">Sessions</h2>
            <ol className="flex flex-col gap-2">
              {sessions.map((s, i) => (
                <li
                  key={s.id}
                  className="rounded-lg border border-slate-200 p-3 flex flex-wrap items-center gap-2"
                >
                  <span className="text-xs text-slate-400 w-5 text-right shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium min-w-0 truncate">
                    {s.title}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      s.status === "live"
                        ? "bg-emerald-100 text-emerald-700"
                        : s.status === "ended"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {s.status}
                  </span>
                  <div className="ml-auto flex items-center gap-2 shrink-0">
                    {s.joinKeyActive ? (
                      <span className="text-xs text-slate-500">
                        key{" "}
                        <button
                          onClick={() => copy(s.joinKey!, `k${s.id}`)}
                          className="font-mono font-semibold text-indigo-700 hover:underline"
                          title="Copy student key"
                        >
                          {copied === `k${s.id}` ? "copied!" : s.joinKey}
                        </button>{" "}
                        <span className="text-slate-400">
                          ({expiryLabel(s.joinKeyExpires)})
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">
                        no active student key
                      </span>
                    )}
                    <button
                      onClick={() => generateKey(s.id)}
                      disabled={busy}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                      {s.joinKeyActive ? "Rotate key" : "Generate 24h key"}
                    </button>
                    <button
                      onClick={() => router.push(`/facilitate/${s.id}`)}
                      className="rounded-md bg-indigo-600 text-white px-2.5 py-1 text-xs font-medium hover:bg-indigo-700"
                    >
                      Open console
                    </button>
                  </div>
                </li>
              ))}
              {sessions.length === 0 && (
                <li className="text-sm text-slate-400">No sessions yet</li>
              )}
            </ol>

            <form
              onSubmit={addSession}
              className="mt-4 border-t border-slate-100 pt-4 flex gap-2"
            >
              <input
                value={newSession}
                onChange={(e) => setNewSession(e.target.value)}
                placeholder="New session title, e.g. Session 1: The 5 Traits"
                maxLength={200}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={busy || !newSession.trim()}
                className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm font-medium hover:bg-slate-900 disabled:opacity-40 transition"
              >
                Add session
              </button>
            </form>
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold mb-1">Course code</h2>
            <p className="text-xs text-slate-500 mb-3">
              Stable key for this course. Share it with co-facilitators so they
              can join the team, tailor content, and lead sessions. Students
              never need it — they use per-session 24-hour keys.
            </p>
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-center mb-3">
              <span className="font-mono text-xl tracking-[0.25em] font-semibold">
                {course.code}
              </span>
            </div>
            <button
              onClick={() => copy(course.code, "course")}
              className="w-full rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm font-medium hover:bg-indigo-700 transition"
            >
              {copied === "course" ? "Copied!" : "Copy course code"}
            </button>
          </section>

          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold mb-3">Facilitator team</h2>
            <ul className="flex flex-col gap-1.5">
              {team.map((f) => (
                <li key={f.id} className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-indigo-400" />
                  {f.name}
                  {f.role === "owner" && (
                    <span className="text-[10px] uppercase font-semibold text-slate-400">
                      owner
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
