import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

const hash=(value,algorithm='sha256')=>createHash(algorithm).update(value).digest('hex');
const requireEvidence=(condition,field)=>{if(!condition)throw Error(`Historical inventory evidence mismatch: ${field}`);};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Retained HTTP read receipts include weak validators. They are not byte
// authority: independently verified SHA-256 + MD5 of the body remain required.
const etag=value=>typeof value==='string'?value.replace(/^(?:W\/)?"([a-f0-9]{32})"$/,'$1'):null;
const subMillisecond=value=>(String(value).match(/\.(\d+)(?:Z|[+-]\d\d(?::?\d\d)?)$/)?.[1]??'').padEnd(6,'0').slice(3);
// PostgreSQL jsonb orders object keys by UTF-8 byte length, then byte value.
// Reject number representations that this historical metadata format does not use.
export function historicalJsonbText(value) {
 if(value===null)return 'null';
 if(typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number') {
  requireEvidence(Number.isSafeInteger(value),'metadata number');return String(value);
 }
 if(Array.isArray(value))return '['+value.map(historicalJsonbText).join(', ')+']';
 requireEvidence(value && typeof value==='object','metadata type');
 const keys=Object.keys(value).sort((a,b)=>Buffer.byteLength(a)-Buffer.byteLength(b)||Buffer.compare(Buffer.from(a),Buffer.from(b)));
 return '{'+keys.map(k=>JSON.stringify(k)+': '+historicalJsonbText(value[k])).join(', ')+'}';
}

// Pure reconciliation before any SQL write. Inputs remain private; diagnostics
// identify only the failing field, never object IDs, paths, bodies or metadata.
export function validateHistoricalInventoryEvidence({inventory,receipts,raw,readBytes}) {
 const index=(rows,key,label)=>{
  requireEvidence(Array.isArray(rows)&&rows.length===475,label+' count');
  const result=new Map();
  for(const row of rows){
   requireEvidence(row && uuid.test(row[key]??'')&&!result.has(row[key]),label+' unique identity');
   result.set(row[key],row);
  }
  return result;
 };
 const objects=index(inventory,'object_id','inventory'),proofs=index(receipts,'object_id','receipts'),rows=index(raw,'id','raw');
 let total=0;
 for(const [id,o] of objects){
  const r=proofs.get(id),s=rows.get(id),q=o.quarantine_identity;
  requireEvidence(r&&s&&q,'object membership');
  requireEvidence(o.disposition==='historical_quarantine_candidate_requires_explicit_approval'
   &&o.billing_owner_established===false&&typeof o.retention_hold==='string'&&o.retention_hold.length>0,'accounting disposition');
  requireEvidence(['forge-workpieces','bellows-capture'].includes(o.bucket)&&o.bucket===s.bucket_id&&o.bucket===q.bucket,'bucket');
  requireEvidence(typeof o.path==='string'&&o.path.length>0&&o.path===s.name&&o.path===r.path&&hash(o.path)===q.path_sha256,'path');
  requireEvidence(typeof o.version==='string'&&o.version.length>0&&o.version===s.version&&o.version===r.version&&o.version===q.version,'provider version');
  requireEvidence(q.object_id===id,'observed object');
  requireEvidence(Number.isSafeInteger(o.bytes)&&o.bytes>=0&&o.bytes===r.bytes&&o.bytes===s.metadata?.size&&String(o.bytes)===q.byte_size,'byte size');
  requireEvidence(isDeepStrictEqual(o.storage_metadata,s.metadata)&&hash(historicalJsonbText(s.metadata))===q.metadata_sha256,'metadata');
  for(const [field,inventoryField] of [['owner','storage_owner'],['owner_id','storage_owner_id']]){
   requireEvidence(Object.hasOwn(o,inventoryField)&&Object.hasOwn(s,field)&&Object.hasOwn(q,field)
    &&o[inventoryField]===s[field]&&s[field]===q[field],'ownership');
  }
  requireEvidence(Object.hasOwn(s,'user_metadata')&&Object.hasOwn(q,'user_metadata')&&isDeepStrictEqual(s.user_metadata,q.user_metadata),'user metadata');
  for(const field of ['created_at','updated_at']){
   const time=Date.parse(o[field]);
   requireEvidence(Number.isFinite(time)&&time<Date.parse('2026-11-11T00:00:00Z')&&time===Date.parse(s[field])&&subMillisecond(o[field])===subMillisecond(s[field])
    &&Math.abs(time/1000-Number(q[field]))<0.001,'historical timestamp');
  }
  requireEvidence(Number.isFinite(Date.parse(r.read_at))&&Date.parse(r.read_at)>=Date.parse(s.updated_at),'read provenance');
  requireEvidence(/^[a-f0-9]{64}$/.test(r.sha256??''),'byte digest');
  if(o.content_sha256_if_read!=null)requireEvidence(o.content_sha256_if_read===r.sha256,'prior byte digest');
  const bytes=readBytes(id);
  requireEvidence(Buffer.isBuffer(bytes)&&bytes.length===o.bytes&&hash(bytes)===r.sha256,'read bytes');
  requireEvidence(etag(o.storage_metadata.eTag)===hash(bytes,'md5')&&etag(r.etag)===hash(bytes,'md5'),'provider eTag');
  total+=o.bytes;
 }
 requireEvidence(total===447475,'total bytes');
 return raw;
}

export function verifyHistoricalObservation(identities,observation){
 requireEvidence(Array.isArray(observation?.manifest?.objects)&&observation.manifest.objects.length===475,'observed inventory count');
 const byId=new Map(identities.map(o=>[o.object_id,o]));
 const seen=new Set();
 for(const actual of observation.manifest.objects){
  requireEvidence(!seen.has(actual.object_id)&&isDeepStrictEqual(actual,byId.get(actual.object_id)),'observed inventory identity');
  seen.add(actual.object_id);
 }
}
