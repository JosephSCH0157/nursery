import { hasSupabaseConfig, supabase } from './supabaseClient';

const USER_AUTH_HEADER = 'x-forge-user-authorization';
const TONGS_PATH_PREFIX = '/tongs/';
const TOKEN_EXPIRY_SKEW_SECONDS = 5;

export class ForgeUserAuthorizationError extends Error {
  readonly code: 'AUTHENTICATED_SESSION_REQUIRED' | 'INVALID_TONGS_REQUEST_TARGET';

  constructor(code: ForgeUserAuthorizationError['code'], message: string) {
    super(message);
    this.name = 'ForgeUserAuthorizationError';
    this.code = code;
  }
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) return null;
  try {
    const normalized = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const parsed = JSON.parse(atob(padded)) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function isUsableForgeUserAccessToken(token: unknown, nowMs = Date.now()): token is string {
  const value = readString(token);
  if (!value) return false;
  const payload = decodeJwtPayload(value);
  if (!payload) return false;
  const subject = readString(payload.sub);
  const expiresAt = payload.exp;
  return Boolean(subject)
    && typeof expiresAt === 'number'
    && Number.isFinite(expiresAt)
    && expiresAt > Math.floor(nowMs / 1000) + TOKEN_EXPIRY_SKEW_SECONDS;
}

export async function resolveForgeUserAccessToken(): Promise<string | null> {
  if (!hasSupabaseConfig) return null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    const token = data.session?.access_token ?? null;
    return isUsableForgeUserAccessToken(token) ? token : null;
  } catch {
    return null;
  }
}

export async function appendForgeUserAuthorization(headersInit?: HeadersInit): Promise<Headers> {
  const headers = new Headers(headersInit ?? {});
  const userAccessToken = await resolveForgeUserAccessToken();
  if (!userAccessToken) {
    throw new ForgeUserAuthorizationError(
      'AUTHENTICATED_SESSION_REQUIRED',
      'A valid authenticated Forge session is required to access canonical Tongs data.',
    );
  }
  headers.set(USER_AUTH_HEADER, `Bearer ${userAccessToken}`);
  return headers;
}

function resolveSameOriginTongsUrl(input: string | URL): URL {
  if (typeof window === 'undefined') {
    throw new ForgeUserAuthorizationError('INVALID_TONGS_REQUEST_TARGET', 'Tongs requests require a browser origin.');
  }
  let url: URL;
  try {
    url = new URL(String(input), window.location.origin);
  } catch {
    throw new ForgeUserAuthorizationError('INVALID_TONGS_REQUEST_TARGET', 'Tongs request URL is invalid.');
  }
  if (url.origin !== window.location.origin || !url.pathname.startsWith(TONGS_PATH_PREFIX)
    || url.username || url.password) {
    throw new ForgeUserAuthorizationError(
      'INVALID_TONGS_REQUEST_TARGET',
      'Authenticated Tongs requests are restricted to the current origin and /tongs/ path.',
    );
  }
  return url;
}

export async function fetchAuthenticatedTongs(
  input: string | URL,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const url = resolveSameOriginTongsUrl(input);
  if (init.redirect && init.redirect !== 'error') {
    throw new ForgeUserAuthorizationError(
      'INVALID_TONGS_REQUEST_TARGET',
      'Authenticated Tongs requests may not follow redirects.',
    );
  }
  const headers = await appendForgeUserAuthorization(init.headers);
  return fetchImpl(url.href, {
    ...init,
    headers,
    credentials: 'same-origin',
    redirect: 'error',
  });
}
