import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../../../supabase/migrations/20260915120000_tongs_runway_paid_execution_boundary.sql", import.meta.url);
const activationMigrationUrl = new URL("../../../supabase/migrations/20260916120000_tongs_runway_owner_pilot_activation.sql", import.meta.url);

test("Runway cutover migration installs observe-only and does not create or fund an owner budget", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /values\s*\(\s*1,\s*'observe'/i);
  assert.doesNotMatch(sql, /insert\s+into\s+tongs\.owner_operating_budgets/i);
  assert.doesNotMatch(sql, /insert\s+into\s+tongs\.owner_operating_budget_revisions/i);
  assert.doesNotMatch(sql, /insert\s+into\s+tongs\.paid_execution_control_revisions/i);
});

test("Runway cutover requires full-cost binding and provides halt-new rollback", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /total_cost_ceiling_micros\s*=\s*direct_provider_ceiling_micros\s*\+\s*supporting_cost_ceiling_micros/i);
  assert.match(sql, /reserved_wholesale_spend_micros/i);
  assert.match(sql, /mode\s+in\s*\('observe',\s*'enforce',\s*'halt_new'\)/i);
  assert.match(sql, /p_mode\s+not\s+in\s*\('enforce',\s*'halt_new'\)/i);
  assert.match(sql, /polling_and_reconciliation_available',\s*true/i);
});

test("Runway owner completion records direct expense and waits for measured support cost", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /supporting_cost_status\s+text\s+not\s+null\s+default\s+'pending'/i);
  assert.match(sql, /direct_provider_estimated_micros/i);
  assert.match(sql, /p_direct_provider_actual_micros/i);
  assert.match(sql, /customer_revenue_micros',\s*0/i);
  assert.match(sql, /settle_owner_operation/i);
  assert.match(sql, /pricing_discrepancy',\s*true/i);
});

test("owner pilot activation needs a zero-customer quote, exact cap, and prior reservation", async () => {
  const sql = await readFile(activationMigrationUrl, "utf8");
  assert.match(sql, /create_owner_runway_spending_quote/i);
  assert.match(sql, /reserve_owner_runway_operation/i);
  assert.match(sql, /normal_maximum_charge_micros',0/i);
  assert.match(sql, /customer_credit_units',0/i);
  assert.match(sql, /lifecycle_state\s*<>\s*'draft'/i);
  assert.match(sql, /markup_basis_points\s+is\s+not\s+null/i);
  assert.match(sql, /maximum_amount_micros\s*<>\s*750000/i);
  assert.match(sql, /approved bounded owner Runway reservation required before activation/i);
  assert.match(sql, /customer_settlement_enabled',false/i);
});

test("closed owner budgets retain settlement authority only for in-period reservations", async () => {
  const sql = await readFile(activationMigrationUrl, "utf8");
  assert.match(sql, /v_revision\.status\s+not\s+in\s*\('active','paused','closed'\)/i);
  assert.match(sql, /v_reservation\.created_at\s*<\s*v_budget\.period_start/i);
  assert.match(sql, /v_reservation\.created_at\s*>?=\s*v_budget\.period_end/i);
});
