type TongsEnv = { env?: Record<string, string | undefined> };

type ForgeWindow = typeof globalThis & {
    __forgeTongsApiToken?: unknown;
    __tpTongsApiToken?: unknown;
    localStorage?: {
      getItem: (key: string) => string | null;
      key: (index: number) => string | null;
      readonly length: number;
    };
    location?: {
      search?: string;
    };
  };

function getRuntimeWindow(): ForgeWindow | null {
  if (typeof globalThis !== "object" || globalThis == null) return null;
  const candidate = globalThis as ForgeWindow & { window?: unknown };
  if (!("window" in candidate)) return null;
  return candidate;
}

const SUPABASE_AUTH_STORAGE_KEY = "forge-auth";
const SUPABASE_AUTH_KEY_RE = /^sb-[a-z0-9-]+-auth-token$/i;
const PLACEHOLDER_TONGS_TOKENS = new Set(["DEV_TOKEN"]);

export type TongsFetchOptions = RequestInit & { json?: unknown; timeoutMs?: number };

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
    const runtimeWindow = getRuntimeWindow();
    if (!runtimeWindow) return null;
    return readString(runtimeWindow.localStorage?.getItem(key) ?? null);
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
    if (token) return sanitizeAccessToken(token);
  }

  return null;
}

function readAccessTokenFromStorageKey(key: string): string | null {
  const runtimeWindow = getRuntimeWindow();
  if (!runtimeWindow) return null;
  let raw: string | null = null;
  try {
    raw = runtimeWindow.localStorage?.getItem(key) ?? null;
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
    return sanitizeAccessToken(extractAccessTokenFromAuthPayload(parsed));
  } catch {
    return null;
  }
}

function resolveUserAccessTokenFromStorage(): string | null {
  const runtimeWindow = getRuntimeWindow();
  if (!runtimeWindow) return null;
  const primary = readAccessTokenFromStorageKey(SUPABASE_AUTH_STORAGE_KEY);
  if (primary) return primary;

  try {
    const storageLength = runtimeWindow.localStorage?.length ?? 0;
    for (let index = 0; index < storageLength; index += 1) {
      const key = runtimeWindow.localStorage?.key(index) ?? null;
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
  const runtimeWindow = getRuntimeWindow() as (ForgeWindow & {
    __forge_supabase_client__?: {
      auth?: {
        getSession?: () => Promise<unknown>;
      };
    };
    __forge_supabase_tongs_client__?: {
      auth?: {
        getSession?: () => Promise<unknown>;
      };
    };
  }) | null;
  if (!runtimeWindow) return null;

  const getSessionCandidates = [
    runtimeWindow.__forge_supabase_client__?.auth?.getSession,
    runtimeWindow.__forge_supabase_tongs_client__?.auth?.getSession,
  ];

  for (const getSession of getSessionCandidates) {
    if (typeof getSession !== "function") continue;
    try {
      const sessionPayload = await getSession();
      const token = sanitizeAccessToken(extractAccessTokenFromAuthPayload(sessionPayload));
      if (token) return token;
    } catch {
      // keep trying other candidates
    }
  }

  return null;
}

export async function hasTongsUserAccessToken(): Promise<boolean> {
  return Boolean(await resolveUserAccessToken());
}

function resolveFromQuery(): string | null {
  try {
    const runtimeWindow = getRuntimeWindow();
    if (!runtimeWindow) return null;
    const params = new URLSearchParams(runtimeWindow.location?.search ?? "");
    return readString(params.get("tongs_api_token") ?? params.get("tongsApiToken"));
  } catch {
    return null;
  }
}

function resolveRawTongsApiToken(): string | null {
  const runtimeWindow = getRuntimeWindow();
  if (runtimeWindow) {
    const fromQuery = resolveFromQuery();
    if (fromQuery) return fromQuery;

    try {
      const fromWindow = readString(runtimeWindow.__forgeTongsApiToken ?? runtimeWindow.__tpTongsApiToken);
      if (fromWindow) return fromWindow;
    } catch {
      // ignore
    }
  }

  const metaEnv = import.meta as unknown as TongsEnv;
  const fromEnv = readString(metaEnv.env?.VITE_TONGS_API_TOKEN);
  if (fromEnv) return fromEnv;

  if (runtimeWindow) {
    return readLocalStorage("forge_tongs_api_token_v1");
  }

  return null;
}

export async function tongsFetch(url: string, options: TongsFetchOptions = {}): Promise<Response> {

  const { json, headers: initHeaders, body: initBody, timeoutMs, signal: initSignal, ...rest } = options;
  const headers = new Headers(initHeaders ?? {});
  const apiToken = resolveRawTongsApiToken();
  const userAccessToken = await resolveUserAccessToken();
  const method = (rest.method || "GET").toUpperCase();

  // Always require a user access token for Tongs requests
  if (!userAccessToken) {
    // eslint-disable-next-line no-console
    console.error("[tongsFetch] BLOCKED: No user access token for outgoing Tongs request", {
      method,
      url,
      apiTokenPresent: Boolean(apiToken),
      userAccessTokenPresent: false,
    });
    throw new Error(
      `[tongsFetch] BLOCKED: Refusing to send unauthenticated Tongs request. Method: ${method}, URL: ${url}`
    );
  }

  // Attach tokens deterministically
  if (apiToken) {
    headers.set("authorization", `Bearer ${apiToken}`);
  }
  if (userAccessToken) {
    headers.set("x-forge-user-authorization", `Bearer ${userAccessToken}`);
    headers.set("x-forge-user-token", userAccessToken);
  }

  // Log outgoing request (presence only)
  // eslint-disable-next-line no-console
  console.info("[tongsFetch] outgoing", {
    method,
    url,
    hasAuthHeader: headers.has("authorization"),
    hasUserAuthHeader: headers.has("x-forge-user-authorization"),
    apiTokenPresent: Boolean(apiToken),
    userAccessTokenPresent: Boolean(userAccessToken),
  });

  let body = initBody;
  if (json !== undefined) {
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    body = JSON.stringify(json);
  }

  if (!timeoutMs && !initSignal) {
    return fetch(url, { ...rest, headers, body });
  }

  const abortController = new AbortController();
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const onAbort = () => abortController.abort();

  if (initSignal) {
    if (initSignal.aborted) {
      abortController.abort();
    } else {
      initSignal.addEventListener("abort", onAbort, { once: true });
    }
  }
  if (timeoutMs && timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      timedOut = true;
      abortController.abort();
    }, timeoutMs);
  }

  try {
    return await fetch(url, { ...rest, headers, body, signal: abortController.signal });
  } catch (error) {
    if (timedOut) {
      throw new Error(`Tongs request timed out after ${Math.ceil(timeoutMs! / 1000)} seconds.`);
    }
    throw error;
  } finally {
    if (timeoutId != null) {
      clearTimeout(timeoutId);
    }
    if (initSignal) {
      initSignal.removeEventListener("abort", onAbort);
    }
  }
}

export function resolveTongsApiToken(): string | undefined {
  return sanitizeTongsApiToken(resolveRawTongsApiToken()) ?? undefined;
}
