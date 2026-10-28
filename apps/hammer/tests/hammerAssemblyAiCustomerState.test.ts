import assert from "node:assert/strict";
import test from "node:test";
import { projectHammerAssemblyAiCustomerState } from "../src/transcript/hammerAssemblyAiCustomerState";

test("customer state never claims success before canonical completion", () => {
  for (const state of ["quoted", "reserved", "queued", "processing", "submission_unknown", "failed"] as const) {
    assert.equal(projectHammerAssemblyAiCustomerState(state).transcriptSucceeded, false);
    assert.equal(projectHammerAssemblyAiCustomerState(state).retryAllowed, false);
  }
  assert.equal(projectHammerAssemblyAiCustomerState("completed").transcriptSucceeded, true);
});

test("ambiguous submission becomes review-required without retry", () => {
  const view = projectHammerAssemblyAiCustomerState("submission_unknown");
  assert.equal(view.state, "failed");
  assert.match(view.detail, /will not retry or charge again automatically/i);
});
