import {
  createClient,
  type SupabaseClient,
  type SupabaseClientOptions,
} from "@supabase/supabase-js";
import type { Database as TongsDatabase } from "@forge/tongs";
import type { Database as NurseryDatabase } from "./supabase/database.types";

type AppDatabase = {
  __InternalSupabase: NurseryDatabase["__InternalSupabase"];
  public: NurseryDatabase["public"];
  tongs: TongsDatabase["tongs"];
};

const url =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)
  ?? (import.meta.env.VITE_SUPABASE_DATABASE_URL as string | undefined);
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const AUTH_STORAGE_KEY = "forge-auth";

const GLOBAL_KEY = "__forge_supabase_client__";
const TONGS_GLOBAL_KEY = "__forge_supabase_tongs_client__";
export type TongsSupabaseClient = SupabaseClient<TongsDatabase, "tongs", "tongs">;

const supabaseAuthLockQueues = new Map<string, Promise<void>>();

async function runWithSupabaseAuthLock<Result>(
  name: string,
  _acquireTimeout: number,
  fn: () => Promise<Result>,
): Promise<Result> {
  const previous = (supabaseAuthLockQueues.get(name) ?? Promise.resolve()).catch(() => undefined);
  let releaseCurrent: (() => void) | undefined;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const queued = previous.then(() => current);
  supabaseAuthLockQueues.set(name, queued);

  await previous;
  try {
    return await fn();
  } finally {
    if (releaseCurrent) {
      releaseCurrent();
    }
    if (supabaseAuthLockQueues.get(name) === queued) {
      supabaseAuthLockQueues.delete(name);
    }
  }
}

const globalStore = globalThis as typeof globalThis & {
  [GLOBAL_KEY]?: SupabaseClient<AppDatabase>;
  [TONGS_GLOBAL_KEY]?: TongsSupabaseClient;
};

if (!url || !anon) {
  throw new Error("Missing VITE_SUPABASE_URL (or VITE_SUPABASE_DATABASE_URL) or VITE_SUPABASE_ANON_KEY");
}

const primaryAuthOptions = {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true, // important for password reset / invite / verify links
  storageKey: AUTH_STORAGE_KEY,
  lock: runWithSupabaseAuthLock,
  ...(typeof window !== "undefined" ? { storage: window.localStorage } : {}),
};

const existing = globalStore[GLOBAL_KEY];
const existingTongs = globalStore[TONGS_GLOBAL_KEY];

export const supabase: SupabaseClient<AppDatabase> =
  existing ??
  createClient<AppDatabase>(url, anon, {
    auth: primaryAuthOptions,
  });

const tongsOptions: SupabaseClientOptions<"tongs"> = {
  db: { schema: "tongs" },
  // Share the primary client's current token without creating or persisting a
  // second GoTrue session. This prevents refresh-token races and stale copies.
  accessToken: async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  },
};

export const tongsSupabase: TongsSupabaseClient =
  existingTongs ?? createClient<TongsDatabase, "tongs">(url, anon, tongsOptions);

globalStore[GLOBAL_KEY] = supabase as SupabaseClient<AppDatabase>;
globalStore[TONGS_GLOBAL_KEY] = tongsSupabase;
