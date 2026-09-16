import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

test("owner billing controls stay operator-RPC backed and require explicit publication approval", () => {
  const ledger = read("apps/nursery/src/routes/Ledger.tsx");
  const consoleSource = read("apps/nursery/src/components/OwnerBillingConsole.tsx");
  assert.match(ledger, /ownerAccess === "operator"/);
  assert.match(consoleSource, /read_owner_billing_console/);
  assert.match(consoleSource, /commit_private_markup_rule_revision/);
  assert.match(consoleSource, /commit_operator_pricing_revision/);
  assert.match(consoleSource, /I approve this exact customer price/);
  assert.match(consoleSource, /Markup is the percentage added to cost; profit margin is contribution profit divided by customer revenue/);
  assert.doesNotMatch(consoleSource, /42c3de1d-bd24-41fe-abd9-640f17518b2c/);
});

test("Hearth uses the customer-safe quote acceptance contract without browser confirmation", () => {
  const authority = read("apps/hearth/src/lib/hearth-broll-v2-authority.ts");
  const hook = read("apps/hearth/src/hooks/visuals/useCanonicalBrollV2.ts");
  const panel = read("apps/hearth/src/components/visuals/BrollPlanPanel.tsx");
  assert.match(authority, /accepted_spending_quote_id/);
  assert.match(authority, /accepted_spending_quote_hash/);
  assert.doesNotMatch(hook, /window\.confirm/);
  assert.match(panel, /Normal maximum charge/);
  assert.match(panel, /Billable-failure maximum/);
  assert.match(panel, /Only funding from the active financial environment can be used/);
  assert.match(panel, /A pending receipt is not a confirmed charge/);
});

test("Runway server obtains a quote and funded reservation before paid authorization", () => {
  const api = read("packages/tongs/src/workpiece-commit-api.ts");
  const quote = api.indexOf('"create_customer_runway_quote"');
  const reserve = api.indexOf('"reserve_customer_runway_quote"');
  const authorize = api.indexOf("authorizeSubmission(", reserve);
  const providerSubmit = api.indexOf("this.brollVideoProvider.submit", authorize);
  assert.ok(quote > 0 && reserve > quote && authorize > reserve && providerSubmit > authorize);
  assert.match(api, /runway_insufficient_verified_funds/);
  assert.match(api, /runway_customer_spending_disabled/);
  assert.match(api, /runway_quote_expired/);
});

test("Stripe fee evidence is finalized before a Live compatibility grant can be used", () => {
  const webhook = read("supabase/functions/stripe-webhook/index.ts");
  const deposit = webhook.indexOf("const deposit = await recordCustomerDepositAccounting");
  const fee = webhook.indexOf("await recordCustomerDepositProcessorFee", deposit);
  const liveGrant = webhook.indexOf("if (event.livemode === true)", fee);
  assert.ok(deposit > 0 && fee > deposit && liveGrant > fee);
  assert.match(webhook, /stripe_balance_transaction/);
  assert.match(webhook, /payment_intent required for processor-fee finalization/);
  assert.match(webhook, /Test deposit processor fee remains pending/);
});

test("Test and Live funding are displayed separately while using one canonical financial path", () => {
  const subscriptions = read("apps/nursery/src/routes/Subscriptions.tsx");
  const ledger = read("apps/nursery/src/routes/Ledger.tsx");
  const migration = read("supabase/migrations/20261011140000_tongs_unified_financial_environment.sql");
  assert.match(subscriptions, /Environment-separated funding/);
  assert.match(subscriptions, /Test and Live purchases use the same financial workflow/);
  assert.match(subscriptions, /active_spendable/);
  assert.match(subscriptions, /legacy historical balance/i);
  assert.match(ledger, /AI credits/);
  assert.match(migration, /forge\.customer-financial-path\.v2/);
  assert.match(migration, /forge\.customer-funding\.v2/);
  assert.match(migration, /provider_execution_eligible/);
  assert.match(migration, /insert into tongs\.customer_deposit_consumptions/);
  assert.match(migration, /revoke all on function %s from public, anon, authenticated, service_role/);
});

test("the migration adds no operator identity, markup value, budget, or control activation", () => {
  const migration = read("supabase/migrations/20260917120000_tongs_pricing_customer_interface.sql");
  assert.doesNotMatch(migration, /42c3de1d-bd24-41fe-abd9-640f17518b2c/);
  assert.doesNotMatch(migration, /insert into tongs\.paid_execution_control_revisions/i);
  assert.doesNotMatch(migration, /insert into tongs\.owner_operating_budget/i);
  assert.match(migration, /This release creates no pricing data/);
  assert.match(migration, /platform operator required/);
  assert.match(migration, /insufficient verified funding/);
});
