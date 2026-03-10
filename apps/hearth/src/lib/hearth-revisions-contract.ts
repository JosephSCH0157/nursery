import type { Revision, RevisionKind } from "../domain/revision";

export const HEARTH_REVISIONS_PATH = "hearth/revisions.v1.json";
export const HEARTH_REVISIONS_SCHEMA_VERSION = 1 as const;
export const HEARTH_REVISIONS_MAX_ENTRIES = 200;

export type HearthRevisionEntry = {
  id: string;
  created_at: string;
  kind: RevisionKind;
  title_snapshot: string;
  body_snapshot: string;
  note?: string | null;
  draft_id?: string | null;
};

export type HearthRevisionSnapshot = {
  schema_version: 1;
  workpiece_id: string;
  updated_at: string;
  revisions: HearthRevisionEntry[];
};

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeIsoString(value: unknown, fallback: string): string {
  const candidate = readString(value);
  if (!candidate) return fallback;
  const parsed = Date.parse(candidate);
  if (!Number.isFinite(parsed)) return fallback;
  return new Date(parsed).toISOString();
}

function normalizeKind(value: unknown): RevisionKind {
  return value === "autosave" || value === "milestone" || value === "manual" ? value : "manual";
}

function normalizeRevisionEntry(value: unknown): HearthRevisionEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = readString(row.id);
  if (!id) return null;

  const createdAt = normalizeIsoString(row.created_at, new Date().toISOString());
  const titleSnapshot = typeof row.title_snapshot === "string" ? row.title_snapshot : "Untitled Draft";
  const bodySnapshot = typeof row.body_snapshot === "string" ? row.body_snapshot : "";
  const note = typeof row.note === "string" && row.note.trim() ? row.note.trim() : null;
  const draftId = typeof row.draft_id === "string" && row.draft_id.trim() ? row.draft_id.trim() : null;

  return {
    id,
    created_at: createdAt,
    kind: normalizeKind(row.kind),
    title_snapshot: titleSnapshot,
    body_snapshot: bodySnapshot,
    note,
    draft_id: draftId,
  };
}

function sortRevisionEntriesDesc(entries: readonly HearthRevisionEntry[]): HearthRevisionEntry[] {
  return entries
    .slice()
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export function createEmptyRevisionSnapshot(workpieceId: string): HearthRevisionSnapshot {
  return {
    schema_version: HEARTH_REVISIONS_SCHEMA_VERSION,
    workpiece_id: workpieceId.trim(),
    updated_at: new Date().toISOString(),
    revisions: [],
  };
}

export function normalizeRevisionSnapshot(
  workpieceId: string,
  input: unknown,
): HearthRevisionSnapshot | null {
  const normalizedWorkpieceId = readString(workpieceId);
  if (!normalizedWorkpieceId) return null;

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return createEmptyRevisionSnapshot(normalizedWorkpieceId);
  }

  const row = input as Record<string, unknown>;
  const revisionsRaw = Array.isArray(row.revisions) ? row.revisions : [];
  const revisionsById = new Map<string, HearthRevisionEntry>();
  for (const value of revisionsRaw) {
    const normalized = normalizeRevisionEntry(value);
    if (!normalized) continue;
    revisionsById.set(normalized.id, normalized);
  }

  return {
    schema_version: HEARTH_REVISIONS_SCHEMA_VERSION,
    workpiece_id: normalizedWorkpieceId,
    updated_at: normalizeIsoString(row.updated_at, new Date().toISOString()),
    revisions: applyRevisionCap(Array.from(revisionsById.values())),
  };
}

export function applyRevisionCap(
  revisions: readonly HearthRevisionEntry[],
  maxEntries = HEARTH_REVISIONS_MAX_ENTRIES,
): HearthRevisionEntry[] {
  const limit = Number.isFinite(maxEntries) ? Math.max(0, Math.trunc(maxEntries)) : HEARTH_REVISIONS_MAX_ENTRIES;
  if (limit === 0) return [];
  return sortRevisionEntriesDesc(revisions).slice(0, limit);
}

export function revisionToEntry(revision: Revision): HearthRevisionEntry {
  const createdAt = Number.isFinite(revision.createdAt) ? revision.createdAt : Date.now();
  return {
    id: revision.id,
    created_at: new Date(createdAt).toISOString(),
    kind: revision.kind,
    title_snapshot: revision.titleSnapshot,
    body_snapshot: revision.bodySnapshot,
    note: revision.note?.trim() || null,
    draft_id: revision.draftId?.trim() || null,
  };
}

export function entryToRevision(entry: HearthRevisionEntry): Revision {
  return {
    id: entry.id,
    draftId: entry.draft_id?.trim() || "",
    createdAt: Date.parse(entry.created_at),
    titleSnapshot: entry.title_snapshot,
    bodySnapshot: entry.body_snapshot,
    note: entry.note?.trim() || undefined,
    kind: entry.kind,
  };
}
