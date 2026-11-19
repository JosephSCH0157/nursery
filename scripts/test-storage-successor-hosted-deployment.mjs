import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {readFileSync, writeFileSync, readdirSync, rmSync, realpathSync, unlinkSync} from 'node:fs';
import {join, dirname} from 'node:path';
import test from 'node:test';
import {
  PAYLOAD, PROJECT, STORAGE_RELEASES, releaseFor, validateStorageState,
  validateStorageAuthorization, validatePredecessorReceipt, validateStorageRecovery,
} from './lib/storage-successor-release-contract.mjs';
import {PAYLOAD as ORIGINAL_PAYLOAD, releaseFor as originalReleaseFor} from './lib/storage-hosted-release-contract.mjs';
import {prepareSuccessorWorkdir, verifySuccessorWorkdir} from './prepare-storage-successor-hosted-workdir.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const state = (r, post = false) => ({
  projectRef: PROJECT, lineage: 'historical-v1', financialMode: 'test',
  certifiedPayloadCommit: PAYLOAD, payloadProvenanceOk: true, migrationSha256: r.sha256,
  databasePasswordAvailable: true, installedCount: r.number - (post ? 0 : 1),
  hostedHead: post ? r.version : r.predecessor, pendingVersions: post ? [] : [r.version],
  storageStage: r.stage - (post ? 0 : 1), storageContractOk: true,
  predecessorVerified: true, protectedAuthoritySha256: 'a'.repeat(64),
});

