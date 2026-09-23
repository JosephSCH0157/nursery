export const HEARTH_MEDIA_STAGE_IDS = ["visual_plan", "thumbnails", "images", "reference_clips", "broll", "review"] as const;
export type HearthMediaStageId = (typeof HEARTH_MEDIA_STAGE_IDS)[number];
export type HearthMediaStageStatus = "unavailable" | "blocked" | "ready" | "in_progress" | "complete" | "needs_attention";

export type HearthMediaWorkflowInput = {
  hasApprovedScript: boolean;
  visualPlan: { status: string | null; operationState?: string | null; total: number; images: number; broll: number; referenceClips?: number; referenceVisuals?: number; version: number };
  thumbnails: { eligible: number; total: number; pending?: number; previewAssetPaths?: string[]; authorityState?: "available"|"loading"|"error" };
  images: { planned: number; completed: number; canonicalCount: number; projectionLoaded: boolean };
  referenceClips?: { planned: number; completed: number; unsourced?: number; exists?: boolean; authorityState?: "available"|"loading"|"error" };
  referenceVisuals?: { planned: number; completed: number; unsourced?: number; exists?: boolean; authorityState?: "available"|"loading"|"error" };
  broll: { planned: number; completed: number };
  upstreamChanged?: boolean;
};

export type HearthMediaWorkflowStage = {
  id: HearthMediaStageId;
  label: string;
  status: HearthMediaStageStatus;
  statusLabel?: string;
  summary: string;
  reviewAvailable: boolean;
};

const isComplete = (stage: HearthMediaWorkflowStage) => stage.status === "complete";

