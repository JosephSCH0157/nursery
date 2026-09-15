"""Guard the exact approved 45-target checkpoint. No deletion APIs.

The only writes are maintenance preservation refs and protected audit records.
Unlisted paths, drift and access failures reject the target.
"""
import hashlib,json,os,re,runpy,sys,sqlite3,subprocess
import ctypes
from pathlib import Path

ROOT=Path('D:/nursery/nursery')
PRIVATE=ROOT/'.git/forge-consolidation-private'
mode=sys.argv[1];tid=sys.argv[2] if len(sys.argv)>2 else None
sys.argv=[str(ROOT/'docs/maintenance/resolve-forge-consolidation.py'),'library']
lib=runpy.run_path(sys.argv[0])
load,save,git,attrs,entries,link_info,norm,within,now=(lib[n] for n in ('load','save','git','attrs','enumerate_metadata','link_info','norm','within','now'))
sha=lib['digest_file'];stream_info=lib['stream_info']

def timed_entries(directory):
    """Capture no-follow attributes and write time from one directory read."""
    data=lib['FindData']();native=lib['K'];handle=native.FindFirstFileW(str(directory/'*'),ctypes.byref(data))
    if handle==ctypes.c_void_p(-1).value:
        error=ctypes.get_last_error()
        if error==2:return []
        raise OSError(error,'Directory enumeration unavailable')
    found=[]
    try:
        while True:
            if data.name not in ('.','..'):
                stamp=((data.write.dwHighDateTime<<32)|data.write.dwLowDateTime)
                found.append((data.name,data.attributes,(data.high<<32)|data.low,(stamp-116444736000000000)*100))
            if not native.FindNextFileW(handle,ctypes.byref(data)):
                if ctypes.get_last_error()!=18:raise OSError(ctypes.get_last_error(),'Incomplete enumeration')
                break
    finally:native.FindClose(handle)
    return found
p=load('final-removal-proposal.json');original=load('removal-manifest.json')
assert p['checkedAt']=='2026-09-13T09:40:07.646605+00:00' and len(p['rows'])==45 and len(set(p['order']))==45
assert p['totalRefs']==269 and p['retainedFiles']==1380
scan=load('final-review-scan.json');preserved=load('final-review-preservation.json')

def refs():return dict(x.split(' ') for x in git(['for-each-ref','--format=%(refname) %(objectname)','refs/heads/codex/preserve/']).decode().strip().splitlines())
def canonical(expected):
    assert git(['rev-parse','HEAD']).decode().strip()==p['head'],'Canonical HEAD changed'
    assert git(['branch','--show-current']).decode().strip()==p['branch'],'Canonical branch changed'
    assert sha(ROOT/'.git/index')==load('final-review-before.json')['index'],'Canonical staging changed'
    assert sha(ROOT/'apps/nursery/public/forge-nav.json')==load('final-review-before.json')['nav'],'Canonical nav changed'
    assert refs()==expected,'Preservation refs changed'
    for f in load('handoff-prestate.json')['privateConfiguration']:assert sha(ROOT/f['path'])==f['sha256'],'Private configuration changed'

if mode=='before':
    assert not (PRIVATE/'final-batch-before.json').exists(),'Initial snapshot exists; do not overwrite'
    expected=dict(x.split(' ') for x in load('final-review-before.json')['refs'].strip().splitlines())
    expected.update({x['ref']:x['commit'] for x in p['newRefs']})
    canonical(expected)
    count=0;size=0
    for folder in (PRIVATE/'retained').iterdir():
        assert not attrs(folder)&1024
        for f in folder.iterdir():
            assert not attrs(f)&1024 and sha(f)==f.name,'Retained evidence mismatch'
            count+=1;size+=f.stat().st_size
    assert count==1380 and size==p['retainedBytes'],'Retained store changed'
    # Preserve only current maintenance reports/scripts, not a checkout copy or
    # the preexisting generated-nav change. The real index is never used.
    files=sorted(str(f.relative_to(ROOT)).replace('\\','/') for f in (ROOT/'docs/maintenance').iterdir() if f.is_file() and (f.name.startswith('FORGE_') or f.name in ('resolve-forge-consolidation.py','audit-final-forge-dependencies.ps1','forge-removal-process-audit.ps1','run-reviewed-forge-removal.ps1','verify-forge-removal-batch.cjs','verify-forge-removal-target.cjs','verify-final-removal.py')))
    index=PRIVATE/'final-batch-maintenance.index';assert not index.exists()
    env={'GIT_INDEX_FILE':str(index)}
    git(['read-tree',p['head']],env=env)
    git(['add','--']+files,env=env)
    tree=git(['write-tree'],env=env).decode().strip()
    commit=git(['commit-tree',tree,'-p',p['head'],'-m','Preserve maintenance evidence before approved final removal']).decode().strip()
    ref='refs/heads/codex/preserve/20260913/final-removal-maintenance-prestate'
    git(['update-ref',ref,commit,'0'*40]);expected[ref]=commit
    canonical(expected)
    save('final-batch-before.json',{'at':now(),'head':p['head'],'branch':p['branch'],'refs':expected,'retainedFiles':count,'retainedBytes':size,'maintenanceRef':ref,'maintenanceCommit':commit,'maintenanceFiles':[{'path':f,'sha256':sha(ROOT/f)} for f in files],'proposalSha256':sha(PRIVATE/'final-removal-proposal.json'),'privateConfiguration':load('handoff-prestate.json')['privateConfiguration']})
    print(json.dumps({'verifiedRefsBefore':269,'verifiedRetained':count,'maintenanceCommit':commit,'canonicalUnchanged':True}),flush=True)
    sys.exit()

