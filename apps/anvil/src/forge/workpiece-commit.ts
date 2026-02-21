type WrittenBy = {
  tool: string;
  tool_version: string;
  lane: string;
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

const WORKSPACE_STORAGE_KEYS = ["forge_workspace_id_v1", "barstock_workspace_id"] as const;
const WORKPIECE_STORAGE_KEYS = [
  "forge_active_workpiece_id_v1",
  "forge_workpiece_id_v1",
  "tp_workpiece_id",
  "tp:last_script_id",
] as const;

const ACTIVE_WORKPIECE_KEY = "forge_active_workpiece_id_v1";
const WORKSPACE_WORKPIECE_PREFIX = "forge_anvil_recording_workpiece_v1:";

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

function getWrittenBy(): WrittenBy {
  const version = readString((window as any).APP_VERSION) || DEFAULT_TOOL_VERSION;
  return {
    tool: "anvil",
    tool_version: version,
    lane: "forge-managed",
  };
}

function getApiToken(): string | undefined {
  return readString((window as any).__forgeTongsApiToken) ?? undefined;
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

function inferContentType(blob: Blob, name: string): string {
  const byBlob = readString(blob.type);
  if (byBlob) return byBlob;
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

async function blobToBase64(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Failed to read recording blob"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");
      const base64 = comma >= 0 ? result.slice(comma + 1) : result;
      if (!base64) {
        reject(new Error("Failed to encode recording blob"));
        return;
      }
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
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
      correlation_id: `anvil-create-cradle-${Date.now()}`,
    }),
  });
  const body = await readBodyAsJson(response);
  const createdId = normalizeUuid((body as any)?.data?.cradle?.id);
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
  return { status: response.status, body, ok: response.ok && (body as any)?.ok === true };
}

export async function commitRecordingBlobToTongs(blob: Blob, originalName: string): Promise<RecordingCommitResult> {
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

  const name = sanitizeFilename(originalName);
  const path = `recordings/${name}`;
  const contentType = inferContentType(blob, name);
  const bytesBase64 = await blobToBase64(blob);

  const commitPayload = {
    path,
    content_type: contentType,
    written_by: writtenBy,
    bytes_base64: bytesBase64,
    event_name: "anvil.recording.committed",
    event_payload: {
      source: "anvil.local-auto",
      original_name: originalName,
      bytes: blob.size,
      content_type: contentType,
      created_cradle: createdCradle,
    },
    correlation_id: `anvil-recording-${Date.now()}`,
  };

  let commit = await commitFileToWorkpiece(workpieceId, commitPayload, apiToken);
  if (!commit.ok && commit.status === 404 && workspaceId) {
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
      reason: "commit_failed",
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
