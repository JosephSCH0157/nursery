import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(new URL('../../../supabase/migrations/20260829120000_tongs_venue_neutral_recording_authority.sql', import.meta.url), 'utf8');

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
