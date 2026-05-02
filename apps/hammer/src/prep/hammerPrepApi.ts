import type { MediaKind } from "../../../../packages/contracts/hammer/media-resolver.contract";

export const HAMMER_TRANSCRIPT_PREP_ROUTE = "/api/hammer/prep/transcript";

function resolveTranscriptPrepDebugEnabled(): boolean {
  const runtimeGlobal = globalThis as typeof globalThis & {
    window?: Record<string, unknown>;
  };
  const runtimeWindow = runtimeGlobal.window ?? null;
  if (!runtimeWindow) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Boolean((import.meta as any)?.env?.DEV)) return true;
  } catch {
    // ignore
  }
  try {
    return runtimeWindow.__forgeHammerDebugTranscriptPrep__ === true;
  } catch {
    return false;
  }
}

export interface HammerTranscriptPrepRequest {
  workspace_id: string;
  workpiece_id: string;
  media_kind: MediaKind;
  local_root_abs?: string | null;
  local_relpath?: string | null;
  canonical_workpiece_path?: string | null;
  mime_type?: string | null;
  client_request_id?: string | null;
}

export interface HammerTranscriptPrepSegment {
  id?: string | null;
  start: number;
  end: number;
  text: string;
  speaker: string | null;
  confidence?: number | null;
}

export interface HammerTranscriptPrepResponse {
  provider: "openai";
  model: string;
  provider_request_id: string | null;
  text: string | null;
  segments: HammerTranscriptPrepSegment[];
}

export type HammerTranscriptPrepErrorCode =
  | "AUTH_REQUIRED"
  | "POLICY_DENIED"
  | "SERVER_NOT_CONFIGURED"
  | "SOURCE_TOO_LARGE"
  | "MEDIA_READ_TIMEOUT"
  | "MEDIA_READ_FAILED"
  | "MEDIA_READ_FORBIDDEN"
  | "OPENAI_TIMEOUT"
  | "OPENAI_UPSTREAM_ERROR"
  | "NORMALIZE_EMPTY"
  | "INVALID_REQUEST"
  | "UNKNOWN_ERROR";

export type HammerTranscriptPrepError = {
  code: HammerTranscriptPrepErrorCode;
  message: string;
  retryable: boolean;
  detail?: unknown;
};

export type HammerTranscriptPrepMeta = {
  timestamp: string;
  workspace_id: string | null;
  workpiece_id: string | null;
  client_request_id: string;
  provider_request_id?: string | null;
};

export type HammerTranscriptPrepResult =
  | { ok: true; status: number; data: HammerTranscriptPrepResponse; meta?: HammerTranscriptPrepMeta }
  | { ok: false; status: number; error: HammerTranscriptPrepError; meta?: HammerTranscriptPrepMeta };

const DEFAULT_TRANSCRIPT_PREP_TIMEOUT_MS = 15 * 60 * 1000;

function resolveTranscriptPrepTimeoutMs(): number {
  const runtimeGlobal = globalThis as typeof globalThis & {
    window?: Record<string, unknown>;
  };
  const runtimeWindow = runtimeGlobal.window ?? null;
  if (runtimeWindow) {
    try {
      const override = runtimeWindow.__forgeHammerTranscriptPrepTimeoutMs__;
      if (typeof override === "number" && Number.isFinite(override) && override >= 30_000) {
        return Math.trunc(override);
      }
    } catch {
      // ignore
    }
  }
  return DEFAULT_TRANSCRIPT_PREP_TIMEOUT_MS;
}

const SUPABASE_AUTH_STORAGE_KEY = "forge-auth";
const SUPABASE_AUTH_KEY_RE = /^sb-[a-z0-9-]+-auth-token$/i;

type RuntimeStorage = {
  getItem: (key: string) => string | null;
  key?: (index: number) => string | null;
  length?: number;
};

type ForgeRuntimeWindow = {
  location?: { search?: string };
  localStorage?: RuntimeStorage;
  __forgeTongsApiToken?: unknown;
  __tpTongsApiToken?: unknown;
};

