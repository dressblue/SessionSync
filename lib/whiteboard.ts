// Shared whiteboard geometry + a pure element→SVG-string renderer used by BOTH
// the live board (components/Whiteboard.tsx, via dangerouslySetInnerHTML) and the
// session report (strokesToDataUrl + inline). One renderer → the board and every
// export stay identical. Coordinates are normalized 0..1 and scaled to VIEW_*.
import type { Stroke, WBAnchor } from "@/components/useSessionState";

export const VIEW_W = 800;
export const VIEW_H = 600;

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Normalize an element's box to positive width/height (drags can be negative).
export function boxOf(el: Stroke) {
  let x = el.x ?? 0;
  let y = el.y ?? 0;
  let bw = el.bw ?? 0;
  let bh = el.bh ?? 0;
  if (bw < 0) {
    x += bw;
    bw = -bw;
  }
  if (bh < 0) {
    y += bh;
    bh = -bh;
  }
  return { x, y, bw, bh };
}

export function centerOf(el: Stroke): [number, number] {
  const b = boxOf(el);
  return [b.x + b.bw / 2, b.y + b.bh / 2];
}

// Point on the element's bounding-box border, from its center toward `t`.
export function borderPoint(el: Stroke, t: [number, number]): [number, number] {
  const b = boxOf(el);
  const cx = b.x + b.bw / 2;
  const cy = b.y + b.bh / 2;
  const dx = t[0] - cx;
  const dy = t[1] - cy;
  if (dx === 0 && dy === 0) return [cx, cy];
  const hw = b.bw / 2 || 1e-4;
  const hh = b.bh / 2 || 1e-4;
  const s = Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9));
  return [cx + dx * s, cy + dy * s];
}

function anchorPoint(a: WBAnchor | undefined, byId: Map<string, Stroke>): [number, number] {
  if (a?.id && byId.has(a.id)) return centerOf(byId.get(a.id)!);
  return [a?.x ?? 0.5, a?.y ?? 0.5];
}

// Resolve a connector endpoint: anchored → border toward the other end; else free.
export function resolveEnd(
  end: WBAnchor | undefined,
  other: WBAnchor | undefined,
  byId: Map<string, Stroke>
): [number, number] {
  if (end?.id && byId.has(end.id)) {
    return borderPoint(byId.get(end.id)!, anchorPoint(other, byId));
  }
  return [end?.x ?? 0.5, end?.y ?? 0.5];
}

function arrowHead(x1: number, y1: number, x2: number, y2: number, color: string): string {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const L = 13;
  const Wd = 7;
  const bx = x2 - L * Math.cos(ang);
  const by = y2 - L * Math.sin(ang);
  const p1x = bx - Wd * Math.sin(ang);
  const p1y = by + Wd * Math.cos(ang);
  const p2x = bx + Wd * Math.sin(ang);
  const p2y = by - Wd * Math.cos(ang);
  return `<polygon points="${x2.toFixed(1)},${y2.toFixed(1)} ${p1x.toFixed(1)},${p1y.toFixed(1)} ${p2x.toFixed(1)},${p2y.toFixed(1)}" fill="${esc(color)}"/>`;
}

// Unit-box (0..1) cloud outline; non-scaling-stroke keeps the outline crisp.
const CLOUD_UNIT =
  "M0.25,0.78 C0.08,0.78 0.08,0.54 0.24,0.52 C0.20,0.32 0.50,0.26 0.54,0.44 C0.62,0.30 0.86,0.36 0.80,0.55 C0.95,0.56 0.94,0.78 0.78,0.78 Z";

function wrapLines(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
    if (lines.length >= 6) break;
  }
  if (cur && lines.length < 6) lines.push(cur);
  return lines.length ? lines : [""];
}

function multiText(
  cx: number,
  cy: number,
  text: string,
  color: string,
  size: number,
  boxW: number,
  anchor: "middle" | "start" = "middle"
): string {
  const maxChars = Math.max(4, Math.floor(boxW / (size * 0.55)));
  const lines = wrapLines(text, maxChars);
  const lh = size * 1.15;
  const startY = cy - ((lines.length - 1) * lh) / 2;
  return lines
    .map(
      (ln, i) =>
        `<text x="${cx.toFixed(1)}" y="${(startY + i * lh).toFixed(1)}" text-anchor="${anchor}" dominant-baseline="central" font-family="ui-sans-serif,system-ui,sans-serif" font-size="${size}" fill="${esc(color)}">${esc(ln)}</text>`
    )
    .join("");
}

