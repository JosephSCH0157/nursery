import {
  EPISODE_PACKAGE_V2_SCHEMA,
  hydrateEpisodePackageV2,
  type EpisodeLaunchVariant,
  type EpisodePackageV2,
  type EpisodeSeoTitle,
  type EpisodeThumbnailConcept,
  type EpisodeThumbnailVersion,
} from "./episode-package-v2";
import type { BrandApplicationProvenance, BrandBindingProjection } from "@forge/shared";

export const EPISODE_PACKAGE_V3_SCHEMA = "forge.episode.package.v3" as const;
export const THUMBNAIL_PROMPT_TEMPLATE_VERSION = "hearth-thumbnail-prompt-v1" as const;
export const THUMBNAIL_COMPOSITION_ENGINE_VERSION = "forge-thumbnail-compositor-v1" as const;
export const THUMBNAIL_AUTHORITY_VERSION = "hearth-thumbnail-authority-v1" as const;
export const THUMBNAIL_PROMPT_SERIALIZATION_VERSION = "hearth-thumbnail-prompt-canonical-v1" as const;

export type ThumbnailCreativeStrategy = {
  id: string;
  revision: number;
  approved_script_version: number;
  episode_promise: string;
  intended_viewer: string;
  curiosity_mechanism: string;
  editorial_positioning: string;
  expectation_integrity: {
    truthful_connection: string;
    prohibited_exaggerations: readonly string[];
  };
  created_at: string;
  provenance: Readonly<Record<string, unknown>>;
};

export type ThumbnailCreativeBrief = {
  id: string;
  revision: number;
  strategy_id: string;
  strategy_revision: number;
  concept_slot: number;
  subject_direction: string;
  focal_action: string;
  composition_direction: string;
  emotional_tone: string;
  visual_hierarchy: string;
  title_compatibility: string;
  expectation_integrity_rationale: string;
  provider_neutral_render_direction: string;
  subject_classification: string;
  composition_classification: string;
  dominant_colors: readonly string[];
  created_at: string;
  provenance: Readonly<Record<string, unknown>>;
};

export type ThumbnailConceptRevision = {
  concept_lineage_id: string;
  concept_revision_id: string;
  revision_number: number;
  supersedes_revision_id: string | null;
  concept_set_id: string;
  strategy_id: string;
  strategy_revision: number;
  creative_brief_id: string;
  creative_brief_revision: number;
  headline: string;
  image_concept: string;
  mood_style: string;
  normalized_prompt_basis: string;
  created_at: string;
  provenance: Record<string, unknown>;
  presentation_suggestions?: Readonly<Record<string, unknown>> | null;
};

export type ThumbnailConceptSet = {
  id: string;
  name: string;
  created_at: string;
  state: "active" | "archived";
  approved_script_version: number;
  generation_provenance: Record<string, unknown>;
  prompt_schema_version: string;
  source_response_hash: string;
  concept_revision_ids: readonly string[];
};

export type ThumbnailTreatment = {
  typography: Readonly<Record<string, unknown>>;
  placement: Readonly<Record<string, unknown>>;
  safe_zone: Readonly<Record<string, unknown>>;
  shadow: Readonly<Record<string, unknown>>;
  treatment: Readonly<Record<string, unknown>>;
};

export type ThumbnailPresentationOverride = {
  text_color: string | null;
  treatment: "none" | "outline" | "shadow" | "gradient" | "backing" | null;
  logo_visible: boolean | null;
  logo_placement: "top_left" | "top_right" | "bottom_left" | "bottom_right" | null;
  logo_opacity: number | null;
  decision_origin: "automatic" | "explicit_user";
};

export type ThumbnailReadabilityEvidence = Readonly<Record<string, unknown>> & {
  contract_version: "forge.thumbnail-readability.v1";
  evaluator_version: "forge-thumbnail-contrast-evaluator-v1";
  threshold: 4.5;
  preferred_brand_color: string;
  applied_color: string;
  applied_treatment: "none" | "outline" | "shadow" | "gradient" | "backing";
  aggregate_score: number;
  passed: boolean;
  evaluation_hash: string;
};

