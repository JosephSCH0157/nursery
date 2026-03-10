const TONGS_REQUEST_TOKEN_KEY = "forge_tongs_api_token_v1";

type ForgeWindow = Window &
  typeof globalThis & {
    __forgeTongsApiToken?: unknown;
    __tpTongsApiToken?: unknown;
  };

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

function resolveTokenFromEnv(): string | null {
  return readString((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_TONGS_API_TOKEN);
}

function resolveTongsRequestToken(): string | null {
  const fromQuery = resolveTokenFromQuery();
  if (fromQuery) return fromQuery;

  const fromEnv = resolveTokenFromEnv();
  if (fromEnv) return fromEnv;

  if (typeof window === "undefined") return null;
  try {
    return readString(window.localStorage.getItem(TONGS_REQUEST_TOKEN_KEY));
  } catch {
    return null;
  }
}

export function seedTongsRequestTokenBridge(): void {
  if (typeof window === "undefined") return;
  const token = resolveTongsRequestToken();
  if (!token) return;

  try {
    const w = window as ForgeWindow;
    w.__forgeTongsApiToken = token;
    w.__tpTongsApiToken = token;
  } catch {
    // ignore global bridge failures
  }

  try {
    window.localStorage.setItem(TONGS_REQUEST_TOKEN_KEY, token);
  } catch {
    // ignore storage failures
  }
}
