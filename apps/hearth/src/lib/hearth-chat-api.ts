export type HearthAiBehavior = "fast" | "careful" | "deterministic" | "creative";
export type HearthChatRole = "system" | "user" | "assistant";

export type HearthChatMessage = {
  role: HearthChatRole;
  content: string;
};

export type HearthChatResult =
  | { ok: true; status: number; reply: string }
  | { ok: false; status: number; error: string };

const AI_SETTINGS_STORAGE_KEY = "forge:hearth:aiSettings:v1";

function isBehavior(value: unknown): value is HearthAiBehavior {
  return value === "fast" || value === "careful" || value === "deterministic" || value === "creative";
}

function resolveBehaviorFromStorage(): HearthAiBehavior {
  if (typeof window === "undefined") return "careful";
  try {
    const raw = window.localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
    if (!raw) return "careful";
    const parsed = JSON.parse(raw) as { behavior?: unknown };
    return isBehavior(parsed.behavior) ? parsed.behavior : "careful";
  } catch {
    return "careful";
  }
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

export async function requestHearthChatReply(messages: HearthChatMessage[]): Promise<HearthChatResult> {
  const normalized = normalizeMessages(messages);
  if (!normalized.length) {
    return { ok: false, status: 400, error: "No messages provided." };
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
        behavior: resolveBehaviorFromStorage(),
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error";
    return { ok: false, status: 0, error: message };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorText = readStringField(payload, "error") || `Request failed (${response.status})`;
    return { ok: false, status: response.status, error: errorText };
  }

  const reply = readStringField(payload, "reply")?.trim();
  if (!reply) {
    return { ok: false, status: response.status, error: "Assistant returned an empty reply." };
  }

  return { ok: true, status: response.status, reply };
}
