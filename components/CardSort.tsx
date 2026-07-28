"use client";

import { useEffect, useRef, useState } from "react";

export type Placement = {
  id: string;
  word: string;
  col: number;
  mine: boolean;
  highlighted?: boolean;
};

// Distinct accent per column (up to 4).
const COL_ACCENT = [
  { ring: "border-indigo-300", head: "bg-indigo-50 text-indigo-700", chip: "bg-indigo-100 text-indigo-800 border-indigo-200", over: "ring-indigo-400 bg-indigo-50/60" },
  { ring: "border-emerald-300", head: "bg-emerald-50 text-emerald-700", chip: "bg-emerald-100 text-emerald-800 border-emerald-200", over: "ring-emerald-400 bg-emerald-50/60" },
  { ring: "border-amber-300", head: "bg-amber-50 text-amber-700", chip: "bg-amber-100 text-amber-800 border-amber-200", over: "ring-amber-400 bg-amber-50/60" },
  { ring: "border-rose-300", head: "bg-rose-50 text-rose-700", chip: "bg-rose-100 text-rose-800 border-rose-200", over: "ring-rose-400 bg-rose-50/60" },
];

export function CardSort({
  words,
  columns,
  placements,
  onPlace,
  onUnplace,
  onAddWord,
  onHighlight,
  canModerate = false,
  readOnly = false,
  presentation = false,
}: {
  words: string[];
  columns: string[];
  placements: Placement[];
  onPlace: (word: string, col: number) => void;
  onUnplace: (word: string, col: number) => void;
  onAddWord?: (word: string) => void;
  onHighlight?: (placementId: string, highlighted: boolean) => void;
  canModerate?: boolean;
  readOnly?: boolean;
  presentation?: boolean;
}) {
  // Optimistic mirror: apply moves instantly, re-sync when the server payload
  // (a new reference — only changes on real updates) arrives.
  const [local, setLocal] = useState<Placement[]>(placements);
  useEffect(() => setLocal(placements), [placements]);
  const [localWords, setLocalWords] = useState<string[]>(words);
  useEffect(() => setLocalWords(words), [words]);
  const [newWord, setNewWord] = useState("");

  const addWord = () => {
    const w = newWord.trim();
    if (!w || !onAddWord) return;
    if (!localWords.includes(w)) setLocalWords((prev) => [...prev, w]);
    onAddWord(w);
    setNewWord("");
  };

  const colsOf = (word: string) =>
    new Set(local.filter((p) => p.word === word).map((p) => p.col));

  const doPlace = (word: string, col: number) => {
    setLocal((l) =>
      l.some((p) => p.word === word && p.col === col)
        ? l
        : [
            ...l,
            { id: `tmp-${word}-${col}`, word, col, mine: true, highlighted: false },
          ]
    );
    onPlace(word, col);
  };
  const doUnplace = (word: string, col: number) => {
    setLocal((l) => l.filter((p) => !(p.word === word && p.col === col)));
    onUnplace(word, col);
  };

  // ---- pointer drag (mouse + touch) ----
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [overCol, setOverCol] = useState<number | null>(null);
  const dragWord = useRef<string | null>(null);
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);

  const hit = (x: number, y: number): number | null => {
    for (let i = 0; i < colRefs.current.length; i++) {
      const el = colRefs.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i;
    }
    return null;
  };

  const startDrag = (word: string, e: React.PointerEvent) => {
    if (readOnly) return;
    e.preventDefault();
    dragWord.current = word;
    setPos({ x: e.clientX, y: e.clientY });
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
      setOverCol(hit(e.clientX, e.clientY));
    };
    const up = (e: PointerEvent) => {
      const col = hit(e.clientX, e.clientY);
      if (col != null && dragWord.current != null) doPlace(dragWord.current, col);
      setDragging(false);
      setOverCol(null);
      dragWord.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  const chipText = presentation ? "text-lg" : "text-sm";
  const unplacedCount = localWords.filter((w) => colsOf(w).size === 0).length;

  return (
    <div className="select-none">
      {/* word bank */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Words
          </span>
          {unplacedCount > 0 && (
            <span className="text-[11px] text-amber-600">
              {unplacedCount} not yet sorted
            </span>
          )}
          {!readOnly && (
            <span className="ml-auto text-[11px] text-slate-400">
              Drag a word into a column — a word can go in more than one.
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {localWords.map((w) => {
            const count = colsOf(w).size;
            const unplaced = count === 0;
            return (
              <div
                key={w}
                onPointerDown={(e) => startDrag(w, e)}
                className={`relative rounded-lg border px-3 py-1.5 font-medium ${chipText} ${
                  readOnly ? "" : "cursor-grab active:cursor-grabbing touch-none"
                } ${
                  unplaced
                    ? "border-amber-400 bg-amber-50 text-amber-900 ring-1 ring-amber-300"
                    : "border-slate-300 bg-white text-slate-700"
                } ${dragging && dragWord.current === w ? "opacity-40" : ""}`}
                style={readOnly ? undefined : { touchAction: "none" }}
              >
                {w}
                {count > 0 && (
                  <span
                    className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center"
                    title={`In ${count} column${count === 1 ? "" : "s"}`}
                  >
                    {count}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {!readOnly && onAddWord && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addWord();
            }}
            className="flex items-center gap-1.5 mt-2.5"
          >
            <input
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
              placeholder="Add a word or phrase…"
              maxLength={80}
              className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={!newWord.trim()}
              className="rounded-lg border border-indigo-300 text-indigo-600 px-2.5 py-1 text-sm font-medium hover:bg-indigo-50 disabled:opacity-40"
            >
              + Add
            </button>
          </form>
        )}
      </div>

      {/* columns */}
      <div
        className="grid gap-3 mt-3"
        style={{ gridTemplateColumns: `repeat(${Math.min(columns.length, 4)}, minmax(0, 1fr))` }}
      >
        {columns.map((title, ci) => {
          const accent = COL_ACCENT[ci % COL_ACCENT.length];
          const inCol = local.filter((p) => p.col === ci);
          return (
            <div
              key={ci}
              ref={(el) => {
                colRefs.current[ci] = el;
              }}
              className={`rounded-xl border-2 bg-white p-3 min-h-[120px] transition ${accent.ring} ${
                overCol === ci ? `ring-2 ${accent.over}` : ""
              }`}
            >
              <div
                className={`rounded-md px-2 py-1 text-center font-semibold mb-2 ${accent.head} ${
                  presentation ? "text-base" : "text-sm"
                }`}
              >
                {title}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {inCol.map((p) => (
                  <span
                    key={p.id}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 ${chipText} ${
                      p.highlighted
                        ? "border-amber-400 bg-amber-50 text-amber-900 ring-1 ring-amber-300"
                        : accent.chip
                    }`}
                  >
                    {canModerate && onHighlight && !p.id.startsWith("tmp-") && (
                      <button
                        onClick={() => onHighlight(p.id, !p.highlighted)}
                        title={
                          p.highlighted
                            ? "Un-highlight"
                            : "Highlight for discussion"
                        }
                        aria-label="Highlight answer for discussion"
                        className={`leading-none ${
                          p.highlighted
                            ? "text-amber-500"
                            : "text-current/40 hover:text-amber-500"
                        }`}
                      >
                        ★
                      </button>
                    )}
                    {p.word}
                    {!readOnly && (
                      <button
                        onClick={() => doUnplace(p.word, ci)}
                        title="Remove from this column"
                        aria-label={`Remove ${p.word} from ${title}`}
                        className="text-current/60 hover:text-rose-600 font-bold leading-none"
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
                {inCol.length === 0 && (
                  <span className="text-xs text-slate-300">Drop words here</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* drag ghost */}
      {dragging && dragWord.current && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg border border-indigo-400 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-lg"
          style={{ left: pos.x + 8, top: pos.y + 8 }}
        >
          {dragWord.current}
        </div>
      )}
    </div>
  );
}
