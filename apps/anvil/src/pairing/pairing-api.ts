type PairQrPayload = {
  token: string;
  expiresAt: string;
  pairUrl: string;
  qrSvg: string;
};

type PairQrOpts = {
  baseUrl: string;
  pairPath?: string;
  ttlMinutes?: number;
  metadata?: Record<string, unknown>;
};

const w = typeof window !== 'undefined' ? (window as any) : {};
const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env || {} : {};
const DEFAULT_PAIR_QR_URL = 'https://wtvdjndyxegudufrompx.functions.supabase.co/pair-qr';

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeBaseUrl(input: string): string | null {
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

const PAIR_QR_URL =
  readString(w.__TP_PAIR_QR_URL) ||
  readString(metaEnv.VITE_PAIR_QR_URL) ||
  DEFAULT_PAIR_QR_URL;
const SUPABASE_ANON_KEY =
  readString(w.__forgeSupabaseAnonKey) ||
  readString(metaEnv.VITE_SUPABASE_ANON_KEY) ||
  '';
const PAIR_BASE_URL_OVERRIDE =
  readString(w.__TP_PAIR_BASE_URL) ||
  readString(metaEnv.VITE_PAIR_BASE_URL) ||
  null;

const DEFAULT_PAIR_PATH = '/display.html';
const DEFAULT_TTL_MINUTES = Number(w.__TP_PAIR_QR_TTL_MINUTES ?? metaEnv.VITE_PAIR_QR_TTL_MINUTES ?? 10);
const DEFAULT_METADATA =
  typeof w.__TP_PAIR_QR_METADATA === 'object' && w.__TP_PAIR_QR_METADATA !== null
    ? { ...w.__TP_PAIR_QR_METADATA }
    : { role: 'display', app: 'anvil' };

export async function requestPairQr(opts: PairQrOpts): Promise<PairQrPayload> {
  if (!PAIR_QR_URL) {
    throw new Error('Pairing endpoint unavailable (configure __TP_PAIR_QR_URL or VITE_PAIR_QR_URL).');
  }

  const pairPath = (opts.pairPath || DEFAULT_PAIR_PATH).trim() || DEFAULT_PAIR_PATH;
  const ttlMinutes =
    Number.isFinite(opts.ttlMinutes ?? DEFAULT_TTL_MINUTES) && (opts.ttlMinutes ?? DEFAULT_TTL_MINUTES) > 0
      ? opts.ttlMinutes ?? DEFAULT_TTL_MINUTES
      : DEFAULT_TTL_MINUTES;

  const payload = {
    baseUrl: opts.baseUrl,
    pairPath,
    ttlMinutes,
    metadata: opts.metadata || DEFAULT_METADATA,
  };

  const res = await fetch(PAIR_QR_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(SUPABASE_ANON_KEY
        ? {
            apikey: String(SUPABASE_ANON_KEY),
            Authorization: `Bearer ${String(SUPABASE_ANON_KEY)}`,
          }
        : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const parsed = await res.json();
      detail = parsed?.error ? `: ${parsed.error}` : '';
    } catch {
      // ignore
    }
    throw new Error(`Failed to create pairing session${detail}`);
  }

  const json = await res.json();
  if (!json || typeof json !== 'object') {
    throw new Error('Invalid pairing response');
  }

  return {
    token: String(json.token ?? ''),
    pairUrl: String(json.pairUrl ?? ''),
    qrSvg: String(json.qrSvg ?? ''),
    expiresAt: String(json.expiresAt ?? ''),
  };
}

export function pairingApiUrl(): string {
  return PAIR_QR_URL;
}

export function resolvePairBaseUrl(fallbackBaseUrl?: string): string {
  const override = PAIR_BASE_URL_OVERRIDE ? normalizeBaseUrl(PAIR_BASE_URL_OVERRIDE) : null;
  if (override) return override;
  const fallback = fallbackBaseUrl ? normalizeBaseUrl(fallbackBaseUrl) : null;
  if (fallback) return fallback;
  const runtime = typeof window !== 'undefined' ? normalizeBaseUrl(window.location.origin) : null;
  return runtime || 'http://localhost:5173';
}

export type { PairQrPayload };
