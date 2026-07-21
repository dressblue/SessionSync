import { randomUUID, randomBytes } from "crypto";
import { query } from "./db";

export type SessionStatus = "lobby" | "live" | "ended";

export interface SessionRow {
  id: string;
  title: string;
  code: string;
  facilitator_key: string;
  status: SessionStatus;
  current_step: number;
}

export interface StepRow {
  id: string;
  session_id: string;
  position: number;
  title: string;
  kind: string;
  content: string;
}

export interface ParticipantRow {
  id: string;
  name: string;
  joined_at: string;
  last_seen: string;
}

// Unambiguous alphabet: no 0/O, 1/I/L.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function makeCode(length = 6): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

export async function createSession(title: string): Promise<SessionRow> {
  const id = randomUUID();
  const facilitatorKey = randomBytes(24).toString("base64url");
  // Retry on the (unlikely) code collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode();
    try {
      const res = await query<SessionRow>(
        `INSERT INTO sessions (id, title, code, facilitator_key)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [id, title, code, facilitatorKey]
      );
      return res.rows[0];
    } catch (err) {
      if (attempt === 4) throw err;
    }
  }
  throw new Error("unreachable");
}

export async function getSession(id: string): Promise<SessionRow | null> {
  const res = await query<SessionRow>(`SELECT * FROM sessions WHERE id = $1`, [id]);
  return res.rows[0] ?? null;
}

export async function getSessionByCode(code: string): Promise<SessionRow | null> {
  const res = await query<SessionRow>(
    `SELECT * FROM sessions WHERE code = $1`,
    [code.trim().toUpperCase()]
  );
  return res.rows[0] ?? null;
}

/** Returns the session only if the facilitator key matches; otherwise null. */
export async function getAuthorizedSession(
  id: string,
  key: string | null
): Promise<SessionRow | null> {
  if (!key) return null;
  const session = await getSession(id);
  if (!session || session.facilitator_key !== key) return null;
  return session;
}

export async function getSteps(sessionId: string): Promise<StepRow[]> {
  const res = await query<StepRow>(
    `SELECT * FROM steps WHERE session_id = $1 ORDER BY position ASC`,
    [sessionId]
  );
  return res.rows;
}

export async function getParticipants(sessionId: string): Promise<ParticipantRow[]> {
  const res = await query<ParticipantRow>(
    `SELECT id, name, joined_at, last_seen FROM participants
     WHERE session_id = $1 ORDER BY joined_at ASC`,
    [sessionId]
  );
  return res.rows;
}
