"""Read-only target inspection and selective preservation, never removal.

Archives are streamed in memory, not extracted. Only reviewed evidence and
individual source blobs are retained in the canonical repository's private/Git
storage. Reparse points are opened with OPEN_REPARSE_POINT, never traversed.
"""
import base64, ctypes, faulthandler, hashlib, json, ntpath, os, re, subprocess, sys, zipfile, zlib
from ctypes import wintypes
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path('D:/nursery/nursery')
PRIVATE = ROOT / '.git/forge-consolidation-private'
def load(name): return json.loads((PRIVATE / name).read_text(encoding='utf-8-sig'))
def save(name, data): (PRIVATE / name).write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
def now(): return datetime.now(timezone.utc).isoformat()
def norm(p): return ntpath.normpath(str(p)).lower()
def within(p, root): return norm(p) == norm(root) or norm(p).startswith(norm(root) + '\\')
def git(args, cwd=ROOT, data=None, env=None):
    r=subprocess.run(['git',*args],cwd=cwd,input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env={**os.environ,'GIT_OPTIONAL_LOCKS':'0',**(env or {})})
    if r.returncode: raise RuntimeError('Git check failed: '+str(args[:2])+' (details not printed to protect configuration)')
    return r.stdout
def digest_file(p):
    with open(p,'rb') as f: return hashlib.file_digest(f,'sha256').hexdigest()

K=ctypes.WinDLL('kernel32',use_last_error=True)
K.GetFileAttributesW.argtypes=[wintypes.LPCWSTR]; K.GetFileAttributesW.restype=wintypes.DWORD
K.CreateFileW.argtypes=[wintypes.LPCWSTR,wintypes.DWORD,wintypes.DWORD,ctypes.c_void_p,wintypes.DWORD,wintypes.DWORD,wintypes.HANDLE]; K.CreateFileW.restype=wintypes.HANDLE
K.DeviceIoControl.argtypes=[wintypes.HANDLE,wintypes.DWORD,ctypes.c_void_p,wintypes.DWORD,ctypes.c_void_p,wintypes.DWORD,ctypes.POINTER(wintypes.DWORD),ctypes.c_void_p]
K.CloseHandle.argtypes=[wintypes.HANDLE]
class FindData(ctypes.Structure):
    _fields_=[('attributes',wintypes.DWORD),('creation',wintypes.FILETIME),('access',wintypes.FILETIME),('write',wintypes.FILETIME),
              ('high',wintypes.DWORD),('low',wintypes.DWORD),('reserved0',wintypes.DWORD),('reserved1',wintypes.DWORD),
              ('name',wintypes.WCHAR*260),('alternate',wintypes.WCHAR*14)]
K.FindFirstFileW.argtypes=[wintypes.LPCWSTR,ctypes.POINTER(FindData)];K.FindFirstFileW.restype=wintypes.HANDLE
K.FindNextFileW.argtypes=[wintypes.HANDLE,ctypes.POINTER(FindData)];K.FindClose.argtypes=[wintypes.HANDLE]
def enumerate_metadata(p):
    # Find metadata comes from the directory entry itself, not link targets.
    data=FindData(); h=K.FindFirstFileW(str(p/'*'),ctypes.byref(data))
    if h==ctypes.c_void_p(-1).value:
        error=ctypes.get_last_error()
        if error==2:return []
        raise OSError(error,'Directory enumeration unavailable')
    items=[]
    try:
        while True:
            if data.name not in ('.','..'):items.append((data.name,data.attributes,(data.high<<32)|data.low))
            if not K.FindNextFileW(h,ctypes.byref(data)):
                if ctypes.get_last_error()!=18:raise OSError(ctypes.get_last_error(),'Directory enumeration incomplete')
                break
    finally:K.FindClose(h)
    return items
def attrs(p):
    a=K.GetFileAttributesW(str(p))
    if a==0xffffffff: raise OSError(ctypes.get_last_error(),'Cannot inspect attributes')
    return a
