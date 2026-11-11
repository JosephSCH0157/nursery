import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {publishCanonicalScript} from '../dist/script-publication.js';
const text='[s1]\nSynthetic reviewed text.\n[/s1]\n';
const bytes=new TextEncoder().encode(text),hash=createHash('sha256').update(bytes).digest('hex');
function harness(){const objects=new Map();const calls=[];let state='prepared';const input={workspace_id:'w',operation_id:'op',expected_revision:0,expected_hash:null,text};const adapters={
 command:async(name)=>{calls.push(name);if(name==='finalize')state='committed';return{state,operation_id:'op',storage_key:'object',sha256:hash,bytes:bytes.length,receipt:state==='committed'?{revision:1}:null}},
 read:async key=>{calls.push('read');return objects.get(key)??null},upload:async(key,b)=>{calls.push('upload');objects.set(key,b)},
};return{input,adapters,objects,calls,setState:v=>state=v};}
test('stages, reads back, verifies, then finalizes exact reviewed bytes',async()=>{const h=harness();assert.equal((await publishCanonicalScript(h.input,h.adapters)).state,'committed');assert.deepEqual(h.calls,['prepare','read','upload','read','finalize']);assert.deepEqual(h.objects.get('object'),bytes)});
test('same-operation recovery after lost response does not upload again',async()=>{const h=harness();await publishCanonicalScript(h.input,h.adapters);h.calls.length=0;await publishCanonicalScript(h.input,h.adapters);assert.deepEqual(h.calls,['prepare'])});
test('existing staged or unchanged canonical bytes skip upload',async()=>{const h=harness();h.objects.set('object',bytes);await publishCanonicalScript(h.input,h.adapters);assert.deepEqual(h.calls,['prepare','read','finalize'])});
test('wrong readback hash blocks finalization',async()=>{const h=harness();h.objects.set('object',new Uint8Array(bytes.length));await assert.rejects(publishCanonicalScript(h.input,h.adapters),/integrity/);assert.ok(!h.calls.includes('finalize'))});
test('read errors are not absence and never permit creation',async()=>{const h=harness();h.adapters.read=async()=>{throw Error('permission denied')};await assert.rejects(publishCanonicalScript(h.input,h.adapters),/permission denied/);assert.deepEqual(h.calls,['prepare'])});
test('upload timeout preserves error and never finalizes',async()=>{const h=harness();h.adapters.upload=async()=>{throw Error('timeout')};await assert.rejects(publishCanonicalScript(h.input,h.adapters),/timeout/);assert.ok(!h.calls.includes('finalize'))});
test('terminal conflict and abandonment cannot stage or finalize',async()=>{for(const state of ['conflict','abandoned']){const h=harness();h.setState(state);assert.equal((await publishCanonicalScript(h.input,h.adapters)).state,state);assert.deepEqual(h.calls,['prepare'])}});
test('invalid canonical basis is rejected before any request',async()=>{const h=harness();await assert.rejects(publishCanonicalScript({...h.input,expected_revision:1,expected_hash:null},h.adapters),/invalid/);assert.deepEqual(h.calls,[])});

test('contradictory operation identity never reaches Storage',async()=>{const h=harness();h.adapters.command=async()=>({state:'prepared',operation_id:'other',storage_key:'object',sha256:hash,bytes:bytes.length});await assert.rejects(publishCanonicalScript(h.input,h.adapters),/identity/);assert.deepEqual(h.calls,[])});

