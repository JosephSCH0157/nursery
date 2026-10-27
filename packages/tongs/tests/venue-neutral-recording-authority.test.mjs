import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(new URL('../../../supabase/migrations/20260829120000_tongs_venue_neutral_recording_authority.sql', import.meta.url), 'utf8');
const authorityRepair = fs.readFileSync(new URL('../../../supabase/migrations/20261027030139_anvil_recording_authority_repair.sql', import.meta.url), 'utf8');

test('recording-origin creation and capture establishment remain separate authorities', () => {
  const createBody = migration.match(/create or replace function tongs\.create_recording_workpiece[\s\S]*?\$function\$;/)?.[0] ?? '';
  assert.match(createBody, /create_episode_identity_internal/);
  assert.doesNotMatch(createBody, /establish_recording_capture_authority|recording_capture_authorities|anvil_capture_executions/);
});

test('creation venue is provenance while capture venue belongs to the specific authority', () => {
  assert.match(migration, /recording_workpiece_creation_requests[\s\S]*origin_venue/);
  assert.match(migration, /recording_capture_authorities[\s\S]*add column venue text/);
  assert.doesNotMatch(migration, /alter table tongs\.episodes[\s\S]{0,300}add column[^;]*venue/);
});

test('script binding is conditional and Anvil runtime execution remains venue-specific', () => {
  assert.match(migration, /script_binding_kind='none'[\s\S]*script_approval_id is null/);
  assert.match(migration, /create table tongs\.anvil_capture_executions/);
  assert.match(migration, /alter table tongs\.recording_capture_authorities drop column capture_session_id/);
});

test('legacy script constraints are relaxed before unscripted authority backfill', () => {
  const relax = migration.indexOf('alter column script_path drop not null');
  const backfill = migration.indexOf('update tongs.recording_capture_authorities set venue');
  assert.ok(relax >= 0 && backfill >= 0 && relax < backfill);
});

test('completion stores the shared authority reference without copying venue or binding kind', () => {
  const body = migration.match(/create or replace function tongs\.recording_transition_take_completed[\s\S]*?\$function\$;/)?.[0] ?? '';
  assert.match(body, /recording_capture_authority_id/);
  assert.doesNotMatch(body, /insert into[^;]*\bvenue\b|insert into[^;]*script_binding_kind/);
  assert.match(migration, /current_workpiece_recorded_takes[\s\S]*join tongs\.recording_capture_authorities a on a\.id=c\.capture_authority_id/);
});

test('forward repair upgrades drifted decision receipts without rewriting legacy fingerprints', () => {
  assert.match(authorityRepair, /set local lock_timeout = '5s'/);
  assert.match(authorityRepair, /add column if not exists recording_capture_authority_id uuid null/);
  assert.match(authorityRepair, /set recording_capture_authority_id=c\.capture_authority_id/);
  assert.match(authorityRepair, /alter column recording_capture_authority_id set not null/);
  assert.match(authorityRepair, /alter column capture_session_id drop not null/);
  assert.match(authorityRepair, /trg_recording_completion_immutable/);
  assert.match(authorityRepair, /trg_recording_keep_immutable/);
  assert.match(authorityRepair, /trg_recording_discard_immutable/);
  assert.doesNotMatch(authorityRepair, /set\s+request_fingerprint\s*=/i);
});

test('decision repair resolves completion identity before idempotency fingerprint comparison', () => {
  const body = authorityRepair.slice(authorityRepair.indexOf('create or replace function tongs.recording_transition_take_decision'));
  assert.ok(body.indexOf('where completion_id=c.id') < body.indexOf('where workspace_id=a.workspace_id and idempotency_key=v_key'));
  assert.match(body, /a\.venue='anvil' and e\.execution_id is null/);
  assert.match(body, /a\.workspace_id,a\.workpiece_id,e\.execution_id,a\.id,c\.id/);
  assert.match(body, /revoke all on function tongs\.recording_transition_take_decision\(uuid,uuid,text,text,jsonb\) from public,anon/);
  assert.match(body, /grant execute on function tongs\.recording_transition_take_decision\(uuid,uuid,text,text,jsonb\) to authenticated,service_role/);
});
