import type { BarStockMutationResult, BarStockRepository, BarStockScope, BarStockSnapshot } from "./bar-stock-repository";
import type { BarStockPersistenceState } from "./bar-stock-state";
import { markLegacyImportAcknowledged, readLegacyImport } from "./legacy-import";
import type { Assignment, Spark } from "./model";
import {
  acknowledgeRetryOperation,
  createIdempotencyKey,
  deterministicOperationId,
  loadRetryCache,
  retainRetryOperation,
  type BarStockRetryOperation,
  type RetryStorage,
} from "./retry-cache";

export type OperationExecution = {
  operation: BarStockRetryOperation;
  state: BarStockPersistenceState;
  row: Assignment | Spark | null;
  acknowledged: boolean;
  rpcOutcome?: BarStockMutationResult<Assignment | Spark>["outcome"];
};

export type WorkspaceReconciliationResult = {
  snapshot: BarStockSnapshot;
  executions: OperationExecution[];
  legacy: { imported: number; malformed: number; pending: number };
  remainingRetryCount: number;
};

export function assignmentOperation(args: {
  workspaceId: string;
  action: "create" | "update" | "archive" | "delete";
  assignment: Assignment;
}): BarStockRetryOperation {
  const expectedRevision = args.action === "create" ? null : args.assignment.revision;
  return {
    workspaceId: args.workspaceId,
    kind: "assignment",
    action: args.action,
    entityId: args.assignment.id,
    expectedRevision: expectedRevision as never,
    idempotencyKey: args.action === "create" ? createIdempotencyKey(args.workspaceId, "assignment", args.assignment.id) : null,
    intent: args.assignment,
    attempts: 0,
    operationId: deterministicOperationId({ workspaceId: args.workspaceId, kind: "assignment", action: args.action, entityId: args.assignment.id, expectedRevision, intentUpdatedAt: args.assignment.updatedAt }),
  } as BarStockRetryOperation;
}

export function sparkOperation(args: {
  workspaceId: string;
  action: "create" | "update" | "archive";
  spark: Spark;
}): BarStockRetryOperation {
  const expectedRevision = args.action === "create" ? null : args.spark.revision;
  return {
    workspaceId: args.workspaceId,
    kind: "spark",
    action: args.action,
    entityId: args.spark.id,
    expectedRevision: expectedRevision as never,
    idempotencyKey: args.action === "create" ? createIdempotencyKey(args.workspaceId, "spark", args.spark.id) : null,
    intent: args.spark,
    attempts: 0,
    operationId: deterministicOperationId({ workspaceId: args.workspaceId, kind: "spark", action: args.action, entityId: args.spark.id, expectedRevision, intentUpdatedAt: args.spark.updatedAt }),
  } as BarStockRetryOperation;
}

function canonicalEntity(snapshot: BarStockSnapshot | null, operation: BarStockRetryOperation): Assignment | Spark | null {
  if (!snapshot) return null;
  return operation.kind === "assignment"
    ? snapshot.assignments.find((row) => row.id === operation.entityId) ?? null
    : snapshot.sparks.find((row) => row.id === operation.entityId) ?? null;
}

async function dispatch(repository: BarStockRepository, scope: BarStockScope, operation: BarStockRetryOperation): Promise<BarStockMutationResult<Assignment | Spark>> {
  if (operation.kind === "assignment") {
    if (operation.action === "create") return repository.createAssignment(scope, operation.intent, operation.idempotencyKey!);
    if (operation.action === "update") return repository.updateAssignment(scope, operation.intent, operation.expectedRevision!);
    if (operation.action === "archive") return repository.archiveAssignment(scope, operation.entityId, operation.expectedRevision!);
    return repository.deleteAssignment(scope, operation.entityId, operation.expectedRevision!);
  }
  if (operation.action === "create") return repository.createSpark(scope, operation.intent, operation.idempotencyKey!);
  if (operation.action === "update") return repository.updateSpark(scope, operation.intent, operation.expectedRevision!);
  return repository.archiveSpark(scope, operation.entityId, operation.expectedRevision!);
}

