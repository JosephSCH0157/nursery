export const THUMBNAIL_LEDGER_SCHEMA_VERSION = "forge.thumbnail-ledger.v1" as const;
export const THUMBNAIL_FEATURE_PROJECTION_VERSION = "forge.thumbnail-features.v1" as const;
export const THUMBNAIL_ANALYSIS_VERSION = "forge.thumbnail-analysis.v1" as const;

export type ThumbnailEvidenceConfidence = "insufficient" | "low" | "moderate" | "high";
export type ThumbnailWindowKind = "first_24h" | "first_72h" | "first_7d" | "equal_impressions" | "traffic_source";
export type ThumbnailEvidenceClass = "measured_fact" | "historical_observation" | "heuristic_guidance" | "unknown_limitation";

export type ThumbnailLaunchAttribution = {
  schema_version: typeof THUMBNAIL_LEDGER_SCHEMA_VERSION;
  identity: string; workspace_id: string; workpiece_id: string; publication_id: string;
  launch_identity: string; launch_snapshot_hash: string; platform: string;
  strategy_id: string | null; strategy_revision: number | null;
  creative_brief_id: string | null; creative_brief_revision: number | null;
  concept_revision_id: string | null; title_id: string; title_revision: number;
  recipe_id: string; recipe_revision: number; artwork_id: string | null; composition_revision: number;
  content_hash: string;
};

export type ThumbnailLaunchInterval = {
  schema_version: typeof THUMBNAIL_LEDGER_SCHEMA_VERSION;
  identity: string; workspace_id: string; publication_id: string; launch_identity: string;
  state: "active" | "replaced" | "retired" | "restored";
  started_at: string; ended_at: string | null; predecessor_interval_id: string | null; content_hash: string;
};

export type ThumbnailPerformanceMetrics = {
  impressions: number | null; clicks: number | null; ctr: number | null; watch_time_seconds: number | null;
  retention_30_seconds: number | null; retention_60_seconds: number | null; average_percentage_viewed: number | null;
};

export function normalizeGenericThumbnailMetrics(row: Record<string, unknown>): ThumbnailPerformanceMetrics {
  const numberOrNull = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
  const impressions = numberOrNull(row.impressions); const clicks = numberOrNull(row.clicks);
  return { impressions, clicks, ctr: numberOrNull(row.ctr) ?? (impressions && clicks !== null ? clicks / impressions : null),
    watch_time_seconds: numberOrNull(row.watch_time_seconds), retention_30_seconds: numberOrNull(row.retention_30_seconds),
    retention_60_seconds: numberOrNull(row.retention_60_seconds), average_percentage_viewed: numberOrNull(row.average_percentage_viewed) };
}

export type ThumbnailPerformanceObservation = {
  schema_version: typeof THUMBNAIL_LEDGER_SCHEMA_VERSION;
  identity: string; workspace_id: string; publication_id: string; provider: string; provider_schema_version: string;
  provider_observation_id: string; supersedes_observation_id: string | null; source_payload_hash: string;
  observed_from: string; observed_to: string; collected_at: string; timezone: string;
  traffic_source: string | null; audience_segment: string | null; metrics: ThumbnailPerformanceMetrics;
  content_hash: string;
};

export type ThumbnailComparableWindow = {
  schema_version: typeof THUMBNAIL_LEDGER_SCHEMA_VERSION;
  identity: string; workspace_id: string; launch_identity: string; observation_ids: string[];
  kind: ThumbnailWindowKind; definition_version: string; state: "provisional" | "mature" | "incomparable";
  normalized_metrics: ThumbnailPerformanceMetrics; limitations: string[]; content_hash: string;
};

export type ThumbnailCreativeFeatureProjection = {
  schema_version: typeof THUMBNAIL_LEDGER_SCHEMA_VERSION;
  identity: string; workspace_id: string; launch_identity: string; projection_version: string;
  measured: Record<string, unknown>; recipe_derived: Record<string, unknown>;
  model_interpretations: Record<string, unknown>; human_interpretations: Record<string, unknown>;
  strategy_lineage: string | null; concept_lineage: string | null; render_recipe_lineage: string;
  content_hash: string;
};

export type ThumbnailHistoricalObservation = {
  schema_version: typeof THUMBNAIL_LEDGER_SCHEMA_VERSION;
  identity: string; workspace_id: string; evidence_class: ThumbnailEvidenceClass;
  observation_type: "strong_treatment" | "weak_treatment" | "repetition" | "fatigue" | "expectation_integrity" | "insufficient_evidence";
  summary: string; supporting_launch_identities: string[]; comparable_window_ids: string[];
  sample_size: number; confidence: ThumbnailEvidenceConfidence; metric_values: Record<string, number | null>;
  limitations: string[]; analysis_version: string; created_at: string; content_hash: string;
};

