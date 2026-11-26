import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {validateHistoricalInventoryEvidence,verifyHistoricalObservation} from './storage-historical-inventory-evidence.mjs';

// Explicit local-only certification input. Never publish the private inventory
// or its object bodies in source, logs, PRs or fixture seeds for hosted use.
export function seedPrivateHistoricalInventory(sql,directory) {
 const root=resolve('.git/forge-storage-investigation-20261113');
 assert.equal(resolve(directory),root,'only the reviewed private inventory is accepted');
 const inventory=JSON.parse(readFileSync(join(root,'OBJECT_INVENTORY.json'),'utf8'));
 const receiptBytes=readFileSync(join(root,'accounting-repair/ALL_475_BYTE_RECEIPTS.json'));
 const receipts=JSON.parse(receiptBytes);
 const raw=JSON.parse(readFileSync(join(root,'02-objects.json'),'utf8')).data[0].objects.map(x=>x.object);
 validateHistoricalInventoryEvidence({inventory,receipts,raw,
  readBytes:id=>readFileSync(join(root,'accounting-repair/historical-bytes',id+'.bin'))});
 const literal=JSON.stringify(raw).replaceAll("'","''");
 sql(`insert into storage.objects(id,bucket_id,name,owner,created_at,updated_at,last_accessed_at,metadata,version,owner_id,user_metadata)
 select id,bucket_id,name,owner,created_at,updated_at,last_accessed_at,metadata,version,owner_id,user_metadata
 from jsonb_populate_recordset(null::storage.objects,'${literal}'::jsonb);`);
 return {ids:raw.map(o=>o.id),evidenceSha256:createHash('sha256').update(receiptBytes).digest('hex'),
  identities:inventory.map(o=>{const identity={...o.quarantine_identity};delete identity.updated_at;return identity;})};
}
export function approvePrivateHistoricalInventory({sql,authenticated,other,evidence:validated}) {
 const {ids,identities,evidenceSha256:evidence}=validated;
 const operator=q=>authenticated(other,q),parse=s=>JSON.parse(s.trim().split('\n').at(-1));
 sql(`insert into tongs.platform_operators(user_id,reason) values('${other}','Disposable copied-metadata certification') on conflict(user_id) do nothing;`);
 const predicate=`id=any(array[${ids.map(id=>`'${id}'::uuid`).join(',')}])`;
 const identity=()=>sql(`select jsonb_agg(to_jsonb(o) order by id) from storage.objects o where ${predicate};`);
 const before=identity();
 const obs=parse(sql(operator(`select tongs.observe_storage_historical_accounting(array[${ids.map(id=>`'${id}'::uuid`).join(',')}]);`)));
 verifyHistoricalObservation(identities,obs);
 sql(operator(`select tongs.approve_storage_historical_accounting('${obs.id}','${obs.manifest_sha256}','${evidence}','Isolated exact historical metadata and raw-byte reconciliation');`));
 assert.equal(identity(),before,'all 475 metadata identities and references unchanged by approval');
 const result=parse(sql(operator('select tongs.read_storage_historical_accounting();')));
 assert.equal(result.excluded_objects,475);assert.equal(result.unassigned_retained_bytes,447475);
 assert.equal(result.capacity_credit,0);assert.equal(result.customer_charge,0);
 assert.equal(sql('select count(*) from tongs.storage_quarantine_objects;').trim(),'0');
 console.log(JSON.stringify({all475:{result:'PASS',objects:475,bytes:447475,metadataSha256:createHash('sha256').update(before).digest('hex'),rawByteManifestSha256:evidence,
  scope:'Private raw bytes verified locally; exact hosted metadata copied into disposable SQL adapter. No hosted approval, ownership mapping, authenticated episode or playback claim.'}}));
 return {inventoryOnly:true};
}
