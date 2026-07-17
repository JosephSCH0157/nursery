import type {
  ThumbnailCreativeFeatureProjection, ThumbnailHistoricalObservation, ThumbnailLaunchAttribution, ThumbnailLaunchExperiment, ThumbnailLedgerAnalysis, ThumbnailPerformanceMetrics,
  ThumbnailPerformanceObservation, ThumbnailWindowKind,
} from "@forge/shared";
import { THUMBNAIL_LEDGER_SCHEMA_VERSION } from "@forge/shared";
import { THUMBNAIL_ANALYSIS_VERSION, THUMBNAIL_FEATURE_PROJECTION_VERSION } from "@forge/shared";
import { normalizeGenericThumbnailMetrics } from "@forge/shared";
import { tongsSupabase } from "./supabase";

export type ProviderThumbnailMetricEnvelope = {
  provider: string; providerSchemaVersion: string; providerObservationId: string; publicationId: string;
  observedFrom: string; observedTo: string; collectedAt: string; timezone: string;
  trafficSource?: string | null; audienceSegment?: string | null; raw: Record<string, unknown>;
};

export interface ThumbnailMetricsProviderAdapter<T extends ProviderThumbnailMetricEnvelope = ProviderThumbnailMetricEnvelope> {
  readonly provider: string;
  normalize(envelope: T): ThumbnailPerformanceMetrics;
}

export const genericThumbnailMetricsAdapter: ThumbnailMetricsProviderAdapter = {
  provider: "generic",
  normalize(envelope) { return normalizeGenericThumbnailMetrics(envelope.raw); },
};

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`).join(",")}}`;
  return JSON.stringify(value);
}

