import type { MirrorPolicy, MountRole } from "./storage/storage-contract.js";

export type ForgeAppId =
  | "nursery"
  | "anvil"
  | "hearth"
  | "barstock"
  | "hammer"
  | "quench"
  | "ledger";

export type MountTargetType = "local" | "tongs_cloud";

export type { MountRole, MirrorPolicy };

export type MountMirrorConfig = {
  enabled: boolean;
  policy?: MirrorPolicy;
  vaultKey?: string;
  hint?: string;
};

export type MountLocalConfig = {
  vaultKey?: string;
  hint?: string;
};

export type MountRegistryEntry = {
  role: MountRole;
  target: MountTargetType;
  local?: MountLocalConfig;
  mirror?: MountMirrorConfig;
  // metadata is intentionally flexible early; we'll harden later
  meta?: Record<string, unknown>;
  updatedAtIso?: string;
};

export type WorkspaceMountRegistry = {
  workspaceId: string;
  mounts: MountRegistryEntry[];
  version?: number;
  updatedAtIso?: string;
};
