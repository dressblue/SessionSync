import { NextResponse } from "next/server";
import { randomUUID, randomBytes } from "crypto";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/viewer";

type Ctx = { params: Promise<{ cid: string }> };

// The course roster. Admin-only. Each student carries a stable token that backs
// their durable personal join link.
export async function GET(req: Request, ctx: Ctx) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { cid } = await ctx.params;
  const res = await query<{
    id: string;
    name: string;
    email: string | null;
    token: string;
  }>(
    `SELECT id, name, email, token FROM course_students
       WHERE course_id = $1 ORDER BY name ASC`,
    [cid]
  );
  return NextResponse.json({ students: res.rows });
}

// Bulk-add students from "Name, email" lines (email optional). Admin-only.
export async function POST(req: Request, ctx: Ctx) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { cid } = await ctx.params;
  const course = await query<{ id: string }>(
    `SELECT id FROM courses WHERE id = $1`,
    [cid]
  );
  if (!course.rows[0]) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text : "";
  const rows = text
    .split("\n")
    .map((line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return null;
      const comma = trimmed.indexOf(",");
      const name = (comma >= 0 ? trimmed.slice(0, comma) : trimmed).trim();
      const email = comma >= 0 ? trimmed.slice(comma + 1).trim() : "";
      if (!name) return null;
      return { name: name.slice(0, 80), email: email.slice(0, 160) || null };
    })
    .filter((r: unknown): r is { name: string; email: string | null } => !!r)
    .slice(0, 200);
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "Add at least one name (one per line, optional \"Name, email\")" },
      { status: 400 }
    );
  }
  for (const r of rows) {
    await query(
      `INSERT INTO course_students (id, course_id, name, email, token)
         VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), cid, r.name, r.email, randomBytes(16).toString("base64url")]
    );
  }
  return NextResponse.json({ ok: true, added: rows.length });
}
