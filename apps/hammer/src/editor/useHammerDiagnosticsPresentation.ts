import { useEffect, useMemo, useState } from "react";
import { deriveHammerDiagnosticsPresentation, type HammerIssueDiagnostic } from "./hammerIssueDiagnostics";

export function useHammerDiagnosticsPresentation(args: {
  currentPass: string | null;
  issueSetHash: string;
  issues: HammerIssueDiagnostic[];
  showIssueSet: (hash: string | null) => void;
}) {
  const [visualDetailsExpanded, setVisualDetailsExpanded] = useState(false);
  const transcriptPassActive = args.currentPass == null || ["transcript_cleanup", "retakes", "gap_pacing"].includes(args.currentPass);
  const presentation = useMemo(
    () => deriveHammerDiagnosticsPresentation({ currentPass: args.currentPass, issues: args.issues, visualDetailsExpanded }),
    [args.currentPass, args.issues, visualDetailsExpanded],
  );
  useEffect(() => {
    if (transcriptPassActive) return;
    setVisualDetailsExpanded(false);
    if (args.issues.some((issue) => issue.affectedAreas.includes("visuals"))) args.showIssueSet(args.issueSetHash);
  }, [args.issueSetHash, args.issues, args.showIssueSet, transcriptPassActive]);
  return {
    ...presentation,
    collapseVisualDetails: () => setVisualDetailsExpanded(false),
    showVisualDetails: () => {
      setVisualDetailsExpanded(true);
      args.showIssueSet(args.issueSetHash);
    },
  };
}
