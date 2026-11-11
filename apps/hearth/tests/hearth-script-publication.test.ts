import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { publishReviewedScript, ScriptPublicationConflict } from '../src/lib/hearth-script-publication';
import { configureTongsUserAccessTokenResolver } from '../src/lib/tongs-fetch';
import { normalizeScriptPublicationBasis } from '../src/domain/draft';
const text='[s1]\nExact reviewed text.\n[/s1]\n';
const args={workspaceId:'a1000000-0000-4000-8000-000000000001',workpieceId:'d1000000-0000-4000-8000-000000000001',operationId:'11000000-0000-4000-8000-000000000001',text,basis:{revision:1,hash:'a'.repeat(64)}};
const hash=createHash('sha256').update(text).digest('hex');
const receipt={operation_id:args.operationId,workspace_id:args.workspaceId,workpiece_id:args.workpieceId,path:'script/script.md',revision:2,sha256:hash,bytes:Buffer.byteLength(text),unchanged:false};
test('publication receipts bind exact operation, scope, revision, SHA and byte count',async()=>{
 const dom=new JSDOM('',{url:'http://localhost/?tongs_api_token=fixture'});const oldWindow=globalThis.window,oldFetch=globalThis.fetch;
 Object.assign(globalThis,{window:dom.window});configureTongsUserAccessTokenResolver(async()=>'local-fixture');
 try {
  for(const altered of [null,{operation_id:'other'},{workspace_id:'other'},{workpiece_id:'other'},{path:'script/other.md'},{revision:3},{sha256:'b'.repeat(64)},{bytes:1}]){
   globalThis.fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));assert.equal(body.text,text);assert.equal(body.expected_revision,1);assert.equal(body.expected_hash,args.basis.hash);return new Response(JSON.stringify({ok:true,data:{state:'committed',receipt:{...receipt,...altered}}}),{status:200});};
   if(altered)await assert.rejects(publishReviewedScript(args),/receipt/);else assert.deepEqual(await publishReviewedScript(args),{revision:2,hash,bytes:Buffer.byteLength(text)});
  }
  globalThis.fetch=async()=>new Response('{}',{status:409});await assert.rejects(publishReviewedScript(args),ScriptPublicationConflict);
  globalThis.fetch=async()=>new Response('{}',{status:503});await assert.rejects(publishReviewedScript(args),/same operation/);
 } finally {globalThis.fetch=oldFetch;Object.assign(globalThis,{window:oldWindow});configureTongsUserAccessTokenResolver(null);dom.window.close();}
});
test('persisted draft basis never accepts malformed revisions or hashes',()=>{
 assert.deepEqual(normalizeScriptPublicationBasis({workpieceId:args.workpieceId,...args.basis}),{workpieceId:args.workpieceId,...args.basis});
 for(const value of [null,{}, {workpieceId:args.workpieceId,revision:-1,hash:null},{workpieceId:args.workpieceId,revision:1,hash:null},{workpieceId:args.workpieceId,revision:0,hash:'a'.repeat(64)}])assert.equal(normalizeScriptPublicationBasis(value),undefined);
});
