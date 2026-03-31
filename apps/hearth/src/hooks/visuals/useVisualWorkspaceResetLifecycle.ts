import { useEffect, type Dispatch, type SetStateAction } from "react";

type UseVisualWorkspaceResetLifecycleArgs = {
  workpieceId: string | null;
  resetThumbnailWorkspaceViewState: () => void;
  resetMediaMapWorkspaceForWorkpieceSwitch: () => void;
  resetBrollWorkspaceForWorkpieceSwitch: () => void;
  resetReferenceClipWorkspaceForWorkpieceSwitch: () => void;
  resetImageMapReanchorState: () => void;
  setIsVisualScriptMode: Dispatch<SetStateAction<boolean>>;
  setImageMapMetadataUpdatedAt: Dispatch<SetStateAction<string | null>>;
  setImageMapSaveState: Dispatch<SetStateAction<"saved" | "editing" | "saving" | "error" | "offline">>;
  setImageMapSaveError: Dispatch<SetStateAction<string | null>>;
  setImageMapExportMessage: Dispatch<SetStateAction<string | null>>;
  setImageMapCandidateError: Dispatch<SetStateAction<string | null>>;
  setImageMapCandidateSelectionError: Dispatch<SetStateAction<string | null>>;
  setImageMapCandidatePreviewStateById: Dispatch<SetStateAction<Record<string, "loading" | "ready" | "error">>>;
  setImageMapCandidatePreviewUrlById: Dispatch<SetStateAction<Record<string, string>>>;
  setImageMapCandidatePreviewErrorById: Dispatch<SetStateAction<Record<string, string>>>;
};

export function useVisualWorkspaceResetLifecycle(args: UseVisualWorkspaceResetLifecycleArgs) {
  useEffect(() => {
    args.resetThumbnailWorkspaceViewState();
  }, [args.resetThumbnailWorkspaceViewState, args.workpieceId]);

  useEffect(() => {
    args.resetMediaMapWorkspaceForWorkpieceSwitch();
    args.resetBrollWorkspaceForWorkpieceSwitch();
  }, [args.resetBrollWorkspaceForWorkpieceSwitch, args.resetMediaMapWorkspaceForWorkpieceSwitch, args.workpieceId]);

  useEffect(() => {
    args.resetReferenceClipWorkspaceForWorkpieceSwitch();
  }, [args.resetReferenceClipWorkspaceForWorkpieceSwitch, args.workpieceId]);

  useEffect(() => {
    args.setIsVisualScriptMode(false);
    args.resetImageMapReanchorState();
  }, [args.resetImageMapReanchorState, args.setIsVisualScriptMode, args.workpieceId]);

  useEffect(() => {
    if (args.workpieceId) return;
    args.setImageMapMetadataUpdatedAt(null);
    args.setImageMapSaveState("saved");
    args.setImageMapSaveError(null);
    args.setImageMapExportMessage(null);
    args.setImageMapCandidateError(null);
    args.setImageMapCandidateSelectionError(null);
    args.setImageMapCandidatePreviewStateById({});
    args.setImageMapCandidatePreviewUrlById({});
    args.setImageMapCandidatePreviewErrorById({});
  }, [
    args.setImageMapCandidateError,
    args.setImageMapCandidatePreviewErrorById,
    args.setImageMapCandidatePreviewStateById,
    args.setImageMapCandidatePreviewUrlById,
    args.setImageMapCandidateSelectionError,
    args.setImageMapExportMessage,
    args.setImageMapMetadataUpdatedAt,
    args.setImageMapSaveError,
    args.setImageMapSaveState,
    args.workpieceId,
  ]);
}
