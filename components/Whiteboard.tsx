"use client";

import { useEffect, useRef, useState } from "react";
import type { Stroke } from "./useSessionState";

const COLORS = ["#0f172a", "#e11d48", "#4f46e5", "#059669"];
const WIDTHS = [3, 6];
const VIEW_W = 800;
const VIEW_H = 600;

interface Props {
  strokes: Stroke[];
  canDraw: boolean;
  canModerate: boolean;
  onStroke: (stroke: { c: string; w: number; p: [number, number][] }) => Promise<void>;
  onUndo: (entryId: string) => void;
  onClear: () => void;
}

type LocalStroke = { c: string; w: number; p: [number, number][]; sent: boolean };

// Shared drawing surface. Own strokes render instantly; everyone else's
// arrive with the next state poll. Coordinates are normalized 0..1 so every
// screen size sees the same picture.
export function Whiteboard({
  strokes,
  canDraw,
  canModerate,
  onStroke,
  onUndo,
  onClear,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[0]);
  const [drawing, setDrawing] = useState<[number, number][] | null>(null);
  const [localStrokes, setLocalStrokes] = useState<LocalStroke[]>([]);
  const mineCount = strokes.filter((s) => s.mine).length;
  const mineCountRef = useRef(mineCount);

  // When the server acknowledges more of our strokes, drop the local copies
  // that were drawn before that acknowledgment (they now render from state).
  useEffect(() => {
    if (mineCount > mineCountRef.current) {
      setLocalStrokes((prev) => {
        const sent = prev.filter((s) => s.sent);
        const drop = Math.min(mineCount - mineCountRef.current, sent.length);
        let removed = 0;
        return prev.filter((s) => {
          if (s.sent && removed < drop) {
            removed++;
            return false;
          }
          return true;
        });
      });
    }
    mineCountRef.current = mineCount;
  }, [mineCount]);

  function toPoint(e: React.PointerEvent): [number, number] {
    const rect = svgRef.current!.getBoundingClientRect();
    return [
      Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    ];
  }

  function pointerDown(e: React.PointerEvent) {
    if (!canDraw) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrawing([toPoint(e)]);
  }

  function pointerMove(e: React.PointerEvent) {
    if (!drawing) return;
    const pt = toPoint(e);
    const last = drawing[drawing.length - 1];
    // Sample: skip points closer than ~0.4% of the canvas.
    if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) < 0.004) return;
    setDrawing((d) => (d ? [...d, pt] : d));
  }

  async function pointerUp() {
    if (!drawing) return;
    const points = drawing.length === 1 ? [...drawing, drawing[0]] : drawing;
    const stroke = { c: color, w: width, p: points.slice(0, 800) };
    setDrawing(null);
    const local: LocalStroke = { ...stroke, sent: false };
    setLocalStrokes((prev) => [...prev, local]);
    await onStroke(stroke);
    setLocalStrokes((prev) =>
      prev.map((s) => (s === local ? { ...s, sent: true } : s))
    );
  }

  const path = (p: [number, number][]) =>
    p.map((pt, i) => `${i === 0 ? "M" : "L"}${pt[0] * VIEW_W},${pt[1] * VIEW_H}`).join(" ");

  const lastMine = [...strokes].reverse().find((s) => s.mine);

  return (
    <div className="flex flex-col gap-2">
      {canDraw && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full border-2 ${
                  color === c ? "border-indigo-500 scale-110" : "border-white"
                } shadow transition`}
                style={{ backgroundColor: c }}
                aria-label={`Pen color ${c}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-1 ml-2">
            {WIDTHS.map((w) => (
              <button
                key={w}
                onClick={() => setWidth(w)}
                className={`w-8 h-6 rounded-md border flex items-center justify-center ${
                  width === w
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-slate-200 bg-white"
                }`}
                aria-label={`Pen width ${w}`}
              >
                <span
                  className="rounded-full bg-slate-700"
                  style={{ width: w * 1.5, height: w * 1.5 }}
                />
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {lastMine && (
              <button
                onClick={() => onUndo(lastMine.id)}
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Undo my last
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
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className={`w-full rounded-lg border border-slate-200 bg-white touch-none select-none ${
          canDraw ? "cursor-crosshair" : ""
        }`}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerLeave={pointerUp}
      >
        {strokes.map((s) => (
          <path
            key={s.id}
            d={path(s.p)}
            stroke={s.c}
            strokeWidth={s.w}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {localStrokes.map((s, i) => (
          <path
            key={`local-${i}`}
            d={path(s.p)}
            stroke={s.c}
            strokeWidth={s.w}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {drawing && (
          <path
            d={path(drawing)}
            stroke={color}
            strokeWidth={width}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </div>
  );
}
