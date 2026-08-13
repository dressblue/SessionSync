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
  responses: BlockResponse[];
  /** Facilitator view — sees the per-block log with names. */
  canModerate: boolean;
  /** Set when the viewer is a participant (they get the input fields). */
  participantId?: string;
  /** Projector mode — larger for across-the-room. */
  present?: boolean;
  /** Static (report) — no inputs, always show names. */
  readOnly?: boolean;
  /** Participant saves one answer for a block (empty clears it). */
  onSubmit?: (block: number, value: string) => void;
}

// One question, N numbered answer blocks. Participants place one answer per
// block; everyone else sees a per-block log (facilitator + report show who
// answered where; the public projector shows the answers without names).
export function BlocksBoard({
  blockCount,
  responses,
  canModerate,
  participantId,
  present = false,
  readOnly = false,
  onSubmit,
}: Props) {
  const n = Math.min(10, Math.max(1, blockCount || 3));
  const blocks = Array.from({ length: n }, (_, i) => i);
  const mineFor = (i: number) =>
    responses.find((r) => r.block === i && r.mine)?.value ?? "";
  const byBlock = (i: number) => responses.filter((r) => r.block === i);

  const isParticipant = !!participantId && !canModerate && !readOnly;
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  if (isParticipant) {
    return (
      <div className="flex flex-col gap-3">
        {blocks.map((i) => {
          const val = drafts[i] ?? mineFor(i);
          const save = () => {
            const d = drafts[i];
            if (d === undefined) return; // untouched
            const v = d.trim();
            if (v !== mineFor(i)) onSubmit?.(i, v);
          };
          return (
            <div key={i}>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Block {i + 1}
              </label>
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
                placeholder={`Your answer for block ${i + 1}`}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          );
        })}
        <p className="text-[11px] text-slate-400">
          Type one answer in each block — it saves as you go (edits replace).
        </p>
      </div>
    );
  }

  // Log view: facilitator / projector / report.
  const showNames = canModerate || readOnly;
  return (
    <div
      className={`grid gap-3 ${n > 1 ? "sm:grid-cols-2" : ""} ${
        present ? "lg:grid-cols-2" : ""
      }`}
    >
      {blocks.map((i) => {
        const rs = byBlock(i);
        return (
          <div
            key={i}
            className="rounded-lg border border-slate-200 p-3 [&>*]:min-w-0"
          >
            <p
              className={`mb-2 font-semibold uppercase tracking-wide text-indigo-600 ${
                present ? "text-sm" : "text-xs"
              }`}
            >
              Block {i + 1}
              <span className="ml-1 font-normal normal-case text-slate-400">
                · {rs.length}
              </span>
            </p>
            {rs.length === 0 ? (
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
            )}
          </div>
        );
      })}
    </div>
  );
}
