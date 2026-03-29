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
}): HearthImageMapWorkflowGuidance {
  const stateCue = args.manualOnly
    ? "You're shaping the visual beat: where it belongs, what viewers should see, and which asset should land there."
    : "You're shaping the timeline image beat: pick the moment, describe the image, then attach the asset that should land there.";

  if (args.entryCount === 0) {
    if (args.manualOnly) {
      return {
        stateCue,
        cardTitle: "Next step",
        cardLead: "Start by adding the first visual beat, then describe what viewers should see.",
        steps: [
          "Create a new beat.",
          "Write what viewers should see.",
          "Attach the asset you want to use.",
        ],
        note: "Once a beat exists, this panel will guide the rest of the handoff.",
        primaryAction: "new_entry",
        primaryActionLabel: "New Beat",
      };
    }

    return {
      stateCue,
      cardTitle: "Next step",
      cardLead: "Start by pulling image beats from the script. That gives you the moments to work from.",
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
      cardLead: "Pick an image beat on the left so we can shape it here.",
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
      cardLead: "You've got the beat. Now bring in the image you want to use.",
      steps: [
        "Tighten the visual description if needed.",
        "Find stock or upload the final asset.",
        "Once the asset is here, attach it to this beat.",
      ],
      note: "If you already know the exact image, uploading it is the quickest route.",
      primaryAction: "find_stock",
      primaryActionLabel: "Find Stock",
    };
  }

  if (!args.hasSelectedCandidate) {
    return {
      stateCue,
      cardTitle: "Next step",
      cardLead: "You have options now. Preview a candidate, then choose the one that should land on this beat.",
      steps: [
        "Preview the candidate that feels closest.",
        "Use the preview button to attach it to this beat.",
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
    cardLead: "The beat is attached. From here, you're mostly checking that the timing and anchor still feel right.",
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
