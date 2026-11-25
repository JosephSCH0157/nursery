// Synthetic local Windows encryption only. No database, Docker or credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdir,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {collectH444Export,sha256} from './lib/storage-h444-exporter.mjs';
import {syntheticExportFixture} from './fixtures/storage-h444-export-source.mjs';
import {encryptExportBundle,decryptExportBundle,writeEncryptedExport,clearExportBundle,
 encryptMetadataEvidence,decryptMetadataEvidence,writeEncryptedMetadataEvidence,restrictSyntheticOutputDirectory} from './lib/storage-h444-output.mjs';

test('existing H444 confidential output supports metadata without an alternate cipher',{timeout:120000},async t=>{
 assert.equal(process.platform,'win32');
 const directory=join(tmpdir(),'forge-h444-offline-'+randomBytes(8).toString('hex'));
 const plaintext=Buffer.from(JSON.stringify({purpose:'SYNTHETIC_METADATA_ONLY',text:'CANARY_NEVER_ON_DISK',unicode:'É 🛠'}));
 let bundle;
 try {
  await mkdir(directory);await restrictSyntheticOutputDirectory(directory);
  const envelope=await encryptMetadataEvidence(plaintext);
  await t.test('AES-GCM/DPAPI metadata roundtrip and randomized output',async()=>{
   assert.ok(envelope.subarray(0,8).equals(Buffer.from('H444ENC1')));
   const header=JSON.parse(envelope.subarray(12,12+envelope.readUInt32BE(8)));
   assert.equal(header.schema,'forge.h444.before-state-metadata-envelope.v1');
   assert.equal(header.algorithm,'AES-256-GCM');assert.equal(header.wrapping,'DPAPI-CurrentUser');
   const recovered=await decryptMetadataEvidence(envelope);assert.deepEqual(recovered,plaintext);recovered.fill(0);
   assert.notEqual(sha256(envelope),sha256(await encryptMetadataEvidence(plaintext)));
  });
  await t.test('metadata cannot masquerade as six-artifact evidence',async()=>{
   await assert.rejects(decryptExportBundle(envelope),/encrypted_output_verification_failed/);
  });
  await t.test('existing synthetic export schema, all six artifacts and output unchanged',async()=>{
   const versions=JSON.parse(readFileSync('docs/database/certification/storage-full-tail-446.json')).migrations.slice(0,444).map(m=>m.version);
   bundle=await collectH444Export(syntheticExportFixture(versions));
   const encrypted=await encryptExportBundle(bundle),recovered=await decryptExportBundle(encrypted);
   try {for(const [name,bytes] of bundle.files)assert.deepEqual(recovered.files.get(name),bytes);}finally{clearExportBundle(recovered);}
   await assert.rejects(decryptMetadataEvidence(encrypted),/encrypted_output_verification_failed/);
   const saved=await writeEncryptedExport(bundle,directory,'export.h444enc');
   assert.equal(saved.artifactCount,6);assert.equal(saved.acquisitionApproved,false);
  });
  const offset=12+envelope.readUInt32BE(8);
  for(const [name,index] of [['header',20],['ciphertext',offset],['tag',envelope.length-1]])await t.test('reject altered '+name,async()=>{
   const bad=Buffer.from(envelope);bad[index]^=1;await assert.rejects(decryptMetadataEvidence(bad),/encrypted_output_verification_failed/);
  });
  await t.test('reject truncated, appended, malformed and oversized envelopes',async()=>{
   for(const bad of [envelope.subarray(0,-1),Buffer.concat([envelope,Buffer.from('x')]),Buffer.from('invalid')])await assert.rejects(decryptMetadataEvidence(bad));
   await assert.rejects(decryptMetadataEvidence(Buffer.alloc(32*1024*1024+65537)),/metadata_envelope_size/);
   await assert.rejects(encryptMetadataEvidence(Buffer.alloc(0)),/metadata_size/);
   await assert.rejects(encryptMetadataEvidence(Buffer.alloc(32*1024*1024+1)),/metadata_size/);
  });
  await t.test('encrypted-only publication and fresh-process CurrentUser recovery',async()=>{
   const saved=await writeEncryptedMetadataEvidence(plaintext,directory);
   const bytes=await readFile(saved.path);assert.equal(sha256(bytes),saved.sha256);assert.equal(saved.plaintextSha256,sha256(plaintext));
   assert.ok(!bytes.includes(Buffer.from('CANARY_NEVER_ON_DISK')));
   const code="import fs from 'node:fs';import {createHash} from 'node:crypto';import {decryptMetadataEvidence} from "+JSON.stringify(pathToFileURL(resolve('scripts/lib/storage-h444-output.mjs')).href)+";const b=await decryptMetadataEvidence(fs.readFileSync(process.argv[1]));try{process.stdout.write(createHash('sha256').update(b).digest('hex'));}finally{b.fill(0);}";
   const child=spawnSync(process.execPath,['--input-type=module','-e',code,saved.path],{encoding:'utf8',timeout:20000});
   assert.equal(child.status,0);assert.equal(child.stderr,'');assert.equal(child.stdout,sha256(plaintext));
  });
  await t.test('occupied destination is never overwritten',async()=>{
   const before=await readFile(join(directory,'before-state.h444enc'));
   await assert.rejects(writeEncryptedMetadataEvidence(plaintext,directory),/output_publication_failed/);
   assert.deepEqual(await readFile(join(directory,'before-state.h444enc')),before);
  });
  await t.test('abort prevents final publication; any partial file is encrypted',async()=>{
   const abort=new AbortController();abort.abort();
   await assert.rejects(writeEncryptedMetadataEvidence(plaintext,directory,'aborted.h444enc',{signal:abort.signal}),/acquisition_interrupted/);
   const names=await readdir(directory);assert.ok(!names.includes('aborted.h444enc'));
   for(const name of names){const bytes=await readFile(join(directory,name));assert.ok(name.endsWith('.h444enc'));assert.ok(!bytes.includes(Buffer.from('CANARY_NEVER_ON_DISK')));}
  });
 }finally{
  plaintext.fill(0);clearExportBundle(bundle);
  const full=resolve(directory);assert.ok(full.startsWith(resolve(tmpdir())+sep)&&/^forge-h444-offline-[a-f0-9]{16}$/.test(full.split(sep).at(-1)));
  await rm(full,{recursive:true,force:true});
 }
});