def link_info(p,a):
    h=K.CreateFileW(str(p),0,7,None,3,0x02200000,None)
    if h==ctypes.c_void_p(-1).value: raise OSError(ctypes.get_last_error(),'Cannot open reparse point itself')
    try:
        buf=ctypes.create_string_buffer(16384); size=wintypes.DWORD()
        if not K.DeviceIoControl(h,0x900A8,None,0,buf,16384,ctypes.byref(size),None): raise OSError(ctypes.get_last_error(),'Cannot read reparse metadata')
        raw=buf.raw[:size.value]; tag=int.from_bytes(raw[:4],'little'); target=None
        if tag in (0xa0000003,0xa000000c):
            start=int.from_bytes(raw[8:10],'little'); length=int.from_bytes(raw[10:12],'little'); base=16 if tag==0xa0000003 else 20
            target=raw[base+start:base+start+length].decode('utf-16-le')
            if target.startswith('\\??\\'): target=target[4:]
        elif tag==0xa000001d: target=raw[12:].decode('utf-8')
        return {'path':str(p),'tag':hex(tag),'kind':{0xa0000003:'junction',0xa000000c:'Windows_symlink',0xa000001d:'LX_symlink'}.get(tag,'unknown_reparse'),
                'directory':bool(a&16),'destination':target,'destinationLexical':ntpath.normpath(ntpath.join(str(p.parent),target.replace('/','\\'))) if target else None,
                'metadataSha256':hashlib.sha256(raw).hexdigest(),'traversed':False}
    finally: K.CloseHandle(h)

manifest=load('removal-manifest.json'); after=load('removal-batch-after.json')
remaining_ids={t['id'] for t in after['outcomes'] if t['status']=='skipped'} | {t['id'] for t in after['held']}
targets=[t for t in manifest['targets'] if t['id'] in remaining_ids]
assert len(targets)==45
roots={norm(t['path']):t['id'] for t in targets}
mode=sys.argv[1]
if mode=='scan':
    before={'at':now(),'head':git(['rev-parse','HEAD']).decode().strip(),'branch':git(['branch','--show-current']).decode().strip(),
            'index':digest_file(ROOT/'.git/index'),'refs':git(['for-each-ref','--format=%(refname) %(objectname)','refs/heads/codex/preserve/']).decode(),
            'nav':digest_file(ROOT/'apps/nursery/public/forge-nav.json')}
    if not (PRIVATE/'final-review-before.json').exists(): save('final-review-before.json',before)
    result=load('final-review-scan.json') if (PRIVATE/'final-review-scan.json').exists() else []
    for t in targets:
        if any(r['id']==t['id'] for r in result): continue
        r={'id':t['id'],'path':t['path'],'type':t['type'],'at':now(),'links':[],'errors':[],'files':[],'directories':[],'generatedFiles':0,'nested':[]}
        stack=[(Path(t['path']),'',False,None,0)]
        visited=0
        while stack:
            p,rel,generated,entry_attrs,entry_size=stack.pop()
            visited+=1
            if visited%2000==0: save('final-review-scan-progress.json',{'id':t['id'],'at':now(),'visited':visited,'path':str(p)})
            try:
                a=entry_attrs if entry_attrs is not None else attrs(p)
                if a&1024: r['links'].append(link_info(p,a)); continue
                if rel and norm(p) in roots: r['nested'].append(roots[norm(p)]); continue
                if a&16:
                    r['directories'].append(rel)
                    if rel=='.git': continue
                    generated=generated or p.name in ('node_modules','.pnpm-store','dist','build','coverage','.vite')
                    stack.extend((p/name,(rel+'/'+name).lstrip('/'),generated,flags,size) for name,flags,size in enumerate_metadata(p))
                elif generated: r['generatedFiles']+=1
                else: r['files'].append({'path':rel,'size':entry_size})
            except Exception as e: r['errors'].append({'path':str(p),'error':str(e)})
        for link in r['links']:
            dest=link['destinationLexical']
            link['destinationRoot']= next((v for k,v in sorted(roots.items(),key=lambda x:-len(x[0])) if dest and within(dest,k)), 'canonical' if dest and within(dest,ROOT) else 'outside_inventory')
        result.append(r); save('final-review-scan.json',result)
        print(json.dumps({'id':r['id'],'files':len(r['files']),'generatedFiles':r['generatedFiles'],'links':len(r['links']),'errors':r['errors']}),flush=True)
    sys.exit()

known=set(git(['rev-list','--objects','--all']).decode().splitlines()) if mode!='library' else set()
known={x.split(' ')[0] for x in known}
retained={f['sha256']:f['destination'] for t in manifest['targets'] for f in t['files'] if f.get('destination')}
new_retained={}; source_blobs={}; inspections={}
def stream_info(stream,size,inspect=False):
    sha=hashlib.sha256(); blob=hashlib.sha1(('blob '+str(size)+'\0').encode()); content=bytearray(); total=0
    for b in iter(lambda:stream.read(1024*1024),b''):
        sha.update(b);blob.update(b);total+=len(b)
        if inspect and len(content)<131072: content.extend(b[:131072-len(content)])
    if total!=size: raise ValueError('Size changed during read')
    return {'size':size,'sha256':sha.hexdigest(),'blob':blob.hexdigest()},bytes(content)
