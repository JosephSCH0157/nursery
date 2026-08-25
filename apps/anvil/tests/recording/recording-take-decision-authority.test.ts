import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../../..");
const localAuto = fs.readFileSync(path.join(root, "apps/anvil/src/recording/local-auto.ts"), "utf8");
const authority = fs.readFileSync(path.join(root, "apps/anvil/src/forge/workpiece-commit.ts"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260825190000_tongs_anvil_take_decision_authority.sql"), "utf8");

test("completion opens explicit canonical Keep and Discard actions", () => {
  expect(localAuto).toMatch(/showRecordingDecisionDialog[\s\S]*transitionRecordingKept[\s\S]*transitionRecordingDiscarded/);
  expect(localAuto).not.toContain("Recording verified and ready for Hammer.");
  expect(localAuto).toContain("Take kept and ready for Hammer.");
});

test("recovery is sourced from canonical undecided completions", () => {
  expect(authority).toContain("pending-recording-decisions");
  expect(migration).toMatch(/left join tongs\.anvil_recording_keep_requests[\s\S]*left join tongs\.anvil_recording_discard_requests[\s\S]*k\.id is null and d\.id is null/);
});

test("Keep and Discard are mutually exclusive and idempotent", () => {
  expect(migration).toMatch(/anvil_transition_take_kept[\s\S]*take_already_discarded/);
  expect(migration).toMatch(/anvil_transition_take_discarded[\s\S]*take_already_kept/);
  expect(migration.match(/pg_advisory_xact_lock\(hashtextextended\(p_completion_id::text,0\)\)/g)).toHaveLength(2);
  expect(migration).toMatch(/unique \(completion_id\)/);
});
