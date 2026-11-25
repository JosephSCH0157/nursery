import {open,lstat,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {ExportHold,canonical,sha256,storageIdentityDigest} from './storage-h444-exporter.mjs';
import {screenExportValue} from './storage-h444-secret-screen.mjs';
const hold=(ok,code)=>{if(!ok)throw new ExportHold(code);};
// RFC 9110 sections 8.8.3/8.8.3.2: validate a single entity-tag before weak
// comparison. Do not trim, case-fold, unescape or accept bare/list values.
// This corroborates identity only; version/metadata pins and body SHA-256 still
// establish preservation. A weak tag is never promoted to a strong byte proof.
const opaqueTag=value=>{
  const match=typeof value==='string'&&/^(?:W\/)?"([\x21\x23-\x7e\x80-\xff]*)"$/.exec(value);
  hold(match&&match[0]===value,'preserved_object_etag');
  return match[1];
};

export function selectPreservedObjects(allObjects,bytes,approvedSha256) {
  hold(Buffer.isBuffer(bytes)&&bytes.length<=1024*1024&&sha256(bytes)===approvedSha256,'preserved_receipts_changed');
  let receipts;try{receipts=JSON.parse(bytes);}catch{throw new ExportHold('preserved_receipts_invalid');}
  hold(Array.isArray(receipts)&&receipts.length===475&&new Set(receipts.map(r=>r.object_id)).size===475,'preserved_receipt_set');
  hold(Array.isArray(allObjects)&&new Set(allObjects.map(o=>o.id)).size===allObjects.length,'duplicate_storage_identity');
  const ids=new Set(receipts.map(r=>r.object_id));
  const originals=allObjects.filter(o=>ids.has(o.id));
  validatePreservedReceipts(bytes,approvedSha256,originals);
  return originals;
}

export function validatePreservedReceipts(bytes,approvedSha256,objects) {
  hold(Buffer.isBuffer(bytes)&&bytes.length<=1024*1024&&sha256(bytes)===approvedSha256,'preserved_receipts_changed');
  let receipts;try{receipts=JSON.parse(bytes);}catch{throw new ExportHold('preserved_receipts_invalid');}
  hold(Array.isArray(receipts)&&receipts.length===475&&new Set(receipts.map(r=>r.object_id)).size===475,'preserved_receipt_set');
  hold(Array.isArray(objects)&&objects.length===475&&new Set(objects.map(o=>o.id)).size===475,'preserved_object_set');
  for(const r of receipts){
    const o=objects.find(o=>o.id===r.object_id);
    hold(/^[a-f0-9-]{36}$/.test(r.object_id)&&o&&o.bucket_id==='forge-workpieces'&&r.path===o.name&&r.version===o.version
      &&opaqueTag(r.etag)===opaqueTag(o.metadata?.eTag)&&Number(o.metadata.size)===r.bytes
      &&Number.isSafeInteger(r.bytes)&&r.bytes>0&&r.bytes<=65536&&/^[a-f0-9]{64}$/.test(r.sha256),'preserved_object_identity');
  }
  hold(receipts.reduce((n,r)=>n+r.bytes,0)===447475,'preserved_total_bytes');
  return receipts;
}
export async function acquirePreservedBodies({directory,receiptBytes,approvalBytes,approvedSha256,objects,snapshotId}) {
  const a=JSON.parse(approvalBytes),receipts=validatePreservedReceipts(receiptBytes,a.bodyReceiptsSha256,objects);
  const root=resolve(directory);
  hold(root===a.bodyDirectory&&(await lstat(root)).isDirectory()&&(await realpath(root)).toLowerCase()===root.toLowerCase(),'preserved_body_directory');
  const auxiliary=new Map([
    ['acquisition-approval.json',Buffer.from(approvalBytes)],['storage-byte-receipts.json',Buffer.from(receiptBytes)],
    ['storage-snapshot-identities.json',Buffer.from(canonical({snapshotId,approvalSha256:approvedSha256,objects}))],
  ]);
  try {
    for(const r of receipts){
      const path=join(root,r.object_id+'.bin'),stat=await lstat(path);
      hold(stat.isFile()&&!stat.isSymbolicLink()&&stat.size===r.bytes,'preserved_body_file');
      const handle=await open(path,'r');let bytes;
      try {hold((await handle.stat()).size===r.bytes,'preserved_body_size');bytes=Buffer.alloc(r.bytes+1);const {bytesRead}=await handle.read(bytes,0,bytes.length,0);hold(bytesRead===r.bytes,'preserved_body_size');bytes=bytes.subarray(0,r.bytes);}
      finally{await handle.close();}
      auxiliary.set('storage/'+r.object_id+'.bin',bytes);
      hold(sha256(bytes)===r.sha256,'preserved_body_hash');screenExportValue(bytes);
    }
    return auxiliary;
  }catch(e){for(const b of auxiliary.values())b.fill(0);throw e instanceof ExportHold?e:new ExportHold('preserved_body_unavailable');}
}
export function verifyPreservedBundle(bundle) {
  const aux=bundle.auxiliary;
  hold(aux instanceof Map&&aux.size===478,'encrypted_storage_members');
  const source=JSON.parse(bundle.sourceObservationBytes),aBytes=aux.get('acquisition-approval.json');
  hold(sha256(aBytes)===source.observation.provenance.acquisitionApprovalSha256,'encrypted_approval_binding');
  const a=JSON.parse(aBytes),identity=JSON.parse(aux.get('storage-snapshot-identities.json'));
  hold(identity.snapshotId===bundle.receipt.snapshotId&&identity.approvalSha256===sha256(aBytes),'encrypted_storage_snapshot');
  hold(storageIdentityDigest(identity.objects)===source.observation.provenance.storageIdentitySha256,'encrypted_storage_identity');
  const receipts=validatePreservedReceipts(aux.get('storage-byte-receipts.json'),a.bodyReceiptsSha256,identity.objects);
  for(const r of receipts){const b=aux.get('storage/'+r.object_id+'.bin');hold(Buffer.isBuffer(b)&&b.length===r.bytes&&sha256(b)===r.sha256,'encrypted_storage_body');screenExportValue(b);}
}
