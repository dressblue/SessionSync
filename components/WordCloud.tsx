"use client";

import { useMemo } from "react";


export interface CloudWord {
  text: string;
  count: number;
  downvotes: number;
  weight: number;
  mine: boolean;
  hidden: boolean;
  ids: string[];
}

interface Props {
  cloud: CloudWord[];
  /** Absent for participants (they downvote instead of moderating). */
  canModerate: boolean;
  onDownvote: (word: string) => void;
  onHide: (ids: string[], hide: boolean) => void;
  onClearDownvotes: (word: string) => void;
  /** Static display (e.g. the close-out report) — no interaction or hints. */
  readOnly?: boolean;
  /** Projector mode — fill the screen for across-the-room viewing. */
  present?: boolean;
}

interface Placed {
  w: CloudWord;
  x: number;
  y: number;
  size: number;
  color: string;
  vertical: boolean;
}

// Colour by layout index using the golden angle (137.5°): consecutive words land
// far apart on the colour wheel, so any N words span the whole spectrum evenly —
// no small-palette clustering. Vivid, readable-on-white band; lightness alternates
// a touch for extra separation. (Generative, so effectively unlimited colours.)
const colorForIndex = (i: number) => {
  const hue = (i * 137.508) % 360;
  const light = 40 + (i % 2) * 6; // alternate 40% / 46%
  return `hsl(${hue.toFixed(0)} 70% ${light}%)`;
};

// Stable orientation per word — a deterministic ~1-in-3 are set vertical for the
// classic mixed-orientation cloud look. Uses a different hash than colorFor so
// colour and orientation don't correlate. The headline word stays horizontal.
const isVertical = (text: string) =>
  ([...text].reduce((a, c) => a + c.charCodeAt(0) * 31, 7) % 3) === 0;

// Deterministic per-word size multiplier (~0.7–1.4). Layered on top of the
// frequency-based size so the cloud shows varied sizes even when many words
// share the same count — the classic mixed-size look.
const jitterFor = (text: string) =>
  0.72 + (([...text].reduce((a, c) => a + c.charCodeAt(0) * 17, 3)) % 100) / 100 * 0.68;

// Archimedean-spiral packer. Words are placed largest-first from the centre;
// each is dropped at the first spiral position where its box clears everything
// already placed. Deterministic (same input → same layout), so live updates
// animate smoothly via CSS transitions rather than reshuffling.
function packWords(cloud: CloudWord[]): {
  placed: Placed[];
  vb: { x: number; y: number; w: number; h: number };
} {
  const visible = cloud
    .filter((w) => !w.hidden && w.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.text.localeCompare(b.text))
    .slice(0, 80);
  if (visible.length === 0) {
    return { placed: [], vb: { x: 0, y: 0, w: 100, h: 60 } };
  }
  const maxW = Math.max(...visible.map((w) => w.weight));
  const minW = Math.min(...visible.map((w) => w.weight));
  const MIN_SIZE = 22;
  // Natural size from submissions (weight); sqrt curve reads better.
  const naturalSize = (weight: number) => {
    const t = maxW === minW ? 0.5 : (weight - minW) / (maxW - minW);
    return MIN_SIZE + Math.sqrt(t) * 54; // 22px → 76px
  };
  // Downvotes shrink a word by up to 50% of its natural size (floored at the
  // minimum so it stays readable); it's outlined at render time to stay findable.
  const sizeFor = (w: CloudWord) => {
    const nat = naturalSize(w.weight) * jitterFor(w.text);
    if (w.downvotes <= 0) return Math.max(MIN_SIZE, nat);
    const net = w.count - w.downvotes;
    const factor = Math.max(0.5, Math.min(1, net / w.count));
    return Math.max(MIN_SIZE, nat * factor);
  };

  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  const placed: Placed[] = [];
  const overlaps = (
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number }
  ) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  const ASPECT = 0.6; // squash vertically → wider-than-tall cloud
  visible.forEach((w, i) => {
    const size = sizeFor(w);
    // The headline word (largest, index 0) always reads horizontally.
    const vertical = i > 0 && isVertical(w.text);
    // The word's horizontal footprint; when vertical, width/height swap. Boxes
    // are a touch smaller than the glyphs so words pack densely and may kiss /
    // slightly overlap — the classic tight word-cloud look.
    const textW = Math.max(size * 0.6, w.text.length * size * 0.52);
    const textH = size * 0.92;
    const boxW = vertical ? textH : textW;
    const boxH = vertical ? textW : textH;
    let bx = -boxW / 2;
    let by = -boxH / 2;
    for (let t = 0; t < 1200; t += 0.22) {
      const r = 2.7 * t;
      const cx = r * Math.cos(t);
      const cy = r * Math.sin(t) * ASPECT;
      const cand = { x: cx - boxW / 2, y: cy - boxH / 2, w: boxW, h: boxH };
      if (!boxes.some((b) => overlaps(cand, b))) {
        bx = cand.x;
        by = cand.y;
        break;
      }
    }
    boxes.push({ x: bx, y: by, w: boxW, h: boxH });
    placed.push({
      w,
      x: bx + boxW / 2,
      y: by + boxH / 2,
      size,
      color: colorForIndex(i),
      vertical,
    });
  });

  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));
  const pad = 14;
  return {
    placed,
    vb: { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 },
  };
}

