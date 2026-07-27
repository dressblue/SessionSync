import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/viewer";

type Ctx = { params: Promise<{ fid: string }> };

async function adminCount(): Promise<number> {
  const r = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM facilitators WHERE is_admin = true`
  );
  return r.rows[0]?.n ?? 0;
}

// Toggle a facilitator's global admin flag. Admin-only. Can't drop your own
// admin, and can't remove the last admin.
export async function PATCH(req: Request, ctx: Ctx) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { fid } = await ctx.params;
  const body = await req.json().catch(() => null);
  const isAdmin = body?.isAdmin === true;
  if (!isAdmin) {
    if (fid === me.id) {
      return NextResponse.json(
        { error: "You can't remove your own admin" },
        { status: 400 }
      );
    }
    if ((await adminCount()) <= 1) {
      return NextResponse.json(
        { error: "There must be at least one admin" },
        { status: 400 }
      );
    }
  }
  await query(`UPDATE facilitators SET is_admin = $1 WHERE id = $2`, [
    isAdmin,
    fid,
  ]);
  return NextResponse.json({ ok: true });
}

// Remove a facilitator entirely (cascades their course memberships). Admin-only.
// Can't remove yourself or the last admin. An ownerless course is still fully
// manageable by admins, so orphaning ownership is acceptable here.
export async function DELETE(req: Request, ctx: Ctx) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { fid } = await ctx.params;
  if (fid === me.id) {
    return NextResponse.json(
      { error: "You can't remove yourself" },
      { status: 400 }
    );
  }
  const target = await query<{ is_admin: boolean }>(
    `SELECT is_admin FROM facilitators WHERE id = $1`,
    [fid]
  );
  if (target.rows[0]?.is_admin && (await adminCount()) <= 1) {
    return NextResponse.json(
      { error: "There must be at least one admin" },
      { status: 400 }
    );
  }
  await query(`DELETE FROM facilitators WHERE id = $1`, [fid]);
  return NextResponse.json({ ok: true });
}
