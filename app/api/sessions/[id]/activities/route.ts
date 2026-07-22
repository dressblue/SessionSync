import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import { authorizeSession } from "@/lib/sessions";

const cleanList = (v: unknown, max: number): string[] =>
  Array.isArray(v)
    ? v
        .map((o: unknown) => (typeof o === "string" ? o.trim() : ""))
        .filter(Boolean)
        .slice(0, max)
    : [];

// Facilitator pushes a new activity. Any open activity is closed first —
// one activity is live at a time.
//
// Kinds:
//  vote    — population survey (pick one, live head-count)
//  likert  — scoring survey (rate each item 1..scale, live averages)
//  columns — moderated comment board (1–4 titled columns)
// vote and likert accept sourcing: "participants" — options/items are
// collected from the group first (phase "collect"), then the facilitator
// advances to the voting/rating phase.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const session = await authorizeSession(req, id);
  if (!session) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const kind = body?.kind;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const sourced = body?.sourcing === "participants";
  if (!prompt) {
    return NextResponse.json({ error: "A prompt is required" }, { status: 400 });
  }

  let config: Record<string, unknown>;
  if (kind === "vote") {
    if (sourced) {
      config = { phase: "collect" };
    } else {
      const options = cleanList(body?.options, 8);
      if (options.length < 2) {
        return NextResponse.json(
          { error: "A vote needs at least two options" },
          { status: 400 }
        );
      }
      config = { options };
    }
  } else if (kind === "likert") {
    const scale = 5;
    if (sourced) {
      config = { phase: "collect", scale };
    } else {
      const items = cleanList(body?.items, 12);
      if (items.length < 1) {
        return NextResponse.json(
          { error: "A scoring survey needs at least one item" },
          { status: 400 }
        );
      }
      config = { items, scale };
    }
  } else if (kind === "columns") {
    const columns = cleanList(body?.columns, 4);
    if (columns.length < 1) {
      return NextResponse.json(
        { error: "Column feedback needs at least one titled column" },
        { status: 400 }
      );
    }
    config = { columns };
  } else if (kind === "reveal" || kind === "wheel") {
    // Items arrive as "Title | optional note" lines.
    const richItems = cleanList(body?.items, 12).map((line) => {
      const [title, ...rest] = line.split("|");
      return { title: title.trim().slice(0, 120), note: rest.join("|").trim().slice(0, 300) };
    });
    if (richItems.length < (kind === "wheel" ? 3 : 1)) {
      return NextResponse.json(
        {
          error:
            kind === "wheel"
              ? "A wheel needs at least three items"
              : "A reveal needs at least one item",
        },
        { status: 400 }
      );
    }
    config =
      kind === "reveal" ? { richItems, revealed: 0 } : { richItems, active: -1 };
  } else if (kind === "whiteboard") {
    config = {};
  } else {
    return NextResponse.json({ error: "Unknown activity kind" }, { status: 400 });
  }

  await query(
    `UPDATE activities SET status = 'closed' WHERE session_id = $1 AND status = 'open'`,
    [id]
  );
  const activityId = randomUUID();
  await query(
    `INSERT INTO activities (id, session_id, kind, prompt, config)
     VALUES ($1, $2, $3, $4, $5)`,
    [activityId, id, kind, prompt.slice(0, 300), JSON.stringify(config)]
  );
  await query(`UPDATE sessions SET active_activity = $1 WHERE id = $2`, [
    activityId,
    id,
  ]);
  return NextResponse.json({ id: activityId });
}
