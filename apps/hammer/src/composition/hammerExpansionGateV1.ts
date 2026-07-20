import { hammerStableFingerprint, type HammerCompositionCommand, type HammerCompositionV2 } from "./hammerCompositionV2";

export type HammerPerformanceBudgetKeyV1 =
  | "long_form_startup_ms"
  | "seek_latency_ms"
  | "edit_latency_ms"
  | "save_acknowledgement_ms"
  | "memory_mb"
  | "analysis_incremental_ms"
  | "render_plan_compile_ms";

export type HammerPerformanceMeasurementsV1 = Readonly<Record<HammerPerformanceBudgetKeyV1, number>>;

export type HammerPerformanceBudgetRowV1 = Readonly<{
  key: HammerPerformanceBudgetKeyV1;
  measured: number;
  budget: number;
  passed: boolean;
  required_boundary: "none" | "virtualization" | "worker" | "bounded_cache";
}>;

export type HammerPerformanceBudgetReportV1 = Readonly<{
  schema_version: 1;
  budget_version: "hammer-performance-budgets.v1";
  rows: readonly HammerPerformanceBudgetRowV1[];
  passed: boolean;
  fingerprint: string;
}>;

export const HAMMER_PERFORMANCE_BUDGETS_V1: HammerPerformanceMeasurementsV1 = Object.freeze({
  long_form_startup_ms: 2_500,
  seek_latency_ms: 150,
  edit_latency_ms: 100,
  save_acknowledgement_ms: 1_200,
  memory_mb: 768,
  analysis_incremental_ms: 500,
  render_plan_compile_ms: 250,
});

function requiredBoundaryFor(key: HammerPerformanceBudgetKeyV1, passed: boolean): HammerPerformanceBudgetRowV1["required_boundary"] {
  if (passed) return "none";
  if (key === "long_form_startup_ms" || key === "memory_mb") return "virtualization";
  if (key === "analysis_incremental_ms" || key === "render_plan_compile_ms") return "worker";
  return "bounded_cache";
}

export function evaluateHammerPerformanceBudgetsV1(
  measurements: HammerPerformanceMeasurementsV1,
  budgets: HammerPerformanceMeasurementsV1 = HAMMER_PERFORMANCE_BUDGETS_V1,
): HammerPerformanceBudgetReportV1 {
  const rows = (Object.keys(budgets) as HammerPerformanceBudgetKeyV1[]).map((key) => {
    const measured = measurements[key];
    const budget = budgets[key];
    if (!Number.isFinite(measured) || measured < 0) throw new Error(`hammer_performance_measurement_invalid:${key}`);
    const passed = measured <= budget;
    return Object.freeze({ key, measured, budget, passed, required_boundary: requiredBoundaryFor(key, passed) });
  });
  const draft = Object.freeze({
    schema_version: 1 as const,
    budget_version: "hammer-performance-budgets.v1" as const,
    rows,
    passed: rows.every((row) => row.passed),
  });
  return Object.freeze({ ...draft, fingerprint: hammerStableFingerprint(draft) });
}

export type HammerBoundedCacheEntryV1<TValue> = Readonly<{
  cache_id: string;
  source_fingerprint: string;
  generator_version: string;
  value: TValue;
  byte_size: number;
  touched_at_ms: number;
}>;

export type HammerBoundedCacheV1<TValue> = Readonly<{
  schema_version: 1;
  max_entries: number;
  max_bytes: number;
  entries: readonly HammerBoundedCacheEntryV1<TValue>[];
}>;

export function createHammerBoundedCacheV1<TValue>(args: { maxEntries: number; maxBytes: number }): HammerBoundedCacheV1<TValue> {
  if (!Number.isInteger(args.maxEntries) || args.maxEntries < 1) throw new Error("hammer_cache_max_entries_invalid");
  if (!Number.isInteger(args.maxBytes) || args.maxBytes < 1) throw new Error("hammer_cache_max_bytes_invalid");
  return Object.freeze({ schema_version: 1 as const, max_entries: args.maxEntries, max_bytes: args.maxBytes, entries: [] });
}

export function hammerBoundedCacheKeyV1(args: { sourceFingerprint: string; generatorVersion: string; cacheId: string }): string {
  if (!args.sourceFingerprint || !args.generatorVersion || !args.cacheId) throw new Error("hammer_cache_identity_invalid");
  return `${args.sourceFingerprint}:${args.generatorVersion}:${args.cacheId}`;
}

