import type {
  ReferenceClipState,
  ReferenceClipCandidate,
} from "./hearth-reference-clip-authority";
import type {
  ReferenceVisualState,
  ReferenceVisualCandidate,
} from "./hearth-reference-visual-authority";
import type { VisualOpportunityDisposition } from "./hearth-visual-disposition-authority";
import { tongsFetch } from "./tongs-fetch";

export type ReferenceReviewState =
  | "hearth_is_working"
  | "needs_your_decision"
  | "ready";
export type ReferenceReviewResolution = "approved" | "skipped" | null;
export type ReferenceReviewDecision = "approve" | "edit" | "replace" | "skip";
export type ReferenceReviewFamily = "reference_clip" | "reference_visual";

type ReferenceReviewBase = {
  key: string;
  family: ReferenceReviewFamily;
  label: "Reference Clip" | "Reference Visual";
  opportunityId: string;
  opportunityRevisionId: string;
  opportunityRevision: number;
  planRevisionId: string;
  planRevision: number;
  anchor: { before: string; focus: string; after: string };
  proposal: string;
  rationale: string;
  placement: string;
  durationMs: number;
  sourceSummary: string[];
  warning: string | null;
  state: ReferenceReviewState;
  resolution: ReferenceReviewResolution;
  approveDisabledReason: string | null;
  decisions: ReferenceReviewDecision[];
  previewUrl: string | null;
  details: Record<string, unknown>;
};

export type ReferenceClipReviewItem = ReferenceReviewBase & {
  family: "reference_clip";
  candidate: ReferenceClipCandidate | null;
};

export type ReferenceVisualReviewItem = ReferenceReviewBase & {
  family: "reference_visual";
  candidate: ReferenceVisualCandidate | null;
};

export type ReferenceReviewItem =
  | ReferenceClipReviewItem
  | ReferenceVisualReviewItem;