export function WordCloud({
  cloud,
  canModerate,
  onDownvote,
  onHide,
  onClearDownvotes,
  readOnly = false,
  present = false,
}: Props) {
  const { placed, vb } = useMemo(() => packWords(cloud), [cloud]);
  const hidden = cloud.filter((w) => w.hidden || w.weight <= 0);

  return (
    <div>
      {placed.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10">
          No words yet — they&apos;ll appear here, sized by how often they&apos;re
          submitted.
        </p>
      ) : (
        <svg
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          className="w-full"
          style={{ maxHeight: present ? "72vh" : 440 }}
          role="img"
          aria-label="Word cloud"
        >
          {placed.map((p) => (
            <text
              key={p.w.text}
              textAnchor="middle"
              dominantBaseline="central"
              fill={p.color}
              stroke={p.w.downvotes > 0 ? "#334155" : undefined}
              strokeWidth={p.w.downvotes > 0 ? Math.max(0.6, p.size * 0.03) : undefined}
              paintOrder="stroke"
              className={`font-bold select-none ${readOnly ? "" : "cursor-pointer"}`}
              style={{
                // Rotate vertical words −90° (reads bottom-to-top); textAnchor
                // middle + central baseline keep them pivoting about their centre.
                transform: `translate(${p.x}px, ${p.y}px)${p.vertical ? " rotate(-90deg)" : ""}`,
                fontSize: `${p.size}px`,
                transition: "transform .5s ease, font-size .35s ease, opacity .2s",
                opacity: p.w.mine && !canModerate && !readOnly ? 0.65 : 1,
              }}
              onClick={
                readOnly
                  ? undefined
                  : () =>
                      canModerate ? onHide(p.w.ids, true) : onDownvote(p.w.text)
              }
            >
              <title>
                {canModerate
                  ? `${p.w.count}×${p.w.downvotes ? ` · ${p.w.downvotes} downvote${p.w.downvotes === 1 ? "" : "s"}` : ""} — click to hide`
                  : p.w.mine
                    ? "you shrank this — tap to undo"
                    : "tap to shrink"}
              </title>
              {p.w.text}
            </text>
          ))}
        </svg>
      )}

      {!canModerate && !readOnly && placed.length > 0 && (
        <p className="mt-2 text-[11px] text-slate-400 text-center">
          Tap a word to shrink it. Tap one you shrank to undo.
        </p>
      )}

      {canModerate && hidden.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
            Hidden / shrunk away
          </p>
          <div className="flex flex-wrap gap-1.5">
            {hidden.map((w) => (
              <button
                key={w.text}
                onClick={() => {
                  if (w.ids.length) onHide(w.ids, false);
                  if (w.downvotes) onClearDownvotes(w.text);
                }}
                title="Click to restore"
                className="rounded-full border border-dashed border-slate-300 bg-slate-50 px-2 py-0.5 text-xs text-slate-400 line-through hover:text-slate-600"
              >
                {w.text}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
