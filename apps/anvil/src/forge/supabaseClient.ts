// src/forge/supabaseClient.ts
// Shared Supabase client for Forge / Anvil surfaces.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function readMetaEnv(): Record<string, unknown> {
  try {
    // Avoid direct `import.meta` syntax so CommonJS test transforms can parse this file.
    const env = (0, eval)('import.meta.env');
    if (env && typeof env === 'object') {
      return env as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return {};
}

// Prefer window-provided values; fall back to import-meta env if available.
const w = (typeof window !== 'undefined' ? (window as any) : {}) as any;
const metaEnv = readMetaEnv();

const SUPABASE_URL: string =
  w.__forgeSupabaseUrl ||
  metaEnv.VITE_SUPABASE_URL ||
  '';

const SUPABASE_ANON_KEY: string =
  w.__forgeSupabaseAnonKey ||
  metaEnv.VITE_SUPABASE_ANON_KEY ||
  '';
const AUTH_STORAGE_KEY = 'forge-auth';

export let hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

function createSupabaseStub(reason: string): SupabaseClient {
  const noopError = { message: reason };
  const noopSubscription = { unsubscribe() {} };
  const noopResponse = Promise.resolve({ data: null, error: noopError });
  const authStub = {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: noopSubscription }, error: null }),
    signOut: async () => ({ error: null }),
  };
  const noopChain = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') return undefined;
      return () => noopResponse;
    },
  });
  const base: Record<string, unknown> = {
    auth: authStub,
    from: () => noopChain,
    rpc: () => noopResponse,
    schema: () => ({ rpc: () => noopResponse }),
  };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop) {
      if (typeof prop === 'string' && prop in target) return target[prop];
      if (typeof prop === 'symbol') return (target as any)[prop];
      return () => noopResponse;
    },
  };
  return new Proxy(base, handler) as unknown as SupabaseClient;
}

if (!hasSupabaseConfig) {
  try { console.error('[supabaseClient] Missing Supabase URL or anon key.'); } catch {}
}

let supabaseClient: SupabaseClient | null = null;

if (hasSupabaseConfig) {
  try {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: AUTH_STORAGE_KEY,
        ...(typeof window !== 'undefined' ? { storage: window.localStorage } : {}),
      },
    });
  } catch (err) {
    hasSupabaseConfig = false;
    try { console.error('[supabaseClient] Failed to init Supabase client.', err); } catch {}
  }
}

export const supabase: SupabaseClient =
  supabaseClient || createSupabaseStub('[supabaseClient] Supabase not configured.');
