import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../../../", import.meta.url);

async function migration(name) {
  return readFile(new URL(`supabase/migrations/${name}`, root), "utf8");
}

test("standard-customer aggregate certification is exact, scoped, and service-only", async () => {
  const sql = await migration("20261011200000_tongs_standard_customer_certification_aggregate.sql");
  assert.match(sql, /'test', 1, 'active', 11015, 0, 1, 86400/);
  assert.match(sql, /'gpt-5\.6-luna'/);
  assert.match(sql, /'openai\.text\.hearth_chat'/);
  assert.match(sql, /scope_auth\.maximum_operation_count <> 1/);
  assert.match(sql, /provider_submission_count', 0/);
  assert.match(sql, /grant execute on function tongs\.rearm_standard_customer_preprovider_release[\s\S]*to service_role/);
  assert.doesNotMatch(sql, /grant execute[\s\S]*to authenticated/);
});

test("aggregate selection uses canonical reservation environment", async () => {
  const sql = await migration("20261011220000_tongs_aggregate_financial_environment_selection.sql");
  assert.match(sql, /r\.funding_environment=''test''/);
  assert.doesNotMatch(sql, /return 'test_customer'/);
});

test("legacy processor-fee catch-up cannot create a negative allocation", async () => {
  const sql = await migration("20261011230000_tongs_deposit_fee_allocation_catchup.sql");
  assert.match(sql, /v_fee_allocation:=greatest\(/);
  assert.match(sql, /least\(v_prior_fee_allocated/);
});
