import type { Draft } from "../../domain/draft";
import type { Revision, RevisionKind } from "../../domain/revision";
import type { ScriptValidationResult } from "@forge/shared/script-tags";
import type {
  ApprovalPersistenceStatus,
  DraftConflictState,
  DraftSnapshot,
} from "./hearth-shell-contracts";
import type { HearthWritingFormat } from "../../lib/hearth-writing-format";

export type HearthScriptHydrationStatus =
  | "idle"
  | "loading"
  | "missing"
  | "loaded"
  | "unavailable"
  | "failed";

export type HearthScriptController = {
  state: {
    draft: Draft | null;
    drafts: Draft[];
    revision: {
      items: Revision[];
      selected: Revision | null;
      kind: RevisionKind;
      note: string;
    };
    approval: {
      hasApprovedScript: boolean;
      approvedScriptVersion: number | null;
      approvedAt: number | null;
    };
    formatting: {
      writingFormat: HearthWritingFormat;
      validation: {
        source: "save_notice" | "save_gate" | "ai_apply" | "ai_repair";
        result: ScriptValidationResult;
      } | null;
    };
    conflict: DraftConflictState | null;
    selection: {
      revisionWorkpieceId: string | null;
    };
  };
  commands: {
    selectDraft: (draft: Draft | null, options?: {
      revisionWorkpieceId?: string | null;
    }) => Promise<void>;
    updateDraft: {
      title: (value: string) => void;
      body: (value: string) => void;
    };
    saveDraft: () => Promise<void>;
    retrySave: () => void;
    resolveConflict: {
      reloadLatest: () => Promise<void>;
      copyLocalText: () => Promise<boolean>;
    };
    createRevision: () => Promise<void>;
    restoreRevision: (revision: Revision) => Promise<void>;
    approveScript: (options?: { draftOverride?: Draft }) => Promise<boolean>;
    applyApprovedScript: (draft: Draft) => Promise<boolean>;
    formatScript: () => Promise<void>;
    repairScript: () => Promise<void>;
    refreshAuthority: () => Promise<void>;
  };
  status: {
    hydration: HearthScriptHydrationStatus;
    save: "idle" | "saving" | "saved" | "unsaved" | "failed";
    approval: "absent" | "available" | "approving" | "unavailable";
    formatting: "idle" | "repairing";
    authority: "available" | "unavailable";
    approvalPersistence: ApprovalPersistenceStatus | null;
  };
  surfaces: {
    script: {
      draft: Draft | null;
      snapshot: DraftSnapshot | null;
      isDirty: boolean;
      error: string | null;
    };
    history: {
      revisions: Revision[];
      selectedRevision: Revision | null;
      view: "list" | "preview" | "compare";
    };
  };
};
