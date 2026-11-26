import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdir,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomBytes} from 'node:crypto';
import {startSyntheticPostgres} from './fixtures/storage-h444-postgres-fixture.mjs';
import {createLocalPostgresTransport} from './lib/storage-h444-postgres.mjs';
import {collectH444Export,sha256,canonical,BEGIN_SQL} from './lib/storage-h444-exporter.mjs';
import {encryptExportBundle,decryptExportBundle,writeEncryptedExport,restrictSyntheticOutputDirectory,verifyExportBundle} from './lib/storage-h444-output.mjs';
import {localDockerArguments,localProcessEnvironment,runPrivateProcess} from './lib/storage-h444-process.mjs';
import {runSyntheticH444Acquisition} from './lib/storage-h444-acquisition.mjs';

const versions=JSON.parse(readFileSync('docs/database/certification/storage-full-tail-446.json')).migrations.slice(0,444).map(m=>m.version);
test('disposable PostgreSQL acquisition and Windows confidential output (SYNTHETIC ONLY)',{timeout:300000},async t=>{
  assert.equal(process.platform,'win32','DPAPI integration requires Windows; do not silently skip');
  assert.equal(localDockerArguments(['info'])[0],'--host=npipe:////./pipe/dockerDesktopLinuxEngine');
  for(const name of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_CONFIG','PGPASSWORD','PGHOST','NODE_OPTIONS'])assert.ok(!Object.hasOwn(localProcessEnvironment(),name));
  const f=await startSyntheticPostgres(versions);
  const directory=join(tmpdir(),'forge-h444-offline-'+randomBytes(8).toString('hex'));
  let bundle;
  const capture=async options=>{
    const transport=await createLocalPostgresTransport(f);
    try{return {bundle:await collectH444Export({...f,transport,...options}),transport};}
    finally{await transport.close({rollback:true});}
  };
  try{
    await mkdir(directory);await restrictSyntheticOutputDirectory(directory);
    await t.test('real RR read-only session exports six artifacts and explicitly rolls back',async()=>{
      const result=await capture();bundle=result.bundle;
      assert.equal(bundle.files.size,6);verifyExportBundle(bundle);
      assert.equal(result.transport.rollbackVerified,true);assert.equal(result.transport.closed,true);
      assert.equal(Number((await f.admin("SELECT count(*) FROM pg_stat_activity WHERE application_name='"+result.transport.applicationName+"';")).toString()),0);
      const schema=bundle.files.get('schema.sql').toString();assert.match(schema,/CREATE TABLE tongs\.|CREATE TABLE "tongs"\./);
      const source=JSON.parse(bundle.sourceObservationBytes);assert.equal(source.observation.provenance.transaction.ssl,true);
      assert.equal(source.observation.provenance.transaction.readOnly,'on');
      for(const bytes of bundle.files.values())assert.ok(!bytes.includes(Buffer.from('DO_NOT_EXPORT_SYNTHETIC_AUTH_SECRET')));
    });
    await t.test('concurrent committed changes do not enter the exported MVCC snapshot',async()=>{
      const transport=await createLocalPostgresTransport(f),query=transport.query.bind(transport);let updated=false;
      transport.query=async function*(sql,options){
        for await(const bytes of query(sql,options))yield bytes;
        if(sql.includes('pg_export_snapshot()')){
          await f.admin("UPDATE storage.objects SET version='changed-after-snapshot'; CREATE TABLE tongs.concurrent_after_snapshot(id integer);");updated=true;
        }
      };
      try{
        const b=await collectH444Export({...f,transport});assert.equal(updated,true);
        assert.ok(!b.files.get('data.sql').includes(Buffer.from('changed-after-snapshot')));
        assert.ok(!b.files.get('schema.sql').includes(Buffer.from('concurrent_after_snapshot')));
        assert.equal(Number((await f.admin("SELECT count(*) FROM storage.objects WHERE version='changed-after-snapshot';")).toString()),475);
      }finally{await transport.close();await f.admin("UPDATE storage.objects SET version='fixture-v1'; DROP TABLE IF EXISTS tongs.concurrent_after_snapshot;");}
    });
    await t.test('source rejects writes, query failures are sanitized, and the session ends',async()=>{
      const transport=await createLocalPostgresTransport(f);
      for await(const _ of transport.query(BEGIN_SQL)){}
      await assert.rejects(async()=>{for await(const _ of transport.query("INSERT INTO storage.objects(id) VALUES ('DO_NOT_LEAK_SYNTHETIC_ROW');")){};},e=>e.message==='postgres_query_failed'&&!e.stack.includes('DO_NOT_LEAK'));
      await transport.close();
      assert.equal(Number((await f.admin("SELECT count(*) FROM storage.objects WHERE id='DO_NOT_LEAK_SYNTHETIC_ROW';")).toString()),0);
    });
    await t.test('timeout cancels an actual PostgreSQL query and closes its backend',async()=>{
      const transport=await createLocalPostgresTransport(f);const pid=transport.backendPid;
      await assert.rejects(async()=>{for await(const _ of transport.query('SELECT pg_sleep(10);',{timeoutMs:100})){};},/postgres_query_timeout/);
      await transport.close();assert.equal(Number((await f.admin('SELECT count(*) FROM pg_stat_activity WHERE pid='+pid+';')).toString()),0);
    });
    await t.test('insufficient SELECT privileges and RLS filtering fail closed',async()=>{
      await f.admin('REVOKE SELECT ON storage.objects FROM fixture_reader;');
      try{await assert.rejects(capture(),/inadequate_source_privileges/);}finally{await f.admin('GRANT SELECT ON storage.objects TO fixture_reader;');}
      await f.admin('ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;');
      try{await assert.rejects(capture(),/inadequate_source_privileges/);}finally{await f.admin('ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;');}
    });
    await t.test('missing migration columns and required financial authority fail closed',async()=>{
      await f.admin('ALTER TABLE supabase_migrations.schema_migrations RENAME rollback TO missing_rollback;');
      try{await assert.rejects(capture());}finally{await f.admin('ALTER TABLE supabase_migrations.schema_migrations RENAME missing_rollback TO rollback;');}
      await f.admin("UPDATE tongs.private_pricing_revisions SET id='missing-authority';");
      try{await assert.rejects(capture(),/incomplete_financial_authority/);}finally{await f.admin("UPDATE tongs.private_pricing_revisions SET id='b4c4472f-0325-4c2e-b2ef-9aef5e59e64a';");}
    });
    await t.test('secret values in selected rows and schema definitions stop acquisition',async()=>{
      await f.admin("UPDATE tongs.private_pricing_revisions SET payload='sk_test_00000000000000000000000000000000';");
      try{await assert.rejects(capture(),e=>e.message==='secret_content_detected'&&!e.stack.includes('sk_test_'));}finally{await f.admin("UPDATE tongs.private_pricing_revisions SET payload='synthetic authority';");}
      await f.admin("CREATE FUNCTION tongs.secret_fixture() RETURNS text LANGUAGE sql AS $$SELECT 'sk_test_00000000000000000000000000000000'::text$$;");
      try{await assert.rejects(capture(),/secret_content_detected/);}finally{await f.admin('DROP FUNCTION tongs.secret_fixture();');}
    });
    await t.test('authentic endpoints and TLS downgrades are rejected before connection',async()=>{
      for(const change of [{host:'db.authentic.invalid'},{sslmode:'require'}]){
        const plan=structuredClone(f.plan);Object.assign(plan.endpoint,change);
        await assert.rejects(createLocalPostgresTransport({...f,plan,expectedPlanSha256:sha256(canonical(plan))}),/endpoint_scope|verified_tls_required/);
      }
    });
    await t.test('actual TLS rejects an untrusted CA and a trusted wrong hostname',async()=>{
      try{
        await f.exec(['cp','/fixture/other.crt','/fixture/ca.crt']);
        const plan=structuredClone(f.plan);plan.endpoint.caSha256=await f.fingerprint('/fixture/ca.crt');
        await assert.rejects(createLocalPostgresTransport({...f,plan,expectedPlanSha256:sha256(canonical(plan))}),/postgres_tls_or_identity_failed/);
        await f.exec(['sh','-c','cp /fixture/other.crt /fixture/server.crt && cp /fixture/other.key /fixture/server.key && chown postgres:postgres /fixture/server.* && chmod 600 /fixture/server.key']);
        await f.admin('SELECT pg_reload_conf();');await new Promise(r=>setTimeout(r,250));
        await assert.rejects(createLocalPostgresTransport({...f,plan,expectedPlanSha256:sha256(canonical(plan))}),/postgres_tls_or_identity_failed/);
      }finally{
        await f.exec(['sh','-c','cp /fixture/good.crt /fixture/ca.crt && cp /fixture/good.crt /fixture/server.crt && cp /fixture/good.key /fixture/server.key && chown postgres:postgres /fixture/server.* && chmod 600 /fixture/server.key']);
        await f.admin('SELECT pg_reload_conf();');await new Promise(r=>setTimeout(r,250));
      }
      const transport=await createLocalPostgresTransport(f);await transport.close();
    });
    await t.test('AES-GCM plus actual CurrentUser DPAPI recovers all six byte-identical artifacts',async()=>{
      assert.ok(bundle,'successful database export required');
      const encrypted=await encryptExportBundle(bundle),again=await encryptExportBundle(bundle);
      assert.notEqual(sha256(encrypted),sha256(again));
      assert.ok(!encrypted.includes(Buffer.from('synthetic authority'))&&!encrypted.includes(Buffer.from('schema.sql')));
      const recovered=await decryptExportBundle(encrypted);
      for(const [name,bytes] of bundle.files)assert.deepEqual(recovered.files.get(name),bytes);
      assert.deepEqual(recovered.sourceObservationBytes,bundle.sourceObservationBytes);
      const tampered=Buffer.from(encrypted);tampered[tampered.length-1]^=1;
      for(const bytes of [tampered,encrypted.subarray(0,-1),Buffer.concat([encrypted,Buffer.from('extra')])])await assert.rejects(decryptExportBundle(bytes),/encrypted_output_verification_failed/);
      const headerLength=encrypted.readUInt32BE(8),header=JSON.parse(encrypted.subarray(12,12+headerLength));
      const wrap=Buffer.from(header.wrappedKey,'base64');wrap[wrap.length-1]^=1;header.wrappedKey=wrap.toString('base64');
      const changedHeader=Buffer.from(canonical(header));assert.equal(changedHeader.length,headerLength);
      const wrongKey=Buffer.concat([encrypted.subarray(0,12),changedHeader,encrypted.subarray(12+headerLength)]);
      await assert.rejects(decryptExportBundle(wrongKey),/encrypted_output_verification_failed/);
      const changedBundle={...bundle,files:new Map(bundle.files)};changedBundle.files.delete('schema.sql');
      await assert.rejects(encryptExportBundle(changedBundle),/artifact_verification_failed/);
      const wrongSnapshot={...bundle,receipt:structuredClone(bundle.receipt)};wrongSnapshot.receipt.artifacts[0].snapshotId='substituted';
      await assert.rejects(encryptExportBundle(wrongSnapshot),/artifact_verification_failed/);
    });
    await t.test('restricted output is ciphertext only, verified, and cannot overwrite evidence',async()=>{
      const result=await writeEncryptedExport(bundle,directory);
      assert.equal(result.artifactCount,6);assert.equal(result.acquisitionApproved,false);
      assert.equal(sha256(await readFile(result.path)),result.sha256);
      assert.deepEqual(await readdir(directory),['evidence.h444enc']);
      // New process, fresh DPAPI unwrap: no retained plaintext data key.
      const script="import {readFileSync} from 'node:fs';import {decryptExportBundle} from './scripts/lib/storage-h444-output.mjs';const b=await decryptExportBundle(readFileSync(process.argv[1]));console.log(JSON.stringify({artifacts:b.files.size,approved:b.receipt.acquisitionApproved}));";
      const restored=JSON.parse(await runPrivateProcess(process.execPath,['--input-type=module','-e',script,result.path]));
      assert.deepEqual(restored,{artifacts:6,approved:false});
      await assert.rejects(writeEncryptedExport(bundle,directory),/output_publication_failed/);
      assert.equal(sha256(await readFile(result.path)),result.sha256);
      for(const name of await readdir(directory))assert.ok((await readFile(join(directory,name))).subarray(0,8).equals(Buffer.from('H444ENC1')));
    });
    await t.test('an unrestricted output directory is rejected without writing',async()=>{
      const unsafe=join(directory,'unsafe');await mkdir(unsafe);
      await assert.rejects(writeEncryptedExport(bundle,unsafe));assert.deepEqual(await readdir(unsafe),[]);
    });
    await t.test('one workflow entrypoint captures, seals, verifies, and remains synthetic-only',async()=>{
      const result=await runSyntheticH444Acquisition(f,{directory,name:'workflow.h444enc'});
      const recovered=await decryptExportBundle(await readFile(result.path));verifyExportBundle(recovered);
      assert.equal(result.artifactCount,6);assert.equal(result.acquisitionApproved,false);
      await assert.rejects(runSyntheticH444Acquisition(f,{directory,name:'workflow.h444enc'}),/output_already_exists/);
      await assert.rejects(runSyntheticH444Acquisition({...f,mode:'authentic'},{directory,name:'forbidden.h444enc'}),/authentic_acquisition_not_approved/);
      await f.admin('REVOKE SELECT ON storage.objects FROM fixture_reader;');
      try{await assert.rejects(runSyntheticH444Acquisition(f,{directory,name:'failed.h444enc'}),/inadequate_source_privileges/);}
      finally{await f.admin('GRANT SELECT ON storage.objects TO fixture_reader;');}
      assert.ok(!(await readdir(directory)).includes('failed.h444enc'));
    });
  }finally{
    await f.stop();
    const target=resolve(directory);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&/^forge-h444-offline-[a-f0-9]{16}$/.test(target.split(sep).at(-1)));
    await rm(target,{recursive:true,force:true});
  }
});
