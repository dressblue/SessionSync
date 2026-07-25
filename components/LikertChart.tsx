"use client";

import { LIKERT_COLORS } from "@/lib/likert";

interface Rating {
  avg: number | null;
  count: number;
  mine?: number | null;
  dist: number[];
}

interface Props {
  items: string[];
  ratings: Rating[];
  anchors: string[];
  /** Compact spacing for the report/export. */
  dense?: boolean;
}

// Diverging stacked bar chart for a 5-point Likert survey. Negative levels
// extend left of a fixed center line, the neutral level straddles it, and
// positive levels extend right — the whole chart shares one scale so bars
// are comparable across items. Pure HTML/CSS so it survives the .doc export.
export function LikertChart({ items, ratings, anchors, dense }: Props) {
  const n = anchors.length; // 5
  const mid = (n - 1) / 2; // index of the neutral level (2 for a 5-pt scale)

  // Percentages per item, and each item's left/right extent around center.
  const rows = items.map((item, i) => {
    const dist = ratings[i]?.dist ?? [];
    const total = dist.reduce((a, b) => a + b, 0);
    const pct = dist.map((d) => (total ? (d / total) * 100 : 0));
    let neg = 0;
    let pos = 0;
    for (let k = 0; k < n; k++) {
      if (k < mid) neg += pct[k];
      else if (k > mid) pos += pct[k];
      else {
        neg += pct[k] / 2;
        pos += pct[k] / 2;
      }
    }
    return { item, total, pct, neg, pos, count: ratings[i]?.count ?? total };
  });

  const leftMax = Math.max(1, ...rows.map((r) => r.neg));
  const rightMax = Math.max(1, ...rows.map((r) => r.pos));
  const domain = leftMax + rightMax;
  const centerFrac = leftMax / domain; // 0..1 position of the 0 line
  const f = (p: number) => p / domain; // percent -> fraction of bar width

  const barH = dense ? "h-5" : "h-7";

  return (
    <div className="w-full">
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
        {anchors.map((a, k) => (
          <span key={k} className="inline-flex items-center gap-1.5 text-xs">
            <span
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: LIKERT_COLORS[k] }}
            />
            {a}
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((r, i) => {
          // Build absolutely-positioned segments across the shared domain.
          const segs: {
            color: string;
            left: number;
            width: number;
            pct: number;
          }[] = [];
          // neutral centered on the 0 line
          const nHalf = f(r.pct[mid] / 2);
          segs.push({
            color: LIKERT_COLORS[mid],
            left: centerFrac - nHalf,
            width: f(r.pct[mid]),
            pct: r.pct[mid],
          });
          // negative levels stack leftward from the neutral's left edge
          let edge = centerFrac - nHalf;
          for (let k = mid - 1; k >= 0; k--) {
            const w = f(r.pct[k]);
            edge -= w;
            segs.push({ color: LIKERT_COLORS[k], left: edge, width: w, pct: r.pct[k] });
          }
          // positive levels stack rightward from the neutral's right edge
          edge = centerFrac + nHalf;
          for (let k = mid + 1; k < n; k++) {
            const w = f(r.pct[k]);
            segs.push({ color: LIKERT_COLORS[k], left: edge, width: w, pct: r.pct[k] });
            edge += w;
          }

          return (
            <div key={i} className="flex items-center gap-3">
              <div className="w-40 shrink-0 text-right">
                <span className="text-sm leading-tight">{r.item}</span>
                <span className="block text-[10px] text-slate-400">
                  {r.count} response{r.count === 1 ? "" : "s"}
                  {ratings[i]?.avg != null ? ` · avg ${ratings[i].avg}` : ""}
                </span>
              </div>
              <div className={`relative flex-1 ${barH} rounded bg-slate-50`}>
                {/* center (0) line */}
                <div
                  className="absolute inset-y-0 w-px bg-slate-300 z-10"
                  style={{ left: `${centerFrac * 100}%` }}
                />
                {r.total === 0 ? (
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-300">
                    no responses yet
                  </span>
                ) : (
                  segs.map((s, k) =>
                    s.width <= 0 ? null : (
                      <div
                        key={k}
                        className="absolute inset-y-0 flex items-center justify-center overflow-hidden"
                        style={{
                          left: `${s.left * 100}%`,
                          width: `${s.width * 100}%`,
                          backgroundColor: s.color,
                        }}
                        title={`${Math.round(s.pct)}%`}
                      >
                        {s.width > 0.05 && (
                          <span className="text-[10px] font-semibold text-white">
                            {Math.round(s.pct)}%
                          </span>
                        )}
                      </div>
                    )
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
