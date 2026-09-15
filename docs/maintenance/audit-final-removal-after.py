"""Post-batch read-only verification; writes only protected audit metadata."""
import json,os,re,runpy,sys
from pathlib import Path
ROOT=Path('D:/nursery/nursery');PRIVATE=ROOT/'.git/forge-consolidation-private'
sys.argv=[str(ROOT/'docs/maintenance/resolve-forge-consolidation.py'),'library'];lib=runpy.run_path(sys.argv[0])
load,save,git,attrs,entries,norm,now,sha=(lib[n] for n in ('load','save','git','attrs','enumerate_metadata','norm','now','digest_file'))
proposal=load('final-removal-proposal.json');before=load('final-batch-before.json');manifest=load('removal-manifest.json')
journal=load('final-batch-journal.json');assert len(journal)==45 and len({r['id'] for r in journal})==45
removed=[r for r in journal if r['status']=='removed'];remaining=[r for r in journal if r['status']!='removed']
previousRemoved=[r for r in load('removal-batch-journal.json') if r['status']=='removed']
assert len({r['id'] for r in previousRemoved})==34
assert all(not os.path.lexists(r['path']) for r in previousRemoved),'Earlier removed path reappeared'
assert all(not Path(r['path']).exists() for r in removed),'Removed path reappeared'
assert all(Path(r['path']).exists() for r in remaining),'Unrecorded disappearance'
assert git(['rev-parse','HEAD']).decode().strip()==before['head']
assert git(['branch','--show-current']).decode().strip()==before['branch']
baseline=load('final-review-before.json')
assert sha(ROOT/'.git/index')==baseline['index'] and sha(ROOT/'apps/nursery/public/forge-nav.json')==baseline['nav']
currentRefs=dict(x.split(' ') for x in git(['for-each-ref','--format=%(refname) %(objectname)','refs/heads/codex/preserve/']).decode().strip().splitlines())
assert currentRefs==before['refs'],'Preservation refs changed'
for f in before['privateConfiguration']:assert sha(ROOT/f['path'])==f['sha256']
protectedDestinations=load('final-batch-canonical-destinations.json')
for record in protectedDestinations:
    file=Path(record['path']);a=attrs(file)
    if record.get('link'):
        assert a&1024 and lib['link_info'](file,a)['metadataSha256']==record['link']['metadataSha256']
    else:
        assert not a&1024
        stat=file.stat();assert stat.st_dev==record['device'] and stat.st_ino==record['inode'],'Protected canonical destination replaced'
retainedCount=0;retainedSize=0
for prefix in (PRIVATE/'retained').iterdir():
    assert not attrs(prefix)&1024
    for file in prefix.iterdir():
        assert not attrs(file)&1024 and sha(file)==file.name
        retainedCount+=1;retainedSize+=file.stat().st_size
assert retainedCount==1380 and retainedSize==proposal['retainedBytes']
blobs=sorted({f['blob'] for t in manifest['targets'] for f in t['files'] if f.get('blob')})
out=git(['cat-file','--batch-check'],data=('\n'.join(blobs)+'\n').encode()).decode().splitlines()
assert len(out)==len(blobs) and all(re.fullmatch(r'[0-9a-f]{40} blob \d+',s) for s in out),'Preserved file object unavailable'
trees=git(['worktree','list','--porcelain']).decode().strip().split('\n\n')
worktrees=[dict(line.split(' ',1) if ' ' in line else (line,True) for line in block.splitlines()) for block in trees]
assert not any(norm(w['worktree'])==norm(r['path']) for w in worktrees for r in removed)
sources=[{'id':'canonical','path':str(ROOT),'type':'canonical'}]+[{'id':t['id'],'path':t['path'],'type':t['type']} for t in manifest['targets'] if t['type'] in ('linked_worktree','independent_clone','non_git_source') and Path(t['path']).exists()]
exclude={'.git','node_modules','.pnpm-store','.tmp','dist','public','assets','test-results','docs','.cache','build','coverage'}
configs=set();errors=[];links=0
for source in sources:
    queue=[Path(source['path'])]
    while queue:
        directory=queue.pop()
        try:
            for name,a,size in entries(directory):
                file=directory/name
                if a&1024:links+=1;continue
                if a&16:
                    if name not in exclude:queue.append(file)
                elif re.search(r'(?:package|tsconfig.*|turbo|lerna)\.json$|\.code-workspace$|\.toml$|\.ya?ml$|\.config\.[cm]?[jt]s$|(?:^|[\\/])scripts[\\/].*\.(?:ps1|mjs|cmd|bat|sh)$|(?:^|[\\/])\.(?:vscode|netlify)[\\/].*\.json$|(?:^|[\\/])\.env(?:\.[^\\/]*)?$',str(file),re.I):configs.add(file)
        except OSError as error:errors.append({'path':str(directory),'error':type(error).__name__})
configs.update([ROOT/'.git/config',Path('C:/Users/Iam11/.codex/config.toml'),Path('C:/Users/Iam11/.codex/.codex-global-state.json')])
stale=[]
for file in configs:
    if not file.exists():continue
    try:
        content=file.read_text(encoding='utf-8',errors='replace').replace('\\\\','/').replace('\\','/').lower()
        for r in removed:
            if r['path'].replace('\\','/').lower() in content:stale.append({'configuration':str(file),'target':r['id']})
    except OSError as error:errors.append({'path':str(file),'error':type(error).__name__})
result={'checkedAt':now(),'head':before['head'],'branch':before['branch'],'canonicalIndexSourceAndPrivateConfigurationUnchanged':True,'protectedCanonicalDestinationsVerified':len(protectedDestinations),'preservationRefs':len(currentRefs),'original269Unchanged':True,'maintenanceCommit':before['maintenanceCommit'],'retainedFiles':retainedCount,'retainedBytes':retainedSize,'gitContentObjects':len(blobs),'removed':len(removed),'remaining':len(remaining),'linksRemoved':sum(r['linksRemoved'] for r in journal),'outcomes':journal,'remainingSources':sources,'worktrees':worktrees,'configurationScan':{'files':len(configs),'staleReferences':stale,'errors':errors,'linksNotFollowed':links},'privateStoreAbsentFromIndex':not git(['ls-files','--','.git/forge-consolidation-private']).decode().strip()}
result['previous34RemainAbsent']=True
save('final-batch-after.json',result)
print(json.dumps({k:v for k,v in result.items() if k not in ('outcomes','worktrees')},indent=2))