def preserve_stream(opener,info):
    sha=info['sha256']; dest=PRIVATE/'retained'/sha[:2]/sha
    if dest.exists():
        if digest_file(dest)!=sha: raise ValueError('Retained hash mismatch')
    else:
        dest.parent.mkdir(exist_ok=True)
        with opener() as src,open(dest,'xb') as out:
            copied=hashlib.sha256()
            for b in iter(lambda:src.read(1024*1024),b''): copied.update(b);out.write(b)
        if copied.hexdigest()!=sha or digest_file(dest)!=sha: raise ValueError('Preservation verification failed')
        new_retained[sha]={'destination':str(dest),'size':info['size']}
    retained[sha]=str(dest)
    return str(dest)
def inspection(label,head):
    text=head.decode('utf-8',errors='replace')
    return {'format': 'sql_dump' if label.lower().endswith('.sql') else 'json' if label.lower().endswith('.json') else 'text_or_binary',
            'prefixReadBytes':len(head),'sqlCopyMarkers':len(re.findall(r'(?m)^COPY ',text)),
            'postgresDumpMarker': 'PostgreSQL database dump' in text,'looksLikeJson':text.lstrip().startswith(('{','[')),
            'sensitiveMarkerPresent':bool(re.search(r'(?:access_token|refresh_token|authorization|password|cookie|sk-proj-|service_role)',text,re.I))}
def classify(label,info,opener,head,force_private=False):
    secretish=force_private or bool(re.search(r'(?:^|/)(?:\.env[^/]*|.*(?:auth|credential|storage.?state|secret).*\.json)$|\.sql$|(?:log|trace|test-results|playwright-report|\.git)/|\.png$|\.webm$',label,re.I))
    if info['blob'] in known and not secretish: return {'disposition':'verified_duplicate','gitBlob':info['blob']}
    if not secretish and info['size']<=16*1024*1024 and re.search(r'\.(?:[cm]?[jt]sx?|md|json|yml|yaml|txt|css|html|ps1|sh)$',label,re.I):
        with opener() as src: raw=src.read()
        try: normalized=raw.decode('utf-8').replace('\r\n','\n').encode('utf-8')
        except UnicodeDecodeError: normalized=raw
        normal_blob=hashlib.sha1(('blob '+str(len(normalized))+'\0').encode()+normalized).hexdigest()
        if normal_blob in known: return {'disposition':'verified_duplicate_normalized','gitBlob':normal_blob,'normalization':'UTF-8 CRLF to LF only'}
    # No size bypass: evidence always hashed and selectively retained.
    return {'disposition':'preserved_private','destination':preserve_stream(opener,info),'inspection':inspection(label,head)}

