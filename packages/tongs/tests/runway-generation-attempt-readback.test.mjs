import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration=readFileSync(new URL("../../../supabase/migrations/20261011800000_broll_generation_attempt_readback.sql",import.meta.url),"utf8");
const authority=readFileSync(new URL("../../../apps/hearth/src/lib/hearth-broll-v2-authority.ts",import.meta.url),"utf8");
const hook=readFileSync(new URL("../../../apps/hearth/src/hooks/visuals/useCanonicalBrollV2.ts",import.meta.url),"utf8");

test("attempt readback is exact, customer-bound, and read-only",()=>{
  const fn=migration.match(/create or replace function tongs\.read_my_customer_runway_generation_attempt[\s\S]*?end \$\$;/)?.[0]??"";
  assert.match(fn,/security definer[\s\S]*set search_path=pg_catalog/);
  assert.match(fn,/v_actor uuid:=auth\.uid\(\)/);
  assert.match(fn,/has_workspace_role\(p_workspace_id,'editor'\)/);
  for(const binding of ["initiated_by=v_actor","workspace_id=p_workspace_id","workpiece_id=p_workpiece_id","beat_id=p_beat_id","prompt_revision_id=p_prompt_revision_id","prompt_revision=p_prompt_revision","prompt_content_hash=lower(p_prompt_content_hash)","creative_input_hash=lower(p_creative_input_hash)"])
    assert.ok(fn.includes(binding),`missing exact binding: ${binding}`);
  assert.match(fn,/generation_attempt_not_found/);
  assert.match(fn,/generation_attempt_current/);
  assert.doesNotMatch(fn,/\binsert\b|\bupdate\b|\bdelete\b|start_customer_runway_generation_attempt|accept_quote|reserve_customer_runway_quote|provider_task/);
});

test("readback privileges expose the RPC without exposing the immutable table",()=>{
  assert.match(migration,/revoke all on function tongs\.read_my_customer_runway_generation_attempt[\s\S]*from public,anon/);
  assert.match(migration,/grant execute on function tongs\.read_my_customer_runway_generation_attempt[\s\S]*to authenticated,service_role/);
  assert.match(migration,/has_table_privilege\('authenticated','tongs\.broll_generation_attempts','select,insert,update,delete'\)/);
  assert.match(migration,/relrowsecurity and relforcerowsecurity/);
  assert.match(migration,/environment='live'[\s\S]*?<>'inactive_ready'/);
});

test("Hearth recovers a durable attempt before acquire and carries it through confirmation",()=>{
  assert.match(authority,/readCurrentRunwayGenerationAttempt/);
  assert.match(authority,/read_my_customer_runway_generation_attempt/);
  assert.match(authority,/p_creative_input_hash: creative\.creativeInputHash/);
  assert.match(authority,/generation_attempt_not_found[\s\S]*data: null/);
  const generate=hook.match(/const generateVideo = useCallback[\s\S]*?const startNewGenerationAttempt/)?.[0]??"";
  assert.match(generate,/readCurrentRunwayGenerationAttempt/);
  assert.match(generate,/generateCanonicalBrollVideo\([\s\S]*generationAttempt: recovered\.data/);
  assert.match(generate,/setPendingGeneration\(\{ beatId, referenceImages, generationAttempt: recovered\.data \}\)/);
  assert.ok(generate.indexOf("readCurrentRunwayGenerationAttempt")<generate.indexOf("generateCanonicalBrollVideo"));
  assert.doesNotMatch(generate,/startReplacementRunwayGenerationAttempt|start_customer_runway_generation_attempt/);
});