export type ThumbnailCandidateEligibility = "current" | "historical_brand" | "requires_reapproval" | "approved_historical_brand" | "blocked";
export type ThumbnailCandidateProjection = { candidate_revision_id: string; candidate_ordinal: number; recipe_id: string; recipe_revision: number; recipe_hash: string; title_revision_id: string; concept_revision_id: string; base_artwork_content_hash: string; structural_composition_fingerprint: string; composite_asset_id: string; composite_content_hash: string; candidate_binding_id: string; candidate_binding_revision: number; readability_evidence_hash: string; eligibility_state: ThumbnailCandidateEligibility };
export type ThumbnailCandidateSetProjection = { candidate_set_id: string; revision: number; previous_candidate_set_id: string | null; content_hash: string; distinction_contract_version: "forge.thumbnail-candidate-distinction.v1"; candidates: ThumbnailCandidateProjection[]; projected_at: string };

export type ThumbnailRenderRecipe = {
  id: string;
  revision: number;
  concept_revision_id: string;
  strategy_id: string;
  strategy_revision: number;
  creative_brief_id: string;
  creative_brief_revision: number;
  title_id: string;
  title_revision: number;
  provider_id: string;
  provider_settings: Readonly<Record<string, unknown>>;
  intended_aspect_ratio: "16:9" | "1:1" | "9:16";
  brand_template_id: string | null;
  brand_template_revision: number | null;
  presentation_override?: ThumbnailPresentationOverride | null;
  title_text: string;
  treatment: ThumbnailTreatment;
  prompt_template_version: string;
  composition_engine_version: string;
  composition_revision: number;
  prompt_review_state: "unreviewed" | "reviewed" | "needs_review";
  last_reviewed_template_version: string | null;
  created_at: string;
  updated_at: string;
};

export type ThumbnailCompositionRevision = {
  id: string;
  revision: number;
  render_recipe_id: string;
  render_recipe_revision: number;
  composition_engine_version: string;
  title_id: string;
  title_revision: number;
  title_text: string;
  treatment: ThumbnailTreatment;
  canonical_serialized: string;
  content_hash: string;
  created_at: string;
};

export type ThumbnailVariationProperty = "concept" | "title" | "subject" | "composition" | "emotional_tone" | "color_palette" | "typography" | "brand_template" | "provider";
export type ThumbnailVariationLocks = Readonly<Record<ThumbnailVariationProperty, boolean>>;
export type ThumbnailBrandMode = "strict_brand" | "flexible_brand" | "editorial_experiment";

export type ThumbnailRecipeVariation = {
  id: string;
  ordinal: number;
  label: string;
  change_specification: Readonly<Record<string, unknown>>;
  candidate_recipe: Readonly<ThumbnailRenderRecipe>;
  canonical_serialized: string;
  content_hash: string;
};

export type ThumbnailVariationBatch = {
  id: string;
  source_recipe_id: string;
  source_recipe_revision: number;
  brand_mode: ThumbnailBrandMode;
  locks: ThumbnailVariationLocks;
  requested_count: number;
  generation_kind: "deterministic_recipe";
  estimated_ai_credits: 0;
  source_identity: string;
  variations: readonly ThumbnailRecipeVariation[];
  created_at: string;
};

export type ThumbnailVariationPromotion = {
  id: string;
  variation_batch_id: string;
  variation_id: string;
  promoted_recipe_id: string;
  promoted_recipe_revision: number;
  created_at: string;
};

export type ThumbnailBaseVersion = {
  id: string;
  asset_id: string;
  asset_path: string;
  content_hash: string;
  source_type: "forge_ai" | "outside_tool";
  provider_id: string;
  provider_request_id: string | null;
  created_at: string;
  concept_revision_id: string;
  render_recipe_id: string;
  render_recipe_revision: number;
  intended_aspect_ratio: "16:9" | "1:1" | "9:16";
  mime_type: string;
  status: "pending" | "ready" | "failed" | "superseded" | "recoverable_error";
  error_details: Record<string, unknown> | null;
};

export type ThumbnailCompositeSnapshot = {
  asset_id: string;
  asset_path: string;
  content_hash: string;
  composition_engine_version: string;
  recipe_snapshot: Readonly<ThumbnailRenderRecipe & {
    template_revision: number;
    text_color: string;
    shadow_color: string;
    shadow_opacity: number;
    placement: "top" | "center" | "bottom";
    max_lines: number;
    horizontal_padding_percent: number;
  }>;
  recipe_snapshot_hash: string;
  brand_application_provenance?: Readonly<Record<string, unknown>> | null;
  brand_logo_asset_revision_id?: string | null;
  readability_evidence?: ThumbnailReadabilityEvidence | null;
  exported_at: string;
};

