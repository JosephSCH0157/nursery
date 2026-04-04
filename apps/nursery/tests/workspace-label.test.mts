import assert from "node:assert/strict";
import test from "node:test";
import { workspaceSelectOptionLabel, workspaceSourceLabel } from "../src/lib/workspaces/workspaceLabel";

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
