import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,copyFileSync,rmSync,readdirSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PAYLOAD,PROJECT,releaseFor,STORAGE_RELEASES} from './lib/storage-hosted-release-contract.mjs';

function payloadFiles(repo,names) {
 const data=execFileSync('git',['-C',repo,'cat-file','--batch'],{input:names.map(p=>`${PAYLOAD}:${p}\n`).join(''),maxBuffer:100*1024*1024});
 let offset=0;const files=new Map();
 for(const name of names){
  const end=data.indexOf(10,offset);assert.ok(end>=offset);
  const header=data.subarray(offset,end).toString().match(/^[a-f0-9]{40} blob (\d+)$/);assert.ok(header,'missing_payload_blob');
  const size=Number(header[1]);offset=end+1;
  files.set(name,data.subarray(offset,offset+size));offset+=size;assert.equal(data[offset++],10);
 }
 assert.equal(offset,data.length);return files;
}

export function prepareStorageWorkdir(repo,version) {
 const r=releaseFor(version); repo=resolve(repo);
 const git=(...args)=>execFileSync('git',['-C',repo,...args],{maxBuffer:32*1024*1024});
 git('merge-base','--is-ancestor',PAYLOAD,'HEAD');
 // This is a bounded SQL-only materialization, never a runnable source checkout.
 const list=ref=>git('ls-tree','-r','--name-only',ref,'--','supabase/migrations').toString().trim().split('\n').filter(p=>p.endsWith('.sql')).sort();
 const names=list(PAYLOAD);assert.equal(names.length,444,'certified_inventory_count');
 assert.deepEqual(list('HEAD'),names,'unexpected_migration_inventory');
 const working=readdirSync(join(repo,'supabase/migrations')).filter(p=>p.endsWith('.sql')).map(p=>'supabase/migrations/'+p).sort();
 assert.deepEqual(working,names,'untracked_migration');
 git('diff','--exit-code',PAYLOAD,'HEAD','--','supabase/migrations');
 assert.equal(readFileSync(join(repo,'supabase/.temp/project-ref'),'utf8').trim(),PROJECT,'linked_project');
 for(const s of STORAGE_RELEASES)assert.equal(createHash('sha256').update(git('show',`${PAYLOAD}:supabase/migrations/${s.filename}`)).digest('hex'),s.sha256,'payload_hash');
 const base=join(repo,'.git/forge-private-evidence/storage-release');mkdirSync(base,{recursive:true,mode:0o700});
 const dir=mkdtempSync(join(base,`${r.number}-`));
 try {
  mkdirSync(join(dir,'supabase/migrations'),{recursive:true,mode:0o700});mkdirSync(join(dir,'supabase/.temp'),{mode:0o700});
  copyFileSync(join(repo,'supabase/config.toml'),join(dir,'supabase/config.toml'));
  // Existing linked connection descriptor only; never enroll/rotate a credential.
  for(const name of ['project-ref','pooler-url'])copyFileSync(join(repo,'supabase/.temp',name),join(dir,'supabase/.temp',name));
  const selected=names.filter(p=>p.split('/').at(-1).split('_')[0]<=r.version);
  assert.equal(selected.length,r.number,'prefix_count');
  for(const [p,bytes] of payloadFiles(repo,selected))writeFileSync(join(dir,p),bytes,{mode:0o600});
  writeFileSync(join(dir,'storage-release.json'),JSON.stringify({project:PROJECT,version:r.version,payload:PAYLOAD,files:selected}),{mode:0o600});
  verifyStorageWorkdir(repo,version,dir);
  return dir;
 }catch(e){rmSync(dir,{recursive:true,force:true});throw e;}
}
export function verifyStorageWorkdir(repo,version,dir) {
 const r=releaseFor(version);repo=resolve(repo);dir=resolve(dir);
 const rel=relative(join(repo,'.git/forge-private-evidence/storage-release'),dir);
 assert.ok(rel && !rel.startsWith('..') && !rel.includes('/') && !rel.includes('\\'),'private_workdir_required');
 const git=(...a)=>execFileSync('git',['-C',repo,...a],{maxBuffer:32*1024*1024});
 const names=git('ls-tree','-r','--name-only',PAYLOAD,'--','supabase/migrations').toString().trim().split('\n').filter(p=>p.endsWith('.sql') && p.split('/').at(-1).split('_')[0]<=r.version).sort();
 assert.equal(names.length,r.number);
 assert.deepEqual(readdirSync(join(dir,'supabase/migrations')).sort(),names.map(p=>p.split('/').at(-1)).sort(),'staged_inventory');
 for(const [p,bytes] of payloadFiles(repo,names))assert.deepEqual(readFileSync(join(dir,p)),bytes,'staged_bytes');
 assert.equal(readFileSync(join(dir,'supabase/.temp/project-ref'),'utf8').trim(),PROJECT);
 const pooler=new URL(readFileSync(join(dir,'supabase/.temp/pooler-url'),'utf8').trim());
 assert.ok(!pooler.password && ((pooler.username===`postgres.${PROJECT}` && pooler.hostname.endsWith('.pooler.supabase.com')) || (pooler.username==='postgres' && pooler.hostname===`db.${PROJECT}.supabase.co`)),'linked_connection_project');
 assert.deepEqual(readFileSync(join(dir,'supabase/config.toml')),readFileSync(join(repo,'supabase/config.toml')),'staged_config');
 return true;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [repo,version,dir]=process.argv.slice(2);assert.ok(repo && version);console.log(dir?verifyStorageWorkdir(repo,version,dir):prepareStorageWorkdir(repo,version));
}