export async function contentHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableSerialize(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

type RpcClient = { rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
const rpcClient = tongsSupabase as unknown as RpcClient;

async function rpc(name: string, params: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await rpcClient.rpc(name, params);
  if (error) throw new Error(error.message);
  return data;
}

export async function recordThumbnailLaunchInterval(args: { attribution: ThumbnailLaunchAttribution; state?: "active" | "restored"; startedAt: string }) {
  return rpc("append_thumbnail_launch_interval", { p_workspace_id: args.attribution.workspace_id, p_workpiece_id: args.attribution.workpiece_id,
    p_publication_id: args.attribution.publication_id, p_launch_identity: args.attribution.launch_identity,
    p_launch_snapshot_hash: args.attribution.launch_snapshot_hash, p_platform: args.attribution.platform,
    p_state: args.state ?? "active", p_started_at: args.startedAt, p_attribution_json: args.attribution, p_content_hash: args.attribution.content_hash });
}

export async function projectThumbnailCreativeFeatures(args: { workspaceId: string; launchIdentity: string; launchFact: Record<string, unknown> }): Promise<ThumbnailCreativeFeatureProjection> {
  const recipe = typeof args.launchFact.recipe_id === "string" ? `${args.launchFact.recipe_id}:${String(args.launchFact.recipe_revision ?? 1)}` : "unknown";
  const basis = { launchIdentity: args.launchIdentity, projectionVersion: THUMBNAIL_FEATURE_PROJECTION_VERSION, launchFact: args.launchFact };
  const projection: ThumbnailCreativeFeatureProjection = {
    schema_version: THUMBNAIL_LEDGER_SCHEMA_VERSION, identity: await contentHash(basis), workspace_id: args.workspaceId,
    launch_identity: args.launchIdentity, projection_version: THUMBNAIL_FEATURE_PROJECTION_VERSION,
    measured: {}, recipe_derived: { subject: args.launchFact.subject_classification ?? "unspecified",
      composition: args.launchFact.composition_classification ?? "unspecified", typography: args.launchFact.typography_treatment ?? {},
      dominant_colors: args.launchFact.dominant_colors ?? [], curiosity_mechanism: args.launchFact.curiosity_mechanism ?? null },
    model_interpretations: {}, human_interpretations: {}, strategy_lineage: typeof args.launchFact.strategy_id === "string" ? `${args.launchFact.strategy_id}:${String(args.launchFact.strategy_revision ?? 1)}` : null,
    concept_lineage: typeof args.launchFact.concept_revision_id === "string" ? args.launchFact.concept_revision_id : null,
    render_recipe_lineage: recipe, content_hash: await contentHash(basis),
  };
  await appendLedgerAnalysis({ workspaceId: args.workspaceId, identity: projection.identity, type: "creative_projection", launchIdentities: [args.launchIdentity], observationIds: [], evidenceClass: "measured_fact", confidence: "high", value: projection, contentHash: projection.content_hash });
  return projection;
}

export async function appendHistoricalThumbnailObservation(args: Omit<ThumbnailHistoricalObservation, "schema_version" | "identity" | "analysis_version" | "created_at" | "content_hash"> & { workspaceId: string }): Promise<ThumbnailHistoricalObservation> {
  const createdAt = new Date().toISOString();
  const { workspaceId, ...observationInput } = args;
  const basis = { ...observationInput, analysisVersion: THUMBNAIL_ANALYSIS_VERSION };
  const identity = await contentHash(basis);
  const observation: ThumbnailHistoricalObservation = { schema_version: THUMBNAIL_LEDGER_SCHEMA_VERSION, identity, workspace_id: args.workspaceId,
    evidence_class: args.evidence_class, observation_type: args.observation_type, summary: args.summary,
    supporting_launch_identities: args.supporting_launch_identities, comparable_window_ids: args.comparable_window_ids,
    sample_size: args.sample_size, confidence: args.confidence, metric_values: args.metric_values, limitations: args.limitations,
    analysis_version: THUMBNAIL_ANALYSIS_VERSION, created_at: createdAt, content_hash: await contentHash(basis) };
  await appendLedgerAnalysis({ workspaceId: args.workspaceId, identity, type: observation.observation_type === "expectation_integrity" ? "expectation_integrity" : "historical_observation",
    launchIdentities: observation.supporting_launch_identities, observationIds: [], evidenceClass: observation.evidence_class,
    confidence: observation.confidence, value: observation, contentHash: observation.content_hash });
  return observation;
}

async function appendLedgerAnalysis(args: { workspaceId: string; identity: string; type: string; launchIdentities: string[]; observationIds: string[];
  evidenceClass: string; confidence: string; value: object; contentHash: string }) {
  return rpc("append_thumbnail_ledger_analysis", { p_workspace_id: args.workspaceId, p_analysis_identity: args.identity, p_analysis_type: args.type,
    p_launch_identities: args.launchIdentities, p_observation_ids: args.observationIds, p_analysis_version: THUMBNAIL_ANALYSIS_VERSION,
    p_evidence_class: args.evidenceClass, p_confidence: args.confidence, p_analysis_json: args.value, p_content_hash: args.contentHash });
}

export async function ingestThumbnailObservation(args: { workspaceId: string; envelope: ProviderThumbnailMetricEnvelope;
  adapter?: ThumbnailMetricsProviderAdapter; supersedesObservationId?: string | null }): Promise<ThumbnailPerformanceObservation> {
  const adapter = args.adapter ?? genericThumbnailMetricsAdapter;
  if (adapter.provider !== "generic" && adapter.provider !== args.envelope.provider) throw new Error("Provider adapter does not match the observation envelope.");
  const metrics = adapter.normalize(args.envelope);
  const sourcePayloadHash = await contentHash(args.envelope.raw);
  const basis = { ...args.envelope, metrics, sourcePayloadHash, supersedesObservationId: args.supersedesObservationId ?? null };
  const observation: ThumbnailPerformanceObservation = {
    schema_version: THUMBNAIL_LEDGER_SCHEMA_VERSION, identity: await contentHash(basis), workspace_id: args.workspaceId,
    publication_id: args.envelope.publicationId, provider: args.envelope.provider, provider_schema_version: args.envelope.providerSchemaVersion,
    provider_observation_id: args.envelope.providerObservationId, supersedes_observation_id: args.supersedesObservationId ?? null,
    source_payload_hash: sourcePayloadHash, observed_from: args.envelope.observedFrom, observed_to: args.envelope.observedTo,
    collected_at: args.envelope.collectedAt, timezone: args.envelope.timezone, traffic_source: args.envelope.trafficSource ?? null,
    audience_segment: args.envelope.audienceSegment ?? null, metrics, content_hash: await contentHash(basis),
  };
  await rpc("ingest_thumbnail_performance_observation", { p_workspace_id: args.workspaceId, p_publication_id: observation.publication_id,
    p_provider: observation.provider, p_provider_schema_version: observation.provider_schema_version, p_provider_observation_id: observation.provider_observation_id,
    p_supersedes_observation_id: observation.supersedes_observation_id, p_source_payload_hash: observation.source_payload_hash,
    p_observed_from: observation.observed_from, p_observed_to: observation.observed_to, p_collected_at: observation.collected_at,
    p_timezone: observation.timezone, p_traffic_source: observation.traffic_source, p_audience_segment: observation.audience_segment,
    p_metrics_json: observation.metrics, p_raw_observation: args.envelope.raw, p_content_hash: observation.content_hash });
  await rpc("append_thumbnail_ledger_ingestion_cursor", { p_workspace_id: args.workspaceId, p_provider: observation.provider,
    p_publication_id: observation.publication_id, p_cursor_identity: observation.provider_observation_id,
    p_cursor_json: { provider_observation_id: observation.provider_observation_id, observed_to: observation.observed_to },
    p_status: "current", p_last_success_at: observation.collected_at, p_last_error: null });
  return observation;
}

export async function loadThumbnailIngestionCursor(args: { workspaceId: string; provider: string; publicationId: string }) {
  return rpc("get_thumbnail_ledger_ingestion_cursor", { p_workspace_id: args.workspaceId, p_provider: args.provider, p_publication_id: args.publicationId });
}

export async function appendQuenchThumbnailExperiment(args: { workspaceId: string; publicationId: string; hypothesis: string;
  launchSnapshotHashes: string[]; primaryMetric: keyof ThumbnailPerformanceMetrics; guardrails: Array<keyof ThumbnailPerformanceMetrics>;
  windowKind: ThumbnailWindowKind; stoppingConditions: string[]; state?: ThumbnailLaunchExperiment["state"] }): Promise<ThumbnailLaunchExperiment> {
  if (new Set(args.launchSnapshotHashes).size < 2) throw new Error("An experiment requires at least two distinct immutable launch snapshots.");
  const createdAt = new Date().toISOString();
  const basis = { publicationId: args.publicationId, hypothesis: args.hypothesis.trim(), launchSnapshotHashes: [...new Set(args.launchSnapshotHashes)].sort(), primaryMetric: args.primaryMetric, guardrails: args.guardrails, windowKind: args.windowKind, stoppingConditions: args.stoppingConditions };
  const identity = await contentHash(basis);
  const experiment: ThumbnailLaunchExperiment = { schema_version: THUMBNAIL_LEDGER_SCHEMA_VERSION, identity, workspace_id: args.workspaceId,
    publication_id: args.publicationId, hypothesis: basis.hypothesis, launch_snapshot_hashes: basis.launchSnapshotHashes,
    primary_metric: args.primaryMetric, guardrail_metrics: args.guardrails, window_kind: args.windowKind,
    stopping_conditions: args.stoppingConditions, state: args.state ?? "draft", created_at: createdAt, content_hash: await contentHash({ ...basis, state: args.state ?? "draft" }) };
  await rpc("append_thumbnail_launch_experiment", { p_workspace_id: args.workspaceId, p_publication_id: args.publicationId,
    p_experiment_identity: identity, p_launch_snapshot_hashes: experiment.launch_snapshot_hashes, p_hypothesis: experiment.hypothesis,
    p_primary_metric: experiment.primary_metric, p_guardrail_metrics: experiment.guardrail_metrics, p_window_kind: experiment.window_kind,
    p_stopping_conditions: experiment.stopping_conditions, p_state: experiment.state, p_experiment_json: experiment, p_content_hash: experiment.content_hash });
  return experiment;
}

export async function loadThumbnailLedgerIntelligence(workspaceId: string): Promise<{ launchIntervals: unknown[]; performanceObservations: unknown[]; analyses: unknown[]; experiments: unknown[]; analysis: ThumbnailLedgerAnalysis }> {
  const data = await rpc("list_thumbnail_ledger_intelligence", { p_workspace_id: workspaceId, p_limit: 200 }) as Array<Record<string, unknown>> | null;
  const row = data?.[0] ?? {};
  const analyses = Array.isArray(row.analyses) ? row.analyses as Array<Record<string, unknown>> : [];
  const classified = (kind: string) => analyses.map((entry) => entry.analysis_json).filter((entry): entry is ThumbnailLedgerAnalysis["measured_facts"][number] => Boolean(entry && typeof entry === "object" && typeof (entry as { summary?: unknown }).summary === "string" && (entry as { evidence_class?: string }).evidence_class === kind));
  const freshness = row.freshness && typeof row.freshness === "object" ? row.freshness as ThumbnailLedgerAnalysis["freshness"] : { last_collected_at: null, state: "unavailable" as const };
  return { launchIntervals: Array.isArray(row.launch_intervals) ? row.launch_intervals : [], performanceObservations: Array.isArray(row.performance_observations) ? row.performance_observations : [], analyses, experiments: Array.isArray(row.experiments) ? row.experiments : [], analysis: {
    measured_facts: classified("measured_fact"), historical_observations: classified("historical_observation"),
    heuristic_guidance: classified("heuristic_guidance"), unknowns_and_limitations: classified("unknown_limitation"), freshness,
  } };
}
