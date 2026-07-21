import { randomUUID, randomBytes } from "crypto";
import { query } from "./db";

export interface FacilitatorRow {
  id: string;
  name: string;
  key: string;
}

export interface CourseRow {
  id: string;
  title: string;
  description: string;
  code: string;
  created_by: string | null;
}

// Same unambiguous alphabet used for session codes.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function makeCode(length = 6): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

export async function createFacilitator(name: string): Promise<FacilitatorRow> {
  const id = randomUUID();
  const key = randomBytes(24).toString("base64url");
  await query(
    `INSERT INTO facilitators (id, name, key) VALUES ($1, $2, $3)`,
    [id, name.slice(0, 120), key]
  );
  return { id, name, key };
}

/** Resolve the facilitator identity from request headers, or null. */
export async function getFacilitatorFromRequest(
  req: Request
): Promise<FacilitatorRow | null> {
  const id = req.headers.get("x-facilitator-id");
  const secret = req.headers.get("x-facilitator-secret");
  if (!id || !secret) return null;
  const res = await query<FacilitatorRow>(
    `SELECT id, name, key FROM facilitators WHERE id = $1 AND key = $2`,
    [id, secret]
  );
  return res.rows[0] ?? null;
}

export async function isCourseFacilitator(
  courseId: string,
  facilitatorId: string
): Promise<boolean> {
  const res = await query<{ course_id: string }>(
    `SELECT course_id FROM course_facilitators
     WHERE course_id = $1 AND facilitator_id = $2`,
    [courseId, facilitatorId]
  );
  return !!res.rows[0];
}

export async function getCourse(id: string): Promise<CourseRow | null> {
  const res = await query<CourseRow>(`SELECT * FROM courses WHERE id = $1`, [id]);
  return res.rows[0] ?? null;
}

export async function getCourseByCode(code: string): Promise<CourseRow | null> {
  const res = await query<CourseRow>(
    `SELECT * FROM courses WHERE code = $1`,
    [code.trim().toUpperCase()]
  );
  return res.rows[0] ?? null;
}
