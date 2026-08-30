import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { BarStockSpark } from "../../lib/barstock-sparks";
import { shouldDisplaySparkInHearthLibrary } from "../../lib/barstock-sparks";
import type { Draft } from "../../domain/draft";
import type { Revision } from "../../domain/revision";
import type { HearthReadyScript } from "../../lib/hearth-ready-scripts";
import { listHearthReadyScripts } from "../../lib/hearth-ready-scripts";
import type { HearthOperationAuthority } from "../../lib/hearth-operation-authority";
import {
  selectActiveWorkpieceContext,
  selectWorkpieceNavItems,
  type ActiveWorkpieceContext,
} from "../../lib/hearth-nav-model";
import {
  listHearthWorkpieces,
  renameHearthWorkpiece,
  type HearthWorkpieceSummary,
} from "../../lib/hearth-workpieces";
import type { SortKey } from "./hearth-shell-contracts";
import { normalizeUuid } from "./hearth-shell-route";
import { useHearthReadyScriptsLifecycle } from "../../hooks/useHearthReadyScriptsLifecycle";
import { resolveReadyLabel } from "./hearth-shell-formatting";

export type { HearthWorkpieceSummary } from "../../lib/hearth-workpieces";

export async function renameHearthCollectionWorkpiece(args: {
  workspaceId: string;
  workpieceId: string;
  title: string;
}): Promise<void> {
  await renameHearthWorkpiece(args);
}

export {
  useHearthSparkDiscovery as useHearthCollectionSparkDiscovery,
} from "../../hooks/useHearthSparkDiscovery";
export {
  useHearthReadyQueueActions as useHearthCollectionReadyQueueActions,
} from "../../hooks/useHearthReadyQueueActions";
export {
  useHearthWorkpieceArchiveActions as useHearthCollectionArchiveActions,
} from "../../hooks/useHearthWorkpieceArchiveActions";
export {
  useHearthReadyNavigationActions as useHearthCollectionReadyNavigationActions,
} from "../../hooks/useHearthReadyNavigationActions";
export {
  enqueueBarStockSpark,
  resolveBarStockSparkHearthWorkpieceId,
  upsertBarStockSpark,
  writeBarStockSparks,
  type BarStockSpark,
} from "../../lib/barstock-sparks";
export { createHearthWorkpiece as createHearthCollectionWorkpiece } from "../../lib/hearth-workpiece";
export { getOrCreateHearthProjectWorkpiece } from "../../lib/hearth-workpiece";
export { getOrCreateHearthSparkWorkpiece } from "../../lib/hearth-workpiece";

export function useHearthSparkCollectionState(
  initialWorkspaceId: string | null,
) {
  const [sparks, setSparks] = useState<BarStockSpark[]>([]);
  const [isSparksLoading, setIsSparksLoading] = useState<boolean>(
    () => Boolean(normalizeUuid(initialWorkspaceId)),
  );
  const [sparkDiscoveryWorkspaceId, setSparkDiscoveryWorkspaceId] = useState<string | null>(null);
  const [sparkDiscoveryError, setSparkDiscoveryError] = useState<string | null>(null);
  const [selectedSparkId, setSelectedSparkId] = useState<string | null>(null);
  const [forgeError, setForgeError] = useState<string | null>(null);
  const [isForging, setIsForging] = useState(false);
  return {
    state: {
      sparks,
      isSparksLoading,
      sparkDiscoveryWorkspaceId,
      sparkDiscoveryError,
      selectedSparkId,
      forgeError,
      isForging,
    },
    bindings: {
      setSparks,
      setIsSparksLoading,
      setSparkDiscoveryWorkspaceId,
      setSparkDiscoveryError,
      setSelectedSparkId,
      setForgeError,
      setIsForging,
    },
  };
}

export function useHearthEpisodeCollectionState() {
  const [workpieceSummaries, setWorkpieceSummaries] = useState<HearthWorkpieceSummary[]>([]);
  const [isWorkpiecesLoading, setIsWorkpiecesLoading] = useState(false);
  const [workpiecesError, setWorkpiecesError] = useState<string | null>(null);
  return {
    state: { workpieceSummaries, isWorkpiecesLoading, workpiecesError },
    bindings: { setWorkpieceSummaries, setIsWorkpiecesLoading, setWorkpiecesError },
  };
}

