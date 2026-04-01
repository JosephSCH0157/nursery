import type { RefObject } from "react";
import type { Draft } from "../../domain/draft";

type SortKey = "updated" | "title";

type WorkpieceNavItem = {
  workpieceId: string;
  draftId: string | null;
  title: string;
  updatedAtMs: number;
  isArchived: boolean;
  readyEntry?: unknown;
  sparkCount: number;
};

type HearthWorkspaceProjectsRailProps = {
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
};

export default function HearthWorkspaceProjectsRail({
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
}: HearthWorkspaceProjectsRailProps) {
  return (
    <>
      <div className="hs-rail-section">
        <label className="hs-rail-label">Search workspace projects</label>
        <input
          aria-label="Search workspace projects"
          ref={searchRef}
          type="search"
          value={searchText}
          onChange={(event) => onSearchTextChange(event.target.value)}
          placeholder="Search Episode titles"
        />
        <div className="hs-rail-sort">
          <label className="hs-rail-label">Sort</label>
          <select aria-label="Sort workspace projects" value={sortKey} onChange={(event) => onSortKeyChange(event.target.value as SortKey)}>
            <option value="updated">Recently updated</option>
            <option value="title">Title A-Z</option>
          </select>
        </div>
        <label className="hs-rail-checkbox">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => onShowArchivedChange(event.target.checked)}
          />
          Show archived
        </label>
      </div>

      <div className="hs-rail-section">
        <div className="hs-rail-heading">Workspace Projects</div>
        {isLoading || isWorkpiecesLoading ? <p>Loading workspace projects...</p> : null}
        {workpiecesError ? <div className="hs-error-text-small">{workpiecesError}</div> : null}
        {!isLoading && !isWorkpiecesLoading && filteredWorkpieceNavItems.length === 0
          ? <p>No workspace projects yet.</p>
          : null}
        <ul className="hs-workpieces-list">
          {filteredWorkpieceNavItems.map((item) => {
            const draft = item.draftId ? draftsById.get(item.draftId) ?? null : null;
            const draftId = draft?.id ?? null;
            const isActive = workpieceId === item.workpieceId;
            const isEditing = Boolean(draftId) && editingDraftId === draftId;
            const updatedAt = item.updatedAtMs || draft?.updatedAt || Date.now();
            const draftLabel = (draft?.title ?? "").trim();
            const showDraftLabel = Boolean(draftLabel && draftLabel !== item.title);
            const showWorkpieceId = shouldShowWorkpieceId(item.title);
            const workpieceBadges = [
              item.readyEntry ? { label: "Ready", tone: "ready" } : null,
              draft ? { label: "Draft", tone: "draft" } : null,
              draft?.revisionCount ? { label: `Revisions ${draft.revisionCount}`, tone: "count" } : null,
              item.sparkCount > 0
                ? { label: `${item.sparkCount} Spark${item.sparkCount === 1 ? "" : "s"}`, tone: "count" }
                : null,
              draft?.pinned ? { label: "Pinned", tone: "neutral" } : null,
              item.isArchived ? { label: "Archived", tone: "archived" } : null,
            ].filter((badge): badge is { label: string; tone: "ready" | "draft" | "count" | "neutral" | "archived" } => Boolean(badge));
            const isArchiving = archivingWorkpieceIds.includes(item.workpieceId);
            const isRestoring = restoringWorkpieceIds.includes(item.workpieceId);
            return (
              <li key={item.workpieceId}>
                <div
                  className={`hs-workpiece-card${isActive ? " is-active" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => void openWorkpieceInFocus(item.workpieceId, {
                      preferredDraftId: item.draftId,
                    })}
                    className="hs-workpiece-button"
                  >
                    <div className="hs-workpiece-title-row">
                      <div className="hs-workpiece-title-stack">
                        <div className="hs-workpiece-title">{item.title}</div>
                        {showWorkpieceId ? (
                          <div className="hs-workpiece-secondary">ID {item.workpieceId.slice(0, 8)}</div>
                        ) : null}
                      </div>
                    </div>
                    {workpieceBadges.length > 0 ? (
                      <div className="hs-workpiece-badges" aria-label="Project status">
                        {workpieceBadges.map((badge) => (
                          <span
                            key={`${item.workpieceId}:${badge.label}`}
                            className={`hs-workpiece-badge is-${badge.tone}`}
                          >
                            {badge.label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="hs-workpiece-updated">
                      Updated {formatUpdatedAt(updatedAt)}
                    </div>
                    <div className="hs-workpiece-updated">
                      {draft ? `Last edited by ${resolveDraftEditorName(draft)}` : "No attached draft buffer yet"}
                    </div>
                    {showDraftLabel ? (
                      <div className="hs-workpiece-updated">Draft label: {draftLabel}</div>
                    ) : null}
                  </button>
                  {draft && isEditing ? (
                    <label className="hs-workpiece-draft-label-editor">
                      <span className="hs-rail-label">Draft label</span>
                      <input
                        aria-label="Edit draft label"
                        value={editingTitle}
                        onChange={(event) => setEditingTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (!draft) return;
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void saveDraftMeta(draft, { title: editingTitle });
                            setEditingDraftId(null);
                          }
                          if (event.key === "Escape") {
                            setEditingDraftId(null);
                          }
                        }}
                        onBlur={() => {
                          if (draft && editingDraftId === draft.id) {
                            void saveDraftMeta(draft, { title: editingTitle });
                            setEditingDraftId(null);
                          }
                        }}
                      />
                      <span className="hs-rail-meta">
                        Draft label only. Project title stays synced to Tongs.
                      </span>
                    </label>
                  ) : null}
                  {draft && !item.isArchived ? (
                    <div className="hs-workpiece-actions">
                      <button
                        type="button"
                        onClick={() => void saveDraftMeta(draft, { pinned: !draft.pinned })}
                      >
                        {draft.pinned ? "Unpin" : "Pin"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (editingDraftId === draft.id) {
                            setEditingDraftId(null);
                            return;
                          }
                          setEditingDraftId(draft.id);
                          setEditingTitle(draft.title);
                        }}
                      >
                        {editingDraftId === draft.id ? "Close Draft Label" : "Edit Draft Label"}
                      </button>
                    </div>
                  ) : null}
                  <div className="hs-workpiece-actions">
                    <button
                      type="button"
                      onClick={() => void (
                        item.isArchived
                          ? onRestoreWorkpiece(item.workpieceId)
                          : onArchiveWorkpiece(item.workpieceId)
                      )}
                      disabled={isArchiving || isRestoring}
                    >
                      {item.isArchived
                        ? isRestoring ? "Restoring..." : "Restore Workpiece"
                        : isArchiving ? "Archiving..." : "Archive Workpiece"}
                    </button>
                    {draft ? (
                      <button type="button" onClick={() => void onDeleteDraft(draft)}>
                        Delete Draft Buffer
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
