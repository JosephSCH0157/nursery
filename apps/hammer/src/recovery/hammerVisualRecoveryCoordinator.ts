export type RecoveryArtifactKey = "visual_timeline" | "visual_placements" | "history";
export const HAMMER_RECOVERY_WRITE_ORDER: readonly RecoveryArtifactKey[] = [
  "visual_timeline",
  "visual_placements",
  "history",
];

export type RecoveryArtifactHashes = Record<RecoveryArtifactKey, string>;

export type RecoveryDisposition =
  | { action: "complete"; write: readonly RecoveryArtifactKey[] }
  | { action: "resume"; write: readonly RecoveryArtifactKey[] }
  | { action: "compensate"; restore: readonly RecoveryArtifactKey[] }
  | { action: "abort"; foreign: readonly RecoveryArtifactKey[] };

/** Plans an idempotent continuation from server truth; the journal ID is provenance only. */
export function planHammerVisualRecovery(args: {
  original: RecoveryArtifactHashes;
  intended: RecoveryArtifactHashes;
  observed: RecoveryArtifactHashes;
  preferCompensation?: boolean;
}): RecoveryDisposition {
  const foreign = HAMMER_RECOVERY_WRITE_ORDER.filter((key) => (
    args.observed[key] !== args.original[key] && args.observed[key] !== args.intended[key]
  ));
  if (foreign.length) return { action: "abort", foreign };

  const intendedPrefix: RecoveryArtifactKey[] = [];
  const originalSuffix: RecoveryArtifactKey[] = [];
  let reachedOriginal = false;
  for (const key of HAMMER_RECOVERY_WRITE_ORDER) {
    if (args.observed[key] === args.intended[key] && !reachedOriginal) intendedPrefix.push(key);
    else if (args.observed[key] === args.original[key]) {
      reachedOriginal = true;
      originalSuffix.push(key);
    } else {
      return { action: "abort", foreign: [key] };
    }
  }

  if (intendedPrefix.length === HAMMER_RECOVERY_WRITE_ORDER.length) {
    return { action: "complete", write: [] };
  }
  if (intendedPrefix.length === 0) {
    return { action: "resume", write: [...HAMMER_RECOVERY_WRITE_ORDER] };
  }
  if (args.preferCompensation) {
    return { action: "compensate", restore: intendedPrefix };
  }
  return { action: "resume", write: originalSuffix };
}

export function appendRecoveryHistoryEntryOnce<T extends { entry_id: string }>(args: {
  entries: readonly T[];
  entry: T;
}): readonly T[] {
  return args.entries.some((candidate) => candidate.entry_id === args.entry.entry_id)
    ? args.entries
    : [...args.entries, args.entry];
}

export type RecoveryArtifactVersion<T = unknown> = {
  hash: string;
  updatedAt: string;
  data: T;
};

export type HammerRecoveryArtifactSet<T = unknown> = Record<RecoveryArtifactKey, RecoveryArtifactVersion<T>>;

export interface HammerVisualRecoveryAdapter<T = unknown> {
  readAll(): Promise<HammerRecoveryArtifactSet<T>>;
  write(args: { key: RecoveryArtifactKey; data: T; expectedPreviousUpdatedAt: string }): Promise<RecoveryArtifactVersion<T>>;
}

export type HammerRecoveryExecutionResult =
  | { status: "complete"; writes: number; compensations: number; rereads: number }
  | { status: "compensated"; writes: number; compensations: number; rereads: number }
  | { status: "conflict" | "foreign_mutation"; writes: number; compensations: number; rereads: number; key: RecoveryArtifactKey };

export async function executeHammerVisualRecovery<T>(args: {
  original: HammerRecoveryArtifactSet<T>;
  intended: HammerRecoveryArtifactSet<T>;
  adapter: HammerVisualRecoveryAdapter<T>;
  preferCompensation?: boolean;
}): Promise<HammerRecoveryExecutionResult> {
  let writes = 0;
  let compensations = 0;
  let rereads = 1;
  let observed = await args.adapter.readAll();
  const hashes = (set: HammerRecoveryArtifactSet<T>): RecoveryArtifactHashes => ({
    visual_timeline: set.visual_timeline.hash,
    visual_placements: set.visual_placements.hash,
    history: set.history.hash,
  });
  for (let pass = 0; pass < 4; pass += 1) {
    const disposition = planHammerVisualRecovery({
      original: hashes(args.original), intended: hashes(args.intended), observed: hashes(observed),
      preferCompensation: args.preferCompensation,
    });
    if (disposition.action === "abort") return { status: "foreign_mutation", writes, compensations, rereads, key: disposition.foreign[0] };
    if (disposition.action === "complete") return { status: "complete", writes, compensations, rereads };
    const keys = disposition.action === "resume" ? disposition.write : disposition.restore;
    const compensation = disposition.action === "compensate";
    let ambiguousKey: RecoveryArtifactKey | null = null;
    for (const key of keys) {
      const beforeHashes = hashes(observed);
      const desired = compensation ? args.original[key] : args.intended[key];
      const expectedPreviousUpdatedAt = compensation ? observed[key].updatedAt : args.original[key].updatedAt;
      if (compensation) {
        compensations += 1;
      } else {
        writes += 1;
      }
      try {
        const written = await args.adapter.write({ key, data: desired.data, expectedPreviousUpdatedAt });
        observed = { ...observed, [key]: written };
      } catch {
        rereads += 1;
        observed = await args.adapter.readAll();
        const afterHashes = hashes(observed);
        if (HAMMER_RECOVERY_WRITE_ORDER.every((artifact) => beforeHashes[artifact] === afterHashes[artifact])) {
          return { status: "conflict", writes, compensations, rereads, key };
        }
        ambiguousKey = key;
        break;
      }
    }
    if (ambiguousKey) continue;
    rereads += 1;
    observed = await args.adapter.readAll();
    if (compensation && HAMMER_RECOVERY_WRITE_ORDER.every((key) => observed[key].hash === args.original[key].hash)) {
      return { status: "compensated", writes, compensations, rereads };
    }
  }
  return { status: "conflict", writes, compensations, rereads, key: HAMMER_RECOVERY_WRITE_ORDER[0] };
}
