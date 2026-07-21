import { NextResponse } from "next/server";
import { createSession } from "@/lib/sessions";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  const session = await createSession(title.slice(0, 200));
  return NextResponse.json({
    id: session.id,
    code: session.code,
    facilitatorKey: session.facilitator_key,
  });
}
