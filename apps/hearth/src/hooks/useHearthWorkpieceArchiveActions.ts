import { useCallback, useState } from "react";
import { archiveHearthWorkpiece, restoreHearthWorkpiece } from "../lib/hearth-workpieces";

type UseHearthWorkpieceArchiveActionsArgs = {
  workspaceId: string | null;
  workpieceId: string | null;
  showArchived: boolean;
  isMobile: boolean;
  mobileOverlayView: "editor" | "ready" | null;
  activeDraftId: string | null;
  normalizeUuid: (value: string | null | undefined) => string | null;
  setError: (next: string | null) => void;
  setAiRuntimeWarning: (next: string | null) => void;
  setWorkpieceId: (next: string | null) => void;
  setMode: (next: "sparks" | "episodes" | "ready" | "series" | "focus") => void;
  setFocusTab: (next: "draft" | "planning" | "sources" | "revisions") => void;
  setMobileOverlayView: (next: "editor" | "ready" | null) => void;
  selectDraft: (draft: null) => Promise<void>;
  persistSession: (draftId: string | null, uiSelectedTab?: string) => Promise<void>;
  refreshWorkpieces: (workspaceId: string, options?: { includeArchived?: boolean }) => Promise<unknown>;
  openWorkpieceInFocus: (
    targetWorkpieceId: string,
    options?: { workspaceId?: string | null; preferredDraftId?: string | null },
  ) => Promise<unknown>;
};

export function useHearthWorkpieceArchiveActions(args: UseHearthWorkpieceArchiveActionsArgs) {
  const [archivingWorkpieceIds, setArchivingWorkpieceIds] = useState<string[]>([]);
  const [restoringWorkpieceIds, setRestoringWorkpieceIds] = useState<string[]>([]);

  const onArchiveWorkpiece = useCallback(async (targetWorkpieceId: string) => {
    const normalizedWorkspaceId = args.normalizeUuid(args.workspaceId);
    const normalizedWorkpieceId = args.normalizeUuid(targetWorkpieceId);
    if (!normalizedWorkspaceId || !normalizedWorkpieceId || archivingWorkpieceIds.includes(normalizedWorkpieceId)) {
      return;
    }

    args.setError(null);
    setArchivingWorkpieceIds((prev) => (
      prev.includes(normalizedWorkpieceId) ? prev : [...prev, normalizedWorkpieceId]
    ));

    try {
      await archiveHearthWorkpiece({
        workspaceId: normalizedWorkspaceId,
        workpieceId: normalizedWorkpieceId,
      });

      const archivingActiveWorkpiece = args.workpieceId === normalizedWorkpieceId;
      if (archivingActiveWorkpiece) {
        await args.selectDraft(null);
        await args.persistSession(null, "draft");
        if (!args.showArchived) {
          args.setWorkpieceId(null);
          args.setMode("episodes");
          args.setFocusTab("draft");
          if (args.isMobile && args.mobileOverlayView === "editor") {
            args.setMobileOverlayView(null);
          }
        }
      }

      await args.refreshWorkpieces(normalizedWorkspaceId, { includeArchived: args.showArchived });
    } catch {
      args.setError("Failed to archive workpiece.");
    } finally {
      setArchivingWorkpieceIds((prev) => prev.filter((id) => id !== normalizedWorkpieceId));
    }
  }, [archivingWorkpieceIds, args]);

  const onRestoreWorkpiece = useCallback(async (
    targetWorkpieceId: string,
    options?: { openAfterRestore?: boolean },
  ) => {
    const normalizedWorkspaceId = args.normalizeUuid(args.workspaceId);
    const normalizedWorkpieceId = args.normalizeUuid(targetWorkpieceId);
    if (!normalizedWorkspaceId || !normalizedWorkpieceId || restoringWorkpieceIds.includes(normalizedWorkpieceId)) {
      return;
    }

    args.setError(null);
    setRestoringWorkpieceIds((prev) => (
      prev.includes(normalizedWorkpieceId) ? prev : [...prev, normalizedWorkpieceId]
    ));

    try {
      await restoreHearthWorkpiece({
        workspaceId: normalizedWorkspaceId,
        workpieceId: normalizedWorkpieceId,
      });
      args.setAiRuntimeWarning("Restored. Review and re-ready before recording.");
      await args.refreshWorkpieces(normalizedWorkspaceId, {
        includeArchived: args.showArchived || Boolean(options?.openAfterRestore),
      });

      if (options?.openAfterRestore) {
        await args.openWorkpieceInFocus(normalizedWorkpieceId, {
          workspaceId: normalizedWorkspaceId,
          preferredDraftId: args.activeDraftId ?? normalizedWorkpieceId,
        });
      }
    } catch {
      args.setError("Failed to restore workpiece.");
    } finally {
      setRestoringWorkpieceIds((prev) => prev.filter((id) => id !== normalizedWorkpieceId));
    }
  }, [args, restoringWorkpieceIds]);

  return {
    archivingWorkpieceIds,
    restoringWorkpieceIds,
    onArchiveWorkpiece,
    onRestoreWorkpiece,
  };
}
