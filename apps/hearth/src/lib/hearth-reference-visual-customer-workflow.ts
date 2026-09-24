import type { ReferenceVisualOpportunity } from "./hearth-reference-visual-authority";

export type ReferenceVisualCustomerStageId =
  "source" | "evidence" | "usage-rights" | "design" | "generate";

export type ReferenceVisualCustomerStageStatus =
  "complete" | "current" | "upcoming";

export type ReferenceVisualCustomerStage = {
  id: ReferenceVisualCustomerStageId;
  label: string;
  summary: string;
  status: ReferenceVisualCustomerStageStatus;
};

export type ReferenceVisualCustomerWorkflow = {
  stages: ReferenceVisualCustomerStage[];
  currentStageId: ReferenceVisualCustomerStageId;
  nextAction: string;
  nextActionDetail: string;
  sourceSummary: string;
  evidenceSummary: string;
  usageSummary: string;
  designSummary: string;
};

type WorkflowInput = {
  opportunity: ReferenceVisualOpportunity;
  evidenceReady: boolean;
  recipeCurrent: boolean;
  renderedType: boolean;
};

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export function projectReferenceVisualCustomerWorkflow({
  opportunity,
  evidenceReady,
  recipeCurrent,
  renderedType,
}: WorkflowInput): ReferenceVisualCustomerWorkflow {
  const sources = opportunity.sources ?? [];
  const sourceReady =
    opportunity.sourceStatus === "linked" && sources.length > 0;
  const sourceUse = text(opportunity.sourceUse?.use_classification);
  const usageReady = Boolean(sourceUse);
  const rightsRequired = usageReady && sourceUse !== "facts_data_only";
  const rightsReady = !rightsRequired || Boolean(opportunity.rights);
  const usageRightsReady = usageReady && rightsReady;
  const currentCandidates = opportunity.candidates.filter(
    (candidate) => candidate.currentForPlan !== false,
  );
  const selectableCandidate = currentCandidates.some(
    (candidate) => candidate.releaseReady,
  );
  const designReady = renderedType ? recipeCurrent : selectableCandidate;
  const generatedReady = Boolean(opportunity.selectedCandidateRevisionId);

  let currentStageId: ReferenceVisualCustomerStageId = "generate";
  let nextAction = "Review finished visual";
  let nextActionDetail =
    "This visual is selected and ready in the current plan.";

  if (!sourceReady) {
    currentStageId = "source";
    nextAction = "Choose a Source";
    nextActionDetail = "Attach the Source that supports this visual.";
  } else if (!evidenceReady) {
    currentStageId = "evidence";
    nextAction = "Confirm supporting evidence";
    nextActionDetail = "Choose the exact source material this visual will use.";
  } else if (!usageReady) {
    currentStageId = "usage-rights";
    nextAction = "Confirm Source use";
    nextActionDetail =
      "Tell Forge whether this creates a new visual from facts or reproduces source material.";
  } else if (!rightsReady) {
    currentStageId = "usage-rights";
    nextAction = "Resolve rights";
    nextActionDetail =
      "Save the rights declaration required for quoted or third-party material.";
  } else if (!designReady) {
    currentStageId = "design";
    nextAction = renderedType
      ? "Prepare visual design"
      : "Prepare archival media";
    nextActionDetail = renderedType
      ? "Review the wording and prepare a design from the confirmed evidence."
      : "Add genuine archival media covered by the saved rights declaration.";
  } else if (!generatedReady) {
    currentStageId = "generate";
    nextAction = selectableCandidate
      ? "Choose a finished visual"
      : renderedType
        ? "Generate visual"
        : "Add archival media";
    nextActionDetail = selectableCandidate
      ? "A current, release-ready candidate is waiting for your selection."
      : renderedType
        ? "The Source, evidence, usage, rights, and design are ready."
        : "Verify the archival stills that will appear in the finished visual.";
  }

  const completed: Record<ReferenceVisualCustomerStageId, boolean> = {
    source: sourceReady,
    evidence: evidenceReady,
    "usage-rights": usageRightsReady,
    design: designReady,
    generate: generatedReady,
  };
  const summaries: Record<ReferenceVisualCustomerStageId, string> = {
    source: sourceReady
      ? `${text(sources[0]?.source.title) ?? "Current Source"}${
          sources.length > 1 ? ` + ${sources.length - 1} supporting` : ""
        }`
      : "Source needed",
    evidence: evidenceReady
      ? `${opportunity.evidence.length} confirmed item${
          opportunity.evidence.length === 1 ? "" : "s"
        }`
      : "Confirmation needed",
    "usage-rights": usageReady
      ? sourceUse === "facts_data_only"
        ? "Facts/data only · no rights action needed"
        : rightsReady
          ? "Usage and rights confirmed"
          : "Rights action needed"
      : "Usage confirmation needed",
    design: designReady
      ? renderedType
        ? "Design prepared"
        : "Ready for archival media"
      : renderedType
        ? "Waiting for confirmed inputs"
        : "Waiting for usage and rights",
    generate: generatedReady
      ? "Visual selected"
      : selectableCandidate
        ? "Candidate ready to select"
        : "Not generated yet",
  };

  const stageDefinitions: Array<
    Omit<ReferenceVisualCustomerStage, "status">
  > = [
    { id: "source", label: "Source", summary: summaries.source },
    { id: "evidence", label: "Evidence", summary: summaries.evidence },
    {
      id: "usage-rights",
      label: "Usage & rights",
      summary: summaries["usage-rights"],
    },
    { id: "design", label: "Design", summary: summaries.design },
    { id: "generate", label: "Generate", summary: summaries.generate },
  ];
  const stages: ReferenceVisualCustomerStage[] = stageDefinitions.map((stage) => ({
    ...stage,
    status: completed[stage.id]
      ? "complete"
      : stage.id === currentStageId
        ? "current"
        : "upcoming",
  }));

  return {
    stages,
    currentStageId,
    nextAction,
    nextActionDetail,
    sourceSummary: summaries.source,
    evidenceSummary: summaries.evidence,
    usageSummary: summaries["usage-rights"],
    designSummary: summaries.design,
  };
}
