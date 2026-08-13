// Hand-drawn SVG "art pieces" for the Build tool — expressive face constructors
// meant to build the full spectrum of emotions on the Mood Meter (the four
// quadrants of high/low energy × unpleasant/pleasant feeling: enraged, anxious,
// excited, joyful, sad, tired, calm, serene…). Mix an eye + brow + nose + mouth
// (+ marks like tears / anger veins) to make any expression.
//
// Each generator draws in a 0..100 unit box; elementToSvg renders it inside a
// nested <svg viewBox="0 0 100 100"> scaled to the element's box, so pieces
// stretch to fit and stay crisp. s = ink/stroke colour, f = fill (element fill
// or a per-piece default).

const S = (s: string, w = 5) =>
  `stroke="${s}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="none" vector-effect="non-scaling-stroke"`;

type Piece = (s: string, f: string | null) => string;

export const ART: Record<string, Piece> = {
  // ---------- Eyes (place two) ----------
  eye_neutral: (s, f) =>
    `<path d="M8 50 Q50 28 92 50 Q50 72 8 50 Z" fill="${f || "#ffffff"}" ${S(s)}/><circle cx="50" cy="50" r="13" fill="${s}"/><circle cx="45" cy="45" r="4" fill="#ffffff"/>`,
  eye_happy: (s) => `<path d="M10 60 Q50 30 90 60" ${S(s, 7)}/>`,
  eye_joyful: (s, f) =>
    `<path d="M10 62 Q50 32 90 62" ${S(s, 7)}/><path d="M72 26 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3 z" fill="${f || "#fbbf24"}"/>`,
  eye_content: (s, f) =>
    `<path d="M12 52 Q50 34 88 52 Q50 64 12 52 Z" fill="${f || "#ffffff"}" ${S(s)}/><circle cx="50" cy="50" r="10" fill="${s}"/>`,
  eye_sad: (s, f) =>
    `<path d="M8 44 Q50 32 92 52" ${S(s, 6)}/><path d="M12 48 Q50 70 90 56" ${S(s, 4)}/><circle cx="46" cy="54" r="9" fill="${s}"/>`,
  eye_teary: (s, f) =>
    `<path d="M8 50 Q50 30 92 50 Q50 70 8 50 Z" fill="${f || "#ffffff"}" ${S(s)}/><circle cx="50" cy="50" r="12" fill="${s}"/><path d="M40 66 q-4 12 0 22 a7 7 0 0 0 14 0 q3 -10 0 -22 z" fill="#38bdf8" ${S(s, 2)}/>`,
  eye_angry: (s, f) =>
    `<path d="M6 40 L94 56 Q50 66 6 58 Z" fill="${f || "#ffffff"}" ${S(s)}/><circle cx="58" cy="54" r="11" fill="${s}"/>`,
  eye_furious: (s) =>
    `<path d="M8 46 L92 58" ${S(s, 8)}/><path d="M14 60 Q50 52 86 62" ${S(s, 5)}/>`,
  eye_fear: (s, f) =>
    `<circle cx="50" cy="50" r="35" fill="${f || "#ffffff"}" ${S(s)}/><circle cx="50" cy="52" r="9" fill="${s}"/>`,
  eye_surprised: (s, f) =>
    `<circle cx="50" cy="50" r="33" fill="${f || "#ffffff"}" ${S(s)}/><circle cx="50" cy="50" r="7" fill="${s}"/>`,
  eye_tired: (s, f) =>
    `<path d="M8 50 Q50 30 92 50" ${S(s, 6)}/><path d="M12 52 A42 42 0 0 0 88 52" fill="${f || "#ffffff"}" ${S(s, 4)}/><circle cx="50" cy="56" r="9" fill="${s}"/>`,
  eye_sleepy: (s) =>
    `<path d="M10 54 Q50 46 90 54" ${S(s, 6)}/><path d="M24 56 l-6 11" ${S(s, 4)}/><path d="M50 57 l0 12" ${S(s, 4)}/><path d="M76 56 l6 11" ${S(s, 4)}/>`,
  eye_worried: (s, f) =>
    `<path d="M8 56 Q50 40 92 50 Q50 66 8 56 Z" fill="${f || "#ffffff"}" ${S(s)}/><circle cx="52" cy="52" r="9" fill="${s}"/>`,
  eye_wink: (s) => `<path d="M12 54 Q50 34 88 54" ${S(s, 8)}/>`,
  eye_side: (s, f) =>
    `<ellipse cx="50" cy="50" rx="40" ry="24" fill="${f || "#ffffff"}" ${S(s)}/><circle cx="72" cy="50" r="12" fill="${s}"/>`,

  // ---------- Brows (place two) ----------
  brow_neutral: (s) => `<path d="M12 54 Q50 40 88 54" ${S(s, 10)}/>`,
  brow_raised: (s) => `<path d="M12 56 Q50 28 88 56" ${S(s, 10)}/>`,
  brow_surprise: (s) => `<path d="M14 50 Q50 20 86 50" ${S(s, 10)}/>`,
  brow_angry: (s) => `<path d="M14 40 L86 60" ${S(s, 12)}/>`,
  brow_furrowed: (s) => `<path d="M14 44 Q42 58 86 58" ${S(s, 12)}/>`,
  brow_sad: (s) => `<path d="M14 60 L86 40" ${S(s, 12)}/>`,
  brow_flat: (s) => `<path d="M14 50 L86 50" ${S(s, 12)}/>`,
  brow_skeptical: (s) => `<path d="M12 56 Q40 34 62 40 Q78 44 88 44" ${S(s, 10)}/>`,

  // ---------- Noses ----------
  nose_button: (s) =>
    `<path d="M50 24 C46 48 40 60 36 66 Q50 76 64 66 C60 60 54 48 50 24" ${S(s)}/>`,
  nose_long: (s) => `<path d="M54 18 C48 48 42 62 40 72 Q54 80 62 68" ${S(s)}/>`,
  nose_wide: (s) =>
    `<path d="M50 26 C48 50 42 60 34 66 Q50 78 66 66 C58 60 52 50 50 26" ${S(s)}/><circle cx="36" cy="66" r="4" fill="${s}"/><circle cx="64" cy="66" r="4" fill="${s}"/>`,
  nose_up: (s) =>
    `<path d="M52 22 C50 46 46 58 40 64 Q50 74 62 66" ${S(s)}/><path d="M40 64 q-4 4 -8 2" ${S(s, 3)}/>`,

  // ---------- Mouths ----------
  mouth_smile: (s) => `<path d="M16 46 Q50 82 84 46" ${S(s, 9)}/>`,
  mouth_grin: (s, f) =>
    `<path d="M14 44 Q50 56 86 44 Q72 88 50 88 Q28 88 14 44 Z" fill="${f || "#b91c1c"}" ${S(s, 5)}/><path d="M18 50 Q50 60 82 50" stroke="#ffffff" stroke-width="8" fill="none" vector-effect="non-scaling-stroke"/>`,
  mouth_slight: (s) => `<path d="M28 54 Q50 66 72 54" ${S(s, 8)}/>`,
  mouth_neutral: (s) => `<path d="M22 54 L78 54" ${S(s, 9)}/>`,
  mouth_frown: (s) => `<path d="M16 72 Q50 40 84 72" ${S(s, 9)}/>`,
  mouth_deep_frown: (s) => `<path d="M12 78 Q50 30 88 78" ${S(s, 10)}/>`,
  mouth_open_o: (s, f) =>
    `<ellipse cx="50" cy="54" rx="20" ry="26" fill="${f || "#7f1d1d"}" ${S(s, 5)}/>`,
  mouth_shout: (s, f) =>
    `<path d="M18 42 Q50 34 82 42 L82 66 Q50 82 18 66 Z" fill="${f || "#7f1d1d"}" ${S(s, 5)}/><path d="M20 48 H80 M20 60 H80" stroke="#ffffff" stroke-width="5" fill="none" vector-effect="non-scaling-stroke"/>`,
  mouth_gasp: (s, f) =>
    `<circle cx="50" cy="56" r="15" fill="${f || "#7f1d1d"}" ${S(s, 4)}/>`,
  mouth_gritted: (s, f) =>
    `<rect x="18" y="44" width="64" height="22" rx="4" fill="${f || "#ffffff"}" ${S(s, 4)}/><path d="M32 44 V66 M50 44 V66 M68 44 V66 M18 55 H82" ${S(s, 3)}/>`,
  mouth_smirk: (s) => `<path d="M22 58 Q46 64 62 52 Q70 46 80 44" ${S(s, 8)}/>`,
  mouth_pout: (s, f) =>
    `<path d="M34 50 Q50 44 66 50 Q60 66 50 66 Q40 66 34 50 Z" fill="${f || "#e11d48"}" ${S(s, 3)}/>`,
  mouth_wail: (s, f) =>
    `<path d="M18 46 Q50 40 82 46 Q78 88 50 92 Q22 88 18 46 Z" fill="${f || "#7f1d1d"}" ${S(s, 5)}/><path d="M18 52 Q50 60 82 52" stroke="#ffffff" stroke-width="6" fill="none" vector-effect="non-scaling-stroke"/>`,
  mouth_calm: (s) => `<path d="M24 54 Q50 62 76 54" ${S(s, 7)}/>`,
  lips: (s, f) =>
    `<path d="M12 52 Q30 38 50 48 Q70 38 88 52 Q70 68 50 58 Q30 68 12 52 Z" fill="${f || "#e11d48"}" ${S(s, 3)}/>`,
  tongue: (s, f) =>
    `<path d="M18 42 Q50 54 82 42 Q72 74 50 74 Q28 74 18 42 Z" fill="${f || "#b91c1c"}" ${S(s, 5)}/><path d="M40 66 Q50 92 60 66 Q50 60 40 66 Z" fill="#fb7185" ${S(s, 3)}/>`,

  // ---------- Emotion marks ----------
  tear: (s, f) =>
    `<path d="M50 16 C50 16 28 54 28 70 A22 22 0 1 0 72 70 C72 54 50 16 50 16 Z" fill="${f || "#38bdf8"}" ${S(s, 3)}/><path d="M42 60 A12 12 0 0 0 40 74" stroke="#ffffff" stroke-width="4" fill="none" vector-effect="non-scaling-stroke"/>`,
  tears: (s, f) => {
    const c = f || "#38bdf8";
    return `<path d="M28 14 C28 14 16 42 16 54 A14 14 0 1 0 44 54 C44 42 28 14 28 14 Z" fill="${c}" ${S(s, 2)}/><path d="M72 14 C72 14 60 42 60 54 A14 14 0 1 0 88 54 C88 42 72 14 72 14 Z" fill="${c}" ${S(s, 2)}/>`;
  },
  sweat: (s, f) =>
    `<path d="M50 20 C50 20 32 52 32 66 A18 18 0 1 0 68 66 C68 52 50 20 50 20 Z" fill="${f || "#7dd3fc"}" ${S(s, 2)}/>`,
  blush: (s, f) => {
    const c = f || "#fb7185";
    return `<ellipse cx="26" cy="52" rx="18" ry="10" fill="${c}" opacity="0.6"/><ellipse cx="74" cy="52" rx="18" ry="10" fill="${c}" opacity="0.6"/>`;
  },
  anger: (s) => {
    const c = s || "#ef4444";
    return `<path d="M40 22 L62 22 M51 22 L51 44 M34 40 L66 40 M42 40 L36 60 M60 40 L66 60" stroke="${c}" stroke-width="6" stroke-linecap="round" fill="none" vector-effect="non-scaling-stroke"/>`;
  },
  sleepy: (s) =>
    `<text x="24" y="46" font-family="ui-sans-serif,system-ui,sans-serif" font-size="30" font-weight="700" fill="${s}">z</text><text x="50" y="34" font-family="ui-sans-serif,system-ui,sans-serif" font-size="22" font-weight="700" fill="${s}">z</text><text x="70" y="24" font-family="ui-sans-serif,system-ui,sans-serif" font-size="15" font-weight="700" fill="${s}">z</text>`,
  sparkle: (s, f) =>
    `<path d="M50 8 L58 42 L92 50 L58 58 L50 92 L42 58 L8 50 L42 42 Z" fill="${f || "#fbbf24"}" ${S(s, 2)}/>`,
  freckles: (s, f) => {
    const c = f || "#c2673f";
    return `<circle cx="30" cy="40" r="6" fill="${c}"/><circle cx="70" cy="40" r="6" fill="${c}"/><circle cx="24" cy="60" r="5" fill="${c}"/><circle cx="50" cy="66" r="5" fill="${c}"/><circle cx="76" cy="60" r="5" fill="${c}"/>`;
  },
};

