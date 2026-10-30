import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL(
  "../../../supabase/migrations/20261030224605_hammer_owner_sponsorship_authority_renewal.sql",
  import.meta.url,
), "utf8");

test("renewal preserves immutable history and requires expiry or explicit revocation", () => {
  assert.match(migration, /hammer_first_transcription_activation_revocations/);
  assert.match(migration, /previous\.valid_until>clock_timestamp\(\)[\s\S]*activation_revocations/);
  assert.match(migration, /previous Hammer authority is still active/);
  assert.match(migration, /_reject_accounting_mutation/);
  assert.doesNotMatch(migration, /update\s+tongs\.hammer_first_transcription_activation_authorities/i);
  assert.doesNotMatch(migration, /delete\s+from\s+tongs\.hammer_first_transcription_activation_authorities/i);
});

test("renewal rejects consumed and ambiguous execution state across authority rows", () => {
  assert.match(migration, /hammer_first_transcription_activation_consumptions/);
  assert.match(migration, /hammer_transcription_provider_attempts/);
  assert.match(migration, /operation\.state in \('queued','processing','submission_unknown'\)/);
  assert.match(migration, /provider-attempt allowance is already consumed/);
  assert.match(migration, /renewal cannot reset or duplicate prior execution authority/);
});

test("concurrent renewals and cross-renewal attempt consumption fail closed", () => {
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\([\s\S]*hammer-first-transcription-renewal/);
  assert.match(migration, /tstzrange\(prior\.valid_from,prior\.valid_until,'\[\)'\)[\s\S]*&&[\s\S]*tstzrange\(new\.valid_from,new\.valid_until,'\[\)'\)/);
  assert.match(migration, /overlapping Hammer first-transcription authority is prohibited/);
  assert.match(migration, /hammer_first_transcription_consumption_insert_guard/);
  assert.match(migration, /hammer-first-transcription-consumption/);
});

test("renewal remains exact, service-only, zero-debit, and provider-inactive", () => {
  for (const exact of [
    "4cc846e3-187c-46d9-8733-e7402488236c",
    "9c991aa7-f551-4f03-a4d6-41eb40ef81ec",
    "bf67d649-1bc2-44ba-9a33-783b3ab523ea",
    "595ea9d8abc571a5e92be6eec0c5e5c23e82a6a6956a598dc391c82d80224e24",
  ]) assert.match(migration, new RegExp(exact));
  assert.match(migration, /maximum_wholesale_exposure_micros',44589/);
  assert.match(migration, /customer_payment_micros',0/);
  assert.match(migration, /customer_credit_units',0/);
  assert.match(migration, /maximum_provider_attempts',1/);
  assert.match(migration, /automatic_retries',0/);
  assert.match(migration, /execution_authorized',false/);
  assert.match(migration, /provider_submitted',false/);
  assert.match(migration, /revoke all on function tongs\.renew_hammer_owner_funded_first_transcription_authority/);
  assert.match(migration, /grant execute on function tongs\.renew_hammer_owner_funded_first_transcription_authority[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /grant execute on function tongs\.renew_hammer_owner_funded_first_transcription_authority[\s\S]*to authenticated/);
});
