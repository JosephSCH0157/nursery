import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLedgerSummary,
  classifyToolBucket,
  computeAvgCostPerEpisode,
  computeTopFeature,
  filterLedgerEventsByRange,
} from "../src/lib/ledger-costs";

test("classifyToolBucket maps known lanes", () => {
  assert.equal(classifyToolBucket("thumbnail_generate", null), "quench");
  assert.equal(classifyToolBucket("speech_transcription", "hammer_prep_nonbillable"), "hammer");
  assert.equal(classifyToolBucket("script_assist", "chat"), "hearth");
});

test("buildLedgerSummary returns stable non-negative totals", () => {
  const summary = buildLedgerSummary([
    {
      created_at: "2026-04-02T10:10:00.000Z",
      feature: "script_assist",
      subfeature: "chat",
      actual_cost_usd: 0.12,
      workpiece_id: "episode-a",
    },
    {
      created_at: "2026-04-02T11:10:00.000Z",
      feature: "thumbnail_generate",
      subfeature: "concept_render",
      actual_cost_usd: 0.2,
      workpiece_id: "episode-b",
    },
    {
      created_at: "2026-04-01T11:10:00.000Z",
      feature: "speech_transcription",
      subfeature: "hammer_prep_nonbillable",
      actual_cost_usd: 0.08,
      workpiece_id: "episode-a",
    },
  ], new Date("2026-04-02T20:00:00.000Z"));

  assert.equal(summary.costTodayUsd, 0.32);
  assert.equal(summary.costByToolUsd.hearth, 0.12);
  assert.equal(summary.costByToolUsd.hammer, 0.08);
  assert.equal(summary.costByToolUsd.quench, 0.2);
  assert.equal(summary.totalCostUsd, 0.4);
  assert.equal(summary.costPerEpisode[0]?.workpieceId, "episode-a");
  assert.equal(summary.costPerEpisode[0]?.costUsd, 0.2);
});

test("filterLedgerEventsByRange respects today, 7d, and 30d windows", () => {
  const events = [
    {
      created_at: "2026-04-02T09:00:00.000Z",
      feature: "script_assist",
      subfeature: "chat",
      actual_cost_usd: 0.05,
      workpiece_id: "episode-1",
    },
    {
      created_at: "2026-03-28T09:00:00.000Z",
      feature: "script_assist",
      subfeature: "chat",
      actual_cost_usd: 0.04,
      workpiece_id: "episode-2",
    },
    {
      created_at: "2026-03-01T09:00:00.000Z",
      feature: "script_assist",
      subfeature: "chat",
      actual_cost_usd: 0.03,
      workpiece_id: "episode-3",
    },
  ];

  const now = new Date("2026-04-02T20:00:00.000Z");
  assert.equal(filterLedgerEventsByRange(events, "today", now).length, 1);
  assert.equal(filterLedgerEventsByRange(events, "7d", now).length, 2);
  assert.equal(filterLedgerEventsByRange(events, "30d", now).length, 2);
});

test("derived metrics expose avg cost per episode and top feature share", () => {
  const summary = buildLedgerSummary([
    {
      created_at: "2026-04-02T10:10:00.000Z",
      feature: "script_assist",
      subfeature: "chat",
      actual_cost_usd: 0.6,
      workpiece_id: "episode-a",
    },
    {
      created_at: "2026-04-02T11:10:00.000Z",
      feature: "thumbnail_generate",
      subfeature: "concept_render",
      actual_cost_usd: 0.2,
      workpiece_id: "episode-b",
    },
    {
      created_at: "2026-04-02T12:10:00.000Z",
      feature: "speech_transcription",
      subfeature: "hammer_prep_nonbillable",
      actual_cost_usd: 0.2,
      workpiece_id: "episode-c",
    },
  ], new Date("2026-04-02T20:00:00.000Z"));

  assert.equal(computeAvgCostPerEpisode(summary), 0.333333);

  const top = computeTopFeature(summary);
  assert.equal(top?.tool, "hearth");
  assert.equal(top?.percent, 60);
});
