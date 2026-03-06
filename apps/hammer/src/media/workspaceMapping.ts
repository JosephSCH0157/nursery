import type { WorkspaceMediaMapping } from "../../../../packages/contracts/hammer/media-resolver.contract";

export interface WorkspaceMappingSource {
  getWorkspaceMediaMapping(workspaceId: string): Promise<WorkspaceMediaMapping | null>;
}

type UnknownRecord = Record<string, unknown>;

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeWorkspaceMapping(input: unknown): WorkspaceMediaMapping | null {
  if (!input || typeof input !== "object") return null;
  const row = input as UnknownRecord;
  const workspaceId = normalizeString(row.workspace_id);
  const localRootAbs = normalizeString(row.local_root_abs);
  if (!workspaceId || !localRootAbs) return null;
  const machineId = normalizeString(row.machine_id) || undefined;
  return {
    workspace_id: workspaceId,
    local_root_abs: localRootAbs,
    ...(machineId ? { machine_id: machineId } : {}),
  };
}

/**
 * In-app fallback source for local runtime wiring.
 * Expected shape:
 * window.__forgeWorkspaceMediaMappings = {
 *   "<workspace_id>": { workspace_id, local_root_abs, machine_id? }
 * }
 */
function loadWorkspaceMappingFromWindow(workspaceId: string): WorkspaceMediaMapping | null {
  if (typeof window === "undefined") return null;
  try {
    const w = window as unknown as { __forgeWorkspaceMediaMappings?: unknown };
    const index = w.__forgeWorkspaceMediaMappings;
    if (!index || typeof index !== "object") return null;
    const row = (index as UnknownRecord)[workspaceId];
    return normalizeWorkspaceMapping(row);
  } catch {
    return null;
  }
}

export async function loadWorkspaceMapping(
  workspaceId: string,
  source?: WorkspaceMappingSource,
): Promise<WorkspaceMediaMapping | null> {
  const normalizedWorkspaceId = normalizeString(workspaceId);
  if (!normalizedWorkspaceId) return null;

  if (source) {
    try {
      const resolved = await source.getWorkspaceMediaMapping(normalizedWorkspaceId);
      return normalizeWorkspaceMapping(resolved);
    } catch {
      // Fall through to local runtime fallback source.
    }
  }

  return loadWorkspaceMappingFromWindow(normalizedWorkspaceId);
}

