export type HearthOperationScope = Readonly<{
  workspaceId: string | null;
  workpieceId: string | null;
  draftId: string | null;
  draftVersion: number | null;
  revisionId: string | null;
}>;

export type HearthOperationToken = Readonly<{
  authorityId: string;
  operationId: string;
  lane: string;
  sequence: number;
  contextEpoch: number;
  scope: HearthOperationScope;
  supersedesLane: boolean;
}>;

export type HearthOperationAuthority = Readonly<{
  updateScope: (scope: HearthOperationScope) => void;
  begin: (lane: string, options?: { supersedeLane?: boolean }) => HearthOperationToken;
  isCurrent: (token: HearthOperationToken) => boolean;
  commit: (token: HearthOperationToken, effect: () => void) => boolean;
  invalidate: (lane?: string) => void;
  readScope: () => HearthOperationScope;
}>;

export type HearthOperationAuthorityOptions = Readonly<{
  createAuthorityId?: () => string;
}>;

let authoritySequence = 0;

function normalizeId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeDraftVersion(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeHearthOperationScope(scope: HearthOperationScope): HearthOperationScope {
  return Object.freeze({
    workspaceId: normalizeId(scope.workspaceId),
    workpieceId: normalizeId(scope.workpieceId),
    draftId: normalizeId(scope.draftId),
    draftVersion: normalizeDraftVersion(scope.draftVersion),
    revisionId: normalizeId(scope.revisionId),
  });
}

export function areHearthOperationScopesEqual(
  left: HearthOperationScope,
  right: HearthOperationScope,
): boolean {
  return left.workspaceId === right.workspaceId
    && left.workpieceId === right.workpieceId
    && left.draftId === right.draftId
    && left.draftVersion === right.draftVersion
    && left.revisionId === right.revisionId;
}

function createDefaultAuthorityId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `hearth-operation-authority:${crypto.randomUUID()}`;
    }
  } catch {
    // A deterministic per-process fallback still prevents producer recreation collisions.
  }
  authoritySequence += 1;
  return `hearth-operation-authority:${Date.now().toString(36)}:${authoritySequence}`;
}

export function createHearthOperationAuthority(
  initialScope: HearthOperationScope,
  options: HearthOperationAuthorityOptions = {},
): HearthOperationAuthority {
  const authorityId = normalizeId(options.createAuthorityId?.()) ?? createDefaultAuthorityId();
  let currentScope = normalizeHearthOperationScope(initialScope);
  let contextEpoch = 1;
  let operationSequence = 0;
  const latestOperationByLane = new Map<string, string>();

  const updateScope = (nextScope: HearthOperationScope): void => {
    const normalized = normalizeHearthOperationScope(nextScope);
    if (areHearthOperationScopesEqual(currentScope, normalized)) return;
    currentScope = normalized;
    contextEpoch += 1;
    latestOperationByLane.clear();
  };

  const begin = (
    laneInput: string,
    beginOptions: { supersedeLane?: boolean } = {},
  ): HearthOperationToken => {
    const lane = normalizeId(laneInput);
    if (!lane) throw new Error("Hearth operation lane is required.");
    operationSequence += 1;
    const supersedesLane = beginOptions.supersedeLane !== false;
    const operationId = `${authorityId}:${operationSequence}`;
    if (supersedesLane) latestOperationByLane.set(lane, operationId);
    return Object.freeze({
      authorityId,
      operationId,
      lane,
      sequence: operationSequence,
      contextEpoch,
      scope: currentScope,
      supersedesLane,
    });
  };

  const isCurrent = (token: HearthOperationToken): boolean => {
    if (token.authorityId !== authorityId) return false;
    if (token.contextEpoch !== contextEpoch) return false;
    if (!areHearthOperationScopesEqual(token.scope, currentScope)) return false;
    if (!token.supersedesLane) return true;
    return latestOperationByLane.get(token.lane) === token.operationId;
  };

  const commit = (token: HearthOperationToken, effect: () => void): boolean => {
    if (!isCurrent(token)) return false;
    effect();
    return true;
  };

  const invalidate = (laneInput?: string): void => {
    const lane = normalizeId(laneInput);
    if (lane) {
      latestOperationByLane.delete(lane);
      return;
    }
    contextEpoch += 1;
    latestOperationByLane.clear();
  };

  return Object.freeze({
    updateScope,
    begin,
    isCurrent,
    commit,
    invalidate,
    readScope: () => currentScope,
  });
}
