import type { MediaKind } from "../../../../packages/contracts/hammer/media-resolver.contract";
import type {
  HammerAudioPolishFailureCode,
  HammerAudioPolishPass,
} from "../persistence/hammerPersistenceContract";

export const HAMMER_AUDIO_POLISH_ROUTE = "/api/hammer/prep/audio-polish";

export interface HammerAudioPolishRequest {
  workspace_id: string;
  workpiece_id: string;
  media_kind: MediaKind;
  local_root_abs?: string | null;
  local_relpath?: string | null;
  canonical_workpiece_path?: string | null;
  mime_type?: string | null;
}

export interface HammerAudioPolishResponse {
  status: "prepared" | "failed";
  prepared_at: string | null;
  prepared_passes: HammerAudioPolishPass[];
  processor_version: string;
  output_local_relpath: string | null;
  output_workpiece_path: string | null;
  output_mime_type: string | null;
  output_duration_ms: number | null;
  failure_code: HammerAudioPolishFailureCode | null;
  failure_reason: string | null;
  settings_summary: Record<string, string | number | boolean | null>;
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

function readErrorMessage(payload: unknown): string {
  const row = readObject(payload);
  const error = readObject(row?.error);
  return readString(error?.message)
    ?? readString(row?.message)
    ?? readString(row?.detail)
    ?? "Hammer audio polish failed.";
}

function normalizeResponse(payload: unknown): HammerAudioPolishResponse | null {
  const root = readObject(payload);
  const data = readObject(root?.data);
  const status = readString(data?.status);
  const processorVersion = readString(data?.processor_version);
  const passesRaw = Array.isArray(data?.prepared_passes) ? data.prepared_passes : [];
  const preparedPasses = passesRaw
    .map((value) => readString(value))
    .filter((value): value is HammerAudioPolishPass => (
      value === "studio_sound" || value === "noise_cleanup" || value === "level_consistency"
    ));
  if ((status !== "prepared" && status !== "failed") || !processorVersion) {
    return null;
  }

  const settingsSummaryRow = readObject(data?.settings_summary);
  const settingsSummary: Record<string, string | number | boolean | null> = {};
  if (settingsSummaryRow) {
    for (const [key, value] of Object.entries(settingsSummaryRow)) {
      if (
        value == null
        || typeof value === "string"
        || typeof value === "number"
        || typeof value === "boolean"
      ) {
        settingsSummary[key] = value ?? null;
      }
    }
  }

  const failureCode = readString(data?.failure_code);
  return {
    status,
    prepared_at: readString(data?.prepared_at),
    prepared_passes: preparedPasses,
    processor_version: processorVersion,
    output_local_relpath: readString(data?.output_local_relpath),
    output_workpiece_path: readString(data?.output_workpiece_path),
    output_mime_type: readString(data?.output_mime_type),
    output_duration_ms: readNumber(data?.output_duration_ms),
    failure_code: failureCode === "unsupported_source"
      || failureCode === "source_unavailable"
      || failureCode === "processing_failed"
      ? failureCode
      : null,
    failure_reason: readString(data?.failure_reason),
    settings_summary: settingsSummary,
  };
}

const HAMMER_AUDIO_POLISH_TIMEOUT_MS = 3 * 60 * 1000;
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

export async function requestHammerAudioPolish(
  request: HammerAudioPolishRequest,
): Promise<HammerAudioPolishResponse> {
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

  const abortController = new AbortController();
  const timers = globalThis as typeof globalThis & RuntimeTimers;
  const timeoutId = timers.setTimeout?.(
    () => abortController.abort(),
    HAMMER_AUDIO_POLISH_TIMEOUT_MS,
  );

  let response: Response;
  try {
    response = await fetch(HAMMER_AUDIO_POLISH_ROUTE, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
      signal: abortController.signal,
    });
  } catch (error) {
    if (abortController.signal.aborted) {
      throw new Error("Hammer audio polish timed out after 3 minutes. Restart the Nursery dev server and retry.");
    }
    throw error;
  } finally {
    if (timeoutId != null) {
      timers.clearTimeout?.(timeoutId);
    }
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(readErrorMessage(payload));
  }

  const normalized = normalizeResponse(payload);
  if (!normalized) {
    throw new Error("Hammer audio polish returned an invalid response.");
  }

  return normalized;
}
