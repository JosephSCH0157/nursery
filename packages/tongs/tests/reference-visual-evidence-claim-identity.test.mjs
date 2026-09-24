import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../../../supabase/migrations/20261011690000_reference_visual_evidence_claim_identity.sql", import.meta.url), "utf8");

test("canonical evidence claims bind exact source and claim identity", () => {
  assert.match(migration, /reference_visual_evidence_claim_fingerprint/);
  for (const field of ["workspace_id","workpiece_id","opportunity_id","source_set_member_id","source_revision_id","workpiece_source_link_revision_id","document_locator","raw_excerpt","numeric_value","unit","evidence_role","category"])
    assert.match(migration, new RegExp(`'${field}'`));
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(computed_claim_fingerprint,0\)\)/);
  assert.match(migration, /'disposition','replay'/);
});

test("duplicate reconciliation is append-only, bounded, and replay safe", () => {
  assert.match(migration, /target_count<>12/);
  assert.match(migration, /fingerprints differ/);
  assert.match(migration, /on conflict\(workspace_id,workpiece_id,duplicate_evidence_id\) do nothing/);
  assert.doesNotMatch(migration, /delete\s+from\s+tongs\.reference_visual_evidence/i);
});

test("numeric intent is persisted and validated at the database boundary", () => {
  for (const intent of ["general_support","numeric_stat","dated_timeline","comparison_support"])
    assert.match(migration, new RegExp(`'${intent}'`));
  for (const failure of ["numeric_stat_value_required","numeric_stat_unit_required","numeric_stat_date_not_measure","numeric_stat_label_required","numeric_stat_excerpt_required","numeric_stat_locator_required","numeric_stat_citation_required","current_source_set_member_required"])
    assert.match(migration, new RegExp(`'${failure}'`));
});

test("new claim and reconciliation authorities force RLS with least privilege", () => {
  assert.match(migration, /reference_visual_evidence_claims force row level security/);
  assert.match(migration, /reference_visual_evidence_duplicate_reconciliations force row level security/);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete).* to authenticated/i);
});
