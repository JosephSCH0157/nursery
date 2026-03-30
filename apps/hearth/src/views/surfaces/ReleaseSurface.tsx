import type { EpisodeMediaMapStatus } from "../../lib/episode-package-v2";

type ReleaseSurfaceProps = {
  hasApprovedScript: boolean;
  approvedScriptVersion: number | null;
  hasFramingComplete: boolean;
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
  const readyToShip = props.releaseReadinessCompleteCount >= props.releaseReadinessTotalCount;

  return (
    <section className="hs-release-prep-viewer" aria-label="Release workspace">
      <div className="hs-release-prep-viewer__head">
        <strong>Release</strong>
        <span>Final readiness check before shipping.</span>
      </div>
      <div className="hs-release-checklist" aria-label="Release readiness checklist">
        <div className="hs-release-checklist-item">
          {props.releaseReadinessCompleteCount}/{props.releaseReadinessTotalCount} checks complete
        </div>
        <div className="hs-release-checklist-item">{props.hasApprovedScript ? "✔" : "○"} Script approved</div>
        <div className="hs-release-checklist-item">{mediaPlanActivated ? "✔" : "○"} Media plan activated</div>
        <div className="hs-release-checklist-item">{props.hasFramingComplete ? "✔" : "○"} Framing complete</div>
        <div className="hs-release-checklist-item">{props.hasThumbnailsSelected ? "✔" : "○"} Thumbnails selected</div>
      </div>
      <div className="hs-release-prep-viewer__meta">
        <span>
          {props.approvedScriptVersion ? `Script v${props.approvedScriptVersion}` : "No approved script"}
          {` · ${readyToShip ? "Launch package ready" : "Launch package pending"}`}
        </span>
      </div>
      <div className="hs-field-label-muted">
        Release stays honest: finish framing first, then lock visuals, then ship.
      </div>
    </section>
  );
}
