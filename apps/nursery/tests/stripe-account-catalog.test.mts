import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { STRIPE_CATALOG, findStripeCatalogPriceById } from '../../../supabase/functions/_shared/stripe-catalog.ts';
import * as accounts from '../../../supabase/functions/_shared/stripe-account-catalog.ts';
import * as lifecycle from '../../../supabase/functions/_shared/subscription-lifecycle.ts';
import * as billingMetadata from '../../../supabase/functions/_shared/forge-billing-metadata.ts';
import * as invoiceCompat from '../../../supabase/functions/_shared/stripe-invoice-compat.ts';
import * as storageAuthority from '../../../supabase/functions/_shared/storage-subscription-authority.ts';
import * as financial from '../../../supabase/functions/_shared/financial-environment.ts';
import { recurringPriceAuthority, paidSubscriptionServicePeriod } from '../../../supabase/functions/_shared/subscription-lifecycle.ts';
import { resolveStorageSubscriptionMetadata } from '../../../supabase/functions/_shared/storage-subscription-authority.ts';
const { FORGE_STRIPE_ACCOUNT: original, FORGE_STRIPE_SANDBOX: sandbox, SANDBOX_STORAGE_PRICES: prices, findAccountStripePrice: find, verifyStripeWebhookAccount: verify } = accounts;
const context = { accountId: sandbox, environment: 'test' as const };
const user = '11111111-1111-4111-8111-111111111111';
const entries = Object.entries(prices);
function fixture(priceId = entries[0][0]) {
  const price = { id: priceId, type: 'recurring', unit_amount: 500, recurring: { interval: 'month', interval_count: 1 } };
  const sub = { id: 'sub_synthetic', customer: 'cus_synthetic', livemode: false, status: 'active', current_period_start: 1800000000, current_period_end: 1802592000,
    metadata: { forge_purchase_type: 'cloud_storage', forge_storage_level: '50gb_v2' }, items: { data: [{ quantity: 1, price }] } };
  const invoice = { id: 'in_synthetic', subscription: sub.id, customer: sub.customer, livemode: false, status: 'paid', paid: true, amount_paid: 0, amount_remaining: 0, billing_reason: 'subscription_cycle',
    lines: { data: [{ subscription: sub.id, price, quantity: 1, amount: 500, period: { start: sub.current_period_start, end: sub.current_period_end } }] } };
  return { sub, invoice };
}
for (const [priceId, binding] of entries) {
  test(`sandbox ${binding.level} uses the canonical offer only in its account/environment`, () => {
    const match = find(priceId, context);
    assert.equal(match?.kind, 'storage');
    assert.equal(match?.offerId, STRIPE_CATALOG.storage[binding.level].offerId);
    assert.equal(findStripeCatalogPriceById(priceId), null, 'sandbox is not a global alias');
    for (const accountId of [original, sandbox, 'acct_unknown']) {
      for (const environment of ['live', 'test'] as const) {
        if (accountId !== sandbox || environment !== 'test') assert.equal(find(priceId, { accountId, environment }), null);
      }
    }
    const { sub, invoice } = fixture(priceId);
    assert.equal(recurringPriceAuthority(sub, user, context).itemId, binding.level);
    assert.equal(resolveStorageSubscriptionMetadata(sub, user, undefined, context)?.itemId, binding.level, 'stale metadata never selects capacity');
    assert.equal(paidSubscriptionServicePeriod(invoice, sub, binding.level, context)?.price_id, priceId);
    assert.throws(() => recurringPriceAuthority(sub, user));
    assert.throws(() => recurringPriceAuthority(sub, user, { accountId: original, environment: 'test' }));
    assert.throws(() => paidSubscriptionServicePeriod(invoice, sub, binding.level, { accountId: original, environment: 'test' }));
    sub.livemode = true;
    assert.throws(() => recurringPriceAuthority(sub, user, context), /mode/);
    assert.throws(() => resolveStorageSubscriptionMetadata(sub, user, undefined, context), /mode/);
    assert.throws(() => paidSubscriptionServicePeriod(invoice, sub, binding.level, context), /mode/);
  });
}
test('all original catalog IDs, including legacy purchases, keep their original mode and offer', () => {
  const offers = [ ...Object.values(STRIPE_CATALOG.storage), ...Object.values(STRIPE_CATALOG.plans).flatMap(Object.values), ...Object.values(STRIPE_CATALOG.addons).flatMap(Object.values), ...Object.values(STRIPE_CATALOG.packs).flatMap(Object.values) ];
  for (const offer of offers) {
    for (const environment of ['test', 'live'] as const) {
      const ids = environment === 'test' ? [offer.testPriceId, ...('legacyTestPriceIds' in offer ? offer.legacyTestPriceIds : [])] : [offer.livePriceId, ...('legacyLivePriceIds' in offer ? offer.legacyLivePriceIds : [])];
      for (const id of ids) {
        assert.deepEqual(find(id, { accountId: original, environment }), findStripeCatalogPriceById(id));
        assert.equal(find(id, context), null);
        assert.equal(find(id, { accountId: original, environment: environment === 'test' ? 'live' : 'test' }), null);
      }
    }
  }
});
test('unknown IDs cannot authorize storage through names, metadata, or prototype properties', () => {
  for (const id of ['price_unknown', '__proto__', 'constructor', 'toString', ` ${entries[0][0]}`]) {
    assert.equal(find(id, context), null);
    const { sub, invoice } = fixture(id);
    assert.throws(() => recurringPriceAuthority(sub, user, context));
    assert.throws(() => resolveStorageSubscriptionMetadata(sub, user, undefined, context));
    assert.throws(() => paidSubscriptionServicePeriod(invoice, sub, '50gb_v2', context));
  }
});
const valid = { configuredAccountId: sandbox, verifiedAccountId: sandbox, livemode: false, supabaseUrl: 'http://127.0.0.1:54321' };
test('sandbox requires authenticated account identity, Test mode and a loopback destination', () => {
  assert.deepEqual(verify(valid), context);
  for (const host of ['localhost', '[::1]']) assert.deepEqual(verify({ ...valid, supabaseUrl: `http://${host}:54321` }), context);
  for (const change of [
    { configuredAccountId: undefined }, { configuredAccountId: original }, { verifiedAccountId: original }, { eventAccountId: original }, { livemode: true },
    ...['https://wtvdjndyxegudufrompx.supabase.co', 'http://127.0.0.1.evil.test', 'https://localhost', 'http://localhost@evil.test', 'http://evil@localhost', 'http://localhost/proxy', 'http://localhost?target=prod', 'http://localhost#prod'].map(supabaseUrl => ({ supabaseUrl })),
  ]) assert.throws(() => verify({ ...valid, ...change }));
  assert.throws(() => verify({ ...valid, configuredAccountId: 'acct_unknown', verifiedAccountId: 'acct_unknown' }));
  for (const livemode of [false, true]) assert.deepEqual(verify({ verifiedAccountId: original, livemode, supabaseUrl: 'https://wtvdjndyxegudufrompx.supabase.co' }), { accountId: original, environment: livemode ? 'live' : 'test' });
});

