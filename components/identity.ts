// Facilitator identity, interim scheme until real accounts (Clerk) land:
// an { id, name, key } credential created once and kept in localStorage.

export interface FacilitatorIdentity {
  id: string;
  name: string;
  key: string;
}

const STORAGE_KEY = "ss_facilitator_identity";

export function loadFacilitatorIdentity(): FacilitatorIdentity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.id && parsed?.key) return parsed;
  } catch {
    /* fall through */
  }
  return null;
}

export function saveFacilitatorIdentity(identity: FacilitatorIdentity): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}

export function facilitatorHeaders(
  identity: FacilitatorIdentity | null
): Record<string, string> {
  if (!identity) return {};
  return {
    "x-facilitator-id": identity.id,
    "x-facilitator-secret": identity.key,
  };
}
