import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireAdmin } from "@/lib/viewer";

// Authorizes browser-direct uploads to Vercel Blob (bypasses the serverless body
// size limit — good for 30MB+ videos). Admin-only. Requires a Blob store on the
// Vercel project (env BLOB_READ_WRITE_TOKEN, added automatically when the store
// is created). Each upload returns a CDN URL that the caller saves as a video
// library tool.
export async function POST(req: Request) {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        // Gate token issuance on admin — runs with the user's Clerk cookie.
        if (!(await requireAdmin())) {
          throw new Error("Not authorized");
        }
        // No allowedContentTypes restriction: a mismatch between the browser's
        // reported type and the allow-list was rejecting the commit (causing the
        // 100%-then-retry loop). Admin-gated, so unrestricted type is fine.
        return {
          maximumSizeInBytes: 500 * 1024 * 1024, // generous ceiling
          addRandomSuffix: true, // unguessable URL
        };
      },
      // Fires server-to-server after the upload completes (no user cookie here).
      onUploadCompleted: async () => {
        /* nothing to persist here — the caller saves the URL as a library tool */
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