if mode=='preserve':
    scan=load('final-review-scan.json'); result=load('final-review-preservation.json') if (PRIVATE/'final-review-preservation.json').exists() else []
    for t in targets:
        if not any(s['id']==t['id'] for s in scan) or any(r['id']==t['id'] for r in result): continue
        sc=next(s for s in scan if s['id']==t['id']); prior={f['path']:f for f in t['files']}; rows=[]; archives=[]
        for f in sc['files']:
            rel=f['path']; p=Path(t['path'])/rel; old=prior.get(rel)
            # Reverify previously preserved files separately; inspect every formerly
            # unresolved/new/evidence/archive entry here, including Git metadata pointer.
            if old and not old['classification'].startswith('hold_'): continue
            if zipfile.is_zipfile(p):
                ai={'path':rel,'sha256':digest_file(p),'entries':[],'extracted':False,'archiveRetained':False}
                with zipfile.ZipFile(p) as z:
                    for e in z.infolist():
                        er={'path':e.filename,'size':e.file_size,'compressedSize':e.compress_size,'directory':e.is_dir()}
                        if e.is_dir(): er['disposition']='reproducible_directory';ai['entries'].append(er);continue
                        if e.flag_bits&1: er.update(disposition='unresolved',reason='encrypted_archive_entry');ai['entries'].append(er);continue
                        if e.file_size>2*1024**3: er.update(disposition='unresolved',reason='decompression_safety_limit');ai['entries'].append(er);continue
                        with z.open(e) as src: info,head=stream_info(src,e.file_size,True)
                        er.update(info)
                        if e.filename.endswith('package.json') and e.file_size<1024*1024:
                            try:
                                package=json.loads(z.read(e));er['packageIdentity']={k:package[k] for k in ('name','version') if k in package}
                            except (ValueError,UnicodeDecodeError):er['packageIdentity']='invalid_json'
                        # Dependencies can be recovered from the locked install; retain
                        # application bundle/source/evidence, not an entire source archive.
                        if '/node_modules/' in '/'+e.filename and '/node_modules/@forge/' not in '/'+e.filename and re.search(r'(?:^|/)node_modules/(?:\.pnpm/|@?[A-Za-z0-9_.-]+/)',e.filename):
                            er.update(disposition='reproducible_generated_material',basis='packaged dependency; archive inventory and hashes retained')
                        else: er.update(classify(e.filename,info,lambda e=e:z.open(e),head))
                        ai['entries'].append(er)
                archives.append(ai)
            else:
                with open(p,'rb') as src: info,head=stream_info(src,p.stat().st_size,True)
                disposition=classify(rel,info,lambda p=p:open(p,'rb'),head,force_private=(rel=='.git' or t['type'] in ('evidence_directory','private_trace_directory','metadata_remnant')))
                rows.append({'path':rel,**info,**disposition})
        result.append({'id':t['id'],'path':t['path'],'files':rows,'archives':archives,'errors':sc['errors']})
        save('final-review-preservation.json',result)
        save('final-review-new-retained.json',new_retained)
        print(json.dumps({'id':t['id'],'inspectedFiles':len(rows),'archives':len(archives),'archiveEntries':sum(len(a['entries']) for a in archives),'uniqueNewRetained':len(new_retained)}),flush=True)

if mode=='metadata':
    all_objects=set(git(['cat-file','--batch-all-objects','--batch-check=%(objectname)']).decode().splitlines())
    history=load('history.json'); results=[]
    for tid in ('T031','T032','T060','T061'):
        t=next(t for t in targets if t['id']==tid); base=Path(t['path']); meta=base/'.git'
        r={'id':tid,'path':str(base),'at':now(),'files':[],'errors':[],'anchors':[]}
        if meta.is_file():
            with open(meta,'rb') as f: info,head=stream_info(f,meta.stat().st_size,True)
            r['files'].append({'path':'.git',**info,'disposition':'preserved_private','destination':preserve_stream(lambda:open(meta,'rb'),info)})
            pointer=meta.read_text().strip().removeprefix('gitdir: ')
            r.update(pointer=pointer,pointerDestinationExists=Path(pointer).exists(),registered=norm(base) in git(['worktree','list','--porcelain']).decode().lower().replace('/','\\'))
        else:
            cmd=['--git-dir='+str(meta)]
            refs=git(cmd+['for-each-ref','--format=%(refname) %(objectname)']).decode().splitlines()
            r['refs']=refs
            mapped=next((c for c in history['clones'] if norm(c['source'])==norm(base)),None)
            if mapped:
                saved={x['originalRef']:x for x in mapped['refs']}
                r['preservedRefMappings']=[]
                for line in refs:
                    name,oid=line.split(' '); old=saved.get(name)
                    if not old or old['commit']!=git(cmd+['rev-parse',oid+'^{commit}']).decode().strip(): r['errors'].append('Unmapped ref '+name)
                    elif git(['rev-parse',old['ref']]).decode().strip()!=old['commit']: r['errors'].append('Changed preservation ref '+name)
                    else: r['preservedRefMappings'].append(old)
            objs=git(cmd+['cat-file','--batch-all-objects','--batch-check=%(objectname) %(objecttype)']).decode().splitlines()
            missing=[line for line in objs if line.split(' ')[0] not in all_objects]
            r['objects']=len(objs);r['missingObjects']=missing
            # Preserve any already-imported commit not reachable from a canonical
            # ref; never manufacture/repair incomplete metadata in the source.
            for line in objs:
                oid,typ=line.split(' ')
                if typ=='commit' and oid in all_objects and oid not in known:
                    ref='refs/heads/codex/preserve/20260913/final-'+tid.lower()+'-'+oid
                    existing=git(['for-each-ref','--format=%(objectname)',ref]).decode().strip()
                    if existing and existing!=oid: raise ValueError('Ref collision')
                    if not existing: git(['update-ref',ref,oid,'0'*40])
                    r['anchors'].append({'ref':ref,'commit':oid})
            r['reflogOnly']=git(cmd+['rev-list','--reflog','--not','--all']).decode().splitlines()
            r['stashes']=git(cmd+['stash','list','--format=%H']).decode().splitlines()
            try:
                origin=git(cmd+['config','--get','remote.origin.url']).decode().strip()
                r['originKind']='local_canonical_clone' if norm(origin)==norm(ROOT) else 'other_configuration_preserved_privately'
            except RuntimeError: r['originKind']='absent'
            stack=[meta]
            while stack:
                p=stack.pop(); rel=p.relative_to(meta).as_posix(); a=attrs(p)
                if a&1024: r['errors'].append('Unexpected metadata reparse '+rel);continue
                if a&16:
                    stack.extend(Path(e.path) for e in os.scandir(p));continue
                if rel.startswith('objects/') and re.match(r'^objects/[0-9a-f]{2}/[0-9a-f]{38}$',rel): continue
                if rel.startswith('objects/pack/') and re.search(r'\.(?:pack|idx|rev)$',rel): continue
                with open(p,'rb') as f: info,head=stream_info(f,p.stat().st_size,True)
                r['files'].append({'path':rel,**info,'disposition':'preserved_private','destination':preserve_stream(lambda p=p:open(p,'rb'),info)})
            r['head']= (meta/'HEAD').read_text().strip()
        results.append(r);save('final-review-metadata.json',results);save('final-review-metadata-retained.json',new_retained)
        print(json.dumps({'id':tid,'refs':len(r.get('refs',[])),'objects':r.get('objects',0),'missingObjects':len(r.get('missingObjects',[])),'anchors':len(r['anchors']),'metadataFiles':len(r['files']),'errors':r['errors'],'originKind':r.get('originKind')}),flush=True)

