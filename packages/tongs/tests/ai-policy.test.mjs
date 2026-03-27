import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_MODES,
  AI_DECISION_TYPES,
  AI_FEATURE_FLAGS,
  AI_FUNDING_SOURCES,
  AI_REASON_CODES,
  AI_REASON_MESSAGES,
  getAiReasonMessage,
  isAiAllowDecision,
} from "../dist/index.js";

test("AI contract constants are frozen to Milestone A values", () => {
  assert.deepEqual(AI_MODES, [
    "AI_DISABLED",
    "ORG_ONLY",
    "PERSONAL_ONLY",
    "ORG_FIRST_PERSONAL_FALLBACK",
  ]);

  assert.deepEqual(AI_DECISION_TYPES, ["ALLOW", "SOFT_DENY", "HARD_DENY"]);
  assert.deepEqual(AI_FEATURE_FLAGS, ["heavy_tasks", "image_generation", "research_flows"]);
  assert.deepEqual(AI_FUNDING_SOURCES, [
    "org_byo_key",
    "org_shared_credits",
    "personal_byo_key",
    "personal_credits",
    "forge_managed_credits",
  ]);
});

test("reason code catalog has an explicit human-readable message for each code", () => {
  assert.equal(AI_REASON_CODES.length, 9);

  for (const code of AI_REASON_CODES) {
    const message = getAiReasonMessage(code);
    assert.equal(typeof message, "string");
    assert.ok(message.length > 0, `missing message for ${code}`);
    assert.equal(message, AI_REASON_MESSAGES[code]);
  }
});

test("ALLOW classification helper only returns true for ALLOW", () => {
  assert.equal(
    isAiAllowDecision({
      decisionType: "ALLOW",
      reasonCode: null,
      selectedFundingSource: "org_shared_credits",
      fallbackAvailable: false,
      fallbackUsed: false,
      effectivePolicySnapshot: {},
    }),
    true,
  );

  assert.equal(
    isAiAllowDecision({
      decisionType: "SOFT_DENY",
      reasonCode: "NO_VALID_FUNDING_SOURCE",
      selectedFundingSource: null,
      fallbackAvailable: true,
      fallbackUsed: false,
      effectivePolicySnapshot: {},
    }),
    false,
  );

  assert.equal(
    isAiAllowDecision({
      decisionType: "HARD_DENY",
      reasonCode: "ORG_AI_DISABLED",
      selectedFundingSource: null,
      fallbackAvailable: false,
      fallbackUsed: false,
      effectivePolicySnapshot: {},
    }),
    false,
  );
});
