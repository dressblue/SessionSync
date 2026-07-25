import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// Download a course file. Access control is the unguessable UUID, consistent
// with the platform's interim auth posture; bytes stream with the original
// filename so PDFs/checklists save naturally.
export async function GET(
  req: Request,
  ctx: { params: Promise<{ fid: string }> }
) {
  const { fid } = await ctx.params;
  const res = await query<{
    filename: string;
    mime: string;
    data: Uint8Array;
  }>(`SELECT filename, mime, data FROM course_files WHERE id = $1`, [fid]);
  const file = res.rows[0];
  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  // ?inline=1 renders in the browser (images/PDFs shown as exhibits);
  // default stays a download with the original filename.
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  const bytes = new Uint8Array(file.data);
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${file.filename.replace(/[^\w.\- ]/g, "_")}"`,
      "Cache-Control": "private, max-age=0",
    },
  });
}
