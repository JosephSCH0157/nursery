import assert from 'node:assert/strict';
import test from 'node:test';
import { parseStorageCapacity, formatStorageBytes } from '../src/routes/storageCapacity';
const GiB=1024**3;
const valid={term:'forge.storage-capacity.v1',base_bytes:5*GiB,addon_bytes:50*GiB,total_bytes:55*GiB,used_bytes:GiB,remaining_bytes:54*GiB,usage_complete:true,delete_only:false};
test('only acknowledged server capacity is displayed, without a browser base grant',()=>{
 assert.deepEqual(parseStorageCapacity(valid),{baseBytes:5*GiB,addonBytes:50*GiB,totalBytes:55*GiB,usedBytes:GiB,remainingBytes:54*GiB,deleteOnly:false});
 assert.equal(parseStorageCapacity({...valid,base_bytes:0,addon_bytes:0,total_bytes:0,remaining_bytes:0,delete_only:true}).baseBytes,0);
});
test('incomplete usage is unknown and delete-only, never reported as zero free space used',()=>{
 const parsed=parseStorageCapacity({...valid,usage_complete:false,delete_only:true});
 assert.equal(parsed.usedBytes,null);assert.equal(parsed.remainingBytes,null);assert.equal(parsed.deleteOnly,true);
});
test('contradictory or unsafe capacity receipts fail closed',()=>{
 for(const bad of [null,{}, {...valid,total_bytes:500*GiB},{...valid,base_bytes:-1},{...valid,used_bytes:'0'}, {...valid,remaining_bytes:0},{...valid,usage_complete:false},{...valid,term:'unknown'}])assert.throws(()=>parseStorageCapacity(bad));
});
test('binary byte counts stay consistent through MB-scale to TB-scale capacity',()=>{
 assert.equal(formatStorageBytes(1024**2),'1.0 MiB');assert.equal(formatStorageBytes(5*GiB),'5.0 GiB');assert.equal(formatStorageBytes(1024**4),'1.0 TiB');assert.equal(formatStorageBytes(0),'0 B');assert.equal(formatStorageBytes(null),'--');
});
