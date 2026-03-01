type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type JsonObject = { [key: string]: JsonValue };

const TOKEN_STORAGE_KEY = "forge_tongs_api_token_v1";

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveTokenFromQuery(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    return readString(params.get("tongs_api_token") ?? params.get("tongsApiToken"));
  } catch {
    return null;
  }
}

function resolveTongsApiToken(): string | null {
  const fromQuery = resolveTokenFromQuery();
  if (fromQuery) return fromQuery;

  const fromEnv = readString((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_TONGS_API_TOKEN);
  if (fromEnv) return fromEnv;

  if (typeof window === "undefined") return null;
  try {
    return readString(window.localStorage.getItem(TOKEN_STORAGE_KEY));
  } catch {
    return null;
  }
}

function normalizeMessage(input: unknown): string {
  if (typeof input === "string" && input.trim()) return input.trim();
  return "Tongs API request failed.";
}

export async function tongsApiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = resolveTongsApiToken();
  const headers = new Headers(init?.headers ?? {});
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const response = await fetch(path, {
    ...init,
    headers,
  });

  const text = await response.text();
  let body: JsonObject | null = null;
  if (text.trim().length > 0) {
    try {
      body = JSON.parse(text) as JsonObject;
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const errorRow = body?.error as JsonObject | undefined;
    const message = normalizeMessage(errorRow?.message ?? body?.message);
    throw new Error(message);
  }

  const data = body?.data as T | undefined;
  if (typeof data === "undefined") {
    throw new Error("Tongs API response missing data payload.");
  }
  return data;
}

