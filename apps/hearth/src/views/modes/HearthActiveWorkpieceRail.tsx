type HearthActiveWorkpieceRailProps = {
  hasActiveEpisode: boolean;
  activeEpisodeReadyStatus: {
    tone: string;
    label: string;
    detail: string;
  };
  activeWorkpieceIsArchived: boolean;
  activeWorkpieceArchiveReason: string | null;
  isRestoringActiveWorkpiece: boolean;
  onRestoreActiveWorkpiece: () => void | Promise<void>;
  openInAnvilHref: string | null;
  handoffBlocked: boolean;
  onOpenInAnvil: () => void | Promise<void>;
  anvilStepModeHint: string | null;
  isFocusDraftActive: boolean;
  isFocusPlanningActive: boolean;
  isFocusSourcesActive: boolean;
  isFocusRevisionsActive: boolean;
  wordCount: number;
  revisionsCount: number;
  sourcesBadgeTitle: string;
  sourcesBadge: string | null;
  devMode: boolean;
  onFocusDraft: () => void;
  onFocusPlanning: () => void;
  onFocusSources: () => void;
  onFocusRevisions: () => void;
  onOpenApiLedger: () => void;
};

export default function HearthActiveWorkpieceRail({
  hasActiveEpisode,
  activeEpisodeReadyStatus,
  activeWorkpieceIsArchived,
  activeWorkpieceArchiveReason,
  isRestoringActiveWorkpiece,
  onRestoreActiveWorkpiece,
  openInAnvilHref,
  handoffBlocked,
  onOpenInAnvil,
  anvilStepModeHint,
  isFocusDraftActive,
  isFocusPlanningActive,
  isFocusSourcesActive,
  isFocusRevisionsActive,
  wordCount,
  revisionsCount,
  sourcesBadgeTitle,
  sourcesBadge,
  devMode,
  onFocusDraft,
  onFocusPlanning,
  onFocusSources,
  onFocusRevisions,
  onOpenApiLedger,
}: HearthActiveWorkpieceRailProps) {
  return (
    <>
      <div className={`hs-active-workpiece${hasActiveEpisode ? "" : " is-empty"}`}>
        <div className="hs-rail-heading">Active workpiece</div>
        {hasActiveEpisode ? (
          <>
            <div className="hs-active-workpiece-status">
              <span className={`hs-episode-ready-pill is-${activeEpisodeReadyStatus.tone}`}>
                {activeEpisodeReadyStatus.label}
              </span>
              <div className="hs-rail-meta">{activeEpisodeReadyStatus.detail}</div>
            </div>
            {activeWorkpieceIsArchived ? (
              <>
                <div className="hs-rail-meta">Archived workpieces are hidden records. Restore to review, then re-ready before recording.</div>
                {activeWorkpieceArchiveReason ? (
                  <div className="hs-rail-meta">Archive reason: {activeWorkpieceArchiveReason}</div>
                ) : null}
                <button
                  type="button"
                  onClick={() => void onRestoreActiveWorkpiece()}
                  disabled={isRestoringActiveWorkpiece}
                  className="hs-mode-button"
                >
                  {isRestoringActiveWorkpiece ? "Restoring..." : "Restore Workpiece"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void onOpenInAnvil()}
                  disabled={!openInAnvilHref || handoffBlocked}
                  className="hs-mode-button"
                >
                  Start Recording
                </button>
                {anvilStepModeHint ? (
                  <div className="hs-rail-meta">{anvilStepModeHint}</div>
                ) : null}
                <button
                  type="button"
                  onClick={onFocusDraft}
                  className={`hs-mode-button${isFocusDraftActive ? " is-active" : ""}`}
                >
                  Draft
                  <span className="hs-mode-meta">{wordCount} words</span>
                </button>
                <button
                  type="button"
                  onClick={onFocusPlanning}
                  className={`hs-mode-button${isFocusPlanningActive ? " is-active" : ""}`}
                >
                  Planning Board
                </button>
                <button
                  type="button"
                  onClick={onFocusSources}
                  className={`hs-mode-button${isFocusSourcesActive ? " is-active" : ""}`}
                  title={sourcesBadgeTitle}
                >
                  Sources
                  {sourcesBadge ? (
                    <span className={`hs-sources-badge${devMode ? " is-dev" : ""}`}>{sourcesBadge}</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={onFocusRevisions}
                  className={`hs-mode-button${isFocusRevisionsActive ? " is-active" : ""}`}
                >
                  Revisions
                  <span className="hs-mode-meta">{revisionsCount}</span>
                </button>
              </>
            )}
          </>
        ) : (
          <div className="hs-rail-meta">Select an episode to unlock recording and focus tools.</div>
        )}
      </div>

      <div className="hs-rail-section">
        <div className="hs-rail-heading">Tools</div>
        <button
          type="button"
          className="hs-mode-button"
          title={sourcesBadgeTitle}
          onClick={onOpenApiLedger}
        >
          API / Ledger
          {sourcesBadge ? (
            <span className={`hs-sources-badge${devMode ? " is-dev" : ""}`}>{sourcesBadge}</span>
          ) : null}
        </button>
      </div>
    </>
  );
}
