import { useCallback } from "react";
import type { Draft } from "../domain/draft";
import type { Revision, RevisionKind } from "../domain/revision";
import type { ScriptValidationResult } from "@forge/shared/script-tags";
import {
  persistHearthDraft,
  persistHearthDraftMeta,
  type DraftConflictState,
} from "../lib/hearth-draft-persistence";
import type {
  HearthDraftSaveAcknowledgement,
  HearthRevisionSaveAcknowledgement,
} from "../storage/hearth-store";

type PersistDraftArgs = {
  draft: Draft;
  updatedAt: number;
  createRevision: { kind: RevisionKind; note?: string } | null;
  syncSources?: boolean;
  syncSession?: boolean;
  showSavingState?: boolean;
  validateForAnvil?: boolean;
  quietFailure?: boolean;
  saveReason?: string;
};

type UseHearthDraftPersistenceActionsArgs = {
  mode: "sparks" | "episodes" | "ready" | "series" | "focus";
  focusTab: "draft" | "planning" | "sources" | "revisions";
  revisionView: "preview" | "compare" | "list";
  activeDraftId: string | null;
  hearthUser: { userId: string | null; displayName: string };
  evaluateScriptValidation: (rawText: string) => {
    normalizedText: string;
    validation: ScriptValidationResult;
  };
  buildValidationReport: (validation: ScriptValidationResult) => string;
  normalizeTitle: (value: string) => string;
  buildDraftAttribution: (user: { userId: string | null; displayName: string }) => {
    userId: string | null;
    displayName: string | null;
  };
  buildPersistedValidationMeta: (validation: ScriptValidationResult) => Draft["scriptValidationMeta"];
  resolveRevisionWorkpieceId: () => string | null;
  reportRevisionPersistenceWarning: (kind: RevisionKind | null, message: string) => void;
  refreshRevisions: (currentWorkpieceId: string | null, draftId?: string | null) => Promise<Revision[]>;
  persistSession: (draftId: string | null, uiSelectedTab?: string) => Promise<void>;
  syncSources: () => void;
  syncSessionToTongs: () => Promise<void>;
  dedupeDraftListById: (input: Draft[]) => Draft[];
  draftEditVersionRef: { current: number };
  activeDraftRef: { current: Draft | null };
  store: {
    saveRevision: (workpieceId: string, revision: Revision) => Promise<HearthRevisionSaveAcknowledgement>;
    saveDraft: (draft: Draft, options?: { reason?: string }) => Promise<HearthDraftSaveAcknowledgement>;
  };
  setIsSaving: (next: boolean) => void;
  setDraftConflictState: (next: DraftConflictState | null) => void;
  setError: (next: string | null) => void;
  setScriptValidation: (next: {
    source: "save_gate" | "save_notice" | "ai_repair";
    result: ScriptValidationResult;
  } | null) => void;
  setAiAutosaveWarning: (next: string | null) => void;
  setAiRuntimeWarning: (next: string | null) => void;
  setActiveDraft: (next: Draft | ((prev: Draft | null) => Draft | null)) => void;
  setDraftSnapshot: (next: { title: string; body: string; updatedAt: number } | null) => void;
  setDrafts: (next: Draft[] | ((prev: Draft[]) => Draft[])) => void;
  setSelectedRevision: (next: Revision | null) => void;
  setRevisionView: (next: "preview" | "compare" | "list") => void;
};

export function useHearthDraftPersistenceActions(args: UseHearthDraftPersistenceActionsArgs) {
  const persistDraft = useCallback(async (draftArgs: PersistDraftArgs): Promise<boolean> => (
    persistHearthDraft(draftArgs, {
      mode: args.mode,
      focusTab: args.focusTab,
      revisionView: args.revisionView,
      hearthUser: args.hearthUser,
      evaluateScriptValidation: args.evaluateScriptValidation,
      buildValidationReport: args.buildValidationReport,
      normalizeTitle: args.normalizeTitle,
      buildDraftAttribution: args.buildDraftAttribution,
      buildPersistedValidationMeta: args.buildPersistedValidationMeta,
      resolveRevisionWorkpieceId: args.resolveRevisionWorkpieceId,
      reportRevisionPersistenceWarning: args.reportRevisionPersistenceWarning,
      refreshRevisions: args.refreshRevisions,
      persistSession: args.persistSession,
      syncSources: args.syncSources,
      syncSessionToTongs: args.syncSessionToTongs,
      dedupeDraftListById: args.dedupeDraftListById,
      draftEditVersionRef: args.draftEditVersionRef,
      activeDraftRef: args.activeDraftRef,
      store: args.store,
      setIsSaving: args.setIsSaving,
      setDraftConflictState: args.setDraftConflictState,
      setError: args.setError,
      setScriptValidation: args.setScriptValidation,
      setAiAutosaveWarning: args.setAiAutosaveWarning,
      setAiRuntimeWarning: args.setAiRuntimeWarning,
      setActiveDraft: args.setActiveDraft,
      setDraftSnapshot: args.setDraftSnapshot,
      setDrafts: args.setDrafts,
      setSelectedRevision: args.setSelectedRevision,
      setRevisionView: args.setRevisionView,
    })
  ), [args]);

  const saveDraftMeta = useCallback(async (draft: Draft, updates: Partial<Draft>) => (
    persistHearthDraftMeta(draft, updates, {
      activeDraftId: args.activeDraftId,
      hearthUser: args.hearthUser,
      normalizeTitle: args.normalizeTitle,
      buildDraftAttribution: args.buildDraftAttribution,
      dedupeDraftListById: args.dedupeDraftListById,
      store: args.store,
      setError: args.setError,
      setScriptValidation: () => args.setScriptValidation(null),
      setDrafts: args.setDrafts,
      setActiveDraft: args.setActiveDraft as (next: Draft) => void,
      setDraftSnapshot: args.setDraftSnapshot as (next: { title: string; body: string; updatedAt: number }) => void,
    })
  ), [args]);

  return {
    persistDraft,
    saveDraftMeta,
  };
}
