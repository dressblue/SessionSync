// Database access layer.
//
// Two interchangeable backends, selected by environment:
//  - DATABASE_URL set  -> node-postgres Pool (Neon or any Postgres) for deployment
//  - DATABASE_URL unset -> embedded PGlite persisted under .data/pglite for local dev
//
// Both speak the same SQL dialect and expose the same query(text, params) shape,
// so application code never branches on backend.

import type { Pool } from "pg";
import type { PGlite } from "@electric-sql/pglite";

export interface QueryResultRows<T> {
  rows: T[];
}

type Backend =
  | { kind: "pg"; pool: Pool }
  | { kind: "pglite"; db: PGlite };

const globalStore = globalThis as unknown as {
  __sessionsync_backend?: Promise<Backend>;
};

async function createBackend(): Promise<Backend> {
  if (process.env.DATABASE_URL) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
    await ensureSchema((text, params) => pool.query(text, params));
    return { kind: "pg", pool };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { mkdirSync } = await import("fs");
  mkdirSync(".data/pglite", { recursive: true });
  const db = new PGlite(".data/pglite");
  await ensureSchema((text, params) => db.query(text, params));
  return { kind: "pglite", db };
}

function getBackend(): Promise<Backend> {
  if (!globalStore.__sessionsync_backend) {
    globalStore.__sessionsync_backend = createBackend().catch((err) => {
      // Don't cache a failed init — let the next request retry.
      globalStore.__sessionsync_backend = undefined;
      throw err;
    });
  }
  return globalStore.__sessionsync_backend;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<QueryResultRows<T>> {
  const backend = await getBackend();
  if (backend.kind === "pg") {
    const res = await backend.pool.query(text, params);
    return { rows: res.rows as T[] };
  }
  const res = await backend.db.query<T>(text, params);
  return { rows: res.rows };
}

async function ensureSchema(
  run: (text: string, params?: unknown[]) => Promise<unknown>
): Promise<void> {
  await run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      facilitator_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'lobby',
      current_step INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS steps (
      id UUID PRIMARY KEY,
      session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      title TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'markdown',
      content TEXT NOT NULL DEFAULT ''
    );
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS participants (
      id UUID PRIMARY KEY,
      session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await run(
    `CREATE INDEX IF NOT EXISTS idx_steps_session ON steps(session_id, position);`
  );
  await run(
    `CREATE INDEX IF NOT EXISTS idx_participants_session ON participants(session_id);`
  );
  // Phase 2 additions
  await run(
    `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS refresh_epoch INTEGER NOT NULL DEFAULT 0;`
  );
  await run(
    `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS active_activity UUID;`
  );
  await run(`
    CREATE TABLE IF NOT EXISTS notes (
      session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      participant_id UUID NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (session_id, participant_id)
    );
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS activities (
      id UUID PRIMARY KEY,
      session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      prompt TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS activity_responses (
      id UUID PRIMARY KEY,
      activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      participant_id UUID NOT NULL,
      column_index INTEGER,
      value TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await run(
    `CREATE INDEX IF NOT EXISTS idx_responses_activity ON activity_responses(activity_id);`
  );
}
