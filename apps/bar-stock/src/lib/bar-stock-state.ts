import type { Assignment, Spark } from "./model";

export type BarStockPersistenceState =
  | { status: "loading" }
  | { status: "pending" | "retrying"; operationId: string }
  | { status: "saved"; operationId?: string }
  | { status: "failed" | "denied" | "conflict"; operationId: string; message: string }
  | { status: "stale"; operationId: string; localIntent: Assignment | Spark; canonical: Assignment | Spark }
  | { status: "offline" | "unavailable"; operationId?: string; message: string };

export type BarStockStateMap = Record<string, BarStockPersistenceState>;

export function entityStateKey(kind: "assignment" | "spark", id: string): string {
  return `${kind}:${id}`;
}

export function setEntityState(
  states: BarStockStateMap,
  kind: "assignment" | "spark",
  id: string,
  state: BarStockPersistenceState,
): BarStockStateMap {
  return { ...states, [entityStateKey(kind, id)]: state };
}
