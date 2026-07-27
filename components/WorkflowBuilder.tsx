"use client";

import { useEffect, useRef, useState } from "react";
import type {
  WorkflowGraph,
  WorkflowNode,
  WorkflowEdge,
} from "./useSessionState";

// A drag-and-connect canvas for authoring a branching workflow, and (in
// readOnly mode) for presenting it — the facilitator clicks a node to advance,
// the active node is highlighted. Nodes are word-boxes with an optional
// sentence or two of supplemental guidance; edges are the branch choices.

const NODE_W = 190;
const NODE_H = 56;
const BOARD_W = 1600;
const BOARD_H = 900;

interface Props {
  value: WorkflowGraph | null;
  onChange?: (g: WorkflowGraph) => void;
  /** Presentation mode: no editing; click a node to select/advance. */
  readOnly?: boolean;
  /** The active node id, highlighted in readOnly mode. */
  currentId?: string | null;
  /** Node ids already visited (drawn muted) in readOnly mode. */
  visited?: string[];
  onSelect?: (nodeId: string) => void;
  height?: number;
}

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : `n${Math.round(performance.now())}`;

const emptyGraph = (): WorkflowGraph => {
  const a: WorkflowNode = { id: uid(), title: "Start", note: "", x: 60, y: 80 };
  const b: WorkflowNode = { id: uid(), title: "Next step", note: "", x: 340, y: 80 };
  return {
    nodes: [a, b],
    edges: [{ id: uid(), from: a.id, to: b.id, label: "" }],
    startId: a.id,
  };
};

