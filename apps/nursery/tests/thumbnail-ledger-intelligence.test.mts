import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { classifyComparableWindow, deriveExpectationIntegrity, evaluateThumbnailExperimentEvidence, normalizeGenericThumbnailMetrics, THUMBNAIL_LEDGER_SCHEMA_VERSION } from "@forge/shared";

test("provider-neutral normalization preserves unavailable metrics as unknown", () => {
  const metrics = normalizeGenericThumbnailMetrics({ impressions: 1000, clicks: 50 });
  assert.equal(metrics.ctr, 0.05);
  assert.equal(metrics.retention_30_seconds, null);
  assert.equal(metrics.watch_time_seconds, null);
});

test("comparable windows distinguish provisional, mature, and incomparable evidence", () => {
  assert.equal(classifyComparableWindow({ kind: "first_24h", launchStartedAt: "2026-07-01T00:00:00Z", observedTo: "2026-07-01T12:00:00Z", impressions: 100 }).state, "provisional");
  assert.equal(classifyComparableWindow({ kind: "first_24h", launchStartedAt: "2026-07-01T00:00:00Z", observedTo: "2026-07-02T00:00:00Z", impressions: 100 }).state, "mature");
  assert.equal(classifyComparableWindow({ kind: "first_72h", launchStartedAt: "2026-07-02T00:00:00Z", observedTo: "2026-07-01T00:00:00Z", impressions: 100 }).state, "incomparable");
});

test("click gain paired with retention loss is advisory expectation-integrity evidence", () => {
  const result = deriveExpectationIntegrity({ ctrChange: 0.02, retentionChange: -0.08 });
  assert.equal(result.flagged, true);
  assert.match(result.summary, /may indicate/i);
  assert.doesNotMatch(result.summary, /guarantee|predict/i);
});

test("experiments never convert CTR direction into automatic publication authority", () => {
  const experiment = { schema_version: THUMBNAIL_LEDGER_SCHEMA_VERSION, identity: "experiment-1", workspace_id: "workspace-1", publication_id: "publication-1",
    hypothesis: "A clearer subject improves qualified clicks.", launch_snapshot_hashes: ["a".repeat(64), "b".repeat(64)], primary_metric: "ctr" as const,
    guardrail_metrics: ["retention_30_seconds" as const], window_kind: "first_72h" as const, stopping_conditions: ["window mature"], state: "completed" as const,
    created_at: "2026-07-17T00:00:00Z", content_hash: "c".repeat(64) };
  const result = evaluateThumbnailExperimentEvidence({ experiment, windowIds: ["one", "two"], comparable: true, contaminated: false, sampleSize: 4, primaryMetricDifference: 0.03, retentionGuardrailDifference: -0.1 });
  assert.equal(result.state, "directional"); assert.match(result.summary, /CTR alone cannot establish/i);
  assert.doesNotMatch(result.summary, /winner|publish|activate/i);
});

test("migration enforces append-only, RLS, idempotency, and immutable snapshot experiments", async () => {
  const sql = await readFile(new URL("../../../supabase/migrations/20260717130000_tongs_thumbnail_ledger_intelligence.sql", import.meta.url), "utf8");
  assert.match(sql, /enable row level security/g);
  assert.match(sql, /reject_thumbnail_ledger_mutation/);
  assert.match(sql, /provider_observation_id/);
  assert.match(sql, /launch_snapshot_hashes/);
  assert.match(sql, /cardinality\(launch_snapshot_hashes\) >= 2/);
  assert.match(sql, /assert_workspace_role/);
});

test("provider cursor recovery is append-only and workspace scoped", async () => {
  const sql = await readFile(new URL("../../../supabase/migrations/20260717133000_tongs_thumbnail_ledger_cursor_authority.sql", import.meta.url), "utf8");
  assert.match(sql, /append_thumbnail_ledger_ingestion_cursor/);
  assert.match(sql, /get_thumbnail_ledger_ingestion_cursor/);
  assert.match(sql, /count\(\*\)=0 then 'unavailable'/);
  assert.match(sql, /assert_workspace_role/);
});
