import type { ForgeAppId } from "./types.js";

export const FORGE_APP_IDS: readonly ForgeAppId[] = [
  "nursery",
  "anvil",
  "hearth",
  "barstock",
  "hammer",
  "quench",
  "ledger",
] as const;

// Auth / tier flags (canonical spellings)
export const TIER_FLAG_FOUNDERS_CLUB = "Founders_club" as const;
