import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNoScriptChangesExplanation,
  detectHearthScriptMutationIntent,
  resolveHearthScriptMutationRouting,
} from "../src/lib/hearth-script-mutation";

test("detectHearthScriptMutationIntent routes rewrite-the-script requests to the script body", () => {
  const intent = detectHearthScriptMutationIntent("Rewrite the script to sound tighter and clearer.");

  assert.equal(intent.targetsScriptBody, true);
  assert.equal(intent.destination, "script_body");
  assert.equal(intent.kind, "rewrite");
});

test("detectHearthScriptMutationIntent routes integrate requests to the script body", () => {
  const intent = detectHearthScriptMutationIntent("Integrate this new research into the draft body.");

  assert.equal(intent.targetsScriptBody, true);
  assert.equal(intent.destination, "script_body");
  assert.equal(intent.kind, "integrate");
});

test("detectHearthScriptMutationIntent leaves ordinary exploration requests in chat", () => {
  const intent = detectHearthScriptMutationIntent("Compare the framing and tell me what stands out.");

  assert.equal(intent.targetsScriptBody, false);
  assert.equal(intent.destination, "chat");
  assert.equal(intent.kind, null);
});

test("resolveHearthScriptMutationRouting drops non-body proposals for script mutation requests", () => {
  const routing = resolveHearthScriptMutationRouting({
    productionAction: false,
    autosaveReasonCode: "ai_rewrite",
    ops: [{ op: "add_source", source: { title: "Reference" } }],
    intent: detectHearthScriptMutationIntent("Rewrite the draft and integrate this source."),
  });

  assert.equal(routing.hasScriptBodyProposal, false);
  assert.equal(routing.missingScriptBodyMutation, true);
  assert.deepEqual(routing.proposalOps, []);
});

test("resolveHearthScriptMutationRouting preserves body proposals for script mutation requests", () => {
  const body = "[s1]\n- Tightened beat.\n[/s1]";
  const routing = resolveHearthScriptMutationRouting({
    productionAction: false,
    autosaveReasonCode: "ai_rewrite",
    ops: [{ op: "set_body", value: body }],
    intent: detectHearthScriptMutationIntent("Revise the script."),
  });

  assert.equal(routing.hasScriptBodyProposal, true);
  assert.equal(routing.missingScriptBodyMutation, false);
  assert.deepEqual(routing.proposalOps, [{ op: "set_body", value: body }]);
});

test("buildNoScriptChangesExplanation stays explicit about analysis-only outcomes", () => {
  const explanation = buildNoScriptChangesExplanation(
    detectHearthScriptMutationIntent("Replace this section with something punchier."),
  );

  assert.match(explanation, /^No script changes made\./);
  assert.match(explanation, /replacement section|canonical script form/i);
});