export type ReferenceReviewProjectionInput = {
  clips: ReferenceClipState | null;
  visuals: ReferenceVisualState | null;
  dispositions: VisualOpportunityDisposition[];
  pendingKeys?: ReadonlySet<string>;
  hammerVerifiedKeys?: ReadonlySet<string>;
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const keyOf = (family: ReferenceReviewFamily, opportunityId: string) =>
  `${family}:${opportunityId}`;

function resolutionFor(
  family: ReferenceReviewFamily,
  opportunityId: string,
  selected: boolean,
  dispositions: VisualOpportunityDisposition[],
): ReferenceReviewResolution {
  const disposition = dispositions.find(
    (entry) => entry.kind === family && entry.opportunityId === opportunityId,
  );
  if (disposition?.state === "skipped") return "skipped";
  return selected ? "approved" : null;
}

export function projectReferenceReviewItems(
  input: ReferenceReviewProjectionInput,
): ReferenceReviewItem[] {
  const pending = input.pendingKeys ?? new Set<string>();
  const verified = input.hammerVerifiedKeys ?? new Set<string>();
  const clips: ReferenceClipReviewItem[] = (
    input.clips?.opportunities ?? []
  ).map((opportunity) => {
    const key = keyOf("reference_clip", opportunity.id);
    const candidate =
      opportunity.candidates.find((entry) =>
        opportunity.selectedRevisionIds.includes(entry.revisionId),
      ) ??
      opportunity.candidates[0] ??
      null;
    const resolution = resolutionFor(
      "reference_clip",
      opportunity.id,
      opportunity.selectedRevisionIds.length > 0,
      input.dispositions,
    );
    const approveDisabledReason = candidate
      ? candidate.rights.basis === "rights_unresolved"
        ? "Confirm permission or licensing before approving this clip."
        : null
      : "Add or choose source media before approving.";
    return {
      key,
      family: "reference_clip",
      label: "Reference Clip",
      opportunityId: opportunity.id,
      opportunityRevisionId: opportunity.revisionId,
      opportunityRevision: opportunity.revision,
      planRevisionId: input.clips!.planRevisionId,
      planRevision: input.clips!.planRevision,
      anchor: {
        before: opportunity.before,
        focus: opportunity.focus,
        after: opportunity.after,
      },
      proposal: opportunity.desiredMaterial,
      rationale: opportunity.editorialReason,
      placement: opportunity.placement,
      durationMs: opportunity.durationMs,
      sourceSummary: opportunity.source ? [opportunity.source.title] : [],
      warning: approveDisabledReason,
      state: pending.has(key)
        ? "hearth_is_working"
        : resolution && verified.has(key)
          ? "ready"
          : "needs_your_decision",
      resolution,
      approveDisabledReason,
      decisions: ["approve", "edit", "replace", "skip"],
      previewUrl: candidate?.posterUrl ?? candidate?.videoUrl ?? null,
      candidate,
      details: {
        placement: opportunity.placement,
        durationMs: opportunity.durationMs,
        citation: opportunity.citation,
        mediaRange: opportunity.mediaRange,
        searchTerms: opportunity.searchTerms,
        sourceRevisionId: opportunity.source?.revisionId ?? null,
        sourceLinkRevisionId: opportunity.sourceLinkRevisionId,
        candidateRevisionIds: opportunity.candidates.map(
          (entry) => entry.revisionId,
        ),
        selectionSetRevision: opportunity.selectionSetRevision,
      },
    };
  });

  const visuals: ReferenceVisualReviewItem[] = (
    input.visuals?.opportunities ?? []
  ).map((opportunity) => {
    const key = keyOf("reference_visual", opportunity.id);
    const candidate =
      opportunity.candidates.find(
        (entry) => entry.revisionId === opportunity.selectedCandidateRevisionId,
      ) ??
      opportunity.candidates[0] ??
      null;
    const resolution = resolutionFor(
      "reference_visual",
      opportunity.id,
      Boolean(opportunity.selectedCandidateRevisionId),
      input.dispositions,
    );
    const use = text(opportunity.sourceUse?.use_classification);
    const reproduction = use != null && use !== "facts_data_only";
    const approveDisabledReason = !candidate
      ? "Prepare a visual before approving."
      : !candidate.releaseReady
        ? "This visual is not canonically eligible for reproduction."
        : reproduction && !opportunity.rights
          ? "Confirm permission or licensing before approving reproduced material."
          : null;
    const sources = (opportunity.sources ?? []).map(
      (member) => text(member.source.title) ?? "Untitled Source",
    );
    return {
      key,
      family: "reference_visual",
      label: "Reference Visual",
      opportunityId: opportunity.id,
      opportunityRevisionId: opportunity.revisionId,
      opportunityRevision: opportunity.revision,
      planRevisionId: input.visuals!.planRevisionId,
      planRevision: input.visuals!.planRevision,
      anchor: {
        before: opportunity.before,
        focus: opportunity.focus,
        after: opportunity.after,
      },
      proposal: opportunity.desiredMaterial,
      rationale: opportunity.editorialReason,
      placement: opportunity.placement,
      durationMs: opportunity.durationMs,
      sourceSummary: sources,
      warning: approveDisabledReason,
      state: pending.has(key)
        ? "hearth_is_working"
        : resolution && verified.has(key)
          ? "ready"
          : "needs_your_decision",
      resolution,
      approveDisabledReason,
      decisions: ["approve", "edit", "replace", "skip"],
      previewUrl: candidate?.imageUrl ?? null,
      candidate,
      details: {
        subtype: opportunity.subtype,
        placement: opportunity.placement,
        durationMs: opportunity.durationMs,
        sourceSetRevision: opportunity.sourceSetRevision ?? 0,
        sourceRevisionIds: (opportunity.sources ?? []).map(
          (entry) => entry.sourceRevisionId,
        ),
        evidenceRevisionIds: opportunity.evidence
          .map((entry) => text(entry.id))
          .filter(Boolean),
        sourceUseRevisionId: text(opportunity.sourceUse?.id),
        rightsRevisionId: text(opportunity.rights?.id),
        recipeRevisionId: text(opportunity.recipe?.id),
        candidateRevisionIds: opportunity.candidates.map(
          (entry) => entry.revisionId,
        ),
        selectionRevision: opportunity.selectionRevision,
      },
    };
  });

  return [...clips, ...visuals].sort((left, right) => {
    const focus = left.anchor.focus.localeCompare(right.anchor.focus);
    return (
      focus ||
      left.family.localeCompare(right.family) ||
      left.opportunityId.localeCompare(right.opportunityId)
    );
  });
}

export function acceptsReferenceReviewEvent(
  current: Pick<
    ReferenceReviewItem,
    "opportunityId" | "opportunityRevisionId" | "planRevisionId"
  >,
  event: {
    opportunityId: string;
    opportunityRevisionId: string;
    planRevisionId: string;
  },
) {
  return (
    current.opportunityId === event.opportunityId &&
    current.opportunityRevisionId === event.opportunityRevisionId &&
    current.planRevisionId === event.planRevisionId
  );
}

export async function verifyReferenceReviewHammerDecision(
  workpieceId: string,
  item: ReferenceReviewItem,
  resolution: Exclude<ReferenceReviewResolution, null>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(workpieceId)}/visual-package`,
    { method: "GET" },
  );
  let value: unknown = null;
  try {
    value = await response.json();
  } catch {
    /* handled below */
  }
  if (!response.ok || !value || typeof value !== "object")
    return { ok: false, error: "Hammer could not verify this decision." };
  const root = value as { data?: unknown };
  const data =
    root.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? (root.data as { visuals?: unknown })
      : null;
  const raw = data?.visuals;
  const visuals = Array.isArray(raw)
    ? raw.filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
      )
    : [];
  const projected = visuals.filter(
    (entry) =>
      entry.asset_class === item.family &&
      entry.entry_id === item.opportunityId,
  );
  if (resolution === "skipped")
    return projected.length === 0
      ? { ok: true }
      : {
          ok: false,
          error:
            "Hammer still contains selected media for this skipped proposal.",
        };
  if (!item.candidate)
    return { ok: false, error: "The approved candidate is no longer current." };
  const exact = projected.some((entry) => {
    const evidence =
      item.family === "reference_clip"
        ? entry.reference_clip_evidence
        : entry.reference_visual_evidence;
    return Boolean(
      evidence &&
        typeof evidence === "object" &&
        (evidence as Record<string, unknown>).candidate_revision_id ===
          item.candidate?.revisionId,
    );
  });
  return exact
    ? { ok: true }
    : {
        ok: false,
        error: "Hammer did not return the exact approved media identity.",
      };
}
