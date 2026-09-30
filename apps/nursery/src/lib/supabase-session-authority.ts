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

export type SupabaseAccessTokenResolution =
  | { ok: true; accessToken: string; source: "current" | "refreshed" }
  | { ok: false; reason: "signed_out" | "session_unavailable" | "refresh_failed" };

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

export function createCanonicalSupabaseAccessTokenAuthority(
  auth: CanonicalSupabaseAuth,
  now: () => number = () => Date.now(),
): { resolve(): Promise<SupabaseAccessTokenResolution> } {
  let pending: Promise<SupabaseAccessTokenResolution> | null = null;

  const resolve = async (): Promise<SupabaseAccessTokenResolution> => {
    if (pending) return pending;
    const current = (async () => {
      let sessionResult: SessionResult;
      try {
        sessionResult = await auth.getSession();
      } catch {
        return { ok: false, reason: "session_unavailable" } as const;
      }
      if (sessionResult.error) return { ok: false, reason: "session_unavailable" } as const;
      if (!sessionResult.data?.session) return { ok: false, reason: "signed_out" } as const;

      const currentToken = usableToken(sessionResult.data.session, now());
      if (currentToken) return { ok: true, accessToken: currentToken, source: "current" } as const;

      let refreshed: SessionResult;
      try {
        refreshed = await auth.refreshSession();
      } catch {
        return { ok: false, reason: "refresh_failed" } as const;
      }
      if (refreshed.error) return { ok: false, reason: "refresh_failed" } as const;
      const refreshedToken = usableToken(refreshed.data?.session, now());
      return refreshedToken
        ? { ok: true, accessToken: refreshedToken, source: "refreshed" } as const
        : { ok: false, reason: "refresh_failed" } as const;
    })();
    pending = current;
    try {
      return await current;
    } finally {
      if (pending === current) pending = null;
    }
  };

  return { resolve };
}

export function createCanonicalSupabaseAccessTokenResolver(
  auth: CanonicalSupabaseAuth,
  now: () => number = () => Date.now(),
): () => Promise<string | null> {
  const authority = createCanonicalSupabaseAccessTokenAuthority(auth, now);
  return async () => {
    const result = await authority.resolve();
    return result.ok ? result.accessToken : null;
  };
}
