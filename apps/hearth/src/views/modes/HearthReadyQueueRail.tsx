type HearthReadyQueueRailProps = {
  readyTotalCount: number;
  refreshReadyScripts: () => void | Promise<void>;
  isReadyScriptsLoading: boolean;
  readyScriptsError: string | null;
  readyCategoryError: string | null;
  readyUrgencyLabelFresh: string;
  readyUrgencyLabelCooling: string;
  readyUrgencyLabelCold: string;
  readyUrgencyFreshCount: number;
  readyUrgencyCoolingCount: number;
  readyUrgencyColdCount: number;
  removedReadyCount: number;
  onOpenReadyView: () => void;
  onRestoreRemovedReady: () => void | Promise<void>;
  isRestoringReady: boolean;
};

export default function HearthReadyQueueRail({
  readyTotalCount,
  refreshReadyScripts,
  isReadyScriptsLoading,
  readyScriptsError,
  readyCategoryError,
  readyUrgencyLabelFresh,
  readyUrgencyLabelCooling,
  readyUrgencyLabelCold,
  readyUrgencyFreshCount,
  readyUrgencyCoolingCount,
  readyUrgencyColdCount,
  removedReadyCount,
  onOpenReadyView,
  onRestoreRemovedReady,
  isRestoringReady,
}: HearthReadyQueueRailProps) {
  return (
    <div className="hs-rail-section">
      <div className="hs-ready-record-header">
        <div className="hs-rail-heading">
          Ready to Record
          <span className="hs-ready-record-count">{readyTotalCount}</span>
        </div>
        <button type="button" onClick={() => void refreshReadyScripts()} disabled={isReadyScriptsLoading}>
          {isReadyScriptsLoading ? "Refreshing..." : "Refresh"}
        </button>
      </div>
      {readyScriptsError ? <div className="hs-error-text-small">{readyScriptsError}</div> : null}
      {readyCategoryError ? <div className="hs-error-text-small">{readyCategoryError}</div> : null}
      <div className="hs-rail-meta">
        Each episode appears once in Projects. Ready state lives on the project row; queue management lives in the Ready view.
      </div>
      {isReadyScriptsLoading ? <p>Loading queue...</p> : null}
      {!isReadyScriptsLoading ? (
        <div className="hs-ready-record-summary">
          <div className="hs-ready-record-summary-row">
            <span>Ready episodes</span>
            <strong>{readyTotalCount}</strong>
          </div>
          <div className="hs-ready-record-summary-row">
            <span>{readyUrgencyLabelFresh}</span>
            <strong>{readyUrgencyFreshCount}</strong>
          </div>
          <div className="hs-ready-record-summary-row">
            <span>{readyUrgencyLabelCooling}</span>
            <strong>{readyUrgencyCoolingCount}</strong>
          </div>
          <div className="hs-ready-record-summary-row">
            <span>{readyUrgencyLabelCold}</span>
            <strong>{readyUrgencyColdCount}</strong>
          </div>
          <div className="hs-ready-record-summary-row">
            <span>Hidden</span>
            <strong>{removedReadyCount}</strong>
          </div>
        </div>
      ) : null}
      <div className="hs-workpiece-actions">
        <button
          type="button"
          className="hs-mode-button"
          onClick={onOpenReadyView}
        >
          Open Ready View
        </button>
        {removedReadyCount > 0 ? (
          <button type="button" onClick={() => void onRestoreRemovedReady()} disabled={isRestoringReady}>
            {isRestoringReady ? "Restoring..." : `Restore hidden (${removedReadyCount})`}
          </button>
        ) : null}
      </div>
      {!isReadyScriptsLoading && readyTotalCount === 0 && removedReadyCount === 0 ? (
        <p className="hs-rail-meta">No items yet. Approve a script to populate Ready.</p>
      ) : null}
    </div>
  );
}
