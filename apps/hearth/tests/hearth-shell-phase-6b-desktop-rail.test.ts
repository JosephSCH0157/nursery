import assert from "node:assert/strict";
import test from "node:test";
import { buildHearthDesktopRailViewModel } from "../src/routes/hearth-shell/buildHearthDesktopRailViewModel";
import type { HearthDesktopRailViewModelInput } from "../src/routes/hearth-shell/hearth-desktop-rail-contracts";

function input(): HearthDesktopRailViewModelInput {
  const noop = () => {};
  return {
    deferDesktopRailCollections: false,
    readyTotalCount: 3,
    refreshReadyScripts: noop,
    isReadyScriptsLoading: false,
    readyScriptsError: null,
    readyCategoryError: null,
    readyUrgencyLabelFresh: "Fresh",
    readyUrgencyLabelCooling: "Cooling",
    readyUrgencyLabelCold: "Cold",
    readyUrgencyFreshCount: 1,
    readyUrgencyCoolingCount: 1,
    readyUrgencyColdCount: 1,
    removedReadyCount: 0,
    onOpenReadyView: noop,
    onRestoreRemovedReady: noop,
    isRestoringReady: false,
    searchRef: { current: null },
    searchText: "",
    onSearchTextChange: noop,
    sortKey: "updated",
    onSortKeyChange: noop,
    showArchived: false,
    onShowArchivedChange: noop,
    isLoading: false,
    isWorkpiecesLoading: false,
    workpiecesError: null,
    filteredWorkpieceNavItems: [],
    draftsById: new Map(),
    workpieceId: null,
    editingDraftId: null,
    setEditingDraftId: noop,
    editingTitle: "",
    setEditingTitle: noop,
    shouldShowWorkpieceId: () => false,
    archivingWorkpieceIds: [],
    restoringWorkpieceIds: [],
    openWorkpieceInFocus: noop,
    formatUpdatedAt: () => "",
    resolveDraftEditorName: () => "",
    saveDraftMeta: noop,
    onRestoreWorkpiece: noop,
    onArchiveWorkpiece: noop,
    onDeleteDraft: noop,
    hasActiveEpisode: true,
    activeEpisodeReadyStatus: { tone: "blocked", label: "Blocked", detail: "Canonical status" },
    activeWorkpieceIsArchived: false,
    activeWorkpieceArchiveReason: null,
    isRestoringActiveWorkpiece: false,
    onRestoreActiveWorkpiece: noop,
    openInAnvilHref: null,
    handoffBlocked: true,
    onOpenInAnvil: noop,
    anvilStepModeHint: null,
    mode: "focus",
    focusTab: "sources",
    wordCount: 120,
    revisionsCount: 2,
    missingSourcesCount: 2,
    unusedSourcesCount: 1,
    devMode: false,
    onFocusDraft: noop,
    onFocusPlanning: noop,
    onFocusSources: noop,
    onFocusRevisions: noop,
    onOpenApiLedger: noop,
  };
}

test("desktop rail preserves supplied navigation commands and active destination", () => {
  const source = input();
  const result = buildHearthDesktopRailViewModel(source);
  assert.equal(result.mode, "focus");
  assert.equal(result.focusTab, "sources");
  assert.equal(result.onFocusSources, source.onFocusSources);
  assert.equal(result.onOpenReadyView, source.onOpenReadyView);
});

test("disabled and unavailable presentation remains supplied by established owners", () => {
  const source = input();
  const result = buildHearthDesktopRailViewModel(source);
  assert.equal(result.handoffBlocked, true);
  assert.equal(result.openInAnvilHref, null);
  assert.equal(result.activeEpisodeReadyStatus, source.activeEpisodeReadyStatus);
});

test("sources badges preserve existing missing and unused formatting", () => {
  const result = buildHearthDesktopRailViewModel(input());
  assert.equal(result.sourcesBadge, "2");
  assert.equal(result.sourcesBadgeTitle, "Missing cited sources: 2 · Unused refs: 1");
  const empty = buildHearthDesktopRailViewModel({
    ...input(),
    missingSourcesCount: 0,
    unusedSourcesCount: 0,
  });
  assert.equal(empty.sourcesBadge, null);
  assert.equal(empty.sourcesBadgeTitle, "Sources");
});

test("view model is immutable and does not invent aggregate completion", () => {
  const result = buildHearthDesktopRailViewModel(input());
  assert.equal(Object.isFrozen(result), true);
  assert.equal("complete" in result, false);
  assert.equal("releaseReady" in result, false);
});
