import type { HearthPreflightAuthority } from "../../lib/hearth-research-preflight-authority";

export default function HearthPreflightPanel(props: {
  authority: HearthPreflightAuthority;
  onComplete: () => void | Promise<unknown>;
  onFinding: (findingId: string, action: "acknowledge" | "resolve") => void | Promise<unknown>;
}) {
  const { authority } = props;
  return (
    <section className="hs-script-validation" aria-label="Producer review">
      <div className="hs-script-validation-title">Producer review</div>
      <div className="hs-script-validation-subtitle">
        {authority.stale
          ? `Stale: ${authority.staleReasons.join(", ") || "the script or evidence changed"}.`
          : authority.reviewed
            ? "Review complete for these exact script and evidence bytes."
            : "Review each blocker and warning before approving this exact draft."}
      </div>
      {authority.findings.length ? (
        <ul className="hs-script-validation-issues">
          {authority.findings.map((finding) => (
            <li key={finding.id}>
              <div><strong>{finding.severity}</strong> · {finding.message}</div>
              {finding.excerpt ? <div className="hs-muted-text-subtle">{finding.excerpt}</div> : null}
              {finding.latestAction ? (
                <span className="hs-status-text">Handled: {finding.latestAction}</span>
              ) : finding.severity !== "note" && !authority.stale ? (
                <span className="hs-script-validation-actions">
                  {finding.severity === "warning" ? <button type="button" onClick={() => void props.onFinding(finding.id, "acknowledge")}>Acknowledge</button> : null}
                  <button type="button" onClick={() => void props.onFinding(finding.id, "resolve")}>Mark resolved</button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : <div className="hs-muted-text-subtle">No deterministic producer concerns found.</div>}
      {!authority.reviewed && !authority.stale ? (
        <div className="hs-script-validation-actions">
          <button type="button" onClick={() => void props.onComplete()}>Complete producer review</button>
        </div>
      ) : null}
    </section>
  );
}
