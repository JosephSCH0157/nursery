export type HearthVisualPlanOperationStage =
  | "idle"
  | "generating"
  | "validating"
  | "refreshing"
  | "complete"
  | "failed";

export type HearthVisualPlanOperationStatus = {
  stage: HearthVisualPlanOperationStage;
  message: string;
};

const STATUS_BY_STAGE: Record<HearthVisualPlanOperationStage, string> = {
  idle: "Visual plan generation is idle.",
  generating: "Generating the canonical visual plan. Tongs saves this generation atomically.",
  validating: "Validating the saved canonical visual plan.",
  refreshing: "Refreshing the visual workflow from canonical projections.",
  complete: "Visual plan generation is complete.",
  failed: "Visual plan generation failed. Please try again.",
};

export function describeHearthVisualPlanOperation(
  stage: HearthVisualPlanOperationStage,
): HearthVisualPlanOperationStatus {
  return { stage, message: STATUS_BY_STAGE[stage] };
}
