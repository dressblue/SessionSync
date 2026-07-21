"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useSessionState } from "@/components/useSessionState";
import { Markdown } from "@/components/Markdown";

function Console() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [key, setKey] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  // Agenda editing state
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const urlKey = searchParams.get("key");
    const stored = localStorage.getItem(`ss_facilitator_${id}`);
    const resolved = urlKey ?? stored;
    if (urlKey) localStorage.setItem(`ss_facilitator_${id}`, urlKey);
    setKey(resolved);
    setChecked(true);
    setOrigin(window.location.origin);
    // Restore an unsent "add step" draft after a reload or dropped tab.
    const draft = localStorage.getItem(`ss_draft_${id}`);
    if (draft) {
      try {
        const { title, content } = JSON.parse(draft);
        setNewTitle(title ?? "");
        setNewContent(content ?? "");
      } catch {
        localStorage.removeItem(`ss_draft_${id}`);
      }
    }
  }, [id, searchParams]);

  // Keep the add-step draft on disk so unsaved typing survives a reconnect.
  useEffect(() => {
    if (!checked) return;
    if (newTitle || newContent) {
      localStorage.setItem(
        `ss_draft_${id}`,
        JSON.stringify({ title: newTitle, content: newContent })
      );
    } else {
      localStorage.removeItem(`ss_draft_${id}`);
    }
  }, [checked, id, newTitle, newContent]);

  const { state, error, refresh } = useSessionState(id, { intervalMs: 2000 });

  const api = useCallback(
    async (path: string, method: string, body?: unknown) => {
      setActionError(null);
      try {
        const res = await fetch(path, {
          method,
          headers: {
            "Content-Type": "application/json",
            "x-facilitator-key": key ?? "",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? `Request failed (${res.status})`);
        }
        refresh();
        return true;
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Action failed");
        return false;
      }
    },
    [key, refresh]
  );

  const control = (action: string, step?: number) =>
    api(`/api/sessions/${id}/control`, "POST", { action, step });

  async function addStep(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const ok = await api(`/api/sessions/${id}/steps`, "POST", {
      title: newTitle,
      content: newContent,
    });
    if (ok) {
      setNewTitle("");
      setNewContent("");
      localStorage.removeItem(`ss_draft_${id}`);
    }
  }

  function beginEdit(step: { id: string; title: string; content: string }) {
    setEditingId(step.id);
    setEditTitle(step.title);
    setEditContent(step.content);
  }

  async function saveEdit() {
    if (!editingId) return;
    const ok = await api(`/api/sessions/${id}/steps/${editingId}`, "PATCH", {
      title: editTitle,
      content: editContent,
    });
    if (ok) setEditingId(null);
  }

  async function copy(text: string, tag: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setActionError("Copy failed — select and copy manually");
    }
  }

  if (!checked) return null;

  if (!key) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 text-center">
        <div>
          <h1 className="text-xl font-semibold">Facilitator key missing</h1>
          <p className="text-slate-500 mt-2 max-w-md">
            Open this console using the full facilitator link you received when
            the session was created (it contains a <code>?key=…</code> secret).
          </p>
        </div>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="flex-1 flex items-center justify-center text-slate-500">
        {error ?? "Loading session…"}
      </main>
    );
  }

  const { session, steps, participants } = state;
  const joinUrl = origin ? `${origin}/join?code=${session.code}` : "";
  const current = steps[session.currentStep];
  const online = participants.filter((p) => p.online);

  const statusBadge = {
    lobby: "bg-slate-100 text-slate-600",
    live: "bg-emerald-100 text-emerald-700",
    ended: "bg-rose-100 text-rose-700",
  }[session.status];

  return (
    <div className="flex-1 min-h-screen">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
            Facilitator console
          </p>
          <h1 className="text-xl font-bold truncate">{session.title}</h1>
        </div>
        <span
          className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold uppercase ${statusBadge}`}
        >
          {session.status}
        </span>
      </header>

      {(actionError || error) && (
        <div className="bg-amber-50 text-amber-800 text-sm px-6 py-2 border-b border-amber-200">
          {actionError ?? `Reconnecting… (${error})`}
        </div>
      )}

      <div className="max-w-6xl mx-auto px-6 py-6 grid gap-6 lg:grid-cols-3 items-start">
        {/* Left: controls + agenda */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex flex-wrap items-center gap-2">
              {session.status !== "live" ? (
                <button
                  onClick={() => control("start")}
                  disabled={steps.length === 0}
                  className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 transition"
                >
                  {session.status === "ended" ? "Restart session" : "Start session"}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => control("prev")}
                    disabled={session.currentStep === 0}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-40 transition"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={() => control("next")}
                    disabled={session.currentStep >= steps.length - 1}
                    className="rounded-lg bg-indigo-600 text-white px-5 py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition"
                  >
                    Next step →
                  </button>
                  <button
                    onClick={() => control("end")}
                    className="ml-auto rounded-lg border border-rose-300 text-rose-700 px-4 py-2 text-sm font-medium hover:bg-rose-50 transition"
                  >
                    End session
                  </button>
                </>
              )}
            </div>

            {session.status === "live" && current && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
                  Now showing — step {session.currentStep + 1} of {steps.length}
                </p>
                <h3 className="font-semibold">{current.title}</h3>
                {current.content && (
                  <div className="mt-2 max-h-48 overflow-y-auto text-sm border border-slate-100 rounded-lg p-3 bg-slate-50">
                    <Markdown>{current.content}</Markdown>
                  </div>
                )}
              </div>
            )}
            {session.status === "lobby" && (
              <p className="mt-3 text-sm text-slate-500">
                {steps.length === 0
                  ? "Add at least one agenda step below, then start the session."
                  : `${steps.length} step${steps.length === 1 ? "" : "s"} ready. Participants see a waiting screen until you start.`}
              </p>
            )}
          </section>

          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold mb-3">Agenda</h2>
            <ol className="flex flex-col gap-2">
              {steps.map((s, i) => (
                <li
                  key={s.id}
                  className={`rounded-lg border ${
                    session.status === "live" && i === session.currentStep
                      ? "border-indigo-400 bg-indigo-50"
                      : "border-slate-200"
                  }`}
                >
                  {editingId === s.id ? (
                    <div className="p-3 flex flex-col gap-2">
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={6}
                        placeholder="Step content (Markdown supported)"
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={saveEdit}
                          className="rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-indigo-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-5 text-right shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium truncate">{s.title}</span>
                      <div className="ml-auto flex items-center gap-1 shrink-0">
                        {session.status === "live" && i !== session.currentStep && (
                          <button
                            onClick={() => control("goto", i)}
                            className="rounded-md border border-indigo-200 text-indigo-700 px-2 py-1 text-xs hover:bg-indigo-50"
                          >
                            Show
                          </button>
                        )}
                        <button
                          onClick={() =>
                            api(`/api/sessions/${id}/steps/${s.id}`, "PATCH", {
                              move: "up",
                            })
                          }
                          disabled={i === 0}
                          className="rounded-md px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                          aria-label="Move up"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() =>
                            api(`/api/sessions/${id}/steps/${s.id}`, "PATCH", {
                              move: "down",
                            })
                          }
                          disabled={i === steps.length - 1}
                          className="rounded-md px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                          aria-label="Move down"
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => beginEdit(s)}
                          className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete step "${s.title}"?`)) {
                              api(`/api/sessions/${id}/steps/${s.id}`, "DELETE");
                            }
                          }}
                          className="rounded-md px-2 py-1 text-xs text-rose-500 hover:bg-rose-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ol>

            <form
              onSubmit={addStep}
              className="mt-4 border-t border-slate-100 pt-4 flex flex-col gap-2"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Add step
              </p>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Step title, e.g. Welcome & objectives"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                maxLength={200}
              />
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={4}
                placeholder="Step content shown to participants (Markdown supported)"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={!newTitle.trim()}
                className="self-start rounded-lg bg-slate-800 text-white px-4 py-2 text-sm font-medium hover:bg-slate-900 disabled:opacity-40 transition"
              >
                Add to agenda
              </button>
            </form>
          </section>
        </div>

        {/* Right: share + roster */}
        <div className="flex flex-col gap-6">
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold mb-1">Invite participants</h2>
            <p className="text-sm text-slate-500 mb-3">
              Paste the link into Zoom chat, or share the code.
            </p>
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-center mb-3">
              <span className="font-mono text-2xl tracking-[0.3em] font-semibold">
                {session.code}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => copy(joinUrl, "link")}
                className="flex-1 rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm font-medium hover:bg-indigo-700 transition"
              >
                {copied === "link" ? "Copied!" : "Copy join link"}
              </button>
              <button
                onClick={() => copy(session.code, "code")}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 transition"
              >
                {copied === "code" ? "Copied!" : "Copy code"}
              </button>
            </div>
            {joinUrl && (
              <p className="mt-2 text-xs text-slate-400 break-all">{joinUrl}</p>
            )}
            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="text-xs text-slate-400 mb-1.5">
                Facilitating from another device? This link is your control key —
                don&apos;t share it with participants.
              </p>
              <button
                onClick={() =>
                  copy(`${origin}/facilitate/${id}?key=${key}`, "fkey")
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
              >
                {copied === "fkey" ? "Copied!" : "Copy facilitator link"}
              </button>
            </div>
          </section>

          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold mb-3">
              Participants{" "}
              <span className="text-sm font-normal text-slate-400">
                ({online.length} online / {participants.length} joined)
              </span>
            </h2>
            <ul className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
              {participants.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      p.online ? "bg-emerald-500" : "bg-slate-300"
                    }`}
                  />
                  <span className={p.online ? "" : "text-slate-400"}>
                    {p.name}
                  </span>
                </li>
              ))}
              {participants.length === 0 && (
                <li className="text-sm text-slate-400">No one has joined yet</li>
              )}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function FacilitatePage() {
  return (
    <Suspense>
      <Console />
    </Suspense>
  );
}
