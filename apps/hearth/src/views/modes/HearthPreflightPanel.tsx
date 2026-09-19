import type { HearthPreflightAuthority } from "../../lib/hearth-research-preflight-authority";

export default function HearthPreflightPanel(props: {
  authority: HearthPreflightAuthority;
  onComplete: () => void | Promise<unknown>;
  onFinding: (findingId: string, action: "acknowledge" | "resolve") => void | Promise<unknown>;
}) {
  const { authority } = props;
  return (
    <section className="hs-script-validation" aria-label="Optional script check">
      <div className="hs-script-validation-title">Optional script check</div>
      <div className="hs-script-validation-subtitle">
        {authority.stale
          ? `Advisory results are stale: ${authority.staleReasons.join(", ") || "the script or evidence changed"}. Run the check again if you want updated suggestions.`
          : authority.reviewed
            ? "Optional review notes were saved for these exact script and evidence bytes."
            : "These editorial and factual suggestions are advisory. They never block Approve Script or Mark Ready."}
      </div>
      {authority.findings.length ? (
        <ul className="hs-script-validation-issues">
          {authority.findings.map((finding) => (
            <li key={finding.id}>
              <div><strong>{finding.severity === "blocker" ? "production concern" : finding.severity}</strong> · {finding.message}</div>
              {finding.excerpt ? <div className="hs-muted-text-subtle">{finding.excerpt}</div> : null}
              {finding.latestAction ? (
                <span className="hs-status-text">Handled: {finding.latestAction}</span>
              ) : finding.severity !== "note" && !authority.stale ? (
                <span className="hs-script-validation-actions">
                  {finding.severity === "warning" ? <button type="button" onClick={() => void props.onFinding(finding.id, "acknowledge")}>Note reviewed</button> : null}
                  <button type="button" onClick={() => void props.onFinding(finding.id, "resolve")}>Mark addressed</button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : <div className="hs-muted-text-subtle">No optional script-check suggestions found.</div>}
      {!authority.reviewed && !authority.stale ? (
        <div className="hs-script-validation-actions">
          <button type="button" onClick={() => void props.onComplete()}>Save optional review status</button>
        </div>
      ) : null}
    </section>
  );
}
