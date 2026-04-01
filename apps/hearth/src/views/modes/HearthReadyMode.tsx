import type { HearthReadyScript } from "../../lib/hearth-ready-scripts";

type ReadyLabel = "hot" | "evergreen" | "series";

type HearthReadyModeProps = {
  readyTotalCount: number;
  isReadyScriptsLoading: boolean;
  refreshReadyScripts: () => void | Promise<void>;
  removedReadyCount: number;
  onRestoreRemovedReady: () => void | Promise<void>;
  isRestoringReady: boolean;
  readyScriptsError: string | null;
  orderedReadyScripts: HearthReadyScript[];
  draggingReadyId: string | null;
  onStartDraggingReady: (id: string) => void;
  onStopDraggingReady: () => void;
  onDropReadyOnEntry: (targetId: string) => void;
  updatingReadyCategoryId: string | null;
  onReadyLabelChange: (entry: HearthReadyScript, label: ReadyLabel) => void;
  onOpenReadyScriptInHearth: (entry: HearthReadyScript) => void | Promise<void>;
  onSendBackToEdit: (entry: HearthReadyScript) => void | Promise<void>;
  sendingBackReadyIds: string[];
  resolveReadyOpenHref: (entry: HearthReadyScript) => string | null;
  onRemoveFromReady: (entry: HearthReadyScript) => void | Promise<void>;
  removingReadyIds: string[];
  resolveReadyAttribution: (entry: HearthReadyScript) => string;
  resolveReadyLabel: (entry: HearthReadyScript) => ReadyLabel;
};

export default function HearthReadyMode({
  readyTotalCount,
  isReadyScriptsLoading,
  refreshReadyScripts,
  removedReadyCount,
  onRestoreRemovedReady,
  isRestoringReady,
  readyScriptsError,
  orderedReadyScripts,
  draggingReadyId,
  onStartDraggingReady,
  onStopDraggingReady,
  onDropReadyOnEntry,
  updatingReadyCategoryId,
  onReadyLabelChange,
  onOpenReadyScriptInHearth,
  onSendBackToEdit,
  sendingBackReadyIds,
  resolveReadyOpenHref,
  onRemoveFromReady,
  removingReadyIds,
  resolveReadyAttribution,
  resolveReadyLabel,
}: HearthReadyModeProps) {
  return (
    <section className="hs-home">
      <header className="hs-home-header">
        <h2 className="hs-home-title">Ready</h2>
        <p className="hs-home-subtext">Session List curated by Hearth.</p>
      </header>
      <div className="hs-ready-record-header">
        <div className="hs-rail-heading">
          Ready Items
          <span className="hs-ready-record-count">{readyTotalCount}</span>
        </div>
        <button type="button" onClick={() => void refreshReadyScripts()} disabled={isReadyScriptsLoading}>
          {isReadyScriptsLoading ? "Refreshing..." : "Refresh"}
        </button>
      </div>
      {removedReadyCount > 0 ? (
        <button type="button" onClick={() => void onRestoreRemovedReady()} disabled={isRestoringReady}>
          {isRestoringReady ? "Restoring..." : `Restore hidden (${removedReadyCount})`}
        </button>
      ) : null}
      {readyScriptsError ? <div className="hs-error-text-small">{readyScriptsError}</div> : null}
      <ul className="hs-ready-record-list">
        {orderedReadyScripts.map((entry) => {
          const anvilHref = resolveReadyOpenHref(entry);
          const label = resolveReadyLabel(entry);
          const isSendingBack = sendingBackReadyIds.includes(entry.id);
          const isRemoving = removingReadyIds.includes(entry.id);
          const isDragging = draggingReadyId === entry.id;
          return (
            <li
              key={entry.id}
              className={`hs-ready-record-item${isDragging ? " is-dragging" : ""}`}
              draggable
              onDragStart={() => onStartDraggingReady(entry.id)}
              onDragEnd={onStopDraggingReady}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => onDropReadyOnEntry(entry.id)}
            >
              <div className="hs-ready-record-title">{entry.title}</div>
              <div className="hs-ready-record-meta">{resolveReadyAttribution(entry)}</div>
              <label className="hs-ready-record-label">
                <span>Label</span>
                <select
                  value={label}
                  disabled={updatingReadyCategoryId === entry.id}
                  onChange={(event) => onReadyLabelChange(entry, event.target.value as ReadyLabel)}
                >
                  <option value="hot">Hot</option>
                  <option value="evergreen">Evergreen</option>
                  <option value="series">Series</option>
                </select>
              </label>
              <div className="hs-workpiece-actions">
                <button type="button" onClick={() => void onOpenReadyScriptInHearth(entry)}>
                  Open in Hearth
                </button>
                <button type="button" onClick={() => void onSendBackToEdit(entry)} disabled={isSendingBack}>
                  {isSendingBack ? "Sending back..." : "Send Back to Edit"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!anvilHref) return;
                    window.location.assign(anvilHref);
                  }}
                  disabled={!anvilHref}
                >
                  Send to Anvil
                </button>
                <button type="button" onClick={() => void onRemoveFromReady(entry)} disabled={isRemoving || isSendingBack}>
                  {isRemoving ? "Hiding..." : "Hide from Ready"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
