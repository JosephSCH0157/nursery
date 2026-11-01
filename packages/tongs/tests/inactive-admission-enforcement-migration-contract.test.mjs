import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../supabase/migrations/20261101201817_forge_inactive_admission_enforcement.sql", import.meta.url),
  "utf8",
);

test("canonical admission projection is the only prepared admission decision", () => {
  for (const functionName of [
    "require_account_admission",
    "current_request_is_admitted",
    "account_admission_pre_request",
    "_guard_new_customer_financial_authorization",
  ]) {
    assert.match(migration, new RegExp(`create or replace function tongs\\.${functionName.replaceAll("_", "_")}`));
  }
  assert.match(migration, /account_admissions admission[\s\S]+effective_state = 'admitted'/);
  assert.doesNotMatch(migration, /legacy_account_admission_cohort[\s\S]+return true/i);
});

test("Data API and Storage enforcement remain inactive", () => {
  assert.doesNotMatch(migration, /create\s+policy/i);
  assert.doesNotMatch(migration, /pgrst\.db_pre_request\s*=/i);
  assert.doesNotMatch(migration, /alter\s+(role|database)/i);
});

test("financial admission guard covers only new acceptance and reservation inserts", () => {
  assert.match(migration, /before insert on tongs\.customer_spending_quote_acceptances/);
  assert.match(migration, /before insert on tongs\.funding_reservations/);
  assert.doesNotMatch(migration, /before\s+(update|delete)[^;]+_guard_new_customer_financial_authorization/i);
});

test("service role can execute only the exact UUID admission boundary", () => {
  assert.match(migration, /grant execute on function tongs\.require_account_admission\(uuid\)[^;]+to service_role/);
  assert.doesNotMatch(migration, /grant execute on function tongs\.require_account_admission\(uuid\)[^;]+to authenticated/);
});
