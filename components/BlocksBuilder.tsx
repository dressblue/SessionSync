"use client";

// Authoring control for the Blocks tool: a list of 1–10 blocks, each with an
// optional title. The number of rows IS the block count (start with 3). Shared
// by the push-an-activity form and the step-tool editor.
export function BlocksBuilder({
  labels,
  onChange,
}: {
  labels: string[];
  onChange: (labels: string[]) => void;
}) {
  const n = labels.length;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-slate-500">
        One answer field per block ({n}/10) — give each an optional title:
      </p>
      {labels.map((lab, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-5 shrink-0 text-right text-xs text-slate-400">
            {i + 1}
          </span>
          <input
            value={lab}
            onChange={(e) =>
              onChange(labels.map((l, j) => (j === i ? e.target.value : l)))
            }
            placeholder={`Block ${i + 1} title (optional)`}
            maxLength={120}
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {n > 1 && (
            <button
              type="button"
              onClick={() => onChange(labels.filter((_, j) => j !== i))}
              title="Remove this block"
              className="shrink-0 rounded-md border border-slate-300 px-1.5 py-1 text-xs text-slate-400 hover:text-rose-500"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      {n < 10 && (
        <button
          type="button"
          onClick={() => onChange([...labels, ""])}
          className="mt-0.5 w-fit rounded-md border border-indigo-300 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
        >
          + Add block
        </button>
      )}
    </div>
  );
}
