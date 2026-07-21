import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import { getAuthorizedSession } from "@/lib/sessions";

// Facilitator pushes a new activity (vote or column feedback). Any open
// activity is closed first — one activity is live at a time.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const session = await getAuthorizedSession(id, req.headers.get("x-facilitator-key"));
  if (!session) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const kind = body?.kind;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json({ error: "A prompt is required" }, { status: 400 });
  }

  let config: Record<string, unknown>;
  if (kind === "vote") {
    const options = Array.isArray(body?.options)
      ? body.options
          .map((o: unknown) => (typeof o === "string" ? o.trim() : ""))
          .filter(Boolean)
          .slice(0, 6)
      : [];
    if (options.length < 2) {
      return NextResponse.json(
        { error: "A vote needs at least two options" },
        { status: 400 }
      );
    }
    config = { options };
  } else if (kind === "columns") {
    const columns = Array.isArray(body?.columns)
      ? body.columns
          .map((c: unknown) => (typeof c === "string" ? c.trim() : ""))
          .filter(Boolean)
          .slice(0, 4)
      : [];
    if (columns.length < 1) {
      return NextResponse.json(
        { error: "Column feedback needs at least one titled column" },
        { status: 400 }
      );
    }
    config = { columns };
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
