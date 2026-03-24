export interface HammerPodcastMasterLayerStatusInput {
  declared: boolean;
  posture?: "authoritative" | "degraded" | "unavailable";
  capability?: "executable" | "degraded" | "unavailable";
  preview_mode?: "previewable" | "export_only";
  applied_stages?: Array<"normalize" | "compress" | "limit" | "noise_cleanup_light">;
  skipped_stages?: Array<"normalize" | "compress" | "limit" | "noise_cleanup_light">;
}

export interface HammerPodcastMasterUiStatus {
  headline: string;
  detail: string;
  action_label: string;
}

function formatStageName(stage: "normalize" | "compress" | "limit" | "noise_cleanup_light"): string {
  switch (stage) {
    case "normalize":
      return "normalize";
    case "compress":
      return "compress";
    case "limit":
      return "limit";
    case "noise_cleanup_light":
      return "light noise cleanup";
  }
}

export function resolvePodcastMasterUiStatus(
  input: HammerPodcastMasterLayerStatusInput,
): HammerPodcastMasterUiStatus {
  if (!input.declared) {
    return {
      headline: "Podcast Master not declared.",
      detail: "Declare a canonical Podcast Master pass to include normalize, compress, limit, and optional light noise cleanup at export.",
      action_label: "Declare Podcast Master For Export",
    };
  }

  const applied = (input.applied_stages ?? []).map((stage) => formatStageName(stage));
  const skipped = (input.skipped_stages ?? []).map((stage) => formatStageName(stage));
  const previewModeDetail = input.preview_mode === "previewable"
    ? "Preview and export can evaluate this pass."
    : "Export-only in this runtime; preview will not audition the mastered result.";

  if (input.posture === "unavailable") {
    return {
      headline: "Podcast Master declared, but unavailable in this runtime.",
      detail: `${previewModeDetail} A supported export runtime is required before this pass can execute.`,
      action_label: "Podcast Master Declared (Runtime Unsupported)",
    };
  }

  if (input.posture === "degraded" || input.capability === "degraded") {
    const appliedSummary = applied.length > 0 ? `Applied: ${applied.join(", ")}.` : "Applied: none.";
    const skippedSummary = skipped.length > 0 ? `Skipped: ${skipped.join(", ")}.` : "Skipped: none.";
    return {
      headline: "Podcast Master declared with degraded support.",
      detail: `${appliedSummary} ${skippedSummary} ${previewModeDetail}`,
      action_label: "Podcast Master Declared (Degraded)",
    };
  }

  return {
    headline: "Podcast Master declared and supported.",
    detail: `${previewModeDetail} Applied stages: ${applied.join(", ") || "normalize, compress, limit"}.`,
    action_label: "Podcast Master Declared",
  };
}
