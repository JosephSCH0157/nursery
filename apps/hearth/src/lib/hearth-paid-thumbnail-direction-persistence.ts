import {
  canonicalContentHash,
  deterministicUuid,
  validateConceptGenerationSet,
  type EpisodePackageV3,
  type ThumbnailConceptRevision,
  type ThumbnailConceptSet,
  type ThumbnailCreativeBrief,
  type ThumbnailCreativeStrategy,
} from "./episode-package-v3";
import { appendConceptSet } from "./hearth-thumbnail-v3-authority";
import { validatePaidThumbnailDirectionOutput } from "./hearth-thumbnail-direction-contract";

export type PaidThumbnailDirectionPersistenceIdentity = {
  resultId: string;
  operationId: string;
  approvalId: string;
  approvalRevision: number;
  scriptHash: string;
  generatedAt: string;
  styleAuthority: Record<string, unknown>;
  titleInputs: Array<Record<string, unknown>>;
  expectedAuthorityHash: string;
  expectedStrategyId: string | null;
  expectedSetId: string | null;
};

export type PaidThumbnailDirectionMutation = {
  nextEpisodePackage: EpisodePackageV3;
  setId: string;
  strategyId: string;
  sourceResponseHash: string;
  disposition: "created" | "existing";
};

function planningSubtree(episodePackage: EpisodePackageV3) {
  const thumbnail = episodePackage.thumbnail;
  return {
    authority_version: thumbnail.authority_version,
    active_creative_strategy_id: thumbnail.active_creative_strategy_id,
    active_concept_set_id: thumbnail.active_concept_set_id,
    creative_strategies: thumbnail.creative_strategies,
    creative_briefs: thumbnail.creative_briefs,
    concept_sets: thumbnail.concept_sets,
    concept_revisions: thumbnail.concept_revisions,
  };
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildPaidThumbnailDirectionMutation(args: {
  episodePackage: EpisodePackageV3;
  rawText: string;
  identity: PaidThumbnailDirectionPersistenceIdentity;
}): Promise<PaidThumbnailDirectionMutation> {
  const validated = validatePaidThumbnailDirectionOutput(args.rawText);
  if (!validated.ok) throw new Error(validated.error);
  const setId = deterministicUuid("paid-thumbnail-direction-set", args.identity.resultId);
  const existingSet = args.episodePackage.thumbnail.concept_sets.find((set) => set.id === setId);
  if (existingSet) {
    if (existingSet.concept_revision_ids.length !== 3
      || existingSet.generation_provenance.paid_operation_id !== args.identity.operationId
      || existingSet.generation_provenance.paid_result_id !== args.identity.resultId) {
      throw new Error("Paid thumbnail direction replay conflicts with the canonical set.");
    }
    return {
      nextEpisodePackage: args.episodePackage,
      setId,
      strategyId: String(existingSet.generation_provenance.strategy_id ?? args.episodePackage.thumbnail.active_creative_strategy_id ?? ""),
      sourceResponseHash: existingSet.source_response_hash,
      disposition: "existing",
    };
  }
  if (canonicalContentHash(planningSubtree(args.episodePackage)) !== args.identity.expectedAuthorityHash
    || args.episodePackage.thumbnail.active_creative_strategy_id !== args.identity.expectedStrategyId
    || args.episodePackage.thumbnail.active_concept_set_id !== args.identity.expectedSetId) {
    throw new Error("Thumbnail V3 authority changed after the paid request was prepared.");
  }
  const sourceResponseHash = await sha256Text(validated.output.text);
  const strategyId = deterministicUuid("paid-thumbnail-direction-strategy", args.identity.resultId);
  const commonProvenance = {
    source: "hearth.thumbnail_direction_generation",
    paid_operation_id: args.identity.operationId,
    paid_result_id: args.identity.resultId,
    product_contract: "forge.hearth.thumbnail-direction-generation.v1",
    output_contract: "thumbnail_directions_three.v1",
    script_approval_id: args.identity.approvalId,
    script_approval_revision: args.identity.approvalRevision,
    script_content_hash: args.identity.scriptHash,
    style_authority: args.identity.styleAuthority,
    title_inputs: args.identity.titleInputs,
    strategy_id: strategyId,
  };
  const strategy: ThumbnailCreativeStrategy = {
    id: strategyId,
    revision: 1,
    approved_script_version: args.identity.approvalRevision,
    episode_promise: validated.output.strategy.episodePromise,
    intended_viewer: validated.output.strategy.intendedViewer,
    curiosity_mechanism: validated.output.strategy.curiosityMechanism,
    editorial_positioning: validated.output.strategy.editorialPositioning,
    expectation_integrity: {
      truthful_connection: validated.output.strategy.truthfulConnection,
      prohibited_exaggerations: validated.output.strategy.prohibitedExaggerations,
    },
    created_at: args.identity.generatedAt,
    provenance: commonProvenance,
  };
  const briefs: ThumbnailCreativeBrief[] = validated.output.directions.map((direction, index) => ({
    id: deterministicUuid("paid-thumbnail-direction-brief", `${args.identity.resultId}:${direction.key}`),
    revision: 1,
    strategy_id: strategyId,
    strategy_revision: 1,
    concept_slot: index + 1,
    subject_direction: direction.subjectDirection,
    focal_action: direction.focalAction,
    composition_direction: direction.compositionDirection,
    emotional_tone: direction.emotionalTone,
    visual_hierarchy: direction.visualHierarchy,
    title_compatibility: direction.titleCompatibility,
    expectation_integrity_rationale: direction.integrityRationale,
    provider_neutral_render_direction: direction.renderDirection,
    subject_classification: direction.subjectClassification,
    composition_classification: direction.compositionClassification,
    dominant_colors: direction.dominantColors,
    created_at: args.identity.generatedAt,
    provenance: { ...commonProvenance, direction_key: direction.key },
  }));
  const concepts: ThumbnailConceptRevision[] = validated.output.directions.map((direction, index) => ({
    concept_lineage_id: deterministicUuid("paid-thumbnail-direction-lineage", `${args.identity.resultId}:${direction.key}`),
    concept_revision_id: deterministicUuid("paid-thumbnail-direction-concept", `${args.identity.resultId}:${direction.key}:1`),
    revision_number: 1,
    supersedes_revision_id: null,
    concept_set_id: setId,
    strategy_id: strategyId,
    strategy_revision: 1,
    creative_brief_id: briefs[index]!.id,
    creative_brief_revision: 1,
    headline: direction.headline,
    image_concept: direction.renderDirection,
    mood_style: direction.moodStyle,
    normalized_prompt_basis: direction.renderDirection.trim().replace(/\s+/g, " "),
    created_at: args.identity.generatedAt,
    provenance: { ...commonProvenance, direction_key: direction.key },
  }));
  const validationErrors = validateConceptGenerationSet(
    concepts.map(({ concept_set_id: _ignored, ...concept }) => concept),
    3,
  );
  if (validationErrors.length) throw new Error(validationErrors.join(" "));
  const withAuthority: EpisodePackageV3 = {
    ...args.episodePackage,
    thumbnail: {
      ...args.episodePackage.thumbnail,
      creative_strategies: [...args.episodePackage.thumbnail.creative_strategies, strategy],
      active_creative_strategy_id: strategy.id,
      creative_briefs: [...args.episodePackage.thumbnail.creative_briefs, ...briefs],
    },
  };
  const conceptSet: ThumbnailConceptSet = {
    id: setId,
    name: `Directions ${args.episodePackage.thumbnail.concept_sets.length + 1}`,
    created_at: args.identity.generatedAt,
    state: "active",
    approved_script_version: args.identity.approvalRevision,
    generation_provenance: commonProvenance,
    prompt_schema_version: "thumbnail_directions_three.v1",
    source_response_hash: sourceResponseHash,
    concept_revision_ids: concepts.map((entry) => entry.concept_revision_id),
  };
  return {
    nextEpisodePackage: appendConceptSet({ episodePackage: withAuthority, concepts, conceptSet }),
    setId,
    strategyId,
    sourceResponseHash,
    disposition: "created",
  };
}
