import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,sep} from 'node:path';
import {randomBytes} from 'node:crypto';
import {canonical,sha256,collectH444Export} from './lib/storage-h444-exporter.mjs';
import {validateAcquisitionAuthorization,authenticObservationSQL,OBSERVATION_SQL} from './lib/storage-h444-authorization.mjs';
import {TEMPORARY_PRINCIPAL,CREATE_ROLE_SQL,CLEANUP_ROLE_SQL,PRINCIPAL_METADATA_SQL,PRINCIPAL_REVIEW_METADATA_SQL,FINANCIAL_MODE_METADATA_SQL,
  FINANCIAL_MODE_PIN,FINANCIAL_MODE_READ,validateFinancialModeDefinition,validatePrincipalObservation,validatePrincipalApproval} from './lib/storage-h444-principal.mjs';
import {startSyntheticPostgres} from './fixtures/storage-h444-postgres-fixture.mjs';
import {prepareAcquisitionFixture} from './fixtures/storage-h444-acquisition-fixture.mjs';
import {runApprovedH444Acquisition,validateAcquisitionPackage} from './lib/storage-h444-acquisition.mjs';
import {restrictSyntheticOutputDirectory,decryptExportBundle,clearExportBundle} from './lib/storage-h444-output.mjs';

import {interventionFixture} from './fixtures/storage-quench-intervention-fixture.mjs';
import {INTERVENTION_CATALOG_SQL,QUENCH_OBSERVATION_SQL,QUENCH_FUNCTIONS,validateInterventionSnapshot,canonical as interventionCanonical} from './lib/storage-quench-intervention.mjs';
import {createLocalPostgresTransport} from './lib/storage-h444-postgres.mjs';

