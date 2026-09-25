import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration=readFileSync(new URL("../../../supabase/migrations/20261011730000_runway_gen45_customer_test_product.sql",import.meta.url),"utf8");
const panel=readFileSync(new URL("../../../apps/hearth/src/components/visuals/BrollPlanPanel.tsx",import.meta.url),"utf8");
const panelProps=readFileSync(new URL("../../../apps/hearth/src/hooks/visuals/buildVisualsPanelProps.ts",import.meta.url),"utf8");
const service=readFileSync(new URL("../src/workpiece-commit-api.ts",import.meta.url),"utf8");
const boundary=readFileSync(new URL("../src/providers/runway-paid-execution-boundary.ts",import.meta.url),"utf8");

test("Runway Gen-4.5 customer Test economics use only proved supplier cost",()=>{
  assert.match(migration,/12 Runway credits\/second x \$0\.01 = \$0\.60/);
  assert.match(migration,/600000,600000,800000,0,160/);
  assert.match(migration,/798000,2000,800000/);
  assert.match(migration,/application_compute[\s\S]*?classification":"C"/);
  assert.match(migration,/storage_retention[\s\S]*?classification":"D"/);
  assert.match(migration,/delivery_egress[\s\S]*?classification":"D"/);
  assert.match(migration,/database_observability[\s\S]*?classification":"C"/);
  assert.match(migration,/supporting_contingency[\s\S]*?classification":"D"/);
  assert.match(migration,/supporting_cost_ceiling_micros":0/);
  assert.match(migration,/pricing_page_sha256/);
  assert.match(migration,/task_failures_page_sha256/);
});

test("activation is one exact normal-customer Test operation and leaves Live inactive",()=>{
  assert.match(migration,/operation_id text not null unique/);
  assert.match(migration,/operation_fingerprint text not null unique/);
  assert.match(migration,/maximum_operation_count integer not null check\(maximum_operation_count=1\)/);
  assert.match(migration,/maximum_concurrency integer not null check\(maximum_concurrency=1\)/);
  assert.match(migration,/reference_image_count integer not null check\(reference_image_count=0\)/);
  assert.match(migration,/maximum_provider_attempts integer not null check\(maximum_provider_attempts=1\)/);
  assert.match(migration,/financial_environment text not null check\(financial_environment='test'\)/);
  assert.match(migration,/set_config\('request\.jwt\.claim\.role','service_role',true\)[\s\S]*activate_runway_gen45_customer_test[\s\S]*set_config\('request\.jwt\.claim\.role','',true\)/);
  assert.match(migration,/Live must remain inactive-ready/);
  assert.match(migration,/No fallback, retry, Seedance, Owner, BYO, or Live scope/);
});

test("quote and reservation require the exact Test binding and service role",()=>{
  assert.match(migration,/runway_customer_test_quote_bindings/);
  assert.match(migration,/customer_spending_quote_acceptances/);
  assert.match(migration,/runway_test_authorization_id/);
  assert.match(migration,/q\.normal_maximum_charge_micros<>800000/);
  assert.match(migration,/q\.billable_failure_maximum_charge_micros<>0/);
  assert.match(migration,/q\.customer_credit_units<>160/);
  assert.match(migration,/revoke all on function tongs\.create_customer_runway_quote[\s\S]*?from public,anon,authenticated/);
  assert.match(migration,/grant execute on function tongs\.create_customer_runway_quote[\s\S]*?to service_role/);
  assert.match(migration,/revoke all on function tongs\.reserve_customer_runway_quote[\s\S]*?from public,anon,authenticated/);
  assert.match(migration,/grant execute on function tongs\.reserve_customer_runway_quote[\s\S]*?to service_role/);
});

test("confirmation is local UI, Forge-Credit first, and precedes reservation",()=>{
  assert.match(panel,/data-testid="runway-price-confirmation"/);
  assert.match(panel,/Generate one 5-second Runway Gen-4\.5 video/);
  assert.match(panel,/Failed operations do not consume Forge Credits/);
  assert.match(panel,/Runway has not been called and no credits are reserved until you accept/);
  assert.match(panel,/Accept \{props\.spendingQuote\.customerCreditUnits\}/);
  assert.doesNotMatch(panel,/window\.confirm|globalThis\.confirm/);
  assert.match(panelProps,/spendingQuote: args\.spendingQuote/);
  assert.match(panelProps,/onAcceptSpendingQuote: args\.onAcceptSpendingQuote/);
  assert.match(panelProps,/onDismissSpendingQuote: args\.onDismissSpendingQuote/);
  const quoteIndex=service.indexOf('"create_customer_runway_quote"');
  const acceptanceIndex=service.indexOf('"accept_quote"',quoteIndex);
  const reservationIndex=service.indexOf('"reserve_customer_runway_quote"',acceptanceIndex);
  const providerIndex=service.indexOf("this.brollVideoProvider.submit",reservationIndex);
  assert.ok(quoteIndex>0 && acceptanceIndex>quoteIndex && reservationIndex>acceptanceIndex && providerIndex>reservationIndex);
});

test("submission replay, ambiguity, release, persistence, and settlement remain fail closed",()=>{
  assert.match(service,/begin_broll_runway_submission/);
  assert.match(service,/record_broll_runway_task/);
  assert.match(service,/mark_broll_submission_unknown/);
  assert.match(service,/record_broll_provider_or_upload_result/);
  assert.match(service,/commit_broll_candidate/);
  assert.match(boundary,/recordDefinitiveRejection/);
  assert.match(boundary,/"release_operation"/);
  assert.match(boundary,/markSubmissionUnknown/);
  assert.match(boundary,/recordProviderFailure/);
  assert.match(boundary,/customer_charge_micros: 0/);
  assert.match(boundary,/recordCanonicalSuccessForReconciliation/);
  assert.match(migration,/existing_authoritative_admission/);
});
