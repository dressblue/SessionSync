import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/sessions";

// Personal notes, keyed by participant. The participant id acts as the
// access token; notes are only ever shown back to their author.

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const participantId = new URL(req.url).searchParams.get("participantId");
  if (!participantId) {
    return NextResponse.json({ error: "participantId required" }, { status: 400 });
  }
  const res = await query<{ content: string; updated_at: string }>(
    `SELECT content, updated_at FROM notes WHERE session_id = $1 AND participant_id = $2`,
    [id, participantId]
  );
  return NextResponse.json({
    content: res.rows[0]?.content ?? "",
    updatedAt: res.rows[0]?.updated_at ?? null,
  });
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const participantId =
    typeof body?.participantId === "string" ? body.participantId : "";
  let content = typeof body?.content === "string" ? body.content : "";
  if (!participantId) {
    return NextResponse.json({ error: "participantId required" }, { status: 400 });
  }
  // Notes are self-authored HTML rendered only back to the author; still,
  // strip script blocks and cap the size.
  content = content
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .slice(0, 200_000);
  await query(
    `INSERT INTO notes (session_id, participant_id, content, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (session_id, participant_id)
     DO UPDATE SET content = EXCLUDED.content, updated_at = now()`,
    [id, participantId, content]
  );
  return NextResponse.json({ ok: true });
}