export type ThumbnailLaunchVariantRevision = {
  launch_variant_id: string;
  revision: number;
  supersedes_revision: number | null;
  base_version_id: string;
  concept_revision_id: string;
  title_id: string;
  title_revision: number;
  recipe_id: string;
  recipe_revision: number;
  snapshot: ThumbnailCompositeSnapshot;
  status: "draft" | "ready" | "tested" | "winner" | "published";
  created_at: string;
};

export type ThumbnailPublicationEvent = {
  id: string;
  launch_variant_id: string;
  launch_variant_revision: number;
  snapshot: ThumbnailCompositeSnapshot;
  published_at: string;
  destination: string;
};

export type EpisodeSeoTitleV3 = EpisodeSeoTitle & { revision: number };

export type EpisodePackageV3 = Omit<EpisodePackageV2, "schema" | "seo" | "thumbnail" | "launch_variants"> & {
  schema: typeof EPISODE_PACKAGE_V3_SCHEMA;
  brand: { binding: BrandBindingProjection | null; application_history: Array<BrandApplicationProvenance & { artifact_identity: string; applied_at: string }> };
  seo: Omit<EpisodePackageV2["seo"], "titles"> & { titles: EpisodeSeoTitleV3[] };
  thumbnail: {
    authority_version: typeof THUMBNAIL_AUTHORITY_VERSION;
    creative_strategies: ThumbnailCreativeStrategy[];
    active_creative_strategy_id: string | null;
    creative_briefs: ThumbnailCreativeBrief[];
    concept_sets: ThumbnailConceptSet[];
    concept_revisions: ThumbnailConceptRevision[];
    active_concept_set_id: string | null;
    render_recipes: ThumbnailRenderRecipe[];
    active_render_recipe_id: string | null;
    composition_revisions: ThumbnailCompositionRevision[];
    active_composition_revision_id: string | null;
    variation_batches: ThumbnailVariationBatch[];
    active_variation_batch_id: string | null;
    variation_promotions: ThumbnailVariationPromotion[];
    base_versions: ThumbnailBaseVersion[];
    primary_base_version_id: string | null;
    candidate_sets: ThumbnailCandidateSetProjection[];
    active_candidate_set_id: string | null;
    launch_variant_revisions: ThumbnailLaunchVariantRevision[];
    publication_events: ThumbnailPublicationEvent[];
  };
};

export type DerivedThumbnailPromptPack = {
  template_version: string;
  review_state: ThumbnailRenderRecipe["prompt_review_state"];
  regenerated_under_newer_template: boolean;
  provider_id: string;
  intended_aspect_ratio: ThumbnailRenderRecipe["intended_aspect_ratio"];
  positive_prompt: string;
  negative_prompt: string;
  canonical_serialized: string;
  canonical_hash: string;
  serialization_version: typeof THUMBNAIL_PROMPT_SERIALIZATION_VERSION;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function canonicalSerialize(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function stableHex(input: string): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < input.length; i += 1) {
    a = Math.imul(a ^ input.charCodeAt(i), 0x01000193) >>> 0;
    b = Math.imul(b ^ (input.charCodeAt(i) + i), 0x85ebca6b) >>> 0;
  }
  const part = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return `${part(a)}${part(b)}${part(a ^ 0xa5a5a5a5)}${part(b ^ 0x5a5a5a5a)}`;
}

export function canonicalContentHash(value: unknown): string {
  const serialized = typeof value === "string" ? value : canonicalSerialize(value);
  return ["a", "b"].map((salt) => stableHex(`${salt}\u0000${serialized}`)).join("");
}

