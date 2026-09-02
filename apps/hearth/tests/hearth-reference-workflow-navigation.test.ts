import assert from "node:assert/strict";
import test from "node:test";
import { nextUnresolvedReferenceOpportunityId } from "../src/lib/hearth-reference-workflow-navigation";

const opportunities = [
  { id: "one", resolved: true },
  { id: "two", resolved: true },
  { id: "three", resolved: false },
];

test("advances to the next unresolved reference opportunity", () => {
  assert.equal(nextUnresolvedReferenceOpportunityId(opportunities, "one", item => item.resolved, new Set()), "three");
});

test("wraps and excludes skipped reference opportunities", () => {
  assert.equal(nextUnresolvedReferenceOpportunityId(opportunities, "three", item => item.resolved, new Set(["three"])), null);
  assert.equal(nextUnresolvedReferenceOpportunityId([{ id: "one", resolved: false }, { id: "two", resolved: true }], "two", item => item.resolved, new Set()), "one");
});