export function useHearthReadyCollectionState() {
  const [searchText, setSearchText] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [showArchived, setShowArchived] = useState(false);
  const [readyScripts, setReadyScripts] = useState<HearthReadyScript[]>([]);
  const [readyScriptsWorkspaceId, setReadyScriptsWorkspaceId] = useState<string | null>(null);
  const [isReadyScriptsLoading, setIsReadyScriptsLoading] = useState(false);
  const [readyScriptsError, setReadyScriptsError] = useState<string | null>(null);
  const [updatingReadyCategoryId, setUpdatingReadyCategoryId] = useState<string | null>(null);
  const [readyCategoryError, setReadyCategoryError] = useState<string | null>(null);
  const [removingReadyIds, setRemovingReadyIds] = useState<string[]>([]);
  const [sendingBackReadyIds, setSendingBackReadyIds] = useState<string[]>([]);
  const [isRestoringReady, setIsRestoringReady] = useState(false);
  const [draggingReadyId, setDraggingReadyId] = useState<string | null>(null);
  return {
    state: {
      searchText,
      sortKey,
      showArchived,
      readyScripts,
      readyScriptsWorkspaceId,
      isReadyScriptsLoading,
      readyScriptsError,
      updatingReadyCategoryId,
      readyCategoryError,
      removingReadyIds,
      sendingBackReadyIds,
      isRestoringReady,
      draggingReadyId,
    },
    bindings: {
      setSearchText,
      setSortKey,
      setShowArchived,
      setReadyScripts,
      setReadyScriptsWorkspaceId,
      setIsReadyScriptsLoading,
      setReadyScriptsError,
      setUpdatingReadyCategoryId,
      setReadyCategoryError,
      setRemovingReadyIds,
      setSendingBackReadyIds,
      setIsRestoringReady,
      setDraggingReadyId,
    },
  };
}

export function useHearthWorkpieceCollectionLoader(args: {
  workspaceId: string | null;
  workpieceId: string | null;
  showArchived: boolean;
  operationAuthority: HearthOperationAuthority;
  workpieceSummariesRef: MutableRefObject<HearthWorkpieceSummary[]>;
  setWorkpieceSummaries: Dispatch<SetStateAction<HearthWorkpieceSummary[]>>;
  setIsWorkpiecesLoading: Dispatch<SetStateAction<boolean>>;
  setWorkpiecesError: Dispatch<SetStateAction<string | null>>;
}) {
  return useCallback(async (
    overrideWorkspaceId?: string | null,
    options?: { includeArchived?: boolean },
  ): Promise<HearthWorkpieceSummary[]> => {
    const requestedWorkspace = normalizeUuid(overrideWorkspaceId ?? args.workspaceId);
    const token = args.operationAuthority.begin("collection:workpieces");
    const activeWorkpieceId = normalizeUuid(args.workpieceId);
    const includeArchived = options?.includeArchived ?? (
      args.showArchived || Boolean(
        activeWorkpieceId
        && args.workpieceSummariesRef.current.some(
          (entry) => entry.workpieceId === activeWorkpieceId && entry.isArchived,
        )
      )
    );
    if (!requestedWorkspace) {
      args.workpieceSummariesRef.current = [];
      args.setWorkpieceSummaries([]);
      args.setWorkpiecesError(null);
      args.setIsWorkpiecesLoading(false);
      return [];
    }

    args.setIsWorkpiecesLoading(true);
    args.setWorkpiecesError(null);
    try {
      const list = await listHearthWorkpieces(requestedWorkspace, { includeArchived });
      if (!args.operationAuthority.commit(token, () => {
        args.workpieceSummariesRef.current = list;
        args.setWorkpieceSummaries(list);
      })) return [];
      return list;
    } catch {
      if (!args.operationAuthority.commit(token, () => {
        args.workpieceSummariesRef.current = [];
        args.setWorkpieceSummaries([]);
        args.setWorkpiecesError("Failed to load Episodes.");
      })) return [];
      return [];
    } finally {
      if (args.operationAuthority.isCurrent(token)) {
        args.setIsWorkpiecesLoading(false);
      }
    }
  }, [
    args.operationAuthority,
    args.setIsWorkpiecesLoading,
    args.setWorkpieceSummaries,
    args.setWorkpiecesError,
    args.showArchived,
    args.workpieceId,
    args.workpieceSummariesRef,
    args.workspaceId,
  ]);
}

export function useHearthReadyCollectionLifecycle(args: {
  workspaceId: string | null;
  setReadyScripts: Dispatch<SetStateAction<HearthReadyScript[]>>;
  setReadyScriptsWorkspaceId: Dispatch<SetStateAction<string | null>>;
  setReadyScriptsError: Dispatch<SetStateAction<string | null>>;
  setIsReadyScriptsLoading: Dispatch<SetStateAction<boolean>>;
}) {
  return useHearthReadyScriptsLifecycle({
    ...args,
    normalizeUuid,
    listReadyScripts: listHearthReadyScripts,
  });
}

