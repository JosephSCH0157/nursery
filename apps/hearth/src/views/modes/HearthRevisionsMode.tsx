import type { ReactNode } from "react";
import type { Revision } from "../../domain/revision";

type RevisionView = "list" | "preview" | "compare";

type DiffLine = {
  left: string;
  right: string;
  status: "same" | "changed" | "added" | "removed" | "separator";
};

type HearthRevisionsModeProps = {
  closeRevisionPanel: () => void;
  revisions: Revision[];
  selectedRevision: Revision | null;
  revisionView: RevisionView;
  formatUpdatedAt: (value: number | undefined) => string;
  selectRevisionPreview: (revision: Revision) => void;
  selectRevisionCompare: (revision: Revision) => void;
  onRestoreRevision: (revision: Revision) => void | Promise<void>;
  updateSelectedRevisionDraftNote: (value: string) => void;
  onUpdateRevisionNote: (revision: Revision, note: string) => void | Promise<void>;
  renderSectionedBody: (text: string) => ReactNode;
  diffLines: DiffLine[];
  diffCellClass: (side: "left" | "right", status: DiffLine["status"]) => string;
  isSavingRevision: boolean;
};

export default function HearthRevisionsMode({
  closeRevisionPanel,
  revisions,
  selectedRevision,
  revisionView,
  formatUpdatedAt,
  selectRevisionPreview,
  selectRevisionCompare,
  onRestoreRevision,
  updateSelectedRevisionDraftNote,
  onUpdateRevisionNote,
  renderSectionedBody,
  diffLines,
  diffCellClass,
  isSavingRevision,
}: HearthRevisionsModeProps) {
  return (
    <section className="hs-revisions">
      <header className="hs-revisions-header">
        <div className="hs-revisions-title">Revisions</div>
        <button type="button" onClick={closeRevisionPanel}>
          Back to Draft
        </button>
      </header>

      {revisions.length === 0 ? (
        <p className="hs-muted-text">No revisions yet.</p>
      ) : (
        <div className="hs-revisions-grid">
          <div className="hs-revision-list">
            {revisions.map((revision) => (
              <div
                key={revision.id}
                className={`hs-revision-card${selectedRevision?.id === revision.id ? " is-active" : ""}`}
              >
                <div className="hs-revision-card-header">
                  <span>{formatUpdatedAt(revision.createdAt)}</span>
                  <span className="hs-revision-kind">
                    {revision.kind}
                  </span>
                </div>
                <div className="hs-revision-note">
                  {revision.note || "No note"}
                </div>
                <div className="hs-revision-actions">
                  <button
                    type="button"
                    onClick={() => selectRevisionPreview(revision)}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => selectRevisionCompare(revision)}
                  >
                    Compare
                  </button>
                  <button type="button" onClick={() => void onRestoreRevision(revision)}>
                    Restore
                  </button>
                </div>
              </div>
            ))}
          </div>

          {selectedRevision ? (
            <div className="hs-revision-detail">
              <div className="hs-revision-detail-title">
                {revisionView === "preview" ? "Preview" : "Compare"}
              </div>
              <div className="hs-revision-meta">
                {formatUpdatedAt(selectedRevision.createdAt)} · {selectedRevision.kind}
              </div>
              <label className="hs-revision-label">
                <span className="hs-revision-label-text">Revision note</span>
                <input
                  value={selectedRevision.note ?? ""}
                  onChange={(event) => updateSelectedRevisionDraftNote(event.target.value)}
                  onBlur={(event) => void onUpdateRevisionNote(selectedRevision, event.target.value)}
                />
              </label>
              {revisionView === "preview" ? (
                <div className="hs-revision-preview">
                  <div className="hs-revision-preview-title">{selectedRevision.titleSnapshot}</div>
                  {renderSectionedBody(selectedRevision.bodySnapshot)}
                </div>
              ) : (
                <div className="hs-revision-diff-section">
                  <div className="hs-revision-diff-block">
                    <span className="hs-diff-label">Diff</span>
                    <div className="hs-diff-list">
                      {diffLines.map((line, idx) => {
                        const isSeparator = line.status === "separator";
                        if (isSeparator) {
                          return (
                            <div key={`diff-${idx}`} className="hs-diff-separator">
                              <hr className="hs-divider" />
                            </div>
                          );
                        }
                        return (
                          <div
                            key={`diff-${idx}`}
                            className="hs-diff-row"
                          >
                            <div className={diffCellClass("left", line.status)}>{line.left || " "}</div>
                            <div className={diffCellClass("right", line.status)}>{line.right || " "}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => void onUpdateRevisionNote(selectedRevision, selectedRevision.note ?? "")}
                disabled={isSavingRevision}
              >
                {isSavingRevision ? "Saving note..." : "Save note"}
              </button>
            </div>
          ) : (
            <div className="hs-muted-text-subtle">Select a revision to preview.</div>
          )}
        </div>
      )}
    </section>
  );
}
