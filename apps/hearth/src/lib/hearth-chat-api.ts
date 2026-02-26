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

const AI_SETTINGS_STORAGE_KEY = "forge:hearth:aiSettings:v1";
const SUPABASE_AUTH_STORAGE_KEY = "forge-auth";

type AiSettingsSnapshot = {
  lane: HearthAiLane;
  behavior: HearthAiBehavior;
};

const DEFAULT_AI_SETTINGS: AiSettingsSnapshot = {
  lane: "forge",
  behavior: "careful",
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
  const url = meta.env?.VITE_SUPABASE_URL?.trim();
  const anonKey = meta.env?.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

function readAccessTokenFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      access_token?: unknown;
      currentSession?: { access_token?: unknown };
      session?: { access_token?: unknown };
    };
    const direct = parsed.access_token;
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    const fromCurrent = parsed.currentSession?.access_token;
    if (typeof fromCurrent === "string" && fromCurrent.trim()) return fromCurrent.trim();
    const fromSession = parsed.session?.access_token;
    if (typeof fromSession === "string" && fromSession.trim()) return fromSession.trim();
  } catch {
    // ignore JSON parse failures
  }
  return null;
}

function buildAuthHeaders(opts?: { includeJson?: boolean }): Headers {
  const headers = new Headers();
  if (opts?.includeJson !== false) {
    headers.set("content-type", "application/json");
  }
  const accessToken = readAccessTokenFromStorage();
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
    const parsed = JSON.parse(raw) as { lane?: unknown; behavior?: unknown };
    return {
      lane: isLane(parsed.lane) ? parsed.lane : "forge",
      behavior: isBehavior(parsed.behavior) ? parsed.behavior : "careful",
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

function parseCreditsPayload(payload: unknown, fallbackLane: HearthAiLane): HearthAiRuntimeSnapshot {
  if (Array.isArray(payload) && payload.length > 0) {
    return readRuntimeFromPayload(payload[0], fallbackLane);
  }
  return readRuntimeFromPayload(payload, fallbackLane);
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
  const accessToken = readAccessTokenFromStorage();
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
      headers: buildAuthHeaders({ includeJson: true }),
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
      headers: buildAuthHeaders({ includeJson: true }),
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
  const ops = normalizeOps(readUnknownField(payload, "ops"));
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
    runtime,
    totalTokens: readNumberField(payload, "total_tokens"),
    creditsWarning: readStringField(payload, "credits_warning") ?? undefined,
  };
}
