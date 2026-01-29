import { useCallback, useEffect, useMemo, useState } from "react";
import type { MountRole, MountTargetType, WorkspaceMountRegistry } from "@forge/tongs";
import { loadMountRegistry } from "../lib/mount-registry";

type UseMountRegistryResult = {
  registry: WorkspaceMountRegistry | null;
  seeded: boolean;
  issues: unknown | null;
  reload: () => void;
  getTarget: (role: MountRole) => MountTargetType;
  getMeta: (role: MountRole) => Record<string, unknown> | undefined;
};

export function useMountRegistry(workspaceId = "default"): UseMountRegistryResult {
  const [registry, setRegistry] = useState<WorkspaceMountRegistry | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [issues, setIssues] = useState<unknown | null>(null);

  const reload = useCallback(() => {
    const res = loadMountRegistry(workspaceId);
    setRegistry(res.registry);
    setSeeded(res.seeded);
    setIssues(res.ok ? null : res.issues);
  }, [workspaceId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const getTarget = useCallback(
    (role: MountRole): MountTargetType => {
      const mounts = registry?.mounts ?? [];
      const found = mounts.find((m) => m.role === role);
      return (found?.target as MountTargetType) ?? "local";
    },
    [registry],
  );

  const getMeta = useCallback(
    (role: MountRole): Record<string, unknown> | undefined => {
      const mounts = registry?.mounts ?? [];
      const found = mounts.find((m) => m.role === role);
      return found?.meta as Record<string, unknown> | undefined;
    },
    [registry],
  );

  return useMemo(
    () => ({ registry, seeded, issues, reload, getTarget, getMeta }),
    [registry, seeded, issues, reload, getTarget, getMeta],
  );
}