type RuntimeTimers = {
  setTimeout?: (handler: () => void, timeout?: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
};

function getRuntimeWindow(): ForgeRuntimeWindow | null {
  const runtime = globalThis as typeof globalThis & { window?: unknown };
  const candidate = runtime.window;
  return candidate && typeof candidate === "object"
    ? candidate as ForgeRuntimeWindow
    : null;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readLocalStorage(key: string): string | null {
  const runtimeWindow = getRuntimeWindow();
  const storage = runtimeWindow?.localStorage;
  if (!storage) return null;
  try {
    return readString(storage.getItem(key));
  } catch {
    return null;
  }
}

function decodeBase64Url(input: string): string | null {
  if (!input) return null;
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const decode = (globalThis as typeof globalThis & { atob?: (value: string) => string }).atob;
  if (typeof decode !== "function") return null;
  try {
    return decode(padded);
  } catch {
    return null;
  }
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const json = decodeBase64Url(parts[1]);
  if (!json) return null;
  try {
    return readObject(JSON.parse(json));
  } catch {
    return null;
  }
}

function readJwtExpiryMs(token: string): number | null {
  const payload = parseJwtPayload(token);
  if (!payload) return null;
  const exp = payload.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
  return Math.trunc(exp * 1000);
}

function sanitizeAccessToken(token: string | null): string | null {
  if (!token) return null;
  const expiryMs = readJwtExpiryMs(token);
  if (expiryMs && expiryMs <= Date.now() + 5000) {
    return null;
  }
  return token;
}

function extractAccessTokenFromAuthPayload(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const token = extractAccessTokenFromAuthPayload(entry);
      if (token) return token;
    }
    return null;
  }

  const row = value as Record<string, unknown>;
  const direct = readString(row.access_token);
  if (direct) return sanitizeAccessToken(direct);

  const currentSession = readObject(row.currentSession);
  if (currentSession) {
    const token = readString(currentSession.access_token);
    if (token) return sanitizeAccessToken(token);
  }

  const session = readObject(row.session);
  if (session) {
    const token = readString(session.access_token);
    if (token) return sanitizeAccessToken(token);
  }

  const nestedData = readObject(row.data);
  if (nestedData) {
    const token = extractAccessTokenFromAuthPayload(nestedData);
    if (token) return sanitizeAccessToken(token);
  }

  return null;
}

function readAccessTokenFromStorageKey(key: string): string | null {
  const raw = readLocalStorage(key);
  if (!raw) return null;

  if (raw !== "null" && raw !== "undefined" && !raw.startsWith("{") && !raw.startsWith("[")) {
    return sanitizeAccessToken(raw);
  }

  try {
    return sanitizeAccessToken(extractAccessTokenFromAuthPayload(JSON.parse(raw)));
  } catch {
    return null;
  }
}

async function resolveForgeUserAccessToken(): Promise<string | null> {
  const primary = readAccessTokenFromStorageKey(SUPABASE_AUTH_STORAGE_KEY);
  if (primary) return primary;

  const runtimeWindow = getRuntimeWindow();
  const storage = runtimeWindow?.localStorage;
  const keyFn = storage?.key;
  const length = typeof storage?.length === "number" ? storage.length : 0;
  if (storage && typeof keyFn === "function") {
    try {
      for (let index = 0; index < length; index += 1) {
        const key = keyFn.call(storage, index);
        if (!key || key === SUPABASE_AUTH_STORAGE_KEY) continue;
        if (!SUPABASE_AUTH_KEY_RE.test(key)) continue;
        const token = readAccessTokenFromStorageKey(key);
        if (token) return token;
      }
    } catch {
      // ignore storage enumeration errors
    }
  }

  return null;
}

function resolveTongsApiToken(): string | null {
  const runtimeWindow = getRuntimeWindow();
  try {
    const params = new URLSearchParams(runtimeWindow?.location?.search ?? "");
    const fromQuery = readString(params.get("tongs_api_token") ?? params.get("tongsApiToken"));
    if (fromQuery) return fromQuery;
  } catch {
    // ignore
  }

  const fromWindow = readString(runtimeWindow?.__forgeTongsApiToken ?? runtimeWindow?.__tpTongsApiToken);
  if (fromWindow) return fromWindow;

  return readLocalStorage("forge_tongs_api_token_v1");
}

function normalizeSegment(value: unknown, index: number): HammerTranscriptPrepSegment | null {
  const row = readObject(value);
  if (!row) return null;

  const start = readNumber(row.start);
  const end = readNumber(row.end);
  const text = readString(row.text);
  if (start == null || end == null || end <= start || !text) {
    return null;
  }

  return {
    id: readString(row.id) ?? `seg_${index + 1}`,
    start,
    end,
    text,
    speaker: readString(row.speaker),
    confidence: readNumber(row.confidence),
  };
}

