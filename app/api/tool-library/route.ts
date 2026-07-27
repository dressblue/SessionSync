import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import { getFacilitator, requireAdmin } from "@/lib/viewer";

const VALID_KINDS = [
  "vote",
  "likert",
  "columns",
  "reveal",
  "wheel",
  "workflow",
  "whiteboard",
  "exhibit",
  "video",
  "timer",
  "wordcloud",
];

const str = (v: unknown, max = 2000) =>
  (typeof v === "string" ? v : "").slice(0, max);

// Search the tool library. Any signed-in facilitator may read.
export async function GET(req: Request) {
  const facilitator = await getFacilitator();
  if (!facilitator) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const category = (url.searchParams.get("category") ?? "").trim();
  // Scope: with a courseId, return global (course_id NULL) + that course's items
  // — this is what the facilitator picker sends. With no courseId, return
  // everything (admin management view).
  const courseId = (url.searchParams.get("courseId") ?? "").trim();
  const rows = await query<{
    id: string;
    name: string;
    description: string;
    category: string;
    kind: string;
    prompt: string;
    config: string;
    course_id: string | null;
    course_title: string | null;
  }>(
    `SELECT tt.id, tt.name, tt.description, tt.category, tt.kind, tt.prompt,
            tt.config, tt.course_id, c.title AS course_title
       FROM tool_templates tt
       LEFT JOIN courses c ON c.id = tt.course_id
      WHERE ($1 = '' OR lower(tt.name) LIKE '%' || $1 || '%'
             OR lower(tt.category) LIKE '%' || $1 || '%'
             OR lower(tt.kind) LIKE '%' || $1 || '%')
        AND ($2 = '' OR tt.category = $2)
        AND ($3 = '' OR tt.course_id IS NULL OR tt.course_id::text = $3)
      ORDER BY tt.course_id IS NULL DESC, tt.category ASC, tt.name ASC`,
    [q, category, courseId]
  );
  // Distinct categories for the filter chips.
  const cats = await query<{ category: string }>(
    `SELECT DISTINCT category FROM tool_templates WHERE category <> '' ORDER BY category`
  );
  return NextResponse.json({
    tools: rows.rows.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      kind: t.kind,
      prompt: t.prompt,
      config: t.config,
      courseId: t.course_id,
      courseTitle: t.course_title,
    })),
    categories: cats.rows.map((c) => c.category),
  });
}

// Add a tool to the library. Admin-only. Either supply an inline spec
// { kind, prompt, config } or snapshot an existing step_tool via { fromStepToolId }.
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const name = str(body?.name, 160).trim();
  if (!name) {
    return NextResponse.json({ error: "A name is required" }, { status: 400 });
  }
  const description = str(body?.description, 1000);
  const category = str(body?.category, 80).trim();

  // Optional scope: a real course id, else NULL (global/shared).
  let courseId: string | null = null;
  if (typeof body?.courseId === "string" && body.courseId) {
    const c = await query<{ id: string }>(
      `SELECT id FROM courses WHERE id = $1`,
      [body.courseId]
    );
    if (!c.rows[0]) {
      return NextResponse.json({ error: "Scope course not found" }, { status: 400 });
    }
    courseId = c.rows[0].id;
  }

  let kind = "";
  let prompt = "";
  let config = "{}";
  if (typeof body?.fromStepToolId === "string" && body.fromStepToolId) {
    const t = await query<{ kind: string; prompt: string; config: string }>(
      `SELECT kind, prompt, config FROM step_tools WHERE id = $1`,
      [body.fromStepToolId]
    );
    if (!t.rows[0]) {
      return NextResponse.json({ error: "Source tool not found" }, { status: 404 });
    }
    kind = t.rows[0].kind;
    prompt = t.rows[0].prompt;
    config = t.rows[0].config;
  } else {
    kind = str(body?.kind, 40);
    if (!VALID_KINDS.includes(kind)) {
      return NextResponse.json({ error: "Unknown tool kind" }, { status: 400 });
    }
    prompt = str(body?.prompt, 300);
    config =
      typeof body?.config === "string"
        ? body.config
        : JSON.stringify(body?.config ?? {});
  }

  const id = randomUUID();
  await query(
    `INSERT INTO tool_templates
       (id, name, description, category, kind, prompt, config, created_by, course_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, name, description, category, kind, prompt, config, admin.id, courseId]
  );
  return NextResponse.json({ id });
}
