import type { EpisodeContext, HearthOp } from "./hearth-ai-ops";

export type HearthAiLane = "forge" | "byo";
export type HearthAiBehavior = "fast" | "careful" | "deterministic" | "creative";
export type HearthChatRole = "system" | "user" | "assistant";

export type HearthChatMessage = {
  role: HearthChatRole;
  content: string;
};

export type HearthAiRuntimeSnapshot = {
  tokenBalance: number | null;
  billingMode: HearthAiLane;
};

export type HearthAiStatusResult =
  | { ok: true; status: number; runtime: HearthAiRuntimeSnapshot }
  | { ok: false; status: number; error: string; runtime: HearthAiRuntimeSnapshot };

export type HearthChatResult =
  | {
      ok: true;
      status: number;
      assistantText: string;
      ops: HearthOp[];
      scriptText?: string;
      tagAudit?: Record<string, unknown>;
      gate?: "clarify";
      runtime: HearthAiRuntimeSnapshot;
      totalTokens: number | null;
      creditsWarning?: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
      runtime: HearthAiRuntimeSnapshot;
      cancelled?: boolean;
    };

export type HearthInteractionEventType =
  | "chat_sent"
  | "gate_questions_shown"
  | "gate_answers_provided"
  | "draft_generated"
  | "outline_generated"
  | "user_requested_outline"
  | "user_requested_script"
  | "user_explicit_draft_now"
  | "proposal_applied"
  | "proposal_discarded";

export type HearthSttUploadResult =
  | {
      ok: true;
      status: number;
      storageKey: string;
      mimeType: string;
      fileSize: number;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export type HearthSttResult =
  | {
      ok: true;
      status: number;
      text: string;
      runtime: HearthAiRuntimeSnapshot;
      providerRequestId: string | null;
      totalTokens: number | null;
      creditsWarning?: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
      runtime: HearthAiRuntimeSnapshot;
      cancelled?: boolean;
      creditsWarning?: string;
    };

const AI_SETTINGS_STORAGE_KEY = "forge:hearth:aiSettings:v1";
const SUPABASE_AUTH_STORAGE_KEY = "forge-auth";
const HEARTH_STT_BUCKET = "forge-workpieces";
const SUPABASE_AUTH_KEY_RE = /^sb-[a-z0-9-]+-auth-token$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AiSettingsSnapshot = {
  lane: HearthAiLane;
  behavior: HearthAiBehavior;
  autoApproveImageSpend: boolean;
};

const DEFAULT_AI_SETTINGS: AiSettingsSnapshot = {
  lane: "forge",
  behavior: "careful",
  autoApproveImageSpend: false,
};

function isBehavior(value: unknown): value is HearthAiBehavior {
  return value === "fast" || value === "careful" || value === "deterministic" || value === "creative";
}

function isLane(value: unknown): value is HearthAiLane {
  return value === "forge" || value === "byo";
}

function normalizeMessages(messages: HearthChatMessage[]): HearthChatMessage[] {
  return messages
    .filter((message) => (
      (message.role === "system" || message.role === "user" || message.role === "assistant")
        && typeof message.content === "string"
    ))
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-24);
}

function readStringField(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function readNumberField(payload: unknown, key: string): number | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readUnknownField(payload: unknown, key: string): unknown {
  if (!payload || typeof payload !== "object") return null;
  return (payload as Record<string, unknown>)[key];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: string | null | undefined): value is string {
  if (!value) return false;
  return UUID_RE.test(value.trim());
}

function sanitizeEventPayload(payload?: Record<string, unknown>): Record<string, unknown> {
  if (!payload) return {};
  const out: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(payload)) {
    if (!key.trim()) continue;
    if (typeof rawValue === "boolean") {
      out[key] = rawValue;
      continue;
    }
    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      out[key] = rawValue;
      continue;
    }
    if (typeof rawValue === "string") {
      const compact = rawValue.replace(/\s+/g, " ").trim();
      out[key] = compact.length > 220 ? `${compact.slice(0, 220)}...` : compact;
      continue;
    }
    if (Array.isArray(rawValue)) {
      const arr = rawValue
        .slice(0, 20)
        .map((entry) => (
          typeof entry === "string"
            ? entry.replace(/\s+/g, " ").trim().slice(0, 120)
            : typeof entry === "number" && Number.isFinite(entry)
              ? entry
              : typeof entry === "boolean"
                ? entry
                : null
        ))
        .filter((entry) => entry != null);
      out[key] = arr;
      continue;
    }
    if (rawValue == null) {
      out[key] = null;
    }
  }
  return out;
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeOpPatch(value: unknown): { title?: string; url?: string; note?: string } | null {
  if (!isRecord(value)) return null;
  const title = readOptionalString(value.title);
  const url = readOptionalString(value.url);
  const note = readOptionalString(value.note);
  if (!title && !url && !note) return null;
  return {
    ...(title ? { title } : {}),
    ...(url ? { url } : {}),
    ...(note ? { note } : {}),
  };
}

