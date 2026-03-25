import { useCallback, useState } from "react";
import type { Draft } from "../domain/draft";
import type { RevisionKind } from "../domain/revision";

type UseScriptWorkspaceArgs = {
  activeDraft: Draft | null;
  persistRevisionDraft: (args: {
    draft: Draft;
    updatedAt: number;
    revision: { kind: RevisionKind; note?: string };
  }) => Promise<boolean>;
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
} {
  const [revisionModalOpen, setRevisionModalOpen] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [revisionKind, setRevisionKind] = useState<RevisionKind>("manual");

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

  return {
    revisionModalOpen,
    revisionNote,
    revisionKind,
    setRevisionNote,
    setRevisionKind,
    openRevisionModal,
    closeRevisionModal,
    onConfirmRevision,
  };
}