// Groups for the picker — ordered head-to-toe so mixing an expression is easy.
export const ART_GROUPS: { label: string; items: string[] }[] = [
  { label: "Eyes", items: ["eye_neutral", "eye_happy", "eye_joyful", "eye_content", "eye_sad", "eye_teary", "eye_worried", "eye_angry", "eye_furious", "eye_fear", "eye_surprised", "eye_tired", "eye_sleepy", "eye_side", "eye_wink"] },
  { label: "Brows", items: ["brow_neutral", "brow_raised", "brow_surprise", "brow_angry", "brow_furrowed", "brow_sad", "brow_flat", "brow_skeptical"] },
  { label: "Noses", items: ["nose_button", "nose_long", "nose_wide", "nose_up"] },
  { label: "Mouths", items: ["mouth_smile", "mouth_grin", "mouth_slight", "mouth_calm", "mouth_neutral", "mouth_smirk", "mouth_frown", "mouth_deep_frown", "mouth_pout", "mouth_open_o", "mouth_gasp", "mouth_shout", "mouth_gritted", "mouth_wail", "lips", "tongue"] },
  { label: "Feeling marks", items: ["tear", "tears", "sweat", "blush", "anger", "sleepy", "sparkle", "freckles"] },
];

export function artPiece(id: string | undefined, stroke: string, fill: string | null): string {
  const p = ART[id ?? ""] ?? ART.eye_neutral;
  return p(stroke || "#0f172a", fill ?? null);
}
