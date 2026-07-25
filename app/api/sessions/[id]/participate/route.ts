import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import { getFacilitatorFromRequest } from "@/lib/facilitators";
import { authorizeSession } from "@/lib/sessions";

// A facilitator's roster seat: lets them answer votes, add comments, rate,
// and draw exactly like a student — while their headers keep full control.
// Find-or-create, keyed to the facilitator identity.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const session = await authorizeSession(req, id);
  const facilitator = await getFacilitatorFromRequest(req);
  if (!session || !facilitator) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const existing = await query<{ id: string }>(
    `SELECT id FROM participants WHERE session_id = $1 AND facilitator_id = $2`,
    [id, facilitator.id]
  );
  if (existing.rows[0]) {
    return NextResponse.json({ participantId: existing.rows[0].id });
  }
  const participantId = randomUUID();
  await query(
    `INSERT INTO participants (id, session_id, name, facilitator_id)
     VALUES ($1, $2, $3, $4)`,
    [participantId, id, facilitator.name, facilitator.id]
  );
  return NextResponse.json({ participantId });
}
