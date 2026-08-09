import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertSafeExternalMediaUrl, deriveBrollPoster, inspectBrollMedia } from "../dist/broll-acquisition.js";
import { TongsCommitService, createTongsCommitApiHandlerWithService } from "../dist/workpiece-commit-api.js";

async function run(command,args){await new Promise((resolve,reject)=>{const child=spawn(command,args,{windowsHide:true});let error="";child.stderr.on("data",chunk=>error+=chunk);child.once("error",reject);child.once("close",code=>code===0?resolve():reject(new Error(error)));});}

test("Tongs derives video and poster metadata from actual media bytes",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"forge-broll-test-"));
  try{
    const path=join(dir,"clip.mp4");
    await run("ffmpeg",["-v","error","-f","lavfi","-i","color=c=orange:s=320x180:d=1","-pix_fmt","yuv420p","-y",path]);
    const video=await inspectBrollMedia(new Uint8Array(await readFile(path)),"video");
    assert.equal(video.mimeType,"video/mp4");assert.equal(video.width,320);assert.equal(video.height,180);assert.ok((video.durationMs??0)>=900);
    const poster=await deriveBrollPoster(video);
    assert.equal(poster.mimeType,"image/jpeg");assert.ok(poster.width>0);assert.ok(poster.height>0);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test("external acquisition rejects local and unsupported URLs before fetch",async()=>{
  await assert.rejects(()=>assertSafeExternalMediaUrl("http://example.com/video.mp4"),/scheme/);
  await assert.rejects(()=>assertSafeExternalMediaUrl("https://127.0.0.1/video.mp4"),/private_network/);
});

test("stored upload, external fetch, and provider output resume without repeated acquisition",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"forge-broll-replay-"));
  try{
    const path=join(dir,"clip.mp4");
    await run("ffmpeg",["-v","error","-f","lavfi","-i","color=c=blue:s=320x180:d=1","-pix_fmt","yuv420p","-y",path]);
    const bytes=new Uint8Array(await readFile(path));
    let providerCalls=0;let recorded=0;let assetCommits=0;let candidateCommits=0;
    const authority={schema(){return{async rpc(name){
      if(name==="assert_current_broll_prompt")return{data:{disposition:"verified",prompt_revision:{id:"55555555-5555-4555-8555-555555555555",revision:1,content_hash:"b".repeat(64),final_prompt:"A blue motion clip"}},error:null};
      if(name==="begin_broll_operation")return{data:{disposition:"replay",operation:{state:"pending"}},error:null};
      if(name==="record_broll_provider_or_upload_result"){recorded+=1;return{data:{disposition:"result_recorded"},error:null};}
      if(name==="commit_broll_candidate"){candidateCommits+=1;return{data:{disposition:"committed",candidate_revision:{id:"candidate-1"}},error:null};}
      if(name==="approve_and_reserve_paid_media_operation")return{data:{operation:{id:"paid-op-1",state:"reserved"}},error:null};
      if(name==="begin_paid_media_provider_attempt")return{data:{operation:{id:"paid-op-1",state:"submitting"},attempt:{id:"attempt-1",state:"submitting"}},error:null};
      if(name==="record_paid_media_provider_result")return{data:{operation:{id:"paid-op-1",state:"provider_completed"},attempt:{id:"attempt-1",state:"completed"}},error:null};
      if(name==="mark_paid_media_delivery")return{data:{operation:{id:"paid-op-1",state:"delivered"}},error:null};
      if(name==="settle_paid_media_operation")return{data:{operation:{id:"paid-op-1",state:"settled"},receipt:{settled_customer_charge:1_000}},error:null};
      throw new Error(`unexpected authority RPC ${name}`);
    }}}};
    const supabase = {
      storage: {
        from() {
          return {
            async download() { return { data: new Blob([bytes], { type: "video/mp4" }), error: null }; },
            async upload() { throw new Error("existing storage must be reused"); },
          };
        },
      },
      schema() {
        return {
          async rpc(name) {
            if (name === "create_paid_media_authorization_quote") return { data: { quote: { id: "quote-1", authorized_customer_ceiling: 1000 } }, error: null };
            if (name === "commit_broll_operation_asset") { assetCommits += 1; return { data: { disposition: "video_asset_verified" }, error: null }; }
            return { data: { disposition: "ok" }, error: null };
          },
        };
      },
    };
    const provider={async generate(){providerCalls+=1;return{bytes,provider:"test",providerRequestId:"provider-1"};}};
    const service=new TongsCommitService(supabase,"forge-workpieces",null,()=>authority,null,provider);
    service.assertWorkpieceInWorkspace=async()=>undefined;
    service.assertWorkspaceRoleFromAccessToken=async()=>({userId:"11111111-1111-4111-8111-111111111111",role:"editor"});
    for(const [index,sourceKind] of ["upload","external","generated"].entries()){
      const result=await service.acquireBrollCandidate("22222222-2222-4222-8222-222222222222",{
        workspace_id:"33333333-3333-4333-8333-333333333333",beat_id:"44444444-4444-4444-8444-444444444444",
        operation_id:`forge:broll:stored-${sourceKind}-replay-000${index+1}`,operation_fingerprint:"a".repeat(64),source_kind:sourceKind,
        provider:"test",final_prompt:"A blue motion clip",source_url:sourceKind==="external"?"https://127.0.0.1/must-not-fetch.mp4":null,poster_required:false,
        confirm_spend:sourceKind==="generated",
        prompt_revision_id:sourceKind==="generated"?"55555555-5555-4555-8555-555555555555":null,
        prompt_revision:sourceKind==="generated"?1:null,prompt_content_hash:sourceKind==="generated"?"b".repeat(64):null,
      },{userAccessToken:"token"});
      assert.equal(result.disposition,"committed");
    }
    assert.equal(providerCalls,0);assert.equal(recorded,3);assert.equal(assetCommits,3);assert.equal(candidateCommits,3);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test("ambiguous Runway submission fails closed and replay never submits again",async()=>{
  let state="pending";let providerCalls=0;let unknownWrites=0;
  const operation=()=>({state,submission_attempt_id:state==="pending"?null:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"});
  const authority={schema(){return{async rpc(name){
    if(name==="assert_current_broll_prompt")return{data:{disposition:"verified",prompt_revision:{id:"55555555-5555-4555-8555-555555555555",revision:1,content_hash:"b".repeat(64),final_prompt:"A slow documentary road transition"}},error:null};
    if(name==="begin_broll_operation")return{data:{disposition:"replay",operation:operation()},error:null};
    if(name==="begin_broll_runway_submission"){if(state==="submission_unknown")return{data:{disposition:"submission_unknown",operation:operation()},error:null};state="submitting";return{data:{disposition:"submitting",operation:operation()},error:null};}
    if(name==="mark_broll_submission_unknown"){state="submission_unknown";unknownWrites+=1;return{data:{disposition:"submission_unknown",operation:operation()},error:null};}
    if(name==="approve_and_reserve_paid_media_operation")return{data:{operation:{id:"paid-op-1",state:"reserved"}},error:null};
    if(name==="begin_paid_media_provider_attempt")return{data:{operation:{id:"paid-op-1",state:"submitting"},attempt:{id:"attempt-1",state:"submitting"}},error:null};
    if(name==="mark_paid_media_submission_unknown")return{data:{operation:{id:"paid-op-1",state:"submission_unknown"}},error:null};
    throw new Error(`unexpected RPC ${name}`);
  }}}};
  const supabase={storage:{from(){return{async download(){return{data:null,error:{message:"Object not found",statusCode:404}};}}}},schema(){return{async rpc(name){if(name==="create_paid_media_authorization_quote")return{data:{quote:{id:"quote-1",authorized_customer_ceiling:1000}},error:null};if(name==="approve_and_reserve_paid_media_operation")return{data:{operation:{id:"paid-op-1",state:"reserved"}},error:null};if(name==="begin_paid_media_provider_attempt")return{data:{operation:{id:"paid-op-1",state:"submitting"},attempt:{id:"attempt-1",state:"submitting"}},error:null};if(name==="mark_paid_media_delivery")return{data:{operation:{id:"paid-op-1",state:"delivered"}},error:null};if(name==="settle_paid_media_operation")return{data:{operation:{id:"paid-op-1",state:"settled"},receipt:{settled_customer_charge:1_000}},error:null};return{data:{disposition:"ok"},error:null};}}}};
  const provider={async submit(){providerCalls+=1;throw new Error("connection reset");}};
  const service=new TongsCommitService(supabase,"forge-workpieces",null,()=>authority,null,provider);
  service.assertWorkpieceInWorkspace=async()=>undefined;service.assertWorkspaceRoleFromAccessToken=async()=>({userId:"11111111-1111-4111-8111-111111111111",role:"editor"});
  const request={workspace_id:"33333333-3333-4333-8333-333333333333",beat_id:"44444444-4444-4444-8444-444444444444",operation_id:"forge:broll:runway-ambiguous-test-0001",operation_fingerprint:"a".repeat(64),source_kind:"generated",provider:"runway",final_prompt:"A slow documentary road transition",poster_required:false,confirm_spend:true,prompt_revision_id:"55555555-5555-4555-8555-555555555555",prompt_revision:1,prompt_content_hash:"b".repeat(64)};
  await assert.rejects(()=>service.acquireBrollCandidate("22222222-2222-4222-8222-222222222222",{...request},{userAccessToken:"token"}),error=>error.code==="broll_runway_submission_unknown");
  await assert.rejects(()=>service.acquireBrollCandidate("22222222-2222-4222-8222-222222222222",{...request},{userAccessToken:"token"}),error=>error.code==="broll_runway_submission_unknown");
  assert.equal(providerCalls,1);assert.equal(unknownWrites,1);
});

test("over-limit canonical prompt is rejected before operation reservation and transmission",async()=>{
  let begins=0;let submits=0;const longPrompt="visible motion ".repeat(260);
  const authority={schema(){return{async rpc(name){if(name==="assert_current_broll_prompt")return{data:{disposition:"verified",prompt_revision:{final_prompt:longPrompt}},error:null};if(name==="begin_broll_operation")begins+=1;throw new Error(`unexpected RPC ${name}`);}}}};
  const service=new TongsCommitService({},"forge-workpieces",null,()=>authority,null,{async submit(){submits+=1;throw new Error("must not submit");}});
  service.assertWorkpieceInWorkspace=async()=>undefined;service.assertWorkspaceRoleFromAccessToken=async()=>({userId:"11111111-1111-4111-8111-111111111111",role:"editor"});
  await assert.rejects(()=>service.acquireBrollCandidate("22222222-2222-4222-8222-222222222222",{workspace_id:"33333333-3333-4333-8333-333333333333",beat_id:"44444444-4444-4444-8444-444444444444",operation_id:"forge:broll:too-long",operation_fingerprint:"a".repeat(64),source_kind:"generated",provider:"runway",prompt_revision_id:"55555555-5555-4555-8555-555555555555",prompt_revision:2,prompt_content_hash:"b".repeat(64),poster_required:true},{userAccessToken:"token"}),error=>error.code==="runway_prompt_too_long"&&error.details?.operation_reserved===false&&error.details?.transmitted===false);
  assert.equal(begins,0);assert.equal(submits,0);
});

test("generated Runway acquisition routes through paid-media authorization and settlement", async () => {
  let providerCalls = 0;
  let paidRpcCalls = [];
  const authority = { schema() { return { async rpc(name, args) {
    paidRpcCalls.push({ source: "authority", name, args });
    if (name === "assert_current_broll_prompt") return { data: { disposition: "verified", prompt_revision: { id: "55555555-5555-4555-8555-555555555555", revision: 1, content_hash: "b".repeat(64), final_prompt: "A slow documentary road transition" } }, error: null };
    if (name === "begin_broll_operation") return { data: { disposition: "replay", operation: { state: "pending", submission_attempt_id: "attempt-1" } }, error: null };
    if (name === "begin_broll_runway_submission") return { data: { disposition: "submitting", operation: { state: "submitting", submission_attempt_id: "attempt-1" } }, error: null };
    if (name === "record_broll_runway_task") return { data: { disposition: "provider_submitted", operation: { state: "provider_submitted" } }, error: null };
    if (name === "record_broll_runway_completion") return { data: { disposition: "provider_completed", operation: { state: "provider_completed" } }, error: null };
    if (name === "record_broll_provider_or_upload_result") return { data: { disposition: "result_recorded", operation: { state: "provider_or_upload_completed" } }, error: null };
    if (name === "commit_broll_candidate") return { data: { disposition: "committed", candidate_revision: { id: "candidate-broll-1" } }, error: null };
    if (name === "claim_broll_runway_poll") return { data: { disposition: "poll_claimed", operation: { state: "provider_submitted" } }, error: null };
    if (name === "record_broll_runway_pending") return { data: { disposition: "provider_pending", operation: { state: "provider_submitted" } }, error: null };
    if (name === "approve_and_reserve_paid_media_operation") return { data: { operation: { id: args.p_paid_media_operation_id, state: "reserved" } }, error: null };
    if (name === "begin_paid_media_provider_attempt") return { data: { operation: { id: args.p_paid_media_operation_id, state: "submitting" }, attempt: { id: args.p_attempt_id, state: "submitting" } }, error: null };
    if (name === "record_paid_media_provider_result") return { data: { operation: { id: args.p_paid_media_operation_id, state: "provider_completed" }, attempt: { id: args.p_attempt_id, state: "completed" } }, error: null };
    if (name === "mark_paid_media_submission_unknown") return { data: { operation: { id: args.p_paid_media_operation_id, state: "submission_unknown" } }, error: null };
    if (name === "mark_paid_media_delivery") return { data: { operation: { id: args.p_paid_media_operation_id, state: "delivered" } }, error: null };
    if (name === "settle_paid_media_operation") return { data: { operation: { id: args.p_paid_media_operation_id, state: "settled" }, receipt: { settled_customer_charge: 1_000 } }, error: null };
    throw new Error(`unexpected RPC ${name}`);
  } }; } };
  const supabase = {
    storage: {
      from() {
        return {
          async download() { return { data: null, error: { message: "Object not found", statusCode: 404 } }; },
          async upload() { return { data: { Key: "uploaded" }, error: null }; },
        };
      },
    },
    schema() {
      return {
        async rpc(name, args) {
          paidRpcCalls.push({ source: "supabase", name, args });
          if (name === "commit_broll_operation_asset") return { data: { disposition: "video_asset_verified" }, error: null };
          if (name === "create_paid_media_authorization_quote") return { data: { quote: { id: args.p_quote_id, authorized_customer_ceiling: 44_460 } }, error: null };
          if (name === "approve_and_reserve_paid_media_operation") return { data: { operation: { id: args.p_paid_media_operation_id, state: "reserved" } }, error: null };
          if (name === "begin_paid_media_provider_attempt") return { data: { operation: { id: args.p_paid_media_operation_id, state: "submitting" }, attempt: { id: args.p_attempt_id, state: "submitting" } }, error: null };
          if (name === "record_paid_media_provider_result") return { data: { operation: { id: args.p_paid_media_operation_id, state: "provider_completed" }, attempt: { id: args.p_attempt_id, state: "completed" } }, error: null };
          if (name === "mark_paid_media_delivery") return { data: { operation: { id: args.p_paid_media_operation_id, state: "delivered" } }, error: null };
          if (name === "settle_paid_media_operation") return { data: { operation: { id: args.p_paid_media_operation_id, state: "settled" }, receipt: { settled_customer_charge: 1_000 } }, error: null };
          throw new Error(`unexpected RPC ${name}`);
        },
      };
    },
  };
  const provider = {
    async submit() {
      providerCalls += 1;
      return { taskId: "runway-task-durable-2", acceptedResponse: { id: "runway-task-durable-2" } };
    },
    async poll() {
      return { state: "completed", taskId: "runway-task-durable-2", outputUrl: "https://example.com/out.mp4", response: { id: "runway-task-durable-2" } };
    },
    async download() {
      return new Uint8Array([1, 2, 3, 4]);
    },
  };
  const runtime = {
    inspectMedia: async (bytes, expected) => ({ bytes, mimeType: expected === "video" ? "video/mp4" : "image/jpeg", width: 320, height: 180, durationMs: expected === "video" ? 1000 : null }),
    derivePoster: async (video) => ({ bytes: new Uint8Array([4, 5, 6]), mimeType: "image/jpeg", width: 320, height: 180, durationMs: null }),
    fetchExternalMedia: async () => { throw new Error("must not fetch"); },
    inspectReferenceImage: async () => ({ bytes: new Uint8Array([1]), mimeType: "image/jpeg", width: 320, height: 180, durationMs: null }),
    fetchExternalBytes: async () => { throw new Error("must not fetch"); },
    renderReferenceVisual: async () => { throw new Error("must not render"); },
  };
  const service = new TongsCommitService(supabase, "forge-workpieces", null, () => authority, null, provider, null, runtime);
  service.assertWorkpieceInWorkspace = async () => undefined;
  service.assertWorkspaceRoleFromAccessToken = async () => ({ userId: "11111111-1111-4111-8111-111111111111", role: "editor" });
  const request = { workspace_id: "33333333-3333-4333-8333-333333333333", beat_id: "44444444-4444-4444-8444-444444444444", operation_id: "forge:broll:paid-media-test-0003", operation_fingerprint: "a".repeat(64), source_kind: "generated", provider: "runway", final_prompt: "A slow documentary road transition", poster_required: false, confirm_spend: true, prompt_revision_id: "55555555-5555-4555-8555-555555555555", prompt_revision: 1, prompt_content_hash: "b".repeat(64) };
  const result = await service.acquireBrollCandidate("22222222-2222-4222-8222-222222222222", request, { userAccessToken: "token" });
  assert.equal(result.disposition, "committed");
  assert.equal(providerCalls, 1);
  assert.equal(paidRpcCalls.filter((call) => call.name === "create_paid_media_authorization_quote" && call.source === "supabase").length, 1);
  assert.equal(paidRpcCalls.filter((call) => call.name === "approve_and_reserve_paid_media_operation" && call.source === "authority").length, 1);
  assert.equal(paidRpcCalls.filter((call) => call.name === "begin_paid_media_provider_attempt" && call.source === "authority").length, 1);
  const providerResultCalls = paidRpcCalls.filter((call) => call.name === "record_paid_media_provider_result" && call.source === "authority");
  assert.equal(providerResultCalls.length, 1);
  assert.ok(Array.isArray(providerResultCalls[0].args.p_usage_components));
  assert.equal(providerResultCalls[0].args.p_usage_components.length, 1);
  assert.equal(providerResultCalls[0].args.p_usage_components[0].component_kind, "video_output");
  assert.equal(providerResultCalls[0].args.p_usage_components[0].unit_kind, "second");
  assert.equal(providerResultCalls[0].args.p_usage_components[0].quantity, 5);
  assert.deepEqual(providerResultCalls[0].args.p_provider_response_json.usage, {
    kind: "contract_derived_from_successful_duration",
    provider: "runway",
    model: "gen4.5",
    generation_mode: "text_to_video",
    provider_native_rate: { unit: "credit", per_unit: "second", amount: 12 },
    provider_native_consumed_credits: 60,
    provider_expense_micros: 600000,
    pricing_policy_revision_id: "72000000-0000-4000-8000-000000000001",
  });
  assert.ok(!providerResultCalls[0].args.p_usage_components.some((component) => ["text_input", "cached_text_input", "image_input", "cached_image_input", "image_output"].includes(component.component_kind)));
  assert.equal(paidRpcCalls.filter((call) => call.name === "mark_paid_media_delivery" && call.source === "supabase").length, 1);
  assert.equal(paidRpcCalls.filter((call) => call.name === "settle_paid_media_operation" && call.source === "supabase").length, 1);
});

test("selected Beat 1 route reaches the injected provider and durably records its task without a Vite import",async()=>{
  let state="pending";let taskId=null;let creates=0;let polls=0;
  const operation=()=>({state,submission_attempt_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",provider_task_id:taskId,existing_selected_candidate_id:"77777777-7777-4777-8777-777777777777"});
  const authority={schema(){return{async rpc(name){
    if(name==="assert_current_broll_prompt")return{data:{disposition:"verified",prompt_revision:{id:"55555555-5555-4555-8555-555555555555",revision:1,content_hash:"b".repeat(64),final_prompt:"A slow documentary road transition"}},error:null};
    if(name==="begin_broll_operation")return{data:{disposition:"replay",operation:operation()},error:null};
    if(name==="begin_broll_runway_submission"){state="submitting";return{data:{disposition:"submitting",operation:operation()},error:null};}
    if(name==="record_broll_runway_task"){taskId="runway-task-durable-1";state="provider_submitted";return{data:{disposition:"provider_submitted",operation:operation()},error:null};}
    if(name==="claim_broll_runway_poll")return{data:polls===0?{disposition:"poll_claimed",operation:operation()}:{disposition:"poll_not_due",retry_at:"2099-01-01T00:00:00Z",operation:operation()},error:null};
    if(name==="record_broll_runway_pending")return{data:{disposition:"provider_pending",operation:operation()},error:null};
    if(name==="approve_and_reserve_paid_media_operation")return{data:{operation:{id:"paid-op-1",state:"reserved"}},error:null};
    if(name==="begin_paid_media_provider_attempt")return{data:{operation:{id:"paid-op-1",state:"submitting"},attempt:{id:"attempt-1",state:"submitting"}},error:null};
    if(name==="record_paid_media_provider_result")return{data:{operation:{id:"paid-op-1",state:"provider_completed"},attempt:{id:"attempt-1",state:"completed"}},error:null};
    if(name==="mark_paid_media_delivery")return{data:{operation:{id:"paid-op-1",state:"delivered"}},error:null};
    if(name==="settle_paid_media_operation")return{data:{operation:{id:"paid-op-1",state:"settled"},receipt:{settled_customer_charge:1_000}},error:null};
    throw new Error(`unexpected RPC ${name}`);
  }}}};
  const supabase={storage:{from(){return{async download(){return{data:null,error:{message:"Object not found",statusCode:404}};}}}},schema(){return{async rpc(name){if(name==="create_paid_media_authorization_quote")return{data:{quote:{id:"quote-1",authorized_customer_ceiling:1000}},error:null};if(name==="approve_and_reserve_paid_media_operation")return{data:{operation:{id:"paid-op-1",state:"reserved"}},error:null};if(name==="begin_paid_media_provider_attempt")return{data:{operation:{id:"paid-op-1",state:"submitting"},attempt:{id:"attempt-1",state:"submitting"}},error:null};if(name==="mark_paid_media_delivery")return{data:{operation:{id:"paid-op-1",state:"delivered"}},error:null};if(name==="settle_paid_media_operation")return{data:{operation:{id:"paid-op-1",state:"settled"},receipt:{settled_customer_charge:1_000}},error:null};return{data:{disposition:"ok"},error:null};}}}};
  const provider={async submit(){creates+=1;return{taskId:"runway-task-durable-1",acceptedResponse:{id:"runway-task-durable-1"}};},async poll(id){polls+=1;assert.equal(id,"runway-task-durable-1");return{state:"pending",taskId:id,response:{id,status:"RUNNING"}};}};
  const service=new TongsCommitService(supabase,"forge-workpieces",null,()=>authority,null,provider);
  assert.equal(service.brollVideoProvider,provider,"the acquire service must retain the exact injected provider instance");
  service.assertWorkpieceInWorkspace=async()=>undefined;service.assertWorkspaceRoleFromAccessToken=async()=>({userId:"11111111-1111-4111-8111-111111111111",role:"editor"});
  const request={workspace_id:"33333333-3333-4333-8333-333333333333",beat_id:"44444444-4444-4444-8444-444444444444",operation_id:"forge:broll:runway-pending-test-0002",operation_fingerprint:"a".repeat(64),source_kind:"generated",provider:"runway",final_prompt:"A slow documentary road transition",poster_required:false,confirm_spend:true,prompt_revision_id:"55555555-5555-4555-8555-555555555555",prompt_revision:1,prompt_content_hash:"b".repeat(64)};
  const handler=createTongsCommitApiHandlerWithService(service);
  const invoke=()=>handler(new Request("http://localhost/tongs/workpieces/22222222-2222-4222-8222-222222222222/broll-v2/acquire",{method:"POST",headers:{"content-type":"application/json","x-forge-user-authorization":"Bearer token"},body:JSON.stringify(request)}));
  const firstResponse=await invoke();const firstBody=await firstResponse.json();assert.equal(firstResponse.status,200);assert.equal(firstBody.data?.disposition,"provider_pending");
  const secondResponse=await invoke();const secondBody=await secondResponse.json();assert.equal(secondResponse.status,200);assert.equal(secondBody.data?.disposition,"provider_pending");
  assert.equal(creates,1);assert.equal(polls,1);
});
