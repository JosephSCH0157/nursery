import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Draft } from "../domain/draft";
import type { Revision, RevisionKind } from "../domain/revision";
import type { ScriptValidationResult } from "@forge/shared/script-tags";

type RevisionSnapshot = {
  title: string;
  body: string;
};

type ScriptValidationState = {
  source: "save_notice" | "save_gate" | "ai_apply" | "ai_repair";
  result: ScriptValidationResult;
};

type UseScriptWorkspaceArgs = {
  activeDraft: Draft | null;
  setActiveDraft: Dispatch<SetStateAction<Draft | null>>;
  bumpDraftEditVersion: () => void;
  persistRevisionDraft: (args: {
    draft: Draft;
    updatedAt: number;
    revision: { kind: RevisionKind; note?: string };
  }) => Promise<boolean>;
  resolveRevisionWorkpieceId: () => string | null;
  restoreRevisionSnapshot: (workpieceId: string, revisionId: string) => Promise<RevisionSnapshot | null>;
  persistRestoredDraft: (args: {
    draft: Draft;
    updatedAt: number;
  }) => Promise<boolean>;
  saveRevisionRecord: (workpieceId: string, revision: Revision) => Promise<void>;
  refreshRevisions: (workpieceId: string, draftId?: string | null) => Promise<Revision[]>;
  reportRevisionPersistenceWarning: (kind: RevisionKind | null, message: string) => void;
  setAiRuntimeWarning: (value: string | null) => void;
  setError: (value: string | null) => void;
  confirmRestore: (message: string) => boolean;
};

