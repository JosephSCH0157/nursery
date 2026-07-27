import type {
  HearthMobileNavigationViewModel,
  HearthMobileNavigationViewModelInput,
} from "./hearth-mobile-navigation-contracts";

export function buildHearthMobileNavigationViewModel(
  input: HearthMobileNavigationViewModelInput,
): HearthMobileNavigationViewModel {
  const isRestoring = Boolean(
    input.activeWorkpieceId
    && input.restoringWorkpieceIds.includes(input.activeWorkpieceId),
  );

  return Object.freeze({
    isMobile: input.isMobile,
    mobileOverlayView: input.mobileOverlayView,
    activeDraftTitle: input.activeDraftTitle ?? null,
    closeMobileOverlay: input.closeMobileOverlay,
    openReadyInMobileOverlay: input.openReadyInMobileOverlay,
    isActiveWorkpieceArchived: input.isActiveWorkpieceArchived,
    hasActiveWorkpiece: input.hasActiveWorkpiece,
    restoreButtonLabel: isRestoring ? "Restoring..." : "Restore Workpiece",
    restoreButtonDisabled: !input.activeWorkpieceId || isRestoring,
    onRestoreWorkpiece: input.onRestoreWorkpiece,
    hasActiveDraft: input.hasActiveDraft,
    isSaving: input.isSaving,
    onDeleteDraftBuffer: input.onDeleteDraftBuffer,
    onSaveDraft: input.onSaveDraft,
    refreshReadyScripts: input.refreshReadyScripts,
    isReadyScriptsLoading: input.isReadyScriptsLoading,
    renderFocusContent: input.renderFocusContent,
    renderReadyContent: input.renderReadyContent,
  });
}
