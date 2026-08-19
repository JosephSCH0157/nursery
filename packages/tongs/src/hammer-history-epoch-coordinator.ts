export const HAMMER_HISTORY_EPOCH_SCHEMA = "forge.hammer-history-epoch" as const;
export const HAMMER_HISTORY_EPOCH_VERSION = 1 as const;
export const HAMMER_HISTORY_EPOCH_REASON = "legacy_history_unrecoverable" as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;
const STATE_HASH_RE = /^hammer-state:[0-9a-f]{8}$/;
const IDEMPOTENCY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const UTC_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;
const COMPONENT_KEYS = ["audio", "editorial_authority", "transcript", "visual_placements", "visual_timeline"] as const;

export type HammerHistoryEpochComponentHashes = Readonly<Record<(typeof COMPONENT_KEYS)[number], string>>;

export type HammerHistoryEpochEnvelopeV1 = Readonly<{
  schema: typeof HAMMER_HISTORY_EPOCH_SCHEMA;
  schema_version: typeof HAMMER_HISTORY_EPOCH_VERSION;
  epoch_id: string;
  workspace_id: string;
  workpiece_id: string;
  canonical_recording_id: string;
  recording_revision_id: string;
  base: Readonly<{
    editor_state_hash: string;
    component_sha256: HammerHistoryEpochComponentHashes;
  }>;
  creation: Readonly<{
    reason: typeof HAMMER_HISTORY_EPOCH_REASON;
    created_at: string;
    initiating_user_id: string;
  }>;
  predecessor: Readonly<{
    original_path: string;
    archive_path: string;
    sha256: string;
    bytes: number;
    registry_revision: number;
    registry_updated_at: string;
  }>;
  history: Readonly<{
    entries: readonly never[];
    undo_stack: readonly never[];
    redo_stack: readonly never[];
    checkpoints: readonly never[];
  }>;
  boundary: Readonly<{
    prior_history_status: "unavailable";
    merged: false;
    traversable: false;
    statement: "Prior undo history is unavailable and was not merged into this epoch.";
  }>;
}>;

export type HammerHistoryEpochRequest = Readonly<{
  workspaceId: string;
  workpieceId: string;
  canonicalRecordingId: string;
  revisionId: string;
  initiatingUserId: string;
  idempotencyKey: string;
  expectedRevisionUpdatedAt: string;
  expectedHistoryPath: string;
  expectedPredecessor: Readonly<{
    revision: number;
    updatedAt: string;
    sha256: string;
    bytes: number;
  }>;
  epochPath: string;
  envelope: HammerHistoryEpochEnvelopeV1;
}>;

export type HammerHistoryEpochRegistryRecord = Readonly<{
  path: string;
  fileType: string;
  contentType: "application/json";
  hashAlgo: "sha256";
  sha256: string;
  bytes: number;
  revision: number;
  updatedAt: string;
  storageBucket: string;
  storageKey: string;
}>;

export type HammerHistoryEpochPreflight = Readonly<{
  workspaceId: string;
  workpieceId: string;
  canonicalRecordingId: string;
  revisionId: string;
  activeRevisionId: string;
  revisionStatus: string;
  revisionUpdatedAt: string;
  historyPath: string | null;
  predecessor: HammerHistoryEpochRegistryRecord;
  predecessorBytes: Uint8Array;
}>;

export type HammerHistoryEpochCandidate = Readonly<{
  registry: HammerHistoryEpochRegistryRecord;
  bytes: Uint8Array;
  operationId: string | null;
}>;

export type HammerHistoryEpochCommitResult =
  | Readonly<{
    outcome: "committed" | "already_committed";
    epoch_id: string;
    transition_id: string;
    history_path: string;
    revision_updated_at: string;
    operation_fingerprint: string;
  }>
  | HammerHistoryEpochConflict;
export type HammerHistoryEpochReadbackResult =
  | Exclude<HammerHistoryEpochCommitResult, HammerHistoryEpochConflict>
  | Readonly<{ outcome: "absent" }>;
export type HammerHistoryEpochConflict = Readonly<{
  outcome: "conflict";
  code: string;
  terminal: true;
  retryable: false;
  details?: Readonly<Record<string, unknown>>;
}>;

