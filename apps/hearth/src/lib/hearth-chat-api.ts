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
      reply: string;
      runtime: HearthAiRuntimeSnapshot;
      totalTokens: number | null;
    }
  | {
      ok: false;
      status: number;
      error: string;
      runtime: HearthAiRuntimeSnapshot;
      cancelled?: boolean;
    };

const AI_SETTINGS_STORAGE_KEY = "forge:hearth:aiSettings:v1";

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

export async function fetchHearthAiStatus(): Promise<HearthAiStatusResult> {
  const settings = resolveAiSettingsFromStorage();
  const lane = settings.lane;
  const query = new URLSearchParams({ lane });
  let response: Response;

  try {
    response = await fetch(`/api/hearth/chat/status?${query.toString()}`, {
      method: "GET",
      headers: {
        "content-type": "application/json",
      },
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

  let response: Response;
  try {
    response = await fetch("/api/hearth/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messages: normalized,
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

  const reply = readStringField(payload, "reply")?.trim();
  if (!reply) {
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
    reply,
    runtime,
    totalTokens: readNumberField(payload, "total_tokens"),
  };
}