if mode=='orphan-source':
    r=load('final-review-metadata.json')[0]; gd=['--git-dir='+r['path']+'/.git']
    selected={
        '40afa6239a82db3654587c6f3ab00925e1d3d9ba':'apps/hearth/src/hooks/useChatWorkspace.ts',
        '405d18d61c5641a92b8bede33a498d7a8c5502cb':'apps/nursery/server/hearth/create-hearth-ai-handler.ts',
        'd2ea3ead5d8f6c7222e46fdfead158a16f340100':'apps/nursery/server/hearth/hearth-research-runtime.ts',
        'abfeb57baa5cab1f10b24d228144b7387c31ef1f':'apps/nursery/tests/owner-hearth-research-execution.test.mts'}
    env={'GIT_INDEX_FILE':str(PRIVATE/'final-orphan-source.index')}
    git(['read-tree','--empty'],env=env); records=[]; trees=[]
    for oid,name in selected.items():
        b=git(gd+['cat-file','blob',oid]); text=b.decode('utf-8')
        if re.search(r'sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{35,}|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN .*PRIVATE KEY-----',text): raise ValueError('Credential marker in source: preserve privately instead')
        imported=git(['hash-object','-w','--stdin','--no-filters'],data=b).decode().strip()
        assert imported==oid
        git(['update-index','--add','--cacheinfo','100644',oid,name],env=env)
        records.append({'path':name,'blob':oid,'sha256':hashlib.sha256(b).hexdigest(),'size':len(b)})
    tree=git(['write-tree'],env=env).decode().strip(); ref='refs/heads/codex/preserve/20260913/final-t031-orphan-source'
    prior=git(['for-each-ref','--format=%(objectname)',ref]).decode().strip()
    if prior:
        assert git(['rev-parse',prior+'^{tree}']).decode().strip()==tree;commit=prior
    else:
        commit=git(['commit-tree',tree],data=b'Preserve four unattached source variants from research clone; no integration\n').decode().strip()
        git(['update-ref',ref,commit,'0'*40])
    for obj in r['missingObjects']:
        oid,typ=obj.split()
        if typ=='tree':
            b=git(gd+['cat-file','tree',oid]);info={'size':len(b),'sha256':hashlib.sha256(b).hexdigest()}
            import io
            trees.append({'object':oid,'disposition':'preserved_private_tree_metadata','destination':preserve_stream(lambda b=b:io.BytesIO(b),info),**info})
    save('final-review-orphan-source.json',{'at':now(),'ref':ref,'commit':commit,'tree':tree,'files':records,'treeMetadata':trees,'archiveObject':'9c4edc1e88a2582ef79a7649dc47089de7b4c5d3','archiveTreatment':'Do not import full-source archive; certify constituent entries through archive inventory'})
    print(json.dumps({'ref':ref,'commit':commit,'sourceFiles':len(records),'treeMetadata':len(trees)}))

