import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertSafeExternalMediaUrl, deriveBrollPoster, inspectBrollMedia } from "../dist/broll-acquisition.js";
import { TongsCommitService } from "../dist/workpiece-commit-api.js";

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
      if(name==="begin_broll_operation")return{data:{disposition:"replay",operation:{state:"pending"}},error:null};
      if(name==="record_broll_provider_or_upload_result"){recorded+=1;return{data:{disposition:"result_recorded"},error:null};}
      if(name==="commit_broll_candidate"){candidateCommits+=1;return{data:{disposition:"committed",candidate_revision:{id:"candidate-1"}},error:null};}
      throw new Error(`unexpected authority RPC ${name}`);
    }}}};
    const supabase={
      storage:{from(){return{async download(){return{data:new Blob([bytes],{type:"video/mp4"}),error:null};},async upload(){throw new Error("existing storage must be reused");}}}},
      schema(){return{async rpc(name){assert.equal(name,"commit_broll_operation_asset");assetCommits+=1;return{data:{disposition:"video_asset_verified"},error:null};}}},
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
      },{userAccessToken:"token"});
      assert.equal(result.disposition,"committed");
    }
    assert.equal(providerCalls,0);assert.equal(recorded,3);assert.equal(assetCommits,3);assert.equal(candidateCommits,3);
  }finally{await rm(dir,{recursive:true,force:true});}
});
