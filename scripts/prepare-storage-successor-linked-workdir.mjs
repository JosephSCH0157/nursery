import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,copyFileSync,rmSync,readdirSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PAYLOAD,PROJECT,releaseFor,STORAGE_RELEASES} from './lib/storage-successor-release-contract.mjs';
import {validateSuccessorPayload} from './prepare-storage-successor-hosted-workdir.mjs';

// Local CLI material only; never connects or obtains credentials. Apply remains
// held in both fixed wrappers and policy. Offline preparation remains available
// separately without a connection descriptor.
function privateChild(repo,dir) {
 const base=realpathSync(join(repo,'.git/forge-private-evidence/storage-successor-linked-release'));
 assert.ok(!lstatSync(dir).isSymbolicLink(),'private_directory_link');
 const target=realpathSync(dir);
 assert.equal(dirname(target),base,'private_workdir_required');
 return target;
}

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

const TEMPLATE='supabase/templates/password_changed_notification.html';
function certifiedConfiguration(repo) {
 const paths=['supabase/config.toml',TEMPLATE];
 const files=payloadFiles(repo,paths);
 for(const path of paths){
  assert.ok(lstatSync(join(repo,path)).isFile(),'configuration_source_regular_file');
  const git=(...args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8'}).trim();
  const expected=git('rev-parse',`${PAYLOAD}:${path}`);
  assert.equal(git('rev-parse',`HEAD:${path}`),expected,'configuration_source_commit');
  // Respect the repository's checkout EOL filters, while staging exact Git blob bytes.
  assert.equal(git('hash-object',`--path=${path}`,join(repo,path)),expected,'configuration_source_bytes');
 }
 return files;
}
export function stageStorageTemplate(repo,dir) {
 const files=certifiedConfiguration(repo);
 mkdirSync(join(dir,'supabase/templates'),{mode:0o700});
 writeFileSync(join(dir,TEMPLATE),files.get(TEMPLATE),{mode:0o600});
 verifyStorageTemplate(repo,dir);
}
export function verifyStorageTemplate(repo,dir) {
 const files=certifiedConfiguration(repo);
 assert.ok(lstatSync(join(dir,'supabase/templates')).isDirectory() && !lstatSync(join(dir,'supabase/templates')).isSymbolicLink(),'template_directory');
 assert.deepEqual(readdirSync(join(dir,'supabase/templates')),['password_changed_notification.html'],'unexpected_template_dependency');
 assert.ok(lstatSync(join(dir,TEMPLATE)).isFile(),'template_regular_file');
 assert.deepEqual(readFileSync(join(dir,TEMPLATE)),files.get(TEMPLATE),'template_bytes');
 const config=readFileSync(join(dir,'supabase/config.toml'));
 assert.deepEqual(config,readFileSync(join(repo,'supabase/config.toml')),'staged_config');
 const dependencies=[...config.toString().matchAll(/^\s*content_path\s*=\s*"([^"]+)"/gm)].map(m=>m[1]);
 assert.deepEqual(dependencies,['./templates/password_changed_notification.html'],'unexpected_template_reference');
 return true;
}

export function prepareStorageWorkdir(repo,version) {
 const r=releaseFor(version); repo=resolve(repo);
 const git=(...args)=>execFileSync('git',['-C',repo,...args],{maxBuffer:32*1024*1024});
 git('merge-base','--is-ancestor',PAYLOAD,'HEAD');
 // Bounded migration materialization plus its exact configuration dependency; no runnable source checkout.
 const {names}=validateSuccessorPayload(repo);
 assert.equal(readFileSync(join(repo,'supabase/.temp/project-ref'),'utf8').trim(),PROJECT,'linked_project');
 for(const s of STORAGE_RELEASES)assert.equal(createHash('sha256').update(git('show',`${PAYLOAD}:supabase/migrations/${s.filename}`)).digest('hex'),s.sha256,'payload_hash');
 const base=join(repo,'.git/forge-private-evidence/storage-successor-linked-release');mkdirSync(base,{recursive:true,mode:0o700});
 const dir=mkdtempSync(join(base,`${r.number}-`));
 try {
  mkdirSync(join(dir,'supabase/migrations'),{recursive:true,mode:0o700});mkdirSync(join(dir,'supabase/.temp'),{mode:0o700});
  copyFileSync(join(repo,'supabase/config.toml'),join(dir,'supabase/config.toml'));
  stageStorageTemplate(repo,dir);
  // Existing linked connection descriptor only; never enroll/rotate a credential.
  for(const name of ['project-ref','pooler-url'])copyFileSync(join(repo,'supabase/.temp',name),join(dir,'supabase/.temp',name));
  const selected=names.filter(p=>p.split('/').at(-1).split('_')[0]<=r.version);
  assert.equal(selected.length,r.number,'prefix_count');
  for(const [p,bytes] of payloadFiles(repo,selected))writeFileSync(join(dir,p),bytes,{mode:0o600});
  writeFileSync(join(dir,'storage-release.json'),JSON.stringify({project:PROJECT,version:r.version,payload:PAYLOAD,files:selected}),{mode:0o600});
  verifyStorageWorkdir(repo,version,dir);
  return dir;
 }catch(e){rmSync(privateChild(repo,dir),{recursive:true,force:true});throw e;}
}
export function verifyStorageWorkdir(repo,version,dir) {
 const r=releaseFor(version);repo=resolve(repo);dir=resolve(dir);
 dir=privateChild(repo,dir);
 assert.deepEqual(readdirSync(dir).sort(),['storage-release.json','supabase'],'workdir_inventory');
 assert.deepEqual(readdirSync(join(dir,'supabase')).sort(),['.temp','config.toml','migrations','templates'],'supabase_inventory');
 for(const path of ['supabase','supabase/migrations','supabase/templates','supabase/.temp']) {
  assert.ok(lstatSync(join(dir,path)).isDirectory() && !lstatSync(join(dir,path)).isSymbolicLink(),'staged_directory');
 }
 assert.deepEqual(readdirSync(join(dir,'supabase/.temp')).sort(),['pooler-url','project-ref'],'connection_inventory');
 const git=(...a)=>execFileSync('git',['-C',repo,...a],{maxBuffer:32*1024*1024});
 const names=git('ls-tree','-r','--name-only',PAYLOAD,'--','supabase/migrations').toString().trim().split('\n').filter(p=>p.endsWith('.sql') && p.split('/').at(-1).split('_')[0]<=r.version).sort();
 assert.equal(names.length,r.number);
 assert.deepEqual(readdirSync(join(dir,'supabase/migrations')).sort(),names.map(p=>p.split('/').at(-1)).sort(),'staged_inventory');
 for(const [p,bytes] of payloadFiles(repo,names)) {
  assert.ok(lstatSync(join(dir,p)).isFile(),'staged_regular_file');
  assert.deepEqual(readFileSync(join(dir,p)),bytes,'staged_bytes');
 }
 assert.equal(readFileSync(join(dir,'supabase/.temp/project-ref'),'utf8').trim(),PROJECT);
 const pooler=new URL(readFileSync(join(dir,'supabase/.temp/pooler-url'),'utf8').trim());
 assert.ok(pooler.protocol==='postgresql:' && !pooler.password && !pooler.search && !pooler.hash && pooler.pathname==='/postgres' && ((pooler.username===`postgres.${PROJECT}` && pooler.hostname.endsWith('.pooler.supabase.com')) || (pooler.username==='postgres' && pooler.hostname===`db.${PROJECT}.supabase.co`)),'linked_connection_project');
 assert.deepEqual(JSON.parse(readFileSync(join(dir,'storage-release.json'),'utf8')),{project:PROJECT,version:r.version,payload:PAYLOAD,files:names},'release_manifest');
 assert.deepEqual(readFileSync(join(dir,'supabase/config.toml')),readFileSync(join(repo,'supabase/config.toml')),'staged_config');
 verifyStorageTemplate(repo,dir);
 return true;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [repo,version,dir]=process.argv.slice(2);assert.ok(repo && version);console.log(dir?verifyStorageWorkdir(repo,version,dir):prepareStorageWorkdir(repo,version));
}
