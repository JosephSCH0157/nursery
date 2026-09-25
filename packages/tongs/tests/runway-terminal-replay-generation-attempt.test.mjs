import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration=readFileSync(new URL("../../../supabase/migrations/20261011770000_broll_terminal_replay_generation_attempt.sql",import.meta.url),"utf8");
const service=readFileSync(new URL("../src/workpiece-commit-api.ts",import.meta.url),"utf8");
const authority=readFileSync(new URL("../../../apps/hearth/src/lib/hearth-broll-v2-authority.ts",import.meta.url),"utf8");
const hook=readFileSync(new URL("../../../apps/hearth/src/hooks/visuals/useCanonicalBrollV2.ts",import.meta.url),"utf8");
const panel=readFileSync(new URL("../../../apps/hearth/src/components/visuals/BrollPlanPanel.tsx",import.meta.url),"utf8");

test("terminal customer pre-provider failure replays without mutation",()=>{
  assert.match(migration,/version='20261011760000'/);
  assert.match(migration,/create or replace function tongs\._is_terminal_customer_runway_preprovider_failure/);
  assert.match(migration,/state='failed'[\s\S]*failed_stage='runway_financial_preflight'[\s\S]*failure_code='runway_funding_required'/);
  assert.match(migration,/event\.event_type='released'[\s\S]*aggregate_exposure_exhausted[\s\S]*transmitted/);
  assert.match(migration,/not exists\(select 1 from tongs\.runway_submission_boundary_events/);
  assert.match(migration,/not exists\(select 1 from tongs\.runway_execution_reconciliation_receipts/);
  const terminal=migration.indexOf("'disposition','terminal_failure_replay'");
  const rearm=migration.indexOf("update tongs.broll_operation_receipts set",terminal);
  assert.ok(terminal>0 && rearm>terminal,"terminal replay must return before the legacy rearm update");
  assert.match(migration,/submission_attempt_id='03c8e49d-4c61-4573-a4ac-24711668e236'/);
});

test("legacy recoverable failures retain their prior rearm semantics",()=>{
  assert.match(migration,/if v_op\.state='failed' then[\s\S]*_is_terminal_customer_runway_preprovider_failure[\s\S]*state=case[\s\S]*verified_poster_asset_id[\s\S]*provider_response_json[\s\S]*else 'pending'/);
});

test("one immutable creator-initiated replacement supplements the creative hash",()=>{
  assert.match(migration,/create table tongs\.broll_generation_replacement_scopes/);
  assert.match(migration,/maximum_replacement_attempts integer not null check\(maximum_replacement_attempts=1\)/);
  assert.match(migration,/create table tongs\.broll_generation_attempts/);
  assert.match(migration,/replacement_scope_id uuid not null unique/);
  assert.match(migration,/creative_input_hash text not null/);
  assert.match(migration,/uuid_generate_v5\(v_scope\.id,'generation-attempt-2'\)/);
  assert.match(migration,/generation_attempt_replay/);
  assert.match(migration,/original generation is not a definitive untransmitted terminal failure/);
  assert.match(migration,/canonical prompt authority changed before replacement attempt/);
  assert.match(migration,/v_operation_id:='forge:broll:acquire:'\|\|v_operation_fingerprint/);
});

test("replacement has separate exact Test authorization and no automatic financial action",()=>{
  assert.match(migration,/insert into tongs\.runway_customer_test_authorizations/);
  assert.match(migration,/'text_to_video',5,'1280:720',1,0,1/);
  assert.match(migration,/1,800000,600000,1/);
  assert.match(migration,/customer_failure_charge_micros bigint not null check\(customer_failure_charge_micros=0\)/);
  const start=migration.match(/create or replace function tongs\.start_customer_runway_generation_attempt[\s\S]*?end \$\$;/)?.[0]??"";
  assert.doesNotMatch(start,/accept_quote|reserve_customer_runway_quote|runway_submission_boundary_events|provider_task_id/);
  assert.match(service,/terminal_failure_replay[\s\S]*broll_terminal_generation_attempt/);
  assert.match(service,/generation_request_id: input\.generation_request_id/);
});

test("replacement tables are RLS-forced and direct customer writes remain denied",()=>{
  assert.match(migration,/enable row level security/);
  assert.match(migration,/force row level security/);
  assert.match(migration,/revoke all on tongs\.%I from public,anon,authenticated,service_role/);
  assert.match(migration,/grant select on tongs\.%I to service_role/);
  assert.match(migration,/revoke all on function tongs\.start_customer_runway_generation_attempt[\s\S]*from public,anon/);
  assert.match(migration,/grant execute on function tongs\.start_customer_runway_generation_attempt[\s\S]*to authenticated/);
  assert.match(migration,/environment='live'[\s\S]*?<>'inactive_ready'/);
});

test("Hearth requires explicit new-attempt action and preserves identity through quote acceptance",()=>{
  assert.match(authority,/startReplacementRunwayGenerationAttempt/);
  assert.match(authority,/p_creative_input_hash: creative\.creativeInputHash/);
  assert.match(authority,/generation_request_id: args\.generationAttempt\?\.generationRequestId/);
  assert.match(authority,/operation_fingerprint: fingerprint/);
  assert.match(hook,/quote\.code === "broll_terminal_generation_attempt"/);
  assert.match(hook,/startNewGenerationAttempt/);
  assert.match(hook,/generationAttempt: started\.data/);
  assert.match(hook,/acceptedQuote: spendingQuote,[\s\S]*generationAttempt: pendingGeneration\.generationAttempt/);
  assert.match(panel,/Previous generation attempt ended before Runway was called\. No Forge Credits were charged\./);
  assert.match(panel,/Start a new generation attempt/);
  assert.doesNotMatch(panel,/window\.confirm/);
});
