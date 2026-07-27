import { NextResponse } from "next/server";
import { getFacilitator } from "@/lib/viewer";
import { emailConfigured } from "@/lib/email";

// Tiny identity probe for the client chrome (e.g. whether to show the Admin
// link, and whether server-sent email is available). Never throws for a
// signed-out caller — just reports signedIn:false.
export async function GET() {
  const f = await getFacilitator();
  return NextResponse.json({
    signedIn: !!f,
    isAdmin: !!f?.isAdmin,
    name: f?.name ?? null,
    emailConfigured: emailConfigured(),
  });
}