// Render one element to an SVG fragment string (VIEW_W×VIEW_H coordinate space).
export function elementToSvg(el: Stroke, byId: Map<string, Stroke>): string {
  const W = VIEW_W;
  const H = VIEW_H;
  const stroke = el.c ?? "#0f172a";
  const sw = el.sw ?? el.w ?? 3;

  // Freehand pen (legacy: no `k`).
  if (!el.k) {
    if (!el.p || el.p.length === 0) return "";
    const d = el.p
      .map((pt, i) => `${i === 0 ? "M" : "L"}${(pt[0] * W).toFixed(1)},${(pt[1] * H).toFixed(1)}`)
      .join(" ");
    return `<path d="${d}" stroke="${esc(stroke)}" stroke-width="${sw}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  const b = boxOf(el);
  const X = b.x * W;
  const Y = b.y * H;
  const BW = b.bw * W;
  const BH = b.bh * H;
  const fill = el.f ? esc(el.f) : "none";
  const cx = X + BW / 2;
  const cy = Y + BH / 2;
  const labelFs = el.fs ?? 15; // shape labels honor the element's font size

  switch (el.k) {
    case "rect":
      return (
        `<rect x="${X.toFixed(1)}" y="${Y.toFixed(1)}" width="${BW.toFixed(1)}" height="${BH.toFixed(1)}" fill="${fill}" stroke="${esc(stroke)}" stroke-width="${sw}"/>` +
        (el.t ? multiText(cx, cy, el.t, stroke, labelFs, BW) : "")
      );
    case "rrect":
      return (
        `<rect x="${X.toFixed(1)}" y="${Y.toFixed(1)}" width="${BW.toFixed(1)}" height="${BH.toFixed(1)}" rx="${(Math.min(BW, BH) * 0.16).toFixed(1)}" fill="${fill}" stroke="${esc(stroke)}" stroke-width="${sw}"/>` +
        (el.t ? multiText(cx, cy, el.t, stroke, labelFs, BW) : "")
      );
    case "ellipse":
      return (
        `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${(BW / 2).toFixed(1)}" ry="${(BH / 2).toFixed(1)}" fill="${fill}" stroke="${esc(stroke)}" stroke-width="${sw}"/>` +
        (el.t ? multiText(cx, cy, el.t, stroke, labelFs, BW) : "")
      );
    case "triangle": {
      const pts = `${cx.toFixed(1)},${Y.toFixed(1)} ${(X + BW).toFixed(1)},${(Y + BH).toFixed(1)} ${X.toFixed(1)},${(Y + BH).toFixed(1)}`;
      return (
        `<polygon points="${pts}" fill="${fill}" stroke="${esc(stroke)}" stroke-width="${sw}" stroke-linejoin="round"/>` +
        (el.t ? multiText(cx, Y + BH * 0.66, el.t, stroke, labelFs, BW * 0.7) : "")
      );
    }
    case "diamond": {
      const pts = `${cx.toFixed(1)},${Y.toFixed(1)} ${(X + BW).toFixed(1)},${cy.toFixed(1)} ${cx.toFixed(1)},${(Y + BH).toFixed(1)} ${X.toFixed(1)},${cy.toFixed(1)}`;
      return (
        `<polygon points="${pts}" fill="${fill}" stroke="${esc(stroke)}" stroke-width="${sw}" stroke-linejoin="round"/>` +
        (el.t ? multiText(cx, cy, el.t, stroke, labelFs, BW * 0.7) : "")
      );
    }
    case "cloud":
      return (
        `<g transform="translate(${X.toFixed(1)},${Y.toFixed(1)}) scale(${BW.toFixed(1)},${BH.toFixed(1)})"><path d="${CLOUD_UNIT}" fill="${fill === "none" ? "#ffffff" : fill}" stroke="${esc(stroke)}" stroke-width="${sw}" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></g>` +
        (el.t ? multiText(cx, cy + BH * 0.05, el.t, stroke, labelFs, BW * 0.7) : "")
      );
    case "line":
    case "arrow": {
      const x1 = (el.x ?? 0) * W;
      const y1 = (el.y ?? 0) * H;
      const x2 = ((el.x ?? 0) + (el.bw ?? 0)) * W;
      const y2 = ((el.y ?? 0) + (el.bh ?? 0)) * H;
      let s = `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${esc(stroke)}" stroke-width="${sw}" stroke-linecap="round"/>`;
      if (el.k === "arrow") s += arrowHead(x1, y1, x2, y2, stroke);
      return s;
    }
    case "text":
      return multiText(X, Y + (el.fs ?? 24) / 2, el.t ?? "", stroke, el.fs ?? 24, BW || 300, "start");
    case "sticky": {
      const bg = el.f ?? "#fde68a";
      return (
        `<rect x="${X.toFixed(1)}" y="${Y.toFixed(1)}" width="${BW.toFixed(1)}" height="${BH.toFixed(1)}" rx="4" fill="${esc(bg)}" stroke="#0000001a" stroke-width="1"/>` +
        (el.t ? multiText(cx, cy, el.t, "#1f2937", 14, BW * 0.86) : "")
      );
    }
    case "stamp":
      return `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="${Math.min(BW, BH).toFixed(1)}">${esc(el.ch ?? "⭐")}</text>`;
    case "table": {
      const rows = Math.max(1, el.rows ?? 3);
      const cols = Math.max(1, el.cols ?? 3);
      const cw = BW / cols;
      const rh = BH / rows;
      const gw = Math.max(0.75, sw * 0.6);
      let s = `<rect x="${X.toFixed(1)}" y="${Y.toFixed(1)}" width="${BW.toFixed(1)}" height="${BH.toFixed(1)}" fill="${fill === "none" ? "#ffffff" : fill}" stroke="${esc(stroke)}" stroke-width="${sw}"/>`;
      for (let c = 1; c < cols; c++)
        s += `<line x1="${(X + c * cw).toFixed(1)}" y1="${Y.toFixed(1)}" x2="${(X + c * cw).toFixed(1)}" y2="${(Y + BH).toFixed(1)}" stroke="${esc(stroke)}" stroke-width="${gw}"/>`;
      for (let r = 1; r < rows; r++)
        s += `<line x1="${X.toFixed(1)}" y1="${(Y + r * rh).toFixed(1)}" x2="${(X + BW).toFixed(1)}" y2="${(Y + r * rh).toFixed(1)}" stroke="${esc(stroke)}" stroke-width="${gw}"/>`;
      const cells = el.cells ?? [];
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const txt = cells[r * cols + c];
          if (txt) s += multiText(X + c * cw + cw / 2, Y + r * rh + rh / 2, txt, stroke, 12, cw * 0.9);
        }
      return s;
    }
    case "conn": {
      const A = resolveEnd(el.a, el.b, byId);
      const Bp = resolveEnd(el.b, el.a, byId);
      const ax = A[0] * W;
      const ay = A[1] * H;
      const bx = Bp[0] * W;
      const by = Bp[1] * H;
      let s = `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="${esc(stroke)}" stroke-width="${sw}" stroke-linecap="round"${el.dash ? ' stroke-dasharray="7 6"' : ""}/>`;
      if (el.arrow) s += arrowHead(ax, ay, bx, by, stroke);
      return s;
    }
  }
  return "";
}

// Build the id→element lookup connectors need to resolve their endpoints.
export function elementIndex(els: Stroke[]): Map<string, Stroke> {
  const m = new Map<string, Stroke>();
  for (const e of els) if (e.id) m.set(e.id, e);
  return m;
}

// Stable layer order: lower z renders first (behind), equal z keeps insertion.
export function sortByZ(els: Stroke[]): Stroke[] {
  return els
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.z ?? 0) - (b.e.z ?? 0) || a.i - b.i)
    .map((x) => x.e);
}

// The full board as one SVG string (used by the report's data-URL export).
export function boardToSvg(els: Stroke[]): string {
  const byId = elementIndex(els);
  return sortByZ(els)
    .map((e) => elementToSvg(e, byId))
    .join("");
}
