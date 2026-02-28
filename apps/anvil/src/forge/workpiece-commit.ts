type WrittenBy = {
  tool: string;
  tool_version: string;
  lane: string;
};

type RecordingCommitInput = {
  bytes: Uint8Array;
  originalName: string;
  contentType?: string;
};

export type RecordingCommitResult =
  | {
      ok: true;
      workpieceId: string;
      path: string;
      createdCradle: boolean;
      status: number;
    }
  | {
      ok: false;
      reason: string;
      status?: number;
      details?: unknown;
      workspaceId?: string | null;
      workpieceId?: string | null;
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
const RECORDING_SESSION_KEY = "forge_anvil_recording_session_v1";

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

  try {
    const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
    const fromEnv = readString(meta.env?.VITE_TONGS_API_TOKEN);
    if (fromEnv) return fromEnv;
  } catch {
    // ignore env access failures
  }

  return readLocalStorage("forge_tongs_api_token_v1") ?? undefined;
}

function getOrCreateRecordingSessionId(): string {
  const existing = readSessionStorage(RECORDING_SESSION_KEY);
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

  writeSessionStorage(RECORDING_SESSION_KEY, next);
  return next;
}

function nextCorrelationId(prefix: string): string {
  correlationSeq += 1;
  return `${prefix}:${getOrCreateRecordingSessionId()}:${correlationSeq}`;
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

function buildHeaders(apiToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (apiToken) {
    headers.authorization = `Bearer ${apiToken}`;
  }
  return headers;
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
    headers: buildHeaders(apiToken),
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
    headers: buildHeaders(apiToken),
    body: JSON.stringify(payload),
  });
  const body = await readBodyAsJson(response);
  return { status: response.status, body, ok: response.ok && isCommitAck(body) };
}

export async function commitRecordingBytesToTongs(input: RecordingCommitInput): Promise<RecordingCommitResult> {
  const writtenBy = getWrittenBy();
  const apiToken = getApiToken();
  const workspaceId = resolveWorkspaceId();
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

  const name = sanitizeFilename(input.originalName);
  const path = `recordings/${name}`;
  const contentType = inferContentType(input.contentType, name);
  const bytesBase64 = encodeBase64(input.bytes);
  const recordingSessionId = getOrCreateRecordingSessionId();

  const commitPayload = {
    path,
    content_type: contentType,
    written_by: writtenBy,
    bytes_base64: bytesBase64,
    event_name: "anvil.recording.committed",
    event_payload: {
      source: "anvil.local-auto",
      original_name: input.originalName,
      bytes: input.bytes.byteLength,
      content_type: contentType,
      created_cradle: createdCradle,
      recording_session_id: recordingSessionId,
    },
    correlation_id: nextCorrelationId("anvil-recording"),
  };

  let didRetry404 = false;
  let commit = await commitFileToWorkpiece(workpieceId, commitPayload, apiToken);

  // Single defensive retry: stale cached workpiece IDs can happen after cradle resets.
  if (!commit.ok && commit.status === 404 && workspaceId) {
    didRetry404 = true;
    const replacement = await createCradle(workspaceId, writtenBy, apiToken);
    if (replacement.ok) {
      workpieceId = replacement.workpieceId;
      createdCradle = true;
      persistWorkpiece(workspaceId, workpieceId);
      commit = await commitFileToWorkpiece(workpieceId, commitPayload, apiToken);
    }
  }

  if (!commit.ok) {
    return {
      ok: false,
      reason: didRetry404 ? "commit_failed_after_retry" : "commit_failed",
      status: commit.status,
      details: commit.body,
      workspaceId,
      workpieceId,
    };
  }

  return {
    ok: true,
    workpieceId,
    path,
    createdCradle,
    status: commit.status,
  };
}

export async function commitRecordingBlobToTongs(blob: Blob, originalName: string): Promise<RecordingCommitResult> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const contentType = readString(blob.type) || undefined;
  return commitRecordingBytesToTongs({ bytes, originalName, contentType });
}
