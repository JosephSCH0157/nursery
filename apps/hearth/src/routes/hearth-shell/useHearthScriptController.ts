import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { Draft } from "../../domain/draft";
import type { Revision, RevisionKind } from "../../domain/revision";
import type {
  DraftSnapshot,
  ProposalSaveReasonCode,
} from "./hearth-shell-contracts";
import type { HearthStore } from "../../storage/hearth-store";
import { isCanonicalHearthRevisionSave } from "../../storage/hearth-store";
import { useHearthAutosave } from "../../hooks/useHearthAutosave";
import { useScriptWorkspace } from "../../hooks/useScriptWorkspace";
import {
  AUTOSAVE_DELAY_MS,
  AUTOSAVE_MIN_GAP_MS,
  AUTOSAVE_REVISION_GAP_MS,
} from "./hearth-shell-contracts";
import { normalizeUuid } from "./hearth-shell-route";
import { toProposalAutosaveReason } from "./hearth-shell-planning";
import type { HearthScriptController } from "./hearth-script-contracts";
import type { HearthOperationAuthority } from "../../lib/hearth-operation-authority";
import {
  NO_CANONICAL_SCRIPT_APPROVAL,
  isScriptApprovalStateEqual,
  readTongsCanonicalScriptApproval,
  resolveCanonicalScriptApproval,
  type ScriptApprovalState,
} from "../../lib/hearth-approval-authority";

export {
  useApprovalFlow as useHearthScriptApprovalFlow,
} from "../../hooks/useApprovalFlow";
export {
  useHearthApprovalPersistenceActions as useHearthScriptApprovalPersistenceActions,
} from "../../hooks/useHearthApprovalPersistenceActions";
export {
  useHearthDraftController as useHearthScriptDraftCommands,
} from "../../hooks/useHearthDraftController";
export {
  useHearthDraftHydrationActions as useHearthScriptDraftHydration,
} from "../../hooks/useHearthDraftHydrationActions";
export {
  useHearthDraftPersistenceActions as useHearthScriptDraftPersistence,
} from "../../hooks/useHearthDraftPersistenceActions";
export {
  useHearthScriptRepairActions,
} from "../../hooks/useHearthScriptRepairActions";
export {
  useScriptWorkspaceReadModel as useHearthScriptReadModel,
} from "../../hooks/useScriptWorkspaceReadModel";

export function useHearthScriptController(
  controller: HearthScriptController,
): HearthScriptController {
  return controller;
}

export function useHearthScriptCoreState(workpieceId: string | null) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeDraft, setActiveDraft] = useState<Draft | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const revisionWorkpieceId = useMemo(() => normalizeUuid(workpieceId), [workpieceId]);
  const [draftSnapshot, setDraftSnapshot] = useState<DraftSnapshot | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiAutosaveStatusAt, setAiAutosaveStatusAt] = useState<number | null>(null);
  const [aiAutosaveWarning, setAiAutosaveWarning] = useState<string | null>(null);
  const [isRepairingScript, setIsRepairingScript] = useState(false);
  return {
    state: {
      drafts,
      activeDraft,
      revisions,
      revisionWorkpieceId,
      draftSnapshot,
      isSaving,
      isLoading,
      error,
      aiAutosaveStatusAt,
      aiAutosaveWarning,
      isRepairingScript,
    },
    bindings: {
      setDrafts,
      setActiveDraft,
      setRevisions,
      setDraftSnapshot,
      setIsSaving,
      setIsLoading,
      setError,
      setAiAutosaveStatusAt,
      setAiAutosaveWarning,
      setIsRepairingScript,
    },
  };
}

export function useHearthScriptAuthorityRefs(drafts: Draft[]) {
  const draftEditVersionRef = useRef(0);
  const activeDraftRef = useRef<Draft | null>(null);
  const approveScriptActionRef = useRef<(options?: {
    draftOverride?: Draft;
  }) => Promise<boolean>>(async () => false);
  const draftSnapshotRef = useRef<DraftSnapshot | null>(null);
  const draftsRef = useRef<Draft[]>(drafts);
  return {
    draftEditVersionRef,
    activeDraftRef,
    approveScriptActionRef,
    draftSnapshotRef,
    draftsRef,
  };
}

export function useHearthCanonicalScriptApprovalState() {
  return useState<ScriptApprovalState>(NO_CANONICAL_SCRIPT_APPROVAL);
}

