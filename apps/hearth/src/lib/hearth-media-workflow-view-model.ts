export const HEARTH_MEDIA_STAGE_IDS = ["visual_plan", "thumbnails", "images", "reference_clips", "broll", "review"] as const;
export type HearthMediaStageId = (typeof HEARTH_MEDIA_STAGE_IDS)[number];
export type HearthMediaStageStatus = "unavailable" | "blocked" | "ready" | "in_progress" | "complete" | "needs_attention";

export type HearthMediaWorkflowInput = {
  hasApprovedScript: boolean;
  visualPlan: { status: string | null; total: number; images: number; broll: number; referenceClips?: number; version: number };
  thumbnails: { eligible: number; total: number; previewAssetPaths?: string[] };
  images: { planned: number; completed: number; canonicalCount: number; projectionLoaded: boolean };
  referenceClips?: { planned: number; completed: number };
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
  const thumbnailsComplete = input.thumbnails.eligible >= 3
    && (input.thumbnails.previewAssetPaths?.length ?? 0) >= 3;
  const imagePlanExpected = Math.max(0, input.images.planned);
  const imageCanonicalCount = Math.max(0, input.images.canonicalCount);
  const imageProjectionLoaded = input.images.projectionLoaded;
  const imageSyncMismatch = imagePlanExpected > 0 && imageCanonicalCount !== imagePlanExpected;
  const imagesComplete = visualComplete
    && imageProjectionLoaded
    && imagePlanExpected > 0
    && !imageSyncMismatch
    && input.images.completed === imagePlanExpected;
  const referenceClipsPlanned = input.referenceClips?.planned ?? input.visualPlan.referenceClips ?? 0;
  const referenceClipsCompleted = input.referenceClips?.completed ?? 0;
  const referenceClipsComplete = imagesComplete && referenceClipsCompleted === referenceClipsPlanned;
  const brollComplete = imagesComplete && input.broll.completed === input.broll.planned;
  const imagesUnavailable = !imageProjectionLoaded || imageSyncMismatch;
  const imageSummary = imagesUnavailable
    ? imagePlanExpected > 0
      ? `Synchronization unavailable: Visual Plan expects ${imagePlanExpected} images and canonical image map has ${imageCanonicalCount}.`
      : "Episode Images is temporarily unavailable."
    : `${input.images.completed} of ${imagePlanExpected} images ready`;
  const stages: HearthMediaWorkflowStage[] = [
    { id: "visual_plan", label: "Visual Plan", status: !input.hasApprovedScript ? "blocked" : visualNeedsAttention ? "needs_attention" : visualComplete ? "complete" : "ready", summary: visualExists ? `${input.visualPlan.total} planned visuals · ${input.visualPlan.images} images · ${input.visualPlan.broll} B-roll moments · ${input.visualPlan.referenceClips ?? 0} Reference Clips` : "Create the episode’s visual direction", reviewAvailable: visualExists },
    { id: "thumbnails", label: "Thumbnails", status: !visualComplete ? "blocked" : thumbnailsComplete ? "complete" : input.thumbnails.total > 0 ? "in_progress" : "ready", summary: thumbnailsComplete ? "Three thumbnail candidates are ready" : `${input.thumbnails.eligible} of 3 thumbnails ready`, reviewAvailable: input.thumbnails.total > 0 },
    { id: "images", label: "Images", status: !visualComplete || !thumbnailsComplete ? "blocked" : imagesComplete ? "complete" : imagesUnavailable ? "needs_attention" : input.images.completed > 0 ? "in_progress" : "ready", summary: imageSummary, reviewAvailable: imagePlanExpected > 0 },
    { id: "reference_clips", label: "Reference Clips", status: !imagesComplete ? "blocked" : referenceClipsComplete ? "complete" : referenceClipsCompleted > 0 ? "in_progress" : "ready", summary: `${referenceClipsCompleted} of ${referenceClipsPlanned} resolved`, reviewAvailable: referenceClipsPlanned > 0 },
    { id: "broll", label: "B-roll", status: !imagesComplete ? "blocked" : brollComplete ? "complete" : input.broll.completed > 0 ? "in_progress" : "ready", summary: `${input.broll.completed} of ${input.broll.planned} B-roll moments ready`, reviewAvailable: input.broll.planned > 0 },
    { id: "review", label: "Review", status: referenceClipsComplete && brollComplete ? "ready" : "blocked", summary: referenceClipsComplete && brollComplete ? "Episode visuals are ready to review" : "Complete the media stages first", reviewAvailable: referenceClipsComplete && brollComplete },
  ];
  const activeStage = stages.find((stage) => !isComplete(stage) && stage.status !== "blocked")?.id ?? "review";
  return { stages, activeStage, overallStatus: activeStage === "review" ? "ready_for_review" as const : "in_progress" as const };
}