export function useHearthActiveCollectionContext(args: {
  activeWorkpieceId: string | null;
  workpieces: readonly HearthWorkpieceSummary[];
  drafts: readonly Draft[];
  readyScripts: readonly HearthReadyScript[];
  sparks: readonly BarStockSpark[];
  revisions: readonly Revision[];
  preferredDraftId: string | null;
}): ActiveWorkpieceContext {
  return useMemo(() => selectActiveWorkpieceContext(args), [
    args.activeWorkpieceId,
    args.drafts,
    args.preferredDraftId,
    args.readyScripts,
    args.revisions,
    args.sparks,
    args.workpieces,
  ]);
}

export function useHearthCollectionViewModel(args: {
  sparks: BarStockSpark[];
  selectedSparkId: string | null;
  deferCollections: boolean;
  workpieces: HearthWorkpieceSummary[];
  drafts: Draft[];
  readyScripts: HearthReadyScript[];
  searchText: string;
  sortKey: SortKey;
  preferredDraftIdsByWorkpiece: ReadonlyMap<string, string | null>;
  showArchived: boolean;
  readyScriptsWorkspaceId: string | null;
  workspaceId: string | null;
  workpieceId: string | null;
}) {
  const sortedSparks = useMemo(
    () => args.sparks.slice().sort((a, b) => b.createdAt - a.createdAt),
    [args.sparks],
  );
  const visibleSparks = useMemo(
    () => sortedSparks.filter(
      (spark) => spark.status !== "archived" && shouldDisplaySparkInHearthLibrary(spark),
    ),
    [sortedSparks],
  );
  const selectedSpark = useMemo(() => {
    if (visibleSparks.length === 0) return null;
    if (!args.selectedSparkId) return visibleSparks[0] ?? null;
    return visibleSparks.find((spark) => spark.id === args.selectedSparkId)
      ?? visibleSparks[0]
      ?? null;
  }, [args.selectedSparkId, visibleSparks]);
  const workpieceNavItems = useMemo(() => selectWorkpieceNavItems({
    workpieces: args.deferCollections ? [] : args.workpieces,
    drafts: args.drafts,
    readyScripts: args.readyScripts,
    sparks: args.sparks,
    searchText: args.searchText,
    sortKey: args.sortKey,
    preferredDraftIdsByWorkpiece: args.preferredDraftIdsByWorkpiece,
  }), [
    args.deferCollections,
    args.drafts,
    args.preferredDraftIdsByWorkpiece,
    args.readyScripts,
    args.searchText,
    args.sortKey,
    args.sparks,
    args.workpieces,
  ]);
  const filteredWorkpieceNavItems = useMemo(
    () => args.showArchived
      ? workpieceNavItems
      : workpieceNavItems.filter((item) => !item.isArchived),
    [args.showArchived, workpieceNavItems],
  );
  const readyScriptsForDisplay = useMemo(() => {
    if (args.deferCollections) return [];
    const workspace = normalizeUuid(args.workspaceId);
    if (!workspace || args.readyScriptsWorkspaceId !== workspace) return [];
    return args.readyScripts;
  }, [
    args.deferCollections,
    args.readyScripts,
    args.readyScriptsWorkspaceId,
    args.workspaceId,
  ]);
  const visibleReadyScriptsForDisplay = useMemo(
    () => readyScriptsForDisplay.filter((entry) => !entry.hiddenAt),
    [readyScriptsForDisplay],
  );
  const removedReadyCount = useMemo(
    () => readyScriptsForDisplay.filter((entry) => Boolean(entry.hiddenAt)).length,
    [readyScriptsForDisplay],
  );
  const activeReadyScript = useMemo(
    () => readyScriptsForDisplay.find(
      (entry) => entry.workpieceId === (args.workpieceId ?? ""),
    ) ?? null,
    [args.workpieceId, readyScriptsForDisplay],
  );

  return {
    visibleSparks,
    selectedSpark,
    workpieceNavItems,
    filteredWorkpieceNavItems,
    readyScriptsForDisplay,
    visibleReadyScriptsForDisplay,
    seriesEntries: visibleReadyScriptsForDisplay.filter(
      (entry) => resolveReadyLabel(entry) === "series",
    ),
    readyTotalCount: visibleReadyScriptsForDisplay.length,
    removedReadyCount,
    activeReadyScript,
  };
}
