import type { Spark, Assignment } from "./model";

export type OutboxOp =
  | { op: "upsert_spark"; at: number; spark: Spark }
  | { op: "delete_spark"; at: number; sparkId: string }
  | { op: "upsert_assignment"; at: number; assignment: Assignment }
  | { op: "delete_assignment"; at: number; assignmentId: string };

const KEY = "barstock_outbox_v1";
const KEY_PREFIX = "barstock_outbox_v2";

function normalizedScope(workspaceId?: string | null): string | null {
  const trimmed = typeof workspaceId === "string" ? workspaceId.trim().toLowerCase() : "";
  return trimmed || null;
}

function scopedKey(workspaceId?: string | null): string {
  const scope = normalizedScope(workspaceId);
  return scope ? `${KEY_PREFIX}:${scope}` : KEY;
}

function parseOutbox(raw: string | null): OutboxOp[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as OutboxOp[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadOutbox(workspaceId?: string | null): OutboxOp[] {
  const key = scopedKey(workspaceId);
  const scoped = parseOutbox(localStorage.getItem(key));
  if (scoped.length > 0 || key === KEY) return scoped;
  return parseOutbox(localStorage.getItem(KEY));
}

export function saveOutbox(items: OutboxOp[], workspaceId?: string | null): void {
  localStorage.setItem(scopedKey(workspaceId), JSON.stringify(items));
}

export function pushOutbox(op: OutboxOp, workspaceId?: string | null): void {
  const items = loadOutbox(workspaceId);
  items.push(op);
  saveOutbox(items, workspaceId);
}

export function clearOutbox(workspaceId?: string | null): void {
  saveOutbox([], workspaceId);
}

export function peekOutbox(workspaceId?: string | null): OutboxOp[] {
  return loadOutbox(workspaceId);
}

export function drainOutbox(workspaceId?: string | null): void {
  clearOutbox(workspaceId);
}

/**
 * Optional: coalesce noisy ops so the outbox doesn't grow forever.
 * Strategy: keep only the latest upsert per entity id, keep delete last.
 */
export function compactOutbox(items: OutboxOp[]): OutboxOp[] {
  const latestSpark = new Map<string, OutboxOp>();
  const latestAssignment = new Map<string, OutboxOp>();
  const passthrough: OutboxOp[] = [];

  for (const op of items) {
    if (op.op === "upsert_spark") latestSpark.set(op.spark.id, op);
    else if (op.op === "delete_spark") latestSpark.set(op.sparkId, op);
    else if (op.op === "upsert_assignment") latestAssignment.set(op.assignment.id, op);
    else if (op.op === "delete_assignment") latestAssignment.set(op.assignmentId, op);
    else passthrough.push(op);
  }

  return [
    ...passthrough,
    ...latestAssignment.values(),
    ...latestSpark.values()
  ].sort((a, b) => a.at - b.at);
}
