import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../supabase/migrations/20261029154824_hammer_brad_first_transcription_authority_bundle.sql",
  import.meta.url,
);
const migration = await readFile(migrationUrl, "utf8");

test("migration is inert and exposes one service-only bundle installer", () => {
  const outsideInstaller = migration
    .replace(/create or replace function tongs\.install_brad_hammer_first_transcription_authority_bundle[\s\S]*?end \$\$;/i, "")
    .replace(/comment on function[\s\S]*?;/i, "");

  assert.doesNotMatch(
    outsideInstaller,
    /insert into tongs\.(?:private_pricing_revisions|restricted_beta_policy_revisions|hammer_first_transcription_activation_authorities|hammer_scoped_live_funding_authorities)/i,
  );
  assert.match(migration, /perform tongs\._require_pricing_service_role\(\)/i);
  assert.match(migration, /revoke all on function[\s\S]*from public,anon,authenticated/i);
  assert.match(migration, /grant execute on function[\s\S]*to service_role/i);
  assert.match(migration, /authority-bundle migration must remain financially inert/i);
  assert.match(migration, /_current_financial_environment\(\)<>'test'/i);
});

test("bundle is bound to Brad's exact canonical full episode", () => {
  for (const expected of [
    "71daf61b-57b3-4e5f-a8c8-64befecb5950",
    "cc5478ff-37be-403e-824c-467fa7da061e",
    "21d16d6a-905b-491e-8761-028789612ae5",
    "4cc846e3-187c-46d9-8733-e7402488236c",
    "9c991aa7-f551-4f03-a4d6-41eb40ef81ec",
    "bf67d649-1bc2-44ba-9a33-783b3ab523ea",
    "595ea9d8abc571a5e92be6eec0c5e5c23e82a6a6956a598dc391c82d80224e24",
  ]) {
    assert.match(migration, new RegExp(expected));
  }
  assert.match(migration, /603848/);
  assert.match(migration, /120617428/);
  assert.match(migration, /canonical Brad recording evidence drifted/i);
});

test("price and exposure are exact, whole-credit rounded, and single-attempt", () => {
  assert.match(migration, /full_cost_ceiling_micros=44589/);
  assert.match(migration, /failure_cost_ceiling_micros=6000/);
  assert.match(migration, /customer_price_ceiling_micros=60000/);
  assert.match(migration, /customer_credit_units=12/);
  assert.match(migration, /unrounded_customer_price_micros,rounding_adjustment_micros,settled_customer_price_micros[\s\S]*59304,696,60000/i);
  assert.match(migration, /supplier_rate_micros_per_hour',230000/);
  assert.match(migration, /maximum_attempts',1/);
  assert.match(migration, /automatic_retries',0/);
  assert.match(migration, /maximum_checkout_sessions',1/);
  assert.match(migration, /maximum_provider_attempts',1/);
});

test("current account and capacity evidence fail closed", () => {
  assert.match(migration, /p_account_evidence_sha256 !~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(migration, /p_capacity_evidence_sha256 !~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(migration, /p_supabase_spend_cap_enabled is not true/);
  assert.match(migration, /p_capacity_expires_at-p_capacity_checked_at>interval '24 hours'/);
  assert.match(migration, /p_valid_until>least\(p_account_expires_at,p_capacity_expires_at\)/);
  assert.match(migration, /state in\('queued','processing','submission_unknown'\)/);
});

test("installation grants neither funds nor provider execution", () => {
  assert.match(migration, /'execution_authorized',false/);
  assert.match(migration, /'funds_granted',false/);
  assert.match(migration, /'provider_submitted',false/);
  assert.match(migration, /install_hammer_first_transcription_activation/);
  assert.match(migration, /install_hammer_scoped_live_funding_authority/);
  assert.doesNotMatch(migration, /create_hammer_first_transcription_quote\s*\(/i);
  assert.doesNotMatch(migration, /reserve_hammer_first_transcription_quote\s*\(/i);
  assert.doesNotMatch(migration, /authorize_hammer_first_transcription_attempt\s*\(/i);
});