type PersistDraft = (args: {
  draft: Draft;
  updatedAt: number;
  createRevision: { kind: RevisionKind; note?: string } | null;
  syncSources?: boolean;
  syncSession?: boolean;
  showSavingState?: boolean;
  quietFailure?: boolean;
  saveReason?: string;
}) => Promise<boolean>;

export function useHearthScriptPersistenceWorkspace(args: {
  activeDraft: Draft | null;
  draftSnapshot: DraftSnapshot | null;
  revisions: Revision[];
  revisionWorkpieceId: string | null;
  isBodyComposing: boolean;
  persistDraft: PersistDraft;
  store: HearthStore;
  draftEditVersionRef: MutableRefObject<number>;
  setActiveDraft: Dispatch<SetStateAction<Draft | null>>;
  setRevisions: Dispatch<SetStateAction<Revision[]>>;
  setAiAutosaveWarning: Dispatch<SetStateAction<string | null>>;
  setAiAutosaveStatusAt: Dispatch<SetStateAction<number | null>>;
  setAiRuntimeWarning: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
}) {
  const lastAutosaveRevisionAt = useMemo(() => {
    const match = args.revisions.find((revision) => revision.kind === "autosave");
    return match?.createdAt ?? null;
  }, [args.revisions]);
  const isDirty = useMemo(() => {
    if (!args.activeDraft || !args.draftSnapshot) return false;
    return args.activeDraft.title !== args.draftSnapshot.title
      || args.activeDraft.body !== args.draftSnapshot.body;
  }, [args.activeDraft, args.draftSnapshot]);
  const persistAutosaveIO = useCallback(async (params: {
    draft: Draft;
    updatedAt: number;
    revision: { kind: RevisionKind; note?: string } | null;
    quietFailure: boolean;
    saveReason?: string;
  }) => args.persistDraft({
    draft: params.draft,
    updatedAt: params.updatedAt,
    createRevision: params.revision,
    syncSources: false,
    syncSession: false,
    showSavingState: false,
    quietFailure: params.quietFailure,
    saveReason: params.saveReason,
  }), [args.persistDraft]);
  const autosave = useHearthAutosave<Draft, ProposalSaveReasonCode, RevisionKind>({
    activeDraft: args.activeDraft,
    draftSnapshot: args.draftSnapshot,
    isDirty,
    isBodyComposing: args.isBodyComposing,
    lastAutosaveRevisionAt,
    autosaveDelayMs: AUTOSAVE_DELAY_MS,
    autosaveMinGapMs: AUTOSAVE_MIN_GAP_MS,
    autosaveRevisionGapMs: AUTOSAVE_REVISION_GAP_MS,
    autosaveRevisionKind: "autosave",
    persistAutosaveIO,
    toAiAutosaveSaveReason: toProposalAutosaveReason,
    retryReasonCode: "ai_rewrite",
    setAiAutosaveWarning: args.setAiAutosaveWarning,
    setAiAutosaveStatusAt: args.setAiAutosaveStatusAt,
  });
  const persistRevisionDraft = useCallback(async (params: {
    draft: Draft;
    updatedAt: number;
    revision: { kind: RevisionKind; note?: string };
  }) => args.persistDraft({
    draft: params.draft,
    updatedAt: params.updatedAt,
    createRevision: params.revision,
  }), [args.persistDraft]);
  const resolveRevisionWorkpieceId = useCallback((override?: string | null) => (
    normalizeUuid(override) ?? args.revisionWorkpieceId
  ), [args.revisionWorkpieceId]);
  const reportRevisionPersistenceWarning = useCallback((
    kind: RevisionKind | null,
    message: string,
  ) => {
    if (kind === "autosave") {
      args.setAiAutosaveWarning(message);
      return;
    }
    args.setAiRuntimeWarning(message);
  }, []);
  const refreshRevisions = useCallback(async (
    currentWorkpieceId: string | null,
    draftId?: string | null,
  ): Promise<Revision[]> => {
    const resolvedWorkpieceId = normalizeUuid(currentWorkpieceId);
    if (!resolvedWorkpieceId) {
      args.setRevisions([]);
      return [];
    }
    const list = await args.store.listRevisions(
      resolvedWorkpieceId,
      draftId?.trim() ? draftId : null,
    );
    args.setRevisions(list);
    return list;
  }, [args.store]);
  const revision = useScriptWorkspace({
    activeDraft: args.activeDraft,
    setActiveDraft: args.setActiveDraft,
    bumpDraftEditVersion: () => {
      args.draftEditVersionRef.current += 1;
    },
    persistRevisionDraft,
    resolveRevisionWorkpieceId: () => resolveRevisionWorkpieceId(),
    restoreRevisionSnapshot: (workpieceId, revisionId) => (
      args.store.restoreRevision(workpieceId, revisionId)
    ),
    persistRestoredDraft: (params) => args.persistDraft({
      draft: params.draft,
      updatedAt: params.updatedAt,
      createRevision: { kind: "manual", note: "Restored from revision" },
    }),
    saveRevisionRecord: async (workpieceId, revisionRecord) => {
      const acknowledgement = await args.store.saveRevision(workpieceId, revisionRecord);
      if (!isCanonicalHearthRevisionSave(acknowledgement)) {
        throw new Error("revision_snapshot_sync_failed");
      }
    },
    refreshRevisions,
    reportRevisionPersistenceWarning,
    setAiRuntimeWarning: args.setAiRuntimeWarning,
    setError: args.setError,
    confirmRestore: (message) => window.confirm(message),
  });
  return {
    ...autosave,
    ...revision,
    isDirty,
    resolveRevisionWorkpieceId,
    refreshRevisions,
    reportRevisionPersistenceWarning,
  };
}

