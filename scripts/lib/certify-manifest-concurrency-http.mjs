import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {TongsCommitService} from '../../packages/tongs/dist/workpiece-commit-api.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
const quote=v=>v===null?'null':`'${String(v).replaceAll("'","''")}'`;

// Real Storage HTTP + real SQL; no manifest/version/registry behavior mocked.
// SQL adapter selects only synthetic disposable rows. No hosted credentials.
export async function certifyManifestConcurrencyHttp({sql,client,workspace,episode,capacity}) {
 const serviceSql=q=>sql(`set role service_role;set request.jwt.claims='{"role":"service_role"}';${q}`);
 const parsed=q=>JSON.parse(serviceSql(q).trim());
 const events=[];
 const make=()=>{
  const service=new TongsCommitService({storage:client.storage,schema:()=>({
   rpc:async(name,args)=>{assert.equal(name,'read_workpiece_manifest_version');return {data:parsed(`select tongs.read_workpiece_manifest_version(${quote(args.p_workpiece_id)});`),error:null};},
   from:table=>{
    assert.equal(table,'workpiece_files');let wp,path;
    const q={select:()=>q,eq:(k,v)=>{if(k==='workpiece_id')wp=v;if(k==='path')path=v;return q;},
     single:async()=>({data:parsed(`select row_to_json(f) from tongs.workpiece_files f where workpiece_id=${quote(wp)} and path=${quote(path)};`),error:null}),
     upsert:async rows=>{for(const row of rows){const keys=Object.keys(row);serviceSql(`insert into tongs.workpiece_files(${keys.join(',')}) values(${keys.map(k=>quote(row[k])).join(',')}) on conflict(workpiece_id,path) do update set ${keys.filter(k=>!['workpiece_id','path'].includes(k)).map(k=>`${k}=excluded.${k}`).join(',')};`);}return {error:null};}};return q;
   }
  })});
  service.insertEvent=async e=>{events.push(e);return e;};
  return service;
 };
 const cradle={id:episode,workspace_id:workspace,created_at:'2026-08-01T00:00:00Z'};
 const commit=(service,path)=>service.commitFileBytes({cradle,path,contentType:'application/json',fileType:'json',writtenBy:{tool:'storage-cert',tool_version:'1',lane:'fixture'},bytes:new TextEncoder().encode('{"synthetic":true}'),commitMode:'replace'});
 const manifestKey=`workpieces/${episode}/manifest.json`,paths=[];
 let casConflicts=0;
 for(let round=0;round<25;round++){
  let readers=0,release;const barrier=new Promise(r=>release=r);
  const services=[make(),make()];
  for(const s of services){const load=s.loadManifestOrDefault.bind(s);let first=true;s.loadManifestOrDefault=async c=>{const value=await load(c);if(first){first=false;if(++readers===2)release();await barrier;}else casConflicts++;return value;};}
  const next=[`metadata/concurrency-${round}-a.json`,`metadata/concurrency-${round}-b.json`];paths.push(...next);
  await Promise.all(services.map((s,i)=>commit(s,next[i])));
  const result=await client.storage.from('forge-workpieces').download(manifestKey);assert.equal(result.error,null);
  const bytes=Buffer.from(await result.data.arrayBuffer()),manifest=JSON.parse(bytes);
  for(const path of paths)assert.ok(manifest.files[path],`successful operation ${path} retained`);
  const registry=parsed(`select row_to_json(f) from tongs.workpiece_files f where workpiece_id=${quote(episode)} and path='manifest.json';`);
  assert.equal(registry.hash_value,hash(bytes));assert.equal(Number(registry.bytes),bytes.length);
 }
 assert.ok(casConflicts>=25,'every forced shared read must exercise CAS recovery');
 assert.equal(Number(sql(`select count(*) from tongs.workpiece_manifest_publications where workpiece_id=${quote(episode)};`).trim()),50);
 assert.equal(events.length,50);
 assert.throws(()=>serviceSql(`update tongs.workpiece_files set hash_value=repeat('0',64) where workpiece_id=${quote(episode)} and path='manifest.json';`),/manifest registry version conflict/);
 const version=parsed(`select tongs.read_workpiece_manifest_version(${quote(episode)});`).version;
 const before=await client.storage.from('forge-workpieces').download(manifestKey);const original=Buffer.from(await before.data.arrayBuffer());
 const stale=await client.storage.from('forge-workpieces').upload(manifestKey,original,{upsert:true,metadata:{forge_manifest_publication:{protocol:'forge.manifest-cas.v1',operation_id:randomUUID(),expected_version:randomUUID(),sha256:hash(original),written_by:{tool:'storage-cert',tool_version:'1',lane:'fixture'}}}});
 assert.ok(stale.error,'stale version must fail');
 assert.equal(parsed(`select tongs.read_workpiece_manifest_version(${quote(episode)});`).version,version);
 const after=await client.storage.from('forge-workpieces').download(manifestKey);assert.deepEqual(Buffer.from(await after.data.arrayBuffer()),original);
 assert.equal(Number(sql(`select count(*) from tongs.workpiece_manifest_publications where workpiece_id=${quote(episode)};`).trim()),50);
 assert.throws(()=>sql("set role authenticated; select tongs.read_workpiece_manifest_version('"+episode+"');"),/permission denied/);
 assert.throws(()=>serviceSql('select * from tongs.workpiece_manifest_publications;'),/permission denied/);
 assert.throws(()=>sql('update tongs.workpiece_manifest_publications set bytes=0;'),/immutable/);
 const cleanup=await client.storage.from('forge-workpieces').remove([manifestKey,...paths.map(p=>`workpieces/${episode}/${p}`)]);assert.equal(cleanup.error,null);
 serviceSql(`delete from tongs.workpiece_files where workpiece_id=${quote(episode)} and (path='manifest.json' or path like 'metadata/concurrency-%');`);
 assert.equal(capacity().used_bytes,0);
 return {result:'PASS',rounds:25,successfulOperations:50,casConflicts,registryAtomic:true,staleRegistryRejected:true,staleUploadBytesPreserved:true,receiptRlsAndImmutability:true};
}
