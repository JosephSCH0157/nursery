import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../../../supabase/migrations/20260718160000_tongs_quench_release_decisions.sql", import.meta.url);

test("Slice 6 release decisions preserve distinct immutable authority relations", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const table of ["quench_release_manifest_snapshots", "quench_destination_scopes", "quench_destination_capability_revisions",
    "quench_release_decision_sequences", "quench_release_decision_revisions", "quench_release_candidate_assignments", "quench_release_operation_receipts"])
    assert.match(sql, new RegExp(`create table tongs\\.${table}`));
  assert.doesNotMatch(sql, /retired_at/);
  assert.match(sql, /intent_state text not null check\(intent_state in\('selected','experiment_planned','cancelled'\)\)/);
});

test("Slice 6 RPC authorizes first and uses the locked global authority order", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const rpc = sql.slice(sql.indexOf("create or replace function tongs.commit_quench_release_decision"));
  const editor = rpc.indexOf("has_workspace_role(p_workspace_id,'editor')");
  const manifest = rpc.indexOf("path='hammer/release-packet/manifest.v1.json' for update");
  const metadata = rpc.indexOf("path='metadata.json' for update");
  const binding = rpc.indexOf(":brand',0)");
  const candidateSet = rpc.indexOf(":thumbnail-candidate-set',0)");
  const capability = rpc.indexOf(":quench-capability',0)");
  const decision = rpc.indexOf(":quench-decision',0)");
  const operation = rpc.indexOf(":quench-operation',0)");
  assert.ok([editor, manifest, metadata, binding, candidateSet, capability, decision, operation].every((value) => value >= 0));
  assert.ok(editor < manifest && manifest < metadata && metadata < binding && binding < candidateSet && candidateSet < capability && capability < decision && decision < operation);
  assert.ok(rpc.indexOf("quench_release_operation_receipts where operation_id") > editor);
});

test("Slice 6 assignments are bound to exact Slice 4 set membership and cardinality", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /foreign key\(candidate_set_id,candidate_revision_id,workspace_id,workpiece_id\)[\s\S]*thumbnail_candidate_set_members/);
  assert.match(sql, /cancelled decision requires previous decision and zero assignments/);
  assert.match(sql, /v_count<>1 or v_selected<>1/);
  assert.match(sql, /v_count<2 or v_selected<>0 or v_control<>1 or v_variant<1/);
  assert.match(sql, /v_total<>10000/);
});

test("Slice 6 replay returns original outcome with freshly derived applicability", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /immutable_result_json\|\|jsonb_build_object\('disposition','replayed','applicability',tongs\.quench_release_decision_applicability/);
  assert.match(sql, /v_current\.decision_content_hash=v_hash/);
  assert.match(sql, /'disposition','no_change'/);
});
