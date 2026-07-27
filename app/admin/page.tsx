"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { upload } from "@vercel/blob/client";
import { shareOrigin } from "@/lib/appOrigin";

interface FacilitatorRow {
  id: string;
  name: string;
  email: string | null;
  isAdmin: boolean;
  pending: boolean;
  courses: { id: string; title: string; role: string }[];
}
interface CourseRow {
  id: string;
  title: string;
  code: string;
  sessionCount: number;
  facilitatorCount: number;
  owner: string | null;
  isTemplate: boolean;
  templateId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  cohortLabel: string;
}
interface StudentRow {
  id: string;
  name: string;
  email: string | null;
  token: string;
}

type Tab = "people" | "courses" | "students" | "library";

interface LibTool {
  id: string;
  name: string;
  description: string;
  category: string;
  kind: string;
  prompt: string;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "…";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return "…";
  }
}

// A cohort's window status pill, or null for templates / always-open courses.
function cohortStatus(c: {
  isTemplate: boolean;
  startsAt: string | null;
  endsAt: string | null;
}): { label: string; cls: string } | null {
  if (c.isTemplate || (!c.startsAt && !c.endsAt)) return null;
  const now = Date.now();
  if (c.startsAt && new Date(c.startsAt).getTime() > now)
    return { label: "Upcoming", cls: "bg-amber-100 text-amber-700" };
  if (c.endsAt && new Date(c.endsAt).getTime() < now)
    return { label: "Ended", cls: "bg-slate-100 text-slate-500" };
  return { label: "Active", cls: "bg-emerald-100 text-emerald-700" };
}

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("people");
  const [facilitators, setFacilitators] = useState<FacilitatorRow[] | null>(null);
  const [courses, setCourses] = useState<CourseRow[] | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  // Existing courses the new facilitator is granted support (facilitator) rights on.
  const [inviteCourseIds, setInviteCourseIds] = useState<string[]>([]);
  // Optional clone-on-invite: source course/template + new-course details.
  const [cloneSourceId, setCloneSourceId] = useState("");
  const [cloneTitle, setCloneTitle] = useState("");
  const [cloneLabel, setCloneLabel] = useState("");
  const [cloneStart, setCloneStart] = useState("");
  const [cloneEnd, setCloneEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // Students tab
  const [studentCourseId, setStudentCourseId] = useState("");
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [addText, setAddText] = useState("");
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [emailOn, setEmailOn] = useState(false);
  // Create-cohort dialog
  const [cohortFor, setCohortFor] = useState<string | null>(null);
  const [coLabel, setCoLabel] = useState("");
  const [coStart, setCoStart] = useState("");
  const [coEnd, setCoEnd] = useState("");
  const [coOwner, setCoOwner] = useState("");
  // Tool library
  const [libTools, setLibTools] = useState<LibTool[] | null>(null);
  const [libCats, setLibCats] = useState<string[]>([]);
  const [libQ, setLibQ] = useState("");
  const [libCat, setLibCat] = useState("");
  const [editLib, setEditLib] = useState<string | null>(null);
  const [elName, setElName] = useState("");
  const [elCat, setElCat] = useState("");
  const [elDesc, setElDesc] = useState("");
  // Add-video-to-library uploader
  const [vidFile, setVidFile] = useState<File | null>(null);
  const [vidName, setVidName] = useState("");
  const [vidCat, setVidCat] = useState("");
  const [vidUploading, setVidUploading] = useState(false);
  const [vidPct, setVidPct] = useState(0);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [replacePct, setReplacePct] = useState(0);

  const load = useCallback(async () => {
    const [fRes, cRes] = await Promise.all([
      fetch("/api/admin/facilitators", { cache: "no-store" }),
      fetch("/api/admin/courses", { cache: "no-store" }),
    ]);
    if (fRes.status === 404 || cRes.status === 404) {
      // Not an admin — the portal is the right place for them.
      router.replace("/dashboard");
      return;
    }
    if (fRes.ok) setFacilitators((await fRes.json()).facilitators);
    if (cRes.ok) setCourses((await cRes.json()).courses);
  }, [router]);

  useEffect(() => {
    load();
    setOrigin(shareOrigin());
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEmailOn(!!d?.emailConfigured))
      .catch(() => {});
  }, [load]);

  async function saveAsTemplate(cid: string, title: string) {
    if (
      !confirm(
        `Create a reusable TEMPLATE from "${title}"?\n\nThis makes a clean copy of its sessions, steps, and tools — no rosters or live data. Future cohorts clone the template.`
      )
    )
      return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/courses/${cid}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "template" }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg(`Template created (code ${d.code}).`);
        await load();
      } else setError(d.error ?? "Could not create template.");
    } finally {
      setBusy(false);
    }
  }

  function openCohort(cid: string) {
    setCohortFor(cid);
    setCoLabel("");
    setCoStart("");
    setCoEnd("");
    setCoOwner("");
    setError(null);
    setMsg(null);
  }

  async function submitCohort() {
    if (!cohortFor) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/courses/${cohortFor}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "cohort",
          cohortLabel: coLabel.trim() || undefined,
          startsAt: coStart ? `${coStart}T00:00:00` : null,
          endsAt: coEnd ? `${coEnd}T23:59:59` : null,
          ownerEmail: coOwner.trim() || undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg(`Cohort created (code ${d.code}).`);
        setCohortFor(null);
        await load();
      } else setError(d.error ?? "Could not create cohort.");
    } finally {
      setBusy(false);
    }
  }

  const loadLibrary = useCallback(async () => {
    const params = new URLSearchParams();
    if (libQ.trim()) params.set("q", libQ.trim());
    if (libCat) params.set("category", libCat);
    const res = await fetch(`/api/tool-library?${params}`, { cache: "no-store" });
    if (res.ok) {
      const d = await res.json();
      setLibTools(d.tools);
      setLibCats(d.categories);
    }
  }, [libQ, libCat]);

  useEffect(() => {
    if (tab === "library") loadLibrary();
  }, [tab, loadLibrary]);

  function beginEditLib(t: LibTool) {
    setEditLib(t.id);
    setElName(t.name);
    setElCat(t.category);
    setElDesc(t.description);
  }
  async function saveEditLib() {
    if (!editLib) return;
    setBusy(true);
    try {
      await fetch(`/api/tool-library/${editLib}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: elName, category: elCat, description: elDesc }),
      });
      setEditLib(null);
      await loadLibrary();
    } finally {
      setBusy(false);
    }
  }
  async function deleteLib(id: string, name: string) {
    if (!confirm(`Remove "${name}" from the tool library?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/tool-library/${id}`, { method: "DELETE" });
      await loadLibrary();
    } finally {
      setBusy(false);
    }
  }

  async function uploadVideo(e: React.FormEvent) {
    e.preventDefault();
    if (!vidFile || !vidName.trim()) return;
    setVidUploading(true);
    setVidPct(0);
    setError(null);
    setMsg(null);
    try {
      // Browser-direct upload to Vercel Blob (bypasses the serverless size limit).
      // multipart = resumable chunked upload, more reliable for larger files.
      const blob = await upload(vidFile.name, vidFile, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        contentType: vidFile.type || "video/mp4",
        onUploadProgress: (p) => setVidPct(Math.round(p.percentage)),
      });
      // Save it as a video tool in the library (config is the step-tool shape).
      const res = await fetch("/api/tool-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: vidName.trim(),
          category: vidCat.trim() || "Video",
          kind: "video",
          prompt: vidName.trim(),
          config: { url: blob.url },
        }),
      });
      if (res.ok) {
        setMsg(`Video added to the library ✓`);
        setVidFile(null);
        setVidName("");
        setVidCat("");
        await loadLibrary();
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Could not save the video to the library.");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? `Upload failed: ${err.message}. Is the Vercel Blob store set up?`
          : "Upload failed."
      );
    } finally {
      setVidUploading(false);
    }
  }

  async function replaceVideo(id: string, file: File | null) {
    if (!file) return;
    setReplacingId(id);
    setReplacePct(0);
    setError(null);
    setMsg(null);
    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        contentType: file.type || "video/mp4",
        onUploadProgress: (p) => setReplacePct(Math.round(p.percentage)),
      });
      // Swap the URL on the existing library tool (keeps its name/category).
      const res = await fetch(`/api/tool-library/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: { url: blob.url } }),
      });
      if (res.ok) {
        setMsg("Video replaced ✓");
        await loadLibrary();
      } else {
        setError("Could not replace the video.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? `Replace failed: ${err.message}` : "Replace failed."
      );
    } finally {
      setReplacingId(null);
      setReplacePct(0);
    }
  }

  const loadStudents = useCallback(async (cid: string) => {
    if (!cid) {
      setStudents(null);
      return;
    }
    const res = await fetch(`/api/admin/courses/${cid}/students`, {
      cache: "no-store",
    });
    if (res.ok) setStudents((await res.json()).students);
  }, []);

  useEffect(() => {
    loadStudents(studentCourseId);
  }, [studentCourseId, loadStudents]);

  async function act(fn: () => Promise<Response>, okMsg?: string) {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fn();
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Action failed");
      }
      if (okMsg) setMsg(okMsg);
      const d = await res.json().catch(() => null);
      await load();
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim() || busy) return;
    const d = await act(
      () =>
        fetch("/api/admin/facilitators", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: inviteEmail,
            courseIds: inviteCourseIds,
            clone: cloneSourceId
              ? {
                  sourceId: cloneSourceId,
                  title: cloneTitle.trim() || undefined,
                  cohortLabel: cloneLabel.trim() || undefined,
                  startsAt: cloneStart ? `${cloneStart}T00:00:00` : undefined,
                  endsAt: cloneEnd ? `${cloneEnd}T23:59:59` : undefined,
                }
              : undefined,
          }),
        }),
      undefined
    );
    if (d) {
      setInviteEmail("");
      setInviteCourseIds([]);
      setCloneSourceId("");
      setCloneTitle("");
      setCloneLabel("");
      setCloneStart("");
      setCloneEnd("");
      const parts: string[] = [];
      if (d.clonedCourse?.title)
        parts.push(`cloned “${d.clonedCourse.title}” (they own it)`);
      if (d.grantedCount)
        parts.push(
          `added to ${d.grantedCount} course${d.grantedCount === 1 ? "" : "s"}`
        );
      const extra = parts.length ? ` — ${parts.join("; ")}` : "";
      setMsg(
        (d.invited
          ? "Invitation emailed — they join when they sign in."
          : "Added — they'll have access when they sign in with that email.") +
          extra
      );
      if (d.clonedCourse) await load();
    }
  }

  async function addStudents(e: React.FormEvent) {
    e.preventDefault();
    if (!studentCourseId || !addText.trim() || busy) return;
    const d = await act(() =>
      fetch(`/api/admin/courses/${studentCourseId}/students`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: addText }),
      })
    );
    if (d) {
      setAddText("");
      setMsg(`Added ${d.added} student${d.added === 1 ? "" : "s"}.`);
      await loadStudents(studentCourseId);
    }
  }

  async function sendInvites(sid?: string) {
    if (!studentCourseId || busy) return;
    const d = await act(() =>
      fetch(`/api/admin/courses/${studentCourseId}/students/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sid ? { sid } : {}),
      })
    );
    if (d) {
      const parts = [`Sent ${d.sent} email${d.sent === 1 ? "" : "s"}`];
      if (d.skipped) parts.push(`${d.skipped} had no email`);
      if (d.failed?.length) parts.push(`${d.failed.length} failed`);
      setMsg(parts.join(" · "));
      if (d.failed?.length) setError(d.failed[0].error);
    }
  }

  function studentLink(token: string) {
    return `${origin}/join/s/${token}`;
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
    } catch {
      setError("Copy failed — select and copy manually");
    }
  }

  const pill =
    "rounded-md px-3 py-1.5 text-sm font-semibold transition";

  return (
    <div className="flex-1 min-h-screen">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <div>
          <button
            onClick={() => router.push("/dashboard")}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            ← My courses
          </button>
          <h1 className="text-xl font-bold">Admin</h1>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <UserButton />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-5 w-fit">
          <button
            onClick={() => setTab("people")}
            className={`${pill} ${tab === "people" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            People
          </button>
          <button
            onClick={() => setTab("courses")}
            className={`${pill} ${tab === "courses" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            Courses
          </button>
          <button
            onClick={() => setTab("students")}
            className={`${pill} ${tab === "students" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            Students
          </button>
          <button
            onClick={() => setTab("library")}
            className={`${pill} ${tab === "library" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            Tool library
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-amber-50 text-amber-800 text-sm px-4 py-2 border border-amber-200">
            {error}
          </div>
        )}
        {msg && (
          <div className="mb-4 rounded-lg bg-emerald-50 text-emerald-800 text-sm px-4 py-2 border border-emerald-200">
            {msg}
          </div>
        )}

        {tab === "people" && (
          <div className="flex flex-col gap-5">
            <form
              onSubmit={invite}
              className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-2"
            >
              <h2 className="font-semibold">Invite a facilitator</h2>
              <p className="text-xs text-slate-500">
                They get an email to set up their account and are adopted
                automatically on first sign-in. Grant support rights on existing
                courses and/or clone a course or template for them.
              </p>

              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />

              {/* Grant support (facilitator) rights on existing courses */}
              <div className="mt-1">
                <p className="text-xs font-semibold text-slate-500 mb-1">
                  Courses to support
                  {inviteCourseIds.length > 0 && (
                    <span className="text-slate-400 font-normal">
                      {" "}
                      · {inviteCourseIds.length} selected
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {courses
                    ?.filter((c) => !c.isTemplate)
                    .map((c) => {
                      const on = inviteCourseIds.includes(c.id);
                      return (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() =>
                            setInviteCourseIds((prev) =>
                              on
                                ? prev.filter((x) => x !== c.id)
                                : [...prev, c.id]
                            )
                          }
                          className={`text-xs rounded-full px-2.5 py-1 border transition ${
                            on
                              ? "bg-indigo-600 border-indigo-600 text-white"
                              : "bg-white border-slate-300 text-slate-600 hover:border-indigo-300"
                          }`}
                        >
                          {on ? "✓ " : ""}
                          {c.title}
                        </button>
                      );
                    })}
                  {courses?.filter((c) => !c.isTemplate).length === 0 && (
                    <span className="text-xs text-slate-400">No courses yet.</span>
                  )}
                </div>
              </div>

              {/* Optionally clone a course or template into a course they own */}
              <div className="mt-1">
                <p className="text-xs font-semibold text-slate-500 mb-1">
                  Clone a course or template for them (optional)
                </p>
                <select
                  value={cloneSourceId}
                  onChange={(e) => setCloneSourceId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="">Don’t clone — just invite</option>
                  {courses?.some((c) => c.isTemplate) && (
                    <optgroup label="Templates">
                      {courses
                        .filter((c) => c.isTemplate)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                    </optgroup>
                  )}
                  {courses?.some((c) => !c.isTemplate) && (
                    <optgroup label="Courses">
                      {courses
                        .filter((c) => !c.isTemplate)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                    </optgroup>
                  )}
                </select>
                {cloneSourceId && (
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      value={cloneTitle}
                      onChange={(e) => setCloneTitle(e.target.value)}
                      placeholder="New course name (optional)"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
                    />
                    <input
                      value={cloneLabel}
                      onChange={(e) => setCloneLabel(e.target.value)}
                      placeholder="Cohort label (optional)"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
                    />
                    <label className="text-xs text-slate-500 flex flex-col gap-1">
                      Opens
                      <input
                        type="date"
                        value={cloneStart}
                        onChange={(e) => setCloneStart(e.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs text-slate-500 flex flex-col gap-1">
                      Closes
                      <input
                        type="date"
                        value={cloneEnd}
                        onChange={(e) => setCloneEnd(e.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <p className="text-[11px] text-slate-400 sm:col-span-2">
                      A fresh working copy is created — structure, tools and files
                      carry over; the new facilitator owns it. Dates limit when
                      students can join.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <button
                  type="submit"
                  disabled={busy || !inviteEmail.trim()}
                  className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 transition"
                >
                  Invite
                </button>
              </div>
            </form>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
              {facilitators === null && (
                <p className="p-5 text-sm text-slate-400">Loading…</p>
              )}
              {facilitators?.map((f) => (
                <div key={f.id} className="p-4 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{f.name}</span>
                      {f.isAdmin && (
                        <span className="text-[10px] uppercase font-semibold text-indigo-600 bg-indigo-50 rounded px-1.5 py-0.5">
                          admin
                        </span>
                      )}
                      {f.pending && (
                        <span className="text-[10px] uppercase font-semibold text-amber-600 bg-amber-50 rounded px-1.5 py-0.5">
                          invited
                        </span>
                      )}
                    </div>
                    {f.email && (
                      <p className="text-xs text-slate-400">{f.email}</p>
                    )}
                    {f.courses.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {f.courses.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => router.push(`/course/${c.id}`)}
                            className="text-[11px] rounded-full border border-slate-200 px-2 py-0.5 text-slate-500 hover:border-indigo-300 hover:text-indigo-600"
                            title={`${c.role} — open course`}
                          >
                            {c.title}
                            {c.role === "owner" ? " · owner" : ""}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() =>
                        act(() =>
                          fetch(`/api/admin/facilitators/${f.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ isAdmin: !f.isAdmin }),
                          })
                        )
                      }
                      disabled={busy}
                      className="text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                      {f.isAdmin ? "Remove admin" : "Make admin"}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${f.name} entirely?`)) {
                          act(() =>
                            fetch(`/api/admin/facilitators/${f.id}`, {
                              method: "DELETE",
                            })
                          );
                        }
                      }}
                      disabled={busy}
                      className="text-xs text-slate-300 hover:text-rose-600 disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              {facilitators?.length === 0 && (
                <p className="p-5 text-sm text-slate-400">No facilitators yet.</p>
              )}
            </div>
          </div>
        )}

        {tab === "courses" && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
            {courses === null && (
              <p className="p-5 text-sm text-slate-400">Loading…</p>
            )}
            {courses?.map((c) => {
              const win = cohortStatus(c);
              return (
                <div key={c.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium truncate">{c.title}</span>
                        {c.isTemplate ? (
                          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-700">
                            Template
                          </span>
                        ) : c.templateId ? (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                            Cohort
                          </span>
                        ) : null}
                        {win && (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${win.cls}`}
                          >
                            {win.label}
                          </span>
                        )}
                        <span className="font-mono text-xs text-slate-400">
                          {c.code}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {c.cohortLabel ? `${c.cohortLabel} · ` : ""}
                        {c.sessionCount} session{c.sessionCount === 1 ? "" : "s"} ·{" "}
                        {c.owner ? `owner: ${c.owner}` : "no owner"}
                        {c.startsAt || c.endsAt
                          ? ` · ${fmtDate(c.startsAt)} – ${fmtDate(c.endsAt)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {c.isTemplate ? (
                        <button
                          onClick={() => openCohort(c.id)}
                          disabled={busy}
                          className="rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
                        >
                          Create cohort
                        </button>
                      ) : (
                        <button
                          onClick={() => saveAsTemplate(c.id, c.title)}
                          disabled={busy}
                          className="rounded-md border border-violet-300 px-2.5 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-40"
                        >
                          Save as template
                        </button>
                      )}
                      <button
                        onClick={() => router.push(`/course/${c.id}`)}
                        className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                      >
                        Manage →
                      </button>
                    </div>
                  </div>

                  {cohortFor === c.id && (
                    <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
                      <p className="mb-2 text-xs font-semibold text-indigo-700">
                        New cohort from “{c.title}”
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="text-xs text-slate-600">
                          Cohort label
                          <input
                            value={coLabel}
                            onChange={(e) => setCoLabel(e.target.value)}
                            placeholder="e.g. Fall 2026"
                            className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                          />
                        </label>
                        <label className="text-xs text-slate-600">
                          Owner email (optional)
                          <input
                            value={coOwner}
                            onChange={(e) => setCoOwner(e.target.value)}
                            placeholder="defaults to you"
                            className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                          />
                        </label>
                        <label className="text-xs text-slate-600">
                          Opens
                          <input
                            type="date"
                            value={coStart}
                            onChange={(e) => setCoStart(e.target.value)}
                            className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                          />
                        </label>
                        <label className="text-xs text-slate-600">
                          Ends
                          <input
                            type="date"
                            value={coEnd}
                            onChange={(e) => setCoEnd(e.target.value)}
                            className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                          />
                        </label>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={submitCohort}
                          disabled={busy}
                          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
                        >
                          Create cohort
                        </button>
                        <button
                          onClick={() => setCohortFor(null)}
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                        >
                          Cancel
                        </button>
                        <span className="text-[11px] text-slate-400">
                          Leave dates blank for always-open. Facilitators can
                          access anytime; students only within the window.
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {courses?.length === 0 && (
              <p className="p-5 text-sm text-slate-400">No courses yet.</p>
            )}
          </div>
        )}

        {tab === "students" && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-500">Course</label>
              <select
                value={studentCourseId}
                onChange={(e) => setStudentCourseId(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value="">Choose a course…</option>
                {courses?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            {studentCourseId && (
              <>
                <form
                  onSubmit={addStudents}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-2"
                >
                  <h2 className="font-semibold">Add students</h2>
                  <p className="text-xs text-slate-500">
                    One per line — <span className="font-mono">Name</span> or{" "}
                    <span className="font-mono">Name, email</span>. Each gets a
                    durable personal link that drops them into whichever session
                    is live — no key, no account.
                  </p>
                  <textarea
                    value={addText}
                    onChange={(e) => setAddText(e.target.value)}
                    rows={4}
                    placeholder={"Marcus Bell, marcus@example.com\nDwayne Ortiz"}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={busy || !addText.trim()}
                    className="self-start rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 transition"
                  >
                    Add to roster
                  </button>
                </form>

                {students && students.length > 0 && (
                  <div className="flex items-center justify-between gap-3 -mb-1">
                    <p className="text-xs text-slate-400">
                      {students.length} student
                      {students.length === 1 ? "" : "s"} ·{" "}
                      {students.filter((s) => s.email).length} with email
                    </p>
                    {emailOn ? (
                      <button
                        onClick={() => sendInvites()}
                        disabled={busy || !students.some((s) => s.email)}
                        className="text-xs rounded-lg bg-indigo-600 text-white px-3 py-1.5 font-medium hover:bg-indigo-700 disabled:opacity-40"
                      >
                        Email all links
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400">
                        Server email off — use Copy / Email (opens your mail app)
                      </span>
                    )}
                  </div>
                )}

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
                  {students === null && (
                    <p className="p-5 text-sm text-slate-400">Loading…</p>
                  )}
                  {students?.map((st) => {
                    const link = studentLink(st.token);
                    const mailto = st.email
                      ? `mailto:${encodeURIComponent(st.email)}?subject=${encodeURIComponent(
                          "Your link to join the class"
                        )}&body=${encodeURIComponent(
                          `Hi ${st.name},\n\nHere's your personal link to join the class. It works every week — open it when class starts:\n\n${link}\n\nSee you there!`
                        )}`
                      : null;
                    return (
                      <div
                        key={st.id}
                        className="p-4 flex items-center gap-3 flex-wrap"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{st.name}</p>
                          <p className="text-xs text-slate-400 truncate">
                            {st.email ? `${st.email} · ` : ""}
                            <span className="font-mono">{link}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => copy(link, st.id)}
                            className="text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-600 hover:bg-slate-50"
                          >
                            {copied === st.id ? "Copied!" : "Copy link"}
                          </button>
                          {st.email &&
                            (emailOn ? (
                              <button
                                onClick={() => sendInvites(st.id)}
                                disabled={busy}
                                className="text-xs rounded-lg bg-indigo-600 text-white px-2.5 py-1.5 font-medium hover:bg-indigo-700 disabled:opacity-40"
                              >
                                Send
                              </button>
                            ) : mailto ? (
                              <a
                                href={mailto}
                                className="text-xs rounded-lg border border-indigo-300 text-indigo-700 px-2.5 py-1.5 hover:bg-indigo-50"
                              >
                                Email
                              </a>
                            ) : null)}
                          <button
                            onClick={() => {
                              if (confirm(`Remove ${st.name} from the roster?`)) {
                                act(() =>
                                  fetch(
                                    `/api/admin/courses/${studentCourseId}/students/${st.id}`,
                                    { method: "DELETE" }
                                  )
                                ).then(() => loadStudents(studentCourseId));
                              }
                            }}
                            className="text-xs text-slate-300 hover:text-rose-600"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {students?.length === 0 && (
                    <p className="p-5 text-sm text-slate-400">
                      No students yet — add some above.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {tab === "library" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-500">
              Reusable tools facilitators can clone into any course outline. Add a
              tool from the <span className="font-medium">“⭐ To library”</span>{" "}
              button on any saved tool inside a course.
            </p>

            {/* Upload a video straight into the library */}
            <form
              onSubmit={uploadVideo}
              className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col gap-2"
            >
              <p className="text-sm font-semibold">Add a video</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={vidName}
                  onChange={(e) => setVidName(e.target.value)}
                  placeholder="Video title (e.g. Trait 1 — Self-Awareness)"
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
                <input
                  value={vidCat}
                  onChange={(e) => setVidCat(e.target.value)}
                  placeholder="Category (defaults to “Video”)"
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <input
                type="file"
                accept="video/mp4,video/webm,video/ogg,video/quicktime"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setVidFile(f);
                  // Default the title to the file name (minus extension) if empty.
                  if (f && !vidName.trim()) {
                    setVidName(
                      f.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim()
                    );
                  }
                }}
                className="text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm"
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={vidUploading || !vidFile || !vidName.trim()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
                >
                  {vidUploading ? `Uploading… ${vidPct}%` : "Upload & add to library"}
                </button>
                <span className="text-[11px] text-slate-400">
                  Uploads straight to storage (up to ~30 MB each). Plays with
                  synced controls when launched.
                </span>
              </div>
              {vidUploading && (
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-[width] duration-200"
                    style={{ width: `${vidPct}%` }}
                  />
                </div>
              )}
            </form>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={libQ}
                onChange={(e) => setLibQ(e.target.value)}
                placeholder="Search by name, category, or kind…"
                className="flex-1 min-w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <select
                value={libCat}
                onChange={(e) => setLibCat(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value="">All categories</option>
                {libCats.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
              {libTools === null && (
                <p className="p-5 text-sm text-slate-400">Loading…</p>
              )}
              {libTools?.length === 0 && (
                <p className="p-5 text-sm text-slate-400">
                  No tools in the library yet.
                </p>
              )}
              {libTools?.map((t) =>
                editLib === t.id ? (
                  <div key={t.id} className="p-4 flex flex-col gap-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        value={elName}
                        onChange={(e) => setElName(e.target.value)}
                        placeholder="Name"
                        className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                      />
                      <input
                        value={elCat}
                        onChange={(e) => setElCat(e.target.value)}
                        placeholder="Category"
                        className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                      />
                    </div>
                    <input
                      value={elDesc}
                      onChange={(e) => setElDesc(e.target.value)}
                      placeholder="Description"
                      className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={saveEditLib}
                        disabled={busy || !elName.trim()}
                        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditLib(null)}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={t.id} className="p-4 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium truncate">{t.name}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                          {t.kind}
                        </span>
                        {t.category && (
                          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-700">
                            {t.category}
                          </span>
                        )}
                      </div>
                      {t.description && (
                        <p className="mt-0.5 text-xs text-slate-400 line-clamp-2">
                          {t.description}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {t.kind === "video" && (
                        <label
                          className={`cursor-pointer rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 ${
                            replacingId === t.id ? "opacity-60" : ""
                          }`}
                          title="Upload a new file for this video"
                        >
                          {replacingId === t.id
                            ? `Replacing… ${replacePct}%`
                            : "Replace video"}
                          <input
                            type="file"
                            accept="video/mp4,video/webm,video/ogg,video/quicktime"
                            className="hidden"
                            disabled={replacingId !== null}
                            onChange={(e) =>
                              replaceVideo(t.id, e.target.files?.[0] ?? null)
                            }
                          />
                        </label>
                      )}
                      <button
                        onClick={() => beginEditLib(t)}
                        className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteLib(t.id, t.name)}
                        className="rounded-md px-2.5 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
