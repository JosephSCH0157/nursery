import { useEffect, useMemo, useState } from "react";
import { deriveHammerDiagnosticsPresentation, type HammerIssueDiagnostic } from "./hammerIssueDiagnostics";

export function useHammerDiagnosticsPresentation(args: {
  currentPass: string | null;
  issueSetHash: string;
  issues: HammerIssueDiagnostic[];
  showIssueSet: (hash: string | null) => void;
}) {
  const { currentPass, issues, issueSetHash, showIssueSet } = args;
  const [visualDetailsExpanded, setVisualDetailsExpanded] = useState(false);
  const transcriptPassActive = currentPass == null || ["transcript_cleanup", "retakes", "gap_pacing"].includes(currentPass);
  const presentation = useMemo(
    () => deriveHammerDiagnosticsPresentation({ currentPass, issues, visualDetailsExpanded }),
    [currentPass, issues, visualDetailsExpanded],
  );
  useEffect(() => {
    if (transcriptPassActive) return;
    setVisualDetailsExpanded(false);
    if (issues.some((issue) => issue.affectedAreas.includes("visuals"))) showIssueSet(issueSetHash);
  }, [issueSetHash, issues, showIssueSet, transcriptPassActive]);
  return {
    ...presentation,
    collapseVisualDetails: () => setVisualDetailsExpanded(false),
    showVisualDetails: () => {
      setVisualDetailsExpanded(true);
      showIssueSet(issueSetHash);
    },
  };
}