for (const r of STORAGE_RELEASES) {
  test(`${r.number}: exact version, bytes, and pre/post state`, () => {
    const bytes = execFileSync('git', ['show', `${PAYLOAD}:supabase/migrations/${r.filename}`]);
    assert.equal(digest(bytes), r.sha256);
    assert.equal(validateStorageState(r, state(r), {action: 'Preflight', operator: 'synthetic'}), true);
    assert.equal(validateStorageState(r, state(r, true), {action: 'PostVerify', operator: 'synthetic'}), true);
    for (const [key, value] of Object.entries({
      projectRef: 'wrong', lineage: 'baseline-v1', financialMode: 'live',
      certifiedPayloadCommit: ORIGINAL_PAYLOAD, payloadProvenanceOk: false,
      migrationSha256: '0'.repeat(64), databasePasswordAvailable: false,
      installedCount: r.number, hostedHead: r.version, pendingVersions: [r.version, '20990101000000'],
      storageStage: r.stage, storageContractOk: false, predecessorVerified: false,
      protectedAuthoritySha256: 'invalid',
    })) {
      assert.throws(() => validateStorageState(r, {...state(r), [key]: value}, {action: 'Preflight', operator: 'synthetic'}), key);
    }
  });

  test(`${r.number}: prior receipt binds the explicitly pinned payload transition`, () => {
    const receipt = {
      project_ref: PROJECT, payload_commit: r.predecessorPayload, target_version: r.predecessor,
      authorization_sha256: 'b'.repeat(64), protected_authority_sha256: 'a'.repeat(64),
    };
    assert.equal(r.predecessorPayload, r.number === 445 ? ORIGINAL_PAYLOAD : PAYLOAD);
    assert.equal(validatePredecessorReceipt(r, receipt, 'b'.repeat(64), 'a'.repeat(64)), true);
    for (const [key, value] of Object.entries({
      project_ref: 'other', payload_commit: '0'.repeat(40), target_version: r.version,
      authorization_sha256: 'c'.repeat(64), protected_authority_sha256: 'd'.repeat(64),
    })) {
      assert.throws(() => validatePredecessorReceipt(r, {...receipt, [key]: value}, 'b'.repeat(64), 'a'.repeat(64)), key);
    }
  });

  test(`${r.number}: valid owner token cannot bypass missing historical certification`, () => {
    const authorization = `FORGE-STORAGE-${r.number}:${PROJECT}:${r.version}:synthetic`;
    const options = {action: 'Apply', operator: 'synthetic', authorization, authorizationSha256: digest(authorization)};
    assert.deepEqual(validateStorageAuthorization(r, options), {operator: 'synthetic'});
    assert.throws(() => validateStorageState(r, state(r), options), /storage_successor_release_hold/);
    const cli = spawnSync(process.execPath, [`scripts/verify-storage-billing-${r.number}-hosted-deployment-policy.mjs`,
      '--action', 'Apply', '--state', 'must-not-be-read', '--authorization', authorization,
      '--authorization-sha256', digest(authorization)], {encoding: 'utf8'});
    assert.notEqual(cli.status, 0);
    assert.match(cli.stderr, /storage_successor_release_hold/);
    assert.doesNotMatch(cli.stderr, /ENOENT/);
    assert.throws(() => validateStorageAuthorization(r, {...options, authorization: authorization.replace(r.version, r.predecessor)}));
  });

  test(`${r.number}: backup evidence retains exact-project, freshness, and owner-reference checks`, () => {
    const now = new Date('2026-11-18T12:00:00Z');
    const observation = {
      schema: 'forge.supabase-management-backup-observation.v1', project_ref: PROJECT,
      endpoint: `/v1/projects/${PROJECT}/database/backups`, http_status: 200,
      observed_at: '2026-11-18T11:59:00.000Z', response_date: '2026-11-18T11:58:59.000Z',
      response_sha256: 'a'.repeat(64), backup_id: 'synthetic-backup', backup_status: 'COMPLETED',
      backup_timestamp: '2026-11-18T10:00:00.000Z', recovery_method: 'daily_physical_backup', pitr_enabled: false,
    };
    const evidence = {
      schema: 'forge.hosted-recovery-readiness.v2', verification_source: 'supabase_management_api',
      project_ref: PROJECT, backup_kind: 'daily', verified_at: observation.observed_at,
      latest_restorable_at: observation.backup_timestamp, recovery_operator: 'synthetic', restore_authorizer: 'synthetic owner',
      owner_approval_reference: `FORGE-STORAGE-${r.number}:SYNTHETIC`, restore_scope_acknowledged: true,
      unrelated_data_impact_acknowledged: true,
      management_api: {endpoint: observation.endpoint, backup_id: observation.backup_id, backup_status: observation.backup_status,
        backup_timestamp: observation.backup_timestamp, recovery_method: observation.recovery_method,
        response_sha256: observation.response_sha256, observed_at: observation.observed_at},
    };
    assert.match(validateStorageRecovery(r, evidence, now, observation).recoveryUseKey, /^[a-f0-9]{64}$/);
    assert.throws(() => validateStorageRecovery(r, {...evidence, owner_approval_reference: 'FORGE-STORAGE-440:wrong'}, now, observation));
    assert.throws(() => validateStorageRecovery(r, {...evidence, project_ref: 'wrong'}, now, observation));
    assert.throws(() => validateStorageRecovery(r, evidence, new Date('2026-11-20T12:00:00Z'), observation));
  });

  test(`${r.number}: unlinked package has the exact prefix and rejects tampering`, () => {
    const repo = realpathSync(process.cwd());
    const dir = prepareSuccessorWorkdir(repo, r.version);
    try {
      assert.equal(verifySuccessorWorkdir(repo, r.version, dir), true);
      assert.equal(readdirSync(join(dir, 'supabase/migrations')).length, r.number);
      assert.ok(!readdirSync(join(dir, 'supabase')).includes('.temp'));
      const migration = join(dir, 'supabase/migrations', r.filename);
      const bytes = readFileSync(migration);
      writeFileSync(migration, '-- changed');
      assert.throws(() => verifySuccessorWorkdir(repo, r.version, dir), /staged_bytes/);
      writeFileSync(migration, bytes);
      const unexpected = join(dir, 'supabase/migrations/20990101000000_unapproved.sql');
      writeFileSync(unexpected, 'select 1;');
      assert.throws(() => verifySuccessorWorkdir(repo, r.version, dir), /staged_inventory/);
      unlinkSync(unexpected);
      const template = join(dir, 'supabase/templates/password_changed_notification.html');
      const html = readFileSync(template);
      unlinkSync(template);
      assert.throws(() => verifySuccessorWorkdir(repo, r.version, dir), /template_inventory/);
      writeFileSync(template, html);
      const manifest = join(dir, 'storage-successor-release.json');
      const original = readFileSync(manifest);
      writeFileSync(manifest, original.toString().replace('BLOCKED', 'PASS'));
      assert.throws(() => verifySuccessorWorkdir(repo, r.version, dir), /release_manifest/);
      writeFileSync(manifest, original);
      assert.equal(verifySuccessorWorkdir(repo, r.version, dir), true);
    } finally {
      assert.equal(dirname(realpathSync(dir)), realpathSync(join(repo, '.git/forge-private-evidence/storage-successor-release')));
      rmSync(dir, {recursive: true, force: true});
    }
  });
}

test('old and new executors retain disjoint closed version sets', () => {
  for (const r of STORAGE_RELEASES) assert.throws(() => originalReleaseFor(r.version), /unsupported_storage_release/);
  assert.throws(() => releaseFor('20261111201029'), /unsupported_storage_successor/);
  assert.throws(() => releaseFor('20990101000000'), /unsupported_storage_successor/);
});
