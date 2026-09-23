import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const correction = readFileSync(resolve(root,
  "supabase/migrations/20260917012316_openai_realized_loss_corrections.sql"), "utf8");
const canary = readFileSync(resolve(root,
  "supabase/migrations/20260917012424_hearth_script_generation_test_canary.sql"), "utf8");
const persistenceBoundary = readFileSync(resolve(root,
  "supabase/migrations/20260917024621_hearth_script_paid_result_persistence_boundary.sql"), "utf8");
const coordinator = readFileSync(resolve(root,
  "packages/tongs/src/providers/paid-openai-text-execution-coordinator.ts"), "utf8");
const paidJson = readFileSync(resolve(root,
  "apps/nursery/server/billing/paid-json-openai-route.ts"), "utf8");
const paidChat = readFileSync(resolve(root,
  "apps/nursery/server/hearth/hearth-paid-chat-execution.ts"), "utf8");
const paidTranscription = readFileSync(resolve(root,
  "apps/nursery/server/billing/paid-openai-transcription-route.ts"), "utf8");
const hearthHandler = readFileSync(resolve(root,
  "apps/nursery/server/hearth/create-hearth-ai-handler.ts"), "utf8");

test("realized-loss corrections are append-only and preserve original expiry timestamps", () => {
  assert.match(correction, /create table tongs\.openai_text_failure_realized_loss_corrections/i);
  assert.match(correction, /openai_text_failure_realized_loss_corrections_immutable/i);
  assert.match(correction, /bafff750-6322-413c-bd6f-c5870e34190f[^]*631,'estimated',0/i);
  assert.match(correction, /a0098b15-f9c1-4fef-b55f-a7341cd8ba6e[^]*96,'estimated',0/i);
  assert.match(correction, /excluded_nonrealized_cost_micros/i);
  assert.match(correction, /when event_type='failure_realized'\s+and created_at>=now\(\)-make_interval/i);
  assert.doesNotMatch(correction, /update\s+tongs\.openai_text_failure_exposure_events/i);
  assert.doesNotMatch(correction, /delete\s+from\s+tongs\.openai_text_failure_exposure_events/i);
});

test("the corrected Test projection is 727 micros and corrections remain environment-isolated", () => {
  const direct = [...correction.matchAll(/'(?:bafff750|a0098b15)[^']*'[^\n]*\n?[^\n]*?'test',(\d+),'estimated',0/gi)]
    .map((match) => Number(match[1]));
  assert.deepEqual(direct.sort((a, b) => a - b), [96, 631]);
  assert.equal(direct.reduce((sum, value) => sum + value, 0), 727);
  assert.match(correction, /financial_environment text not null check\(financial_environment in\('test','live'\)\)/i);
  assert.match(correction, /reservation_environment is distinct from p_financial_environment/i);
});

test("script canary has a distinct direct-only five-credit contract", () => {
  assert.match(canary, /'hearth\.script_generation','hearth','chat_completions',32000,8000,1/i);
  assert.match(canary, /32000,8000,1,16000,0,16000,'complete','active'/i);
  assert.match(canary, /customer_credit_units[^]*21280,3720,25000/i);
  assert.match(canary, /"browsing_requests":0,"retrieval_requests":0/i);
  assert.match(canary, /hearth_script_generation_proposals_immutable/i);
  assert.match(canary, /proposal_state text not null default 'proposed' check\(proposal_state='proposed'\)/i);
  assert.match(canary, /canonical_draft_application_included',false/i);
});

test("the one canary authorization is Test-only and Live stays inactive-ready", () => {
  assert.match(canary, /'test','hearth\.script_generation','openai','gpt-5\.6-luna'/i);
  assert.match(canary, /maximum_operation_count[^]*\n\s*null,25000,16000,1/i);
  assert.match(canary, /route_code='hearth\.script_generation' and financial_environment='live'/i);
  assert.match(canary, /environment='live' order by revision desc limit 1\)<>'inactive_ready'/i);
  const authorization = canary.slice(canary.indexOf("-- One canary scope only:"));
  assert.doesNotMatch(authorization, /'live','hearth\.script_generation','openai'/i);
});

test("script proposals are accepted by the generic paid-result continuation without widening authority", () => {
  assert.match(persistenceBoundary, /v_route not in \([^)]*'hearth\.research_synthesis'[^)]*'hearth\.script_generation'/is);
  assert.match(persistenceBoundary, /_funding_reservation_state\(p_reservation_id\)<>'provider_attempt_shadowed'/i);
  assert.match(persistenceBoundary, /v_binding\.route_code<>v_route or v_quote\.tool<>v_route/i);
  assert.match(persistenceBoundary, /p_input_units>v_binding\.maximum_input_units/i);
  assert.match(persistenceBoundary, /grant execute on function tongs\.persist_openai_text_paid_result[^]*to service_role/i);
  assert.doesNotMatch(persistenceBoundary, /grant execute[^]*to (anon|authenticated)/i);
});

test("real transport adapters require the runtime-minted affirmative authorization", () => {
  assert.ok(coordinator.indexOf("attempt.provider_execution_authorized !== true")
    < coordinator.indexOf("const providerExecutionAuthorization = issueProviderExecutionAuthorization"));
  assert.ok(coordinator.indexOf("const providerExecutionAuthorization = issueProviderExecutionAuthorization")
    < coordinator.indexOf("input.executeProvider"));
  assert.ok(paidJson.indexOf("assertOpenAiTextProviderExecutionAuthorization(authorization)")
    < paidJson.indexOf("response = await (args.fetchImpl ?? fetch)"));
  assert.ok(paidChat.indexOf("assertOpenAiTextProviderExecutionAuthorization(authorization)")
    < paidChat.indexOf('providerFetch("https://api.openai.com/v1/chat/completions"'));
  assert.ok(paidTranscription.indexOf("assertOpenAiTextProviderExecutionAuthorization(authorization)")
    < paidTranscription.indexOf("args.executeProvider(context, attemptNumber, authorization)"));
});

test("post-domain persistence continuation failures are not mislabeled as authorization denials", () => {
  assert.match(hearthHandler, /error instanceof OpenAiTextPostPersistenceContinuationError[^]*paid_persistence_continuation_failed/i);
  assert.match(hearthHandler, /No second provider request will be made automatically\./i);
});
