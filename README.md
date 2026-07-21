# SessionSync

An interactive companion for Zoom sessions: the facilitator builds a structured
agenda, shares a join link in Zoom chat, and drives every participant's screen
through the agenda in sync — with presence, reconnect, and device-switch
support.

## Current capabilities

- Create a session, build/edit/reorder a markdown agenda
- Join by link or 6-character code with just a name (no account)
- Facilitator-controlled synced navigation (start / next / back / goto / end)
- Live roster with online presence
- Reconnect-safe: all state is server-side; facilitator drafts persist locally
- Device switch: participants get a personal resume link (and rejoining with
  the same name reclaims the identity); the facilitator link works anywhere

## Architecture notes

- Next.js (App Router) + Tailwind
- Postgres via `DATABASE_URL` (Neon in production); with no `DATABASE_URL`,
  an embedded PGlite database under `.data/pglite` is used for local dev
- Sync transport is short-interval polling behind `components/useSessionState.ts`
  — designed to be swapped for a push service (Liveblocks/Ably) later
- Facilitator auth is a per-session secret key in the console URL; participant
  identity is a per-session UUID. Clerk-based accounts come in a later phase.

## Run

```bash
npm install
npm run dev
```

## Courses & keys

- Facilitators create courses (1+ sessions each) and invite co-facilitators by
  sharing the stable course code; every team member can tailor content and
  lead sessions.
- Students join a session with a randomized key that expires after 24 hours
  (rotate/revoke any time); legacy standalone sessions keep their stable code.
- `scripts/seed-247dad.mjs` seeds the 24:7 Dad(R) A.M. facilitation companion
  (12 sessions keyed to the licensed NFI slide deck).

## Roadmap

- Content blocks (slides/images, embedded video)
- Session artifact/export (attendance, notes, activity results)
- Zoom App wrapper (Zoom Apps SDK, in-client embed, invitations)
- Real accounts (Clerk) replacing the interim facilitator identities
