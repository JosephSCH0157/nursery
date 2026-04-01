import type { RefObject } from "react";
import type { Draft } from "../../domain/draft";
import HearthActiveWorkpieceRail from "./HearthActiveWorkpieceRail";
import HearthDesktopRailContent from "./HearthDesktopRailContent";
import HearthReadyQueueRail from "./HearthReadyQueueRail";
import HearthWorkspaceProjectsRail from "./HearthWorkspaceProjectsRail";

type SortKey = "updated" | "title";
type HearthMode = "sparks" | "episodes" | "ready" | "series" | "focus";
type FocusTab = "draft" | "planning" | "sources" | "revisions";

type WorkpieceNavItem = {
  workpieceId: string;
  draftId: string | null;
  title: string;
  updatedAtMs: number;
  isArchived: boolean;
  readyEntry?: unknown;
  sparkCount: number;
};

type HearthDesktopRailProps = {
  deferDesktopRailCollections: boolean;
  readyTotalCount: number;
  refreshReadyScripts: () => void | Promise<void>;
  isReadyScriptsLoading: boolean;
  readyScriptsError: string | null;
  readyCategoryError: string | null;
  readyUrgencyLabelFresh: string;
  readyUrgencyLabelCooling: string;
  readyUrgencyLabelCold: string;
  readyUrgencyFreshCount: number;
  readyUrgencyCoolingCount: number;
  readyUrgencyColdCount: number;
  removedReadyCount: number;
  onOpenReadyView: () => void;
  onRestoreRemovedReady: () => void | Promise<void>;
  isRestoringReady: boolean;
  searchRef: RefObject<HTMLInputElement | null>;
  searchText: string;
  onSearchTextChange: (value: string) => void;
  sortKey: SortKey;
  onSortKeyChange: (value: SortKey) => void;
  showArchived: boolean;
  onShowArchivedChange: (value: boolean) => void;
  isLoading: boolean;
  isWorkpiecesLoading: boolean;
  workpiecesError: string | null;
  filteredWorkpieceNavItems: WorkpieceNavItem[];
  draftsById: Map<string, Draft>;
  workpieceId: string | null;
  editingDraftId: string | null;
  setEditingDraftId: (value: string | null) => void;
  editingTitle: string;
  setEditingTitle: (value: string) => void;
  shouldShowWorkpieceId: (title: string) => boolean;
  archivingWorkpieceIds: string[];
  restoringWorkpieceIds: string[];
  openWorkpieceInFocus: (workpieceId: string, options?: { preferredDraftId?: string | null }) => unknown | Promise<unknown>;
  formatUpdatedAt: (value: number | undefined) => string;
  resolveDraftEditorName: (draft: Draft) => string;
  saveDraftMeta: (draft: Draft, updates: Partial<Draft>) => void | Promise<void>;
  onRestoreWorkpiece: (workpieceId: string) => void | Promise<void>;
  onArchiveWorkpiece: (workpieceId: string) => void | Promise<void>;
  onDeleteDraft: (draft: Draft) => void | Promise<void>;
  hasActiveEpisode: boolean;
  activeEpisodeReadyStatus: { tone: string; label: string; detail: string };
  activeWorkpieceIsArchived: boolean;
  activeWorkpieceArchiveReason: string | null;
  isRestoringActiveWorkpiece: boolean;
  onRestoreActiveWorkpiece: () => void | Promise<void>;
  openInAnvilHref: string | null;
  handoffBlocked: boolean;
  onOpenInAnvil: () => void | Promise<void>;
  anvilStepModeHint: string | null;
  mode: HearthMode;
  focusTab: FocusTab;
  wordCount: number;
  revisionsCount: number;
  sourcesBadgeTitle: string;
  sourcesBadge: string | null;
  devMode: boolean;
  onFocusDraft: () => void;
  onFocusPlanning: () => void;
  onFocusSources: () => void;
  onFocusRevisions: () => void;
  onOpenApiLedger: () => void;
};

