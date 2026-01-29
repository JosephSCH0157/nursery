import type { OutboxOp } from "./outbox";

export type TongsSyncStatus = "offline" | "connected";

/**
 * For now: stub. Later: detect auth/workspace + Tongs endpoints.
 */
export async function getTongsStatus(): Promise<TongsSyncStatus> {
  return "offline";
}

/**
 * For now: stub that always fails (so outbox accumulates safely).
 * Later: send ops to Tongs ingestion endpoint.
 */
export async function flushToTongs(_ops: OutboxOp[]): Promise<{ ok: boolean; sent: number }> {
  return { ok: false, sent: 0 };
}