if mode=='inspect-content':
    records=load('final-review-preservation.json'); unique={}
    for r in records:
        for f in r['files']+[e for a in r['archives'] for e in a['entries']]:
            if f.get('destination') and re.search(r'\.(?:json|sql)$',f['path'],re.I):unique.setdefault(f['sha256'],f)
    result=[]
    for sha,f in unique.items():
        r={'sha256':sha,'size':f['size'],'sourceKind':Path(f['path']).suffix,'fullFileInspected':True}
        if f['path'].endswith('.json'):
            try:
                with open(f['destination'],'r',encoding='utf-8-sig') as src: value=json.load(src)
                r.update(validJson=True,rootType=type(value).__name__,rootItems=len(value) if isinstance(value,(dict,list)) else None)
                del value
            except (ValueError,UnicodeDecodeError) as e:r.update(validJson=False,parseErrorType=type(e).__name__)
        elif f['path'].endswith('.sql'):
            rows=0;copy_sections=0;statements=0;inside=False
            with open(f['destination'],'r',encoding='utf-8-sig',errors='replace') as src:
                for line in src:
                    if line.startswith('COPY '): copy_sections+=1;inside=True
                    elif inside and line.rstrip()=='\\.':inside=False
                    elif inside:rows+=1
                    elif line.startswith(('CREATE ','ALTER ','INSERT ')):statements+=1
            r.update(copySections=copy_sections,dataRows=rows,ddlOrInsertStatements=statements,restored=False)
        result.append(r);save('final-review-content-inspection.json',result)
        print(json.dumps(r),flush=True)

if mode=='archive-dependencies':
    result=[];identity=[];hash_cache={}
    for r in load('final-review-preservation.json'):
        for archive in r['archives']:
            with zipfile.ZipFile(Path(r['path'])/archive['path']) as z:
                for e in archive['entries']:
                    if e.get('disposition')!='reproducible_generated_material':continue
                    record={'id':r['id'],'archive':archive['path'],'entry':e['path'],'sha256':e['sha256']}
                    zi=z.getinfo(e['path'])
                    if (zi.external_attr>>16)&0o170000==0o120000:
                        record.update(disposition='archived_link_metadata',destination=z.read(zi).decode('utf-8',errors='replace'),created=False)
                    else:
                        candidate=ROOT/e['path'];matched=False
                        try:
                            components=candidate.relative_to(ROOT).parts;cur=ROOT
                            for part in components:
                                cur=cur/part
                                if attrs(cur)&1024:raise ValueError('No link traversal for dependency comparison')
                            if str(candidate) not in hash_cache:hash_cache[str(candidate)]=digest_file(candidate)
                            matched=hash_cache[str(candidate)]==e['sha256']
                        except (OSError,ValueError):pass
                        if matched:record.update(disposition='verified_duplicate_dependency',canonicalPath=str(candidate))
                        else:record.update(disposition='preserved_private_dependency_artifact',destination=preserve_stream(lambda:z.open(zi),e),size=e['size'])
                    if e['path'].endswith('package.json'):
                        try:
                            pkg=json.loads(z.read(zi));record['packageIdentity']={k:pkg[k] for k in ('name','version') if k in pkg}
                        except (ValueError,UnicodeDecodeError):record['packageIdentity']='invalid_json'
                    result.append(record)
            save('final-review-archive-refinement.json',result)
    print(json.dumps({'entries':len(result),'privateArtifacts':sum(r['disposition']=='preserved_private_dependency_artifact' for r in result),'canonicalDuplicates':sum(r['disposition']=='verified_duplicate_dependency' for r in result),'archivedLinks':sum(r['disposition']=='archived_link_metadata' for r in result)}))

