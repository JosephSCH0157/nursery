import assert from "node:assert/strict";
import test from "node:test";
import { filterHearthOperationsForDecision, resolveHearthTurnDecision } from "../server/hearth/hearth-turn-decision";

const decide = (
  creatorText: string,
  explicitAction: Parameters<typeof resolveHearthTurnDecision>[0]["explicitAction"] = null,
) => resolveHearthTurnDecision({
  creatorText,
  explicitAction,
  lifecycle: {
    hasDraft: true,
    hasApprovedScript: true,
    isReady: false,
  },
});

test("listening language remains conversation-only even when script words appear in hidden context", () => {
  const decision = decide("Are you with me so far?");
  assert.equal(decision.mode, "listening");
  assert.equal(decision.requiresArtifact, false);
  assert.equal(decision.allowsMutation, false);
});

test("discussion about possible script changes never becomes a mutation transaction", () => {
  const turns = [
    "We still don't have the number for the actual budget for this project and the other thing is if they're going to do the canopy work under I-4 to bring people to Church Street there's no businesses at Church Street to bring them to... my point is they're spending a lot of money on a part of Orlando that is already in the past so how do we update the script to get that point across",
    "okay I mean I didn't ask you to actually update the script I'm having a conversation with you about how we can update the script what changes can we make to get those points across",
  ];
  for (const turn of turns) {
    const decision = decide(turn);
    assert.equal(decision.mode, "conversation", turn);
    assert.equal(decision.requiresArtifact, false, turn);
    assert.equal(decision.allowsMutation, false, turn);
  }
});

test("explicit artifact and mutation language receives one authoritative mode", () => {
  assert.equal(decide("Show me a first draft of bullet points only.").mode, "outline_generate");
  assert.equal(decide("Write the full script now.").mode, "script_generate");
  assert.equal(decide("Update the script with that.").mode, "script_mutate");
  assert.equal(decide("Are we ready to record?").mode, "readiness_review");
  assert.equal(decide("Research the current figures and cite the sources.").mode, "research");
});

test("explicit UI actions are intent inputs but creator negation remains authoritative", () => {
  assert.equal(decide("Use these notes.", { kind: "generate_outline" }).mode, "outline_generate");
  assert.equal(decide("Use these notes.", { kind: "generate_script" }).mode, "script_generate");
  assert.equal(decide("Generate tags.", { kind: "production", action: "tags" }).mode, "production_action");
  assert.equal(
    decide("I don't want you to edit it yet; let's talk about it.", { kind: "mutate_script" }).mode,
    "conversation",
  );
});

test("cross-episode retrieval is explicit and cannot be inferred from ordinary comparison language", () => {
  assert.equal(decide("I would like to establish its size through familiar comparisons.").retrievalScope, "active_episode_only");
  assert.equal(decide("Compare this with the other episode in this workspace.").retrievalScope, "explicit_cross_episode");
});

test("the authoritative decision filters model operations before they reach the client", () => {
  const modelOperations = [
    { op: "set_outline" as const, value: "- Beat" },
    { op: "set_body" as const, value: "A script body with enough words to be substantive." },
    { op: "add_source" as const, source: { url: "https://example.com" } },
  ];
  assert.deepEqual(filterHearthOperationsForDecision(decide("What would you change here?"), modelOperations), []);
  assert.deepEqual(
    filterHearthOperationsForDecision(decide("Give me a bullet outline."), modelOperations),
    [modelOperations[0]],
  );
  assert.deepEqual(
    filterHearthOperationsForDecision(decide("Research this and find sources."), modelOperations),
    [modelOperations[2]],
  );
  assert.deepEqual(
    filterHearthOperationsForDecision(decide("Update the script with that."), modelOperations),
    [modelOperations[1], modelOperations[2]],
  );
});
