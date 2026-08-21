import type { HammerHistoryComponentAuthority, HammerHistoryDocumentV1, HammerHistoryEpochHeadEnvelopeV1 } from "./hammer-history-epoch-head-coordinator.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA_RE = /^[0-9a-f]{64}$/;
const IDEMPOTENCY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const COMPONENTS = ["audio", "editorial_authority", "transcript", "visual_placements", "visual_timeline"] as const;
export type HammerHistoryAtomicComponent = (typeof COMPONENTS)[number];
type JsonObject = Record<string, unknown>;

export type HammerHistoryAtomicRegistryTuple = Readonly<{
  sha256: string; bytes: number; revision: number; updated_at: string; storage_bucket: string; storage_key: string;
}>;
export type HammerHistoryAtomicComponentChange = Readonly<{
  component: HammerHistoryAtomicComponent; path: string; expected: HammerHistoryAtomicRegistryTuple;
  next: HammerHistoryAtomicRegistryTuple; content_type: "application/json"; serialized_bytes: Uint8Array;
}>;
export type HammerHistoryAtomicRequest = Readonly<{
  workspace_id: string; workpiece_id: string; canonical_recording_id: string; recording_revision_id: string;
  initiating_user_id: string; idempotency_key: string; operation_fingerprint: string;
  expected_revision_updated_at: string; expected_history_path: string;
  parent: Readonly<{ head_id: string | null; path: string; sequence: number; sha256: string; bytes: number; registry_revision: number; registry_updated_at: string; content_type: "application/json" }>;
  component_authority: HammerHistoryComponentAuthority; component_changes: readonly HammerHistoryAtomicComponentChange[];
  head: Readonly<{ head_id: string; path: string; sha256: string; bytes: number; registry_revision: number; registry_updated_at: string; content_type: "application/json"; serialized_bytes: Uint8Array }>;
  envelope: HammerHistoryEpochHeadEnvelopeV1 & Readonly<{ component_changes: readonly Readonly<Record<string, unknown>>[]; artifact: Readonly<Record<string, unknown>> }>;
  history: HammerHistoryDocumentV1;
}>;

export type HammerHistoryAtomicConflict = Readonly<{ outcome: "conflict"; code: string; terminal: true; retryable: false; details?: Readonly<Record<string, unknown>> }>;
export type HammerHistoryAtomicUnresolved = Readonly<{ outcome: "ambiguous_unresolved"; code: "history_epoch_atomic_commit_ambiguous"; terminal: true; retryable: false }>;
export type HammerHistoryAtomicSuccess = Readonly<{ outcome: "committed" | "already_committed"; head_id: string; transition_id: string; history_path: string; revision_updated_at: string; operation_fingerprint: string }>;
export type HammerHistoryAtomicResult = HammerHistoryAtomicSuccess | HammerHistoryAtomicConflict | HammerHistoryAtomicUnresolved;
export type HammerHistoryAtomicReadback = Readonly<Record<string, unknown>>;
export type HammerHistoryAtomicStagedObject = Readonly<{ path: string; storage_bucket: string; storage_key: string; content_type: "application/json"; sha256: string; bytes: number; serialized_bytes: Uint8Array; operation_id: string | null }>;

export interface HammerHistoryAtomicCoordinatorAdapter {
  readOperation(request: HammerHistoryAtomicRequest): Promise<HammerHistoryAtomicReadback>;
  readStagedObject(expected: HammerHistoryAtomicStagedObject): Promise<HammerHistoryAtomicStagedObject | null>;
  createStagedObject(expected: HammerHistoryAtomicStagedObject): Promise<HammerHistoryAtomicStagedObject>;
  commit(request: HammerHistoryAtomicRequest): Promise<Readonly<Record<string, unknown>>>;
  compensate(args: { request: HammerHistoryAtomicRequest; object: HammerHistoryAtomicStagedObject }): Promise<"removed" | "absent" | "reused" | "referenced" | "foreign" | "replacement" | "uncertain">;
}

