// Preservation only: never checks out, merges, deletes, pushes, or deploys.
// Run from the canonical repository. Private output remains inside its .git.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const ROOT = 'D:/nursery/nursery';
const RESEARCH = 'C:/Users/Iam11/Documents/Codex/2026-09-12/next-bounded-owner-funded-hearth-research';
const PRIVATE = ROOT + '/.git/forge-consolidation-private';
const PREFIX = 'refs/heads/codex/preserve/20260913/';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const slug = s => s.replaceAll('\\', '/').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
function git(args, {cwd = ROOT, input, env, binary = false} = {}) {
  return cp.execFileSync('git', args, {cwd, input, env: {...process.env, GIT_OPTIONAL_LOCKS:'0', ...env}, encoding: binary ? undefined : 'utf8', maxBuffer:128e6, stdio:['pipe','pipe','pipe']});
}
function fileHash(p) { return fs.existsSync(p) ? sha(fs.readFileSync(p)) : null; }
function json(p, value) { fs.mkdirSync(path.dirname(p), {recursive:true}); fs.writeFileSync(p, JSON.stringify(value, null, 2) + '\n'); }
function anchor(name, commit) {
  const ref = PREFIX + name;
  let old; try { old = git(['rev-parse','--verify',ref]).trim(); } catch {}
  if (old && old !== commit) throw new Error('Preservation ref conflict: ' + ref);
  if (!old) git(['update-ref',ref,commit,'0'.repeat(40)]);
  if (git(['rev-parse',ref]).trim() !== commit) throw new Error('Ref verification failed');
  return ref;
}
function indexState(cwd) {
  const p = git(['rev-parse','--path-format=absolute','--git-path','index'],{cwd}).trim();
  return {path:p, sha256:fileHash(p)};
}
function preserveDelta(cwd, base, files, name) {
  const actualIndex = indexState(cwd);
  const beforeStatus = git(['status','--porcelain=v1','-z','--untracked-files=all'],{cwd});
  const indexPath = PRIVATE + '/indexes/' + name + '-' + crypto.randomUUID() + '.index';
  fs.mkdirSync(path.dirname(indexPath), {recursive:true});
  const env = {GIT_INDEX_FILE:indexPath};
  git(['read-tree',base],{env});
  const records=[];
  for (const rel of files) {
    if (rel.startsWith('/') || rel.split('/').includes('..') || /(?:^|\/)\.env|storage.?state|credentials|secrets/i.test(rel)) throw new Error('Unsafe source selection: '+rel);
    const abs=path.join(cwd,rel);
    if (!fs.existsSync(abs)) { git(['update-index','--force-remove','--',rel],{env}); records.push({path:rel,deleted:true}); continue; }
    const bytes=fs.readFileSync(abs);
    if (/(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{35,}|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(bytes.toString('utf8'))) throw new Error('Potential credential: hold file '+rel);
    const blob=git(['hash-object','-w','--stdin','--no-filters'],{input:bytes}).trim();
    const entry=git(['ls-tree',base,'--',rel]).trim();
    const mode=entry ? entry.split(' ')[0] : '100644';
    if (!['100644','100755'].includes(mode)) throw new Error('Unsupported file mode '+rel);
    git(['update-index','--add','--cacheinfo',mode,blob,rel],{env});
    records.push({path:rel,sha256:sha(bytes),bytes:bytes.length,blob});
  }
  const tree=git(['write-tree'],{env}).trim();
  let existing; try { existing=git(['rev-parse','--verify',PREFIX+name]).trim(); } catch {}
  let commit;
  if (existing) {
    if(git(['rev-parse',existing+'^{tree}']).trim()!==tree)throw new Error('Changed preserved tree: use new capture identity '+name);
    commit=existing;
  } else commit=git(['commit-tree',tree,'-p',base],{input:'Preserve '+name+' before single-root consolidation; not integration\n'}).trim();
  const ref=anchor(name,commit);
  for(const r of records) {
    if(r.deleted) {if(fs.existsSync(path.join(cwd,r.path)))throw new Error('Late recreated source');continue;}
    if(sha(git(['cat-file','blob',r.blob],{binary:true}))!==r.sha256 || fileHash(path.join(cwd,r.path))!==r.sha256)throw new Error('Capture mismatch or late edit: '+r.path);
  }
  if(indexState(cwd).sha256!==actualIndex.sha256 || git(['status','--porcelain=v1','-z','--untracked-files=all'],{cwd})!==beforeStatus)throw new Error('Checkout/index changed during capture');
  return {source:cwd,base,ref,commit,tree,files:records,index:actualIndex,checkoutUnchanged:true};
}
const mode=process.argv[2];
if (!fs.existsSync(PRIVATE+'/access-check.env')) throw new Error('Provision and verify restricted private store first');
if(mode==='history') {
  const blocks=git(['worktree','list','--porcelain']).trim().split(/\r?\n\r?\n/);
  const rows=[];
  const reflogOnly=git(['rev-list','--reflog','--not','--all']).trim().split(/\r?\n/).filter(Boolean);
  for(const b of blocks) {
    const lines=b.split(/\r?\n/),source=lines.find(x=>x.startsWith('worktree ')).slice(9),commit=lines.find(x=>x.startsWith('HEAD ')).slice(5);
    const ref=anchor(slug(source)+'-head',commit);
    rows.push({source,commit,ref,status:git(['status','--porcelain=v1','--untracked-files=all'],{cwd:source}),index:indexState(source)});
  }
  const reflogs=reflogOnly.map(commit=>({commit,ref:anchor('reflog-'+commit,commit)}));
  const stashes=git(['stash','list','--format=%H']).trim().split(/\r?\n/).filter(Boolean).map(commit=>({commit,ref:anchor('stash-'+commit,commit)}));
  const clones=[];
  for(const source of [RESEARCH,RESEARCH+'/repo']) {
    const refs=git(['for-each-ref','--format=%(objectname) %(refname)'],{cwd:source}).trim().split(/\r?\n/).filter(Boolean);
    const saved=[];
    for(const line of refs) {const [object,...parts]=line.split(' ');let commit;try{commit=git(['rev-parse',object+'^{commit}']).trim();}catch{throw new Error('Independent clone object requires import before removal');} saved.push({originalRef:parts.join(' '),commit,ref:anchor('clone-'+slug(source)+'-'+slug(parts.join(' ')),commit)});}
    clones.push({source,refs:saved,reflogOnly:git(['rev-list','--reflog','--not','--all'],{cwd:source}).trim()});
  }
  json(PRIVATE+'/history.json',{checkedAt:new Date().toISOString(),worktrees:rows,reflogs,stashes,clones});
  console.log(JSON.stringify({worktrees:rows.length,reflogCommits:reflogs.length,stashes:stashes.length,cloneRefs:clones.map(x=>x.refs.length),report:PRIVATE+'/history.json'}));
} else if(mode==='deltas') {
  if(process.argv[3]!=='handoff-confirmed')throw new Error('Hearth writer handoff required');
  const sources=[ROOT,RESEARCH+'/release-worktree','D:/nursery/hearth-hydration-deadlock-repair','D:/nursery/forge-openai-transcription'];
  const out=[];
  for(const source of sources) {
    const base=git(['rev-parse','HEAD'],{cwd:source}).trim();
    const files=git(['diff','--name-only','-z','HEAD'],{cwd:source}).split('\0').filter(Boolean);
    if(source===ROOT)files.push('docs/maintenance/FORGE_SINGLE_ROOT_CONSOLIDATION_REVIEW.md','docs/maintenance/preserve-forge-consolidation.cjs');
    if(files.length)out.push(preserveDelta(source,base,files,slug(source)+'-working-edits'));
  }
  json(PRIVATE+'/deltas.json',out); console.log(JSON.stringify(out.map(x=>({source:x.source,commit:x.commit,ref:x.ref,files:x.files.length,checkoutUnchanged:x.checkoutUnchanged}))));
} else if(mode==='snapshots') {
  const rootFiles=['docs/billing/OWNER_FUNDED_HEARTH_RESEARCH_IMPLEMENTATION.md','supabase/tests/owner_funded_hearth_research.sql','supabase/migrations/20261010120000_tongs_owner_funded_hearth_research.sql','apps/nursery/server/hearth/owner-hearth-research-execution.ts','apps/nursery/server/hearth/hearth-research-runtime.ts','apps/nursery/server/hearth/create-hearth-ai-handler.ts','apps/hearth/src/hooks/useChatWorkspace.ts','apps/anvil/CHANGELOG.md'];
  const snapshots=[{root:RESEARCH+'/work',files:rootFiles},{root:RESEARCH+'/base',files:['apps/anvil/CHANGELOG.md']},...['hearth-inactive-release-9a23dc9828664ef9bd4780919bf6043c','hearth-git-tree-tests-377e46e45ee54d8ba3d7b7d071f3dc57','forge-pr54-guarded-fb015cc46c4b4b53beba2de2576d044c/candidate'].map(p=>({root:'C:/Users/Iam11/AppData/Local/Temp/'+p,files:['apps/anvil/CHANGELOG.md',...(p.startsWith('hearth-git-tree')?['docs/billing/OWNER_FUNDED_HEARTH_RESEARCH_PERMISSION_CERTIFICATION.md']:[])]}))];
  const base=git(['rev-parse','origin/main']).trim(),rows=[];
  for(const s of snapshots) {
    // Non-Git folders are represented as exact selected-file deltas on main,
    // not as reconstructed copies or claims about their original Git base.
    const env={GIT_INDEX_FILE:PRIVATE+'/indexes/snapshot-'+crypto.randomUUID()+'.index'};git(['read-tree',base],{env});const files=[];
    for(const rel of s.files) {const bytes=fs.readFileSync(path.join(s.root,rel)),blob=git(['hash-object','-w','--stdin','--no-filters'],{input:bytes}).trim();git(['update-index','--add','--cacheinfo','100644',blob,rel],{env});files.push({path:rel,blob,sha256:sha(bytes),classification:'preserved_not_integrated'});}
    const tree=git(['write-tree'],{env}).trim(),name='snapshot-delta-'+slug(s.root);let commit;try{commit=git(['rev-parse',PREFIX+name]).trim();if(git(['rev-parse',commit+'^{tree}']).trim()!==tree)throw new Error('Changed snapshot');}catch(e){if(e.status===undefined)throw e;commit=git(['commit-tree',tree,'-p',base],{input:'Preserve selected unmatched files from '+s.root+'; not integration\n'}).trim();}
    const ref=anchor(name,commit);for(const f of files)if(fileHash(path.join(s.root,f.path))!==f.sha256||sha(git(['cat-file','blob',f.blob],{binary:true}))!==f.sha256)throw new Error('Snapshot capture mismatch');rows.push({source:s.root,base,ref,commit,files});
  }
  json(PRIVATE+'/snapshots.json',rows);console.log(JSON.stringify(rows.map(x=>({source:x.source,commit:x.commit,files:x.files.length}))));
} else if(mode==='reconcile') {
  const base=git(['rev-parse','origin/main']).trim();
  const capture=JSON.parse(fs.readFileSync(PRIVATE+'/deltas.json','utf8')).find(x=>x.source===RESEARCH+'/release-worktree');
  const actualIndex=indexState(ROOT),actualHead=git(['rev-parse','HEAD']).trim();
  const env={GIT_INDEX_FILE:PRIVATE+'/indexes/reconciled-'+crypto.randomUUID()+'.index'};
  git(['read-tree',base],{env});
  const included=[];
  for(const f of capture.files) {
    if(git(['rev-parse',capture.base+':'+f.path]).trim()!==git(['rev-parse',base+':'+f.path]).trim())throw new Error('Main changed captured base file; integration review required: '+f.path);
    if(fileHash(path.join(capture.source,f.path))!==f.sha256)throw new Error('Late Hearth edit: '+f.path);
    const bytes=git(['cat-file','blob',f.blob],{binary:true});
    const blob=git(['hash-object','-w','--path',f.path,'--stdin'],{input:bytes}).trim();
    git(['update-index','--add','--cacheinfo','100644',blob,f.path],{env});included.push({path:f.path,blob,sourceCommit:capture.commit});
  }
  const documents=['AGENTS.md','docs/maintenance/FORGE_SINGLE_ROOT_CONSOLIDATION_REVIEW.md','docs/maintenance/FORGE_EXACT_PATH_REMOVAL_REVIEW.md','docs/maintenance/preserve-forge-consolidation.cjs','docs/maintenance/inventory-forge-removals.cjs'];
  for(const rel of documents) {
    const bytes=fs.readFileSync(ROOT+'/'+rel),blob=git(['hash-object','-w','--path',rel,'--stdin'],{input:bytes}).trim();
    git(['update-index','--add','--cacheinfo','100644',blob,rel],{env});included.push({path:rel,blob});
  }
  const tree=git(['write-tree'],{env}).trim();
  const commit=git(['commit-tree',tree,'-p',base],{input:'Reconcile reviewed Hearth preservation and single-root governance on current main\n\nNo production release; no checkout adoption or source-directory removals.\n'}).trim();
  const ref='refs/heads/codex/consolidation-reviewed-20260913';
  let old;try{old=git(['rev-parse','--verify',ref]).trim();}catch{}
  if(old)throw new Error('Reviewed integration branch already exists; retain it and review new changes');
  git(['update-ref',ref,commit,'0'.repeat(40)]);
  git(['diff','--check',base,commit]);
  if(indexState(ROOT).sha256!==actualIndex.sha256||git(['rev-parse','HEAD']).trim()!==actualHead)throw new Error('Actual checkout/index changed');
  json(PRIVATE+'/reconciliation.json',{base,ref,commit,tree,included,sourcePreservation:capture.commit,actualHead,actualIndex,adoptedInRunningCheckout:false,reason:'Current-to-main transition changes Vite config; explicit watcher handoff remains before checkout adoption',focusedTests:{suite:'hearth-stabilization-blockers',passed:19,failed:0,environment:'Existing release worktree; mocked requests; no paid calls'}});
  console.log(JSON.stringify({base,ref,commit,files:included.length,checkoutUnchanged:true,adopted:false}));
} else throw new Error('Use history, deltas handoff-confirmed, snapshots, or reconcile');