function cacheSize<TValue>(entries: readonly HammerBoundedCacheEntryV1<TValue>[]): number {
  return entries.reduce((total, entry) => total + entry.byte_size, 0);
}

export function putHammerBoundedCacheEntryV1<TValue>(args: {
  cache: HammerBoundedCacheV1<TValue>;
  cacheId: string;
  sourceFingerprint: string;
  generatorVersion: string;
  value: TValue;
  byteSize: number;
  touchedAtMs: number;
}): HammerBoundedCacheV1<TValue> {
  if (!Number.isFinite(args.byteSize) || args.byteSize < 0) throw new Error("hammer_cache_byte_size_invalid");
  if (!Number.isFinite(args.touchedAtMs) || args.touchedAtMs < 0) throw new Error("hammer_cache_touched_at_invalid");
  const key = hammerBoundedCacheKeyV1({ sourceFingerprint: args.sourceFingerprint, generatorVersion: args.generatorVersion, cacheId: args.cacheId });
  const nextEntry = Object.freeze({
    cache_id: key,
    source_fingerprint: args.sourceFingerprint,
    generator_version: args.generatorVersion,
    value: args.value,
    byte_size: args.byteSize,
    touched_at_ms: args.touchedAtMs,
  });
  let entries = [nextEntry, ...args.cache.entries.filter((entry) => entry.cache_id !== key)].sort((a, b) => b.touched_at_ms - a.touched_at_ms || a.cache_id.localeCompare(b.cache_id));
  while (entries.length > args.cache.max_entries || cacheSize(entries) > args.cache.max_bytes) entries = entries.slice(0, -1);
  return Object.freeze({ ...args.cache, entries });
}

export function readHammerBoundedCacheEntryV1<TValue>(args: {
  cache: HammerBoundedCacheV1<TValue>;
  cacheId: string;
  sourceFingerprint: string;
  generatorVersion: string;
}): HammerBoundedCacheEntryV1<TValue> | null {
  const key = hammerBoundedCacheKeyV1({ sourceFingerprint: args.sourceFingerprint, generatorVersion: args.generatorVersion, cacheId: args.cacheId });
  return args.cache.entries.find((entry) => entry.cache_id === key) ?? null;
}

export function deleteHammerBoundedCacheEntryV1<TValue>(args: {
  cache: HammerBoundedCacheV1<TValue>;
  cacheId: string;
  sourceFingerprint: string;
  generatorVersion: string;
}): HammerBoundedCacheV1<TValue> {
  const key = hammerBoundedCacheKeyV1({ sourceFingerprint: args.sourceFingerprint, generatorVersion: args.generatorVersion, cacheId: args.cacheId });
  return Object.freeze({ ...args.cache, entries: args.cache.entries.filter((entry) => entry.cache_id !== key) });
}

export type HammerAiProposalKindV1 = "rough_cut" | "angle_suggestion" | "highlight" | "chapter" | "broll" | "cleanup" | "caption_correction";

export type HammerAiProposalV1 = Readonly<{
  schema_version: 1;
  proposal_id: string;
  kind: HammerAiProposalKindV1;
  workspace_id: string;
  workpiece_id: string;
  recording_revision_id: string;
  composition_id: string;
  composition_revision: number;
  composition_fingerprint: string;
  source_fingerprints: Readonly<Record<string, string>>;
  proposed_commands: readonly HammerCompositionCommand[];
  explanation: string;
  created_at: string;
  proposal_fingerprint: string;
}>;

function sourceFingerprintMap(composition: HammerCompositionV2): Readonly<Record<string, string>> {
  return Object.freeze(Object.fromEntries(composition.source_media.map((source) => [source.media_id, source.content_fingerprint])));
}

function sameSourceFingerprints(left: Readonly<Record<string, string>>, right: Readonly<Record<string, string>>): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
}

