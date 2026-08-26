import type { Draft } from "../../domain/draft";
import type { BarStockSpark } from "../../lib/barstock-sparks";
import type { HearthWorkpieceSummary } from "../../lib/hearth-workpieces";

type SparkStatus = {
  label: string;
  detail?: string | null;
};

type HearthSparksModeProps = {
  sessionActiveWorkpieceId: string | null | undefined;
  sessionActiveDraftId: string | null | undefined;
  resolveWorkpieceIdForDraftId: (draftId: string | null) => string | null;
  normalizeUuid: (value: string | null | undefined) => string | null;
  workpieceSummaries: HearthWorkpieceSummary[];
  drafts: Draft[];
  hasActiveEpisode: boolean;
  workpieceId: string | null;
  routeProjectId: string | null;
  forgeGreetingName: string;
  selectedSpark: BarStockSpark | null;
  formatSparkStatus: (spark: BarStockSpark) => SparkStatus;
  buildSparkPreview: (text: string) => string;
  routeProjectLabel: string | null;
  forgeProjectIntoEpisode: () => void | Promise<void>;
  isForging: boolean;
  routeProjectSparks: BarStockSpark[];
  deriveSparkTitle: (spark: BarStockSpark) => string;
  startFromScratch: () => void | Promise<void>;
  onResumeLastProject: () => void | Promise<void>;
  formatRelativeUpdatedAt: (value: number) => string;
  forgeError: string | null;
  visibleSparks: BarStockSpark[];
  isSparksLoading: boolean;
  sparkDiscoveryError: string | null;
  setSelectedSparkId: (id: string) => void;
  onActivateSpark: (spark: BarStockSpark) => void | Promise<void>;
  formatSparkDate: (value: number | undefined) => string;
  resolveSparkActionLabel: (spark: BarStockSpark) => string;
  onStartForgingSelectedSpark: () => void | Promise<void>;
};

