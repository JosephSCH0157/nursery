export const HEARTH_MEDIA_STAGE_IDS = ["visual_plan", "thumbnails", "images", "broll", "review"] as const;
export type HearthMediaStageId = (typeof HEARTH_MEDIA_STAGE_IDS)[number];
export type HearthMediaStageStatus = "unavailable" | "blocked" | "ready" | "in_progress" | "complete" | "needs_attention";

export type HearthMediaWorkflowInput = {
  hasApprovedScript: boolean;
  visualPlan: { status: string | null; total: number; images: number; broll: number; version: number };
  thumbnails: { eligible: number; total: number };
  images: { planned: number; completed: number };
  broll: { planned: number; completed: number };
  upstreamChanged?: boolean;
};

export type HearthMediaWorkflowStage = {
  id: HearthMediaStageId;
  label: string;
  status: HearthMediaStageStatus;
  summary: string;
  reviewAvailable: boolean;
};

const isComplete = (stage: HearthMediaWorkflowStage) => stage.status === "complete";

export function deriveHearthMediaWorkflow(input: HearthMediaWorkflowInput) {
  const visualExists = input.visualPlan.total > 0;
  const visualNeedsAttention = input.visualPlan.status === "needs_attention" || Boolean(input.upstreamChanged);
  const visualComplete = visualExists
    && !visualNeedsAttention
    && (input.visualPlan.status === "activated"
      || input.visualPlan.status === "fulfilling"
      || input.visualPlan.status === "fulfilled");
  const thumbnailsComplete = input.thumbnails.eligible >= 3;
  const imagesComplete = visualComplete && input.images.completed === input.images.planned;
  const brollComplete = imagesComplete && input.broll.completed === input.broll.planned;
  const stages: HearthMediaWorkflowStage[] = [
    { id: "visual_plan", label: "Visual Plan", status: !input.hasApprovedScript ? "blocked" : visualNeedsAttention ? "needs_attention" : visualComplete ? "complete" : "ready", summary: visualExists ? `${input.visualPlan.total} planned visuals · ${input.visualPlan.images} images · ${input.visualPlan.broll} B-roll moments` : "Create the episode’s visual direction", reviewAvailable: visualExists },
    { id: "thumbnails", label: "Thumbnails", status: !visualComplete ? "blocked" : thumbnailsComplete ? "complete" : input.thumbnails.total > 0 ? "in_progress" : "ready", summary: thumbnailsComplete ? "Three candidates ready for testing" : `${input.thumbnails.eligible} of 3 eligible candidates ready`, reviewAvailable: input.thumbnails.total > 0 },
    { id: "images", label: "Images", status: !visualComplete || !thumbnailsComplete ? "blocked" : imagesComplete ? "complete" : input.images.completed > 0 ? "in_progress" : "ready", summary: `${input.images.completed} of ${input.images.planned} images ready`, reviewAvailable: input.images.planned > 0 },
    { id: "broll", label: "B-roll", status: !imagesComplete ? "blocked" : brollComplete ? "complete" : input.broll.completed > 0 ? "in_progress" : "ready", summary: `${input.broll.completed} of ${input.broll.planned} B-roll moments ready`, reviewAvailable: input.broll.planned > 0 },
    { id: "review", label: "Review", status: brollComplete ? "ready" : "blocked", summary: brollComplete ? "Episode visuals are ready to review" : "Complete the media stages first", reviewAvailable: brollComplete },
  ];
  const activeStage = stages.find((stage) => !isComplete(stage) && stage.status !== "blocked")?.id ?? "review";
  return { stages, activeStage, overallStatus: activeStage === "review" ? "ready_for_review" as const : "in_progress" as const };
}
