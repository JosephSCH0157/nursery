import type { ReactNode } from "react";
import { MobilePage } from "@forge/ui-mobile";

type HearthMobileOverlaysProps = {
  isMobile: boolean;
  mobileOverlayView: "editor" | "ready" | null;
  activeDraftTitle: string | null;
  closeMobileOverlay: () => void;
  openReadyInMobileOverlay: () => void;
  isActiveWorkpieceArchived: boolean;
  hasActiveWorkpiece: boolean;
  restoreButtonLabel: string;
  restoreButtonDisabled: boolean;
  onRestoreWorkpiece: () => void | Promise<void>;
  hasActiveDraft: boolean;
  isSaving: boolean;
  onDeleteDraftBuffer: () => void | Promise<void>;
  onSaveDraft: () => void | Promise<void>;
  refreshReadyScripts: () => void | Promise<void>;
  isReadyScriptsLoading: boolean;
  renderFocusContent: () => ReactNode;
  renderReadyContent: () => ReactNode;
};

export default function HearthMobileOverlays({
  isMobile,
  mobileOverlayView,
  activeDraftTitle,
  closeMobileOverlay,
  openReadyInMobileOverlay,
  isActiveWorkpieceArchived,
  hasActiveWorkpiece,
  restoreButtonLabel,
  restoreButtonDisabled,
  onRestoreWorkpiece,
  hasActiveDraft,
  isSaving,
  onDeleteDraftBuffer,
  onSaveDraft,
  refreshReadyScripts,
  isReadyScriptsLoading,
  renderFocusContent,
  renderReadyContent,
}: HearthMobileOverlaysProps) {
  if (!isMobile) return null;

  return (
    <>
      {mobileOverlayView === "editor" ? (
        <div className="hs-mobile-overlay">
          <MobilePage
            title={activeDraftTitle?.trim() || "Project Editor"}
            onBack={closeMobileOverlay}
            rightAction={(
              <button type="button" onClick={openReadyInMobileOverlay}>
                Ready
              </button>
            )}
            bottomBar={
              isActiveWorkpieceArchived ? (
                <div className="hs-mobile-overlay-actions">
                  <button
                    type="button"
                    onClick={() => void onRestoreWorkpiece()}
                    disabled={!hasActiveWorkpiece || restoreButtonDisabled}
                  >
                    {restoreButtonLabel}
                  </button>
                </div>
              ) : (
                <div className="hs-mobile-overlay-actions">
                  <button type="button" onClick={() => void onDeleteDraftBuffer()} disabled={!hasActiveDraft || isSaving}>
                    Delete Draft Buffer
                  </button>
                  <button type="button" onClick={() => void onSaveDraft()} disabled={!hasActiveDraft || isSaving}>
                    {isSaving ? "Saving..." : "Save"}
                  </button>
                </div>
              )
            }
          >
            <div className="hs-mobile-overlay-body">
              {renderFocusContent()}
            </div>
          </MobilePage>
        </div>
      ) : null}

      {mobileOverlayView === "ready" ? (
        <div className="hs-mobile-overlay">
          <MobilePage
            title="Ready to Record"
            onBack={closeMobileOverlay}
            rightAction={(
              <button type="button" onClick={() => void refreshReadyScripts()} disabled={isReadyScriptsLoading}>
                {isReadyScriptsLoading ? "..." : "Refresh"}
              </button>
            )}
          >
            <div className="hs-mobile-overlay-body">
              {renderReadyContent()}
            </div>
          </MobilePage>
        </div>
      ) : null}
    </>
  );
}
