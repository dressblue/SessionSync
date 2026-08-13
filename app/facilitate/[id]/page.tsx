"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import {
  useSessionState,
  type StepTool,
  type WorkflowGraph,
} from "@/components/useSessionState";
import { WorkflowBuilder } from "@/components/WorkflowBuilder";
import {
  SurveyBuilder,
  newSurveyQuestion,
  type SurveyQ,
} from "@/components/SurveyBuilder";
import {
  ChecklistBuilder,
  newChecklistStatement,
  type ChecklistStatement,
} from "@/components/ChecklistBuilder";
import { BlocksBuilder } from "@/components/BlocksBuilder";
import { Markdown } from "@/components/Markdown";
import { ActivityConsole } from "@/components/ActivityConsole";
import { Chat } from "@/components/Chat";
import { SpotlightBanner } from "@/components/SpotlightMessage";
import { LIKERT_ANCHOR_LABELS } from "@/lib/likert";
import { shareOrigin } from "@/lib/appOrigin";

const TOOL_BADGES: Record<string, string> = {
  vote: "Vote",
  likert: "Score",
  columns: "Board",
  reveal: "Reveal",
  wheel: "Network",
  workflow: "Flow",
  whiteboard: "Draw",
  exhibit: "Present",
  video: "Video",
  timer: "Timer",
  wordcloud: "Cloud",
  sort: "Sort",
  impact1: "Impact 1",
  impact2: "Impact 2",
  impact3: "Impact 3",
  impact4: "Impact 4",
  survey: "Survey",
  slides: "Slides",
  checklist: "Checklist",
  blocks: "Blocks",
  secrets: "Secrets",
};

// Compact delete affordance (replaces the word "Delete" to save row space).
function TrashIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M8.75 1a1 1 0 0 0-.95.68L7.32 3H4a1 1 0 0 0 0 2h.11l.86 11.14A2 2 0 0 0 6.96 18h6.08a2 2 0 0 0 1.99-1.86L15.89 5H16a1 1 0 1 0 0-2h-3.32l-.48-1.32A1 1 0 0 0 11.25 1h-2.5ZM9 7.25a.75.75 0 0 0-1.5 0v6a.75.75 0 0 0 1.5 0v-6Zm3.5 0a.75.75 0 0 0-1.5 0v6a.75.75 0 0 0 1.5 0v-6Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <path d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-.793.793-2.828-2.828.793-.793ZM11.379 5.793 3 14.172V17h2.828l8.38-8.379-2.83-2.828Z" />
    </svg>
  );
}

