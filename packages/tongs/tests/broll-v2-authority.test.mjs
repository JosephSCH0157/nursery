import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration=readFileSync(new URL("../../../supabase/migrations/20260803170000_tongs_broll_v2_authority.sql",import.meta.url),"utf8");
const readbackMigration=readFileSync(new URL("../../../supabase/migrations/20260804130000_tongs_broll_candidate_readback.sql",import.meta.url),"utf8");
test("B-roll V2 establishes immutable plans, beats, prompts, candidates, selections, and receipts",()=>{
  for(const name of ["broll_plan_revisions","broll_beat_revisions","broll_prompt_revisions","broll_candidate_revisions","broll_selections","broll_operation_receipts"])assert.match(migration,new RegExp(`create table tongs\\.${name}`));
  assert.match(migration,/reject_broll_immutable_mutation/);assert.match(migration,/revoke all on tongs\.%I from public,anon,authenticated/);
});
test("B-roll V2 reserves external work and requires a verified video asset before candidate commit",()=>{
  assert.match(migration,/begin_broll_operation/);assert.match(migration,/provider_or_upload_completed/);assert.match(migration,/verify_broll_operation_asset/);assert.match(migration,/status='ready'.*mime_type like 'video\/%'.*content_hash is not null.*ready_at is not null/s);
  assert.match(migration,/verify_broll_operation_poster/);assert.match(migration,/asset_kind='broll_candidate_poster'/);assert.match(migration,/fail_broll_operation/);
});
test("stock and URL references cannot become selections without canonical candidate assets",()=>{
  assert.match(migration,/verified_video_asset_required/);assert.match(migration,/asset_verification_required/);assert.match(migration,/candidate_not_attached/);
});
test("selection is expected-revision concurrent and terminal replay returns the same receipt",()=>{
  assert.match(migration,/selection_revision_conflict/);assert.match(migration,/plan_revision_conflict/);assert.match(migration,/return v_op\.receipt_json/);
  assert.match(migration,/old\.state in\('committed','candidate_committed','selected'\)/);
  assert.match(migration,/asset_path text not null/);
});
test("current B-roll readback projects every candidate with canonical video and poster assets",()=>{
  assert.match(readbackMigration,/'candidate_revisions'/);
  assert.match(readbackMigration,/join tongs\.assets video_asset on video_asset\.id=cr\.asset_id/);
  assert.match(readbackMigration,/left join tongs\.assets poster_asset on poster_asset\.id=cr\.poster_asset_id/);
});
