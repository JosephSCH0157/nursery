import type { EpisodeMediaMapStatus } from "../../lib/episode-package-v2";

type ReleasePrepSection = {
  key: string;
  label: string;
  content: string;
};

type ReleaseSurfaceProps = {
  hasApprovedScript: boolean;
  approvedScriptVersion: number | null;
  aiCreditsDepleted: boolean;
  isAiProcessing: boolean;
  activeProductionAction: string | null;
  releasePrepScriptVersion: number | null;
  latestReleasePrepRawText: string | null;
  releasePrepLoadState: "idle" | "loading" | "ready" | "missing" | "error";
  latestReleasePrepSections: ReleasePrepSection[];
  onGenerateSeo: () => void;
  onGenerateTags: () => void;
  onGenerateReleasePrepPack: () => void;
  onOpenVisualsTab: () => void;
  onRefreshReleasePrepPack: () => void;
  hasMetadataComplete: boolean;
  hasThumbnailsSelected: boolean;
  mediaMapStatus: EpisodeMediaMapStatus | null;
  releaseReadinessCompleteCount: number;
  releaseReadinessTotalCount: number;
};

export default function ReleaseSurface(props: ReleaseSurfaceProps) {
  if (!props.hasApprovedScript || !props.approvedScriptVersion) return null;
  const mediaPlanActivated = props.mediaMapStatus === "activated"
    || props.mediaMapStatus === "fulfilling"
    || props.mediaMapStatus === "fulfilled";

  return (
    <section className="hs-release-prep-viewer" aria-label="Release workspace">
      <div className="hs-release-prep-viewer__head">
        <strong>Release Prep</strong>
        <span>Finalize launch packaging and review latest prep output.</span>
      </div>
      <div className="hs-production-action-row" role="group" aria-label="Release actions">
        <button
          type="button"
          onClick={props.onGenerateSeo}
          disabled={props.isAiProcessing || props.aiCreditsDepleted}
        >
          {props.activeProductionAction === "seo" && props.isAiProcessing ? "Generating..." : "Generate SEO"}
        </button>
        <button
          type="button"
          onClick={props.onGenerateTags}
          disabled={props.isAiProcessing || props.aiCreditsDepleted}
        >
          {props.activeProductionAction === "tags" && props.isAiProcessing ? "Generating..." : "Generate Tags"}
        </button>
        <button
          type="button"
          onClick={props.onGenerateReleasePrepPack}
          disabled={props.isAiProcessing || props.aiCreditsDepleted}
        >
          {props.activeProductionAction === "release_prep_pack" && props.isAiProcessing
            ? "Generating..."
            : "Generate Release Prep Pack"}
        </button>
        <button type="button" onClick={props.onOpenVisualsTab}>
          Open Launch Variants (Visuals)
        </button>
      </div>
      <div className="hs-release-checklist" aria-label="Release readiness checklist">
        <div className="hs-release-checklist-item">
          {props.releaseReadinessCompleteCount}/{props.releaseReadinessTotalCount} checks complete
        </div>
        <div className="hs-release-checklist-item">{props.hasApprovedScript ? "✔" : "○"} Script approved</div>
        <div className="hs-release-checklist-item">{mediaPlanActivated ? "✔" : "○"} Media plan activated</div>
        <div className="hs-release-checklist-item">{props.hasMetadataComplete ? "✔" : "○"} Metadata complete</div>
        <div className="hs-release-checklist-item">{props.hasThumbnailsSelected ? "✔" : "○"} Thumbnails selected</div>
      </div>
      <div className="hs-release-prep-viewer__meta">
        <span>
          {props.releasePrepScriptVersion
            ? `Script v${props.releasePrepScriptVersion}`
            : `Script v${props.approvedScriptVersion}`}
          {props.latestReleasePrepRawText ? ` · ${props.latestReleasePrepRawText.length} chars` : ""}
        </span>
        <button
          type="button"
          onClick={props.onRefreshReleasePrepPack}
          disabled={props.isAiProcessing || props.releasePrepLoadState === "loading"}
        >
          {props.releasePrepLoadState === "loading" ? "Refreshing..." : "Refresh"}
        </button>
      </div>
      {props.releasePrepLoadState === "missing" ? (
        <div className="hs-field-label-muted">
          No saved Release Prep Pack for this approved script version yet.
        </div>
      ) : null}
      {props.releasePrepLoadState === "error" ? (
        <div className="hs-error-text-small">Could not load the latest Release Prep Pack artifact.</div>
      ) : null}
      {props.releasePrepLoadState === "ready" && props.latestReleasePrepSections.length > 0 ? (
        <div className="hs-release-prep-viewer__sections">
          {props.latestReleasePrepSections.map((section) => (
            <article key={section.key} className="hs-release-prep-viewer__section">
              <header>{section.label}</header>
              <pre>{section.content}</pre>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
