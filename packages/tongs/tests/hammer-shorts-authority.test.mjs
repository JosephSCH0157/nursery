import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { HAMMER_PASS_ID_VALUES, HAMMER_PASS_ORDER_VERSION, normalizeHammerOrchestrationState } from "../dist/hammer-orchestration-contract.js";

const migration = fs.readFileSync(new URL("../../../supabase/migrations/20260901150000_tongs_hammer_shorts_derivative_authority.sql", import.meta.url), "utf8");
const usableChildMigration = fs.readFileSync(new URL("../../../supabase/migrations/20260901153000_tongs_hammer_shorts_usable_child.sql", import.meta.url), "utf8");

test("Shorts is a persisted Hammer pass after packaging", () => {
  assert.equal(HAMMER_PASS_ORDER_VERSION, 3);
  assert.ok(HAMMER_PASS_ID_VALUES.indexOf("shorts") > HAMMER_PASS_ID_VALUES.indexOf("packaging"));
  assert.equal(normalizeHammerOrchestrationState({ current_pass: "shorts" }).current_pass, "shorts");
});

test("usable-child migration reserves identities and verifies every projected artifact", () => {
  assert.match(usableChildMigration, /child_canonical_recording_id set not null/);
  assert.match(usableChildMigration, /child_recording_revision_id set not null/);
  assert.match(usableChildMigration, /values\(v_revision[^;]+Projected Short/s);
  assert.match(usableChildMigration, /state[\s\S]+v_revision,'preparing'/);
  for (const artifact of ["transcript", "timing_map", "editor_session", "visual_timeline", "visual_placements", "audio_polish", "history"]) assert.match(usableChildMigration, new RegExp(`'${artifact}'`));
  assert.match(usableChildMigration, /reject_hammer_short_candidate/);
  assert.match(usableChildMigration, /fail_hammer_short_derivative/);
  assert.match(usableChildMigration, /active_revision_id=v_short\.child_recording_revision_id/);
});

test("migration establishes typed immutable ancestry and fail-closed RPCs", () => {
  for (const authority of ["workpiece_derivations", "hammer_shorts_basis_locks", "hammer_shorts_discoveries", "hammer_shorts_ai_proposals", "hammer_short_candidates", "hammer_short_derivatives"]) assert.match(migration, new RegExp(`create table tongs\\.${authority}`));
  assert.match(migration, /parent_workpiece_id uuid not null/);
  assert.match(migration, /child_workpiece_id uuid not null unique/);
  assert.match(migration, /hammer_shorts_canonical_evidence_immutable/);
  assert.match(migration, /hammer_shorts_candidate_stale/);
  assert.match(migration, /reserve_hammer_short_derivative/);
  assert.match(migration, /finalize_hammer_short_derivative/);
});