if mode=='verify-remaining':
    scan=load('final-review-scan.json');preserved=load('final-review-preservation.json');results=load('final-review-file-verification.json') if (PRIVATE/'final-review-file-verification.json').exists() else []
    for t in targets:
        if any(r['id']==t['id'] for r in results):continue
        sc=next(s for s in scan if s['id']==t['id']);pnew=next(r for r in preserved if r['id']==t['id'])
        r={'id':t['id'],'verified':0,'missing':[],'changed':[],'filterChecks':0,'errors':[]}
        present={f['path'] for f in sc['files']};links={norm(l['path']) for l in sc['links']};fallback=[]
        for f in t['files']:
            rel=f['path'];p=Path(t['path'])/rel
            if f['classification']=='hold_reparse_point':
                if norm(p) not in links:r['errors'].append('Link type changed: '+rel)
                continue
            if f['classification'].startswith('hold_'):continue
            if rel not in present:r['missing'].append(rel);continue
            try:
                with open(p,'rb') as src:info,_=stream_info(src,p.stat().st_size)
            except OSError as error:
                r['errors'].append({'path':rel,'error':type(error).__name__,'errno':error.errno,'disposition':'unresolved_access_no_bypass'})
                continue
            if f.get('sha256'):
                if f['sha256']!=info['sha256']:r['changed'].append(rel)
            elif f.get('blob') and f['blob']!=info['blob']:
                if p.stat().st_size<16*1024*1024:
                    b=p.read_bytes(); b=b.decode('utf-8',errors='replace').replace('\r\n','\n').encode()
                    if hashlib.sha1(('blob '+str(len(b))+'\0').encode()+b).hexdigest()!=f['blob']:fallback.append((rel,p,f['blob']))
                else:fallback.append((rel,p,f['blob']))
            if f.get('destination') and digest_file(f['destination'])!=f['sha256']:r['errors'].append('Existing retained evidence mismatch: '+rel)
            r['verified']+=1
        if fallback:
            cwd=t['path'] if t['type'] in ('linked_worktree','independent_clone') else ROOT
            names=('\n'.join(str(x[1]) for x in fallback)+'\n').encode()
            attributes=git(['check-attr','--stdin','filter'],cwd=cwd,data=names).decode().splitlines()
            if any(not a.endswith(': unspecified') for a in attributes):r['errors'].append('External content filter requires review')
            else:
                hashes=git(['hash-object','--stdin-paths'],cwd=cwd,data=names).decode().splitlines()
                assert len(hashes)==len(fallback)
                r['changed'].extend(f[0] for f,h in zip(fallback,hashes) if f[2]!=h)
            r['filterChecks']=len(fallback)
        if t['type']=='linked_worktree':
            r['head']=git(['rev-parse','HEAD'],cwd=t['path']).decode().strip()
            r['status']=git(['-c','core.fsmonitor=false','status','--porcelain=v1','--untracked-files=all'],cwd=t['path']).decode().splitlines()
        for f in pnew['files']:
            if f.get('destination') and digest_file(f['destination'])!=f['sha256']:r['errors'].append('New retained evidence mismatch')
        results.append(r);save('final-review-file-verification.json',results)
        print(json.dumps({k:v for k,v in r.items() if k!='status'}),flush=True)

if mode=='archive-metadata':
    result=[]
    for r in load('final-review-preservation.json'):
        for a in r['archives']:
            p=Path(r['path'])/a['path']
            assert digest_file(p)==a['sha256']
            with zipfile.ZipFile(p) as z:
                entries=[{'path':e.filename,'dateTime':e.date_time,'crc32':e.CRC,'method':e.compress_type,'flags':e.flag_bits,'externalAttributes':e.external_attr,'createSystem':e.create_system,'extraBase64':base64.b64encode(e.extra).decode(),'commentBase64':base64.b64encode(e.comment).decode()} for e in z.infolist()]
                result.append({'id':r['id'],'path':a['path'],'sha256':a['sha256'],'commentBase64':base64.b64encode(z.comment).decode(),'entries':entries})
    save('final-review-archive-metadata.json',result)
    fragments=[];seen=set()
    for r in load('final-review-metadata.json'):
        for f in r['files']:
            if '/tmp_obj_' not in f['path'] or f['sha256'] in seen:continue
            seen.add(f['sha256']);entry={'sha256':f['sha256'],'destination':f['destination'],'disposition':'preserved_private_metadata'}
            try:
                data=zlib.decompress(Path(f['destination']).read_bytes());header,body=data.split(b'\0',1)
                entry.update(validZlib=True,objectHeader=header.decode('ascii'),objectId=hashlib.sha1(data).hexdigest(),decodedSize=len(body))
            except (zlib.error,ValueError):entry.update(validZlib=False,classification='interrupted_or_malformed_object_fragment_retained_exactly')
            fragments.append(entry)
    save('final-review-object-fragments.json',fragments)
    print(json.dumps({'archives':len(result),'archiveEntries':sum(len(a['entries']) for a in result),'gitObjectFragments':len(fragments),'malformedFragments':sum(not f['validZlib'] for f in fragments)}))