function Console() {
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const [checked, setChecked] = useState(false);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  // Agenda editing state
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [addStepOpen, setAddStepOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  // Most-recently-shown step id — the fallback target for "Save to step" from a
  // live activity when the session is in the holding view (no step on screen).
  const lastShownStepIdRef = useRef<string | null>(null);
  // The presenter/projector window we opened (Presenter View button or the QR
  // launcher), so the QR toggle can close a window it opened itself.
  const presenterWin = useRef<Window | null>(null);
  const qrOpenedPresenter = useRef(false);

  // Step-tool editor state
  const [toolsOpenFor, setToolsOpenFor] = useState<string | null>(null);
  const [toolKind, setToolKind] = useState<
    | "vote"
    | "quiz"
    | "likert"
    | "columns"
    | "reveal"
    | "wheel"
    | "workflow"
    | "whiteboard"
    | "exhibit"
    | "video"
    | "timer"
    | "wordcloud"
    | "sort"
    | "impact1"
    | "impact2"
    | "impact3"
    | "impact4"
    | "survey"
    | "slides"
    | "checklist"
    | "blocks"
    | "secrets"
  >("vote");
  const [toolPrompt, setToolPrompt] = useState("");
  const [toolList, setToolList] = useState("");
  // Word-sort columns (comma- or newline-separated); the word list uses toolList.
  const [toolSortColumns, setToolSortColumns] = useState("");
  // Impact 1/2/3/4 scale config for the step-tool authoring form.
  const [toolImpactScales, setToolImpactScales] = useState<
    { name: string; anchorSet: string; allowNA: boolean }[]
  >([
    { name: "", anchorSet: "agreement", allowNA: false },
    { name: "", anchorSet: "agreement", allowNA: false },
    { name: "", anchorSet: "agreement", allowNA: false },
    { name: "", anchorSet: "agreement", allowNA: false },
  ]);
  // Survey step-tool config — each question carries its own mode + comment.
  const [toolSurveyQuestions, setToolSurveyQuestions] = useState<SurveyQ[]>([
    newSurveyQuestion(),
  ]);
  const [toolGraph, setToolGraph] = useState<WorkflowGraph | null>(null);
  const [toolSourced, setToolSourced] = useState(false);
  const [editingToolId, setEditingToolId] = useState<string | null>(null);
  const [toolExhibitType, setToolExhibitType] = useState<"file" | "url" | "text">("file");
  const [toolExhibitRef, setToolExhibitRef] = useState("");
  const [toolAnchorSet, setToolAnchorSet] = useState("agreement");
  const [toolTimerMin, setToolTimerMin] = useState(5);
  // Slides step-tool config: which course deck + the page range to play.
  const [toolDeckId, setToolDeckId] = useState("");
  const [toolStartPage, setToolStartPage] = useState(1);
  const [toolEndPage, setToolEndPage] = useState(1);
  // Checklist step-tool config: shared columns + statement rows + display-only.
  const [toolChecklistColumns, setToolChecklistColumns] = useState<string[]>([
    "",
    "",
  ]);
  const [toolChecklistStatements, setToolChecklistStatements] = useState<
    ChecklistStatement[]
  >([newChecklistStatement()]);
  const [toolDisplayOnly, setToolDisplayOnly] = useState(false);
  const [toolBlockLabels, setToolBlockLabels] = useState<string[]>([
    "",
    "",
    "",
  ]);
  const [decks, setDecks] = useState<
    { id: string; title: string; url: string; pageCount: number }[]
  >([]);
  // Tool library
  const [viewerAdmin, setViewerAdmin] = useState(false);
  const [libPickFor, setLibPickFor] = useState<string | null>(null);
  const [libTools, setLibTools] = useState<
    { id: string; name: string; description: string; category: string; kind: string }[] | null
  >(null);
  const [libQ, setLibQ] = useState("");
  // Every session's steps in this course, so a tool can be moved/copied to a
  // step in another session (e.g. 4.5 → 5.5).
  const [courseSteps, setCourseSteps] = useState<
    {
      sessionId: string;
      sessionTitle: string;
      sessionPos: number;
      steps: { id: string; title: string; pos: number }[];
    }[]
  >([]);

  useEffect(() => {
    setChecked(true);
    setOrigin(shareOrigin());
    // Restore an unsent "add step" draft after a reload or dropped tab.
    const draft = localStorage.getItem(`ss_draft_${id}`);
    if (draft) {
      try {
        const { title, content } = JSON.parse(draft);
        setNewTitle(title ?? "");
        setNewContent(content ?? "");
        // Surface an unsent draft so it isn't hidden behind the collapse.
        if (title || content) setAddStepOpen(true);
      } catch {
        localStorage.removeItem(`ss_draft_${id}`);
      }
    }
  }, [id]);

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

  // The facilitator's own roster seat, so they can participate in activities
  // like a student while keeping full control. Auth rides the Clerk cookie.
  const [myPid, setMyPid] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!checked || myPid) return;
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${id}/participate`, {
          method: "POST",
        });
        if (res.ok) {
          const data = await res.json();
          setMyPid(data.participantId);
        }
      } catch {
        /* participation is optional; console still works without it */
      }
    })();
  }, [checked, id, myPid]);

  const { state, error, refresh } = useSessionState(id, {
    intervalMs: 2000,
    participantId: myPid,
  });

  const api = useCallback(
    async (path: string, method: string, body?: unknown) => {
      setActionError(null);
      try {
        const res = await fetch(path, {
          method,
          headers: { "Content-Type": "application/json" },
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
    [refresh]
  );

  // Is the viewer an admin? (gates the "⭐ To library" promote action)
  useEffect(() => {
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setViewerAdmin(!!d?.isAdmin))
      .catch(() => {});
  }, []);

  // Remember the last step actually on screen (survives deselect → holding view).
  const shownStepId = state?.steps?.[state?.session?.currentStep ?? -1]?.id;
  useEffect(() => {
    if (shownStepId) lastShownStepIdRef.current = shownStepId;
  }, [shownStepId]);

  // Load every session's steps in this course for the Move/Copy picker.
  const courseId = state?.session.courseId;
  useEffect(() => {
    if (!courseId) return;
    fetch(`/api/courses/${courseId}/steps`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.sessions && setCourseSteps(d.sessions))
      .catch(() => {});
    // The course's slide decks feed the Slides tool's deck picker.
    fetch(`/api/courses/${courseId}/decks`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.decks && setDecks(d.decks))
      .catch(() => {});
  }, [courseId]);

  // Scope the picker to this course's library (global items + course-scoped).
  function libScopeParam() {
    return state?.session.courseId
      ? `courseId=${encodeURIComponent(state.session.courseId)}`
      : "";
  }
  async function openLibPicker(stepId: string) {
    setLibPickFor(stepId);
    setLibQ("");
    const res = await fetch(`/api/tool-library?${libScopeParam()}`, {
      cache: "no-store",
    });
    if (res.ok) setLibTools((await res.json()).tools);
  }
  async function searchLib(q: string) {
    setLibQ(q);
    const res = await fetch(
      `/api/tool-library?q=${encodeURIComponent(q)}&${libScopeParam()}`,
      { cache: "no-store" }
    );
    if (res.ok) setLibTools((await res.json()).tools);
  }
  async function cloneFromLibrary(templateId: string) {
    if (!libPickFor) return;
    const ok = await api(
      `/api/sessions/${id}/steps/${libPickFor}/tools`,
      "POST",
      { fromTemplateId: templateId }
    );
    if (ok) {
      setLibPickFor(null);
      setLibTools(null);
    }
  }
  async function promoteToLibrary(tool: StepTool) {
    const name = window.prompt(
      "Save this tool to the library as:",
      tool.prompt || tool.kind
    );
    if (name == null || !name.trim()) return;
    const category =
      window.prompt("Category (optional — e.g. Workflow, Hello session):", "") ??
      "";
    const res = await fetch("/api/tool-library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromStepToolId: tool.id,
        name: name.trim(),
        category: category.trim(),
      }),
    });
    setActionError(res.ok ? "Saved to the tool library ✓" : "Could not save to library");
  }

  const control = (action: string, step?: number) => {
    // Any step-navigation collapses an open Tools editor — UNLESS we're moving
    // to the very step it belongs to (e.g. the amber "Show this step" jump).
    // Otherwise the panel lingers against a step that's no longer showing.
    const st = state?.steps ?? [];
    const cur = state?.session.currentStep ?? -1;
    const dest =
      action === "goto"
        ? st[step ?? -1]?.id
        : action === "next"
          ? st[cur + 1]?.id
          : action === "prev"
            ? st[cur - 1]?.id
            : action === "start"
              ? st[0]?.id
              : action === "deselect"
                ? null
                : undefined; // refresh/end/etc. → don't touch the Tools panel
    if (dest !== undefined && toolsOpenFor && toolsOpenFor !== dest) {
      setToolsOpenFor(null);
      resetToolForm();
    }
    // Moving to another step (Next / Back / Show) "saves & closes" any LIVE
    // tools (status=closed → kept for the session report) so a tool never
    // lingers over the next step's content. (deselect/refresh keep them.)
    if (action === "next" || action === "prev" || action === "goto") {
      for (const a of state?.activities ?? []) {
        api(`/api/sessions/${id}/activities/${a.id}`, "PATCH", {
          status: "closed",
        });
      }
    }
    return api(`/api/sessions/${id}/control`, "POST", { action, step });
  };

  // Nudge a presenter-screen size multiplier (text-only or zoom-everything).
  const bumpPresenter = (which: "text" | "zoom", delta: number) => {
    const s = state?.session;
    if (!s) return;
    const cur = which === "text" ? s.presenterTextScale : s.presenterZoomScale;
    const next = Math.min(3, Math.max(0.6, Math.round((cur + delta) * 20) / 20));
    return api(`/api/sessions/${id}/control`, "POST", {
      action: which === "text" ? "textScale" : "zoomScale",
      scale: next,
    });
  };

  // Open the read-only projector window (shared in Zoom/Teams), keeping a handle.
  const openPresenter = () => {
    presenterWin.current = window.open(
      `${origin || ""}/present/${id}`,
      "SessionSyncPresenter",
      "width=1280,height=800"
    );
    return presenterWin.current;
  };

  // Toggle the join-QR takeover on the projector. When no presenter is open, the
  // QR launcher opens one; deactivating then closes the window it opened.
  const toggleQr = async () => {
    const s = state?.session;
    if (!s) return;
    if (s.presentQr) {
      await api(`/api/sessions/${id}/control`, "POST", { action: "qr", on: false });
      if (qrOpenedPresenter.current) {
        presenterWin.current?.close();
        presenterWin.current = null;
        qrOpenedPresenter.current = false;
      }
    } else {
      await api(`/api/sessions/${id}/control`, "POST", { action: "qr", on: true });
      const haveOpenWin = !!(presenterWin.current && !presenterWin.current.closed);
      if (!s.presenterLive && !haveOpenWin) {
        openPresenter();
        qrOpenedPresenter.current = true;
      }
    }
  };

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

  function resetToolForm() {
    setToolPrompt("");
    setToolList("");
    setToolGraph(null);
    setToolSourced(false);
    setEditingToolId(null);
    setToolExhibitType("file");
    setToolExhibitRef("");
    setToolAnchorSet("agreement");
    setToolTimerMin(5);
    setToolSortColumns("");
    setToolImpactScales([
      { name: "", anchorSet: "agreement", allowNA: false },
      { name: "", anchorSet: "agreement", allowNA: false },
      { name: "", anchorSet: "agreement", allowNA: false },
      { name: "", anchorSet: "agreement", allowNA: false },
    ]);
    setToolSurveyQuestions([newSurveyQuestion()]);
    setToolChecklistColumns(["", ""]);
    setToolChecklistStatements([newChecklistStatement()]);
    setToolDisplayOnly(false);
    setToolBlockLabels(["", "", ""]);
  }

  async function saveTool(stepId: string) {
    const list = toolList
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const body: Record<string, unknown> = {
      kind: toolKind,
      prompt: toolPrompt,
    };
    if (toolKind === "columns") body.columns = list;
    else if (toolKind === "exhibit") {
      body.exhibit = toolExhibitType;
      if (toolExhibitType === "file") body.fileId = toolExhibitRef;
      else if (toolExhibitType === "url") body.url = toolExhibitRef;
      else body.text = toolList;
    } else if (toolKind === "video") {
      body.url = toolExhibitRef;
    } else if (toolKind === "timer") {
      body.minutes = toolTimerMin;
    } else if (toolKind === "workflow") {
      body.graph = toolGraph;
      // A workflow's name is optional — fall back to the start step's title.
      if (!toolPrompt.trim()) {
        const start =
          toolGraph?.nodes.find((n) => n.id === toolGraph.startId) ??
          toolGraph?.nodes[0];
        body.prompt = start?.title || "Workflow";
      }
    } else if ((toolKind === "vote" || toolKind === "likert") && toolSourced)
      body.sourcing = "participants";
    else if (toolKind === "vote") body.options = list;
    else if (toolKind === "wordcloud") body.words = list;
    else if (toolKind === "sort") {
      body.words = list;
      body.columns = toolSortColumns
        .split(/[,\n]/)
        .map((c) => c.trim())
        .filter(Boolean);
    } else if (
      toolKind === "impact1" ||
      toolKind === "impact2" ||
      toolKind === "impact3" ||
      toolKind === "impact4"
    ) {
      const n =
        toolKind === "impact4"
          ? 4
          : toolKind === "impact3"
            ? 3
            : toolKind === "impact2"
              ? 2
              : 1;
      body.scales = toolImpactScales.slice(0, n);
    } else if (toolKind === "survey") {
      body.questions = toolSurveyQuestions
        .map((q) => ({
          text: q.text.trim(),
          options: q.options.map((o) => o.trim()).filter(Boolean),
          mode: q.mode,
          commentLabel: q.commentLabel.trim(),
        }))
        .filter((q) => q.text && q.options.length >= 1);
    } else if (toolKind === "slides") {
      body.deckId = toolDeckId;
      body.startPage = toolStartPage;
      body.endPage = toolEndPage;
    } else if (toolKind === "checklist") {
      body.columns = toolChecklistColumns.map((c) => c.trim()).filter(Boolean);
      body.statements = toolChecklistStatements
        .map((s) => ({ text: s.text.trim(), mode: s.mode }))
        .filter((s) => s.text);
      body.displayOnly = toolDisplayOnly;
    } else if (toolKind === "blocks") {
      body.blockLabels = toolBlockLabels.map((l) => l.trim());
      body.blocks = toolBlockLabels.length;
    } else if (toolKind !== "whiteboard" && toolKind !== "secrets")
      body.items = list;
    if (toolKind === "likert") body.anchorSet = toolAnchorSet;
    const ok = await api(
      editingToolId
        ? `/api/sessions/${id}/steps/${stepId}/tools/${editingToolId}`
        : `/api/sessions/${id}/steps/${stepId}/tools`,
      editingToolId ? "PATCH" : "POST",
      body
    );
    if (ok) resetToolForm();
  }

  function beginToolEdit(stepId: string, t: StepTool) {
    setToolsOpenFor(stepId);
    setEditingToolId(t.id);
    setToolKind(t.kind);
    setToolPrompt(t.prompt);
    setToolSourced(t.sourcing === "participants");
    setToolAnchorSet(t.anchorSet ?? "agreement");
    setToolTimerMin(t.minutes ?? 5);
    setToolExhibitType(t.exhibit ?? "file");
    setToolExhibitRef(
      t.kind === "video"
        ? (t.url ?? "")
        : t.exhibit === "url"
          ? (t.url ?? "")
          : (t.fileId ?? "")
    );
    setToolList(
      t.exhibit === "text"
        ? (t.text ?? "")
        : (t.words ?? t.options ?? t.items ?? t.columns ?? []).join("\n")
    );
    setToolSortColumns((t.columns ?? []).join(", "));
    setToolImpactScales(
      [0, 1, 2, 3].map(
        (i) =>
          t.scales?.[i] ?? { name: "", anchorSet: "agreement", allowNA: false }
      )
    );
    setToolSurveyQuestions(
      t.questions && t.questions.length
        ? t.questions.map((q) => ({
            text: q.text,
            options: [...q.options],
            mode: q.mode === "multi" ? "multi" : "single",
            commentLabel: q.commentLabel ?? "",
          }))
        : [newSurveyQuestion()]
    );
    setToolGraph(t.graph ?? null);
    setToolDeckId(t.deckId ?? "");
    setToolStartPage(t.startPage ?? 1);
    setToolEndPage(t.endPage ?? 1);
    setToolChecklistColumns(
      t.columns && t.columns.length >= 2 ? [...t.columns] : ["", ""]
    );
    setToolChecklistStatements(
      t.statements && t.statements.length
        ? t.statements.map((s) => ({
            text: s.text,
            mode: s.mode === "single" ? "single" : "multi",
          }))
        : [newChecklistStatement()]
    );
    setToolDisplayOnly(!!t.displayOnly);
    setToolBlockLabels(
      t.blockLabels && t.blockLabels.length
        ? [...t.blockLabels]
        : Array.from({ length: t.blocks ?? 3 }, () => "")
    );
  }

  function launchTool(tool: StepTool) {
    api(`/api/sessions/${id}/activities`, "POST", {
      stepToolId: tool.id,
      kind: tool.kind,
      prompt: tool.prompt,
      options: tool.options,
      columns: tool.columns,
      words: tool.words,
      // A saved word cloud carries its facilitator seed list in `words`; the
      // activities route seeds the cloud from `seedWords`.
      seedWords: tool.kind === "wordcloud" ? tool.words : undefined,
      scales: tool.scales,
      mode: tool.mode,
      questions: tool.questions,
      items: tool.items,
      graph: tool.graph,
      sourcing: tool.sourcing,
      anchorSet: tool.anchorSet,
      exhibit: tool.exhibit,
      fileId: tool.fileId,
      url: tool.url,
      text: tool.text,
      minutes: tool.minutes,
      mediaType: tool.mediaType,
      deckId: tool.deckId,
      startPage: tool.startPage,
      endPage: tool.endPage,
      statements: tool.statements,
      displayOnly: tool.displayOnly,
      blocks: tool.blocks,
      blockLabels: tool.blockLabels,
    });
  }

  // Move a tool to another step, or clone a copy into it. `spec` is
  // "move:<stepId>" or "clone:<stepId>" from the row's Move/Copy picker.
  async function relocateTool(
    fromStepId: string,
    toolId: string,
    spec: string
  ) {
    const [action, toStepId] = spec.split(":");
    if (!toStepId) return;
    if (editingToolId === toolId) resetToolForm();
    await api(
      `/api/sessions/${id}/steps/${fromStepId}/tools/${toolId}`,
      "PATCH",
      action === "clone"
        ? { cloneToStepId: toStepId }
        : { moveToStepId: toStepId }
    );
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

  if (!state) {
    return (
      <main className="flex-1 flex items-center justify-center text-slate-500">
        {error ?? "Loading session…"}
      </main>
    );
  }

  const { session, steps, participants, activities, pastActivities, spotlight } =
    state;
  const isCourseSession = !!session.courseId;
  // Which step tools are live right now → the id of the open activity each one
  // launched, so a tool row can show a "live" state and close it in one click.
  const liveActivityByTool = new Map<string, string>();
  for (const a of activities) {
    if (a.stepToolId) liveActivityByTool.set(a.stepToolId, a.id);
  }
  const stepHasLiveTool = (s: (typeof steps)[number]) =>
    s.tools.some((t) => liveActivityByTool.has(t.id));
  // Which step each open activity was launched from. The live panels render
  // newest-first, so the LAST activity is the top of the stack; its step is the
  // "Active" (rose) step, and any second live tool's step gets a distinct colour.
  const stepIndexForActivity = (a: (typeof activities)[number]) =>
    a.stepToolId
      ? steps.findIndex((s) => s.tools.some((t) => t.id === a.stepToolId))
      : -1;
  const stepNameByActivity = new Map<string, string>();
  for (const a of activities) {
    const idx = stepIndexForActivity(a);
    if (idx >= 0) stepNameByActivity.set(a.id, `${idx + 1}. ${steps[idx].title}`);
  }
  const topActivity = activities[activities.length - 1];
  const secondActivity =
    activities.length >= 2 ? activities[activities.length - 2] : undefined;
  const topIdx = topActivity ? stepIndexForActivity(topActivity) : -1;
  const secondIdx = secondActivity ? stepIndexForActivity(secondActivity) : -1;
  const topStepId = topIdx >= 0 ? steps[topIdx].id : null;
  const secondStepId =
    secondIdx >= 0 && steps[secondIdx].id !== topStepId
      ? steps[secondIdx].id
      : null;
  // Move/Copy targets, grouped by session (a step's own title carries whatever
  // numbering the facilitator gave it). Falls back to just this session's steps
  // until the course-wide list loads.
  const moveGroups: { title: string; steps: { id: string; title: string }[] }[] =
    courseSteps.length
      ? courseSteps.map((sess) => ({
          title: sess.sessionTitle,
          steps: sess.steps.map((st) => ({ id: st.id, title: st.title })),
        }))
      : [
          {
            title: session.title,
            steps: steps.map((st) => ({ id: st.id, title: st.title })),
          },
        ];
  const moveTargetCount = (excludeId: string) =>
    moveGroups.reduce(
      (n, g) => n + g.steps.filter((st) => st.id !== excludeId).length,
      0
    );
  const keyActive =
    !!session.joinKey &&
    !!session.joinKeyExpires &&
    new Date(session.joinKeyExpires).getTime() > Date.now();
  const studentCode = isCourseSession ? (keyActive ? session.joinKey : null) : session.code;
  const joinUrl = origin && studentCode ? `${origin}/join?code=${studentCode}` : "";
  const keyExpiryLabel = (() => {
    if (!session.joinKeyExpires) return "";
    const ms = new Date(session.joinKeyExpires).getTime() - Date.now();
    if (ms <= 0) return "expired";
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return h > 0 ? `expires in ${h}h ${m}m` : `expires in ${m}m`;
  })();
  const current = steps[session.currentStep];
  const prevStep = steps[session.currentStep - 1];
  const nextStep = steps[session.currentStep + 1];
  // "Save to step" target: the step on screen, else the last one shown, else the
  // first step — so a live tool is always saveable, even in the holding view.
  const saveToStepTarget =
    current ??
    steps.find((s) => s.id === lastShownStepIdRef.current) ??
    steps[0];
  const online = participants.filter((p) => p.online);
  // Split the roster so facilitators and participants sit in their own labelled
  // groups instead of intermixing (distinguished only by a small badge before).
  const facilitatorList = participants.filter((p) => p.isFacilitator);
  const attendeeList = participants.filter((p) => !p.isFacilitator);
  const renderPerson = (p: (typeof participants)[number]) => (
    <li key={p.id} className="flex items-center gap-2 text-sm group">
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${
          p.online ? "bg-emerald-500" : "bg-slate-300"
        }`}
      />
      <span className={`truncate ${p.online ? "" : "text-slate-400"}`}>
        {p.name}
      </span>
      {!p.isFacilitator && (
        <button
          onClick={() => {
            if (confirm(`Remove ${p.name} from this session?`)) {
              api(`/api/sessions/${id}/participants/${p.id}`, "DELETE");
            }
          }}
          title="End this participant's session"
          className="ml-auto shrink-0 text-xs text-slate-300 hover:text-rose-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
        >
          Remove
        </button>
      )}
    </li>
  );
  // When the session is live and no tool/activity is open, the current step's own
  // content is exactly what participants see — so the step itself is "broadcasting".
  // The moment any tool goes live, participants see the tool instead, so we suppress
  // the step's broadcast highlight and let the tool's own live indicators carry it.
  const broadcasting = session.status === "live" && activities.length === 0;

  const statusBadge = {
    lobby: "bg-slate-100 text-slate-600",
    live: "bg-emerald-100 text-emerald-700",
    ended: "bg-rose-100 text-rose-700",
  }[session.status];

  // Presenter-screen size controls: only meaningful while a projector is open
  // (presenterLive), so they surface only then, as a slim strip under the header
  // (right-aligned, beneath the Presenter View button). Two independent
  // multipliers — Text scales rem type only; Zoom scales the whole projector.
  const presenterSizeControls = session.presenterLive ? (
    <div className="border-b border-slate-200 bg-white px-6 py-2 flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">
        ▶ Presenter size
      </span>
      {(
        [
          ["Text", "text", session.presenterTextScale],
          ["Zoom", "zoom", session.presenterZoomScale],
        ] as const
      ).map(([label, which, val]) => (
        <div key={which} className="flex items-center gap-1">
          <span className="w-9 text-xs text-slate-500">{label}</span>
          <button
            onClick={() => bumpPresenter(which, -0.1)}
            disabled={val <= 0.6}
            title={`Smaller ${label.toLowerCase()} on the presenter screen`}
            className="h-6 w-6 rounded-md border border-slate-300 text-sm leading-none text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          >
            −
          </button>
          <span className="w-11 text-center text-xs tabular-nums text-slate-600">
            {Math.round(val * 100)}%
          </span>
          <button
            onClick={() => bumpPresenter(which, 0.1)}
            disabled={val >= 3}
            title={`Bigger ${label.toLowerCase()} on the presenter screen`}
            className="h-6 w-6 rounded-md border border-slate-300 text-sm leading-none text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          >
            +
          </button>
        </div>
      ))}
    </div>
  ) : null;

  // Live session nav (Back / Next / Push refresh / End) + presenter size
  // controls — passed to the console so it renders BELOW the live tool panels.
  const liveNavSection = (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => control("prev")}
          disabled={session.currentStep <= 0}
          title={prevStep ? `Back to “${prevStep.title}”` : "Back"}
          className="inline-flex min-w-0 max-w-[45%] items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-40 transition"
        >
          <span className="shrink-0">←&nbsp;Back</span>
          {prevStep && (
            <span className="hidden truncate font-normal text-slate-400 sm:block">
              {prevStep.title}
            </span>
          )}
        </button>
        <button
          onClick={() => control("next")}
          disabled={session.currentStep >= steps.length - 1}
          title={nextStep ? `Next: “${nextStep.title}”` : "Next step"}
          className="inline-flex min-w-0 max-w-[52%] items-center gap-1.5 rounded-lg bg-indigo-600 text-white px-5 py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition"
        >
          <span className="shrink-0">Next</span>
          {nextStep && (
            <span className="hidden truncate font-normal text-indigo-200 sm:block">
              {nextStep.title}
            </span>
          )}
          <span className="shrink-0">→</span>
        </button>
        <button
          onClick={() => control("refresh")}
          title="Force every participant screen to reload"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition"
        >
          ↻ Push refresh
        </button>
        <button
          onClick={() => control("end")}
          className="ml-auto rounded-lg border border-rose-300 text-rose-700 px-4 py-2 text-sm font-medium hover:bg-rose-50 transition"
        >
          End session
        </button>
      </div>
    </section>
  );

  // The "Now showing" step slide — passed to the console so it renders AFTER the
  // live tool panels (and after the nav).
  const stepSlideSection = current ? (
    <section
      className={
        broadcasting
          ? "rounded-xl border-2 border-rose-300 ring-2 ring-rose-100 bg-rose-50 shadow-sm p-5"
          : "bg-white rounded-xl border border-slate-200 shadow-sm p-5"
      }
    >
      <p
        className={`text-xs font-semibold uppercase tracking-wide mb-1 flex items-center gap-2 ${
          broadcasting ? "text-rose-700" : "text-slate-400"
        }`}
      >
        Now showing — step {session.currentStep + 1} of {steps.length}
        {broadcasting && (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-700 px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal">
            <span className="animate-pulse">●</span> On screen
          </span>
        )}
      </p>
      <h3 className="font-semibold">{current.title}</h3>
      {current.tools.length > 0 && (
        <p className="mt-1 text-xs text-slate-400">
          {current.tools.length} tool
          {current.tools.length === 1 ? "" : "s"} on this step — open Tools in the
          agenda to launch, edit, or delete.
        </p>
      )}
      {current.content && (
        <div className="mt-2 max-h-48 overflow-y-auto text-sm border border-slate-100 rounded-lg p-3 bg-slate-50">
          <Markdown>{current.content}</Markdown>
        </div>
      )}
    </section>
  ) : (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 mb-1">
        Session live — no step on screen
      </p>
      <p className="text-sm text-slate-500">
        {steps.length === 0
          ? "Add an agenda step in the left column to display it."
          : "Participants are in a holding view. Click Show on any agenda step to bring it up."}
      </p>
    </section>
  );

  return (
    <div className="flex-1 min-h-screen">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <div className="min-w-0">
          {isCourseSession ? (
            <a
              href={`/course/${session.courseId}`}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              ← Back to course
            </a>
          ) : (
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
              Facilitator console
            </p>
          )}
          <h1 className="text-xl font-bold truncate">{session.title}</h1>
        </div>
        <button
          onClick={openPresenter}
          title="Open a clean, read-only screen to share in Zoom/Teams"
          className="ml-auto rounded-lg border border-indigo-300 text-indigo-700 px-3 py-1.5 text-xs font-medium hover:bg-indigo-50"
        >
          ⤢ Presenter View
        </button>
        {session.status !== "ended" && (
          <button
            onClick={toggleQr}
            title={
              session.presentQr
                ? "Stop showing the join QR — restore the tool/step (or close the presenter it opened)"
                : "Show the join QR + link on the presenter screen (opens the presenter if needed)"
            }
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              session.presentQr
                ? "border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700"
                : "border-indigo-300 text-indigo-700 hover:bg-indigo-50"
            }`}
          >
            ▦ Join QR
          </button>
        )}
        <a
          href={`/facilitate/${id}/report`}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Session report
        </a>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${statusBadge}`}
        >
          {session.status}
        </span>
        <UserButton />
      </header>
      {/* Presenter size controls appear right under the header (below the
          Presenter View button) whenever a projector screen is live. */}
      {presenterSizeControls}

      {(actionError || error) && (
        <div className="fixed top-3 right-3 z-50 rounded-lg bg-amber-100 text-amber-900 text-sm px-4 py-2 shadow-lg border border-amber-300">
          {actionError ?? `Reconnecting… (${error})`}
        </div>
      )}

      <div className="max-w-[1600px] mx-auto px-6 py-6 grid gap-6 lg:grid-cols-[2fr_3fr] items-start">
        {/* Left column: agenda, participants, invite */}
        <div className="flex min-w-0 flex-col gap-6">
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold mb-3">Agenda</h2>
            <ol className="flex flex-col gap-2">
              {steps.map((s, i) => {
                // The step whose tool sits at the top of the live stack is the
                // "Active" step (rose); a second live tool's step gets amber.
                const isTopTool = s.id === topStepId;
                const isSecondTool = !isTopTool && s.id === secondStepId;
                const isCurrent =
                  session.status === "live" && i === session.currentStep;
                return (
                <li
                  key={s.id}
                  className={`rounded-lg border transition-opacity ${
                    isTopTool
                      ? "border-rose-400 border-l-4 ring-2 ring-rose-200 bg-rose-50"
                      : isSecondTool
                        ? "border-amber-400 border-l-4 ring-2 ring-amber-200 bg-amber-50"
                        : isCurrent
                          ? broadcasting
                            ? "border-rose-400 border-l-4 ring-2 ring-rose-200 bg-rose-50"
                            : "border-indigo-500 border-l-4 ring-2 ring-indigo-200 bg-indigo-50"
                          : session.status === "live" && toolsOpenFor !== s.id
                            ? "border-slate-200 opacity-60"
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
                        {session.status === "live" &&
                          (i === session.currentStep ? (
                            <button
                              onClick={() => control("deselect")}
                              title="Close this step — session stays live; participants see a holding screen"
                              className="rounded-md bg-emerald-100 text-emerald-700 border border-emerald-300 px-2 py-1 text-xs font-medium hover:bg-emerald-200"
                            >
                              ● Active — close
                            </button>
                          ) : (
                            <button
                              onClick={() => control("goto", i)}
                              className="rounded-md border border-indigo-200 text-indigo-700 px-2 py-1 text-xs hover:bg-indigo-50"
                            >
                              Show
                            </button>
                          ))}
                        {broadcasting && i === session.currentStep && (
                          <span
                            title="This step's content is on participants' screens right now"
                            className="shrink-0 inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-700 px-1.5 py-0.5 text-[10px] font-semibold"
                          >
                            <span className="animate-pulse">●</span> On screen
                          </span>
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
                          onClick={() => {
                            setToolsOpenFor(toolsOpenFor === s.id ? null : s.id);
                            resetToolForm();
                          }}
                          className={`rounded-md px-2 py-1 text-xs hover:bg-slate-100 ${
                            s.tools.length > 0
                              ? "text-indigo-600 font-medium"
                              : "text-slate-500"
                          }`}
                        >
                          Tools{s.tools.length > 0 ? ` (${s.tools.length})` : ""}
                        </button>
                        {stepHasLiveTool(s) && (
                          <span
                            title="A tool in this step is live for participants"
                            className={`shrink-0 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                              isSecondTool
                                ? "bg-amber-100 text-amber-700"
                                : "bg-rose-100 text-rose-700"
                            }`}
                          >
                            <span className="animate-pulse">●</span> live
                          </span>
                        )}
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
                          title="Delete step"
                          aria-label="Delete step"
                          className="rounded-md px-1.5 py-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  )}
                  {toolsOpenFor === s.id && editingId !== s.id && (
                    <div className="border-t border-slate-100 bg-slate-50/60 rounded-b-lg p-3 flex flex-col gap-2">
                      {session.status === "live" &&
                        i !== session.currentStep && (
                          <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
                            <span>
                              Editing tools for this step — not the one showing
                              now
                              {current ? ` (${current.title})` : ""}.
                            </span>
                            <button
                              onClick={() => control("goto", i)}
                              className="ml-auto shrink-0 rounded-md border border-amber-400 bg-white px-2 py-0.5 font-medium text-amber-800 hover:bg-amber-100"
                            >
                              Show this step
                            </button>
                          </div>
                        )}
                      {s.tools.length > 0 && (
                        <ul className="flex flex-col gap-1">
                          {s.tools.map((t, ti) => (
                            <li
                              key={t.id}
                              className="flex items-center gap-2 text-xs bg-white rounded-md border border-slate-200 px-2.5 py-1.5"
                            >
                              <span className="shrink-0 w-4 text-right tabular-nums text-slate-400">
                                {ti + 1}
                              </span>
                              <span className="font-bold uppercase text-[10px] text-indigo-500 shrink-0">
                                {TOOL_BADGES[t.kind] ?? t.kind}
                              </span>
                              <span className="min-w-0 truncate">{t.prompt}</span>
                              {t.kind === "wordcloud" &&
                                (t.words?.length ?? 0) > 0 && (
                                  <span
                                    title={`${t.words!.length} seeded word${t.words!.length === 1 ? "" : "s"}`}
                                    className="shrink-0 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px] font-semibold"
                                  >
                                    ★ {t.words!.length}
                                  </span>
                                )}
                              {t.sourcing === "participants" && (
                                <span className="text-slate-400 shrink-0">
                                  (participant-sourced)
                                </span>
                              )}
                              {session.status === "live" ? (
                                liveActivityByTool.has(t.id) ? (
                                  <button
                                    onClick={() =>
                                      api(
                                        `/api/sessions/${id}/activities/${liveActivityByTool.get(
                                          t.id
                                        )}`,
                                        "PATCH",
                                        { status: "closed" }
                                      )
                                    }
                                    title="Live now — click to close for participants"
                                    aria-label="Live — click to close"
                                    className="ml-auto shrink-0 inline-flex items-center gap-1 rounded-md bg-rose-600 text-white px-2 py-1 text-[11px] font-semibold leading-none hover:bg-rose-700"
                                  >
                                    <span className="animate-pulse">●</span> Live
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => launchTool(t)}
                                    title="Launch"
                                    aria-label="Launch"
                                    className="ml-auto shrink-0 rounded-md bg-indigo-600 text-white px-2 py-1 text-[13px] leading-none hover:bg-indigo-700"
                                  >
                                    🚀
                                  </button>
                                )
                              ) : (
                                <span className="ml-auto shrink-0 text-[10px] text-slate-400">
                                  start session to launch
                                </span>
                              )}
                              <button
                                onClick={() =>
                                  api(
                                    `/api/sessions/${id}/steps/${s.id}/tools/${t.id}`,
                                    "PATCH",
                                    { move: "up" }
                                  )
                                }
                                disabled={ti === 0}
                                title="Move up"
                                aria-label="Move tool up"
                                className="shrink-0 rounded-md px-1 py-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                              >
                                ↑
                              </button>
                              <button
                                onClick={() =>
                                  api(
                                    `/api/sessions/${id}/steps/${s.id}/tools/${t.id}`,
                                    "PATCH",
                                    { move: "down" }
                                  )
                                }
                                disabled={ti === s.tools.length - 1}
                                title="Move down"
                                aria-label="Move tool down"
                                className="shrink-0 rounded-md px-1 py-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                              >
                                ↓
                              </button>
                              {moveTargetCount(s.id) > 0 &&
                                (
                                  [
                                    ["move", "🚚", "Move this tool to another step"],
                                    ["clone", "🪄", "Copy this tool to another step"],
                                  ] as const
                                ).map(([action, icon, tip]) => (
                                  <select
                                    key={action}
                                    value=""
                                    title={tip}
                                    aria-label={tip}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      e.target.value = "";
                                      if (v) relocateTool(s.id, t.id, v);
                                    }}
                                    className="shrink-0 appearance-none cursor-pointer text-center rounded-md border border-slate-300 w-7 py-1 text-[12px] leading-none text-slate-600 bg-white"
                                  >
                                    <option value="">{icon}</option>
                                    {moveGroups.map((g, gi) => {
                                      const opts = g.steps.filter(
                                        (st) => st.id !== s.id
                                      );
                                      if (opts.length === 0) return null;
                                      return (
                                        <optgroup key={gi} label={g.title}>
                                          {opts.map((st) => (
                                            <option
                                              key={st.id}
                                              value={`${action}:${st.id}`}
                                            >
                                              {st.title}
                                            </option>
                                          ))}
                                        </optgroup>
                                      );
                                    })}
                                  </select>
                                ))}
                              <button
                                onClick={() => beginToolEdit(s.id, t)}
                                title="Edit tool"
                                aria-label="Edit tool"
                                className="shrink-0 rounded-md border border-slate-300 px-1.5 py-1 text-slate-600 hover:bg-slate-100"
                              >
                                <PencilIcon />
                              </button>
                              {viewerAdmin && (
                                <button
                                  onClick={() => promoteToLibrary(t)}
                                  title="Save this tool to the shared library"
                                  aria-label="Save this tool to the shared library"
                                  className="shrink-0 rounded-md border border-violet-300 px-1.5 py-1 text-[13px] leading-none text-violet-700 hover:bg-violet-50"
                                >
                                  📚
                                </button>
                              )}
                              <button
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  if (confirm(`Delete tool "${t.prompt}"?`)) {
                                    if (editingToolId === t.id) resetToolForm();
                                    api(
                                      `/api/sessions/${id}/steps/${s.id}/tools/${t.id}`,
                                      "DELETE"
                                    );
                                  }
                                }}
                                title="Delete tool"
                                aria-label="Delete tool"
                                className="shrink-0 rounded-md px-1 py-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                              >
                                <TrashIcon />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <select
                            value={toolKind}
                            onChange={(e) =>
                              setToolKind(
                                e.target.value as typeof toolKind
                              )
                            }
                            className="rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white"
                          >
                            <option value="vote">Vote (pick one)</option>
                            <option value="likert">Scoring survey (1–5)</option>
                            <option value="columns">Comment board</option>
                            <option value="reveal">Reveal list</option>
                            <option value="wheel">Network</option>
                            <option value="workflow">Workflow (guided steps)</option>
                            <option value="whiteboard">Whiteboard</option>
                            <option value="exhibit">
                              Present (file / link / text)
                            </option>
                            <option value="video">Video (synced)</option>
                            <option value="timer">Countdown timer</option>
                            <option value="wordcloud">Word cloud</option>
                            <option value="sort">Word sort (drag to columns)</option>
                            <option value="impact1">Impact 1 (comment + 1 scale)</option>
                            <option value="impact2">Impact 2 (comment + 2 scales)</option>
                            <option value="impact3">Impact 3 (comment + 3 scales)</option>
                            <option value="impact4">Impact 4 (comment + 4 scales)</option>
                            <option value="survey">Survey (questions + comments)</option>
                            <option value="slides">Slides (play deck pages)</option>
                            <option value="checklist">Checklist (statements × options)</option>
                            <option value="blocks">Blocks (one question, N fields)</option>
                            <option value="secrets">Secrets (anonymous wall)</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => openLibPicker(s.id)}
                            className="rounded-md border border-violet-300 px-2 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50"
                          >
                            📚 From library
                          </button>
                          {toolKind === "exhibit" && (
                            <select
                              value={toolExhibitType}
                              onChange={(e) =>
                                setToolExhibitType(
                                  e.target.value as typeof toolExhibitType
                                )
                              }
                              className="rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white"
                            >
                              <option value="file">Course file</option>
                              <option value="url">Web link</option>
                              <option value="text">Text excerpt</option>
                            </select>
                          )}
                          {(toolKind === "vote" || toolKind === "likert") && (
                            <label className="flex items-center gap-1 text-xs text-slate-500">
                              <input
                                type="checkbox"
                                checked={toolSourced}
                                onChange={(e) => setToolSourced(e.target.checked)}
                              />
                              participants suggest the choices
                            </label>
                          )}
                          {toolKind === "likert" && (
                            <select
                              value={toolAnchorSet}
                              onChange={(e) => setToolAnchorSet(e.target.value)}
                              className="rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white"
                            >
                              {Object.entries(LIKERT_ANCHOR_LABELS).map(
                                ([k, label]) => (
                                  <option key={k} value={k}>
                                    {label}
                                  </option>
                                )
                              )}
                            </select>
                          )}
                        </div>
                        {toolKind !== "workflow" && (
                          <input
                            value={toolPrompt}
                            onChange={(e) => setToolPrompt(e.target.value)}
                            placeholder={
                              toolKind === "checklist"
                                ? "Please enter the topic of the checklist"
                                : "Prompt / question shown to participants"
                            }
                            maxLength={300}
                            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        )}
                        {toolKind === "exhibit" && toolExhibitType === "file" && (
                          <select
                            value={toolExhibitRef}
                            onChange={(e) => setToolExhibitRef(e.target.value)}
                            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                          >
                            <option value="">
                              Choose a file from the course library…
                            </option>
                            {state?.files.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.title} ({f.filename})
                              </option>
                            ))}
                          </select>
                        )}
                        {toolKind === "exhibit" && toolExhibitType === "url" && (
                          <input
                            value={toolExhibitRef}
                            onChange={(e) => setToolExhibitRef(e.target.value)}
                            placeholder="https://…"
                            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        )}
                        {toolKind === "video" && (
                          <input
                            value={toolExhibitRef}
                            onChange={(e) => setToolExhibitRef(e.target.value)}
                            placeholder="YouTube link or direct .mp4 URL"
                            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        )}
                        {toolKind === "timer" && (
                          <label className="flex items-center gap-2 text-xs text-slate-600">
                            Countdown:
                            <input
                              type="number"
                              min={1}
                              max={180}
                              value={toolTimerMin}
                              onChange={(e) =>
                                setToolTimerMin(
                                  Math.max(1, Number(e.target.value) || 1)
                                )
                              }
                              className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs bg-white"
                            />
                            minutes
                          </label>
                        )}
                        {toolKind === "slides" && (
                          <div className="flex flex-col gap-2 rounded-md border border-indigo-200 bg-indigo-50/40 p-2.5">
                            {decks.length === 0 ? (
                              <p className="text-xs text-slate-500">
                                No slide decks in this course yet — add one on the{" "}
                                <a
                                  href={
                                    courseId ? `/course/${courseId}` : "#"
                                  }
                                  className="text-indigo-600 underline"
                                >
                                  course page
                                </a>
                                .
                              </p>
                            ) : (
                              <>
                                <label className="flex items-center gap-2 text-xs text-slate-600">
                                  Deck:
                                  <select
                                    value={toolDeckId}
                                    onChange={(e) => {
                                      const d = decks.find(
                                        (x) => x.id === e.target.value
                                      );
                                      setToolDeckId(e.target.value);
                                      setToolStartPage(1);
                                      setToolEndPage(d?.pageCount || 1);
                                    }}
                                    className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs bg-white"
                                  >
                                    <option value="">Choose a deck…</option>
                                    {decks.map((d) => (
                                      <option key={d.id} value={d.id}>
                                        {d.title} ({d.pageCount} slides)
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                {toolDeckId && (
                                  <label className="flex items-center gap-2 text-xs text-slate-600">
                                    Slides
                                    <input
                                      type="number"
                                      min={1}
                                      max={toolEndPage}
                                      value={toolStartPage}
                                      onChange={(e) =>
                                        setToolStartPage(
                                          Math.max(1, Number(e.target.value) || 1)
                                        )
                                      }
                                      className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs bg-white"
                                    />
                                    to
                                    <input
                                      type="number"
                                      min={toolStartPage}
                                      max={
                                        decks.find((d) => d.id === toolDeckId)
                                          ?.pageCount ?? toolEndPage
                                      }
                                      value={toolEndPage}
                                      onChange={(e) =>
                                        setToolEndPage(
                                          Math.max(
                                            1,
                                            Number(e.target.value) || 1
                                          )
                                        )
                                      }
                                      className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs bg-white"
                                    />
                                    <span className="text-slate-400">
                                      of{" "}
                                      {decks.find((d) => d.id === toolDeckId)
                                        ?.pageCount ?? "?"}
                                    </span>
                                  </label>
                                )}
                              </>
                            )}
                          </div>
                        )}
                        {toolKind === "exhibit" && toolExhibitType === "text" && (
                          <textarea
                            value={toolList}
                            onChange={(e) => setToolList(e.target.value)}
                            rows={4}
                            placeholder="The excerpt to present (Markdown supported)"
                            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        )}
                        {toolKind === "workflow" && (
                          <div className="rounded-md border border-indigo-200 bg-indigo-50/50 px-3 py-2 text-xs text-indigo-700">
                            ✎ This flow opens in the wide{" "}
                            <span className="font-semibold">Workflow builder</span>{" "}
                            on the right — arrange steps there, then use{" "}
                            <span className="font-semibold">Save to outline</span>.
                          </div>
                        )}
                        {toolKind === "sort" && (
                          <input
                            value={toolSortColumns}
                            onChange={(e) => setToolSortColumns(e.target.value)}
                            placeholder="Column titles (2–4), comma-separated"
                            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        )}
                        {toolKind === "survey" && (
                          <SurveyBuilder
                            questions={toolSurveyQuestions}
                            onChange={setToolSurveyQuestions}
                          />
                        )}
                        {toolKind === "checklist" && (
                          <ChecklistBuilder
                            columns={toolChecklistColumns}
                            statements={toolChecklistStatements}
                            displayOnly={toolDisplayOnly}
                            onColumns={setToolChecklistColumns}
                            onStatements={setToolChecklistStatements}
                            onDisplayOnly={setToolDisplayOnly}
                          />
                        )}
                        {toolKind === "blocks" && (
                          <BlocksBuilder
                            labels={toolBlockLabels}
                            onChange={setToolBlockLabels}
                          />
                        )}
                        {(toolKind === "impact1" ||
                          toolKind === "impact2" ||
                          toolKind === "impact3" ||
                          toolKind === "impact4") && (
                          <div className="flex flex-col gap-1.5">
                            {Array.from(
                              {
                                length:
                                  toolKind === "impact4"
                                    ? 4
                                    : toolKind === "impact3"
                                      ? 3
                                      : toolKind === "impact2"
                                        ? 2
                                        : 1,
                              },
                              (_, i) => (
                                <div
                                  key={i}
                                  className="flex flex-wrap items-center gap-1.5"
                                >
                                  <div className="flex flex-col leading-none">
                                    <button
                                      type="button"
                                      disabled={i === 0}
                                      title="Move scale up"
                                      onClick={() =>
                                        setToolImpactScales((prev) => {
                                          const a = [...prev];
                                          [a[i - 1], a[i]] = [a[i], a[i - 1]];
                                          return a;
                                        })
                                      }
                                      className="text-slate-400 hover:text-slate-600 disabled:opacity-30 text-[11px]"
                                    >
                                      ▲
                                    </button>
                                    <button
                                      type="button"
                                      disabled={
                                        i ===
                                        (toolKind === "impact4"
                                          ? 4
                                          : toolKind === "impact3"
                                            ? 3
                                            : toolKind === "impact2"
                                              ? 2
                                              : 1) -
                                          1
                                      }
                                      title="Move scale down"
                                      onClick={() =>
                                        setToolImpactScales((prev) => {
                                          const a = [...prev];
                                          [a[i + 1], a[i]] = [a[i], a[i + 1]];
                                          return a;
                                        })
                                      }
                                      className="text-slate-400 hover:text-slate-600 disabled:opacity-30 text-[11px]"
                                    >
                                      ▼
                                    </button>
                                  </div>
                                  <input
                                    value={toolImpactScales[i]?.name ?? ""}
                                    onChange={(e) =>
                                      setToolImpactScales((prev) =>
                                        prev.map((s, j) =>
                                          j === i
                                            ? { ...s, name: e.target.value }
                                            : s
                                        )
                                      )
                                    }
                                    placeholder={`Scale ${i + 1} name`}
                                    maxLength={60}
                                    className="flex-1 min-w-[140px] rounded-md border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                                  />
                                  <select
                                    value={
                                      toolImpactScales[i]?.anchorSet ?? "agreement"
                                    }
                                    onChange={(e) =>
                                      setToolImpactScales((prev) =>
                                        prev.map((s, j) =>
                                          j === i
                                            ? { ...s, anchorSet: e.target.value }
                                            : s
                                        )
                                      )
                                    }
                                    className="rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white"
                                  >
                                    {Object.entries(LIKERT_ANCHOR_LABELS).map(
                                      ([k, lab]) => (
                                        <option key={k} value={k}>
                                          {lab}
                                        </option>
                                      )
                                    )}
                                  </select>
                                  <label className="flex items-center gap-1 text-[11px] text-slate-500">
                                    <input
                                      type="checkbox"
                                      checked={
                                        toolImpactScales[i]?.allowNA ?? false
                                      }
                                      onChange={(e) =>
                                        setToolImpactScales((prev) =>
                                          prev.map((s, j) =>
                                            j === i
                                              ? { ...s, allowNA: e.target.checked }
                                              : s
                                          )
                                        )
                                      }
                                    />
                                    N/A
                                  </label>
                                </div>
                              )
                            )}
                          </div>
                        )}
                        {toolKind === "secrets" && (
                          <p className="text-[11px] text-slate-400">
                            Everyone submits one anonymous secret (only you see
                            the author). Then open the wall and name a reader per
                            turn — they pick a door, read it privately, and
                            perform it as the author. Needs each participant
                            logged in on their own device.
                          </p>
                        )}
                        {toolKind !== "whiteboard" &&
                          toolKind !== "exhibit" &&
                          toolKind !== "video" &&
                          toolKind !== "timer" &&
                          toolKind !== "workflow" &&
                          toolKind !== "impact1" &&
                          toolKind !== "impact2" &&
                          toolKind !== "impact3" &&
                          toolKind !== "impact4" &&
                          toolKind !== "survey" &&
                          toolKind !== "checklist" &&
                          toolKind !== "slides" &&
                          toolKind !== "blocks" &&
                          toolKind !== "secrets" &&
                          !(
                            (toolKind === "vote" || toolKind === "likert") &&
                            toolSourced
                          ) && (
                            <textarea
                              value={toolList}
                              onChange={(e) => setToolList(e.target.value)}
                              rows={3}
                              placeholder={
                                toolKind === "sort"
                                  ? "Words to sort, one per line"
                                  : toolKind === "wordcloud"
                                    ? "Seed words/phrases (optional), one per line — participants can add more"
                                    : toolKind === "columns"
                                      ? "Column titles, one per line (1–4) — e.g. each question"
                                      : toolKind === "vote"
                                        ? "Options, one per line (2–8)"
                                        : toolKind === "reveal" || toolKind === "wheel"
                                          ? "One item per line — note after a |\nSelf-Awareness | How well do I know myself?"
                                          : "Items to score, one per line (1–12)"
                              }
                              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs bg-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          )}
                        {toolKind !== "workflow" && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => saveTool(s.id)}
                              disabled={
                                toolKind === "video"
                                  ? !toolExhibitRef.trim()
                                  : toolKind === "slides"
                                    ? !toolPrompt.trim() || !toolDeckId
                                    : toolKind === "checklist"
                                      ? !toolPrompt.trim() ||
                                        toolChecklistColumns.filter((c) =>
                                          c.trim()
                                        ).length < 2 ||
                                        !toolChecklistStatements.some((s) =>
                                          s.text.trim()
                                        )
                                      : toolKind === "timer"
                                        ? false
                                        : !toolPrompt.trim()
                              }
                              className="rounded-md bg-slate-800 text-white px-3 py-1.5 text-xs font-medium hover:bg-slate-900 disabled:opacity-40"
                            >
                              {editingToolId
                                ? "Save tool changes"
                                : "Add tool to this step"}
                            </button>
                            {editingToolId && (
                              <button
                                onClick={resetToolForm}
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </li>
                );
              })}
            </ol>

            <div className="mt-4 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setAddStepOpen((v) => !v)}
                className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600"
              >
                <span>+ Add step</span>
                <span className="text-sm">{addStepOpen ? "▾" : "▸"}</span>
              </button>
              {addStepOpen && (
                <form onSubmit={addStep} className="mt-3 flex flex-col gap-2">
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
              )}
            </div>
          </section>

          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold mb-3">Chat</h2>
            {spotlight && (
              <div className="mb-3 rounded-lg border border-amber-200 overflow-hidden">
                <SpotlightBanner
                  spotlight={spotlight}
                  onClear={async () => {
                    await fetch(`/api/sessions/${id}/chat`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ spotlight: null }),
                    });
                    refresh();
                  }}
                />
                <p className="bg-amber-50 px-6 pb-2 text-[10px] text-amber-600">
                  Live to the room{spotlight.style === "card" ? " · full-screen" : " · banner"}
                </p>
              </div>
            )}
            <div className="h-80">
              <Chat
                sessionId={id}
                messages={state.messages ?? []}
                canModerate
                chatMode={state.session.chatMode}
                roster={state.participants}
                spotlightId={spotlight?.id ?? null}
                onChanged={refresh}
              />
            </div>
          </section>

          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold mb-3">
              Participants{" "}
              <span className="text-sm font-normal text-slate-400">
                ({online.length} online / {participants.length} joined)
              </span>
            </h2>
            <div className="flex flex-col gap-3 max-h-80 overflow-y-auto">
              {facilitatorList.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-500">
                    Facilitators ({facilitatorList.length})
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {facilitatorList.map(renderPerson)}
                  </ul>
                </div>
              )}
              {attendeeList.length > 0 && (
                <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Participants ({attendeeList.length})
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {attendeeList.map(renderPerson)}
                  </ul>
                </div>
              )}
              {participants.length === 0 && (
                <p className="text-sm text-slate-400">No one has joined yet</p>
              )}
            </div>
          </section>

          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold mb-1">Invite participants</h2>
            <p className="text-sm text-slate-500 mb-3">
              {isCourseSession
                ? "Students join with a randomized key that expires after 24 hours."
                : "Paste the link into Zoom chat, or share the code."}
            </p>
            {studentCode ? (
              <>
                <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-center mb-1">
                  <span className="font-mono text-2xl tracking-[0.3em] font-semibold">
                    {studentCode}
                  </span>
                </div>
                {isCourseSession && (
                  <p className="text-xs text-slate-400 text-center mb-2">
                    {keyExpiryLabel}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => copy(joinUrl, "link")}
                    className="flex-1 rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm font-medium hover:bg-indigo-700 transition"
                  >
                    {copied === "link" ? "Copied!" : "Copy join link"}
                  </button>
                  <button
                    onClick={() => copy(studentCode, "code")}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 transition"
                  >
                    {copied === "code" ? "Copied!" : "Copy key"}
                  </button>
                </div>
                {joinUrl && (
                  <p className="mt-2 text-xs text-slate-400 break-all">{joinUrl}</p>
                )}
                <button
                  onClick={() =>
                    window.open(
                      `${origin || ""}/welcome/${id}`,
                      "SessionSyncWelcome",
                      "width=1280,height=800"
                    )
                  }
                  title="Open a full-screen QR + join code to project as people arrive"
                  className="mt-2 w-full rounded-lg border border-indigo-300 text-indigo-700 px-3 py-2 text-sm font-medium hover:bg-indigo-50 transition"
                >
                  ⤢ Show welcome screen (QR)
                </button>
              </>
            ) : (
              <p className="text-sm text-slate-400 mb-2">
                No active student key.
              </p>
            )}
            {isCourseSession && (
              <button
                onClick={() =>
                  api(`/api/sessions/${id}/joinkey`, "POST", { ttlHours: 24 })
                }
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
              >
                {keyActive ? "Rotate student key" : "Generate 24-hour student key"}
              </button>
            )}
          </section>
        </div>

        {/* Right column: active session, tools, saved content */}
        <div className="flex min-w-0 flex-col gap-6">
          {/* Wide workflow builder — opens here when a Workflow tool is being
              authored in the agenda (the left column is too narrow for the canvas). */}
          {toolsOpenFor && toolKind === "workflow" && (
            <section className="bg-white rounded-xl border-2 border-indigo-300 shadow-sm p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="font-semibold">
                  Workflow builder{" "}
                  <span className="text-xs font-normal text-slate-400">
                    — {editingToolId ? "editing" : "new flow"} on step “
                    {steps.find((s) => s.id === toolsOpenFor)?.title ?? "?"}”
                  </span>
                </h2>
                <button
                  onClick={() => {
                    resetToolForm();
                    setToolKind("vote");
                  }}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  Close
                </button>
              </div>
              <input
                value={toolPrompt}
                onChange={(e) => setToolPrompt(e.target.value)}
                placeholder="Workflow name (optional — defaults to the start step)"
                maxLength={300}
                className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <WorkflowBuilder
                value={toolGraph}
                onChange={setToolGraph}
                height={460}
              />
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={async () => {
                    await saveTool(toolsOpenFor);
                    setToolKind("vote");
                  }}
                  disabled={(toolGraph?.nodes.length ?? 0) < 2}
                  className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40"
                >
                  {editingToolId ? "Save changes to outline" : "Save to outline"}
                </button>
                <button
                  onClick={() => {
                    resetToolForm();
                    setToolKind("vote");
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <span className="text-xs text-slate-400">
                  Saves as a tool on this agenda step.
                </span>
              </div>
            </section>
          )}
          {session.status === "live" ? (
            // Live tools sit at the very top; the console renders the nav bar and
            // the step slide (passed as slots) below them, then the Push form.
            <ActivityConsole
              sessionId={id}
              authHeaders={{}}
              activities={activities}
              pastActivities={pastActivities}
              files={state.files}
              myParticipantId={myPid}
              myParticipantName={user?.fullName ?? user?.username ?? undefined}
              roster={participants}
              activeStepId={saveToStepTarget?.id ?? null}
              activeStepTitle={saveToStepTarget?.title}
              navSlot={liveNavSection}
              stepSlot={stepSlideSection}
              stepNameByActivity={stepNameByActivity}
              onChanged={refresh}
            />
          ) : (
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => control("start")}
                  disabled={steps.length === 0}
                  className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 transition"
                >
                  {session.status === "ended" ? "Restart session" : "Start session"}
                </button>
              </div>
              {session.status === "lobby" && (
                <p className="mt-3 text-sm text-slate-500">
                  {steps.length === 0
                    ? "Add at least one agenda step in the left column, then start the session."
                    : `${steps.length} step${steps.length === 1 ? "" : "s"} ready. Participants see a waiting screen until you start.`}
                </p>
              )}
            </section>
          )}
        </div>
      </div>

      {/* Tool-library picker: clone a saved library tool into the chosen step. */}
      {libPickFor && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-16"
          onClick={() => setLibPickFor(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-slate-100 p-4">
              <h2 className="font-semibold">Add from tool library</h2>
              <button
                onClick={() => setLibPickFor(null)}
                className="ml-auto text-sm text-slate-400 hover:text-slate-600"
              >
                Close
              </button>
            </div>
            <div className="p-4">
              <input
                value={libQ}
                onChange={(e) => searchLib(e.target.value)}
                placeholder="Search by name, category, or kind…"
                className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                autoFocus
              />
              <div className="max-h-80 overflow-y-auto flex flex-col gap-1.5">
                {libTools === null && (
                  <p className="text-sm text-slate-400">Loading…</p>
                )}
                {libTools?.length === 0 && (
                  <p className="text-sm text-slate-400">
                    No matching library tools.
                  </p>
                )}
                {libTools?.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => cloneFromLibrary(t.id)}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-indigo-300 hover:bg-indigo-50/40"
                  >
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500 shrink-0">
                      {t.kind}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium truncate">
                        {t.name}
                      </span>
                      {t.description && (
                        <span className="block text-xs text-slate-400 truncate">
                          {t.description}
                        </span>
                      )}
                    </span>
                    {t.category && (
                      <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-700 shrink-0">
                        {t.category}
                      </span>
                    )}
                    <span className="text-xs text-indigo-500 shrink-0">Add →</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
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
