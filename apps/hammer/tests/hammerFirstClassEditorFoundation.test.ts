import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  commitHammerCompositionCommand,
  createHammerCompositionHistory,
  readHammerCompositionAtHead,
  redoHammerComposition,
  undoHammerComposition,
} from "../src/composition/hammerCompositionV2";
import { HAMMER_COMPOSITION_FIXTURES } from "../src/composition/hammerCompositionFixtures";
import { projectLegacyHammerCompositionV2 } from "../src/composition/hammerLegacyCompositionProjection";
import { evaluateHammerMediaRelink, isHammerDerivedArtifactCurrent } from "../src/composition/hammerMediaProvenance";
import { compileHammerRenderPlan, selectHammerPreviewOperations } from "../src/composition/hammerRenderPlanV1";
import { acknowledgeHammerRenderJob, createHammerRenderJob, settleHammerRenderJob } from "../src/composition/hammerRenderJobV1";
import { buildHammerReleasePacketV2, validateHammerReleasePacketV2ForQuench } from "../src/composition/hammerReleasePacketV2";

test("Tongs fails closed before any V2 artifact write when the migration is unavailable", () => {
  const source = readFileSync(new URL("../../../packages/tongs/src/workpiece-commit-api.ts", import.meta.url), "utf8");
  const probe = source.indexOf("hammer_v2_schema_unavailable");
  const firstWrite = source.indexOf('commitRevisionArtifact("composition_v2"');
  assert.ok(probe >= 0 && firstWrite > probe);
  const migration = readFileSync(new URL("../../../supabase/migrations/20260713023000_tongs_hammer_composition_v2.sql", import.meta.url), "utf8");
  assert.match(migration, /alter table tongs\.recording_revisions enable row level security/);
  assert.match(migration, /grant select, insert, update, delete on table tongs\.recording_revisions to authenticated/);
});

test("legacy projection is deterministic, idempotent, and refuses unresolved or competing identity", () => {
  const legacy = HAMMER_COMPOSITION_FIXTURES.solo;
  const input = {
    workspace_id: legacy.workspace_id,
    workpiece_id: legacy.workpiece_id,
    recording_revision_id: legacy.recording_revision_id,
    canonical_recording_id: "canonical-solo",
    created_at: legacy.created_at,
    source_media: legacy.source_media,
    projected_tracks: legacy.tracks,
    transcript_id: legacy.transcript.transcript_id,
    caption_artifact_id: legacy.captions.artifact_id,
  };
  const first = projectLegacyHammerCompositionV2(input);
  const second = projectLegacyHammerCompositionV2(input);
  assert.deepEqual(second, first);
  assert.equal(projectLegacyHammerCompositionV2(input, first), first);
  assert.throws(() => projectLegacyHammerCompositionV2({ ...input, workpiece_id: "other" }, first), /identity_conflict/);
  assert.throws(() => projectLegacyHammerCompositionV2({ ...input, projected_tracks: [{ ...legacy.tracks[0], clips: [{ ...legacy.tracks[0].clips[0], source_media_id: "missing" }] }] }), /clip_source_unresolved/);
});

test("legacy history is not promoted to V2 by a type assertion", () => {
  const source = readFileSync(new URL("../src/persistence/hammerRecordingRevisionPersistence.ts", import.meta.url), "utf8");
  assert.match(source, /isHammerCompositionHistoryV2\(historyResult\.data\)/);
  assert.doesNotMatch(source, /readWorkpieceJsonFile<HammerCompositionHistoryV2>/);
});

test("media relink preserves identity and requires the canonical fingerprint", () => {
  const source = HAMMER_COMPOSITION_FIXTURES.solo.source_media[0];
  const refused = evaluateHammerMediaRelink({ current: source, candidatePath: "new.mp4", candidateFingerprint: "wrong", candidateAvailable: true });
  assert.equal(refused.kind, "refused");
  const accepted = evaluateHammerMediaRelink({ current: source, candidatePath: "new.mp4", candidateFingerprint: source.content_fingerprint, candidateAvailable: true });
  assert.equal(accepted.kind, "accepted");
  if (accepted.kind === "accepted") assert.equal(accepted.provenance.media_id, source.media_id);
});

test("derived caches are disposable and keyed by source fingerprint plus generator", () => {
  const source = HAMMER_COMPOSITION_FIXTURES.solo.source_media[0];
  const derived = { ...source, media_id: "waveform", derived_from_fingerprint: source.content_fingerprint, generator_version: "waveform.v1" };
  assert.equal(isHammerDerivedArtifactCurrent({ source, derived, generatorVersion: "waveform.v1" }), true);
  assert.equal(isHammerDerivedArtifactCurrent({ source, derived, generatorVersion: "waveform.v2" }), false);
});

