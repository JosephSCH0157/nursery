import { useEffect, useLayoutEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Draft } from "../domain/draft";
import type { Revision } from "../domain/revision";
import type { HearthSession } from "../domain/session";
import { listHearthWorkpieces, type HearthWorkpieceSummary } from "../lib/hearth-workpieces";
import type { LocalSessionStore } from "../storage/local-session-store";
import type { HearthDraftReadOptions } from "../storage/hearth-store";
import { describeHearthDependencyFailure } from "../lib/hearth-dependency-state";
import { validateBarstockProjectEpisode } from "../lib/barstock-project-links";
import { hearthLoadCancelled, recoverInitialHearthDiscovery, type HearthFocusHandoff, type HearthLoadGuard } from "../lib/hearth-discovery-retry";

type UseHearthInitialLoaderArgs = {
  initialLoadKey: string;
  requestedWorkpieceId?: string | null;
  focusHandoffRef?: MutableRefObject<HearthFocusHandoff | null>;
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
      loadGuard?: HearthLoadGuard;
    },
  ) => Promise<Draft | null>;
  sessionStore: LocalSessionStore;
  store: { listDrafts: (options?: HearthDraftReadOptions) => Promise<Draft[]> };
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

type InitialLoad = {
  key: string;
  requested: string | null;
  adopted: string | null;
  controller: AbortController;
};

function requestedIdentity(args: UseHearthInitialLoaderArgs): string | null {
  return args.requestedWorkpieceId === undefined ? args.workpieceIdRef.current : args.requestedWorkpieceId;
}

function loadScope(args: UseHearthInitialLoaderArgs): string {
  return JSON.stringify([args.initialLoadKey, args.workspaceId ?? args.resolveWorkspaceId(), args.routeProjectId, args.routeSparkId, args.incomingBarStockIntakeRoute]);
}

