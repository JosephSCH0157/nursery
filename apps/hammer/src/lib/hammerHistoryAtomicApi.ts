import type { HammerEditorStateSerializable, HammerHistoryDocumentV1 } from "../editor/hammerWorkspaceHistory";
import { serializeHammerCanonicalArtifact } from "../persistence/hammerAutosaveQuiescence";
import type { HammerPersistedAudioPolish, HammerPersistedStructuredTranscript } from "../persistence/hammerPersistenceContract";
import type { HammerHistoryComponentAuthority, HammerHistoryRegistryTuple, HammerHistoryTransitionResult } from "./hammerHistoryEpochApi";
import { parseTongsReadFileResponse } from "./tongsReadFileResponse";
import { tongsFetch } from "./tongsFetch";

const COMPONENTS = ["audio", "editorial_authority", "transcript", "visual_placements", "visual_timeline"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA_RE = /^[0-9a-f]{64}$/;
export type HammerHistoryAtomicComponent = (typeof COMPONENTS)[number];
type Fetcher = typeof tongsFetch;
type JsonObject = Record<string, unknown>;

export type HammerHistoryAtomicComponentBasis = Readonly<Record<HammerHistoryAtomicComponent, Readonly<{
  authority: HammerHistoryComponentAuthority[HammerHistoryAtomicComponent];
  registry: HammerHistoryRegistryTuple;
  data: unknown;
  bytes: Uint8Array;
}>>>;

export type HammerHistoryAtomicComponentChange = Readonly<{
  component: HammerHistoryAtomicComponent;
  path: string;
  expected: Readonly<{ sha256: string; bytes: number; revision: number; updated_at: string; storage_bucket: string; storage_key: string }>;
  next: Readonly<{ sha256: string; bytes: number; revision: number; updated_at: string; storage_bucket: string; storage_key: string }>;
  content_type: "application/json";
  serialized_bytes: Uint8Array;
}>;

export type HammerHistoryAtomicRequest = Readonly<{
  workspace_id: string; workpiece_id: string; canonical_recording_id: string; recording_revision_id: string;
  initiating_user_id: string; idempotency_key: string; operation_fingerprint: string;
  expected_revision_updated_at: string; expected_history_path: string;
  parent: Readonly<{ head_id: string | null; path: string; sequence: number; sha256: string; bytes: number; registry_revision: number; registry_updated_at: string; content_type: "application/json" }>;
  component_authority: HammerHistoryComponentAuthority;
  component_changes: readonly HammerHistoryAtomicComponentChange[];
  head: Readonly<{ head_id: string; path: string; sha256: string; bytes: number; registry_revision: number; registry_updated_at: string; content_type: "application/json"; serialized_bytes: Uint8Array }>;
  envelope: Readonly<Record<string, unknown>>;
  history: HammerHistoryDocumentV1;
}>;

const object = (value: unknown): value is JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const timestampToken = (value: unknown): value is string => typeof value === "string" && value === value.trim() && /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(value) && Number.isFinite(Date.parse(value));
const canonicalize = (value: unknown): string => {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value instanceof Uint8Array) return canonicalize([...value]);
  if (object(value)) return `{${Object.keys(value).sort().flatMap((key) => typeof value[key] === "undefined" ? [] : [`${JSON.stringify(key)}:${canonicalize(value[key])}`]).join(",")}}`;
  throw new Error("Atomic history values must be canonical JSON.");
};
const sha256 = async (bytes: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
};
const encode = (value: unknown): Uint8Array => new TextEncoder().encode(serializeHammerCanonicalArtifact(value));
const base64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};
const componentStorageKey = (workpieceId: string, component: HammerHistoryAtomicComponent, path: string, value: string): boolean => {
  if (value === `workpieces/${workpieceId}/${path}`) return true;
  const match = /^workpieces\/([0-9a-f-]+)\/hammer\/staging\/history-atomic\/([0-9a-f-]+)\/(audio|editorial_authority|transcript|visual_placements|visual_timeline)\.json$/i.exec(value);
  return Boolean(match && match[1] === workpieceId && UUID_RE.test(match[2]!) && match[3] === component);
};

export async function fingerprintHammerHistoryAtomicRequest(request: HammerHistoryAtomicRequest): Promise<string> {
  const { operation_fingerprint: ignored, ...projection } = request;
  void ignored;
  return sha256(new TextEncoder().encode(canonicalize(projection)));
}

