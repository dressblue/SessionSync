import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAuthorizedSession, getSteps } from "@/lib/sessions";

// Facilitator navigation: start/end the session, move between agenda steps.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const session = await getAuthorizedSession(id, req.headers.get("x-facilitator-key"));
  if (!session) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const action = body?.action;
  const steps = await getSteps(id);
  const maxIdx = Math.max(0, steps.length - 1);
  const clamp = (n: number) => Math.min(maxIdx, Math.max(0, n));

  let status = session.status;
  let current = session.current_step;

  switch (action) {
    case "start":
      status = "live";
      current = 0;
      break;
    case "end":
      status = "ended";
      break;
    case "next":
      current = clamp(current + 1);
      break;
    case "prev":
      current = clamp(current - 1);
      break;
    case "goto":
      if (typeof body?.step !== "number") {
        return NextResponse.json({ error: "step index required" }, { status: 400 });
      }
      current = clamp(body.step);
      break;
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  await query(
    `UPDATE sessions SET status = $1, current_step = $2 WHERE id = $3`,
    [status, current, id]
  );
  return NextResponse.json({ status, currentStep: current });
}
