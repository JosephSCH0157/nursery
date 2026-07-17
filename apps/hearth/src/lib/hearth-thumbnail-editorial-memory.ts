import { resolveForgeUserAccessToken } from "./hearth-chat-api";
import { canonicalContentHash, canonicalSerialize, type EpisodePackageV3, type ThumbnailCreativeBrief, type ThumbnailRenderRecipe } from "./episode-package-v3";

export type ThumbnailLaunchFact = {
  id: string;
  workpiece_id: string;
  launch_identity: string;
  launch_snapshot_hash: string;
  published_at: string | null;
  destination: string | null;
  fact_json: Record<string, unknown>;
  recorded_at: string;
};

export type ThumbnailMemoryInterpretation = {
  id: string;
  interpretation_key: string;
  revision: number;
  supersedes_id: string | null;
  observation_type: "fatigue" | "repetition" | "style_cluster" | "editorial_note";
  evidence_launch_identities: string[];
  interpretation_json: Record<string, unknown>;
  created_at: string;
};

export type ThumbnailMemoryProjection = {
  launchFacts: ThumbnailLaunchFact[];
  activeInterpretations: ThumbnailMemoryInterpretation[];
};

export type ThumbnailEditorialCritique = {
  measurements: Array<{ label: string; value: string }>;
  heuristicGuidance: string[];
  historicalObservations: string[];
};

function readConfig(): { url: string; anonKey: string } | null {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const runtime = typeof window === "undefined" ? null : window as Window & typeof globalThis & {
    __forgeSupabaseUrl?: string; __forgeSupabaseAnonKey?: string;
    __forge_supabase_client__?: { supabaseUrl?: string; supabaseKey?: string };
  };
  const url = env?.VITE_SUPABASE_URL ?? runtime?.__forgeSupabaseUrl ?? runtime?.__forge_supabase_client__?.supabaseUrl;
  const anonKey = env?.VITE_SUPABASE_ANON_KEY ?? runtime?.__forgeSupabaseAnonKey ?? runtime?.__forge_supabase_client__?.supabaseKey;
  return url?.trim() && anonKey?.trim() ? { url: url.trim(), anonKey: anonKey.trim() } : null;
}

