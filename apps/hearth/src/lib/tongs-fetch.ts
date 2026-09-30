declare global {
  interface ImportMetaEnv extends Readonly<Record<string, unknown>> {
    readonly VITE_TONGS_API_TOKEN?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

type ForgeWindow = Window &
  typeof globalThis & {
    __forgeTongsApiToken?: unknown;
    __tpTongsApiToken?: unknown;
  };

const SUPABASE_AUTH_STORAGE_KEY = "forge-auth";
const SUPABASE_TONGS_AUTH_STORAGE_KEY = "forge-auth-tongs";
const SUPABASE_AUTH_KEY_RE = /^sb-[a-z0-9-]+-auth-token$/i;
const PLACEHOLDER_TONGS_TOKENS = new Set(["DEV_TOKEN"]);

export type TongsFetchOptions = RequestInit & { json?: unknown };
export type TongsUserAccessTokenResolver = () => Promise<string | null>;
export type TongsUserAccessTokenResolution =
  | { ok: true; accessToken: string; source: "current" | "refreshed" }
  | { ok: false; reason: "signed_out" | "session_unavailable" | "refresh_failed" };
export type TongsUserAccessTokenResultResolver = () => Promise<TongsUserAccessTokenResolution>;

let configuredUserAccessTokenResolver: TongsUserAccessTokenResolver | null = null;
let configuredUserAccessTokenResultResolver: TongsUserAccessTokenResultResolver | null = null;

export function configureTongsUserAccessTokenResolver(
  resolver: TongsUserAccessTokenResolver | null,
  resultResolver: TongsUserAccessTokenResultResolver | null = null,
): void {
  configuredUserAccessTokenResolver = resolver;
  configuredUserAccessTokenResultResolver = resultResolver;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function sanitizeTongsApiToken(token: string | null): string | null {
  if (!token) return null;
  return PLACEHOLDER_TONGS_TOKENS.has(token) ? null : token;
}

function readLocalStorage(key: string): string | null {
  try {
    return readString(window.localStorage.getItem(key));
  } catch {
    return null;
  }
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
  const json = decodeBase64Url(parts[1]);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
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
  const direct = readString(row.access_token);
  if (direct) return sanitizeAccessToken(direct);

  const currentSession = row.currentSession;
  if (currentSession && typeof currentSession === "object") {
    const token = readString((currentSession as Record<string, unknown>).access_token);
    if (token) return sanitizeAccessToken(token);
  }

  const session = row.session;
  if (session && typeof session === "object") {
    const token = readString((session as Record<string, unknown>).access_token);
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

  const direct = readString(raw);
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

function resolveUserAccessTokenFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  const tongs = readAccessTokenFromStorageKey(SUPABASE_TONGS_AUTH_STORAGE_KEY);
  if (tongs) return tongs;

  const primary = readAccessTokenFromStorageKey(SUPABASE_AUTH_STORAGE_KEY);
  if (primary) return primary;

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || key === SUPABASE_AUTH_STORAGE_KEY || key === SUPABASE_TONGS_AUTH_STORAGE_KEY) continue;
      if (!SUPABASE_AUTH_KEY_RE.test(key)) continue;
      const token = readAccessTokenFromStorageKey(key);
      if (token) return token;
    }
  } catch {
    // ignore storage errors
  }

  return null;
}

export async function resolveTongsUserAccessTokenResult(): Promise<TongsUserAccessTokenResolution> {
  if (typeof window === "undefined") return { ok: false, reason: "session_unavailable" };

  if (configuredUserAccessTokenResultResolver) {
    try {
      return await configuredUserAccessTokenResultResolver();
    } catch {
      return { ok: false, reason: "session_unavailable" };
    }
  }

  if (configuredUserAccessTokenResolver) {
    try {
      const token = sanitizeAccessToken(await configuredUserAccessTokenResolver());
      return token
        ? { ok: true, accessToken: token, source: "current" }
        : { ok: false, reason: "signed_out" };
    } catch {
      return { ok: false, reason: "session_unavailable" };
    }
  }

  const runtimeWindow = window as Window & typeof globalThis & {
    __forge_resolve_user_access_token__?: () => Promise<string | null>;
    __forge_resolve_user_access_token_result__?: TongsUserAccessTokenResultResolver;
    __forge_supabase_client__?: {
      auth?: {
        getSession?: () => Promise<unknown>;
        refreshSession?: () => Promise<unknown>;
      };
    };
  };

  const canonicalResultResolver = runtimeWindow.__forge_resolve_user_access_token_result__;
  if (typeof canonicalResultResolver === "function") {
    try {
      return await canonicalResultResolver();
    } catch {
      return { ok: false, reason: "session_unavailable" };
    }
  }

  const canonicalResolver = runtimeWindow.__forge_resolve_user_access_token__;
  if (typeof canonicalResolver === "function") {
    try {
      const token = sanitizeAccessToken(await canonicalResolver());
      return token
        ? { ok: true, accessToken: token, source: "current" }
        : { ok: false, reason: "signed_out" };
    } catch {
      return { ok: false, reason: "session_unavailable" };
    }
  }

  const auth = runtimeWindow.__forge_supabase_client__?.auth;
  if (auth && typeof auth.getSession === "function") {
    try {
      const sessionPayload = await auth.getSession();
      const token = sanitizeAccessToken(extractAccessTokenFromAuthPayload(sessionPayload));
      if (token) return { ok: true, accessToken: token, source: "current" };
      if (typeof auth.refreshSession === "function") {
        const refreshedPayload = await auth.refreshSession();
        const refreshedToken = sanitizeAccessToken(extractAccessTokenFromAuthPayload(refreshedPayload));
        if (refreshedToken) return { ok: true, accessToken: refreshedToken, source: "refreshed" };
        return { ok: false, reason: "refresh_failed" };
      }
      return { ok: false, reason: "signed_out" };
    } catch {
      return { ok: false, reason: "session_unavailable" };
    }
  }
  // Compatibility only for older shells that expose no canonical Supabase
  // authority. A present canonical client always remains authoritative.
  const compatibilityToken = resolveUserAccessTokenFromStorage();
  return compatibilityToken
    ? { ok: true, accessToken: compatibilityToken, source: "current" }
    : { ok: false, reason: "signed_out" };
}

export async function resolveTongsUserAccessToken(): Promise<string | null> {
  const result = await resolveTongsUserAccessTokenResult();
  return result.ok ? result.accessToken : null;
}

export function subscribeToForgeUserAccessToken(
  listener: () => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;

  const runtimeWindow = window as Window & typeof globalThis & {
    __forge_supabase_client__?: {
      auth?: {
        onAuthStateChange?: (
          callback: (event: string, session: unknown) => void,
        ) => {
          data?: {
            subscription?: { unsubscribe?: () => void };
          };
        };
      };
    };
  };
  const auth = runtimeWindow.__forge_supabase_client__?.auth;
  const subscribe = auth?.onAuthStateChange;
  if (typeof subscribe !== "function") return () => undefined;

  const result = subscribe.call(auth, () => {
    listener();
  });
  return () => result?.data?.subscription?.unsubscribe?.();
}

function resolveFromQuery(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    return readString(params.get("tongs_api_token") ?? params.get("tongsApiToken"));
  } catch {
    return null;
  }
}

