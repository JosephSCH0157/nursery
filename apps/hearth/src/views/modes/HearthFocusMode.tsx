import type { ReactNode } from "react";

type FocusTab = "draft" | "planning" | "sources" | "revisions";

type HearthFocusModeProps = {
  hasActiveEpisode: boolean;
  onGoToEpisodes: () => void;
  activeWorkpieceIsArchived: boolean;
  activeWorkpieceTitle: string;
  activeWorkpieceArchiveReason: string | null;
  activeWorkpieceId: string | null;
  isRestoringArchivedWorkpiece: boolean;
  onRestoreArchivedWorkpiece: () => void | Promise<void>;
  hasActiveDraft: boolean;
  onRetryDraftHydration: () => unknown | Promise<unknown>;
  workpieceId: string | null;
  focusTab: FocusTab;
  renderPlanningView: () => ReactNode;
  renderSourcesView: () => ReactNode;
  renderRevisionsView: () => ReactNode;
  renderDraftView: () => ReactNode;
};

export default function HearthFocusMode({
  hasActiveEpisode,
  onGoToEpisodes,
  activeWorkpieceIsArchived,
  activeWorkpieceTitle,
  activeWorkpieceArchiveReason,
  activeWorkpieceId,
  isRestoringArchivedWorkpiece,
  onRestoreArchivedWorkpiece,
  hasActiveDraft,
  onRetryDraftHydration,
  workpieceId,
  focusTab,
  renderPlanningView,
  renderSourcesView,
  renderRevisionsView,
  renderDraftView,
}: HearthFocusModeProps) {
  if (!hasActiveEpisode) {
    return (
      <section className="hs-home">
        <header className="hs-home-header">
          <h2 className="hs-home-title">Focus Mode</h2>
          <p className="hs-home-subtext">Open an Episode from Episodes (In Progress) first.</p>
        </header>
        <div className="hs-home-actions">
          <button type="button" onClick={onGoToEpisodes}>
            Go to Episodes
          </button>
        </div>
      </section>
    );
  }

  if (activeWorkpieceIsArchived) {
    return (
      <section className="hs-home">
        <header className="hs-home-header">
          <h2 className="hs-home-title">{activeWorkpieceTitle}</h2>
          <p className="hs-home-subtext">This workpiece is archived. Restore it to review, then re-ready it before recording.</p>
        </header>
        {activeWorkpieceArchiveReason ? (
          <div className="hs-rail-meta">Archive reason: {activeWorkpieceArchiveReason}</div>
        ) : null}
        <div className="hs-home-actions">
          <button
            type="button"
            onClick={() => void onRestoreArchivedWorkpiece()}
            disabled={isRestoringArchivedWorkpiece || !activeWorkpieceId}
          >
            {isRestoringArchivedWorkpiece ? "Restoring..." : "Restore Workpiece"}
          </button>
          <button type="button" onClick={onGoToEpisodes}>
            Back to Episodes
          </button>
        </div>
      </section>
    );
  }

  if (!hasActiveDraft) {
    return (
      <section className="hs-home">
        <header className="hs-home-header">
          <h2 className="hs-home-title">{activeWorkpieceTitle}</h2>
          <p className="hs-home-subtext">Hydrating the attached draft buffer for this Episode.</p>
        </header>
        <div className="hs-home-actions">
          <button
            type="button"
            onClick={() => void onRetryDraftHydration()}
            disabled={!workpieceId}
          >
            Retry draft hydration
          </button>
          <button type="button" onClick={onGoToEpisodes}>
            Back to Episodes
          </button>
        </div>
      </section>
    );
  }

  switch (focusTab) {
    case "planning":
      return renderPlanningView();
    case "sources":
      return renderSourcesView();
    case "revisions":
      return renderRevisionsView();
    case "draft":
    default:
      return renderDraftView();
  }
}
