import {
  createClient,
  type SupabaseClient,
  type SupabaseClientOptions,
} from "@supabase/supabase-js";
import type { Database } from "@forge/tongs";

const url =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)
  ?? (import.meta.env.VITE_SUPABASE_DATABASE_URL as string | undefined);
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const AUTH_STORAGE_KEY = "forge-auth";
// Separate key so the two clients own distinct GoTrueClient instances and
// don't trigger the "Multiple GoTrueClient detected" warning.
const TONGS_AUTH_STORAGE_KEY = "forge-auth-tongs";

const GLOBAL_KEY = "__forge_supabase_client__";
const TONGS_GLOBAL_KEY = "__forge_supabase_tongs_client__";
const TONGS_AUTH_SYNC_KEY = "__forge_supabase_tongs_auth_synced__";
export type TongsSupabaseClient = SupabaseClient<Database, "tongs", "tongs">;

const globalStore = globalThis as typeof globalThis & {
  [GLOBAL_KEY]?: SupabaseClient<Database>;
  [TONGS_GLOBAL_KEY]?: TongsSupabaseClient;
  [TONGS_AUTH_SYNC_KEY]?: boolean;
};

if (!url || !anon) {
  throw new Error("Missing VITE_SUPABASE_URL (or VITE_SUPABASE_DATABASE_URL) or VITE_SUPABASE_ANON_KEY");
}

const primaryAuthOptions = {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true, // important for password reset / invite / verify links
  storageKey: AUTH_STORAGE_KEY,
  ...(typeof window !== "undefined" ? { storage: window.localStorage } : {}),
};

const tongsAuthOptions = {
  persistSession: true,
  autoRefreshToken: false, // primary client owns refresh; tongs just follows
  detectSessionInUrl: false,
  storageKey: TONGS_AUTH_STORAGE_KEY,
  ...(typeof window !== "undefined" ? { storage: window.localStorage } : {}),
};

const existing = globalStore[GLOBAL_KEY];
const existingTongs = globalStore[TONGS_GLOBAL_KEY];

export const supabase: SupabaseClient<Database> =
  existing ??
  createClient<Database>(url, anon, {
    auth: primaryAuthOptions,
  });

const tongsOptions: SupabaseClientOptions<"tongs"> = {
  db: { schema: "tongs" },
  auth: tongsAuthOptions,
};

export const tongsSupabase: TongsSupabaseClient =
  existingTongs ?? createClient<Database, "tongs">(url, anon, tongsOptions);

globalStore[GLOBAL_KEY] = supabase as SupabaseClient<Database>;
globalStore[TONGS_GLOBAL_KEY] = tongsSupabase;

// Keep tongs client session in sync with the primary client.
// Only register the subscription once across HMR hot reloads.
if (!globalStore[TONGS_AUTH_SYNC_KEY]) {
  globalStore[TONGS_AUTH_SYNC_KEY] = true;

  // Eagerly copy whatever session the primary client already has.
  void supabase.auth.getSession().then(({ data }) => {
    const session = data?.session;
    if (session?.access_token) {
      void tongsSupabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
    }
  });

  // Stay in sync for the lifetime of this browser context.
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.access_token) {
      void tongsSupabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
    } else {
      void tongsSupabase.auth.signOut();
    }
  });
}
