import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../../../supabase/migrations/20261001120000_tongs_restricted_beta_financial_policy.sql", import.meta.url);

test("restricted beta migration is inactive, private, and globally exposure bounded", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /'production',1,'draft'/i);
  assert.match(sql, /aggregate_forge_exposure_limit_micros/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /test_funding_real_provider_forbidden/i);
  assert.match(sql, /cost_evidence_stale_or_incomplete/i);
  assert.match(sql, /customer_relieved_supplier_obligation/i);
  assert.match(sql, /grant execute on function tongs\.read_restricted_beta_financial_controls_admin\(\) to authenticated/i);
  assert.match(sql, /if not tongs\.is_platform_operator\(auth\.uid\(\)\)/i);
  assert.doesNotMatch(sql, /lifecycle_state[^;]+?'active'[^;]+?insert into tongs\.restricted_beta_policy_revisions/is);
});
