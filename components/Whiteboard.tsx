"use client";

import { useEffect, useRef, useState } from "react";
import type { Stroke, WBAnchor } from "./useSessionState";
import {
  VIEW_W,
  VIEW_H,
  boxOf,
  elementToSvg,
  elementIndex,
} from "@/lib/whiteboard";

const COLORS = ["#0f172a", "#e11d48", "#4f46e5", "#059669", "#d97706", "#ffffff"];
const FILLS = [null, "#dbeafe", "#dcfce7", "#fee2e2", "#fef9c3", "#e5e7eb", "#0f172a"] as const;
const WIDTHS = [2, 4, 7];
const STAMPS = [
  "🙂", "🧍", "👥", "👨‍👩‍👧", "🏠", "🏢", "🏫", "🏥", "🏪", "⛪", "🏭",
  "🌳", "🌲", "🌴", "🌵", "🌸", "🌊", "⛰️", "☀️", "☁️", "⭐",
  "🚗", "🚕", "🚌", "🚚", "🚲", "✈️", "⛵", "🛣️", "🚦", "🅿️",
  "❤️", "✅", "❌", "⚠️", "❓", "🔒", "💡", "📌", "🚩", "🔑",
];

type Tool =
  | "select"
  | "pen"
  | "text"
  | "line"
  | "arrow"
  | "conn"
  | "rect"
  | "rrect"
  | "ellipse"
  | "triangle"
  | "diamond"
  | "cloud"
  | "sticky"
  | "stamp";

// Tools that create an element by dragging a bounding box / segment.
type DrawKind =
  | "line"
  | "arrow"
  | "rect"
  | "rrect"
  | "ellipse"
  | "triangle"
  | "diamond"
  | "cloud";

const SHAPE_TOOLS: Tool[] = ["rect", "rrect", "ellipse", "triangle", "diamond", "cloud"];
const SHAPE_ICON: Record<string, string> = {
  rect: "▭",
  rrect: "▢",
  ellipse: "◯",
  triangle: "△",
  diamond: "◇",
  cloud: "☁",
};

interface Props {
  strokes: Stroke[];
  canDraw: boolean;
  canModerate: boolean;
  onStroke: (el: Record<string, unknown>) => Promise<void>;
  onElement: (el: Record<string, unknown>) => Promise<void>;
  onElementUpdate: (u: Record<string, unknown>) => void;
  onUndo: (entryId: string) => void;
  onClear: () => void;
}

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