export function useHearthScriptApprovalIdentityReset(args: {
  workpieceId: string | null;
  setScriptApprovalState: Dispatch<SetStateAction<ScriptApprovalState>>;
  setApprovalPersistenceStatus: (value: null) => void;
}) {
  useEffect(() => {
    args.setScriptApprovalState(NO_CANONICAL_SCRIPT_APPROVAL);
    args.setApprovalPersistenceStatus(null);
  }, [args.workpieceId]);
}

export function useHearthCanonicalScriptApprovalLoader(args: {
  activeDraftId: string | null;
  workpieceId: string | null;
  revisions: Revision[];
  operationAuthority: HearthOperationAuthority;
  store: Pick<HearthStore, "readCanonicalRevisions">;
  setScriptApprovalState: Dispatch<SetStateAction<ScriptApprovalState>>;
  writeRecoveryEvidence: (episodeId: string, state: ScriptApprovalState) => void;
}) {
  useEffect(() => {
    const episodeId = args.workpieceId?.trim() ?? "";
    const draftId = args.activeDraftId;
    let cancelled = false;
    args.setScriptApprovalState((previous) => (
      isScriptApprovalStateEqual(previous, NO_CANONICAL_SCRIPT_APPROVAL)
        ? previous
        : NO_CANONICAL_SCRIPT_APPROVAL
    ));
    if (!episodeId || !draftId) return () => { cancelled = true; };
    void Promise.allSettled([args.store.readCanonicalRevisions(episodeId, draftId),readTongsCanonicalScriptApproval(episodeId)]).then(([revisionRead,tongsRead]) => {
      if (cancelled) return;
      const result=revisionRead.status==="fulfilled"?revisionRead.value:null;
      const tongsApproval=tongsRead.status==="fulfilled"?tongsRead.value:NO_CANONICAL_SCRIPT_APPROVAL;
      const revisionApproval=result?.ok?resolveCanonicalScriptApproval(result.revisions,draftId):NO_CANONICAL_SCRIPT_APPROVAL;
      const resolved=revisionApproval.hasApprovedScript?revisionApproval:tongsApproval;
      args.setScriptApprovalState((previous) => (
        isScriptApprovalStateEqual(previous, resolved) ? previous : resolved
      ));
      args.writeRecoveryEvidence(episodeId, resolved);
    });
    return () => { cancelled = true; };
  }, [
    args.activeDraftId,
    args.revisions,
    args.store,
    args.workpieceId,
  ]);
}

export function useHearthScriptRevisionLoader(args: {
  activeDraftId: string | null;
  revisionWorkpieceId: string | null;
  refreshRevisions: (
    workpieceId: string | null,
    draftId?: string | null,
  ) => Promise<Revision[]>;
}) {
  useEffect(() => {
    if (!args.activeDraftId) return;
    void args.refreshRevisions(args.revisionWorkpieceId, args.activeDraftId);
  }, [
    args.activeDraftId,
    args.refreshRevisions,
    args.revisionWorkpieceId,
  ]);
}
