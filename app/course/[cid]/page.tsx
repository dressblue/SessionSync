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
  materials: { id: string; title: string; note: string; sessionId: string | null }[];
  files: {
    id: string;
    title: string;
    filename: string;
    size: number;
    sessionId: string | null;
  }[];
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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

  // Materials & downloads management
  const [matTitle, setMatTitle] = useState("");
  const [matNote, setMatNote] = useState("");
  const [matScope, setMatScope] = useState("");
  const [fileTitle, setFileTitle] = useState("");
  const [fileScope, setFileScope] = useState("");
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

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

  async function addMaterial(e: React.FormEvent) {
    e.preventDefault();
    if (!identity || !matTitle.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/courses/${cid}/materials`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...facilitatorHeaders(identity),
        },
        body: JSON.stringify({
          title: matTitle,
          note: matNote,
          sessionId: matScope || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Could not add item");
      }
      setMatTitle("");
      setMatNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add item");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(e: React.FormEvent) {
    e.preventDefault();
    if (!identity || !fileToUpload || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", fileToUpload);
      if (fileTitle.trim()) form.append("title", fileTitle.trim());
      if (fileScope) form.append("sessionId", fileScope);
      const res = await fetch(`/api/courses/${cid}/files`, {
        method: "POST",
        headers: facilitatorHeaders(identity),
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Upload failed");
      }
      setFileTitle("");
      setFileToUpload(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function remove(path: string) {
    if (!identity || busy) return;
    setBusy(true);
    try {
      await fetch(path, {
        method: "DELETE",
        headers: facilitatorHeaders(identity),
      });
      await load();
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

  const { course, team, sessions, materials, files } = detail;

  const scopeLabel = (sessionId: string | null) => {
    if (!sessionId) return "course-wide";
    const idx = sessions.findIndex((s) => s.id === sessionId);
    return idx >= 0 ? `session ${idx + 1}` : "session";
  };

  const scopeSelect = (
    value: string,
    onChange: (v: string) => void
  ) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-slate-300 px-2 py-2 text-xs bg-white"
    >
      <option value="">Whole course</option>
      {sessions.map((s, i) => (
        <option key={s.id} value={s.id}>
          Session {i + 1}
        </option>
      ))}
    </select>
  );

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

          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold mb-1">Materials & downloads</h2>
            <p className="text-xs text-slate-500 mb-4">
              Students see these in the Materials and Downloads tabs beside
              their agenda — course-wide entries in every session,
              session-scoped entries only in that session.
            </p>

            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
              Needed items
            </h3>
            <ul className="flex flex-col gap-1.5 mb-3">
              {materials.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <span className="font-medium">{m.title}</span>
                  {m.note && (
                    <span className="text-xs text-slate-500 truncate">
                      — {m.note}
                    </span>
                  )}
                  <span className="ml-auto text-[10px] uppercase font-semibold text-slate-400 shrink-0">
                    {scopeLabel(m.sessionId)}
                  </span>
                  <button
                    onClick={() =>
                      remove(`/api/courses/${cid}/materials/${m.id}`)
                    }
                    className="text-slate-300 hover:text-rose-500 shrink-0"
                    aria-label="Remove item"
                  >
                    ×
                  </button>
                </li>
              ))}
              {materials.length === 0 && (
                <li className="text-xs text-slate-400">No items yet</li>
              )}
            </ul>
            <form onSubmit={addMaterial} className="flex flex-wrap gap-1.5 mb-5">
              <input
                value={matTitle}
                onChange={(e) => setMatTitle(e.target.value)}
                placeholder="Item, e.g. Fathering Handbook"
                maxLength={200}
                className="flex-1 min-w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                value={matNote}
                onChange={(e) => setMatNote(e.target.value)}
                placeholder="Note (optional)"
                maxLength={500}
                className="flex-1 min-w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {scopeSelect(matScope, setMatScope)}
              <button
                type="submit"
                disabled={busy || !matTitle.trim()}
                className="rounded-lg bg-slate-800 text-white px-3 py-2 text-sm font-medium hover:bg-slate-900 disabled:opacity-40"
              >
                Add item
              </button>
            </form>

            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
              Downloadable files
            </h3>
            <ul className="flex flex-col gap-1.5 mb-3">
              {files.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <a
                    href={`/api/files/${f.id}`}
                    download={f.filename}
                    className="font-medium text-indigo-700 hover:underline truncate"
                  >
                    {f.title}
                  </a>
                  <span className="text-xs text-slate-400 shrink-0">
                    {formatSize(f.size)}
                  </span>
                  <span className="ml-auto text-[10px] uppercase font-semibold text-slate-400 shrink-0">
                    {scopeLabel(f.sessionId)}
                  </span>
                  <button
                    onClick={() => {
                      if (confirm(`Delete file "${f.title}"?`)) {
                        remove(`/api/courses/${cid}/files/${f.id}`);
                      }
                    }}
                    className="text-slate-300 hover:text-rose-500 shrink-0"
                    aria-label="Delete file"
                  >
                    ×
                  </button>
                </li>
              ))}
              {files.length === 0 && (
                <li className="text-xs text-slate-400">No files yet</li>
              )}
            </ul>
            <form onSubmit={uploadFile} className="flex flex-wrap gap-1.5 items-center">
              <input
                type="file"
                onChange={(e) => setFileToUpload(e.target.files?.[0] ?? null)}
                className="text-xs text-slate-500 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-600 hover:file:bg-slate-200"
              />
              <input
                value={fileTitle}
                onChange={(e) => setFileTitle(e.target.value)}
                placeholder="Display title (optional)"
                maxLength={200}
                className="flex-1 min-w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {scopeSelect(fileScope, setFileScope)}
              <button
                type="submit"
                disabled={uploading || !fileToUpload}
                className="rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-40"
              >
                {uploading ? "Uploading…" : "Upload"}
              </button>
              <p className="w-full text-[11px] text-slate-400">
                PDFs, checklists, worksheets — up to 15 MB per file.
              </p>
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
