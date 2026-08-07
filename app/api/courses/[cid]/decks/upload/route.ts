import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getFacilitator } from "@/lib/viewer";
import { isCourseFacilitator } from "@/lib/facilitators";

// Authorizes browser-direct PDF uploads to Vercel Blob for a course's slide
// decks. Course-facilitator-gated (the admin /api/blob/upload is admin-only, so
// facilitators need their own course-scoped path). Bypasses the serverless body
// limit — decks routinely exceed it. The caller registers the returned URL via
// POST /api/courses/[cid]/decks.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ cid: string }> }
) {
  const { cid } = await ctx.params;
  const body = (await req.json()) as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        const facilitator = await getFacilitator();
        if (!facilitator || !(await isCourseFacilitator(cid, facilitator.id))) {
          throw new Error("Not authorized");
        }
        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: 100 * 1024 * 1024, // 100 MB ceiling for a deck
          addRandomSuffix: true, // unguessable URL
        };
      },
      onUploadCompleted: async () => {
        /* the caller registers the deck row via POST …/decks */
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 400 }
    );
  }
}
