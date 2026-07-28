"use client";

import { useState } from "react";

export type SurveyQuestion = { text: string; options: string[] };
export type SurveyResponse = {
  id: string;
  q: number;
  selected: number[];
  comment: string;
  name: string;
  participantId: string | null;
  mine: boolean;
};

// A multi-question survey. Participants answer each question (single- or
// multi-select for the whole tool) with an optional comment; everyone else
// (facilitator, presenter, report) sees the aggregated results grid.
export function SurveyBoard({
  mode,
  questions,
  responses,
  canAnswer,
  onAnswer,
  presentation = false,
}: {
  mode: "single" | "multi";
  questions: SurveyQuestion[];
  responses: SurveyResponse[];
  canAnswer: boolean;
  onAnswer: (q: number, selected: number[], comment: string) => void;
  presentation?: boolean;
}) {
  // Local editable copy of the viewer's own answers, seeded once.
  const [answers, setAnswers] = useState<
    Record<number, { selected: number[]; comment: string }>
  >(() => {
    const init: Record<number, { selected: number[]; comment: string }> = {};
    for (const r of responses) {
      if (r.mine) init[r.q] = { selected: [...r.selected], comment: r.comment };
    }
    return init;
  });

  const ans = (q: number) => answers[q] ?? { selected: [], comment: "" };

  const toggle = (q: number, oi: number) => {
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
    onAnswer(q, selected, cur.comment);
  };

  const setComment = (q: number, comment: string) =>
    setAnswers((p) => ({ ...p, [q]: { selected: ans(q).selected, comment } }));

  // ---- Participant: the answer form ----
  if (canAnswer) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-xs text-slate-500">
          {mode === "multi"
            ? "Select all that apply, then explain if you like."
            : "Pick one, then explain if you like."}
        </p>
        {questions.map((question, qi) => {
          const a = ans(qi);
          return (
            <div
              key={qi}
              className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 flex flex-col gap-2"
            >
              <p className="text-sm font-semibold text-slate-800">
                {qi + 1}. {question.text}
              </p>
              <div className="flex flex-col gap-1.5">
                {question.options.map((opt, oi) => {
                  const on = a.selected.includes(oi);
                  return (
                    <button
                      key={oi}
                      type="button"
                      onClick={() => toggle(qi, oi)}
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
                onBlur={() => onAnswer(qi, a.selected, ans(qi).comment)}
                rows={2}
                placeholder="Explain your response (optional)…"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          );
        })}
      </div>
    );
  }

  // ---- Results grid (facilitator / presenter / report) ----
  return (
    <div className="flex flex-col">
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
                const pct = respondents ? Math.round((c / respondents) * 100) : 0;
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
                    “{r.comment}” <span className="text-slate-400">— {r.name}</span>
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
  );
}
