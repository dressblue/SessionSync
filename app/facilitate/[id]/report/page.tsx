"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  facilitatorHeaders,
  loadFacilitatorIdentity,
  type FacilitatorIdentity,
} from "@/components/identity";
import type { ActivityState, Stroke } from "@/components/useSessionState";

interface ReportData {
  session: { id: string; title: string; status: string };
  course: { title: string; description: string } | null;
  generatedAt: string;
  participants: { name: string; joinedAt: string; isFacilitator: boolean }[];
  steps: { title: string }[];
  activities: (ActivityState & { status: string; createdAt: string })[];
}

const KIND_LABEL: Record<string, string> = {
  vote: "Vote",
  likert: "Scoring survey",
  columns: "Comment board",
  reveal: "Reveal",
  wheel: "Wheel",
  whiteboard: "Whiteboard",
};

function strokesToDataUrl(strokes: Stroke[]): string {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 600;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 800, 600);
  for (const s of strokes) {
    ctx.strokeStyle = s.c;
    ctx.lineWidth = s.w;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    s.p.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x * 800, y * 600);
      else ctx.lineTo(x * 800, y * 600);
    });
    ctx.stroke();
  }
  return canvas.toDataURL("image/png");
}

/** One activity's results as plain text lines (Word/PowerPoint exports). */
function activityLines(a: ActivityState): string[] {
  if (a.kind === "vote" && a.votes) {
    const total = a.votes.total || 1;
    return (a.options ?? []).map(
      (o, i) =>
        `${o} — ${a.votes!.counts[i]} vote${a.votes!.counts[i] === 1 ? "" : "s"} (${Math.round((a.votes!.counts[i] / total) * 100)}%)`
    );
  }
  if (a.kind === "likert") {
    return (a.items ?? []).map((item, i) => {
      const r = a.ratings?.[i];
      return `${item} — ${r?.avg != null ? `avg ${r.avg}` : "no ratings"} (${r?.count ?? 0} rating${(r?.count ?? 0) === 1 ? "" : "s"})`;
    });
  }
  if (a.kind === "reveal" || a.kind === "wheel") {
    return (a.richItems ?? []).map((i) =>
      i.note ? `${i.title} — ${i.note}` : i.title
    );
  }
  if (a.kind === "whiteboard") {
    return [`Shared drawing with ${a.strokes?.length ?? 0} strokes`];
  }
  // columns / collect
  const entries = (a.entries ?? []).filter((e) => !e.hidden);
  if (a.columns && a.columns.length > 0) {
    return a.columns.flatMap((title, ci) => [
      `${title}:`,
      ...entries
        .filter((e) => e.column === ci)
        .map((e) => `  ${e.highlighted ? "✓ " : ""}${e.value} (${e.name})`),
    ]);
  }
  return entries.map(
    (e) => `${e.highlighted ? "✓ " : ""}${e.value} (${e.name})`
  );
}

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [identity, setIdentity] = useState<FacilitatorIdentity | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIdentity(loadFacilitatorIdentity());
    setKey(localStorage.getItem(`ss_facilitator_${id}`));
    setChecked(true);
  }, [id]);

  const load = useCallback(async () => {
    if (!checked) return;
    const res = await fetch(`/api/sessions/${id}/report`, {
      headers: {
        ...(key ? { "x-facilitator-key": key } : {}),
        ...facilitatorHeaders(identity),
      },
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not load report");
      return;
    }
    setReport(data);
  }, [checked, id, key, identity]);

  useEffect(() => {
    load();
  }, [load]);

  function exportWord() {
    if (!reportRef.current || !report) return;
    const html = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${report.session.title}</title></head><body>${reportRef.current.innerHTML}</body></html>`;
    const blob = new Blob(["﻿", html], { type: "application/msword" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${report.session.title.replace(/[^\w ]/g, "")} report.doc`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function exportPptx() {
    if (!report || exporting) return;
    setExporting(true);
    try {
      const PptxGenJS = (await import("pptxgenjs")).default;
      const pptx = new PptxGenJS();
      pptx.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
      pptx.layout = "WIDE";

      const title = pptx.addSlide();
      title.addText(report.session.title, {
        x: 0.6, y: 2.2, w: 12, h: 1.2, fontSize: 36, bold: true, color: "1e1b4b",
      });
      title.addText(
        [
          report.course ? `${report.course.title}\n` : "",
          `Session close-out report — ${new Date(report.generatedAt).toLocaleDateString()}`,
        ].join(""),
        { x: 0.6, y: 3.5, w: 12, h: 1.2, fontSize: 18, color: "475569" }
      );

      const att = pptx.addSlide();
      att.addText("Attendance", {
        x: 0.6, y: 0.4, w: 12, h: 0.7, fontSize: 26, bold: true, color: "1e1b4b",
      });
      att.addText(
        report.participants.map((p) => ({
          text: `${p.name}${p.isFacilitator ? "  (facilitator)" : ""}`,
          options: { bullet: true, fontSize: 16, color: "334155", breakLine: true },
        })),
        { x: 0.8, y: 1.2, w: 11.5, h: 5.5 }
      );

      const agenda = pptx.addSlide();
      agenda.addText("Agenda", {
        x: 0.6, y: 0.4, w: 12, h: 0.7, fontSize: 26, bold: true, color: "1e1b4b",
      });
      agenda.addText(
        report.steps.map((s, i) => ({
          text: `${i + 1}. ${s.title}`,
          options: { fontSize: 16, color: "334155", breakLine: true },
        })),
        { x: 0.8, y: 1.2, w: 11.5, h: 5.5 }
      );

      for (const a of report.activities) {
        const slide = pptx.addSlide();
        slide.addText(`${KIND_LABEL[a.kind] ?? a.kind}: ${a.prompt}`, {
          x: 0.6, y: 0.4, w: 12, h: 0.9, fontSize: 22, bold: true, color: "1e1b4b",
        });
        if (a.kind === "whiteboard" && a.strokes && a.strokes.length > 0) {
          slide.addImage({
            data: strokesToDataUrl(a.strokes),
            x: 2.9, y: 1.4, w: 7.5, h: 5.6,
          });
        } else {
          slide.addText(
            activityLines(a).map((line) => ({
              text: line,
              options: {
                bullet: !line.startsWith("  "),
                fontSize: 14,
                color: "334155",
                breakLine: true,
                indentLevel: line.startsWith("  ") ? 1 : 0,
              },
            })),
            { x: 0.8, y: 1.4, w: 11.5, h: 5.5 }
          );
        }
      }
      await pptx.writeFile({
        fileName: `${report.session.title.replace(/[^\w ]/g, "")} report.pptx`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "PowerPoint export failed");
    } finally {
      setExporting(false);
    }
  }

  if (!checked) return null;
  if (!identity && !key) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 text-center">
        <div>
          <h1 className="text-xl font-semibold">Facilitator access needed</h1>
          <p className="text-slate-500 mt-2">
            Open this report from the session console.
          </p>
        </div>
      </main>
    );
  }
  if (!report) {
    return (
      <main className="flex-1 flex items-center justify-center text-slate-500">
        {error ?? "Assembling report…"}
      </main>
    );
  }

  return (
    <div className="flex-1 min-h-screen bg-slate-100 print:bg-white">
      <header className="no-print bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <button
            onClick={() => router.push(`/facilitate/${id}`)}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            ← Back to console
          </button>
          <h1 className="text-xl font-bold truncate">Session report</h1>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700"
          >
            Print / Save as PDF
          </button>
          <button
            onClick={exportWord}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Download Word
          </button>
          <button
            onClick={exportPptx}
            disabled={exporting}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            {exporting ? "Building…" : "Download PowerPoint"}
          </button>
        </div>
      </header>
      {error && (
        <div className="no-print bg-amber-50 text-amber-800 text-sm px-6 py-2">
          {error}
        </div>
      )}

      <div
        ref={reportRef}
        className="max-w-3xl mx-auto bg-white my-6 print:my-0 rounded-xl print:rounded-none border border-slate-200 print:border-0 shadow-sm print:shadow-none p-10"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
          Session close-out report
        </p>
        <h1 className="text-2xl font-bold mt-1">{report.session.title}</h1>
        {report.course && (
          <p className="text-sm text-slate-500 mt-0.5">{report.course.title}</p>
        )}
        <p className="text-xs text-slate-400 mt-1">
          Generated {new Date(report.generatedAt).toLocaleString()} · session
          status: {report.session.status}
        </p>

        <h2 className="text-lg font-semibold mt-8 mb-2 border-b border-slate-100 pb-1">
          Attendance ({report.participants.length})
        </h2>
        <ul className="text-sm text-slate-700 grid grid-cols-2 gap-x-6 gap-y-1">
          {report.participants.map((p, i) => (
            <li key={i}>
              {p.name}
              {p.isFacilitator && (
                <span className="text-xs text-indigo-500 ml-1.5">
                  (facilitator)
                </span>
              )}
            </li>
          ))}
          {report.participants.length === 0 && (
            <li className="text-slate-400">No participants joined</li>
          )}
        </ul>

        <h2 className="text-lg font-semibold mt-8 mb-2 border-b border-slate-100 pb-1">
          Agenda
        </h2>
        <ol className="text-sm text-slate-700 list-decimal pl-5 space-y-0.5">
          {report.steps.map((s, i) => (
            <li key={i}>{s.title}</li>
          ))}
        </ol>

        <h2 className="text-lg font-semibold mt-8 mb-2 border-b border-slate-100 pb-1">
          Activities ({report.activities.length})
        </h2>
        {report.activities.length === 0 && (
          <p className="text-sm text-slate-400">No activities were run.</p>
        )}
        <div className="flex flex-col gap-6">
          {report.activities.map((a) => (
            <div key={a.id} className="break-inside-avoid">
              <p className="text-sm font-semibold">
                <span className="text-[10px] font-bold uppercase text-indigo-500 mr-2">
                  {KIND_LABEL[a.kind] ?? a.kind}
                </span>
                {a.prompt}
              </p>
              {a.kind === "whiteboard" && a.strokes && a.strokes.length > 0 ? (
                <svg
                  viewBox="0 0 800 600"
                  className="w-full max-w-md border border-slate-200 rounded-lg mt-2"
                >
                  {a.strokes.map((s) => (
                    <path
                      key={s.id}
                      d={s.p
                        .map(
                          (pt, i) =>
                            `${i === 0 ? "M" : "L"}${pt[0] * 800},${pt[1] * 600}`
                        )
                        .join(" ")}
                      stroke={s.c}
                      strokeWidth={s.w}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                </svg>
              ) : a.kind === "vote" && a.votes ? (
                <ul className="mt-1.5 text-sm text-slate-700 space-y-1">
                  {(a.options ?? []).map((o, i) => {
                    const total = a.votes!.total || 1;
                    const pct = Math.round((a.votes!.counts[i] / total) * 100);
                    return (
                      <li key={i} className="flex items-center gap-2">
                        <span className="w-44 truncate">{o}</span>
                        <span className="flex-1 bg-slate-100 rounded h-3 overflow-hidden">
                          <span
                            className="block h-full bg-indigo-400"
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                        <span className="text-xs text-slate-500 w-20 text-right">
                          {a.votes!.counts[i]} · {pct}%
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <ul className="mt-1.5 text-sm text-slate-700 space-y-0.5">
                  {activityLines(a).map((line, i) => (
                    <li key={i} className={line.startsWith("  ") ? "pl-5" : ""}>
                      {line}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
