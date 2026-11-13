import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {TongsCommitService} from '../dist/workpiece-commit-api.js';

const hash=b=>createHash('sha256').update(b).digest('hex');
function fixture() {
 const objects=new Map(),rows=new Map(),events=[];
 let failure=null;
 const workpiece='d4000000-0000-4000-8000-000000000001';
 const prefix=`workpieces/${workpiece}/`;
 const client={storage:{from:()=>({
  upload:async(key,data)=>{
   if(failure==='manifest' && key.endsWith('/manifest.json'))return {error:{message:'PF001 storage_capacity_exceeded_delete_only'}};
   objects.set(key,Buffer.from(data));return {error:null};
  },
  download:async key=>objects.has(key)?{data:new Blob([objects.get(key)]),error:null}:{data:null,error:{message:'Object not found',status:404,statusCode:'404'}},
 })},schema:()=>({from:table=>{
  assert.equal(table,'workpiece_files');let path;
  const q={select:()=>q,eq:(key,value)=>{if(key==='path')path=value;return q;},single:async()=>({data:rows.get(path),error:null})};return q;
 }})};
 const service=new TongsCommitService(client);
 service.upsertWorkpieceFile=async entries=>{for(const e of entries){if(failure==='registry'&&e.path==='manifest.json')throw new Error('synthetic registry outage');rows.set(e.path,e);}};
 service.insertEvent=async e=>{events.push(e);return e;};
 const commit=(path='metadata/test.json')=>service.commitFileBytes({cradle:{id:workpiece,workspace_id:'a4000000-0000-4000-8000-000000000001',created_at:'2026-08-01T00:00:00Z'},
  path,contentType:'application/json',fileType:'json',writtenBy:{tool:'storage-cert',tool_version:'1',lane:'fixture'},
  bytes:new TextEncoder().encode('{"synthetic":true}'),commitMode:'replace'});
 return {service,objects,rows,events,prefix,commit,fail:value=>{failure=value;}};
}

test('manifest capacity failure preserves error identity and reports incomplete publication; reviewed retry reconciles',async()=>{
 const f=fixture();f.fail('manifest');
 await assert.rejects(f.commit(),error=>{
  assert.equal(error.code,'storage_capacity_exceeded');
  assert.equal(error.details.commit_state,'incomplete');assert.equal(error.details.incomplete_stage,'manifest_upload');
  assert.equal(error.details.retained_file_written,true);assert.equal(error.details.retry_requires_reconciliation,true);return true;
 });
 assert.equal(f.events.length,0);assert.equal(f.rows.has('metadata/test.json'),true);assert.equal(f.objects.size,1);
 f.fail(null);const result=await f.commit();
 assert.equal(f.objects.size,2);assert.equal(f.rows.size,2);assert.equal(f.events.length,1);
 assert.equal(result.manifest_hash,hash(f.objects.get(f.prefix+'manifest.json')));
 assert.equal(result.file_row.hash_value,hash(f.objects.get(f.prefix+'metadata/test.json')));
});

test('manifest registry failure is not reported as rollback or success; original bytes survive retry',async()=>{
 const f=fixture();f.fail('registry');
 await assert.rejects(f.commit(),error=>error.code==='workpiece_commit_incomplete'&&error.details.incomplete_stage==='manifest_registry');
 const original=Buffer.from(f.objects.get(f.prefix+'metadata/test.json'));
 assert.equal(f.events.length,0);assert.equal(f.objects.size,2);
 f.fail(null);await f.commit();assert.deepEqual(f.objects.get(f.prefix+'metadata/test.json'),original);
 assert.equal(f.rows.get('manifest.json').hash_value,hash(f.objects.get(f.prefix+'manifest.json')));
});

test('manifest self entry is the first-pass hash; registry identifies final bytes',async()=>{
 const f=fixture();await f.commit();const bytes=f.objects.get(f.prefix+'manifest.json');const manifest=JSON.parse(bytes);
 const self=manifest.files['manifest.json'];delete manifest.files['manifest.json'];
 const normalize=v=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])])):v;
 const first=Buffer.from(JSON.stringify(normalize(manifest)));
 assert.equal(self.hash.value,hash(first));assert.equal(self.bytes,first.length);
 assert.equal(f.rows.get('manifest.json').hash_value,hash(bytes));
 assert.notEqual(self.hash.value,f.rows.get('manifest.json').hash_value);
});

test('concurrent file saves retain both shared-manifest references',async()=>{
 const f=fixture();const load=f.service.loadManifestOrDefault.bind(f.service);
 let readers=0,release;const barrier=new Promise(resolve=>{release=resolve;});
 f.service.loadManifestOrDefault=async cradle=>{const manifest=await load(cradle);if(++readers===2)release();await barrier;return manifest;};
 await Promise.all([f.commit('metadata/one.json'),f.commit('metadata/two.json')]);
 const manifest=JSON.parse(f.objects.get(f.prefix+'manifest.json'));
 assert.ok(manifest.files['metadata/one.json'],'first successful save must remain referenced');
 assert.ok(manifest.files['metadata/two.json'],'second successful save must remain referenced');
});
