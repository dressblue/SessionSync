"use client";

export type SurveyQ = {
  text: string;
  options: string[];
  mode: "single" | "multi";
  commentLabel: string;
};

export const DEFAULT_COMMENT_LABEL = "Explain your response (optional)…";

export function newSurveyQuestion(): SurveyQ {
  return {
    text: "",
    options: ["", ""],
    mode: "single",
    commentLabel: DEFAULT_COMMENT_LABEL,
  };
}

// Authoring UI for the survey tool. Each question sets its own single/multi
// answer mode and its own comment-box prompt. Used by both the live "Push an
// activity" console and the saved step-tool form.
export function SurveyBuilder({
  questions,
  onChange,
}: {
  questions: SurveyQ[];
  onChange: (q: SurveyQ[]) => void;
}) {
  const patch = (i: number, fn: (q: SurveyQ) => SurveyQ) =>
    onChange(questions.map((q, j) => (j === i ? fn(q) : q)));

  return (
    <div className="flex flex-col gap-2">
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
          <div className="flex items-center gap-1.5 text-[11px] pl-3">
            <span className="text-slate-500 mr-1">Answers:</span>
            {(["single", "multi"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => patch(qi, (x) => ({ ...x, mode: m }))}
                className={`rounded-md border px-2 py-0.5 font-medium ${
                  q.mode === m
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-slate-300 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {m === "single" ? "Single-select" : "Multi-select"}
              </button>
            ))}
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
          <input
            value={q.commentLabel}
            onChange={(e) =>
              patch(qi, (x) => ({ ...x, commentLabel: e.target.value }))
            }
            placeholder="Comment box prompt"
            maxLength={120}
            className="mt-1 mx-3 rounded-md border border-dashed border-slate-300 px-2.5 py-1 text-xs text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      ))}
      {questions.length < 20 && (
        <button
          type="button"
          onClick={() => onChange([...questions, newSurveyQuestion()])}
          className="self-start text-xs font-medium text-indigo-600 hover:text-indigo-800"
        >
          + Add question
        </button>
      )}
    </div>
  );
}
