import type { JSX } from "react";
import type {
  HammerExportToolBayContext,
  HammerPassCompletionToolBayContext,
  HammerReleaseReadinessToolBayContext,
  HammerUnsupportedToolBayContext,
} from "./hammerToolBayContext";

export type HammerMigratedToolBayBodyContext =
  | HammerUnsupportedToolBayContext
  | HammerReleaseReadinessToolBayContext
  | HammerExportToolBayContext;

export function HammerTypedPassCompletionHeader(props: { context: HammerPassCompletionToolBayContext }): JSX.Element {
  const { data, commands } = props.context;
  return (
    <header className="hammer-bay-head" data-hammer-tool-bay-surface="pass_completion">
      <strong>Tool Rack</strong>
      <span className="hammer-toolbay-live-marker">TOOLBAY FILE IS LIVE</span>
      <div className="hammer-pass-head">
        <span>{data.passLabel}</span>
        <span className={`hammer-pass-badge hammer-pass-badge--${data.passStatus}`}>{data.passStatus}</span>
        <button type="button" onClick={commands.markPassComplete}>Mark Complete</button>
      </div>
    </header>
  );
}

function UnsupportedSurface(props: { context: HammerUnsupportedToolBayContext }): JSX.Element {
  const { data } = props.context;
  return (
    <section className="hammer-tool-card" data-hammer-tool-bay-surface="unsupported" data-hammer-tool-bay-route-reason={data.reason}>
      <header className="hammer-tool-card__head">Unsupported Tool Bay State</header>
      <div className="hammer-tool-hint">Route unavailable: {data.reason}</div>
    </section>
  );
}

function ReadinessSurface(props: { context: HammerReleaseReadinessToolBayContext }): JSX.Element {
  const { data, commands } = props.context;
  return (
    <section className="hammer-tool-card" data-hammer-tool-bay-surface="release_readiness">
      <header className="hammer-tool-card__head">Ready State</header>
      <div className="hammer-tool-hint">Hammer prepares and hands off. Quench publishes and distributes.</div>
      <div className="hammer-source-list">
        {data.summaryAreas.map((item) => (
          <article key={`ready-${item.id}`} className="hammer-source-card">
            <header className="hammer-source-card__head"><strong>{item.label}</strong><span>{item.status.replace("_", " ")}</span></header>
          </article>
        ))}
      </div>
      <div className="hammer-tool-hint">Readiness: {data.readinessLabel}{` · blockers ${data.blockerCount} · review ${data.reviewCount}`}</div>
      <div className="hammer-tool-hint">Export packet: {data.exportStatusLabel}</div>
      <button type="button" onClick={commands.sendToQuench} disabled={data.sending || data.loading || data.blocked}>
        {data.sending ? "Sending..." : data.sendLabel}
      </button>
      {data.handoffStatus ? <div className="hammer-tool-hint">Handoff status: {data.handoffStatus.status} · {data.handoffStatus.message}</div> : null}
    </section>
  );
}

