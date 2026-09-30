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

export type HearthVisualPlanFailure = {
  status: number | null;
  code: string;
  stage: string | null;
  message: string;
};

function safeText(value: unknown, fallback: string, maximum: number): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  return (normalized || fallback).slice(0, maximum);
}

export function sanitizeHearthVisualPlanFailure(value: {
  status?: unknown;
  code?: unknown;
  stage?: unknown;
  message?: unknown;
}): HearthVisualPlanFailure {
  const status = Number(value.status);
  return {
    status: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
    code: safeText(value.code, "unified_visual_plan_failed", 120).replace(/[^a-zA-Z0-9._:-]/g, "_"),
    stage: typeof value.stage === "string" && value.stage.trim()
      ? value.stage.trim().slice(0, 80).replace(/[^a-zA-Z0-9._:-]/g, "_")
      : null,
    message: safeText(value.message, "Visual Plan generation failed.", 500),
  };
}

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