function approval(value){
  return {principal:TEMPORARY_PRINCIPAL,independentReviewer:'SYNTHETIC_REVIEWER',operator:'SYNTHETIC_OPERATOR',
    notBefore:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+1200000).toISOString(),
    principalApproval:{roleOid:value.role.oid,validUntil:value.role.validUntil,privilegesSha256:sha256(canonical(value)),routinesSha256:sha256(canonical(value.routines)),
      createSqlSha256:sha256(CREATE_ROLE_SQL),cleanupSqlSha256:sha256(CLEANUP_ROLE_SQL),independentReviewer:'SYNTHETIC_REVIEWER',reviewReference:'SYNTHETIC_ONLY',
      routineReviewVerdict:'PASS_NO_UNREVIEWED_OR_UNSAFE_CAPABILITIES',publicCapabilitiesRiskAcceptance:'SYNTHETIC_ONLY',broadReadRiskAcceptance:'SYNTHETIC_ONLY',cleanupAuthorizationReference:'SYNTHETIC_ONLY'}};
}
function sample(){
  const value={role:{name:TEMPORARY_PRINCIPAL,oid:12345,login:true,inherit:true,superuser:false,createRole:false,createDb:false,replication:false,bypassRls:true,connectionLimit:2,validUntil:new Date(Date.now()+1200000).toISOString()},
    memberships:[{role:'pg_read_all_data',grantor:'postgres',admin:false,inherit:true,set:false}],memberRoles:[],inheritedRoles:['pg_read_all_data'],setRoles:[],ownedObjects:0,defaultAcls:0,
    settings:[{database:0,settings:['default_transaction_read_only=on','row_security=off','statement_timeout=30s','lock_timeout=2s','idle_in_transaction_session_timeout=10min','transaction_timeout=10min','work_mem=4MB','max_parallel_workers_per_gather=0','search_path=pg_catalog']}],
    databases:[{name:'postgres',connect:true,create:false,temporary:true}],schemaCreate:[],relationWrites:['pg_catalog.pg_settings'],sequenceWrites:[],largeObjectWrites:[],parameterPrivileges:[],sessionSettingsRulesSha256:'b'.repeat(64),routines:[{identity:'pg_catalog.abs(integer)',definitionSha256:'a'.repeat(64)}]};
  const a=approval(value);a.expiresAt=value.role.validUntil;return {value,a};
}
test('temporary principal binds exact procedures, expiry, independently reviewed privileges and PUBLIC execution inventory',()=>{
  const {value,a}=sample();assert.equal(validatePrincipalObservation(value,a),value);
  for(const change of [a=>a.principal='postgres',a=>a.principalApproval.roleOid++,a=>a.principalApproval.createSqlSha256='0'.repeat(64),
    a=>a.principalApproval.cleanupSqlSha256='0'.repeat(64),a=>a.principalApproval.independentReviewer=a.operator,
    a=>a.principalApproval.routineReviewVerdict='UNKNOWN',a=>a.principalApproval.validUntil='infinity',a=>a.principalApproval.publicCapabilitiesRiskAcceptance='']){
    const altered=structuredClone(a);change(altered);assert.throws(()=>validatePrincipalObservation(value,altered));
  }
});
for(const [name,change] of [
  ['column write',v=>v.relationWrites.push('tongs.protected')],['sequence usage',v=>v.sequenceWrites.push('tongs.sequence')],
  ['PUBLIC schema CREATE',v=>v.schemaCreate.push('public')],['database CREATE',v=>v.databases[0].create=true],['owned object',v=>v.ownedObjects=1],
  ['role SET',v=>v.setRoles.push('pg_read_all_data')],['role ADMIN',v=>v.memberships[0].admin=true],['unexpected inheritance',v=>v.inheritedRoles.push('service_role')],
  ['function drift',v=>v.routines[0].definitionSha256='b'.repeat(64)],['unexpected PUBLIC function',v=>v.routines.push({identity:'public.unsafe()'})],
  ['role replacement',v=>v.role.oid++],['setting override',v=>v.settings.push({database:123,settings:['default_transaction_read_only=off']})],
  ['large-object write',v=>v.largeObjectWrites.push(1)],['parameter privilege',v=>v.parameterPrivileges.push('log_statement')],
  ['unexpected member',v=>v.memberRoles.push({member:'authenticated'})],['default ACL',v=>v.defaultAcls=1],
])test('rejects '+name,()=>{const {value,a}=sample();change(value);assert.throws(()=>validatePrincipalObservation(value,a));});
test('financial equivalent is pinned and changes no protected financial inputs',()=>{
  validateFinancialModeDefinition(FINANCIAL_MODE_PIN);
  assert.throws(()=>validateFinancialModeDefinition({...FINANCIAL_MODE_PIN,securityDefiner:false}));
  const sql=authenticObservationSQL(true);assert.ok(!sql.includes('tongs._current_financial_environment()'));
  assert.equal((sql.match(/from tongs\.[a-z_]+ x/g)||[]).length,27);
  assert.ok(sql.includes(OBSERVATION_SQL.slice(0,OBSERVATION_SQL.indexOf('\nselect jsonb_build_object('))));
});
test('expiry must match the supervised window and never exceed thirty minutes',()=>{
  const {a}=sample();a.expiresAt=new Date(Date.parse(a.notBefore)+1800001).toISOString();a.principalApproval.validUntil=a.expiresAt;
  assert.throws(()=>validatePrincipalApproval(a),/expiry/);
});