export function deriveHearthMediaWorkflow(input: HearthMediaWorkflowInput) {
  const visualExists = input.visualPlan.total > 0;
  const operationState = input.visualPlan.operationState ?? null;
  const visualReadbackPending = operationState === "readback_pending";
  const visualSubmissionUnknown = operationState === "submission_unknown";
  const visualOperationFailed = operationState === "failed";
  const visualOperationInProgress = operationState !== null
    && operationState !== "verified"
    && !visualSubmissionUnknown
    && !visualOperationFailed;
  const visualOperationBlocksDownstream = visualSubmissionUnknown
    || visualOperationFailed
    || visualOperationInProgress;
  const visualNeedsAttention = input.visualPlan.status === "needs_attention"
    || Boolean(input.upstreamChanged)
    || visualSubmissionUnknown
    || visualOperationFailed;
  const visualComplete = visualExists
    && !visualNeedsAttention
    && !visualOperationInProgress
    && (input.visualPlan.status === "activated"
      || input.visualPlan.status === "fulfilling"
      || input.visualPlan.status === "fulfilled");
  const thumbnailAuthorityReady=(input.thumbnails.authorityState??"available")==="available";
  const thumbnailsComplete = thumbnailAuthorityReady&&input.thumbnails.eligible >= 3
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
  const referenceVisualsPlanned = input.referenceVisuals?.planned ?? input.visualPlan.referenceVisuals ?? 0;
  const referenceVisualsCompleted = input.referenceVisuals?.completed ?? 0;
  const unsourcedReferenceSuggestions = (input.referenceClips?.unsourced ?? 0) + (input.referenceVisuals?.unsourced ?? 0);
  const referenceAuthorityReady = (input.referenceClips?.authorityState ?? "available") === "available"
    && (input.referenceVisuals?.authorityState ?? "available") === "available";
  const referenceMaterialExists = Boolean(input.referenceClips?.exists || input.referenceVisuals?.exists);
  const requiredReferencePlansExist = (referenceClipsPlanned === 0 || input.referenceClips?.exists === true)
    && (referenceVisualsPlanned === 0 || input.referenceVisuals?.exists === true);
  const referenceMaterialAccessible = visualComplete && referenceAuthorityReady && requiredReferencePlansExist;
  const referenceClipsComplete = referenceMaterialAccessible && referenceClipsCompleted === referenceClipsPlanned && referenceVisualsCompleted === referenceVisualsPlanned;
  const brollComplete = imagesComplete && input.broll.completed === input.broll.planned;
  const imagesUnavailable = !imageProjectionLoaded || imageSyncMismatch;
  const imageSummary = imagesUnavailable
    ? imagePlanExpected > 0
      ? `Synchronization unavailable: Visual Plan expects ${imagePlanExpected} images and canonical image map has ${imageCanonicalCount}.`
      : "Episode Images is temporarily unavailable."
    : `${input.images.completed} of ${imagePlanExpected} images ready`;
  const stages: HearthMediaWorkflowStage[] = [
    {
      id: "visual_plan",
      label: "Visual Plan",
      status: !input.hasApprovedScript ? "blocked" : visualNeedsAttention ? "needs_attention" : visualOperationInProgress ? "in_progress" : visualComplete ? "complete" : "ready",
      statusLabel: visualSubmissionUnknown ? "Outcome unknown" : visualReadbackPending ? "Checking status" : undefined,
      summary: visualSubmissionUnknown
        ? "Visual Plan submission outcome is unknown. Forge will not submit this request again."
        : visualOperationFailed
          ? "Visual Plan generation failed. Review the operation details before trying again."
          : visualOperationInProgress
            ? visualReadbackPending ? "Checking canonical Visual Plan status." : "Visual Plan generation is in progress."
            : visualExists
              ? `${input.visualPlan.total} planned visuals · ${input.visualPlan.images} images · ${input.visualPlan.referenceClips ?? 0} Source Clips · ${input.visualPlan.referenceVisuals ?? 0} Reference Visuals · ${input.visualPlan.broll} B-roll moments`
              : "Create the episode’s visual direction",
      reviewAvailable: visualExists,
    },
    { id: "thumbnails", label: "Thumbnails", status: !input.hasApprovedScript || visualOperationBlocksDownstream ? "blocked" : !thumbnailAuthorityReady ? "needs_attention" : thumbnailsComplete ? "complete" : input.thumbnails.total > 0 || (input.thumbnails.pending ?? 0) > 0 ? "in_progress" : "ready", summary: !thumbnailAuthorityReady ? input.thumbnails.authorityState==="loading"?"Refreshing canonical thumbnail status…":"Canonical thumbnail status could not be refreshed" : thumbnailsComplete ? "Three thumbnail candidates are ready" : (input.thumbnails.pending ?? 0) > 0 ? `${input.thumbnails.pending} generated · awaiting thumbnail-set finalization` : `${input.thumbnails.eligible} of 3 thumbnails ready`, reviewAvailable: input.hasApprovedScript && !visualOperationBlocksDownstream },
    { id: "images", label: "Images", status: !visualComplete || !thumbnailsComplete ? "blocked" : imagesComplete ? "complete" : imagesUnavailable ? "needs_attention" : input.images.completed > 0 ? "in_progress" : "ready", summary: imageSummary, reviewAvailable: imagePlanExpected > 0 },
    { id: "reference_clips", label: "Reference Material", status: !referenceMaterialAccessible ? "blocked" : referenceClipsComplete ? "complete" : referenceClipsCompleted + referenceVisualsCompleted > 0 ? "in_progress" : "ready", summary: `${referenceClipsCompleted} of ${referenceClipsPlanned} sourced Clips · ${referenceVisualsCompleted} of ${referenceVisualsPlanned} sourced Visuals${unsourcedReferenceSuggestions ? ` · ${unsourcedReferenceSuggestions} unsourced suggestions (optional)` : ""}`, reviewAvailable: referenceAuthorityReady && (referenceMaterialExists || referenceClipsPlanned === 0 && referenceVisualsPlanned === 0) },
    { id: "broll", label: "B-roll", status: !imagesComplete ? "blocked" : brollComplete ? "complete" : input.broll.completed > 0 ? "in_progress" : "ready", summary: `${input.broll.completed} of ${input.broll.planned} B-roll moments ready`, reviewAvailable: input.broll.planned > 0 },
    { id: "review", label: "Review", status: imagesComplete && referenceClipsComplete && brollComplete ? "ready" : "blocked", summary: imagesComplete && referenceClipsComplete && brollComplete ? "Episode visuals are ready to review" : "Complete the media stages first", reviewAvailable: imagesComplete && referenceClipsComplete && brollComplete },
  ];
  const activeStage = stages.find((stage) => !isComplete(stage) && stage.status !== "blocked")?.id ?? "review";
  return { stages, activeStage, overallStatus: stages[5]?.status === "ready" ? "ready_for_review" as const : "in_progress" as const };
}
