"""Exact 90-ref approval only; no checkout, merge, fetch, code push or GC.

Remote deletions carry explicit expected-SHA leases. Ordinary local refusals
are final skips. Only the approved HE9 branch may use branch -D.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess

ROOT = Path('D:/nursery/nursery')
PRIVATE = ROOT / '.git/forge-consolidation-private'
MANIFEST = PRIVATE / 'approved-branch-cleanup.json'
PIN = '83fc153538fd11144a1946f6121d161aa066861a429caf1513a3e88b855281c1'
SPECIAL = 'codex/he9-hydration-fix'
DOCS = ['docs/maintenance/FORGE_SINGLE_ROOT_CONSOLIDATION_REVIEW.md',
        'docs/maintenance/FORGE_CONSOLIDATION_PRESERVATION_REPORT.md']
ENV = dict(os.environ, GIT_OPTIONAL_LOCKS='0')

def now(): return dt.datetime.now(dt.timezone.utc).isoformat()
def digest(path):
    with open(path, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()
def load(name): return json.loads((PRIVATE / name).read_text(encoding='utf-8-sig'))
def save(name, value): (PRIVATE / name).write_text(json.dumps(value, indent=2), encoding='utf-8')
def command(args, check=True, data=None):
    r = subprocess.run(args, cwd=ROOT, env=ENV, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if check and r.returncode:
        raise RuntimeError('Command refused: ' + ' '.join(args[:4]) + ': ' + r.stderr.decode(errors='replace')[:500])
    return r
def git(*args): return command(['git', *args]).stdout.decode().strip()
def api(*args): return json.loads(command(['gh', *args]).stdout)
def local_refs():
    return dict(line.split(' ', 1) for line in git('for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads').splitlines())
def remote_refs(*names):
    return {ref: sha for sha, ref in (line.split() for line in git('ls-remote', '--heads', 'origin', *names).splitlines())}
def key(row): return row['location'] + ':' + row['name']
def ancestor(sha, main):
    return command(['git', 'merge-base', '--is-ancestor', sha, main], check=False).returncode == 0
def worktrees():
    return [dict(line.split(' ', 1) if ' ' in line else (line, True) for line in block.splitlines())
            for block in git('worktree', 'list', '--porcelain').split('\n\n')]
def config_records():
    return command(['git', 'config', '--local', '--null', '--list']).stdout.decode().split('\0')
def task_rows():
    with sqlite3.connect('file:C:/Users/Iam11/.codex/state_5.sqlite?mode=ro', uri=True) as db:
        return [dict(zip(['id','cwd','branch','updatedAt','archived'], row))
                for row in db.execute('SELECT id,cwd,git_branch,updated_at,archived FROM threads')]
def patch_id(sha):
    patch = command(['git', 'show', '--format=', '--no-ext-diff', sha]).stdout
    return command(['git', 'patch-id', '--stable'], data=patch).stdout.decode().split()[0]

assert digest(MANIFEST) == PIN, 'Approval manifest changed'
m = load(MANIFEST.name)
rows = m['entries']
assert len(rows) == 90 and len({key(row) for row in rows}) == 90
assert sum(row['location'] == 'L' for row in rows) == 45
assert sum(row['location'] == 'R' for row in rows) == 45
assert [r['name'] for r in rows if r['evidence'] == 'patch_equivalent'] == [SPECIAL]
assert all(r['name'] not in ('main', m['checkout']) and not r['name'].startswith('codex/preserve/') for r in rows)

def special_evidence():
    result = []
    for source, target in m['patchMappings']:
        assert ancestor(target, m['main']), 'Equivalent commit no longer in approved main'
        left, right = patch_id(source), patch_id(target)
        assert left == right, 'HE9 patch mismatch'
        result.append({'source':source, 'mainCommit':target, 'patchId':left})
    ref = next(r for r in rows if r['name'] == SPECIAL)
    assert set(git('rev-list', m['main'] + '..' + ref['sha']).splitlines()) == {p[0] for p in m['patchMappings']}
    anchors = {n:s for n,s in local_refs().items() if n.startswith('refs/heads/codex/preserve/') and s == ref['sha']}
    assert len(anchors) == 3, 'HE9 preservation anchors changed'
    return {'patches':result, 'anchors':anchors}

def invariant(before):
    assert git('rev-parse', 'HEAD') == m['head']
    assert git('branch', '--show-current') == m['checkout']
    assert digest(ROOT / '.git/index') == before['index'], 'Staging changed'
    assert worktrees() == before['worktrees'], 'Worktree ownership changed'
    current = local_refs()
    for name, sha in before['protectedLocal'].items():
        assert current.get(name) == sha, 'Protected local ref changed: ' + name
    for entry in before['fileHashes']:
        if entry['path'] not in DOCS:
            assert digest(ROOT / entry['path']) == entry['sha256'], 'Source/configuration changed: ' + entry['path']

def fresh_dependencies(row, before):
    assert worktrees() == before['worktrees'], 'Worktree changed'
    assert not any(w.get('branch') == 'refs/heads/' + row['name'] for w in worktrees()), 'Branch checked out'
    snap = load('branch-cleanup-app-tasks.json')
    age = (dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(snap['checkedAt'].replace('Z','+00:00'))).total_seconds()
    assert age < 600 and not snap['unavailableHosts'] and not snap['unavailableSources'], 'Refresh app task snapshot'
    current_tasks = task_rows()
    active = {t['id'] for t in snap['threads'] if t['status'] not in ('notLoaded','idle')}
    for task in current_tasks:
        if task['archived'] or task['branch'] != row['name']: continue
        assert task['id'] not in active, 'Active task references branch'
        previous = before['tasks'].get(task['id'])
        assert previous and task['updatedAt'] <= previous['updatedAt'], 'Task dependency changed since preflight'
    prs = api('pr','list','--repo',m['repository'],'--state','open','--limit','100',
              '--json','number,headRefName,baseRefName')
    assert len(prs) < 100, 'PR snapshot requires pagination'
    assert not any(row['name'] in (p['headRefName'], p['baseRefName']) for p in prs), 'Open PR depends on branch'
    runs = []
    for status in ('in_progress','queued','waiting','pending','requested'):
        batch = api('run','list','--repo',m['repository'],'--status',status,'--limit','100',
                    '--json','databaseId,headBranch,status')
        assert len(batch) < 100, 'Run snapshot requires pagination'
        runs.extend(batch)
    assert not any(r['headBranch'] == row['name'] for r in runs), 'Live workflow depends on branch'
    return {'checkedAt':now(), 'openPRs':len(prs), 'liveRuns':len(runs), 'activeTaskIds':sorted(active)}

parser = argparse.ArgumentParser()
parser.add_argument('mode', choices=['prepare','run','verify'])
parser.add_argument('--location', choices=['L','R'])
parser.add_argument('--offset', type=int, default=0)
parser.add_argument('--limit', type=int, default=10)
args = parser.parse_args()
if args.mode == 'prepare':
    assert not (PRIVATE / 'branch-cleanup-before.json').exists(), 'Prestate already exists'
    locals_before, remotes_before = local_refs(), remote_refs()
    assert remotes_before.get('refs/heads/main') == m['main']
    original = load('final-batch-before.json')
    assert {n:s for n,s in locals_before.items() if n.startswith('refs/heads/codex/preserve/')} == original['refs']
    assert len(original['refs']) == 270
    for row in rows:
        found = (locals_before if row['location']=='L' else remotes_before).get('refs/heads/'+row['name'])
        if found == row['sha'] and row['evidence']=='ancestor':
            assert ancestor(row['sha'], m['main']), 'Incorporation evidence failed'
    snapshots = PRIVATE / 'branch-cleanup-maintenance-prestate'
    snapshots.mkdir(exist_ok=False)
    for path in DOCS: shutil.copyfile(ROOT/path, snapshots/Path(path).name)
    paths = set(git('diff','--name-only','HEAD').splitlines() + git('ls-files','--others','--exclude-standard').splitlines())
    paths.update(f['path'] for f in original['privateConfiguration'])
    allowed_local = {'refs/heads/'+r['name'] for r in rows if r['location']=='L'}
    allowed_remote = {'refs/heads/'+r['name'] for r in rows if r['location']=='R'}
    before = {'checkedAt':now(), 'local':locals_before, 'remote':remotes_before,
              'protectedLocal':{n:s for n,s in locals_before.items() if n not in allowed_local},
              'protectedRemote':{n:s for n,s in remotes_before.items() if n not in allowed_remote},
              'index':digest(ROOT/'.git/index'), 'worktrees':worktrees(),
              'config':config_records(), 'tasks':{t['id']:t for t in task_rows()},
              'fileHashes':[{'path':p,'sha256':digest(ROOT/p)} for p in sorted(paths) if (ROOT/p).is_file()],
              'specialEvidence':special_evidence()}
    invariant(before)
    save('branch-cleanup-before.json', before)
    save('branch-cleanup-journal.json', [])
    print(json.dumps({'local':len(locals_before),'remote':len(remotes_before),'protectedPreservationRefs':270,'preflight':'passed'}))
elif args.mode == 'run':
    assert args.location, 'Explicit location required'
    before = load('branch-cleanup-before.json')
    journal = load('branch-cleanup-journal.json')
    chosen = [r for r in rows if r['location']==args.location][args.offset:args.offset+args.limit]
    for row in chosen:
        assert key(row) not in {key(r) for r in journal}, 'Do not retry a processed/refused entry'
        result = dict(row, startedAt=now(), status='checking')
        try:
            invariant(before)
            ref = 'refs/heads/' + row['name']
            live = remote_refs('refs/heads/main', ref)
            assert live.get('refs/heads/main') == m['main'], 'Remote main changed; stop and review'
            found = local_refs().get(ref) if row['location']=='L' else live.get(ref)
            assert found == row['sha'], 'Tip changed or disappeared'
            if row['evidence']=='ancestor': assert ancestor(row['sha'],m['main']), 'Tip not incorporated'
            else: result['specialEvidence'] = special_evidence()
            result['dependencies'] = fresh_dependencies(row,before)
            invariant(before)
            if row['location']=='L':
                assert local_refs().get(ref) == row['sha'], 'Local tip changed before removal'
                flag = '-D' if row['name']==SPECIAL else '-d'
                invocation = ['git','branch',flag,'--',row['name']]
                result['method'] = 'git branch '+flag
            else:
                invocation = ['git','-c','push.followTags=false','push','--porcelain',
                              '--force-with-lease='+ref+':'+row['sha'],'origin',':'+ref]
                result['method'] = 'remote deletion with explicit expected-SHA lease'
            # Persist intent before the external/local side effect. An uncertain
            # result is never retried automatically.
            result['status']='deleting';journal.append(result);save('branch-cleanup-journal.json',journal)
            response = command(invocation,check=False)
            result['gitExitCode'] = response.returncode
            result['gitOutput'] = response.stdout.decode(errors='replace') + response.stderr.decode(errors='replace')
            if response.returncode: raise RuntimeError('Git refused deletion; no override or retry')
            remaining = local_refs() if row['location']=='L' else remote_refs(ref)
            assert ref not in remaining, 'Deletion could not be confirmed'
            result['status']='deleted'
        except Exception as error:
            result['status']='uncertain_or_refused' if result['status']=='deleting' else 'skipped'
            result['reason']=str(error)
        result['finishedAt']=now()
        if not any(key(r)==key(row) for r in journal):journal.append(result)
        save('branch-cleanup-journal.json',journal)
        print(json.dumps({k:result.get(k) for k in ('location','name','status','reason')}),flush=True)
else:
    before=load('branch-cleanup-before.json');journal=load('branch-cleanup-journal.json')
    invariant(before)
    current_local,current_remote=local_refs(),remote_refs()
    for n,s in before['protectedRemote'].items(): assert current_remote.get(n)==s, 'Excluded remote changed'
    deleted_local={'refs/heads/'+r['name'] for r in journal if r['status']=='deleted' and r['location']=='L'}
    deleted_remote={'refs/heads/'+r['name'] for r in journal if r['status']=='deleted' and r['location']=='R'}
    assert current_local=={n:s for n,s in before['local'].items() if n not in deleted_local}, 'Unexpected local-ref delta'
    assert current_remote=={n:s for n,s in before['remote'].items() if n not in deleted_remote}, 'Unexpected remote-ref delta'
    def kept_config(lines):
        prefixes=['branch.'+n.removeprefix('refs/heads/')+'.' for n in deleted_local]
        return [v for v in lines if not any(v.split('\n',1)[0].startswith(p) for p in prefixes)]
    assert kept_config(before['config'])==kept_config(config_records()), 'Unrelated local configuration changed'
    result={'checkedAt':now(),'deletedLocal':len(deleted_local),'deletedRemote':len(deleted_remote),
            'skippedOrRefused':[r for r in journal if r['status']!='deleted'],
            'unprocessed':len(rows)-len(journal),'remainingLocal':len(current_local),
            'ordinaryLocal':len(current_local)-270,'remainingRemote':len(current_remote),
            'preservationRefsUnchanged':270,'excludedRefsUnchanged':True,'sourceStagingPrivateConfigurationUnchanged':True,
            'remainingLocalRefs':current_local,'remainingRemoteRefs':current_remote}
    save('branch-cleanup-after.json',result)
    print(json.dumps({k:v for k,v in result.items() if k not in ('remainingLocalRefs','remainingRemoteRefs')},indent=2))
