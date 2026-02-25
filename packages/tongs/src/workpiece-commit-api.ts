import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./db.types.js";

export const TONGS_WORKPIECE_BUCKET = "forge-workpieces";

const MANIFEST_PATH = "manifest.json";
const SHA256_ALGO = "sha256";
const DEFAULT_ORIGIN_TOOL = { name: "tongs", version: "0.1.0" } as const;
const DEFAULT_WRITTEN_BY = { tool: "tongs", tool_version: "0.1.0", lane: "forge-managed" } as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BOOTSTRAP_WORKPIECE_PATHS = new Set(["script/session.json", "script/script.sources.json"]);
const BOOTSTRAP_WORKSPACE_PATHS = new Set(["sources/index.json"]);

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type EpisodeRow = Database["tongs"]["Tables"]["episodes"]["Row"];
type WorkpieceFileRow = Database["tongs"]["Tables"]["workpiece_files"]["Row"];
type WorkpieceEventRow = Database["tongs"]["Tables"]["workpiece_events"]["Row"];
type WorkspaceRow = Database["tongs"]["Tables"]["workspaces"]["Row"];

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

type ManifestPointerKey =
  | "script_primary"
  | "script_format"
  | "script_sources"
  | "assets_registry"
  | "session_current"
  | "edit_current"
  | "export_current"
  | "publish_intent";

const MANIFEST_POINTER_KEYS: readonly ManifestPointerKey[] = [
  "script_primary",
  "script_format",
  "script_sources",
  "assets_registry",
  "session_current",
  "edit_current",
  "export_current",
  "publish_intent",
] as const;

const MANIFEST_POINTER_KEY_SET = new Set<ManifestPointerKey>(MANIFEST_POINTER_KEYS);

type ManifestFileEntry = {
  type: string;
  content_type: string;
  bytes: number;
  hash: {
    algo: "sha256";
    value: string;
  };
  written_by: WrittenBy;
  updated_at: string;
};

type WorkpieceManifest = {
  schema: "forge.manifest.v1";
  workpiece_id: string;
  workspace_id: string;
  created_at: string;
  updated_at: string;
  status: string;
  pointers: Record<ManifestPointerKey, string | null>;
  hashing: {
    algo: "sha256";
    text_newlines: "LF";
    json: {
      sorted_keys: true;
      minified: true;
      preserve_array_order: true;
    };
  };
  origin: {
    created_by: {
      user_id: string | null;
      display_name: string | null;
    };
    tool: {
      name: string;
      version: string;
    };
  };
  files: Record<string, ManifestFileEntry>;
};

export type WrittenBy = {
  tool: string;
  tool_version: string;
  lane: string;
};

export type CreateCradleRequest = {
  workspace_id: string;
  cradle_id?: string;
  status?: string;
  metadata?: Json;
  created_by?: {
    user_id?: string | null;
    display_name?: string | null;
  };
  origin_tool?: {
    name: string;
    version: string;
  };
  written_by?: WrittenBy;
  correlation_id?: string;
};

export type CreateCradleResponse = {
  cradle: EpisodeRow;
  manifest_hash: string;
  manifest_bytes: number;
  files_indexed: number;
  event: WorkpieceEventRow;
};

export type CommitFileRequest = {
  path: string;
  content_type?: string;
  file_type?: string;
  written_by: WrittenBy;
  pointer?: ManifestPointerKey;
  event_name?: string;
  event_payload?: Json;
  correlation_id?: string;
  text?: string;
  json?: unknown;
  content?: unknown;
  bytes_base64?: string;
  content_base64?: string;
  jsonl_append?: unknown;
};

export type CommitFileResponse = {
  workpiece_id: string;
  path: string;
  storage_key: string;
  hash: string;
  bytes: number;
  content_type: string;
  manifest_hash: string;
  manifest_bytes: number;
  file_row: WorkpieceFileRow;
  manifest_row: WorkpieceFileRow;
  event: WorkpieceEventRow;
};

export type CommitWorkspaceFileResponse = {
  workspace_id: string;
  path: string;
  storage_key: string;
  hash: string;
  bytes: number;
  content_type: string;
};

export type ReadJsonFileResult =
  | { found: true; data: unknown }
  | { found: false };

export type AppendEventRequest = {
  event_name: string;
  payload?: Json;
  correlation_id?: string;
  written_by: WrittenBy;
};

export type TongsCommitApiOptions = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  bucket?: string;
  apiToken?: string;
};

export type TongsCommitApiService = {
  createCradle(input: CreateCradleRequest): Promise<CreateCradleResponse>;
  commitFile(workpieceId: string, input: CommitFileRequest): Promise<CommitFileResponse>;
  commitWorkspaceFile(workspaceId: string, input: CommitFileRequest): Promise<CommitWorkspaceFileResponse>;
  appendEvent(workpieceId: string, input: AppendEventRequest): Promise<WorkpieceEventRow>;
  readWorkpieceJson(workpieceId: string, path: string): Promise<ReadJsonFileResult>;
  readWorkspaceJson(workspaceId: string, path: string): Promise<ReadJsonFileResult>;
};

class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return jsonResponse(error.status, {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(typeof error.details === "undefined" ? {} : { details: error.details }),
      },
    });
  }

  const message = error instanceof Error ? error.message : "Unexpected error";
  return jsonResponse(500, {
    ok: false,
    error: {
      code: "internal_error",
      message,
    },
  });
}

