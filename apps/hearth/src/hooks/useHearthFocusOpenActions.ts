import { useCallback, useEffect, useLayoutEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { hearthLoadCancelled, type HearthFocusHandoff, type HearthLoadGuard } from "../lib/hearth-discovery-retry";
import type { Draft } from "../domain/draft";
import type { HearthWorkpieceSummary } from "../lib/hearth-workpieces";
import type { WorkpieceWorkspaceTab } from "../lib/hearth-workpiece-tab-shell";

type HearthMode = "sparks" | "episodes" | "ready" | "series" | "focus";

type UseHearthFocusOpenActionsArgs = {
  initialLoadKey?: string;
  normalizeUuid: (value: string | null | undefined) => string | null;
  workspaceId: string | null;
  isMobile: boolean;
  draftsRef: MutableRefObject<Draft[]>;
  workpieceSummariesRef: MutableRefObject<HearthWorkpieceSummary[]>;
  pendingFocusOpenCountRef: MutableRefObject<number>;
  pendingDraftEditorPanelRef: MutableRefObject<"script" | "manual" | null>;
  setWorkspaceId: Dispatch<SetStateAction<string | null>>;
  setActiveWorkpieceTab: Dispatch<SetStateAction<WorkpieceWorkspaceTab>>;
  setWorkpieceId: Dispatch<SetStateAction<string | null>>;
  setFocusTab: Dispatch<SetStateAction<"draft" | "planning" | "sources" | "revisions">>;
  setMode: Dispatch<SetStateAction<HearthMode>>;
  setMobileOverlayView: Dispatch<SetStateAction<"editor" | "ready" | null>>;
  clearActiveDraftSelection: () => void;
  writeWorkpieceWorkspaceTab: (workpieceId: string | null, workspaceId: string | null, tab: WorkpieceWorkspaceTab) => void;
  replaceHearthRouteContext: (workspaceId: string | null, workpieceId: string | null) => void;
  refreshWorkpieces: (
    workspaceIdOverride?: string | null,
    options?: { includeArchived?: boolean },
  ) => Promise<HearthWorkpieceSummary[]>;
  selectDraft: (
    draft: Draft | null,
    options?: { revisionWorkpieceId?: string | null; loadGuard?: HearthLoadGuard },
  ) => Promise<void>;
  persistSession: (draftId: string | null, uiSelectedTab?: string, loadGuard?: HearthLoadGuard) => Promise<void>;
  hydrateOrCreateDraftBufferForWorkpiece: (
    targetWorkpieceId: string,
    options?: {
      drafts?: readonly Draft[];
      workpieces?: readonly HearthWorkpieceSummary[];
      preferredDraftId?: string | null;
      seed?: { title?: string; body?: string };
      loadGuard?: HearthLoadGuard;
    },
  ) => Promise<Draft | null>;
};

export function useHearthFocusOpenActions(args: UseHearthFocusOpenActionsArgs) {
  const generation = useRef(0);
  const focusHandoffRef = useRef<HearthFocusHandoff | null>(null);
  const mounted = useRef(true);
  const currentWorkspace = useRef(args.workspaceId);
  useLayoutEffect(() => { currentWorkspace.current = args.workspaceId; });
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; };
  }, []);
  const openWorkpieceInFocus = useCallback(async (
    targetWorkpieceId: string,
    options?: {
      workspaceId?: string | null;
      drafts?: readonly Draft[];
      workpieces?: readonly HearthWorkpieceSummary[];
      preferredDraftId?: string | null;
      seed?: { title?: string; body?: string };
      preferredWorkspaceTab?: WorkpieceWorkspaceTab;
      preferredEditorPanel?: "script" | "manual" | null;
      loadGuard?: HearthLoadGuard;
    },
  ): Promise<Draft | null> => {
    const normalizedWorkpieceId = args.normalizeUuid(targetWorkpieceId);
    if (!normalizedWorkpieceId) return null;

    const targetWorkspaceId = args.normalizeUuid(options?.workspaceId ?? args.workspaceId) ?? args.workspaceId;
    options?.loadGuard?.assertCurrent();
    const sequence = ++generation.current;
    focusHandoffRef.current = !options?.loadGuard && args.initialLoadKey ? {
      scopeKey: args.initialLoadKey, workspaceId: targetWorkspaceId, workpieceId: normalizedWorkpieceId,
    } : null;
    const loadGuard = options?.loadGuard ? {
      assertCurrent() {
        options.loadGuard!.assertCurrent();
        if (!mounted.current || generation.current !== sequence ||
          (currentWorkspace.current !== null && currentWorkspace.current !== targetWorkspaceId)) throw hearthLoadCancelled();
      },
    } : undefined;
    loadGuard?.assertCurrent();
    const preferredWorkspaceTab = options?.preferredWorkspaceTab ?? null;
    const preferredEditorPanel = options?.preferredEditorPanel ?? null;
    args.pendingFocusOpenCountRef.current += 1;
    if (targetWorkspaceId && targetWorkspaceId !== args.workspaceId) {
      args.setWorkspaceId(targetWorkspaceId);
    }
    if (preferredWorkspaceTab) {
      args.writeWorkpieceWorkspaceTab(normalizedWorkpieceId, targetWorkspaceId ?? null, preferredWorkspaceTab);
      args.setActiveWorkpieceTab(preferredWorkspaceTab);
    }
    if (preferredEditorPanel) {
      args.pendingDraftEditorPanelRef.current = preferredEditorPanel;
    }
    args.setWorkpieceId(normalizedWorkpieceId);
    args.replaceHearthRouteContext(targetWorkspaceId ?? null, normalizedWorkpieceId);
    args.setFocusTab("draft");
    args.setMode("focus");

    try {
      let availableWorkpieces = options?.workpieces ?? args.workpieceSummariesRef.current;
      if (
        availableWorkpieces.length === 0
        || !availableWorkpieces.some((entry) => entry.workpieceId === normalizedWorkpieceId)
      ) {
        // Initial discovery already provided the authoritative collection.
        // Do not bypass its bounded read policy with an unguarded refresh.
        if (loadGuard) throw new Error("The requested Episode is unavailable in this workspace.");
        availableWorkpieces = await args.refreshWorkpieces(targetWorkspaceId, { includeArchived: true });
      }

      loadGuard?.assertCurrent();

      const targetWorkpiece = availableWorkpieces.find((entry) => entry.workpieceId === normalizedWorkpieceId) ?? null;
      if (targetWorkpiece?.isArchived) {
        await args.selectDraft(null, { loadGuard });
        loadGuard?.assertCurrent();
        await args.persistSession(null, "draft", loadGuard);
        loadGuard?.assertCurrent();
        if (args.isMobile) {
          args.setMobileOverlayView("editor");
        }
        return null;
      }

      const draft = await args.hydrateOrCreateDraftBufferForWorkpiece(normalizedWorkpieceId, {
        drafts: options?.drafts ?? args.draftsRef.current,
        workpieces: availableWorkpieces,
        preferredDraftId: options?.preferredDraftId ?? null,
        seed: options?.seed,
        loadGuard,
      });

      loadGuard?.assertCurrent();

      if (draft) {
        await args.selectDraft(draft, { revisionWorkpieceId: normalizedWorkpieceId, loadGuard });
      } else {
        args.clearActiveDraftSelection();
      }

      loadGuard?.assertCurrent();

      if (args.isMobile) {
        args.setMobileOverlayView("editor");
      }

      return draft;
    } finally {
      args.pendingFocusOpenCountRef.current = Math.max(0, args.pendingFocusOpenCountRef.current - 1);
    }
  }, [args]);

  const createDraftAndOpen = useCallback(async (
    targetWorkpieceId: string,
    seed?: { title?: string; body?: string },
    modeToSet: HearthMode = "focus",
    options?: {
      revisionWorkpieceId?: string | null;
      workspaceId?: string | null;
      drafts?: readonly Draft[];
      workpieces?: readonly HearthWorkpieceSummary[];
      preferredWorkspaceTab?: WorkpieceWorkspaceTab;
      preferredEditorPanel?: "script" | "manual" | null;
    },
  ) => {
    const normalizedWorkpieceId = args.normalizeUuid(targetWorkpieceId);
    if (!normalizedWorkpieceId) {
      throw new Error("A workpiece is required before creating a Hearth draft buffer.");
    }

    const draft = await openWorkpieceInFocus(normalizedWorkpieceId, {
      workspaceId: options?.workspaceId ?? null,
      drafts: options?.drafts,
      workpieces: options?.workpieces,
      preferredDraftId: normalizedWorkpieceId,
      seed,
      preferredWorkspaceTab: options?.preferredWorkspaceTab,
      preferredEditorPanel: options?.preferredEditorPanel,
    });

    if (modeToSet !== "focus") {
      args.setMode(modeToSet);
    }

    if (draft && options?.revisionWorkpieceId && options.revisionWorkpieceId !== normalizedWorkpieceId) {
      await args.selectDraft(draft, { revisionWorkpieceId: options.revisionWorkpieceId });
    }

    return draft;
  }, [args, openWorkpieceInFocus]);

  return {
    focusHandoffRef,
    openWorkpieceInFocus,
    createDraftAndOpen,
  };
}
