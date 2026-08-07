import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getFacilitator } from "@/lib/viewer";
import { isCourseFacilitator } from "@/lib/facilitators";
import { query } from "@/lib/db";

interface DeckRow {
  id: string;
  title: string;
  blob_url: string;
  page_count: number;
}

// List a course's slide decks (for the deck-picker in slide-tool authoring).
export async function GET(
  req: Request,
  ctx: { params: Promise<{ cid: string }> }
) {
  const { cid } = await ctx.params;
  const facilitator = await getFacilitator();
  if (!facilitator || !(await isCourseFacilitator(cid, facilitator.id))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const res = await query<DeckRow>(
    `SELECT id, title, blob_url, page_count FROM course_decks
     WHERE course_id = $1 ORDER BY position ASC, created_at ASC`,
    [cid]
  );
  return NextResponse.json({
    decks: res.rows.map((d) => ({
      id: d.id,
      title: d.title,
      url: d.blob_url,
      pageCount: d.page_count,
    })),
  });
}

// Register a deck after its PDF has been uploaded to Blob (title, blobUrl,
// pageCount). The upload itself goes through …/decks/upload.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ cid: string }> }
) {
  const { cid } = await ctx.params;
  const facilitator = await getFacilitator();
  if (!facilitator || !(await isCourseFacilitator(cid, facilitator.id))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const blobUrl = typeof body?.blobUrl === "string" ? body.blobUrl : "";
  const pageCount =
    typeof body?.pageCount === "number" && body.pageCount > 0
      ? Math.floor(body.pageCount)
      : 0;
  if (!title || !/^https:\/\//.test(blobUrl)) {
    return NextResponse.json(
      { error: "A title and uploaded PDF are required" },
      { status: 400 }
    );
  }
  const pos = await query<{ next: number }>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM course_decks WHERE course_id = $1`,
    [cid]
  );
  const id = randomUUID();
  await query(
    `INSERT INTO course_decks (id, course_id, title, blob_url, page_count, uploaded_by_email, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, cid, title.slice(0, 200), blobUrl, pageCount, facilitator.email ?? null, pos.rows[0].next]
  );
  return NextResponse.json({ id });
}
