"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function JoinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState(searchParams.get("code")?.toUpperCase() ?? "");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !code.trim() || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not join");
      localStorage.setItem(
        `ss_participant_${data.sessionId}`,
        JSON.stringify({ participantId: data.participantId, name: name.trim() })
      );
      router.push(`/s/${data.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join");
      setBusy(false);
    }
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
      <form
        onSubmit={join}
        className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 w-full max-w-sm flex flex-col gap-4"
      >
        <div className="text-center">
          <h1 className="text-2xl font-bold">Join session</h1>
          <p className="text-sm text-slate-500 mt-1">
            Enter the code and your name — no account needed.
          </p>
        </div>
        <label className="text-sm font-medium text-slate-700">
          Session code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. 7KMPQ2"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500"
            maxLength={6}
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Your name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="As it should appear to the group"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            maxLength={80}
            autoFocus={!!searchParams.get("code")}
          />
        </label>
        <button
          type="submit"
          disabled={busy || !code.trim() || !name.trim()}
          className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 transition"
        >
          {busy ? "Joining…" : "Join"}
        </button>
        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
      </form>
    </main>
  );
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinForm />
    </Suspense>
  );
}
