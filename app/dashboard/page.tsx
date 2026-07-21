"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  facilitatorHeaders,
  loadFacilitatorIdentity,
  saveFacilitatorIdentity,
  type FacilitatorIdentity,
} from "@/components/identity";

interface CourseSummary {
  id: string;
  title: string;
  description: string;
  code: string;
  sessionCount: number;
  facilitatorCount: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [identity, setIdentity] = useState<FacilitatorIdentity | null>(null);
  const [checked, setChecked] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIdentity(loadFacilitatorIdentity());
    setChecked(true);
  }, []);

  const loadCourses = useCallback(async (who: FacilitatorIdentity) => {
    const res = await fetch("/api/courses", {
      headers: facilitatorHeaders(who),
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      setCourses(data.courses);
    } else {
      setError("Could not load courses");
    }
  }, []);

  useEffect(() => {
    if (identity) loadCourses(identity);
  }, [identity, loadCourses]);

  async function createIdentity(e: React.FormEvent) {
    e.preventDefault();
    if (!nameDraft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/facilitators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create identity");
      saveFacilitatorIdentity(data);
      setIdentity(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create identity");
    } finally {
      setBusy(false);
    }
  }

  async function createCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!identity || !newTitle.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...facilitatorHeaders(identity),
        },
        body: JSON.stringify({ title: newTitle, description: newDesc }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create course");
      router.push(`/course/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create course");
      setBusy(false);
    }
  }

  async function joinCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!identity || !joinCode.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/courses/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...facilitatorHeaders(identity),
        },
        body: JSON.stringify({ code: joinCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not join course");
      router.push(`/course/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join course");
      setBusy(false);
    }
  }

  if (!checked) return null;

  if (!identity) {
    return (
      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <form
          onSubmit={createIdentity}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 w-full max-w-sm flex flex-col gap-4"
        >
          <div className="text-center">
            <h1 className="text-2xl font-bold">Facilitator portal</h1>
            <p className="text-sm text-slate-500 mt-1">
              Enter your name to set up this device. Your courses and sessions
              will be tied to this identity.
            </p>
          </div>
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder="Your name"
            maxLength={120}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={busy || !nameDraft.trim()}
            className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 transition"
          >
            {busy ? "Setting up…" : "Continue"}
          </button>
          {error && <p className="text-sm text-red-600 text-center">{error}</p>}
        </form>
      </main>
    );
  }

  return (
    <div className="flex-1 min-h-screen">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
            Facilitator portal
          </p>
          <h1 className="text-xl font-bold">My courses</h1>
        </div>
        <span className="ml-auto text-sm text-slate-500">{identity.name}</span>
      </header>

      {error && (
        <div className="bg-amber-50 text-amber-800 text-sm px-6 py-2 border-b border-amber-200">
          {error}
        </div>
      )}

      <div className="max-w-5xl mx-auto px-6 py-6 grid gap-6 lg:grid-cols-3 items-start">
        <div className="lg:col-span-2 flex flex-col gap-4">
          {courses === null && (
            <p className="text-slate-500 text-sm">Loading courses…</p>
          )}
          {courses?.map((c) => (
            <button
              key={c.id}
              onClick={() => router.push(`/course/${c.id}`)}
              className="text-left bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:border-indigo-300 transition"
            >
              <div className="flex items-baseline gap-3">
                <h2 className="font-semibold text-lg">{c.title}</h2>
                <span className="ml-auto font-mono text-xs text-slate-400">
                  {c.code}
                </span>
              </div>
              {c.description && (
                <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                  {c.description}
                </p>
              )}
              <p className="text-xs text-slate-400 mt-2">
                {c.sessionCount} session{c.sessionCount === 1 ? "" : "s"} ·{" "}
                {c.facilitatorCount} facilitator
                {c.facilitatorCount === 1 ? "" : "s"}
              </p>
            </button>
          ))}
          {courses?.length === 0 && (
            <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400 text-sm">
              No courses yet — create one, or join a colleague&apos;s course
              with its course code.
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <form
            onSubmit={createCourse}
            className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-2"
          >
            <h2 className="font-semibold">Create a course</h2>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Course title"
              maxLength={200}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              rows={3}
              placeholder="Short description (optional)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={busy || !newTitle.trim()}
              className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 transition"
            >
              Create course
            </button>
          </form>

          <form
            onSubmit={joinCourse}
            className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-2"
          >
            <h2 className="font-semibold">Join a course team</h2>
            <p className="text-xs text-slate-500">
              Enter the stable course code another facilitator shared with you.
            </p>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Course code"
              maxLength={8}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={busy || !joinCode.trim()}
              className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm font-medium hover:bg-slate-900 disabled:opacity-40 transition"
            >
              Join course
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
