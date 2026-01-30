import { useCallback, useMemo, useReducer } from "react";
import type { MountRole, ResolvedMount, WorkspaceMountRegistry } from "@forge/tongs";
import { loadMountRegistry, resolveMount as resolveMountFromRegistry } from "../lib/mount-registry";

type UseMountRegistryResult = {
  registry: WorkspaceMountRegistry | null;
  seeded: boolean;
  issues: unknown | null;
  reload: () => void;
  resolveMount: (role: MountRole) => ResolvedMount;
};

export function useMountRegistry(workspaceId = "default"): UseMountRegistryResult {
  const [reloadToken, bumpReload] = useReducer((value) => value + 1, 0);

  const snapshot = useMemo(() => {
    void reloadToken;
    const res = loadMountRegistry(workspaceId);
    return {
      registry: res.registry,
      seeded: res.seeded,
      issues: res.ok ? null : res.issues,
    };
  }, [workspaceId, reloadToken]);

  const reload = useCallback(() => {
    bumpReload();
  }, []);

  const resolveMount = useCallback(
    (role: MountRole): ResolvedMount => resolveMountFromRegistry(snapshot.registry, role),
    [snapshot.registry],
  );

  return useMemo(
    () => ({
      registry: snapshot.registry,
      seeded: snapshot.seeded,
      issues: snapshot.issues,
      reload,
      resolveMount,
    }),
    [snapshot, reload, resolveMount],
  );
}
