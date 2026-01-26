import type { WorkspaceMountRegistry } from "./types";

export function buildDefaultRegistry(workspaceId: string): WorkspaceMountRegistry {
  return {
    workspaceId,
    mounts: [
      { role: "scripts", target: "local" },
      { role: "recordings", target: "local" },
      { role: "exports", target: "local" },
      { role: "assets", target: "local" },
      { role: "projects", target: "local" },
    ],
  };
}
