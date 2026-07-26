import type { Draft } from "../../domain/draft";
import type { Revision } from "../../domain/revision";
import type { BarStockSpark } from "../../lib/barstock-sparks";
import type {
  ActiveWorkpieceContext,
  HearthWorkpieceNavItem,
} from "../../lib/hearth-nav-model";
import type { HearthReadyScript } from "../../lib/hearth-ready-scripts";
import type { HearthWorkpieceSummary } from "../../lib/hearth-workpieces";
import type { SortKey } from "./hearth-shell-contracts";

export type CollectionStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; empty: boolean }
  | { kind: "error"; message: string };

export type HearthCollectionIdentity = Readonly<{
  workspaceId: string | null;
  workpieceId: string | null;
}>;

export type HearthCollectionFilters = {
  searchText: string;
  sortKey: SortKey;
  showArchived: boolean;
  setSearchText: (value: string) => void;
  setSortKey: (value: SortKey) => void;
  setShowArchived: (value: boolean) => void;
};

export type HearthCollectionViewModel = {
  activeWorkpieceContext: ActiveWorkpieceContext;
  workpieceNavItems: HearthWorkpieceNavItem[];
  filteredWorkpieceNavItems: HearthWorkpieceNavItem[];
  visibleSparks: BarStockSpark[];
  selectedSpark: BarStockSpark | null;
  readyScriptsForDisplay: HearthReadyScript[];
  visibleReadyScriptsForDisplay: HearthReadyScript[];
  readyTotalCount: number;
  removedReadyCount: number;
  activeReadyScript: HearthReadyScript | null;
};

export type HearthCollectionController = {
  state: {
    sparks: BarStockSpark[];
    episodes: HearthWorkpieceSummary[];
    ready: HearthReadyScript[];
    series: readonly [];
    archive: {
      showArchived: boolean;
      archivingWorkpieceIds: string[];
      restoringWorkpieceIds: string[];
    };
    filters: HearthCollectionFilters;
    view: HearthCollectionViewModel;
  };
  commands: {
    openSpark: (spark: BarStockSpark) => Promise<unknown>;
    archiveWorkpiece: (workpieceId: string) => Promise<void>;
    restoreWorkpiece: (
      workpieceId: string,
      options?: { openAfterRestore?: boolean },
    ) => Promise<void>;
    markReady: (workpieceId: string) => Promise<unknown>;
    removeFromReady: (entry: HearthReadyScript) => Promise<void>;
    sendBackToEditing: (entry: HearthReadyScript) => Promise<void>;
    refreshCollections: () => Promise<void>;
  };
  status: {
    sparks: CollectionStatus;
    episodes: CollectionStatus;
    ready: CollectionStatus;
    series: CollectionStatus;
  };
};

export type HearthCollectionProjectionInput = {
  identity: HearthCollectionIdentity;
  sparks: readonly BarStockSpark[];
  workpieces: readonly HearthWorkpieceSummary[];
  drafts: readonly Draft[];
  revisions: readonly Revision[];
  readyScripts: readonly HearthReadyScript[];
  readyScriptsWorkspaceId: string | null;
  activeDraftId: string | null;
  sessionActiveDraftId: string | null;
  selectedSparkId: string | null;
  searchText: string;
  sortKey: SortKey;
  showArchived: boolean;
  deferCollections: boolean;
};