export function WorkflowBuilder({
  value,
  onChange,
  readOnly = false,
  currentId = null,
  visited = [],
  onSelect,
  height = 400,
}: Props) {
  // A STABLE starter graph. Regenerating emptyGraph() every render would mint
  // fresh node ids each time, so a click's `selected` id would never match the
  // next render's nodes and the editor could never open (until a drag committed
  // a real graph to the parent). Build it once and keep the same ids.
  const starter = useRef<WorkflowGraph | null>(null);
  if (!starter.current) starter.current = emptyGraph();
  const graph = value && value.nodes.length ? value : starter.current;
  // Hand the starter graph to the parent on mount so the two default steps are
  // saveable even if the facilitator never drags or edits anything.
  useEffect(() => {
    if ((!value || !value.nodes.length) && onChange) onChange(starter.current!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [selected, setSelected] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  // Drag bookkeeping for the node currently under the pointer.
  const drag = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  // Drag-to-pan bookkeeping (grabbing empty canvas).
  const pan = useRef<{
    startX: number;
    startY: number;
    left: number;
    top: number;
  } | null>(null);

  // Scroll the viewport by a fixed nudge (the on-screen pan controls).
  function panBy(dx: number, dy: number) {
    const el = boardRef.current;
    if (!el) return;
    el.scrollLeft += dx;
    el.scrollTop += dy;
  }

  // ---- zoom ----
  const [zoom, setZoom] = useState(1);
  const nudgeZoom = (delta: number) =>
    setZoom((z) => Math.min(1.5, Math.max(0.3, Math.round((z + delta) * 100) / 100)));

  // The bounding box of all nodes (with a margin), used to fit the whole flow.
  function contentBounds() {
    const ns = graph.nodes;
    if (!ns.length) return { w: BOARD_W, h: BOARD_H };
    const maxX = Math.max(...ns.map((n) => n.x + NODE_W));
    const maxY = Math.max(...ns.map((n) => n.y + NODE_H));
    return { w: maxX + 40, h: maxY + 40 };
  }
  // Scale so the entire flow fits the current viewport, then scroll to origin.
  function fitToView() {
    const el = boardRef.current;
    if (!el) return;
    const { w, h } = contentBounds();
    const scale = Math.min(1.5, Math.max(0.3, Math.min(el.clientWidth / w, el.clientHeight / h)));
    setZoom(Math.round(scale * 100) / 100);
    el.scrollLeft = 0;
    el.scrollTop = 0;
  }
  // In presentation mode, auto-fit on mount AND whenever the viewport resizes,
  // so the map always obeys the size of the window it's shown in.
  useEffect(() => {
    if (!readOnly) return;
    fitToView();
    const el = boardRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => fitToView());
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const visitedSet = new Set(visited);
  const commit = (g: WorkflowGraph) => onChange?.(g);

  // ---- node ops ----
  function addNode() {
    const n: WorkflowNode = {
      id: uid(),
      title: "New step",
      note: "",
      x: 60 + (graph.nodes.length % 6) * 40,
      y: 80 + graph.nodes.length * 28,
    };
    commit({ ...graph, nodes: [...graph.nodes, n] });
    setSelected(n.id);
  }
  function updateNode(id: string, patch: Partial<WorkflowNode>) {
    commit({
      ...graph,
      nodes: graph.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    });
  }
  function deleteNode(id: string) {
    const nodes = graph.nodes.filter((n) => n.id !== id);
    const edges = graph.edges.filter((e) => e.from !== id && e.to !== id);
    const startId = graph.startId === id ? nodes[0]?.id ?? "" : graph.startId;
    commit({ nodes, edges, startId });
    setSelected(null);
  }
  function addEdge(from: string, to: string) {
    if (from === to) return;
    if (graph.edges.some((e) => e.from === from && e.to === to)) return;
    commit({
      ...graph,
      edges: [...graph.edges, { id: uid(), from, to, label: "" }],
    });
  }
  function updateEdge(id: string, patch: Partial<WorkflowEdge>) {
    commit({
      ...graph,
      edges: graph.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    });
  }
  function deleteEdge(id: string) {
    commit({ ...graph, edges: graph.edges.filter((e) => e.id !== id) });
  }

  // ---- dragging ----
  function onNodePointerDown(e: React.PointerEvent, n: WorkflowNode) {
    if (readOnly) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = {
      id: n.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: n.x,
      origY: n.y,
      moved: false,
    };
  }
  function onBoardPointerMove(e: React.PointerEvent) {
    // Panning the canvas (grabbing empty space)?
    const p = pan.current;
    if (p && boardRef.current) {
      boardRef.current.scrollLeft = p.left - (e.clientX - p.startX);
      boardRef.current.scrollTop = p.top - (e.clientY - p.startY);
      return;
    }
    // Otherwise, dragging a node.
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    d.moved = true;
    // Screen pixels → board coords: divide by the current zoom.
    updateNode(d.id, {
      x: Math.max(0, Math.min(BOARD_W - NODE_W, d.origX + dx / zoom)),
      y: Math.max(0, Math.min(BOARD_H - NODE_H, d.origY + dy / zoom)),
    });
  }
  // Grab empty canvas to pan (works in both edit and presentation modes).
  function onBoardPointerDown(e: React.PointerEvent) {
    if (drag.current) return;
    if (e.currentTarget !== e.target) return; // clicked a node, not the canvas
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pan.current = {
      startX: e.clientX,
      startY: e.clientY,
      left: boardRef.current?.scrollLeft ?? 0,
      top: boardRef.current?.scrollTop ?? 0,
    };
  }
  function onBoardPointerUp() {
    pan.current = null;
  }
  function onNodePointerUp(e: React.PointerEvent, n: WorkflowNode) {
    const d = drag.current;
    drag.current = null;
    if (d && d.moved) return; // it was a drag, not a click
    // Click semantics:
    if (readOnly) {
      onSelect?.(n.id);
      return;
    }
    if (connectFrom) {
      if (connectFrom !== n.id) addEdge(connectFrom, n.id);
      setConnectFrom(null);
      return;
    }
    setSelected(n.id);
  }

  const sel = selected ? byId.get(selected) : null;
  const center = (n: WorkflowNode) => ({ x: n.x + NODE_W / 2, y: n.y + NODE_H / 2 });

  // The focused step: the current step in presentation, or the selected step
  // while editing. Its immediate predecessor(s) and successor(s) — and the
  // connectors between — get emphasized so the flow around it reads at a glance.
  const focusId = readOnly ? currentId : selected;
  const predNodes = new Set<string>();
  const succNodes = new Set<string>();
  if (focusId) {
    for (const e of graph.edges) {
      if (e.to === focusId) predNodes.add(e.from);
      if (e.from === focusId) succNodes.add(e.to);
    }
  }
  // An edge's relationship to the focused step.
  const edgeRole = (e: WorkflowEdge): "pred" | "succ" | null =>
    !focusId ? null : e.to === focusId ? "pred" : e.from === focusId ? "succ" : null;

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={addNode}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            + Add step
          </button>
          {connectFrom ? (
            <span className="text-xs font-medium text-amber-600">
              Click a step to connect to — or{" "}
              <button
                type="button"
                onClick={() => setConnectFrom(null)}
                className="underline"
              >
                cancel
              </button>
            </span>
          ) : (
            <span className="text-xs text-slate-400">
              Drag a step to move · drag empty space to pan · click a step to edit
            </span>
          )}
        </div>
      )}

      {/* Bounded viewport into a larger board. Pan with the arrows or by
          dragging empty canvas. min-w-0 keeps the big board from stretching
          the surrounding layout. */}
      <div className="relative w-full min-w-0">
        <div
          ref={boardRef}
          className="relative w-full overflow-auto rounded-xl border border-slate-200 bg-slate-50 overscroll-contain"
          style={{ height }}
        >
          {/* Sizer reserves the SCALED footprint so scrollbars are correct. */}
          <div style={{ width: BOARD_W * zoom, height: BOARD_H * zoom }}>
          <div
            className="relative touch-none"
            style={{
              width: BOARD_W,
              height: BOARD_H,
              transform: `scale(${zoom})`,
              transformOrigin: "0 0",
            }}
            onPointerMove={onBoardPointerMove}
            onPointerDown={onBoardPointerDown}
            onPointerUp={onBoardPointerUp}
            onPointerLeave={onBoardPointerUp}
          >
            {/* edges */}
          <svg
            className="absolute inset-0 pointer-events-none"
            width={BOARD_W}
            height={BOARD_H}
          >
            <defs>
              {[
                ["wf-arrow", "#94a3b8"],
                ["wf-arrow-pred", "#f59e0b"],
                ["wf-arrow-succ", "#10b981"],
              ].map(([id, fill]) => (
                <marker
                  key={id}
                  id={id}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={fill} />
                </marker>
              ))}
            </defs>
            {graph.edges.map((edge) => {
              const a = byId.get(edge.from);
              const b = byId.get(edge.to);
              if (!a || !b) return null;
              const ca = center(a);
              const cb = center(b);
              const mx = (ca.x + cb.x) / 2;
              const my = (ca.y + cb.y) / 2;
              const role = edgeRole(edge); // "pred" | "succ" | null
              const stroke =
                role === "pred" ? "#f59e0b" : role === "succ" ? "#10b981" : "#94a3b8";
              const marker =
                role === "pred"
                  ? "url(#wf-arrow-pred)"
                  : role === "succ"
                    ? "url(#wf-arrow-succ)"
                    : "url(#wf-arrow)";
              return (
                <g key={edge.id}>
                  <line
                    x1={ca.x}
                    y1={ca.y}
                    x2={cb.x}
                    y2={cb.y}
                    stroke={stroke}
                    strokeWidth={role ? 2.5 : 1.5}
                    markerEnd={marker}
                  />
                  {/* Wide invisible hit-line so the WHOLE connector is
                      clickable (not just its label) — matches clicking a step. */}
                  {readOnly && onSelect && (
                    <line
                      x1={ca.x}
                      y1={ca.y}
                      x2={cb.x}
                      y2={cb.y}
                      stroke="transparent"
                      strokeWidth={18}
                      style={{ pointerEvents: "stroke", cursor: "pointer" }}
                      onClick={() => onSelect(edge.to)}
                    >
                      <title>Go to “{byId.get(edge.to)?.title ?? ""}”</title>
                    </line>
                  )}
                  {(edge.label || !readOnly) && (
                    <g
                      style={
                        readOnly && onSelect
                          ? { pointerEvents: "auto", cursor: "pointer" }
                          : undefined
                      }
                      onClick={
                        readOnly && onSelect
                          ? () => onSelect(edge.to)
                          : undefined
                      }
                    >
                      <rect
                        x={mx - Math.max(18, edge.label.length * 3.6)}
                        y={my - 10}
                        width={Math.max(36, edge.label.length * 7.2)}
                        height={20}
                        rx={5}
                        fill="#fff"
                        stroke={role ? stroke : "#e2e8f0"}
                      />
                      <text
                        x={mx}
                        y={my + 4}
                        textAnchor="middle"
                        fontSize={11}
                        fontWeight={600}
                        fill={edge.label ? "#4338ca" : "#cbd5e1"}
                      >
                        {edge.label || "choice?"}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>

          {/* nodes */}
          {graph.nodes.map((n) => {
            const isStart = graph.startId === n.id;
            const isCurrent = readOnly && n.id === currentId;
            const wasVisited = readOnly && visitedSet.has(n.id) && !isCurrent;
            const isSelected = selected === n.id;
            const isConnectSrc = connectFrom === n.id;
            const isFocus = isCurrent || isSelected || isConnectSrc;
            const isPred = !isFocus && predNodes.has(n.id);
            const isSucc = !isFocus && succNodes.has(n.id);
            return (
              <div
                key={n.id}
                onPointerDown={(e) => onNodePointerDown(e, n)}
                onPointerUp={(e) => onNodePointerUp(e, n)}
                style={{ left: n.x, top: n.y, width: NODE_W, minHeight: NODE_H }}
                className={`absolute select-none rounded-xl border-2 px-3 py-2 shadow-sm transition-colors ${
                  readOnly ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
                } ${
                  isCurrent
                    ? "border-indigo-600 bg-indigo-600 text-white shadow-lg"
                    : isConnectSrc || isSelected
                      ? "border-indigo-400 bg-white ring-2 ring-indigo-200"
                      : isPred
                        ? "border-amber-400 bg-amber-50"
                        : isSucc
                          ? "border-emerald-500 bg-emerald-50"
                          : wasVisited
                            ? "border-slate-200 bg-white opacity-60"
                            : "border-slate-300 bg-white"
                }`}
              >
                <div className="flex items-start gap-1">
                  {isStart && (
                    <span
                      className={`mt-0.5 text-[9px] font-bold uppercase ${isCurrent ? "text-indigo-100" : "text-emerald-600"}`}
                    >
                      ★
                    </span>
                  )}
                  <p
                    className={`flex-1 whitespace-normal break-words text-sm font-semibold leading-snug ${isCurrent ? "text-white" : "text-slate-800"}`}
                  >
                    {n.title || "Untitled"}
                  </p>
                </div>
                {n.note && (
                  <p
                    className={`mt-1 whitespace-normal break-words text-[10px] leading-snug ${isCurrent ? "text-indigo-100" : "text-slate-400"}`}
                  >
                    {n.note}
                  </p>
                )}
              </div>
            );
          })}
          </div>
          </div>
        </div>

        {/* Zoom controls */}
        <div className="absolute bottom-2 right-2 flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur">
          <button type="button" onClick={() => nudgeZoom(-0.1)} title="Zoom out" className="h-6 w-6 rounded text-slate-600 hover:bg-slate-100">−</button>
          <button type="button" onClick={fitToView} title="Fit whole flow" className="rounded px-1.5 h-6 text-[11px] font-medium text-slate-500 hover:bg-slate-100">
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" onClick={() => nudgeZoom(0.1)} title="Zoom in" className="h-6 w-6 rounded text-slate-600 hover:bg-slate-100">+</button>
          <button type="button" onClick={fitToView} title="Fit whole flow" className="rounded px-1.5 h-6 text-[11px] font-medium text-indigo-600 hover:bg-indigo-50">Fit</button>
        </div>

        {/* Pan controls — always visible over the viewport */}
        <div className="absolute right-2 top-2 grid grid-cols-3 gap-0.5 rounded-lg border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur">
          <span />
          <button type="button" onClick={() => panBy(0, -140)} title="Pan up" className="h-6 w-6 rounded text-slate-500 hover:bg-slate-100">↑</button>
          <span />
          <button type="button" onClick={() => panBy(-220, 0)} title="Pan left" className="h-6 w-6 rounded text-slate-500 hover:bg-slate-100">←</button>
          <button type="button" onClick={() => { if (boardRef.current) { boardRef.current.scrollLeft = 0; boardRef.current.scrollTop = 0; } }} title="Recenter" className="h-6 w-6 rounded text-slate-400 hover:bg-slate-100">⊙</button>
          <button type="button" onClick={() => panBy(220, 0)} title="Pan right" className="h-6 w-6 rounded text-slate-500 hover:bg-slate-100">→</button>
          <span />
          <button type="button" onClick={() => panBy(0, 140)} title="Pan down" className="h-6 w-6 rounded text-slate-500 hover:bg-slate-100">↓</button>
          <span />
        </div>
      </div>

      {/* Legend for the predecessor / successor highlighting. */}
      {focusId && (predNodes.size > 0 || succNodes.size > 0) && (
        <div className="flex flex-wrap items-center gap-3 px-1 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-indigo-600" />
            {readOnly ? "current step" : "selected step"}
          </span>
          {predNodes.size > 0 && (
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              leads in (predecessor)
            </span>
          )}
          {succNodes.size > 0 && (
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              leads out (successor)
            </span>
          )}
        </div>
      )}

      {/* node editor */}
      {!readOnly && sel && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
              Edit step
            </p>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              done
            </button>
          </div>
          <input
            value={sel.title}
            onChange={(e) => updateNode(sel.id, { title: e.target.value })}
            placeholder="Step title (a few words)"
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <textarea
            value={sel.note}
            onChange={(e) => updateNode(sel.id, { note: e.target.value })}
            placeholder="Supplemental guidance shown when this step is presented (1–2 sentences, Markdown ok)"
            rows={2}
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setConnectFrom(sel.id)}
              className="rounded-lg border border-indigo-300 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
            >
              ➜ Connect to…
            </button>
            <button
              type="button"
              onClick={() => commit({ ...graph, startId: sel.id })}
              disabled={graph.startId === sel.id}
              className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
            >
              ★ Make start
            </button>
            <button
              type="button"
              onClick={() => deleteNode(sel.id)}
              disabled={graph.nodes.length <= 2}
              className="ml-auto rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-40"
            >
              Delete step
            </button>
          </div>

          {/* outgoing edges of the selected node — label the branch choices */}
          {graph.edges.filter((e) => e.from === sel.id).length > 0 && (
            <div className="mt-3 border-t border-indigo-100 pt-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Branches from this step
              </p>
              <div className="flex flex-col gap-1.5">
                {graph.edges
                  .filter((e) => e.from === sel.id)
                  .map((e) => (
                    <div key={e.id} className="flex items-center gap-1.5">
                      <span className="shrink-0 text-xs text-slate-400">→</span>
                      <span className="max-w-[34%] shrink-0 truncate text-xs font-medium text-slate-600">
                        {byId.get(e.to)?.title}
                      </span>
                      <input
                        value={e.label}
                        onChange={(ev) =>
                          updateEdge(e.id, { label: ev.target.value })
                        }
                        placeholder="label this choice — e.g. “They agree”"
                        className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => deleteEdge(e.id)}
                        title="Remove this branch"
                        className="shrink-0 text-xs text-slate-300 hover:text-rose-500"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
