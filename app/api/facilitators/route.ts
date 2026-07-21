import { NextResponse } from "next/server";
import { createFacilitator } from "@/lib/facilitators";

// Create a facilitator identity (interim auth until real accounts land):
// the returned id + key pair is the credential, stored client-side.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const facilitator = await createFacilitator(name);
  return NextResponse.json(facilitator);
}
