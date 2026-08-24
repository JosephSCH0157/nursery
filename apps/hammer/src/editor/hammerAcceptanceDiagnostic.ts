export type HammerAcceptanceDiagnostic = Readonly<{
  schema: "forge.hammer-acceptance-diagnostic.v1";
  transcriptSegments: number;
  canonicalPlacements: number;
  mountedCompositionClips: number;
  uncertainCompositionClips: number;
  undoDepth: number;
  redoDepth: number;
  historyCurrentHeadMismatch: boolean;
  historyHeadEntryId: string | null;
}>;

export function buildHammerAcceptanceDiagnostic(args: Omit<HammerAcceptanceDiagnostic, "schema" | "historyCurrentHeadMismatch"> & { historyStatus: string | null }): HammerAcceptanceDiagnostic {
  return Object.freeze({
    schema: "forge.hammer-acceptance-diagnostic.v1",
    transcriptSegments: args.transcriptSegments,
    canonicalPlacements: args.canonicalPlacements,
    mountedCompositionClips: args.mountedCompositionClips,
    uncertainCompositionClips: args.uncertainCompositionClips,
    undoDepth: args.undoDepth,
    redoDepth: args.redoDepth,
    historyCurrentHeadMismatch: args.historyStatus?.includes("history_current_head_mismatch") ?? false,
    historyHeadEntryId: args.historyHeadEntryId,
  });
}
