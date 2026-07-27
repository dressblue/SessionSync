import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import { cohortAccessError } from "@/lib/sessions";

// A student's durable personal link. Public (the token is the secret). Resolves
// the course's live session (else its first session), reuses-or-creates that
// student's account-free participant seat, and redirects into the session via
// the existing `?p=` resume path — no key, no account.
export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params;
  const student = await query<{
    id: string;
    course_id: string;
    name: string;
  }>(
    `SELECT id, course_id, name FROM course_students WHERE token = $1`,
    [token]
  );
  const s = student.rows[0];
  if (!s) {
    return NextResponse.redirect(new URL("/join?e=badlink", req.url));
  }

  // Cohort access window: block before start / after end (and templates).
  if (await cohortAccessError(s.course_id)) {
    return NextResponse.redirect(new URL("/join?e=closed", req.url));
  }

  // Live session first; otherwise the course's first session (they land in its
  // lobby/holding screen until it starts).
  const target = await query<{ id: string }>(
    `SELECT id FROM sessions
       WHERE course_id = $1 AND status = 'live'
       ORDER BY position ASC LIMIT 1`,
    [s.course_id]
  );
  let sessionId = target.rows[0]?.id;
  if (!sessionId) {
    const first = await query<{ id: string }>(
      `SELECT id FROM sessions WHERE course_id = $1
         ORDER BY position ASC, created_at ASC LIMIT 1`,
      [s.course_id]
    );
    sessionId = first.rows[0]?.id;
  }
  if (!sessionId) {
    return NextResponse.redirect(new URL("/join?e=nosession", req.url));
  }

  // Reuse this student's seat in that session, or create it. Reopening the
  // personal link clears any facilitator termination (rejoin restores them).
  const existing = await query<{ id: string }>(
    `SELECT id FROM participants
       WHERE session_id = $1 AND course_student_id = $2 LIMIT 1`,
    [sessionId, s.id]
  );
  let participantId = existing.rows[0]?.id;
  if (participantId) {
    await query(
      `UPDATE participants SET removed_at = NULL WHERE id = $1`,
      [participantId]
    );
  }
  if (!participantId) {
    participantId = randomUUID();
    await query(
      `INSERT INTO participants (id, session_id, name, course_student_id)
         VALUES ($1, $2, $3, $4)`,
      [participantId, sessionId, s.name.slice(0, 80), s.id]
    );
  }

  return NextResponse.redirect(
    new URL(`/s/${sessionId}?p=${participantId}`, req.url)
  );
}