function readErrorMessage(payload: unknown): string {
  const row = readObject(payload);
  const error = readObject(row?.error);
  return readString(error?.message)
    ?? readString(row?.message)
    ?? readString(row?.detail)
    ?? "Hammer transcript prep failed.";
}

function normalizeResponse(payload: unknown): HammerTranscriptPrepResponse | null {
  const root = readObject(payload);
  const data = readObject(root?.data);
  const segmentsRaw = Array.isArray(data?.segments) ? data.segments : null;
  const model = readString(data?.model);
  if (!segmentsRaw || !model) {
    return null;
  }

  const segments = segmentsRaw
    .map((segment, index) => normalizeSegment(segment, index))
    .filter((segment): segment is HammerTranscriptPrepSegment => Boolean(segment));

  return {
    provider: "openai",
    model,
    provider_request_id: readString(data?.provider_request_id),
    text: readString(data?.text),
    segments,
  };
}

function normalizeErrorEnvelope(payload: unknown): { error: HammerTranscriptPrepError; meta?: HammerTranscriptPrepMeta } | null {
  const root = readObject(payload);
  if (!root || root.ok !== false) return null;
  const errorRow = readObject(root.error);
  const metaRow = readObject(root.meta);
  const code = readString(errorRow?.code) as HammerTranscriptPrepErrorCode | null;
  const message = readString(errorRow?.message);
  const retryable = readBoolean(errorRow?.retryable);
  if (!code || !message || retryable == null) return null;

  const timestamp = readString(metaRow?.timestamp);
  const clientRequestId = readString(metaRow?.client_request_id);
  const meta = timestamp && clientRequestId
    ? {
      timestamp,
      workspace_id: readString(metaRow?.workspace_id),
      workpiece_id: readString(metaRow?.workpiece_id),
      client_request_id: clientRequestId,
      provider_request_id: readString(metaRow?.provider_request_id),
    }
    : undefined;

  return {
    error: {
      code,
      message,
      retryable,
      ...(typeof errorRow?.detail === "undefined" ? {} : { detail: errorRow.detail }),
    },
    ...(meta ? { meta } : {}),
  };
}

