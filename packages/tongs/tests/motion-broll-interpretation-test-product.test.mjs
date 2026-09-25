import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration=readFileSync(new URL("../../../supabase/migrations/20261011720000_motion_broll_interpretation_test_product.sql",import.meta.url),"utf8");
const service=readFileSync(new URL("../src/workpiece-commit-api.ts",import.meta.url),"utf8");
const authority=readFileSync(new URL("../../../apps/hearth/src/lib/hearth-broll-v2-authority.ts",import.meta.url),"utf8");
const hook=readFileSync(new URL("../../../apps/hearth/src/hooks/visuals/useCanonicalBrollV2.ts",import.meta.url),"utf8");
const panel=readFileSync(new URL("../../../apps/hearth/src/components/visuals/BrollPlanPanel.tsx",import.meta.url),"utf8");
const brollAuthority=readFileSync(new URL("../../../supabase/migrations/20260803170000_tongs_broll_v2_authority.sql",import.meta.url),"utf8");
const motionAuthority=readFileSync(new URL("../../../supabase/migrations/20260803210000_tongs_broll_motion_prompt_authority.sql",import.meta.url),"utf8");

test("motion-B-roll Test product has exact Luna economics and no Live scope",()=>{
  assert.match(migration,/gpt-5\.6-luna/);
  assert.doesNotMatch(migration,/motion\.broll\.interpretation/);
  assert.match(migration,/4096,1024,1,2049,0,2049/);
  assert.match(migration,/response_byte_ceiling',16384/);
  assert.match(migration,/customer_credit_units[\s\S]*?1,'\[\]'/);
  assert.match(migration,/2726,2274,5000/);
  assert.match(migration,/2049,2049,86400,1/);
  assert.match(migration,/financial_environment='live'[\s\S]*status='active'/);
  assert.match(migration,/Live motion-B-roll scope must remain absent/);
  assert.match(service,/const model = "gpt-5\.6-luna"/);
});

test("ordinary customer quote uses an explicit card and never native confirm",()=>{
  assert.match(authority,/customerSpendingAcceptance\(args\.acceptedQuote\)/);
  assert.match(authority,/motionPromptSpendingQuote: quote/);
  assert.doesNotMatch(authority,/requestCustomerSpendingAcceptance/);
  assert.match(hook,/setMotionPromptQuote\(generated\.motionPromptSpendingQuote\)/);
  assert.match(hook,/acceptMotionPromptQuote/);
  assert.match(hook,/dismissMotionPromptQuote/);
  assert.match(panel,/data-testid="motion-prompt-price-confirmation"/);
  assert.match(panel,/Accept \{props\.motionPromptQuote\.credit_charge\}/);
  assert.match(panel,/OpenAI has not been called and no credits are reserved until you accept/);
  assert.doesNotMatch(`${authority}\n${hook}\n${panel}`,/window\.confirm|globalThis\.confirm/);
});

test("provider execution remains bounded, validated, canonically persisted, and replay safe",()=>{
  const start=service.indexOf("async interpretBrollMotionPrompt");
  const end=service.indexOf("async editBrollMotionPrompt",start);
  const flow=service.slice(start,end);
  assert.match(flow,/routeCode: "motion\.broll_interpretation"/);
  assert.match(flow,/max_output_tokens: context\.maximumOutputUnits/);
  assert.match(flow,/maximumAttempts: context\.maximumAttempts/);
  assert.match(flow,/validateBrollMotionBrief/);
  assert.match(flow,/record_broll_provider_or_upload_result/);
  assert.match(flow,/commit_broll_prompt_interpretation/);
  assert.match(flow,/recoverCanonical:/);
  assert.match(flow,/paidOutcome\.state === "settled" \|\| paidOutcome\.state === "settled_replay"/);
  assert.match(flow,/releaseAcceptedFundingBeforeProvider/);
  assert.match(flow,/"release_operation"/);
  assert.match(flow,/transmitted: false/);
});

test("activation is Forge-funded normal-customer Test only",()=>{
  assert.match(migration,/insert into tongs\.openai_text_rollout_revisions[\s\S]*?funding_scope[\s\S]*?'forge'/);
  assert.match(migration,/authorization_kind[\s\S]*?'normal_customer'/);
  assert.doesNotMatch(migration,/owner_testing|byo_customer/);
  assert.match(migration,/Live remains inactive/);
});

test("canonical motion-prompt authority remains RLS-protected, immutable, and privilege-scoped",()=>{
  assert.match(brollAuthority,/alter table tongs\.%I enable row level security/);
  assert.match(brollAuthority,/revoke all on tongs\.%I from public,anon,authenticated/);
  assert.match(brollAuthority,/grant select on tongs\.%I to authenticated/);
  assert.match(brollAuthority,/broll_prompt_revisions[\s\S]*?_immutable/);
  assert.match(brollAuthority,/broll_operation_receipts_guard/);
  assert.match(motionAuthority,/security definer set search_path=pg_catalog,tongs/);
  assert.match(motionAuthority,/auth\.uid\(\) is distinct from p_actor_id/);
  assert.match(motionAuthority,/revoke all on function tongs\.broll_current_creative_input[\s\S]*?from public,anon,authenticated/);
});
