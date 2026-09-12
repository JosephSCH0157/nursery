import assert from "node:assert/strict";
import test from "node:test";
import { normalizeHearthTurnResult } from "../src/lib/hearth-ai-runtime-contract";
import { buildHearthTurnResult, type HearthTurnDecision } from "../src/lib/hearth-turn-contract";

const conversationDecision: HearthTurnDecision = {
  mode: "conversation",
  requiresArtifact: false,
  allowsMutation: false,
  retrievalScope: "active_episode_only",
  requestedArtifact: null,
  reasons: ["ordinary_conversation"],
};

test("ordinary conversation is valid with no artifact or operations", () => {
  const result = buildHearthTurnResult({
    decision: conversationDecision,
    assistantMessage: "We can make that point stronger by contrasting the investment with the empty storefronts.",
    persistence: "pending",
  });
  assert.equal(result.validation.ok, true);
  assert.equal(result.artifact, null);
  assert.deepEqual(result.operations, []);
  assert.deepEqual(normalizeHearthTurnResult(result), result);
});

test("provider and invalid-output failures remain distinct", () => {
  const provider = buildHearthTurnResult({
    decision: { ...conversationDecision, mode: "outline_generate", requiresArtifact: true, requestedArtifact: "outline" },
    assistantMessage: "",
    failureKind: "provider_failure",
    failureMessage: "Provider request failed.",
  });
  const invalid = buildHearthTurnResult({
    decision: provider.decision,
    assistantMessage: "",
    failureKind: "invalid_model_output",
    failureMessage: "No usable outline was returned.",
  });
  assert.equal(provider.validation.failureKind, "provider_failure");
  assert.equal(invalid.validation.failureKind, "invalid_model_output");
  assert.equal(provider.validation.ok, false);
  assert.equal(invalid.validation.ok, false);
});

test("admission failure remains distinct from provider execution", () => {
  const result = buildHearthTurnResult({
    decision: conversationDecision,
    assistantMessage: "",
    failureKind: "admission_failure",
    failureMessage: "No provider request was sent.",
  });
  assert.equal(result.validation.ok, false);
  assert.equal(result.validation.failureKind, "admission_failure");
  assert.equal(result.artifact, null);
  assert.deepEqual(result.operations, []);
  assert.deepEqual(normalizeHearthTurnResult(result), result);
});

test("validated artifacts survive the canonical envelope", () => {
  const result = buildHearthTurnResult({
    decision: { ...conversationDecision, mode: "outline_generate", requiresArtifact: true, requestedArtifact: "outline" },
    assistantMessage: "Here is the outline.",
    artifact: { kind: "outline", text: "- Opening\n- Evidence\n- Close" },
    operations: [{ op: "set_outline", value: "- Opening\n- Evidence\n- Close" }],
  });
  assert.deepEqual(normalizeHearthTurnResult(result), result);
});
