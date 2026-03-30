export type ThumbnailWorkspacePrimaryAction = "generate_titles" | "draft_brief" | "upload_image";

export type ThumbnailWorkspaceGuidance = {
  stateCue: string;
  cardTitle: string;
  cardLead: string;
  steps: string[];
  note: string;
  primaryAction: ThumbnailWorkspacePrimaryAction;
  primaryActionLabel: string;
};

export function formatThumbnailPanelMeta(conceptCount: number, versionCount: number): string {
  const conceptLabel = conceptCount === 1 ? "brief" : "briefs";
  const versionLabel = versionCount === 1 ? "image version" : "image versions";
  return `${conceptCount} ${conceptLabel} · ${versionCount} ${versionLabel}`;
}

export function resolveThumbnailVersionSourceLabel(provider: string | null | undefined): string {
  const normalized = provider?.trim().toLowerCase();
  if (!normalized || normalized === "upload") return "Outside tool";
  if (normalized === "openai") return "Forge AI";
  return normalized
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function resolveThumbnailPreviewStatus(args: {
  selectedVersionId: string | null;
  selectedVersionProvider?: string | null;
}): string {
  if (args.selectedVersionId) {
    const sourceLabel = resolveThumbnailVersionSourceLabel(args.selectedVersionProvider);
    return `This is version ${args.selectedVersionId.slice(0, 8)} from ${sourceLabel}. Use the versions below if you want to compare another render.`;
  }
  return "No image in yet. Once you have a render, bring it back here and we'll line it up.";
}

export function resolveThumbnailWorkspaceGuidance(args: {
  conceptCount: number;
  versionCount: number;
  titleCount: number;
}): ThumbnailWorkspaceGuidance {
  const hasFraming = args.titleCount > 0;
  const stateCue = "You're shaping the thumbnail concept. The final image gets rendered outside Forge.";
  const hasBrief = args.conceptCount > 0;
  const hasImage = args.versionCount > 0;

  if (!hasFraming) {
    return {
      stateCue: "Framing comes first. Once the episode has a title, thumbnail ideas get sharper.",
      cardTitle: "Start with Framing",
      cardLead: "Start with a title. Framing helps shape thumbnail ideas.",
      steps: [
        "Generate titles in Framing.",
        "Choose the line that carries the best hook.",
        "Come back here to draft the thumbnail brief.",
      ],
      note: "This lane works best once the episode angle is named clearly.",
      primaryAction: "generate_titles",
      primaryActionLabel: "Generate Titles",
    };
  }

  if (!hasBrief) {
    return {
      stateCue,
      cardTitle: "Next step",
      cardLead: "Start with the concept brief. Once the angle is there, take it to your image tool and bring the finished frame back here.",
      steps: [
        "Draft the concept brief.",
        "Render the image in your tool.",
        "Upload the final image here.",
      ],
      note: "This is your planning space. Once the image comes back in, we'll line everything up.",
      primaryAction: "draft_brief",
      primaryActionLabel: "Draft Concept Brief",
    };
  }

  if (!hasImage) {
    return {
      stateCue,
      cardTitle: "Next step",
      cardLead: "You've got the concept. Now turn it into the final thumbnail.",
      steps: [
        "Copy this brief into your image tool.",
        "Render the image.",
        "Bring it back here and upload it.",
      ],
      note: "This is your planning space. Once the image comes back in, we'll line everything up.",
      primaryAction: "upload_image",
      primaryActionLabel: "Upload Final Image",
    };
  }

  return {
    stateCue,
    cardTitle: "Next step",
    cardLead: "The image is back in. Now line up the text, safe zone, and final pairing.",
    steps: [
      "Check that the overlay line still reads cleanly.",
      "Use the preview and safe zone to make sure the frame holds up.",
      "Save the title and image as a launch pairing when it feels right.",
    ],
    note: "If you make another render, just upload it here and compare versions.",
    primaryAction: "upload_image",
    primaryActionLabel: "Upload Final Image",
  };
}