function normalizeOps(value: unknown): HearthOp[] {
  if (!Array.isArray(value)) return [];
  const out: HearthOp[] = [];

  for (const item of value) {
    if (!isRecord(item)) continue;
    const op = readOptionalString(item.op);
    if (!op) continue;

    if (op === "set_title") {
      const next = readOptionalString(item.value);
      if (next !== undefined) out.push({ op, value: next });
      continue;
    }

    if (op === "set_title_variant") {
      const slot = readOptionalString(item.slot);
      const valueText = readOptionalString(item.value);
      if ((slot === "A" || slot === "B" || slot === "C") && valueText !== undefined) {
        out.push({ op, slot, value: valueText });
      }
      continue;
    }

    if (op === "set_outline") {
      const next = readOptionalString(item.value);
      if (next !== undefined) out.push({ op, value: next });
      continue;
    }

    if (op === "set_body") {
      const next = readOptionalString(item.value);
      if (next !== undefined) out.push({ op, value: next });
      continue;
    }

    if (op === "add_source") {
      const source = normalizeOpPatch(item.source);
      if (source) out.push({ op, source });
      continue;
    }

    if (op === "update_source") {
      const id = readOptionalString(item.id);
      const patch = normalizeOpPatch(item.patch);
      if (id && patch) out.push({ op, id, patch });
      continue;
    }

    if (op === "remove_source") {
      const id = readOptionalString(item.id);
      if (id) out.push({ op, id });
      continue;
    }
  }

  return out;
}

function readSupabaseConfig(): { url: string; anonKey: string } | null {
  const meta = import.meta as unknown as {
    env?: Record<string, string | undefined>;
  };
  const envUrl = meta.env?.VITE_SUPABASE_URL?.trim();
  const envAnonKey = meta.env?.VITE_SUPABASE_ANON_KEY?.trim();
  if (envUrl && envAnonKey) {
    return { url: envUrl, anonKey: envAnonKey };
  }

  if (typeof window === "undefined") return null;

  const runtimeWindow = window as Window & typeof globalThis & {
    __forgeSupabaseUrl?: unknown;
    __forgeSupabaseAnonKey?: unknown;
    __tpSupabaseUrl?: unknown;
    __tpSupabaseAnonKey?: unknown;
    __forge_supabase_client__?: {
      supabaseUrl?: unknown;
      supabaseKey?: unknown;
    };
  };

  const globalUrl = readTokenString(runtimeWindow.__forgeSupabaseUrl)
    ?? readTokenString(runtimeWindow.__tpSupabaseUrl);
  const globalAnon = readTokenString(runtimeWindow.__forgeSupabaseAnonKey)
    ?? readTokenString(runtimeWindow.__tpSupabaseAnonKey);
  if (globalUrl && globalAnon) {
    return { url: globalUrl, anonKey: globalAnon };
  }

  const clientUrl = readTokenString(runtimeWindow.__forge_supabase_client__?.supabaseUrl);
  const clientKey = readTokenString(runtimeWindow.__forge_supabase_client__?.supabaseKey);
  if (clientUrl && clientKey) {
    return { url: clientUrl, anonKey: clientKey };
  }

  return null;
}

