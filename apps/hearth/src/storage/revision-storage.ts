import type { Revision, RevisionKind } from "../domain/revision";
import {
  HEARTH_REVISIONS_SCHEMA_VERSION,
  normalizeRevisionSnapshot,
  type HearthRevisionSnapshot,
} from "../lib/hearth-revisions-contract";

function revisionFallbackStorageKey(workpieceId: string): string {
  return `hearth:revisions:v${HEARTH_REVISIONS_SCHEMA_VERSION}:${workpieceId}`;
}

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

export function loadRevisionSnapshotFallback(workpieceId: string): HearthRevisionSnapshot | null {
  const normalizedWorkpieceId = typeof workpieceId === "string" ? workpieceId.trim() : "";
  if (!normalizedWorkpieceId) return null;
  try {
    const raw = localStorage.getItem(revisionFallbackStorageKey(normalizedWorkpieceId));
    if (!raw) return null;
    return normalizeRevisionSnapshot(normalizedWorkpieceId, JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveRevisionSnapshotFallback(
  workpieceId: string,
  snapshot: HearthRevisionSnapshot,
): void {
  const normalizedWorkpieceId = typeof workpieceId === "string" ? workpieceId.trim() : "";
  if (!normalizedWorkpieceId) return;
  const normalizedSnapshot = normalizeRevisionSnapshot(normalizedWorkpieceId, snapshot);
  if (!normalizedSnapshot) return;
  try {
    localStorage.setItem(
      revisionFallbackStorageKey(normalizedWorkpieceId),
      JSON.stringify(normalizedSnapshot),
    );
  } catch {
    // ignore
  }
}

export function clearRevisionSnapshotFallback(workpieceId: string): void {
  const normalizedWorkpieceId = typeof workpieceId === "string" ? workpieceId.trim() : "";
  if (!normalizedWorkpieceId) return;
  try {
    localStorage.removeItem(revisionFallbackStorageKey(normalizedWorkpieceId));
  } catch {
    // ignore
  }
}

export function cloneRevision(revision: Revision): Revision {
  return { ...revision };
}
