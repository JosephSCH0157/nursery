import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync, readdirSync, lstatSync, realpathSync, rmSync} from 'node:fs';
import {resolve, join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PAYLOAD, PROJECT, releaseFor, STORAGE_RELEASES} from './lib/storage-successor-release-contract.mjs';

const CONFIGURATION = ['supabase/config.toml', 'supabase/templates/password_changed_notification.html'];
const PRIVATE_BASE = '.git/forge-private-evidence/storage-successor-release';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function git(repo, ...args) {
  return execFileSync('git', ['-C', repo, ...args], {maxBuffer: 100 * 1024 * 1024});
}

function payloadFiles(repo, names) {
  const data = execFileSync('git', ['-C', repo, 'cat-file', '--batch'], {
    input: names.map(p => `${PAYLOAD}:${p}\n`).join(''), maxBuffer: 100 * 1024 * 1024,
  });
  let offset = 0;
  const files = new Map();
  for (const name of names) {
    const end = data.indexOf(10, offset);
    assert.ok(end >= offset, 'missing_payload_header');
    const header = data.subarray(offset, end).toString().match(/^[a-f0-9]{40} blob (\d+)$/);
    assert.ok(header, 'missing_payload_blob');
    const size = Number(header[1]);
    offset = end + 1;
    files.set(name, data.subarray(offset, offset + size));
    offset += size;
    assert.equal(data[offset++], 10, 'payload_boundary');
  }
  assert.equal(offset, data.length, 'payload_trailing_bytes');
  return files;
}

// Offline validation only. Git objects are the byte authority; checkout filters
// may alter EOLs, but neither staged migrations nor configuration may drift.
export function validateSuccessorPayload(repo) {
  repo = realpathSync(resolve(repo));
  git(repo, 'merge-base', '--is-ancestor', PAYLOAD, 'HEAD');
  const list = ref => git(repo, 'ls-tree', '-r', '--name-only', ref, '--', 'supabase/migrations')
    .toString().trim().split('\n').filter(p => p.endsWith('.sql')).sort();
  const names = list(PAYLOAD);
  assert.equal(names.length, 446, 'payload_inventory_count');
  assert.deepEqual(list('HEAD'), names, 'committed_migration_inventory');
  assert.deepEqual(readdirSync(join(repo, 'supabase/migrations')).filter(p => p.endsWith('.sql'))
    .map(p => `supabase/migrations/${p}`).sort(), names, 'working_migration_inventory');
  git(repo, 'diff', '--exit-code', PAYLOAD, 'HEAD', '--', 'supabase/migrations', ...CONFIGURATION);
  git(repo, 'diff', '--exit-code', 'HEAD', '--', 'supabase/migrations', ...CONFIGURATION);
  const files = payloadFiles(repo, [...names, ...CONFIGURATION]);
  for (const path of files.keys()) {
    assert.ok(lstatSync(join(repo, path)).isFile(), 'payload_source_regular_file');
  }
  for (const r of STORAGE_RELEASES) {
    assert.equal(sha256(files.get(`supabase/migrations/${r.filename}`)), r.sha256, 'successor_hash');
  }
  const dependencies = [...files.get(CONFIGURATION[0]).toString()
    .matchAll(/^\s*content_path\s*=\s*"([^"]+)"/gm)].map(m => m[1]);
  assert.deepEqual(dependencies, ['./templates/password_changed_notification.html'], 'configuration_dependencies');
  return {repo, names, files};
}

function assertPrivateDirectory(repo, dir) {
  const base = realpathSync(join(repo, PRIVATE_BASE));
  const target = realpathSync(dir);
  assert.equal(dirname(target), base, 'private_direct_child_required');
  assert.ok(!lstatSync(dir).isSymbolicLink(), 'private_directory_link');
  return target;
}

export function verifySuccessorWorkdir(repo, version, dir) {
  const r = releaseFor(version);
  const payload = validateSuccessorPayload(repo);
  dir = assertPrivateDirectory(payload.repo, resolve(dir));
  const selected = payload.names.filter(p => p.split('/').at(-1).split('_')[0] <= r.version);
  assert.equal(selected.length, r.number, 'prefix_count');
  assert.deepEqual(readdirSync(dir).sort(), ['storage-successor-release.json', 'supabase'], 'workdir_inventory');
  assert.deepEqual(readdirSync(join(dir, 'supabase')).sort(), ['config.toml', 'migrations', 'templates'], 'supabase_inventory');
  for (const path of ['supabase', 'supabase/migrations', 'supabase/templates']) {
    assert.ok(lstatSync(join(dir, path)).isDirectory() && !lstatSync(join(dir, path)).isSymbolicLink(), 'staged_directory');
  }
  assert.deepEqual(readdirSync(join(dir, 'supabase/migrations')).sort(), selected.map(p => p.split('/').at(-1)), 'staged_inventory');
  assert.deepEqual(readdirSync(join(dir, 'supabase/templates')), ['password_changed_notification.html'], 'template_inventory');
  for (const path of [...selected, ...CONFIGURATION]) {
    assert.ok(lstatSync(join(dir, path)).isFile(), 'staged_regular_file');
    assert.deepEqual(readFileSync(join(dir, path)), payload.files.get(path), 'staged_bytes');
  }
  assert.ok(lstatSync(join(dir, 'storage-successor-release.json')).isFile(), 'manifest_regular_file');
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'storage-successor-release.json'), 'utf8')), {
    project: PROJECT, lineage: 'historical-v1', version: r.version, payload: PAYLOAD,
    files: selected, certification: 'BLOCKED', connected: false,
  }, 'release_manifest');
  return true;
}

export function prepareSuccessorWorkdir(repo, version) {
  const r = releaseFor(version);
  const payload = validateSuccessorPayload(repo);
  const base = join(payload.repo, PRIVATE_BASE);
  mkdirSync(base, {recursive: true, mode: 0o700});
  // This is an unlinked migration/configuration package, not a source checkout.
  // No credentials, pooler URL, data, or runnable application are copied.
  const dir = mkdtempSync(join(base, `${r.number}-`));
  try {
    mkdirSync(join(dir, 'supabase/migrations'), {recursive: true, mode: 0o700});
    mkdirSync(join(dir, 'supabase/templates'), {mode: 0o700});
    const selected = payload.names.filter(p => p.split('/').at(-1).split('_')[0] <= r.version);
    assert.equal(selected.length, r.number, 'prefix_count');
    for (const path of [...selected, ...CONFIGURATION]) {
      writeFileSync(join(dir, path), payload.files.get(path), {mode: 0o600});
    }
    writeFileSync(join(dir, 'storage-successor-release.json'), JSON.stringify({
      project: PROJECT, lineage: 'historical-v1', version: r.version, payload: PAYLOAD,
      files: selected, certification: 'BLOCKED', connected: false,
    }), {mode: 0o600});
    verifySuccessorWorkdir(payload.repo, version, dir);
    return dir;
  } catch (error) {
    rmSync(assertPrivateDirectory(payload.repo, dir), {recursive: true, force: true});
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [repo, version, dir] = process.argv.slice(2);
  assert.ok(repo && version, 'repository_and_fixed_version_required');
  console.log(dir ? verifySuccessorWorkdir(repo, version, dir) : prepareSuccessorWorkdir(repo, version));
}
