import type { Assignment, Spark } from "./model";

export type BarStockRetryOperation =
  | { operationId: string; workspaceId: string; kind: "assignment"; action: "create" | "update"; entityId: string; expectedRevision: number | null; idempotencyKey: string | null; intent: Assignment; attempts: number; lastError?: string }
  | { operationId: string; workspaceId: string; kind: "assignment"; action: "archive" | "delete"; entityId: string; expectedRevision: number; idempotencyKey: null; intent: Assignment; attempts: number; lastError?: string }
  | { operationId: string; workspaceId: string; kind: "spark"; action: "create" | "update"; entityId: string; expectedRevision: number | null; idempotencyKey: string | null; intent: Spark; attempts: number; lastError?: string }
  | { operationId: string; workspaceId: string; kind: "spark"; action: "archive"; entityId: string; expectedRevision: number; idempotencyKey: null; intent: Spark; attempts: number; lastError?: string };

export interface RetryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function key(workspaceId: string): string {
  return `barstock_retry_v3:${workspaceId.trim().toLowerCase()}`;
}

function isOperation(value: unknown, workspaceId: string): value is BarStockRetryOperation {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return row.workspaceId === workspaceId && typeof row.operationId === "string"
    && (row.kind === "assignment" || row.kind === "spark") && typeof row.entityId === "string"
    && typeof row.action === "string" && typeof row.intent === "object" && row.intent !== null;
}

export function loadRetryCache(storage: RetryStorage, workspaceId: string): BarStockRetryOperation[] {
  try {
    const parsed = JSON.parse(storage.getItem(key(workspaceId)) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is BarStockRetryOperation => isOperation(item, workspaceId));
  } catch {
    return [];
  }
}

export function saveRetryCache(storage: RetryStorage, workspaceId: string, operations: readonly BarStockRetryOperation[]): void {
  storage.setItem(key(workspaceId), JSON.stringify(operations));
}

export function retainRetryOperation(storage: RetryStorage, operation: BarStockRetryOperation): void {
  const operations = loadRetryCache(storage, operation.workspaceId);
  const next = operations.filter((item) => item.operationId !== operation.operationId);
  next.push(operation);
  saveRetryCache(storage, operation.workspaceId, next);
}

export function acknowledgeRetryOperation(storage: RetryStorage, workspaceId: string, operationId: string): void {
  saveRetryCache(storage, workspaceId, loadRetryCache(storage, workspaceId).filter((item) => item.operationId !== operationId));
}

export function deterministicOperationId(args: {
  workspaceId: string;
  kind: "assignment" | "spark";
  action: string;
  entityId: string;
  expectedRevision: number | null;
  intentUpdatedAt: number;
}): string {
  return [args.workspaceId.toLowerCase(), args.kind, args.action, args.entityId.toLowerCase(), args.expectedRevision ?? "create", args.intentUpdatedAt].join(":");
}

export function createIdempotencyKey(workspaceId: string, kind: "assignment" | "spark", entityId: string): string {
  return `barstock:${workspaceId.toLowerCase()}:${kind}:${entityId.toLowerCase()}:create`;
}
