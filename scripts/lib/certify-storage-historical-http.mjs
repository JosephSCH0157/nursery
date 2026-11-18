import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export async function certifyHistoricalStorageHttp({sql,client,origin,jwt,workspace,episode,owner,capacity}) {
 const other='11000000-0000-4000-8000-000000000004';
 // Existing authenticated Storage policy covers STT workpiece artifacts. Other
 // workspace paths require the Tongs-mediated signing route, not a new grant.
 const key=`workpieces/${episode}/stt/historical.json`;
 const bytes=Buffer.from('{"synthetic_historical":true}');
 const digest=createHash('sha256').update(bytes).digest('hex');
 const operator=q=>`set role authenticated;set request.jwt.claims='{"role":"authenticated","sub":"${other}"}';${q}`;
 const parse=x=>JSON.parse(x.trim().split('\n').at(-1));
 const read=async token=>{
  const r=await fetch(`${origin}/object/authenticated/forge-workpieces/${key}`,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
  return {status:r.status,bytes:Buffer.from(await r.arrayBuffer())};
 };
 sql(`insert into tongs.workspace_members(workspace_id,user_id,role) values('${workspace}','${owner}','owner') on conflict(workspace_id,user_id) do nothing;`);
 assert.equal((await client.storage.from('forge-workpieces').upload(key,bytes,{contentType:'application/json'})).error,null);
 const before=await read(jwt('authenticated',owner));assert.equal(before.status,200,before.bytes.toString());assert.deepEqual(before.bytes,bytes);
 const denied=await read(jwt('authenticated',other));assert.notEqual(denied.status,200);
 const row=parse(sql(`select row_to_json(o) from storage.objects o where name='${key}';`));
 // SQL fixture construction retains real provider bytes/version, not a mocked
 // HTTP response. Reinsert metadata with historical creation timestamps before
 // any observation/approval; all provider guards remain enabled afterwards.
 const fixture={...row,created_at:'2026-08-01T00:00:00Z',updated_at:'2026-08-01T00:00:00Z'};
 const quoted=JSON.stringify(fixture).replaceAll("'","''");
 sql(`begin;set local storage.allow_delete_query='true';delete from storage.objects where id='${row.id}';
 insert into storage.objects(id,bucket_id,name,owner,created_at,updated_at,last_accessed_at,metadata,version,owner_id,user_metadata)
 select id,bucket_id,name,owner,created_at,updated_at,last_accessed_at,metadata,version,owner_id,user_metadata
 from jsonb_populate_record(null::storage.objects,'${quoted}'::jsonb);commit;`);
 sql(`update tongs.workspaces set created_by=null where id='${workspace}';`);
 assert.equal(capacity().usage_complete,false);
 const obs=parse(sql(operator(`select tongs.observe_storage_historical_accounting(array['${row.id}'::uuid]);`)));
 const evidence=createHash('sha256').update(JSON.stringify({id:row.id,version:row.version,sha256:digest})).digest('hex');
 sql(operator(`select tongs.approve_storage_historical_accounting('${obs.id}','${obs.manifest_sha256}','${evidence}','Reviewed synthetic HTTP fixture bytes');`));
 assert.equal(capacity().usage_complete,true);
 const after=await read(jwt('authenticated',owner));assert.equal(after.status,200);assert.deepEqual(after.bytes,bytes);
 assert.notEqual((await read(jwt('authenticated',other))).status,200);
 assert.notEqual((await read(jwt('anon'))).status,200);
 assert.equal(sql(`select tongs._storage_historical_matches(o) from storage.objects o where id='${row.id}';`).trim(),'t');
 const signed=await client.storage.from('forge-workpieces').createSignedUrl(key,60);assert.equal(signed.error,null);
 const signedResponse=await fetch(signed.data.signedUrl.replace('/storage/v1/','/'));assert.equal(signedResponse.status,200);
 assert.deepEqual(Buffer.from(await signedResponse.arrayBuffer()),bytes);
 const bad=await client.storage.from('forge-workpieces').upload(key,Buffer.from('{"replacement":true}'),{upsert:true,contentType:'application/json'});
 assert.ok(bad.error,'unresolved billing owner cannot replace excluded content');
 assert.deepEqual((await read(jwt('authenticated',owner))).bytes,bytes,'failed replacement preserves provider bytes');
 sql(`update tongs.workspaces set created_by='${owner}' where id='${workspace}';`);
 assert.equal(capacity().used_bytes,0,'original generation stays unassigned');
 const next=Buffer.from('{"replacement":true}');
 assert.equal((await client.storage.from('forge-workpieces').upload(key,next,{upsert:true,contentType:'application/json'})).error,null);
 assert.equal(capacity().used_bytes,next.length);
 assert.deepEqual((await read(jwt('authenticated',owner))).bytes,next);
 assert.equal(sql(`select tongs._storage_historical_matches(o) from storage.objects o where id='${row.id}';`).trim(),'f');
 assert.equal((await client.storage.from('forge-workpieces').remove([key])).error,null);
 return {result:'PASS',historicalBytesSha256:digest,checks:['existing STT-policy authenticated GET before/after','unrelated user denial','anon denial','signed URL bytes','provider read bookkeeping','unknown owner replacement denial','failed overwrite retains bytes','entitled successor billed in full'],limitation:'Synthetic fixture with SQL-seeded historical timestamps; STT read policy only, no hosted actor impersonation, Tongs signing authorization, historical episode editing or media playback claim'};
}
