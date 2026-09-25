import type { ReferenceVisualOpportunity } from "./hearth-reference-visual-authority";
import {
  projectReferenceVisualCustomerWorkflow,
  type ReferenceVisualCustomerWorkflow,
} from "./hearth-reference-visual-customer-workflow";

export type ReferenceMaterialVisualAction =
  "continue" | "approve" | "ready" | "skipped";

export type ReferenceMaterialActionTarget =
  "reference_visual_workflow" | "approval" | "none";

export type ReferenceMaterialVisualProjection = {
  action: ReferenceMaterialVisualAction;
  label: string;
  target: ReferenceMaterialActionTarget;
  disabled: boolean;
  workflow: ReferenceVisualCustomerWorkflow;
};

export type ReferenceReviewFailureIntent =
  "approve" | "skip" | "use_source" | "save_edits" | "replace";

export function isReferenceVisualFailureActionable(
  intent: ReferenceReviewFailureIntent,
  projection: ReferenceMaterialVisualProjection,
): boolean {
  if (projection.action === "ready" || projection.action === "skipped")
    return false;
  if (intent === "approve")
    return (
      projection.action === "approve" ||
      (projection.action === "continue" && projection.label === "Review visual")
    );
  return intent === "skip";
}

export type ReferenceVisualWorkflowFocus = {
  workspaceId: string;
  workpieceId: string;
  opportunityId: string;
  opportunityRevisionId: string;
  sourceSetRevisionId: string | null;
  rightsRevisionId: string | null;
  returnCardKey: string;
};

export function projectReferenceMaterialVisualAction(args: {
  opportunity: ReferenceVisualOpportunity;
  resolution: "approved" | "skipped" | null;
  hammerVerified?: boolean;
  approvalBlocked?: boolean;
}): ReferenceMaterialVisualProjection {
  const workflow = projectReferenceVisualCustomerWorkflow({
    opportunity: args.opportunity,
  });
  if (args.resolution === "skipped")
    return {
      action: "skipped",
      label: "Skipped",
      target: "none",
      disabled: true,
      workflow,
    };
  if (args.resolution === "approved" && args.hammerVerified)
    return {
      action: "ready",
      label: "Ready",
      target: "none",
      disabled: true,
      workflow,
    };
  const candidateReady = args.opportunity.candidates.some(
    (candidate) => candidate.currentForPlan !== false && candidate.releaseReady,
  );
  const historicalCandidateExists = args.opportunity.candidates.some(
    (candidate) => candidate.currentForPlan === false,
  );
  if (args.resolution === null && candidateReady && !args.approvalBlocked)
    return {
      action: "approve",
      label: "Approve",
      target: "approval",
      disabled: false,
      workflow,
    };
  return {
    action: "continue",
    label:
      args.resolution === "approved" && !args.hammerVerified
        ? "Review visual"
        : workflow.nextAction === "Generate visual" && historicalCandidateExists
          ? "Re-certify visual"
        : workflow.nextAction,
    target: "reference_visual_workflow",
    disabled: false,
    workflow,
  };
}

export function buildReferenceVisualWorkflowFocus(args: {
  workspaceId: string;
  workpieceId: string;
  opportunity: ReferenceVisualOpportunity;
  returnCardKey: string;
}): ReferenceVisualWorkflowFocus {
  return {
    workspaceId: args.workspaceId,
    workpieceId: args.workpieceId,
    opportunityId: args.opportunity.id,
    opportunityRevisionId: args.opportunity.revisionId,
    sourceSetRevisionId: args.opportunity.sourceSetRevisionId ?? null,
    rightsRevisionId:
      typeof args.opportunity.rights?.id === "string"
        ? args.opportunity.rights.id
        : null,
    returnCardKey: args.returnCardKey,
  };
}
