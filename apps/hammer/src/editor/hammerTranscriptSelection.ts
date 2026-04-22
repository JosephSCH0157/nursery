export type HammerHydratedTranscriptSource =
  | "registered_transcript"
  | "revision_transcript"
  | "canonical_baseline"
  | "none";

export type HammerTranscriptHydrationInputs = {
  registered: {
    load_ok: boolean;
    segment_count: number | null;
    definitively_bad: boolean;
  };
  revision: {
    load_ok: boolean;
    segment_count: number | null;
  };
  baseline: {
    load_ok: boolean;
    segment_count: number | null;
  };
};

export type HammerTranscriptHydrationDecision = {
  selected_source: HammerHydratedTranscriptSource;
  downgrade_guard_applied: boolean;
};

const MATERIAL_UPGRADE_MIN_DELTA = 25;
const MATERIAL_UPGRADE_MIN_RATIO = 1.5;

function readCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isMaterialUpgrade(candidateCount: number, currentCount: number): boolean {
  if (candidateCount <= 0 || currentCount <= 0) return false;
  if (candidateCount < currentCount + MATERIAL_UPGRADE_MIN_DELTA) return false;
  return candidateCount >= currentCount * MATERIAL_UPGRADE_MIN_RATIO;
}

export function decideHammerTranscriptHydrationSource(
  inputs: HammerTranscriptHydrationInputs,
): HammerTranscriptHydrationDecision {
  const registeredCount = readCount(inputs.registered.segment_count);
  const revisionCount = readCount(inputs.revision.segment_count);
  const baselineCount = readCount(inputs.baseline.segment_count);

  const registeredOk = inputs.registered.load_ok && !inputs.registered.definitively_bad && registeredCount > 0;
  const revisionOk = inputs.revision.load_ok && revisionCount > 0;
  const baselineOk = inputs.baseline.load_ok && baselineCount > 0;

  if (!registeredOk && !revisionOk && !baselineOk) {
    return { selected_source: "none", downgrade_guard_applied: false };
  }

  // Reopen semantics: prefer the active revision transcript when viable because it
  // carries the latest editor state/history basis for this workpiece session.
  if (revisionOk) {
    if (registeredOk && isMaterialUpgrade(registeredCount, revisionCount)) {
      return { selected_source: "registered_transcript", downgrade_guard_applied: true };
    }
    return { selected_source: "revision_transcript", downgrade_guard_applied: false };
  }

  if (registeredOk) {
    if (baselineOk && isMaterialUpgrade(baselineCount, registeredCount)) {
      return { selected_source: "canonical_baseline", downgrade_guard_applied: true };
    }
    return { selected_source: "registered_transcript", downgrade_guard_applied: false };
  }

  return { selected_source: "canonical_baseline", downgrade_guard_applied: false };
}

