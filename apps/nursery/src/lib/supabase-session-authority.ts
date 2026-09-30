type SessionLike = {
  access_token?: unknown;
};

type SessionResult = {
  data?: { session?: SessionLike | null } | null;
  error?: unknown;
};

export type CanonicalSupabaseAuth = {
  getSession(): Promise<SessionResult>;
  refreshSession(): Promise<SessionResult>;
};

function readToken(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function tokenExpiresAt(token: string): number | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof payload.exp === "number" && Number.isFinite(payload.exp)
      ? Math.trunc(payload.exp * 1000)
      : null;
  } catch {
    return null;
  }
}

function usableToken(session: SessionLike | null | undefined, now: number): string | null {
  const token = readToken(session?.access_token);
  if (!token) return null;
  const expiresAt = tokenExpiresAt(token);
  return expiresAt !== null && expiresAt <= now + 5_000 ? null : token;
}

export function createCanonicalSupabaseAccessTokenResolver(
  auth: CanonicalSupabaseAuth,
  now: () => number = () => Date.now(),
): () => Promise<string | null> {
  let pending: Promise<string | null> | null = null;

  return async () => {
    if (pending) return pending;
    const current = (async () => {
      let sessionResult: SessionResult;
      try {
        sessionResult = await auth.getSession();
      } catch {
        return null;
      }
      if (sessionResult.error || !sessionResult.data?.session) return null;

      const currentToken = usableToken(sessionResult.data.session, now());
      if (currentToken) return currentToken;

      let refreshed: SessionResult;
      try {
        refreshed = await auth.refreshSession();
      } catch {
        return null;
      }
      if (refreshed.error) return null;
      return usableToken(refreshed.data?.session, now());
    })();
    pending = current;
    try {
      return await current;
    } finally {
      if (pending === current) pending = null;
    }
  };
}
