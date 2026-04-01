import type {
  EpisodeContextualDataCompositePlan,
  EpisodeBrollPlacementHint,
  EpisodeImageMapEntry,
} from "./episode-package-v2";
import { buildBulletBeatAnchorLabel } from "./episode-package-v2";
import { createReferenceClipPlan } from "./hearth-reference-clip-plan";

export function resolveReferenceClipPlanForMediaMapBootstrap(args: {
  workpieceId: string;
  currentEntries: EpisodeContextualDataCompositePlan[];
  imageMapEntries: EpisodeImageMapEntry[];
}): {
  seededFromImageMap: boolean;
  entries: EpisodeContextualDataCompositePlan[];
} {
  if (args.currentEntries.length > 0) {
    return {
      seededFromImageMap: false,
      entries: args.currentEntries,
    };
  }

  const explanatoryEntries = args.imageMapEntries.filter((entry) => entry.purpose === "explanation");
  if (explanatoryEntries.length === 0) {
    return {
      seededFromImageMap: false,
      entries: [],
    };
  }

  const entries = explanatoryEntries.map((entry) => {
    const anchorText = entry.anchor?.trim()
      || (entry.beat_anchor ? buildBulletBeatAnchorLabel(entry.beat_anchor) : "")
      || entry.description?.trim()
      || entry.prompt_basis?.trim()
      || "Reference clip beat";
    const description = entry.description?.trim()
      || entry.visual_intent?.trim()
      || entry.prompt_basis?.trim()
      || anchorText;
    const seeded = createReferenceClipPlan({
      workpieceId: args.workpieceId,
      anchorText,
      description,
      format: "still",
    });

    const placementHint: EpisodeBrollPlacementHint = entry.placement_hint === "exact_timestamp"
      ? "exact_timestamp"
      : "first_occurrence";

    return {
      ...seeded,
      placement_hint: placementHint,
      purpose: "explanation" as const,
      visual_style: entry.style_preset ?? seeded.visual_style ?? null,
      background_context_description: entry.section_intent_note?.trim() || "",
      foreground_data_description: entry.prompt_basis?.trim() || "",
    };
  });

  return {
    seededFromImageMap: true,
    entries,
  };
}
