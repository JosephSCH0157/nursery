import type {
  ReferenceVisualOpportunity,
  ReferenceVisualSubtype,
} from "./hearth-reference-visual-authority";

export type ReferenceMaterialVisualAction =
  | "add_source"
  | "review_rights"
  | "acquire_image"
  | "design_visual"
  | "approve"
  | "ready"
  | "skipped";

export type ReferenceMaterialActionTarget =
  | "source_drawer"
  | "rights_drawer"
  | "acquisition_drawer"
  | "reference_visual_workflow"
  | "approval"
  | "none";

export type ReferenceMaterialVisualProjection = {
  action: ReferenceMaterialVisualAction;
  label: string;
  target: ReferenceMaterialActionTarget;
  disabled: boolean;
};

export type ReferenceVisualWorkflowFocus = {
  workspaceId: string;
  workpieceId: string;
  opportunityId: string;
  opportunityRevisionId: string;
  sourceSetRevisionId: string | null;
  rightsRevisionId: string | null;
  returnCardKey: string;
};

const ARCHIVAL_TYPES = new Set<ReferenceVisualSubtype>([
  "archival_still",
  "archival_sequence",
]);

export function projectReferenceMaterialVisualAction(args: {
  sourceLinked: boolean;
  rightsSaved: boolean;
  subtype: ReferenceVisualSubtype;
  candidateReady: boolean;
  resolution: "approved" | "skipped" | null;
}): ReferenceMaterialVisualProjection {
  if (args.resolution === "skipped")
    return { action: "skipped", label: "Skipped", target: "none", disabled: true };
  if (args.resolution === "approved")
    return { action: "ready", label: "Ready", target: "none", disabled: true };
  if (!args.sourceLinked)
    return { action: "add_source", label: "Add Source", target: "source_drawer", disabled: false };
  if (args.candidateReady)
    return { action: "approve", label: "Approve", target: "approval", disabled: false };
  if (!args.rightsSaved)
    return { action: "review_rights", label: "Review rights", target: "rights_drawer", disabled: false };
  if (ARCHIVAL_TYPES.has(args.subtype))
    return { action: "acquire_image", label: "Acquire image", target: "acquisition_drawer", disabled: false };
  return { action: "design_visual", label: "Design visual", target: "reference_visual_workflow", disabled: false };
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
