import type { Revision, RevisionKind } from "../domain/revision";

const REVISIONS_STORAGE_KEY = "hearth:revisions";

type RevisionRecord = Record<string, Revision>;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeKind(value: unknown): RevisionKind {
  return value === "autosave" || value === "milestone" || value === "manual" ? value : "manual";
}

export function normalizeRevision(value: unknown, idOverride?: string): Revision | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = typeof idOverride === "string" && idOverride.trim()
    ? idOverride.trim()
    : typeof row.id === "string"
      ? row.id.trim()
      : "";
  if (!id) return null;

  const draftId = typeof row.draftId === "string" ? row.draftId.trim() : "";
  if (!draftId) return null;

  const createdAt = isFiniteNumber(row.createdAt) ? row.createdAt : Date.now();

  return {
    id,
    draftId,
    createdAt,
    titleSnapshot: typeof row.titleSnapshot === "string" ? row.titleSnapshot : "Untitled Draft",
    bodySnapshot: typeof row.bodySnapshot === "string" ? row.bodySnapshot : "",
    note: typeof row.note === "string" && row.note.trim() ? row.note.trim() : undefined,
    kind: normalizeKind(row.kind),
  };
}

export function readRevisionRecord(): RevisionRecord {
  try {
    const raw = localStorage.getItem(REVISIONS_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const out: RevisionRecord = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const normalized = normalizeRevision(value, id);
      if (normalized) out[normalized.id] = normalized;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeRevisionRecord(record: RevisionRecord): void {
  localStorage.setItem(REVISIONS_STORAGE_KEY, JSON.stringify(record));
}

export function cloneRevision(revision: Revision): Revision {
  return { ...revision };
}
