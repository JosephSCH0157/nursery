import {
  assertMutableSupabaseTarget,
  normalizedSupabaseTargetKey,
} from "./supabase-target-authority.mjs";

export const WORKPIECE_JOB_RUNNER_ENABLE_ENV = "FORGE_ENABLE_WORKPIECE_JOB_RUNNER";

export type WorkpieceJobRunnerAuthority =
  | { enabled: false }
  | { enabled: true; projectRef: string; targetKey: string };

export function resolveWorkpieceJobRunnerAuthority(
  env: Record<string, string | undefined>,
  supabaseUrl: string,
): WorkpieceJobRunnerAuthority {
  if (env[WORKPIECE_JOB_RUNNER_ENABLE_ENV] !== "1") return { enabled: false };
  const projectRef = assertMutableSupabaseTarget(
    supabaseUrl,
    env.FORGE_NONPROD_SUPABASE_PROJECT_REFS,
    "Nursery Vite workpiece job-runner startup",
  );
  return {
    enabled: true,
    projectRef,
    targetKey: normalizedSupabaseTargetKey(supabaseUrl),
  };
}
