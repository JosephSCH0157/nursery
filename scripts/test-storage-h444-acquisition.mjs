import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdir,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,sep} from 'node:path';
import {randomBytes} from 'node:crypto';
import {sha256,canonical} from './lib/storage-h444-exporter.mjs';
import {validateAcquisitionAuthorization} from './lib/storage-h444-authorization.mjs';
import {validateAcquisitionPackage,runApprovedH444Acquisition} from './lib/storage-h444-acquisition.mjs';
import {restrictSyntheticOutputDirectory,decryptExportBundle,clearExportBundle} from './lib/storage-h444-output.mjs';
import {startSyntheticPostgres} from './fixtures/storage-h444-postgres-fixture.mjs';
import {prepareAcquisitionFixture} from './fixtures/storage-h444-acquisition-fixture.mjs';
import {validateLogicalArtifactBuffers} from './lib/storage-logical-restoration-certification.mjs';
import {createPinnedPostgresClient} from './lib/storage-h444-postgres.mjs';
import {runPrivateProcess} from './lib/storage-h444-process.mjs';

const versions=JSON.parse(readFileSync('docs/database/certification/storage-full-tail-446.json')).migrations.slice(0,444).map(m=>m.version);
const reseal=(r,change)=>{const a=JSON.parse(r.authorization.approvalBytes);change(a);const b=Buffer.from(canonical(a));return {...r,authorization:{...r.authorization,approvalBytes:b,approvedSha256:sha256(b)}};};
test('approved acquisition workflow against disposable SYNTHETIC database only',{skip:process.platform!=='win32'},async t=>{
  const directory=resolve(tmpdir(),'forge-h444-offline-'+randomBytes(8).toString('hex'));await mkdir(directory);
  const f=await startSyntheticPostgres(versions);
  try {
    let r=await prepareAcquisitionFixture(f,directory);
    // Real Storage has generated columns and objects outside the original 475.
    // Capture all metadata; select retained bodies only by approved receipt IDs.
    const objectColumns=f.plan.tables.find(t=>t.name==='storage.objects').columns;
    await f.admin("ALTER TABLE storage.objects ADD COLUMN path_tokens text[] GENERATED ALWAYS AS (string_to_array(name,'/')) STORED; INSERT INTO storage.objects ("+objectColumns.join(',')+") SELECT "+objectColumns.map(c=>c==='id'?"'ffffffff-ffff-4fff-8fff-ffffffffffff'":c==='name'?"'unrelated/new-object'":c).join(',')+" FROM storage.objects LIMIT 1;");
    const {authenticObservationSQL}=await import('./lib/storage-h444-authorization.mjs');
    r.observation=JSON.parse((await f.admin(authenticObservationSQL()+';')).toString());
    r=reseal(r,a=>{a.storageSha256=r.observation.storageSha256;});
    const output=join(directory,'forge-h444-offline-'+randomBytes(8).toString('hex'));await mkdir(output);await restrictSyntheticOutputDirectory(output);
    r=reseal(r,a=>{a.destination=output;});
    assert.equal(r.observation.storageStage,4);assert.equal(r.observation.storageContractOk,true);
    await t.test('authentic-client bootstrap uses pinned cached binaries, tmpfs and no persistent volumes (network disabled)',async()=>{
      const client=await createPinnedPostgresClient(f.imageId,{caBytes:r.caBytes});
      try {
        const [info]=JSON.parse(await runPrivateProcess('docker',['inspect',client.container]));
        assert.equal(info.HostConfig.NetworkMode,'none');assert.equal(info.HostConfig.ReadonlyRootfs,true);
        assert.ok(info.Mounts.every(m=>m.Type==='tmpfs'));assert.equal(info.Config.User,'65534:65534');
        assert.equal(info.HostConfig.MemorySwap,268435456);assert.equal(info.HostConfig.PidsLimit,32);
        const hashes=(await runPrivateProcess('docker',['exec',client.container,'sha256sum','/usr/lib/postgresql/17/bin/psql','/usr/lib/postgresql/17/bin/pg_dump','/fixture/ca.crt'])).toString();
        for(const hash of [r.plan.tools.psqlSha256,r.plan.tools.pgDumpSha256,r.plan.endpoint.caSha256])assert.ok(hashes.includes(hash));
      }finally{await client.dispose();}
    });
    await f.admin("ALTER ROLE fixture_reader PASSWORD 'SYNTHETIC_PASSWORD_ONLY';");
    await f.exec(['sh','-c',"printf '%s\n' 'local all all trust' 'hostssl all fixture_reader 127.0.0.1/32 scram-sha-256' > /var/lib/postgresql/data/pg_hba.conf"]);
    await f.admin('SELECT pg_reload_conf();');
    await t.test('approval binds candidate, exact scope, source, limits and independent decision references',async()=>{
      for(const change of [a=>a.candidate='0'.repeat(40),a=>a.planSha256='0'.repeat(64),a=>a.sourceProject='wrongsource',
        a=>a.principal='postgres',a=>a.independentReviewer=a.operator,a=>a.priorStopSupersededReference='',
        a=>a.expiresAt=new Date(0).toISOString(),a=>a.limits.bytes++,a=>a.costApprovalReference='',a=>a.recoveryReference='']){
        const wrong=reseal(r,change);await assert.rejects(validateAcquisitionPackage(wrong));
      }
      await assert.rejects(validateAcquisitionPackage({...r,authorization:{...r.authorization,approvedSha256:'0'.repeat(64)}}),/approval_digest/);
      await assert.rejects(validateAcquisitionPackage({...r,authorization:undefined}));
      await assert.rejects(validateAcquisitionPackage({...r,plan:{...r.plan,tables:[]}}),/scope_changed/);
      await assert.rejects(validateAcquisitionPackage({...r,inventoryBytes:Buffer.from('changed')}),/package_changed/);
      assert.deepEqual(await readdir(output),[]);
    });
    await t.test('synthetic approval cannot open the authentic endpoint or claim authentic evidence',()=>{
      assert.throws(()=>validateAcquisitionAuthorization({...r.authorization,plan:r.plan}),/evidence_kind/);
    });
    await t.test('unrestricted output is rejected before any source connection or attempt',async()=>{
      const unsafe=join(directory,'unsafe');await mkdir(unsafe);
      await assert.rejects(validateAcquisitionPackage(reseal(r,a=>{a.destination=unsafe;})));
      assert.deepEqual(await readdir(unsafe),[]);
    });
    await t.test('interruption before connection does not consume an attempt and clears credential bytes',async()=>{
      const controller=new AbortController();controller.abort();const credential=Buffer.from('SYNTHETIC_PASSWORD_ONLY');
      await assert.rejects(runApprovedH444Acquisition(r,{fixture:f,credential,signal:controller.signal}),/acquisition_interrupted/);
      assert.ok(credential.every(b=>b===0));assert.deepEqual(await readdir(output),[]);
    });
    await t.test('all six artifacts and 475 retained bodies encrypt and recover byte-identically',async()=>{
      const credential=Buffer.from('SYNTHETIC_PASSWORD_ONLY');
      const result=await runApprovedH444Acquisition(r,{fixture:f,credential});
      assert.ok(credential.every(b=>b===0));assert.equal(result.acquisitionApproved,false);
      const bytes=await readFile(result.path);assert.ok(!bytes.includes(Buffer.from('synthetic authority'))&&!bytes.includes(Buffer.from('SYNTHETIC_PASSWORD_ONLY')));
      const b=await decryptExportBundle(bytes);
      try {
        assert.equal(b.auxiliary.size,478);
        validateLogicalArtifactBuffers(b.files,b.receipt,{sourceProject:r.plan.sourceProject,sourceSnapshotId:b.receipt.snapshotId,sourceObservationSha256:sha256(b.sourceObservationBytes)});
        const observation=JSON.parse(b.sourceObservationBytes).observation;
        assert.equal(observation.financialSha256,r.observation.financialSha256);
        assert.equal(observation.originalHistorySha256,r.observation.originalHistorySha256);
        assert.equal(observation.storageSha256,r.observation.storageSha256);
        assert.match(b.files.get('data.sql').toString(),/unrelated\/new-object/);
        assert.match(b.files.get('schema.sql').toString(),/GENERATED ALWAYS AS/);
        assert.equal(JSON.parse(b.auxiliary.get('storage-snapshot-identities.json')).objects.length,475);
        assert.equal(observation.provenance.evidenceKind,'synthetic-offline');
      }finally{clearExportBundle(b);}
      assert.deepEqual((await readdir(output)).sort(),['attempt.json','evidence.h444enc']);
      await assert.rejects(runApprovedH444Acquisition(r,{fixture:f}),/destination_not_empty/);
    });
    await t.test('incorrect password is sanitized, consumes the attempt and cannot publish evidence',async()=>{
      const failed=join(directory,'forge-h444-offline-'+randomBytes(8).toString('hex'));await mkdir(failed);await restrictSyntheticOutputDirectory(failed);
      const request=reseal(r,a=>{a.destination=failed;});
      const password=Buffer.from('SYNTHETIC_INCORRECT_PASSWORD');
      await assert.rejects(runApprovedH444Acquisition(request,{fixture:f,credential:password}),e=>!e.message.includes('PASSWORD')&&/postgres_tls_or_identity_failed/.test(e.message));
      assert.ok(password.every(b=>b===0));assert.deepEqual(await readdir(failed),['attempt.json']);
    });
    await t.test('independently pinned source drift blocks before exporting schema or publishing evidence',async()=>{
      const failed=join(directory,'forge-h444-offline-'+randomBytes(8).toString('hex'));await mkdir(failed);await restrictSyntheticOutputDirectory(failed);
      const request=reseal(r,a=>{a.destination=failed;a.financialSha256='0'.repeat(64);});
      await assert.rejects(runApprovedH444Acquisition(request,{fixture:f,credential:Buffer.from('SYNTHETIC_PASSWORD_ONLY')}),/approved_source_fingerprint_changed/);
      assert.deepEqual(await readdir(failed),['attempt.json']);
    });
    await t.test('active interruption rolls back and retains only the consumed attempt',async()=>{
      const failed=join(directory,'forge-h444-offline-'+randomBytes(8).toString('hex'));await mkdir(failed);await restrictSyntheticOutputDirectory(failed);
      const request=reseal(r,a=>{a.destination=failed;}),controller=new AbortController();
      let timer;const watch=setInterval(async()=>{
        const count=Number((await f.admin("SELECT count(*) FROM pg_stat_activity WHERE usename='fixture_reader';")).toString());
        if(count){clearInterval(watch);controller.abort();}
      },100);
      timer=setTimeout(()=>controller.abort(),8000);
      try{await assert.rejects(runApprovedH444Acquisition(request,{fixture:f,credential:Buffer.from('SYNTHETIC_PASSWORD_ONLY'),signal:controller.signal}));}
      finally{clearInterval(watch);clearTimeout(timer);}
      assert.deepEqual(await readdir(failed),['attempt.json']);
      assert.equal(Number((await f.admin("SELECT count(*) FROM pg_stat_activity WHERE usename='fixture_reader';")).toString()),0);
    });
    await t.test('wrong retained body aborts, consumes the attempt, and publishes no success',async()=>{
      const failed=join(directory,'forge-h444-offline-'+randomBytes(8).toString('hex'));await mkdir(failed);await restrictSyntheticOutputDirectory(failed);
      const request=reseal(r,a=>{a.destination=failed;});
      const a=JSON.parse(request.authorization.approvalBytes),first=JSON.parse(r.receiptBytes)[0];
      await writeFile(join(a.bodyDirectory,first.object_id+'.bin'),Buffer.alloc(first.bytes,66));
      await assert.rejects(runApprovedH444Acquisition(request,{fixture:f,credential:Buffer.from('SYNTHETIC_PASSWORD_ONLY')}),/preserved_body_hash/);
      assert.deepEqual(await readdir(failed),['attempt.json']);
      assert.equal(Number((await f.admin("SELECT count(*) FROM pg_stat_activity WHERE usename='fixture_reader';")).toString()),0);
    });
  }finally{
    await f.stop();assert.ok(directory.startsWith(resolve(tmpdir())+sep)&&/^forge-h444-offline-[a-f0-9]{16}$/.test(directory.split(sep).at(-1)));
    await rm(directory,{recursive:true,force:true});
  }
});