export async function hasTongsUserAccessToken(): Promise<boolean> {
  const token = await resolveTongsUserAccessToken();
  return Boolean(token);
}

function resolveRawTongsApiToken(): string | null {
  if (typeof window !== "undefined") {
    const fromQuery = readString(resolveFromQuery());
    if (fromQuery) return fromQuery;

    try {
      const w = window as ForgeWindow;
      const fromWindow = readString(w.__forgeTongsApiToken ?? w.__tpTongsApiToken);
      if (fromWindow) return fromWindow;
    } catch {
      // ignore
    }
  }

  // Keep this as a direct import.meta.env access so Vite substitutes the
  // configured browser credential. Aliasing import.meta prevents that
  // transform and makes the token disappear at runtime.
  const fromEnv = readString(import.meta.env?.VITE_TONGS_API_TOKEN);
  if (fromEnv) return fromEnv;

  if (typeof window !== "undefined") {
    return readLocalStorage("forge_tongs_api_token_v1");
  }

  return null;
}

export function resolveTongsApiToken(): string | undefined {
  return sanitizeTongsApiToken(resolveRawTongsApiToken()) ?? undefined;
}

export function resolveTongsRequestApiToken(): string | undefined {
  return resolveRawTongsApiToken() ?? undefined;
}

export async function tongsFetch(url: string, options: TongsFetchOptions = {}): Promise<Response> {
  const { json, headers: initHeaders, body: initBody, ...rest } = options;
  const headers = new Headers(initHeaders ?? {});
  // Keep DEV_TOKEN out of status/UI heuristics, but still send it to the local middleware in dev.
  const apiToken = resolveTongsRequestApiToken();
  const userAccessToken = await resolveTongsUserAccessToken();
  const hasAuth = Boolean(apiToken || userAccessToken);

  if (!hasAuth) {
    return new Response(JSON.stringify({
      ok: false,
      error: {
        code: "missing_tongs_auth",
        message: "Tongs auth is not configured for this browser session.",
      },
    }), {
      status: 401,
      headers: {
        "content-type": "application/json",
      },
    });
  }

  if (apiToken && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${apiToken}`);
  }
  if (userAccessToken && !headers.has("x-forge-user-authorization")) {
    headers.set("x-forge-user-authorization", `Bearer ${userAccessToken}`);
  }

  let body = initBody;
  if (json !== undefined) {
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    body = JSON.stringify(json);
  }

  return fetch(url, { ...rest, headers, body });
}
