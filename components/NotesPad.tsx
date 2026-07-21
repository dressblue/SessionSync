"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  sessionId: string;
  participantId: string;
  sessionTitle: string;
}

type SaveState = "idle" | "saving" | "saved" | "error";

// Personal rich-text notes. Server-persisted (survives reconnects and device
// switches) and shareable through the device's own facilities: the native
// share sheet where available, email, or the clipboard.
export function NotesPad({ sessionId, participantId, sessionTitle }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && !!navigator.share);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/sessions/${sessionId}/notes?participantId=${encodeURIComponent(participantId)}`
        );
        const data = await res.json();
        if (!cancelled && editorRef.current) {
          editorRef.current.innerHTML = data.content ?? "";
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, participantId]);

  const save = useCallback(async () => {
    if (!editorRef.current) return;
    setSaveState("saving");
    try {
      const res = await fetch(`/api/sessions/${sessionId}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId,
          content: editorRef.current.innerHTML,
        }),
      });
      setSaveState(res.ok ? "saved" : "error");
    } catch {
      setSaveState("error");
    }
  }, [sessionId, participantId]);

  const scheduleSave = useCallback(() => {
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 800);
  }, [save]);

  // Flush pending edits when the tab is hidden or closed.
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        save();
      }
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, [save]);

  function exec(command: string) {
    editorRef.current?.focus();
    document.execCommand(command);
    scheduleSave();
  }

  function plainText(): string {
    return editorRef.current?.innerText.trim() ?? "";
  }

  async function shareNative() {
    try {
      await navigator.share({
        title: `Notes — ${sessionTitle}`,
        text: plainText(),
      });
    } catch {
      /* user dismissed the share sheet */
    }
  }

  function shareEmail() {
    const subject = encodeURIComponent(`Notes — ${sessionTitle}`);
    const body = encodeURIComponent(plainText());
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(plainText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  const toolbarBtn =
    "rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100";

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-0.5 border-b border-slate-100 px-2 py-1.5">
        <button onClick={() => exec("bold")} className={`${toolbarBtn} font-bold`} title="Bold">
          B
        </button>
        <button onClick={() => exec("italic")} className={`${toolbarBtn} italic`} title="Italic">
          I
        </button>
        <button onClick={() => exec("underline")} className={`${toolbarBtn} underline`} title="Underline">
          U
        </button>
        <button onClick={() => exec("insertUnorderedList")} className={toolbarBtn} title="Bullet list">
          • List
        </button>
        <button onClick={() => exec("insertOrderedList")} className={toolbarBtn} title="Numbered list">
          1. List
        </button>
        <span className="ml-auto text-[10px] text-slate-400 pr-1">
          {saveState === "saving"
            ? "Saving…"
            : saveState === "saved"
              ? "Saved"
              : saveState === "error"
                ? "Save failed — retrying on next edit"
                : ""}
        </span>
      </div>
      <div
        ref={editorRef}
        contentEditable={loaded}
        suppressContentEditableWarning
        onInput={scheduleSave}
        data-placeholder="Your private notes for this session…"
        className="notes-editor flex-1 overflow-y-auto px-3 py-2 text-sm focus:outline-none"
      />
      <div className="border-t border-slate-100 p-2 flex gap-1.5">
        {canNativeShare && (
          <button
            onClick={shareNative}
            className="flex-1 rounded-lg bg-indigo-600 text-white px-2 py-1.5 text-xs font-medium hover:bg-indigo-700"
          >
            Share…
          </button>
        )}
        <button
          onClick={shareEmail}
          className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Email
        </button>
        <button
          onClick={copyText}
          className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}
