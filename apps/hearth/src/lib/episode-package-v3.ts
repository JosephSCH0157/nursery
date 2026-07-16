import {
  EPISODE_PACKAGE_V2_SCHEMA,
  hydrateEpisodePackageV2,
  type EpisodeLaunchVariant,
  type EpisodePackageV2,
  type EpisodeSeoTitle,
  type EpisodeThumbnailConcept,
  type EpisodeThumbnailVersion,
} from "./episode-package-v2";

export const EPISODE_PACKAGE_V3_SCHEMA = "forge.episode.package.v3" as const;
export const THUMBNAIL_PROMPT_TEMPLATE_VERSION = "hearth-thumbnail-prompt-v1" as const;
export const THUMBNAIL_COMPOSITION_ENGINE_VERSION = "forge-thumbnail-compositor-v1" as const;

export type ThumbnailConceptRevision = {
  concept_lineage_id: string;
  concept_revision_id: string;
  revision_number: number;
  supersedes_revision_id: string | null;
  concept_set_id: string;
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

export type ThumbnailRenderRecipe = {
  id: string;
  revision: number;
  concept_revision_id: string;
  title_id: string;
  title_revision: number;
  provider_id: string;
  intended_aspect_ratio: "16:9" | "1:1" | "9:16";
  brand_template_id: string | null;
  brand_template_revision: number | null;
  title_text: string;
  treatment: ThumbnailTreatment;
  prompt_template_version: string;
  composition_engine_version: string;
  prompt_review_state: "unreviewed" | "reviewed" | "needs_review";
  last_reviewed_template_version: string | null;
  created_at: string;
  updated_at: string;
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
  seo: Omit<EpisodePackageV2["seo"], "titles"> & { titles: EpisodeSeoTitleV3[] };
  thumbnail: {
    concept_sets: ThumbnailConceptSet[];
    concept_revisions: ThumbnailConceptRevision[];
    active_concept_set_id: string | null;
    render_recipes: ThumbnailRenderRecipe[];
    active_render_recipe_id: string | null;
    base_versions: ThumbnailBaseVersion[];
    primary_base_version_id: string | null;
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
  const part = (n: number) => n.toString(16).padStart(8, "0");
  return `${part(a)}${part(b)}${part(a ^ 0xa5a5a5a5)}${part(b ^ 0x5a5a5a5a)}`;
}

export function deterministicUuid(namespace: string, identity: string): string {
  const hex = stableHex(`${namespace}\u0000${identity}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function importedTimestamp(metadata: Record<string, unknown>): string {
  const raw = typeof metadata.updated_at === "string" ? metadata.updated_at : null;
  return raw && Number.isFinite(Date.parse(raw)) ? new Date(raw).toISOString() : "1970-01-01T00:00:00.000Z";
}

function importConcept(concept: EpisodeThumbnailConcept, setId: string, index: number, createdAt: string): ThumbnailConceptRevision {
  const identity = canonicalSerialize({ concept, index });
  const lineageId = deterministicUuid("thumbnail-imported-lineage", identity);
  return {
    concept_lineage_id: lineageId,
    concept_revision_id: deterministicUuid("thumbnail-imported-revision", identity),
    revision_number: 1,
    supersedes_revision_id: null,
    concept_set_id: setId,
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
  const revisions = legacy.thumbnail.concepts.map((concept, index) => importConcept(concept, setId, index, createdAt));
  const conceptRevisionIds = revisions.map((entry) => entry.concept_revision_id);
  const baseVersions = legacy.thumbnail.versions.map((version) => importedBaseVersion(version, revisions));
  const primaryLegacy = legacy.thumbnail.versions.find((entry) => entry.id === legacy.thumbnail.primary_version_id);
  return {
    ...legacy,
    schema: EPISODE_PACKAGE_V3_SCHEMA,
    seo: { ...legacy.seo, titles: legacy.seo.titles.map((title) => ({ ...title, revision: 1 })) },
    thumbnail: {
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
      base_versions: baseVersions,
      primary_base_version_id: primaryLegacy
        ? deterministicUuid("thumbnail-imported-base-version", primaryLegacy.id)
        : null,
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
      title_id: variant.title_id, title_revision: 1, provider_id: base.provider_id,
      intended_aspect_ratio: base.intended_aspect_ratio, brand_template_id: null, brand_template_revision: null,
      title_text: "", treatment: { typography: {}, placement: {}, safe_zone: {}, shadow: {}, treatment: {} },
      prompt_template_version: "legacy-v2", composition_engine_version: "legacy-v2",
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
  return episode as unknown as EpisodePackageV3;
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
  templateVersion?: string;
}): DerivedThumbnailPromptPack {
  const templateVersion = args.templateVersion ?? THUMBNAIL_PROMPT_TEMPLATE_VERSION;
  const regenerated = args.recipe.prompt_template_version !== templateVersion;
  const payload = {
    template_version: templateVersion,
    provider_id: args.recipe.provider_id,
    aspect_ratio: args.recipe.intended_aspect_ratio,
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
    exclusions: ["unrequested text", "logos", "watermarks", "branding"],
  };
  const positive = [args.concept.normalized_prompt_basis, args.concept.image_concept, args.concept.mood_style,
    `Reserve composition space for the exact approved title applied by the compositor: ${args.recipe.title_text}`]
    .map((value) => value.trim()).filter(Boolean).join(". ");
  return {
    template_version: templateVersion,
    review_state: regenerated ? "needs_review" : args.recipe.prompt_review_state,
    regenerated_under_newer_template: regenerated,
    provider_id: args.recipe.provider_id,
    intended_aspect_ratio: args.recipe.intended_aspect_ratio,
    positive_prompt: positive,
    negative_prompt: "burned-in text, logos, watermarks, branding, altered title wording",
    canonical_serialized: canonicalSerialize(payload),
  };
}

export function nextTitleRevision(current: EpisodeSeoTitleV3, nextText: string, nextOverlay: string | null): EpisodeSeoTitleV3 {
  const changed = current.text !== nextText || (current.thumbnail_text ?? null) !== nextOverlay;
  return { ...current, text: nextText, thumbnail_text: nextOverlay, revision: changed ? current.revision + 1 : current.revision };
}