// Execute the real webhook entrypoint with inert provider/database adapters.
// This proves pre-dispatch rejection, not genuine Stripe webhook delivery.
const source = readFileSync(new URL('../../../supabase/functions/stripe-webhook/index.ts', import.meta.url), 'utf8');
const executable = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/^import[\s\S]*?from ["'][^"']+["'];\s*/gm, '');
async function dispatch(options: { account?: string; configured?: string; url?: string; live?: boolean; databaseMode?: string; failIdentity?: boolean; eventAccount?: string; subscriptionPrice?: string; eventType?: string; status?: string }) {
  let handler!: (request: Request) => Promise<Response>;
  const calls: string[] = [];
  const { sub, invoice } = fixture(options.subscriptionPrice);
  Object.assign(sub, { latest_invoice: invoice.id, status: options.status ?? 'active', metadata: { ...sub.metadata, supabase_user_id: user } });
  const commits: Record<string, unknown>[] = [];
  const event = { id: 'evt_synthetic', type: options.eventType ?? 'certification.unhandled', livemode: options.live ?? false, account: options.eventAccount, data: { object: sub } };
  runInNewContext(executable, {
    ...accounts, ...financial, ...lifecycle, ...billingMetadata, ...invoiceCompat, ...storageAuthority, Response, console: { log() {}, error() {} },
    Deno: { env: { get: (name: string) => ({ STRIPE_ACCOUNT_ID: options.configured ?? sandbox, SUPABASE_URL: options.url ?? valid.supabaseUrl, STRIPE_SECRET_KEY: 'sk_test_synthetic', STRIPE_WEBHOOK_SECRET: 'whsec_synthetic', SUPABASE_SERVICE_ROLE_KEY: 'synthetic' })[name] } },
    Stripe: class { webhooks = { constructEventAsync: async () => event }; accounts = { retrieve: async () => { calls.push('stripe-account'); if (options.failIdentity) throw Error('unavailable'); return { id: options.account ?? sandbox }; } }; subscriptions = { retrieve: async () => sub }; invoices = { retrieve: async () => invoice }; customers = { retrieve: async () => ({ id: sub.customer, email: 'fixture@example.invalid', name: 'Synthetic' }) }; },
    createClient: () => ({ schema: () => ({ rpc: async (name: string, args: Record<string, unknown>) => { calls.push(name); if (name === 'read_financial_runtime_environment') return { data: { financial_environment: options.databaseMode ?? 'test' }, error: null }; if (name === 'begin_subscription_refresh') return { data: { token: 'synthetic-fence' }, error: null }; if (name === 'commit_subscription_refresh') { commits.push(args); return { data: { outcome: 'committed' }, error: null }; } assert.ok(['upsert_billing_customer', 'record_billing_event'].includes(name), name); return { data: null, error: null }; } }) }),
    serve: (callback: typeof handler) => { handler = callback; },
  });
  const response = await handler(new Request('http://localhost/webhook', { method: 'POST', body: '{}' }));
  return { response, calls, commits };
}
test('real webhook rejects sandbox-to-hosted, mismatched accounts and unavailable identity before any DB RPC', async () => {
  for (const options of [{ url: 'https://wtvdjndyxegudufrompx.supabase.co' }, { account: original }, { eventAccount: original }, { failIdentity: true }, { live: true }]) {
    const { response, calls } = await dispatch(options);
    assert.equal(response.status, 400);
    assert.deepEqual(calls, ['stripe-account']);
  }
});
test('real webhook retains database-mode guard after account verification', async () => {
  const denied = await dispatch({ databaseMode: 'live' });
  assert.equal(denied.response.status, 400);
  assert.deepEqual(denied.calls, ['stripe-account', 'read_financial_runtime_environment']);
  const allowed = await dispatch({});
  assert.equal(allowed.response.status, 200);
  assert.deepEqual(allowed.calls, ['stripe-account', 'read_financial_runtime_environment']);
});

