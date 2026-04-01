import type { ProductionDefaults } from "../../domain/compose";
import type { RevisionKind } from "../../domain/revision";
import ComposeSetupModal from "../../ui/ComposeSetupModal";

type HearthShellModalsProps = {
  composeModalOpen: boolean;
  productionDefaults: ProductionDefaults;
  onCloseComposeModal: () => void;
  onComposeSetupSubmit: (setup: import("../../domain/compose").ComposeSetup) => void;
  revisionModalOpen: boolean;
  revisionKind: RevisionKind;
  onRevisionKindChange: (kind: RevisionKind) => void;
  revisionNote: string;
  onRevisionNoteChange: (note: string) => void;
  closeRevisionModal: () => void;
  onConfirmRevision: () => void | Promise<void>;
  hasActiveDraft: boolean;
};

export default function HearthShellModals({
  composeModalOpen,
  productionDefaults,
  onCloseComposeModal,
  onComposeSetupSubmit,
  revisionModalOpen,
  revisionKind,
  onRevisionKindChange,
  revisionNote,
  onRevisionNoteChange,
  closeRevisionModal,
  onConfirmRevision,
  hasActiveDraft,
}: HearthShellModalsProps) {
  return (
    <>
      <ComposeSetupModal
        open={composeModalOpen}
        defaults={productionDefaults}
        onClose={onCloseComposeModal}
        onCompose={onComposeSetupSubmit}
      />

      {revisionModalOpen ? (
        <div className="hs-modal-overlay">
          <div className="hs-modal">
            <div className="hs-modal-title">Create Revision</div>
            <label className="hs-field">
              <span className="hs-field-label-muted">Kind</span>
              <select value={revisionKind} onChange={(event) => onRevisionKindChange(event.target.value as RevisionKind)}>
                <option value="manual">Manual</option>
                <option value="milestone">Milestone</option>
              </select>
            </label>
            <label className="hs-field">
              <span className="hs-field-label-muted">Note (optional)</span>
              <textarea
                value={revisionNote}
                onChange={(event) => onRevisionNoteChange(event.target.value)}
                placeholder="Why this change?"
                className="hs-textarea-modal"
              />
            </label>
            <div className="hs-modal-actions">
              <button
                type="button"
                onClick={closeRevisionModal}
              >
                Cancel
              </button>
              <button type="button" onClick={() => void onConfirmRevision()} disabled={!hasActiveDraft}>
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
