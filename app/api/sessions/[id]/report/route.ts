import { NextResponse } from "next/server";
import { authorizeSession, getSessionReport } from "@/lib/sessions";

// Close-out report data: attendance, agenda, and every activity's retained
// results. Facilitator-only.
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const session = await authorizeSession(req, id);
  if (!session) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  return NextResponse.json(await getSessionReport(session));
}