for (const eventType of ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted']) {
  test(`webhook ${eventType} threads sandbox account into fenced refresh and service period`, async () => {
    for (const [priceId, binding] of entries) {
      const result = await dispatch({ eventType, subscriptionPrice: priceId, status: eventType.endsWith('deleted') ? 'canceled' : 'active' });
      assert.equal(result.response.status, 200, await result.response.text());
      assert.equal(result.commits.length, 1);
      const commit = result.commits[0];
      assert.equal(commit.p_livemode, false);
      assert.equal((commit.p_snapshot as Record<string, unknown>).price_id, priceId);
      assert.equal((commit.p_snapshot as Record<string, unknown>).item_id, binding.level);
      if (eventType.endsWith('deleted')) assert.equal(commit.p_service_period, null);
      else assert.equal((commit.p_service_period as Record<string, unknown>).amount_paid, 0);
    }
  });
}
test('cross-account and unknown prices never reach a subscription commit despite valid metadata', async () => {
  for (const subscriptionPrice of [STRIPE_CATALOG.storage['50gb_v2'].testPriceId, 'price_unapproved']) {
    const result = await dispatch({ eventType: 'customer.subscription.created', subscriptionPrice });
    assert.equal(result.response.status, 400);
    assert.equal(result.commits.length, 0);
    assert.deepEqual(result.calls, ['stripe-account', 'read_financial_runtime_environment']);
  }
});