import {TongsCommitService} from '../dist/workpiece-commit-api.js';
function serviceFixture(){
 const workpiece='d1000000-0000-4000-8000-000000000001';const objects=new Map();const reads=[];
 const service=new TongsCommitService({storage:{from:()=>({download:async key=>{reads.push(key);return objects.has(key)?{data:new Blob([objects.get(key)]),error:null}:{data:null,error:{statusCode:'404',message:'not found'}}}})}},'forge-workpieces',null);
 service.getCradleOrThrow=async()=>({id:workpiece,workspace_id:'a1000000-0000-4000-8000-000000000001',created_at:'2026-11-11T00:00:00Z'});
 const key=`workpieces/${workpiece}/script/publications/op/script.md`;
 const script={storage_key:key,storage_bucket:'forge-workpieces',hash_algo:'sha256',hash_value:hash,bytes:bytes.length,revision:2,updated_at:'2026-11-11T00:00:00Z'};
 const rows=new Map([['script/script.md',script]]);service.readWorkpieceFileMetadata=async(_w,path)=>rows.get(path)??null;objects.set(key,bytes);
 return{service,objects,reads,workpiece,key,rows,script};
}
test('logical script reader selects immutable registry key and rejects altered bytes',async()=>{const h=serviceFixture();assert.equal((await h.service.readWorkpieceText(h.workpiece,'script/script.md')).text,text);assert.deepEqual(h.reads,[h.key]);h.objects.set(h.key,new Uint8Array(bytes.length));await assert.rejects(h.service.readWorkpieceText(h.workpiece,'script/script.md'),e=>e.code==='script_integrity_mismatch')});
test('legacy registry-selected script remains readable',async()=>{const h=serviceFixture();const key=`workpieces/${h.workpiece}/script/script.md`;h.script.storage_key=key;h.objects.set(key,bytes);assert.equal((await h.service.readWorkpieceText(h.workpiece,'script/script.md')).text,text)});
test('stale manifest is detected and reconciliation selects current registry revision',async()=>{const h=serviceFixture();const key=`workpieces/${h.workpiece}/manifest.json`;const put=value=>{const b=Buffer.from(JSON.stringify(value));h.objects.set(key,b);h.rows.set('manifest.json',{storage_key:key,storage_bucket:'forge-workpieces',hash_algo:'sha256',hash_value:createHash('sha256').update(b).digest('hex'),bytes:b.length});};put({files:{}});await assert.rejects(h.service.readWorkpieceJson(h.workpiece,'manifest.json'),e=>e.code==='script_manifest_projection_stale');const projection=await h.service.loadManifestOrDefault(await h.service.getCradleOrThrow());assert.equal(projection.files['script/script.md'].registry_revision,2);assert.equal(projection.files['script/script.md'].storage_key,h.key);put(projection);assert.equal((await h.service.readWorkpieceJson(h.workpiece,'manifest.json')).found,true)});
test('orphan cleanup terminalizes before removal and never removes a committed/current object',async()=>{
 for(const state of ['prepared','committed','abandoned','conflict']){
  const calls=[],key='workpieces/w/script/publications/op/script.md';
  const supabase={schema:()=>({rpc:async(_name,args)=>{calls.push(args.p_command);return{data:{state,storage_key:key},error:null}}}),storage:{from:()=>({remove:async keys=>{calls.push(keys[0]);return{error:null}},download:async()=>({data:null,error:{statusCode:'404'}})})}};
  const service=new TongsCommitService(supabase,'forge-workpieces',null);service.assertWorkpieceInWorkspace=async()=>{};service.assertWorkspaceRoleFromAccessToken=async()=>({userId:'actor'});service.readWorkpieceFileMetadata=async()=>({storage_key:'different-current-key'});
  if(['abandoned','conflict'].includes(state)){assert.equal((await service.abandonScriptPublication('w','ws','op','token')).absence_verified,true);assert.deepEqual(calls,['abandon',key]);}
  else{await assert.rejects(service.abandonScriptPublication('w','ws','op','token'),e=>e.code==='script_cleanup_not_permitted');assert.deepEqual(calls,['abandon']);}
 }
});
test('generic ready-script deletion cannot remove current canonical script',async()=>{const h=serviceFixture();h.service.assertWorkspaceRoleFromAccessToken=async()=>({userId:'actor'});await assert.rejects(h.service.deleteReadyScript(h.workpiece,'script/script.md',{userAccessToken:'token'}),e=>e.code==='canonical_script_deletion_requires_episode_cleanup');assert.deepEqual(h.reads,[])});
test('publication reuses strict Storage error classification including wrapped HTTP 400/object 404',async()=>{
 for(const [error,missing] of [[{originalError:new Response(JSON.stringify({statusCode:'404',error:'not_found'}),{status:400})},true],[{statusCode:'404',code:'NoSuchBucket'},false],[{status:403,statusCode:'404'},false],[{message:'not found'},false],[new Error('timeout'),false]]){
  let uploads=0;const supabase={schema:()=>({rpc:async(_name,args)=>({data:{state:args.p_command==='prepare'?'prepared':'conflict',operation_id:'op',storage_key:'object',sha256:hash,bytes:bytes.length},error:null})}),storage:{from:()=>({download:async()=>uploads?{data:new Blob([bytes]),error:null}:{data:null,error},upload:async()=>{uploads++;return{error:null}}})}};
  const service=new TongsCommitService(supabase,'forge-workpieces',null);service.assertWorkpieceInWorkspace=async()=>{};service.assertWorkspaceRoleFromAccessToken=async()=>({userId:'actor'});
  const call=()=>service.publishScript('w',{workspace_id:'ws',operation_id:'op',expected_revision:0,expected_hash:null,text},'token');
  if(missing)assert.equal((await call()).state,'conflict');else await assert.rejects(call,e=>e.code==='script_staging_read_failed');
  assert.equal(uploads,missing?1:0);
 }
});
