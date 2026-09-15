"""Read-only partial-target audit. Writes only protected diagnostic metadata."""
import ctypes, hashlib, json, sys
from pathlib import Path
ROOT=Path('D:/nursery/nursery')
PRIVATE=ROOT/'.git/forge-consolidation-private'
load=lambda name:json.loads((PRIVATE/name).read_text(encoding='utf-8-sig'))
check=load('final-batch-check-T031.json')
root=Path(check['path'])
assert str(root).replace('\\','/').lower()=='c:/users/iam11/documents/codex/2026-09-12/next-bounded-owner-funded-hearth-research'
expected={e['path'].replace('\\','/').lower():e for e in check['entries']}
queue=[root];remaining=[];errors=[]
while queue:
    path=queue.pop()
    try:
        stat=path.lstat();flags=stat.st_file_attributes
        key=str(path).replace('\\','/').lower();old=expected.get(key)
        assert old is not None,'Unexpected remaining entry'
        if flags&1024:raise ValueError('Unexpected link; not traversed')
        directory=bool(flags&16)
        assert directory==old['directory']
        if not directory:
            assert stat.st_size==old['size'] and abs(stat.st_mtime_ns-old['mtimeNs'])<=1000000,'Remaining file metadata changed'
        sha=None
        if directory:queue.extend(path.iterdir())
        else:
            with path.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
        remaining.append({'path':str(path),'relative':str(path.relative_to(root)),'directory':directory,'attributes':flags,'size':0 if directory else stat.st_size,'sha256Now':sha,'readonly':bool(flags&1),'matchesPreRemovalMetadata':True})
    except Exception as e:errors.append({'path':str(path),'error':str(e)})
result={'target':'T031','remaining':remaining,'errors':errors,'remainingFiles':sum(not r['directory'] for r in remaining),'remainingDirectories':sum(r['directory'] for r in remaining),'readonlyFiles':sum(r['readonly'] and not r['directory'] for r in remaining),'entriesRemovedInAttempt':len(expected)-len(remaining),'noPermissionsOrAttributesChanged':True,'noLinksTraversed':True}
(PRIVATE/'continuation-T031-remnant.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k!='remaining'},indent=2))
