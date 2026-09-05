import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const root = new URL("../../../", import.meta.url);
const migration = readFileSync(new URL("supabase/migrations/20260905120000_tongs_bellows_record_only_foundation.sql", root), "utf8");
const capture = readFileSync(new URL("apps/nursery/src/lib/bellows/bellowsRecordOnlyCapture.ts", root), "utf8");
const route = readFileSync(new URL("apps/nursery/src/routes/BellowsStandalone.tsx", root), "utf8");

test("Bellows migration establishes canonical record-only authority", () => {
  for (const relation of [
    "bellows_session_participants",
    "bellows_tracks",
    "bellows_segments",
    "bellows_upload_parts",
    "bellows_sync_observations",
    "bellows_integrity_findings",
    "bellows_incomplete_acceptances",
    "bellows_capture_packages",
  ]) {
    assert.match(migration, new RegExp(`create table if not exists tongs\\.${relation}`));
    assert.match(migration, new RegExp(`alter table tongs\\.${relation} enable row level security`));
  }
  assert.match(migration, /authority_generation bigint not null default 1/);
  assert.match(migration, /bellows_stale_authority_generation/);
  assert.match(migration, /upload_state in \('queued','uploading','retryable_failed','permanently_failed','verified_received'\)/);
  assert.match(migration, /integrity_state in \('pending','verified','failed','unverifiable','missing'\)/);
  assert.match(migration, /insert into storage\.buckets\(id,name,public,file_size_limit,allowed_mime_types\)/);
});

test("browser capture retains local parts through verified canonical readback", () => {
  assert.match(capture, /indexedDB\.open/);
  assert.match(capture, /MediaRecorder\.isTypeSupported/);
  assert.match(capture, /register_bellows_upload_part/);
  assert.match(capture, /confirm_bellows_upload_part/);
  assert.match(capture, /verify_bellows_capture_segment/);
  assert.match(capture, /reserve_hammer_recording_import/);
  assert.match(capture, /finalize_hammer_recording_import/);
  assert.match(capture, /some\(\(part\) => part\.state !== "verified_received"\)/);
});

test("operator surface exposes real capture, recovery, and Hammer handoff", () => {
  assert.match(route, /data-testid="bellows-record-only-foundation"/);
  assert.match(route, />\s*Start Real Recording\s*</);
  assert.match(route, />\s*Resume Upload\s*</);
  assert.match(route, /Open Verified Result in Hammer/);
  assert.match(route, /window\.addEventListener\("beforeunload"/);
  assert.match(route, /workpieceId: routeContext\.workpieceId/);
});
