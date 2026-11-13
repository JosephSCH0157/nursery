import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {mergeManifestDelta,ManifestConflictError} from '../dist/manifest-concurrency.js';
import {TongsCommitService} from '../dist/workpiece-commit-api.js';

const hash=b=>createHash('sha256').update(b).digest('hex');
function fixture() {
 const objects=new Map(),rows=new Map(),events=[],versions=new Map(),publications=[];
 let failure=null;
 const workpiece='d4000000-0000-4000-8000-000000000001';
 const prefix=`workpieces/${workpiece}/`;
 const client={storage:{from:()=>({
  upload:async(key,data,options)=>{
   if(failure==='manifest' && key.endsWith('/manifest.json'))return {error:{message:'PF001 storage_capacity_exceeded_delete_only'}};
   if(key.endsWith('/manifest.json')) {
    const proof=options.metadata.forge_manifest_publication;
    if(proof.expected_version!==(versions.get(key)??null))return {error:{message:'PF003 manifest version conflict'}};
    if(failure==='registry')return {error:{message:'synthetic transactional registry outage'}};
    rows.set('manifest.json',{path:'manifest.json',hash_value:proof.sha256,bytes:data.byteLength});
    publications.push(proof);
   }
   versions.set(key,randomUUID());objects.set(key,Buffer.from(data));return {error:null};
  },
  download:async key=>objects.has(key)?{data:new Blob([objects.get(key)]),error:null}:{data:null,error:{message:'Object not found',status:404,statusCode:'404'}},
 })},schema:()=>({rpc:async(name,args)=>{
  assert.equal(name,'read_workpiece_manifest_version');assert.equal(args.p_workpiece_id,workpiece);
  const version=versions.get(prefix+'manifest.json');return {data:{exists:!!version,version:version??null},error:null};
 },from:table=>{
  assert.equal(table,'workpiece_files');let path;
  const q={select:()=>q,eq:(key,value)=>{if(key==='path')path=value;return q;},single:async()=>({data:rows.get(path),error:null})};return q;
 }})};
 const service=new TongsCommitService(client);
 service.upsertWorkpieceFile=async entries=>{for(const e of entries){if(e.path!=='manifest.json')rows.set(e.path,e);}};
 service.insertEvent=async e=>{events.push(e);return e;};
 const commit=(path='metadata/test.json')=>service.commitFileBytes({cradle:{id:workpiece,workspace_id:'a4000000-0000-4000-8000-000000000001',created_at:'2026-08-01T00:00:00Z'},
  path,contentType:'application/json',fileType:'json',writtenBy:{tool:'storage-cert',tool_version:'1',lane:'fixture'},
  bytes:new TextEncoder().encode('{"synthetic":true}'),commitMode:'replace'});
 return {service,objects,rows,events,publications,prefix,commit,fail:value=>{failure=value;}};
}

test('manifest capacity failure preserves error identity and reports incomplete publication; reviewed retry reconciles',async()=>{
 const f=fixture();f.fail('manifest');
 await assert.rejects(f.commit(),error=>{
  assert.equal(error.code,'storage_capacity_exceeded');
  assert.equal(error.details.commit_state,'incomplete');assert.equal(error.details.incomplete_stage,'manifest_publish');
  assert.equal(error.details.retained_file_written,true);assert.equal(error.details.retry_requires_reconciliation,true);return true;
 });
 assert.equal(f.events.length,0);assert.equal(f.rows.has('metadata/test.json'),true);assert.equal(f.objects.size,1);
 f.fail(null);const result=await f.commit();
 assert.equal(f.objects.size,2);assert.equal(f.rows.size,2);assert.equal(f.events.length,1);
 assert.equal(result.manifest_hash,hash(f.objects.get(f.prefix+'manifest.json')));
 assert.equal(result.file_row.hash_value,hash(f.objects.get(f.prefix+'metadata/test.json')));
});

test('manifest registry failure rolls back publication; retained file bytes survive retry',async()=>{
 const f=fixture();f.fail('registry');
 await assert.rejects(f.commit(),error=>error.code==='storage_write_failed'&&error.details.incomplete_stage==='manifest_publish');
 const original=Buffer.from(f.objects.get(f.prefix+'metadata/test.json'));
 assert.equal(f.events.length,0);assert.equal(f.objects.size,1);assert.equal(f.rows.has('manifest.json'),false);assert.equal(f.publications.length,0);
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


test('100 concurrent-save rounds preserve every successful operation and registry identity',async()=>{
 for(let round=0;round<100;round++){
  const f=fixture();let arrivals=0,release;const barrier=new Promise(r=>release=r);
  const load=f.service.loadManifestOrDefault.bind(f.service);
  f.service.loadManifestOrDefault=async cradle=>{const value=await load(cradle);if(++arrivals===8)release();await barrier;return value;};
  await Promise.all(Array.from({length:8},(_,i)=>f.commit(`metadata/${i}.json`)));
  const bytes=f.objects.get(f.prefix+'manifest.json'),manifest=JSON.parse(bytes);
  for(let i=0;i<8;i++)assert.ok(manifest.files[`metadata/${i}.json`]);
  assert.equal(f.events.length,8);assert.equal(f.publications.length,8);
  assert.equal(new Set(f.publications.map(p=>p.operation_id)).size,8);
  assert.equal(f.rows.get('manifest.json').hash_value,hash(bytes));
 }
});

test('rebase preserves unrelated entries and rejects same-entry or pointer conflicts',()=>{
 const base={files:{a:{hash:1}},pointers:{draft:'a'}};
 assert.deepEqual(mergeManifestDelta(base,{...base,files:{...base.files,b:{hash:2}}},{...base,files:{...base.files,c:{hash:3}}}).files,{a:{hash:1},c:{hash:3},b:{hash:2}});
 assert.throws(()=>mergeManifestDelta(base,{...base,files:{a:{hash:2}}},{...base,files:{a:{hash:3}}}),ManifestConflictError);
 assert.throws(()=>mergeManifestDelta(base,{...base,pointers:{draft:'b'}},{...base,pointers:{draft:'c'}}),ManifestConflictError);
 assert.throws(()=>mergeManifestDelta(base,{...base,files:{}},{...base,files:{a:{hash:3}}}),ManifestConflictError);
});
