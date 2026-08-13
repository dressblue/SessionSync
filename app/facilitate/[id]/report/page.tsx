"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { ActivityState, Stroke } from "@/components/useSessionState";
import { boardToSvg } from "@/lib/whiteboard";
import { LikertChart } from "@/components/LikertChart";
import { WordCloud } from "@/components/WordCloud";
import { CardSort } from "@/components/CardSort";
import { ImpactBoard } from "@/components/ImpactBoard";
import { SurveyBoard } from "@/components/SurveyBoard";
import { ChecklistBoard } from "@/components/ChecklistBoard";
import { BlocksBoard } from "@/components/BlocksBoard";
import { LIKERT_COLORS, anchorLabels } from "@/lib/likert";

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
  quiz: "Quiz",
  likert: "Scoring survey",
  columns: "Comment board",
  reveal: "Reveal",
  wheel: "Network",
  workflow: "Workflow",
  whiteboard: "Whiteboard",
  exhibit: "Presented",
  video: "Video",
  timer: "Timer",
  wordcloud: "Word cloud",
  sort: "Word sort",
  impact1: "Impact 1",
  impact2: "Impact 2",
  impact3: "Impact 3",
  impact4: "Impact 4",
  survey: "Survey",
  slides: "Slides",
  checklist: "Checklist",
  blocks: "Blocks",
};

