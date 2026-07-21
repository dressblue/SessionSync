"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createSession(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create session");
      localStorage.setItem(`ss_facilitator_${data.id}`, data.facilitatorKey);
      router.push(`/facilitate/${data.id}?key=${data.facilitatorKey}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create session");
      setBusy(false);
    }
  }

  function goJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    router.push(`/join?code=${encodeURIComponent(code.trim().toUpperCase())}`);
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight">
          Session<span className="text-indigo-600">Sync</span>
        </h1>
        <p className="mt-3 text-slate-600 max-w-md mx-auto">
          An interactive companion for Zoom sessions — a shared agenda that the
          facilitator drives and every participant follows in real time.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 w-full max-w-2xl">
        <form
          onSubmit={createSession}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4"
        >
          <div>
            <h2 className="font-semibold text-lg">Facilitate</h2>
            <p className="text-sm text-slate-500">
              Create a session, build the agenda, share the join link in Zoom
              chat.
            </p>
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Session title, e.g. Q3 Program Review"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            maxLength={200}
          />
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 transition"
          >
            {busy ? "Creating…" : "Create session"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>

        <form
          onSubmit={goJoin}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4"
        >
          <div>
            <h2 className="font-semibold text-lg">Join</h2>
            <p className="text-sm text-slate-500">
              Got a session code from the facilitator? Enter it here.
            </p>
          </div>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="6-character code"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500"
            maxLength={6}
          />
          <button
            type="submit"
            disabled={!code.trim()}
            className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm font-medium hover:bg-slate-900 disabled:opacity-40 transition"
          >
            Join session
          </button>
        </form>
      </div>
    </main>
  );
}
