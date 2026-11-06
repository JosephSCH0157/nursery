import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const entry = path.join(root, 'scripts/start-forge-disposable-ci-database.ps1');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const setup = read('scripts/start-forge-disposable-ci-database.ps1');
const workflow = read('.github/workflows/pr-smoke.yml');

test('both failing jobs use the guarded CI entrypoint; ordinary provisioning stays separate', () => {
  for (const job of ['barstock-production-gate', 'nursery-browser-gate']) {
    const body = workflow.split('  ' + job + ':')[1].split(/\n  [a-z][a-z-]+:/)[0];
    assert.match(body, /start-forge-disposable-ci-database\.ps1.*-DisposableCI/);
    assert.doesNotMatch(body, /-Action Start/);
    assert.match(body, /invoke-forge-database\.ps1.*-Action Stop/);
  }
  assert.doesNotMatch(read('scripts/invoke-forge-database.ps1'), /start-forge-disposable-ci|canonical_luna_provider_alignment_authority/);
  assert.doesNotMatch(read('scripts/new-forge-database-workdir.ps1'), /canonical_luna_provider_alignment_authority/);
});

test('all reviewed guard and prerequisite sources retain their exact Git blob identities', () => {
  for (const [file, expected] of Object.entries({
    'supabase/migrations/20261104143249_align_provider_requests_and_luna_financial_authority.sql': 'ef6fa748d68cbf803e2e4128cd45324cf08801e2',
    'supabase/tests/fixtures/canonical_luna_provider_alignment_authority.sql': '2e47ecefcb35045d91d38c0b95ab3d6d1c987c9a',
    'supabase/tests/fixtures/canonical_owner_hearth_aggregate_policy_prerequisites.sql': 'd0bd6e5aa848a02486f881c537a2a0184f8285a4',
  })) {
    const bytes = fs.readFileSync(path.join(root, file));
    const hash = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
    assert.equal(hash, expected, file);
  }
});

test('the full suffix is withheld and restored before normal local migration execution', () => {
  assert.match(setup, /\$prefixHead = '20261104071802'/);
  assert.match(setup, /\$pending = @\(\$files \| Where-Object.*-gt \$prefixHead/);
  const order = [
    'foreach ($file in $pending) { Move-Item',
    "Invoke-LocalSupabase @('start'",
    '-Stage fixture',
    "canonical_owner_hearth_aggregate_policy_prerequisites.sql",
    "canonical_luna_provider_alignment_authority.sql",
    '-Stage alignment',
    '  Restore-PendingMigrations',
    '-DatabaseTarget local -Mode preflight',
    "Invoke-LocalSupabase @('migration','up','--local'",
    'Assert-ExactHistory @($files | ForEach-Object Name)',
    "'provider_request_financial_alignment.sql'",
    '-Stage successor',
  ];
  let offset = 0;
  for (const token of order) {
    const index = setup.indexOf(token, offset);
    assert.ok(index >= offset, 'missing or misordered stage: ' + token);
    offset = index + token.length;
  }
  assert.match(setup, /finally \{[\s\S]*Restore-PendingMigrations[\s\S]*Get-FileHash/);
  assert.doesNotMatch(setup, /--linked|--include-all|migration\s+repair|db','push/);
});

test('PowerShell entrypoint and regression runner parse without errors', () => {
  for (const file of ['scripts/start-forge-disposable-ci-database.ps1', 'scripts/test-forge-disposable-ci-guards.ps1']) {
    const result = spawnSync('pwsh', ['-NoProfile', '-Command',
      '$errors=$null; $tokens=$null; [void][System.Management.Automation.Language.Parser]::ParseFile($env:FORGE_TEST_PARSE_PATH,[ref]$tokens,[ref]$errors); if($errors.Count){$errors | ForEach-Object {Write-Error $_}; exit 1}',
      ], { encoding: 'utf8', env: { ...process.env, FORGE_TEST_PARSE_PATH: path.join(root, file) } });
    assert.equal(result.status, 0, result.error?.message || result.stderr);
  }
});

test('entrypoint rejects missing opt-in and non-job-owned paths before Docker access', () => {
  const runner = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-ci-guard-'));
  try {
    const env = { ...process.env, GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'JosephSCH0157/nursery',
      GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', RUNNER_TEMP: runner };
    for (const [workdir, flags, message] of [
      [path.join(runner, 'forge-barstock-baseline'), [], /explicit opt-in/],
      [path.join(runner, 'unrelated'), ['-DisposableCI'], /exact job-owned path/],
      [path.join(runner, 'nested/forge-barstock-baseline'), ['-DisposableCI'], /exact job-owned path/],
    ]) {
      const result = spawnSync('pwsh', ['-NoProfile', '-File', entry, '-Workdir', workdir, ...flags], { env, encoding: 'utf8' });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, message);
    }
  } finally {
    fs.rmSync(runner, { recursive: true, force: true });
  }
});

test('negative financial tests execute original guard predicates on isolated snapshots', () => {
  const tests = read('scripts/test-forge-disposable-ci-guards.ps1');
  for (const name of ['missing opt-in','wrong lineage','missing lineage marker','wrong exact head',
    'existing synthetic user','existing synthetic operator','existing predecessor',
    'missing cost predecessor','changed cost ceiling','changed rate condition','changed customer price',
    'changed rollout','fixture at populated predecessor','fixture after tail resumed']) {
    assert.ok(tests.includes("'" + name + "'"), name);
  }
  assert.match(tests, /create temp table/);
  assert.match(tests, /'rollback;'/);
  assert.match(tests, /Get-Content.*canonical_luna_provider_alignment_authority/);
  assert.match(tests, /Get-Content.*20261104143249/);
  assert.doesNotMatch(tests, /(?:update|delete from|insert into) (?:forge_meta|supabase_migrations)\./i);
});
