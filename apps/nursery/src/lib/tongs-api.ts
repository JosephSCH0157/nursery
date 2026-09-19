import { supabase } from "./supabase";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type JsonObject = { [key: string]: JsonValue };

const TOKEN_STORAGE_KEY = "forge_tongs_api_token_v1";
const SUPABASE_AUTH_STORAGE_KEY = "forge-auth";
const SUPABASE_AUTH_KEY_RE = /^sb-[a-z0-9-]+-auth-token$/i;

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

  const fromEnv = readString(import.meta.env?.VITE_TONGS_API_TOKEN);
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

async function resolveUserAccessToken(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    const liveToken = sanitizeAccessToken(readString(data.session?.access_token ?? null));
    if (!error && liveToken) return liveToken;
  } catch {
    // Fall through to compatibility storage for older shells.
  }

  if (typeof window !== "undefined") {
    const fromPrimary = readAccessTokenFromStorageKey(SUPABASE_AUTH_STORAGE_KEY);
    if (fromPrimary) return fromPrimary;

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
  }

  return null;
}

function sanitizeAccessToken(token: string | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return token;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { exp?: unknown };
    if (typeof payload.exp === "number" && payload.exp * 1000 <= Date.now() + 5000) {
      return null;
    }
  } catch {
    // Let Supabase validate opaque or non-standard bearer tokens.
  }
  return token;
}

function readAccessTokenFromStorageKey(key: string): string | null {
  if (typeof window === "undefined") return null;

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return null;
  }
  const value = readString(raw);
  if (!value) return null;

  if (!value.startsWith("{") && !value.startsWith("[")) {
    return sanitizeAccessToken(value);
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return sanitizeAccessToken(extractAccessToken(parsed));
  } catch {
    return null;
  }
}

function extractAccessToken(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const token = extractAccessToken(entry);
      if (token) return token;
    }
    return null;
  }

  const row = value as Record<string, unknown>;
  const direct = readString(row.access_token);
  if (direct) return direct;

  const session = row.session;
  if (session && typeof session === "object") {
    const token = readString((session as Record<string, unknown>).access_token);
    if (token) return token;
  }

  const currentSession = row.currentSession;
  if (currentSession && typeof currentSession === "object") {
    const token = readString((currentSession as Record<string, unknown>).access_token);
    if (token) return token;
  }

  const nestedData = row.data;
  if (nestedData && typeof nestedData === "object") {
    return extractAccessToken(nestedData);
  }

  return null;
}

export async function tongsApiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await tongsApiFetch(path, init);

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

export async function tongsApiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = resolveTongsApiToken();
  const userAccessToken = await resolveUserAccessToken();
  const headers = new Headers(init?.headers ?? {});
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }
  if (userAccessToken && !headers.has("x-forge-user-authorization")) {
    headers.set("x-forge-user-authorization", `Bearer ${userAccessToken}`);
  }

  const response = await fetch(path, {
    ...init,
    headers,
  });
  return response;
}
