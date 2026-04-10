export type HistoryArtifactPresence = {
  historyExists: boolean;
  snapshotManifestExists: boolean;
  historyPresenceSentinelExists: boolean;
  snapshotRecoveryStatus: string | null;
};

export function resolveHammerHistoryStatus(args: HistoryArtifactPresence): string | null {
  if (args.historyExists) {
    return args.snapshotRecoveryStatus;
  }

  const historyExpected = args.snapshotManifestExists || args.historyPresenceSentinelExists;
  if (!historyExpected) {
    // Fresh workpiece: no artifacts expected yet.
    return null;
  }

  // History was expected but missing. Don't mask; keep message specific.
  return "Persistent history missing. Opened baseline without replay.";
}

