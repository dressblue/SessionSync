"use client";

import type { ActivityEntry } from "./useSessionState";

const CLOUD_COLORS = [
  "#4f46e5",
  "#0891b2",
  "#059669",
  "#d97706",
  "#db2777",
  "#7c3aed",
];

interface Props {
  entries: ActivityEntry[];
  canModerate: boolean;
  /** Facilitator: hide/unhide every submission of a word. */
  onToggleWord: (ids: string[], hide: boolean) => void;
}

// Frequency-sized word cloud. Words are grouped case-insensitively; the more
// people submit the same word, the larger it renders.
export function WordCloud({ entries, canModerate, onToggleWord }: Props) {
  // Group by lowercased text.
  const groups = new Map<
    string,
    { text: string; visible: number; ids: string[]; hidden: boolean }
  >();
  for (const e of entries) {
    const key = e.value.trim().toLowerCase();
    if (!key) continue;
    const g = groups.get(key) ?? {
      text: e.value.trim(),
      visible: 0,
      ids: [],
      hidden: true,
    };
    g.ids.push(e.id);
    if (!e.hidden) {
      g.visible += 1;
      g.hidden = false;
    }
    groups.set(key, g);
  }

  const all = [...groups.values()];
  const visibleWords = all
    .filter((g) => g.visible > 0)
    .sort((a, b) => b.visible - a.visible);
  const hiddenWords = all.filter((g) => g.visible === 0);

  const maxCount = Math.max(1, ...visibleWords.map((g) => g.visible));
  const minCount = Math.min(...visibleWords.map((g) => g.visible), 1);
  // Font size scales 15px → 46px by frequency.
  const sizeFor = (n: number) => {
    if (maxCount === minCount) return 24;
    return 15 + ((n - minCount) / (maxCount - minCount)) * 31;
  };

  return (
    <div>
      {visibleWords.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">
          No words yet — they&apos;ll appear here, sized by how often they&apos;re
          submitted.
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 py-4">
          {visibleWords.map((g, i) => (
            <span
              key={g.text}
              onClick={
                canModerate ? () => onToggleWord(g.ids, true) : undefined
              }
              title={
                canModerate
                  ? `${g.visible}× — click to hide`
                  : `${g.visible} submission${g.visible === 1 ? "" : "s"}`
              }
              className={`font-bold leading-none ${
                canModerate ? "cursor-pointer hover:opacity-70" : ""
              }`}
              style={{
                fontSize: `${sizeFor(g.visible)}px`,
                color: CLOUD_COLORS[i % CLOUD_COLORS.length],
              }}
            >
              {g.text}
              {g.visible > 1 && (
                <sup className="text-[10px] font-semibold text-slate-400 ml-0.5">
                  {g.visible}
                </sup>
              )}
            </span>
          ))}
        </div>
      )}

      {canModerate && hiddenWords.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
            Hidden
          </p>
          <div className="flex flex-wrap gap-1.5">
            {hiddenWords.map((g) => (
              <button
                key={g.text}
                onClick={() => onToggleWord(g.ids, false)}
                title="Click to restore"
                className="rounded-full border border-dashed border-slate-300 bg-slate-50 px-2 py-0.5 text-xs text-slate-400 line-through hover:text-slate-600"
              >
                {g.text}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
