import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stamped at build time into both the client bundle and the server. When a
  // running client sees a newer stamp in the state poll, it reloads itself —
  // so deploys never leave stale consoles/participants behind.
  env: {
    NEXT_PUBLIC_BUILD: new Date().toISOString(),
  },
  // Dev-only: allow devices on the local network (phones/tablets joining as
  // students via http://<lan-ip>:3000) to load dev-server assets. Without
  // this, Next 16 blocks cross-origin dev requests and the page renders but
  // never hydrates — buttons stay dead. Production builds are unaffected.
  allowedDevOrigins: [
    "192.168.1.12",
    "192.168.*.*",
    "10.*.*.*",
    "*.local",
  ],
};

export default nextConfig;
