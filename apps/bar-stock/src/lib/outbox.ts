import type { Spark, Session } from "./model";

export type OutboxOp =
  | { op: "upsert_spark"; at: number; spark: Spark }
  | { op: "delete_spark"; at: number; sparkId: string }
  | { op: "upsert_session"; at: number; session: Session }
  | { op: "delete_session"; at: number; sessionId: string };

const KEY = "barstock_outbox_v1";

export function loadOutbox(): OutboxOp[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OutboxOp[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveOutbox(items: OutboxOp[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function pushOutbox(op: OutboxOp) {
  const items = loadOutbox();
  items.push(op);
  saveOutbox(items);
}

export function clearOutbox() {
  saveOutbox([]);
}

export function peekOutbox(): OutboxOp[] {
  return loadOutbox();
}

export function drainOutbox() {
  clearOutbox();
}

/**
 * Optional: coalesce noisy ops so the outbox doesn't grow forever.
 * Strategy: keep only the latest upsert per entity id, keep delete last.
 */
export function compactOutbox(items: OutboxOp[]): OutboxOp[] {
  const latestSpark = new Map<string, OutboxOp>();
  const latestSession = new Map<string, OutboxOp>();
  const passthrough: OutboxOp[] = [];

  for (const op of items) {
    if (op.op === "upsert_spark") latestSpark.set(op.spark.id, op);
    else if (op.op === "delete_spark") latestSpark.set(op.sparkId, op);
    else if (op.op === "upsert_session") latestSession.set(op.session.id, op);
    else if (op.op === "delete_session") latestSession.set(op.sessionId, op);
    else passthrough.push(op);
  }

  return [
    ...passthrough,
    ...latestSession.values(),
    ...latestSpark.values()
  ].sort((a, b) => a.at - b.at);
}
