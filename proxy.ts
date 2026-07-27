import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Only the facilitator-facing PAGES are protected at the edge — an
// unauthenticated hit bounces to /sign-in. Everything else (the student flow,
// public reads, and every API route) is left open here: API routes authorize
// in-handler via getFacilitator(), and dual-mode routes like
// /api/sessions/[id]/state must stay reachable for students who have no
// account. clerkMiddleware still runs on those routes, so auth() works inside
// them for the facilitator-elevation path.
const isProtected = createRouteMatcher([
  "/dashboard(.*)",
  "/course(.*)",
  "/facilitate(.*)",
  "/admin(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
