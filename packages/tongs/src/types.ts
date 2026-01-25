export type ForgeAppId =
  | "nursery"
  | "anvil"
  | "hearth"
  | "barstock"
  | "hammer"
  | "quench"
  | "ledger";

export type MountTargetType = "local" | "tongs_cloud";

export type MountRole =
  | "scripts"
  | "recordings"
  | "exports"
  | "assets"
  | "projects";

export type MountRegistryEntry = {
  role: MountRole;
  target: MountTargetType;
  // metadata is intentionally flexible early; we’ll harden later
  meta?: Record<string, unknown>;
  updatedAtIso?: string;
};

export type WorkspaceMountRegistry = {
  workspaceId: string;
  mounts: MountRegistryEntry[];
  updatedAtIso?: string;
};
