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

test("Forge Credit denomination, packs, allowance, markup, and rounding are exact", async () => {
  const economy = await migration("20261011160000_tongs_forge_credit_economy.sql");
  const pricing = await migration("20261011170000_tongs_standard_customer_luna_catalog.sql");
  assert.match(economy, /'forge\.credit-economy\.v1', 1, 'active', 5000, 'USD', 3300/);
  assert.match(economy, /'pre_tax_customer_value'/);
  assert.match(economy, /'ai_small','forge_credits_2000'.*10000000,2000/s);
  assert.match(economy, /'ai_medium','forge_credits_5000'.*25000000,5000/s);
  assert.match(economy, /'ai_large','forge_credits_10000'.*50000000,10000/s);
  assert.match(economy, /select contract\.id,environment,'creator','monthly','forge\.creator-monthly\.allowance\.v1',[\s\S]*?1000,5000000,3759398/);
  assert.match(economy, /gross_amount_micros \/ 5000/);
  assert.match(pricing, /forge-standard-customer-hearth-luna-v1:11015:14650:350:15000:3/);
});

test("Test and Live Stripe mappings carry identical logical pack quantities", async () => {
  const catalog = await readFile(new URL("supabase/functions/_shared/stripe-catalog.ts", root), "utf8");
  for (const [offer, units] of [
    ["forge_credits_2000", "2_000"],
    ["forge_credits_5000", "5_000"],
    ["forge_credits_10000", "10_000"],
  ]) {
    assert.match(catalog, new RegExp(`offerId: "${offer}"[\\s\\S]*?creditAmount: ${units}`));
  }
  assert.match(catalog, /testProductId:/);
  assert.match(catalog, /liveProductId:/);
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
