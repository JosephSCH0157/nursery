import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {historicalJsonbText,validateHistoricalInventoryEvidence,verifyHistoricalObservation} from './lib/storage-historical-inventory-evidence.mjs';
const hash=(b,algorithm='sha256')=>createHash(algorithm).update(b).digest('hex');
function fixture(){
 const inventory=[],receipts=[],raw=[],bodies=new Map();
 for(let i=0;i<475;i++){
  const id=`e9000000-0000-4000-8000-${String(i).padStart(12,'0')}`,path=`synthetic/${i}.json`;
  const b=Buffer.alloc(i===474?967:942,i%256),metadata={size:b.length,eTag:hash(b,'md5'),mimetype:'application/json'};
  const s={id,bucket_id:'forge-workpieces',name:path,version:`original-${i}`,metadata,owner:null,owner_id:null,
   user_metadata:{fixture:true},created_at:'2026-08-01T00:00:00Z',updated_at:'2026-08-01T00:00:00Z'};
  const q={object_id:id,bucket:s.bucket_id,path_sha256:hash(path),version:s.version,byte_size:String(b.length),
   metadata_sha256:hash(historicalJsonbText(metadata)),owner:null,owner_id:null,user_metadata:s.user_metadata,
   created_at:Date.parse(s.created_at)/1000,updated_at:Date.parse(s.updated_at)/1000};
  inventory.push({object_id:id,bucket:s.bucket_id,path,bytes:b.length,version:s.version,storage_metadata:structuredClone(metadata),
   storage_owner:null,storage_owner_id:null,created_at:s.created_at,updated_at:s.updated_at,quarantine_identity:structuredClone(q),
   content_sha256_if_read:hash(b),billing_owner_established:false,disposition:'historical_quarantine_candidate_requires_explicit_approval',retention_hold:'retain unchanged'});
  receipts.push({object_id:id,path,bytes:b.length,version:s.version,sha256:hash(b),etag:(i%2?'W/':'')+'"'+metadata.eTag+'"',read_at:'2026-11-13T00:00:00Z'});
  raw.push(s);bodies.set(id,b);
 }
 return {inventory,receipts,raw,readBytes:id=>bodies.get(id)};
}
test('reconciles all 475 identities independent of row order without changing ownership or bytes',()=>{
 const f=fixture(),before=JSON.stringify(f);f.raw.reverse();f.receipts.reverse();
 assert.equal(validateHistoricalInventoryEvidence(f),f.raw);
 f.raw.reverse();f.receipts.reverse();assert.equal(JSON.stringify(f),before);
});
const changes={
 'missing raw':f=>f.raw.pop(), 'duplicate raw':f=>f.raw[1]=f.raw[0],
 'duplicate inventory':f=>f.inventory[1]=f.inventory[0], 'duplicate receipt':f=>f.receipts[1]=f.receipts[0],
 'unrelated raw ID':f=>f.raw[0].id='e8000000-0000-4000-8000-000000000000',
 'unsafe inventory ID':f=>f.inventory[0].object_id='../private',
 'raw path':f=>f.raw[0].name='unrelated', 'receipt path':f=>f.receipts[0].path='unrelated',
 'bucket':f=>f.raw[0].bucket_id='bellows-capture', 'raw version':f=>f.raw[0].version='replacement',
 'receipt version':f=>f.receipts[0].version='replacement', 'observed version':f=>f.inventory[0].quarantine_identity.version='replacement',
 'raw size':f=>f.raw[0].metadata.size++, 'receipt size':f=>f.receipts[0].bytes++,
 'raw metadata':f=>f.raw[0].metadata.mimetype='text/plain', 'raw etag':f=>f.raw[0].metadata.eTag='f'.repeat(32),
 'receipt etag':f=>f.receipts[0].etag='f'.repeat(32), 'raw owner':f=>f.raw[0].owner='unrelated',
 'raw owner ID':f=>f.raw[0].owner_id='unrelated', 'missing owner':f=>delete f.raw[0].owner,
 'raw user metadata':f=>f.raw[0].user_metadata={changed:true}, 'missing user metadata':f=>delete f.raw[0].user_metadata,
 'created timestamp':f=>f.raw[0].created_at='2026-11-20T00:00:00Z', 'updated timestamp':f=>f.raw[0].updated_at='2026-08-02T00:00:00Z',
 'submillisecond identity change':f=>f.raw[0].created_at='2026-08-01T00:00:00.000001Z',
 'future historical object':f=>{f.raw[0].created_at=f.inventory[0].created_at='2026-11-20T00:00:00Z';},
 'read provenance':f=>delete f.receipts[0].read_at, 'receipt digest':f=>f.receipts[0].sha256='f'.repeat(64),
 'missing body':f=>f.readBytes=()=>undefined, 'different body':f=>f.readBytes=()=>Buffer.alloc(942,255),
 'metadata digest':f=>f.inventory[0].quarantine_identity.metadata_sha256='f'.repeat(64),
 'observed path digest':f=>f.inventory[0].quarantine_identity.path_sha256='f'.repeat(64),
 'disposition':f=>f.inventory[0].disposition='approved', 'attributed inventory':f=>f.inventory[0].billing_owner_established=true,
 'missing retention hold':f=>delete f.inventory[0].retention_hold,
};
for(const [name,change] of Object.entries(changes))test(`fails closed on ${name} without private diagnostics`,()=>{
 const f=fixture();change(f);
 assert.throws(()=>validateHistoricalInventoryEvidence(f),e=>{
  assert.match(e.message,/Historical inventory evidence mismatch:/);
  assert.doesNotMatch(e.message,/synthetic\/|e9000000|original-0/);return true;
 });
});
test('jsonb metadata encoding preserves PostgreSQL key ordering and spacing',()=>{
 assert.equal(historicalJsonbText({long:'x',b:1,a:[null,true]}),'{"a": [null, true], "b": 1, "long": "x"}');
 assert.throws(()=>historicalJsonbText({unsupported:1.5}));
});
test('approval must observe the exact byte-validated identities, including ownership and version',()=>{
 const identities=fixture().inventory.map(o=>{const q={...o.quarantine_identity};delete q.updated_at;return q;});
 verifyHistoricalObservation(identities,{manifest:{objects:structuredClone(identities).reverse()}});
 for(const change of [a=>a.pop(),a=>a[1]=a[0],a=>a[0].version='new',a=>a[0].owner='new',a=>a[0].user_metadata={new:true}]){
  const objects=structuredClone(identities);change(objects);
  assert.throws(()=>verifyHistoricalObservation(identities,{manifest:{objects}}),/Historical inventory evidence mismatch/);
 }
});
