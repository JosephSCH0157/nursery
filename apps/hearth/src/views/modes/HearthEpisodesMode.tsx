import type { RefObject } from "react";
import type { Draft } from "../../domain/draft";

type SortKey = "updated" | "title";

type WorkpieceNavItem = {
  workpieceId: string;
  draftId: string | null;
  title: string;
  updatedAtMs: number;
  isArchived: boolean;
};

type HearthEpisodesModeProps = {
  isMobile: boolean;
  startFromScratch: () => void | Promise<void>;
  isForging: boolean;
  onCreateDraft: () => void | Promise<void>;
  openReadyInMobileOverlay: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
  searchText: string;
  setSearchText: (value: string) => void;
  sortKey: SortKey;
  setSortKey: (value: SortKey) => void;
  filteredWorkpieceNavItems: WorkpieceNavItem[];
  draftsById: Map<string, Draft>;
  workpieceId: string | null;
  archivingWorkpieceIds: string[];
  restoringWorkpieceIds: string[];
  openWorkpieceInFocus: (
    workpieceId: string,
    options?: { preferredDraftId?: string | null; workspaceId?: string | null },
  ) => unknown | Promise<unknown>;
  resolveWorkpiecePresenceClass: (workpieceId: string) => string;
  resolveWorkpiecePresenceBadge: (workpieceId: string) => string;
  formatUpdatedAt: (value: number) => string;
  resolveDraftEditorName: (draft: Draft) => string;
  saveDraftMeta: (draft: Draft, updates: Partial<Draft>) => void | Promise<void>;
  onRestoreWorkpiece: (workpieceId: string) => void | Promise<void>;
  onArchiveWorkpiece: (workpieceId: string) => void | Promise<void>;
  onDeleteDraft: (draft: Draft) => void | Promise<void>;
};

export default function HearthEpisodesMode({
  isMobile,
  startFromScratch,
  isForging,
  onCreateDraft,
  openReadyInMobileOverlay,
  searchRef,
  searchText,
  setSearchText,
  sortKey,
  setSortKey,
  filteredWorkpieceNavItems,
  draftsById,
  workpieceId,
  archivingWorkpieceIds,
  restoringWorkpieceIds,
  openWorkpieceInFocus,
  resolveWorkpiecePresenceClass,
  resolveWorkpiecePresenceBadge,
  formatUpdatedAt,
  resolveDraftEditorName,
  saveDraftMeta,
  onRestoreWorkpiece,
  onArchiveWorkpiece,
  onDeleteDraft,
}: HearthEpisodesModeProps) {
  return (
    <section className="hs-home">
      <header className="hs-home-header">
        <h2 className="hs-home-title">{isMobile ? "Workspace Projects" : "Episodes (In Progress)"}</h2>
        <p className="hs-home-subtext">
          {isMobile ? "Tap a project to open the mobile editor." : "Open an Episode to enter Focus Mode."}
        </p>
      </header>
      <div className="hs-home-actions">
        <button type="button" onClick={() => void startFromScratch()} disabled={isForging}>
          New Workpiece
        </button>
        <button type="button" onClick={() => void onCreateDraft()}>
          New Draft
        </button>
        {isMobile ? (
          <button type="button" onClick={openReadyInMobileOverlay}>
            Ready to Record
          </button>
        ) : null}
      </div>
      <div className="hs-rail-section">
        <label className="hs-rail-label">Search Episodes</label>
        <input
          aria-label="Search episodes"
          ref={searchRef}
          type="search"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="Search Episode titles"
        />
        <div className="hs-rail-sort">
          <label className="hs-rail-label">Sort</label>
          <select aria-label="Sort episodes" value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
            <option value="updated">Recently updated</option>
            <option value="title">Title A-Z</option>
          </select>
        </div>
      </div>
      <ul className="hs-workpieces-list">
        {filteredWorkpieceNavItems.map((item) => {
          const draft = item.draftId ? draftsById.get(item.draftId) ?? null : null;
          const isActive = workpieceId === item.workpieceId;
          const updatedAt = item.updatedAtMs || draft?.updatedAt || Date.now();
          const isArchiving = archivingWorkpieceIds.includes(item.workpieceId);
          const isRestoring = restoringWorkpieceIds.includes(item.workpieceId);
          return (
            <li key={item.workpieceId}>
              <div className={`hs-workpiece-card${isActive ? " is-active" : ""}`}>
                <button
                  type="button"
                  className="hs-workpiece-button"
                  onClick={() => void openWorkpieceInFocus(item.workpieceId, {
                    preferredDraftId: item.draftId,
                  })}
                >
                  <div className="hs-workpiece-title-row">
                    <div className="hs-workpiece-title">{item.title}</div>
                    <span className={`hs-workpiece-presence ${resolveWorkpiecePresenceClass(item.workpieceId)}`}>
                      {resolveWorkpiecePresenceBadge(item.workpieceId)}
                    </span>
                  </div>
                  <div className="hs-workpiece-updated">Updated {formatUpdatedAt(updatedAt)}</div>
                  <div className="hs-workpiece-updated">
                    {draft ? `Last edited by ${resolveDraftEditorName(draft)}` : "No attached draft buffer yet"}
                  </div>
                </button>
                <div className="hs-workpiece-actions">
                  {draft && !item.isArchived ? (
                    <button type="button" onClick={() => void saveDraftMeta(draft, { pinned: !draft.pinned })}>
                      {draft.pinned ? "Unpin" : "Pin"}
                    </button>
                  ) : null}
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
    </section>
  );
}
