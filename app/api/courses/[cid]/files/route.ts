import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import {
  getFacilitatorFromRequest,
  isCourseFacilitator,
} from "@/lib/facilitators";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

// Upload a downloadable file (multipart form-data: file, title?, sessionId?).
// Bytes live in the database so dev and production behave identically.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ cid: string }> }
) {
  const { cid } = await ctx.params;
  const facilitator = await getFacilitatorFromRequest(req);
  if (!facilitator || !(await isCourseFacilitator(cid, facilitator.id))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) {
    return NextResponse.json({ error: "A file is required" }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "File must be between 1 byte and 15 MB" },
      { status: 400 }
    );
  }
  const titleRaw = form.get("title");
  const title =
    (typeof titleRaw === "string" && titleRaw.trim()) || file.name;
  const sessionIdRaw = form.get("sessionId");
  const sessionId =
    typeof sessionIdRaw === "string" && sessionIdRaw ? sessionIdRaw : null;
  if (sessionId) {
    const s = await query<{ id: string }>(
      `SELECT id FROM sessions WHERE id = $1 AND course_id = $2`,
      [sessionId, cid]
    );
    if (!s.rows[0]) {
      return NextResponse.json({ error: "Session not in course" }, { status: 400 });
    }
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pos = await query<{ next: number }>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM course_files WHERE course_id = $1`,
    [cid]
  );
  const id = randomUUID();
  await query(
    `INSERT INTO course_files (id, course_id, session_id, title, filename, mime, size, data, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      cid,
      sessionId,
      title.slice(0, 200),
      file.name.slice(0, 255),
      file.type || "application/octet-stream",
      file.size,
      bytes,
      pos.rows[0].next,
    ]
  );
  return NextResponse.json({ id });
}