export function createHammerAiProposalV1(args: {
  proposalId: string;
  kind: HammerAiProposalKindV1;
  composition: HammerCompositionV2;
  proposedCommands: readonly HammerCompositionCommand[];
  explanation: string;
  createdAt: string;
}): HammerAiProposalV1 {
  if (!args.proposalId || !args.explanation.trim() || !args.createdAt) throw new Error("hammer_ai_proposal_incomplete");
  if (args.proposedCommands.length === 0) throw new Error("hammer_ai_proposal_empty");
  const draft = Object.freeze({
    schema_version: 1 as const,
    proposal_id: args.proposalId,
    kind: args.kind,
    workspace_id: args.composition.workspace_id,
    workpiece_id: args.composition.workpiece_id,
    recording_revision_id: args.composition.recording_revision_id,
    composition_id: args.composition.composition_id,
    composition_revision: args.composition.revision,
    composition_fingerprint: args.composition.fingerprint,
    source_fingerprints: sourceFingerprintMap(args.composition),
    proposed_commands: args.proposedCommands,
    explanation: args.explanation,
    created_at: args.createdAt,
  });
  return Object.freeze({ ...draft, proposal_fingerprint: hammerStableFingerprint(draft) });
}

export function acceptHammerAiProposalV1(args: { composition: HammerCompositionV2; proposal: HammerAiProposalV1 }): readonly HammerCompositionCommand[] {
  const proposal = args.proposal;
  if (
    proposal.workspace_id !== args.composition.workspace_id
    || proposal.workpiece_id !== args.composition.workpiece_id
    || proposal.recording_revision_id !== args.composition.recording_revision_id
    || proposal.composition_id !== args.composition.composition_id
  ) throw new Error("hammer_ai_proposal_identity_mismatch");
  if (proposal.composition_revision !== args.composition.revision || proposal.composition_fingerprint !== args.composition.fingerprint) throw new Error("hammer_ai_proposal_stale");
  if (!sameSourceFingerprints(proposal.source_fingerprints, sourceFingerprintMap(args.composition))) throw new Error("hammer_ai_proposal_source_mismatch");
  const { proposal_fingerprint: _fingerprint, ...seed } = proposal;
  if (hammerStableFingerprint(seed) !== proposal.proposal_fingerprint) throw new Error("hammer_ai_proposal_fingerprint_mismatch");
  return proposal.proposed_commands;
}

export const HAMMER_PERMANENT_EXPANSION_RULES_V1 = Object.freeze([
  "one_composition_v2_and_one_history_path",
  "immutable_source_identity",
  "no_browser_acknowledgement",
  "no_unguarded_shared_write",
  "no_preview_export_side_authority",
  "no_additional_face_matte_transcript_caption_or_placement_representation",
  "complete_test_discovery_strict_compile_coverage_lint_build_bundle_and_mounted_workflow_proof",
] as const);

export type HammerExpansionGateReportV1 = Readonly<{
  schema_version: 1;
  gate_version: "hammer-permanent-expansion-gate.v1";
  rules: typeof HAMMER_PERMANENT_EXPANSION_RULES_V1;
  performance_passed: boolean;
  ai_proposal_only: boolean;
  bounded_cache_deletion_proven: boolean;
  preview_render_parity_proven: boolean;
  full_program_fixture_proven: boolean;
  migration_rls_disposition: "none_required" | "implemented";
  explicit_deferrals: readonly string[];
  passed: boolean;
  fingerprint: string;
}>;

export function auditHammerPermanentExpansionGateV1(args: {
  performance: HammerPerformanceBudgetReportV1;
  aiProposalOnly: boolean;
  boundedCacheDeletionProven: boolean;
  previewRenderParityProven: boolean;
  fullProgramFixtureProven: boolean;
  migrationRlsDisposition: "none_required" | "implemented";
  explicitDeferrals: readonly string[];
}): HammerExpansionGateReportV1 {
  const draft = Object.freeze({
    schema_version: 1 as const,
    gate_version: "hammer-permanent-expansion-gate.v1" as const,
    rules: HAMMER_PERMANENT_EXPANSION_RULES_V1,
    performance_passed: args.performance.passed,
    ai_proposal_only: args.aiProposalOnly,
    bounded_cache_deletion_proven: args.boundedCacheDeletionProven,
    preview_render_parity_proven: args.previewRenderParityProven,
    full_program_fixture_proven: args.fullProgramFixtureProven,
    migration_rls_disposition: args.migrationRlsDisposition,
    explicit_deferrals: args.explicitDeferrals,
    passed: args.performance.passed && args.aiProposalOnly && args.boundedCacheDeletionProven && args.previewRenderParityProven && args.fullProgramFixtureProven,
  });
  return Object.freeze({ ...draft, fingerprint: hammerStableFingerprint(draft) });
}
