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

test("detectHearthScriptMutationIntent recognizes deterministic format-only requests", () => {
  for (const request of [
    "Reformat this",
    "Fix the line breaks",
    "Make this Anvil-ready",
    "Normalize the speaker blocks",
    "Repair the formatting without changing wording",
  ]) {
    const intent = detectHearthScriptMutationIntent(request);
    assert.equal(intent.targetsScriptBody, true, request);
    assert.equal(intent.kind, "format_only", request);
  }
});

test("detectHearthScriptMutationIntent keeps mixed editorial formatting requests generative", () => {
  const intent = detectHearthScriptMutationIntent("Reformat this and tighten the opening.");

  assert.equal(intent.targetsScriptBody, true);
  assert.notEqual(intent.kind, "format_only");
});

test("detectHearthScriptMutationIntent leaves ordinary exploration requests in chat", () => {
  const intent = detectHearthScriptMutationIntent("Compare the framing and tell me what stands out.");

  assert.equal(intent.targetsScriptBody, false);
  assert.equal(intent.destination, "chat");
  assert.equal(intent.kind, null);
});

test("Church Street discussion about possible script changes remains conversational", () => {
  const turns = [
    "We still don't have the number for the actual budget for this project and the other thing is if they're going to do the canopy work under I-4 to bring people to Church Street there's no businesses at Church Street to bring them to... my point is they're spending a lot of money on a part of Orlando that is already in the past so how do we update the script to get that point across",
    "okay I mean I didn't ask you to actually update the script I'm having a conversation with you about how we can update the script what changes can we make to get those points across",
  ];

  for (const turn of turns) {
    const intent = detectHearthScriptMutationIntent(turn);
    assert.equal(intent.targetsScriptBody, false, turn);
    assert.equal(intent.destination, "chat", turn);
    assert.equal(intent.kind, null, turn);
  }
});

test("editorial questions and explicit no-edit language remain conversational", () => {
  for (const request of [
    "How could we make this point stronger?",
    "What changes could we make?",
    "How do we get this idea across?",
    "I don't want you to edit it yet, let's talk about it.",
    "What would you change here?",
    "Should we move this section?",
    "How could we frame the Canopy point?",
  ]) {
    const intent = detectHearthScriptMutationIntent(request);
    assert.equal(intent.targetsScriptBody, false, request);
    assert.equal(intent.destination, "chat", request);
  }
});

test("affirmative script-change instructions still enter mutation mode", () => {
  for (const request of [
    "Update the script with that.",
    "Apply those changes.",
    "Apply that transition to the script.",
    "Put that transition into the script.",
    "Rewrite the closing around that contrast.",
    "Create Version 2.",
    "Put that into the script.",
  ]) {
    const intent = detectHearthScriptMutationIntent(request);
    assert.equal(intent.targetsScriptBody, true, request);
    assert.equal(intent.destination, "script_body", request);
  }
});

test("affirmative script-change instructions still require substantive script content", () => {
  for (const request of [
    "Update the script with that.",
    "Apply those changes.",
    "Create Version 2.",
  ]) {
    const routing = resolveHearthScriptMutationRouting({
      productionAction: false,
      autosaveReasonCode: "ai_rewrite",
      ops: [],
      intent: detectHearthScriptMutationIntent(request),
    });
    assert.equal(routing.hasScriptBodyProposal, false, request);
    assert.equal(routing.missingScriptBodyMutation, true, request);
    assert.deepEqual(routing.proposalOps, [], request);
  }
});

test("affirmative script-change instructions preserve validated body proposals", () => {
  const body = "[s1]\nThe revised Church Street point now contrasts public spending with the destination riders actually find.\n[/s1]";
  for (const request of [
    "Update the script with that.",
    "Apply those changes.",
    "Create Version 2.",
  ]) {
    const routing = resolveHearthScriptMutationRouting({
      productionAction: false,
      autosaveReasonCode: "ai_rewrite",
      ops: [{ op: "set_body", value: body }],
      intent: detectHearthScriptMutationIntent(request),
    });
    assert.equal(routing.hasScriptBodyProposal, true, request);
    assert.equal(routing.missingScriptBodyMutation, false, request);
    assert.deepEqual(routing.proposalOps, [{ op: "set_body", value: body }], request);
  }
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

test("resolveHearthScriptMutationRouting rejects announcement-only body proposals", () => {
  const routing = resolveHearthScriptMutationRouting({
    productionAction: false,
    autosaveReasonCode: "ai_script",
    ops: [{ op: "set_body", value: "Here's the full script." }],
    intent: detectHearthScriptMutationIntent("Write the full script."),
  });

  assert.equal(routing.hasScriptBodyProposal, false);
  assert.equal(routing.missingScriptBodyMutation, true);
  assert.deepEqual(routing.proposalOps, []);
});

test("resolveHearthScriptMutationRouting cannot stage a script body during discussion", () => {
  const approvedVersionOne = "[s1]\nApproved Version 1 remains canonical.\n[/s1]";
  let canonicalBody = approvedVersionOne;
  let canonicalVersion = 1;
  let mutationReceipts = 0;
  const routing = resolveHearthScriptMutationRouting({
    productionAction: false,
    autosaveReasonCode: "ai_rewrite",
    ops: [{ op: "set_body", value: "[s1]\nUnexpected replacement.\n[/s1]" }],
    intent: detectHearthScriptMutationIntent("What changes could we make to get that point across?"),
  });

  assert.equal(routing.hasScriptBodyProposal, false);
  assert.equal(routing.missingScriptBodyMutation, false);
  for (const operation of routing.proposalOps) {
    if (operation.op !== "set_body" || typeof operation.value !== "string") continue;
    canonicalBody = operation.value;
    canonicalVersion += 1;
    mutationReceipts += 1;
  }
  assert.deepEqual(routing.proposalOps, []);
  assert.equal(canonicalBody, approvedVersionOne);
  assert.equal(canonicalVersion, 1);
  assert.equal(mutationReceipts, 0);
});

test("buildNoScriptChangesExplanation stays explicit about analysis-only outcomes", () => {
  const explanation = buildNoScriptChangesExplanation(
    detectHearthScriptMutationIntent("Replace this section with something punchier."),
  );

  assert.match(explanation, /^No script changes made\./);
  assert.match(explanation, /replacement section|canonical script form/i);
});
