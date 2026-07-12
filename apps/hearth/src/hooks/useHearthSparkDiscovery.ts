import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { BarStockSpark } from "../lib/barstock-sparks";
import { isBarStockKey } from "../lib/barstock-sparks";
import { listHearthBarStockSparks } from "../lib/hearth-barstock-sparks";
import { describeHearthDependencyFailure } from "../lib/hearth-dependency-state";

type UseHearthSparkDiscoveryArgs = {
  workspaceId: string | null;
  normalizeUuid: (value: string | null | undefined) => string | null;
  setSparks: Dispatch<SetStateAction<BarStockSpark[]>>;
  setSparkDiscoveryWorkspaceId: Dispatch<SetStateAction<string | null>>;
  setIsSparksLoading: Dispatch<SetStateAction<boolean>>;
  setSparkDiscoveryError: Dispatch<SetStateAction<string | null>>;
};

export function useHearthSparkDiscovery(args: UseHearthSparkDiscoveryArgs) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const refresh = async () => {
      const normalizedWorkspaceId = args.normalizeUuid(args.workspaceId);
      if (!normalizedWorkspaceId) {
        if (!cancelled) {
          args.setSparks([]);
          args.setSparkDiscoveryWorkspaceId(null);
          args.setIsSparksLoading(false);
          args.setSparkDiscoveryError(null);
        }
        return;
      }

      if (!cancelled) {
        args.setIsSparksLoading(true);
        args.setSparkDiscoveryError(null);
      }
      try {
        const remote = await listHearthBarStockSparks(normalizedWorkspaceId);
        if (cancelled) return;
        args.setSparks(remote);
        args.setSparkDiscoveryWorkspaceId(normalizedWorkspaceId);
      } catch (error) {
        if (cancelled) return;
        args.setSparks([]);
        args.setSparkDiscoveryWorkspaceId(null);
        args.setSparkDiscoveryError(describeHearthDependencyFailure(
          error,
          "Bar Stock spark discovery is currently unavailable.",
        ));
      } finally {
        if (!cancelled) {
          args.setIsSparksLoading(false);
        }
      }
    };

    void refresh();
    const onStorage = (event: StorageEvent) => {
      if (!isBarStockKey(event.key, args.workspaceId)) return;
      void refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
    };
  }, [
    args.normalizeUuid,
    args.setIsSparksLoading,
    args.setSparkDiscoveryWorkspaceId,
    args.setSparkDiscoveryError,
    args.setSparks,
    args.workspaceId,
  ]);
}
