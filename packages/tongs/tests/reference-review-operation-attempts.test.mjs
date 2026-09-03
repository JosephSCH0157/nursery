import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL(
    "../../../supabase/migrations/20260903120000_tongs_reference_review_operation_attempts.sql",
    import.meta.url,
  ),
  "utf8",
);
const api = readFileSync(
  new URL("../src/workpiece-commit-api.ts", import.meta.url),
  "utf8",
);
test("Reference review attempts are orchestration evidence, not media authority", () => {
  assert.match(sql, /coordination evidence only/i);
  assert.match(sql, /not media.*authority/i);
  assert.match(sql, /canonical_receipt_json/);
  for (const forbidden of [
    "preview_url text",
    "asset_id uuid",
    "evidence_id uuid",
    "source_revision_id uuid",
    "selection_id uuid",
  ])
    assert.doesNotMatch(sql, new RegExp(forbidden));
});
test("failed attempts are terminal and retry is a new linked attempt", () => {
  assert.match(sql, /parent_attempt_id uuid references/);
  assert.match(sql, /v_parent\.terminal_outcome<>'failed'/);
  assert.match(sql, /unique \(workspace_id, operation_id\)/);
  assert.match(sql, /operation_identity_conflict/);
  assert.match(sql, /terminal_outcome is not null.*terminal/s);
});
test("RLS is viewer-readable, workspace-bound, and completion is service-only", () => {
  assert.match(
    sql,
    /foreign key \(workpiece_id,workspace_id\) references tongs\.episodes\(id,workspace_id\)/,
  );
  assert.match(sql, /enable row level security/);
  assert.match(sql, /has_workspace_role\(workspace_id,'viewer'\)/);
  assert.match(sql, /auth\.role\(\)<>'service_role'/);
  assert.match(
    sql,
    /grant execute.*finish_reference_review_operation_attempt.*service_role/s,
  );
});
test("Hammer preserves ordered multi-source visuals while deriving legacy primary-source fields", () => {
  assert.match(api, /orderedSources = Array\.isArray\(item\.sources\)/);
  assert.match(api, /readStringField\(primarySource, "source_revision_id"\)/);
  assert.match(api, /reference_visual_evidence\.sources = normalizeJsonValue/);
});