const object = (value: unknown): value is JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const exact = (value: JsonObject, keys: readonly string[]) => Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const positive = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const timestampToken = (value: unknown): value is string => typeof value === "string" && value === value.trim() && /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(value) && Number.isFinite(Date.parse(value));
const conflict = (code: string, details?: Readonly<Record<string, unknown>>): HammerHistoryAtomicConflict => ({ outcome: "conflict", code, terminal: true, retryable: false, ...(details ? { details } : {}) });
const canonicalize = (value: unknown): string => {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value instanceof Uint8Array) return canonicalize([...value]);
  if (object(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  throw new Error("unsupported canonical value");
};
const sha256 = async (bytes: Uint8Array): Promise<string> => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer))].map((v) => v.toString(16).padStart(2, "0")).join("");
const equalBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((value, index) => value === b[index]);
const stableEqual = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b);

export function buildHammerHistoryAtomicComponentStoragePath(headId: string, component: HammerHistoryAtomicComponent): string {
  return `hammer/staging/history-atomic/${headId}/${component}.json`;
}
export function isProtectedHammerHistoryAtomicStagingPath(path: string): boolean {
  return /^hammer\/staging\/history-atomic\/[0-9a-f-]+\/(audio|editorial_authority|transcript|visual_placements|visual_timeline)\.json$/i.test(path);
}

function fingerprintProjection(request: HammerHistoryAtomicRequest): unknown {
  const { operation_fingerprint: _ignored, ...projection } = request;
  void _ignored;
  return projection;
}
export async function fingerprintHammerHistoryAtomicRequest(request: HammerHistoryAtomicRequest): Promise<string> {
  return sha256(new TextEncoder().encode(canonicalize(fingerprintProjection(request))));
}

function validateRegistry(value: HammerHistoryAtomicRegistryTuple): boolean {
  return object(value) && exact(value, ["sha256", "bytes", "revision", "updated_at", "storage_bucket", "storage_key"])
    && SHA_RE.test(value.sha256) && positive(value.bytes) && positive(value.revision) && timestampToken(value.updated_at)
    && value.storage_bucket === "forge-workpieces" && typeof value.storage_key === "string" && value.storage_key.length > 0;
}

function isExpectedComponentStorageKey(request: HammerHistoryAtomicRequest, component: HammerHistoryAtomicComponent, path: string, storageKey: string): boolean {
  if (storageKey === `workpieces/${request.workpiece_id}/${path}`) return true;
  const match = /^workpieces\/([0-9a-f-]+)\/hammer\/staging\/history-atomic\/([0-9a-f-]+)\/(audio|editorial_authority|transcript|visual_placements|visual_timeline)\.json$/i.exec(storageKey);
  return Boolean(match && match[1] === request.workpiece_id && UUID_RE.test(match[2]!) && match[3] === component);
}

function isRevisionComponentPath(request: HammerHistoryAtomicRequest, path: string): boolean {
  const prefix = `hammer/revisions/${request.recording_revision_id}/`;
  if (!path.startsWith(prefix) || !path.endsWith(".json") || path.includes("\\") || path.includes("?") || path.includes("#")) return false;
  const relative = path.slice(prefix.length); const segments = relative.split("/");
  return segments.length > 0 && segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
    && segments[0] !== "history";
}

