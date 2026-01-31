import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type ForgeSupabaseClient = SupabaseClient<any, any, any, any>;

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const GLOBAL_KEY = "__forge_supabase_client__";
const globalStore = globalThis as typeof globalThis & {
  [GLOBAL_KEY]?: ForgeSupabaseClient;
};

const existing = globalStore[GLOBAL_KEY];

let client: ForgeSupabaseClient | undefined;
if (existing) {
  client = existing;
} else if (url && anon) {
  client = createClient(url, anon, {
    db: { schema: "tongs" },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  globalStore[GLOBAL_KEY] = client;
}

export const supabaseAvailable = !!client;
export const supabase = client;
