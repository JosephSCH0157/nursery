type TongsEnv = { env?: Record<string, string | undefined> };

type ForgeWindow = Window &
  typeof globalThis & {
    __forgeTongsApiToken?: unknown;
    __tpTongsApiToken?: unknown;
  };

export type TongsFetchOptions = RequestInit & { json?: unknown };

console.log("[tongsFetch] VITE_TONGS_API_TOKEN =", (import.meta as any).env?.VITE_TONGS_API_TOKEN);

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

  if (apiToken && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${apiToken}`);
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
