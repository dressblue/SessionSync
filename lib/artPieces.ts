// Hand-drawn SVG "art pieces" for the Build tool — real face parts (eyes,
// brows, noses, mouths, ears, lashes, teardrops, scars) you can place, colour,
// resize and rotate like any object. Each generator draws in a 0..100 unit box;
// elementToSvg renders it inside a nested <svg viewBox="0 0 100 100"> scaled to
// the element's box, so pieces stretch to fit and keep crisp strokes.
//
// s = ink/stroke colour (from the element's line colour), f = fill (element fill
// or a per-piece default). Strokes use vector-effect so they stay even at any
// scale.

const S = (s: string, w = 6) =>
  `stroke="${s}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="none" vector-effect="non-scaling-stroke"`;

type Piece = (s: string, f: string | null) => string;

export const ART: Record<string, Piece> = {
  // ---- Eyes ----
  eye_open: (s, f) =>
    `<ellipse cx="50" cy="50" rx="42" ry="27" fill="${f || "#ffffff"}" ${S(s)}/><circle cx="50" cy="50" r="13" fill="${s}"/><circle cx="45" cy="45" r="4" fill="#ffffff"/>`,
  eye_happy: (s) => `<path d="M12 60 Q50 28 88 60" ${S(s, 8)}/>`,
  eye_sad: (s, f) =>
    `<path d="M14 42 Q50 66 86 46" ${S(s, 7)}/><circle cx="50" cy="52" r="9" fill="${s}"/>`,
  eye_angry: (s, f) =>
    `<path d="M14 42 L86 52 Q80 68 50 68 Q22 66 14 42 Z" fill="${f || "#ffffff"}" ${S(s)}/><circle cx="54" cy="54" r="11" fill="${s}"/>`,
  eye_wink: (s) => `<path d="M16 54 Q50 34 84 54" ${S(s, 8)}/>`,
  eye_wide: (s, f) =>
    `<circle cx="50" cy="50" r="36" fill="${f || "#ffffff"}" ${S(s)}/><circle cx="50" cy="52" r="10" fill="${s}"/>`,
  eye_star: (s, f) =>
    `<path d="M50 12 L60 40 L90 40 L65 58 L74 88 L50 70 L26 88 L35 58 L10 40 L40 40 Z" fill="${f || "#fbbf24"}" ${S(s, 4)}/>`,
  eye_heart: (s, f) =>
    `<path d="M50 86 C8 56 20 18 50 40 C80 18 92 56 50 86 Z" fill="${f || "#ef4444"}" ${S(s, 3)}/>`,
  // ---- Brows ----
  brow_flat: (s) => `<path d="M14 50 L86 50" ${S(s, 12)}/>`,
  brow_angry: (s) => `<path d="M16 60 L84 40" ${S(s, 12)}/>`,
  brow_sad: (s) => `<path d="M16 40 L84 60" ${S(s, 12)}/>`,
  brow_raised: (s) => `<path d="M14 58 Q50 26 86 58" ${S(s, 11)}/>`,
  // ---- Noses ----
  nose_button: (s) =>
    `<path d="M50 24 C46 48 40 60 36 66 Q50 76 64 66 C60 60 54 48 50 24" ${S(s)}/>`,
  nose_long: (s) => `<path d="M54 18 C48 48 42 62 40 72 Q54 80 62 68" ${S(s)}/>`,
  nose_wide: (s) =>
    `<path d="M50 26 C48 50 42 60 34 66 Q50 78 66 66 C58 60 52 50 50 26" ${S(s)}/><circle cx="36" cy="66" r="4" fill="${s}"/><circle cx="64" cy="66" r="4" fill="${s}"/>`,
  // ---- Mouths ----
  mouth_smile: (s) => `<path d="M18 46 Q50 84 82 46" ${S(s, 9)}/>`,
  mouth_frown: (s) => `<path d="M18 72 Q50 34 82 72" ${S(s, 9)}/>`,
  mouth_neutral: (s) => `<path d="M20 54 L80 54" ${S(s, 9)}/>`,
  mouth_open: (s, f) =>
    `<ellipse cx="50" cy="54" rx="26" ry="22" fill="${f || "#7f1d1d"}" ${S(s, 5)}/>`,
  mouth_grin: (s, f) =>
    `<path d="M16 44 Q50 56 84 44 Q70 86 50 86 Q30 86 16 44 Z" fill="${f || "#b91c1c"}" ${S(s, 5)}/><path d="M20 50 Q50 60 80 50" stroke="#ffffff" stroke-width="8" fill="none" vector-effect="non-scaling-stroke"/>`,
  lips: (s, f) =>
    `<path d="M12 52 Q30 38 50 48 Q70 38 88 52 Q70 68 50 58 Q30 68 12 52 Z" fill="${f || "#e11d48"}" ${S(s, 4)}/>`,
  tongue_out: (s, f) =>
    `<path d="M18 42 Q50 54 82 42 Q72 74 50 74 Q28 74 18 42 Z" fill="${f || "#b91c1c"}" ${S(s, 5)}/><path d="M40 66 Q50 92 60 66 Q50 60 40 66 Z" fill="#fb7185" ${S(s, 3)}/>`,
  // ---- Ears / features ----
  ear: (s, f) =>
    `<path d="M40 16 Q86 20 84 54 Q82 86 44 84 Q60 64 54 50 Q68 44 60 34 Q52 26 40 16 Z" fill="${f || "#fde3c8"}" ${S(s)}/>`,
  lashes: (s) =>
    `<path d="M12 58 Q50 42 88 58" ${S(s, 6)}/><path d="M20 60 L12 76" ${S(s, 5)}/><path d="M38 55 L34 76" ${S(s, 5)}/><path d="M50 54 L50 78" ${S(s, 5)}/><path d="M62 55 L66 76" ${S(s, 5)}/><path d="M80 60 L88 76" ${S(s, 5)}/>`,
  tear: (s, f) =>
    `<path d="M50 16 C50 16 28 54 28 70 A22 22 0 1 0 72 70 C72 54 50 16 50 16 Z" fill="${f || "#38bdf8"}" ${S(s, 3)}/><path d="M42 60 A12 12 0 0 0 40 74" stroke="#ffffff" stroke-width="4" fill="none" vector-effect="non-scaling-stroke"/>`,
  scar: (s) =>
    `<path d="M50 12 L50 88" ${S(s, 5)}/><path d="M38 28 L62 28" ${S(s, 4)}/><path d="M38 48 L62 48" ${S(s, 4)}/><path d="M38 68 L62 68" ${S(s, 4)}/>`,
  clown_nose: (s) =>
    `<circle cx="50" cy="50" r="36" fill="#ef4444" stroke="#b91c1c" stroke-width="4" vector-effect="non-scaling-stroke"/><circle cx="40" cy="40" r="8" fill="#fca5a5"/>`,
  freckles: (s, f) => {
    const c = f || "#c2673f";
    return `<circle cx="30" cy="40" r="6" fill="${c}"/><circle cx="70" cy="40" r="6" fill="${c}"/><circle cx="24" cy="60" r="5" fill="${c}"/><circle cx="50" cy="66" r="5" fill="${c}"/><circle cx="76" cy="60" r="5" fill="${c}"/>`;
  },
  moustache: (s, f) =>
    `<path d="M50 40 Q30 34 14 44 Q6 64 26 66 Q44 66 50 48 Q56 66 74 66 Q94 64 86 44 Q70 34 50 40 Z" fill="${f || s}" ${S(s, 2)}/>`,
};

// Groups for the picker (label → piece ids).
export const ART_GROUPS: { label: string; items: string[] }[] = [
  { label: "Eyes", items: ["eye_open", "eye_happy", "eye_sad", "eye_angry", "eye_wink", "eye_wide", "eye_star", "eye_heart"] },
  { label: "Brows", items: ["brow_flat", "brow_angry", "brow_sad", "brow_raised"] },
  { label: "Noses", items: ["nose_button", "nose_long", "nose_wide", "clown_nose"] },
  { label: "Mouths", items: ["mouth_smile", "mouth_frown", "mouth_neutral", "mouth_open", "mouth_grin", "lips", "tongue_out"] },
  { label: "Details", items: ["ear", "lashes", "moustache", "tear", "scar", "freckles"] },
];

export function artPiece(id: string | undefined, stroke: string, fill: string | null): string {
  const p = ART[id ?? ""] ?? ART.eye_open;
  return p(stroke || "#0f172a", fill ?? null);
}
