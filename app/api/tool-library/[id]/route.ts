import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/viewer";

const str = (v: unknown, max = 2000) =>
  (typeof v === "string" ? v : "").slice(0, max);

type Ctx = { params: Promise<{ id: string }> };

// Edit a library tool's metadata (and optionally its prompt/config). Admin-only.
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const existing = await query<{ id: string }>(
    `SELECT id FROM tool_templates WHERE id = $1`,
    [id]
  );
  if (!existing.rows[0]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Only update fields that were supplied.
  const sets: string[] = [];
  const vals: unknown[] = [];
  const add = (col: string, val: unknown) => {
    sets.push(`${col} = $${sets.length + 1}`);
    vals.push(val);
  };
  if (typeof body?.name === "string") add("name", str(body.name, 160).trim());
  if (typeof body?.description === "string")
    add("description", str(body.description, 1000));
  if (typeof body?.category === "string")
    add("category", str(body.category, 80).trim());
  if (typeof body?.prompt === "string") add("prompt", str(body.prompt, 300));
  if (body?.config !== undefined)
    add(
      "config",
      typeof body.config === "string"
        ? body.config
        : JSON.stringify(body.config ?? {})
    );
  if (sets.length === 0) {
    return NextResponse.json({ ok: true });
  }
  sets.push(`updated_at = now()`);
  vals.push(id);
  await query(
    `UPDATE tool_templates SET ${sets.join(", ")} WHERE id = $${vals.length}`,
    vals
  );
  return NextResponse.json({ ok: true });
}

// Remove a library tool. Admin-only.
export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await query(`DELETE FROM tool_templates WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
