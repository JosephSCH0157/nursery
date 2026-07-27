import type {
  HearthModalViewModel,
  HearthModalViewModelInput,
} from "./hearth-modal-contracts";

export function buildHearthModalViewModel(
  input: HearthModalViewModelInput,
): HearthModalViewModel {
  return Object.freeze({
    composeModalOpen: input.composeModalOpen,
    productionDefaults: input.productionDefaults,
    onCloseComposeModal: input.onCloseComposeModal,
    onComposeSetupSubmit: input.onComposeSetupSubmit,
    revisionModalOpen: input.revisionModalOpen,
    revisionKind: input.revisionKind,
    onRevisionKindChange: input.onRevisionKindChange,
    revisionNote: input.revisionNote,
    onRevisionNoteChange: input.onRevisionNoteChange,
    closeRevisionModal: input.closeRevisionModal,
    onConfirmRevision: input.onConfirmRevision,
    hasActiveDraft: Boolean(input.activeDraftId),
  });
}
