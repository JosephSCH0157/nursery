type TongsEnv = { env?: Record<string, string | undefined> };

type ForgeWindow = Window &
  typeof globalThis & {
    __forgeTongsApiToken?: unknown;
    __tpTongsApiToken?: unknown;
  };

const SUPABASE_AUTH_STORAGE_KEY = "forge-auth";
const SUPABASE_AUTH_KEY_RE = /^sb-[a-z0-9-]+-auth-token$/i;

export type TongsFetchOptions = RequestInit & { json?: unknown };

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
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
    // ignore storage errors
  }

  return null;
}

async function resolveUserAccessToken(): Promise<string | null> {
  const fromStorage = resolveUserAccessTokenFromStorage();
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

function resolveFromQuery(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    return readString(params.get("tongs_api_token") ?? params.get("tongsApiToken"));
  } catch {
    return null;
  }
}

export function resolveTongsApiToken(): string | undefined {
  if (typeof window !== "undefined") {
    const fromQuery = resolveFromQuery();
    if (fromQuery) return fromQuery;

    try {
      const w = window as ForgeWindow;
      const fromWindow = readString(w.__forgeTongsApiToken ?? w.__tpTongsApiToken);
      if (fromWindow) return fromWindow;
    } catch {
      // ignore
    }
  }

  const metaEnv = import.meta as unknown as TongsEnv;
  const fromEnv = readString(metaEnv.env?.VITE_TONGS_API_TOKEN);
  if (fromEnv) return fromEnv;

  if (typeof window !== "undefined") {
    return readLocalStorage("forge_tongs_api_token_v1") ?? undefined;
  }

  return undefined;
}

export async function tongsFetch(url: string, options: TongsFetchOptions = {}): Promise<Response> {
  const { json, headers: initHeaders, body: initBody, ...rest } = options;
  const headers = new Headers(initHeaders ?? {});
  const apiToken = resolveTongsApiToken();
  const userAccessToken = await resolveUserAccessToken();

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
