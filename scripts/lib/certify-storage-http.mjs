import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const require=createRequire(new URL('../../packages/tongs/package.json',import.meta.url));
const {createClient}=require('@supabase/supabase-js');
import {TongsCommitService} from '../../packages/tongs/dist/workpiece-commit-api.js';

// Disposable Storage API using the already installed image. No shared volume,
// no published non-loopback port, no hosted credentials, no image pulls.
export async function certifyStorageHttp({run,sql,database,workspace,episode,capacity}) {
 const source=JSON.parse(run(['inspect','supabase_storage_forge-gate-e1-pre']))[0];
 const env=Object.fromEntries(source.Config.Env.map(s=>[s.slice(0,s.indexOf('=')),s.slice(s.indexOf('=')+1)]));
 const db=new URL(env.DATABASE_URL); assert.equal(db.hostname,'supabase_db_forge-gate-e1-pre');
 assert.match(database,/^forge_storage_[a-f0-9]{12}$/);db.pathname='/'+database;
 const name='forge-storage-http-'+randomBytes(6).toString('hex');
 const secret=randomBytes(32).toString('hex');
 const jwt=role=>{const p=[{alg:'HS256',typ:'JWT'},{role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+600}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');return p+'.'+createHmac('sha256',secret).update(p).digest('base64url');};
 const serviceKey=jwt('service_role');
 const settings={DATABASE_URL:db.href,AUTH_JWT_SECRET:secret,ANON_KEY:jwt('anon'),SERVICE_KEY:serviceKey,
 STORAGE_BACKEND:'file',FILE_STORAGE_BACKEND_PATH:'/data',TENANT_ID:'storage-cert',GLOBAL_S3_BUCKET:'storage-cert',REGION:'local',STORAGE_S3_REGION:'local',
 FILE_SIZE_LIMIT:'1048576',ENABLE_IMAGE_TRANSFORMATION:'false',S3_PROTOCOL_ENABLED:'false',DB_MIGRATIONS_FREEZE_AT:env.DB_MIGRATIONS_FREEZE_AT};
 const args=['run','--detach','--pull=never','--name',name,'--network','supabase_network_forge-gate-e1-pre','--publish','127.0.0.1::5000','--tmpfs','/data'];
 for(const [k,v] of Object.entries(settings))if(v!=null)args.push('--env',`${k}=${v}`);
 let started=false;
 const keepAlive=setInterval(()=>{},1000);
 const observations=[];
 try {
  // Never expose Docker launch arguments/credentials in diagnostics.
  try{run([...args,source.Image]);started=true;}catch{throw Error('Disposable Storage launch failed (credentials suppressed)');}
  const bindings=JSON.parse(run(['inspect',name]))[0].NetworkSettings.Ports['5000/tcp'];
  assert.equal(bindings[0].HostIp,'127.0.0.1');const origin=`http://127.0.0.1:${bindings[0].HostPort}`;
  let ready=false;for(let i=0;i<30;i++){try{const r=await fetch(origin+'/status',{signal:AbortSignal.timeout(1000)});if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
  if(!ready){const logs=run(['logs',name]);const categories=[...new Set(logs.match(/permission denied[^\n"]*|password authentication failed|relation [^\n"]*|connect ECONNREFUSED|Missing required[^\n"]*/g)||[])];throw Error('Disposable Storage readiness failed: '+JSON.stringify(categories));}
  const client=createClient(origin,serviceKey,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
    const url=new URL(typeof input==='string'?input:input.url);assert.equal(url.origin,origin);
    // Direct Storage server routes have no gateway /storage/v1 prefix.
    url.pathname=url.pathname.replace(/^\/storage\/v1/,'');
    const response=await fetch(url,{...init,signal:AbortSignal.timeout(10000)});
    observations.push({method:init?.method??'GET',status:response.status,route:url.pathname.split('/').slice(0,3).join('/')});return response;
  }}});
  // Only database lookup is adapted to the real disposable SQL connection.
  // Tongs serialization/upload/error handling and Storage HTTP are unmodified.
  const workspaceRow=JSON.parse(sql(`select row_to_json(w) from tongs.workspaces w where id='${workspace}';`).trim());
  const service=new TongsCommitService({storage:client.storage,schema:s=>{assert.equal(s,'tongs');return{from:table=>{assert.equal(table,'workspaces');return{select:()=>({eq:(key,id)=>{assert.equal(key,'id');assert.equal(id,workspace);return{single:async()=>({data:workspaceRow,error:null})};}})}}};}});
  const commit=(path,json)=>service.commitWorkspaceFile(workspace,{path,json,written_by:{tool:'storage-cert',tool_version:'1',lane:'fixture'}});
  const a=await commit('billing-cert/a.json',{value:1});assert.equal(capacity().used_bytes,a.bytes);
  await commit('billing-cert/a.json',{value:2});assert.equal(capacity().used_bytes,a.bytes,'overwrite counted once');
  await commit('billing-cert/a.json',{value:2});assert.equal(capacity().used_bytes,a.bytes,'explicit retry counted once');
  const downloaded=await client.storage.from('forge-workpieces').download(a.storage_key);assert.equal(downloaded.error,null);assert.match(await downloaded.data.text(),/2/);
  sql(`update tongs.workspaces set created_by=null where id='${workspace}';`);
  await assert.rejects(commit('billing-cert/unknown.json',{x:1}),e=>e.code==='storage_usage_unverified');
  assert.equal((await client.storage.from('forge-workpieces').remove([a.storage_key])).error,null,'unknown usage does not block deletion');
  sql(`update tongs.workspaces set created_by='${workspaceRow.created_by}' where id='${workspace}';`);
  await commit('billing-cert/a.json',{value:2});
  const remaining=5*1024**3-a.bytes-1;
  sql(`insert into storage.objects(bucket_id,name,metadata,version) values('forge-workpieces','workpieces/${episode}/billing-cert/filler.bin','{"size":${remaining}}','fixture');`);
  await assert.rejects(commit('billing-cert/a.json',{value:'too large for quota'}),e=>e.code==='storage_capacity_exceeded');
  const unchanged=await client.storage.from('forge-workpieces').download(a.storage_key);assert.equal(unchanged.error,null);assert.match(await unchanged.data.text(),/2/);
  const settled=await Promise.allSettled([commit('billing-cert/b.json',{b:1}),commit('billing-cert/c.json',{c:1})]);
  const failures=[];
  const after=capacity();
  if(settled.some(x=>x.status==='fulfilled'))failures.push('Tongs reported success for over-capacity Storage HTTP uploads');
  if(settled.some(x=>x.status==='rejected' && x.reason.code!=='storage_capacity_exceeded'))failures.push('capacity rejection lost its Tongs error identity');
  if(after.used_bytes>5*1024**3)failures.push('durable Storage metadata exceeded capacity');
  console.log(JSON.stringify({httpCapacityBoundary:{results:settled.map(x=>({status:x.status,code:x.reason?.code})),after,observations,
    registryRows:JSON.parse(sql(`select coalesce(json_agg(json_build_object('name',name,'bytes',metadata->>'size')),'[]') from storage.objects where name like '%billing-cert/%';`).trim()),
    guard:sql("select tgenabled from pg_trigger where tgname='forge_storage_capacity_guard';").trim()}}));
  sql(`update storage.objects set metadata=jsonb_build_object('size',${remaining-6}) where name='workpieces/${episode}/billing-cert/filler.bin';`);
  const race=await Promise.allSettled([commit('billing-cert/b.json',{b:1}),commit('billing-cert/c.json',{c:1})]);
  assert.equal(race.filter(x=>x.status==='fulfilled').length,1,'one concurrent HTTP upload fits; both must not win');
  assert.equal(capacity().used_bytes,5*1024**3);
  const deletion=await client.storage.from('forge-workpieces').remove([a.storage_key]);assert.equal(deletion.error,null,'delete available at capacity');
  const tmp=`workpieces/${episode}/_uploads/http-cert/chunks/0.part`;
  const beforeTemporary=capacity().used_bytes;
  const upload=await client.storage.from('forge-workpieces').upload(tmp,new Uint8Array(128),{upsert:false});assert.equal(upload.error,null,'temporary chunk remains permitted');
  const retainedAfterDeletion=capacity().used_bytes;
  if(retainedAfterDeletion!==beforeTemporary)failures.push('unexpected retained metadata after rejected uploads');
  assert.equal((await client.storage.from('forge-workpieces').remove([tmp])).error,null);
  sql(`begin;set local storage.allow_delete_query='true';delete from storage.objects where name='workpieces/${episode}/billing-cert/filler.bin';commit;`);
  const residual=await client.storage.from('forge-workpieces').remove([a.storage_key.replace(/a[.]json$/,'b.json'),a.storage_key.replace(/a[.]json$/,'c.json')]);
  assert.equal(residual.error,null);
  return {result:failures.length?'FAIL':'PASS',failures,observations,scope:'Real Storage HTTP through Tongs workspace commit service; SQL lookup adapter, not end-user HTTP authorization. Quota filler is synthetic metadata.'};
 } finally {clearInterval(keepAlive);if(started)run(['rm','--force',name]);}
}
