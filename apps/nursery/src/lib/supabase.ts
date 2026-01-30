import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const GLOBAL_KEY = "__forge_supabase_client__";
const globalStore = globalThis as typeof globalThis & {
  [GLOBAL_KEY]?: SupabaseClient;
};

if (!url || !anon) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}

const existing = globalStore[GLOBAL_KEY];

export const supabase =
  existing ??
  createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true, // important for password reset / invite / verify links
    },
  });

globalStore[GLOBAL_KEY] = supabase;