export function useHearthInitialLoader(args: UseHearthInitialLoaderArgs) {
  const latest = useRef(args);
  const active = useRef<InitialLoad | null>(null);
  const matches = (operation: InitialLoad, current: UseHearthInitialLoaderArgs) =>
    operation.key === loadScope(current) &&
    (operation.requested === requestedIdentity(current) ||
      (operation.adopted !== null && operation.adopted === requestedIdentity(current)));

  useLayoutEffect(() => {
    latest.current = args;
    const operation = active.current;
    if (!operation) return;
    if (!matches(operation, args)) operation.controller.abort(hearthLoadCancelled());
    else if (operation.adopted === requestedIdentity(args)) operation.requested = operation.adopted;
  });

  useEffect(() => () => {
    active.current?.controller.abort(hearthLoadCancelled());
    active.current = null;
  }, []);

  useEffect(() => {
    const focusHandoff = args.focusHandoffRef?.current;
    const ordinaryFocusOwnsHandoff = focusHandoff && focusHandoff.scopeKey === args.initialLoadKey &&
      focusHandoff.workspaceId === (args.workspaceId ?? args.resolveWorkspaceId()) &&
      focusHandoff.workpieceId === requestedIdentity(args);
    // Retain terminal outcomes for this identity; rendering is not a retry.
    if (active.current && matches(active.current, args) && !ordinaryFocusOwnsHandoff) return;
    active.current?.controller.abort(hearthLoadCancelled());
    const operation: InitialLoad = {
      key: loadScope(args), requested: requestedIdentity(args), adopted: null, controller: new AbortController(),
    };
    active.current = operation;
    if (ordinaryFocusOwnsHandoff) {
      // Do not race the ordinary focus owner with a second hydration/save.
      // This marker cannot select a canonical workpiece or authorize a write.
      args.focusHandoffRef!.current = null;
      args.setIsLoading(false);
      return;
    }
    if (args.focusHandoffRef) args.focusHandoffRef.current = null;
    const isCurrent = () => active.current === operation &&
      !operation.controller.signal.aborted && !args.focusHandoffRef?.current && matches(operation, latest.current);
    const loadGuard: HearthLoadGuard = { assertCurrent() { if (!isCurrent()) throw hearthLoadCancelled(); } };

    const load = async () => {
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
        if (args.workspaceId && !args.normalizeUuid(args.workspaceId)) throw new Error("Invalid workspace identity.");
        if (operation.requested && !args.normalizeUuid(operation.requested)) throw new Error("Invalid Episode identity.");
        // Do not let a cache-hydrating store read precede canonical discovery.
        // Local session preferences alone cannot authorize a workpiece read.
        const preferences = args.sessionStore.getSession()
          .then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }));
        const loadedWorkpieces = workspace
          ? await recoverInitialHearthDiscovery((signal) => listHearthWorkpieces(workspace, {
              includeArchived: Boolean(args.normalizeUuid(operation.requested)), signal,
            }), operation.controller.signal)
          : [];
        loadGuard.assertCurrent();
        const stored = await preferences;
        loadGuard.assertCurrent();
        if (!stored.ok) throw stored.error;
        const storedSession = stored.value;
        const canonicalIds = new Set(loadedWorkpieces.filter((entry) => entry.workspaceId === workspace).map((entry) => entry.workpieceId));
        const explicitWorkpieceId = args.normalizeUuid(operation.requested);
        if (explicitWorkpieceId && !canonicalIds.has(explicitWorkpieceId)) throw new Error("The requested Episode is unavailable in this workspace.");
        const list = await args.store.listDrafts({ ...loadGuard, canonicalWorkpieceIds: canonicalIds });
        loadGuard.assertCurrent();
        const dedupedDrafts = args.dedupeDraftListById(list);
        const candidates = [
          explicitWorkpieceId,
          args.normalizeUuid(storedSession?.activeWorkpieceId),
          ...[storedSession?.activeDraftId, args.activeDraftRef.current?.id].map((draftId) =>
            args.resolveWorkpieceIdForDraftId(draftId ?? null, { drafts: dedupedDrafts, workpieces: loadedWorkpieces })),
        ];
        const resolvedWorkpieceId = candidates.find((id): id is string => Boolean(id && canonicalIds.has(id))) ?? null;
        if (resolvedWorkpieceId && args.routeProjectId) {
          const valid = workspace && await validateBarstockProjectEpisode({
            workspaceId: workspace, projectId: args.routeProjectId, workpieceId: resolvedWorkpieceId,
          });
          loadGuard.assertCurrent();
          if (!valid) throw new Error("This Episode does not belong to the requested Project.");
        }
        loadGuard.assertCurrent();
        args.setSession(storedSession);
        args.draftsRef.current = dedupedDrafts;
        args.setDrafts(dedupedDrafts);
        args.workpieceSummariesRef.current = loadedWorkpieces;
        args.setWorkpieceSummaries(loadedWorkpieces);
        args.setWorkpiecesError(null);
        const tab = storedSession?.uiState?.selectedTab;
        if (tab === "preview" || tab === "compare" || tab === "list") args.setRevisionView(tab);
        if (tab === "draft" || tab === "planning" || tab === "sources" || tab === "revisions") args.setFocusTab(tab);

        if (resolvedWorkpieceId) {
          operation.adopted = resolvedWorkpieceId;
          await args.openWorkpieceInFocus(resolvedWorkpieceId, {
            workspaceId: workspace, drafts: dedupedDrafts, workpieces: loadedWorkpieces,
            preferredDraftId: storedSession?.activeDraftId ?? args.activeDraftRef.current?.id ?? null,
            loadGuard,
          });
          return;
        }
        args.restoredCursorDraftIdRef.current = null;
        args.setWorkpieceId(null);
        args.setActiveDraft(null);
        args.clearDraftSnapshot();
        args.setRevisions([]);
        args.setSelectedRevision(null);
      } catch (error) {
        if (!isCurrent()) return;
        // A newer focus-open may supersede this handoff without changing the
        // discovery identity. It must not clear the newer draft or show an error.
        if (error instanceof DOMException && error.name === "AbortError") return;
        const message = describeHearthDependencyFailure(error, "Failed to load Episodes.");
        args.setWorkpiecesError(message);
        args.setError(message);
        args.setActiveDraft(null);
        args.clearDraftSnapshot();
        args.setIsLoading(false);
        operation.controller.abort(hearthLoadCancelled());
      } finally {
        if (isCurrent()) args.setIsLoading(false);
      }
    };
    void load();
  });
}
