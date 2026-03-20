import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@forge/tongs";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const AUTH_STORAGE_KEY = "forge-auth";

const GLOBAL_KEY = "__forge_supabase_client__";
const TONGS_GLOBAL_KEY = "__forge_supabase_tongs_client__";
const globalStore = globalThis as typeof globalThis & {
  [GLOBAL_KEY]?: SupabaseClient<Database>;
  [TONGS_GLOBAL_KEY]?: SupabaseClient<Database>;
};

if (!url || !anon) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}

const sharedAuthOptions = {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true, // important for password reset / invite / verify links
  storageKey: AUTH_STORAGE_KEY,
  ...(typeof window !== "undefined" ? { storage: window.localStorage } : {}),
};

const existing = globalStore[GLOBAL_KEY];
const existingTongs = globalStore[TONGS_GLOBAL_KEY];

export const supabase: SupabaseClient<Database> =
  existing ??
  createClient<Database>(url, anon, {
    auth: sharedAuthOptions,
  });

const resolvedTongsClient = existingTongs ?? supabase.schema("tongs");
export const tongsSupabase: SupabaseClient<Database> = resolvedTongsClient;

globalStore[GLOBAL_KEY] = supabase as SupabaseClient<Database>;
globalStore[TONGS_GLOBAL_KEY] = resolvedTongsClient as SupabaseClient<Database>;