export async function loadHammerHistoryAtomicComponentBasis(args: {
  workpieceId: string;
  paths: Readonly<Record<HammerHistoryAtomicComponent, string>>;
  fetcher?: Fetcher;
}): Promise<HammerHistoryAtomicComponentBasis> {
  const rows = await Promise.all(COMPONENTS.map(async (component) => {
    const path = args.paths[component];
    const response = await (args.fetcher ?? tongsFetch)(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/read-file?path=${encodeURIComponent(path)}`, { method: "GET", timeoutMs: 30_000 });
    const payload = await response.json().catch(() => null);
    const parsed = parseTongsReadFileResponse<unknown>({ status: response.status, responseOk: response.ok, payload });
    if (parsed.kind !== "present" || !parsed.fileRow) throw new Error(`Canonical ${component} authority is unavailable.`);
    const row = parsed.fileRow;
    const bytes = encode(parsed.data);
    const digest = await sha256(bytes);
    const revision = row.revision;
    if (row.path !== path || row.hash_algo !== "sha256" || row.hash_value !== digest
      || row.bytes !== bytes.byteLength || typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1 || !timestampToken(row.updated_at)
      || row.storage_bucket !== "forge-workpieces" || typeof row.storage_key !== "string" || !componentStorageKey(args.workpieceId, component, path, row.storage_key)) {
      throw new Error(`Canonical ${component} registry authority is invalid.`);
    }
    const authority = { workpiece_id: args.workpieceId, path, sha256: digest, bytes: bytes.byteLength, registry_revision: revision, registry_updated_at: row.updated_at, content_type: "application/json" as const };
    const registry = { path, sha256: digest, bytes: bytes.byteLength, revision, updated_at: row.updated_at, storage_bucket: row.storage_bucket, storage_key: row.storage_key };
    return [component, { authority, registry, data: parsed.data, bytes }] as const;
  }));
  return Object.freeze(Object.fromEntries(rows)) as HammerHistoryAtomicComponentBasis;
}

export function projectHammerHistoryAtomicComponents(args: {
  state: HammerEditorStateSerializable;
  current: HammerHistoryAtomicComponentBasis;
  identity: { workspaceId: string; workpieceId: string; canonicalRecordingId: string; revisionId: string };
  derivedTextLayers?: HammerPersistedStructuredTranscript["derived_text_layers"];
}): Readonly<Record<HammerHistoryAtomicComponent, unknown>> {
  const audio = object(args.current.audio.data) ? args.current.audio.data : null;
  const transcript = object(args.current.transcript.data) ? args.current.transcript.data : null;
  const authority = object(args.current.editorial_authority.data) ? args.current.editorial_authority.data : null;
  if (!audio || !transcript || !authority) throw new Error("Canonical history component envelopes are malformed.");
  return Object.freeze({
    audio: { ...(audio as unknown as HammerPersistedAudioPolish), audio_edit: args.state.audioEdit },
    editorial_authority: args.state.editorialAuthorityGraph ? {
      ...authority,
      schema_version: 1,
      workspace_id: args.identity.workspaceId,
      workpiece_id: args.identity.workpieceId,
      canonical_recording_id: args.identity.canonicalRecordingId,
      recording_revision_id: args.identity.revisionId,
      authority: args.state.editorialAuthorityGraph,
    } : authority,
    transcript: { ...(transcript as unknown as HammerPersistedStructuredTranscript), segments: args.state.transcriptSegments,
      ...(typeof args.derivedTextLayers === "undefined" ? {} : { derived_text_layers: args.derivedTextLayers }) },
    visual_placements: args.state.visualPlacements ?? args.current.visual_placements.data,
    visual_timeline: args.state.visualTimeline ?? args.current.visual_timeline.data,
  });
}

function wireRequest(request: HammerHistoryAtomicRequest): unknown {
  const { serialized_bytes: headBytes, ...head } = request.head;
  return {
    ...request,
    component_changes: request.component_changes.map(({ serialized_bytes, ...change }) => ({ ...change, serialized_bytes_base64: base64(serialized_bytes) })),
    head: { ...head, serialized_bytes_base64: base64(headBytes) },
  };
}

export async function commitHammerHistoryAtomic(args: {
  workspaceId: string; workpieceId: string; revisionId: string; request: HammerHistoryAtomicRequest; fetcher?: Fetcher;
}): Promise<HammerHistoryTransitionResult> {
  const fetcher = args.fetcher ?? tongsFetch;
  if (args.request.workspace_id !== args.workspaceId || args.request.workpiece_id !== args.workpieceId || args.request.recording_revision_id !== args.revisionId) {
    return { outcome: "conflict", code: "history_epoch_atomic_identity_conflict", terminal: true, retryable: false };
  }
  const url = `/tongs/workspaces/${encodeURIComponent(args.workspaceId)}/workpieces/${encodeURIComponent(args.workpieceId)}/hammer/revisions/${encodeURIComponent(args.revisionId)}/history-epochs/atomic-heads`;
  try {
    const response = await fetcher(url, { method: "POST", json: wireRequest(args.request), timeoutMs: 45_000 });
    const root = await response.json().catch(() => null); const result = object(root) && object(root.data) ? root.data : null;
    if (response.ok && result && (result.outcome === "committed" || result.outcome === "already_committed")
      && result.history_path === args.request.head.path && timestampToken(result.revision_updated_at) && result.operation_fingerprint === args.request.operation_fingerprint
      && result.head_id === args.request.head.head_id && typeof result.transition_id === "string" && UUID_RE.test(result.transition_id)) return result as HammerHistoryTransitionResult;
    if (result?.outcome === "conflict" && typeof result.code === "string" && result.terminal === true && result.retryable === false) return result as HammerHistoryTransitionResult;
    if (result?.outcome === "ambiguous_unresolved" && typeof result.code === "string" && result.terminal === true && result.retryable === false) return { outcome: "conflict", code: result.code, terminal: true, retryable: false };
  } catch { /* Tongs owns ambiguous readback resolution. */ }
  return { outcome: "conflict", code: "history_epoch_atomic_transport_ambiguous", terminal: true, retryable: false };
}

export const hammerHistoryAtomicInternals = Object.freeze({ COMPONENTS, encode, sha256, wireRequest, componentStorageKey, timestampToken, SHA_RE });
