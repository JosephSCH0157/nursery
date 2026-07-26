import { shouldDisplaySparkInHearthLibrary } from "../../lib/barstock-sparks";
import {
  selectActiveWorkpieceContext,
  selectWorkpieceNavItems,
} from "../../lib/hearth-nav-model";
import type {
  HearthCollectionProjectionInput,
  HearthCollectionViewModel,
} from "./hearth-collection-contracts";
import { normalizeUuid } from "./hearth-shell-route";

export function buildHearthCollectionViewModel(
  input: HearthCollectionProjectionInput,
): HearthCollectionViewModel {
  const preferredDraftIdsByWorkpiece = new Map<string, string | null>();
  if (input.identity.workpieceId && input.activeDraftId) {
    preferredDraftIdsByWorkpiece.set(input.identity.workpieceId, input.activeDraftId);
  }

  const activeWorkpieceContext = selectActiveWorkpieceContext({
    activeWorkpieceId: input.identity.workpieceId,
    workpieces: input.workpieces,
    drafts: input.drafts,
    readyScripts: input.readyScripts,
    sparks: input.sparks,
    revisions: input.revisions,
    preferredDraftId: input.activeDraftId ?? input.sessionActiveDraftId,
  });
  const visibleSparks = input.sparks
    .slice()
    .sort((left, right) => right.createdAt - left.createdAt)
    .filter((spark) => spark.status !== "archived" && shouldDisplaySparkInHearthLibrary(spark));
  const selectedSpark = visibleSparks.length === 0
    ? null
    : visibleSparks.find((spark) => spark.id === input.selectedSparkId)
      ?? visibleSparks[0]
      ?? null;
  const workpieceNavItems = selectWorkpieceNavItems({
    workpieces: input.deferCollections ? [] : input.workpieces,
    drafts: input.drafts,
    readyScripts: input.readyScripts,
    sparks: input.sparks,
    searchText: input.searchText,
    sortKey: input.sortKey,
    preferredDraftIdsByWorkpiece,
  });
  const filteredWorkpieceNavItems = input.showArchived
    ? workpieceNavItems
    : workpieceNavItems.filter((item) => !item.isArchived);
  const workspaceId = normalizeUuid(input.identity.workspaceId);
  const readyScriptsForDisplay = input.deferCollections
    || !workspaceId
    || input.readyScriptsWorkspaceId !== workspaceId
    ? []
    : input.readyScripts.slice();
  const visibleReadyScriptsForDisplay = readyScriptsForDisplay.filter((entry) => !entry.hiddenAt);

  return {
    activeWorkpieceContext,
    workpieceNavItems,
    filteredWorkpieceNavItems,
    visibleSparks,
    selectedSpark,
    readyScriptsForDisplay,
    visibleReadyScriptsForDisplay,
    readyTotalCount: visibleReadyScriptsForDisplay.length,
    removedReadyCount: readyScriptsForDisplay.length - visibleReadyScriptsForDisplay.length,
    activeReadyScript: readyScriptsForDisplay.find(
      (entry) => entry.workpieceId === (input.identity.workpieceId ?? ""),
    ) ?? null,
  };
}

export function collectionStatus(args: {
  loading: boolean;
  error: string | null;
  count: number;
  scoped: boolean;
}): import("./hearth-collection-contracts").CollectionStatus {
  if (args.loading) return { kind: "loading" };
  if (args.error) return { kind: "error", message: args.error };
  if (!args.scoped) return { kind: "idle" };
  return { kind: "ready", empty: args.count === 0 };
}
