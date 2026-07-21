import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import { getAuthorizedSession } from "@/lib/sessions";

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
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const content = typeof body?.content === "string" ? body.content : "";
  if (!title) {
    return NextResponse.json({ error: "Step title is required" }, { status: 400 });
  }
  const res = await query<{ next: number }>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM steps WHERE session_id = $1`,
    [id]
  );
  const stepId = randomUUID();
  await query(
    `INSERT INTO steps (id, session_id, position, title, kind, content)
     VALUES ($1, $2, $3, $4, 'markdown', $5)`,
    [stepId, id, res.rows[0].next, title.slice(0, 200), content]
  );
  return NextResponse.json({ id: stepId });
}
