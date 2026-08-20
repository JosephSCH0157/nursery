import type { HammerHistoryEpochComponentHashes, HammerHistoryEpochRegistryRecord } from "./hammer-history-epoch-coordinator.js";

export const HAMMER_HISTORY_EPOCH_HEAD_SCHEMA = "forge.hammer-history-epoch-head" as const;
export const HAMMER_HISTORY_EPOCH_HEAD_VERSION = 1 as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA_RE = /^[0-9a-f]{64}$/;
const STATE_RE = /^hammer-state:[0-9a-f]{8}$/;
const IDEMPOTENCY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;
const COMPONENTS = ["audio", "editorial_authority", "transcript", "visual_placements", "visual_timeline"] as const;

type JsonObject = Record<string, unknown>;
export type HammerHistoryComponentAuthority = Readonly<Record<(typeof COMPONENTS)[number], Readonly<{
  workpiece_id: string; path: string; sha256: string; bytes: number; registry_revision: number; registry_updated_at: string; content_type: "application/json";
}>>>;

export type HammerHistoryDocumentV1 = Readonly<{
  version: 1; workpieceId: string; sessionId: string; baseRevisionId: string;
  createdAt: string; updatedAt: string; headEntryId: string | null;
  entries: readonly Readonly<Record<string, unknown>>[];
  checkpoints: readonly Readonly<Record<string, unknown>>[];
  undoStack: readonly string[]; redoStack: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
}>;

export type HammerHistoryEpochHeadEnvelopeV1 = Readonly<{
  schema: typeof HAMMER_HISTORY_EPOCH_HEAD_SCHEMA; schema_version: 1;
  workspace_id: string; workpiece_id: string; canonical_recording_id: string; recording_revision_id: string;
  epoch_id: string; head_id: string; sequence: number;
  creation: Readonly<{ created_at: string; initiating_user_id: string }>;
  epoch_anchor: Readonly<{ path: string; sha256: string }>;
  parent: Readonly<{ head_id: string | null; path: string; sha256: string; registry_revision: number; registry_updated_at: string }>;
  base: Readonly<{ editor_state_hash: string; component_sha256: HammerHistoryEpochComponentHashes }>;
  result: Readonly<{ editor_state_hash: string; component_authority: HammerHistoryComponentAuthority }>;
  history: HammerHistoryDocumentV1;
  boundary: Readonly<{ prior_history_status: "unavailable"; merged: false; traversable: false; statement: "Prior undo history is unavailable and was not merged into this epoch." }>;
}>;

export type HammerHistoryEpochHeadRequest = Readonly<{
  workspaceId: string; workpieceId: string; canonicalRecordingId: string; revisionId: string; initiatingUserId: string;
  idempotencyKey: string; expectedRevisionUpdatedAt: string; expectedHistoryPath: string;
  expectedParent: Readonly<{ headId: string | null; sha256: string; revision: number; updatedAt: string; sequence: number }>;
  headPath: string; envelope: HammerHistoryEpochHeadEnvelopeV1;
}>;

export type HammerHistoryEpochHeadCandidate = Readonly<{ registry: HammerHistoryEpochRegistryRecord; bytes: Uint8Array; operationId: string | null }>;
export type HammerHistoryEpochHeadConflict = Readonly<{ outcome: "conflict"; code: string; terminal: true; retryable: false; details?: Readonly<Record<string, unknown>> }>;
export type HammerHistoryEpochHeadCommitResult = Readonly<{ outcome: "committed" | "already_committed"; head_id: string; transition_id: string; history_path: string; revision_updated_at: string; operation_fingerprint: string }> | HammerHistoryEpochHeadConflict;
export type HammerHistoryEpochHeadReadbackResult = Exclude<HammerHistoryEpochHeadCommitResult, HammerHistoryEpochHeadConflict> | Readonly<{ outcome: "absent" }> | HammerHistoryEpochHeadConflict;

export type HammerHistoryEpochHeadPreflight = Readonly<{
  workspaceId: string; workpieceId: string; canonicalRecordingId: string; revisionId: string; activeRevisionId: string;
  revisionStatus: string; revisionUpdatedAt: string; historyPath: string | null;
  epoch: Readonly<{ epochId: string; path: string; sha256: string; baseEditorStateHash: string; baseComponentSha256: HammerHistoryEpochComponentHashes }>;
  parent: HammerHistoryEpochHeadCandidate; parentHeadId: string | null; parentSequence: number;
}>;