function ExportSurface(props: { context: HammerExportToolBayContext }): JSX.Element {
  const { data, commands } = props.context;
  return (
    <section className="hammer-tool-card" data-hammer-tool-bay-surface="export">
      <header className="hammer-tool-card__head">Quench Handoff</header>
      <div className="hammer-tool-hint">{data.handoffAvailable ? "Handoff path available." : "Handoff path unavailable."}</div>
      <div className="hammer-tool-hint">Export status: {data.exportStatusLabel}</div>
      <div className="hammer-tool-hint">Readiness gate: {data.readinessLabel}{` · blockers ${data.blockerCount} · review ${data.reviewCount}`}</div>
      <div className="hammer-tool-hint">Output source: {data.outputSelectionSummary}</div>
      <div className="hammer-tool-hint">Preview truth: {data.previewTruthPosture}</div>
      <div className="hammer-tool-hint">Export truth: {data.exportTruthPosture}</div>
      <div className="hammer-tool-hint">Handoff truth: {data.handoffTruthPosture}</div>
      {data.previewTruthPosture !== "authoritative" ? <div className="hammer-tool-hint">Preview is {data.previewTruthPosture}; at least one active operation is not fully previewable in this runtime.</div> : null}
      {data.unresolvedBrollCount > 0 ? <div className="hammer-tool-hint">{data.unresolvedBrollCount} unresolved B-roll intent(s) need binding before authoritative visual handoff.</div> : null}
      {data.blockingReasons.length > 0 ? <div className="hammer-tool-hint">Blocking reasons: {data.blockingReasons.slice(0, 3).map((reason) => reason.label).join(" ")}</div> : null}
      {data.reviewReasons.length > 0 ? <div className="hammer-tool-hint">Review reasons: {data.reviewReasons.slice(0, 3).map((reason) => reason.label).join(" ")}</div> : null}
      {(data.blockingReasons.length > 0 || data.reviewReasons.length > 0) ? <button type="button" onClick={commands.focusIssue}>Review Next Issue</button> : null}
      <div className={`hammer-caption-release-summary hammer-caption-release-summary--${data.captionSafetyState}`}>
        <div className="hammer-caption-release-summary__head"><strong>Caption release truth</strong><span>{data.captionSafetyLabel}</span></div>
        <div className="hammer-caption-release-summary__meta">{data.captionSummaryLine}</div>
        <div className="hammer-caption-release-summary__basis">Basis: {data.captionSourceLabel}</div>
        <div className="hammer-caption-release-summary__detail">{data.captionSafetyDetail}</div>
      </div>
      {data.renderStatus ? <>
        <div className="hammer-tool-hint">Studio Rack render: {data.renderStatus.message}</div>
        <div className="hammer-tool-hint">Render receipt: requested lane {data.renderStatus.requestedBackend}, resolved lane {data.renderStatus.resolvedBackend}, status {data.renderStatus.status}</div>
        {data.renderStatus.outputWorkpiecePath ? <div className="hammer-tool-hint">Render artifact path: {data.renderStatus.outputWorkpiecePath}</div> : null}
        {data.renderStatus.appliedModules.length > 0 ? <div className="hammer-tool-hint">Render applied modules: {data.renderStatus.appliedModules.join(", ")}</div> : null}
        {data.renderStatus.deferredModules.length > 0 ? <div className="hammer-tool-hint">Requested but not yet rendered in v1: {data.renderStatus.deferredModules.join(", ")}</div> : null}
      </> : null}
      <div className="hammer-tool-hint">Layer selection lives in Source Desk → Advanced.</div>
      {data.loading ? <div className="hammer-tool-hint">Checking Quench packet state...</div> : null}
      {data.preparedPackage ? <>
        <div className="hammer-tool-hint">Last exported {new Date(data.preparedPackage.preparedAt).toLocaleString()}.</div>
        {data.preparedPackage.transcriptFingerprint ? <div className="hammer-tool-hint">Basis {data.preparedPackage.transcriptFingerprint.slice(0, 18)}...</div> : null}
      </> : null}
      {data.exportTruthState === "stale" && data.staleReasons.length > 0 ? <div className="hammer-tool-hint">Changes since last prepare: {data.staleReasons.join("; ")}.</div> : null}
      <button type="button" onClick={commands.sendToQuench} disabled={data.sending || data.loading || data.readinessStatus === "blocked"}>{data.sending ? "Sending..." : data.sendLabel}</button>
      {data.handoffStatus ? <div className="hammer-tool-hint">Handoff status: {data.handoffStatus.status} · {data.handoffStatus.message}</div> : null}
      {data.savedPackage ? <div className="hammer-tool-hint">
        {data.readinessStatus === "ready" ? "Ready for Quench." : data.readinessStatus === "blocked" ? "Prepared packet is blocked for handoff." : "Prepared packet needs review before handoff."}
        {" "}Exported {new Date(data.savedPackage.preparedAt).toLocaleString()}. Status {data.savedPackage.overallStatus}. Subtitle artifacts {data.savedPackage.subtitleArtifactCount}.
      </div> : null}
      {data.error ? <div className="hammer-tool-hint">{data.error}</div> : null}
      {data.openHref && data.exportTruthState !== "never_prepared" ? <a href={data.openHref}>{data.readinessStatus === "blocked" ? "Open in Quench (blocked)" : data.exportTruthState === "current" ? "Open in Quench" : "Open in Quench (stale)"}</a> : null}
    </section>
  );
}

export function HammerTypedToolBayBody(props: { context: HammerMigratedToolBayBodyContext }): JSX.Element {
  if (props.context.surface === "unsupported") return <UnsupportedSurface context={props.context} />;
  if (props.context.surface === "release_readiness") return <ReadinessSurface context={props.context} />;
  return <ExportSurface context={props.context} />;
}