function readTokenString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function decodeBase64Url(input: string): string | null {
  if (!input) return null;
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  try {
    return atob(padded);
  } catch {
    return null;
  }
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payload = decodeBase64Url(parts[1]);
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
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

function isExpiredAccessToken(token: string): boolean {
  const expiryMs = readJwtExpiryMs(token);
  if (!expiryMs) return false;
  return expiryMs <= Date.now() + 5000;
}

function sanitizeAccessToken(token: string | null): string | null {
  if (!token) return null;
  return isExpiredAccessToken(token) ? null : token;
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
  const direct = readTokenString(row.access_token);
  if (direct) return sanitizeAccessToken(direct);

  const currentSession = row.currentSession;
  if (currentSession && typeof currentSession === "object") {
    const token = readTokenString((currentSession as Record<string, unknown>).access_token);
    if (token) return sanitizeAccessToken(token);
  }

  const session = row.session;
  if (session && typeof session === "object") {
    const token = readTokenString((session as Record<string, unknown>).access_token);
    if (token) return sanitizeAccessToken(token);
  }

  const currentSessionLegacy = row.current_session;
  if (currentSessionLegacy && typeof currentSessionLegacy === "object") {
    const token = readTokenString((currentSessionLegacy as Record<string, unknown>).access_token);
    if (token) return sanitizeAccessToken(token);
  }

  const nestedData = row.data;
  if (nestedData && typeof nestedData === "object") {
    const token = extractAccessTokenFromAuthPayload(nestedData);
    if (token) return token;
  }

  return null;
}

function readAccessTokenFromStorageKey(key: string): string | null {
  if (typeof window === "undefined") return null;

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  const direct = readTokenString(raw);
  if (direct && direct !== "null" && direct !== "undefined" && !direct.startsWith("{") && !direct.startsWith("[")) {
    return sanitizeAccessToken(direct);
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const token = extractAccessTokenFromAuthPayload(parsed);
    return sanitizeAccessToken(token);
  } catch {
    return null;
  }
}

function readAccessTokenFromStorage(): string | null {
  if (typeof window === "undefined") return null;

  const primary = readAccessTokenFromStorageKey(SUPABASE_AUTH_STORAGE_KEY);
  if (primary) return primary;

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || key === SUPABASE_AUTH_STORAGE_KEY) continue;
      if (!SUPABASE_AUTH_KEY_RE.test(key)) continue;
      const token = readAccessTokenFromStorageKey(key);
      if (token) return token;
    }
  } catch {
    // ignore storage access failures
  }
  return null;
}

async function readAccessTokenForRequest(): Promise<string | null> {
  const fromStorage = readAccessTokenFromStorage();
  if (fromStorage) return fromStorage;
  if (typeof window === "undefined") return null;

  const runtimeWindow = window as Window & typeof globalThis & {
    __forge_supabase_client__?: {
      auth?: {
        getSession?: () => Promise<unknown>;
      };
    };
  };

  const getSession = runtimeWindow.__forge_supabase_client__?.auth?.getSession;
  if (typeof getSession !== "function") return null;

  try {
    const sessionPayload = await getSession();
    const token = extractAccessTokenFromAuthPayload(sessionPayload);
    return sanitizeAccessToken(token);
  } catch {
    return null;
  }
}

async function buildAuthHeaders(opts?: { includeJson?: boolean }): Promise<Headers> {
  const headers = new Headers();
  if (opts?.includeJson !== false) {
    headers.set("content-type", "application/json");
  }
  const accessToken = await readAccessTokenForRequest();
  if (accessToken) {
    headers.set("authorization", `Bearer ${accessToken}`);
  }
  return headers;
}

