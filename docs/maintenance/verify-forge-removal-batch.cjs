// Post-removal audit: reads source/configuration, writes only the protected audit result.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root='D:/nursery/nursery',priv=root+'/.git/forge-consolidation-private';
const read=n=>JSON.parse(fs.readFileSync(priv+'/'+n,'utf8'));
const before=read('removal-batch-before.json'),manifest=read('removal-manifest.json');
const journal=read('removal-batch-journal.json'),latest=new Map(journal.map(r=>[r.id,r]));
const git=args=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:128e6,env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}});
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const outcomes=before.targets.map(t=>({...t,...latest.get(t.id),exists:fs.existsSync(t.path)}));
const removed=outcomes.filter(t=>t.status==='removed');
if(removed.some(t=>t.exists))throw Error('A removed target exists again');
if(outcomes.some(t=>!t.exists&&t.status!=='removed'))throw Error('An unrecorded target disappeared');
const held=before.held.map(t=>({...t,existsAfter:fs.existsSync(t.path)}));
if(held.some(t=>t.exists!==t.existsAfter))throw Error('Held target existence changed');
const head=git(['rev-parse','HEAD']).trim(),branch=git(['branch','--show-current']).trim();
const indexUnchanged=hash(root+'/.git/index')===before.indexSha256;
const navUnchanged=hash(root+'/apps/nursery/public/forge-nav.json')===before.navSha256;
const refsUnchanged=git(['for-each-ref','--format=%(refname) %(objectname)','refs/heads/codex/preserve/'])===before.preservationRefs;
if(head!==before.head||branch!==before.branch||!indexUnchanged||!navUnchanged||!refsUnchanged)throw Error('Canonical/preservation state changed');
const privateConfiguration=read('handoff-prestate.json').privateConfiguration.map(f=>({path:f.path,unchanged:hash(root+'/'+f.path)===f.sha256}));
if(privateConfiguration.some(f=>!f.unchanged))throw Error('Canonical private configuration changed');
const retained=new Map(manifest.targets.flatMap(t=>t.files.filter(f=>f.destination).map(f=>[f.destination,f.sha256])));
let bytes=0;for(const [p,sha]of retained){if(hash(p)!==sha)throw Error('Retained evidence mismatch');bytes+=fs.statSync(p).size;}
const allBlobs=[...new Set(manifest.targets.flatMap(t=>t.files.filter(f=>f.blob).map(f=>f.blob)))];
const blobs=cp.execFileSync('git',['cat-file','--batch-check'],{cwd:root,input:allBlobs.join('\n')+'\n',encoding:'utf8',maxBuffer:32e6}).trim().split(/\r?\n/);
if(blobs.length!==allBlobs.length||blobs.some(s=>!/^\w{40} blob \d+$/.test(s)))throw Error('Preserved content object missing');
const sourceTypes=new Set(['linked_worktree','independent_clone','non_git_source']);
const remainingSources=[{id:'canonical',path:root,type:'canonical'},...manifest.targets.filter(t=>sourceTypes.has(t.type)&&fs.existsSync(t.path)).map(t=>({id:t.id,path:t.path,type:t.type,status:t.status==='HOLD'?'HOLD':latest.get(t.id)?.status}))];
const worktrees=git(['worktree','list','--porcelain']).split(/\r?\n\r?\n/).filter(Boolean).map(s=>Object.fromEntries(s.trim().split(/\r?\n/).map(l=>{let i=l.indexOf(' ');return i<0?[l,true]:[l.slice(0,i),l.slice(i+1)];})));
if(worktrees.some(w=>removed.some(t=>t.path.toLowerCase()===w.worktree.toLowerCase())))throw Error('Removed worktree remains registered');
const excluded=new Set(['.git','node_modules','.pnpm-store','.tmp','dist','public','assets','test-results','docs','.cache']);
const configs=new Set(),linksNotFollowed=[],scanErrors=[];
function scan(dir){
 let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch(e){scanErrors.push({path:dir,code:e.code});return;}
 for(const entry of entries){const p=path.join(dir,entry.name);if(entry.isSymbolicLink()){linksNotFollowed.push(p);continue;}
  if(entry.isDirectory()){if(!excluded.has(entry.name))scan(p);}
  else if(/(?:(?:package|tsconfig[^\\/]*|turbo|lerna)\.json|\.code-workspace|\.toml|\.ya?ml|\.config\.[cm]?[jt]s|(?:scripts[\\/].*\.(?:ps1|mjs|cmd|bat|sh))|[\\/]\.(?:vscode|netlify)[\\/].*\.json|[\\/]\.env(?:\.[^\\/]*)?)$/i.test(p))configs.add(p);
 }
}
for(const s of remainingSources)scan(s.path);
for(const p of [root+'/.git/config','C:/Users/Iam11/.codex/config.toml','C:/Users/Iam11/.codex/.codex-global-state.json'])configs.add(p);
const staleConfiguration=[];
for(const p of configs)if(fs.existsSync(p)&&fs.statSync(p).size<8e6){let s=fs.readFileSync(p,'utf8').replaceAll('\\\\','/').replaceAll('\\','/').toLowerCase();for(const t of removed)if(s.includes(t.path.toLowerCase()))staleConfiguration.push({configuration:p,target:t.id});}
const result={checkedAt:new Date().toISOString(),head,branch,indexUnchanged,navUnchanged,refsUnchanged,preservationRefs:before.preservationRefs.trim().split('\n').length,privateConfiguration,retainedEvidence:{files:retained.size,bytes},gitContentObjects:allBlobs.length,removed:removed.length,skipped:outcomes.length-removed.length,outcomes,held,remainingSources,worktrees,configurationScan:{files:configs.size,staleConfiguration,linksNotFollowed:linksNotFollowed.length,scanErrors},privateStoreAbsentFromIndex:!git(['ls-files','--','.git/forge-consolidation-private']).trim()};
fs.writeFileSync(priv+'/removal-batch-after.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,outcomes:outcomes.map(t=>({id:t.id,path:t.path,status:t.status,reason:t.reason})),worktrees:worktrees.length,held:held.length},null,2));
