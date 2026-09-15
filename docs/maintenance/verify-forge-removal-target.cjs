// Verifies only the user-approved exact targets; never deletes files.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const ROOT='D:/nursery/nursery',P=ROOT+'/.git/forge-consolidation-private';
const manifest=JSON.parse(fs.readFileSync(P+'/removal-manifest.json','utf8'));
const numbers=[...Array.from({length:12},(_,i)=>i+6),19,20,22,24,25,26,28,...Array.from({length:10},(_,i)=>i+32),...Array.from({length:9},(_,i)=>i+51),62,...Array.from({length:16},(_,i)=>i+64)];
const allowed=new Set(numbers.map(n=>'T'+String(n).padStart(3,'0')));
const norm=p=>path.resolve(p).replaceAll('\\','/').replace(/\/$/,'').toLowerCase();
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const blob=b=>crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
const git=(args,cwd=ROOT)=>cp.execFileSync('git',args,{cwd,encoding:'utf8',maxBuffer:128e6,stdio:['pipe','pipe','pipe'],env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}});
const publicDoc=fs.readFileSync(ROOT+'/docs/maintenance/FORGE_EXACT_PATH_REMOVAL_REVIEW.md','utf8');
function target(id){
 if(!allowed.has(id))throw Error('ID is not authorized');
 const t=manifest.targets.find(t=>t.id===id);if(!t||t.status!=='PRESERVED_CANDIDATE_PENDING_APPROVAL')throw Error('Manifest target is not approved candidate');
 const section=publicDoc.split('## '+id+' — ')[1]?.split('\n## ')[0];
 if(!section||section.match(/- Exact path: `([^`]+)`/)?.[1]!==t.path)throw Error('Public/protected path mismatch');
 if(norm(t.path)===norm(ROOT)||norm(t.path).startsWith(norm(ROOT)+'/')&&id!=='T079')throw Error('Canonical root protection');
 if(id==='T079'&&t.path!=='D:/nursery/nursery/%SystemDrive%')throw Error('Literal cache path mismatch');
 return t;
}
function refs(t){const current=new Map(git(['for-each-ref','--format=%(refname) %(objectname)','refs/heads/codex/preserve/']).trim().split(/\r?\n/).map(s=>s.split(' ')));for(const r of t.refs||[])if(current.get(r.ref)!==r.commit)throw Error('Preservation ref moved/missing');}
const id=process.argv[2];
if(id==='init'){
 const targets=[...allowed].map(target);if(targets.length!==55)throw Error('Approval count mismatch');
 const refState=git(['for-each-ref','--format=%(refname) %(objectname)','refs/heads/codex/preserve/']);
 const configPaths=cp.execFileSync('rg',['--files','--hidden','--no-ignore','-g','!node_modules','-g','!.git','-g','!.tmp','-g','!.pnpm-store','-g','!dist','-g','!public','-g','!assets','-g','!test-results','-g','!docs',ROOT],{encoding:'utf8',maxBuffer:32e6}).split(/\r?\n/).filter(p=>/(?:package\.json|\.code-workspace|\.toml|\.ya?ml|\.config\.[cm]?[jt]s|(?:scripts[\\/].*\.(?:ps1|mjs|cmd|bat|sh))|[\\/]\.vscode[\\/].*\.json)$/i.test(p));
 configPaths.push(ROOT+'/.git/config','C:/Users/Iam11/.codex/config.toml','C:/Users/Iam11/.codex/.codex-global-state.json');
 const configReferences=[];
 for(const p of [...new Set(configPaths)])if(fs.existsSync(p)&&fs.statSync(p).size<8e6){const s=fs.readFileSync(p,'utf8').replaceAll('\\\\','/').replaceAll('\\','/').toLowerCase();for(const t of targets)if(s.includes(t.path.toLowerCase()))configReferences.push({target:t.id,configuration:p});}
 const before={checkedAt:new Date().toISOString(),head:git(['rev-parse','HEAD']).trim(),branch:git(['branch','--show-current']).trim(),indexSha256:hash(fs.readFileSync(ROOT+'/.git/index')),navSha256:hash(fs.readFileSync(ROOT+'/apps/nursery/public/forge-nav.json')),preservationRefs:refState,targets:targets.map(t=>({id:t.id,path:t.path,type:t.type,resolved:t.resolved})),held:manifest.targets.filter(t=>t.status==='HOLD').map(t=>({id:t.id,path:t.path,exists:fs.existsSync(t.path)})),configReferences};
 fs.writeFileSync(P+'/removal-batch-before.json',JSON.stringify(before,null,2));console.log(JSON.stringify({approvedTargets:55,held:before.held.length,configReferences}));process.exit(0);
}
let t,out={id,checkedAt:new Date().toISOString(),ok:false,files:[],reason:null};
try{
 t=target(id);out.path=t.path;out.type=t.type;
 if(!fs.existsSync(t.path))throw Error('Target absent at recheck');
 let a=path.resolve(t.path);while(a!==path.dirname(a)){if(fs.lstatSync(a).isSymbolicLink())throw Error('Reparse ancestor/root');a=path.dirname(a);}
 if(norm(fs.realpathSync.native(t.path))!==norm(t.resolved)||norm(t.path)!==norm(t.resolved))throw Error('Resolved path changed');
 const prior=JSON.parse(fs.readFileSync(P+'/removal-batch-before.json'));const blockers=prior.configReferences.filter(r=>r.target===id);if(blockers.length)throw Error('Surviving configuration references target: '+blockers.map(r=>r.configuration).join(', '));
 refs(t);
 for(const f of t.files){if(f.classification.startsWith('hold_'))throw Error('Unresolved file in approved target');if(f.destination){if(!norm(f.destination).startsWith(norm(P)+'/retained/'))throw Error('Unexpected evidence destination');if(hash(fs.readFileSync(f.destination))!==f.sha256)throw Error('Retained evidence mismatch: '+f.path);}}
 const blobIds=[...new Set(t.files.filter(f=>f.blob).map(f=>f.blob))];
 if(blobIds.length){const checked=cp.execFileSync('git',['cat-file','--batch-check'],{cwd:ROOT,input:blobIds.join('\n')+'\n',encoding:'utf8',maxBuffer:16e6}).trim().split(/\r?\n/);if(checked.length!==blobIds.length||checked.some(line=>!/^\w{40} blob \d+$/.test(line)))throw Error('Preserved Git blob missing');}
 const files=new Map(t.files.map(f=>[f.path,f])),seen=new Set(),allFiles=[],entries=[],filterChecks=[];let itemCount=0;
 function visit(abs,rel){const st=fs.lstatSync(abs);if(st.isSymbolicLink())throw Error('Unexpected junction/symlink: '+rel);itemCount++;
  entries.push({path:abs,size:st.size,mtimeMs:st.mtimeMs,directory:st.isDirectory()});
  if(st.isDirectory()){
   if(rel==='.git'&&t.type==='independent_clone')return;
   for(const e of fs.readdirSync(abs))visit(path.join(abs,e),rel?rel+'/'+e:e);return;
  }
  if(rel==='.git'&&t.type==='linked_worktree'){allFiles.push(abs);return;}
  allFiles.push(abs);const f=files.get(rel);if(!f){if(t.rebuildable.some(d=>rel===d||rel.startsWith(d+'/')))return;throw Error('Unpreserved/new item: '+rel);}
  const b=fs.readFileSync(abs);if(f.sha256){if(hash(b)!==f.sha256)throw Error('Changed content: '+rel);}else if(f.blob){
   if(blob(b)!==f.blob&&blob(Buffer.from(b.toString('utf8').replace(/\r\n/g,'\n')))!==f.blob){
    filterChecks.push({rel,abs,blob:f.blob});
   }
  }else throw Error('No verifiable preservation: '+rel);
  seen.add(rel);
 }
 visit(t.path,t.type==='loose_evidence_file'?path.basename(t.path):'');
 if(filterChecks.length){
  const cwd=['linked_worktree','independent_clone'].includes(t.type)?t.path:ROOT;
  const attrs=cp.execFileSync('git',['check-attr','--stdin','filter'],{cwd,input:filterChecks.map(f=>f.abs).join('\n')+'\n',encoding:'utf8'}).trim().split(/\r?\n/);
  if(attrs.length!==filterChecks.length||attrs.some(a=>!a.endsWith(': unspecified')))throw Error('Unreviewed external content filter');
  const hashes=cp.execFileSync('git',['hash-object','--stdin-paths'],{cwd,input:filterChecks.map(f=>f.abs).join('\n')+'\n',encoding:'utf8'}).trim().split(/\r?\n/);
  if(hashes.length!==filterChecks.length)throw Error('Git clean-filter result count mismatch');
  filterChecks.forEach((f,i)=>{if(hashes[i]!==f.blob)throw Error('Changed Git content: '+f.rel);});
 }
 if(t.files.length===0&&itemCount!==1)throw Error('Empty-disposition target is not actually empty');
 for(const f of t.files)if(!seen.has(f.path))throw Error('Recorded file missing: '+f.path);
 if(t.type==='linked_worktree'){
  const common=git(['rev-parse','--path-format=absolute','--git-common-dir'],t.path).trim();if(norm(common)!==norm(ROOT+'/.git'))throw Error('Git common directory mismatch');
  const saved=JSON.parse(fs.readFileSync(P+'/history.json')).worktrees.find(w=>w.source===t.path);if(git(['rev-parse','HEAD'],t.path).trim()!==saved.commit)throw Error('Worktree HEAD changed');
  out.gitStatus=git(['status','--porcelain=v1','--untracked-files=all'],t.path);
 }
 if(t.type==='independent_clone'){
  if(git(['status','--porcelain=v1','--untracked-files=all'],t.path).trim())throw Error('Independent clone has changes');
  if(git(['rev-list','--reflog','--not','--all'],t.path).trim())throw Error('Independent clone has unpreserved reflog history');
  const cfg=git(['config','--local','--name-only','--list'],t.path).trim().split(/\r?\n/);if(cfg.some(k=>!/^core\.(repositoryformatversion|filemode|bare|logallrefupdates|symlinks|ignorecase)$|^remote\.origin\.(url|fetch)$|^branch\..*\.(remote|merge)$/.test(k)))throw Error('Unreviewed clone Git configuration');
  if(git(['remote','get-url','origin'],t.path)!==git(['remote','get-url','origin']))throw Error('Clone remote differs');
  const objects=new Set(git(['cat-file','--batch-all-objects','--batch-check=%(objectname)']).trim().split(/\r?\n/));if(git(['cat-file','--batch-all-objects','--batch-check=%(objectname)'],t.path).trim().split(/\r?\n/).some(o=>!objects.has(o)))throw Error('Unpreserved clone Git objects');
 }
 out.ok=true;out.files=allFiles;out.entries=entries;out.verifiedFiles=seen.size;out.refCount=t.refs.length;
}catch(e){out.reason=e.message;}
fs.writeFileSync(P+'/removal-check-'+id+'.json',JSON.stringify(out,null,2));console.log(JSON.stringify({id:out.id,path:out.path,ok:out.ok,reason:out.reason,verifiedFiles:out.verifiedFiles}));
