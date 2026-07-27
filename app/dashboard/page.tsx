"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";

interface CourseSummary {
  id: string;
  title: string;
  description: string;
  code: string;
  sessionCount: number;
  facilitatorCount: number;
  isTemplate: boolean;
  templateId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  cohortLabel: string;
}

function cohortPill(c: CourseSummary): { label: string; cls: string } | null {
  if (c.isTemplate)
    return { label: "Template", cls: "bg-violet-100 text-violet-700" };
  if (!c.startsAt && !c.endsAt) return null;
  const now = Date.now();
  if (c.startsAt && new Date(c.startsAt).getTime() > now)
    return { label: "Upcoming", cls: "bg-amber-100 text-amber-700" };
  if (c.endsAt && new Date(c.endsAt).getTime() < now)
    return { label: "Ended", cls: "bg-slate-100 text-slate-500" };
  return { label: "Active", cls: "bg-emerald-100 text-emerald-700" };
}

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useUser();
  const [isAdmin, setIsAdmin] = useState(false);
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The /dashboard route is protected by the Clerk proxy, so anyone here is
  // already signed in — the browser sends the session cookie automatically.
  const loadCourses = useCallback(async () => {
    const res = await fetch("/api/courses", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setCourses(data.courses);
    } else {
      setError("Could not load courses");
    }
  }, []);

  useEffect(() => {
    loadCourses();
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setIsAdmin(!!d?.isAdmin))
      .catch(() => {});
  }, [loadCourses]);

  async function createCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    if (!joinCode.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/courses/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  return (
    <div className="flex-1 min-h-screen">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
            Facilitator portal
          </p>
          <h1 className="text-xl font-bold">My courses</h1>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {isAdmin && (
            <button
              onClick={() => router.push("/admin")}
              className="rounded-lg border border-indigo-300 text-indigo-700 px-3 py-1.5 text-xs font-semibold hover:bg-indigo-50 transition"
            >
              Admin
            </button>
          )}
          <span className="text-sm text-slate-500">
            {user?.firstName ?? user?.username ?? ""}
          </span>
          <UserButton />
        </div>
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
              <div className="flex items-baseline gap-2">
                <h2 className="font-semibold text-lg">{c.title}</h2>
                {(() => {
                  const p = cohortPill(c);
                  return p ? (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${p.cls}`}
                    >
                      {p.label}
                    </span>
                  ) : null;
                })()}
                <span className="ml-auto font-mono text-xs text-slate-400">
                  {c.code}
                </span>
              </div>
              {c.cohortLabel && (
                <p className="mt-0.5 text-xs font-medium text-slate-500">
                  {c.cohortLabel}
                </p>
              )}
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