test('temporary role, effective PUBLIC privileges, lifecycle and encrypted acquisition on SYNTHETIC local PostgreSQL',{skip:process.platform!=='win32'},async t=>{
  const versions=JSON.parse(readFileSync('docs/database/certification/storage-full-tail-446.json')).migrations.slice(0,444).map(m=>m.version);
  const directory=resolve(tmpdir(),'forge-h444-offline-'+randomBytes(8).toString('hex'));await mkdir(directory);
  const f=await startSyntheticPostgres(versions);
  const admin=sql=>f.exec(['/usr/lib/postgresql/17/bin/psql','-XqAt','-h','/var/run/postgresql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:Buffer.from(sql),maxBytes:8*1024*1024});
  const asRole=async sql=>admin('BEGIN; SET LOCAL ROLE '+TEMPORARY_PRINCIPAL+'; SET LOCAL search_path=pg_catalog; '+sql+'; ROLLBACK;');
  const observe=async()=>JSON.parse((await asRole(PRINCIPAL_METADATA_SQL)).toString());
  try{
    let request=await prepareAcquisitionFixture(f,directory);
    await admin(CREATE_ROLE_SQL);
    await t.test('standalone creation exits unsuccessfully on duplicate role without caller-supplied ON_ERROR_STOP',async()=>{
      await assert.rejects(f.exec(['/usr/lib/postgresql/17/bin/psql','-XqAt','-h','/var/run/postgresql','-U','postgres','-d','postgres'],{input:Buffer.from(CREATE_ROLE_SQL)}));
    });
    await t.test('creation is disabled/expired, has no credential, and grants only read-all-data without SET/ADMIN',async()=>{
      const r=JSON.parse((await admin("SELECT json_build_object('login',rolcanlogin,'passwordAbsent',rolpassword IS NULL,'expired',rolvaliduntil<now()) FROM pg_authid WHERE rolname='forge_h444_acquire_01';")).toString());
      assert.deepEqual(r,{login:false,passwordAbsent:true,expired:true});
    });
    await t.test('observer inventories disabled role without SET ROLE, password, or login',async()=>{
      const disabled=JSON.parse((await admin('BEGIN; SET LOCAL search_path=pg_catalog; '+PRINCIPAL_REVIEW_METADATA_SQL+'; ROLLBACK;')).toString());
      assert.equal(disabled.role.name,TEMPORARY_PRINCIPAL);assert.equal(disabled.role.login,false);
      assert.equal(disabled.memberships[0].role,'pg_read_all_data');assert.equal(disabled.memberships[0].set,false);
      assert.deepEqual(disabled,await observe());
      const disabledApproval=approval(disabled);disabledApproval.expiresAt=disabled.role.validUntil;
      assert.throws(()=>validatePrincipalObservation(disabled,disabledApproval));
    });
    const expiresAt=new Date(Date.now()+1200000).toISOString();
    await admin("ALTER ROLE forge_h444_acquire_01 LOGIN PASSWORD 'SYNTHETIC_PASSWORD_ONLY' VALID UNTIL '"+expiresAt+"';");
    let value=await observe(),a=approval(value);a.expiresAt=expiresAt;
    assert.deepEqual({schemaCreate:value.schemaCreate,relationWrites:value.relationWrites,sequenceWrites:value.sequenceWrites},{schemaCreate:[],relationWrites:['pg_catalog.pg_settings'],sequenceWrites:[]});
    validatePrincipalObservation(value,a);
    await t.test('PUBLIC TEMP remains available and default read-only can be changed: honest residual capability',async()=>{
      assert.equal(value.databases.find(d=>d.name==='postgres').temporary,true);
      assert.equal((await asRole("SELECT current_setting('transaction_read_only')")).toString().trim(),'off');
      await asRole('CREATE TEMP TABLE synthetic_temp(id int)');
    });
    await t.test('PUBLIC definer mutator survives role-specific REVOKE; drift gate blocks it',async()=>{
      await admin("CREATE TABLE public.synthetic_mutation(id int); CREATE FUNCTION public.synthetic_mutator() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$INSERT INTO public.synthetic_mutation VALUES(1)$$; REVOKE EXECUTE ON FUNCTION public.synthetic_mutator() FROM forge_h444_acquire_01;");
      const changed=await observe();assert.ok(changed.routines.some(p=>p.identity==='public.synthetic_mutator()'&&p.securityDefiner));
      assert.throws(()=>validatePrincipalObservation(changed,a),/routines_changed/);
      await asRole('SELECT public.synthetic_mutator()'); // SYNTHETIC ONLY, rolled back.
      await admin('DROP FUNCTION public.synthetic_mutator(); DROP TABLE public.synthetic_mutation;');
    });
    await t.test('column-only writes, sequence usage and extra role memberships are detected by the real catalog query',async()=>{
      await admin('CREATE TABLE public.synthetic_column(id int); GRANT UPDATE(id) ON public.synthetic_column TO forge_h444_acquire_01;');
      let changed=await observe();assert.ok(changed.relationWrites.includes('public.synthetic_column'));assert.throws(()=>validatePrincipalObservation(changed,a),/effective_write/);
      await admin('DROP TABLE public.synthetic_column; GRANT USAGE ON SEQUENCE tongs.fixture_sequence TO forge_h444_acquire_01;');
      changed=await observe();assert.throws(()=>validatePrincipalObservation(changed,a),/effective_write/);
      await admin('REVOKE USAGE ON SEQUENCE tongs.fixture_sequence FROM forge_h444_acquire_01; GRANT pg_monitor TO forge_h444_acquire_01;');
      changed=await observe();assert.throws(()=>validatePrincipalObservation(changed,a),/memberships/);
      await admin('REVOKE pg_monitor FROM forge_h444_acquire_01;');
    });
    await t.test('definition-pinned financial-mode equivalent matches empty/single/multiple revisions without EXECUTE grant',async()=>{
      await admin('ALTER TABLE tongs.financial_runtime_environment_revisions ADD COLUMN revision bigint, ADD COLUMN financial_environment text;');
      const migration=readFileSync('supabase/migrations/20261011140000_tongs_unified_financial_environment.sql','utf8').replaceAll('\r\n','\n');
      const fn=migration.match(/create or replace function tongs\._current_financial_environment\(\)[\s\S]*?\$\$;/)[0];
      await admin(fn+' REVOKE ALL ON FUNCTION tongs._current_financial_environment() FROM PUBLIC;');
      validateFinancialModeDefinition(JSON.parse((await asRole(FINANCIAL_MODE_METADATA_SQL)).toString()));
      for(const rows of ['',"(1,'test')","(1,'live'),(2,'test')"]){
        await admin('DELETE FROM tongs.financial_runtime_environment_revisions;'+(rows?' INSERT INTO tongs.financial_runtime_environment_revisions(revision,financial_environment) VALUES '+rows+';':''));
        const original=(await admin('SELECT tongs._current_financial_environment();')).toString();
        assert.equal((await asRole('SELECT '+FINANCIAL_MODE_READ)).toString(),original);
      }
      await assert.rejects(asRole('SELECT tongs._current_financial_environment()'));
      await admin("CREATE OR REPLACE FUNCTION tongs._current_financial_environment() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$SELECT 'live'::text$$;");
      const changed=JSON.parse((await asRole(FINANCIAL_MODE_METADATA_SQL)).toString());assert.throws(()=>validateFinancialModeDefinition(changed),/definition_changed/);
      await admin(fn);
      const table=f.plan.tables.find(t=>t.name==='tongs.financial_runtime_environment_revisions');table.columns=['id','revision','financial_environment'];
    });
    value=await observe();a=approval(value);a.expiresAt=expiresAt;validatePrincipalObservation(value,a);
    const obs=JSON.parse((await admin(authenticObservationSQL(true)+';')).toString());
    const output=join(directory,'forge-h444-offline-'+randomBytes(8).toString('hex'));await mkdir(output);await restrictSyntheticOutputDirectory(output);
    const full={...JSON.parse(request.authorization.approvalBytes),...a,schema:'forge.h444-acquisition-approval.v2',destination:output,
      planSha256:sha256(canonical(f.plan)),financialSha256:obs.financialSha256};
    const approvalBytes=Buffer.from(canonical(full));
    request={...request,plan:f.plan,authorization:{...request.authorization,approvalBytes,approvedSha256:sha256(approvalBytes)}};
    validateAcquisitionAuthorization({...request.authorization,plan:f.plan,synthetic:true});
    await f.exec(['sh','-c',"printf '%s\n' 'local all all trust' 'hostssl all forge_h444_acquire_01 127.0.0.1/32 scram-sha-256' > /var/lib/postgresql/data/pg_hba.conf"]);
    await admin('SELECT pg_reload_conf();');
    await t.test('v2 requires new owner-approved digest and cannot be used as old v1',()=>{
      const downgrade={...full,schema:'forge.h444-acquisition-approval.v1'};delete downgrade.principalApproval;
      const bytes=Buffer.from(canonical(downgrade));assert.throws(()=>validateAcquisitionAuthorization({approvalBytes:bytes,approvedSha256:sha256(bytes),head:f.plan.candidate,plan:f.plan,synthetic:true}),/requires_v2/);
      assert.throws(()=>validateAcquisitionAuthorization({...request.authorization,approvedSha256:'0'.repeat(64),plan:f.plan,synthetic:true}),/approval_digest/);
    });
    await t.test('temporary principal runs existing encrypted workflow and preserves all six artifacts, 475 bodies and raw role provenance',async()=>{
      const credential=Buffer.from('SYNTHETIC_PASSWORD_ONLY');
      const result=await runApprovedH444Acquisition(request,{fixture:f,credential});assert.ok(credential.every(b=>b===0));
      const encrypted=await readFile(result.path);assert.ok(!encrypted.includes(Buffer.from('SYNTHETIC_PASSWORD_ONLY')));
      const bundle=await decryptExportBundle(encrypted);
      try{
        assert.equal(bundle.files.size,6);assert.equal(result.storageObjectCount,475);assert.equal(result.storageBytes,447475);
        const manifest=JSON.parse(bundle.files.get('role-and-acl-manifest.json'));
        assert.equal(manifest.temporaryPrincipalEvidence.role.oid,value.role.oid);
        assert.ok(manifest.rolesAndMemberships.roles.some(r=>r.name===TEMPORARY_PRINCIPAL));
        assert.equal(JSON.parse(bundle.sourceObservationBytes).observation.financialSha256,obs.financialSha256);
        assert.equal(JSON.parse(bundle.sourceObservationBytes).observation.originalHistorySha256,obs.originalHistorySha256);
      }finally{clearExportBundle(bundle);}
    });
    await t.test('v3 collector rejects catalog drift before protected rows and preserves reviewed evidence in encrypted output',async()=>{
      const template=interventionFixture(full);
      await admin("CREATE ROLE anon;");
      for(const row of template.receipt.originalCatalog.filter(x=>x.category==='function')){
        const definition=JSON.parse(row.canonical).definition;
        for(const [,relation] of definition.matchAll(/(tongs\.[a-z_]+)%rowtype/g))await admin('CREATE TABLE IF NOT EXISTS '+relation+'(id uuid);');
        await admin(definition);
      }
      for(const fn of QUENCH_FUNCTIONS)await admin('GRANT EXECUTE ON FUNCTION '+fn.signature+' TO authenticated,service_role;');
      const catalog=async()=>JSON.parse((await asRole(INTERVENTION_CATALOG_SQL)).toString());
      const functions=async()=>JSON.parse((await asRole(QUENCH_OBSERVATION_SQL)).toString());
      const originalCatalog=await catalog(),before=await functions();
      for(const fn of QUENCH_FUNCTIONS)await admin('REVOKE EXECUTE ON FUNCTION '+fn.signature+' FROM PUBLIC;');
      const correctedCatalog=await catalog(),after=await functions();
      const intervention=interventionFixture(full,{originalCatalog,correctedCatalog,beforeJson:before.recordsCanonical,afterJson:after.recordsCanonical});
      const output3=join(directory,'forge-h444-offline-'+randomBytes(8).toString('hex'));await mkdir(output3);await restrictSyntheticOutputDirectory(output3);
      value=await observe();const principal=approval(value);principal.expiresAt=expiresAt;
      const approved={...full,...principal,schema:'forge.h444-acquisition-approval.v3',intervention:intervention.binding,destination:output3};
      const approvalBytes=Buffer.from(canonical(approved));
      const req={...request,interventionReceiptBytes:intervention.bytes,authorization:{...request.authorization,approvalBytes,approvedSha256:sha256(approvalBytes)}};
      await validateAcquisitionPackage(req);
      await assert.rejects(validateAcquisitionPackage({...req,interventionReceiptBytes:undefined}));
      await assert.rejects(validateAcquisitionPackage({...req,interventionReceiptBytes:Buffer.from('{}')}));
      // Change an unrelated catalog identity without changing the principal's EXECUTE inventory.
      await admin('GRANT SELECT ON tongs.financial_runtime_environment_revisions TO authenticated;');
      const transport=await createLocalPostgresTransport({...f,plan:req.plan,expectedPlanSha256:approved.planSha256,authorization:req.authorization,credential:Buffer.from('SYNTHETIC_PASSWORD_ONLY')});
      const trace=[];const query=transport.query.bind(transport);transport.query=async function*(sql,options){trace.push(sql);yield*query(sql,options);};
      const close=transport.close.bind(transport);let rolledBack=false;transport.close=async o=>{rolledBack=o?.rollback===true;return close(o);};
      try{await assert.rejects(collectH444Export({...req,mode:'synthetic-offline',transport,limits:approved.limits,expectedPlanSha256:approved.planSha256}));}
      finally{await close();}
      assert.ok(rolledBack);assert.ok(trace.some(sql=>sql.includes(INTERVENTION_CATALOG_SQL)));
      assert.ok(!trace.some(sql=>sql.includes('row_to_json(r)::text')||sql.includes('with protected(value)')));
      await admin('REVOKE SELECT ON tongs.financial_runtime_environment_revisions FROM authenticated;');
      validateInterventionSnapshot(intervention.receipt,await functions(),await catalog());
      const result=await runApprovedH444Acquisition(req,{fixture:f,credential:Buffer.from('SYNTHETIC_PASSWORD_ONLY')});
      const encrypted=await readFile(result.path);assert.ok(!encrypted.includes(Buffer.from('SYNTHETIC_PASSWORD_ONLY')));
      const bundle=await decryptExportBundle(encrypted);
      try{
        const evidence=JSON.parse(bundle.files.get('role-and-acl-manifest.json')).securityIntervention;
        assert.equal(interventionCanonical(evidence.receipt),interventionCanonical(intervention.receipt));
        assert.deepEqual(evidence.functions.records,after.records);assert.deepEqual(evidence.catalog,correctedCatalog);
        assert.equal(JSON.parse(bundle.sourceObservationBytes).observation.provenance.interventionReceiptSha256,intervention.binding.receiptSha256);
        assert.equal(bundle.files.size,6);assert.equal(result.storageObjectCount,475);
      }finally{clearExportBundle(bundle);}
    });
    const cleanup=oid=>f.exec(['/usr/lib/postgresql/17/bin/psql','-XqAt','-h','/var/run/postgresql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-v','expected_role_oid='+oid],{input:Buffer.from(CLEANUP_ROLE_SQL)});
    await t.test('expiry does not end an existing authenticated session; approved cleanup drains that exact role',async()=>{
      const running=f.exec(['env','PGHOST=fixture.invalid','PGHOSTADDR=127.0.0.1','PGPORT=5432','PGDATABASE=postgres','PGUSER='+TEMPORARY_PRINCIPAL,
        'PGSSLMODE=verify-full','PGSSLROOTCERT=/fixture/ca.crt','PGAPPNAME=synthetic-expiry-test','sh','-c','IFS= read -r PGPASSWORD; export PGPASSWORD; exec "$@"','synthetic-private-pipe',
        '/usr/lib/postgresql/17/bin/psql','-XqAt','--no-password','-v','ON_ERROR_STOP=1'],
        {input:Buffer.from('SYNTHETIC_PASSWORD_ONLY\nBEGIN READ ONLY; SELECT pg_sleep(20); ROLLBACK;'),timeoutMs:25000}).then(()=>true,()=>false);
      let active=false;
      for(let i=0;i<20;i++){
        active=(await admin("SELECT count(*) FROM pg_stat_activity WHERE usename='forge_h444_acquire_01' AND application_name='synthetic-expiry-test' AND state='active';")).toString().trim()==='1';
        if(active)break;await new Promise(resolve=>setTimeout(resolve,100));
      }
      assert.equal(active,true);
      await admin("ALTER ROLE forge_h444_acquire_01 VALID UNTIL '1970-01-01 00:00:00+00'; CREATE TABLE public.synthetic_drain_dependency(id int); ALTER TABLE public.synthetic_drain_dependency OWNER TO forge_h444_acquire_01;");
      assert.equal((await admin("SELECT count(*) FROM pg_stat_activity WHERE usename='forge_h444_acquire_01';")).toString().trim(),'1');
      await assert.rejects(cleanup(value.role.oid)); // dependency hold AFTER drain/revoke commit
      assert.equal(await running,false);
      assert.equal((await admin("SELECT count(*) FROM pg_stat_activity WHERE usename='forge_h444_acquire_01';")).toString().trim(),'0');
      await admin("DROP TABLE public.synthetic_drain_dependency; ALTER ROLE forge_h444_acquire_01 LOGIN PASSWORD 'SYNTHETIC_PASSWORD_ONLY' VALID UNTIL '"+expiresAt+"';");
    });
    await t.test('cleanup refuses replaced identity; dependency failure leaves login and credential revoked',async()=>{
      await assert.rejects(cleanup(value.role.oid+1));
      assert.equal((await admin("SELECT rolcanlogin FROM pg_roles WHERE rolname='forge_h444_acquire_01';")).toString().trim(),'t');
      await admin('CREATE TABLE public.synthetic_owned(id int); ALTER TABLE public.synthetic_owned OWNER TO forge_h444_acquire_01;');
      await assert.rejects(cleanup(value.role.oid));
      const disabled=JSON.parse((await admin("SELECT json_build_object('login',rolcanlogin,'passwordAbsent',rolpassword IS NULL) FROM pg_authid WHERE rolname='forge_h444_acquire_01';")).toString());
      assert.deepEqual(disabled,{login:false,passwordAbsent:true});
      await admin('DROP TABLE public.synthetic_owned;');
      await cleanup(value.role.oid);
      assert.equal((await admin("SELECT count(*) FROM pg_roles WHERE rolname='forge_h444_acquire_01';")).toString().trim(),'0');
    });
  }finally{
    await f.stop();assert.ok(directory.startsWith(resolve(tmpdir())+sep)&&/^forge-h444-offline-[a-f0-9]{16}$/.test(directory.split(sep).at(-1)));
    await rm(directory,{recursive:true,force:true});
  }
});