async function validateRequest(request: HammerHistoryAtomicRequest): Promise<HammerHistoryAtomicConflict | null> {
  if (!object(request) || !exact(request, ["workspace_id", "workpiece_id", "canonical_recording_id", "recording_revision_id", "initiating_user_id", "idempotency_key", "operation_fingerprint", "expected_revision_updated_at", "expected_history_path", "parent", "component_authority", "component_changes", "head", "envelope", "history"])) return conflict("history_epoch_atomic_request_shape_invalid");
  if (![request.workspace_id, request.workpiece_id, request.canonical_recording_id, request.recording_revision_id, request.initiating_user_id, request.head.head_id].every((value) => typeof value === "string" && UUID_RE.test(value))
    || !IDEMPOTENCY_RE.test(request.idempotency_key) || !SHA_RE.test(request.operation_fingerprint) || !timestampToken(request.expected_revision_updated_at)
    || request.expected_history_path !== request.parent.path || !stableEqual(request.envelope.history, request.history)) return conflict("history_epoch_atomic_request_invalid");
  if (!object(request.parent) || !exact(request.parent, ["head_id", "path", "sequence", "sha256", "bytes", "registry_revision", "registry_updated_at", "content_type"])
    || !(request.parent.head_id === null || UUID_RE.test(request.parent.head_id)) || !Number.isSafeInteger(request.parent.sequence) || request.parent.sequence < 0
    || !SHA_RE.test(request.parent.sha256) || !positive(request.parent.bytes) || !positive(request.parent.registry_revision) || !timestampToken(request.parent.registry_updated_at) || request.parent.content_type !== "application/json") return conflict("history_epoch_atomic_parent_invalid");
  if (!object(request.component_authority) || !exact(request.component_authority as unknown as JsonObject, COMPONENTS)) return conflict("history_epoch_atomic_component_authority_invalid");
  const authorityPaths = new Set<string>();
  for (const component of COMPONENTS) {
    const authority = request.component_authority[component];
    if (!object(authority) || !exact(authority as unknown as JsonObject, ["workpiece_id", "path", "sha256", "bytes", "registry_revision", "registry_updated_at", "content_type"])
      || authority.workpiece_id !== request.workpiece_id || typeof authority.path !== "string" || !isRevisionComponentPath(request, authority.path) || authorityPaths.has(authority.path)
      || !SHA_RE.test(authority.sha256) || !positive(authority.bytes) || !positive(authority.registry_revision)
      || !timestampToken(authority.registry_updated_at) || authority.content_type !== "application/json") return conflict("history_epoch_atomic_component_authority_invalid");
    authorityPaths.add(authority.path);
  }
  if (!Array.isArray(request.component_changes) || request.component_changes.length < 1 || request.component_changes.length > COMPONENTS.length) return conflict("history_epoch_atomic_component_plan_invalid");
  const lanes = new Set<string>(); const paths = new Set<string>();
  for (const change of request.component_changes) {
    if (!exact(change as unknown as JsonObject, ["component", "path", "expected", "next", "content_type", "serialized_bytes"])
      || !COMPONENTS.includes(change.component) || lanes.has(change.component) || paths.has(change.path) || change.content_type !== "application/json"
      || !(change.serialized_bytes instanceof Uint8Array) || !validateRegistry(change.expected) || !validateRegistry(change.next)
      || change.next.revision !== change.expected.revision + 1 || change.next.sha256 === change.expected.sha256 || change.next.bytes !== change.serialized_bytes.length
      || await sha256(change.serialized_bytes) !== change.next.sha256
      || !isRevisionComponentPath(request, change.path)
      || !isExpectedComponentStorageKey(request, change.component, change.path, change.expected.storage_key)
      || change.next.storage_key !== `workpieces/${request.workpiece_id}/${buildHammerHistoryAtomicComponentStoragePath(request.head.head_id, change.component)}`) return conflict("history_epoch_atomic_component_plan_invalid");
    const authority = request.component_authority[change.component as HammerHistoryAtomicComponent];
    if (!authority || authority.workpiece_id !== request.workpiece_id || authority.path !== change.path || authority.sha256 !== change.expected.sha256 || authority.bytes !== change.expected.bytes || authority.registry_revision !== change.expected.revision || authority.registry_updated_at !== change.expected.updated_at || authority.content_type !== change.content_type) return conflict("history_epoch_atomic_component_authority_conflict");
    lanes.add(change.component); paths.add(change.path);
  }
  if (!object(request.head) || !exact(request.head, ["head_id", "path", "sha256", "bytes", "registry_revision", "registry_updated_at", "content_type", "serialized_bytes"])
    || !(request.head.serialized_bytes instanceof Uint8Array) || request.head.content_type !== "application/json" || !SHA_RE.test(request.head.sha256)
    || request.head.bytes !== request.head.serialized_bytes.length || await sha256(request.head.serialized_bytes) !== request.head.sha256 || !positive(request.head.registry_revision) || !timestampToken(request.head.registry_updated_at)
    || request.head.path !== `hammer/revisions/${request.recording_revision_id}/history/epochs/${request.envelope.epoch_id}/heads/${request.head.head_id}.history.v1.json`) return conflict("history_epoch_atomic_head_invalid");
  if (request.envelope.workspace_id !== request.workspace_id || request.envelope.workpiece_id !== request.workpiece_id || request.envelope.canonical_recording_id !== request.canonical_recording_id || request.envelope.recording_revision_id !== request.recording_revision_id
    || request.envelope.head_id !== request.head.head_id || request.envelope.sequence !== request.parent.sequence + 1 || request.envelope.parent.path !== request.parent.path || request.envelope.parent.sha256 !== request.parent.sha256
    || !stableEqual(request.envelope.component_changes, request.component_changes.map(({ serialized_bytes: _bytes, content_type: _content, ...change }) => { void _bytes; void _content; return change; })) || !stableEqual(request.envelope.history, request.history)) return conflict("history_epoch_atomic_envelope_conflict");
  if (await fingerprintHammerHistoryAtomicRequest(request) !== request.operation_fingerprint) return conflict("history_epoch_atomic_fingerprint_conflict");
  return null;
}

