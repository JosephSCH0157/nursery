import { createRevision, type Revision, type RevisionKind } from "../domain/revision";
import type { Draft } from "../domain/draft";
import type { ScriptValidationResult } from "@forge/shared/script-tags";

export type DraftConflictState = {
  message: string;
  localBody: string;
};

export function parseHearthDraftConflictError(error: unknown): DraftConflictState | null {
  if (!error || typeof error !== "object") return null;
  const row = error as {
    code?: unknown;
    details?: unknown;
  };
  if (row.code !== "draft_conflict") return null;
  const details = row.details && typeof row.details === "object"
    ? row.details as Record<string, unknown>
    : null;
  const rawCurrentUpdatedAt = details?.current_updated_at;
  const currentUpdatedAt = typeof rawCurrentUpdatedAt === "string" ? rawCurrentUpdatedAt.trim() : "";
  const currentLabel = currentUpdatedAt ? new Date(currentUpdatedAt).toLocaleString() : "a newer save";
  return {
    message: `This draft changed on another client at ${currentLabel}. Reload latest to continue.`,
    localBody: "",
  };
}

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

type PersistDraftDeps = {
  mode: "sparks" | "episodes" | "ready" | "series" | "focus";
  focusTab: "draft" | "planning" | "sources" | "revisions";
  revisionView: "preview" | "compare" | "list";
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
    saveRevision: (workpieceId: string, revision: Revision) => Promise<void>;
    saveDraft: (draft: Draft, options?: { reason?: string }) => Promise<void>;
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

export async function persistHearthDraft(
  args: PersistDraftArgs,
  deps: PersistDraftDeps,
): Promise<boolean> {
  const showSavingState = args.showSavingState ?? true;
  const quietFailure = args.quietFailure ?? false;
  if (showSavingState) {
    deps.setIsSaving(true);
  }
  if (!quietFailure) {
    deps.setDraftConflictState(null);
    deps.setError(null);
  }
  const shouldValidateForAnvil = args.validateForAnvil === true;
  const { normalizedText, validation } = deps.evaluateScriptValidation(args.draft.body);
  const hasAnvilTagWarning = !validation.ok;
  if (hasAnvilTagWarning) {
    deps.setScriptValidation({
      source: shouldValidateForAnvil ? "save_gate" : "save_notice",
      result: validation,
    });
    if (shouldValidateForAnvil) {
      deps.setError(`Script tags must be valid before approval.\nFix the issues below to continue.\n\n${deps.buildValidationReport(validation)}`);
      if (showSavingState) deps.setIsSaving(false);
      return false;
    }
  } else {
    deps.setScriptValidation(null);
  }
  const editVersionAtStart = deps.draftEditVersionRef.current;
  try {
    let revisionCount = args.draft.revisionCount;
    let lastRevisionAt = args.draft.lastRevisionAt;
    let createdRevision: Revision | null = null;
    let refreshedRevisions: Revision[] | null = null;

    if (args.createRevision) {
      createdRevision = createRevision({
        draftId: args.draft.id,
        title: deps.normalizeTitle(args.draft.title),
        body: args.draft.body,
        kind: args.createRevision.kind,
        note: args.createRevision.note,
      });
      const activeRevisionWorkpieceId = deps.resolveRevisionWorkpieceId();
      if (!activeRevisionWorkpieceId) {
        deps.reportRevisionPersistenceWarning(
          args.createRevision.kind,
          "Saved draft, but revision history is unavailable until this draft is attached to an Episode.",
        );
      } else {
        try {
          await deps.store.saveRevision(activeRevisionWorkpieceId, createdRevision);
          if (args.createRevision.kind === "autosave") {
            deps.setAiAutosaveWarning(null);
          } else {
            deps.setAiRuntimeWarning(null);
          }
        } catch (err) {
          const message = err instanceof Error && err.message === "revision_snapshot_sync_failed"
            ? "Saved draft, but revision history was kept locally and not synced to cloud."
            : "Saved draft, but revision history could not be synced.";
          deps.reportRevisionPersistenceWarning(args.createRevision.kind, message);
        }

        refreshedRevisions = await deps.refreshRevisions(activeRevisionWorkpieceId, args.draft.id);
        revisionCount = refreshedRevisions.length;
        lastRevisionAt = refreshedRevisions[0]?.createdAt;
      }
    }

    const toSave: Draft = {
      ...args.draft,
      title: deps.normalizeTitle(args.draft.title),
      body: normalizedText,
      updatedAt: args.updatedAt,
      revisionCount,
      lastRevisionAt,
      createdBy: args.draft.createdBy ?? deps.buildDraftAttribution(deps.hearthUser),
      updatedBy: deps.buildDraftAttribution(deps.hearthUser),
      scriptValidationMeta: deps.buildPersistedValidationMeta(validation),
    };

    await deps.store.saveDraft(toSave, { reason: args.saveReason });

    const latestActiveDraft = deps.activeDraftRef.current;
    const hasNewerEdits = latestActiveDraft?.id === toSave.id
      && deps.draftEditVersionRef.current !== editVersionAtStart;

    if (!hasNewerEdits) {
      deps.setActiveDraft(toSave);
      deps.setDraftSnapshot({ title: toSave.title, body: toSave.body, updatedAt: toSave.updatedAt });
    }
    deps.setDrafts((prev) => {
      const exists = prev.some((d) => d.id === toSave.id);
      const next = exists
        ? prev.map((d) => (d.id === toSave.id ? toSave : d))
        : [toSave, ...prev];
      return deps.dedupeDraftListById(next);
    });

    if (createdRevision && refreshedRevisions) {
      const selected = refreshedRevisions.find((revision) => revision.id === createdRevision?.id) ?? null;
      deps.setSelectedRevision(selected);
      deps.setRevisionView("preview");
    }

    const tab = deps.mode === "focus"
      ? (deps.focusTab === "revisions" ? deps.revisionView : deps.focusTab)
      : deps.mode;
    await deps.persistSession(toSave.id, tab);
    if (args.syncSources) {
      deps.syncSources();
    }
    if (args.syncSession) {
      void deps.syncSessionToTongs();
    }
    deps.setDraftConflictState(null);
    return true;
  } catch (err) {
    const conflict = parseHearthDraftConflictError(err);
    if (conflict) {
      if (!quietFailure) {
        const withLocalBody: DraftConflictState = {
          ...conflict,
          localBody: args.draft.body,
        };
        deps.setDraftConflictState(withLocalBody);
        deps.setError(withLocalBody.message);
      }
      return false;
    }
    if (!quietFailure) {
      const message = err instanceof Error ? err.message : "Failed to save draft.";
      deps.setError(message);
    }
    return false;
  } finally {
    if (showSavingState) {
      deps.setIsSaving(false);
    }
  }
}

type PersistDraftMetaDeps = {
  activeDraftId: string | null;
  hearthUser: { userId: string | null; displayName: string };
  normalizeTitle: (value: string) => string;
  buildDraftAttribution: (user: { userId: string | null; displayName: string }) => {
    userId: string | null;
    displayName: string | null;
  };
  dedupeDraftListById: (input: Draft[]) => Draft[];
  store: {
    saveDraft: (draft: Draft, options?: { reason?: string }) => Promise<void>;
  };
  setScriptValidation: (next: null) => void;
  setDrafts: (next: Draft[] | ((prev: Draft[]) => Draft[])) => void;
  setActiveDraft: (next: Draft) => void;
  setDraftSnapshot: (next: { title: string; body: string; updatedAt: number }) => void;
};

export async function persistHearthDraftMeta(
  draft: Draft,
  updates: Partial<Draft>,
  deps: PersistDraftMetaDeps,
): Promise<void> {
  const now = Date.now();
  const toSave: Draft = {
    ...draft,
    ...updates,
    title: deps.normalizeTitle(updates.title ?? draft.title),
    updatedAt: now,
    createdBy: draft.createdBy ?? deps.buildDraftAttribution(deps.hearthUser),
    updatedBy: deps.buildDraftAttribution(deps.hearthUser),
  };
  deps.setScriptValidation(null);
  await deps.store.saveDraft(toSave);
  deps.setDrafts((prev) => deps.dedupeDraftListById(prev.map((d) => (d.id === toSave.id ? toSave : d))));
  if (deps.activeDraftId === toSave.id) {
    deps.setActiveDraft(toSave);
    deps.setDraftSnapshot({ title: toSave.title, body: toSave.body, updatedAt: toSave.updatedAt });
  }
}
