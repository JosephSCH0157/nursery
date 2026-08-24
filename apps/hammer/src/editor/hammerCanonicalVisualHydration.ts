import type { HammerPersistedVisualPlacements } from "../persistence/hammerPersistenceContract";
import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import { deriveLegacyVisualPlacementsFromTimeline } from "../visuals/persistence/hammerVisualTimelineLegacyAdapter";

export type HammerCanonicalVisualHydrationProjection = Readonly<{
  visualTimeline: HammerVisualTimelineState | null;
  visualPlacements: HammerPersistedVisualPlacements | null;
  placementAuthority: "canonical_timeline" | "compatibility_artifact" | "absent";
}>;

/**
 * A revision-scoped visual timeline is the durable editing authority. The
 * placements document is retained as a compatibility artifact, but must not
 * project a different editorial state into the shell or history verifier.
 */
export function projectHammerCanonicalVisualHydration(args: {
  canonicalTimeline: HammerVisualTimelineState | null;
  compatibilityPlacements: HammerPersistedVisualPlacements | null;
}): HammerCanonicalVisualHydrationProjection {
  if (args.canonicalTimeline) {
    return {
      visualTimeline: args.canonicalTimeline,
      visualPlacements: deriveLegacyVisualPlacementsFromTimeline(args.canonicalTimeline),
      placementAuthority: "canonical_timeline",
    };
  }
  if (args.compatibilityPlacements) {
    return {
      visualTimeline: null,
      visualPlacements: args.compatibilityPlacements,
      placementAuthority: "compatibility_artifact",
    };
  }
  return { visualTimeline: null, visualPlacements: null, placementAuthority: "absent" };
}