export default function HearthDesktopRail({
  deferDesktopRailCollections,
  readyTotalCount,
  refreshReadyScripts,
  isReadyScriptsLoading,
  readyScriptsError,
  readyCategoryError,
  readyUrgencyLabelFresh,
  readyUrgencyLabelCooling,
  readyUrgencyLabelCold,
  readyUrgencyFreshCount,
  readyUrgencyCoolingCount,
  readyUrgencyColdCount,
  removedReadyCount,
  onOpenReadyView,
  onRestoreRemovedReady,
  isRestoringReady,
  searchRef,
  searchText,
  onSearchTextChange,
  sortKey,
  onSortKeyChange,
  showArchived,
  onShowArchivedChange,
  isLoading,
  isWorkpiecesLoading,
  workpiecesError,
  filteredWorkpieceNavItems,
  draftsById,
  workpieceId,
  editingDraftId,
  setEditingDraftId,
  editingTitle,
  setEditingTitle,
  shouldShowWorkpieceId,
  archivingWorkpieceIds,
  restoringWorkpieceIds,
  openWorkpieceInFocus,
  formatUpdatedAt,
  resolveDraftEditorName,
  saveDraftMeta,
  onRestoreWorkpiece,
  onArchiveWorkpiece,
  onDeleteDraft,
  hasActiveEpisode,
  activeEpisodeReadyStatus,
  activeWorkpieceIsArchived,
  activeWorkpieceArchiveReason,
  isRestoringActiveWorkpiece,
  onRestoreActiveWorkpiece,
  openInAnvilHref,
  handoffBlocked,
  onOpenInAnvil,
  anvilStepModeHint,
  mode,
  focusTab,
  wordCount,
  revisionsCount,
  sourcesBadgeTitle,
  sourcesBadge,
  devMode,
  onFocusDraft,
  onFocusPlanning,
  onFocusSources,
  onFocusRevisions,
  onOpenApiLedger,
}: HearthDesktopRailProps) {
  return (
    <HearthDesktopRailContent
      deferDesktopRailCollections={deferDesktopRailCollections}
      readyQueueRail={(
        <HearthReadyQueueRail
          readyTotalCount={readyTotalCount}
          refreshReadyScripts={refreshReadyScripts}
          isReadyScriptsLoading={isReadyScriptsLoading}
          readyScriptsError={readyScriptsError}
          readyCategoryError={readyCategoryError}
          readyUrgencyLabelFresh={readyUrgencyLabelFresh}
          readyUrgencyLabelCooling={readyUrgencyLabelCooling}
          readyUrgencyLabelCold={readyUrgencyLabelCold}
          readyUrgencyFreshCount={readyUrgencyFreshCount}
          readyUrgencyCoolingCount={readyUrgencyCoolingCount}
          readyUrgencyColdCount={readyUrgencyColdCount}
          removedReadyCount={removedReadyCount}
          onOpenReadyView={onOpenReadyView}
          onRestoreRemovedReady={onRestoreRemovedReady}
          isRestoringReady={isRestoringReady}
        />
      )}
      workspaceProjectsRail={(
        <HearthWorkspaceProjectsRail
          searchRef={searchRef}
          searchText={searchText}
          onSearchTextChange={onSearchTextChange}
          sortKey={sortKey}
          onSortKeyChange={onSortKeyChange}
          showArchived={showArchived}
          onShowArchivedChange={onShowArchivedChange}
          isLoading={isLoading}
          isWorkpiecesLoading={isWorkpiecesLoading}
          workpiecesError={workpiecesError}
          filteredWorkpieceNavItems={filteredWorkpieceNavItems}
          draftsById={draftsById}
          workpieceId={workpieceId}
          editingDraftId={editingDraftId}
          setEditingDraftId={setEditingDraftId}
          editingTitle={editingTitle}
          setEditingTitle={setEditingTitle}
          shouldShowWorkpieceId={shouldShowWorkpieceId}
          archivingWorkpieceIds={archivingWorkpieceIds}
          restoringWorkpieceIds={restoringWorkpieceIds}
          openWorkpieceInFocus={openWorkpieceInFocus}
          formatUpdatedAt={formatUpdatedAt}
          resolveDraftEditorName={resolveDraftEditorName}
          saveDraftMeta={saveDraftMeta}
          onRestoreWorkpiece={onRestoreWorkpiece}
          onArchiveWorkpiece={onArchiveWorkpiece}
          onDeleteDraft={onDeleteDraft}
        />
      )}
      activeWorkpieceRail={(
        <HearthActiveWorkpieceRail
          hasActiveEpisode={hasActiveEpisode}
          activeEpisodeReadyStatus={activeEpisodeReadyStatus}
          activeWorkpieceIsArchived={activeWorkpieceIsArchived}
          activeWorkpieceArchiveReason={activeWorkpieceArchiveReason}
          isRestoringActiveWorkpiece={isRestoringActiveWorkpiece}
          onRestoreActiveWorkpiece={onRestoreActiveWorkpiece}
          openInAnvilHref={openInAnvilHref}
          handoffBlocked={handoffBlocked}
          onOpenInAnvil={onOpenInAnvil}
          anvilStepModeHint={anvilStepModeHint}
          isFocusDraftActive={mode === "focus" && focusTab === "draft"}
          isFocusPlanningActive={mode === "focus" && focusTab === "planning"}
          isFocusSourcesActive={mode === "focus" && focusTab === "sources"}
          isFocusRevisionsActive={mode === "focus" && focusTab === "revisions"}
          wordCount={wordCount}
          revisionsCount={revisionsCount}
          sourcesBadgeTitle={sourcesBadgeTitle}
          sourcesBadge={sourcesBadge}
          devMode={devMode}
          onFocusDraft={onFocusDraft}
          onFocusPlanning={onFocusPlanning}
          onFocusSources={onFocusSources}
          onFocusRevisions={onFocusRevisions}
          onOpenApiLedger={onOpenApiLedger}
        />
      )}
    />
  );
}
