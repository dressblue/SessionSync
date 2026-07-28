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

// The 5 anchor words for each response scale, low → high. Keep these keys
// stable — saved tools/activities reference a scale by its key.
export const LIKERT_ANCHOR_SETS: Record<string, string[]> = {
  agreement: [
    "Strongly Disagree",
    "Disagree",
    "Neither Agree nor Disagree",
    "Agree",
    "Strongly Agree",
  ],
  frequency: ["Never", "Rarely", "Sometimes", "Often", "Always"],
  satisfaction: [
    "Very Dissatisfied",
    "Dissatisfied",
    "Neutral",
    "Satisfied",
    "Very Satisfied",
  ],
  quality: ["Very Poor", "Poor", "Fair", "Good", "Excellent"],
  likelihood: [
    "Very Unlikely",
    "Unlikely",
    "Neutral",
    "Likely",
    "Very Likely",
  ],
  importance: [
    "Not at all Important",
    "Slightly Important",
    "Moderately Important",
    "Very Important",
    "Extremely Important",
  ],
  approval: [
    "Strongly Disapprove",
    "Disapprove",
    "Neutral",
    "Approve",
    "Strongly Approve",
  ],
  difficulty: ["Very Difficult", "Difficult", "Neutral", "Easy", "Very Easy"],
  familiarity: [
    "Not at all Familiar",
    "Slightly Familiar",
    "Somewhat Familiar",
    "Very Familiar",
    "Extremely Familiar",
  ],
  concern: [
    "Not at all Concerned",
    "Slightly Concerned",
    "Somewhat Concerned",
    "Very Concerned",
    "Extremely Concerned",
  ],
  numeric: ["1", "2", "3", "4", "5"],
};

// Display name for each scale (dropdown option prefix).
const LIKERT_ANCHOR_TITLES: Record<string, string> = {
  agreement: "Agreement",
  frequency: "Frequency",
  satisfaction: "Satisfaction",
  quality: "Quality",
  likelihood: "Likelihood",
  importance: "Importance",
  approval: "Approval",
  difficulty: "Difficulty",
  familiarity: "Familiarity",
  concern: "Concern",
  numeric: "Numeric",
};

// The pick-list label for each scale, showing its first and last anchor so the
// facilitator can interpret the scale — e.g. "Frequency (Never → Always)".
export const LIKERT_ANCHOR_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(LIKERT_ANCHOR_SETS).map(([key, anchors]) => {
    const title = LIKERT_ANCHOR_TITLES[key] ?? key;
    if (key === "numeric") return [key, "Numeric (1–5)"];
    return [key, `${title} (${anchors[0]} → ${anchors[anchors.length - 1]})`];
  })
);

export function anchorLabels(set?: string): string[] {
  return LIKERT_ANCHOR_SETS[set ?? "agreement"] ?? LIKERT_ANCHOR_SETS.agreement;
}