function resolveAiSettingsFromStorage(): AiSettingsSnapshot {
  if (typeof window === "undefined") return DEFAULT_AI_SETTINGS;
  try {
    const raw = window.localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_AI_SETTINGS;
    const parsed = JSON.parse(raw) as { lane?: unknown; behavior?: unknown; autoApproveImageSpend?: unknown };
    return {
      lane: isLane(parsed.lane) ? parsed.lane : "forge",
      behavior: isBehavior(parsed.behavior) ? parsed.behavior : "careful",
      autoApproveImageSpend: parsed.autoApproveImageSpend === true,
    };
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

function readRuntimeFromPayload(payload: unknown, fallbackLane: HearthAiLane): HearthAiRuntimeSnapshot {
  const billingModeRaw = readStringField(payload, "billing_mode");
  const billingMode = isLane(billingModeRaw) ? billingModeRaw : fallbackLane;
  const tokenBalanceRaw = readNumberField(payload, "token_balance");
  const tokenBalance = billingMode === "forge" ? tokenBalanceRaw : null;
  return {
    tokenBalance,
    billingMode,
  };
}

function readErrorText(payload: unknown, fallback: string): string {
  const errorText = readStringField(payload, "error");
  if (errorText && errorText.trim()) return errorText;
  return fallback;
}

export function resolveAiLaneFromStorage(): HearthAiLane {
  return resolveAiSettingsFromStorage().lane;
}

export async function resolveForgeUserAccessToken(): Promise<string | null> {
  return readAccessTokenForRequest();
}

export function resolveAiThumbnailAutoApproveFromStorage(): boolean {
  return resolveAiSettingsFromStorage().autoApproveImageSpend === true;
}

function parseCreditsPayload(payload: unknown, fallbackLane: HearthAiLane): HearthAiRuntimeSnapshot {
  if (Array.isArray(payload) && payload.length > 0) {
    return readRuntimeFromPayload(payload[0], fallbackLane);
  }
  return readRuntimeFromPayload(payload, fallbackLane);
}

function createStorageObjectPath(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function createClientRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function extensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.trim().toLowerCase();
  if (!normalized) return "webm";
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("mpeg") || normalized.includes("mp3")) return "mp3";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("mp4") || normalized.includes("m4a")) return "m4a";
  return "webm";
}

function resolveBlobMimeType(blob: Blob): string {
  const trimmed = blob.type?.trim();
  if (trimmed) return trimmed;
  return "audio/webm";
}

function readStorageError(payload: unknown, fallback: string): string {
  const message = readStringField(payload, "message") ?? readStringField(payload, "error");
  if (message && message.trim()) return message;
  return fallback;
}

