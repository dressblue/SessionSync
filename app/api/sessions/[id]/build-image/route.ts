import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { put } from "@vercel/blob";
import { query } from "@/lib/db";
import { authorizeSession, getSession } from "@/lib/sessions";

// Accepts a pasted/dropped image (as a base64 data URL) from a participant in a
// session and stores it on the public Blob store, returning a CDN URL the Build
// canvas places as an image element. Kept small (≤5MB, images only) since these
// arrive from participants; the caller must be a live participant or the
// facilitator.
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);

  // Authorize: a live participant of this session, or the facilitator.
  const pid = typeof body?.participantId === "string" ? body.participantId : "";
  let ok = false;
  if (pid) {
    const p = await query<{ id: string }>(
      `SELECT id FROM participants
         WHERE id = $1 AND session_id = $2 AND removed_at IS NULL`,
      [pid, id]
    );
    ok = !!p.rows[0];
  }
  if (!ok) ok = !!(await authorizeSession(req, id));
  if (!ok) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const dataUrl = typeof body?.dataUrl === "string" ? body.dataUrl : "";
  const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) {
    return NextResponse.json({ error: "Expected a base64 image data URL" }, { status: 400 });
  }
  const mime = m[1];
  const buf = Buffer.from(m[2], "base64");
  if (buf.length === 0 || buf.length > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be 1 byte–5MB" }, { status: 400 });
  }
  const ext = (mime.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "").slice(0, 5);

  try {
    const blob = await put(`build/${id}/${randomUUID()}.${ext}`, buf, {
      access: "public",
      contentType: mime,
      addRandomSuffix: true,
    });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
