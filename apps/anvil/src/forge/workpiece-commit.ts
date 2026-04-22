import { appendForgeUserAuthorization } from './tongs-user-auth';

type WrittenBy = {
  tool: string;
  tool_version: string;
  lane: string;
};

type RecordingCommitInput = {
  bytes: Uint8Array;
  originalName: string;
  contentType?: string;
  transcriptPath?: string | null;
  transcriptStatus?: string | null;
  recordingMedium?: string | null;
  requiresPostNormalization?: boolean;
};

export type UploadStrategy = "single" | "chunked";

export type RecordingChunk = {
  index: number;
  startByte: number;
  endByte: number;
  size: number;
  totalChunks: number;
};

export type RecordingUploadStatusPhase = "preflight" | "uploading" | "finalizing" | "done" | "failed";

export type RecordingUploadStatusDetail = {
  phase: RecordingUploadStatusPhase;
  strategy: UploadStrategy;
  bytes: number;
  mb: number;
  sessionRunKey: string;
  workpieceId: string;
  workspaceId: string | null;
  title: string;
  scriptHash: string | null;
  destinationPath: string;
  commitPathMode: string;
  warningThresholdMb: number;
  warningThresholdExceeded: boolean;
  chunkIndex?: number | null;
  totalChunks?: number | null;
  chunkBytes?: number | null;
  progressPct?: number | null;
  safeToLeave?: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type RecordingDecisionEventName = "take_kept" | "take_discarded";

export type RecordingCommitResult =
  | {
      ok: true;
      workpieceId: string;
      path: string;
      createdCradle: boolean;
      plannerRecordingSessionId: string | null;
      captureSessionId: string;
      status: number;
    }
  | {
      ok: false;
      reason: string;
      status?: number;
      errorCode?: string;
      errorMessage?: string;
      details?: unknown;
      workspaceId?: string | null;
      workpieceId?: string | null;
    };

export type AppendRecordingDecisionInput = {
  workpieceId: string;
  eventName: RecordingDecisionEventName;
  filePath: string;
  originalName: string;
  contentType: string;
  bytes: number;
  durationMs?: number | null;
  createdCradle?: boolean;
  plannerRecordingSessionId?: string | null;
  captureSessionId?: string | null;
  transcriptPath?: string | null;
  transcriptStatus?: string | null;
  transcriptSourcePath?: string | null;
  recordingMedium?: string | null;
  requiresPostNormalization?: boolean;
};

export type RecordingCaptureTargetResult =
  | {
      ok: true;
      workspaceId: string | null;
      workpieceId: string;
      createdCradle: boolean;
      plannerRecordingSessionId: string | null;
      captureSessionId: string;
    }
  | {
      ok: false;
      reason: string;
      status?: number;
      details?: unknown;
      workspaceId?: string | null;
      workpieceId?: string | null;
    };

export type CommitRecordingJsonArtifactResult =
  | {
      ok: true;
      status: number;
      workpieceId: string;
      path: string;
    }
  | {
      ok: false;
      reason: string;
      status?: number;
      details?: unknown;
      errorCode?: string;
      errorMessage?: string;
      workpieceId?: string | null;
      path?: string | null;
    };

export type AppendRecordingDecisionResult =
  | {
      ok: true;
      status: number;
    }
  | {
      ok: false;
      reason: string;
      status?: number;
      errorCode?: string;
      errorMessage?: string;
      details?: unknown;
    };

type CreateCradleResult =
  | { ok: true; workpieceId: string }
  | { ok: false; status: number; details: unknown };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_TOOL_VERSION = "1.8.5";
const DEFAULT_LANE = "forge-managed";
const WORKSPACE_STORAGE_KEYS = ["forge_workspace_id_v1", "barstock_workspace_id"] as const;
const WORKPIECE_STORAGE_KEYS = [
  "forge_active_workpiece_id_v1",
  "forge_workpiece_id_v1",
  "tp_workpiece_id",
] as const;

const ACTIVE_WORKPIECE_KEY = "forge_active_workpiece_id_v1";
const WORKSPACE_WORKPIECE_PREFIX = "forge_anvil_recording_workpiece_v1:";
const CAPTURE_SESSION_KEY = "forge_anvil_capture_session_v1";
const PLANNER_RECORDING_SESSION_KEY = "forge_anvil_recording_session_v1";
const LARGE_UPLOAD_WARN_MB_KEY = "ANVIL_LARGE_UPLOAD_WARN_MB";
const CHUNK_UPLOAD_THRESHOLD_MB_KEY = "ANVIL_CHUNK_UPLOAD_THRESHOLD_MB";
const CHUNK_SIZE_MB_KEY = "ANVIL_CHUNK_SIZE_MB";
const DEFAULT_LARGE_UPLOAD_WARN_MB = 100;
const DEFAULT_CHUNK_UPLOAD_THRESHOLD_MB = 32;
const DEFAULT_CHUNK_SIZE_MB = 8;
const CHUNK_UPLOAD_RETRY_ATTEMPTS = 3;
const CHUNK_UPLOAD_RETRY_BACKOFF_MS = 250;

export const HAMMER_STRUCTURED_TRANSCRIPT_PATH = "hammer/transcript/structured.v1.json";

let correlationSeq = 0;

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeUuid(value: unknown): string | null {
  const str = readString(value);
  if (!str) return null;
  return UUID_RE.test(str) ? str.toLowerCase() : null;
}

function readLocalStorage(key: string): string | null {
  try {
    return readString(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function readSessionStorage(key: string): string | null {
  try {
    return readString(sessionStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeSessionStorage(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function getQueryParam(...keys: string[]): string | null {
  try {
    const q = new URLSearchParams(window.location.search || "");
    for (const key of keys) {
      const value = readString(q.get(key));
      if (value) return value;
    }
  } catch {
    // ignore
  }
  return null;
}

function toPositiveNumber(raw: unknown): number | null {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function readNumericConfig(key: string): number | null {
  const fromQuery = toPositiveNumber(getQueryParam(key, key.toLowerCase()));
  if (fromQuery != null) return fromQuery;

  try {
    const fromWindow = toPositiveNumber((window as any)?.[key]);
    if (fromWindow != null) return fromWindow;
  } catch {
    // ignore
  }

  const fromStorage = toPositiveNumber(readLocalStorage(key) ?? readLocalStorage(key.toLowerCase()));
  if (fromStorage != null) return fromStorage;

  return null;
}

function mbToBytes(mb: number): number {
  return Math.max(1, Math.floor(mb * 1024 * 1024));
}

type UploadStrategyConfig = {
  largeUploadWarnMb: number;
  chunkUploadThresholdMb: number;
  chunkSizeMb: number;
};

function resolveUploadStrategyConfig(): UploadStrategyConfig {
  const largeUploadWarnMb = readNumericConfig(LARGE_UPLOAD_WARN_MB_KEY) ?? DEFAULT_LARGE_UPLOAD_WARN_MB;
  const chunkUploadThresholdMb = readNumericConfig(CHUNK_UPLOAD_THRESHOLD_MB_KEY) ?? DEFAULT_CHUNK_UPLOAD_THRESHOLD_MB;
  const chunkSizeMbRaw = readNumericConfig(CHUNK_SIZE_MB_KEY) ?? DEFAULT_CHUNK_SIZE_MB;
  const chunkSizeMb = chunkSizeMbRaw > 0 ? Math.min(chunkSizeMbRaw, chunkUploadThresholdMb) : DEFAULT_CHUNK_SIZE_MB;
  return {
    largeUploadWarnMb,
    chunkUploadThresholdMb,
    chunkSizeMb,
  };
}

export function selectUploadStrategyForBytes(
  byteLength: number,
  config?: Partial<UploadStrategyConfig>,
): UploadStrategy {
  const cfg = {
    ...resolveUploadStrategyConfig(),
    ...config,
  };
  const thresholdBytes = mbToBytes(cfg.chunkUploadThresholdMb > 0 ? cfg.chunkUploadThresholdMb : DEFAULT_CHUNK_UPLOAD_THRESHOLD_MB);
  return byteLength > thresholdBytes ? "chunked" : "single";
}

export function buildRecordingChunks(totalBytes: number, chunkSizeBytes: number): RecordingChunk[] {
  const normalizedTotal = Math.max(0, Math.floor(totalBytes));
  const normalizedChunkSize = Math.max(1, Math.floor(chunkSizeBytes));
  const totalChunks = Math.max(1, Math.ceil(normalizedTotal / normalizedChunkSize));
  const chunks: RecordingChunk[] = [];
  for (let index = 0; index < totalChunks; index += 1) {
    const startByte = index * normalizedChunkSize;
    const endByte = Math.min(normalizedTotal, startByte + normalizedChunkSize);
    chunks.push({
      index,
      startByte,
      endByte,
      size: Math.max(0, endByte - startByte),
      totalChunks,
    });
  }
  return chunks;
}

function deriveRecordingTitleFromName(name: string): string {
  const normalized = String(name || "").trim();
  if (!normalized) return "Untitled";
  const noPath = normalized.split(/[\\/]/).pop() || normalized;
  const noExt = noPath.replace(/\.[^.]+$/, "").trim();
  return noExt || noPath || "Untitled";
}

function resolveLane(): string {
  const w = window as any;
  const fromQuery = readString(getQueryParam("forge_lane", "lane"));
  if (fromQuery) return fromQuery;
  const fromWindow = readString(w.__forgeLane ?? w.__tpLane);
  if (fromWindow) return fromWindow;
  const fromStorage = readString(readLocalStorage("forge_lane_v1"));
  if (fromStorage) return fromStorage;
  return DEFAULT_LANE;
}

function getWrittenBy(): WrittenBy {
  const version = readString((window as any).APP_VERSION) || DEFAULT_TOOL_VERSION;
  return {
    tool: "anvil",
    tool_version: version,
    lane: resolveLane(),
  };
}

function getApiToken(): string | undefined {
  const fromQuery = readString(getQueryParam("tongs_api_token", "tongsApiToken"));
  if (fromQuery) return fromQuery;

  const fromWindow = readString((window as any).__forgeTongsApiToken ?? (window as any).__tpTongsApiToken);
  if (fromWindow) return fromWindow;

  return readLocalStorage("forge_tongs_api_token_v1") ?? undefined;
}

function getOrCreateCaptureSessionId(): string {
  const existing = readSessionStorage(CAPTURE_SESSION_KEY);
  if (existing) return existing;

  let next = "";
  try {
    const randomUuid =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : "";
    next = readString(randomUuid) || "";
  } catch {
    // ignore
  }
  if (!next) {
    next = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  writeSessionStorage(CAPTURE_SESSION_KEY, next);
  return next;
}

export function beginRecordingCaptureSession(): string {
  let next = "";
  try {
    const randomUuid =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : "";
    next = readString(randomUuid) || "";
  } catch {
    // ignore
  }
  if (!next) {
    next = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  writeSessionStorage(CAPTURE_SESSION_KEY, next);
  return next;
}

function nextCorrelationId(prefix: string): string {
  correlationSeq += 1;
  return `${prefix}:${getOrCreateCaptureSessionId()}:${correlationSeq}`;
}

function resolvePlannerRecordingSessionId(): string | null {
  return normalizeUuid(readLocalStorage(PLANNER_RECORDING_SESSION_KEY));
}

function resolveWorkspaceId(): string | null {
  const fromQuery = normalizeUuid(getQueryParam("workspace_id", "workspaceId", "workspace"));
  if (fromQuery) return fromQuery;

  const w = window as any;
  const fromWindow = normalizeUuid(
    w.__forgeWorkspaceId ?? w.__tpWorkspaceId ?? w.__forgeWorkspace ?? w.__tpWorkspace,
  );
  if (fromWindow) return fromWindow;

  for (const key of WORKSPACE_STORAGE_KEYS) {
    const value = normalizeUuid(readLocalStorage(key));
    if (value) return value;
  }

  return null;
}

function resolveDirectWorkpieceId(): string | null {
  const fromQuery = normalizeUuid(
    getQueryParam("workpiece_id", "workpieceId", "workpiece", "cradle_id", "cradleId"),
  );
  if (fromQuery) return fromQuery;

  const w = window as any;
  const fromWindow = normalizeUuid(
    w.__forgeWorkpieceId ?? w.__tpWorkpieceId ?? w.__forgeCradleId ?? w.__tpCradleId,
  );
  if (fromWindow) return fromWindow;

  for (const key of WORKPIECE_STORAGE_KEYS) {
    const value = normalizeUuid(readLocalStorage(key));
    if (value) return value;
  }

  return null;
}

function loadCachedWorkpiece(workspaceId: string | null): string | null {
  if (!workspaceId) return null;
  return normalizeUuid(readLocalStorage(`${WORKSPACE_WORKPIECE_PREFIX}${workspaceId}`));
}

function persistWorkpiece(workspaceId: string | null, workpieceId: string): void {
  writeLocalStorage(ACTIVE_WORKPIECE_KEY, workpieceId);
  if (workspaceId) {
    writeLocalStorage(`${WORKSPACE_WORKPIECE_PREFIX}${workspaceId}`, workpieceId);
  }
}

function inferContentType(contentType: string | undefined, name: string): string {
  const fromInput = readString(contentType);
  if (fromInput) return fromInput;

  const lower = name.toLowerCase();
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  return "application/octet-stream";
}

function sanitizeFilename(name: string): string {
  const trimmed = String(name || "").trim();
  const collapsed = trimmed.replace(/[\\\/]/g, "-").replace(/\s+/g, "_").replace(/_+/g, "_");
  const safe = collapsed.slice(0, 128).replace(/^_+|_+$/g, "");
  if (safe) return safe;
  return `Recording_${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
}

async function buildHeaders(apiToken?: string): Promise<Headers> {
  const headers = new Headers({
    "content-type": "application/json",
  });
  if (apiToken) {
    headers.set("authorization", `Bearer ${apiToken}`);
  }
  return appendForgeUserAuthorization(headers);
}

async function readBodyAsJson(response: Response): Promise<unknown> {
  const text = await response.text();
  const raw = readString(text);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

function resolveCreatedWorkpieceId(body: unknown): string | null {
  const row = body as {
    data?: {
      cradle?: { id?: unknown };
      episode?: { id?: unknown };
      workpiece?: { id?: unknown };
      id?: unknown;
    };
    cradle?: { id?: unknown };
    episode?: { id?: unknown };
    workpiece?: { id?: unknown };
    id?: unknown;
  };

  return normalizeUuid(
    row?.data?.cradle?.id
      ?? row?.data?.episode?.id
      ?? row?.data?.workpiece?.id
      ?? row?.data?.id
      ?? row?.cradle?.id
      ?? row?.episode?.id
      ?? row?.workpiece?.id
      ?? row?.id,
  );
}

function isCommitAck(body: unknown): boolean {
  const row = body as {
    ok?: unknown;
    success?: unknown;
    error?: unknown;
    data?: {
      ok?: unknown;
      success?: unknown;
    };
  };

  if (row?.error) return false;

  return row?.ok === true
    || row?.success === true
    || row?.data?.ok === true
    || row?.data?.success === true;
}

function extractApiError(body: unknown): { code?: string; message?: string } {
  if (!body || typeof body !== "object") return {};
  const root = body as {
    error?: { code?: unknown; message?: unknown };
  };
  const code = readString(root.error?.code);
  const message = readString(root.error?.message);
  return {
    ...(code ? { code } : {}),
    ...(message ? { message } : {}),
  };
}

function encodeBase64(bytes: Uint8Array): string {
  if (!bytes.length) return "";

  const globalWithBuffer = globalThis as typeof globalThis & {
    Buffer?: {
      from(data: Uint8Array): { toString(encoding: "base64"): string };
    };
  };
  if (globalWithBuffer.Buffer?.from) {
    return globalWithBuffer.Buffer.from(bytes).toString("base64");
  }

  if (typeof btoa !== "function") {
    throw new Error("No base64 encoder available in runtime");
  }

  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function createCradle(
  workspaceId: string,
  writtenBy: WrittenBy,
  apiToken?: string,
): Promise<CreateCradleResult> {
  const response = await fetch("/tongs/cradles", {
    method: "POST",
    headers: await buildHeaders(apiToken),
    body: JSON.stringify({
      workspace_id: workspaceId,
      written_by: writtenBy,
      origin_tool: {
        name: "anvil",
        version: writtenBy.tool_version,
      },
      correlation_id: nextCorrelationId("anvil-create-cradle"),
    }),
  });
  const body = await readBodyAsJson(response);
  const createdId = resolveCreatedWorkpieceId(body);
  if (!response.ok || !createdId) {
    return {
      ok: false,
      status: response.status,
      details: body,
    };
  }
  return { ok: true, workpieceId: createdId };
}

async function commitFileToWorkpiece(
  workpieceId: string,
  payload: Record<string, unknown>,
  apiToken?: string,
): Promise<{ status: number; body: unknown; ok: boolean }> {
  const response = await fetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/commit-file`, {
    method: "POST",
    headers: await buildHeaders(apiToken),
    body: JSON.stringify(payload),
  });
  const body = await readBodyAsJson(response);
  return { status: response.status, body, ok: response.ok && isCommitAck(body) };
}

type ChunkedUploadBeginResponse = {
  upload_id: string;
  total_chunks: number;
  chunk_size_bytes: number;
  uploaded_chunks?: number[];
};

type ChunkedUploadFinalizeResponse = {
  workpiece_id: string;
  path: string;
};

async function beginChunkedRecordingUpload(
  workpieceId: string,
  payload: Record<string, unknown>,
  apiToken?: string,
): Promise<{ status: number; body: unknown; ok: boolean; data: ChunkedUploadBeginResponse | null }> {
  const response = await fetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/recording-upload/begin`, {
    method: "POST",
    headers: await buildHeaders(apiToken),
    body: JSON.stringify(payload),
  });
  const body = await readBodyAsJson(response);
  const data = ((body as { data?: unknown })?.data ?? null) as ChunkedUploadBeginResponse | null;
  return { status: response.status, body, ok: response.ok && isCommitAck(body), data };
}

async function uploadChunkToSession(
  workpieceId: string,
  uploadId: string,
  payload: Record<string, unknown>,
  apiToken?: string,
): Promise<{ status: number; body: unknown; ok: boolean }> {
  const response = await fetch(
    `/tongs/workpieces/${encodeURIComponent(workpieceId)}/recording-upload/${encodeURIComponent(uploadId)}/chunk`,
    {
      method: "POST",
      headers: await buildHeaders(apiToken),
      body: JSON.stringify(payload),
    },
  );
  const body = await readBodyAsJson(response);
  return { status: response.status, body, ok: response.ok && isCommitAck(body) };
}

async function finalizeChunkedRecordingUpload(
  workpieceId: string,
  uploadId: string,
  payload: Record<string, unknown>,
  apiToken?: string,
): Promise<{ status: number; body: unknown; ok: boolean; data: ChunkedUploadFinalizeResponse | null }> {
  const response = await fetch(
    `/tongs/workpieces/${encodeURIComponent(workpieceId)}/recording-upload/${encodeURIComponent(uploadId)}/finalize`,
    {
      method: "POST",
      headers: await buildHeaders(apiToken),
      body: JSON.stringify(payload),
    },
  );
  const body = await readBodyAsJson(response);
  const data = ((body as { data?: unknown })?.data ?? null) as ChunkedUploadFinalizeResponse | null;
  return { status: response.status, body, ok: response.ok && isCommitAck(body), data };
}

function readScriptHash(): string | null {
  try {
    const raw = (window as any).__TP_LAST_APPLIED_HASH;
    return readString(raw);
  } catch {
    return null;
  }
}

function readSessionRunKey(captureSessionId: string): string {
  try {
    return readString((window as any).__tpAsrRunKey) || captureSessionId;
  } catch {
    return captureSessionId;
  }
}

function emitLargeUploadWarning(detail: {
  bytes: number;
  mb: number;
  thresholdMb: number;
  strategy: UploadStrategy;
  path: string;
}): void {
  try {
    console.warn("[recording/upload] large-upload-warning", detail);
  } catch {
    // ignore
  }
  try {
    window.dispatchEvent(new CustomEvent("tp:recording:upload-warning", { detail }));
  } catch {
    // ignore
  }
  try {
    (window as any).HUD?.log?.("recording:upload:large-warning", detail);
  } catch {
    // ignore
  }
}

function emitRecordingUploadStatus(detail: RecordingUploadStatusDetail): void {
  try {
    console.info("[recording/upload] status", detail);
  } catch {
    // ignore
  }
  try {
    window.dispatchEvent(new CustomEvent("tp:recording:upload-status", { detail }));
  } catch {
    // ignore
  }
  try {
    document.dispatchEvent(new CustomEvent("tp:recording:upload-status", { detail }));
  } catch {
    // ignore
  }
  try {
    (window as any).HUD?.log?.("recording:upload:status", detail);
  } catch {
    // ignore
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function resolveRecordingCaptureTarget(): Promise<RecordingCaptureTargetResult> {
  const writtenBy = getWrittenBy();
  const apiToken = getApiToken();
  const workspaceId = resolveWorkspaceId();
  const plannerRecordingSessionId = resolvePlannerRecordingSessionId();
  let workpieceId = resolveDirectWorkpieceId() || loadCachedWorkpiece(workspaceId);
  let createdCradle = false;

  if (!workpieceId) {
    if (!workspaceId) {
      return {
        ok: false,
        reason: "missing_workpiece_context",
        workspaceId: null,
        workpieceId: null,
      };
    }
    const created = await createCradle(workspaceId, writtenBy, apiToken);
    if (!created.ok) {
      return {
        ok: false,
        reason: "create_cradle_failed",
        status: created.status,
        details: created.details,
        workspaceId,
        workpieceId: null,
      };
    }
    workpieceId = created.workpieceId;
    createdCradle = true;
  }

  persistWorkpiece(workspaceId, workpieceId);
  return {
    ok: true,
    workspaceId,
    workpieceId,
    createdCradle,
    plannerRecordingSessionId,
    captureSessionId: getOrCreateCaptureSessionId(),
  };
}

export async function ensureRecordingCaptureTarget(): Promise<RecordingCaptureTargetResult> {
  return resolveRecordingCaptureTarget();
}

export async function commitRecordingJsonArtifactToTongs(input: {
  workpieceId: string;
  path: string;
  data: unknown;
  eventName: string;
  eventPayload?: Record<string, unknown>;
}): Promise<CommitRecordingJsonArtifactResult> {
  const apiToken = getApiToken();
  const writtenBy = getWrittenBy();
  const commit = await commitFileToWorkpiece(
    input.workpieceId,
    {
      path: input.path,
      content_type: "application/json",
      written_by: writtenBy,
      bytes_base64: encodeBase64(new TextEncoder().encode(JSON.stringify(input.data))),
      event_name: input.eventName,
      event_payload: input.eventPayload ?? null,
      correlation_id: nextCorrelationId(`anvil-${input.eventName}`),
    },
    apiToken,
  );
  if (!commit.ok) {
    const apiError = extractApiError(commit.body);
    return {
      ok: false,
      reason: "commit_json_artifact_failed",
      status: commit.status,
      details: commit.body,
      ...(apiError.code ? { errorCode: apiError.code } : {}),
      ...(apiError.message ? { errorMessage: apiError.message } : {}),
      workpieceId: input.workpieceId,
      path: input.path,
    };
  }
  return {
    ok: true,
    status: commit.status,
    workpieceId: input.workpieceId,
    path: input.path,
  };
}

export async function promoteRecordingTranscriptForHammer(input: {
  workpieceId: string;
  transcript: unknown;
  captureSessionId?: string | null;
  plannerRecordingSessionId?: string | null;
  sourceTranscriptPath?: string | null;
}): Promise<CommitRecordingJsonArtifactResult> {
  return commitRecordingJsonArtifactToTongs({
    workpieceId: input.workpieceId,
    path: HAMMER_STRUCTURED_TRANSCRIPT_PATH,
    data: input.transcript,
    eventName: "take_transcript_promoted",
    eventPayload: {
      source: "anvil.local-auto",
      transcript_path: HAMMER_STRUCTURED_TRANSCRIPT_PATH,
      transcript_source_path: input.sourceTranscriptPath ?? null,
      transcript_status: "ready",
      anvil_capture_session_id: input.captureSessionId ?? getOrCreateCaptureSessionId(),
      recording_session_id: input.plannerRecordingSessionId ?? resolvePlannerRecordingSessionId(),
    },
  });
}

async function uploadRecordingWithStrategy(args: {
  strategy: UploadStrategy;
  workpieceId: string;
  bytes: Uint8Array;
  chunkSizeMb: number;
  commitPayloadBase: Record<string, unknown>;
  apiToken?: string;
  onStatus?: (status: {
    phase: RecordingUploadStatusPhase;
    chunkIndex?: number | null;
    totalChunks?: number | null;
    chunkBytes?: number | null;
    progressPct?: number | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  }) => void;
}): Promise<{ status: number; body: unknown; ok: boolean }> {
  if (args.strategy === "single") {
    args.onStatus?.({
      phase: "uploading",
      chunkIndex: 1,
      totalChunks: 1,
      chunkBytes: args.bytes.byteLength,
      progressPct: 0,
    });
    return commitFileToWorkpiece(
      args.workpieceId,
      {
        ...args.commitPayloadBase,
        bytes_base64: encodeBase64(args.bytes),
      },
      args.apiToken,
    );
  }

  const chunkSizeBytes = mbToBytes(args.chunkSizeMb);
  const chunks = buildRecordingChunks(args.bytes.byteLength, chunkSizeBytes);
  const begin = await beginChunkedRecordingUpload(
    args.workpieceId,
    {
      ...args.commitPayloadBase,
      total_bytes: args.bytes.byteLength,
      total_chunks: chunks.length,
      chunk_size_bytes: chunkSizeBytes,
      strategy: "chunked",
    },
    args.apiToken,
  );
  if (!begin.ok || !begin.data?.upload_id) {
    return {
      status: begin.status,
      body: begin.body,
      ok: false,
    };
  }
  const uploadId = begin.data.upload_id;
  const uploadedChunks = new Set<number>(
    (begin.data.uploaded_chunks || []).filter((value) => Number.isInteger(value) && value >= 0),
  );
  const progressPctFor = (uploadedCount: number, totalChunks: number): number =>
    Math.max(0, Math.min(100, Math.round((uploadedCount / Math.max(1, totalChunks)) * 100)));

  args.onStatus?.({
    phase: "uploading",
    chunkIndex: uploadedChunks.size > 0 ? uploadedChunks.size : 1,
    totalChunks: chunks.length,
    chunkBytes: chunks[0]?.size ?? null,
    progressPct: progressPctFor(uploadedChunks.size, chunks.length),
  });

  for (const chunk of chunks) {
    if (uploadedChunks.has(chunk.index)) {
      try {
        console.info("[recording/upload] chunk-complete", {
          index: chunk.index + 1,
          total: chunk.totalChunks,
          bytes: chunk.size,
          skipped: true,
        });
      } catch {
        // ignore
      }
      args.onStatus?.({
        phase: "uploading",
        chunkIndex: chunk.index + 1,
        totalChunks: chunk.totalChunks,
        chunkBytes: chunk.size,
        progressPct: progressPctFor(uploadedChunks.size, chunk.totalChunks),
      });
      continue;
    }

    try {
      console.info("[recording/upload] chunk-start", {
        index: chunk.index + 1,
        total: chunk.totalChunks,
        bytes: chunk.size,
      });
    } catch {
      // ignore
    }

    let completed = false;
    let lastFailure: { status: number; body: unknown } | null = null;
    for (let attempt = 1; attempt <= CHUNK_UPLOAD_RETRY_ATTEMPTS; attempt += 1) {
      const payload = {
        index: chunk.index,
        total_chunks: chunk.totalChunks,
        bytes_base64: encodeBase64(args.bytes.subarray(chunk.startByte, chunk.endByte)),
      };
      const chunkResult = await uploadChunkToSession(args.workpieceId, uploadId, payload, args.apiToken);
      if (chunkResult.ok) {
        completed = true;
        uploadedChunks.add(chunk.index);
        try {
          console.info("[recording/upload] chunk-complete", {
            index: chunk.index + 1,
            total: chunk.totalChunks,
            bytes: chunk.size,
          });
        } catch {
          // ignore
        }
        args.onStatus?.({
          phase: "uploading",
          chunkIndex: chunk.index + 1,
          totalChunks: chunk.totalChunks,
          chunkBytes: chunk.size,
          progressPct: progressPctFor(uploadedChunks.size, chunk.totalChunks),
        });
        break;
      }

      lastFailure = { status: chunkResult.status, body: chunkResult.body };
      try {
        console.warn("[recording/upload] chunk-failed", {
          index: chunk.index + 1,
          total: chunk.totalChunks,
          attempt,
          status: chunkResult.status,
          error: chunkResult.body,
        });
      } catch {
        // ignore
      }
      if (attempt < CHUNK_UPLOAD_RETRY_ATTEMPTS) {
        await sleep(CHUNK_UPLOAD_RETRY_BACKOFF_MS * attempt);
      }
    }

    if (!completed) {
      const apiError = extractApiError(lastFailure?.body ?? null);
      args.onStatus?.({
        phase: "failed",
        chunkIndex: chunk.index + 1,
        totalChunks: chunk.totalChunks,
        chunkBytes: chunk.size,
        progressPct: progressPctFor(uploadedChunks.size, chunk.totalChunks),
        errorCode: apiError.code ?? "chunk_upload_failed",
        errorMessage: apiError.message ?? "Failed uploading chunk",
      });
      return {
        status: lastFailure?.status ?? 500,
        body: {
          ok: false,
          error: {
            code: "chunk_upload_failed",
            message: "Failed uploading chunk",
            index: chunk.index,
            total_chunks: chunk.totalChunks,
            details: lastFailure?.body ?? null,
          },
        },
        ok: false,
      };
    }
  }

  try {
    console.info("[recording/upload] finalize-start", {
      totalChunks: chunks.length,
      totalBytes: args.bytes.byteLength,
      });
  } catch {
    // ignore
  }
  args.onStatus?.({
    phase: "finalizing",
    chunkIndex: chunks.length,
    totalChunks: chunks.length,
    chunkBytes: null,
    progressPct: 100,
  });
  const finalize = await finalizeChunkedRecordingUpload(
    args.workpieceId,
    uploadId,
    {
      correlation_id: nextCorrelationId("anvil-recording-finalize"),
    },
    args.apiToken,
  );
  if (finalize.ok) {
    try {
      console.info("[recording/upload] finalize-complete", {
        objectId: finalize.data?.path ?? null,
        totalChunks: chunks.length,
        totalBytes: args.bytes.byteLength,
      });
    } catch {
      // ignore
    }
  }
  return {
    status: finalize.status,
    body: finalize.body,
    ok: finalize.ok,
  };
}

export async function commitRecordingBytesToTongs(input: RecordingCommitInput): Promise<RecordingCommitResult> {
  const apiToken = getApiToken();
  const writtenBy = getWrittenBy();
  const target = await resolveRecordingCaptureTarget();
  if (!target.ok) {
    return {
      ok: false,
      reason: target.reason,
      status: target.status,
      details: target.details,
      workspaceId: target.workspaceId,
      workpieceId: target.workpieceId,
    };
  }
  const workspaceId = target.workspaceId;
  let workpieceId = target.workpieceId;
  let createdCradle = target.createdCradle;
  const plannerRecordingSessionId = target.plannerRecordingSessionId;

  const name = sanitizeFilename(input.originalName);
  const path = `recordings/${name}`;
  const contentType = inferContentType(input.contentType, name);
  const captureSessionId = target.captureSessionId;
  const uploadConfig = resolveUploadStrategyConfig();
  const strategy = selectUploadStrategyForBytes(input.bytes.byteLength, uploadConfig);
  const bytesMb = Number((input.bytes.byteLength / (1024 * 1024)).toFixed(2));
  const thresholdExceeded = input.bytes.byteLength > mbToBytes(uploadConfig.largeUploadWarnMb);
  const sessionRunKey = readSessionRunKey(captureSessionId);
  const title = deriveRecordingTitleFromName(input.originalName);
  const scriptHash = readScriptHash();
  const commitPathMode = strategy === "chunked" ? "recording-upload.chunked" : "commit-file.single";
  const emitUploadStatus = (
    phase: RecordingUploadStatusPhase,
    patch: Partial<Omit<RecordingUploadStatusDetail, "phase">> = {},
  ) => {
    emitRecordingUploadStatus({
      phase,
      strategy,
      bytes: input.bytes.byteLength,
      mb: bytesMb,
      sessionRunKey,
      workpieceId,
      workspaceId,
      title,
      scriptHash,
      destinationPath: path,
      commitPathMode,
      warningThresholdMb: uploadConfig.largeUploadWarnMb,
      warningThresholdExceeded: thresholdExceeded,
      ...(patch as Partial<RecordingUploadStatusDetail>),
    });
  };

  try {
    console.info("[recording/upload] blob-summary", {
      bytes: input.bytes.byteLength,
      mb: bytesMb,
      sessionRunKey,
      workpieceId,
      workspaceId,
      title,
      scriptHash,
      strategy,
      destinationPath: path,
      commitPathMode,
      warningThresholdMb: uploadConfig.largeUploadWarnMb,
      warningThresholdExceeded: thresholdExceeded,
    });
  } catch {
    // ignore
  }
  if (thresholdExceeded) {
    emitLargeUploadWarning({
      bytes: input.bytes.byteLength,
      mb: bytesMb,
      thresholdMb: uploadConfig.largeUploadWarnMb,
      strategy,
      path,
    });
  }
  emitUploadStatus("preflight", {
    progressPct: 0,
    safeToLeave: false,
    chunkIndex: 0,
    totalChunks: strategy === "chunked" ? null : 1,
  });

  const commitPayloadBase = {
    path,
    content_type: contentType,
    written_by: writtenBy,
    event_name: "take_completed",
    event_payload: {
      source: "anvil.local-auto",
      file_path: path,
      original_name: input.originalName,
      bytes: input.bytes.byteLength,
      content_type: contentType,
      created_cradle: createdCradle,
      recording_session_id: plannerRecordingSessionId,
      anvil_capture_session_id: captureSessionId,
      transcript_path: input.transcriptPath ?? null,
      transcript_status: input.transcriptStatus ?? null,
      recording_medium: input.recordingMedium ?? null,
      requires_post_normalization: input.requiresPostNormalization === true,
      upload_strategy: strategy,
    },
    correlation_id: nextCorrelationId("anvil-recording"),
  };

  let didRetry404 = false;
  let commit = await uploadRecordingWithStrategy({
      strategy,
      workpieceId,
      bytes: input.bytes,
      chunkSizeMb: uploadConfig.chunkSizeMb,
      commitPayloadBase,
      apiToken,
      onStatus: (status) => {
        emitUploadStatus(status.phase, {
          chunkIndex: status.chunkIndex ?? null,
          totalChunks: status.totalChunks ?? null,
          chunkBytes: status.chunkBytes ?? null,
          progressPct: status.progressPct ?? null,
          safeToLeave: false,
          errorCode: status.errorCode ?? null,
          errorMessage: status.errorMessage ?? null,
        });
      },
    });

  // Single defensive retry: stale cached workpiece IDs can happen after cradle resets.
  if (!commit.ok && commit.status === 404 && workspaceId) {
    didRetry404 = true;
    const replacement = await createCradle(workspaceId, writtenBy, apiToken);
    if (replacement.ok) {
      workpieceId = replacement.workpieceId;
      createdCradle = true;
      persistWorkpiece(workspaceId, workpieceId);
      (commitPayloadBase.event_payload as Record<string, unknown>).created_cradle = true;
      commit = await uploadRecordingWithStrategy({
        strategy,
        workpieceId,
        bytes: input.bytes,
        chunkSizeMb: uploadConfig.chunkSizeMb,
        commitPayloadBase,
        apiToken,
        onStatus: (status) => {
          emitUploadStatus(status.phase, {
            chunkIndex: status.chunkIndex ?? null,
            totalChunks: status.totalChunks ?? null,
            chunkBytes: status.chunkBytes ?? null,
            progressPct: status.progressPct ?? null,
            safeToLeave: false,
            errorCode: status.errorCode ?? null,
            errorMessage: status.errorMessage ?? null,
          });
        },
      });
    }
  }

  if (!commit.ok) {
    const apiError = extractApiError(commit.body);
    emitUploadStatus("failed", {
      safeToLeave: false,
      progressPct: null,
      errorCode: apiError.code ?? null,
      errorMessage: apiError.message ?? "Canonical upload failed",
    });
    return {
      ok: false,
      reason: didRetry404 ? "commit_failed_after_retry" : "commit_failed",
      status: commit.status,
      ...(apiError.code ? { errorCode: apiError.code } : {}),
      ...(apiError.message ? { errorMessage: apiError.message } : {}),
      details: commit.body,
      workspaceId,
      workpieceId,
    };
  }
  emitUploadStatus("done", {
    safeToLeave: true,
    progressPct: 100,
    chunkIndex: strategy === "chunked" ? null : 1,
    totalChunks: strategy === "chunked" ? null : 1,
    chunkBytes: strategy === "chunked" ? null : input.bytes.byteLength,
  });

  return {
    ok: true,
    workpieceId,
    path,
    createdCradle,
    plannerRecordingSessionId,
    captureSessionId,
    status: commit.status,
  };
}

export async function appendRecordingDecisionToTongs(
  input: AppendRecordingDecisionInput,
): Promise<AppendRecordingDecisionResult> {
  const apiToken = getApiToken();
  const writtenBy = getWrittenBy();
  const captureSessionId = readString(input.captureSessionId) || getOrCreateCaptureSessionId();
  const response = await fetch(`/tongs/workpieces/${encodeURIComponent(input.workpieceId)}/append-event`, {
    method: "POST",
    headers: await buildHeaders(apiToken),
    body: JSON.stringify({
      event_name: input.eventName,
      written_by: writtenBy,
      payload: {
        source: "anvil.local-auto",
        file_path: input.filePath,
        original_name: input.originalName,
        bytes: input.bytes,
        content_type: input.contentType,
        duration_ms: typeof input.durationMs === "number" && Number.isFinite(input.durationMs)
          ? Math.max(0, Math.round(input.durationMs))
          : null,
        created_cradle: input.createdCradle === true,
        recording_session_id: input.plannerRecordingSessionId ?? null,
        anvil_capture_session_id: captureSessionId,
        transcript_path: input.transcriptPath ?? null,
        transcript_status: input.transcriptStatus ?? null,
        transcript_source_path: input.transcriptSourcePath ?? null,
        recording_medium: input.recordingMedium ?? null,
        requires_post_normalization: input.requiresPostNormalization === true,
      },
      correlation_id: nextCorrelationId(`anvil-${input.eventName}`),
    }),
  });
  const body = await readBodyAsJson(response);
  if (!response.ok) {
    const apiError = extractApiError(body);
    return {
      ok: false,
      reason: "append_event_failed",
      status: response.status,
      ...(apiError.code ? { errorCode: apiError.code } : {}),
      ...(apiError.message ? { errorMessage: apiError.message } : {}),
      details: body,
    };
  }
  return {
    ok: true,
    status: response.status,
  };
}

export async function commitRecordingBlobToTongs(blob: Blob, originalName: string): Promise<RecordingCommitResult> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const contentType = readString(blob.type) || undefined;
  return commitRecordingBytesToTongs({ bytes, originalName, contentType });
}
