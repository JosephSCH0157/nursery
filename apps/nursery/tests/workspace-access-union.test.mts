import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWorkspaceAccessRows, type WorkspaceAccessRow } from "../../bar-stock/src/lib/workspace-access";

test("personal-only workspace remains personal", () => {
  const rows: WorkspaceAccessRow[] = [
    {
      workspace_id: "w-personal",
      workspace_name: "Brad Workspace",
      role: "owner",
      source_type: "personal",
      org_id: null,
    },
  ];
  const result = normalizeWorkspaceAccessRows(rows);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.sourceType, "personal");
  assert.equal(result[0]?.orgId, null);
});

test("shared-only workspace remains shared", () => {
  const rows: WorkspaceAccessRow[] = [
    {
      workspace_id: "w-shared",
      workspace_name: "BS with Joe",
      role: "editor",
      source_type: "shared",
      org_id: "org-joe",
      org_name: "Joe Org",
    },
  ];
  const result = normalizeWorkspaceAccessRows(rows);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.sourceType, "shared");
  assert.equal(result[0]?.orgName, "Joe Org");
});

test("owner+member duplicate resolves deterministically to personal owner row", () => {
  const rows: WorkspaceAccessRow[] = [
    {
      workspace_id: "w-both",
      workspace_name: "Dual Membership Workspace",
      role: "editor",
      source_type: "shared",
      org_id: "org-joe",
      org_name: "Joe Org",
    },
    {
      workspace_id: "w-both",
      workspace_name: "Dual Membership Workspace",
      role: "owner",
      source_type: "personal",
      org_id: null,
      org_name: null,
    },
  ];
  const result = normalizeWorkspaceAccessRows(rows);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.role, "owner");
  assert.equal(result[0]?.sourceType, "personal");
  assert.equal(result[0]?.orgId, null);
});

test("unassigned org workspace is absent from normalized list", () => {
  const rows: WorkspaceAccessRow[] = [];
  const result = normalizeWorkspaceAccessRows(rows);
  assert.equal(result.length, 0);
});