if mode=='finalize':
    before=load('final-review-before.json');scan=load('final-review-scan.json');preserved=load('final-review-preservation.json')
    verified=load('final-review-file-verification.json');deps=load('final-review-dependencies.json')
    assert len(scan)==len(preserved)==len(verified)==len(deps)==45
    unresolved=[{'id':r['id'],'errors':r['errors'],'missing':r['missing'],'changed':r['changed']} for r in verified if r['errors'] or r['missing'] or r['changed']]
    assert all(not s['errors'] for s in scan)
    assert git(['rev-parse','HEAD']).decode().strip()==before['head']
    assert git(['branch','--show-current']).decode().strip()==before['branch']
    assert digest_file(ROOT/'.git/index')==before['index']
    assert digest_file(ROOT/'apps/nursery/public/forge-nav.json')==before['nav']
    oldrefs=dict(line.split(' ') for line in before['refs'].strip().splitlines())
    newrefs=dict(line.split(' ') for line in git(['for-each-ref','--format=%(refname) %(objectname)','refs/heads/codex/preserve/']).decode().strip().splitlines())
    assert all(newrefs.get(k)==v for k,v in oldrefs.items())
    for f in load('handoff-prestate.json')['privateConfiguration']:assert digest_file(ROOT/f['path'])==f['sha256']
    assert all(Path(t['path']).exists() for t in targets)
    assert all(not Path(t['path']).exists() for t in after['outcomes'] if t['status']=='removed')
    retained_files=0;retained_bytes=0
    for prefix in (PRIVATE/'retained').iterdir():
        assert not attrs(prefix)&1024
        for p in prefix.iterdir():
            assert not attrs(p)&1024 and re.fullmatch('[0-9a-f]{64}',p.name)
            assert digest_file(p)==p.name
            retained_files+=1;retained_bytes+=p.stat().st_size
    edges=[]
    for sc in scan:
        edges.extend((child,sc['id']) for child in sc['nested'])
        edges.extend((sc['id'],d) for d in {l['destinationRoot'] for l in sc['links']} if d not in (sc['id'],'canonical'))
    todo=set(remaining_ids);order=[]
    while todo:
        possible=[x for x in sorted(todo) if not any(b==x and a in todo for a,b in edges)]
        assert possible,'Dependency cycle requires review'
        order.append(possible[0]);todo.remove(possible[0])
    rows=[]
    for t in targets:
        sc=next(s for s in scan if s['id']==t['id']);pr=next(s for s in preserved if s['id']==t['id']);vr=next(s for s in verified if s['id']==t['id']);dp=next(s for s in deps if s['id']==t['id'])
        rows.append({'id':t['id'],'path':t['path'],'type':t['type'],'originalStatus':t['status'],'refs':t['refs'],'links':len(sc['links']),
                     'linkKinds':{k:sum(l['kind']==k for l in sc['links']) for k in {l['kind'] for l in sc['links']}},
                     'linkDestinations':sorted({l['destinationRoot'] for l in sc['links']}),'sourceFilesVerified':vr['verified'],
                     'newEvidenceRecords':len(pr['files']),'archives':len(pr['archives']),'archiveEntries':sum(len(a['entries']) for a in pr['archives']),
                     'workingChanges':vr.get('status',[]),'verificationExceptions':vr['errors']+vr['missing']+vr['changed'],'dependencies':dp,'order':order.index(t['id'])+1})
    original_retained={f['sha256'] for t in manifest['targets'] for f in t['files'] if f.get('destination')}
    summary={'checkedAt':now(),'head':before['head'],'branch':before['branch'],'indexUnchanged':True,'navUnchanged':True,'privateConfigurationUnchanged':True,
             'existingRefsUnchanged':len(oldrefs),'totalRefs':len(newrefs),'newRefs':[{'ref':k,'commit':v} for k,v in newrefs.items() if k not in oldrefs],
             'retainedFiles':retained_files,'retainedBytes':retained_bytes,'newRetainedFiles':retained_files-len(original_retained),
             'links':sum(len(t['links']) for t in scan),'archives':sum(len(t['archives']) for t in preserved),
             'archiveEntries':sum(len(a['entries']) for t in preserved for a in t['archives']),'sourceFilesVerified':sum(r['verified'] for r in verified),
             'unresolvedContent':unresolved,'rows':rows,'order':order,'edges':sorted(set(edges)),'removedThisStage':0,'remainingSourceRoots':len(after['remainingSources']),'remainingWorktrees':len(after['worktrees'])}
    save('final-removal-proposal.json',summary)
    print(json.dumps({k:v for k,v in summary.items() if k not in ('rows','newRefs')},indent=2))
