"use client";

export type ChecklistStatement = { text: string; mode: "single" | "multi" };

export function newChecklistStatement(): ChecklistStatement {
  return { text: "", mode: "multi" };
}

// Authoring UI for the checklist tool: 2–5 shared named columns (options) + a
// list of statement rows, each row single- or multi-select, plus a display-only
// toggle. Shared by the "Push an activity" console and the saved step-tool form.
export function ChecklistBuilder({
  columns,
  statements,
  displayOnly,
  onColumns,
  onStatements,
  onDisplayOnly,
}: {
  columns: string[];
  statements: ChecklistStatement[];
  displayOnly: boolean;
  onColumns: (c: string[]) => void;
  onStatements: (s: ChecklistStatement[]) => void;
  onDisplayOnly: (v: boolean) => void;
}) {
  const patchStatement = (
    i: number,
    fn: (s: ChecklistStatement) => ChecklistStatement
  ) => onStatements(statements.map((s, j) => (j === i ? fn(s) : s)));

  return (
    <div className="flex flex-col gap-2">
      {/* Answer options — shared across every question */}
      <div className="rounded-lg border border-slate-200 p-2 flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Answer options (2–5)
        </span>
        <span className="text-[11px] text-slate-500 -mt-0.5">
          The choices offered for every question below (e.g. Father, Partner).
        </span>
        {columns.map((c, ci) => (
          <div key={ci} className="flex items-center gap-1.5">
            <input
              value={c}
              onChange={(e) =>
                onColumns(columns.map((x, j) => (j === ci ? e.target.value : x)))
              }
              placeholder={`Option ${ci + 1}`}
              maxLength={80}
              className="flex-1 rounded-md border border-slate-300 px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {columns.length > 2 && (
              <button
                type="button"
                title="Remove option"
                onClick={() => onColumns(columns.filter((_, j) => j !== ci))}
                className="rounded-md px-1.5 py-0.5 text-slate-400 hover:text-rose-500"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {columns.length < 5 && (
          <button
            type="button"
            onClick={() => onColumns([...columns, ""])}
            className="self-start text-[11px] font-medium text-indigo-600 hover:text-indigo-800"
          >
            + Add option
          </button>
        )}
      </div>

      {/* Question rows */}
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mt-1">
        Questions
      </span>
      {statements.map((s, si) => (
        <div
          key={si}
          className="rounded-lg border border-slate-200 p-2 flex flex-col gap-1.5"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 w-4 text-right shrink-0">
              {si + 1}
            </span>
            <input
              value={s.text}
              onChange={(e) =>
                patchStatement(si, (x) => ({ ...x, text: e.target.value }))
              }
              placeholder={`Question ${si + 1}`}
              maxLength={300}
              className="flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {statements.length > 1 && (
              <button
                type="button"
                title="Remove question"
                onClick={() =>
                  onStatements(statements.filter((_, j) => j !== si))
                }
                className="rounded-md px-1.5 py-1 text-slate-400 hover:text-rose-500"
              >
                ✕
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] pl-5">
            <span className="text-slate-500 mr-1">Select:</span>
            {(["single", "multi"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => patchStatement(si, (x) => ({ ...x, mode: m }))}
                className={`rounded-md border px-2 py-0.5 font-medium ${
                  s.mode === m
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-slate-300 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {m === "single" ? "One only" : "Any (0–all)"}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onStatements([...statements, newChecklistStatement()])}
        className="self-start text-xs font-medium text-indigo-600 hover:text-indigo-800"
      >
        + Add question
      </button>

      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={displayOnly}
          onChange={(e) => onDisplayOnly(e.target.checked)}
        />
        Display only — show the checklist read-only (no boxes, no capture)
      </label>
    </div>
  );
}