before=load('final-batch-before.json');canonical(before['refs'])
assert sha(PRIVATE/'final-removal-proposal.json')==before['proposalSha256']
if mode=='canonical':print('Canonical invariants verified');sys.exit()

if mode=='protect-canonical-links':
    records=[]
    for link in next(s for s in scan if s['id']=='T023')['links']:
        destination=Path(link['destinationLexical']);assert within(destination,ROOT)
        a=attrs(destination)
        if a&1024:record={'path':str(destination),'attributes':a,'link':link_info(destination,a)}
        else:
            stat=destination.stat();record={'path':str(destination),'attributes':a,'device':stat.st_dev,'inode':stat.st_ino}
        records.append(record)
    assert len(records)==13
    save('final-batch-canonical-destinations.json',records)
    print('Recorded 13 protected canonical dependency destinations without traversing aliases')
    sys.exit()

if mode=='target':
    t=next(t for t in p['rows'] if t['id']==tid)
    old=next(t for t in original['targets'] if t['id']==tid)
    sc=next(t for t in scan if t['id']==tid);pr=next(t for t in preserved if t['id']==tid)
    root=Path(t['path']);assert root.is_absolute() and norm(root)==norm(old['resolved']) and not within(root,ROOT),'Exact path mismatch'
    result={'id':tid,'path':str(root),'checkedAt':now(),'ok':False,'error':None,'entries':[],'links':[],'verified':0}
    try:
        assert not attrs(root)&1024,'Root became a link'
        expectedLinks={norm(x['path']):x for x in sc['links']}
        expectedFiles={x['path'] for x in sc['files']};expectedDirs=set(sc['directories'])
        removed=set()
        if (PRIVATE/'final-batch-journal.json').exists():removed={r['id'] for r in load('final-batch-journal.json') if r['status']=='removed'}
        nested={norm(x['path']):x['id'] for x in p['rows'] if x['id']!=tid and within(x['path'],root)}
        assert all(x in removed for x in sc['nested']),'Listed child not yet removed'
        seenFiles=set();seenDirs=set();generated=0;stack=[(root,'',False,None,0,0)]
        while stack:
            path,rel,gen,a,size,mtime=stack.pop()
            if a is None:
                a=attrs(path);stat=path.stat();size=stat.st_size;mtime=stat.st_mtime_ns
            if a&1024:
                actual=link_info(path,a);expected=expectedLinks.get(norm(path))
                assert expected and actual['metadataSha256']==expected['metadataSha256'] and actual['tag']==expected['tag'],'Unexpected/changed link: '+rel
                result['links'].append(actual);continue
            if norm(path) in nested:raise ValueError('Nested target still present: '+nested[norm(path)])
            directory=bool(a&16)
            result['entries'].append({'path':str(path),'relative':rel,'directory':directory,'size':size if not directory else 0,'mtimeNs':mtime,'attributes':a})
            if directory:
                seenDirs.add(rel)
                if rel=='.git':continue
                gen=gen or path.name in ('node_modules','.pnpm-store','dist','build','coverage','.vite')
                stack.extend((path/name,(rel+'/'+name).lstrip('/'),gen,flags,size,mtime) for name,flags,size,mtime in timed_entries(path))
            elif gen:generated+=1
            else:seenFiles.add(rel)
        assert seenFiles==expectedFiles,'Unexpected/missing file names'
        assert seenDirs==expectedDirs,'Unexpected/missing directory names'
        assert generated==sc['generatedFiles'],'Generated material count changed'
        assert {norm(x['path']) for x in result['links']}==set(expectedLinks),'Link set changed'
        oldfiles={x['path']:x for x in old['files']};newfiles={x['path']:x for x in pr['files']};archives={x['path']:x for x in pr['archives']};fallback=[]
        for rel in sorted(seenFiles):
            file=root/rel;f=newfiles.get(rel) or archives.get(rel) or oldfiles.get(rel)
            assert f,'No reviewed disposition: '+rel
            with open(file,'rb') as source:info,_=stream_info(source,file.stat().st_size)
            if f.get('sha256'):assert info['sha256']==f['sha256'],'File bytes changed: '+rel
            else:
                blob=f.get('blob') or f.get('gitBlob');assert blob,'Missing content evidence: '+rel
                if blob!=info['blob']:
                    if info['size']<16*1024*1024:
                        data=file.read_bytes().decode('utf-8',errors='replace').replace('\r\n','\n').encode()
                        if hashlib.sha1(('blob '+str(len(data))+'\0').encode()+data).hexdigest()!=blob:fallback.append((rel,file,blob))
                    else:fallback.append((rel,file,blob))
            if f.get('destination'):assert sha(f['destination'])==f['sha256'],'Private evidence no longer matches'
            result['verified']+=1
        if fallback:
            cwd=root if t['type'] in ('linked_worktree','independent_clone') else ROOT
            paths=('\n'.join(str(x[1]) for x in fallback)+'\n').encode()
            attributes=git(['check-attr','--stdin','filter'],cwd=cwd,data=paths).decode().splitlines()
            assert all(a.endswith(': unspecified') for a in attributes),'Unreviewed content filter'
            hashes=git(['hash-object','--stdin-paths'],cwd=cwd,data=paths).decode().splitlines()
            assert len(hashes)==len(fallback) and all(x[2]==h for x,h in zip(fallback,hashes)),'Filtered content changed'
        if t['type']=='linked_worktree':
            current=git(['-c','core.fsmonitor=false','status','--porcelain=v1','--untracked-files=all'],cwd=root).decode().splitlines()
            assert current==t['workingChanges'],'Dirty contents/deletions or staging changed'
            assert git(['rev-parse','HEAD'],cwd=root).decode().strip()==next(v for v in load('final-review-file-verification.json') if v['id']==tid)['head'],'External HEAD changed'
        if tid in ('T031','T032','T061'):
            metadata=next(r for r in load('final-review-metadata.json') if r['id']==tid);meta=root/'.git';cmd=['--git-dir='+str(meta)]
            assert git(cmd+['for-each-ref','--format=%(refname) %(objectname)']).decode().splitlines()==metadata['refs'],'Clone refs changed'
            objects=git(cmd+['cat-file','--batch-all-objects','--batch-check=%(objectname) %(objecttype)']).decode().splitlines()
            assert len(objects)==metadata['objects'],'Clone object inventory changed'
            canonicalObjects=set(git(['cat-file','--batch-all-objects','--batch-check=%(objectname)']).decode().splitlines())
            allowedMissing={x.split(' ')[0] for x in metadata['missingObjects']}
            assert all(x.split(' ')[0] in canonicalObjects|allowedMissing for x in objects),'Unpreserved Git object'
            assert git(cmd+['stash','list','--format=%H']).decode().splitlines()==metadata['stashes'],'Stash changed'
            assert git(cmd+['rev-list','--reflog','--not','--all']).decode().splitlines()==metadata['reflogOnly'],'Reflog-only history changed'
            expectedMeta={x['path']:x for x in metadata['files']};seenMeta=set();queue=[meta]
            while queue:
                file=queue.pop();a=attrs(file);assert not a&1024,'Unexpected Git metadata link'
                rel=file.relative_to(meta).as_posix()
                if file!=meta:
                    stat=file.stat();result['entries'].append({'path':str(file),'relative':'.git/'+rel,'directory':bool(a&16),'size':0 if a&16 else stat.st_size,'mtimeNs':stat.st_mtime_ns,'attributes':a})
                if a&16:queue.extend(file/name for name,flags,size in entries(file))
                else:
                    # Object bodies are validated by Git's inventory; all remaining
                    # configuration, refs, reflogs, index and fragments must match.
                    if rel.startswith('objects/') and re.match(r'^objects/[0-9a-f]{2}/[0-9a-f]{38}$',rel):continue
                    if rel.startswith('objects/pack/') and re.search(r'\.(?:pack|idx|rev)$',rel):continue
                    key='.git/'+rel;f=expectedMeta.get(key) or expectedMeta.get(rel)
                    assert f and sha(file)==f['sha256'],'Git metadata changed: '+rel
                    seenMeta.add(f['path'])
            assert seenMeta==set(expectedMeta),'Missing metadata disposition'
        # Read-only current task authority, not a historical cached task list.
        with sqlite3.connect('file:C:/Users/Iam11/.codex/state_5.sqlite?mode=ro',uri=True) as db:
            taskDeps=[{'id':row[0],'cwd':row[1]} for row in db.execute('SELECT id,cwd FROM threads WHERE archived=0') if within(row[1],root)]
        result['currentTaskDependencies']=taskDeps
        assert not taskDeps,'Current unarchived task still depends on target'
        dep=subprocess.run(['pwsh','-NoProfile','-File',str(ROOT/'docs/maintenance/check-final-removal-dependencies.ps1'),'-Id',tid],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        assert dep.returncode==0,'Fresh mount/scheduled-task/Explorer dependency check failed (see protected evidence)'
        result['ok']=True
    except Exception as error:result['error']=str(error)
    result['finishedAt']=now();save('final-batch-check-'+tid+'.json',result)
    print(json.dumps({'id':tid,'ok':result['ok'],'verified':result['verified'],'links':len(result['links']),'error':result['error']}),flush=True)
    sys.exit(0 if result['ok'] else 2)

raise ValueError('Unknown verification mode')