export async function requestHammerTranscriptPrep(
  request: HammerTranscriptPrepRequest,
): Promise<HammerTranscriptPrepResult> {
  const debugEnabled = resolveTranscriptPrepDebugEnabled();
  const startedAt = typeof performance !== "undefined" ? performance.now() : null;
  const elapsedMs = (): number | null => (
    startedAt == null || typeof performance === "undefined" ? null : Math.round(performance.now() - startedAt)
  );
  const clientRequestId = request.client_request_id
    ?? (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `client_${Date.now()}_${Math.random().toString(16).slice(2)}`);
  const effectiveRequest: HammerTranscriptPrepRequest = request.client_request_id
    ? request
    : { ...request, client_request_id: clientRequestId };

  // Always log request start; transcript prep is a gate and we need deterministic visibility in dev.
  // eslint-disable-next-line no-console
  console.info("[HammerTranscriptPrep:client:request:start]", {
    elapsed_ms: elapsedMs(),
    client_request_id: clientRequestId,
    workspace_id: request.workspace_id,
    workpiece_id: request.workpiece_id,
    media_kind: request.media_kind,
    local_relpath: request.local_relpath ?? null,
    canonical_workpiece_path: request.canonical_workpiece_path ?? null,
    mime_type: request.mime_type ?? null,
  });
  const headers = new Headers({
    "content-type": "application/json",
  });
  const apiToken = resolveTongsApiToken();
  const userAccessToken = await resolveForgeUserAccessToken();
  if (apiToken && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${apiToken}`);
  }
  if (userAccessToken && !headers.has("x-forge-user-authorization")) {
    headers.set("x-forge-user-authorization", `Bearer ${userAccessToken}`);
  }
  if (userAccessToken && !headers.has("x-forge-user-token")) {
    headers.set("x-forge-user-token", userAccessToken);
  }

  const abortController = new AbortController();
  const timers = globalThis as typeof globalThis & RuntimeTimers;
  const timeoutMs = resolveTranscriptPrepTimeoutMs();
  const timeoutId = timers.setTimeout?.(
    () => abortController.abort(),
    timeoutMs,
  );

  let response: Response;
  try {
    if (debugEnabled) {
      // eslint-disable-next-line no-console
      console.info("[HammerTranscriptPrep:client:request:sent]", {
        elapsed_ms: elapsedMs(),
        client_request_id: clientRequestId,
      });
    }
    response = await fetch(HAMMER_TRANSCRIPT_PREP_ROUTE, {
      method: "POST",
      headers,
      body: JSON.stringify(effectiveRequest),
      signal: abortController.signal,
    });
  } catch (error) {
    if (abortController.signal.aborted) {
      const minutes = Math.round(timeoutMs / 60_000);
      // eslint-disable-next-line no-console
      console.error("[HammerTranscriptPrep:client:timeout]", {
        client_request_id: clientRequestId,
        timeout_ms: timeoutMs,
        workspace_id: request.workspace_id,
        workpiece_id: request.workpiece_id,
        media_kind: request.media_kind,
        local_relpath: request.local_relpath ?? null,
        canonical_workpiece_path: request.canonical_workpiece_path ?? null,
      });
      return {
        ok: false,
        status: 504,
        error: {
          code: "UNKNOWN_ERROR",
          message: `Hammer transcript prep timed out after ${minutes} minutes. Retry, then check the Nursery server logs if it keeps timing out.`,
          retryable: true,
        },
        meta: {
          timestamp: new Date().toISOString(),
          workspace_id: request.workspace_id,
          workpiece_id: request.workpiece_id,
          client_request_id: clientRequestId,
        },
      };
    }
    return {
      ok: false,
      status: 502,
      error: {
        code: "UNKNOWN_ERROR",
        message: error instanceof Error ? error.message : "Hammer transcript prep request failed unexpectedly.",
        retryable: true,
      },
      meta: {
        timestamp: new Date().toISOString(),
        workspace_id: request.workspace_id,
        workpiece_id: request.workpiece_id,
        client_request_id: clientRequestId,
      },
    };
  } finally {
    if (timeoutId != null) {
      timers.clearTimeout?.(timeoutId);
    }
  }

  // eslint-disable-next-line no-console
  console.info("[HammerTranscriptPrep:client:response:received]", {
    elapsed_ms: elapsedMs(),
    client_request_id: clientRequestId,
    status: response.status,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const envelope = normalizeErrorEnvelope(payload);
    if (envelope) {
      // eslint-disable-next-line no-console
      console.warn("[HammerTranscriptPrep:client:response:error]", {
        elapsed_ms: elapsedMs(),
        client_request_id: clientRequestId,
        status: response.status,
        code: envelope.error.code,
        retryable: envelope.error.retryable,
        message: envelope.error.message,
      });
      return {
        ok: false,
        status: response.status,
        error: envelope.error,
        ...(envelope.meta ? { meta: envelope.meta } : {}),
      };
    }
    // eslint-disable-next-line no-console
    console.warn("[HammerTranscriptPrep:client:response:error]", {
      elapsed_ms: elapsedMs(),
      client_request_id: clientRequestId,
      status: response.status,
      message: readErrorMessage(payload),
    });
    return {
      ok: false,
      status: response.status,
      error: {
        code: "UNKNOWN_ERROR",
        message: readErrorMessage(payload),
        retryable: response.status >= 500 || response.status === 429,
      },
      meta: {
        timestamp: new Date().toISOString(),
        workspace_id: request.workspace_id,
        workpiece_id: request.workpiece_id,
        client_request_id: clientRequestId,
      },
    };
  }

  const normalized = normalizeResponse(payload);
  if (!normalized) {
    // eslint-disable-next-line no-console
    console.warn("[HammerTranscriptPrep:client:response:invalid]", {
      elapsed_ms: elapsedMs(),
      client_request_id: clientRequestId,
    });
    return {
      ok: false,
      status: 502,
      error: {
        code: "UNKNOWN_ERROR",
        message: "Hammer transcript prep returned an invalid response.",
        retryable: true,
      },
      meta: {
        timestamp: new Date().toISOString(),
        workspace_id: request.workspace_id,
        workpiece_id: request.workpiece_id,
        client_request_id: clientRequestId,
      },
    };
  }
  // eslint-disable-next-line no-console
  console.info("[HammerTranscriptPrep:client:response:ok]", {
    elapsed_ms: elapsedMs(),
    client_request_id: clientRequestId,
    provider: normalized.provider,
    model: normalized.model,
    provider_request_id: normalized.provider_request_id ?? null,
    segments: normalized.segments.length,
    has_text: Boolean(normalized.text),
  });

  return { ok: true, status: response.status, data: normalized };
}
