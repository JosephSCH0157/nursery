import type { HammerPersistenceSnapshot } from "../persistence/hammerPersistenceContract";

export function shouldEnsureVisualPlacementsOnTranscriptReuse(
  snapshot: HammerPersistenceSnapshot | null,
): boolean {
  return snapshot?.visual_timeline.data == null;
}

export async function reconcileTranscriptReuseVisualPlacements(args: {
  snapshot: HammerPersistenceSnapshot | null;
  ensure: () => Promise<HammerPersistenceSnapshot>;
}): Promise<HammerPersistenceSnapshot> {
  if (!shouldEnsureVisualPlacementsOnTranscriptReuse(args.snapshot)) return args.snapshot!;
  return args.ensure();
}
