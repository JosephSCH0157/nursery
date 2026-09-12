import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../supabase/migrations/20260908180000_tongs_hearth_research_preflight_authority.sql",
  import.meta.url,
);
const readbackMigrationUrl = new URL(
  "../../../supabase/migrations/20260908180200_tongs_hearth_authority_readback_integrity.sql",
  import.meta.url,
);
const hardeningUrls = [
  "20260908180100_tongs_hearth_ready_current_file_coherence.sql",
  "20260908180200_tongs_hearth_authority_readback_integrity.sql",
  "20260908180300_tongs_hearth_authority_payload_bounds.sql",
  "20260908180400_tongs_hearth_approval_preflight_revision_binding.sql",
  "20260908180500_tongs_hearth_approval_preflight_receipts.sql",
  "20260908180600_tongs_hearth_ready_full_proof_coherence.sql",
  "20260908180700_tongs_hearth_stale_preflight_decision_guard.sql",
].map((name) => new URL(`../../../supabase/migrations/${name}`, import.meta.url));
const apiUrl = new URL("../src/workpiece-commit-api.ts", import.meta.url);

test("canonical Hearth research is immutable, normalized, workpiece-scoped authority", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create table tongs\.hearth_research_artifact_revisions/i);
  assert.match(sql, /create table tongs\.hearth_research_artifact_claims/i);
  assert.match(sql, /create table tongs\.hearth_research_evidence_snapshots/i);
  assert.match(sql, /create table tongs\.hearth_research_claim_evidence/i);
  assert.match(sql, /unique\(id,workspace_id,workpiece_id,revision\)/i);
  assert.match(sql, /commit_hearth_research_artifact_v1/i);
  assert.match(sql, /creator_supplied_unverified/i);
  assert.match(sql, /reject_hearth_evidence_projection_mutation/i);
  assert.match(sql, /has_workspace_role\(workspace_id,'viewer'\)/i);
});

test("preflight, acknowledgements, approval, and Ready retain separate durable receipts", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create table tongs\.hearth_editorial_preflight_reports/i);
  assert.match(sql, /create table tongs\.hearth_editorial_preflight_findings/i);
  assert.match(sql, /create table tongs\.hearth_preflight_finding_acknowledgements/i);
  assert.match(sql, /create table tongs\.hearth_preflight_review_receipts/i);
  assert.match(sql, /create table tongs\.script_approval_preflight_bindings/i);
  assert.match(sql, /acknowledge_hearth_preflight_finding_v1/i);
  assert.match(sql, /review_hearth_editorial_preflight_v1/i);
  assert.match(sql, /approve_canonical_script_v3/i);
  assert.match(sql, /hearth_transition_preflighted_script_ready_v3/i);
  assert.match(sql, /v_finding\.severity='blocker' and p_action<>'resolve'/i);
  assert.match(sql, /f\.severity='warning'/i);
});

test("the complete frozen hardening chain is present", async () => {
  const texts = await Promise.all(hardeningUrls.map((url) => readFile(url, "utf8")));
  assert.equal(texts.length, 7);
  for (const text of texts) assert.match(text, /hearth|preflight|ready/i);
  assert.match(texts.at(-1) ?? "", /preflight_not_current|script_changed|research_changed/i);
});

test("legacy capture authorities survive while preflight proof is enforced forward", async () => {
  const [baseSql, readbackSql] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(readbackMigrationUrl, "utf8"),
  ]);
  const baseShape = baseSql.match(
    /add constraint recording_capture_preflight_shape check\([\s\S]*?\)\s*not valid;/i,
  )?.[0] ?? "";
  const readbackShape = readbackSql.match(
    /add constraint recording_capture_preflight_shape check\([\s\S]*?\)\s*not valid;/i,
  )?.[0] ?? "";

  assert.match(baseShape, /script_binding_kind='approved_canonical_script'/i);
  assert.match(baseShape, /preflight_report_id is not null/i);
  assert.match(readbackShape, /research_artifact_id is null/i);
  assert.match(readbackShape, /preflight_script_hash ~ '\^\[0-9a-f\]\{64\}\$'/i);
  assert.match(
    baseSql,
    /add constraint recording_capture_preflight_fkey foreign key\([\s\S]*?hearth_editorial_preflight_reports[\s\S]*?\),/i,
  );
  assert.doesNotMatch(
    baseSql,
    /recording_capture_preflight_fkey[\s\S]{0,300}not valid/i,
  );
});

test("Tongs HTTP authority delegates through authenticated, scoped RPC methods", async () => {
  const source = await readFile(apiUrl, "utf8");
  assert.match(source, /read_current_hearth_research_artifact_v1/);
  assert.match(source, /commit_hearth_research_artifact_v1/);
  assert.match(source, /read_current_hearth_preflight_v1/);
  assert.match(source, /commit_hearth_editorial_preflight_v1/);
  assert.match(source, /acknowledge_hearth_preflight_finding_v1/);
  assert.match(source, /review_hearth_editorial_preflight_v1/);
  assert.match(source, /approve_canonical_script_v3/);
  assert.match(source, /hearth_transition_preflighted_script_ready_v3/);
  assert.doesNotMatch(source, /hearth_transition_approved_script_ready["']/);
});
