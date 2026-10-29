import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root=resolve(import.meta.dirname,"../../..");
const migration=readFileSync(resolve(root,"supabase/migrations/20260827120000_tongs_hammer_preparation_authority.sql"),"utf8");
const editor=readFileSync(resolve(root,"apps/hammer/src/editor/HammerWorkspaceEditor.tsx"),"utf8");
const persistence=readFileSync(resolve(root,"apps/hammer/src/persistence/hammerRecordingRevisionPersistence.ts"),"utf8");
const tongs=readFileSync(resolve(root,"packages/tongs/src/workpiece-commit-api.ts"),"utf8");

test("Hammer open atomically reserves one durable preparation authority",()=>{
  assert.match(migration,/create table tongs\.hammer_preparation_attempts/);
  assert.match(migration,/hammer_preparation_one_active_revision_idx/);
  assert.match(migration,/create or replace function tongs\.open_hammer_authority/);
  assert.match(migration,/hammer_open_idempotency_conflict/);
  assert.match(migration,/for update/);
});

test("the client consumes preparation authority and cannot infer a stall from local inactivity",()=>{
  assert.match(persistence,/hammer\/open-authority/);
  assert.match(editor,/const preparationAttemptId = activePreparationAttemptRef\.current\?\.id \?\? null/);
  assert.match(editor,/claimHammerAiFallbackJobRequest\(\{[\s\S]*?preparationAttemptId,[\s\S]*?\}\)/);
  assert.match(editor,/requestHammerTranscriptPrep\(transcriptRequest\)/);
  assert.match(editor,/attempt: activePreparationAttemptRef\.current/);
  assert.doesNotMatch(editor,/preparation_stalled/);
  assert.doesNotMatch(editor,/shouldTerminateIdleHammerLoadingContext/);
});

test("transcript jobs are children and baseline promotion remains version guarded",()=>{
  assert.match(migration,/transcript_job_id uuid null references tongs\.workpiece_jobs/);
  assert.match(migration,/p_expected_state_version bigint/);
  assert.match(migration,/preparation_state_changed/);
  assert.match(tongs,/expected_state_version: hammerPreparationAttempt\.state_version/);
});
