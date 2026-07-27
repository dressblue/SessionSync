"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, RosterEntry } from "./useSessionState";

export type ChatMode = "group" | "facilitator" | "open";

interface Props {
  sessionId: string;
  messages: ChatMessage[];
  /** A participant sender (absent for the facilitator, who posts via Clerk). */
  participantId?: string;
  participantName?: string;
  /** Facilitator: posts as facilitator, can DM anyone, sets the chat mode. */
  canModerate?: boolean;
  /** Who participants may message. Governs the recipient picker. */
  chatMode: ChatMode;
  /** The session roster — powers the recipient picker and DM labels. */
  roster?: RosterEntry[];
  /** The id of the message the facilitator has spotlighted, if any. */
  spotlightId?: string | null;
  onChanged: () => void;
}

// A message's recipient.
type Target =
  | { kind: "group" }
  | { kind: "facilitator" }
  | { kind: "participant"; id: string };

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

const MODE_LABEL: Record<ChatMode, string> = {
  group: "Group + facilitator",
  facilitator: "Facilitator only",
  open: "Open (group + DMs)",
};

const MODE_HINT: Record<ChatMode, string> = {
  group: "Participants can post to everyone or privately to you.",
  facilitator: "Participants can only message you — no group thread.",
  open: "Participants can also message each other privately.",
};

