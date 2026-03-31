import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Draft } from "../domain/draft";
import type { BarStockSpark } from "../lib/barstock-sparks";
import { isCanonicalSparkDiscoveryResolved, resolveCanonicalSparkIntakeError } from "../lib/hearth-barstock-sparks";
import { resolveBarStockSparkHearthWorkpieceId } from "../lib/barstock-sparks";
import { readBarstockProjectContext, upsertBarstockProjectEpisodeLink } from "../lib/barstock-project-links";
import type { WorkpieceWorkspaceTab } from "../lib/hearth-workpiece-tab-shell";

type HearthMode = "sparks" | "episodes" | "ready" | "series" | "focus";

type UseHearthIntakeLifecycleArgs = {
  routeProjectId: string | null;
  routeSparkId: string | null;
  workspaceId: string | null;
  sparkDiscoveryWorkspaceId: string | null;
  isSparksLoading: boolean;
  routeSpark: BarStockSpark | null;
  projectIntakeHandledRef: MutableRefObject<string | null>;
  sparkIntakeHandledRef: MutableRefObject<string | null>;
  resolveWorkspaceId: () => string | null;
  readPendingProjectWorkpieceId: (workspaceId: string, projectId: string) => string | null;
  writePendingProjectWorkpieceId: (workspaceId: string, projectId: string, workpieceId: string | null) => void;
  createProjectWorkpiece: (title: string) => Promise<{ ok: boolean; workpieceId?: string }>;
  openWorkpieceInFocus: (
    targetWorkpieceId: string,
    options?: {
      workspaceId?: string | null;
      preferredDraftId?: string | null;
      preferredWorkspaceTab?: WorkpieceWorkspaceTab;
      preferredEditorPanel?: "script" | "manual" | null;
    },
  ) => Promise<Draft | null>;
  forgeSpark: (spark: BarStockSpark) => Promise<void> | void;
  setIsForging: Dispatch<SetStateAction<boolean>>;
  setForgeError: Dispatch<SetStateAction<string | null>>;
  setRouteProjectTitle: Dispatch<SetStateAction<string | null>>;
  setWorkspaceId: Dispatch<SetStateAction<string | null>>;
  setWorkpieceId: Dispatch<SetStateAction<string | null>>;
  setSelectedSparkId: Dispatch<SetStateAction<string | null>>;
  setMode: Dispatch<SetStateAction<HearthMode>>;
};

function isSparkForged(spark: BarStockSpark): boolean {
  return spark.status === "forged" || spark.status === "graduated" || spark.status === "archived";
}

export function useHearthIntakeLifecycle(args: UseHearthIntakeLifecycleArgs) {
  useEffect(() => {
    if (!args.routeProjectId) return;
    if (args.projectIntakeHandledRef.current === args.routeProjectId) return;

    const workspace = args.workspaceId ?? args.resolveWorkspaceId();
    if (!workspace) {
      args.setForgeError("Project intake requires workspace_id.");
      return;
    }

    let cancelled = false;
    args.setIsForging(true);
    args.setForgeError(null);

    void (async () => {
      const context = await readBarstockProjectContext({
        workspaceId: workspace,
        projectId: args.routeProjectId!,
      });
      if (cancelled) return;

      if (context.error) {
        console.warn("[hearth-project-intake] context lookup issue", context.error);
        args.setForgeError("Unable to resolve this Project in Tongs. Sync Bar Stock, then retry.");
        return;
      }

      const projectTitle = context.projectTitle?.trim() || null;
      args.setRouteProjectTitle(projectTitle);
      if (!context.projectExists) {
        args.setForgeError("Project not found in Tongs yet. Sync Bar Stock, then retry.");
        return;
      }

      let resolvedWorkpieceId = context.workpieceId ?? args.readPendingProjectWorkpieceId(workspace, args.routeProjectId!);
      if (!resolvedWorkpieceId) {
        const created = await args.createProjectWorkpiece(projectTitle ?? `Project ${args.routeProjectId!.slice(0, 8)}`);
        if (!created.ok || !created.workpieceId) {
          args.setForgeError("Failed to open this Project in Hearth.");
          return;
        }
        resolvedWorkpieceId = created.workpieceId;
        args.writePendingProjectWorkpieceId(workspace, args.routeProjectId!, resolvedWorkpieceId);
      }

      const linked = await upsertBarstockProjectEpisodeLink({
        workspaceId: workspace,
        projectId: args.routeProjectId!,
        workpieceId: resolvedWorkpieceId,
      });
      if (!linked.ok) {
        console.warn("[hearth-project-intake] link upsert failed", linked.error);
        args.writePendingProjectWorkpieceId(workspace, args.routeProjectId!, resolvedWorkpieceId);
        args.setForgeError("Failed to link this Project to an Episode. Sync and retry.");
        return;
      }
      args.writePendingProjectWorkpieceId(workspace, args.routeProjectId!, null);

      if (cancelled) return;
      args.projectIntakeHandledRef.current = args.routeProjectId;
      args.setWorkspaceId(workspace);
      args.setWorkpieceId(resolvedWorkpieceId);
    })().catch((err) => {
      if (cancelled) return;
      const message = err instanceof Error ? err.message : "Failed to resolve project intake.";
      args.setForgeError(message);
    }).finally(() => {
      if (!cancelled) {
        args.setIsForging(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [args]);

  useEffect(() => {
    if (args.routeProjectId || !args.routeSparkId) return;

    const intakeKey = `${args.workspaceId ?? "none"}:${args.routeSparkId}`;
    if (args.sparkIntakeHandledRef.current === intakeKey) return;

    const intakeError = resolveCanonicalSparkIntakeError({
      routeProjectId: args.routeProjectId,
      routeSparkId: args.routeSparkId,
      workspaceId: args.workspaceId,
      discoveryWorkspaceId: args.sparkDiscoveryWorkspaceId,
      spark: args.routeSpark,
    });
    if (intakeError) {
      args.sparkIntakeHandledRef.current = intakeKey;
      args.setForgeError(intakeError);
      return;
    }

    if (!isCanonicalSparkDiscoveryResolved(args.workspaceId, args.sparkDiscoveryWorkspaceId) || args.isSparksLoading) {
      return;
    }
    if (!args.routeSpark) {
      return;
    }

    args.sparkIntakeHandledRef.current = intakeKey;
    args.setSelectedSparkId(args.routeSpark.id);
    const linkedWorkpieceId = resolveBarStockSparkHearthWorkpieceId(args.routeSpark);
    if (linkedWorkpieceId) {
      args.setForgeError(null);
      void args.openWorkpieceInFocus(linkedWorkpieceId, {
        workspaceId: args.workspaceId,
        preferredDraftId: args.routeSpark.links?.hearthDraftId ?? null,
        preferredWorkspaceTab: "script",
        preferredEditorPanel: "script",
      });
      return;
    }
    if (isSparkForged(args.routeSpark)) {
      args.setMode("episodes");
      args.setForgeError("This spark is already attached to Hearth, but its Episode link could not be resolved.");
      return;
    }
    void args.forgeSpark(args.routeSpark);
  }, [args]);
}
