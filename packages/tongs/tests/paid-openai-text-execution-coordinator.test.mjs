import test from "node:test";
import assert from "node:assert/strict";
import { PaidOpenAiTextExecutionCoordinator, OpenAiTextProviderError } from "../dist/providers/paid-openai-text-execution-coordinator.js";

function gate() {
  const calls=[];
  return { calls, async rpc(name,args){ calls.push({name,args}); return {data:name.startsWith("begin_")?{provider_execution_authorized:true}:{},error:null}; } };
}
function input(overrides={}) { return {
  routeCode:"hearth.chat_completion",reservationId:"r",quoteId:"q",fundingSourceType:"customer_deposit",fundingSourceId:"d",
  reservationKey:"reserve-key",attemptKey:"attempt-key",settlementId:"s",settlementKey:"settlement-key",credentialFunding:"forge",
  byoCredentialPresent:false,model:"gpt-test",maximumInputUnits:100,maximumOutputUnits:50,maximumAttempts:1,
  executeProvider:async()=>({value:{text:"usable"},requestId:"req_1",inputUnits:12,outputUnits:8,supplierCostMicros:490925,supplierCostAuthoritative:false}),
  validateResult:async value=>assert.equal(value.text,"usable"),persistResult:async()=>{},...overrides,
}; }

test("settles only after validation and canonical persistence",async()=>{ const g=gate(); const result=await new PaidOpenAiTextExecutionCoordinator(g).execute(input()); assert.equal(result.state,"settled"); assert.deepEqual(g.calls.map(c=>c.name),["reserve_operation","begin_provider_attempt","record_openai_text_usage","settle_operation"]); });
test("provider charge on failure is Forge expense and customer charge is zero",async()=>{ const g=gate(); const result=await new PaidOpenAiTextExecutionCoordinator(g).execute(input({executeProvider:async()=>{throw new OpenAiTextProviderError("charged failure",false,230000,{provider_reference:"req_fail"});}})); assert.deepEqual(result,{state:"failed_released",customerChargeMicros:0,supplierCostMicros:230000}); const settlement=g.calls.at(-1); assert.equal(settlement.name,"settle_operation"); assert.equal(settlement.args.p_outcome,"nonbillable_failure"); });
test("ambiguous submission stays reserved and is not retried",async()=>{ const g=gate(); let calls=0; const result=await new PaidOpenAiTextExecutionCoordinator(g).execute(input({executeProvider:async()=>{calls++;throw new OpenAiTextProviderError("timeout",true,null);}})); assert.equal(result.state,"submission_unknown"); assert.equal(calls,1); assert.equal(g.calls.at(-1).name,"mark_submission_unknown"); });
test("validation or persistence failure releases customer at zero despite supplier cost",async()=>{ const g=gate(); const result=await new PaidOpenAiTextExecutionCoordinator(g).execute(input({persistResult:async()=>{throw new Error("write failed");}})); assert.equal(result.customerChargeMicros,0); assert.equal(g.calls.at(-1).args.p_failure_class,"forge_failure"); });
test("BYO never falls back to Forge credentials",async()=>{ const g=gate(); let providerCalls=0; await assert.rejects(()=>new PaidOpenAiTextExecutionCoordinator(g).execute(input({credentialFunding:"byo_customer",byoCredentialPresent:false,executeProvider:async()=>{providerCalls++;return {};}})),/byo_credential_required/); assert.equal(providerCalls,0); assert.equal(g.calls.length,0); });
