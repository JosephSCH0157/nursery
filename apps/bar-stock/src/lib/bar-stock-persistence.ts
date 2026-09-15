import type { BarStockMutationResult, BarStockRepository, BarStockScope, BarStockSnapshot } from "./bar-stock-repository";
import type { BarStockPersistenceState } from "./bar-stock-state";
import {
  legacyAssignmentIsSatisfied,
  legacySparkIsSatisfied,
  markLegacyImportAcknowledged,
  readLegacyImport,
  type LegacyImportData,
} from "./legacy-import";
import type { Assignment, Spark } from "./model";
import {
  acknowledgeRetryOperation,
  createIdempotencyKey,
  deterministicOperationId,
  loadRetryCache,
  retainRetryOperation,
  saveRetryCache,
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

type LegacyOperation = {
  operation: BarStockRetryOperation;
  inferredAssignment: boolean;
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

function operationEntityKey(operation: Pick<BarStockRetryOperation, "kind" | "entityId">): string {
  return `${operation.kind}:${operation.entityId.toLowerCase()}`;
}

function isLegacyCreate(operation: BarStockRetryOperation): boolean {
  return operation.action === "create" && operation.idempotencyKey?.startsWith("legacy:") === true;
}

function legacyOperations(workspaceId: string, legacy: LegacyImportData): LegacyOperation[] {
  const assignments = legacy.assignments.map((row): LegacyOperation => {
    const operation = assignmentOperation({ workspaceId, action: "create", assignment: row.canonical });
    operation.idempotencyKey = row.importKey;
    return { operation, inferredAssignment: row.inferred };
  });
  const sparks = legacy.sparks.map((row): LegacyOperation => {
    const operation = sparkOperation({ workspaceId, action: "create", spark: row.canonical });
    operation.idempotencyKey = row.importKey;
    return { operation, inferredAssignment: false };
  });
  return [...assignments, ...sparks];
}

function compactLegacyRetryCache(
  storage: RetryStorage,
  workspaceId: string,
  current: readonly LegacyOperation[],
): Map<string, BarStockRetryOperation> {
  const currentByEntity = new Map(current.map((item) => [operationEntityKey(item.operation), item.operation]));
  const authoritativeCached = new Map<string, BarStockRetryOperation>();
  const compacted: BarStockRetryOperation[] = [];

  for (const operation of loadRetryCache(storage, workspaceId)) {
    const authoritative = currentByEntity.get(operationEntityKey(operation));
    if (!authoritative || !isLegacyCreate(operation)) {
      compacted.push(operation);
      continue;
    }
    if (operation.operationId === authoritative.operationId) {
      const existing = authoritativeCached.get(operation.operationId);
      if (!existing || operation.attempts >= existing.attempts) {
        authoritativeCached.set(operation.operationId, operation);
      }
    }
  }
  compacted.push(...authoritativeCached.values());
  saveRetryCache(storage, workspaceId, compacted);
  return authoritativeCached;
}

function legacyIntentIsSatisfied(item: LegacyOperation, canonical: Assignment | Spark): boolean {
  if (item.operation.kind === "assignment" && "name" in canonical) {
    return legacyAssignmentIsSatisfied(item.operation.intent, canonical, item.inferredAssignment);
  }
  if (item.operation.kind === "spark" && "body" in canonical) {
    return legacySparkIsSatisfied(item.operation.intent, canonical);
  }
  return false;
}

function acknowledgeSatisfiedLegacyOperation(
  storage: RetryStorage,
  workspaceId: string,
  operation: BarStockRetryOperation,
  canonical: Assignment | Spark,
): OperationExecution {
  acknowledgeRetryOperation(storage, workspaceId, operation.operationId);
  return {
    operation,
    state: { status: "saved", operationId: operation.operationId },
    row: canonical,
    acknowledged: true,
  };
}

function retainDivergentLegacyOperation(
  storage: RetryStorage,
  operation: BarStockRetryOperation,
  canonical: Assignment | Spark,
): OperationExecution {
  const message = "Legacy import differs from canonical state.";
  const retained = {
    ...operation,
    attempts: operation.attempts + 1,
    lastError: message,
  } as BarStockRetryOperation;
  retainRetryOperation(storage, retained);
  return {
    operation: retained,
    state: {
      status: "conflict",
      operationId: retained.operationId,
      message,
    },
    row: canonical,
    acknowledged: false,
    rpcOutcome: "conflict",
  };
}

export async function reconcileWorkspacePersistence(args: {
  repository: BarStockRepository;
  storage: RetryStorage;
  scope: BarStockScope;
  online: boolean;
}): Promise<WorkspaceReconciliationResult> {
  const initial = await args.repository.hydrateWorkspace(args.scope);
  const legacyData = await readLegacyImport(args.storage, args.scope.workspaceId);
  const currentLegacy = legacyOperations(args.scope.workspaceId, legacyData);
  const currentOperationIds = new Set(currentLegacy.map((item) => item.operation.operationId));
  const authoritativeCached = compactLegacyRetryCache(
    args.storage,
    args.scope.workspaceId,
    currentLegacy,
  );
  const retryOperations = loadRetryCache(args.storage, args.scope.workspaceId)
    .filter((operation) => !(isLegacyCreate(operation) && currentOperationIds.has(operation.operationId)));
  const executions = await reconcileOperations({ ...args, snapshot: initial }, retryOperations);
  const legacyResult = await reconcileLegacyImport({
    ...args,
    snapshot: initial,
    legacy: legacyData,
    operations: currentLegacy,
    authoritativeCached,
  });
  executions.push(...legacyResult.executions);
  const snapshot = executions.some((execution) => execution.acknowledged && execution.rpcOutcome !== undefined)
    ? await args.repository.hydrateWorkspace(args.scope)
    : initial;

  return {
    snapshot,
    executions,
    legacy: legacyResult.summary,
    remainingRetryCount: loadRetryCache(args.storage, args.scope.workspaceId).length,
  };
}

export async function importLegacyBrowserData(args: {
  repository: BarStockRepository;
  storage: RetryStorage;
  scope: BarStockScope;
  online: boolean;
}): Promise<{ imported: number; malformed: number; pending: number }> {
  const snapshot = await args.repository.hydrateWorkspace(args.scope);
  const legacy = await readLegacyImport(args.storage, args.scope.workspaceId);
  const operations = legacyOperations(args.scope.workspaceId, legacy);
  const authoritativeCached = compactLegacyRetryCache(args.storage, args.scope.workspaceId, operations);
  const result = await reconcileLegacyImport({
    ...args,
    snapshot,
    legacy,
    operations,
    authoritativeCached,
  });
  return result.summary;
}

async function reconcileOperations(
  args: Parameters<typeof reconcileRetryCache>[0],
  operations: readonly BarStockRetryOperation[],
): Promise<OperationExecution[]> {
  const results: OperationExecution[] = [];
  for (const operation of operations) {
    args.onTransition?.(operation, { status: "retrying", operationId: operation.operationId });
    results.push(await executeOperation({ ...args, operation }));
  }
  return results;
}

async function reconcileLegacyImport(args: {
  repository: BarStockRepository;
  storage: RetryStorage;
  scope: BarStockScope;
  online: boolean;
  snapshot: BarStockSnapshot;
  legacy: LegacyImportData;
  operations: readonly LegacyOperation[];
  authoritativeCached: ReadonlyMap<string, BarStockRetryOperation>;
}): Promise<{
  executions: OperationExecution[];
  summary: { imported: number; malformed: number; pending: number };
}> {
  let imported = 0;
  let pending = 0;
  const executions: OperationExecution[] = [];

  for (const item of args.operations) {
    const cached = args.authoritativeCached.get(item.operation.operationId);
    const operation = cached
      ? { ...item.operation, attempts: cached.attempts, lastError: cached.lastError } as BarStockRetryOperation
      : item.operation;
    const canonical = canonicalEntity(args.snapshot, operation);
    let result: OperationExecution;
    if (canonical && legacyIntentIsSatisfied(item, canonical)) {
      result = acknowledgeSatisfiedLegacyOperation(args.storage, args.scope.workspaceId, operation, canonical);
    } else if (canonical) {
      result = retainDivergentLegacyOperation(args.storage, operation, canonical);
    } else {
      result = await executeOperation({ ...args, operation });
    }
    executions.push(result);
    if (result.acknowledged) imported++; else pending++;
  }

  if (pending === 0 && args.legacy.malformed === 0 && args.operations.length > 0) {
    const currentOperationIds = new Set(args.operations.map((item) => item.operation.operationId));
    const currentRetriesRemain = loadRetryCache(args.storage, args.scope.workspaceId)
      .some((operation) => isLegacyCreate(operation) && currentOperationIds.has(operation.operationId));
    if (!currentRetriesRemain) {
      markLegacyImportAcknowledged(args.storage, args.scope.workspaceId, args.legacy.sourceKeys);
    }
  }
  return {
    executions,
    summary: { imported, malformed: args.legacy.malformed, pending },
  };
}