export interface HammerHistoryEpochCoordinatorAdapter {
  readOperation(args: Pick<HammerHistoryEpochRequest, "workspaceId" | "workpieceId" | "revisionId" | "idempotencyKey">): Promise<HammerHistoryEpochReadbackResult>;
  readPreflight(args: Pick<HammerHistoryEpochRequest, "workspaceId" | "workpieceId" | "revisionId">): Promise<HammerHistoryEpochPreflight>;
  readCandidate(args: { workpieceId: string; path: string }): Promise<HammerHistoryEpochCandidate | null>;
  createCandidate(args: {
    workpieceId: string;
    path: string;
    fileType: "hammer_history_archive" | "hammer_history_epoch";
    bytes: Uint8Array;
    sha256: string;
    operationId: string;
  }): Promise<HammerHistoryEpochCandidate>;
  commit(args: {
    request: HammerHistoryEpochRequest;
    archive: HammerHistoryEpochRegistryRecord;
    epoch: HammerHistoryEpochRegistryRecord;
    epochSha256: string;
    epochBytes: number;
    operationFingerprint: string;
  }): Promise<HammerHistoryEpochCommitResult>;
  compensate(args: {
    workpieceId: string;
    revisionId: string;
    operationId: string;
    candidate: HammerHistoryEpochCandidate;
  }): Promise<"removed" | "absent" | "stale_or_referenced">;
}

function conflict(code: string, details?: Readonly<Record<string, unknown>>): HammerHistoryEpochConflict {
  return { outcome: "conflict", code, terminal: true, retryable: false, ...(details ? { details } : {}) };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_RE.test(value);
}

function isOpaqueTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length >= 20 && value.length <= 64 && Number.isFinite(Date.parse(value));
}

function isUtcTimestamp(value: unknown): value is string {
  return typeof value === "string" && UTC_TIMESTAMP_RE.test(value) && Number.isFinite(Date.parse(value));
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function arraysAreEmpty(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => Array.isArray(value[key]) && (value[key] as unknown[]).length === 0);
}

