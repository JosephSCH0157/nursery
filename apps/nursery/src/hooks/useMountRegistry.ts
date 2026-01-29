import { useCallback, useMemo, useReducer } from "react";
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

  const getTarget = useCallback(
    (role: MountRole): MountTargetType => {
      const mounts = snapshot.registry?.mounts ?? [];
      const found = mounts.find((m) => m.role === role);
      return (found?.target as MountTargetType) ?? "local";
    },
    [snapshot.registry],
  );

  const getMeta = useCallback(
    (role: MountRole): Record<string, unknown> | undefined => {
      const mounts = snapshot.registry?.mounts ?? [];
      const found = mounts.find((m) => m.role === role);
      return found?.meta as Record<string, unknown> | undefined;
    },
    [snapshot.registry],
  );

  return useMemo(
    () => ({
      registry: snapshot.registry,
      seeded: snapshot.seeded,
      issues: snapshot.issues,
      reload,
      getTarget,
      getMeta,
    }),
    [snapshot, reload, getTarget, getMeta],
  );
}
