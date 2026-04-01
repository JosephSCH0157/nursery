export type HearthImageMapPrimaryAction =
  | "seed_from_script"
  | "new_entry"
  | "find_stock"
  | "upload_asset"
  | "select_candidate"
  | "none";

export type HearthImageMapWorkflowGuidance = {
  stateCue: string;
  cardTitle: string;
  cardLead: string;
  steps: string[];
  note: string;
  primaryAction: HearthImageMapPrimaryAction;
  primaryActionLabel: string | null;
};

export function resolveImageMapWorkflowGuidance(args: {
  manualOnly?: boolean;
  entryCount: number;
  hasSelection: boolean;
  candidateCount: number;
  hasSelectedCandidate: boolean;
  sourceType?: string | null;
}): HearthImageMapWorkflowGuidance {
  const normalizedSourceType = args.sourceType?.trim().toLowerCase() ?? "";
  const prefersOwnedAsset = normalizedSourceType === "upload" || normalizedSourceType === "external" || normalizedSourceType === "hammer_upload";
  const stateCue = "You're lining up visuals to match the script. Once these are set, Hammer handles placement.";

  if (args.entryCount === 0) {
    if (args.manualOnly) {
      return {
        stateCue,
        cardTitle: "Next step",
        cardLead: "Start by adding the first beat. Then give it a clear visual read.",
        steps: [
          "Create a new beat.",
          "Write what viewers should see.",
          "Bring in the asset you want to use.",
        ],
        note: "Once the first beat is in, the rest of the panel gets a lot easier to work with.",
        primaryAction: "new_entry",
        primaryActionLabel: "New Beat",
      };
    }

    return {
      stateCue,
      cardTitle: "Next step",
      cardLead: "Start by pulling beats from the script. That gives us the moments to work from.",
      steps: [
        "Pull beats from the script.",
        "Pick the one you want to shape.",
        "Describe the image and attach the asset.",
      ],
      note: "If the script pass misses a moment, you can still add a beat by hand.",
      primaryAction: "seed_from_script",
      primaryActionLabel: "Pull Beats from Script",
    };
  }

  if (!args.hasSelection) {
    return {
      stateCue,
      cardTitle: "Next step",
      cardLead: "Pick a beat on the left and we'll shape it here.",
      steps: [
        "Choose the beat that matches the moment you want to work on.",
        "Tighten what viewers should see.",
        "Then attach the asset for that beat.",
      ],
      note: "If you do not see the moment you want, add a new beat or pull a fresh pass from the script.",
      primaryAction: "none",
      primaryActionLabel: null,
    };
  }

  if (args.candidateCount === 0) {
    return {
      stateCue,
      cardTitle: "Next step",
      cardLead: "You've got the beat. Next move is bringing in the image.",
      steps: [
        "Tighten the visual description if needed.",
        prefersOwnedAsset ? "Bring in your own image." : "Find stock or bring in your own image.",
        "Once the asset is here, attach it to this beat.",
      ],
      note: prefersOwnedAsset
        ? "If you already have the image, that's the fastest path."
        : "If you already have the image, you can always bring that in instead.",
      primaryAction: prefersOwnedAsset ? "upload_asset" : "find_stock",
      primaryActionLabel: prefersOwnedAsset ? "Use Your Own Image" : "Find Stock",
    };
  }

  if (!args.hasSelectedCandidate) {
    return {
      stateCue,
      cardTitle: "Next step",
      cardLead: "You've got options now. Pick the one that feels right for this beat.",
      steps: [
        "Preview the candidate that feels closest.",
        "Use the one that lands best on this beat.",
        "Then check the timing and anchor if anything feels off.",
      ],
      note: "You can keep comparing candidates before you lock one in.",
      primaryAction: "select_candidate",
      primaryActionLabel: "Use This Image",
    };
  }

  return {
    stateCue,
    cardTitle: "Next step",
    cardLead: "This one's set. Now you're just checking that the timing and anchor still feel right.",
    steps: [
      "Review the selected image in context.",
      "If the script changed, re-anchor it in Timeline Link.",
      "Swap the asset only if a better option comes in.",
    ],
    note: "Hammer will use this beat and anchor later for deterministic placement.",
    primaryAction: "none",
    primaryActionLabel: null,
  };
}