async function rpc<T>(name: string, params: Record<string, unknown>): Promise<T> {
  const config = readConfig();
  const token = await resolveForgeUserAccessToken();
  if (!config || !token) throw new Error(!token ? "Sign in to load workspace thumbnail memory." : "Supabase config missing.");
  const response = await fetch(`${config.url}/rest/v1/rpc/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { apikey: config.anonKey, authorization: `Bearer ${token}`, "content-profile": "tongs", "accept-profile": "tongs", "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const payload = await response.json().catch(() => null) as T | { message?: string } | null;
  if (!response.ok) throw new Error(payload && typeof payload === "object" && "message" in payload && payload.message ? payload.message : `Thumbnail memory request failed (${response.status}).`);
  return payload as T;
}

function launchFact(pkg: EpisodePackageV3, workpieceId: string, launch: EpisodePackageV3["thumbnail"]["launch_variant_revisions"][number]) {
  const concept = pkg.thumbnail.concept_revisions.find((entry) => entry.concept_revision_id === launch.concept_revision_id) ?? null;
  const brief = concept ? pkg.thumbnail.creative_briefs.find((entry) => entry.id === concept.creative_brief_id && entry.revision === concept.creative_brief_revision) ?? null : null;
  const strategy = concept ? pkg.thumbnail.creative_strategies.find((entry) => entry.id === concept.strategy_id && entry.revision === concept.strategy_revision) ?? null : null;
  const recipe = pkg.thumbnail.render_recipes.find((entry) => entry.id === launch.recipe_id && entry.revision === launch.recipe_revision) ?? null;
  const base = pkg.thumbnail.base_versions.find((entry) => entry.id === launch.base_version_id) ?? null;
  const publication = pkg.thumbnail.publication_events.find((entry) => entry.launch_variant_id === launch.launch_variant_id && entry.launch_variant_revision === launch.revision) ?? null;
  const fact = {
    schema_version: "forge.thumbnail.launch-fact.v1", strategy_id: strategy?.id ?? null, strategy_revision: strategy?.revision ?? null,
    creative_brief_id: brief?.id ?? null, creative_brief_revision: brief?.revision ?? null,
    concept_revision_id: concept?.concept_revision_id ?? null, title_id: launch.title_id, title_revision: launch.title_revision,
    recipe_id: launch.recipe_id, recipe_revision: launch.recipe_revision, composition_revision: recipe?.composition_revision ?? null,
    base_version_id: base?.id ?? null, artwork_hash: base?.content_hash ?? null, launch_variant_id: launch.launch_variant_id,
    launch_variant_revision: launch.revision, launch_snapshot_hash: launch.snapshot.content_hash,
    subject_classification: brief?.subject_classification ?? "unspecified",
    composition_classification: brief?.composition_classification ?? "unspecified",
    dominant_colors: brief?.dominant_colors ?? [], typography_treatment: recipe?.treatment.typography ?? {},
    curiosity_mechanism: strategy?.curiosity_mechanism ?? null, platform: publication?.destination ?? null,
    published_at: publication?.published_at ?? null, created_at: launch.created_at,
  };
  return { identity: `${workpieceId}:${launch.launch_variant_id}:${launch.revision}:${launch.snapshot.content_hash}`, fact, publication };
}

export async function projectThumbnailLaunchFacts(args: { workspaceId: string; workpieceId: string; episodePackage: EpisodePackageV3 }) {
  for (const launch of args.episodePackage.thumbnail.launch_variant_revisions) {
    const projected = launchFact(args.episodePackage, args.workpieceId, launch);
    await rpc("append_thumbnail_launch_fact", { p_workspace_id: args.workspaceId, p_workpiece_id: args.workpieceId,
      p_launch_identity: projected.identity, p_launch_snapshot_hash: launch.snapshot.content_hash,
      p_published_at: projected.publication?.published_at ?? null, p_destination: projected.publication?.destination ?? null,
      p_fact_json: projected.fact });
  }
}

export async function loadThumbnailMemoryProjection(workspaceId: string): Promise<ThumbnailMemoryProjection> {
  const rows = await rpc<Array<{ launch_facts?: unknown; active_interpretations?: unknown }>>("list_thumbnail_memory_projection", { p_workspace_id: workspaceId, p_limit: 100 });
  const row = Array.isArray(rows) ? rows[0] : null;
  return { launchFacts: Array.isArray(row?.launch_facts) ? row.launch_facts as ThumbnailLaunchFact[] : [],
    activeInterpretations: Array.isArray(row?.active_interpretations) ? row.active_interpretations as ThumbnailMemoryInterpretation[] : [] };
}

export async function appendThumbnailMemoryInterpretation(args: { workspaceId: string; key: string; type: ThumbnailMemoryInterpretation["observation_type"];
  evidence: string[]; interpretation: Record<string, unknown> }) {
  return rpc("append_thumbnail_memory_interpretation", { p_workspace_id: args.workspaceId, p_interpretation_key: args.key,
    p_observation_type: args.type, p_evidence_launch_identities: args.evidence, p_interpretation_json: args.interpretation });
}

function stringField(fact: ThumbnailLaunchFact, key: string): string {
  const value = fact.fact_json[key]; return typeof value === "string" ? value : "unspecified";
}

export function critiqueThumbnailDirection(args: { projection: ThumbnailMemoryProjection; currentBrief: ThumbnailCreativeBrief | null; currentRecipe: ThumbnailRenderRecipe | null }): ThumbnailEditorialCritique {
  const facts = args.projection.launchFacts;
  const recent = facts.slice(0, 5);
  const subject = args.currentBrief?.subject_classification ?? "unspecified";
  const composition = args.currentBrief?.composition_classification ?? "unspecified";
  const subjectRepeats = subject === "unspecified" ? 0 : recent.filter((fact) => stringField(fact, "subject_classification") === subject).length;
  const compositionRepeats = composition === "unspecified" ? 0 : recent.filter((fact) => stringField(fact, "composition_classification") === composition).length;
  const colors = args.currentBrief?.dominant_colors ?? [];
  const colorRepeats = colors.length ? recent.filter((fact) => {
    const past = Array.isArray(fact.fact_json.dominant_colors) ? fact.fact_json.dominant_colors : [];
    return colors.some((color) => past.includes(color));
  }).length : 0;
  const typographyIdentity = args.currentRecipe ? canonicalContentHash(canonicalSerialize(args.currentRecipe.treatment.typography)) : null;
  const typographyRepeats = typographyIdentity ? recent.filter((fact) => canonicalContentHash(canonicalSerialize(fact.fact_json.typography_treatment ?? {})) === typographyIdentity).length : 0;
  const guidance: string[] = [];
  if (subjectRepeats >= 3) guidance.push(`The subject class “${subject}” appears in ${subjectRepeats} of the last ${recent.length} launches. Consider a different focal subject.`);
  if (compositionRepeats >= 3) guidance.push(`The composition class “${composition}” appears in ${compositionRepeats} recent launches. Vary framing or visual hierarchy.`);
  if (colorRepeats >= 3) guidance.push("The proposed dominant colors substantially repeat recent launch colors. Consider a controlled palette shift.");
  if (typographyRepeats >= 3) guidance.push("This typography treatment repeats across recent launches. A brand-safe alternate treatment may reduce visual fatigue.");
  const observations = args.projection.activeInterpretations.map((entry) => {
    const summary = entry.interpretation_json.summary;
    return typeof summary === "string" ? summary : `${entry.observation_type.replaceAll("_", " ")} interpretation revision ${entry.revision}`;
  });
  return { measurements: [
    { label: "Recent launches considered", value: String(recent.length) },
    { label: "Matching subject class", value: String(subjectRepeats) },
    { label: "Matching composition class", value: String(compositionRepeats) },
    { label: "Overlapping color launches", value: String(colorRepeats) },
    { label: "Matching typography treatment", value: String(typographyRepeats) },
  ], heuristicGuidance: guidance, historicalObservations: observations };
}
