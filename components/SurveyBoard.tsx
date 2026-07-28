"use client";

import { useState } from "react";
import { DEFAULT_COMMENT_LABEL } from "./SurveyBuilder";

export type SurveyQuestion = {
  text: string;
  options: string[];
  mode?: "single" | "multi";
  commentLabel?: string;
};
export type SurveyResponse = {
  id: string;
  q: number;
  selected: number[];
  comment: string;
  name: string;
  participantId: string | null;
  mine: boolean;
};

// A multi-question survey. Each question sets its own single/multi answer mode
// and comment prompt. Anyone with a seat can answer (participants and the
// facilitator); the facilitator/presenter/report see the aggregated grid.
export function SurveyBoard({
  questions,
  responses,
  canAnswer,
  showResults,
  onAnswer,
  presentation = false,
}: {
  questions: SurveyQuestion[];
  responses: SurveyResponse[];
  canAnswer: boolean;
  showResults: boolean;
  onAnswer: (q: number, selected: number[], comment: string) => void;
  presentation?: boolean;
}) {
  const [answers, setAnswers] = useState<
    Record<number, { selected: number[]; comment: string }>
  >(() => {
    const init: Record<number, { selected: number[]; comment: string }> = {};
    for (const r of responses) {
      if (r.mine) init[r.q] = { selected: [...r.selected], comment: r.comment };
    }
    return init;
  });
  const [submitted, setSubmitted] = useState(false);

  const ans = (q: number) => answers[q] ?? { selected: [], comment: "" };

  const toggle = (q: number, oi: number, mode: "single" | "multi") => {
    const cur = ans(q);
    let selected: number[];
    if (mode === "multi") {
      selected = cur.selected.includes(oi)
        ? cur.selected.filter((x) => x !== oi)
        : [...cur.selected, oi].sort((a, b) => a - b);
    } else {
      selected = cur.selected[0] === oi ? [] : [oi];
    }
    setAnswers((p) => ({ ...p, [q]: { selected, comment: cur.comment } }));
    setSubmitted(false);
  };

  const setComment = (q: number, comment: string) => {
    setAnswers((p) => ({ ...p, [q]: { selected: ans(q).selected, comment } }));
    setSubmitted(false);
  };

  const submit = () => {
    questions.forEach((_, qi) => {
      const a = ans(qi);
      onAnswer(qi, a.selected, a.comment);
    });
    setSubmitted(true);
  };

  const answeredCount = questions.filter(
    (_, qi) => ans(qi).selected.length || ans(qi).comment.trim()
  ).length;

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Answer form (participant, or facilitator with a seat) ---- */}
      {canAnswer && (
        <div className="flex flex-col gap-3">
          {questions.map((question, qi) => {
            const mode = question.mode === "multi" ? "multi" : "single";
            const a = ans(qi);
            return (
              <div
                key={qi}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 flex flex-col gap-2"
              >
                <p className="text-sm font-semibold text-slate-800">
                  {qi + 1}. {question.text}
                  <span className="ml-1 text-[11px] font-normal text-slate-400">
                    {mode === "multi" ? "(select all that apply)" : "(pick one)"}
                  </span>
                </p>
                <div className="flex flex-col gap-1.5">
                  {question.options.map((opt, oi) => {
                    const on = a.selected.includes(oi);
                    return (
                      <button
                        key={oi}
                        type="button"
                        onClick={() => toggle(qi, oi, mode)}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                          on
                            ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                            : "border-slate-300 bg-white hover:bg-slate-100"
                        }`}
                      >
                        <span
                          className={`flex items-center justify-center w-4 h-4 shrink-0 border ${
                            mode === "multi" ? "rounded" : "rounded-full"
                          } ${
                            on
                              ? "border-indigo-600 bg-indigo-600 text-white"
                              : "border-slate-400"
                          }`}
                        >
                          {on && (
                            <svg
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              className="w-3 h-3"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 10.7a1 1 0 1 1 1.4-1.4l3.3 3.29 6.8-6.8a1 1 0 0 1 1.4 0Z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </span>
                        {opt}
                      </button>
                    );
                  })}
                </div>
                <textarea
                  value={a.comment}
                  onChange={(e) => setComment(qi, e.target.value)}
                  rows={2}
                  placeholder={question.commentLabel || DEFAULT_COMMENT_LABEL}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            );
          })}
          <div className="flex items-center gap-3">
            <button
              onClick={submit}
              disabled={answeredCount === 0}
              className="self-start rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40"
            >
              {submitted ? "Update responses" : "Submit responses"}
            </button>
            {submitted && (
              <span className="text-sm text-emerald-600 font-medium">
                ✓ Submitted — thank you!
              </span>
            )}
          </div>
        </div>
      )}

      {/* ---- Results grid (facilitator / presenter / report) ---- */}
      {showResults && (
        <div className="flex flex-col">
          {canAnswer && (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
              Group results
            </p>
          )}
          {questions.map((question, qi) => {
            const forQ = responses.filter((r) => r.q === qi);
            const respondents = forQ.length;
            const counts = question.options.map(
              (_, oi) => forQ.filter((r) => r.selected.includes(oi)).length
            );
            const max = Math.max(1, ...counts);
            const comments = forQ.filter((r) => r.comment.trim());
            return (
              <div
                key={qi}
                className="py-3 border-t border-slate-200 first:border-t-0 first:pt-0"
              >
                <p
                  className={`font-semibold text-slate-800 ${
                    presentation ? "text-lg" : "text-sm"
                  }`}
                >
                  {qi + 1}. {question.text}
                </p>
                <p className="text-[11px] text-slate-400 mb-2">
                  {respondents} response{respondents === 1 ? "" : "s"}
                </p>
                <div className="flex flex-col gap-1.5">
                  {question.options.map((opt, oi) => {
                    const c = counts[oi];
                    const pct = respondents
                      ? Math.round((c / respondents) * 100)
                      : 0;
                    return (
                      <div key={oi} className="flex items-center gap-2 text-sm">
                        <span className="w-40 shrink-0 truncate text-slate-700">
                          {opt}
                        </span>
                        <div className="flex-1 h-4 rounded bg-slate-100 overflow-hidden">
                          <div
                            className="h-full bg-indigo-500"
                            style={{ width: `${(c / max) * 100}%` }}
                          />
                        </div>
                        <span className="w-16 shrink-0 text-right text-xs text-slate-500">
                          {c} · {pct}%
                        </span>
                      </div>
                    );
                  })}
                </div>
                {comments.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {comments.map((r) => (
                      <li
                        key={r.id}
                        className="text-xs text-slate-600 bg-slate-50 rounded-md px-2 py-1"
                      >
                        “{r.comment}”{" "}
                        <span className="text-slate-400">— {r.name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          {responses.length === 0 && (
            <p className="text-sm text-slate-400 pt-2">No responses yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