export async function executeOperation(args: {
  repository: BarStockRepository;
  storage: RetryStorage;
  scope: BarStockScope;
  operation: BarStockRetryOperation;
  online: boolean;
  snapshot?: BarStockSnapshot | null;
}): Promise<OperationExecution> {
  const operation = { ...args.operation, attempts: args.operation.attempts + 1 } as BarStockRetryOperation;
  retainRetryOperation(args.storage, operation);
  if (!args.online) {
    return { operation, state: { status: "offline", operationId: operation.operationId, message: "Browser is offline; intent remains pending." }, row: null, acknowledged: false };
  }

  const canonical = canonicalEntity(args.snapshot ?? null, operation);
  if (operation.expectedRevision !== null && canonical && canonical.revision !== operation.expectedRevision) {
    return {
      operation,
      state: { status: "stale", operationId: operation.operationId, localIntent: operation.intent, canonical },
      row: canonical,
      acknowledged: false,
    };
  }

  let result: BarStockMutationResult<Assignment | Spark>;
  try {
    result = await dispatch(args.repository, args.scope, operation);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    retainRetryOperation(args.storage, { ...operation, lastError: message } as BarStockRetryOperation);
    return { operation, state: { status: "unavailable", operationId: operation.operationId, message }, row: null, acknowledged: false };
  }

  if (result.outcome === "saved" || result.outcome === "duplicate" || result.outcome === "deleted") {
    acknowledgeRetryOperation(args.storage, args.scope.workspaceId, operation.operationId);
    return { operation, state: { status: "saved", operationId: operation.operationId }, row: result.row, acknowledged: true, rpcOutcome: result.outcome };
  }
  if (result.outcome === "stale" && result.row) {
    return { operation, state: { status: "stale", operationId: operation.operationId, localIntent: operation.intent, canonical: result.row }, row: result.row, acknowledged: false, rpcOutcome: result.outcome };
  }
  const message = result.outcome === "failed" || result.outcome === "unavailable"
    ? result.error
    : `Canonical write returned ${result.outcome}.`;
  retainRetryOperation(args.storage, { ...operation, lastError: message } as BarStockRetryOperation);
  const status = result.outcome === "denied" ? "denied"
    : result.outcome === "conflict" || result.outcome === "linked" || result.outcome === "not_found" ? "conflict"
      : result.outcome === "unavailable" ? "unavailable" : "failed";
  return { operation, state: { status, operationId: operation.operationId, message }, row: result.row, acknowledged: false, rpcOutcome: result.outcome };
}

export async function reconcileRetryCache(args: {
  repository: BarStockRepository;
  storage: RetryStorage;
  scope: BarStockScope;
  snapshot: BarStockSnapshot;
  online: boolean;
  onTransition?: (operation: BarStockRetryOperation, state: BarStockPersistenceState) => void;
}): Promise<OperationExecution[]> {
  const results: OperationExecution[] = [];
  for (const operation of loadRetryCache(args.storage, args.scope.workspaceId)) {
    args.onTransition?.(operation, { status: "retrying", operationId: operation.operationId });
    results.push(await executeOperation({ ...args, operation }));
  }
  return results;
}

export async function reconcileWorkspacePersistence(args: {
  repository: BarStockRepository;
  storage: RetryStorage;
  scope: BarStockScope;
  online: boolean;
}): Promise<WorkspaceReconciliationResult> {
  const initial = await args.repository.hydrateWorkspace(args.scope);
  const executions = await reconcileRetryCache({
    ...args,
    snapshot: initial,
  });
  // Import after replaying the cache so a failed legacy write is retained for
  // the next explicit reconciliation instead of being attempted twice here.
  const legacy = await importLegacyBrowserData(args);
  const snapshot = executions.some((execution) => execution.acknowledged) || legacy.imported > 0
    ? await args.repository.hydrateWorkspace(args.scope)
    : initial;

  return {
    snapshot,
    executions,
    legacy,
    remainingRetryCount: loadRetryCache(args.storage, args.scope.workspaceId).length,
  };
}

export async function importLegacyBrowserData(args: {
  repository: BarStockRepository;
  storage: RetryStorage;
  scope: BarStockScope;
  online: boolean;
}): Promise<{ imported: number; malformed: number; pending: number }> {
  const legacy = await readLegacyImport(args.storage, args.scope.workspaceId);
  let imported = 0;
  let pending = 0;
  for (const row of legacy.assignments) {
    const operation = assignmentOperation({ workspaceId: args.scope.workspaceId, action: "create", assignment: row.canonical });
    operation.idempotencyKey = row.importKey;
    const result = await executeOperation({ ...args, operation });
    if (result.acknowledged) imported++; else pending++;
  }
  for (const row of legacy.sparks) {
    const operation = sparkOperation({ workspaceId: args.scope.workspaceId, action: "create", spark: row.canonical });
    operation.idempotencyKey = row.importKey;
    const result = await executeOperation({ ...args, operation });
    if (result.acknowledged) imported++; else pending++;
  }
  if (pending === 0 && (legacy.assignments.length > 0 || legacy.sparks.length > 0)) {
    markLegacyImportAcknowledged(args.storage, args.scope.workspaceId, legacy.sourceKeys);
  }
  return { imported, malformed: legacy.malformed, pending };
}