function validateEnvelope(value: unknown, request: Omit<HammerHistoryEpochRequest, "envelope">): HammerHistoryEpochEnvelopeV1 | HammerHistoryEpochConflict {
  if (!isObject(value) || !hasExactKeys(value, ["schema", "schema_version", "epoch_id", "workspace_id", "workpiece_id", "canonical_recording_id", "recording_revision_id", "base", "creation", "predecessor", "history", "boundary"])) {
    return conflict("history_epoch_envelope_shape_invalid");
  }
  if (value.schema !== HAMMER_HISTORY_EPOCH_SCHEMA || value.schema_version !== HAMMER_HISTORY_EPOCH_VERSION) return conflict("history_epoch_envelope_version_invalid");
  if (!isUuid(value.epoch_id) || value.workspace_id !== request.workspaceId || value.workpiece_id !== request.workpieceId
    || value.canonical_recording_id !== request.canonicalRecordingId || value.recording_revision_id !== request.revisionId) {
    return conflict("history_epoch_envelope_identity_conflict");
  }
  const base = value.base;
  if (!isObject(base) || !hasExactKeys(base, ["editor_state_hash", "component_sha256"]) || typeof base.editor_state_hash !== "string" || !STATE_HASH_RE.test(base.editor_state_hash)) {
    return conflict("history_epoch_base_invalid");
  }
  const components = base.component_sha256;
  if (!isObject(components) || !hasExactKeys(components, COMPONENT_KEYS) || !COMPONENT_KEYS.every((key) => isSha256(components[key]))) {
    return conflict("history_epoch_component_hashes_invalid");
  }
  const creation = value.creation;
  if (!isObject(creation) || !hasExactKeys(creation, ["reason", "created_at", "initiating_user_id"])
    || creation.reason !== HAMMER_HISTORY_EPOCH_REASON || !isUtcTimestamp(creation.created_at) || creation.initiating_user_id !== request.initiatingUserId) {
    return conflict("history_epoch_creation_invalid");
  }
  const predecessor = value.predecessor;
  if (!isObject(predecessor) || !hasExactKeys(predecessor, ["original_path", "archive_path", "sha256", "bytes", "registry_revision", "registry_updated_at"])
    || predecessor.original_path !== request.expectedHistoryPath || predecessor.archive_path !== buildHammerHistoryArchivePath(request.revisionId, request.expectedPredecessor.sha256)
    || predecessor.sha256 !== request.expectedPredecessor.sha256 || predecessor.bytes !== request.expectedPredecessor.bytes
    || predecessor.registry_revision !== request.expectedPredecessor.revision || predecessor.registry_updated_at !== request.expectedPredecessor.updatedAt) {
    return conflict("history_epoch_predecessor_envelope_conflict");
  }
  const history = value.history;
  if (!isObject(history) || !hasExactKeys(history, ["entries", "undo_stack", "redo_stack", "checkpoints"])
    || !arraysAreEmpty(history, ["entries", "undo_stack", "redo_stack", "checkpoints"])) return conflict("history_epoch_initial_ledger_not_empty");
  const boundary = value.boundary;
  if (!isObject(boundary) || !hasExactKeys(boundary, ["prior_history_status", "merged", "traversable", "statement"])
    || boundary.prior_history_status !== "unavailable" || boundary.merged !== false || boundary.traversable !== false
    || boundary.statement !== "Prior undo history is unavailable and was not merged into this epoch.") return conflict("history_epoch_boundary_invalid");
  return value as HammerHistoryEpochEnvelopeV1;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON cannot contain non-finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (isObject(value)) {
    const entries = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  throw new Error("Canonical JSON cannot contain undefined or unsupported values.");
}

export function canonicalHammerHistoryEpochBytes(envelope: HammerHistoryEpochEnvelopeV1): Uint8Array {
  return new TextEncoder().encode(canonicalize(envelope));
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function registryMatches(args: { candidate: HammerHistoryEpochCandidate; path: string; fileType: "hammer_history_archive" | "hammer_history_epoch"; sha256: string; bytes: Uint8Array }): boolean {
  const { registry } = args.candidate;
  return registry.path === args.path && registry.fileType === args.fileType && registry.contentType === "application/json"
    && registry.hashAlgo === "sha256" && registry.sha256 === args.sha256 && registry.bytes === args.bytes.length
    && registry.revision > 0 && isOpaqueTimestamp(registry.updatedAt) && bytesEqual(args.candidate.bytes, args.bytes);
}

export function buildHammerHistoryArchivePath(revisionId: string, predecessorSha256: string): string {
  return `hammer/revisions/${revisionId}/history/archive/${predecessorSha256}.history.v1.json`;
}

export function buildHammerHistoryEpochPath(revisionId: string, epochId: string): string {
  return `hammer/revisions/${revisionId}/history/epochs/${epochId}.v1.json`;
}

export function isProtectedHammerHistoryEpochPath(path: string): boolean {
  return /^hammer\/revisions\/[0-9a-f-]+\/history\/(?:archive\/[0-9a-f]{64}\.history\.v1\.json|epochs\/[0-9a-f-]+\.v1\.json)$/i.test(path);
}

async function compensateOwned(args: {
  adapter: HammerHistoryEpochCoordinatorAdapter;
  request: HammerHistoryEpochRequest;
  owned: readonly HammerHistoryEpochCandidate[];
  originalCode: string;
}): Promise<HammerHistoryEpochConflict> {
  for (const candidate of [...args.owned].reverse()) {
    const disposition = await args.adapter.compensate({
      workpieceId: args.request.workpieceId,
      revisionId: args.request.revisionId,
      operationId: args.request.idempotencyKey,
      candidate,
    });
    if (disposition === "stale_or_referenced") {
      return conflict("history_epoch_compensation_conflict", { original_code: args.originalCode, path: candidate.registry.path });
    }
  }
  return conflict(args.originalCode);
}

export async function coordinateHammerHistoryEpoch(args: {
  request: HammerHistoryEpochRequest;
  adapter: HammerHistoryEpochCoordinatorAdapter;
}): Promise<HammerHistoryEpochCommitResult> {
  const { request, adapter } = args;
  if (!isUuid(request.workspaceId) || !isUuid(request.workpieceId) || !isUuid(request.canonicalRecordingId)
    || !isUuid(request.revisionId) || !isUuid(request.initiatingUserId) || !IDEMPOTENCY_RE.test(request.idempotencyKey)
    || !isOpaqueTimestamp(request.expectedRevisionUpdatedAt) || !isOpaqueTimestamp(request.expectedPredecessor.updatedAt)
    || !isPositiveInteger(request.expectedPredecessor.revision) || !isPositiveInteger(request.expectedPredecessor.bytes)
    || !isSha256(request.expectedPredecessor.sha256)) return conflict("history_epoch_request_invalid");

  let prior: HammerHistoryEpochReadbackResult;
  try {
    prior = await adapter.readOperation(request);
  } catch {
    return conflict("history_epoch_readback_unavailable");
  }
  if (prior.outcome === "committed") return { ...prior, outcome: "already_committed" };

  const expectedEpochPath = buildHammerHistoryEpochPath(request.revisionId, request.envelope.epoch_id);
  if (request.epochPath !== expectedEpochPath) return conflict("history_epoch_path_invalid");
  const validatedEnvelope = validateEnvelope(request.envelope, request);
  if ("outcome" in validatedEnvelope) return validatedEnvelope;

  let preflight: HammerHistoryEpochPreflight;
  try {
    preflight = await adapter.readPreflight(request);
  } catch {
    return conflict("history_epoch_preflight_unavailable");
  }
  if (preflight.workspaceId !== request.workspaceId || preflight.workpieceId !== request.workpieceId
    || preflight.canonicalRecordingId !== request.canonicalRecordingId || preflight.revisionId !== request.revisionId
    || preflight.activeRevisionId !== request.revisionId || preflight.revisionStatus !== "active") return conflict("history_epoch_identity_conflict");
  if (preflight.revisionUpdatedAt !== request.expectedRevisionUpdatedAt) return conflict("history_epoch_revision_token_conflict");
  if (preflight.historyPath !== request.expectedHistoryPath || preflight.predecessor.path !== request.expectedHistoryPath) return conflict("history_epoch_pointer_conflict");
  if (preflight.predecessor.revision !== request.expectedPredecessor.revision || preflight.predecessor.updatedAt !== request.expectedPredecessor.updatedAt
    || preflight.predecessor.sha256 !== request.expectedPredecessor.sha256 || preflight.predecessor.bytes !== request.expectedPredecessor.bytes) {
    return conflict("history_epoch_predecessor_registry_conflict");
  }
  const predecessorActualSha = await sha256Hex(preflight.predecessorBytes);
  if (preflight.predecessorBytes.length !== request.expectedPredecessor.bytes || predecessorActualSha !== request.expectedPredecessor.sha256) {
    return conflict("history_epoch_predecessor_bytes_conflict");
  }

  const archivePath = buildHammerHistoryArchivePath(request.revisionId, predecessorActualSha);
  const epochBytes = canonicalHammerHistoryEpochBytes(validatedEnvelope);
  const epochSha256 = await sha256Hex(epochBytes);
  const operationFingerprint = await sha256Hex(new TextEncoder().encode(canonicalize({
    idempotency_key: request.idempotencyKey,
    workspace_id: request.workspaceId,
    workpiece_id: request.workpieceId,
    canonical_recording_id: request.canonicalRecordingId,
    recording_revision_id: request.revisionId,
    expected_revision_updated_at: request.expectedRevisionUpdatedAt,
    expected_history_path: request.expectedHistoryPath,
    predecessor: request.expectedPredecessor,
    archive_path: archivePath,
    epoch_path: request.epochPath,
    epoch_sha256: epochSha256,
    epoch_bytes: epochBytes.length,
  })));
  const owned: HammerHistoryEpochCandidate[] = [];

  const stage = async (path: string, fileType: "hammer_history_archive" | "hammer_history_epoch", bytes: Uint8Array, sha256: string): Promise<HammerHistoryEpochCandidate | HammerHistoryEpochConflict> => {
    const existing = await adapter.readCandidate({ workpieceId: request.workpieceId, path });
    if (existing) return registryMatches({ candidate: existing, path, fileType, sha256, bytes }) ? existing : conflict("history_epoch_staged_object_conflict", { path });
    const created = await adapter.createCandidate({ workpieceId: request.workpieceId, path, fileType, bytes, sha256, operationId: request.idempotencyKey });
    if (!registryMatches({ candidate: created, path, fileType, sha256, bytes }) || created.operationId !== request.idempotencyKey) {
      return conflict("history_epoch_staged_object_readback_conflict", { path });
    }
    owned.push(created);
    return created;
  };

  try {
    const archive = await stage(archivePath, "hammer_history_archive", preflight.predecessorBytes, predecessorActualSha);
    if ("outcome" in archive) return compensateOwned({ adapter, request, owned, originalCode: archive.code });
    const epoch = await stage(request.epochPath, "hammer_history_epoch", epochBytes, epochSha256);
    if ("outcome" in epoch) return compensateOwned({ adapter, request, owned, originalCode: epoch.code });

    let committed: HammerHistoryEpochCommitResult;
    try {
      committed = await adapter.commit({ request, archive: archive.registry, epoch: epoch.registry, epochSha256, epochBytes: epochBytes.length, operationFingerprint });
    } catch {
      const readback = await adapter.readOperation(request);
      if (readback.outcome === "committed") return readback;
      return compensateOwned({ adapter, request, owned, originalCode: "history_epoch_commit_ambiguous" });
    }
    if (committed.outcome === "conflict") return compensateOwned({ adapter, request, owned, originalCode: committed.code });
    const readback = await adapter.readOperation(request);
    if (readback.outcome !== "committed" || readback.transition_id !== committed.transition_id || readback.operation_fingerprint !== operationFingerprint) {
      return conflict("history_epoch_commit_readback_conflict");
    }
    return committed;
  } catch {
    return compensateOwned({ adapter, request, owned, originalCode: "history_epoch_staging_failed" });
  }
}

export function parseHammerHistoryEpochEnvelope(value: unknown, request: Omit<HammerHistoryEpochRequest, "envelope">): HammerHistoryEpochEnvelopeV1 | HammerHistoryEpochConflict {
  return validateEnvelope(value, request);
}
