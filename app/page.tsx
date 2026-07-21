"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");

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
          An interactive companion for Zoom sessions — courses with live,
          facilitator-driven agendas, activities, and notes that every
          participant follows in real time.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 w-full max-w-2xl">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
          <div>
            <h2 className="font-semibold text-lg">Facilitate</h2>
            <p className="text-sm text-slate-500">
              Build courses and sessions, invite co-facilitators, and lead
              live sessions.
            </p>
          </div>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-auto rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 transition"
          >
            Open facilitator portal
          </button>
        </div>

        <form
          onSubmit={goJoin}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4"
        >
          <div>
            <h2 className="font-semibold text-lg">Join</h2>
            <p className="text-sm text-slate-500">
              Got a session key from your facilitator? Enter it here.
            </p>
          </div>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Session key"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500"
            maxLength={6}
          />
          <button
            type="submit"
            disabled={!code.trim()}
            className="mt-auto rounded-lg bg-slate-800 text-white px-4 py-2 text-sm font-medium hover:bg-slate-900 disabled:opacity-40 transition"
          >
            Join session
          </button>
        </form>
      </div>
    </main>
  );
}
