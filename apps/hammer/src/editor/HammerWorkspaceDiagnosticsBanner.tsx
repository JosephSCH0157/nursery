import { useMemo, useState } from "react";
import type { JSX } from "react";
import type { HammerIssueDiagnostic, HammerIssueFixActionId } from "./hammerIssueDiagnostics";
import { formatAffectedAreas } from "./hammerIssueDiagnostics";
export { useHammerDiagnosticsPresentation } from "./useHammerDiagnosticsPresentation";

const actionLabel: Record<HammerIssueFixActionId, string> = {
  reload_latest: "Reload latest",
  retry_save: "Retry save",
  refresh_audio_prep: "Refresh audio prep",
  refresh_visual_placements: "Re-run placements",
};

const uniqStrings = (values: Array<string | null | undefined>): string[] => (
  [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))]
);

export function HammerWorkspaceDiagnosticsBanner(props: {
  issues: HammerIssueDiagnostic[];
  fallbackTitle: string;
  fallbackSummary: string | null;
  inFlightFixActionId: HammerIssueFixActionId | null;
  fixErrorMessage: string | null;
  onRunFixAction: (actionId: HammerIssueFixActionId) => void;
  onRunFixAll: (actionIds: HammerIssueFixActionId[]) => void;
  onDismiss?: () => void;
}): JSX.Element | null {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const issues = props.issues;
  const hasIssues = issues.length > 0;

  const {
    title,
    summary,
    affectedAreasLabel,
    safeActionsLabel,
    fixableActionIds,
  } = useMemo(() => {
    if (!hasIssues) {
      return {
        title: props.fallbackTitle,
        summary: props.fallbackSummary ?? "",
        affectedAreasLabel: "",
        safeActionsLabel: "",
        fixableActionIds: [] as HammerIssueFixActionId[],
      };
    }

    const severities = issues.map((issue) => issue.severity);
    const hasError = severities.includes("error");
    const baseTitle = issues.length === 1
      ? issues[0]?.title ?? "Issue detected"
      : hasError
        ? "Action required"
        : "Multiple issues need attention";

    const baseSummary = issues.length === 1
      ? issues[0]?.summary ?? ""
      : issues.map((issue) => issue.title).filter(Boolean).join(" · ");

    const affectedAreas = issues.flatMap((issue) => issue.affectedAreas);
    const safeActions = uniqStrings(issues.flatMap((issue) => issue.safeActions));
    const fixIds = uniqStrings(issues.map((issue) => issue.canAutoFix ? issue.fixActionId : null))
      .filter((value): value is HammerIssueFixActionId => Boolean(value)) as HammerIssueFixActionId[];

    return {
      title: baseTitle,
      summary: baseSummary,
      affectedAreasLabel: formatAffectedAreas(affectedAreas),
      safeActionsLabel: safeActions.join(" "),
      fixableActionIds: fixIds,
    };
  }, [hasIssues, issues]);

  const primaryFixActionId = hasIssues && issues.length === 1 ? issues[0]?.fixActionId : null;
  const primaryFixLabel = primaryFixActionId ? actionLabel[primaryFixActionId] : null;

  const isBusy = props.inFlightFixActionId != null;
  const busyLabel = props.inFlightFixActionId ? `${actionLabel[props.inFlightFixActionId]}…` : "Working…";

  return (
    <div className={["hammer-diagnostics-banner", hasIssues ? "has-issues" : ""].filter(Boolean).join(" ")} role="status" aria-live="polite">
      <div className="hammer-diagnostics-banner__main">
        <div className="hammer-diagnostics-banner__heading">
          <strong className="hammer-diagnostics-banner__title">{title}</strong>
          {hasIssues && issues.length > 1 ? (
            <button
              type="button"
              className="hammer-diagnostics-banner__link"
              onClick={() => setDetailsOpen((current) => !current)}
              disabled={isBusy}
            >
              {detailsOpen ? "Hide details" : "Details"}
            </button>
          ) : null}
          {hasIssues && props.onDismiss ? (
            <button
              type="button"
              className="hammer-diagnostics-banner__link"
              onClick={() => {
                setDetailsOpen(false);
                props.onDismiss?.();
              }}
              disabled={isBusy}
            >
              Dismiss
            </button>
          ) : null}
        </div>
        {summary ? <div className="hammer-diagnostics-banner__summary">{summary}</div> : null}
        {affectedAreasLabel ? (
          <div className="hammer-diagnostics-banner__meta">
            <span className="hammer-diagnostics-banner__meta-label">Affects:</span> {affectedAreasLabel}
          </div>
        ) : null}
        {safeActionsLabel ? (
          <div className="hammer-diagnostics-banner__meta">
            <span className="hammer-diagnostics-banner__meta-label">Safe:</span> {safeActionsLabel}
          </div>
        ) : null}
        {props.fixErrorMessage ? (
          <div className="hammer-diagnostics-banner__error">{props.fixErrorMessage}</div>
        ) : null}
      </div>

      {hasIssues ? (
        <div className="hammer-diagnostics-banner__actions">
          {primaryFixActionId && primaryFixLabel ? (
            <button
              type="button"
              className="hammer-diagnostics-banner__button hammer-diagnostics-banner__button--primary"
              onClick={() => props.onRunFixAction(primaryFixActionId)}
              disabled={isBusy}
            >
              {isBusy ? busyLabel : primaryFixLabel}
            </button>
          ) : fixableActionIds.length > 0 ? (
            <button
              type="button"
              className="hammer-diagnostics-banner__button hammer-diagnostics-banner__button--primary"
              onClick={() => props.onRunFixAll(fixableActionIds)}
              disabled={isBusy}
            >
              {isBusy ? busyLabel : "Fix available issues"}
            </button>
          ) : null}

          {issues.length === 1 && issues[0]?.recommendedAction ? (
            <div className="hammer-diagnostics-banner__recommendation">
              {issues[0].recommendedAction}
            </div>
          ) : null}
        </div>
      ) : null}

      {detailsOpen ? (
        <div className="hammer-diagnostics-banner__details" role="group" aria-label="Issue details">
          {issues.map((issue) => {
            const fixId = issue.fixActionId;
            const fixLabel = fixId ? actionLabel[fixId] : null;
            const issueAffected = formatAffectedAreas(issue.affectedAreas);
            const safe = uniqStrings(issue.safeActions).join(" ");
            return (
              <div key={issue.id} className={`hammer-diagnostics-banner__issue severity-${issue.severity}`}>
                <div className="hammer-diagnostics-banner__issue-row">
                  <strong>{issue.title}</strong>
                  {issue.canAutoFix && fixId && fixLabel ? (
                    <button
                      type="button"
                      className="hammer-diagnostics-banner__button"
                      onClick={() => props.onRunFixAction(fixId)}
                      disabled={isBusy}
                    >
                      {isBusy && props.inFlightFixActionId === fixId ? busyLabel : fixLabel}
                    </button>
                  ) : null}
                </div>
                <div className="hammer-diagnostics-banner__issue-summary">{issue.summary}</div>
                {issueAffected ? (
                  <div className="hammer-diagnostics-banner__issue-meta">
                    <span className="hammer-diagnostics-banner__meta-label">Affects:</span> {issueAffected}
                  </div>
                ) : null}
                {safe ? (
                  <div className="hammer-diagnostics-banner__issue-meta">
                    <span className="hammer-diagnostics-banner__meta-label">Safe:</span> {safe}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
