// Shared Likert presentation constants — used by the server (label derivation)
// and the client (diverging bar chart). Colors match the classic 5-point
// diverging survey chart: navy → dark red → gold → orange → green.

export const LIKERT_COLORS = [
  "#21447a", // 1 strongly negative
  "#8c1c1c", // 2 negative
  "#edc02e", // 3 neutral
  "#e06e2c", // 4 positive
  "#57a64a", // 5 strongly positive
];

export const LIKERT_ANCHOR_SETS: Record<string, string[]> = {
  agreement: [
    "Strongly disagree",
    "Generally disagree",
    "Neutral",
    "Generally agree",
    "Strongly agree",
  ],
  satisfaction: [
    "Very dissatisfied",
    "Dissatisfied",
    "Neutral",
    "Satisfied",
    "Very satisfied",
  ],
  frequency: ["Never", "Rarely", "Sometimes", "Often", "Always"],
  quality: ["Poor", "Fair", "Average", "Good", "Excellent"],
  numeric: ["1", "2", "3", "4", "5"],
};

export const LIKERT_ANCHOR_LABELS: Record<string, string> = {
  agreement: "Agreement (disagree → agree)",
  satisfaction: "Satisfaction",
  frequency: "Frequency",
  quality: "Quality",
  numeric: "Numeric (1–5)",
};

export function anchorLabels(set?: string): string[] {
  return LIKERT_ANCHOR_SETS[set ?? "agreement"] ?? LIKERT_ANCHOR_SETS.agreement;
}
