import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/viewer";
import { sendEmail, emailConfigured } from "@/lib/email";

const APP_BASE_URL =
  (process.env.APP_BASE_URL ?? "").replace(/\/$/, "") ||
  "https://sessionsync-three.vercel.app";

// Email students their durable personal link via Resend. Admin-only.
// Body { sid } sends to one; body {} sends to every roster student that has an
// email. Students without an email are skipped.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ cid: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!emailConfigured()) {
    return NextResponse.json(
      { error: "Email isn't configured — set RESEND_API_KEY." },
      { status: 400 }
    );
  }
  const { cid } = await ctx.params;
  const course = await query<{ title: string }>(
    `SELECT title FROM courses WHERE id = $1`,
    [cid]
  );
  if (!course.rows[0]) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const sid = typeof body?.sid === "string" ? body.sid : "";

  const roster = await query<{
    id: string;
    name: string;
    email: string | null;
    token: string;
  }>(
    sid
      ? `SELECT id, name, email, token FROM course_students WHERE course_id = $1 AND id = $2`
      : `SELECT id, name, email, token FROM course_students WHERE course_id = $1`,
    sid ? [cid, sid] : [cid]
  );
  const targets = roster.rows.filter((s) => s.email);

  let sent = 0;
  const failed: { name: string; error: string }[] = [];
  for (const s of targets) {
    const link = `${APP_BASE_URL}/join/s/${s.token}`;
    const r = await sendEmail({
      to: s.email as string,
      subject: `Your link to join ${course.rows[0].title}`,
      text: `Hi ${s.name},\n\nHere's your personal link to join the class. It works every week — just open it when class starts:\n\n${link}\n\nSee you there!`,
      html: `<p>Hi ${s.name},</p><p>Here's your personal link to join the class. It works every week — just open it when class starts:</p><p><a href="${link}">${link}</a></p><p>See you there!</p>`,
    });
    if (r.ok) sent++;
    else failed.push({ name: s.name, error: r.error ?? "send failed" });
  }
  return NextResponse.json({
    sent,
    failed,
    skipped: roster.rows.length - targets.length,
  });
}