async function parseJsonBody(request: Request): Promise<Record<string, unknown>> {
  let text = "";
  try {
    text = await request.text();
  } catch (error) {
    throw new HttpError(400, "invalid_body", "Unable to read request body", {
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed)) {
      throw new HttpError(400, "invalid_body", "Request body must be a JSON object");
    }
    return parsed;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON", {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeUuid(input: unknown, field: string): string {
  if (typeof input !== "string" || !UUID_RE.test(input)) {
    throw new HttpError(400, "invalid_uuid", `Invalid ${field}`);
  }
  return input;
}

function normalizeNonEmptyString(input: unknown, field: string): string {
  if (typeof input !== "string") {
    throw new HttpError(400, "invalid_string", `${field} must be a string`);
  }
  const trimmed = input.trim();
  if (!trimmed) {
    throw new HttpError(400, "invalid_string", `${field} must not be empty`);
  }
  return trimmed;
}

function normalizeContentType(input: unknown, path: string): string {
  if (typeof input === "string" && input.trim()) return input.trim();
  const ext = extensionOf(path);
  if (ext === ".json") return "application/json";
  if (ext === ".jsonl") return "application/x-ndjson";
  if (ext === ".md") return "text/markdown; charset=utf-8";
  if (ext === ".txt" || ext === ".vtt") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function normalizeRelativePath(input: unknown): string {
  if (typeof input !== "string") {
    throw new HttpError(400, "invalid_path", "path must be a string");
  }

  const trimmed = input.trim();
  if (!trimmed) throw new HttpError(400, "invalid_path", "path must not be empty");
  if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) {
    throw new HttpError(400, "invalid_path", "path must be relative to workpiece root");
  }
  if (trimmed.includes("\\")) {
    throw new HttpError(400, "invalid_path", "path must use forward slashes");
  }

  const segments = trimmed.split("/");
  for (const segment of segments) {
    if (!segment || segment === "." || segment === "..") {
      throw new HttpError(400, "invalid_path", "path contains invalid segments");
    }
  }

  return segments.join("/");
}

function extensionOf(path: string): string {
  const idx = path.lastIndexOf(".");
  if (idx <= 0 || idx === path.length - 1) return "";
  return path.slice(idx).toLowerCase();
}

function isJsonFile(path: string, contentType: string): boolean {
  const ext = extensionOf(path);
  if (ext === ".json") return true;
  return contentType.toLowerCase().includes("application/json");
}

function isJsonlFile(path: string, contentType: string): boolean {
  const ext = extensionOf(path);
  if (ext === ".jsonl") return true;
  const ct = contentType.toLowerCase();
  return ct.includes("jsonl") || ct.includes("ndjson");
}

function isLfTextFile(path: string): boolean {
  const ext = extensionOf(path);
  return ext === ".md" || ext === ".txt" || ext === ".vtt";
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function normalizeLf(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function normalizeWrittenBy(input: unknown): WrittenBy {
  if (!isRecord(input)) {
    throw new HttpError(400, "invalid_written_by", "written_by is required");
  }

  return {
    tool: normalizeNonEmptyString(input.tool, "written_by.tool"),
    tool_version: normalizeNonEmptyString(input.tool_version, "written_by.tool_version"),
    lane: normalizeNonEmptyString(input.lane, "written_by.lane"),
  };
}

function normalizeJsonValue(input: unknown): JsonValue {
  if (input === null) return null;
  if (typeof input === "string" || typeof input === "boolean") return input;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      throw new HttpError(400, "invalid_json", "JSON numbers must be finite");
    }
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((item) => normalizeJsonValue(item));
  }
  if (isRecord(input)) {
    const out: JsonObject = {};
    for (const key of Object.keys(input).sort()) {
      const value = input[key];
      if (typeof value === "undefined") continue;
      out[key] = normalizeJsonValue(value);
    }
    return out;
  }

  throw new HttpError(400, "invalid_json", "JSON payload contains unsupported values");
}

function canonicalJsonBytes(input: unknown): Uint8Array {
  const normalized = normalizeJsonValue(input);
  return textEncoder.encode(JSON.stringify(normalized));
}

function parseJsonText(text: string, field: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new HttpError(400, "invalid_json", `${field} must contain valid JSON`, {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

function decodeBase64(base64: string): Uint8Array {
  const value = base64.trim();
  if (!value) throw new HttpError(400, "invalid_base64", "base64 payload must not be empty");

  if (typeof atob === "function") {
    try {
      const binary = atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    } catch (error) {
      throw new HttpError(400, "invalid_base64", "Invalid base64 payload", {
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const globalWithBuffer = globalThis as typeof globalThis & {
    Buffer?: {
      from(data: string, encoding: "base64"): Uint8Array;
    };
  };

  if (globalWithBuffer.Buffer?.from) {
    try {
      return new Uint8Array(globalWithBuffer.Buffer.from(value, "base64"));
    } catch (error) {
      throw new HttpError(400, "invalid_base64", "Invalid base64 payload", {
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new HttpError(500, "base64_unavailable", "No base64 decoder available in runtime");
}

function uint8ToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new HttpError(500, "crypto_unavailable", "crypto.subtle is unavailable in this runtime");
  }

  const digest = await subtle.digest("SHA-256", uint8ToArrayBuffer(bytes));
  const out = new Uint8Array(digest);
  let hex = "";
  for (const n of out) {
    hex += n.toString(16).padStart(2, "0");
  }
  return hex;
}

function buildStorageKey(workpieceId: string, path: string): string {
  return `workpieces/${workpieceId}/${path}`;
}

function buildWorkspaceStorageKey(workspaceId: string, path: string): string {
  return `workspaces/${workspaceId}/${path}`;
}

function buildManifestFileEntry(
  type: string,
  contentType: string,
  bytes: number,
  hash: string,
  writtenBy: WrittenBy,
  updatedAt: string,
): ManifestFileEntry {
  return {
    type,
    content_type: contentType,
    bytes,
    hash: {
      algo: SHA256_ALGO,
      value: hash,
    },
    written_by: writtenBy,
    updated_at: updatedAt,
  };
}

function inferFileType(path: string, contentType: string): string {
  if (path === "metadata.json") return "metadata";
  if (path === MANIFEST_PATH) return "manifest";
  if (path === "assets/assets.json") return "assets_registry";
  if (path === "script/script.md") return "script";
  if (path === "script/script.format.json") return "script_format";
  if (path === "script/script.sources.json") return "script_sources";

  if (path.startsWith("script/") && extensionOf(path) === ".md") return "script";
  if (path.startsWith("assets/") && extensionOf(path) === ".json") return "asset";
  if (path.startsWith("events/") && extensionOf(path) === ".jsonl") return "events";
  if (isJsonFile(path, contentType)) return "json";
  if (isLfTextFile(path)) return "text";
  return "artifact";
}

function inferPointerKey(path: string): ManifestPointerKey | null {
  if (path === "script/script.md") return "script_primary";
  if (path === "script/script.format.json") return "script_format";
  if (path === "script/script.sources.json") return "script_sources";
  if (path === "assets/assets.json") return "assets_registry";
  if (path.startsWith("session/")) return "session_current";
  if (path.startsWith("edit/")) return "edit_current";
  if (path.startsWith("export/")) return "export_current";
  if (path.startsWith("publish/")) return "publish_intent";
  return null;
}

function applyPointerUpdates(manifest: WorkpieceManifest, path: string, pointer?: ManifestPointerKey): void {
  if (pointer) {
    manifest.pointers[pointer] = path;
  }

  const inferred = inferPointerKey(path);
  if (inferred) {
    manifest.pointers[inferred] = path;
  }

  const pointerKeys = Object.keys(manifest.pointers) as ManifestPointerKey[];
  for (const key of pointerKeys) {
    if (manifest.pointers[key] === path) {
      manifest.pointers[key] = path;
    }
  }
}

function normalizeCorrelationId(input: unknown): string | null {
  if (typeof input === "undefined" || input === null) return null;
  return normalizeNonEmptyString(input, "correlation_id");
}

function normalizePointerKey(input: unknown): ManifestPointerKey | undefined {
  if (typeof input === "undefined") return undefined;
  if (typeof input !== "string") {
    throw new HttpError(400, "invalid_pointer", "pointer must be a string");
  }
  const trimmed = input.trim();
  if (!trimmed) {
    throw new HttpError(400, "invalid_pointer", "pointer must not be empty");
  }
  if (!MANIFEST_POINTER_KEY_SET.has(trimmed as ManifestPointerKey)) {
    throw new HttpError(400, "invalid_pointer", `Unsupported pointer key: ${trimmed}`);
  }
  return trimmed as ManifestPointerKey;
}

function asJson(input: unknown): Json {
  return normalizeJsonValue(input) as Json;
}

function defaultManifest(workpieceId: string, workspaceId: string, status: string, nowIso: string): WorkpieceManifest {
  return {
    schema: "forge.manifest.v1",
    workpiece_id: workpieceId,
    workspace_id: workspaceId,
    created_at: nowIso,
    updated_at: nowIso,
    status,
    pointers: {
      script_primary: null,
      script_format: null,
      script_sources: null,
      assets_registry: "assets/assets.json",
      session_current: null,
      edit_current: null,
      export_current: null,
      publish_intent: null,
    },
    hashing: {
      algo: "sha256",
      text_newlines: "LF",
      json: {
        sorted_keys: true,
        minified: true,
        preserve_array_order: true,
      },
    },
    origin: {
      created_by: {
        user_id: null,
        display_name: null,
      },
      tool: {
        name: DEFAULT_ORIGIN_TOOL.name,
        version: DEFAULT_ORIGIN_TOOL.version,
      },
    },
    files: {},
  };
}

function normalizeLoadedManifest(
  parsed: unknown,
  fallback: {
    workpieceId: string;
    workspaceId: string;
    status: string;
    createdAt: string;
  },
): WorkpieceManifest {
  if (!isRecord(parsed)) {
    throw new HttpError(500, "manifest_invalid", "manifest.json is not a JSON object");
  }

  const base = defaultManifest(fallback.workpieceId, fallback.workspaceId, fallback.status, fallback.createdAt);

  const schema = parsed.schema === "forge.manifest.v1" ? "forge.manifest.v1" : base.schema;
  const workpieceId = typeof parsed.workpiece_id === "string" ? parsed.workpiece_id : base.workpiece_id;
  const workspaceId = typeof parsed.workspace_id === "string" ? parsed.workspace_id : base.workspace_id;
  const createdAt = typeof parsed.created_at === "string" ? parsed.created_at : base.created_at;
  const updatedAt = typeof parsed.updated_at === "string" ? parsed.updated_at : base.updated_at;
  const status = typeof parsed.status === "string" && parsed.status.trim() ? parsed.status : base.status;

  const pointers = { ...base.pointers };
  if (isRecord(parsed.pointers)) {
    const keys = Object.keys(pointers) as ManifestPointerKey[];
    for (const key of keys) {
      const value = parsed.pointers[key];
      pointers[key] = typeof value === "string" ? value : null;
    }
  }

  const files: Record<string, ManifestFileEntry> = {};
  if (isRecord(parsed.files)) {
    for (const [path, entry] of Object.entries(parsed.files)) {
      if (!isRecord(entry)) continue;
      const hash = isRecord(entry.hash) ? entry.hash : null;
      const writtenByRaw = isRecord(entry.written_by) ? entry.written_by : null;
      if (!hash || !writtenByRaw) continue;
      if (
        typeof hash.algo !== "string" ||
        typeof hash.value !== "string" ||
        typeof entry.type !== "string" ||
        typeof entry.content_type !== "string" ||
        typeof entry.bytes !== "number" ||
        typeof entry.updated_at !== "string"
      ) {
        continue;
      }
      if (
        typeof writtenByRaw.tool !== "string" ||
        typeof writtenByRaw.tool_version !== "string" ||
        typeof writtenByRaw.lane !== "string"
      ) {
        continue;
      }

      files[path] = {
        type: entry.type,
        content_type: entry.content_type,
        bytes: entry.bytes,
        hash: {
          algo: "sha256",
          value: hash.value,
        },
        written_by: {
          tool: writtenByRaw.tool,
          tool_version: writtenByRaw.tool_version,
          lane: writtenByRaw.lane,
        },
        updated_at: entry.updated_at,
      };
    }
  }

  const normalized: WorkpieceManifest = {
    ...base,
    schema,
    workpiece_id: workpieceId,
    workspace_id: workspaceId,
    created_at: createdAt,
    updated_at: updatedAt,
    status,
    pointers,
    files,
  };

  if (isRecord(parsed.origin)) {
    const originRaw = parsed.origin;
    const createdByRaw = isRecord(originRaw.created_by) ? originRaw.created_by : null;
    const toolRaw = isRecord(originRaw.tool) ? originRaw.tool : null;
    normalized.origin = {
      created_by: {
        user_id: createdByRaw && typeof createdByRaw.user_id === "string" ? createdByRaw.user_id : null,
        display_name:
          createdByRaw && typeof createdByRaw.display_name === "string" ? createdByRaw.display_name : null,
      },
      tool: {
        name: toolRaw && typeof toolRaw.name === "string" ? toolRaw.name : DEFAULT_ORIGIN_TOOL.name,
        version: toolRaw && typeof toolRaw.version === "string" ? toolRaw.version : DEFAULT_ORIGIN_TOOL.version,
      },
    };
  }

  return normalized;
}

async function finalizeManifestTwoPass(
  manifest: WorkpieceManifest,
  manifestWrittenBy: WrittenBy,
  nowIso: string,
): Promise<{
  manifestDocument: WorkpieceManifest;
  manifestBytes: Uint8Array;
  pass1Hash: string;
  pass1Bytes: number;
  finalHash: string;
  finalBytes: number;
}> {
  const pass1Manifest: WorkpieceManifest = {
    ...manifest,
    updated_at: nowIso,
    files: { ...manifest.files },
  };
  delete pass1Manifest.files[MANIFEST_PATH];

  const pass1Bytes = canonicalJsonBytes(pass1Manifest);
  const pass1Hash = await sha256Hex(pass1Bytes);

  const pass2Manifest: WorkpieceManifest = {
    ...pass1Manifest,
    files: {
      ...pass1Manifest.files,
      [MANIFEST_PATH]: buildManifestFileEntry(
        "manifest",
        "application/json",
        pass1Bytes.length,
        pass1Hash,
        manifestWrittenBy,
        nowIso,
      ),
    },
  };

  const pass2Bytes = canonicalJsonBytes(pass2Manifest);
  const pass2Hash = await sha256Hex(pass2Bytes);

  return {
    manifestDocument: pass2Manifest,
    manifestBytes: pass2Bytes,
    pass1Hash,
    pass1Bytes: pass1Bytes.length,
    finalHash: pass2Hash,
    finalBytes: pass2Bytes.length,
  };
}

async function uploadStorageObject(
  supabase: SupabaseClient<Database>,
  bucket: string,
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const { error } = await supabase.storage.from(bucket).upload(key, uint8ToArrayBuffer(bytes), {
    upsert: true,
    contentType,
  });

  if (error) {
    logStorageError("upload", bucket, key, error);
    throw new HttpError(502, "storage_write_failed", "Unable to write file to Storage", {
      key,
      reason: error.message,
    });
  }
}

function shouldDebugStorage(): boolean {
  if (typeof globalThis === "undefined") return false;
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.TONGS_DEBUG_STORAGE === "1";
}

function safeSerializeError(error: unknown): unknown {
  if (!error || typeof error !== "object") return error;
  try {
    return JSON.parse(JSON.stringify(error));
  } catch {
    return { message: String(error) };
  }
}

function extractErrorDetails(error: unknown): Record<string, unknown> | null {
  if (!error || typeof error !== "object") return null;
  const details: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(error)) {
    details[key] = (error as Record<string, unknown>)[key];
  }
  const proto = Object.getPrototypeOf(error);
  if (proto?.constructor?.name && proto.constructor.name !== "Object") {
    details.__type = proto.constructor.name;
  }
  return details;
}

async function extractResponseDetails(error: unknown): Promise<Record<string, unknown> | null> {
  const response = (error as { originalError?: unknown } | null | undefined)?.originalError;
  if (!response || typeof response !== "object") return null;
  const maybeResponse = response as Response;
  if (typeof maybeResponse.text !== "function") return null;

  try {
    const bodyText = await maybeResponse.clone().text();
    let bodyJson: unknown = null;
    try {
      bodyJson = JSON.parse(bodyText);
    } catch {
      bodyJson = null;
    }
    return {
      status: maybeResponse.status,
      statusText: maybeResponse.statusText,
      bodyText,
      bodyJson,
      url: maybeResponse.url,
    };
  } catch {
    return {
      status: maybeResponse.status,
      statusText: maybeResponse.statusText,
      url: maybeResponse.url,
    };
  }
}

function logStorageError(action: "download" | "upload", bucket: string, key: string, error: unknown): void {
  if (!shouldDebugStorage()) return;
  const serialized = safeSerializeError(error);
  const extracted = extractErrorDetails(error);
  const message = error instanceof Error ? error.message : undefined;
  console.log(`[tongs][storage:${action}] error keys`, Object.getOwnPropertyNames(error ?? {}));
  console.log(
    `[tongs][storage:${action}] original keys`,
    Object.getOwnPropertyNames((error as { originalError?: unknown } | null | undefined)?.originalError ?? {}),
  );
  console.dir(error, { depth: null });
  const original = (error as { originalError?: unknown } | null | undefined)?.originalError;
  if (original) {
    console.dir(original, { depth: null });
  }
  console.error(`[tongs][storage:${action}]`, {
    bucket,
    key,
    message,
    error: serialized,
    extracted,
  });
  console.error(`[tongs][storage:${action}] raw`, error);
}

function isBootstrapWorkpiecePath(path: string): boolean {
  return BOOTSTRAP_WORKPIECE_PATHS.has(path);
}

function isBootstrapWorkspacePath(path: string): boolean {
  return BOOTSTRAP_WORKSPACE_PATHS.has(path);
}

async function downloadStorageObject(
  supabase: SupabaseClient<Database>,
  bucket: string,
  key: string,
): Promise<Uint8Array | null> {
  const { data, error } = await supabase.storage.from(bucket).download(key);
  if (error) {
    const message = String(error.message || "").toLowerCase();
    const statusCode = (error as { statusCode?: unknown; status?: unknown }).statusCode
      ?? (error as { status?: unknown }).status
      ?? null;
    const code = String(statusCode ?? "");
    if (message.includes("not found") || code === "404") return null;

    const responseDetails = await extractResponseDetails(error);
    if (responseDetails) {
      const status = Number(responseDetails.status ?? NaN);
      const bodyJson = responseDetails.bodyJson as { statusCode?: unknown; error?: unknown; message?: unknown } | null;
      const bodyText = String(responseDetails.bodyText ?? "");
      const statusCodeText = bodyJson?.statusCode ?? "";
      const statusCodeNum = typeof statusCodeText === "string" ? Number(statusCodeText) : Number(statusCodeText ?? NaN);
      const isNotFound = status === 404
        || (status === 400 && (
          statusCodeNum === 404
          || bodyJson?.error === "not_found"
          || /object not found/i.test(String(bodyJson?.message ?? bodyText))
        ));

      if (isNotFound) return null;
    }

    logStorageError("download", bucket, key, error);
    if (responseDetails && shouldDebugStorage()) {
      console.error("[tongs][storage:download] response", responseDetails);
    }
    throw new HttpError(502, "storage_read_failed", "Unable to read file from Storage", {
      key,
      reason: error.message,
      status: statusCode,
      response: responseDetails ?? undefined,
    });
  }

  if (!data) return null;
  const ab = await data.arrayBuffer();
  return new Uint8Array(ab);
}

function canonicalizeJsonlLine(input: unknown): Uint8Array {
  const value = typeof input === "string" ? parseJsonText(input, "jsonl_append") : input;
  const lineBody = canonicalJsonBytes(value);
  const newline = textEncoder.encode("\n");
  return concatBytes([lineBody, newline]);
}

function canonicalizeReplaceBytes(path: string, contentType: string, body: CommitFileRequest): Uint8Array {
  const content = typeof body.content === "undefined" ? undefined : body.content;
  const jsonValue = typeof body.json === "undefined" ? undefined : body.json;
  const textValue = typeof body.text === "undefined" ? undefined : body.text;
  const base64Value =
    typeof body.bytes_base64 === "string"
      ? body.bytes_base64
      : typeof body.content_base64 === "string"
        ? body.content_base64
        : undefined;

  if (isJsonFile(path, contentType)) {
    if (typeof jsonValue !== "undefined") return canonicalJsonBytes(jsonValue);
    if (typeof content !== "undefined" && typeof content !== "string") return canonicalJsonBytes(content);

    let jsonText = "";
    if (typeof textValue === "string") jsonText = textValue;
    else if (typeof content === "string") jsonText = content;
    else if (typeof base64Value === "string") jsonText = textDecoder.decode(decodeBase64(base64Value));

    if (!jsonText) {
      throw new HttpError(
        400,
        "missing_content",
        "JSON commit requires json, content, text, bytes_base64, or content_base64",
      );
    }

    const parsed = parseJsonText(stripBom(jsonText), "JSON content");
    return canonicalJsonBytes(parsed);
  }

  if (typeof textValue === "string" || typeof content === "string") {
    let text = typeof textValue === "string" ? textValue : (content as string);
    if (isLfTextFile(path)) {
      text = normalizeLf(stripBom(text));
    }
    return textEncoder.encode(text);
  }

  if (typeof jsonValue !== "undefined") {
    return canonicalJsonBytes(jsonValue);
  }
  if (typeof content !== "undefined") {
    if (typeof content === "string") {
      let text = content;
      if (isLfTextFile(path)) {
        text = normalizeLf(stripBom(text));
      }
      return textEncoder.encode(text);
    }
    return canonicalJsonBytes(content);
  }

  if (typeof base64Value === "string") {
    const bytes = decodeBase64(base64Value);
    if (isLfTextFile(path)) {
      const text = normalizeLf(stripBom(textDecoder.decode(bytes)));
      return textEncoder.encode(text);
    }
    return bytes;
  }

  throw new HttpError(400, "missing_content", "Commit payload must include text/json/content/bytes_base64");
}

function normalizeCommitFileRequest(body: Record<string, unknown>): CommitFileRequest {
  return {
    path: normalizeRelativePath(body.path),
    content_type: typeof body.content_type === "string" ? body.content_type : undefined,
    file_type: typeof body.file_type === "string" ? body.file_type : undefined,
    written_by: normalizeWrittenBy(body.written_by),
    pointer: normalizePointerKey(body.pointer),
    event_name: typeof body.event_name === "string" ? body.event_name : undefined,
    event_payload: typeof body.event_payload === "undefined" ? undefined : (asJson(body.event_payload) as Json),
    correlation_id: typeof body.correlation_id === "string" ? body.correlation_id : undefined,
    text: typeof body.text === "string" ? body.text : undefined,
    json: typeof body.json === "undefined" ? undefined : body.json,
    content: typeof body.content === "undefined" ? undefined : body.content,
    bytes_base64: typeof body.bytes_base64 === "string" ? body.bytes_base64 : undefined,
    content_base64: typeof body.content_base64 === "string" ? body.content_base64 : undefined,
    jsonl_append: typeof body.jsonl_append === "undefined" ? undefined : body.jsonl_append,
  };
}

function normalizeCreateCradleRequest(body: Record<string, unknown>): CreateCradleRequest {
  let createdBy: CreateCradleRequest["created_by"];
  if (isRecord(body.created_by)) {
    createdBy = {
      user_id: typeof body.created_by.user_id === "string" ? body.created_by.user_id : null,
      display_name: typeof body.created_by.display_name === "string" ? body.created_by.display_name : null,
    };
  }

  let originTool: CreateCradleRequest["origin_tool"];
  if (isRecord(body.origin_tool)) {
    originTool = {
      name: normalizeNonEmptyString(body.origin_tool.name, "origin_tool.name"),
      version: normalizeNonEmptyString(body.origin_tool.version, "origin_tool.version"),
    };
  }

  return {
    workspace_id: normalizeUuid(body.workspace_id, "workspace_id"),
    cradle_id: typeof body.cradle_id === "string" ? normalizeUuid(body.cradle_id, "cradle_id") : undefined,
    status: typeof body.status === "string" ? body.status : undefined,
    metadata: typeof body.metadata === "undefined" ? undefined : (asJson(body.metadata) as Json),
    created_by: createdBy,
    origin_tool: originTool,
    written_by: typeof body.written_by === "undefined" ? undefined : normalizeWrittenBy(body.written_by),
    correlation_id: typeof body.correlation_id === "string" ? body.correlation_id : undefined,
  };
}

function normalizeAppendEventRequest(body: Record<string, unknown>): AppendEventRequest {
  return {
    event_name: normalizeNonEmptyString(body.event_name, "event_name"),
    payload: typeof body.payload === "undefined" ? undefined : (asJson(body.payload) as Json),
    correlation_id: typeof body.correlation_id === "string" ? body.correlation_id : undefined,
    written_by: normalizeWrittenBy(body.written_by),
  };
}

function resolveEpisodeLabel(metadata: Json | undefined): string {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const row = metadata as Record<string, unknown>;
    if (typeof row.label === "string" && row.label.trim()) return row.label.trim();
    if (typeof row.title === "string" && row.title.trim()) return row.title.trim();
  }
  return "Untitled Episode";
}

export class TongsCommitService {
  readonly supabase: SupabaseClient<Database>;
  readonly bucket: string;

  constructor(supabase: SupabaseClient<Database>, bucket = TONGS_WORKPIECE_BUCKET) {
    this.supabase = supabase;
    this.bucket = bucket;
  }

  private async getCradleOrThrow(workpieceId: string): Promise<EpisodeRow> {
    const { data, error } = await this.supabase
      .schema("tongs")
      .from("episodes")
      .select("*")
      .eq("id", workpieceId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new HttpError(404, "workpiece_not_found", `Workpiece ${workpieceId} was not found`);
      }
      throw new HttpError(502, "db_read_failed", "Failed to read episode", {
        reason: error.message,
      });
    }

    if (!data) {
      throw new HttpError(404, "workpiece_not_found", `Workpiece ${workpieceId} was not found`);
    }
    return data;
  }

  private async getWorkspaceOrThrow(workspaceId: string): Promise<WorkspaceRow> {
    const { data, error } = await this.supabase
      .schema("tongs")
      .from("workspaces")
      .select("*")
      .eq("id", workspaceId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new HttpError(404, "workspace_not_found", `Workspace ${workspaceId} was not found`);
      }
      throw new HttpError(502, "db_read_failed", "Failed to read workspace", {
        reason: error.message,
      });
    }

    if (!data) {
      throw new HttpError(404, "workspace_not_found", `Workspace ${workspaceId} was not found`);
    }
    return data;
  }

  private async upsertWorkpieceFile(rows: Database["tongs"]["Tables"]["workpiece_files"]["Insert"][]): Promise<void> {
    const { error } = await this.supabase
      .schema("tongs")
      .from("workpiece_files")
      .upsert(rows, { onConflict: "workpiece_id,path" });

    if (error) {
      throw new HttpError(502, "db_write_failed", "Failed to upsert workpiece_files", {
        reason: error.message,
      });
    }
  }

  private async insertEvent(input: {
    workpieceId: string;
    eventName: string;
    payload: Json;
    writtenBy: WrittenBy;
    correlationId: string | null;
  }): Promise<WorkpieceEventRow> {
    const { data, error } = await this.supabase
      .schema("tongs")
      .from("workpiece_events")
      .insert({
        workpiece_id: input.workpieceId,
        event_name: input.eventName,
        payload: input.payload,
        correlation_id: input.correlationId,
        written_by_tool: input.writtenBy.tool,
        written_by_tool_version: input.writtenBy.tool_version,
        written_by_lane: input.writtenBy.lane,
      })
      .select("*")
      .single();

    if (error) {
      throw new HttpError(502, "db_write_failed", "Failed to append workpiece event", {
        reason: error.message,
      });
    }
    if (!data) {
      throw new HttpError(502, "db_write_failed", "workpiece_events insert returned no row");
    }

    return data;
  }

  private async loadManifestOrDefault(cradle: EpisodeRow): Promise<WorkpieceManifest> {
    const status = "draft";
    const createdAt = cradle.created_at ?? new Date().toISOString();
    const key = buildStorageKey(cradle.id, MANIFEST_PATH);
    const bytes = await downloadStorageObject(this.supabase, this.bucket, key);
    const fallback = {
      workpieceId: cradle.id,
      workspaceId: cradle.workspace_id,
      status,
      createdAt,
    };

    if (!bytes) {
      return defaultManifest(cradle.id, cradle.workspace_id, status, createdAt);
    }

    const parsed = parseJsonText(textDecoder.decode(bytes), MANIFEST_PATH);
    return normalizeLoadedManifest(parsed, fallback);
  }

  async createCradle(input: CreateCradleRequest): Promise<CreateCradleResponse> {
    const nowIso = new Date().toISOString();
    const writtenBy = input.written_by ?? DEFAULT_WRITTEN_BY;
    const status = input.status?.trim() || "draft";

    const { data: episode, error: episodeError } = await this.supabase
      .schema("tongs")
      .from("episodes")
      .insert({
        ...(input.cradle_id ? { id: input.cradle_id } : {}),
        workspace_id: input.workspace_id,
        label: resolveEpisodeLabel(input.metadata),
      })
      .select("*")
      .single();

    if (episodeError) {
      throw new HttpError(502, "db_write_failed", "Failed to create episode", {
        reason: episodeError.message,
      });
    }
    if (!episode) {
      throw new HttpError(502, "db_write_failed", "episodes insert returned no row");
    }

    const cradle = episode;

    const metadataDocument = {
      schema: "forge.metadata.v1",
      workpiece_id: cradle.id,
      workspace_id: cradle.workspace_id,
      created_at: nowIso,
      updated_at: nowIso,
      status,
      notes: null,
    };

    const assetsRegistryDocument = {
      schema: "forge.assets.v1",
      workpiece_id: cradle.id,
      updated_at: nowIso,
      assets: [] as JsonValue[],
    };

    const metadataBytes = canonicalJsonBytes(metadataDocument);
    const metadataHash = await sha256Hex(metadataBytes);
    const assetsBytes = canonicalJsonBytes(assetsRegistryDocument);
    const assetsHash = await sha256Hex(assetsBytes);

    const manifest = defaultManifest(cradle.id, cradle.workspace_id, status, nowIso);
    manifest.origin = {
      created_by: {
        user_id: input.created_by?.user_id ?? null,
        display_name: input.created_by?.display_name ?? null,
      },
      tool: {
        name: input.origin_tool?.name ?? DEFAULT_ORIGIN_TOOL.name,
        version: input.origin_tool?.version ?? DEFAULT_ORIGIN_TOOL.version,
      },
    };
    manifest.files["metadata.json"] = buildManifestFileEntry(
      "metadata",
      "application/json",
      metadataBytes.length,
      metadataHash,
      writtenBy,
      nowIso,
    );
    manifest.files["assets/assets.json"] = buildManifestFileEntry(
      "assets_registry",
      "application/json",
      assetsBytes.length,
      assetsHash,
      writtenBy,
      nowIso,
    );

    const finalized = await finalizeManifestTwoPass(manifest, writtenBy, nowIso);

    await uploadStorageObject(
      this.supabase,
      this.bucket,
      buildStorageKey(cradle.id, "metadata.json"),
      metadataBytes,
      "application/json",
    );
    await uploadStorageObject(
      this.supabase,
      this.bucket,
      buildStorageKey(cradle.id, "assets/assets.json"),
      assetsBytes,
      "application/json",
    );
    await uploadStorageObject(
      this.supabase,
      this.bucket,
      buildStorageKey(cradle.id, MANIFEST_PATH),
      finalized.manifestBytes,
      "application/json",
    );

    await this.upsertWorkpieceFile([
      {
        workpiece_id: cradle.id,
        path: "metadata.json",
        file_type: "metadata",
        content_type: "application/json",
        bytes: metadataBytes.length,
        hash_algo: SHA256_ALGO,
        hash_value: metadataHash,
        storage_bucket: this.bucket,
        storage_key: buildStorageKey(cradle.id, "metadata.json"),
        written_by_tool: writtenBy.tool,
        written_by_tool_version: writtenBy.tool_version,
        written_by_lane: writtenBy.lane,
      },
      {
        workpiece_id: cradle.id,
        path: "assets/assets.json",
        file_type: "assets_registry",
        content_type: "application/json",
        bytes: assetsBytes.length,
        hash_algo: SHA256_ALGO,
        hash_value: assetsHash,
        storage_bucket: this.bucket,
        storage_key: buildStorageKey(cradle.id, "assets/assets.json"),
        written_by_tool: writtenBy.tool,
        written_by_tool_version: writtenBy.tool_version,
        written_by_lane: writtenBy.lane,
      },
      {
        workpiece_id: cradle.id,
        path: MANIFEST_PATH,
        file_type: "manifest",
        content_type: "application/json",
        bytes: finalized.finalBytes,
        hash_algo: SHA256_ALGO,
        hash_value: finalized.finalHash,
        storage_bucket: this.bucket,
        storage_key: buildStorageKey(cradle.id, MANIFEST_PATH),
        written_by_tool: writtenBy.tool,
        written_by_tool_version: writtenBy.tool_version,
        written_by_lane: writtenBy.lane,
      },
    ]);

    const createdEvent = await this.insertEvent({
      workpieceId: cradle.id,
      eventName: "workpiece.created",
      payload: {
        workspace_id: cradle.workspace_id,
        status,
        baseline_files: ["metadata.json", "assets/assets.json", MANIFEST_PATH],
      } as Json,
      writtenBy,
      correlationId: normalizeCorrelationId(input.correlation_id),
    });

    return {
      cradle,
      manifest_hash: finalized.finalHash,
      manifest_bytes: finalized.finalBytes,
      files_indexed: 3,
      event: createdEvent,
    };
  }

  async commitFile(workpieceId: string, input: CommitFileRequest): Promise<CommitFileResponse> {
    const cradle = await this.getCradleOrThrow(workpieceId);
    const path = normalizeRelativePath(input.path);
    if (path === MANIFEST_PATH) {
      throw new HttpError(400, "invalid_path", "manifest.json is managed by Tongs and cannot be committed directly");
    }

    const nowIso = new Date().toISOString();
    const contentType = normalizeContentType(input.content_type, path);
    const fileType = (typeof input.file_type === "string" && input.file_type.trim()) || inferFileType(path, contentType);
    const writtenBy = normalizeWrittenBy(input.written_by);
    const storageKey = buildStorageKey(workpieceId, path);

    let bytes: Uint8Array;
    let commitMode: "replace" | "append_jsonl" = "replace";

    if (typeof input.jsonl_append !== "undefined" && isJsonlFile(path, contentType)) {
      commitMode = "append_jsonl";
      const existing = await downloadStorageObject(this.supabase, this.bucket, storageKey);
      const lineBytes = canonicalizeJsonlLine(input.jsonl_append);
      if (!existing || existing.length === 0) {
        bytes = lineBytes;
      } else if (existing[existing.length - 1] === 0x0a) {
        bytes = concatBytes([existing, lineBytes]);
      } else {
        bytes = concatBytes([existing, textEncoder.encode("\n"), lineBytes]);
      }
    } else {
      bytes = canonicalizeReplaceBytes(path, contentType, input);
    }

    const hash = await sha256Hex(bytes);
    await uploadStorageObject(this.supabase, this.bucket, storageKey, bytes, contentType);

    await this.upsertWorkpieceFile([
      {
        workpiece_id: cradle.id,
        path,
        file_type: fileType,
        content_type: contentType,
        bytes: bytes.length,
        hash_algo: SHA256_ALGO,
        hash_value: hash,
        storage_bucket: this.bucket,
        storage_key: storageKey,
        written_by_tool: writtenBy.tool,
        written_by_tool_version: writtenBy.tool_version,
        written_by_lane: writtenBy.lane,
      },
    ]);

    const manifest = await this.loadManifestOrDefault(cradle);
    manifest.updated_at = nowIso;
    if (!manifest.status) {
      manifest.status = "draft";
    }
    manifest.files[path] = buildManifestFileEntry(fileType, contentType, bytes.length, hash, writtenBy, nowIso);
    applyPointerUpdates(manifest, path, input.pointer);

    const finalized = await finalizeManifestTwoPass(manifest, writtenBy, nowIso);

    await uploadStorageObject(
      this.supabase,
      this.bucket,
      buildStorageKey(workpieceId, MANIFEST_PATH),
      finalized.manifestBytes,
      "application/json",
    );

    await this.upsertWorkpieceFile([
      {
        workpiece_id: cradle.id,
        path: MANIFEST_PATH,
        file_type: "manifest",
        content_type: "application/json",
        bytes: finalized.finalBytes,
        hash_algo: SHA256_ALGO,
        hash_value: finalized.finalHash,
        storage_bucket: this.bucket,
        storage_key: buildStorageKey(workpieceId, MANIFEST_PATH),
        written_by_tool: writtenBy.tool,
        written_by_tool_version: writtenBy.tool_version,
        written_by_lane: writtenBy.lane,
      },
    ]);

    const eventName = input.event_name?.trim() || "workpiece.file.committed";
    const eventPayload =
      typeof input.event_payload === "undefined"
        ? ({
            path,
            content_type: contentType,
            bytes: bytes.length,
            hash,
            mode: commitMode,
          } as Json)
        : input.event_payload;

    const event = await this.insertEvent({
      workpieceId,
      eventName,
      payload: eventPayload,
      writtenBy,
      correlationId: normalizeCorrelationId(input.correlation_id),
    });

    const { data: fileRow, error: fileRowError } = await this.supabase
      .schema("tongs")
      .from("workpiece_files")
      .select("*")
      .eq("workpiece_id", cradle.id)
      .eq("path", path)
      .single();

    if (fileRowError || !fileRow) {
      throw new HttpError(502, "db_read_failed", "Failed to read committed workpiece_files row", {
        reason: fileRowError?.message,
      });
    }

    const { data: manifestRow, error: manifestRowError } = await this.supabase
      .schema("tongs")
      .from("workpiece_files")
      .select("*")
      .eq("workpiece_id", cradle.id)
      .eq("path", MANIFEST_PATH)
      .single();

    if (manifestRowError || !manifestRow) {
      throw new HttpError(502, "db_read_failed", "Failed to read manifest workpiece_files row", {
        reason: manifestRowError?.message,
      });
    }

    return {
      workpiece_id: cradle.id,
      path,
      storage_key: storageKey,
      hash,
      bytes: bytes.length,
      content_type: contentType,
      manifest_hash: finalized.finalHash,
      manifest_bytes: finalized.finalBytes,
      file_row: fileRow,
      manifest_row: manifestRow,
      event,
    };
  }

  async commitWorkspaceFile(workspaceId: string, input: CommitFileRequest): Promise<CommitWorkspaceFileResponse> {
    await this.getWorkspaceOrThrow(workspaceId);
    const path = normalizeRelativePath(input.path);
    if (extensionOf(path) !== ".json") {
      throw new HttpError(400, "invalid_path", "Workspace commit-file currently supports JSON paths only");
    }

    const contentType = normalizeContentType(input.content_type, path);
    normalizeWrittenBy(input.written_by);
    if (typeof input.jsonl_append !== "undefined") {
      throw new HttpError(400, "invalid_payload", "workspace commit-file does not support jsonl_append");
    }

    const storageKey = buildWorkspaceStorageKey(workspaceId, path);
    const bytes = canonicalizeReplaceBytes(path, contentType, input);
    const hash = await sha256Hex(bytes);

    await uploadStorageObject(this.supabase, this.bucket, storageKey, bytes, contentType);

    return {
      workspace_id: workspaceId,
      path,
      storage_key: storageKey,
      hash,
      bytes: bytes.length,
      content_type: contentType,
    };
  }

  async readWorkpieceJson(workpieceId: string, path: string): Promise<ReadJsonFileResult> {
    await this.getCradleOrThrow(workpieceId);
    const storageKey = buildStorageKey(workpieceId, path);
    const bytes = await downloadStorageObject(this.supabase, this.bucket, storageKey);
    if (!bytes) return { found: false };
    const parsed = parseJsonText(textDecoder.decode(bytes), path);
    return { found: true, data: parsed };
  }

  async readWorkspaceJson(workspaceId: string, path: string): Promise<ReadJsonFileResult> {
    const storageKey = buildWorkspaceStorageKey(workspaceId, path);
    const bytes = await downloadStorageObject(this.supabase, this.bucket, storageKey);
    if (!bytes) return { found: false };
    const parsed = parseJsonText(textDecoder.decode(bytes), path);
    return { found: true, data: parsed };
  }

  async appendEvent(workpieceId: string, input: AppendEventRequest): Promise<WorkpieceEventRow> {
    await this.getCradleOrThrow(workpieceId);
    return this.insertEvent({
      workpieceId,
      eventName: normalizeNonEmptyString(input.event_name, "event_name"),
      payload: typeof input.payload === "undefined" ? ({} as Json) : input.payload,
      writtenBy: normalizeWrittenBy(input.written_by),
      correlationId: normalizeCorrelationId(input.correlation_id),
    });
  }
}

function requireMethod(request: Request, method: string): void {
  if (request.method !== method) {
    throw new HttpError(405, "method_not_allowed", `Expected ${method} for this endpoint`);
  }
}

function checkApiToken(request: Request, token: string | undefined): void {
  if (!token) return;
  const auth = request.headers.get("authorization") || "";
  const expected = `Bearer ${token}`;
  if (auth !== expected) {
    throw new HttpError(401, "unauthorized", "Missing or invalid API token");
  }
}

export function createTongsCommitService(options: TongsCommitApiOptions): TongsCommitService {
  const url = normalizeNonEmptyString(options.supabaseUrl, "supabaseUrl");
  const key = normalizeNonEmptyString(options.supabaseServiceRoleKey, "supabaseServiceRoleKey");
  const bucket = options.bucket?.trim() || TONGS_WORKPIECE_BUCKET;

  const supabase = createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return new TongsCommitService(supabase, bucket);
}

export function createTongsCommitApiHandlerWithService(
  service: TongsCommitApiService,
  apiToken?: string,
): (request: Request) => Promise<Response> {
  const normalizedApiToken = apiToken?.trim() || undefined;
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }

    try {
      checkApiToken(request, normalizedApiToken);

      const url = new URL(request.url);
      const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);

      if (parts.length === 2 && parts[0] === "tongs" && parts[1] === "cradles") {
        requireMethod(request, "POST");
        const body = await parseJsonBody(request);
        const payload = normalizeCreateCradleRequest(body);
        const result = await service.createCradle(payload);
        return jsonResponse(201, { ok: true, data: result });
      }

      if (parts.length === 4 && parts[0] === "tongs" && parts[1] === "workpieces" && parts[3] === "commit-file") {
        requireMethod(request, "POST");
        const workpieceId = normalizeUuid(decodeURIComponent(parts[2]), "workpiece_id");
        const body = await parseJsonBody(request);
        const payload = normalizeCommitFileRequest(body);
        const result = await service.commitFile(workpieceId, payload);
        return jsonResponse(200, { ok: true, data: result });
      }

      if (parts.length === 4 && parts[0] === "tongs" && parts[1] === "workspaces" && parts[3] === "commit-file") {
        requireMethod(request, "POST");
        const workspaceId = normalizeUuid(decodeURIComponent(parts[2]), "workspace_id");
        const body = await parseJsonBody(request);
        const payload = normalizeCommitFileRequest(body);
        const result = await service.commitWorkspaceFile(workspaceId, payload);
        return jsonResponse(200, { ok: true, data: result });
      }

      if (parts.length === 4 && parts[0] === "tongs" && parts[1] === "workpieces" && parts[3] === "read-file") {
        requireMethod(request, "GET");
        const workpieceId = normalizeUuid(decodeURIComponent(parts[2]), "workpiece_id");
        const url = new URL(request.url);
        const path = normalizeRelativePath(url.searchParams.get("path"));
        if (extensionOf(path) !== ".json") {
          throw new HttpError(400, "invalid_path", "read-file currently supports JSON paths only");
        }
        const result = await service.readWorkpieceJson(workpieceId, path);
        if (!result.found) {
          if (isBootstrapWorkpiecePath(path)) {
            return jsonResponse(200, { ok: true, data: null, exists: false });
          }
          return jsonResponse(404, {
            ok: true,
            exists: false,
          });
        }
        return jsonResponse(200, { ok: true, data: result.data });
      }

      if (parts.length === 4 && parts[0] === "tongs" && parts[1] === "workspaces" && parts[3] === "read-file") {
        requireMethod(request, "GET");
        const workspaceId = normalizeUuid(decodeURIComponent(parts[2]), "workspace_id");
        const url = new URL(request.url);
        const path = normalizeRelativePath(url.searchParams.get("path"));
        if (extensionOf(path) !== ".json") {
          throw new HttpError(400, "invalid_path", "read-file currently supports JSON paths only");
        }
        const result = await service.readWorkspaceJson(workspaceId, path);
        if (!result.found) {
          if (isBootstrapWorkspacePath(path)) {
            return jsonResponse(200, { ok: true, data: null, exists: false });
          }
          return jsonResponse(404, {
            ok: true,
            exists: false,
          });
        }
        return jsonResponse(200, { ok: true, data: result.data });
      }

      if (parts.length === 4 && parts[0] === "tongs" && parts[1] === "workpieces" && parts[3] === "append-event") {
        requireMethod(request, "POST");
        const workpieceId = normalizeUuid(decodeURIComponent(parts[2]), "workpiece_id");
        const body = await parseJsonBody(request);
        const payload = normalizeAppendEventRequest(body);
        const result = await service.appendEvent(workpieceId, payload);
        return jsonResponse(201, { ok: true, data: result });
      }

      throw new HttpError(404, "not_found", "Endpoint not found");
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function createTongsCommitApiHandler(options: TongsCommitApiOptions): (request: Request) => Promise<Response> {
  const service = createTongsCommitService(options);
  return createTongsCommitApiHandlerWithService(service, options.apiToken);
}