export default function HearthSparksMode({
  sessionActiveWorkpieceId,
  sessionActiveDraftId,
  resolveWorkpieceIdForDraftId,
  normalizeUuid,
  workpieceSummaries,
  drafts,
  hasActiveEpisode,
  workpieceId,
  routeProjectId,
  forgeGreetingName,
  selectedSpark,
  formatSparkStatus,
  buildSparkPreview,
  routeProjectLabel,
  forgeProjectIntoEpisode,
  isForging,
  routeProjectSparks,
  deriveSparkTitle,
  startFromScratch,
  onResumeLastProject,
  formatRelativeUpdatedAt,
  forgeError,
  visibleSparks,
  isSparksLoading,
  sparkDiscoveryError,
  setSelectedSparkId,
  onActivateSpark,
  formatSparkDate,
  resolveSparkActionLabel,
  onStartForgingSelectedSpark,
}: HearthSparksModeProps) {
  const resumeWorkpieceId = normalizeUuid(sessionActiveWorkpieceId)
    ?? resolveWorkpieceIdForDraftId(sessionActiveDraftId ?? null);
  const resumeWorkpiece = resumeWorkpieceId
    ? workpieceSummaries.find((entry) => entry.workpieceId === resumeWorkpieceId) ?? null
    : null;
  const resumeDraft = sessionActiveDraftId
    ? drafts.find((draft) => draft.id === sessionActiveDraftId) ?? null
    : null;
  const canResumeLast = Boolean(resumeWorkpieceId);
  const selectedSparkStatus = selectedSpark ? formatSparkStatus(selectedSpark) : null;
  const selectedSparkPreview = selectedSpark ? buildSparkPreview(selectedSpark.body) : "";
  const isFreshSession = !hasActiveEpisode && !workpieceId;
  const isProjectIntake = Boolean(routeProjectId);
  const sparksSubtext = isProjectIntake
    ? "Forge this Project into an Episode."
    : isFreshSession
    ? `Hello ${forgeGreetingName}, what would you like to forge today?`
    : "Pick a spark, then start forging in conversation.";

  return (
    <section className="hs-home hs-sparks-landing">
      <header className="hs-home-header">
        <h2 className="hs-home-title">Hearth</h2>
        <p className="hs-home-subtext">{sparksSubtext}</p>
      </header>

      {isProjectIntake ? (
        <div className="hs-resume-context hs-project-intake">
          <div>
            Project: <b>{routeProjectLabel ?? "Untitled Project"}</b>
            {workpieceId ? ` · Episode ${workpieceId.slice(0, 8)}` : " · No episode selected"}
          </div>
          <div className="hs-project-intake-actions">
            <button
              type="button"
              onClick={() => void forgeProjectIntoEpisode()}
              disabled={isForging || routeProjectSparks.length === 0}
            >
              Create New Episode
            </button>
            <span className="hs-project-intake-meta">
              Spark Stack: {routeProjectSparks.length}
            </span>
          </div>
          {routeProjectSparks.length > 0 ? (
            <div className="hs-project-intake-stack">
              {routeProjectSparks.map((spark) => (
                <div key={spark.id} className="hs-project-intake-spark">
                  {deriveSparkTitle(spark)}
                </div>
              ))}
            </div>
          ) : (
            <div className="hs-project-intake-meta">
              No sparks attached to this Project yet.
            </div>
          )}
        </div>
      ) : null}

      <div className="hs-home-actions">
        <button type="button" onClick={() => void startFromScratch()} disabled={isForging}>
          New project
        </button>
        <button type="button" onClick={() => void onResumeLastProject()} disabled={!canResumeLast}>
          Resume last project
        </button>
      </div>
      {resumeWorkpieceId ? (
        <div className="hs-resume-context">
          Last: {resumeWorkpiece?.title ?? resumeDraft?.title ?? "Untitled Episode"} · updated {" "}
          {formatRelativeUpdatedAt(
            resumeWorkpiece?.updatedAtMs
            ?? resumeDraft?.updatedAt
            ?? Date.now(),
          )}
        </div>
      ) : null}

      {forgeError ? (
        <div className="hs-error-text-small">{forgeError}</div>
      ) : null}

      <div className="hs-sparks-layout">
        <section className="hs-home-barstock">
          <h3 className="hs-home-section-title">Sparks</h3>
          <div className="hs-home-spark-list">
            <div className="hs-spark-card hs-spark-card-new">
              <div className="hs-spark-header">
                <div className="hs-spark-title">New project</div>
              </div>
              <div className="hs-spark-preview">
                Start from scratch without a Spark.
              </div>
              <div className="hs-spark-footer">
                <div className="hs-spark-status">Fresh workpiece</div>
                <button
                  type="button"
                  onClick={() => void startFromScratch()}
                  disabled={isForging}
                >
                  Start forging
                </button>
              </div>
            </div>

            {visibleSparks.length === 0 ? (
              <p className="hs-home-empty">
                {isSparksLoading
                  ? "Loading sparks from Bar Stock..."
                  : sparkDiscoveryError ?? "No sparks yet. Capture ideas in Bar Stock first."}
              </p>
            ) : (
              visibleSparks.map((spark) => {
                const status = formatSparkStatus(spark);
                const preview = buildSparkPreview(spark.body);
                const isSelected = selectedSpark?.id === spark.id;
                const actionLabel = resolveSparkActionLabel(spark);
                return (
                  <div
                    key={spark.id}
                    className={`hs-spark-card${isSelected ? " is-selected" : ""}`}
                    onMouseEnter={() => setSelectedSparkId(spark.id)}
                  >
                    <button
                      type="button"
                      className="hs-spark-select"
                      disabled={isForging}
                      onFocus={() => setSelectedSparkId(spark.id)}
                      onClick={() => void onActivateSpark(spark)}
                    >
                      <div className="hs-spark-header">
                        <div className="hs-spark-title">{deriveSparkTitle(spark)}</div>
                        <div className="hs-spark-date">
                          {formatSparkDate(spark.createdAt)}
                        </div>
                      </div>
                      <div className="hs-spark-preview">
                        {preview || "No preview available yet."}
                      </div>
                    </button>
                    <div className="hs-spark-footer">
                      <div className="hs-spark-status">
                        Status: {status.label}{status.detail ? ` · ${status.detail}` : ""}
                      </div>
                      <button
                        type="button"
                        onClick={() => void onActivateSpark(spark)}
                        disabled={isForging}
                      >
                        {actionLabel}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <aside className="hs-spark-detail-panel">
          <div className="hs-spark-detail-title">
            {selectedSpark ? deriveSparkTitle(selectedSpark) : "Select a spark"}
          </div>
          {selectedSpark ? (
            <>
              <div className="hs-spark-detail-meta">
                {formatSparkDate(selectedSpark.createdAt)}
                {selectedSparkStatus ? ` · ${selectedSparkStatus.label}` : ""}
              </div>
              <div className="hs-spark-detail-preview">
                {selectedSparkPreview || selectedSpark.body || "No preview available yet."}
              </div>
              <div className="hs-spark-detail-actions">
                <button
                  type="button"
                  onClick={() => void onStartForgingSelectedSpark()}
                  disabled={isForging}
                >
                  {selectedSpark ? resolveSparkActionLabel(selectedSpark) : "Start forging"}
                </button>
              </div>
            </>
          ) : (
            <p className="hs-home-empty">
              Choose a spark to preview it before forging.
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}
