import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,lstatSync,realpathSync,openSync,writeSync,fsyncSync,closeSync,existsSync} from 'node:fs';
import {dirname,join,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {validateSuccessorPayload} from './prepare-storage-successor-hosted-workdir.mjs';
import {STORAGE_RELEASES} from './lib/storage-successor-release-contract.mjs';
import {normalizeCatalogForProduction} from './lib/forge-catalog-production-normalization.mjs';
import {sha256,validateRestorationApproval,validateHistoricalObservation} from './lib/storage-authentic-certification.mjs';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const base=join(repo,'.git','forge-private-evidence','storage-authentic-certification');
const regular=p=>{const s=lstatSync(p);assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1,'regular_private_file_required');return p;};
function privatePath(p){
 const full=resolve(p);assert.ok(full.startsWith(base+sep),'private_evidence_path_required');
 for(let d=dirname(full);d!==repo;d=dirname(d))assert.ok(!lstatSync(d).isSymbolicLink(),'private_path_link');
 assert.equal(realpathSync(dirname(full)),dirname(full),'private_path_alias');return full;
}
export function validateRestorationConnection(text,target){
 const u=new URL(text.trim());
 assert.equal(u.protocol,'postgresql:');assert.equal(u.password,'','credential_in_file_forbidden');
 assert.equal(u.search,'');assert.equal(u.hash,'');assert.equal(u.pathname,'/postgres');
 assert.ok(['5432','6543',''].includes(u.port),'connection_port');
 const direct=u.hostname===`db.${target}.supabase.co`&&u.username==='postgres';
 const pooler=/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(u.hostname)&&u.username===`postgres.${target}`;
 assert.ok(direct||pooler,'connection_target_mismatch');
 return text.trim();
}
function durable(file,value){
 const fd=openSync(privatePath(file),'wx',0o600);
 try{writeSync(fd,JSON.stringify(value,null,2)+'\n');fsyncSync(fd);}finally{closeSync(fd);}
}
export function validatePackage(workdir,a,payload){
 workdir=privatePath(join(resolve(workdir),'package.json'));
 const dir=dirname(workdir);regular(workdir);
 const pkg=JSON.parse(readFileSync(workdir));
 assert.equal(pkg.targetProject,a.targetProject);assert.equal(pkg.candidate,a.candidate);
 assert.ok([445,446].includes(pkg.through));
 const names=payload.names.slice(0,pkg.through);
 for(const part of ['supabase','supabase/migrations','supabase/templates','supabase/.temp'])assert.ok(lstatSync(join(dir,part)).isDirectory()&&!lstatSync(join(dir,part)).isSymbolicLink(),'package_directory_link');
 assert.deepEqual(readdirSync(join(dir,'supabase/migrations')).sort(),names.map(p=>p.split('/').at(-1)),'staged_prefix');
 for(const path of [...names,'supabase/config.toml','supabase/templates/password_changed_notification.html'])assert.deepEqual(readFileSync(regular(join(dir,path))),payload.files.get(path),'pinned_package_bytes');
 assert.equal(readFileSync(regular(join(dir,'supabase/.temp/project-ref')),'utf8').trim(),a.targetProject);
 validateRestorationConnection(readFileSync(regular(join(dir,'supabase/.temp/pooler-url')),'utf8'),a.targetProject);
 return pkg;
}
function catalogFromRows(rows){
 const seen=new Set();
 const entries=rows.map(row=>{
  const key=`${row.category}|${row.identity}`;assert.ok(!seen.has(key),'duplicate_catalog_key');seen.add(key);
  return {category:row.category,identity:row.identity,sha256:sha256(row.canonical)};
 }).sort((a,b)=>{const x=`${a.category}|${a.identity}`,y=`${b.category}|${b.identity}`;return x<y?-1:x>y?1:0;});
 return {schema:'forge.canonical-baseline-application-catalog-fingerprint.v1',objectCount:entries.length,entries,contractSha256:sha256(entries.map(e=>`${e.category}|${e.identity}|${e.sha256}`).join('\n'))};
}
export async function runUpgrade({approval,versions,observe,apply,persist,checkApproval}){
 checkApproval();const initial=await observe();validateHistoricalObservation(approval,initial,versions,444);
 persist('predecessor.json',initial);
 for(const r of STORAGE_RELEASES){
  checkApproval();const before=await observe();validateHistoricalObservation(approval,before,versions,r.number-1);
  // Persist before invoking an external process. Neither this loop nor a later
  // invocation retries an attempted stage after any error or lost response.
  persist(`attempt-${r.number}.json`,{stage:r.number,targetProject:approval.targetProject,candidate:approval.candidate});
  await apply(r);
  checkApproval();const after=await observe();validateHistoricalObservation(approval,after,versions,r.number);
  persist(`verified-${r.number}.json`,after);
 }
 return {status:'UPGRADE_VERIFIED',authenticCertification:'PENDING_BEHAVIOR_PARITY_AND_CLEANUP'};
}
function parse(argv){
 const allowed=new Set(['action','approval','approval-sha256','workdir','connection-file','target']);const a={};
 for(let i=0;i<argv.length;i+=2){assert.ok(argv[i]?.startsWith('--')&&allowed.has(argv[i].slice(2))&&argv[i+1]&&!argv[i+1].startsWith('--'),'invalid_argument');assert.ok(!Object.hasOwn(a,argv[i].slice(2)),'duplicate_argument');a[argv[i].slice(2)]=argv[i+1];}
 assert.ok(['Prepare','Validate','Preflight','Upgrade','PostVerify'].includes(a.action),'action_required');return a;
}
async function main(){
 const args=parse(process.argv.slice(2));
 const approvalBytes=readFileSync(regular(privatePath(args.approval)));
 const checkApproval=()=>validateRestorationApproval(approvalBytes,args['approval-sha256']);
 const a=checkApproval();
 assert.equal(execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),a.candidate,'approved_candidate_changed');
 execFileSync('git',['-C',repo,'diff','--exit-code','HEAD','--','scripts','supabase/tests'],{stdio:'pipe'});
 const payload=validateSuccessorPayload(repo),versions=payload.names.map(p=>p.split('/').at(-1).split('_')[0]);
 const dir=resolve(args.workdir);
 if(args.action==='Prepare'){
  privatePath(dir);assert.ok(!existsSync(dir),'new_private_package_required');
  mkdirSync(dir,{mode:0o700});
  if(process.platform==='win32'){
   const sid=execFileSync('whoami',['/user','/fo','csv','/nh'],{encoding:'utf8'}).match(/S-1-5-[0-9-]+/)?.[0];assert.ok(sid,'local_owner_sid');
   execFileSync('icacls',[dir,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F'],{stdio:'pipe'});
  }
  for(const part of ['supabase/migrations','supabase/templates','supabase/.temp'])mkdirSync(join(dir,part),{recursive:true,mode:0o700});
  for(const path of [...payload.names.slice(0,445),'supabase/config.toml','supabase/templates/password_changed_notification.html'])writeFileSync(join(dir,path),payload.files.get(path),{flag:'wx',mode:0o600});
  const connection=validateRestorationConnection(readFileSync(regular(privatePath(args['connection-file'])),'utf8'),a.targetProject);
  writeFileSync(join(dir,'supabase/.temp/project-ref'),a.targetProject,{flag:'wx',mode:0o600});
  writeFileSync(join(dir,'supabase/.temp/pooler-url'),connection,{flag:'wx',mode:0o600});
  durable(join(dir,'package.json'),{targetProject:a.targetProject,candidate:a.candidate,through:445});
 }
 validatePackage(dir,a,payload);if(args.target)assert.equal(args.target,a.targetProject);
 // Independently approved source observation must agree with the restoration.
 const sourceBytes=readFileSync(regular(privatePath(join(dirname(args.approval),'source-observation.json'))));
 assert.equal(sha256(sourceBytes),a.sourceObservationSha256,'source_observation_changed');
 validateHistoricalObservation(a,JSON.parse(sourceBytes),versions,444);
 if(['Prepare','Validate'].includes(args.action)){console.log(JSON.stringify({ok:true,action:args.action,targetProject:a.targetProject,connected:false}));return;}
 const adapter=action=>{
  checkApproval();validatePackage(dir,a,payload);
  try{return JSON.parse(execFileSync('pwsh',['-NoProfile','-File',join(repo,'scripts/storage-authentic-db-adapter.ps1'),'-Lineage','historical','-Action',action,'-TargetProject',a.targetProject,'-Workdir',dir,'-ApprovalPath',resolve(args.approval),'-ApprovalSha256',args['approval-sha256']],{encoding:'utf8',maxBuffer:64*1024*1024,timeout:180000}));}
  catch{throw Error('restoration_adapter_failed: inspect private state; do not replay an attempted migration');}
 };
 const observe=()=>adapter('Observe');
 if(args.action==='Preflight'){
  validateHistoricalObservation(a,observe(),versions,444);console.log(JSON.stringify({status:'PREFLIGHT_PASS',targetProject:a.targetProject,certified:false}));return;
 }
 if(args.action==='Upgrade'){
  assert.ok(!existsSync(join(dir,'attempt-445.json'))&&!existsSync(join(dir,'attempt-446.json')),'attempt_already_exists_use_PostVerify');
  const result=await runUpgrade({approval:a,versions,observe,checkApproval,
   persist:(name,value)=>durable(join(dir,name),{...value,approvalSha256:args['approval-sha256']}),
   apply:r=>{
    if(r.number===446){
     writeFileSync(join(dir,'supabase/migrations',r.filename),payload.files.get(`supabase/migrations/${r.filename}`),{flag:'wx',mode:0o600});
     // Only advance the migration-only package after verified 445. Never touch
     // hosted migration history or rewrite migration SQL.
     writeFileSync(join(dir,'package.json'),JSON.stringify({targetProject:a.targetProject,candidate:a.candidate,through:446}),{mode:0o600});
    }
    adapter(`Apply${r.number}`);
   }});
  durable(join(dir,'upgrade-result.json'),result);
 }
 const state=observe();const count=state.versions.length;
 validateHistoricalObservation(a,state,versions,count);
 const result={status:'POSTVERIFY',count,targetProject:a.targetProject,certified:false};
 if(count===446){
  const catalog=catalogFromRows(adapter('Catalog'));
  const compatibility=JSON.parse(readFileSync(join(repo,'docs/database/baseline/v1-gate3/wrappers-extension-compatibility.json')));
  const normalized=normalizeCatalogForProduction(catalog,compatibility).catalog;
  assert.equal(normalized.contractSha256,a.baselineCatalogSha256,'historical_baseline_catalog_mismatch');
  durable(join(dir,`catalog-${Date.now()}.json`),normalized);result.catalogParity='PASS';
 }
 durable(join(dir,`postverify-${Date.now()}.json`),{...result,state});
 result.remaining=['authentic-behavior-checks','reviewed-cleanup-receipt','B1-disposition','global-fence-acceptance'];
 console.log(JSON.stringify(result));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
