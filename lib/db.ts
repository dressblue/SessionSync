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
  // Phase 3: courses, facilitator identities, rotating student keys
  await run(`
    CREATE TABLE IF NOT EXISTS facilitators (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      key TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS courses (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      code TEXT UNIQUE NOT NULL,
      created_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS course_facilitators (
      course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      facilitator_id UUID NOT NULL REFERENCES facilitators(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'facilitator',
      added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (course_id, facilitator_id)
    );
  `);
  await run(
    `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS course_id UUID;`
  );
  await run(
    `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;`
  );
  await run(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS join_key TEXT;`);
  await run(
    `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS join_key_expires TIMESTAMPTZ;`
  );
  await run(
    `CREATE INDEX IF NOT EXISTS idx_sessions_course ON sessions(course_id, position);`
  );
  // Phase 4: step-linked tools, response moderation, likert surveys
  await run(`
    CREATE TABLE IF NOT EXISTS step_tools (
      id UUID PRIMARY KEY,
      step_id UUID NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      prompt TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}',
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await run(
    `CREATE INDEX IF NOT EXISTS idx_step_tools_step ON step_tools(step_id, position);`
  );
  await run(
    `ALTER TABLE activity_responses ADD COLUMN IF NOT EXISTS highlighted BOOLEAN NOT NULL DEFAULT false;`
  );
  await run(
    `ALTER TABLE activity_responses ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;`
  );
  // Phase 5: course materials (needed items) and downloadable files.
  // session_id NULL = course-wide (visible in every session of the course).
  await run(`
    CREATE TABLE IF NOT EXISTS course_materials (
      id UUID PRIMARY KEY,
      course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS course_files (
      id UUID PRIMARY KEY,
      course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime TEXT NOT NULL DEFAULT 'application/octet-stream',
      size INTEGER NOT NULL,
      data BYTEA NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await run(
    `CREATE INDEX IF NOT EXISTS idx_materials_course ON course_materials(course_id);`
  );
  await run(
    `CREATE INDEX IF NOT EXISTS idx_files_course ON course_files(course_id);`
  );
  // Phase 6: facilitator-authored whiteboard strokes have no participant.
  await run(
    `ALTER TABLE activity_responses ALTER COLUMN participant_id DROP NOT NULL;`
  );
  // Phase 7: facilitators participate in activities through a real roster
  // seat linked to their identity.
  await run(
    `ALTER TABLE participants ADD COLUMN IF NOT EXISTS facilitator_id UUID;`
  );
  // Phase 8: facilitators are now Clerk accounts. A facilitator row is linked
  // to a Clerk user by clerk_user_id, adopted on first sign-in via email. The
  // legacy `key` secret is retired, so it must be nullable for new rows.
  await run(
    `ALTER TABLE facilitators ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;`
  );
  await run(`ALTER TABLE facilitators ADD COLUMN IF NOT EXISTS email TEXT;`);
  await run(`ALTER TABLE facilitators ALTER COLUMN key DROP NOT NULL;`);
  await run(
    `CREATE UNIQUE INDEX IF NOT EXISTS facilitators_clerk_user_id_key
       ON facilitators (clerk_user_id) WHERE clerk_user_id IS NOT NULL;`
  );
  await run(
    `CREATE INDEX IF NOT EXISTS facilitators_email_idx
       ON facilitators (lower(email)) WHERE email IS NOT NULL;`
  );
  // Phase 9: a facilitator can terminate an individual participant. A removed
  // seat is kept (not deleted) so the self-heal path can't resurrect it and the
  // client can be told it was removed.
  await run(
    `ALTER TABLE participants ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;`
  );
  // Phase 10: a global admin role. Admins manage people and any course's team
  // from the portal admin area.
  await run(
    `ALTER TABLE facilitators ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;`
  );
  // Phase 11: a per-course student roster with a stable per-student token. A
  // durable personal link (/join/s/<token>) drops the student into whichever
  // session is live, reusing the account-free participant seat (linked back by
  // participants.course_student_id).
  await run(`
    CREATE TABLE IF NOT EXISTS course_students (
      id UUID PRIMARY KEY,
      course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT,
      token TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await run(
    `ALTER TABLE participants ADD COLUMN IF NOT EXISTS course_student_id UUID;`
  );
  // Phase 12: in-session chat between participants and the facilitator. Shown
  // in the participant side panel and the facilitator console (not the public
  // presenter screen).
  await run(`
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY,
      session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      participant_id UUID,
      sender_name TEXT NOT NULL,
      from_facilitator BOOLEAN NOT NULL DEFAULT false,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await run(
    `CREATE INDEX IF NOT EXISTS messages_session_idx ON messages (session_id, created_at);`
  );

  // Phase 13: scoped chat. A message can target the whole group (default), the
  // facilitator privately, or one participant (a DM). The session's chat_mode
  // governs what participants may do; the facilitator can always broadcast to
  // the group or DM any individual.
  //   chat_mode: 'group'       — participants may post to the group or the facilitator
  //              'facilitator' — participants may only message the facilitator
  //              'open'        — participants may also DM other participants
  await run(
    `ALTER TABLE messages ADD COLUMN IF NOT EXISTS to_participant_id UUID;`
  );
  await run(
    `ALTER TABLE messages ADD COLUMN IF NOT EXISTS to_facilitator BOOLEAN NOT NULL DEFAULT false;`
  );
  await run(
    `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS chat_mode TEXT NOT NULL DEFAULT 'group';`
  );

  // Phase 14: a facilitator can spotlight one chat message to the whole room —
  // either as a pinned banner or a full presented card (like a tool). The
  // spotlight lives on the session so it appears in participant + presenter
  // views; clearing it sets both columns back to null.
  await run(
    `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS spotlight_message_id UUID;`
  );
  await run(
    `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS spotlight_style TEXT;`
  );

  // Phase 15: course templating. A course can be a reusable TEMPLATE (master),
  // or a COHORT cloned from one. A cohort carries an access date-window; outside
  // it, students are locked out (facilitators always have access). Editing a
  // template only affects FUTURE clones — cohorts are independent snapshots.
  await run(
    `ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT false;`
  );
  await run(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS template_id UUID;`);
  await run(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;`);
  await run(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;`);
  await run(
    `ALTER TABLE courses ADD COLUMN IF NOT EXISTS cohort_label TEXT NOT NULL DEFAULT '';`
  );

  // Phase 16: an admin-curated library of reusable tools. Each row is a portable
  // step_tool spec (kind + prompt + config JSON, identical to step_tools/activities);
  // facilitators search the library and clone tools into their agenda steps.
  await run(
    `CREATE TABLE IF NOT EXISTS tool_templates (
       id UUID PRIMARY KEY,
       name TEXT NOT NULL,
       description TEXT NOT NULL DEFAULT '',
       category TEXT NOT NULL DEFAULT '',
       kind TEXT NOT NULL,
       prompt TEXT NOT NULL DEFAULT '',
       config TEXT NOT NULL DEFAULT '{}',
       created_by UUID,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     );`
  );
  await run(
    `CREATE INDEX IF NOT EXISTS idx_tool_templates_category ON tool_templates (category);`
  );
}
