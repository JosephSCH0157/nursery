// Synthetic protocol/capability fixture only; no Forge installation or migration replay.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {INTERVENTION_CATALOG_SQL,INTERVENTION_CATALOG_CAPTURE_SQL,catalogCommitment} from './lib/storage-quench-intervention.mjs';
import {execFileSync} from 'node:child_process';
import {localDockerArguments} from './lib/storage-h444-process.mjs';
for(const mode of ['restrictive','permissive'])test('Quench intervention and convergence PostgreSQL '+mode,{skip:process.platform!=='win32'},async()=>{
const root=process.cwd();
const {startSyntheticPostgres}=await import(pathToFileURL(root+'/scripts/fixtures/storage-h444-postgres-fixture.mjs'));
const read=p=>readFileSync(root+'/'+p,'utf8').replaceAll('\r\n','\n');
const original=read('supabase/migrations/20260904120000_tongs_quench_destination_packages_youtube_jobs.sql');
const roles=read('supabase/migrations/20260302183000_tongs_workspace_roles_authoritative.sql');
const grants=read('supabase/migrations/20260827230000_tongs_publishing_destination_authority_s5_2b.sql');
const extract=(src,name)=>{const start=src.indexOf('create or replace function tongs.'+name+'(');assert.ok(start>=0);const first=src.indexOf('$$',start),end=src.indexOf('$$;',first+2);return src.slice(start,end+3);};
const uid="SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid";
const ids=Array.from({length:15},(_,i)=>'10000000-0000-4000-8000-'+String(i+1).padStart(12,'0'));
const [user,ws,episode,dest,manifest,cap,operation,attempt,connection,authority,grant,opkey]=ids;
const lit=s=>"'"+s.replaceAll("'","''")+"'";
const h='a'.repeat(64);
const versions=JSON.parse(read('docs/database/certification/storage-full-tail-446.json')).migrations.slice(0,444).map(m=>m.version);
const f=await startSyntheticPostgres(versions);
let passed=0;
const check=(name,value)=>{assert.ok(value,name);passed++;console.log('PASS '+name);};
const call=async(role,sql)=>String(await f.exec(['/usr/lib/postgresql/17/bin/psql','-XqAt','-h','/var/run/postgresql','-U',role,'-d','postgres','-v','ON_ERROR_STOP=1'],{input:Buffer.from('\\set VERBOSITY sqlstate\n'+sql),maxBytes:1024*1024}));
const denied=async(role,sql,state)=>{const i=sql.indexOf('SELECT tongs.');assert.ok(i>=0);await call(role,sql.slice(0,i)+`DO $test$ BEGIN ${sql.slice(i).replace('SELECT','PERFORM')} RAISE EXCEPTION 'EXPECTED_REJECTION_MISSING'; EXCEPTION WHEN SQLSTATE '${state}' THEN NULL; END $test$; ROLLBACK;`);};
const subject=`SET LOCAL request.jwt.claim.sub=${lit(user)};`;
const begin='BEGIN READ WRITE; '+subject;
const finalize=`SELECT tongs.finalize_quench_destination_package(${[opkey,ws,episode,dest,manifest].map(lit)},'${h}',1,'${h}','${cap}','{"contract_version":"forge.finalized-destination-package.v1","title":"synthetic","description":"synthetic","assets":[],"mode":"synthetic","visibility":"private","timezone":"UTC"}'::jsonb);`;
const retry=`SELECT tongs.retry_youtube_publication_stage('${ws}','${episode}','${operation}');`;
try {
 await f.admin(`DROP SCHEMA tongs CASCADE; DROP SCHEMA auth CASCADE; CREATE SCHEMA tongs; CREATE SCHEMA auth; CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
 CREATE ROLE authenticated LOGIN; CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE forge_h444_acquire_01 LOGIN BYPASSRLS;
 ${mode==='permissive'?'ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO authenticated,service_role;':''}
 GRANT pg_read_all_data TO forge_h444_acquire_01 WITH ADMIN FALSE,INHERIT TRUE,SET FALSE;
 ALTER ROLE forge_h444_acquire_01 SET default_transaction_read_only=on;
 GRANT USAGE ON SCHEMA tongs,auth TO authenticated,service_role;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$${uid}$$;
 CREATE TABLE auth.users(id uuid primary key);
 CREATE TABLE tongs.workspaces(id uuid primary key,created_by uuid);
 CREATE TABLE tongs.workspace_members(workspace_id uuid,user_id uuid,role text);
 CREATE TABLE tongs.episodes(id uuid primary key,workspace_id uuid,unique(id,workspace_id));
 CREATE TABLE tongs.publishing_executable_destinations(id uuid primary key,state text,current_capability_revision_id uuid,connection_id uuid);
 CREATE TABLE tongs.publishing_destination_capability_revisions(id uuid primary key,executable_destination_id uuid,content_hash text,unique(id,executable_destination_id));
 CREATE TABLE tongs.quench_release_manifest_snapshots(id uuid primary key,workspace_id uuid,workpiece_id uuid,manifest_content_hash text,unique(id,workspace_id,workpiece_id));
 CREATE TABLE tongs.workpiece_files(workpiece_id uuid,path text,revision int,hash_value text);
 CREATE TABLE tongs.publication_operations(id uuid primary key,workspace_id uuid,workpiece_id uuid,executable_destination_id uuid,manifest_snapshot_id uuid);
 CREATE TABLE tongs.publication_attempts(id uuid primary key);
 CREATE TABLE tongs.publishing_provider_credential_generations(id uuid primary key);
 CREATE TABLE tongs.publishing_workspace_destination_grant_heads(workspace_id uuid,executable_destination_id uuid,current_grant_revision_id uuid);
 CREATE TABLE tongs.publishing_workspace_destination_grant_revisions(id uuid,state text);
 CREATE TABLE tongs.publishing_provider_connections(id uuid,credential_authority_id uuid,state text);
 CREATE TABLE tongs.publishing_provider_credential_authorities(id uuid,state text);
 ${original.slice(original.indexOf('create table'),original.indexOf('alter table tongs.quench_destination_package_revisions enable'))}
 ${['workspace_role_rank','get_my_workspace_role','has_workspace_role'].map(n=>extract(roles,n)).join('\n')}
 ${extract(grants,'publishing_destination_grant_is_active')}
 ${['finalize_quench_destination_package','enqueue_youtube_publication_job','retry_youtube_publication_stage'].map(n=>extract(original,n)).join('\n')}
 INSERT INTO auth.users VALUES('${user}'); INSERT INTO tongs.workspaces VALUES('${ws}','${user}');
 INSERT INTO tongs.episodes VALUES('${episode}','${ws}');
 INSERT INTO tongs.publishing_executable_destinations VALUES('${dest}','active','${cap}','${connection}');
 INSERT INTO tongs.publishing_destination_capability_revisions VALUES('${cap}','${dest}','${h}');
 INSERT INTO tongs.quench_release_manifest_snapshots VALUES('${manifest}','${ws}','${episode}','${h}');
 INSERT INTO tongs.workpiece_files VALUES('${episode}','metadata.json',1,'${h}');
 INSERT INTO tongs.publication_operations VALUES('${operation}','${ws}','${episode}','${dest}','${manifest}');
 INSERT INTO tongs.publication_attempts VALUES('${attempt}');
 INSERT INTO tongs.publishing_workspace_destination_grant_heads VALUES('${ws}','${dest}','${grant}');
 INSERT INTO tongs.publishing_workspace_destination_grant_revisions VALUES('${grant}','active');
 INSERT INTO tongs.publishing_provider_connections VALUES('${connection}','${authority}','active');
 INSERT INTO tongs.publishing_provider_credential_authorities VALUES('${authority}','available');
 REVOKE ALL ON ALL TABLES IN SCHEMA tongs FROM PUBLIC,authenticated,service_role;
 REVOKE EXECUTE ON FUNCTION tongs.get_my_workspace_role(uuid),tongs.has_workspace_role(uuid,text),tongs.publishing_destination_grant_is_active(uuid,uuid) FROM PUBLIC;
 `);
 const signatures=['tongs.finalize_quench_destination_package(uuid,uuid,uuid,uuid,uuid,text,integer,text,uuid,jsonb)','tongs.enqueue_youtube_publication_job(uuid,uuid,uuid)','tongs.retry_youtube_publication_stage(uuid,uuid,uuid)'];
 await f.admin(signatures.map(s=>`GRANT EXECUTE ON FUNCTION ${s} TO authenticated,service_role;`).join('\n'));
 check('role begins read-only by default',(await call('forge_h444_acquire_01','SHOW default_transaction_read_only;')).trim()==='on');
 await denied('forge_h444_acquire_01','BEGIN READ WRITE; '+finalize,'42501');check('missing JWT rejected',true);
 await denied('forge_h444_acquire_01','BEGIN READ ONLY; '+subject+finalize,'25006');check('explicit read-only blocks finalization write',true);
 check('read-write override plus synthetic JWT reaches actual finalization INSERT',(await call('forge_h444_acquire_01',begin+finalize+' COMMIT;')).includes('finalized'));
 const pkg=(await f.admin('SELECT id FROM tongs.quench_destination_package_revisions;')).toString().trim();
 const enqueue=`SELECT tongs.enqueue_youtube_publication_job('${operation}','${attempt}','${pkg}');`;
 check('same direct credential enqueues job and secret record',(await call('forge_h444_acquire_01',begin+enqueue+' COMMIT;')).includes('queued')&&(await f.admin('SELECT count(*) FROM tongs.youtube_publication_job_secrets;')).toString().trim()==='1');
 await denied('forge_h444_acquire_01',begin+retry,'42883');check('retry fails on absent helper before update',true);
 // Independent observation/prediction of the proposed payload's fingerprints.
 const observe=async()=>JSON.parse((await f.admin(`SET search_path=pg_catalog;
 SELECT jsonb_agg(jsonb_build_object('identity',s,'oid',p.oid::bigint,'owner',pg_get_userbyid(p.proowner),
 'securityDefiner',p.prosecdef,'config',p.proconfig,'definitionSha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),
 'acl',(SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
 'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable)
 ORDER BY (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END) COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type,a.is_grantable)
 FROM aclexplode(p.proacl) a)) ORDER BY s COLLATE "C") FROM unnest(ARRAY[${signatures.map(lit)}]) s JOIN pg_proc p ON p.oid=to_regprocedure(s);`)).toString());
 const fingerprint=async records=>(await f.admin(`SELECT encode(sha256(convert_to(${lit(JSON.stringify(records))}::jsonb::text,'UTF8')),'hex');`)).toString().trim();
 const before=await observe(),after=before.map(r=>({...r,acl:r.acl.filter(a=>a.grantee!=='PUBLIC')}));
 const beforeHash=await fingerprint(before),afterHash=await fingerprint(after);
 const observePayload=async()=>JSON.parse((await f.admin(read('docs/database/proposals/h444-quench-public-execute-observation.sql'))).toString());
 const pre=await observePayload();assert.equal(pre.found,3);assert.deepEqual(pre.records,before);assert.equal(pre.recordsSha256,beforeHash);check('read-only preflight agrees with independent before commitment',true);
 const payload=read('docs/database/proposals/h444-quench-public-execute-correction.sql');
 const execute=(a,b,sql=payload)=>f.admin(`\\set approved_before_sha256 ${a}\n\\set approved_after_sha256 ${b}\n`+sql);
 await assert.rejects(f.admin(payload));check('missing independent fingerprints rejected',true);
 await assert.rejects(execute('0'.repeat(64),afterHash));assert.deepEqual(await observe(),before);check('wrong before fingerprint aborts unchanged',true);
 await assert.rejects(execute(beforeHash,'0'.repeat(64)));assert.deepEqual(await observe(),before);check('wrong after fingerprint rolls back all three revocations',true);
 await f.admin('REVOKE EXECUTE ON FUNCTION '+signatures[0]+' FROM authenticated;');
 await assert.rejects(execute(beforeHash,afterHash));await f.admin('GRANT EXECUTE ON FUNCTION '+signatures[0]+' TO authenticated;');
 assert.deepEqual(await observe(),before);check('missing legitimate grant rejected without corrective widening',true);
 await execute(beforeHash,afterHash,payload.replace('\nCOMMIT;','\nROLLBACK;'));
 assert.deepEqual(await observe(),before);check('uncommitted successful payload rolls back unchanged',true);
 await execute(beforeHash,afterHash);assert.deepEqual(await observe(),after);check('exact guarded payload commits only predicted ACL delta',true);
 const post=await observePayload();assert.equal(post.found,3);assert.deepEqual(post.records,after);assert.equal(post.recordsSha256,afterHash);check('fresh read-only PostVerify observes committed after commitment',true);
 await assert.rejects(execute(beforeHash,afterHash));assert.deepEqual(await observe(),after);check('consumed before state cannot be replayed',true);
 for(const [name,sql] of [['finalize',finalize],['enqueue',enqueue],['retry',retry]]){await denied('forge_h444_acquire_01',begin+sql,'42501');check('exact ACL correction denies acquisition '+name,true);}
 check('authenticated finalization still authorized',(await call('authenticated',begin+finalize+' ROLLBACK;')).includes('replayed'));
 check('authenticated enqueue still authorized',(await call('authenticated',begin+enqueue+' ROLLBACK;')).includes('queued'));
 check('service_role explicit grants retained',(await f.admin(`SELECT bool_and(has_function_privilege('service_role',s,'EXECUTE')) FROM unnest(ARRAY[${signatures.map(lit)}]) s;`)).toString().trim()==='t');
 await denied('authenticated','BEGIN; '+finalize,'42501');check('unauthenticated subject still rejected after ACL correction',true);
 await denied('authenticated',begin+retry,'42883');check('ACL change does not conceal retry functional defect',true);
 const convergence=read('supabase/migrations/20261125023622_quench_public_execute_convergence.sql');
 // Diagnostics are safe only for this network-none, synthetic fixture.
 const applyConvergence=async()=>{try{return execFileSync('docker',localDockerArguments(['exec','-i',f.container,'/usr/lib/postgresql/17/bin/psql','-XqAt','-h','/var/run/postgresql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']),{input:convergence,timeout:30000,windowsHide:true,stdio:['pipe','pipe','pipe']});}catch(e){throw new Error('synthetic convergence: '+e.stderr?.toString());}};
 await applyConvergence();assert.deepEqual(await observe(),after);check('448 accepts corrected predecessor without changing target',true);
 await f.admin(signatures.map(s=>'GRANT EXECUTE ON FUNCTION '+s+' TO PUBLIC;').join('\n'));
 await applyConvergence();assert.deepEqual(await observe(),after);check('448 converges original predecessor to identical target',true);
 await f.admin('GRANT EXECUTE ON FUNCTION '+signatures[0]+' TO PUBLIC;');
 await assert.rejects(f.admin(convergence));check('448 rejects partial correction',true);
 await f.admin('REVOKE EXECUTE ON FUNCTION '+signatures[0]+' FROM PUBLIC;');
 await f.admin('GRANT EXECUTE ON FUNCTION '+signatures[0]+' TO anon;');
 await assert.rejects(f.admin(convergence));check('448 rejects unapproved extra grant',true);
 await f.admin("CREATE TYPE public.context_type AS ENUM ('snowman ☃'); CREATE TABLE public.context_table(id int PRIMARY KEY, value public.context_type); CREATE VIEW public.context_view AS SELECT * FROM public.context_table;");
 const raw=JSON.parse((await f.admin(INTERVENTION_CATALOG_SQL+';')).toString());
 const encoded=(await f.admin(INTERVENTION_CATALOG_CAPTURE_SQL)).toString();
 const captured=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
 const acquisition=JSON.parse((await f.admin('BEGIN READ ONLY; SET LOCAL search_path=pg_catalog; '+INTERVENTION_CATALOG_SQL+'; ROLLBACK;')).toString());
 assert.notEqual(catalogCommitment(raw).sha256,catalogCommitment(captured).sha256);
 assert.deepEqual(captured,acquisition);assert.ok(JSON.stringify(captured).includes('☃'));
 check('v3 explicit catalog context preserves exact UTF-8 and avoids public-schema deparsing drift',true);
 console.log(JSON.stringify({passed,mode,scope:'SYNTHETIC_ONLY',hostedWrites:0}));
} finally {await f.stop();console.log('FIXTURE_REMOVAL_CONFIRMED');}

});