export interface HammerHistoryEpochHeadCoordinatorAdapter {
  readOperation(args: HammerHistoryEpochHeadRequest & { operationFingerprint?: string }): Promise<HammerHistoryEpochHeadReadbackResult>;
  readPreflight(args: HammerHistoryEpochHeadRequest): Promise<HammerHistoryEpochHeadPreflight>;
  readCandidate(args: { workpieceId: string; path: string }): Promise<HammerHistoryEpochHeadCandidate | null>;
  createCandidate(args: { workpieceId: string; path: string; bytes: Uint8Array; sha256: string; operationId: string }): Promise<HammerHistoryEpochHeadCandidate>;
  commit(args: { request: HammerHistoryEpochHeadRequest; candidate: HammerHistoryEpochRegistryRecord; sha256: string; bytes: number; operationFingerprint: string; commitEnvelope: Record<string, unknown> }): Promise<HammerHistoryEpochHeadCommitResult>;
  compensate(args: { request: HammerHistoryEpochHeadRequest; candidate: HammerHistoryEpochHeadCandidate }): Promise<"removed" | "absent" | "stale_or_referenced">;
}

const conflict = (code: string, details?: Readonly<Record<string, unknown>>): HammerHistoryEpochHeadConflict => ({ outcome: "conflict", code, terminal: true, retryable: false, ...(details ? { details } : {}) });
const object = (v: unknown): v is JsonObject => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const exact = (v: JsonObject, keys: readonly string[]) => Object.keys(v).sort().join("|") === [...keys].sort().join("|");
const uuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const sha = (v: unknown): v is string => typeof v === "string" && SHA_RE.test(v);
const stateHash = (v: unknown): v is string => typeof v === "string" && STATE_RE.test(v);
const positive = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const timestamp = (v: unknown): v is string => typeof v === "string" && v.length >= 20 && v.length <= 64 && Number.isFinite(Date.parse(v));
const utcTimestamp = (v: unknown): v is string => timestamp(v) && UTC_RE.test(v);