export function Chat({
  sessionId,
  messages,
  participantId,
  participantName,
  canModerate = false,
  chatMode,
  roster = [],
  spotlightId = null,
  onChanged,
}: Props) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<Target>({ kind: "group" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const countRef = useRef(0);

  // People the viewer can address (participants other than themselves).
  const others = useMemo(
    () => roster.filter((p) => !p.isFacilitator && p.id !== participantId),
    [roster, participantId]
  );
  const nameOf = (pid: string | null) =>
    (pid && roster.find((p) => p.id === pid)?.name) || "someone";

  // Keep the selected recipient valid as the mode changes or people leave.
  useEffect(() => {
    if (canModerate) return; // the facilitator's options never get restricted
    if (chatMode === "facilitator") {
      setTarget({ kind: "facilitator" });
    } else if (
      target.kind === "participant" &&
      (chatMode !== "open" || !others.some((p) => p.id === target.id))
    ) {
      setTarget({ kind: "group" });
    }
  }, [chatMode, canModerate, others, target]);

  // Scroll to the newest message when one arrives.
  useEffect(() => {
    if (messages.length !== countRef.current) {
      countRef.current = messages.length;
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages]);

  const canPost = !!participantId || canModerate;

  // Options for the recipient picker, tailored to who's viewing + the mode.
  const recipientOptions: { value: string; label: string; t: Target }[] =
    useMemo(() => {
      if (canModerate) {
        return [
          { value: "group", label: "Everyone", t: { kind: "group" } as Target },
          ...others.map((p) => ({
            value: `p:${p.id}`,
            label: `${p.name} (private)`,
            t: { kind: "participant", id: p.id } as Target,
          })),
        ];
      }
      const opts: { value: string; label: string; t: Target }[] = [];
      if (chatMode !== "facilitator")
        opts.push({ value: "group", label: "Everyone", t: { kind: "group" } });
      opts.push({
        value: "facilitator",
        label: "Facilitator (private)",
        t: { kind: "facilitator" },
      });
      if (chatMode === "open")
        for (const p of others)
          opts.push({
            value: `p:${p.id}`,
            label: `${p.name} (private)`,
            t: { kind: "participant", id: p.id },
          });
      return opts;
    }, [canModerate, chatMode, others]);

  const targetValue =
    target.kind === "group"
      ? "group"
      : target.kind === "facilitator"
        ? "facilitator"
        : `p:${target.id}`;

  function pickTarget(value: string) {
    const found = recipientOptions.find((o) => o.value === value);
    if (found) setTarget(found.t);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await fetch(`/api/sessions/${sessionId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: text,
          participantId,
          name: participantName,
          toFacilitator: target.kind === "facilitator",
          toParticipantId:
            target.kind === "participant" ? target.id : undefined,
        }),
      });
      setDraft("");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove(messageId: string) {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/sessions/${sessionId}/chat`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, participantId }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function setMode(mode: ChatMode) {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/sessions/${sessionId}/chat`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatMode: mode }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  // Spotlight a message to the room, or clear the current one (facilitator).
  async function spotlight(messageId: string | null, style?: "banner" | "card") {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/sessions/${sessionId}/chat`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          messageId === null
            ? { spotlight: null }
            : { spotlight: { messageId, style } }
        ),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  // Can the viewer reply privately to this incoming message's sender?
  function replyTargetFor(m: ChatMessage): Target | null {
    if (m.mine) return null;
    if (canModerate) {
      // Facilitator answers a participant's private line back to them.
      if (m.toFacilitator && m.fromParticipantId)
        return { kind: "participant", id: m.fromParticipantId };
      return null;
    }
    // Participant replies to a DM addressed to them.
    if (!m.direct) return null;
    if (m.fromFacilitator) return { kind: "facilitator" };
    if (m.fromParticipantId && chatMode === "open")
      return { kind: "participant", id: m.fromParticipantId };
    return null;
  }

  function reply(m: ChatMessage) {
    const t = replyTargetFor(m);
    if (!t) return;
    setTarget(t);
    inputRef.current?.focus();
  }

  // A short "to …" tag for any message not sent to the whole group.
  function scopeLabel(m: ChatMessage): string | null {
    if (!m.direct) return null;
    if (canModerate) {
      // Facilitator's view of the traffic.
      if (m.toFacilitator) return m.mine ? null : "private to you";
      if (m.toParticipantId) {
        if (m.mine) return `to ${nameOf(m.toParticipantId)}`;
        return `→ ${nameOf(m.toParticipantId)}`; // a participant-to-participant DM
      }
      return null;
    }
    // Participant's view.
    if (m.toFacilitator) return m.mine ? "to facilitator" : null;
    if (m.mine && m.toParticipantId) return `to ${nameOf(m.toParticipantId)}`;
    return "private"; // a DM addressed to me (from the facilitator or a peer)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Facilitator: chat-mode control */}
      {canModerate && (
        <div className="shrink-0 mb-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            className="flex w-full items-center justify-between text-[11px] font-semibold text-slate-500"
          >
            <span>
              Chat access:{" "}
              <span className="text-slate-700">{MODE_LABEL[chatMode]}</span>
            </span>
            <span className="text-slate-400">{settingsOpen ? "▲" : "⚙"}</span>
          </button>
          {settingsOpen && (
            <div className="mt-2 flex flex-col gap-1">
              {(["group", "facilitator", "open"] as ChatMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  disabled={busy}
                  className={`text-left rounded-md px-2 py-1 text-[11px] transition ${
                    chatMode === m
                      ? "bg-indigo-600 text-white"
                      : "bg-white border border-slate-200 text-slate-600 hover:border-indigo-300"
                  }`}
                >
                  <span className="font-semibold">{MODE_LABEL[m]}</span>
                  <span
                    className={`block ${chatMode === m ? "text-indigo-100" : "text-slate-400"}`}
                  >
                    {MODE_HINT[m]}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 px-1 py-1">
        {messages.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-6">
            No messages yet — say hello.
          </p>
        )}
        {messages.map((m) => {
          const scope = scopeLabel(m);
          return (
            <div
              key={m.id}
              className={`group flex flex-col ${m.mine ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${
                  m.mine
                    ? m.direct
                      ? "bg-indigo-500 text-white ring-1 ring-indigo-300"
                      : "bg-indigo-600 text-white"
                    : m.fromFacilitator
                      ? "bg-amber-50 border border-amber-200 text-slate-800"
                      : m.direct
                        ? "bg-violet-50 border border-violet-200 text-slate-800"
                        : "bg-slate-100 text-slate-800"
                }`}
              >
                {!m.mine && (
                  <p
                    className={`text-[10px] font-semibold mb-0.5 ${m.fromFacilitator ? "text-amber-600" : "text-slate-500"}`}
                  >
                    {m.name}
                    {m.fromFacilitator && " · facilitator"}
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 px-1">
                {scope && (
                  <span className="text-[10px] font-medium text-violet-500">
                    {scope}
                  </span>
                )}
                {spotlightId === m.id && (
                  <span className="text-[10px] font-semibold text-amber-500">
                    ★ spotlighted
                  </span>
                )}
                <span className="text-[10px] text-slate-400">
                  {fmtTime(m.at)}
                </span>
                {replyTargetFor(m) && (
                  <button
                    onClick={() => reply(m)}
                    className="text-[10px] text-slate-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                  >
                    reply
                  </button>
                )}
                {/* Facilitator: promote a message to the room. */}
                {canModerate &&
                  (spotlightId === m.id ? (
                    <button
                      onClick={() => spotlight(null)}
                      disabled={busy}
                      className="text-[10px] text-amber-600 hover:text-amber-700 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                    >
                      clear
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => spotlight(m.id, "banner")}
                        disabled={busy}
                        className="text-[10px] text-slate-400 hover:text-amber-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                        title="Pin as a banner over the room"
                      >
                        banner
                      </button>
                      <button
                        onClick={() => spotlight(m.id, "card")}
                        disabled={busy}
                        className="text-[10px] text-slate-400 hover:text-amber-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                        title="Present full-screen on the projector"
                      >
                        present
                      </button>
                    </>
                  ))}
                {(m.mine || canModerate) && (
                  <button
                    onClick={() => remove(m.id)}
                    className="text-[10px] text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                  >
                    delete
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {canPost ? (
        <form onSubmit={send} className="mt-2 flex flex-col gap-1.5 shrink-0">
          {recipientOptions.length > 1 && (
            <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
              To:
              <select
                value={targetValue}
                onChange={(e) => pickTarget(e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {recipientOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex gap-1.5">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                target.kind === "group"
                  ? "Message everyone…"
                  : target.kind === "facilitator"
                    ? "Message the facilitator…"
                    : `Message ${nameOf(target.id)}…`
              }
              maxLength={1000}
              className="flex-1 min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-2 text-xs text-slate-400 text-center shrink-0">
          Join the session to chat.
        </p>
      )}
    </div>
  );
}
