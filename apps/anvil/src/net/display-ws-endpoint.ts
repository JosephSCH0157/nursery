const DEFAULT_DISPLAY_WS_BASE = 'wss://wtvdjndyxegudufrompx.functions.supabase.co/display-ws';

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveConfiguredBase(): string {
  const w = typeof window !== 'undefined' ? (window as any) : {};
  const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env || {} : {};
  return (
    readString(w.__TP_DISPLAY_WS_URL) ||
    readString(metaEnv.VITE_DISPLAY_WS_URL) ||
    DEFAULT_DISPLAY_WS_BASE
  );
}

function normalizeWsBase(candidate: string): string | null {
  try {
    const url = new URL(candidate);
    const protocol = url.protocol.toLowerCase();
    if (protocol === 'https:') {
      url.protocol = 'wss:';
    } else if (protocol === 'http:') {
      url.protocol = 'ws:';
    } else if (protocol !== 'ws:' && protocol !== 'wss:') {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function resolveDisplayWsBase(): string {
  return normalizeWsBase(resolveConfiguredBase()) || DEFAULT_DISPLAY_WS_BASE;
}

export function buildDisplayWsUrl(pairToken: unknown): string | null {
  const token = readString(pairToken);
  if (!token) return null;
  try {
    const url = new URL(resolveDisplayWsBase());
    url.searchParams.set('pair', token);
    return url.toString();
  } catch {
    return null;
  }
}

export { DEFAULT_DISPLAY_WS_BASE };
