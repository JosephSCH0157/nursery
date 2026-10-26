import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { useNewTakeThenOpen } from "../src/app/hammerTakeAdoption";
import { buildHammerPreparedReleasePackage, resolveHammerPreparedPackageForRecording } from "../src/lib/hammerPreparedReleasePackage";
import { buildHammerReleasePrepPackage } from "../src/lib/hammerReleasePrepPackage";

const target = {
  workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  workpieceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};

function assertLandingPadCardContract(rawSource: string): void {
  const source = rawSource.replace(/\r\n?/g, "\n");
  const articleMarker = "<article\n              key={project.workpieceId}";
  const bodyMarker = '<div className="hammer-project-library__card-body">';
  const articleStart = source.indexOf(articleMarker);
  const bodyStart = source.indexOf(bodyMarker, articleStart);
  const articleOpening = source.slice(articleStart, bodyStart);
  assert.ok(articleStart >= 0 && bodyStart > articleStart);
  assert.doesNotMatch(articleOpening, /onClick|onKeyDown|tabIndex/);
  assert.match(source, />\s*Open Current Edit\s*</);
  assert.match(source, /"Use New Take"/);
}

test("Use New Take adopts first and opens only after canonical authority returns", async () => {
  const calls: string[] = [];
  await useNewTakeThenOpen({
    target,
    adopt: async () => {
      calls.push("adopt");
      return { outcome: "adopted", canonicalRecordingId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" };
    },
    open: (_target, authority) => calls.push(`open:${authority.canonicalRecordingId}`),
  });
  assert.deepEqual(calls, ["adopt", "open:cccccccc-cccc-4ccc-8ccc-cccccccccccc"]);
});

test("failed take adoption never opens Hammer", async () => {
  let opened = false;
  await assert.rejects(() => useNewTakeThenOpen({
    target,
    adopt: async () => { throw new Error("adoption failed"); },
    open: () => { opened = true; },
  }), /adoption failed/);
  assert.equal(opened, false);
});

test("Landing Pad cards are informational and expose independent commands", async () => {
  const source = await readFile(new URL("../src/app/HammerProjectLibrary.tsx", import.meta.url), "utf8");
  assertLandingPadCardContract(source);
});

test("Landing Pad card contract is newline-portable and fails closed on structural drift", async () => {
  const source = await readFile(new URL("../src/app/HammerProjectLibrary.tsx", import.meta.url), "utf8");
  const lfSource = source.replace(/\r\n?/g, "\n");
  const crlfSource = lfSource.replace(/\n/g, "\r\n");

  assert.doesNotThrow(() => assertLandingPadCardContract(lfSource));
  assert.doesNotThrow(() => assertLandingPadCardContract(crlfSource));
  assert.throws(() => assertLandingPadCardContract(lfSource.replace(
    "<article\n              key={project.workpieceId}",
    "<article\n              data-missing-workpiece-identity",
  )));
  assert.throws(() => assertLandingPadCardContract(lfSource.replace(
    "<article\n              key={project.workpieceId}",
    "<article\n              onClick={() => undefined}\n              key={project.workpieceId}",
  )));
});

test("a prepared package from Take A cannot become stale authority in Take B", () => {
  const current = buildHammerReleasePrepPackage({
    workspaceId: target.workspaceId, workpieceId: target.workpieceId,
    prepStatus: "idle", alignmentStatus: "not_started", structuredTranscript: null,
    visualPlacements: null, audioPolish: null, editorSession: null,
  });
  const takeA = buildHammerPreparedReleasePackage({ current, recordingRevisionId: "aaaaaaaa-0000-4000-8000-000000000001" });
  assert.equal(resolveHammerPreparedPackageForRecording(takeA, "aaaaaaaa-0000-4000-8000-000000000001"), takeA);
  assert.equal(resolveHammerPreparedPackageForRecording(takeA, "bbbbbbbb-0000-4000-8000-000000000002"), null);
  assert.equal(resolveHammerPreparedPackageForRecording({ ...takeA, recordingRevisionId: null }, "bbbbbbbb-0000-4000-8000-000000000002"), null);
});

test("canonical recording change establishes an empty revision lineage and preserves prior rows", async () => {
  const migration = await readFile(new URL("../../../supabase/migrations/20260828150000_tongs_hammer_take_lineage_reset.sql", import.meta.url), "utf8");
  assert.match(migration, /adopt_latest_kept_take_for_hammer_pre_lineage/);
  assert.match(migration, /insert into tongs\.recording_revisions/);
  assert.match(migration, /active_revision_id=v_revision\.id/);
  assert.match(migration, /audio_polish_artifact_path=null/);
  assert.match(migration, /editorial_authority_path=null/);
  assert.doesNotMatch(migration, /delete from tongs\.recording_revisions/);

  const editor = await readFile(new URL("../src/editor/HammerWorkspaceEditor.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(editor, /revisionVisualPlacements[\s\S]{0,300}persistenceSnapshotResult\.data\.visual_placements/);
  assert.doesNotMatch(editor, /revisionEditorialAuthority \?\? persistedEditorialAuthority/);
});

test("every later take adoption resets an existing Hammer projection to the valid idle state", async () => {
  const migration = await readFile(new URL("../../../supabase/migrations/20260828160000_tongs_hammer_take_lineage_idle_reset.sql", import.meta.url), "utf8");
  assert.match(migration, /create or replace function tongs\.adopt_latest_kept_take_for_hammer/);
  assert.match(migration, /update tongs\.hammer_workpiece_state set[\s\S]*prep_status='idle'/);
  assert.doesNotMatch(migration, /prep_status='not_started'/);
  assert.match(migration, /insert into tongs\.recording_revisions/);
  assert.match(migration, /active_revision_id=v_revision\.id/);
  assert.doesNotMatch(migration, /delete from tongs\.(?:canonical_recordings|recording_revisions)/);
});

test("take-lineage reset writes revision authority only on the fresh recording revision", async () => {
  const migration = await readFile(new URL("../../../supabase/migrations/20260828170000_tongs_hammer_take_lineage_revision_authority_fix.sql", import.meta.url), "utf8");
  const workpieceReset = migration.match(/update tongs\.hammer_workpiece_state set([\s\S]*?)where workspace_id=/i)?.[1] ?? "";
  assert.match(workpieceReset, /prep_status='idle'/);
  assert.doesNotMatch(workpieceReset, /editorial_authority_(?:path|fingerprint|revision)/);
  assert.match(migration, /insert into tongs\.recording_revisions/);
  assert.doesNotMatch(migration, /delete from tongs\.(?:canonical_recordings|recording_revisions)/);
});

test("fresh take hydration cannot seal a workpiece-level transcript from another canonical recording", async () => {
  const editor = await readFile(new URL("../src/editor/HammerWorkspaceEditor.tsx", import.meta.url), "utf8");
  assert.match(editor, /legacyTranscriptMatchesCurrentRecording/);
  assert.match(editor, /transcriptMatchesCanonicalMedia\([\s\S]{0,180}currentCanonicalRecording\.media_id/);
  assert.match(editor, /legacyResult\.data\.speaker_map && legacyTranscriptMatchesCurrentRecording/);
});
