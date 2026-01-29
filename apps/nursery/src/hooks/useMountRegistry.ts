import { useCallback, useEffect, useState } from "react";
import type { MountRole, MountTargetType, WorkspaceMountRegistry } from "@forge/tongs";
import { getMount, loadMountRegistry } from "../lib/mount-registry";
import type { LoadResult } from "../lib/mount-registry";

const DEFAULT_WORKSPACE_ID = "default";

export type UseMountRegistry = {
  registry: WorkspaceMountRegistry | null;
  getTarget: (role: MountRole) => MountTargetType;
  reload: () => LoadResult;
};

export function useMountRegistry(): UseMountRegistry {
  const [registry, setRegistry] = useState<WorkspaceMountRegistry | null>(null);

  const reload = useCallback(() => {
    const res = loadMountRegistry(DEFAULT_WORKSPACE_ID);
    setRegistry(res.registry);
    return res;
  }, []);

  const getTarget = useCallback(
    (role: MountRole) => getMount(registry, role).target,
    [registry],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  return { registry, getTarget, reload };
}