export type ThumbnailExpectationIntegrityObservation = ThumbnailHistoricalObservation & {
  observation_type: "expectation_integrity";
  click_change: number | null; retention_change: number | null; editorial_review_required: true;
};

export type ThumbnailLaunchExperiment = {
  schema_version: typeof THUMBNAIL_LEDGER_SCHEMA_VERSION;
  identity: string; workspace_id: string; publication_id: string; hypothesis: string;
  launch_snapshot_hashes: string[]; primary_metric: keyof ThumbnailPerformanceMetrics;
  guardrail_metrics: Array<keyof ThumbnailPerformanceMetrics>; window_kind: ThumbnailWindowKind;
  stopping_conditions: string[]; state: "draft" | "active" | "completed" | "aborted"; created_at: string; content_hash: string;
};

export type ThumbnailExperimentResult = {
  schema_version: typeof THUMBNAIL_LEDGER_SCHEMA_VERSION;
  identity: string; experiment_id: string; state: "directional" | "inconclusive" | "contaminated" | "insufficient" | "aborted";
  window_ids: string[]; summary: string; confidence: ThumbnailEvidenceConfidence; limitations: string[];
  analysis_version: string; created_at: string; content_hash: string;
};

export type ThumbnailLedgerAnalysis = {
  measured_facts: ThumbnailHistoricalObservation[];
  historical_observations: ThumbnailHistoricalObservation[];
  heuristic_guidance: ThumbnailHistoricalObservation[];
  unknowns_and_limitations: ThumbnailHistoricalObservation[];
  freshness: { last_collected_at: string | null; state: "current" | "stale" | "disconnected" | "unavailable" };
};

export function classifyComparableWindow(args: { kind: ThumbnailWindowKind; launchStartedAt: string; observedTo: string; impressions: number | null; targetImpressions?: number }): Pick<ThumbnailComparableWindow, "state" | "limitations"> {
  const elapsed = Date.parse(args.observedTo) - Date.parse(args.launchStartedAt);
  if (!Number.isFinite(elapsed) || elapsed < 0) return { state: "incomparable", limitations: ["Observation interval does not follow launch activation."] };
  const requiredMs = args.kind === "first_24h" ? 86_400_000 : args.kind === "first_72h" ? 259_200_000 : args.kind === "first_7d" ? 604_800_000 : null;
  if (requiredMs !== null && elapsed < requiredMs) return { state: "provisional", limitations: ["The evidence window is incomplete."] };
  if (args.kind === "equal_impressions" && (args.impressions === null || args.impressions < (args.targetImpressions ?? 1))) return { state: "provisional", limitations: ["The equal-impression threshold has not been reached."] };
  return { state: "mature", limitations: [] };
}

export function deriveExpectationIntegrity(args: { ctrChange: number | null; retentionChange: number | null }): { flagged: boolean; summary: string } {
  const flagged = args.ctrChange !== null && args.retentionChange !== null && args.ctrChange > 0 && args.retentionChange < 0;
  return { flagged, summary: flagged
    ? "Clicks improved while early retention weakened. This may indicate an expectation mismatch and requires editorial review."
    : "Available click and retention evidence does not show an expectation-integrity conflict." };
}

export function evaluateThumbnailExperimentEvidence(args: { experiment: ThumbnailLaunchExperiment; windowIds: string[];
  comparable: boolean; contaminated: boolean; sampleSize: number; primaryMetricDifference: number | null; retentionGuardrailDifference: number | null }): Omit<ThumbnailExperimentResult, "identity" | "created_at" | "content_hash"> {
  const limitations: string[] = [];
  if (args.contaminated) limitations.push("Launch intervals overlap or audience attribution is contaminated.");
  if (!args.comparable) limitations.push("The candidate evidence windows are not comparable.");
  if (args.sampleSize < 2) limitations.push("There is insufficient mature evidence for a directional result.");
  const state = args.experiment.state === "aborted" ? "aborted" : args.contaminated ? "contaminated" : !args.comparable || args.sampleSize < 2 ? "insufficient" : args.primaryMetricDifference === null ? "inconclusive" : "directional";
  const guardrail = args.retentionGuardrailDifference !== null && args.retentionGuardrailDifference < 0
    ? " The retention guardrail weakened, so CTR alone cannot establish a preferred launch." : "";
  return { schema_version: THUMBNAIL_LEDGER_SCHEMA_VERSION, experiment_id: args.experiment.identity, state,
    window_ids: args.windowIds, summary: state === "directional" ? `The comparable historical window has a directional primary-metric difference.${guardrail}` : "The experiment does not contain sufficient clean evidence for a directional conclusion.",
    confidence: state === "directional" && args.sampleSize >= 4 ? "moderate" : "insufficient", limitations,
    analysis_version: THUMBNAIL_ANALYSIS_VERSION };
}