function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (object(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  throw new Error("Canonical JSON cannot contain undefined or unsupported values.");
}

export function canonicalHammerHistoryEpochHeadBytes(envelope: HammerHistoryEpochHeadEnvelopeV1): Uint8Array {
  return new TextEncoder().encode(canonicalize(envelope));
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

const bytesEqual = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
export function buildHammerHistoryEpochHeadPath(revisionId: string, epochId: string, headId: string): string {
  return `hammer/revisions/${revisionId}/history/epochs/${epochId}/heads/${headId}.history.v1.json`;
}
export function isProtectedHammerHistoryEpochHeadPath(path: string): boolean {
  return /^hammer\/revisions\/[0-9a-f-]+\/history\/epochs\/[0-9a-f-]+\/heads\/[0-9a-f-]+\.history\.v1\.json$/i.test(path);
}

function validateHistory(value: unknown, request: HammerHistoryEpochHeadRequest): value is HammerHistoryDocumentV1 {
  if (!object(value)) return false;
  const allowed = ["version", "workpieceId", "sessionId", "baseRevisionId", "createdAt", "updatedAt", "headEntryId", "entries", "checkpoints", "undoStack", "redoStack", "metadata"];
  if (Object.keys(value).some((key) => !allowed.includes(key)) || value.version !== 1 || value.workpieceId !== request.workpieceId
    || typeof value.sessionId !== "string" || value.sessionId.length === 0 || !stateHash(value.baseRevisionId)
    || !utcTimestamp(value.createdAt) || !utcTimestamp(value.updatedAt) || !(value.headEntryId === null || typeof value.headEntryId === "string")
    || !Array.isArray(value.entries) || !Array.isArray(value.checkpoints) || !Array.isArray(value.undoStack) || !Array.isArray(value.redoStack)
    || !value.entries.every(object) || !value.checkpoints.every(object) || !value.undoStack.every((v) => typeof v === "string") || !value.redoStack.every((v) => typeof v === "string")
    || (value.metadata !== undefined && !object(value.metadata))) return false;
  const ids = new Set<string>();
  const entryKeys = ["id", "parentEntryId", "timestamp", "kind", "label", "forwardPatch", "inversePatch", "affectedSegmentIds", "affectedPlacementIds", "canonicalOperationDeltas", "toolId", "baseStateHash", "resultStateHash", "transactionId"];
  const kinds = new Set(["transcript_text_edit", "speaker_edit", "timing_adjustment", "segment_structure", "cleanup_tool", "visual_adjustment", "output_selection", "editor_state_change"]);
  for (const entry of value.entries) {
    if (Object.keys(entry).some((key) => !entryKeys.includes(key)) || typeof entry.id !== "string" || !entry.id || ids.has(entry.id) || !utcTimestamp(entry.timestamp)
      || !(entry.parentEntryId === null || typeof entry.parentEntryId === "string") || typeof entry.label !== "string" || !entry.label || !kinds.has(String(entry.kind))
      || !Array.isArray(entry.forwardPatch) || !Array.isArray(entry.inversePatch) || (!entry.forwardPatch.length && !entry.inversePatch.length)
      || ![...entry.forwardPatch, ...entry.inversePatch].every((patch) => object(patch) && typeof patch.path === "string" && patch.path.startsWith("/") && ["add", "remove", "replace"].includes(String(patch.op)) && Object.keys(patch).every((key) => ["op", "path", "value"].includes(key)) && (patch.op === "remove" || Object.hasOwn(patch, "value")))
      || (["affectedSegmentIds", "affectedPlacementIds"].some((key) => entry[key] !== undefined && (!Array.isArray(entry[key]) || !(entry[key] as unknown[]).every((item) => typeof item === "string"))))
      || (entry.baseStateHash !== undefined && !stateHash(entry.baseStateHash)) || (entry.resultStateHash !== undefined && !stateHash(entry.resultStateHash))) return false;
    ids.add(entry.id);
  }
  if (![...value.undoStack, ...value.redoStack].every((id) => ids.has(id))) return false;
  if (new Set([...value.undoStack, ...value.redoStack]).size !== value.undoStack.length + value.redoStack.length) return false;
  if ((value.undoStack.at(-1) ?? null) !== value.headEntryId) return false;
  if (!value.checkpoints.every((checkpoint) => Object.keys(checkpoint).every((key) => ["id", "createdAt", "label", "entryId", "snapshotRef"].includes(key)) && typeof checkpoint.id === "string" && utcTimestamp(checkpoint.createdAt) && typeof checkpoint.label === "string" && typeof checkpoint.entryId === "string" && ids.has(checkpoint.entryId))) return false;
  if (value.metadata && (Object.keys(value.metadata).some((key) => !["lastKnownSelectionSegmentId", "lastKnownTool"].includes(key)) || Object.values(value.metadata).some((item) => item !== null && typeof item !== "string"))) return false;
  const declaredResult = value.entries.find((entry) => entry.id === value.headEntryId)?.resultStateHash;
  if (declaredResult !== undefined && declaredResult !== request.envelope.result.editor_state_hash) return false;
  return value.baseRevisionId === request.envelope.base.editor_state_hash;
}

function validateAuthority(value: unknown): value is HammerHistoryComponentAuthority {
  if (!object(value) || !exact(value, COMPONENTS)) return false;
  return COMPONENTS.every((key) => {
    const row = value[key];
    return object(row) && exact(row, ["workpiece_id", "path", "sha256", "bytes", "registry_revision", "registry_updated_at", "content_type"])
      && uuid(row.workpiece_id) && typeof row.path === "string" && row.path.length > 0 && sha(row.sha256) && positive(row.bytes) && positive(row.registry_revision) && timestamp(row.registry_updated_at) && row.content_type === "application/json";
  });
}

function validateEnvelope(request: HammerHistoryEpochHeadRequest): HammerHistoryEpochHeadConflict | null {
  const v = request.envelope;
  if (!object(v) || !exact(v, ["schema", "schema_version", "workspace_id", "workpiece_id", "canonical_recording_id", "recording_revision_id", "epoch_id", "head_id", "sequence", "creation", "epoch_anchor", "parent", "base", "result", "history", "boundary"])) return conflict("history_epoch_head_envelope_shape_invalid");
  if (v.schema !== HAMMER_HISTORY_EPOCH_HEAD_SCHEMA || v.schema_version !== 1) return conflict("history_epoch_head_envelope_version_invalid");
  if (v.workspace_id !== request.workspaceId || v.workpiece_id !== request.workpieceId || v.canonical_recording_id !== request.canonicalRecordingId || v.recording_revision_id !== request.revisionId || !uuid(v.epoch_id) || !uuid(v.head_id) || !positive(v.sequence)) return conflict("history_epoch_head_identity_conflict");
  if (!object(v.creation) || !exact(v.creation, ["created_at", "initiating_user_id"]) || !utcTimestamp(v.creation.created_at) || v.creation.initiating_user_id !== request.initiatingUserId) return conflict("history_epoch_head_creation_invalid");
  if (!object(v.parent) || !exact(v.parent, ["head_id", "path", "sha256", "registry_revision", "registry_updated_at"]) || v.parent.path !== request.expectedHistoryPath || v.parent.head_id !== request.expectedParent.headId || v.parent.sha256 !== request.expectedParent.sha256 || v.parent.registry_revision !== request.expectedParent.revision || v.parent.registry_updated_at !== request.expectedParent.updatedAt) return conflict("history_epoch_head_parent_conflict");
  if (!object(v.epoch_anchor) || !exact(v.epoch_anchor, ["path", "sha256"]) || typeof v.epoch_anchor.path !== "string" || !sha(v.epoch_anchor.sha256)) return conflict("history_epoch_head_anchor_invalid");
  if (!object(v.base) || !exact(v.base, ["editor_state_hash", "component_sha256"]) || !stateHash(v.base.editor_state_hash) || !object(v.base.component_sha256) || !exact(v.base.component_sha256, COMPONENTS) || !COMPONENTS.every((k) => sha((v.base.component_sha256 as JsonObject)[k]))) return conflict("history_epoch_head_base_conflict");
  if (!object(v.result) || !exact(v.result, ["editor_state_hash", "component_authority"]) || !stateHash(v.result.editor_state_hash) || !validateAuthority(v.result.component_authority)) return conflict("history_epoch_head_component_authority_conflict");
  if (!validateHistory(v.history, request)) return conflict("history_epoch_head_history_invalid");
  if (!object(v.boundary) || !exact(v.boundary, ["prior_history_status", "merged", "traversable", "statement"]) || v.boundary.prior_history_status !== "unavailable" || v.boundary.merged !== false || v.boundary.traversable !== false || v.boundary.statement !== "Prior undo history is unavailable and was not merged into this epoch.") return conflict("history_epoch_head_boundary_invalid");
  return null;
}

function registryMatches(candidate: HammerHistoryEpochHeadCandidate, path: string, bytes: Uint8Array, digest: string): boolean {
  const r = candidate.registry;
  return r.path === path && r.fileType === "hammer_history_epoch_head" && r.contentType === "application/json" && r.hashAlgo === "sha256"
    && r.sha256 === digest && r.bytes === bytes.length && positive(r.revision) && timestamp(r.updatedAt) && bytesEqual(candidate.bytes, bytes);
}

export async function coordinateHammerHistoryEpochHead(args: { request: HammerHistoryEpochHeadRequest; adapter: HammerHistoryEpochHeadCoordinatorAdapter }): Promise<HammerHistoryEpochHeadCommitResult> {
  const { request, adapter } = args;
  if (![request.workspaceId, request.workpieceId, request.canonicalRecordingId, request.revisionId, request.initiatingUserId].every(uuid)
    || !IDEMPOTENCY_RE.test(request.idempotencyKey) || !timestamp(request.expectedRevisionUpdatedAt) || !timestamp(request.expectedParent.updatedAt)
    || !positive(request.expectedParent.revision) || !Number.isSafeInteger(request.expectedParent.sequence) || request.expectedParent.sequence < 0 || !sha(request.expectedParent.sha256)) return conflict("history_epoch_head_request_invalid");
  const envelopeError = validateEnvelope(request);
  if (envelopeError) return envelopeError;
  if (request.envelope.sequence !== request.expectedParent.sequence + 1 || (request.envelope.sequence === 1) !== (request.expectedParent.headId === null)) return conflict("history_epoch_head_sequence_conflict");
  if (request.headPath !== buildHammerHistoryEpochHeadPath(request.revisionId, request.envelope.epoch_id, request.envelope.head_id)) return conflict("history_epoch_head_path_invalid");

  const bytes = canonicalHammerHistoryEpochHeadBytes(request.envelope);
  const digest = await sha256(bytes);
  const fingerprint = await sha256(new TextEncoder().encode(canonicalize({ idempotency_key: request.idempotencyKey, expected_revision_updated_at: request.expectedRevisionUpdatedAt, expected_history_path: request.expectedHistoryPath, parent: request.expectedParent, head_path: request.headPath, head_sha256: digest, head_bytes: bytes.length, envelope: request.envelope })));

  let prior: HammerHistoryEpochHeadReadbackResult;
  try { prior = await adapter.readOperation({ ...request, operationFingerprint: fingerprint }); } catch { return conflict("history_epoch_head_readback_unavailable"); }
  if (prior.outcome === "committed" || prior.outcome === "already_committed") return { ...prior, outcome: "already_committed" };
  if (prior.outcome === "conflict") return prior;

  let preflight: HammerHistoryEpochHeadPreflight;
  try { preflight = await adapter.readPreflight(request); } catch { return conflict("history_epoch_head_preflight_unavailable"); }
  if (preflight.workspaceId !== request.workspaceId || preflight.workpieceId !== request.workpieceId || preflight.canonicalRecordingId !== request.canonicalRecordingId || preflight.revisionId !== request.revisionId || preflight.activeRevisionId !== request.revisionId || preflight.revisionStatus !== "active" || preflight.epoch.epochId !== request.envelope.epoch_id) return conflict("history_epoch_head_identity_conflict");
  if (preflight.revisionUpdatedAt !== request.expectedRevisionUpdatedAt) return conflict("history_epoch_head_revision_token_conflict");
  if (preflight.historyPath !== request.expectedHistoryPath || preflight.parent.registry.path !== request.expectedHistoryPath) return conflict("history_epoch_head_pointer_conflict");
  if (preflight.parentHeadId !== request.expectedParent.headId || preflight.parentSequence !== request.expectedParent.sequence || preflight.parent.registry.sha256 !== request.expectedParent.sha256 || preflight.parent.registry.revision !== request.expectedParent.revision || preflight.parent.registry.updatedAt !== request.expectedParent.updatedAt) return conflict("history_epoch_head_parent_registry_conflict");
  if (preflight.epoch.path !== request.envelope.epoch_anchor.path || preflight.epoch.sha256 !== request.envelope.epoch_anchor.sha256 || preflight.epoch.baseEditorStateHash !== request.envelope.base.editor_state_hash || canonicalize(preflight.epoch.baseComponentSha256) !== canonicalize(request.envelope.base.component_sha256)) return conflict("history_epoch_head_anchor_conflict");
  if (preflight.parent.bytes.length !== preflight.parent.registry.bytes || await sha256(preflight.parent.bytes) !== preflight.parent.registry.sha256) return conflict("history_epoch_head_parent_bytes_conflict");

  let candidate: HammerHistoryEpochHeadCandidate;
  let owned = false;
  try {
    const existing = await adapter.readCandidate({ workpieceId: request.workpieceId, path: request.headPath });
    if (existing) {
      if (!registryMatches(existing, request.headPath, bytes, digest)) return conflict("history_epoch_head_staged_object_conflict", { path: request.headPath });
      candidate = existing;
    } else {
      candidate = await adapter.createCandidate({ workpieceId: request.workpieceId, path: request.headPath, bytes, sha256: digest, operationId: request.idempotencyKey });
      owned = true;
      if (!registryMatches(candidate, request.headPath, bytes, digest) || candidate.operationId !== request.idempotencyKey) {
        const disposition = await adapter.compensate({ request, candidate });
        return disposition === "stale_or_referenced" ? conflict("history_epoch_head_compensation_conflict", { original_code: "history_epoch_head_staged_object_readback_conflict" }) : conflict("history_epoch_head_staged_object_readback_conflict");
      }
    }
    const commitEnvelope = { ...request.envelope, artifact: { path: request.headPath, sha256: digest, bytes: bytes.length, registry_revision: candidate.registry.revision, registry_updated_at: candidate.registry.updatedAt } };
    let result: HammerHistoryEpochHeadCommitResult;
    try { result = await adapter.commit({ request, candidate: candidate.registry, sha256: digest, bytes: bytes.length, operationFingerprint: fingerprint, commitEnvelope }); }
    catch {
      const readback = await adapter.readOperation({ ...request, operationFingerprint: fingerprint });
      if (readback.outcome === "committed" || readback.outcome === "already_committed") return readback;
      if (!owned) return conflict("history_epoch_head_commit_ambiguous");
      const disposition = await adapter.compensate({ request, candidate });
      return disposition === "stale_or_referenced" ? conflict("history_epoch_head_compensation_conflict", { original_code: "history_epoch_head_commit_ambiguous" }) : conflict("history_epoch_head_commit_ambiguous");
    }
    if (result.outcome === "conflict") {
      if (owned && await adapter.compensate({ request, candidate }) === "stale_or_referenced") return conflict("history_epoch_head_compensation_conflict", { original_code: result.code });
      return result;
    }
    const readback = await adapter.readOperation({ ...request, operationFingerprint: fingerprint });
    if ((readback.outcome !== "committed" && readback.outcome !== "already_committed") || readback.head_id !== request.envelope.head_id || readback.operation_fingerprint !== fingerprint) return conflict("history_epoch_head_commit_readback_conflict");
    return result;
  } catch {
    if (owned && candidate!) await adapter.compensate({ request, candidate });
    return conflict("history_epoch_head_staging_failed");
  }
}
