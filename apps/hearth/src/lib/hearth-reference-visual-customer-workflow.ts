import {
  referenceVisualReadiness,
  type ReferenceVisualOpportunity,
} from "./hearth-reference-visual-authority";

export type ReferenceVisualCustomerStageId =
  "source" | "evidence" | "usage-rights" | "design" | "generate";

export type ReferenceVisualCustomerStageStatus =
  "complete" | "current" | "blocked";

export type ReferenceVisualCustomerStage = {
  id: ReferenceVisualCustomerStageId;
  label: string;
  summary: string;
  status: ReferenceVisualCustomerStageStatus;
  optional: boolean;
};

export type ReferenceVisualCustomerWorkflow = {
  stages: ReferenceVisualCustomerStage[];
  currentStageId: ReferenceVisualCustomerStageId;
  nextAction: string;
  nextActionDetail: string;
  isComplete: boolean;
  sourceSummary: string;
  evidenceSummary: string;
  usageSummary: string;
  designSummary: string;
};

type WorkflowInput = {
  opportunity: ReferenceVisualOpportunity;
  evidenceReady?: boolean;
  recipeCurrent?: boolean;
  renderedType?: boolean;
};

const RENDERED_TYPES = new Set([
  "chart",
  "timeline",
  "document_excerpt",
  "quote_card",
  "stat_card",
  "comparison",
]);

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export function projectReferenceVisualCustomerWorkflow({
  opportunity,
  evidenceReady,
  recipeCurrent,
  renderedType,
}: WorkflowInput): ReferenceVisualCustomerWorkflow {
  const isRenderedType =
    renderedType ?? RENDERED_TYPES.has(opportunity.subtype);
  const isEvidenceReady =
    evidenceReady ?? referenceVisualReadiness(opportunity).evidenceReady;
  const isRecipeCurrent =
    recipeCurrent ??
    Boolean(
      opportunity.recipe && referenceVisualReadiness(opportunity, true).ready,
    );
  const sources = opportunity.sources ?? [];
  const comparisonSourcesReady =
    opportunity.subtype !== "comparison" || sources.length === 2;
  const sourceReady =
    opportunity.sourceStatus === "linked" &&
    sources.length > 0 &&
    comparisonSourcesReady;
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
  const designReady = isRenderedType ? isRecipeCurrent : selectableCandidate;
  const generatedReady = Boolean(opportunity.selectedCandidateRevisionId);

  let currentStageId: ReferenceVisualCustomerStageId = "generate";
  let nextAction = "Review finished visual";
  let nextActionDetail =
    "This visual is selected and ready in the current plan.";

  if (!sourceReady) {
    currentStageId = "source";
    if (opportunity.subtype === "comparison" && sources.length === 1) {
      nextAction = "Add a comparison Source";
      nextActionDetail =
        "Keep the confirmed evidence and add the second Source this comparison requires.";
    } else if (opportunity.subtype === "comparison" && sources.length > 2) {
      nextAction = "Choose two comparison Sources";
      nextActionDetail =
        "Keep exactly the two Sources this comparison will place side by side.";
    } else {
      nextAction = "Choose a Source";
      nextActionDetail = "Attach the Source that supports this visual.";
    }
  } else if (!isEvidenceReady) {
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
    nextAction = isRenderedType
      ? "Prepare visual design"
      : "Prepare archival media";
    nextActionDetail = isRenderedType
      ? "Review the wording and prepare a design from the confirmed evidence."
      : "Add genuine archival media covered by the saved rights declaration.";
  } else if (!generatedReady) {
    currentStageId = "generate";
    nextAction = selectableCandidate
      ? "Choose a finished visual"
      : isRenderedType
        ? "Generate visual"
        : "Add archival media";
    nextActionDetail = selectableCandidate
      ? "A current, release-ready candidate is waiting for your selection."
      : isRenderedType
        ? "The Source, evidence, usage, rights, and design are ready."
        : "Verify the archival stills that will appear in the finished visual.";
  }

  const completed: Record<ReferenceVisualCustomerStageId, boolean> = {
    source: sourceReady,
    evidence: isEvidenceReady,
    "usage-rights": usageRightsReady,
    design: designReady,
    generate: generatedReady,
  };
  const isComplete = Object.values(completed).every(Boolean);
  const summaries: Record<ReferenceVisualCustomerStageId, string> = {
    source: sourceReady
      ? `${text(sources[0]?.source.title) ?? "Current Source"}${
          sources.length > 1 ? ` + ${sources.length - 1} supporting` : ""
        }`
      : opportunity.subtype === "comparison" && sources.length === 1
        ? `${text(sources[0]?.source.title) ?? "Current Source"} · second Source needed`
        : opportunity.subtype === "comparison" && sources.length > 2
          ? `${sources.length} Sources linked · choose two`
      : "Source needed",
    evidence: isEvidenceReady
      ? `${opportunity.evidence.length} confirmed item${
          opportunity.evidence.length === 1 ? "" : "s"
        }`
      : opportunity.subtype === "comparison" &&
          !comparisonSourcesReady &&
          opportunity.evidence.length > 0
        ? `${opportunity.evidence.length} confirmed item${
            opportunity.evidence.length === 1 ? "" : "s"
          } preserved`
        : "Confirmation needed",
    "usage-rights": usageReady
      ? sourceUse === "facts_data_only"
        ? "Facts/data only · no rights action needed"
        : rightsReady
          ? "Usage and rights confirmed"
          : "Rights action needed"
      : "Usage confirmation needed",
    design: designReady
      ? isRenderedType
        ? "Design prepared"
        : "Ready for archival media"
      : isRenderedType
        ? "Waiting for confirmed inputs"
        : "Waiting for usage and rights",
    generate: generatedReady
      ? "Visual selected"
      : selectableCandidate
        ? "Candidate ready to select"
        : "Not generated yet",
  };

  const stageDefinitions: Array<Omit<ReferenceVisualCustomerStage, "status">> =
    [
      { id: "source", label: "Source", summary: summaries.source, optional: false },
      { id: "evidence", label: "Evidence", summary: summaries.evidence, optional: false },
      {
        id: "usage-rights",
        label: "Usage & rights",
        summary: summaries["usage-rights"],
        optional: sourceUse === "facts_data_only",
      },
      { id: "design", label: "Design", summary: summaries.design, optional: false },
      { id: "generate", label: "Generate", summary: summaries.generate, optional: false },
    ];
  const stages: ReferenceVisualCustomerStage[] = stageDefinitions.map(
    (stage) => ({
      ...stage,
      status: completed[stage.id]
        ? "complete"
        : stage.id === currentStageId
          ? "current"
          : "blocked",
    }),
  );

  return {
    stages,
    currentStageId,
    nextAction,
    nextActionDetail,
    isComplete,
    sourceSummary: summaries.source,
    evidenceSummary: summaries.evidence,
    usageSummary: summaries["usage-rights"],
    designSummary: summaries.design,
  };
}