function stagedForChange(request: HammerHistoryAtomicRequest, change: HammerHistoryAtomicComponentChange): HammerHistoryAtomicStagedObject {
  return { path: buildHammerHistoryAtomicComponentStoragePath(request.head.head_id, change.component), storage_bucket: change.next.storage_bucket, storage_key: change.next.storage_key, content_type: change.content_type, sha256: change.next.sha256, bytes: change.next.bytes, serialized_bytes: change.serialized_bytes, operation_id: request.idempotency_key };
}
function stagedForHead(request: HammerHistoryAtomicRequest): HammerHistoryAtomicStagedObject {
  return { path: request.head.path, storage_bucket: "forge-workpieces", storage_key: `workpieces/${request.workpiece_id}/${request.head.path}`, content_type: request.head.content_type, sha256: request.head.sha256, bytes: request.head.bytes, serialized_bytes: request.head.serialized_bytes, operation_id: request.idempotency_key };
}
function exactStaged(actual: HammerHistoryAtomicStagedObject, expected: HammerHistoryAtomicStagedObject): boolean {
  return actual.path === expected.path && actual.storage_bucket === expected.storage_bucket && actual.storage_key === expected.storage_key && actual.content_type === expected.content_type && actual.sha256 === expected.sha256 && actual.bytes === expected.bytes && equalBytes(actual.serialized_bytes, expected.serialized_bytes) && actual.operation_id === expected.operation_id;
}

function verifyReadback(value: HammerHistoryAtomicReadback, request: HammerHistoryAtomicRequest): HammerHistoryAtomicSuccess | HammerHistoryAtomicConflict | "absent" {
  if (!object(value)) return conflict("history_epoch_atomic_readback_malformed");
  if (value.outcome === "absent" && value.conclusive === true) return "absent";
  if (value.outcome === "conflict") return conflict(typeof value.code === "string" ? value.code : "history_epoch_atomic_readback_conflict");
  if (value.outcome !== "committed" || value.idempotency_key !== request.idempotency_key || value.operation_fingerprint !== request.operation_fingerprint
    || value.workspace_id !== request.workspace_id || value.workpiece_id !== request.workpiece_id || value.canonical_recording_id !== request.canonical_recording_id || value.recording_revision_id !== request.recording_revision_id
    || value.head_id !== request.head.head_id || value.sequence !== request.envelope.sequence || value.history_path !== request.head.path || !timestampToken(value.revision_updated_at)
    || !stableEqual(value.component_changes, request.envelope.component_changes) || !stableEqual(value.result_component_authority, request.envelope.result.component_authority) || !stableEqual(value.envelope, request.envelope)
    || !object(value.parent) || value.parent.path !== request.parent.path || value.parent.sequence !== request.parent.sequence || value.parent.sha256 !== request.parent.sha256 || value.parent.bytes !== request.parent.bytes || value.parent.registry_revision !== request.parent.registry_revision || value.parent.registry_updated_at !== request.parent.registry_updated_at || value.parent.content_type !== request.parent.content_type
    || !object(value.head) || value.head.path !== request.head.path || value.head.sha256 !== request.head.sha256 || value.head.bytes !== request.head.bytes || value.head.registry_revision !== request.head.registry_revision || value.head.registry_updated_at !== request.head.registry_updated_at || value.head.content_type !== request.head.content_type
    || typeof value.transition_id !== "string" || !UUID_RE.test(value.transition_id)) return conflict("history_epoch_atomic_readback_mismatch");
  return { outcome: "committed", head_id: request.head.head_id, transition_id: value.transition_id, history_path: request.head.path, revision_updated_at: value.revision_updated_at, operation_fingerprint: request.operation_fingerprint };
}

