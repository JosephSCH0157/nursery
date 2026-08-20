import { HAMMER_EDITOR_STATE_HASH_ALGORITHM, HAMMER_EDITOR_STATE_LEGACY_HASH_ALGORITHM, normalizeHammerHistoryDocument, type HammerEditorStateHashAlgorithm, type HammerHistoryDocumentV1 } from "../editor/hammerWorkspaceHistory";
import { tongsFetch } from "./tongsFetch";
import { parseTongsReadFileResponse } from "./tongsReadFileResponse";

export const HAMMER_HISTORY_EPOCH_SCHEMA = "forge.hammer-history-epoch" as const;
export const HAMMER_HISTORY_EPOCH_HEAD_SCHEMA = "forge.hammer-history-epoch-head" as const;
const BOUNDARY_STATEMENT = "Prior undo history is unavailable and was not merged into this epoch." as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA_RE = /^[0-9a-f]{64}$/;
const STATE_RE = /^hammer-state:[0-9a-f]{8}$/;
const COMPONENTS = ["audio", "editorial_authority", "transcript", "visual_placements", "visual_timeline"] as const;
type Component = (typeof COMPONENTS)[number];
export type HammerHistoryComponentPaths = Readonly<Record<Component, string>>;
type JsonObject = Record<string, unknown>;
type Fetcher = typeof tongsFetch;

export type HammerHistoryRegistryTuple = Readonly<{
  path: string; sha256: string; bytes: number; revision: number; updated_at: string; storage_bucket: string; storage_key: string;
}>;
export type HammerHistoryComponentHashes = Readonly<Record<Component, string>>;
export type HammerHistoryComponentAuthority = Readonly<Record<Component, Readonly<{ workpiece_id: string; path: string; sha256: string; bytes: number; registry_revision: number; registry_updated_at: string; content_type: "application/json" }>>>;
export type HammerHistoryBoundary = Readonly<{ prior_history_status: "unavailable"; merged: false; traversable: false; statement: typeof BOUNDARY_STATEMENT }>;

export type HammerHistoryEpochEnvelopeV1 = Readonly<{
  schema: typeof HAMMER_HISTORY_EPOCH_SCHEMA; schema_version: 1; epoch_id: string; workspace_id: string; workpiece_id: string;
  canonical_recording_id: string; recording_revision_id: string;
  base: Readonly<{ editor_state_hash: string; component_sha256: HammerHistoryComponentHashes }>;
  creation: Readonly<{ reason: "legacy_history_unrecoverable"; created_at: string; initiating_user_id: string }>;
  predecessor: Readonly<{ original_path: string; archive_path: string; sha256: string; bytes: number; registry_revision: number; registry_updated_at: string }>;
  history: Readonly<{ entries: readonly never[]; undo_stack: readonly never[]; redo_stack: readonly never[]; checkpoints: readonly never[] }>;
  boundary: HammerHistoryBoundary;
}>;
export type HammerHistoryEpochHeadEnvelopeV1 = Readonly<{
  schema: typeof HAMMER_HISTORY_EPOCH_HEAD_SCHEMA; schema_version: 1; workspace_id: string; workpiece_id: string;
  canonical_recording_id: string; recording_revision_id: string; epoch_id: string; head_id: string; sequence: number;
  creation: Readonly<{ created_at: string; initiating_user_id: string }>;
  epoch_anchor: Readonly<{ path: string; sha256: string }>;
  parent: Readonly<{ head_id: string | null; path: string; sha256: string; registry_revision: number; registry_updated_at: string }>;
  base: Readonly<{ editor_state_hash: string; component_sha256: HammerHistoryComponentHashes; hash_algorithm?: HammerEditorStateHashAlgorithm; canonical_editor_state_hash?: string }>;
  result: Readonly<{ editor_state_hash: string; component_authority: HammerHistoryComponentAuthority; hash_algorithm?: HammerEditorStateHashAlgorithm }>;
  history: HammerHistoryDocumentV1; boundary: HammerHistoryBoundary;
}>;

