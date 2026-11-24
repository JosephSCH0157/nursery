import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {open,readFile,link,unlink,lstat,realpath} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ExportHold,canonical,sha256,LIMITS,FIXTURE_PROJECT} from './storage-h444-exporter.mjs';
import {validateLogicalArtifactBuffers,REQUIRED_LOGICAL_ARTIFACTS} from './storage-logical-restoration-certification.mjs';
import {runPrivateProcess} from './storage-h444-process.mjs';
import {verifyPreservedBundle} from './storage-h444-preserved-bodies.mjs';
import {screenExportValue} from './storage-h444-secret-screen.mjs';

const MAGIC=Buffer.from('H444ENC1'),INNER=Buffer.from('H444DATA1'),MAX=LIMITS.bytes+4*1024*1024;
const MEMBERS=[...REQUIRED_LOGICAL_ARTIFACTS,'source-observation.json','export-receipt.json'].sort();
const helper=fileURLToPath(new URL('./storage-h444-windows.ps1',import.meta.url));
const hold=(ok,code)=>{if(!ok)throw new ExportHold(code);};
const keys=(v,k)=>hold(v&&canonical(Object.keys(v).sort())===canonical([...k].sort()),'envelope_fields');
const uint=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;};
const json=b=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));
async function windows(action,{directory,input}={}) {
  hold(process.platform==='win32','windows_required');
  const exe=join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
  return runPrivateProcess(exe,['-NoProfile','-NonInteractive','-File',helper,'-Action',action,...(directory?['-Directory',directory]:[])],{input,maxBytes:16384,timeoutMs:15000});
}
export async function restrictSyntheticOutputDirectory(directory) {await windows('Restrict',{directory});}
export async function verifyOutputDirectory(directory) {
  const full=resolve(directory);
  hold((await lstat(full)).isDirectory()&&(await realpath(full)).toLowerCase()===full.toLowerCase(),'output_path');
  await windows('Verify',{directory:full});return full;
}
export async function dpapiKey(action,bytes) {
  hold(action==='Protect'||action==='Unprotect','dpapi_action');
  const encoded=await windows(action,{input:Buffer.from(bytes.toString('base64'))});
  try{const value=Buffer.from(encoded.toString(),'base64');hold(value.length>0&&value.length<=8192,'dpapi_result');return value;}
  finally{encoded.fill(0);}
}
export function verifyExportBundle(bundle) {
  try {
    const {files,receipt,sourceObservationBytes}=bundle;
    const authentic=receipt.schema==='forge.storage-h444-logical-export-receipt.v1';
    if(authentic){
      keys(receipt,['schema','sourceProject','snapshotId','consistencyMethod','snapshotStartedAt','snapshotCompletedAt','consistencyProofSha256','sourceObservationSha256','productionSecretsIncluded','artifacts']);
      hold(receipt.sourceProject==='wtvdjndyxegudufrompx'&&receipt.productionSecretsIncluded===false,'authentic_receipt_policy');
      verifyPreservedBundle(bundle);
    }else hold(receipt.schema==='forge.h444-synthetic-export-receipt.v1'&&receipt.evidenceKind==='synthetic-offline'
      &&receipt.sourceProject===FIXTURE_PROJECT&&receipt.acquisitionApproved===false&&receipt.confidentialityVerified===false,'authentic_acquisition_not_approved');
    hold(Number.isFinite(Date.parse(receipt.snapshotStartedAt))&&Number.isFinite(Date.parse(receipt.snapshotCompletedAt))
      &&Date.parse(receipt.snapshotCompletedAt)>=Date.parse(receipt.snapshotStartedAt),'snapshot_time_order');
    validateLogicalArtifactBuffers(files,receipt,{sourceProject:receipt.sourceProject,sourceSnapshotId:receipt.snapshotId,sourceObservationSha256:sha256(sourceObservationBytes)});
    hold(receipt.sourceObservationSha256===sha256(sourceObservationBytes),'source_observation_hash');
    const source=json(sourceObservationBytes);
    hold(source.schema==='forge.storage-h444-logical-source-observation.v1'&&source.sourceProject===receipt.sourceProject&&source.snapshotId===receipt.snapshotId
      &&source.observation.provenance.evidenceKind===(authentic?'authentic-logical-acquisition':'synthetic-offline'),'source_observation_scope');
    hold([...files.values()].reduce((sum,b)=>sum+b.length,0)<=LIMITS.bytes,'artifact_byte_limit');
    if(bundle.auxiliary)verifyPreservedBundle(bundle);
    for(const bytes of files.values())screenExportValue(bytes);
    if(bundle.auxiliary)for(const [name,bytes] of bundle.auxiliary)if(!name.endsWith('.bin'))screenExportValue(bytes);
    screenExportValue(source);screenExportValue(receipt);
  }catch(e){throw e instanceof ExportHold?e:new ExportHold('artifact_verification_failed');}
}
function pack(bundle) {
  verifyExportBundle(bundle);
  const members=new Map([...bundle.files,...(bundle.auxiliary??[]),['source-observation.json',bundle.sourceObservationBytes],['export-receipt.json',Buffer.from(canonical(bundle.receipt))]]);
  const names=[...members.keys()].sort();
  const header=Buffer.from(canonical({members:names.map(name=>({name,length:members.get(name).length,sha256:sha256(members.get(name))}))}));
  const bytes=Buffer.concat([INNER,uint(header.length),header,...names.map(n=>members.get(n))]);
  hold(bytes.length<=MAX,'container_size');return bytes;
}
function unpack(bytes) {
  hold(bytes.length<=MAX&&bytes.subarray(0,INNER.length).equals(INNER),'container_format');
  const size=bytes.readUInt32BE(INNER.length);hold(size>0&&size<=131072&&size+INNER.length+4<=bytes.length,'container_header');
  const header=json(bytes.subarray(INNER.length+4,INNER.length+4+size));keys(header,['members']);
  const names=header.members.map(m=>m.name);
  hold(new Set(names).size===names.length&&MEMBERS.every(n=>names.includes(n))&&names.every(n=>MEMBERS.includes(n)||['acquisition-approval.json','storage-byte-receipts.json','storage-snapshot-identities.json'].includes(n)||/^storage\/[a-f0-9-]{36}\.bin$/.test(n))&&(names.length===8||names.length===486),'container_members');
  let offset=INNER.length+4+size;const members=new Map();
  for(const member of header.members){
    keys(member,['name','length','sha256']);hold(Number.isSafeInteger(member.length)&&member.length>0&&offset+member.length<=bytes.length,'container_member_size');
    const value=bytes.subarray(offset,offset+member.length);hold(sha256(value)===member.sha256,'container_member_hash');members.set(member.name,Buffer.from(value));offset+=member.length;
  }
  hold(offset===bytes.length,'container_trailing_bytes');
  const bundle={files:new Map(REQUIRED_LOGICAL_ARTIFACTS.map(n=>[n,members.get(n)])),sourceObservationBytes:members.get('source-observation.json'),receipt:json(members.get('export-receipt.json'))};
  if(members.size>MEMBERS.length)bundle.auxiliary=new Map([...members].filter(([n])=>!MEMBERS.includes(n)));
  verifyExportBundle(bundle);return bundle;
}
export async function encryptExportBundle(bundle) {
  const plaintext=pack(bundle),key=randomBytes(32),nonce=randomBytes(12);
  try {
    const wrapped=await dpapiKey('Protect',key);
    const header=Buffer.from(canonical({schema:bundle.auxiliary?'forge.h444.acquisition-envelope.v1':'forge.h444.synthetic-envelope.v1',algorithm:'AES-256-GCM',wrapping:'DPAPI-CurrentUser',
      wrappedKey:wrapped.toString('base64'),nonce:nonce.toString('base64'),ciphertextLength:plaintext.length}));
    const aad=Buffer.concat([MAGIC,uint(header.length),header]);
    const cipher=createCipheriv('aes-256-gcm',key,nonce,{authTagLength:16});cipher.setAAD(aad);
    return Buffer.concat([aad,cipher.update(plaintext),cipher.final(),cipher.getAuthTag()]);
  }finally{key.fill(0);plaintext.fill(0);}
}
export async function decryptExportBundle(bytes) {
  let key,plaintext,partial;
  try {
    hold(Buffer.isBuffer(bytes)&&bytes.length>MAGIC.length+20&&bytes.length<=MAX+65536,'envelope_size');
    hold(bytes.subarray(0,MAGIC.length).equals(MAGIC),'envelope_magic');
    const size=bytes.readUInt32BE(MAGIC.length);hold(size>0&&size<=32768&&MAGIC.length+4+size+16<=bytes.length,'envelope_header');
    const offset=MAGIC.length+4+size,header=json(bytes.subarray(MAGIC.length+4,offset));
    keys(header,['schema','algorithm','wrapping','wrappedKey','nonce','ciphertextLength']);
    hold(['forge.h444.synthetic-envelope.v1','forge.h444.acquisition-envelope.v1'].includes(header.schema)&&header.algorithm==='AES-256-GCM'&&header.wrapping==='DPAPI-CurrentUser','envelope_policy');
    hold(Number.isSafeInteger(header.ciphertextLength)&&header.ciphertextLength>0&&header.ciphertextLength<=MAX&&offset+header.ciphertextLength+16===bytes.length,'envelope_length');
    const nonce=Buffer.from(header.nonce,'base64'),wrapped=Buffer.from(header.wrappedKey,'base64');
    hold(nonce.length===12&&wrapped.length>0&&wrapped.length<=8192,'envelope_key');
    key=await dpapiKey('Unprotect',wrapped);hold(key.length===32,'envelope_key');
    const decipher=createDecipheriv('aes-256-gcm',key,nonce,{authTagLength:16});decipher.setAAD(bytes.subarray(0,offset));decipher.setAuthTag(bytes.subarray(-16));
    partial=decipher.update(bytes.subarray(offset,-16));
    // No parsing or delivery of partial plaintext before GCM authentication.
    const final=decipher.final();plaintext=Buffer.concat([partial,final]);return unpack(plaintext);
  }catch{throw new ExportHold('encrypted_output_verification_failed');}
  finally{key?.fill(0);partial?.fill(0);plaintext?.fill(0);}
}
export async function writeEncryptedExport(bundle,directory,name='evidence.h444enc',{signal}={}) {
  hold(/^[a-z0-9-]+\.h444enc$/.test(name),'output_name');
  const root=await verifyOutputDirectory(directory),destination=join(root,name),staging=join(root,'partial-'+randomBytes(12).toString('hex')+'.h444enc');
  const envelope=await encryptExportBundle(bundle);
  const handle=await open(staging,'wx',0o600);
  try{await handle.writeFile(envelope);await handle.sync();}finally{await handle.close();}
  await verifyOutputDirectory(root);
  const stored=await readFile(staging);hold(sha256(stored)===sha256(envelope),'encrypted_disk_hash');
  const recovered=await decryptExportBundle(stored);
  try{for(const [n,b] of bundle.files)hold(b.equals(recovered.files.get(n)),'encrypted_disk_roundtrip');}
  finally{clearExportBundle(recovered);}
  hold(!signal?.aborted,'acquisition_interrupted');
  // Atomic no-replacement publication on the same volume (rename may replace).
  try{await link(staging,destination);}catch{throw new ExportHold('output_publication_failed');}
  await unlink(staging);
  const status=await lstat(destination);hold(status.isFile()&&!status.isSymbolicLink(),'output_file');
  await verifyOutputDirectory(root);
  hold(sha256(await readFile(destination))===sha256(envelope),'published_bytes_changed');
  return {path:destination,sha256:sha256(envelope),sizeBytes:envelope.length,artifactCount:6,acquisitionApproved:bundle.receipt.schema==='forge.storage-h444-logical-export-receipt.v1'};
}

export function clearExportBundle(bundle){if(!bundle)return;for(const b of bundle.files.values())b.fill(0);bundle.sourceObservationBytes.fill(0);for(const b of bundle.auxiliary?.values()??[])b.fill(0);}
