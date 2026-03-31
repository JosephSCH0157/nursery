import { useCallback, type Dispatch, type SetStateAction } from "react";
import { removeHearthReadyScripts, type HearthReadyScript } from "../lib/hearth-ready-scripts";

type UseHearthReadyNavigationActionsArgs = {
  activeDraftId: string | null;
  sendingBackReadyIds: string[];
  openWorkpieceInFocus: (
    targetWorkpieceId: string,
    options?: {
      workspaceId?: string | null;
      preferredDraftId?: string | null;
    },
  ) => Promise<unknown>;
  refreshReadyScripts: () => Promise<void>;
  setError: (next: string | null) => void;
  setReadyScriptsError: (next: string | null) => void;
  setReadyScripts: Dispatch<SetStateAction<HearthReadyScript[]>>;
  setSendingBackReadyIds: Dispatch<SetStateAction<string[]>>;
};

export function useHearthReadyNavigationActions(args: UseHearthReadyNavigationActionsArgs) {
  const onOpenReadyScriptInHearth = useCallback(async (entry: HearthReadyScript) => {
    args.setError(null);
    try {
      await args.openWorkpieceInFocus(entry.workpieceId, {
        workspaceId: entry.workspaceId,
        preferredDraftId: args.activeDraftId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to open approved script in Hearth.";
      args.setError(message);
    }
  }, [args]);

  const onSendBackToEdit = useCallback(async (entry: HearthReadyScript) => {
    if (!entry.id || args.sendingBackReadyIds.includes(entry.id)) return;

    args.setError(null);
    args.setReadyScriptsError(null);
    args.setSendingBackReadyIds((prev) => (prev.includes(entry.id) ? prev : [...prev, entry.id]));

    try {
      await args.openWorkpieceInFocus(entry.workpieceId, {
        workspaceId: entry.workspaceId,
        preferredDraftId: entry.workpieceId,
      });

      const result = await removeHearthReadyScripts({
        workpieceId: entry.workpieceId,
        paths: entry.scriptPaths.length ? entry.scriptPaths : [entry.primaryScriptPath || entry.path],
      });
      if (!result.ok) {
        args.setError("Failed to remove the workpiece from Ready. It is still marked ready.");
        args.setReadyScriptsError("Failed to remove the workpiece from Ready.");
        await args.refreshReadyScripts();
        return;
      }

      args.setReadyScripts((prev) => prev.filter((row) => row.workpieceId !== entry.workpieceId));
      await args.refreshReadyScripts();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send the workpiece back to editing.";
      args.setError(message);
      args.setReadyScriptsError("Failed to send the workpiece back to editing.");
      await args.refreshReadyScripts();
    } finally {
      args.setSendingBackReadyIds((prev) => prev.filter((id) => id !== entry.id));
    }
  }, [args]);

  return {
    onOpenReadyScriptInHearth,
    onSendBackToEdit,
  };
}
