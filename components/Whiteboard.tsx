"use client";

import { useEffect, useRef, useState } from "react";
import type { Stroke, WBAnchor } from "./useSessionState";
import {
  VIEW_W,
  VIEW_H,
  boxOf,
  elementToSvg,
  elementIndex,
  sortByZ,
  resolveEnd,
} from "@/lib/whiteboard";
import { ART_GROUPS, artPiece } from "@/lib/artPieces";

const COLORS = [
  "#0f172a", "#64748b", "#ffffff", "#e11d48", "#f97316", "#f59e0b",
  "#eab308", "#84cc16", "#22c55e", "#059669", "#14b8a6", "#06b6d4",
  "#3b82f6", "#4f46e5", "#8b5cf6", "#d946ef", "#ec4899", "#78350f",
];
const FILLS: (string | null)[] = [
  null, "#ffffff", "#0f172a", "#fecaca", "#fed7aa", "#fef08a",
  "#d9f99d", "#bbf7d0", "#a7f3d0", "#a5f3fc", "#bfdbfe", "#c7d2fe",
  "#ddd6fe", "#f5d0fe", "#fbcfe8", "#e5e7eb", "#fca5a5", "#fdba74",
];
const WIDTHS = [2, 4, 7];
// Pattern fills (stored as "p:<type>:<color>"); CSS previews for the picker.
const PATTERN_TYPES = ["dots", "stripes", "grid", "cross", "checker"] as const;
const patternPreview = (type: string, c: string): string => {
  switch (type) {
    case "dots":
      return `radial-gradient(${c} 22%, transparent 24%) 0 0/6px 6px`;
    case "stripes":
      return `repeating-linear-gradient(45deg, ${c} 0 2px, #fff 2px 5px)`;
    case "grid":
      return `repeating-linear-gradient(0deg, ${c} 0 1px, #fff 1px 6px), repeating-linear-gradient(90deg, ${c} 0 1px, transparent 1px 6px)`;
    case "cross":
      return `repeating-linear-gradient(45deg, ${c} 0 1px, transparent 1px 5px), repeating-linear-gradient(-45deg, ${c} 0 1px, #fff 1px 5px)`;
    case "checker":
      return `conic-gradient(${c} 25%, #fff 0 50%, ${c} 0 75%, #fff 0) 0 0/8px 8px`;
    default:
      return c;
  }
};
const STAMP_GROUPS: { label: string; items: string[] }[] = [
  { label: "People", items: ["🙂", "😀", "🧍", "🧍‍♀️", "👥", "👨‍👩‍👧", "🧑‍🏫", "🧑‍💼", "👷", "👮", "🧑‍⚕️", "🙋", "👶", "🧑‍🍳", "🕺", "🧑‍🌾"] },
  { label: "Buildings", items: ["🏠", "🏡", "🏢", "🏫", "🏥", "🏪", "🏦", "⛪", "🕌", "🏭", "🏛️", "🏗️", "🏨", "🏰", "🗼", "⛺", "🚪", "🪑"] },
  { label: "Nature", items: ["🌳", "🌲", "🌴", "🌵", "🌱", "🌿", "🍀", "🌸", "🌷", "🌻", "🌊", "⛰️", "🏔️", "🌋", "🏞️", "🪨", "🔥", "💧", "❄️", "🍂"] },
  { label: "Weather", items: ["☀️", "🌤️", "⛅", "☁️", "🌧️", "⛈️", "🌩️", "🌈", "⭐", "🌙", "💨", "🌪️"] },
  { label: "Transport", items: ["🚗", "🚕", "🚙", "🚌", "🚚", "🚛", "🚓", "🚑", "🚒", "🚲", "🛵", "🏍️", "✈️", "🚀", "⛵", "🚢", "🚂", "🚦", "🛣️", "🅿️", "⚓", "🛑"] },
  { label: "Animals", items: ["🐶", "🐱", "🐴", "🐄", "🐖", "🐑", "🐔", "🐟", "🐝", "🦋", "🐢", "🦉", "🐕", "🐈", "🐰", "🦆"] },
  { label: "Objects", items: ["💻", "📱", "🖥️", "⌨️", "🖨️", "📷", "☎️", "📞", "✉️", "📧", "📅", "🕐", "🔔", "🔑", "🔒", "💡", "🔦", "🧰", "🔧", "📦", "🎁", "🛒", "💰", "💵", "📈", "📉", "📊", "📋", "📌", "📎", "✏️", "🖊️", "📖", "🎓", "🏆", "⚙️"] },
  { label: "Symbols", items: ["❤️", "⭐", "✅", "❌", "⚠️", "❓", "❗", "➕", "➖", "🚩", "🏁", "🎯", "💬", "💭", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪", "⬆️", "⬇️", "⬅️", "➡️", "🔁", "♻️", "🆗", "🚫"] },
  { label: "Food", items: ["🍎", "🍞", "🍕", "🍔", "🍟", "☕", "🍺", "🥗", "🍰", "🍦", "🍩", "🥤", "🍌", "🥕"] },
];

type Tool =
  | "select"
  | "pen"
  | "eraser"
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
  | "stamp"
  | "art"
  | "poly"
  | "table";

// Tools that create an element by dragging a bounding box / segment.
type DrawKind =
  | "line"
  | "arrow"
  | "rect"
  | "rrect"
  | "ellipse"
  | "triangle"
  | "diamond"
  | "cloud"
  | "poly"
  | "table";

const SHAPE_TOOLS: Tool[] = ["rect", "rrect", "ellipse", "triangle", "diamond", "cloud", "poly"];
const SHAPE_ICON: Record<string, string> = {
  rect: "▭",
  rrect: "▢",
  ellipse: "◯",
  triangle: "△",
  diamond: "◇",
  cloud: "☁",
  poly: "⬠",
};
// A fresh polygon starts as a pentagon (unit coords); drag its vertices to sculpt.
const DEFAULT_POLY: [number, number][] = [
  [0.5, 0.03],
  [0.97, 0.38],
  [0.79, 0.97],
  [0.21, 0.97],
  [0.03, 0.38],
];
// Objects offered by the Objects-panel "＋ Add" menu (a stamp entry, using the
// currently-picked emoji, is appended at render time).
const ADD_ITEMS: { kind: Tool; label: string; icon: string }[] = [
  { kind: "text", label: "Text", icon: "T" },
  { kind: "sticky", label: "Sticky note", icon: "▤" },
  { kind: "rect", label: "Rectangle", icon: "▭" },
  { kind: "rrect", label: "Rounded rect", icon: "▢" },
  { kind: "ellipse", label: "Ellipse", icon: "◯" },
  { kind: "triangle", label: "Triangle", icon: "△" },
  { kind: "diamond", label: "Diamond", icon: "◇" },
  { kind: "cloud", label: "Cloud", icon: "☁" },
  { kind: "line", label: "Line", icon: "╱" },
  { kind: "arrow", label: "Arrow", icon: "↗" },
  { kind: "table", label: "Table", icon: "▦" },
];

interface Props {
  strokes: Stroke[];
  canDraw: boolean;
  canModerate: boolean;
  onStroke: (el: Record<string, unknown>) => Promise<void>;
  onElement: (el: Record<string, unknown>) => Promise<void>;
  onElementUpdate: (u: Record<string, unknown>) => void;
  onUndo: (entryId: string) => void;
  onClear: () => void;
  /** Override the emoji bucket (the "Build" tool passes a themed set). */
  stampGroups?: { label: string; items: string[] }[];
  /** Upload a pasted/dropped image (data URL) → returns a hosted URL, or null. */
  onPasteImage?: (dataUrl: string) => Promise<string | null>;
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
  stampGroups,
  onPasteImage,
}: Props) {
  const stampGroupsUsed = stampGroups ?? STAMP_GROUPS;
  const stampsFlat = stampGroupsUsed.flatMap((g) => g.items);
  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState(COLORS[0]);
  const [fill, setFill] = useState<string | null>(null);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [fontSize, setFontSize] = useState(24);
  const [stamp, setStamp] = useState(stampsFlat[0]);
  const [stampOpen, setStampOpen] = useState(false);
  const [artId, setArtId] = useState<string>(ART_GROUPS[0].items[0]);
  const [artOpen, setArtOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false); // "＋ Add" object dropdown
  const [shapeMenu, setShapeMenu] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);

  const [drawing, setDrawing] = useState<[number, number][] | null>(null); // pen
  const [draft, setDraft] = useState<
    { k: DrawKind; x0: number; y0: number; x1: number; y1: number } | null
  >(null);
  const [connDraft, setConnDraft] = useState<
    { a: WBAnchor; x: number; y: number } | null
  >(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; value: string; isNew?: boolean; cell?: number } | null>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);

  // Focus the label editor once it mounts (autoFocus races with the pointer
  // interaction that opened it, so focus explicitly a tick later).
  useEffect(() => {
    if (!editing) return;
    const t = window.setTimeout(() => editRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [editing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Optimistic: own newly-created elements (client id) + pending move/resize/edit
  // overrides, both applied on top of the polled `strokes` until they sync.
  const [localEls, setLocalEls] = useState<Stroke[]>([]);
  const [pending, setPending] = useState<Record<string, Partial<Stroke>>>({});
  const drag = useRef<
    | { mode: "move"; ids: { id: string; ox: number; oy: number }[]; sx: number; sy: number }
    | { mode: "resize"; id: string; ax: number; ay: number } // box corner: opposite corner fixed
    | { mode: "endpoint"; id: string; fx: number; fy: number; moving: "a" | "b" } // line endpoint
    | { mode: "rotate"; id: string; cx: number; cy: number } // spin about box center
    | { mode: "vertex"; id: string; i: number; box: { x: number; y: number; bw: number; bh: number }; pts: [number, number][] } // sculpt a poly vertex
    | null
  >(null);
  const erasing = useRef(false);

  const syncedIds = new Set(strokes.map((s) => s.id));
  // Merge: polled elements (with any pending override) + own not-yet-synced,
  // then order back-to-front by layer (z).
  const elements: Stroke[] = sortByZ([
    ...strokes.map((s) => (pending[s.id] ? { ...s, ...pending[s.id] } : s)),
    ...localEls.filter((e) => !syncedIds.has(e.id)),
  ]);
  const byId = elementIndex(elements);
  const objects = elements.filter((e) => e.k && e.k !== "conn"); // hit-testable (z-ordered)
  const isSel = (id: string) => selectedIds.has(id);
  // The single selected element (only when exactly one) — drives handles/font.
  const selected = selectedIds.size === 1 ? byId.get([...selectedIds][0]) : undefined;
  // Apply an appearance change (color, fill…) to the currently-selected element,
  // optimistically, so the palette also recolours a placed object.
  const applyToSelected = (patch: Record<string, unknown>) => {
    if (!selected) return;
    setPending((p) => ({ ...p, [selected.id]: { ...p[selected.id], ...patch } }));
    onElementUpdate({ id: selected.id, ...patch });
  };
  // Pick a line colour — and, if the selected shape has a pattern fill, re-ink
  // that pattern to the new colour too (so "change colour" recolours patterns).
  const pickColor = (c: string) => {
    setColor(c);
    if (!selected) return;
    const patch: Record<string, unknown> = { c };
    if (typeof selected.f === "string" && selected.f.startsWith("p:")) {
      patch.f = `p:${selected.f.split(":")[1] || "dots"}:${c}`;
    }
    applyToSelected(patch);
  };
  const interactive = canDraw;

  // Selecting an element selects its whole group; shift toggles it in/out.
  function selectEl(id: string | null, additive = false) {
    if (id === null) {
      if (!additive) setSelectedIds(new Set());
      return;
    }
    const el = byId.get(id);
    const grp = el?.g ? elements.filter((e) => e.g === el.g).map((e) => e.id) : [id];
    setSelectedIds((prev) => {
      if (!additive) return new Set(grp);
      const next = new Set(prev);
      if (grp.every((g) => next.has(g))) grp.forEach((g) => next.delete(g));
      else grp.forEach((g) => next.add(g));
      return next;
    });
  }

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

  function hitObject(pt: [number, number], margin = 0): Stroke | null {
    for (let i = objects.length - 1; i >= 0; i--) {
      const b = boxOf(objects[i]);
      if (
        pt[0] >= b.x - margin &&
        pt[0] <= b.x + b.bw + margin &&
        pt[1] >= b.y - margin &&
        pt[1] <= b.y + b.bh + margin
      ) {
        return objects[i];
      }
    }
    return null;
  }

  // Eraser: hit-test EVERY element (incl. pen strokes / lines / connectors, which
  // aren't box-selectable) by proximity, and remove the top-most one under `pt`.
  function eraseAt(pt: [number, number]) {
    const thr = 0.02;
    for (let i = elements.length - 1; i >= 0; i--) {
      const e = elements[i];
      let hit = false;
      if (!e.k) {
        const p = e.p ?? [];
        for (let j = 1; j < p.length && !hit; j++) if (distToSeg(pt, p[j - 1], p[j]) < thr) hit = true;
      } else if (e.k === "line" || e.k === "arrow") {
        hit = distToSeg(pt, [e.x ?? 0, e.y ?? 0], [(e.x ?? 0) + (e.bw ?? 0), (e.y ?? 0) + (e.bh ?? 0)]) < thr;
      } else if (e.k === "conn") {
        hit = distToSeg(pt, resolveEnd(e.a, e.b, byId), resolveEnd(e.b, e.a, byId)) < thr;
      } else {
        const b = boxOf(e);
        hit = pt[0] >= b.x - thr && pt[0] <= b.x + b.bw + thr && pt[1] >= b.y - thr && pt[1] <= b.y + b.bh + thr;
      }
      if (hit) {
        removeId(e.id);
        return;
      }
    }
  }

  async function create(el: Stroke) {
    setLocalEls((prev) => [...prev, el]);
    const { id, mine, ...rest } = el; // eslint-disable-line @typescript-eslint/no-unused-vars
    if (!el.k) await onStroke({ id, ...rest });
    else await onElement({ id, ...rest });
  }

  const [uploading, setUploading] = useState(false);
  // Upload a pasted/dropped/picked image, then place it (true aspect ratio).
  async function placeImage(dataUrl: string) {
    if (!onPasteImage || uploading) return;
    setUploading(true);
    try {
      const url = await onPasteImage(dataUrl);
      if (!url) return;
      const dims = await new Promise<{ w: number; h: number }>((res) => {
        const im = new window.Image();
        im.onload = () => res({ w: im.naturalWidth || 1, h: im.naturalHeight || 1 });
        im.onerror = () => res({ w: 1, h: 1 });
        im.src = url;
      });
      const bw = 0.34;
      // On-screen aspect = (bw*VIEW_W)/(bh*VIEW_H) should equal dims.w/dims.h.
      const bh = Math.min(0.7, bw * (VIEW_W / VIEW_H) * (dims.h / dims.w));
      const id = uid();
      await create({ id, mine: true, k: "image", src: url, x: 0.33, y: 0.2, bw, bh });
      setTool("select");
      setSelectedIds(new Set([id]));
    } finally {
      setUploading(false);
    }
  }
  // Read the first image out of a file list / clipboard and place it.
  function readAndPlace(files: FileList | File[] | null | undefined) {
    const list = files ? Array.from(files) : [];
    const img = list.find((f) => f.type.startsWith("image/"));
    if (!img) return;
    const r = new FileReader();
    r.onload = () => {
      if (typeof r.result === "string") placeImage(r.result);
    };
    r.readAsDataURL(img);
  }
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Paste an image from the clipboard (Cmd/Ctrl-V) onto the board.
  useEffect(() => {
    if (!interactive || !onPasteImage) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of Array.from(items)) {
        if (it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) {
            e.preventDefault();
            readAndPlace([f]);
          }
          return;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, onPasteImage, uploading]);

  // Supplemental "drop it on the board" path (the Objects-panel ＋ Add menu):
  // place a ready-made object at a cascading centre position, select it, and
  // register it in the layer list — no click-to-place aim required. Text and
  // sticky open the label editor straight away.
  function insertObject(kind: Tool) {
    setAddOpen(false);
    if (kind === "select" || kind === "pen" || kind === "eraser" || kind === "conn") return;
    const id = uid();
    const off = (elements.length % 6) * 0.025; // stagger repeats so they don't stack
    const x = 0.34 + off;
    const y = 0.3 + off;
    let el: Stroke;
    if (kind === "text") {
      el = { id, mine: true, k: "text", x, y, bw: 0.3, bh: 0.07, c: color, fs: fontSize, t: "Text" };
    } else if (kind === "sticky") {
      el = { id, mine: true, k: "sticky", x, y, bw: 0.16, bh: 0.12, f: fill ?? "#fde68a", t: "" };
    } else if (kind === "line" || kind === "arrow") {
      el = { id, mine: true, k: kind, x, y: y + 0.06, bw: 0.22, bh: 0, c: color, sw: width };
    } else if (kind === "table") {
      el = { id, mine: true, k: "table", x, y, bw: 0.32, bh: 0.2, rows: tableRows, cols: tableCols, cells: [], c: color, f: fill, sw: width };
    } else if (kind === "stamp") {
      el = { id, mine: true, k: "stamp", x, y, bw: 0.07, bh: 0.09, ch: stamp };
    } else {
      el = { id, mine: true, k: kind, x, y, bw: 0.18, bh: 0.13, c: color, f: fill, sw: width };
    }
    create(el);
    setTool("select");
    setSelectedIds(new Set([id]));
    // Open the editor for label-bearing kinds (persist even if left as-is —
    // these come from an explicit insert, so nothing is auto-discarded).
    if (kind === "text" || kind === "sticky") {
      setEditing({ id, value: el.t ?? "" });
    }
  }

  function pointerDown(e: React.PointerEvent) {
    if (!interactive || editing) return;
    const pt = toPoint(e);
    // Click-to-place tools (text/sticky/stamp) must NOT capture the pointer —
    // capture keeps focus on the SVG and blurs the label editor instantly.
    const capture = () => (e.target as Element).setPointerCapture?.(e.pointerId);

    if (tool === "pen") {
      capture();
      setDrawing([pt]);
      return;
    }
    if (tool === "eraser") {
      capture();
      erasing.current = true;
      eraseAt(pt);
      return;
    }
    if (tool === "select") {
      const hit = hitObject(pt);
      // Second click on an already-selected table → edit the clicked cell.
      if (hit && hit.k === "table" && selectedIds.size === 1 && selectedIds.has(hit.id)) {
        const b = boxOf(hit);
        const cols = hit.cols ?? 3;
        const rows = hit.rows ?? 3;
        const cc = Math.min(cols - 1, Math.max(0, Math.floor(((pt[0] - b.x) / (b.bw || 1)) * cols)));
        const rr = Math.min(rows - 1, Math.max(0, Math.floor(((pt[1] - b.y) / (b.bh || 1)) * rows)));
        const idx = rr * cols + cc;
        setEditing({ id: hit.id, value: (hit.cells ?? [])[idx] ?? "", cell: idx });
        return;
      }
      if (!hit) {
        if (!e.shiftKey) setSelectedIds(new Set());
        return;
      }
      const grp = hit.g ? elements.filter((x) => x.g === hit.g).map((x) => x.id) : [hit.id];
      if (e.shiftKey) {
        selectEl(hit.id, true); // shift-click toggles the (group) into the selection
        return;
      }
      // Plain click: keep the current multi-selection if the hit is already in it
      // (so you can drag the whole set), else select just this element's group.
      const keep = selectedIds.has(hit.id);
      const moveIds = keep ? [...selectedIds] : grp;
      if (!keep) setSelectedIds(new Set(grp));
      capture();
      drag.current = {
        mode: "move",
        ids: moveIds
          .map((id) => byId.get(id))
          .filter((el): el is Stroke => !!el)
          .map((el) => {
            const b = boxOf(el);
            return { id: el.id, ox: b.x, oy: b.y };
          }),
        sx: pt[0],
        sy: pt[1],
      };
      return;
    }
    if (tool === "conn") {
      capture();
      const hit = hitObject(pt, 0.02); // forgiving snap → connects to ANY object type
      setConnDraft({ a: hit ? { id: hit.id } : { x: pt[0], y: pt[1] }, x: pt[0], y: pt[1] });
      return;
    }
    if (tool === "art") {
      const id = uid();
      create({ id, mine: true, k: "art", x: pt[0] - 0.06, y: pt[1] - 0.06, bw: 0.12, bh: 0.12, art: artId, c: color, f: fill });
      setTool("select");
      setSelectedIds(new Set([id]));
      return;
    }
    if (tool === "text" || tool === "sticky" || tool === "stamp") {
      const id = uid();
      if (tool === "stamp") {
        create({ id, mine: true, k: "stamp", x: pt[0] - 0.03, y: pt[1] - 0.04, bw: 0.06, bh: 0.08, ch: stamp });
      } else if (tool === "text") {
        // Seed a visible label so a mis-aimed click never leaves an invisible,
        // silently-discarded empty box; the editor selects it for replacement.
        create({ id, mine: true, k: "text", x: pt[0], y: pt[1], bw: 0.3, bh: 0.06, c: color, fs: fontSize, t: "Text" });
        setEditing({ id, value: "Text", isNew: true });
      } else {
        create({ id, mine: true, k: "sticky", x: pt[0] - 0.07, y: pt[1] - 0.05, bw: 0.14, bh: 0.11, f: fill ?? "#fde68a", t: "" });
        setEditing({ id, value: "", isNew: true });
      }
      setTool("select");
      return;
    }
    // shapes + line/arrow: rubber-band
    capture();
    setDraft({ k: tool as DrawKind, x0: pt[0], y0: pt[1], x1: pt[0], y1: pt[1] });
  }

  function pointerMove(e: React.PointerEvent) {
    if (erasing.current) {
      eraseAt(toPoint(e));
      return;
    }
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
      const dx = pt[0] - d.sx;
      const dy = pt[1] - d.sy;
      setPending((p) => {
        const next = { ...p };
        for (const o of d.ids) next[o.id] = { ...next[o.id], x: o.ox + dx, y: o.oy + dy };
        return next;
      });
      return;
    }
    if (drag.current?.mode === "resize") {
      const pt = toPoint(e);
      const d = drag.current;
      setPending((p) => ({
        ...p,
        [d.id]: {
          ...p[d.id],
          x: Math.min(d.ax, pt[0]),
          y: Math.min(d.ay, pt[1]),
          bw: Math.max(0.01, Math.abs(pt[0] - d.ax)),
          bh: Math.max(0.01, Math.abs(pt[1] - d.ay)),
        },
      }));
      return;
    }
    if (drag.current?.mode === "endpoint") {
      const pt = toPoint(e);
      const d = drag.current;
      const a = d.moving === "a" ? pt : [d.fx, d.fy];
      const b = d.moving === "b" ? pt : [d.fx, d.fy];
      setPending((p) => ({ ...p, [d.id]: { ...p[d.id], x: a[0], y: a[1], bw: b[0] - a[0], bh: b[1] - a[1] } }));
      return;
    }
    if (drag.current?.mode === "rotate") {
      const pt = toPoint(e);
      const d = drag.current;
      // Handle sits above the box, so straight-up = 0°. Shift-free snap to 15°.
      let deg = (Math.atan2(pt[1] - d.cy, pt[0] - d.cx) * 180) / Math.PI + 90;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      const rot = ((Math.round(deg) % 360) + 360) % 360;
      setPending((p) => ({ ...p, [d.id]: { ...p[d.id], rot } }));
      return;
    }
    if (drag.current?.mode === "vertex") {
      const pt = toPoint(e);
      const d = drag.current;
      const clamp = (v: number) => Math.min(1, Math.max(0, v));
      const ux = clamp(d.box.bw ? (pt[0] - d.box.x) / d.box.bw : 0);
      const uy = clamp(d.box.bh ? (pt[1] - d.box.y) / d.box.bh : 0);
      const next = d.pts.map((p, idx) => (idx === d.i ? [ux, uy] : p)) as [number, number][];
      setPending((p) => ({ ...p, [d.id]: { ...p[d.id], pts: next } }));
      return;
    }
    // Idle hover in select mode → outline the object under the cursor so it's
    // clear what will be grabbed (borderless text/no-fill shapes are hard to see).
    if (tool === "select") {
      const h = hitObject(toPoint(e));
      setHoverId(h?.id ?? null);
    }
  }

  async function pointerUp() {
    if (erasing.current) {
      erasing.current = false;
      return;
    }
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
      } else if (d.k === "table") {
        await create({ id, mine: true, k: "table", x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), bw: Math.abs(dx), bh: Math.abs(dy), rows: tableRows, cols: tableCols, cells: [], c: color, f: fill, sw: width });
      } else {
        const x = Math.min(d.x0, d.x1);
        const y = Math.min(d.y0, d.y1);
        await create({
          id,
          mine: true,
          k: d.k,
          x,
          y,
          bw: Math.abs(dx),
          bh: Math.abs(dy),
          c: color,
          f: fill,
          sw: width,
          ...(d.k === "poly" ? { pts: DEFAULT_POLY } : {}),
        });
      }
      setSelectedIds(new Set([id]));
      return;
    }
    if (connDraft) {
      const c = connDraft;
      setConnDraft(null);
      const hit = hitObject([c.x, c.y], 0.02);
      const b: WBAnchor = hit ? { id: hit.id } : { x: c.x, y: c.y };
      // ignore a zero-length connector to nothing
      if (!c.a.id && !hit && Math.hypot((b.x ?? 0) - (c.a.x ?? 0), (b.y ?? 0) - (c.a.y ?? 0)) < 0.02) return;
      await create({ id: uid(), mine: true, k: "conn", arrow: true, a: c.a, b, c: color, sw: width });
      return;
    }
    if (drag.current) {
      const d = drag.current;
      drag.current = null;
      const ids = d.mode === "move" ? d.ids.map((o) => o.id) : [d.id];
      for (const id of ids) {
        const patch = pending[id];
        if (patch) onElementUpdate({ id, ...patch });
      }
    }
  }

  function commitEdit() {
    if (!editing) return;
    const { id, value, isNew, cell } = editing;
    setEditing(null);
    // Editing a table cell → patch that cell of the cells array.
    if (cell !== undefined) {
      const el = byId.get(id);
      const n = (el?.rows ?? 3) * (el?.cols ?? 3);
      const cells = Array.from({ length: n }, (_, i) => (el?.cells ?? [])[i] ?? "");
      cells[cell] = value;
      setPending((p) => ({ ...p, [id]: { ...p[id], cells } }));
      onElementUpdate({ id, cells });
      return;
    }
    // A brand-new text/sticky left empty is discarded, not littered.
    if (isNew && !value.trim()) {
      onUndo(id);
      setLocalEls((prev) => prev.filter((e) => e.id !== id));
      setSelectedIds(new Set());
      return;
    }
    setPending((p) => ({ ...p, [id]: { ...p[id], t: value } }));
    onElementUpdate({ id, t: value });
  }

  function removeId(id: string) {
    onUndo(id);
    setLocalEls((prev) => prev.filter((e) => e.id !== id));
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
  }

  function startHandle(e: React.PointerEvent, d: NonNullable<typeof drag.current>) {
    e.stopPropagation();
    svgRef.current?.setPointerCapture?.(e.pointerId);
    drag.current = d;
  }

  // Drag-reorder in the Objects list: move `dragId` to `targetId`'s slot and
  // re-stamp every element's z from the new front-to-back order.
  function reorderTo(dragId: string, targetId: string) {
    if (dragId === targetId) return;
    const order = [...elements].reverse().map((e) => e.id); // front → back
    const from = order.indexOf(dragId);
    if (from < 0) return;
    order.splice(from, 1);
    const at = order.indexOf(targetId);
    if (at < 0) return;
    order.splice(at, 0, dragId);
    const n = order.length;
    order.forEach((id, i) => {
      const z = n - i; // front-most gets the highest z
      if ((byId.get(id)?.z ?? 0) !== z) {
        setPending((p) => ({ ...p, [id]: { ...p[id], z } }));
        onElementUpdate({ id, z });
      }
    });
  }

  // Layer order: bring an element to the front / send it to the back.
  function relayerId(id: string, dir: "front" | "back") {
    let mn = 0;
    let mx = 0;
    for (const e of elements) {
      const z = e.z ?? 0;
      if (z < mn) mn = z;
      if (z > mx) mx = z;
    }
    const z = dir === "front" ? mx + 1 : mn - 1;
    setPending((p) => ({ ...p, [id]: { ...p[id], z } }));
    onElementUpdate({ id, z });
  }

  // Selection box (in %), for handles + editor overlay positioning.
  const pct = (n: number) => `${(n * 100).toFixed(3)}%`;
  const anySelectedGrouped = [...selectedIds].some((id) => byId.get(id)?.g);

  // Group the selected elements under a fresh id (or ungroup them).
  function groupSelected() {
    const gid = uid().slice(0, 12);
    for (const id of selectedIds) {
      setPending((p) => ({ ...p, [id]: { ...p[id], g: gid } }));
      onElementUpdate({ id, g: gid });
    }
  }
  function ungroupSelected() {
    for (const id of selectedIds) {
      setPending((p) => ({ ...p, [id]: { ...p[id], g: undefined } }));
      onElementUpdate({ id, g: "" });
    }
  }

  // Poly vertex editing: insert a point after `afterIdx`, or remove point `i`.
  function addVertex(id: string, afterIdx: number, unit: [number, number]) {
    const el = byId.get(id);
    if (!el?.pts) return;
    const pts = [...el.pts];
    pts.splice(afterIdx + 1, 0, unit);
    setPending((p) => ({ ...p, [id]: { ...p[id], pts } }));
    onElementUpdate({ id, pts });
  }
  function removeVertex(id: string, i: number) {
    const el = byId.get(id);
    if (!el?.pts || el.pts.length <= 3) return;
    const pts = el.pts.filter((_, idx) => idx !== i);
    setPending((p) => ({ ...p, [id]: { ...p[id], pts } }));
    onElementUpdate({ id, pts });
  }

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
            {toolBtn("eraser", "⌫", "Eraser — click or drag over anything to remove it")}
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
            {toolBtn("table", "▦", "Table — drag to place")}
            {tool === "table" && (
              <span className="flex items-center gap-1 text-[11px] text-slate-500">
                <select
                  value={tableRows}
                  onChange={(e) => setTableRows(Number(e.target.value))}
                  className="rounded border border-slate-200 px-1 py-0.5"
                  title="Rows"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                ×
                <select
                  value={tableCols}
                  onChange={(e) => setTableCols(Number(e.target.value))}
                  className="rounded border border-slate-200 px-1 py-0.5"
                  title="Columns"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </span>
            )}
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
                <div className="absolute z-10 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
                  {stampGroupsUsed.map((g) => (
                    <div key={g.label} className="mb-1">
                      <p className="px-1 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {g.label}
                      </p>
                      <div className="grid grid-cols-8 gap-0.5">
                        {g.items.map((s) => (
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
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* art / face-parts dropdown */}
            <div className="relative">
              <button
                type="button"
                title="Place a face part / art piece"
                onClick={() => {
                  setTool("art");
                  setArtOpen((v) => !v);
                  setStampOpen(false);
                  setShapeMenu(false);
                }}
                className={`flex items-center gap-1 rounded-md border px-2 py-1 text-sm leading-none ${
                  tool === "art" ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <svg viewBox="0 0 100 100" className="h-4 w-4">
                  <g dangerouslySetInnerHTML={{ __html: artPiece(artId, "#0f172a", null) }} />
                </svg>
                Face ▾
              </button>
              {artOpen && (
                <div className="absolute z-10 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
                  {ART_GROUPS.map((g) => (
                    <div key={g.label} className="mb-1">
                      <p className="px-1 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {g.label}
                      </p>
                      <div className="grid grid-cols-6 gap-0.5">
                        {g.items.map((a) => (
                          <button
                            key={a}
                            type="button"
                            title={a}
                            onClick={() => {
                              setArtId(a);
                              setTool("art");
                              setArtOpen(false);
                            }}
                            className={`rounded p-1 hover:bg-slate-100 ${artId === a ? "bg-indigo-50 ring-1 ring-indigo-300" : ""}`}
                          >
                            <svg viewBox="0 0 100 100" className="h-7 w-7">
                              <g dangerouslySetInnerHTML={{ __html: artPiece(a, "#0f172a", null) }} />
                            </svg>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* image upload (paste/drop also work) */}
            {onPasteImage && (
              <>
                <button
                  type="button"
                  title="Add an image (or paste / drop one onto the canvas)"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm leading-none hover:bg-slate-50 disabled:opacity-40"
                >
                  {uploading ? "…" : "🖼"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    readAndPlace(e.target.files);
                    e.target.value = "";
                  }}
                />
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* stroke color */}
            <div className="flex max-w-[220px] items-center gap-1 overflow-x-auto">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => pickColor(c)}
                  className={`h-6 w-6 shrink-0 rounded-full border-2 shadow ${color === c ? "border-indigo-500 scale-110" : "border-white"}`}
                  style={{ backgroundColor: c }}
                  title={`Line ${c}`}
                />
              ))}
              <label
                className="relative h-6 w-6 shrink-0 cursor-pointer rounded-full border-2 border-white shadow"
                title="Custom line color"
                style={{
                  background:
                    "conic-gradient(red,orange,yellow,lime,cyan,blue,magenta,red)",
                }}
              >
                <input
                  type="color"
                  value={color}
                  onChange={(e) => pickColor(e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
            </div>
            {/* fill */}
            <div className="ml-1 flex max-w-[240px] items-center gap-1 overflow-x-auto">
              <span className="shrink-0 text-[10px] uppercase text-slate-400">fill</span>
              {FILLS.map((f, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setFill(f);
                    applyToSelected({ f: f ?? null });
                  }}
                  className={`h-6 w-6 shrink-0 rounded-md border-2 ${fill === f ? "border-indigo-500" : "border-slate-200"} ${f === null ? "bg-white" : ""}`}
                  style={f ? { backgroundColor: f } : undefined}
                  title={f === null ? "No fill" : `Fill ${f}`}
                >
                  {f === null ? <span className="text-rose-400">∅</span> : null}
                </button>
              ))}
              <label
                className="relative h-6 w-6 shrink-0 cursor-pointer rounded-md border-2 border-slate-200"
                title="Custom fill color"
                style={{
                  background:
                    "conic-gradient(red,orange,yellow,lime,cyan,blue,magenta,red)",
                }}
              >
                <input
                  type="color"
                  value={fill ?? "#ffffff"}
                  onChange={(e) => {
                    setFill(e.target.value);
                    applyToSelected({ f: e.target.value });
                  }}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
              {/* pattern fills — inked with the current line color */}
              <span className="shrink-0 pl-1 text-[10px] uppercase text-slate-400">
                pat
              </span>
              {PATTERN_TYPES.map((pt) => {
                const token = `p:${pt}:${color}`;
                return (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => {
                      setFill(token);
                      applyToSelected({ f: token });
                    }}
                    className={`h-6 w-6 shrink-0 rounded-md border-2 ${fill === token ? "border-indigo-500" : "border-slate-200"}`}
                    style={{ background: patternPreview(pt, color), backgroundColor: "#fff" }}
                    title={`${pt} fill`}
                  />
                );
              })}
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
            {/* Font size — applies to new text and (live) the selected text/label. */}
            <label className="ml-1 flex items-center gap-1 text-[10px] uppercase text-slate-400" title="Font size (text + shape labels)">
              <span className="text-sm normal-case text-slate-500">A</span>
              <select
                value={fontSize}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setFontSize(v);
                  if (selected && !!selected.k && selected.k !== "conn" && selected.k !== "stamp" && selected.k !== "art" && selected.k !== "image") {
                    setPending((p) => ({ ...p, [selected.id]: { ...p[selected.id], fs: v } }));
                    onElementUpdate({ id: selected.id, fs: v });
                  }
                }}
                className="rounded-md border border-slate-200 bg-white px-1 py-0.5 text-xs text-slate-700"
              >
                {[12, 16, 20, 24, 32, 40, 56].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <div className="ml-auto flex items-center gap-1.5">
              {selectedIds.size > 0 && (
                <>
                  {selectedIds.size >= 2 && (
                    <button
                      onClick={groupSelected}
                      title="Group the selected objects"
                      className="rounded-lg border border-indigo-300 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                    >
                      ⧉ Group
                    </button>
                  )}
                  {anySelectedGrouped && (
                    <button
                      onClick={ungroupSelected}
                      title="Ungroup"
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Ungroup
                    </button>
                  )}
                  <button
                    onClick={() => selectedIds.forEach((id) => relayerId(id, "front"))}
                    title="Bring to front"
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    ⬆ Front
                  </button>
                  <button
                    onClick={() => selectedIds.forEach((id) => relayerId(id, "back"))}
                    title="Send to back"
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    ⬇ Back
                  </button>
                  <button
                    onClick={() => [...selectedIds].forEach((id) => removeId(id))}
                    className="rounded-lg border border-rose-300 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                  >
                    Delete{selectedIds.size > 1 ? ` (${selectedIds.size})` : ""}
                  </button>
                </>
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

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="relative min-w-0 flex-1">
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
          onDragOver={onPasteImage ? (e) => e.preventDefault() : undefined}
          onDrop={
            onPasteImage
              ? (e) => {
                  e.preventDefault();
                  readAndPlace(e.dataTransfer?.files);
                }
              : undefined
          }
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
                  : { id: "draft", mine: true, k: draft.k, x: Math.min(draft.x0, draft.x1), y: Math.min(draft.y0, draft.y1), bw: Math.abs(draft.x1 - draft.x0), bh: Math.abs(draft.y1 - draft.y0), c: color, f: fill, sw: width, ...(draft.k === "table" ? { rows: tableRows, cols: tableCols } : {}), ...(draft.k === "poly" ? { pts: DEFAULT_POLY } : {}) };
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
          {/* Select mode: faint outline every object (borderless text/no-fill
              are otherwise invisible); stronger outline on hover. */}
          {tool === "select" &&
            interactive &&
            objects.map((o) => {
              if (isSel(o.id)) return null;
              const b = boxOf(o);
              const hov = o.id === hoverId;
              return (
                <rect
                  key={`hl-${o.id}`}
                  x={b.x * VIEW_W - 2}
                  y={b.y * VIEW_H - 2}
                  width={b.bw * VIEW_W + 4}
                  height={b.bh * VIEW_H + 4}
                  fill="none"
                  stroke={hov ? "#6366f1" : "#94a3b8"}
                  strokeWidth={hov ? 1.5 : 0.75}
                  strokeDasharray={hov ? undefined : "3 3"}
                  opacity={hov ? 0.9 : 0.45}
                  pointerEvents="none"
                />
              );
            })}
          {/* Selection outline(s) — one per selected element (multi-select). */}
          {tool === "select" &&
            [...selectedIds].map((sid) => {
              const el = byId.get(sid);
              if (!el) return null;
              const b = boxOf(el);
              return (
                <rect
                  key={`sel-${sid}`}
                  pointerEvents="none"
                  x={b.x * VIEW_W - 3}
                  y={b.y * VIEW_H - 3}
                  width={b.bw * VIEW_W + 6}
                  height={b.bh * VIEW_H + 6}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                />
              );
            })}
          {/* Transform handles (single selection only) — box corners or
              line/arrow endpoints. */}
          {selected &&
            selectedIds.size === 1 &&
            tool === "select" &&
            interactive &&
            selected.k !== "conn" &&
            (() => {
              const handle = (
                nx: number,
                ny: number,
                d: NonNullable<typeof drag.current>,
                key: string
              ) => (
                <circle
                  key={key}
                  cx={nx * VIEW_W}
                  cy={ny * VIEW_H}
                  r={6.5}
                  fill="#6366f1"
                  stroke="#fff"
                  strokeWidth={1.5}
                  style={{ cursor: "pointer" }}
                  onPointerDown={(e) => startHandle(e, d)}
                />
              );
              const id = selected.id;
              if (selected.k === "line" || selected.k === "arrow") {
                const ax = selected.x ?? 0;
                const ay = selected.y ?? 0;
                const bx = ax + (selected.bw ?? 0);
                const by = ay + (selected.bh ?? 0);
                return (
                  <g>
                    {handle(ax, ay, { mode: "endpoint", id, fx: bx, fy: by, moving: "a" }, "ea")}
                    {handle(bx, by, { mode: "endpoint", id, fx: ax, fy: ay, moving: "b" }, "eb")}
                  </g>
                );
              }
              const b = boxOf(selected);
              const cxN = b.x + b.bw / 2;
              const cyN = b.y + b.bh / 2;
              const rotY = b.y - 0.06; // rotation handle sits above the box
              // Poly: draggable vertices + edge "add" points, plus a rotate handle.
              if (selected.k === "poly" && selected.pts && selected.pts.length >= 3) {
                const pts = selected.pts;
                const box = { x: b.x, y: b.y, bw: b.bw, bh: b.bh };
                const vx = (p: [number, number]) => (b.x + p[0] * b.bw) * VIEW_W;
                const vy = (p: [number, number]) => (b.y + p[1] * b.bh) * VIEW_H;
                return (
                  <g>
                    <line x1={cxN * VIEW_W} y1={b.y * VIEW_H} x2={cxN * VIEW_W} y2={rotY * VIEW_H} stroke="#6366f1" strokeWidth={1.5} />
                    <circle cx={cxN * VIEW_W} cy={rotY * VIEW_H} r={7} fill="#fff" stroke="#6366f1" strokeWidth={2} style={{ cursor: "grab" }} onPointerDown={(e) => startHandle(e, { mode: "rotate", id, cx: cxN, cy: cyN })} />
                    {/* edge midpoints — click to add a vertex */}
                    {pts.map((p, i) => {
                      const n = pts[(i + 1) % pts.length];
                      const mid: [number, number] = [(p[0] + n[0]) / 2, (p[1] + n[1]) / 2];
                      return (
                        <circle
                          key={`m${i}`}
                          cx={vx(mid)}
                          cy={vy(mid)}
                          r={4.5}
                          fill="#ffffff"
                          stroke="#22c55e"
                          strokeWidth={2}
                          style={{ cursor: "copy" }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            addVertex(id, i, mid);
                          }}
                        />
                      );
                    })}
                    {/* vertices — drag to sculpt, double-click to remove */}
                    {pts.map((p, i) => (
                      <circle
                        key={`v${i}`}
                        cx={vx(p)}
                        cy={vy(p)}
                        r={7}
                        fill="#6366f1"
                        stroke="#fff"
                        strokeWidth={1.5}
                        style={{ cursor: "move" }}
                        onPointerDown={(e) => startHandle(e, { mode: "vertex", id, i, box, pts })}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          removeVertex(id, i);
                        }}
                      />
                    ))}
                  </g>
                );
              }
              return (
                <g>
                  {handle(b.x, b.y, { mode: "resize", id, ax: b.x + b.bw, ay: b.y + b.bh }, "tl")}
                  {handle(b.x + b.bw, b.y, { mode: "resize", id, ax: b.x, ay: b.y + b.bh }, "tr")}
                  {handle(b.x, b.y + b.bh, { mode: "resize", id, ax: b.x + b.bw, ay: b.y }, "bl")}
                  {handle(b.x + b.bw, b.y + b.bh, { mode: "resize", id, ax: b.x, ay: b.y }, "br")}
                  {/* rotation handle + tether */}
                  <line
                    x1={cxN * VIEW_W}
                    y1={b.y * VIEW_H}
                    x2={cxN * VIEW_W}
                    y2={rotY * VIEW_H}
                    stroke="#6366f1"
                    strokeWidth={1.5}
                  />
                  <circle
                    cx={cxN * VIEW_W}
                    cy={rotY * VIEW_H}
                    r={7}
                    fill="#fff"
                    stroke="#6366f1"
                    strokeWidth={2}
                    style={{ cursor: "grab" }}
                    onPointerDown={(e) =>
                      startHandle(e, { mode: "rotate", id, cx: cxN, cy: cyN })
                    }
                  />
                  <text
                    x={cxN * VIEW_W}
                    y={rotY * VIEW_H + 3.5}
                    textAnchor="middle"
                    fontSize={9}
                    fill="#6366f1"
                    style={{ pointerEvents: "none" }}
                  >
                    ⟳
                  </text>
                </g>
              );
            })()}
        </svg>

        {/* Inline label / text editor overlay (percent-positioned over the board). */}
        {editing && (
          (() => {
            const el = byId.get(editing.id);
            let b = el ? boxOf(el) : { x: 0.4, y: 0.4, bw: 0.2, bh: 0.08 };
            if (editing.cell !== undefined && el?.k === "table") {
              const cols = el.cols ?? 3;
              const rows = el.rows ?? 3;
              const cw = b.bw / cols;
              const rh = b.bh / rows;
              b = {
                x: b.x + (editing.cell % cols) * cw,
                y: b.y + Math.floor(editing.cell / cols) * rh,
                bw: cw,
                bh: rh,
              };
            }
            return (
              <textarea
                ref={editRef}
                autoFocus
                value={editing.value}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setEditing({ id: editing.id, value: e.target.value })}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (editing.cell !== undefined && e.key === "Tab") {
                    // Commit this cell and jump to the next — fast row entry.
                    e.preventDefault();
                    const el0 = byId.get(editing.id);
                    const n = (el0?.rows ?? 3) * (el0?.cols ?? 3);
                    const cells = Array.from({ length: n }, (_, i) =>
                      i === editing.cell ? editing.value : (el0?.cells ?? [])[i] ?? ""
                    );
                    setPending((p) => ({ ...p, [editing.id]: { ...p[editing.id], cells } }));
                    onElementUpdate({ id: editing.id, cells });
                    const nx = (editing.cell + (e.shiftKey ? -1 : 1) + n) % n;
                    setEditing({ id: editing.id, value: cells[nx] ?? "", cell: nx });
                    return;
                  }
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
          <div className="w-full shrink-0 lg:w-44">
            <div className="mb-1 flex items-center justify-between gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Objects ({elements.length})
              </p>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAddOpen((v) => !v)}
                  title="Add an object to the board"
                  className="rounded-md border border-indigo-300 bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100"
                >
                  ＋ Add ▾
                </button>
                {addOpen && (
                  <div className="absolute right-0 z-30 mt-1 max-h-72 w-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                    {ADD_ITEMS.map((it) => (
                      <button
                        key={it.kind}
                        type="button"
                        onClick={() => insertObject(it.kind)}
                        className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-slate-100"
                      >
                        <span className="w-4 text-center">{it.icon}</span>
                        {it.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => insertObject("stamp")}
                      className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-slate-100"
                    >
                      <span className="w-4 text-center">{stamp}</span>
                      Stamp
                    </button>
                  </div>
                )}
              </div>
            </div>
            {/* Grouping lives here, next to the list where you multi-select. */}
            {selectedIds.size >= 2 ? (
              <div className="mb-1 flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={groupSelected}
                  className="rounded-md border border-indigo-300 bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100"
                >
                  ⧉ Group ({selectedIds.size})
                </button>
                {anySelectedGrouped && (
                  <button
                    type="button"
                    onClick={ungroupSelected}
                    className="rounded-md border border-slate-300 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Ungroup
                  </button>
                )}
              </div>
            ) : (
              <p className="mb-1 text-[10px] leading-tight text-slate-400">
                Shift-click rows to select several, then <span className="font-medium">Group</span>.
              </p>
            )}
            {elements.length === 0 ? (
              <p className="text-xs text-slate-400">Nothing yet.</p>
            ) : (
              <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto rounded-lg border border-slate-200 p-1">
                {[...elements].reverse().map((e) => (
                  <li
                    key={e.id}
                    draggable
                    onClick={(ev) => {
                      setTool("select");
                      selectEl(e.id, ev.shiftKey);
                    }}
                    onMouseEnter={() => setHoverId(e.id)}
                    onMouseLeave={() => setHoverId(null)}
                    onDragStart={() => setDragRowId(e.id)}
                    onDragOver={(ev) => ev.preventDefault()}
                    onDrop={() => {
                      if (dragRowId) reorderTo(dragRowId, e.id);
                      setDragRowId(null);
                    }}
                    onDragEnd={() => setDragRowId(null)}
                    title="Drag to reorder layers"
                    className={`flex cursor-grab items-center gap-1 rounded px-1.5 py-1 text-xs ${
                      isSel(e.id) ? "bg-indigo-100 text-indigo-800" : "hover:bg-slate-100"
                    }`}
                  >
                    <span className="w-4 shrink-0 text-center">{elIcon(e)}</span>
                    <span className="min-w-0 flex-1 truncate">{elLabel(e)}</span>
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        relayerId(e.id, "front");
                      }}
                      title="Bring to front"
                      className="shrink-0 px-0.5 text-slate-400 hover:text-indigo-600"
                    >
                      ⬆
                    </button>
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        relayerId(e.id, "back");
                      }}
                      title="Send to back"
                      className="shrink-0 px-0.5 text-slate-400 hover:text-indigo-600"
                    >
                      ⬇
                    </button>
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        removeId(e.id);
                      }}
                      title="Delete"
                      className="shrink-0 px-0.5 text-slate-300 hover:text-rose-500"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {interactive && (
        <p className="text-[11px] text-slate-400">
          Draw with a tool, or use <span className="font-medium">＋ Add</span>{" "}
          (top-right) to drop an object straight onto the board. Drag shapes with{" "}
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
        onEdit={(el, pt) => {
          setSelectedIds(new Set([el.id]));
          if (el.k === "conn" || el.k === "stamp" || el.k === "art" || el.k === "poly" || el.k === "image") return;
          if (el.k === "table") {
            const b = boxOf(el);
            const cols = el.cols ?? 3;
            const rows = el.rows ?? 3;
            const cc = Math.min(cols - 1, Math.max(0, Math.floor(((pt[0] - b.x) / (b.bw || 1)) * cols)));
            const rr = Math.min(rows - 1, Math.max(0, Math.floor(((pt[1] - b.y) / (b.bh || 1)) * rows)));
            const idx = rr * cols + cc;
            setEditing({ id: el.id, value: (el.cells ?? [])[idx] ?? "", cell: idx });
            return;
          }
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

// Distance from point p to segment a→b (all normalized 0..1).
function distToSeg(p: [number, number], a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

const KIND_NAMES: Record<string, string> = {
  rect: "Rectangle", rrect: "Rounded rect", ellipse: "Ellipse", triangle: "Triangle",
  diamond: "Diamond", cloud: "Cloud", line: "Line", arrow: "Arrow", text: "Text",
  sticky: "Sticky", table: "Table", conn: "Connector",
};
const KIND_ICONS: Record<string, string> = {
  rect: "▭", rrect: "▢", ellipse: "◯", triangle: "△", diamond: "◇", cloud: "☁",
  line: "╱", arrow: "↗", text: "T", sticky: "▤", table: "▦", conn: "⛓",
};
function elLabel(e: Stroke): string {
  if (!e.k) return "Pen stroke";
  if (e.k === "stamp") return "Stamp";
  if (e.k === "art") return (e.art ?? "art").replace(/_/g, " ");
  if (e.k === "image") return "Image";
  if ((e.k === "text" || e.k === "sticky") && e.t?.trim()) return e.t.trim().slice(0, 24);
  return KIND_NAMES[e.k] ?? e.k;
}
function elIcon(e: Stroke): string {
  if (!e.k) return "✎";
  if (e.k === "stamp") return e.ch ?? "★";
  if (e.k === "art") return "🙂";
  if (e.k === "image") return "🖼";
  return KIND_ICONS[e.k] ?? "◆";
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
  onEdit: (el: Stroke, pt: [number, number]) => void;
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
      if (el) onEdit(el, pt);
    };
    svg.addEventListener("dblclick", handler);
    return () => svg.removeEventListener("dblclick", handler);
  }, [svgRef, enabled, hit, onEdit]);
  return null;
}
