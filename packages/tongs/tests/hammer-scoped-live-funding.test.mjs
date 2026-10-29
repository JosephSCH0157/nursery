import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const migration = readFileSync(resolve(root,
  "supabase/migrations/20261029033827_hammer_scoped_live_funding.sql"), "utf8");
const checkout = readFileSync(resolve(root,
  "supabase/functions/create-one-time-checkout-session/index.ts"), "utf8");

test("scoped Live funding is exact, private, inert, and leaves global Test unchanged", () => {
  assert.match(migration, /user_id<>'71daf61b-57b3-4e5f-a8c8-64befecb5950'::uuid/);
  assert.match(migration, /workspace_id<>'cc5478ff-37be-403e-824c-467fa7da061e'::uuid/);
  assert.match(migration, /workpiece_id<>'21d16d6a-905b-491e-8761-028789612ae5'::uuid/);
  assert.match(migration, /route_code text not null check \(route_code='hammer\.transcript_prep'\)/);
  assert.match(migration, /financial_environment text not null check \(financial_environment='live'\)/);
  assert.match(migration, /maximum_checkout_sessions smallint not null check \(maximum_checkout_sessions=1\)/);
  assert.match(migration, /gross_amount_micros bigint not null check \(gross_amount_micros=10000000\)/);
  assert.match(migration, /credit_units bigint not null check \(credit_units=2000\)/);
  assert.match(migration, /force row level security/g);
  assert.match(migration, /revoke all on tongs\.hammer_scoped_live_funding_authorities from public,anon,authenticated,service_role/);
  assert.match(migration, /tongs\._current_financial_environment\(\)<>'test'/);
  assert.doesNotMatch(migration, /insert into tongs\.(customer_deposits|customer_spending_quotes|funding_reservations|hammer_transcription_operations)/i);
});

test("one checkout claim is consumed before Stripe mutation and recorded after session creation", () => {
  const claim = checkout.indexOf('"claim_hammer_scoped_live_checkout"');
  const customerCreate = checkout.indexOf("stripe.customers.create");
  const sessionCreate = checkout.indexOf("stripe.checkout.sessions.create");
  const sessionRecord = checkout.indexOf('"record_hammer_scoped_live_checkout_session"');
  assert.ok(claim >= 0 && claim < customerCreate && claim < sessionCreate);
  assert.ok(sessionRecord > sessionCreate);
  assert.match(checkout, /financialEnvironment = "live"/);
  assert.match(checkout, /forge_hammer_live_funding_claim_id/);
  assert.match(checkout, /no retry is permitted/);
  assert.doesNotMatch(checkout, /record_customer_deposit|grant_ai_credits/);
});

test("ordinary customers retain the global environment and product availability gates", () => {
  assert.match(checkout, /financialEnvironment = await readTrustedFinancialEnvironment\(tongsRpc\)/);
  assert.match(checkout, /"read_credit_pack_purchase_availability"/);
  assert.match(checkout, /FORGE_CREDIT_PURCHASES_UNAVAILABLE/);
});

test("Live quote stamping requires the exact paid session and processor-fee evidence", () => {
  assert.match(migration, /claim\.stripe_session_id is not null/);
  assert.match(migration, /join tongs\.customer_deposits deposit/);
  assert.match(migration, /deposit\.stripe_mode='live'/);
  assert.match(migration, /join tongs\.customer_deposit_processor_fees fee on fee\.deposit_id=deposit\.id/);
  assert.match(migration, /quote_row\.financial_environment<>authority\.financial_environment/);
  assert.match(migration, /cross-environment customer funding is forbidden/);
});

test("reservation remains one-operation, one-deposit, and exact-exposure bounded", () => {
  assert.match(migration, /new\.funding_source_type<>'customer_deposit'/);
  assert.match(migration, /new\.reserved_customer_charge_micros>60000/);
  assert.match(migration, /new\.reserved_credit_units>12/);
  assert.match(migration, /new\.reserved_wholesale_spend_micros>44589/);
  assert.match(migration, /if prior_count>=1 then raise exception 'Hammer Live funding operation limit reached'/);
});
