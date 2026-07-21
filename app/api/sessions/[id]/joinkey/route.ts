import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { makeCode } from "@/lib/facilitators";
import { authorizeSession } from "@/lib/sessions";

// Rotate the session's student key. Keys are random and expire (default and
// maximum 24 hours) so they can't circulate usefully beyond the class window.
// ttlHours: 0 revokes access immediately.
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
  const raw = typeof body?.ttlHours === "number" ? body.ttlHours : 24;
  const ttlHours = Math.min(24, Math.max(0, raw));
  const joinKey = makeCode(6);
  const res = await query<{ join_key_expires: string }>(
    `UPDATE sessions
     SET join_key = $1, join_key_expires = now() + ($2 * interval '1 hour')
     WHERE id = $3
     RETURNING join_key_expires`,
    [joinKey, ttlHours, id]
  );
  return NextResponse.json({
    joinKey,
    expiresAt: res.rows[0].join_key_expires,
  });
}
