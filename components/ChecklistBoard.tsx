"use client";

type Statement = { text: string; mode: "single" | "multi" };
type Response = {
  id: string;
  s: number;
  selected: number[];
  name: string;
  participantId: string | null;
  mine: boolean;
};

// Renders a checklist: statements × shared named columns. Each row is single-
// (radio, 0–1) or multi-select (checkbox, 0–all). Boxes are labeled inline per
// row (like the paper source). displayOnly → read-only. Results = per-statement
// column tallies + a per-participant summary.
export function ChecklistBoard({
  columns,
  statements,
  responses,
  displayOnly,
  canAnswer,
  showResults,
  presentation = false,
  onAnswer,
}: {
  columns: string[];
  statements: Statement[];
  responses: Response[];
  displayOnly: boolean;
  canAnswer: boolean;
  showResults: boolean;
  presentation?: boolean;
  onAnswer: (statementIndex: number, selected: number[]) => void;
}) {
  const mineFor = (si: number) =>
    responses.find((r) => r.mine && r.s === si)?.selected ?? [];

  const interactive = canAnswer && !displayOnly;

  const toggle = (si: number, ci: number, mode: "single" | "multi") => {
    const cur = mineFor(si);
    let next: number[];
    if (mode === "multi") {
      next = cur.includes(ci) ? cur.filter((x) => x !== ci) : [...cur, ci].sort();
    } else {
      next = cur.includes(ci) ? [] : [ci]; // click again to clear
    }
    onAnswer(si, next);
  };

  // Aggregate tally per statement per column (across all participants).
  const tally = (si: number) => {
    const counts = columns.map(() => 0);
    for (const r of responses) {
      if (r.s !== si) continue;
      for (const ci of r.selected) if (ci >= 0 && ci < counts.length) counts[ci]++;
    }
    return counts;
  };

  return (
    <div className={presentation ? "text-lg" : "text-sm"}>
      <ol className="flex flex-col gap-3">
        {statements.map((st, si) => {
          const mine = mineFor(si);
          const counts = showResults ? tally(si) : null;
          return (
            <li key={si} className="border-b border-slate-100 pb-3 last:border-0">
              <div className="flex gap-2">
                <span className="text-slate-400 shrink-0">{si + 1}.</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{st.text}</p>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
                    {columns.map((col, ci) => {
                      const on = mine.includes(ci);
                      const Tag = interactive ? "button" : "span";
                      return (
                        <Tag
                          key={ci}
                          {...(interactive
                            ? {
                                type: "button" as const,
                                onClick: () => toggle(si, ci, st.mode),
                              }
                            : {})}
                          className={`inline-flex items-center gap-1.5 rounded-md px-1 ${
                            interactive ? "cursor-pointer hover:bg-slate-50" : ""
                          }`}
                        >
                          <span
                            className={`inline-grid place-items-center w-4 h-4 border text-[11px] leading-none ${
                              st.mode === "single" ? "rounded-full" : "rounded"
                            } ${
                              on
                                ? "bg-indigo-600 border-indigo-600 text-white"
                                : "border-slate-400 text-transparent"
                            }`}
                          >
                            ✓
                          </span>
                          <span
                            className={on ? "text-indigo-700 font-medium" : ""}
                          >
                            {col}
                          </span>
                          {counts && (
                            <span className="text-slate-400 tabular-nums">
                              ({counts[ci]})
                            </span>
                          )}
                        </Tag>
                      );
                    })}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {showResults && <PerParticipant columns={columns} statements={statements} responses={responses} />}

      {displayOnly && (
        <p className="mt-3 text-xs text-slate-400">
          Display only — complete this on paper.
        </p>
      )}
      {interactive && (
        <p className="mt-3 text-xs text-slate-400">
          Your answers save automatically. You can also complete it on paper.
        </p>
      )}
    </div>
  );
}

// A compact per-participant record: each participant, and for each statement the
// column labels they checked.
function PerParticipant({
  columns,
  statements,
  responses,
}: {
  columns: string[];
  statements: Statement[];
  responses: Response[];
}) {
  const byParticipant = new Map<string, { name: string; rows: Map<number, number[]> }>();
  for (const r of responses) {
    if (!r.participantId || !r.selected.length) continue;
    let p = byParticipant.get(r.participantId);
    if (!p) {
      p = { name: r.name, rows: new Map() };
      byParticipant.set(r.participantId, p);
    }
    p.rows.set(r.s, r.selected);
  }
  const people = [...byParticipant.values()];
  if (!people.length) return null;
  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
        Individual responses ({people.length})
      </p>
      <ul className="flex flex-col gap-2">
        {people.map((p, i) => (
          <li key={i} className="text-xs">
            <span className="font-medium">{p.name}</span>
            <ul className="mt-0.5 pl-3 flex flex-col gap-0.5 text-slate-600">
              {statements.map((st, si) => {
                const sel = p.rows.get(si);
                if (!sel || !sel.length) return null;
                return (
                  <li key={si}>
                    {si + 1}. {st.text} —{" "}
                    <span className="text-indigo-700">
                      {sel.map((ci) => columns[ci]).filter(Boolean).join(", ")}
                    </span>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
