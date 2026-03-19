import { hasSupabaseConfig, supabase } from './supabaseClient';

const SUPABASE_AUTH_STORAGE_KEY = 'forge-auth';
const SUPABASE_AUTH_KEY_RE = /^sb-[a-z0-9-]+-auth-token$/i;

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function extractAccessTokenFromAuthPayload(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const token = extractAccessTokenFromAuthPayload(entry);
      if (token) return token;
    }
    return null;
  }

  const row = value as Record<string, unknown>;
  const direct = readString(row.access_token);
  if (direct) return direct;

  const currentSession = row.currentSession;
  if (currentSession && typeof currentSession === 'object') {
    const token = readString((currentSession as Record<string, unknown>).access_token);
    if (token) return token;
  }

  const session = row.session;
  if (session && typeof session === 'object') {
    const token = readString((session as Record<string, unknown>).access_token);
    if (token) return token;
  }

  const nested = row.data;
  if (nested && typeof nested === 'object') {
    const token = extractAccessTokenFromAuthPayload(nested);
    if (token) return token;
  }

  return null;
}

function readAccessTokenFromStorageKey(key: string): string | null {
  if (typeof window === 'undefined') return null;

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  const direct = readString(raw);
  if (direct && direct !== 'null' && direct !== 'undefined' && !direct.startsWith('{') && !direct.startsWith('[')) {
    return direct;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return extractAccessTokenFromAuthPayload(parsed);
  } catch {
    return null;
  }
}

export async function resolveForgeUserAccessToken(): Promise<string | null> {
  if (typeof window !== 'undefined') {
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
  }

  if (!hasSupabaseConfig) return null;

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return readString(data.session?.access_token ?? null);
  } catch {
    return null;
  }
}

export async function appendForgeUserAuthorization(headersInit?: HeadersInit): Promise<Headers> {
  const headers = new Headers(headersInit ?? {});
  const userAccessToken = await resolveForgeUserAccessToken();
  if (userAccessToken && !headers.has('x-forge-user-authorization')) {
    headers.set('x-forge-user-authorization', `Bearer ${userAccessToken}`);
  }
  return headers;
}
