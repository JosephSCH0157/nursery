import assert from "node:assert/strict";
import test from "node:test";
import { routeForgeAiRequest } from "../../../packages/tongs/src/ai-router";
import { buildUsageAccounting } from "../server/ai-usage-accounting";

test("tier1 routes to cheapest valid model", () => {
  const decision = routeForgeAiRequest({
    tool: "hearth",
    feature: "sentence_smoothing",
    estimatedTokens: {
      inputTokens: 900,
      outputTokens: 500,
    },
  });

  assert.equal(decision.model, "gpt-5.1");
  assert.equal(decision.reasoning, "low");
  assert.equal(decision.taskTier, "tier1");
  assert.equal(decision.policyEnforced, true);
});

test("tier2 stays within 5.2 medium lane", () => {
  const decision = routeForgeAiRequest({
    tool: "hearth",
    feature: "script_draft",
    estimatedTokens: {
      inputTokens: 1500,
      outputTokens: 900,
    },
  });

  assert.equal(decision.model, "gpt-5.2");
  assert.equal(decision.reasoning, "medium");
  assert.equal(decision.taskTier, "tier2");
});

test("tier3 never exceeds 5.3 medium", () => {
  const decision = routeForgeAiRequest({
    tool: "hearth",
    feature: "research",
    estimatedTokens: {
      inputTokens: 1800,
      outputTokens: 1200,
    },
  });

  assert.equal(decision.model, "gpt-5.3");
  assert.equal(decision.reasoning, "medium");
  assert.equal(decision.taskTier, "tier3");
});

test("override attempts are ignored when above policy", () => {
  const decision = routeForgeAiRequest({
    tool: "hearth",
    feature: "research",
    requestedModel: "gpt-5.4",
    requestedReasoningEffort: "high",
    estimatedTokens: {
      inputTokens: 1200,
      outputTokens: 700,
    },
  });

  assert.equal(decision.model, "gpt-5.3");
  assert.equal(decision.reasoning, "medium");
  assert.equal(decision.overrideIgnored, true);
});

test("budget guard rejects overly expensive preflight", () => {
  assert.throws(() => {
    routeForgeAiRequest({
      tool: "hearth",
      feature: "research",
      estimatedTokens: {
        inputTokens: 20_000,
        outputTokens: 40_000,
      },
    });
  }, /AI cost exceeds allowed budget/);
});

test("usage accounting keeps estimated and actual costs aligned", () => {
  const accounting = buildUsageAccounting({
    model: "gpt-5.2",
    payload: {
      usage: {
        prompt_tokens: 1200,
        completion_tokens: 600,
        total_tokens: 1800,
      },
    },
    fallbackTotalTokens: 1800,
    preflightEstimatedCostUsd: 0.009,
    billableMode: "forge",
  });

  assert.equal(accounting.estimatedCostUsd, 0.009);
  assert(accounting.actualCostUsd > 0);
  assert(accounting.billableTokens > 0);
});
