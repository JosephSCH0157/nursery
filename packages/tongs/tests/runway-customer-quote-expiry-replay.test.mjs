import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration=readFileSync(new URL("../../../supabase/migrations/20261011740000_runway_customer_quote_expiry_replay.sql",import.meta.url),"utf8");
const service=readFileSync(new URL("../src/workpiece-commit-api.ts",import.meta.url),"utf8");

test("forward migration follows the exact customer Runway product",()=>{
  assert.match(migration,/version='20261011730000'/);
  assert.match(migration,/drop constraint customer_spending_quotes_user_id_operation_id_key/);
  assert.match(migration,/primary key\(authorization_id,quote_id\)/);
  assert.match(migration,/maximum_quote_count integer not null default 2 check\(maximum_quote_count=2\)/);
});

test("renewal is limited to one expired, unaccepted, unreserved exact Test operation",()=>{
  assert.match(migration,/scope_authorization\.financial_environment='test'/);
  assert.match(migration,/scope_authorization\.maximum_provider_attempts=1/);
  assert.match(migration,/scope_authorization\.maximum_operation_count=1/);
  assert.match(migration,/not exists\(select 1 from tongs\.customer_spending_quotes current_quote[\s\S]*?current_quote\.expires_at>now\(\)\)/);
  assert.match(migration,/not exists\(select 1 from tongs\.customer_spending_quote_acceptances acceptance/);
  assert.match(migration,/not exists\(select 1 from tongs\.funding_reservations reservation/);
  assert.match(migration,/v_quote_count>=v_authorization\.maximum_quote_count/);
});

test("quote history remains immutable and one operation can still reserve only once",()=>{
  assert.doesNotMatch(migration,/delete from tongs\.customer_spending_quotes|update tongs\.customer_spending_quotes/);
  assert.doesNotMatch(migration,/drop table|truncate/);
  assert.match(migration,/exists\(select 1 from tongs\.funding_reservations group by user_id,operation_id having count\(\*\)>1\)/);
});

test("client proposes a windowed quote but accepts the exact database quote",()=>{
  assert.match(service,/const quoteWindow = Math\.floor\(Date\.now\(\) \/ \(10 \* 60 \* 1000\)\)/);
  assert.match(service,/runway-customer-quote:\$\{auth\.userId\}:\$\{input\.operation_id\}:\$\{input\.operation_fingerprint\}:\$\{quoteWindow\}/);
  assert.match(service,/const quoteId = acceptedQuoteId \?\? proposedQuoteId/);
  assert.doesNotMatch(service,/acceptedQuoteId !== quoteId/);
  const acceptance=service.indexOf('"accept_quote"');
  const reservation=service.indexOf('"reserve_customer_runway_quote"',acceptance);
  const provider=service.indexOf("this.brollVideoProvider.submit",reservation);
  assert.ok(acceptance>0 && reservation>acceptance && provider>reservation);
});

test("renewable quote authority remains service-only, RLS-forced, and Test-only",()=>{
  assert.match(migration,/revoke all on function tongs\.create_customer_runway_quote[\s\S]*from public,anon,authenticated/);
  assert.match(migration,/grant execute on function tongs\.create_customer_runway_quote[\s\S]*to service_role/);
  assert.match(migration,/relrowsecurity and relforcerowsecurity/);
  assert.match(migration,/environment='live'[\s\S]*?<>'inactive_ready'/);
  assert.doesNotMatch(migration,/insert into tongs\.runway_customer_test_authorizations|update tongs\.runway_customer_test_authorizations/);
});