test("every creative command enters one history and repeated undo returns untouched raw state", () => {
  const raw = HAMMER_COMPOSITION_FIXTURES.solo;
  let history = createHammerCompositionHistory(raw);
  history = commitHammerCompositionCommand(history, { type: "split_clip", clip_id: "solo-program", at_sec: 20 }, "Split");
  history = commitHammerCompositionCommand(history, { type: "correct_transcript", segment_id: "s1", corrected_text: "Corrected words" }, "Correct transcript");
  assert.equal(readHammerCompositionAtHead(history).captions.stale, true);
  history = undoHammerComposition(undoHammerComposition(history));
  assert.deepEqual(readHammerCompositionAtHead(history), raw);
  assert.equal(raw.source_media[0].canonical_path, "recordings/solo.mp4");
  history = redoHammerComposition(history);
  assert.equal(readHammerCompositionAtHead(history).tracks[0].clips.length, 2);
});

test("transcript correction does not claim media changed and caption correction is isolated", () => {
  let history = createHammerCompositionHistory(HAMMER_COMPOSITION_FIXTURES.packaged);
  history = commitHammerCompositionCommand(history, { type: "correct_transcript", segment_id: "s1", corrected_text: "words" }, "Transcript correction");
  const corrected = readHammerCompositionAtHead(history);
  assert.deepEqual(corrected.source_media, HAMMER_COMPOSITION_FIXTURES.packaged.source_media);
  assert.equal(corrected.captions.stale, true);
});

test("render plan deterministically drives continuous intro-program-outro preview", () => {
  const first = compileHammerRenderPlan(HAMMER_COMPOSITION_FIXTURES.packaged);
  const second = compileHammerRenderPlan(HAMMER_COMPOSITION_FIXTURES.packaged);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(first.duration_sec, 70);
  assert.equal(selectHammerPreviewOperations(first, 2).some((row) => row.operation_id === "clip:intro"), true);
  assert.equal(selectHammerPreviewOperations(first, 20).some((row) => row.operation_id === "clip:program"), true);
  assert.equal(selectHammerPreviewOperations(first, 68).some((row) => row.operation_id === "clip:outro"), true);
  assert.equal(first.operations.some((row) => row.kind === "audio_treatment"), true);
});

test("render completion becomes stale after composition changes and cannot enter Quench packet", () => {
  const composition = HAMMER_COMPOSITION_FIXTURES.packaged;
  const plan = compileHammerRenderPlan(composition);
  const profile = { profile_id: "creative-master", container: "mp4" as const, video_codec: "h264", audio_codec: "aac", width: 1920, height: 1080, frame_rate: 30, loudness_lufs: -16 };
  const job = createHammerRenderJob({ jobId: "job-1", composition, plan, rendererVersion: "renderer.v1", outputProfile: profile });
  const changed = commitHammerCompositionCommand(createHammerCompositionHistory(composition), { type: "trim_clip", clip_id: "program", start_sec: 5, end_sec: 60 }, "Trim");
  const stale = settleHammerRenderJob({ job, currentComposition: readHammerCompositionAtHead(changed), resultArtifacts: [] });
  assert.equal(stale.status, "stale");
  assert.throws(() => acknowledgeHammerRenderJob(stale), /render_job_not_current_complete/);
  assert.throws(() => buildHammerReleasePacketV2({ job: stale, thumbnailAssetId: "thumb" }), /render_job_not_acknowledged/);
});

test("only acknowledged current creative masters produce a validated Quench packet", () => {
  const composition = HAMMER_COMPOSITION_FIXTURES.packaged;
  const plan = compileHammerRenderPlan(composition);
  const job = createHammerRenderJob({ jobId: "job-2", composition, plan, rendererVersion: "renderer.v1", outputProfile: { profile_id: "creative-master", container: "mp4", video_codec: "h264", audio_codec: "aac", width: 1920, height: 1080, frame_rate: 30, loudness_lufs: -16 } });
  const kinds = ["video_master", "audio_master", "caption", "transcript", "render_manifest"] as const;
  const completed = settleHammerRenderJob({ job, currentComposition: composition, resultArtifacts: kinds.map((kind) => ({ kind, asset_id: `asset:${kind}`, fingerprint: `fp:${kind}` })) });
  const packet = buildHammerReleasePacketV2({ job: acknowledgeHammerRenderJob(completed), thumbnailAssetId: "asset:thumbnail" });
  assert.equal(packet.validated_for_quench, true);
  assert.equal(packet.video_master_asset_id, "asset:video_master");
  const authorized = new Set(["asset:video_master", "asset:audio_master", "asset:caption", "asset:transcript", "asset:render_manifest", "asset:thumbnail"]);
  const context = {
    workspace_id: composition.workspace_id,
    workpiece_id: composition.workpiece_id,
    recording_revision_id: composition.recording_revision_id,
    composition_revision: composition.revision,
    composition_fingerprint: composition.fingerprint,
    source_fingerprints: plan.source_fingerprints,
    authorized_asset_ids: authorized,
  };
  assert.deepEqual(validateHammerReleasePacketV2ForQuench(packet, context), { accepted: true });
  assert.equal(validateHammerReleasePacketV2ForQuench(packet, { ...context, workspace_id: "workspace-b" }).accepted, false);
  assert.equal(validateHammerReleasePacketV2ForQuench(packet, { ...context, composition_revision: composition.revision + 1 }).accepted, false);
  assert.equal(validateHammerReleasePacketV2ForQuench(packet, { ...context, authorized_asset_ids: new Set<string>() }).accepted, false);
});
