// Exact-path preservation manifest generator. Does not delete or alter sources.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const ROOT='D:/nursery/nursery',P=ROOT+'/.git/forge-consolidation-private';
const R='C:/Users/Iam11/Documents/Codex/2026-09-12/next-bounded-owner-funded-hearth-research';
const T='C:/Users/Iam11/AppData/Local/Temp';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const gitBlob=b=>crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
const run=(a,cwd=ROOT)=>cp.execFileSync('git',a,{cwd,encoding:'utf8',maxBuffer:128e6,stdio:['pipe','pipe','pipe'],env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}});
const load=n=>JSON.parse(fs.readFileSync(P+'/'+n+'.json','utf8'));
const history=load('history'),deltas=load('deltas'),snapshots=load('snapshots');
const known=new Set(run(['rev-list','--objects','--all']).split('\n').map(x=>x.split(' ')[0]));
const targets=history.worktrees.filter(x=>x.source!==ROOT).map(x=>({path:x.source,type:'linked_worktree',refs:[{ref:x.ref,commit:x.commit}],index:x.index}));
for(const c of history.clones)targets.push({path:c.source,type:'independent_clone',refs:c.refs.map(x=>({ref:x.ref,commit:x.commit}))});
for(const s of ['forge-linux-build','netlify-release-57e06d62','nursery-clean-reference-review-control','nursery-deploy-ebede181','nursery-hammer-shell','nursery-openai-verify','verify-99a4a117'])targets.push({path:'D:/nursery/'+s,type:'non_git_source',refs:[]});
for(const s of ['C:/Users/Iam11/.codex/worktrees/recovery-route/nursery','C:/Users/Iam11/.codex/worktrees/he8-closeout-4d5abf0d',R+'/base',R+'/work',T+'/hearth-inactive-release-9a23dc9828664ef9bd4780919bf6043c',T+'/hearth-git-tree-tests-377e46e45ee54d8ba3d7b7d071f3dc57',T+'/forge-pr54-guarded-fb015cc46c4b4b53beba2de2576d044c/candidate'])targets.push({path:s,type:'non_git_source',refs:[]});
for(const s of ['cp10-florida-acceptance-20260819','cp10-retest-20260819-1128','cp11-history-diagnosis-20260819','cp8-florida-dry-run-20260819-0530','he5-florida-dry-run-20260820','he6-florida-production-transition-20260820','he7-florida-reopen-20260820','he7-retest-20260820','he7-retest-20260821','he7a-canonical-base-diagnosis-20260820','he8a-offline-20260821','supabase-production-migration-deploy','supabase-seven-adapter-isolated'])targets.push({path:'D:/nursery/'+s,type:'evidence_directory',refs:[]});
for(const s of ['D:/nursery/nursery-cp4-baseline-5f56b641','D:/nursery/nursery-recovery-deploy','C:/Users/Iam11/.codex/worktrees/recovery-polish'])targets.push({path:s,type:'metadata_remnant',refs:[]});
targets.push({path:T+'/forge-pr54-guarded-fb015cc46c4b4b53beba2de2576d044c',type:'release_evidence_parent',refs:[]});
for(const s of ['forge-codex-broll-playback','forge-codex-broll-runtime','forge-codex-runway-boundary','forge-codex-runway-prompt','forge-hearth-trace-d6dcddb4-66bc-4f18-aa93-1bf55cd116bc','forge-trace-cfa7de4ac9384776ace96fed2225149a','hearth-auth-trace-63f587e9-7d0b-48eb-a82d-a2f07ee00a19','hearth-p5-trace-2c973546-7562-4f91-99de-c1e632f6c64f'])if(fs.existsSync(T+'/'+s))targets.push({path:T+'/'+s,type:'private_trace_directory',refs:[]});
for(const n of fs.readdirSync('D:/nursery'))if(/^(?:cp11-|he8-hit-test).+\.(?:mjs|json)$/.test(n))targets.push({path:'D:/nursery/'+n,type:'loose_evidence_file',refs:[]});
targets.push({path:ROOT+'/%SystemDrive%',type:'accidental_cache_directory',refs:[]});
const roots=new Set(targets.map(x=>x.path.toLowerCase()));
const previous=fs.existsSync(P+'/removal-manifest.partial.json')?JSON.parse(fs.readFileSync(P+'/removal-manifest.partial.json','utf8')).targets:[];
const privateHashes=new Set();let copied=0,bytesCopied=0;
function preservePrivate(file,bytes) {
  const h=hash(bytes),dest=P+'/retained/'+h.slice(0,2)+'/'+h;
  if(!fs.existsSync(dest)){fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes,{flag:'wx'});copied++;bytesCopied+=bytes.length;}
  if(hash(fs.readFileSync(dest))!==h||hash(fs.readFileSync(file))!==h)throw new Error('Private capture verification failed');
  privateHashes.add(h);return {destination:dest,sha256:h};
}
for(let i=0;i<targets.length;i++) {
  const prior=previous.find(x=>x.path===targets[i].path&&x.status&&x.counts);
  if(prior){targets[i]=prior;for(const f of prior.files)if(f.destination)privateHashes.add(f.sha256);continue;}
  const t=targets[i];t.id='T'+String(i+1).padStart(3,'0');t.checkedAt=new Date().toISOString();t.files=[];t.holds=[];t.nested=[];t.rebuildable=[];t.dependencies=[];
  if(!fs.existsSync(t.path)){t.holds.push('Target absent at recheck');continue;}
  t.resolved=fs.realpathSync.native(t.path).replaceAll('\\','/');
  for(const d of [...deltas,...snapshots].filter(x=>x.source===t.path))t.refs.push({ref:d.ref,commit:d.commit});
  if(t.path===R+'/release-worktree'){t.dependencies.push('Live port5199: Node149724/esbuild100072; task handoff before retirement');t.holds.push('Active server and task path; final shutdown approval required');}
  if(t.path===R)t.holds.push('Research task cwd and nested source roots; resolve children first');
  if(t.type==='metadata_remnant' && t.path.includes('cp4'))t.holds.push('Broken linked Git pointer; private metadata review required');
  if(t.type==='metadata_remnant' && t.path.includes('recovery-deploy'))t.holds.push('Incomplete Git metadata; object-ID coverage established but final metadata review required');
  const tracked=new Map();
  const changed=new Set();
  if(['linked_worktree','independent_clone'].includes(t.type)) {
    for(const line of run(['ls-files','--stage','-z'],t.path).split('\0').filter(Boolean)){const [meta,rel]=line.split('\t');tracked.set(rel,meta.split(' ')[1]);}
    for(const rel of run(['diff','--name-only','-z','HEAD'],t.path).split('\0').filter(Boolean))changed.add(rel);
  }
  function walk(abs,rel='') {
    const st=fs.lstatSync(abs);if(st.isSymbolicLink()){t.files.push({path:rel,classification:'hold_reparse_point'});return;}
    if(st.isDirectory()) {
      if(rel && roots.has(abs.replaceAll('\\','/').toLowerCase())){t.nested.push(abs);return;}
      const leaf=path.basename(abs);
      if(rel && leaf==='.git')return;
      if(rel && ['node_modules','.pnpm-store','dist','build','coverage','.vite','playwright-report','test-results'].includes(leaf)){t.rebuildable.push(rel);return;}
      for(const entry of fs.readdirSync(abs))walk(path.join(abs,entry),rel?rel+'/'+entry:entry);
      return;
    }
    if(rel==='.git')return;
    if(tracked.has(rel)&&!changed.has(rel)){
      t.files.push({path:rel,blob:tracked.get(rel),classification:'git_tracked_clean'});return;
    }
    if(/\.(?:zip|7z|rar|tar|gz|tgz)$/i.test(rel)){t.files.push({path:rel,bytes:st.size,classification:'hold_uninspected_archive'});return;}
    if(st.size>32*1024*1024){t.files.push({path:rel,bytes:st.size,classification:'hold_large_file'});return;}
    const b=fs.readFileSync(abs),secretName=/(?:^|\/)\.env(?:\.|$)|credentials|storage.?state|auth.*\.json$|\.pem$|\.key$/i.test(rel);
    const blob=gitBlob(b);
    if(!secretName && known.has(blob)){t.files.push({path:rel,blob,sha256:hash(b),classification:'git_exact_content'});return;}
    if(!secretName && /\.(?:tsx?|jsx?|mjs|cjs|md|sql|json|ya?ml|css|html|txt|ps1|sh)$/.test(rel)) {
      const normalized=Buffer.from(b.toString('utf8').replace(/\r\n/g,'\n')),normalBlob=gitBlob(normalized);
      if(known.has(normalBlob)){t.files.push({path:rel,sha256:hash(b),blob:normalBlob,classification:'git_content_crlf_equivalent'});return;}
    }
    // Tracked deleted files are represented by the captured delta tree. Other
    // source-like unknowns remain review holds, not full-source private copies.
    if(!secretName && /\.(?:tsx?|jsx?|mjs|cjs|css|html)$/.test(rel) && !/(?:^|\/)(?:\.tmp|\.codex-temp|scripts)(?:\/|$)/.test(rel) && !['evidence_directory','private_trace_directory','loose_evidence_file','release_evidence_parent'].includes(t.type)) {
      t.files.push({path:rel,sha256:hash(b),classification:'hold_unmatched_source'});return;
    }
    const retained=preservePrivate(abs,b);t.files.push({path:rel,bytes:b.length,classification:secretName?'private_configuration_preserved':'private_evidence_preserved',...retained});
  }
  try{walk(t.path,t.type==='loose_evidence_file'?path.basename(t.path):'');}catch(e){t.holds.push('Inventory exception: '+e.code);}
  const held=t.files.filter(x=>x.classification.startsWith('hold_'));if(held.length)t.holds.push(held.length+' unresolved file(s); exact paths in protected manifest');
  if(t.nested.length)t.holds.push('Nested targets must be resolved first');
  t.counts=t.files.reduce((a,f)=>(a[f.classification]=(a[f.classification]||0)+1,a),{});
  t.status=t.holds.length?'HOLD':'PRESERVED_CANDIDATE_PENDING_APPROVAL';
  t.method=t.type==='linked_worktree'?'git worktree remove exact path after approval; never force unresolved work':'Exact resolved-path removal after approval and final dependency check';
  t.recoverability='Git refs/blobs and verified private evidence listed here; rebuildable dependency/output directories excluded';
  fs.writeFileSync(P+'/removal-manifest.partial.json',JSON.stringify({targets:targets.slice(0,i+1)},null,2));
  console.log(JSON.stringify({id:t.id,path:t.path,status:t.status,counts:t.counts}));
}
for(const t of targets) {
  for(const f of t.files||[])if(/\.(?:zip|7z|rar|tar|gz|tgz)$/i.test(f.path)&&!f.classification.startsWith('hold_')){f.originalPreservation=f.classification;f.classification='hold_uninspected_archive';}
  const artifactDirs=(t.rebuildable||[]).filter(p=>/(?:^|\/)(?:test-results|playwright-report|coverage)$/.test(p));
  for(const p of artifactDirs)if(!t.holds.includes('Uninspected historical test artifacts: '+p))t.holds.push('Uninspected historical test artifacts: '+p);
  if((t.files||[]).some(f=>f.classification.startsWith('hold_'))&&!t.holds.some(h=>h.includes('unresolved file')))t.holds.push('Unresolved file(s); exact paths in protected manifest');
  t.counts=(t.files||[]).reduce((a,f)=>(a[f.classification]=(a[f.classification]||0)+1,a),{});
  t.status=t.holds.length?'HOLD':'PRESERVED_CANDIDATE_PENDING_APPROVAL';
}
const retained=new Map();for(const t of targets)for(const f of t.files||[])if(f.destination)retained.set(f.sha256,f.bytes);
const report={checkedAt:new Date().toISOString(),canonical:ROOT,removed:0,privateStore:P,targets,copiedPrivateFiles:copied,copiedPrivateBytes:bytesCopied,uniqueRetainedFiles:retained.size,uniqueRetainedBytes:[...retained.values()].reduce((a,b)=>a+b,0),limitations:['No inaccessible/cloud paths authorized','No archive extraction performed','Rebuildable output/dependency dirs excluded; recheck before deletion','Historical test output directories held until evidence reviewed','CIM does not prove all terminal cwd/open handles absent']};
fs.writeFileSync(P+'/removal-manifest.json',JSON.stringify(report,null,2)+'\n');
let md='# Exact-path Forge removal review\n\nGenerated '+report.checkedAt+'. **Nothing removed.** All entries require explicit approval and a final dependency/source recheck. HOLD entries are excluded from any removal approval until resolved.\n\nCanonical root: `'+ROOT+'`. Private evidence is ACL-restricted inside `.git/forge-consolidation-private`; full per-file paths and verification hashes are retained there, not committed. No existing environment file was overwritten.\n\n';
md+='History: '+history.worktrees.length+' worktree heads, '+history.reflogs.length+' reflog-only commits, '+history.stashes.length+' stashes, and '+history.clones.reduce((a,c)=>a+c.refs.length,0)+' clone refs anchored.\n\n';
for(const t of targets){md+='## '+t.id+' — '+t.status+'\n\n- Exact path: `'+t.path+'`\n- Resolved path: `'+(t.resolved||'unavailable')+'`\n- Type: '+t.type+'\n';
  if(t.refs.length<=4)for(const r of t.refs)md+='- Preservation: `'+r.ref+'` → `'+r.commit+'`\n';else md+='- Preservation: '+t.refs.length+' named refs; exact mapping in protected history/removal manifests.\n';
  md+='- File disposition: '+JSON.stringify(t.counts||{})+'\n- Private evidence: verified retained blobs indexed under this target ID in the protected manifest.\n- Dependencies: '+(t.dependencies.join('; ')||'None directly attributed by existing process audit; final handle/task recheck required')+'\n- Holds: '+(t.holds.join('; ')||'None from inspected files; approval and final recheck still required')+'\n- Nested targets: '+(t.nested.join('; ')||'none')+'\n- Method: '+(t.method||'unavailable')+'\n- Recoverability: '+(t.recoverability||'unverified')+'\n';
  for(const f of (t.files||[]).filter(f=>f.classification.startsWith('hold_')))md+='- Held relative path: `'+f.path+'` ('+f.classification+')\n';
  md+='\n';}
md+='## Exclusions\n\nCreator media on F:, Supabase containers/volumes, Docker Desktop, cloud/inaccessible locations, and uninspected archive contents are not removal targets. Ports5173 and5199 remain running. No full-source backup was created.\n';
fs.writeFileSync(ROOT+'/docs/maintenance/FORGE_EXACT_PATH_REMOVAL_REVIEW.md',md);
console.log(JSON.stringify({targets:targets.length,holds:targets.filter(t=>t.status==='HOLD').length,copiedPrivateFiles:copied,copiedPrivateBytes:bytesCopied,manifest:P+'/removal-manifest.json'}));
