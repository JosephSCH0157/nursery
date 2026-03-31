import { useCallback, type Dispatch, type SetStateAction } from "react";

type UseImageMapViewActionsArgs = {
  hasApprovedScript: boolean;
  approvedScriptVersion: number | null;
  isImageMapReanchorSaving: boolean;
  selectedImageMapEntryId: string | null;
  setMode: (next: "sparks" | "episodes" | "ready" | "series" | "focus") => void;
  setShowManualDraft: (next: boolean) => void;
  setShowScriptPanel: (next: boolean) => void;
  setIsVisualScriptMode: Dispatch<SetStateAction<boolean>>;
  setIsImageMapReanchorMode: (next: boolean) => void;
  setIsImageMapReanchorSaving: (next: boolean) => void;
  setImageMapReanchorError: (next: string | null) => void;
  setSelectedImageMapEntryId: (next: string | null) => void;
};

export function useImageMapViewActions(args: UseImageMapViewActionsArgs) {
  const onToggleVisualScriptMode = useCallback(() => {
    if (!args.hasApprovedScript || !args.approvedScriptVersion) return;
    args.setIsVisualScriptMode((prev) => {
      const next = !prev;
      if (next) {
        args.setMode("focus");
        args.setShowManualDraft(false);
        args.setShowScriptPanel(true);
      }
      return next;
    });
  }, [args]);

  const onSelectImageMapEntry = useCallback((entryId: string) => {
    if (entryId !== args.selectedImageMapEntryId) {
      args.setIsImageMapReanchorMode(false);
      args.setIsImageMapReanchorSaving(false);
      args.setImageMapReanchorError(null);
    }
    args.setSelectedImageMapEntryId(entryId);
  }, [args]);

  return {
    onToggleVisualScriptMode,
    onSelectImageMapEntry,
  };
}
