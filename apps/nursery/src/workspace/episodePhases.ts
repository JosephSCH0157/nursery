/**
 * Episode phase model — display only.
 * This enum represents the user-visible lifecycle stage of an episode.
 * It is NEVER used as canonical persistence; Tongs remains the SSOT.
 */

export type EpisodePhase = "script" | "record" | "edit" | "release" | "analytics";

export const EPISODE_PHASE_LABELS: Record<EpisodePhase, string> = {
  script: "Scripting",
  record: "Recording",
  edit: "Editing",
  release: "Release",
  analytics: "Analytics",
};

/** Forge tools that map to phases. Display-only mapping — never used for writes. */
export type ForgeTool = "hearth" | "anvil" | "hammer" | "quench" | "ledger";

export const TOOL_PHASE_MAP: Record<ForgeTool, EpisodePhase> = {
  hearth: "script",
  anvil: "record",
  hammer: "edit",
  quench: "release",
  ledger: "analytics",
};

export const PHASE_TOOL_MAP: Record<EpisodePhase, ForgeTool> = {
  script: "hearth",
  record: "anvil",
  edit: "hammer",
  release: "quench",
  analytics: "ledger",
};

/** Infer the current phase from a URL pathname. Falls back to "script". */
export function resolvePhaseFromPathname(pathname: string): EpisodePhase {
  if (pathname.startsWith("/apps/hearth") || pathname.startsWith("/app/hearth")) return "script";
  if (pathname.startsWith("/app/anvil")) return "record";
  if (pathname.startsWith("/app/hammer")) return "edit";
  if (pathname.startsWith("/app/quench")) return "release";
  if (pathname.startsWith("/app/ledger")) return "analytics";
  return "script";
}