export type HammerHistoryHydrationIdentity = Readonly<{ workspaceId: string; workpieceId: string; canonicalRecordingId: string; revisionId: string; historyPath: string; revisionUpdatedAt: string }>;
type DurableBasis = Readonly<{ revision_updated_at: string; history_path: string; registry: HammerHistoryRegistryTuple }>;
export type HammerRevisionHistoryHydration =
  | Readonly<{ kind: "legacy_history"; pointer: string; document: HammerHistoryDocumentV1; registry: HammerHistoryRegistryTuple | null }>
  | Readonly<{ kind: "epoch_anchor"; pointer: string; epoch: HammerHistoryEpochEnvelopeV1; sequence: 0; document: HammerHistoryDocumentV1; durable_basis: DurableBasis }>
  | Readonly<{ kind: "epoch_head"; pointer: string; epoch_id: string; head_id: string; sequence: number; document: HammerHistoryDocumentV1; parent: HammerHistoryEpochHeadEnvelopeV1["parent"]; epoch_anchor: HammerHistoryEpochHeadEnvelopeV1["epoch_anchor"]; base: HammerHistoryEpochHeadEnvelopeV1["base"]; result: HammerHistoryEpochHeadEnvelopeV1["result"]; boundary: HammerHistoryBoundary; durable_basis: DurableBasis }>;
export type HammerRevisionHistoryHydrationResult =
  | Readonly<{ ok: true; status: number; hydration: HammerRevisionHistoryHydration }>
  | Readonly<{ ok: false; status: number; classification: "missing" | "malformed" | "unauthorized" | "rejected" | "unsupported" | "identity_conflict" | "registry_conflict" | "pointer_invalid"; error: string }>;

const object = (value: unknown): value is JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const exact = (value: JsonObject, keys: readonly string[]) => Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const uuid = (value: unknown): value is string => typeof value === "string" && UUID_RE.test(value);
const sha = (value: unknown): value is string => typeof value === "string" && SHA_RE.test(value);
const state = (value: unknown): value is string => typeof value === "string" && STATE_RE.test(value);
const algorithm = (value: unknown): value is HammerEditorStateHashAlgorithm => value === HAMMER_EDITOR_STATE_HASH_ALGORITHM || value === HAMMER_EDITOR_STATE_LEGACY_HASH_ALGORITHM;
const positive = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const timestamp = (value: unknown): value is string => typeof value === "string" && value.length >= 20 && value.length <= 64 && Number.isFinite(Date.parse(value));
const utc = (value: unknown): value is string => timestamp(value) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value);

