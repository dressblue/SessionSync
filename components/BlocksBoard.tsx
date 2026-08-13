"use client";

import { useState } from "react";

interface BlockResponse {
  id: string;
  block: number;
  value: string;
  name: string;
  participantId: string | null;
  mine: boolean;
}

interface Props {
  blockCount: number;
  /** Optional per-block title; falls back to "Block N". */
  labels?: string[];
  responses: BlockResponse[];
  /** Facilitator view — can also answer, and sees the per-block log with names. */
  canModerate: boolean;
  /** Set when the viewer is a participant (they get the input fields). */
  participantId?: string;
  /** Projector mode — larger for across-the-room, log only. */
  present?: boolean;
  /** Static (report) — no inputs, always show names. */
  readOnly?: boolean;
  /** Facilitator or participant saves one answer for a block (empty clears it). */
  onSubmit?: (block: number, value: string) => void;
}

// One question, N answer blocks stacked full-width in a single column.
// Facilitator and participants can each place one answer per block; the
// facilitator (and report) also see the per-block log of who answered where
// (the public projector shows the answers without names).
export function BlocksBoard({
  blockCount,
  labels,
  responses,
  canModerate,
  participantId,
  present = false,
  readOnly = false,
  onSubmit,
}: Props) {
  const n = Math.min(10, Math.max(1, blockCount || 3));
  const blocks = Array.from({ length: n }, (_, i) => i);
  const titleFor = (i: number) => labels?.[i]?.trim() || `Block ${i + 1}`;
  const mineFor = (i: number) =>
    responses.find((r) => r.block === i && r.mine)?.value ?? "";
  const byBlock = (i: number) => responses.filter((r) => r.block === i);

  // Both the facilitator (canModerate) and participants get input fields.
  const canSubmit = (!!participantId || canModerate) && !readOnly && !present;
  // The per-block log renders for the facilitator, the report, and the
  // projector; names show for the facilitator and report only.
  const showLog = canModerate || readOnly || present;
  const showNames = canModerate || readOnly;
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  return (
    <div className="flex flex-col gap-4">
      {blocks.map((i) => {
        const rs = byBlock(i);
        const val = drafts[i] ?? mineFor(i);
        const save = () => {
          const d = drafts[i];
          if (d === undefined) return; // untouched
          const v = d.trim();
          if (v !== mineFor(i)) onSubmit?.(i, v);
        };
        return (
          <div
            key={i}
            className="w-full rounded-lg border border-slate-200 p-3 [&>*]:min-w-0"
          >
            <p
              className={`mb-2 font-semibold uppercase tracking-wide text-indigo-600 ${
                present ? "text-sm" : "text-xs"
              }`}
            >
              {titleFor(i)}
              {showLog && (
                <span className="ml-1 font-normal normal-case text-slate-400">
                  · {rs.length}
                </span>
              )}
            </p>

            {canSubmit && (
              <input
                value={val}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [i]: e.target.value }))
                }
                onBlur={save}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                maxLength={500}
                placeholder={`Your answer for ${titleFor(i)}`}
                className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  showLog ? "mb-2" : ""
                }`}
              />
            )}

            {showLog &&
              (rs.length === 0 ? (
                <p className="text-xs text-slate-400">No answers yet.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {rs.map((r) => (
                    <li
                      key={r.id}
                      className={`${present ? "text-lg" : "text-sm"} text-slate-800`}
                    >
                      <span className="font-medium">{r.value}</span>
                      {showNames && (
                        <span className="text-xs text-slate-400"> — {r.name}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ))}
          </div>
        );
      })}
      {canSubmit && !showLog && (
        <p className="text-[11px] text-slate-400">
          Type one answer in each block — it saves as you go (edits replace).
        </p>
      )}
    </div>
  );
}