// Shared drawing surface — freehand pen plus placeable objects (shapes, text,
// sticky notes, emoji stamps) and snap-to-shape connectors. Own edits render
// instantly; everyone else's arrive with the next state poll. Coordinates are
// normalized 0..1 so every screen sees the same picture.
export function Whiteboard({
  strokes,
  canDraw,
  canModerate,
  onStroke,
  onElement,
  onElementUpdate,
  onUndo,
  onClear,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState(COLORS[0]);
  const [fill, setFill] = useState<string | null>(null);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [stamp, setStamp] = useState(STAMPS[0]);
  const [stampOpen, setStampOpen] = useState(false);
  const [shapeMenu, setShapeMenu] = useState(false);

  const [drawing, setDrawing] = useState<[number, number][] | null>(null); // pen
  const [draft, setDraft] = useState<
    { k: DrawKind; x0: number; y0: number; x1: number; y1: number } | null
  >(null);
  const [connDraft, setConnDraft] = useState<
    { a: WBAnchor; x: number; y: number } | null
  >(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);

  // Optimistic: own newly-created elements (client id) + pending move/resize/edit
  // overrides, both applied on top of the polled `strokes` until they sync.
  const [localEls, setLocalEls] = useState<Stroke[]>([]);
  const [pending, setPending] = useState<Record<string, Partial<Stroke>>>({});
  const drag = useRef<
    | { mode: "move"; id: string; ox: number; oy: number; sx: number; sy: number }
    | { mode: "resize"; id: string; x: number; y: number }
    | null
  >(null);

  const syncedIds = new Set(strokes.map((s) => s.id));
  // Merge: polled elements (with any pending override) + own not-yet-synced.
  const elements: Stroke[] = [
    ...strokes.map((s) => (pending[s.id] ? { ...s, ...pending[s.id] } : s)),
    ...localEls.filter((e) => !syncedIds.has(e.id)),
  ];
  const byId = elementIndex(elements);
  const objects = elements.filter((e) => e.k && e.k !== "conn"); // hit-testable
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const interactive = canDraw;

  // Drop optimistic copies / overrides once the poll reflects them.
  useEffect(() => {
    setLocalEls((prev) => prev.filter((e) => !syncedIds.has(e.id)));
    setPending((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of Object.keys(prev)) {
        const s = strokes.find((x) => x.id === id);
        const o = prev[id];
        if (
          s &&
          near(s.x, o.x) &&
          near(s.y, o.y) &&
          near(s.bw, o.bw) &&
          near(s.bh, o.bh) &&
          (o.t === undefined || s.t === o.t)
        ) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes]);

  function toPoint(e: React.PointerEvent): [number, number] {
    const rect = svgRef.current!.getBoundingClientRect();
    return [
      Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    ];
  }

  function hitObject(pt: [number, number]): Stroke | null {
    for (let i = objects.length - 1; i >= 0; i--) {
      const b = boxOf(objects[i]);
      if (pt[0] >= b.x && pt[0] <= b.x + b.bw && pt[1] >= b.y && pt[1] <= b.y + b.bh) {
        return objects[i];
      }
    }
    return null;
  }

  async function create(el: Stroke) {
    setLocalEls((prev) => [...prev, el]);
    const { id, mine, ...rest } = el; // eslint-disable-line @typescript-eslint/no-unused-vars
    if (!el.k) await onStroke({ id, ...rest });
    else await onElement({ id, ...rest });
  }

  function pointerDown(e: React.PointerEvent) {
    if (!interactive || editing) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const pt = toPoint(e);

    if (tool === "pen") {
      setDrawing([pt]);
      return;
    }
    if (tool === "select") {
      const hit = hitObject(pt);
      setSelectedId(hit?.id ?? null);
      if (hit) {
        const b = boxOf(hit);
        drag.current = { mode: "move", id: hit.id, ox: b.x, oy: b.y, sx: pt[0], sy: pt[1] };
      }
      return;
    }
    if (tool === "conn") {
      const hit = hitObject(pt);
      setConnDraft({ a: hit ? { id: hit.id } : { x: pt[0], y: pt[1] }, x: pt[0], y: pt[1] });
      return;
    }
    if (tool === "text" || tool === "sticky" || tool === "stamp") {
      const id = uid();
      if (tool === "stamp") {
        create({ id, mine: true, k: "stamp", x: pt[0] - 0.03, y: pt[1] - 0.04, bw: 0.06, bh: 0.08, ch: stamp });
      } else if (tool === "text") {
        create({ id, mine: true, k: "text", x: pt[0], y: pt[1], bw: 0.3, bh: 0.06, c: color, fs: 24, t: "" });
        setEditing({ id, value: "" });
      } else {
        create({ id, mine: true, k: "sticky", x: pt[0] - 0.07, y: pt[1] - 0.05, bw: 0.14, bh: 0.11, f: fill ?? "#fde68a", t: "" });
        setEditing({ id, value: "" });
      }
      setTool("select");
      return;
    }
    // shapes + line/arrow: rubber-band
    setDraft({ k: tool as DrawKind, x0: pt[0], y0: pt[1], x1: pt[0], y1: pt[1] });
  }

  function pointerMove(e: React.PointerEvent) {
    if (drawing) {
      const pt = toPoint(e);
      const last = drawing[drawing.length - 1];
      if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) < 0.004) return;
      setDrawing((d) => (d ? [...d, pt] : d));
      return;
    }
    if (draft) {
      const pt = toPoint(e);
      setDraft((d) => (d ? { ...d, x1: pt[0], y1: pt[1] } : d));
      return;
    }
    if (connDraft) {
      const pt = toPoint(e);
      setConnDraft((c) => (c ? { ...c, x: pt[0], y: pt[1] } : c));
      return;
    }
    if (drag.current?.mode === "move") {
      const pt = toPoint(e);
      const d = drag.current;
      setPending((p) => ({ ...p, [d.id]: { ...p[d.id], x: d.ox + (pt[0] - d.sx), y: d.oy + (pt[1] - d.sy) } }));
      return;
    }
    if (drag.current?.mode === "resize") {
      const pt = toPoint(e);
      const d = drag.current;
      setPending((p) => ({ ...p, [d.id]: { ...p[d.id], bw: Math.max(0.02, pt[0] - d.x), bh: Math.max(0.02, pt[1] - d.y) } }));
      return;
    }
  }

  async function pointerUp() {
    if (drawing) {
      const points = drawing.length === 1 ? [...drawing, drawing[0]] : drawing;
      const d = drawing;
      setDrawing(null);
      if (d.length > 1)
        await create({ id: uid(), mine: true, c: color, w: width, p: points.slice(0, 800) });
      return;
    }
    if (draft) {
      const d = draft;
      setDraft(null);
      const dx = d.x1 - d.x0;
      const dy = d.y1 - d.y0;
      if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return; // too small — ignore
      const id = uid();
      if (d.k === "line" || d.k === "arrow") {
        await create({ id, mine: true, k: d.k, x: d.x0, y: d.y0, bw: dx, bh: dy, c: color, sw: width });
      } else {
        const x = Math.min(d.x0, d.x1);
        const y = Math.min(d.y0, d.y1);
        await create({ id, mine: true, k: d.k, x, y, bw: Math.abs(dx), bh: Math.abs(dy), c: color, f: fill, sw: width });
      }
      setSelectedId(id);
      return;
    }
    if (connDraft) {
      const c = connDraft;
      setConnDraft(null);
      const hit = hitObject([c.x, c.y]);
      const b: WBAnchor = hit ? { id: hit.id } : { x: c.x, y: c.y };
      // ignore a zero-length connector to nothing
      if (!c.a.id && !hit && Math.hypot((b.x ?? 0) - (c.a.x ?? 0), (b.y ?? 0) - (c.a.y ?? 0)) < 0.02) return;
      await create({ id: uid(), mine: true, k: "conn", arrow: true, a: c.a, b, c: color, sw: width });
      return;
    }
    if (drag.current) {
      const d = drag.current;
      drag.current = null;
      const patch = pending[d.id];
      if (patch) onElementUpdate({ id: d.id, ...patch });
    }
  }

  function commitEdit() {
    if (!editing) return;
    const { id, value } = editing;
    setEditing(null);
    setPending((p) => ({ ...p, [id]: { ...p[id], t: value } }));
    onElementUpdate({ id, t: value });
  }

  function removeSelected() {
    if (!selected) return;
    onUndo(selected.id);
    setLocalEls((prev) => prev.filter((e) => e.id !== selected.id));
    setSelectedId(null);
  }

  // Selection box (in %), for handles + editor overlay positioning.
  const selBox = selected ? boxOf(selected) : null;
  const pct = (n: number) => `${(n * 100).toFixed(3)}%`;

  const toolBtn = (t: Tool, label: string, title: string) => (
    <button
      key={t}
      type="button"
      title={title}
      onClick={() => {
        setTool(t);
        setShapeMenu(false);
        setStampOpen(false);
      }}
      className={`rounded-md border px-2 py-1 text-sm leading-none ${
        tool === t ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      {interactive && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {toolBtn("select", "▷", "Select / move")}
            {toolBtn("pen", "✎", "Pen")}
            {toolBtn("text", "T", "Text")}
            {toolBtn("line", "╱", "Line")}
            {toolBtn("arrow", "↗", "Arrow")}
            {toolBtn("conn", "⛓", "Connector (snaps to shapes)")}
            {/* shapes dropdown */}
            <div className="relative">
              <button
                type="button"
                title="Shapes"
                onClick={() => {
                  setShapeMenu((v) => !v);
                  setStampOpen(false);
                }}
                className={`rounded-md border px-2 py-1 text-sm leading-none ${
                  SHAPE_TOOLS.includes(tool) ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {SHAPE_ICON[tool] ?? "▭"} ▾
              </button>
              {shapeMenu && (
                <div className="absolute z-10 mt-1 flex gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                  {SHAPE_TOOLS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      title={s}
                      onClick={() => {
                        setTool(s);
                        setShapeMenu(false);
                      }}
                      className="rounded-md border border-slate-200 px-2 py-1 text-sm hover:bg-slate-50"
                    >
                      {SHAPE_ICON[s]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {toolBtn("sticky", "▤", "Sticky note")}
            {/* stamp dropdown */}
            <div className="relative">
              <button
                type="button"
                title="Stamp an object"
                onClick={() => {
                  setTool("stamp");
                  setStampOpen((v) => !v);
                  setShapeMenu(false);
                }}
                className={`rounded-md border px-2 py-1 text-sm leading-none ${
                  tool === "stamp" ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                {stamp} ▾
              </button>
              {stampOpen && (
                <div className="absolute z-10 mt-1 grid w-56 grid-cols-8 gap-0.5 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
                  {STAMPS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setStamp(s);
                        setTool("stamp");
                        setStampOpen(false);
                      }}
                      className="rounded p-1 text-lg hover:bg-slate-100"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* stroke color */}
            <div className="flex items-center gap-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-6 w-6 rounded-full border-2 shadow ${color === c ? "border-indigo-500 scale-110" : "border-white"}`}
                  style={{ backgroundColor: c }}
                  title={`Line ${c}`}
                />
              ))}
            </div>
            {/* fill */}
            <div className="ml-1 flex items-center gap-1">
              <span className="text-[10px] uppercase text-slate-400">fill</span>
              {FILLS.map((f, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setFill(f)}
                  className={`h-6 w-6 rounded-md border-2 ${fill === f ? "border-indigo-500" : "border-slate-200"} ${f === null ? "bg-white" : ""}`}
                  style={f ? { backgroundColor: f } : undefined}
                  title={f === null ? "No fill" : `Fill ${f}`}
                >
                  {f === null ? <span className="text-rose-400">∅</span> : null}
                </button>
              ))}
            </div>
            {/* width */}
            <div className="ml-1 flex items-center gap-1">
              {WIDTHS.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWidth(w)}
                  className={`flex h-6 w-7 items-center justify-center rounded-md border ${width === w ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white"}`}
                  title={`Thickness ${w}`}
                >
                  <span className="rounded-full bg-slate-700" style={{ width: w * 1.5, height: w * 1.5 }} />
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              {selected && (
                <button
                  onClick={removeSelected}
                  className="rounded-lg border border-rose-300 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                >
                  Delete
                </button>
              )}
              {canModerate && (
                <button
                  onClick={() => {
                    if (confirm("Clear the whiteboard for everyone?")) onClear();
                  }}
                  className="rounded-lg border border-rose-300 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <div className="relative w-full">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className={`w-full rounded-lg border border-slate-200 bg-white touch-none select-none ${
            interactive ? (tool === "select" ? "cursor-default" : "cursor-crosshair") : ""
          }`}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerLeave={pointerUp}
        >
          {/* Static picture — one shared renderer for board + report. */}
          <g
            dangerouslySetInnerHTML={{
              __html: elements.map((e) => elementToSvg(e, byId)).join(""),
            }}
          />
          {/* Pen in progress */}
          {drawing && (
            <path
              d={drawing.map((pt, i) => `${i === 0 ? "M" : "L"}${pt[0] * VIEW_W},${pt[1] * VIEW_H}`).join(" ")}
              stroke={color}
              strokeWidth={width}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {/* Shape / line / arrow draft */}
          {draft &&
            (() => {
              const el: Stroke =
                draft.k === "line" || draft.k === "arrow"
                  ? { id: "draft", mine: true, k: draft.k, x: draft.x0, y: draft.y0, bw: draft.x1 - draft.x0, bh: draft.y1 - draft.y0, c: color, sw: width }
                  : { id: "draft", mine: true, k: draft.k, x: Math.min(draft.x0, draft.x1), y: Math.min(draft.y0, draft.y1), bw: Math.abs(draft.x1 - draft.x0), bh: Math.abs(draft.y1 - draft.y0), c: color, f: fill, sw: width };
              return <g opacity={0.85} dangerouslySetInnerHTML={{ __html: elementToSvg(el, byId) }} />;
            })()}
          {/* Connector draft */}
          {connDraft &&
            (() => {
              const start = connDraft.a.id ? boxOf(byId.get(connDraft.a.id)!) : null;
              const ax = start ? start.x + start.bw / 2 : connDraft.a.x ?? 0;
              const ay = start ? start.y + start.bh / 2 : connDraft.a.y ?? 0;
              return (
                <line
                  x1={ax * VIEW_W}
                  y1={ay * VIEW_H}
                  x2={connDraft.x * VIEW_W}
                  y2={connDraft.y * VIEW_H}
                  stroke={color}
                  strokeWidth={width}
                  strokeDasharray="6 5"
                  strokeLinecap="round"
                />
              );
            })()}
          {/* Selection outline + resize handle */}
          {selBox && tool === "select" && (
            <g pointerEvents="none">
              <rect
                x={selBox.x * VIEW_W - 3}
                y={selBox.y * VIEW_H - 3}
                width={selBox.bw * VIEW_W + 6}
                height={selBox.bh * VIEW_H + 6}
                fill="none"
                stroke="#6366f1"
                strokeWidth={1.5}
                strokeDasharray="5 4"
              />
            </g>
          )}
        </svg>

        {/* Resize handle (bottom-right) — a real DOM element for easy grabbing. */}
        {selBox && tool === "select" && interactive && selected?.k !== "conn" && (
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              (e.target as Element).setPointerCapture?.(e.pointerId);
              drag.current = { mode: "resize", id: selected!.id, x: selBox.x, y: selBox.y };
            }}
            onPointerMove={(e) => {
              if (drag.current?.mode !== "resize") return;
              const rect = svgRef.current!.getBoundingClientRect();
              const px = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
              const py = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
              const d = drag.current;
              setPending((p) => ({ ...p, [d.id]: { ...p[d.id], bw: Math.max(0.02, px - d.x), bh: Math.max(0.02, py - d.y) } }));
            }}
            onPointerUp={() => {
              if (drag.current?.mode === "resize") {
                const id = drag.current.id;
                drag.current = null;
                const patch = pending[id];
                if (patch) onElementUpdate({ id, ...patch });
              }
            }}
            title="Resize"
            className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-full border border-white bg-indigo-500 shadow"
            style={{ left: pct(selBox.x + selBox.bw), top: pct(selBox.y + selBox.bh) }}
          />
        )}

        {/* Inline label / text editor overlay (percent-positioned over the board). */}
        {editing && (
          (() => {
            const el = byId.get(editing.id);
            const b = el ? boxOf(el) : { x: 0.4, y: 0.4, bw: 0.2, bh: 0.08 };
            return (
              <textarea
                ref={editRef}
                autoFocus
                value={editing.value}
                onChange={(e) => setEditing({ id: editing.id, value: e.target.value })}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    commitEdit();
                  }
                  if (e.key === "Escape") setEditing(null);
                }}
                className="absolute z-20 resize-none rounded border border-indigo-400 bg-white/95 p-1 text-center text-sm shadow outline-none"
                style={{ left: pct(b.x), top: pct(b.y), width: pct(b.bw), height: pct(Math.max(b.bh, 0.05)) }}
              />
            );
          })()
        )}
      </div>

      {interactive && (
        <p className="text-[11px] text-slate-400">
          Pick a tool, then draw on the board. Drag shapes with{" "}
          <span className="font-medium">Select</span>; double-click a shape to
          label it; the <span className="font-medium">Connector</span> snaps to
          shapes and stays attached when you move them.
        </p>
      )}
      {/* double-click to edit a shape's label */}
      <DblClickCatcher
        svgRef={svgRef}
        enabled={interactive && tool === "select"}
        hit={hitObject}
        onEdit={(el) => {
          setSelectedId(el.id);
          if (el.k === "conn" || el.k === "stamp") return;
          setEditing({ id: el.id, value: el.t ?? "" });
        }}
      />
    </div>
  );
}

function near(a: number | undefined, b: number | undefined) {
  if (a === undefined || b === undefined) return a === b;
  return Math.abs(a - b) < 0.002;
}

// Small helper: attach a dblclick listener to the svg to open the label editor.
function DblClickCatcher({
  svgRef,
  enabled,
  hit,
  onEdit,
}: {
  svgRef: React.RefObject<SVGSVGElement | null>;
  enabled: boolean;
  hit: (pt: [number, number]) => Stroke | null;
  onEdit: (el: Stroke) => void;
}) {
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !enabled) return;
    const handler = (e: MouseEvent) => {
      const rect = svg.getBoundingClientRect();
      const pt: [number, number] = [
        (e.clientX - rect.left) / rect.width,
        (e.clientY - rect.top) / rect.height,
      ];
      const el = hit(pt);
      if (el) onEdit(el);
    };
    svg.addEventListener("dblclick", handler);
    return () => svg.removeEventListener("dblclick", handler);
  }, [svgRef, enabled, hit, onEdit]);
  return null;
}
