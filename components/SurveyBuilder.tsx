"use client";

export type SurveyQ = { text: string; options: string[] };

// Authoring UI for the survey tool — a single/multi toggle (applies to the
// whole tool) plus a list of questions, each with 1–4 answers. Used by both the
// live "Push an activity" console and the saved step-tool form.
export function SurveyBuilder({
  mode,
  onModeChange,
  questions,
  onChange,
}: {
  mode: "single" | "multi";
  onModeChange: (m: "single" | "multi") => void;
  questions: SurveyQ[];
  onChange: (q: SurveyQ[]) => void;
}) {
  const patch = (i: number, fn: (q: SurveyQ) => SurveyQ) =>
    onChange(questions.map((q, j) => (j === i ? fn(q) : q)));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-xs flex-wrap">
        <span className="text-slate-500 mr-1">Answers:</span>
        {(["single", "multi"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            className={`rounded-md border px-2 py-1 font-medium ${
              mode === m
                ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                : "border-slate-300 text-slate-600 hover:bg-slate-100"
            }`}
          >
            {m === "single" ? "Single-select" : "Multi-select"}
          </button>
        ))}
        <span className="text-[11px] text-slate-400">
          (applies to every question)
        </span>
      </div>

      {questions.map((q, qi) => (
        <div
          key={qi}
          className="rounded-lg border border-slate-200 p-2 flex flex-col gap-1.5"
        >
          <div className="flex items-center gap-1.5">
            <input
              value={q.text}
              onChange={(e) => patch(qi, (x) => ({ ...x, text: e.target.value }))}
              placeholder={`Question ${qi + 1}`}
              maxLength={200}
              className="flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {questions.length > 1 && (
              <button
                type="button"
                title="Remove question"
                onClick={() => onChange(questions.filter((_, j) => j !== qi))}
                className="rounded-md px-1.5 py-1 text-slate-400 hover:text-rose-500"
              >
                ✕
              </button>
            )}
          </div>
          {q.options.map((o, oi) => (
            <div key={oi} className="flex items-center gap-1.5 pl-3">
              <input
                value={o}
                onChange={(e) =>
                  patch(qi, (x) => ({
                    ...x,
                    options: x.options.map((y, j) => (j === oi ? e.target.value : y)),
                  }))
                }
                placeholder={`Answer ${oi + 1}`}
                maxLength={120}
                className="flex-1 rounded-md border border-slate-300 px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {q.options.length > 1 && (
                <button
                  type="button"
                  title="Remove answer"
                  onClick={() =>
                    patch(qi, (x) => ({
                      ...x,
                      options: x.options.filter((_, j) => j !== oi),
                    }))
                  }
                  className="rounded-md px-1.5 py-0.5 text-slate-400 hover:text-rose-500"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {q.options.length < 4 && (
            <button
              type="button"
              onClick={() => patch(qi, (x) => ({ ...x, options: [...x.options, ""] }))}
              className="self-start pl-3 text-[11px] font-medium text-indigo-600 hover:text-indigo-800"
            >
              + Add answer
            </button>
          )}
        </div>
      ))}
      {questions.length < 20 && (
        <button
          type="button"
          onClick={() => onChange([...questions, { text: "", options: ["", ""] }])}
          className="self-start text-xs font-medium text-indigo-600 hover:text-indigo-800"
        >
          + Add question
        </button>
      )}
      <p className="text-[11px] text-slate-400">
        Each question shows a comment box so participants can explain their pick.
      </p>
    </div>
  );
}