export function useScriptWorkspace(args: UseScriptWorkspaceArgs): {
  revisionModalOpen: boolean;
  revisionNote: string;
  revisionKind: RevisionKind;
  setRevisionNote: (value: string) => void;
  setRevisionKind: (value: RevisionKind) => void;
  openRevisionModal: () => void;
  closeRevisionModal: () => void;
  onConfirmRevision: () => Promise<void>;
  scriptValidation: ScriptValidationState | null;
  setScriptValidation: Dispatch<SetStateAction<ScriptValidationState | null>>;
  clearScriptValidation: () => void;
  onDraftTitleChange: (nextTitle: string) => void;
  onDraftBodyChange: (nextBody: string) => void;
  selectedRevision: Revision | null;
  setSelectedRevision: Dispatch<SetStateAction<Revision | null>>;
  revisionView: "list" | "preview" | "compare";
  setRevisionView: Dispatch<SetStateAction<"list" | "preview" | "compare">>;
  isSavingRevision: boolean;
  selectRevisionPreview: (revision: Revision) => void;
  selectRevisionCompare: (revision: Revision) => void;
  updateSelectedRevisionDraftNote: (value: string) => void;
  onRestoreRevision: (revision: Revision) => Promise<void>;
  onUpdateRevisionNote: (revision: Revision, note: string) => Promise<void>;
  resetRevisionSelection: () => void;
} {
  const [revisionModalOpen, setRevisionModalOpen] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [revisionKind, setRevisionKind] = useState<RevisionKind>("manual");
  const [selectedRevision, setSelectedRevision] = useState<Revision | null>(null);
  const [revisionView, setRevisionView] = useState<"list" | "preview" | "compare">("list");
  const [isSavingRevision, setIsSavingRevision] = useState(false);
  const [scriptValidation, setScriptValidation] = useState<ScriptValidationState | null>(null);

  const openRevisionModal = useCallback(() => {
    setRevisionModalOpen(true);
  }, []);

  const closeRevisionModal = useCallback(() => {
    setRevisionModalOpen(false);
    setRevisionNote("");
    setRevisionKind("manual");
  }, []);

  const onConfirmRevision = useCallback(async () => {
    if (!args.activeDraft) return;
    const now = Date.now();
    await args.persistRevisionDraft({
      draft: args.activeDraft,
      updatedAt: now,
      revision: { kind: revisionKind, note: revisionNote.trim() || undefined },
    });
    setRevisionModalOpen(false);
    setRevisionNote("");
    setRevisionKind("manual");
  }, [args, revisionKind, revisionNote]);

  const clearScriptValidation = useCallback(() => {
    setScriptValidation(null);
  }, []);

  const onDraftTitleChange = useCallback((nextTitle: string) => {
    args.setActiveDraft((prev) => {
      if (!prev) return prev;
      args.bumpDraftEditVersion();
      return { ...prev, title: nextTitle };
    });
  }, [args]);

  const onDraftBodyChange = useCallback((nextBody: string) => {
    args.setActiveDraft((prev) => {
      if (!prev) return prev;
      args.bumpDraftEditVersion();
      return { ...prev, body: nextBody };
    });
  }, [args]);

  const selectRevisionPreview = useCallback((revision: Revision) => {
    setSelectedRevision(revision);
    setRevisionView("preview");
  }, []);

  const selectRevisionCompare = useCallback((revision: Revision) => {
    setSelectedRevision(revision);
    setRevisionView("compare");
  }, []);

  const updateSelectedRevisionDraftNote = useCallback((value: string) => {
    setSelectedRevision((prev) => (prev ? { ...prev, note: value } : prev));
  }, []);

  const onRestoreRevision = useCallback(async (revision: Revision) => {
    if (!args.activeDraft) return;
    const confirmRestore = args.confirmRestore("Restore this revision? This will overwrite the current draft content.");
    if (!confirmRestore) return;

    const activeRevisionWorkpieceId = args.resolveRevisionWorkpieceId();
    if (!activeRevisionWorkpieceId) {
      args.reportRevisionPersistenceWarning(
        revision.kind,
        "Revision restore is unavailable until this draft is attached to an Episode.",
      );
      return;
    }

    const snapshot = await args.restoreRevisionSnapshot(activeRevisionWorkpieceId, revision.id);
    if (!snapshot) {
      args.setError("Revision not found.");
      return;
    }

    const now = Date.now();
    const restored: Draft = {
      ...args.activeDraft,
      title: snapshot.title,
      body: snapshot.body,
      updatedAt: now,
    };
    const restoredOk = await args.persistRestoredDraft({
      draft: restored,
      updatedAt: now,
    });
    if (restoredOk) {
      setRevisionView("preview");
    }
  }, [args]);

  const onUpdateRevisionNote = useCallback(async (revision: Revision, note: string) => {
    setIsSavingRevision(true);
    try {
      const activeRevisionWorkpieceId = args.resolveRevisionWorkpieceId();
      if (!activeRevisionWorkpieceId) {
        args.reportRevisionPersistenceWarning(
          revision.kind,
          "Revision note updates are unavailable until this draft is attached to an Episode.",
        );
        return;
      }

      const updated: Revision = {
        ...revision,
        note: note.trim() || undefined,
      };
      try {
        await args.saveRevisionRecord(activeRevisionWorkpieceId, updated);
        args.setAiRuntimeWarning(null);
      } catch {
        args.reportRevisionPersistenceWarning(
          revision.kind,
          "Saved revision note locally, but cloud sync failed.",
        );
      }

      const latest = await args.refreshRevisions(activeRevisionWorkpieceId, updated.draftId);
      setSelectedRevision(latest.find((item) => item.id === updated.id) ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update revision note.";
      args.setError(message);
    } finally {
      setIsSavingRevision(false);
    }
  }, [args]);

  const resetRevisionSelection = useCallback(() => {
    setRevisionView("list");
    setSelectedRevision(null);
  }, []);

  return {
    revisionModalOpen,
    revisionNote,
    revisionKind,
    setRevisionNote,
    setRevisionKind,
    openRevisionModal,
    closeRevisionModal,
    onConfirmRevision,
    scriptValidation,
    setScriptValidation,
    clearScriptValidation,
    onDraftTitleChange,
    onDraftBodyChange,
    selectedRevision,
    setSelectedRevision,
    revisionView,
    setRevisionView,
    isSavingRevision,
    selectRevisionPreview,
    selectRevisionCompare,
    updateSelectedRevisionDraftNote,
    onRestoreRevision,
    onUpdateRevisionNote,
    resetRevisionSelection,
  };
}