export async function recordHearthEvent(args: {
  eventType: HearthInteractionEventType;
  payload?: Record<string, unknown>;
  episodeId?: string | null;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const config = readSupabaseConfig();
  if (!config) {
    return {
      ok: false,
      status: 500,
      error: "Supabase config missing.",
    };
  }

  const accessToken = await readAccessTokenForRequest();
  if (!accessToken) {
    return {
      ok: false,
      status: 401,
      error: "Sign in required.",
    };
  }

  const headers = new Headers();
  headers.set("apikey", config.anonKey);
  headers.set("authorization", `Bearer ${accessToken}`);
  headers.set("accept-profile", "tongs");
  headers.set("content-profile", "tongs");
  headers.set("content-type", "application/json");

  const trimmedEpisodeId = args.episodeId?.trim() ?? "";
  const payload = {
    p_event_type: args.eventType,
    p_payload: sanitizeEventPayload(args.payload),
    p_episode_id: isUuid(trimmedEpisodeId) ? trimmedEpisodeId : null,
  };

  let response: Response;
  try {
    response = await fetch(`${config.url}/rest/v1/rpc/record_hearth_event`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error";
    return {
      ok: false,
      status: 0,
      error: message,
    };
  }

  if (!response.ok) {
    let resultPayload: unknown = null;
    try {
      resultPayload = await response.json();
    } catch {
      resultPayload = null;
    }
    return {
      ok: false,
      status: response.status,
      error: readErrorText(resultPayload, `Event RPC failed (${response.status})`),
    };
  }

  return { ok: true };
}

export async function refreshMyAiCredits(): Promise<HearthAiStatusResult> {
  const lane = resolveAiLaneFromStorage();
  if (lane === "byo") {
    return {
      ok: true,
      status: 200,
      runtime: {
        billingMode: "byo",
        tokenBalance: null,
      },
    };
  }

  const config = readSupabaseConfig();
  const accessToken = await readAccessTokenForRequest();
  if (!config || !accessToken) {
    return {
      ok: false,
      status: 0,
      error: "Unable to refresh credits.",
      runtime: { billingMode: lane, tokenBalance: null },
    };
  }

  let response: Response;
  try {
    response = await fetch(`${config.url}/rest/v1/rpc/get_my_ai_credits`, {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        authorization: `Bearer ${accessToken}`,
        "accept-profile": "tongs",
        "content-profile": "tongs",
        "content-type": "application/json",
      },
      body: "{}",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error";
    return {
      ok: false,
      status: 0,
      error: message,
      runtime: { billingMode: lane, tokenBalance: null },
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const runtime = parseCreditsPayload(payload, lane);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: readErrorText(payload, `Credits request failed (${response.status})`),
      runtime,
    };
  }

  return {
    ok: true,
    status: response.status,
    runtime,
  };
}

export async function fetchHearthAiStatus(): Promise<HearthAiStatusResult> {
  const credits = await refreshMyAiCredits();
  if (credits.ok) {
    return credits;
  }

  const lane = resolveAiLaneFromStorage();
  const query = new URLSearchParams({ lane });
  let response: Response;

  try {
    response = await fetch(`/api/hearth/chat/status?${query.toString()}`, {
      method: "GET",
      headers: await buildAuthHeaders({ includeJson: true }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error";
    return {
      ok: false,
      status: 0,
      error: message,
      runtime: { tokenBalance: null, billingMode: lane },
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const runtime = readRuntimeFromPayload(payload, lane);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: readErrorText(payload, `Status request failed (${response.status})`),
      runtime,
    };
  }

  return {
    ok: true,
    status: response.status,
    runtime,
  };
}

export async function uploadHearthSttAudio(args: {
  workpieceId: string;
  blob: Blob;
}): Promise<HearthSttUploadResult> {
  const workpieceId = args.workpieceId.trim();
  if (!workpieceId) {
    return {
      ok: false,
      status: 400,
      error: "Workpiece id is required.",
    };
  }

  const config = readSupabaseConfig();
  if (!config) {
    return {
      ok: false,
      status: 500,
      error: "Supabase config missing for AI transcription.",
    };
  }

  const accessToken = await readAccessTokenForRequest();
  if (!accessToken) {
    return {
      ok: false,
      status: 401,
      error: "Sign in required for AI transcription.",
    };
  }

  const mimeType = resolveBlobMimeType(args.blob);
  const extension = extensionFromMimeType(mimeType);
  const fileName = `${createClientRequestId()}.${extension}`;
  const storageKey = `workpieces/${workpieceId}/stt/${fileName}`;
  const storagePath = createStorageObjectPath([HEARTH_STT_BUCKET, ...storageKey.split("/")]);
  const uploadUrl = `${config.url}/storage/v1/object/${storagePath}`;

  let response: Response;
  try {
    response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        authorization: `Bearer ${accessToken}`,
        "content-type": mimeType,
        "x-upsert": "false",
      },
      body: args.blob,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    return {
      ok: false,
      status: 0,
      error: message,
    };
  }

  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    return {
      ok: false,
      status: response.status,
      error: readStorageError(payload, `Upload failed (${response.status})`),
    };
  }

  return {
    ok: true,
    status: response.status,
    storageKey,
    mimeType,
    fileSize: args.blob.size,
  };
}

export async function requestHearthSttTranscript(args: {
  workpieceId: string;
  storageKey: string;
  mimeType?: string;
  signal?: AbortSignal;
}): Promise<HearthSttResult> {
  const settings = resolveAiSettingsFromStorage();
  const lane = settings.lane;
  const workpieceId = args.workpieceId.trim();
  const storageKey = args.storageKey.trim();
  const mimeType = args.mimeType?.trim();

  if (!workpieceId || !storageKey) {
    return {
      ok: false,
      status: 400,
      error: "workpieceId and storageKey are required.",
      runtime: { tokenBalance: null, billingMode: lane },
    };
  }

  const accessToken = await readAccessTokenForRequest();
  if (!accessToken) {
    return {
      ok: false,
      status: 401,
      error: "Sign in required for AI transcription.",
      runtime: { tokenBalance: null, billingMode: lane },
    };
  }

  const headers = new Headers();
  headers.set("content-type", "application/json");
  headers.set("authorization", `Bearer ${accessToken}`);

  let response: Response;
  try {
    response = await fetch("/api/hearth/stt", {
      method: "POST",
      headers,
      body: JSON.stringify({
        lane,
        workpiece_id: workpieceId,
        storage_key: storageKey,
        ...(mimeType ? { mime_type: mimeType } : {}),
      }),
      signal: args.signal,
    });
  } catch (error) {
    const cancelled = error instanceof DOMException && error.name === "AbortError";
    const message = cancelled
      ? "Transcription cancelled."
      : error instanceof Error
        ? error.message
        : "Network error";
    return {
      ok: false,
      status: 0,
      error: message,
      runtime: { tokenBalance: null, billingMode: lane },
      cancelled,
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const runtime = readRuntimeFromPayload(payload, lane);
  const creditsWarning = readStringField(payload, "credits_warning") ?? undefined;

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: readErrorText(payload, `Transcription failed (${response.status})`),
      runtime,
      creditsWarning,
    };
  }

  const text = (readStringField(payload, "text") ?? "").trim();
  if (!text) {
    return {
      ok: false,
      status: response.status,
      error: "Transcription returned empty text.",
      runtime,
      creditsWarning,
    };
  }

  return {
    ok: true,
    status: response.status,
    text,
    runtime,
    providerRequestId: readStringField(payload, "provider_request_id"),
    totalTokens: readNumberField(payload, "total_tokens"),
    creditsWarning,
  };
}

export async function requestHearthChatReply(
  messages: HearthChatMessage[],
  episodeContext: EpisodeContext,
  options?: { signal?: AbortSignal },
): Promise<HearthChatResult> {
  const normalized = normalizeMessages(messages);
  const settings = resolveAiSettingsFromStorage();
  const lane = settings.lane;
  if (!normalized.length) {
    return {
      ok: false,
      status: 400,
      error: "No messages provided.",
      runtime: { tokenBalance: null, billingMode: lane },
    };
  }

  if (!episodeContext.episodeId.trim()) {
    return {
      ok: false,
      status: 400,
      error: "Episode context is required.",
      runtime: { tokenBalance: null, billingMode: lane },
    };
  }

  let response: Response;
  try {
    response = await fetch("/api/hearth/chat", {
      method: "POST",
      headers: await buildAuthHeaders({ includeJson: true }),
      body: JSON.stringify({
        messages: normalized,
        episode_context: episodeContext,
        behavior: settings.behavior,
        lane,
      }),
      signal: options?.signal,
    });
  } catch (error) {
    const cancelled = error instanceof DOMException && error.name === "AbortError";
    const message = cancelled
      ? "AI request cancelled."
      : error instanceof Error
        ? error.message
        : "Network error";
    return {
      ok: false,
      status: 0,
      error: message,
      runtime: { tokenBalance: null, billingMode: lane },
      cancelled,
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const runtime = readRuntimeFromPayload(payload, lane);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: readErrorText(payload, `Request failed (${response.status})`),
      runtime,
    };
  }

  const assistantText = (
    readStringField(payload, "assistant_text")
    ?? readStringField(payload, "reply")
    ?? ""
  ).trim();
  const gateRaw = readStringField(payload, "gate");
  const gate = gateRaw === "clarify" ? "clarify" : undefined;
  const ops = normalizeOps(readUnknownField(payload, "ops"));
  const tagAuditRaw = readUnknownField(payload, "tag_audit");
  if (!assistantText && ops.length === 0) {
    return {
      ok: false,
      status: response.status,
      error: "Assistant returned an empty reply.",
      runtime,
    };
  }

  return {
    ok: true,
    status: response.status,
    assistantText,
    ops,
    scriptText: readStringField(payload, "script_text") ?? undefined,
    tagAudit: (tagAuditRaw && isRecord(tagAuditRaw))
      ? (tagAuditRaw as Record<string, unknown>)
      : undefined,
    gate,
    runtime,
    totalTokens: readNumberField(payload, "total_tokens"),
    creditsWarning: readStringField(payload, "credits_warning") ?? undefined,
  };
}
