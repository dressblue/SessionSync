// The canonical public origin for every shareable link (student invite,
// co-facilitator key, personal resume link).
//
// Vercel gives the project several production domains. The clean alias
// `sessionsync-three.vercel.app` is public, but the account-scoped aliases
// (`…-richard-gordon-s-projects.vercel.app`) sit behind Vercel Authentication
// and 401/redirect anyone who isn't logged in to Vercel — i.e. every student.
// Links must therefore never inherit `window.location.origin`, because a
// facilitator who opened the console on a protected domain would hand out
// links that bounce students to vercel.com/login.
const PUBLIC_ORIGIN = "https://sessionsync-three.vercel.app";

/** Origin to embed in links we ask other people to open. */
export function shareOrigin(): string {
  if (typeof window !== "undefined") {
    const h = window.location.hostname;
    // Local dev: keep links on localhost so they actually resolve.
    if (h === "localhost" || h === "127.0.0.1") return window.location.origin;
  }
  return PUBLIC_ORIGIN;
}
