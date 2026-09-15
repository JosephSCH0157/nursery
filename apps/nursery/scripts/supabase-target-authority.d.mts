export const SUPABASE_NONPRODUCTION_ALLOWLIST_ENV: "FORGE_NONPROD_SUPABASE_PROJECT_REFS";
export function extractSupabaseProjectRef(url: string): string;
export function assertMutableSupabaseTarget(
  url: string,
  allowlistRaw: string | null | undefined,
  operation?: string,
): string;
export function normalizedSupabaseTargetKey(url: string): string;
