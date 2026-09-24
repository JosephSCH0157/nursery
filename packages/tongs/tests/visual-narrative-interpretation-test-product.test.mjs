import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration=readFileSync(new URL("../../../supabase/migrations/20261011660000_visual_narrative_interpretation_test_product.sql",import.meta.url),"utf8");
const service=readFileSync(new URL("../src/workpiece-commit-api.ts",import.meta.url),"utf8");

test("narrative Test product has exact Luna economics and no Live customer scope",()=>{
  assert.match(migration,/gpt-5\.6-luna/);
  assert.match(migration,/maximum_input_units,\s*maximum_output_units,maximum_attempts,direct_provider_ceiling_micros/);
  assert.match(migration,/4096,1024,1,2049,0,2049/);
  assert.match(migration,/customer_credit_units[\s\S]*?1,'\[\]'/);
  assert.match(migration,/unrounded_customer_price_micros[\s\S]*?2726,2274,5000/);
  assert.match(migration,/financial_environment='live' and status='active'/);
  assert.match(migration,/Live narrative interpretation scope must remain absent/);
});

test("narrative evidence is immutable, forced-RLS, and service-only",()=>{
  assert.match(migration,/visual_narrative_interpretation_results enable row level security/);
  assert.match(migration,/visual_narrative_interpretation_results force row level security/);
  assert.match(migration,/revoke all on tongs\.visual_narrative_interpretation_results,tongs\.visual_narrative_interpretation_canonical_receipts from public,anon,authenticated,service_role/);
  assert.match(migration,/grant select on tongs\.visual_narrative_interpretation_results,tongs\.visual_narrative_interpretation_canonical_receipts to service_role/);
  assert.match(migration,/visual_narrative_results_immutable/);
  assert.match(migration,/visual_narrative_receipts_immutable/);
});

test("persistence preflight precedes quote authority and provider execution",()=>{
  const preflight=service.indexOf('authority.rpc("preflight_image_prompt_interpretation"');
  const quote=service.indexOf("resolveOrdinaryOpenAiTextFunding",preflight);
  const provider=service.indexOf("executeProvider: async",quote);
  assert.ok(preflight>=0&&quote>preflight&&provider>quote);
  assert.match(service,/read_staged_visual_narrative_interpretation_result/);
  assert.match(service,/stage_visual_narrative_interpretation_result/);
  assert.match(service,/finalize_visual_narrative_interpretation_result/);
  assert.doesNotMatch(service.slice(preflight,provider),/generateEpisodeThumbnail|openai\.com\/v1\/images/);
});

test("validated persistence recovery is provider-free and canonical finalization is idempotent",()=>{
  assert.match(migration,/operation_id text not null unique/);
  assert.match(migration,/visual narrative result replay conflict/);
  assert.match(migration,/visual narrative canonical replay conflict/);
  assert.match(service,/Persistence-only recovery is deliberately attempted before preparing a[\s\S]*?const stagedRecovery = await recoverStagedResult\(\)/);
  assert.match(service,/if \(stagedRecovery\) return stagedRecovery\.result/);
});
