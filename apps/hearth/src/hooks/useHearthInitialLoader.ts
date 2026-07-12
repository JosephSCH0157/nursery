import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Draft } from "../domain/draft";
import type { Revision } from "../domain/revision";
import type { HearthSession } from "../domain/session";
import { listHearthWorkpieces, type HearthWorkpieceSummary } from "../lib/hearth-workpieces";
import type { LocalSessionStore } from "../storage/local-session-store";
import { describeHearthDependencyFailure } from "../lib/hearth-dependency-state";

type UseHearthInitialLoaderArgs = {
  initialLoadKey: string;
  incomingBarStockIntakeRoute: boolean;
  workspaceId: string | null;
  routeProjectId: string | null;
  routeSparkId: string | null;
  normalizeUuid: (value: string | null | undefined) => string | null;
  resolveWorkspaceId: () => string | null;
  resolveWorkpieceIdForDraftId: (
    draftId: string | null,
    options?: {
      drafts?: readonly Draft[];
      workpieces?: readonly HearthWorkpieceSummary[];
    },
  ) => string | null;
  openWorkpieceInFocus: (
    targetWorkpieceId: string,
    options?: {
      workspaceId?: string | null;
      drafts?: readonly Draft[];
      workpieces?: readonly HearthWorkpieceSummary[];
      preferredDraftId?: string | null;
    },
  ) => Promise<Draft | null>;
  sessionStore: LocalSessionStore;
  store: { listDrafts: () => Promise<Draft[]> };
  dedupeDraftListById: (input: Draft[]) => Draft[];
  workpieceIdRef: MutableRefObject<string | null>;
  activeDraftRef: MutableRefObject<Draft | null>;
  intakeResetKeyRef: MutableRefObject<string | null>;
  restoredCursorDraftIdRef: MutableRefObject<string | null>;
  draftsRef: MutableRefObject<Draft[]>;
  workpieceSummariesRef: MutableRefObject<HearthWorkpieceSummary[]>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setSession: Dispatch<SetStateAction<HearthSession | null>>;
  setWorkpieceSummaries: Dispatch<SetStateAction<HearthWorkpieceSummary[]>>;
  setDrafts: Dispatch<SetStateAction<Draft[]>>;
  setWorkpiecesError: Dispatch<SetStateAction<string | null>>;
  setRevisionView: Dispatch<SetStateAction<"list" | "preview" | "compare">>;
  setFocusTab: Dispatch<SetStateAction<"draft" | "planning" | "sources" | "revisions">>;
  setWorkpieceId: Dispatch<SetStateAction<string | null>>;
  setActiveDraft: Dispatch<SetStateAction<Draft | null>>;
  clearDraftSnapshot: () => void;
  setRevisions: Dispatch<SetStateAction<Revision[]>>;
  setSelectedRevision: Dispatch<SetStateAction<Revision | null>>;
};

export function useHearthInitialLoader(args: UseHearthInitialLoaderArgs) {
  const loadInitial = useCallback(async () => {
    args.setIsLoading(true);
    args.setError(null);
    try {
      if (args.incomingBarStockIntakeRoute) {
        const intakeResetKey = `${args.normalizeUuid(args.workspaceId) ?? args.resolveWorkspaceId() ?? "none"}:${args.routeProjectId ?? args.routeSparkId ?? "none"}`;
        if (args.intakeResetKeyRef.current !== intakeResetKey) {
          args.intakeResetKeyRef.current = intakeResetKey;
          args.setSession(null);
          args.restoredCursorDraftIdRef.current = null;
          args.setWorkpieceSummaries([]);
          args.setDrafts([]);
          args.setWorkpieceId(null);
          args.setActiveDraft(null);
          args.clearDraftSnapshot();
          args.setRevisions([]);
          args.setSelectedRevision(null);
        }
        return;
      }

      const workspace = args.normalizeUuid(args.workspaceId) ?? args.resolveWorkspaceId();
      const [storedSession, list, workpiecesResult] = await Promise.all([
        args.sessionStore.getSession(),
        args.store.listDrafts(),
        workspace
          ? listHearthWorkpieces(workspace, {
              includeArchived: Boolean(args.normalizeUuid(args.workpieceIdRef.current)),
            })
              .then((workpieces) => ({ ok: true as const, workpieces }))
              .catch((error: unknown) => ({ ok: false as const, error }))
          : Promise.resolve({ ok: true as const, workpieces: [] as HearthWorkpieceSummary[] }),
      ]);
      const loadedWorkpieces = workpiecesResult.ok ? workpiecesResult.workpieces : [];

      args.setSession(storedSession);
      const dedupedDrafts = args.dedupeDraftListById(list);
      args.draftsRef.current = dedupedDrafts;
      args.setDrafts(dedupedDrafts);
      args.workpieceSummariesRef.current = loadedWorkpieces;
      args.setWorkpieceSummaries(loadedWorkpieces);
      args.setWorkpiecesError(workpiecesResult.ok
        ? null
        : describeHearthDependencyFailure(workpiecesResult.error, "Failed to load Episodes."));

      const tab = storedSession?.uiState?.selectedTab;
      if (tab === "preview" || tab === "compare" || tab === "list") {
        args.setRevisionView(tab);
      }
      if (tab === "draft" || tab === "planning" || tab === "sources" || tab === "revisions") {
        args.setFocusTab(tab);
      }

      const candidateDraftIds: string[] = [];
      const pushCandidateDraftId = (value: string | null | undefined) => {
        const next = value?.trim();
        if (!next || candidateDraftIds.includes(next)) return;
        candidateDraftIds.push(next);
      };

      pushCandidateDraftId(storedSession?.activeDraftId ?? null);
      pushCandidateDraftId(args.activeDraftRef.current?.id ?? null);

      const explicitWorkpieceId = args.normalizeUuid(args.workpieceIdRef.current);
      const resolvedWorkpieceId = explicitWorkpieceId
        ?? args.normalizeUuid(storedSession?.activeWorkpieceId ?? null)
        ?? candidateDraftIds
          .map((draftId) => args.resolveWorkpieceIdForDraftId(draftId, {
            drafts: dedupedDrafts,
            workpieces: loadedWorkpieces,
          }))
          .find((value): value is string => Boolean(value))
        ?? null;

      if (resolvedWorkpieceId) {
        await args.openWorkpieceInFocus(resolvedWorkpieceId, {
          workspaceId: workspace,
          drafts: dedupedDrafts,
          workpieces: loadedWorkpieces,
          preferredDraftId: storedSession?.activeDraftId ?? args.activeDraftRef.current?.id ?? null,
        });
        return;
      }

      args.restoredCursorDraftIdRef.current = null;
      args.setWorkpieceId(null);
      args.setActiveDraft(null);
      args.clearDraftSnapshot();
      args.setRevisions([]);
      args.setSelectedRevision(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load drafts.";
      args.setError(message);
    } finally {
      args.setIsLoading(false);
    }
  }, [args]);

  const loadInitialRef = useRef<(() => Promise<void>) | null>(null);
  const lastInitialLoadKeyRef = useRef<string | null>(null);

  useEffect(() => {
    loadInitialRef.current = loadInitial;
  }, [loadInitial]);

  useEffect(() => {
    if (lastInitialLoadKeyRef.current === args.initialLoadKey) return;
    lastInitialLoadKeyRef.current = args.initialLoadKey;
    void loadInitialRef.current?.();
  }, [args.initialLoadKey]);
}
