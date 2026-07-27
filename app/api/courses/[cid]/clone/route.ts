import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/viewer";
import { deepCopyCourse } from "@/lib/sessions";

// Clone a course. Admin-only.
//   mode "template" — snapshot this course's structure into a reusable template.
//   mode "cohort"   — instantiate a dated cohort FROM a template (source must be
//                     a template). Owner defaults to the admin, or an ownerEmail
//                     (find-or-created so they inherit the course on Clerk sign-in).
export async function POST(
  req: Request,
  ctx: { params: Promise<{ cid: string }> }
) {
  const { cid } = await ctx.params;
  const admin = await requireAdmin();
  if (!admin) {
    // 404 (not 403) so non-admins can't probe the endpoint.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const src = await query<{ is_template: boolean }>(
    `SELECT is_template FROM courses WHERE id = $1`,
    [cid]
  );
  if (!src.rows[0]) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const mode =
    body?.mode === "cohort"
      ? "cohort"
      : body?.mode === "template"
        ? "template"
        : null;
  if (!mode) {
    return NextResponse.json(
      { error: "mode must be 'template' or 'cohort'" },
      { status: 400 }
    );
  }
  const title =
    typeof body?.title === "string" && body.title.trim()
      ? body.title.trim()
      : undefined;

  if (mode === "template") {
    const res = await deepCopyCourse(cid, {
      isTemplate: true,
      title,
      ownerFacilitatorId: admin.id,
    });
    return NextResponse.json({ ok: true, ...res });
  }

  // cohort — source must be a template
  if (!src.rows[0].is_template) {
    return NextResponse.json(
      { error: "Cohorts can only be created from a template" },
      { status: 400 }
    );
  }
  const startsAt =
    typeof body?.startsAt === "string" && body.startsAt ? body.startsAt : null;
  const endsAt =
    typeof body?.endsAt === "string" && body.endsAt ? body.endsAt : null;
  const cohortLabel =
    typeof body?.cohortLabel === "string" ? body.cohortLabel : "";

  // Resolve the cohort owner (default: the admin). An ownerEmail is find-or-created.
  let ownerFacilitatorId = admin.id;
  const ownerEmail =
    typeof body?.ownerEmail === "string" ? body.ownerEmail.trim().toLowerCase() : "";
  if (ownerEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
      return NextResponse.json({ error: "Invalid owner email" }, { status: 400 });
    }
    const existing = await query<{ id: string }>(
      `SELECT id FROM facilitators WHERE lower(email) = $1 LIMIT 1`,
      [ownerEmail]
    );
    ownerFacilitatorId = existing.rows[0]?.id ?? randomUUID();
    if (!existing.rows[0]) {
      await query(
        `INSERT INTO facilitators (id, name, email) VALUES ($1, $2, $3)`,
        [ownerFacilitatorId, ownerEmail, ownerEmail]
      );
    }
  }

  const res = await deepCopyCourse(cid, {
    isTemplate: false,
    title,
    startsAt,
    endsAt,
    cohortLabel,
    ownerFacilitatorId,
  });
  return NextResponse.json({ ok: true, ...res });
}