function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (object(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  throw new Error("Canonical JSON cannot contain unsupported values.");
}
export function serializeHammerHistoryEpochEnvelope(value: HammerHistoryEpochEnvelopeV1): string { return canonicalize(value); }
export function serializeHammerHistoryEpochHeadEnvelope(value: HammerHistoryEpochHeadEnvelopeV1): string { return canonicalize(value); }
export function serializeHammerHistoryTransitionRequest(value: unknown): string { return canonicalize(value); }
async function sha256(value: string): Promise<string> { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }

function validateBoundary(value: unknown): value is HammerHistoryBoundary {
  return object(value) && exact(value, ["prior_history_status", "merged", "traversable", "statement"])
    && value.prior_history_status === "unavailable" && value.merged === false && value.traversable === false && value.statement === BOUNDARY_STATEMENT;
}
function validateHashes(value: unknown): value is HammerHistoryComponentHashes { return object(value) && exact(value, COMPONENTS) && COMPONENTS.every((key) => sha(value[key])); }
function validateAuthority(value: unknown): value is HammerHistoryComponentAuthority {
  return object(value) && exact(value, COMPONENTS) && COMPONENTS.every((key) => { const row = value[key]; return object(row) && exact(row, ["workpiece_id", "path", "sha256", "bytes", "registry_revision", "registry_updated_at", "content_type"]) && uuid(row.workpiece_id) && typeof row.path === "string" && row.path.length > 0 && sha(row.sha256) && positive(row.bytes) && positive(row.registry_revision) && timestamp(row.registry_updated_at) && row.content_type === "application/json"; });
}

function strictHistory(value: unknown, workpieceId: string, baseHash: string, resultHash?: string): HammerHistoryDocumentV1 | null {
  if (!object(value) || value.version !== 1 || value.workpieceId !== workpieceId || typeof value.sessionId !== "string" || !value.sessionId || value.baseRevisionId !== baseHash || !utc(value.createdAt) || !utc(value.updatedAt)
    || !(value.headEntryId === null || typeof value.headEntryId === "string") || !Array.isArray(value.entries) || !Array.isArray(value.checkpoints) || !Array.isArray(value.undoStack) || !Array.isArray(value.redoStack) || !value.entries.every(object) || !value.checkpoints.every(object)) return null;
  const allowedRoot = ["version", "workpieceId", "sessionId", "baseRevisionId", "createdAt", "updatedAt", "headEntryId", "entries", "checkpoints", "undoStack", "redoStack", "metadata"];
  if (Object.keys(value).some((key) => !allowedRoot.includes(key))) return null;
  const ids = new Set<string>();
  for (const entry of value.entries) {
    if (typeof entry.id !== "string" || !entry.id || ids.has(entry.id) || !utc(entry.timestamp) || !Array.isArray(entry.forwardPatch) || !Array.isArray(entry.inversePatch) || (!entry.forwardPatch.length && !entry.inversePatch.length)) return null;
    ids.add(entry.id);
  }
  if (!value.undoStack.every((id) => typeof id === "string" && ids.has(id)) || !value.redoStack.every((id) => typeof id === "string" && ids.has(id)) || new Set([...value.undoStack, ...value.redoStack]).size !== value.undoStack.length + value.redoStack.length || (value.undoStack.at(-1) ?? null) !== value.headEntryId) return null;
  const normalized = normalizeHammerHistoryDocument(value, { workpieceId, sessionId: value.sessionId, baseRevisionId: baseHash });
  if (normalized.entries.length !== value.entries.length || normalized.checkpoints.length !== value.checkpoints.length || normalized.undoStack.length !== value.undoStack.length || normalized.redoStack.length !== value.redoStack.length) return null;
  const headResult = normalized.entries.find((entry) => entry.id === normalized.headEntryId)?.resultStateHash;
  if (resultHash && headResult && headResult !== resultHash) return null;
  return normalized;
}

export function validateHammerHistoryEpochEnvelope(value: unknown, identity: HammerHistoryHydrationIdentity): HammerHistoryEpochEnvelopeV1 | null {
  if (!object(value) || !exact(value, ["schema", "schema_version", "epoch_id", "workspace_id", "workpiece_id", "canonical_recording_id", "recording_revision_id", "base", "creation", "predecessor", "history", "boundary"]) || value.schema !== HAMMER_HISTORY_EPOCH_SCHEMA || value.schema_version !== 1 || !uuid(value.epoch_id)
    || value.workspace_id !== identity.workspaceId || value.workpiece_id !== identity.workpieceId || value.canonical_recording_id !== identity.canonicalRecordingId || value.recording_revision_id !== identity.revisionId) return null;
  const base = value.base; const creation = value.creation; const predecessor = value.predecessor; const history = value.history;
  if (!object(base) || !exact(base, ["editor_state_hash", "component_sha256"]) || !state(base.editor_state_hash) || !validateHashes(base.component_sha256)
    || !object(creation) || !exact(creation, ["reason", "created_at", "initiating_user_id"]) || creation.reason !== "legacy_history_unrecoverable" || !utc(creation.created_at) || !uuid(creation.initiating_user_id)
    || !object(predecessor) || !exact(predecessor, ["original_path", "archive_path", "sha256", "bytes", "registry_revision", "registry_updated_at"]) || typeof predecessor.original_path !== "string" || predecessor.archive_path !== `hammer/revisions/${identity.revisionId}/history/archive/${String(predecessor.sha256)}.history.v1.json` || !sha(predecessor.sha256) || !positive(predecessor.bytes) || !positive(predecessor.registry_revision) || !timestamp(predecessor.registry_updated_at)
    || !object(history) || !exact(history, ["entries", "undo_stack", "redo_stack", "checkpoints"]) || ![history.entries, history.undo_stack, history.redo_stack, history.checkpoints].every((items) => Array.isArray(items) && items.length === 0) || !validateBoundary(value.boundary)) return null;
  const expectedPath = `hammer/revisions/${identity.revisionId}/history/epochs/${String(value.epoch_id)}.v1.json`;
  return identity.historyPath === expectedPath ? value as HammerHistoryEpochEnvelopeV1 : null;
}

export function validateHammerHistoryEpochHeadEnvelope(value: unknown, identity: HammerHistoryHydrationIdentity): HammerHistoryEpochHeadEnvelopeV1 | null {
  if (!object(value) || !exact(value, ["schema", "schema_version", "workspace_id", "workpiece_id", "canonical_recording_id", "recording_revision_id", "epoch_id", "head_id", "sequence", "creation", "epoch_anchor", "parent", "base", "result", "history", "boundary"]) || value.schema !== HAMMER_HISTORY_EPOCH_HEAD_SCHEMA || value.schema_version !== 1 || !uuid(value.epoch_id) || !uuid(value.head_id) || !positive(value.sequence)
    || value.workspace_id !== identity.workspaceId || value.workpiece_id !== identity.workpieceId || value.canonical_recording_id !== identity.canonicalRecordingId || value.recording_revision_id !== identity.revisionId) return null;
  const creation = value.creation; const anchor = value.epoch_anchor; const parent = value.parent; const base = value.base; const result = value.result;
  if (!object(creation) || !exact(creation, ["created_at", "initiating_user_id"]) || !utc(creation.created_at) || !uuid(creation.initiating_user_id)
    || !object(anchor) || !exact(anchor, ["path", "sha256"]) || anchor.path !== `hammer/revisions/${identity.revisionId}/history/epochs/${String(value.epoch_id)}.v1.json` || !sha(anchor.sha256)
    || !object(parent) || !exact(parent, ["head_id", "path", "sha256", "registry_revision", "registry_updated_at"]) || !sha(parent.sha256) || !positive(parent.registry_revision) || !timestamp(parent.registry_updated_at)
    || (value.sequence === 1 ? parent.head_id !== null || parent.path !== anchor.path : !uuid(parent.head_id) || parent.path !== `hammer/revisions/${identity.revisionId}/history/epochs/${String(value.epoch_id)}/heads/${String(parent.head_id)}.history.v1.json`)
    || !object(base) || !(exact(base, ["editor_state_hash", "component_sha256"]) || exact(base, ["editor_state_hash", "component_sha256", "hash_algorithm", "canonical_editor_state_hash"])) || !state(base.editor_state_hash) || !validateHashes(base.component_sha256)
    || ("hash_algorithm" in base && (base.hash_algorithm !== HAMMER_EDITOR_STATE_LEGACY_HASH_ALGORITHM || !state(base.canonical_editor_state_hash)))
    || !object(result) || !(exact(result, ["editor_state_hash", "component_authority"]) || exact(result, ["editor_state_hash", "component_authority", "hash_algorithm"])) || !state(result.editor_state_hash) || !validateAuthority(result.component_authority)
    || ("hash_algorithm" in result && !algorithm(result.hash_algorithm)) || !validateBoundary(value.boundary)) return null;
  const path = `hammer/revisions/${identity.revisionId}/history/epochs/${String(value.epoch_id)}/heads/${String(value.head_id)}.history.v1.json`;
  if (identity.historyPath !== path || !strictHistory(value.history, identity.workpieceId, String(base.editor_state_hash), String(result.editor_state_hash))) return null;
  return { ...value, history: strictHistory(value.history, identity.workpieceId, String(base.editor_state_hash), String(result.editor_state_hash))! } as HammerHistoryEpochHeadEnvelopeV1;
}

function registry(fileRow: Record<string, unknown> | null, pointer: string, workpieceId: string): HammerHistoryRegistryTuple | null {
  if (!fileRow || fileRow.path !== pointer || fileRow.hash_algo !== "sha256" || !sha(fileRow.hash_value) || !positive(fileRow.bytes) || !positive(fileRow.revision) || !timestamp(fileRow.updated_at) || fileRow.storage_bucket !== "forge-workpieces" || fileRow.storage_key !== `workpieces/${workpieceId}/${pointer}`) return null;
  return { path: pointer, sha256: fileRow.hash_value, bytes: fileRow.bytes, revision: fileRow.revision, updated_at: fileRow.updated_at, storage_bucket: fileRow.storage_bucket, storage_key: fileRow.storage_key };
}

export async function loadHammerHistoryComponentAuthority(args: { workpieceId: string; paths: Readonly<Record<Component, string>>; fetcher?: Fetcher }): Promise<HammerHistoryComponentAuthority> {
  const rows = await Promise.all(COMPONENTS.map(async (component) => {
    const path = args.paths[component];
    const response = await (args.fetcher ?? tongsFetch)(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/read-file?path=${encodeURIComponent(path)}`, { method: "GET", timeoutMs: 30_000 });
    const payload = await response.json().catch(() => null);
    const parsed = parseTongsReadFileResponse<unknown>({ status: response.status, responseOk: response.ok, payload });
    if (parsed.kind !== "present") throw new Error(`Canonical ${component} authority is unavailable.`);
    const tuple = registry(parsed.fileRow, path, args.workpieceId);
    if (!tuple) throw new Error(`Canonical ${component} registry authority is invalid.`);
    return [component, { workpiece_id: args.workpieceId, path, sha256: tuple.sha256, bytes: tuple.bytes, registry_revision: tuple.revision, registry_updated_at: tuple.updated_at, content_type: "application/json" as const }] as const;
  }));
  return Object.freeze(Object.fromEntries(rows)) as HammerHistoryComponentAuthority;
}

export async function loadHammerRevisionHistoryHydration(args: HammerHistoryHydrationIdentity & { fetcher?: Fetcher }): Promise<HammerRevisionHistoryHydrationResult> {
  let response: Response;
  try { response = await (args.fetcher ?? tongsFetch)(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/read-file?path=${encodeURIComponent(args.historyPath)}`, { method: "GET", timeoutMs: 30_000 }); }
  catch { return { ok: false, status: 504, classification: "rejected", error: "Hammer could not load the exact revision history pointer." }; }
  const payload = await response.json().catch(() => null); const parsed = parseTongsReadFileResponse<unknown>({ status: response.status, responseOk: response.ok, payload });
  if (parsed.kind === "absent") return { ok: false, status: 409, classification: "missing", error: "The revision history pointer references a missing artifact." };
  if (parsed.kind === "failure") return { ok: false, status: response.status, classification: parsed.classification === "unexpected" ? "malformed" : parsed.classification, error: parsed.message };
  const row = registry(parsed.fileRow, args.historyPath, args.workpieceId);
  const schema = object(parsed.data) ? parsed.data.schema : undefined;
  if (schema === HAMMER_HISTORY_EPOCH_SCHEMA || schema === HAMMER_HISTORY_EPOCH_HEAD_SCHEMA) {
    if (!object(parsed.data) || parsed.data.schema_version !== 1) return { ok: false, status: 422, classification: "unsupported", error: "The revision history pointer uses an unsupported epoch schema version." };
    if (!row) return { ok: false, status: 409, classification: "registry_conflict", error: "The epoch artifact registry tuple is missing or mismatched." };
    const canonical = canonicalize(parsed.data); if (await sha256(canonical) !== row.sha256 || new TextEncoder().encode(canonical).length !== row.bytes) return { ok: false, status: 409, classification: "registry_conflict", error: "The epoch artifact bytes do not match registry authority." };
    if (schema === HAMMER_HISTORY_EPOCH_SCHEMA) {
      const epoch = validateHammerHistoryEpochEnvelope(parsed.data, args); if (!epoch) return { ok: false, status: 422, classification: "identity_conflict", error: "The epoch anchor failed strict identity or schema validation." };
      const document: HammerHistoryDocumentV1 = { version: 1, workpieceId: args.workpieceId, sessionId: `epoch:${epoch.epoch_id}`, baseRevisionId: epoch.base.editor_state_hash, createdAt: epoch.creation.created_at, updatedAt: epoch.creation.created_at, headEntryId: null, entries: [], checkpoints: [], undoStack: [], redoStack: [], metadata: {} };
      return { ok: true, status: response.status, hydration: { kind: "epoch_anchor", pointer: args.historyPath, epoch, sequence: 0, document, durable_basis: { revision_updated_at: args.revisionUpdatedAt, history_path: args.historyPath, registry: row } } };
    }
    const head = validateHammerHistoryEpochHeadEnvelope(parsed.data, args); if (!head) return { ok: false, status: 422, classification: "identity_conflict", error: "The immutable epoch head failed strict authority validation." };
    return { ok: true, status: response.status, hydration: { kind: "epoch_head", pointer: args.historyPath, epoch_id: head.epoch_id, head_id: head.head_id, sequence: head.sequence, document: head.history, parent: head.parent, epoch_anchor: head.epoch_anchor, base: head.base, result: head.result, boundary: head.boundary, durable_basis: { revision_updated_at: args.revisionUpdatedAt, history_path: args.historyPath, registry: row } } };
  }
  if (schema !== undefined) return { ok: false, status: 422, classification: "unsupported", error: "The revision history pointer uses an unsupported schema or version." };
  if (object(parsed.data) && parsed.data.version !== undefined && parsed.data.version !== 1) return { ok: false, status: 422, classification: "unsupported", error: "The revision history pointer uses an unsupported legacy history version." };
  const legacy = object(parsed.data) && parsed.data.version === 1 ? normalizeHammerHistoryDocument(parsed.data, { workpieceId: args.workpieceId, sessionId: `${args.workpieceId}:session`, baseRevisionId: "unknown" }) : null;
  if (!legacy || legacy.workpieceId !== args.workpieceId) return { ok: false, status: 422, classification: "pointer_invalid", error: "The revision history pointer is not a valid legacy history artifact." };
  return { ok: true, status: response.status, hydration: { kind: "legacy_history", pointer: args.historyPath, document: legacy, registry: row } };
}

export function buildHammerHistoryEpochPath(revisionId: string, epochId: string): string { return `hammer/revisions/${revisionId}/history/epochs/${epochId}.v1.json`; }
export function buildHammerHistoryEpochHeadPath(revisionId: string, epochId: string, headId: string): string { return `hammer/revisions/${revisionId}/history/epochs/${epochId}/heads/${headId}.history.v1.json`; }
export function buildHammerHistoryEpochRequest(args: Omit<HammerHistoryEpochTransportRequest, "epoch_path" | "envelope"> & { envelope: HammerHistoryEpochEnvelopeV1 }): HammerHistoryEpochTransportRequest { return { ...args, epoch_path: buildHammerHistoryEpochPath(args.envelope.recording_revision_id, args.envelope.epoch_id), envelope: args.envelope }; }
export function buildHammerHistoryEpochHeadRequest(args: Omit<HammerHistoryEpochHeadTransportRequest, "head_path" | "envelope"> & { envelope: HammerHistoryEpochHeadEnvelopeV1 }): HammerHistoryEpochHeadTransportRequest { return { ...args, head_path: buildHammerHistoryEpochHeadPath(args.envelope.recording_revision_id, args.envelope.epoch_id, args.envelope.head_id), envelope: args.envelope }; }

export type HammerHistoryEpochTransportRequest = Readonly<{ canonical_recording_id: string; idempotency_key: string; expected_revision_updated_at: string; expected_history_path: string; expected_predecessor: Readonly<{ revision: number; updated_at: string; sha256: string; bytes: number }>; epoch_path: string; envelope: HammerHistoryEpochEnvelopeV1 }>;
export type HammerHistoryEpochHeadTransportRequest = Readonly<{ canonical_recording_id: string; idempotency_key: string; expected_revision_updated_at: string; expected_history_path: string; expected_parent: Readonly<{ head_id: string | null; sha256: string; revision: number; updated_at: string; sequence: number }>; head_path: string; envelope: HammerHistoryEpochHeadEnvelopeV1 }>;
export type HammerHistoryTransitionResult = Readonly<{ outcome: "committed" | "already_committed"; history_path: string; revision_updated_at: string; operation_fingerprint: string; epoch_id?: string; head_id?: string; transition_id: string }> | Readonly<{ outcome: "conflict"; code: string; terminal: true; retryable: false }>;

function transition(value: unknown): HammerHistoryTransitionResult | null { if (!object(value)) return null; if (value.outcome === "conflict" && typeof value.code === "string" && value.terminal === true && value.retryable === false) return value as HammerHistoryTransitionResult; if ((value.outcome === "committed" || value.outcome === "already_committed") && typeof value.history_path === "string" && timestamp(value.revision_updated_at) && sha(value.operation_fingerprint) && uuid(value.transition_id) && (uuid(value.epoch_id) || uuid(value.head_id))) return value as HammerHistoryTransitionResult; return null; }
async function json(response: Response): Promise<unknown> { return response.json().catch(() => null); }
async function postWithReadback(args: { url: string; body: unknown; readback: () => Promise<HammerHistoryTransitionResult | { outcome: "absent" }>; fetcher: Fetcher }): Promise<HammerHistoryTransitionResult> {
  try { const response = await args.fetcher(args.url, { method: "POST", json: args.body, timeoutMs: 45_000 }); const root = await json(response); const payload = object(root) ? root.data : null; const parsed = transition(payload); if (response.ok && parsed) return parsed; if (response.status >= 400 && response.status < 500 && parsed?.outcome === "conflict") return parsed; }
  catch { /* ambiguity is resolved exclusively through status readback */ }
  const status = await args.readback(); if (status.outcome !== "absent") return status;
  return { outcome: "conflict", code: "history_transition_ambiguous_absent", terminal: true, retryable: false };
}
export async function readHammerHistoryOperation(args: { workspaceId: string; workpieceId: string; revisionId: string; idempotencyKey: string; kind: "epoch" | "head"; headId?: string; operationFingerprint?: string; fetcher?: Fetcher }): Promise<HammerHistoryTransitionResult | { outcome: "absent" }> {
  const suffix = args.kind === "head" ? "/heads" : ""; const query = args.kind === "head" ? new URLSearchParams({ ...(args.headId ? { head_id: args.headId } : {}), ...(args.operationFingerprint ? { operation_fingerprint: args.operationFingerprint } : {}) }).toString() : "";
  try { const response = await (args.fetcher ?? tongsFetch)(`/tongs/workspaces/${encodeURIComponent(args.workspaceId)}/workpieces/${encodeURIComponent(args.workpieceId)}/hammer/revisions/${encodeURIComponent(args.revisionId)}/history-epochs${suffix}/operations/${encodeURIComponent(args.idempotencyKey)}${query ? `?${query}` : ""}`, { method: "GET", timeoutMs: 30_000 }); const root = await json(response); const payload = object(root) ? root.data : null; if (object(payload) && payload.outcome === "absent") return { outcome: "absent" }; const parsed = transition(payload); if (response.ok && parsed) return parsed; return { outcome: "conflict", code: "history_operation_readback_invalid", terminal: true, retryable: false }; }
  catch { return { outcome: "conflict", code: "history_operation_readback_unavailable", terminal: true, retryable: false }; }
}
export async function startHammerHistoryEpoch(args: { workspaceId: string; workpieceId: string; revisionId: string; request: HammerHistoryEpochTransportRequest; fetcher?: Fetcher }): Promise<HammerHistoryTransitionResult> { const fetcher = args.fetcher ?? tongsFetch; return postWithReadback({ url: `/tongs/workspaces/${encodeURIComponent(args.workspaceId)}/workpieces/${encodeURIComponent(args.workpieceId)}/hammer/revisions/${encodeURIComponent(args.revisionId)}/history-epochs`, body: args.request, fetcher, readback: () => readHammerHistoryOperation({ ...args, idempotencyKey: args.request.idempotency_key, kind: "epoch", fetcher }) }); }
export async function commitHammerHistoryEpochHead(args: { workspaceId: string; workpieceId: string; revisionId: string; request: HammerHistoryEpochHeadTransportRequest; fetcher?: Fetcher }): Promise<HammerHistoryTransitionResult> { const fetcher = args.fetcher ?? tongsFetch; return postWithReadback({ url: `/tongs/workspaces/${encodeURIComponent(args.workspaceId)}/workpieces/${encodeURIComponent(args.workpieceId)}/hammer/revisions/${encodeURIComponent(args.revisionId)}/history-epochs/heads`, body: args.request, fetcher, readback: () => readHammerHistoryOperation({ ...args, idempotencyKey: args.request.idempotency_key, kind: "head", headId: args.request.envelope.head_id, fetcher }) }); }