function strokesToDataUrl(strokes: Stroke[]): string {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 600;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 800, 600);
  // Raster export (PPTX/Word) currently rasterizes pen strokes; placed objects
  // render fully on the report page + live board (shared SVG renderer). Object
  // rasterization for the PPTX/Word image is a fast-follow.
  for (const s of strokes) {
    if (s.k || !s.p) continue;
    ctx.strokeStyle = s.c ?? "#0f172a";
    ctx.lineWidth = s.w ?? 3;
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
  if (a.kind === "quiz" && a.quiz) {
    const total = a.quiz.total || 1;
    const counts = a.quiz.counts ?? [];
    const lines = (a.options ?? []).map((o, i) => {
      const c = counts[i] ?? 0;
      const mark = a.quiz!.correctIndex === i ? " ✓ correct" : "";
      return `${o} — ${c} (${Math.round((c / total) * 100)}%)${mark}`;
    });
    if (a.quiz.correctCount != null) {
      lines.push(`${a.quiz.correctCount} of ${a.quiz.total} answered correctly`);
    }
    return lines;
  }
  if (a.kind === "likert") {
    return (a.items ?? []).map((item, i) => {
      const r = a.ratings?.[i];
      return `${item} — ${r?.avg != null ? `avg ${r.avg}` : "no ratings"} (${r?.count ?? 0} rating${(r?.count ?? 0) === 1 ? "" : "s"})`;
    });
  }
  if (a.kind === "wheel") {
    return (a.richItems ?? []).map((i) =>
      i.note ? `${i.title} — ${i.note}` : i.title
    );
  }
  if (a.kind === "workflow") {
    const g = a.workflow?.graph;
    if (!g) return [];
    const byId = new Map(g.nodes.map((n) => [n.id, n] as const));
    // List each step, then its outgoing branches (with any choice label).
    return g.nodes.flatMap((n) => {
      const lines = [n.note ? `${n.title} — ${n.note}` : n.title];
      for (const e of g.edges.filter((e) => e.from === n.id)) {
        const to = byId.get(e.to)?.title ?? "";
        lines.push(`  → ${e.label ? `${e.label}: ` : ""}${to}`);
      }
      return lines;
    });
  }
  if (a.kind === "reveal") {
    // Each revealed item, followed by the words the room captured for it.
    const words = (a.entries ?? []).filter((e) => !e.hidden);
    return (a.richItems ?? []).flatMap((it, idx) => {
      const w = words.filter((e) => e.column === idx);
      return [
        it.note ? `${it.title} — ${it.note}` : it.title,
        ...w.map((e) => `  ${e.highlighted ? "★ " : ""}${e.value} (${e.name})`),
      ];
    });
  }
  if (a.kind === "sort") {
    const cols = a.columns ?? [];
    const placements = a.placements ?? [];
    return cols.flatMap((title, ci) => [
      `${title}:`,
      ...placements.filter((p) => p.col === ci).map((p) => `  ${p.word}`),
    ]);
  }
  if (
    a.kind === "impact1" ||
    a.kind === "impact2" ||
    a.kind === "impact3" ||
    a.kind === "impact4"
  ) {
    const scales = a.scales ?? [];
    // Document the scales (in their configured order) as a header, then the
    // responses. The header keeps the scale order visible in exports even
    // when no one has responded yet.
    const header = scales.map(
      (s, i) => `Scale ${i + 1}: ${s.name}${s.allowNA ? " (N/A allowed)" : ""}`
    );
    // Value as "3 · Average" using the scale's anchor set; N/A stays plain.
    const valueText = (si: number, val: number | null) => {
      if (val == null) return "N/A";
      const labels = anchorLabels(scales[si]?.anchorSet);
      return labels[val - 1] ? `${val} · ${labels[val - 1]}` : String(val);
    };
    const entries = a.impactEntries ?? [];
    const rows = entries.flatMap((e, idx) => [
      // A blank spacer between entries so blocks read separately; ★ marks the
      // entry the facilitator highlighted for discussion.
      ...(idx > 0 ? [""] : []),
      `${e.highlighted ? "★ " : ""}${e.text} — ${e.name}`,
      ...scales.map((s, i) => `  ${s.name}: ${valueText(i, e.ratings[i] ?? null)}`),
    ]);
    return [...header, ...(rows.length ? rows : ["No entries yet."])];
  }
  if (a.kind === "survey") {
    const questions = a.questions ?? [];
    const resp = a.surveyResponses ?? [];
    return questions.flatMap((q, qi) => {
      const forQ = resp.filter((r) => r.q === qi);
      const lines = [
        `${qi + 1}. ${q.text}  (${forQ.length} response${forQ.length === 1 ? "" : "s"})`,
        ...q.options.map((opt, oi) => {
          const c = forQ.filter((r) => r.selected.includes(oi)).length;
          const pct = forQ.length ? Math.round((c / forQ.length) * 100) : 0;
          return `  ${opt}: ${c} · ${pct}%`;
        }),
        ...forQ
          .filter((r) => r.comment.trim())
          .map((r) => `  “${r.comment}” — ${r.name}`),
      ];
      return lines;
    });
  }
  if (a.kind === "checklist") {
    const columns = a.columns ?? [];
    const statements = a.statements ?? [];
    const resp = a.checklistResponses ?? [];
    return statements.flatMap((st, si) => {
      const forS = resp.filter((r) => r.s === si);
      const counts = columns.map(
        (_, ci) => forS.filter((r) => r.selected.includes(ci)).length
      );
      return [
        `${si + 1}. ${st.text}`,
        `  ${columns.map((c, ci) => `${c}: ${counts[ci]}`).join(" · ")}`,
      ];
    });
  }
  if (a.kind === "blocks") {
    const n = a.blockCount ?? 3;
    const resp = a.blockResponses ?? [];
    return Array.from({ length: n }, (_, i) => {
      const forB = resp.filter((r) => r.block === i);
      return forB.length
        ? `Block ${i + 1}: ${forB.map((r) => `${r.value} — ${r.name}`).join("; ")}`
        : `Block ${i + 1}: (no answers)`;
    });
  }
  if (a.kind === "whiteboard") {
    return [`Shared whiteboard with ${a.strokes?.length ?? 0} objects`];
  }
  if (a.kind === "slides") {
    const s = a.slides;
    if (!s) return ["Slides"];
    const n = s.endPage - s.startPage + 1;
    return [
      `Slide deck — ${n} slide${n === 1 ? "" : "s"} (pages ${s.startPage}–${s.endPage})`,
    ];
  }
  if (a.kind === "exhibit") {
    if (a.exhibit === "file") return [`File: ${a.filename ?? "(document)"}`];
    if (a.exhibit === "url") return [`Link: ${a.url}`];
    return [(a.text ?? "").slice(0, 300) + ((a.text?.length ?? 0) > 300 ? "…" : "")];
  }
  if (a.kind === "video") {
    const v = a.video;
    if (!v) return ["Video"];
    const src =
      v.provider === "youtube" ? `https://youtu.be/${v.ref}` : v.ref;
    return [`Video: ${v.title || src}`];
  }
  if (a.kind === "timer") {
    const t = a.timer;
    const mins = Math.round((t?.durationSec ?? 0) / 60);
    return [`Timer: ${t?.label ? t.label + " — " : ""}${mins} min`];
  }
  if (a.kind === "wordcloud") {
    const counts = new Map<string, number>();
    for (const e of (a.entries ?? []).filter((x) => !x.hidden)) {
      const k = e.value.trim();
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((x, y) => y[1] - x[1])
      .map(([w, n]) => `${w}${n > 1 ? ` (×${n})` : ""}`);
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

// Draw a Likert diverging bar chart onto a PowerPoint slide using filled text
// boxes (no external chart lib). Mirrors the on-screen LikertChart math.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawLikertSlide(slide: any, a: ActivityState) {
  const items = a.items ?? [];
  const ratings = a.ratings ?? [];
  const anchors = a.anchors ?? anchorLabels(a.anchorSet);
  const cols = LIKERT_COLORS.map((c) => c.replace("#", ""));
  const n = anchors.length;
  const mid = (n - 1) / 2;

  const rows = items.map((item, i) => {
    const dist = ratings[i]?.dist ?? [];
    const total = dist.reduce((x, y) => x + y, 0);
    const pct = dist.map((d) => (total ? (d / total) * 100 : 0));
    let neg = 0;
    let pos = 0;
    for (let k = 0; k < n; k++) {
      if (k < mid) neg += pct[k];
      else if (k > mid) pos += pct[k];
      else {
        neg += pct[k] / 2;
        pos += pct[k] / 2;
      }
    }
    return { item, total, pct };
  });
  const negMax = Math.max(1, ...rows.map((r) => {
    let s = 0;
    for (let k = 0; k < mid; k++) s += r.pct[k];
    return s + r.pct[mid] / 2;
  }));
  const posMax = Math.max(1, ...rows.map((r) => {
    let s = 0;
    for (let k = mid + 1; k < n; k++) s += r.pct[k];
    return s + r.pct[mid] / 2;
  }));
  const domain = negMax + posMax;

  const barX = 3.0;
  const barW = 9.8;
  const perPct = barW / domain;
  const centerX = barX + (negMax / domain) * barW;
  const topY = 1.5;
  const rowH = 0.4;
  const gap = 0.16;

  // center line
  const chartH = rows.length * (rowH + gap);
  slide.addText("", {
    x: centerX - 0.006, y: topY, w: 0.012, h: chartH,
    fill: { color: "CBD5E1" },
  });

  rows.forEach((r, i) => {
    const y = topY + i * (rowH + gap);
    slide.addText(r.item, {
      x: 0.3, y, w: 2.5, h: rowH, align: "right", valign: "middle",
      fontSize: 10, color: "334155",
    });
    if (r.total === 0) return;
    const seg = (color: string, x: number, w: number, pct: number) => {
      if (w <= 0.02) return;
      slide.addText(w > 0.5 ? `${Math.round(pct)}%` : "", {
        x, y, w, h: rowH, fill: { color }, color: "FFFFFF",
        fontSize: 9, align: "center", valign: "middle", margin: 0,
      });
    };
    const half = (r.pct[mid] / 2) * perPct;
    seg(cols[mid], centerX - half, r.pct[mid] * perPct, r.pct[mid]);
    let edge = centerX - half;
    for (let k = mid - 1; k >= 0; k--) {
      const w = r.pct[k] * perPct;
      edge -= w;
      seg(cols[k], edge, w, r.pct[k]);
    }
    edge = centerX + half;
    for (let k = mid + 1; k < n; k++) {
      const w = r.pct[k] * perPct;
      seg(cols[k], edge, w, r.pct[k]);
      edge += w;
    }
  });

  // legend
  const legendY = topY + chartH + 0.25;
  anchors.forEach((label, k) => {
    const x = 3.0 + k * 2.0;
    slide.addText("", {
      x, y: legendY, w: 0.18, h: 0.18, fill: { color: cols[k] },
    });
    slide.addText(label, {
      x: x + 0.22, y: legendY - 0.05, w: 1.75, h: 0.3,
      fontSize: 9, color: "334155", valign: "middle",
    });
  });
}

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/sessions/${id}/report`, {
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not load report");
      return;
    }
    setReport(data);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const removeActivity = useCallback(
    async (aid: string) => {
      if (
        !confirm(
          "Remove this activity from the report? Its responses are deleted permanently."
        )
      )
        return;
      const res = await fetch(`/api/sessions/${id}/activities/${aid}`, {
        method: "DELETE",
      });
      if (res.ok) load();
      else alert("Could not remove the activity.");
    },
    [id, load]
  );

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
        } else if (
          a.kind === "likert" &&
          (a.scale ?? 5) === 5 &&
          (a.ratings?.length ?? 0) > 0
        ) {
          drawLikertSlide(slide, a);
        } else {
          slide.addText(
            activityLines(a).map((line) => {
              const indented = line.startsWith("  ");
              const isEntry = !indented && line.includes(" — ");
              return {
                text: line,
                options: {
                  // Empty spacer lines and indented rating lines carry no
                  // bullet; entry/scale headers do.
                  bullet: line.trim().length > 0 && !indented,
                  bold: isEntry,
                  fontSize: 14,
                  color: line.startsWith("★") ? "b45309" : "334155",
                  breakLine: true,
                  indentLevel: indented ? 1 : 0,
                },
              };
            }),
            { x: 0.8, y: 1.4, w: 11.5, h: 5.5, valign: "top" }
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
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold">
                  <span className="text-[10px] font-bold uppercase text-indigo-500 mr-2">
                    {KIND_LABEL[a.kind] ?? a.kind}
                  </span>
                  {a.prompt}
                </p>
                <button
                  onClick={() => removeActivity(a.id)}
                  title="Remove this activity from the report"
                  aria-label="Remove activity"
                  className="print:hidden shrink-0 rounded-md px-1.5 py-1 text-slate-300 hover:text-rose-500"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path
                      fillRule="evenodd"
                      d="M8.75 1a1 1 0 0 0-.95.68L7.32 3H4a1 1 0 0 0 0 2h.11l.86 11.14A2 2 0 0 0 6.96 18h6.08a2 2 0 0 0 1.99-1.86L15.89 5H16a1 1 0 1 0 0-2h-3.32l-.48-1.32A1 1 0 0 0 11.25 1h-2.5ZM9 7.25a.75.75 0 0 0-1.5 0v6a.75.75 0 0 0 1.5 0v-6Zm3.5 0a.75.75 0 0 0-1.5 0v6a.75.75 0 0 0 1.5 0v-6Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
              {a.kind === "whiteboard" && a.strokes && a.strokes.length > 0 ? (
                <svg
                  viewBox="0 0 800 600"
                  className="w-full max-w-md border border-slate-200 rounded-lg mt-2"
                  dangerouslySetInnerHTML={{ __html: boardToSvg(a.strokes) }}
                />
              ) : a.kind === "likert" &&
                (a.scale ?? 5) === 5 &&
                (a.ratings?.length ?? 0) > 0 ? (
                <div className="mt-2">
                  <LikertChart
                    items={a.items ?? []}
                    ratings={(a.ratings ?? []).map((r) => ({
                      avg: r.avg,
                      count: r.count,
                      dist: r.dist ?? [],
                    }))}
                    anchors={a.anchors ?? anchorLabels(a.anchorSet)}
                    dense
                  />
                </div>
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
              ) : a.kind === "wordcloud" && (a.cloud?.length ?? 0) > 0 ? (
                <div className="mt-2">
                  <WordCloud
                    cloud={a.cloud ?? []}
                    canModerate={false}
                    readOnly
                    onDownvote={() => {}}
                    onHide={() => {}}
                    onClearDownvotes={() => {}}
                  />
                </div>
              ) : a.kind === "sort" ? (
                <div className="mt-2">
                  <CardSort
                    words={a.words ?? []}
                    columns={a.columns ?? []}
                    placements={a.placements ?? []}
                    onPlace={() => {}}
                    onUnplace={() => {}}
                    readOnly
                  />
                </div>
              ) : a.kind === "impact1" ||
                a.kind === "impact2" ||
                a.kind === "impact3" ||
                a.kind === "impact4" ? (
                <div className="mt-2">
                  <ImpactBoard
                    topic={a.topic ?? a.prompt ?? ""}
                    scales={a.scales ?? []}
                    entries={a.impactEntries ?? []}
                    canAdd={false}
                    canModerate={false}
                    onAdd={() => {}}
                    onDelete={() => {}}
                    onHighlight={() => {}}
                  />
                </div>
              ) : a.kind === "survey" ? (
                <div className="mt-2">
                  <SurveyBoard
                    questions={a.questions ?? []}
                    responses={a.surveyResponses ?? []}
                    canAnswer={false}
                    showResults
                    onAnswer={() => {}}
                  />
                </div>
              ) : a.kind === "checklist" ? (
                <div className="mt-2">
                  <ChecklistBoard
                    columns={a.columns ?? []}
                    statements={a.statements ?? []}
                    responses={a.checklistResponses ?? []}
                    displayOnly={!!a.displayOnly}
                    canAnswer={false}
                    showResults
                    onAnswer={() => {}}
                  />
                </div>
              ) : a.kind === "blocks" ? (
                <div className="mt-2">
                  <BlocksBoard
                    blockCount={a.blockCount ?? 3}
                    responses={a.blockResponses ?? []}
                    canModerate={false}
                    readOnly
                  />
                </div>
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
