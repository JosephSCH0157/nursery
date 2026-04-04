import assert from "node:assert/strict";
import test from "node:test";
import { groupWorkspacesBySource, workspaceSelectOptionLabel, workspaceSourceLabel } from "../src/lib/workspaces/workspaceLabel";

test("workspaceSourceLabel prefers personal for org_id null", () => {
  const label = workspaceSourceLabel({
    id: "w1",
    name: "My Workspace",
    orgId: null,
    sourceType: "shared",
  });
  assert.equal(label, "Personal");
});

test("workspaceSourceLabel renders shared org name when available", () => {
  const label = workspaceSourceLabel({
    id: "w2",
    name: "BS with Joe",
    sourceType: "shared",
    orgId: "org-1",
    orgName: "Joe Org",
  });
  assert.equal(label, "Shared - Joe Org");
});

test("workspaceSelectOptionLabel composes readable selector text", () => {
  const option = workspaceSelectOptionLabel({
    id: "w3",
    name: "Brad Workspace",
    sourceType: "personal",
    orgId: null,
  });
  assert.equal(option, "Brad Workspace (Personal)");
});

test("groupWorkspacesBySource splits personal and shared buckets", () => {
  const grouped = groupWorkspacesBySource([
    { id: "p1", name: "My Workspace", sourceType: "personal", orgId: null },
    { id: "s1", name: "BS with Joe", sourceType: "shared", orgId: "org-joe", orgName: "Joe Org" },
  ]);
  assert.equal(grouped.personal.length, 1);
  assert.equal(grouped.shared.length, 1);
  assert.equal(grouped.personal[0]?.id, "p1");
  assert.equal(grouped.shared[0]?.id, "s1");
});
