import { useCallback, type Dispatch, type SetStateAction } from "react";
import {
  reorderHearthReadyScripts,
  setHearthReadyScriptCategory,
  setHearthReadyScriptHidden,
  updateHearthReadyQueueState,
  type HearthContentCategory,
  type HearthReadyScript,
} from "../lib/hearth-ready-scripts";

type UseHearthReadyQueueActionsArgs = {
  workspaceId: string | null;
  normalizeUuid: (value: string | null | undefined) => string | null;
  readyScriptsForDisplay: HearthReadyScript[];
  removingReadyIds: string[];
  isRestoringReady: boolean;
  hearthUserId: string | null;
  reorderVisibleReadyEntries: (entries: HearthReadyScript[], fromId: string, toId: string) => HearthReadyScript[];
  setReadyScripts: Dispatch<SetStateAction<HearthReadyScript[]>>;
  setReadyScriptsError: (next: string | null) => void;
  setReadyCategoryError: (next: string | null) => void;
  setUpdatingReadyCategoryId: (next: string | null) => void;
  setRemovingReadyIds: Dispatch<SetStateAction<string[]>>;
  setIsRestoringReady: (next: boolean) => void;
  refreshReadyScripts: () => Promise<void>;
};

export function useHearthReadyQueueActions(args: UseHearthReadyQueueActionsArgs) {
  const onSetReadyScriptCategory = useCallback(async (
    entry: HearthReadyScript,
    category: HearthContentCategory | null,
  ) => {
    args.setReadyCategoryError(null);
    args.setUpdatingReadyCategoryId(entry.id);

    const previousCategory = entry.contentCategory;
    args.setReadyScripts((prev) => prev.map((row) => (
      row.id === entry.id ? { ...row, contentCategory: category } : row
    )));

    try {
      const result = await setHearthReadyScriptCategory({
        workspaceId: entry.workspaceId,
        workpieceId: entry.workpieceId,
        category,
      });
      if (!result.ok) {
        args.setReadyScripts((prev) => prev.map((row) => (
          row.id === entry.id ? { ...row, contentCategory: previousCategory } : row
        )));
        args.setReadyCategoryError("Failed to save script category.");
        return;
      }
      void args.refreshReadyScripts();
    } catch {
      args.setReadyScripts((prev) => prev.map((row) => (
        row.id === entry.id ? { ...row, contentCategory: previousCategory } : row
      )));
      args.setReadyCategoryError("Failed to save script category.");
    } finally {
      args.setUpdatingReadyCategoryId(null);
    }
  }, [args]);

  const onRemoveFromReady = useCallback(async (entry: HearthReadyScript) => {
    if (!entry.id || args.removingReadyIds.includes(entry.id)) return;

    args.setReadyScriptsError(null);
    args.setRemovingReadyIds((prev) => (prev.includes(entry.id) ? prev : [...prev, entry.id]));
    args.setReadyScripts((prev) => prev.map((row) => (
      row.id === entry.id
        ? {
            ...row,
            hiddenAt: new Date().toISOString(),
            hiddenBy: args.hearthUserId ?? row.hiddenBy,
          }
        : row
    )));

    try {
      const result = await setHearthReadyScriptHidden({
        workspaceId: entry.workspaceId,
        workpieceId: entry.workpieceId,
        hidden: true,
      });
      if (!result.ok) {
        args.setReadyScriptsError("Failed to hide script from Ready.");
        await args.refreshReadyScripts();
        return;
      }
      await args.refreshReadyScripts();
    } catch {
      args.setReadyScriptsError("Failed to hide script from Ready.");
      await args.refreshReadyScripts();
    } finally {
      args.setRemovingReadyIds((prev) => prev.filter((id) => id !== entry.id));
    }
  }, [args]);

  const onRestoreRemovedReady = useCallback(async () => {
    const normalizedWorkspaceId = args.normalizeUuid(args.workspaceId);
    const hiddenEntries = args.readyScriptsForDisplay.filter((entry) => entry.hiddenAt);
    if (!normalizedWorkspaceId || hiddenEntries.length === 0 || args.isRestoringReady) return;

    args.setReadyScriptsError(null);
    args.setIsRestoringReady(true);
    args.setReadyScripts((prev) => prev.map((entry) => (
      entry.hiddenAt
        ? { ...entry, hiddenAt: null, hiddenBy: null }
        : entry
    )));

    try {
      const result = await updateHearthReadyQueueState({
        workspaceId: normalizedWorkspaceId,
        entries: hiddenEntries.map((entry) => ({
          workpieceId: entry.workpieceId,
          hidden: false,
        })),
      });
      if (!result.ok) {
        args.setReadyScriptsError("Failed to restore hidden Ready items.");
        await args.refreshReadyScripts();
        return;
      }
      await args.refreshReadyScripts();
    } catch {
      args.setReadyScriptsError("Failed to restore hidden Ready items.");
      await args.refreshReadyScripts();
    } finally {
      args.setIsRestoringReady(false);
    }
  }, [args]);

  const onReorderReady = useCallback(async (fromId: string, toId: string) => {
    const normalizedWorkspaceId = args.normalizeUuid(args.workspaceId);
    if (!normalizedWorkspaceId || !fromId || !toId || fromId === toId) return;

    const reordered = args.reorderVisibleReadyEntries(args.readyScriptsForDisplay, fromId, toId);
    const changed = reordered.some((entry, index) => entry !== args.readyScriptsForDisplay[index]);
    if (!changed) return;

    const orderedVisibleIds = reordered
      .filter((entry) => !entry.hiddenAt)
      .map((entry) => entry.workpieceId);

    args.setReadyScriptsError(null);
    args.setReadyScripts(reordered);

    try {
      const result = await reorderHearthReadyScripts({
        workspaceId: normalizedWorkspaceId,
        orderedWorkpieceIds: orderedVisibleIds,
      });
      if (!result.ok) {
        args.setReadyScriptsError("Failed to reorder Ready queue.");
        await args.refreshReadyScripts();
        return;
      }
      await args.refreshReadyScripts();
    } catch {
      args.setReadyScriptsError("Failed to reorder Ready queue.");
      await args.refreshReadyScripts();
    }
  }, [args]);

  return {
    onSetReadyScriptCategory,
    onRemoveFromReady,
    onRestoreRemovedReady,
    onReorderReady,
  };
}