export function deterministicUuid(namespace: string, identity: string): string {
  const hex = stableHex(`${namespace}\u0000${identity}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function importedTimestamp(metadata: Record<string, unknown>): string {
  const raw = typeof metadata.updated_at === "string" ? metadata.updated_at : null;
  return raw && Number.isFinite(Date.parse(raw)) ? new Date(raw).toISOString() : "1970-01-01T00:00:00.000Z";
}

function importConcept(concept: EpisodeThumbnailConcept, setId: string, strategy: ThumbnailCreativeStrategy, brief: ThumbnailCreativeBrief, index: number, createdAt: string): ThumbnailConceptRevision {
  const identity = canonicalSerialize({ concept, index });
  const lineageId = deterministicUuid("thumbnail-imported-lineage", identity);
  return {
    concept_lineage_id: lineageId,
    concept_revision_id: deterministicUuid("thumbnail-imported-revision", identity),
    revision_number: 1,
    supersedes_revision_id: null,
    concept_set_id: setId,
    strategy_id: strategy.id,
    strategy_revision: strategy.revision,
    creative_brief_id: brief.id,
    creative_brief_revision: brief.revision,
    headline: concept.label.trim() || `Imported concept ${index + 1}`,
    image_concept: concept.prompt_text.trim(),
    mood_style: concept.style_preset ?? "unspecified",
    normalized_prompt_basis: concept.prompt_text.trim().replace(/\s+/g, " "),
    created_at: createdAt,
    provenance: { source: "episode_package_v2", legacy_concept_id: concept.id },
    presentation_suggestions: concept.title_style || concept.brand_template_id
      ? { title_style: concept.title_style ?? null, brand_template_id: concept.brand_template_id ?? null }
      : null,
  };
}

function importedBaseVersion(version: EpisodeThumbnailVersion, revisions: ThumbnailConceptRevision[]): ThumbnailBaseVersion {
  const concept = revisions.find((entry) => entry.provenance.legacy_concept_id === version.concept_id) ?? revisions[0];
  return {
    id: deterministicUuid("thumbnail-imported-base-version", version.id),
    asset_id: version.asset_id,
    asset_path: version.asset_path ?? "",
    content_hash: "",
    source_type: version.provider === "upload" ? "outside_tool" : "forge_ai",
    provider_id: version.provider,
    provider_request_id: version.provider_request_id ?? null,
    created_at: version.created_at,
    concept_revision_id: concept?.concept_revision_id ?? deterministicUuid("thumbnail-missing-concept", version.concept_id),
    render_recipe_id: deterministicUuid("thumbnail-imported-recipe", version.id),
    render_recipe_revision: 1,
    intended_aspect_ratio: "16:9",
    mime_type: version.mime_type ?? "image/png",
    status: version.status === "ready" && !version.asset_path ? "recoverable_error" : version.status === "ready" ? "ready" : "failed",
    error_details: version.error ? { legacy_error: version.error } : null,
  };
}

function hydrateLegacy(metadata: Record<string, unknown>): EpisodePackageV3 {
  const legacy = hydrateEpisodePackageV2(metadata);
  const createdAt = importedTimestamp(metadata);
  const setIdentity = canonicalSerialize(legacy.thumbnail.concepts);
  const setId = deterministicUuid("thumbnail-imported-set", setIdentity);
  const strategy: ThumbnailCreativeStrategy = {
    id: deterministicUuid("thumbnail-imported-strategy", setIdentity), revision: 1, approved_script_version: 1,
    episode_promise: "Imported thumbnail strategy", intended_viewer: "Existing episode audience",
    curiosity_mechanism: "Imported visual direction", editorial_positioning: "Preserve the prior canonical thumbnail intent.",
    expectation_integrity: { truthful_connection: "Derived from the previously saved episode thumbnail concepts.", prohibited_exaggerations: [] },
    created_at: createdAt, provenance: { source: EPISODE_PACKAGE_V2_SCHEMA },
  };
  const briefs: ThumbnailCreativeBrief[] = legacy.thumbnail.concepts.map((concept, index) => ({
    id: deterministicUuid("thumbnail-imported-brief", canonicalSerialize({ setIdentity, index })), revision: 1,
    strategy_id: strategy.id, strategy_revision: strategy.revision, concept_slot: index + 1,
    subject_direction: concept.label || `Imported concept ${index + 1}`, focal_action: concept.prompt_text,
    composition_direction: concept.prompt_text, emotional_tone: concept.style_preset ?? "unspecified",
    visual_hierarchy: "Preserve the imported focal subject.", title_compatibility: "Compatible with a canonical framing title.",
    expectation_integrity_rationale: "Imported from the prior canonical episode package.",
    provider_neutral_render_direction: concept.prompt_text, subject_classification: "imported",
    composition_classification: "imported", dominant_colors: [], created_at: createdAt,
    provenance: { source: EPISODE_PACKAGE_V2_SCHEMA, legacy_concept_id: concept.id },
  }));
  const revisions = legacy.thumbnail.concepts.map((concept, index) => importConcept(concept, setId, strategy, briefs[index]!, index, createdAt));
  const conceptRevisionIds = revisions.map((entry) => entry.concept_revision_id);
  const baseVersions = legacy.thumbnail.versions.map((version) => importedBaseVersion(version, revisions));
  const primaryLegacy = legacy.thumbnail.versions.find((entry) => entry.id === legacy.thumbnail.primary_version_id);
  return {
    ...legacy,
    schema: EPISODE_PACKAGE_V3_SCHEMA,
    brand: { binding: null, application_history: [] },
    seo: { ...legacy.seo, titles: legacy.seo.titles.map((title) => ({ ...title, revision: 1 })) },
    thumbnail: {
      authority_version: THUMBNAIL_AUTHORITY_VERSION,
      creative_strategies: revisions.length ? [strategy] : [],
      active_creative_strategy_id: revisions.length ? strategy.id : null,
      creative_briefs: briefs,
      concept_sets: revisions.length ? [{
        id: setId,
        name: "Imported Concepts",
        created_at: createdAt,
        state: "active",
        approved_script_version: 1,
        generation_provenance: { source: EPISODE_PACKAGE_V2_SCHEMA },
        prompt_schema_version: "legacy-v2",
        source_response_hash: stableHex(setIdentity),
        concept_revision_ids: conceptRevisionIds,
      }] : [],
      concept_revisions: revisions,
      active_concept_set_id: revisions.length ? setId : null,
      render_recipes: [],
      active_render_recipe_id: null,
      composition_revisions: [],
      active_composition_revision_id: null,
      variation_batches: [],
      active_variation_batch_id: null,
      variation_promotions: [],
      base_versions: baseVersions,
      primary_base_version_id: primaryLegacy
        ? deterministicUuid("thumbnail-imported-base-version", primaryLegacy.id)
        : null,
      candidate_sets: [],
      active_candidate_set_id: null,
      launch_variant_revisions: importLaunchVariants(legacy.launch_variants, baseVersions, createdAt),
      publication_events: [],
    },
  };
}

function importLaunchVariants(legacy: EpisodeLaunchVariant[], bases: ThumbnailBaseVersion[], createdAt: string): ThumbnailLaunchVariantRevision[] {
  return legacy.flatMap((variant) => {
    const base = bases.find((entry) => entry.id === deterministicUuid("thumbnail-imported-base-version", variant.thumbnail_version_id));
    if (!base) return [];
    const legacyRecipeSnapshot: ThumbnailCompositeSnapshot["recipe_snapshot"] = {
      id: base.render_recipe_id, revision: 1, concept_revision_id: base.concept_revision_id,
      strategy_id: deterministicUuid("thumbnail-imported-strategy", base.concept_revision_id), strategy_revision: 1,
      creative_brief_id: deterministicUuid("thumbnail-imported-brief", base.concept_revision_id), creative_brief_revision: 1,
      title_id: variant.title_id, title_revision: 1, provider_id: base.provider_id,
      provider_settings: {},
      intended_aspect_ratio: base.intended_aspect_ratio, brand_template_id: null, brand_template_revision: null,
      title_text: "", treatment: { typography: {}, placement: {}, safe_zone: {}, shadow: {}, treatment: {} },
      prompt_template_version: "legacy-v2", composition_engine_version: "legacy-v2",
      composition_revision: 1,
      prompt_review_state: "needs_review", last_reviewed_template_version: null,
      created_at: variant.created_at || createdAt, updated_at: variant.updated_at || createdAt,
      template_revision: 1, text_color: "#FFFFFF", shadow_color: "#000000", shadow_opacity: 0.7,
      placement: "bottom", max_lines: 3, horizontal_padding_percent: 8,
    };
    return [{
      launch_variant_id: variant.id,
      revision: 1,
      supersedes_revision: null,
      base_version_id: base.id,
      concept_revision_id: base.concept_revision_id,
      title_id: variant.title_id,
      title_revision: 1,
      recipe_id: base.render_recipe_id,
      recipe_revision: 1,
      snapshot: {
        asset_id: base.asset_id,
        asset_path: base.asset_path,
        content_hash: base.content_hash,
        composition_engine_version: "legacy-v2",
        recipe_snapshot: legacyRecipeSnapshot,
        recipe_snapshot_hash: "",
        exported_at: variant.updated_at || createdAt,
      },
      status: variant.status,
      created_at: variant.created_at,
    }];
  });
}

export function hydrateEpisodePackageV3(metadata: Record<string, unknown>): EpisodePackageV3 {
  const episode = isRecord(metadata.episode) ? metadata.episode : metadata;
  if (episode.schema !== EPISODE_PACKAGE_V3_SCHEMA) return hydrateLegacy(metadata);
  const source = structuredClone(episode) as unknown as EpisodePackageV3;
  const thumbnail = source.thumbnail;
  const createdAt = importedTimestamp(metadata);
  const existingStrategies = Array.isArray(thumbnail.creative_strategies) ? thumbnail.creative_strategies : [];
  const existingBriefs = Array.isArray(thumbnail.creative_briefs) ? thumbnail.creative_briefs : [];
  const strategies = [...existingStrategies];
  const briefs = [...existingBriefs];
  const concepts = thumbnail.concept_revisions.map((concept, index) => {
    const partial = concept as ThumbnailConceptRevision & Partial<Pick<ThumbnailConceptRevision,
      "strategy_id" | "strategy_revision" | "creative_brief_id" | "creative_brief_revision">>;
    const set = thumbnail.concept_sets.find((entry) => entry.id === concept.concept_set_id);
    let strategy = strategies.find((entry) => entry.id === partial.strategy_id && entry.revision === partial.strategy_revision);
    if (!strategy) {
      const identity = set?.source_response_hash || set?.id || concept.concept_set_id;
      strategy = {
        id: deterministicUuid("thumbnail-v3-derived-strategy", identity), revision: 1,
        approved_script_version: set?.approved_script_version ?? 1,
        episode_promise: "Preserve the approved episode promise.", intended_viewer: "The intended episode audience.",
        curiosity_mechanism: "A truthful visual curiosity gap derived from the approved script.",
        editorial_positioning: "Present the episode clearly without unsupported exaggeration.",
        expectation_integrity: { truthful_connection: "Derived from the canonical concept set.", prohibited_exaggerations: [] },
        created_at: set?.created_at ?? concept.created_at ?? createdAt,
        provenance: { source: "v3_backward_compatible_hydration", concept_set_id: concept.concept_set_id },
      };
      if (!strategies.some((entry) => entry.id === strategy!.id && entry.revision === strategy!.revision)) strategies.push(strategy);
    }
    let brief = briefs.find((entry) => entry.id === partial.creative_brief_id && entry.revision === partial.creative_brief_revision);
    if (!brief) {
      brief = {
        id: deterministicUuid("thumbnail-v3-derived-brief", concept.concept_revision_id), revision: 1,
        strategy_id: strategy.id, strategy_revision: strategy.revision,
        concept_slot: Math.max(1, (set?.concept_revision_ids.indexOf(concept.concept_revision_id) ?? index) + 1),
        subject_direction: concept.headline, focal_action: concept.image_concept,
        composition_direction: concept.image_concept, emotional_tone: concept.mood_style,
        visual_hierarchy: "Make the primary subject immediately legible.",
        title_compatibility: "Reserve clean negative space for locally composed canonical typography.",
        expectation_integrity_rationale: "The visual direction remains grounded in the canonical concept.",
        provider_neutral_render_direction: concept.normalized_prompt_basis,
        subject_classification: "unspecified", composition_classification: "unspecified", dominant_colors: [],
        created_at: concept.created_at ?? createdAt,
        provenance: { source: "v3_backward_compatible_hydration", concept_revision_id: concept.concept_revision_id },
      };
      briefs.push(brief);
    }
    return { ...concept, strategy_id: strategy.id, strategy_revision: strategy.revision,
      creative_brief_id: brief.id, creative_brief_revision: brief.revision };
  });
  const recipes = thumbnail.render_recipes.map((recipe) => {
    const partial = recipe as ThumbnailRenderRecipe & Partial<Pick<ThumbnailRenderRecipe,
      "strategy_id" | "strategy_revision" | "creative_brief_id" | "creative_brief_revision" | "provider_settings" | "composition_revision">>;
    const concept = concepts.find((entry) => entry.concept_revision_id === recipe.concept_revision_id);
    return { ...recipe,
      strategy_id: partial.strategy_id ?? concept?.strategy_id ?? strategies[0]?.id ?? "",
      strategy_revision: partial.strategy_revision ?? concept?.strategy_revision ?? 1,
      creative_brief_id: partial.creative_brief_id ?? concept?.creative_brief_id ?? briefs[0]?.id ?? "",
      creative_brief_revision: partial.creative_brief_revision ?? concept?.creative_brief_revision ?? 1,
      provider_settings: partial.provider_settings ?? {}, composition_revision: partial.composition_revision ?? recipe.revision };
  });
  const existingCompositions = Array.isArray(thumbnail.composition_revisions) ? thumbnail.composition_revisions : [];
  const variationBatches = Array.isArray(thumbnail.variation_batches) ? thumbnail.variation_batches : [];
  const variationPromotions = Array.isArray(thumbnail.variation_promotions) ? thumbnail.variation_promotions : [];
  const compositions = existingCompositions.length ? existingCompositions : recipes.map((recipe) => {
    const serialized = canonicalSerialize({ recipe_id: recipe.id, recipe_revision: recipe.revision,
      composition_engine_version: recipe.composition_engine_version, title_id: recipe.title_id,
      title_revision: recipe.title_revision, title_text: recipe.title_text, treatment: recipe.treatment });
    return { id: deterministicUuid("thumbnail-v3-composition", `${recipe.id}:${recipe.revision}`), revision: recipe.composition_revision,
      render_recipe_id: recipe.id, render_recipe_revision: recipe.revision,
      composition_engine_version: recipe.composition_engine_version, title_id: recipe.title_id,
      title_revision: recipe.title_revision, title_text: recipe.title_text, treatment: recipe.treatment,
      canonical_serialized: serialized, content_hash: canonicalContentHash(serialized), created_at: recipe.updated_at };
  });
  return { ...source, brand: source.brand ?? { binding: null, application_history: [] }, thumbnail: { ...thumbnail, authority_version: THUMBNAIL_AUTHORITY_VERSION,
    creative_strategies: strategies, active_creative_strategy_id: thumbnail.active_creative_strategy_id ?? strategies.at(-1)?.id ?? null,
    creative_briefs: briefs, concept_revisions: concepts, render_recipes: recipes,
    composition_revisions: compositions,
    active_composition_revision_id: thumbnail.active_composition_revision_id
      ?? compositions.find((entry) => entry.render_recipe_id === thumbnail.active_render_recipe_id)?.id ?? null,
    variation_batches: variationBatches,
    active_variation_batch_id: thumbnail.active_variation_batch_id ?? variationBatches.at(-1)?.id ?? null,
    variation_promotions: variationPromotions,
    candidate_sets: Array.isArray(thumbnail.candidate_sets) ? thumbnail.candidate_sets : [],
    active_candidate_set_id: thumbnail.active_candidate_set_id ?? null } };
}

export function serializeEpisodePackageV3(pkg: EpisodePackageV3): EpisodePackageV3 {
  return { ...pkg, schema: EPISODE_PACKAGE_V3_SCHEMA };
}

export function validateConceptGenerationSet(concepts: readonly Omit<ThumbnailConceptRevision, "concept_set_id">[]): string[] {
  const errors: string[] = [];
  if (concepts.length !== 5) errors.push("A generation set must contain exactly five concepts.");
  const seen = { headline: new Set<string>(), image: new Set<string>(), basis: new Set<string>() };
  concepts.forEach((concept, index) => {
    const fields = [concept.headline, concept.image_concept, concept.mood_style, concept.normalized_prompt_basis];
    if (fields.some((field) => !field.trim())) errors.push(`Concept ${index + 1} is incomplete.`);
    if (fields.some((field) => /\b(todo|tbd|placeholder|lorem ipsum)\b/i.test(field) || /^concept\s*\d*$/i.test(field.trim()))) {
      errors.push(`Concept ${index + 1} contains placeholder content.`);
    }
    const identities = {
      headline: concept.headline.trim().toLowerCase().replace(/\s+/g, " "),
      image: concept.image_concept.trim().toLowerCase().replace(/\s+/g, " "),
      basis: concept.normalized_prompt_basis.trim().toLowerCase().replace(/\s+/g, " "),
    };
    if (seen.headline.has(identities.headline) || seen.image.has(identities.image) || seen.basis.has(identities.basis)) {
      errors.push(`Concept ${index + 1} duplicates another concept.`);
    }
    seen.headline.add(identities.headline); seen.image.add(identities.image); seen.basis.add(identities.basis);
  });
  return errors;
}

export function deriveThumbnailPromptPack(args: {
  recipe: ThumbnailRenderRecipe;
  concept: ThumbnailConceptRevision;
  strategy?: ThumbnailCreativeStrategy | null;
  brief?: ThumbnailCreativeBrief | null;
  templateVersion?: string;
}): DerivedThumbnailPromptPack {
  const templateVersion = args.templateVersion ?? THUMBNAIL_PROMPT_TEMPLATE_VERSION;
  const regenerated = args.recipe.prompt_template_version !== templateVersion;
  const payload = {
    serialization_version: THUMBNAIL_PROMPT_SERIALIZATION_VERSION,
    template_version: templateVersion,
    provider_id: args.recipe.provider_id,
    provider_settings: args.recipe.provider_settings,
    aspect_ratio: args.recipe.intended_aspect_ratio,
    authority: {
      strategy_id: args.recipe.strategy_id,
      strategy_revision: args.recipe.strategy_revision,
      creative_brief_id: args.recipe.creative_brief_id,
      creative_brief_revision: args.recipe.creative_brief_revision,
      concept_revision_id: args.recipe.concept_revision_id,
      render_recipe_id: args.recipe.id,
      render_recipe_revision: args.recipe.revision,
      composition_revision: args.recipe.composition_revision,
    },
    strategy: args.strategy ? {
      episode_promise: args.strategy.episode_promise,
      intended_viewer: args.strategy.intended_viewer,
      curiosity_mechanism: args.strategy.curiosity_mechanism,
      editorial_positioning: args.strategy.editorial_positioning,
      expectation_integrity: args.strategy.expectation_integrity,
    } : null,
    creative_brief: args.brief ? {
      subject_direction: args.brief.subject_direction,
      focal_action: args.brief.focal_action,
      composition_direction: args.brief.composition_direction,
      emotional_tone: args.brief.emotional_tone,
      visual_hierarchy: args.brief.visual_hierarchy,
      title_compatibility: args.brief.title_compatibility,
      expectation_integrity_rationale: args.brief.expectation_integrity_rationale,
      provider_neutral_render_direction: args.brief.provider_neutral_render_direction,
    } : null,
    creative: {
      headline: args.concept.headline,
      image_concept: args.concept.image_concept,
      mood_style: args.concept.mood_style,
      prompt_basis: args.concept.normalized_prompt_basis,
    },
    canonical_title: {
      id: args.recipe.title_id,
      revision: args.recipe.title_revision,
      text: args.recipe.title_text,
    },
    exclusions: ["all burned-in text", "unrequested text", "logos", "watermarks", "unsupported claims"],
  };
  const positive = [args.brief?.provider_neutral_render_direction, args.brief?.composition_direction,
    args.concept.normalized_prompt_basis, args.concept.image_concept, args.concept.mood_style,
    `Reserve composition space for the exact approved title applied by the compositor: ${args.recipe.title_text}`]
    .map((value) => value?.trim() ?? "").filter(Boolean).join(". ");
  const canonicalSerialized = canonicalSerialize(payload);
  return {
    template_version: templateVersion,
    review_state: regenerated ? "needs_review" : args.recipe.prompt_review_state,
    regenerated_under_newer_template: regenerated,
    provider_id: args.recipe.provider_id,
    intended_aspect_ratio: args.recipe.intended_aspect_ratio,
    positive_prompt: positive,
    negative_prompt: "all text, typography, letters, words, captions, logos, watermarks, unsupported claims",
    canonical_serialized: canonicalSerialized,
    canonical_hash: canonicalContentHash(canonicalSerialized),
    serialization_version: THUMBNAIL_PROMPT_SERIALIZATION_VERSION,
  };
}

export function nextTitleRevision(current: EpisodeSeoTitleV3, nextText: string, nextOverlay: string | null): EpisodeSeoTitleV3 {
  const changed = current.text !== nextText || (current.thumbnail_text ?? null) !== nextOverlay;
  return { ...current, text: nextText, thumbnail_text: nextOverlay, revision: changed ? current.revision + 1 : current.revision };
}
