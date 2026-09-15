"""Read-only app metadata inspection; writes only protected audit snapshots.

Persisted tab routes are history, not evidence of a live editor buffer.
No Codex state mutation, UI automation, source copying, or deletion.
"""
import datetime
import json
import sqlite3
from pathlib import Path

ROOT = Path('D:/nursery/nursery')
PRIVATE = ROOT / '.git/forge-consolidation-private'
TARGET = 'd:/nursery/forge-beta-preparation'

def within(value):
    value = str(value).replace('\\', '/').lower().rstrip('/')
    return value == TARGET or value.startswith(TARGET + '/')

state = json.loads(Path('C:/Users/Iam11/.codex/.codex-global-state.json').read_text(encoding='utf-8'))
matches = []

def walk(value, keys):
    if isinstance(value, dict):
        for key, child in value.items():
            walk(child, keys + [key])
    elif isinstance(value, list):
        for i, child in enumerate(value):
            walk(child, keys + [str(i)])
    elif isinstance(value, str) and TARGET in value.replace('\\', '/').lower():
        # Keep only the structural location, never prompts, secrets or buffers.
        matches.append({'keyPath': '/'.join(keys), 'exactPathReference': within(value)})

walk(state, [])
with sqlite3.connect('file:C:/Users/Iam11/.codex/state_5.sqlite?mode=ro', uri=True) as db:
    tasks = [{'id': row[0], 'cwd': row[1], 'archived': bool(row[2])}
             for row in db.execute('SELECT id,cwd,archived FROM threads') if within(row[1])]
result = {
    'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'target': 'D:\\nursery\\forge-beta-preparation',
    'persistedReferences': matches,
    'tasksWithTargetCwd': tasks,
    'activeTaskDependencies': [task for task in tasks if not task['archived']],
    'userAttestation': 'Latest request: full reboot completed; no visible open tabs for this checkout.',
    'windowInspection': 'Window listing: Chrome, ChatGPT-labelled Codex package, Docker Desktop; no separate editor window. Desktop internals not inspected under computer-use restriction.',
    'bufferInspectionLimit': 'No direct access to in-memory editor buffers. User confirmation is the source for no visible open tabs; persisted routes alone do not establish live or unsaved content.',
    'appStateModified': False,
}
assert not result['activeTaskDependencies'], 'Active task depends on T020'
out = PRIVATE / 't020-current-reference-inspection.json'
out.write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result, indent=2))