async function compensateOwned(request: HammerHistoryAtomicRequest, adapter: HammerHistoryAtomicCoordinatorAdapter, owned: readonly HammerHistoryAtomicStagedObject[], originalCode: string): Promise<HammerHistoryAtomicConflict> {
  let unsafe = false;
  for (const object of [...owned].reverse()) {
    try { if (!["removed", "absent"].includes(await adapter.compensate({ request, object }))) unsafe = true; } catch { unsafe = true; }
  }
  return unsafe ? conflict("history_epoch_atomic_compensation_conflict", { original_code: originalCode }) : conflict(originalCode);
}

export async function coordinateHammerHistoryAtomicComponentHead(args: { request: HammerHistoryAtomicRequest; adapter: HammerHistoryAtomicCoordinatorAdapter }): Promise<HammerHistoryAtomicResult> {
  const request = structuredClone(args.request); const adapter = args.adapter;
  const invalid = await validateRequest(request); if (invalid) return invalid;
  let initial: HammerHistoryAtomicReadback;
  try { initial = await adapter.readOperation(request); } catch { return conflict("history_epoch_atomic_readback_unavailable"); }
  const initialState = verifyReadback(initial, request);
  if (initialState !== "absent") return "outcome" in initialState && initialState.outcome === "committed" ? { ...initialState, outcome: "already_committed" } : initialState;
  const expectedObjects = [...request.component_changes.map((change) => stagedForChange(request, change)), stagedForHead(request)];
  const owned: HammerHistoryAtomicStagedObject[] = [];
  try {
    for (const expected of expectedObjects) {
      const existing = await adapter.readStagedObject(expected);
      if (existing) { if (!exactStaged(existing, expected)) return compensateOwned(request, adapter, owned, "history_epoch_atomic_staged_object_conflict"); continue; }
      const created = await adapter.createStagedObject(expected);
      if (!exactStaged(created, expected) || created.operation_id !== request.idempotency_key) return compensateOwned(request, adapter, [...owned, created], "history_epoch_atomic_staged_object_readback_conflict");
      owned.push(created);
    }
    let response: Readonly<Record<string, unknown>>;
    try { response = await adapter.commit(request); }
    catch {
      let readback: HammerHistoryAtomicReadback;
      try { readback = await adapter.readOperation(request); } catch { return { outcome: "ambiguous_unresolved", code: "history_epoch_atomic_commit_ambiguous", terminal: true, retryable: false }; }
      const state = verifyReadback(readback, request);
      if (state === "absent") return { outcome: "ambiguous_unresolved", code: "history_epoch_atomic_commit_ambiguous", terminal: true, retryable: false };
      return state;
    }
    if (!object(response) || !["committed", "already_committed", "conflict"].includes(String(response.outcome))) return { outcome: "ambiguous_unresolved", code: "history_epoch_atomic_commit_ambiguous", terminal: true, retryable: false };
    if (response.outcome === "conflict") return compensateOwned(request, adapter, owned, typeof response.code === "string" ? response.code : "history_epoch_atomic_conflict");
    let committedReadback: HammerHistoryAtomicReadback;
    try { committedReadback = await adapter.readOperation(request); }
    catch { return { outcome: "ambiguous_unresolved", code: "history_epoch_atomic_commit_ambiguous", terminal: true, retryable: false }; }
    const readback = verifyReadback(committedReadback, request);
    if (readback === "absent" || readback.outcome === "conflict") return conflict("history_epoch_atomic_commit_readback_conflict");
    return { ...readback, outcome: response.outcome as "committed" | "already_committed" };
  } catch { return compensateOwned(request, adapter, owned, "history_epoch_atomic_staging_failed"); }
}
