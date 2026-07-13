import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyHammerCompositionCommand,
  commitHammerCompositionCommand,
  createHammerCompositionHistory,
  readHammerCompositionAtHead,
  redoHammerComposition,
  undoHammerComposition,
} from "../src/composition/hammerCompositionV2";
import { HAMMER_COMPOSITION_FIXTURES } from "../src/composition/hammerCompositionFixtures";
import { prepareHammerCompositionTransactionV2, readAcknowledgedHammerCompositionV2 } from "../src/composition/hammerCompositionTransactionV2";
import { projectLegacyHammerCompositionV2, resolveHammerCreativeAuthority } from "../src/composition/hammerLegacyCompositionProjection";
import { diagnoseHammerMedia, evaluateHammerMediaRelink, hammerDerivedArtifactKey, isHammerDerivedArtifactCurrent, registerHammerDerivedArtifact, resolveHammerMediaSource, selectCurrentHammerDerivedArtifact, type HammerDerivedArtifact } from "../src/composition/hammerMediaProvenance";
import { compileHammerRenderPlan, resolveHammerPreviewSource, selectHammerPreviewOperations } from "../src/composition/hammerRenderPlanV1";
import { buildHammerInteractivePreviewFrameV1 } from "../src/composition/hammerInteractivePreviewV1";
import { buildHammerCaptionCorrectionCommand, buildHammerRangeDeleteCommand, buildHammerSplitCommand, buildHammerTranscriptCorrectionCommand, buildHammerTranscriptMediaDeleteCommand, buildHammerTrimCommand, navigateHammerSpeaker, searchHammerTranscript, selectHammerTimelineRange, selectHammerTranscriptRange, snapHammerPlayheadFrame } from "../src/composition/hammerPodcastEditingV1";
import { acknowledgeHammerRenderJob, cancelHammerRenderJob, createHammerRenderJob, failHammerRenderJob, retryHammerRenderJob, resumeHammerRenderJob, settleHammerRenderJob, startHammerRenderJob } from "../src/composition/hammerRenderJobV1";
import { buildHammerReleasePacketV2, validateHammerReleasePacketV2ForQuench } from "../src/composition/hammerReleasePacketV2";
import { compileHammerAudioGraphV1, diagnoseHammerAudioMaster, selectHammerAudioGraphExecution, type HammerAudioTreatmentV1 } from "../src/composition/hammerAudioGraphV1";
import { acceptHammerAngleProposal, buildHammerVisualClipCommand, buildHammerVisualCompositionCommand, createHammerSourceGroupV1, diagnoseHammerSourceGroupDrift, type HammerVisualCompositionV1 } from "../src/composition/hammerVisualCompositionV1";
import { buildHammerCaptionArtifactCommand, buildHammerCaptionArtifactFromTranscriptV1, buildHammerCaptionCueEditCommand, buildHammerGraphicTemplateCommand, reconcileHammerCaptionArtifactAfterTranscriptChangeV1, validateHammerGraphicTemplateV1, type HammerGraphicTemplateV1 } from "../src/composition/hammerCaptionGraphicsTemplatesV1";
import { buildHammerProgramPackageCommand, proveHammerFullProgramPackageAssemblyV1 } from "../src/composition/hammerProgramPackageV1";
import { acceptHammerAiProposalV1, auditHammerPermanentExpansionGateV1, createHammerAiProposalV1, createHammerBoundedCacheV1, deleteHammerBoundedCacheEntryV1, evaluateHammerPerformanceBudgetsV1, HAMMER_PERFORMANCE_BUDGETS_V1, HAMMER_PERMANENT_EXPANSION_RULES_V1, putHammerBoundedCacheEntryV1, readHammerBoundedCacheEntryV1 } from "../src/composition/hammerExpansionGateV1";

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

test("missing, unavailable, and fingerprint-mismatched media remain distinct blocking diagnostics", () => {
  const source = HAMMER_COMPOSITION_FIXTURES.solo.source_media[0];
  const diagnostics = diagnoseHammerMedia([
    { ...source, media_id: "missing", availability: "missing" },
    { ...source, media_id: "unavailable", availability: "unavailable" },
    { ...source, media_id: "mismatch", availability: "fingerprint_mismatch" },
  ]);
  assert.deepEqual(diagnostics.map((row) => row.code), ["media_missing", "media_unavailable", "media_fingerprint_mismatch"]);
  assert.equal(diagnostics.every((row) => row.severity === "blocking" && row.relink_allowed), true);
  assert.throws(() => compileHammerRenderPlan(HAMMER_COMPOSITION_FIXTURES.missingMedia), /media_missing/);
});

test("derived artifact registry rejects stale identity and selects only the current generator output", () => {
  const source = HAMMER_COMPOSITION_FIXTURES.solo.source_media[0];
  const proxy: HammerDerivedArtifact = Object.freeze({ schema_version: 1, artifact_id: "proxy:1", source_media_id: source.media_id, source_fingerprint: source.content_fingerprint, kind: "proxy", generator_version: "proxy.v1", canonical_asset_id: "asset:proxy", canonical_path: "derived/proxy.mp4", availability: "available" });
  assert.equal(hammerDerivedArtifactKey(proxy), `${source.content_fingerprint}:proxy:proxy.v1`);
  assert.deepEqual(registerHammerDerivedArtifact({ source, artifact: proxy }), proxy);
  assert.equal(selectCurrentHammerDerivedArtifact({ source, artifacts: [proxy], kind: "proxy", generatorVersion: "proxy.v1" }), proxy);
  assert.equal(selectCurrentHammerDerivedArtifact({ source, artifacts: [proxy], kind: "proxy", generatorVersion: "proxy.v2" }), null);
  assert.throws(() => registerHammerDerivedArtifact({ source, artifact: { ...proxy, source_fingerprint: "sha256:stale" } }), /fingerprint_mismatch/);
});

test("preview proxies and final render resolve one canonical source fingerprint", () => {
  const composition = HAMMER_COMPOSITION_FIXTURES.solo;
  const source = composition.source_media[0];
  const proxy: HammerDerivedArtifact = Object.freeze({ schema_version: 1, artifact_id: "proxy:1", source_media_id: source.media_id, source_fingerprint: source.content_fingerprint, kind: "proxy", generator_version: "proxy.v1", canonical_asset_id: "asset:proxy", canonical_path: "derived/proxy.mp4", availability: "available" });
  const plan = compileHammerRenderPlan(composition);
  const operation = plan.operations.find((row) => row.source_media_id === source.media_id)!;
  const preview = resolveHammerPreviewSource({ operation, provenance: composition.source_media, derivedArtifacts: [proxy], proxyGeneratorVersion: "proxy.v1" })!;
  const render = resolveHammerMediaSource({ source, consumer: "render", derivedArtifacts: [proxy], proxyGeneratorVersion: "proxy.v1" });
  assert.equal(preview.provider, "derived_proxy");
  assert.equal(render.provider, "canonical_source");
  assert.notEqual(preview.selected_path, render.selected_path);
  assert.equal(preview.canonical_fingerprint, render.canonical_fingerprint);
  assert.equal(operation.source_fingerprint, render.canonical_fingerprint);
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

test("all Phase 2 creative authorities participate in the same canonical history", () => {
  let history = createHammerCompositionHistory(HAMMER_COMPOSITION_FIXTURES.interview);
  const commands = [
    { type: "set_angle", clip_id: "angle-a", source_media_id: "cam-b" },
    { type: "set_audio_treatments", treatments: [{ treatment_id: "gain:program", kind: "gain", scope: { kind: "program" }, bypassed: false, gain_db: -2 }] },
    { type: "set_transition", clip_id: "angle-b", transition: { kind: "crossfade" } },
    { type: "set_caption_artifact", artifact_id: "captions:2", based_on_transcript_id: "transcript:1" },
    { type: "set_editorial_authority", authority: { owner: "composition_v2" } },
    { type: "set_automated_placement", placement_id: "placement:1", payload: { x: 0.2, y: 0.8 } },
    { type: "set_packaging", intro_clip_id: null, outro_clip_id: null, thumbnail_asset_id: "thumb:2" },
    { type: "delete_transcript_range", start_sec: 2, end_sec: 3, ripple: true },
  ] as const;
  for (const command of commands) history = commitHammerCompositionCommand(history, command, command.type);
  assert.equal(history.entries.length, commands.length);
  assert.equal(readHammerCompositionAtHead(history).history_head_id, history.entries.at(-1)?.entry_id);
  for (let index = 0; index < commands.length; index += 1) history = undoHammerComposition(history);
  assert.deepEqual(readHammerCompositionAtHead(history), HAMMER_COMPOSITION_FIXTURES.interview);
});

test("composition and history save/reload only become canonical after matching acknowledgement", () => {
  const raw = HAMMER_COMPOSITION_FIXTURES.solo;
  const transaction = prepareHammerCompositionTransactionV2({ history: createHammerCompositionHistory(raw), command: { type: "trim_clip", clip_id: "solo-program", start_sec: 1, end_sec: 59 }, label: "Trim", expectedRevisionUpdatedAt: "2026-07-13T01:00:00.000Z" });
  const head = transaction.history.entries[transaction.history.head_index].entry_id;
  const reopened = readAcknowledgedHammerCompositionV2({ transaction: JSON.parse(JSON.stringify(transaction)), recordingRevisionId: raw.recording_revision_id, acknowledgedRevision: transaction.composition.revision, acknowledgedFingerprint: transaction.composition.fingerprint, acknowledgedHistoryHeadId: head });
  assert.equal(reopened.fingerprint, transaction.composition.fingerprint);
  assert.throws(() => readAcknowledgedHammerCompositionV2({ transaction, recordingRevisionId: raw.recording_revision_id, acknowledgedRevision: transaction.composition.revision - 1, acknowledgedFingerprint: transaction.composition.fingerprint, acknowledgedHistoryHeadId: head }), /not_acknowledged/);
  assert.throws(() => readAcknowledgedHammerCompositionV2({ transaction, recordingRevisionId: "other", acknowledgedRevision: transaction.composition.revision, acknowledgedFingerprint: transaction.composition.fingerprint, acknowledgedHistoryHeadId: head }), /identity_mismatch/);
  assert.throws(() => readAcknowledgedHammerCompositionV2({ transaction: { ...transaction, history: { ...transaction.history, head_index: -1 } }, recordingRevisionId: raw.recording_revision_id, acknowledgedRevision: transaction.composition.revision, acknowledgedFingerprint: transaction.composition.fingerprint, acknowledgedHistoryHeadId: head }), /fingerprint_mismatch/);
});

test("an acknowledged V2 transaction wins and a stale V2 transaction never falls back to legacy authority", () => {
  const raw = HAMMER_COMPOSITION_FIXTURES.solo;
  const legacy = { workspace_id: raw.workspace_id, workpiece_id: raw.workpiece_id, recording_revision_id: raw.recording_revision_id, canonical_recording_id: "canonical-solo", created_at: raw.created_at, source_media: raw.source_media, projected_tracks: raw.tracks, transcript_id: raw.transcript.transcript_id, caption_artifact_id: raw.captions.artifact_id };
  assert.equal(resolveHammerCreativeAuthority({ legacy }).kind, "legacy_projection_pending");
  const transaction = prepareHammerCompositionTransactionV2({ history: createHammerCompositionHistory(raw), command: { type: "correct_transcript", segment_id: "s1", corrected_text: "correct" }, label: "Correct", expectedRevisionUpdatedAt: raw.updated_at });
  const head = transaction.history.entries.at(-1)!.entry_id;
  const canonical = resolveHammerCreativeAuthority({ legacy, transaction, acknowledgedRevision: transaction.composition.revision, acknowledgedFingerprint: transaction.composition.fingerprint, acknowledgedHistoryHeadId: head });
  assert.equal(canonical.kind, "canonical_v2");
  assert.throws(() => resolveHammerCreativeAuthority({ legacy, transaction, acknowledgedRevision: transaction.composition.revision - 1, acknowledgedFingerprint: transaction.composition.fingerprint, acknowledgedHistoryHeadId: head }), /not_acknowledged/);
});

test("Tongs composition pointer acknowledgement is compare-and-swap guarded", () => {
  const source = readFileSync(new URL("../../../packages/tongs/src/workpiece-commit-api.ts", import.meta.url), "utf8");
  assert.match(source, /select\("composition_v2_path,media_provenance_path,render_jobs_path,release_packet_path,composition_revision,composition_fingerprint,composition_history_head_id"\)/);
  assert.ok(source.indexOf("composition_history_head_id\")") < source.indexOf("commitRevisionArtifact(\"composition_v2\""));
  assert.match(source, /composition_expected_revision_required/);
  assert.match(source, /updateQuery\.eq\("updated_at", input\.expected_revision_updated_at\)/);
  assert.match(source, /composition_revision_conflict/);
  const migration = readFileSync(new URL("../../../supabase/migrations/20260713043000_tongs_hammer_composition_v2_concurrency.sql", import.meta.url), "utf8");
  assert.match(migration, /composition_revision bigint/);
  assert.match(migration, /composition_history_head_id text/);
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

test("golden semantic plan resolves ranges, angles, layers, captions, graphics, transitions, packaging, placements, and audio intent", () => {
  const composition = HAMMER_COMPOSITION_FIXTURES.semanticPlan;
  const plan = compileHammerRenderPlan(composition);
  const second = compileHammerRenderPlan(JSON.parse(JSON.stringify(composition)));
  assert.equal(second.fingerprint, plan.fingerprint);
  assert.equal(plan.fingerprint, "fnv1a:c50aa074");
  assert.equal(plan.duration_sec, 70);
  assert.deepEqual(plan.packaging, { intro_operation_id: "clip:intro", outro_operation_id: "clip:outro", thumbnail_asset_id: "thumb:semantic", reference_asset_ids: [] });
  assert.deepEqual(plan.operations.find((row) => row.operation_id === "clip:camera-b"), {
    operation_id: "clip:camera-b", kind: "video", track_id: "video", track_role: "program_camera", layer_index: 0,
    start_sec: 35, end_sec: 65, source_start_sec: 0, source_end_sec: 30, source_media_id: "cam-b", source_fingerprint: "sha256:cam-b", source_group_id: null, source_sync_offset_sec: 0, package_role: "program",
    payload: { angle: "b", transform: { x: 0.1, y: 0, scale: 0.9 }, transition: { kind: "crossfade", duration_sec: 0.5 } },
  });
  assert.equal(plan.operations.some((row) => row.kind === "caption"), true);
  assert.equal(plan.operations.some((row) => row.kind === "graphic"), true);
  assert.equal(plan.operations.filter((row) => row.kind === "transition").length, 3);
  assert.equal(plan.operations.filter((row) => row.kind === "audio_treatment").length, 2);
  assert.equal(plan.operations.some((row) => row.kind === "placement"), true);
});

test("interactive preview is a plan-only semantic projection with stable layer ordering", () => {
  const composition = HAMMER_COMPOSITION_FIXTURES.semanticPlan;
  const plan = compileHammerRenderPlan(composition);
  const frame = buildHammerInteractivePreviewFrameV1({ plan, expectedCompositionFingerprint: composition.fingerprint, atSec: 7, provenance: composition.source_media });
  assert.deepEqual(frame.visual_layers.map((row) => row.operation_id), ["clip:camera-a", "clip:lower-third"]);
  assert.deepEqual(frame.audio_layers.map((row) => row.operation_id), ["clip:music-bed"]);
  assert.deepEqual(frame.captions.map((row) => row.operation_id), ["clip:caption-1"]);
  assert.equal(frame.audio_treatments.length, 2);
  assert.equal(frame.placements.length, 1);
  assert.equal(Object.keys(frame.resolved_sources).sort().join(","), "clip:camera-a,clip:music-bed");
  assert.equal(buildHammerInteractivePreviewFrameV1({ plan, expectedCompositionFingerprint: composition.fingerprint, atSec: 7, provenance: composition.source_media }).semantic_fingerprint, frame.semantic_fingerprint);
  assert.equal(frame.semantic_fingerprint, "fnv1a:96dede9b");
  assert.throws(() => buildHammerInteractivePreviewFrameV1({ plan, expectedCompositionFingerprint: "stale", atSec: 7, provenance: composition.source_media }), /preview_plan_stale/);
  assert.throws(() => buildHammerInteractivePreviewFrameV1({ plan, expectedCompositionFingerprint: composition.fingerprint, atSec: 7, provenance: composition.source_media.map((source) => source.media_id === "cam-a" ? { ...source, content_fingerprint: "changed" } : source) }), /preview_source_set_stale/);
  assert.throws(() => buildHammerInteractivePreviewFrameV1({ plan: { ...plan, duration_sec: 71 }, expectedCompositionFingerprint: composition.fingerprint, atSec: 7, provenance: composition.source_media }), /render_plan_fingerprint_mismatch/);
});

test("preview/render compilation rejects non-V2 creative representations", () => {
  assert.throws(() => compileHammerRenderPlan({ schema_version: 1 } as never), /composition_v2_invalid/);
});

test("frame-accurate linked split and trim compile identically for audio and video", () => {
  const rate = { numerator: 30, denominator: 1 };
  let history = createHammerCompositionHistory(HAMMER_COMPOSITION_FIXTURES.linkedPodcast);
  history = commitHammerCompositionCommand(history, buildHammerSplitCommand({ clipId: "video-main", frame: 300, frameRate: rate }), "Split linked AV");
  const split = readHammerCompositionAtHead(history);
  assert.deepEqual(split.tracks[0].clips.slice(0, 2).map((clip) => [clip.timeline_start_sec, clip.timeline_end_sec]), [[0, 10], [10, 20]]);
  assert.deepEqual(split.tracks[1].clips.slice(0, 2).map((clip) => [clip.timeline_start_sec, clip.timeline_end_sec]), [[0, 10], [10, 20]]);

  history = createHammerCompositionHistory(HAMMER_COMPOSITION_FIXTURES.linkedPodcast);
  history = commitHammerCompositionCommand(history, buildHammerTrimCommand({ clipId: "video-main", startFrame: 30, endFrame: 570, frameRate: rate }), "Trim linked AV");
  const trimmed = readHammerCompositionAtHead(history);
  for (const track of trimmed.tracks) {
    assert.deepEqual([track.clips[0].timeline_start_sec, track.clips[0].timeline_end_sec, track.clips[0].source_start_sec, track.clips[0].source_end_sec], [1, 19, 1, 19]);
  }
});

test("lift preserves a gap while ripple deletion closes it across linked tracks and shared plan timing", () => {
  const rate = { numerator: 30, denominator: 1 };
  const base = HAMMER_COMPOSITION_FIXTURES.linkedPodcast;
  const liftHistory = commitHammerCompositionCommand(createHammerCompositionHistory(base), buildHammerRangeDeleteCommand({ startFrame: 150, endFrame: 300, frameRate: rate, mode: "lift" }), "Lift");
  const lifted = readHammerCompositionAtHead(liftHistory);
  assert.equal(lifted.tracks[0].clips.some((clip) => clip.timeline_end_sec === 5), true);
  assert.equal(lifted.tracks[0].clips.some((clip) => clip.timeline_start_sec === 10), true);
  assert.equal(compileHammerRenderPlan(lifted).duration_sec, 30);

  const rippleHistory = commitHammerCompositionCommand(createHammerCompositionHistory(base), buildHammerRangeDeleteCommand({ startFrame: 150, endFrame: 300, frameRate: rate, mode: "ripple" }), "Ripple delete");
  const rippled = readHammerCompositionAtHead(rippleHistory);
  for (const track of rippled.tracks) {
    assert.equal(track.clips.some((clip) => clip.timeline_end_sec === 5), true);
    assert.equal(track.clips.filter((clip) => clip.timeline_start_sec === 5).length, 1);
    assert.equal(track.clips.at(-1)?.timeline_end_sec, 25);
  }
  assert.equal(compileHammerRenderPlan(rippled).duration_sec, 25);
  assert.deepEqual(readHammerCompositionAtHead(undoHammerComposition(rippleHistory)), base);
});

test("track state, locks, source roles, snapping, and bidirectional transcript selection are canonical", () => {
  const base = HAMMER_COMPOSITION_FIXTURES.linkedPodcast;
  const soloAudio = applyHammerCompositionCommand(base, { type: "set_track_state", track_id: "audio", solo: true });
  assert.deepEqual(compileHammerRenderPlan(soloAudio).operations.filter((row) => row.source_media_id).map((row) => row.track_id), ["audio", "audio"]);
  const hiddenAudio = applyHammerCompositionCommand(soloAudio, { type: "set_track_state", track_id: "audio", visible: false });
  assert.equal(compileHammerRenderPlan(hiddenAudio).operations.length, 0);
  const locked = applyHammerCompositionCommand(base, { type: "set_track_state", track_id: "video", locked: true, visible: false });
  assert.equal(locked.tracks[0].role, "program_video");
  assert.throws(() => applyHammerCompositionCommand(locked, { type: "split_clip", clip_id: "video-main", at_sec: 10 }), /track_locked/);
  assert.equal(snapHammerPlayheadFrame({ frame: 298, candidateFrames: [150, 300, 450], toleranceFrames: 3 }), 300);
  const segments = [
    { segment_id: "s1", speaker: "Host", text: "Opening", start_sec: 0, end_sec: 5 },
    { segment_id: "s2", speaker: "Guest", text: "Answer", start_sec: 5, end_sec: 10 },
    { segment_id: "s3", speaker: "Host", text: "Follow up", start_sec: 10, end_sec: 15 },
  ];
  const transcriptSelection = selectHammerTranscriptRange({ segments, segmentIds: ["s2"], composition: base, frameRate: { numerator: 30, denominator: 1 } });
  assert.deepEqual([transcriptSelection.start_frame, transcriptSelection.end_frame], [150, 300]);
  assert.deepEqual(selectHammerTimelineRange({ composition: base, startFrame: 150, endFrame: 300, frameRate: { numerator: 30, denominator: 1 }, segments }).selected_transcript_segment_ids, ["s2"]);
  assert.equal(navigateHammerSpeaker({ segments, speaker: "Host", fromSec: 5, direction: "next" })?.segment_id, "s3");
  assert.deepEqual(searchHammerTranscript(segments, "guest").map((segment) => segment.segment_id), ["s2"]);
});

test("transcript correction, caption correction, search, and recorded-speech deletion remain separate semantics", () => {
  const semantic = HAMMER_COMPOSITION_FIXTURES.semanticPlan;
  const transcriptCorrected = applyHammerCompositionCommand(semantic, buildHammerTranscriptCorrectionCommand("s1", "Correct words"));
  assert.deepEqual(transcriptCorrected.source_media, semantic.source_media);
  assert.equal(transcriptCorrected.captions.stale, true);
  const captionCorrected = applyHammerCompositionCommand(semantic, buildHammerCaptionCorrectionCommand("caption-1", "Caption words"));
  assert.deepEqual(captionCorrected.transcript, semantic.transcript);
  assert.equal(captionCorrected.tracks.flatMap((track) => track.clips).find((clip) => clip.clip_id === "caption-1")?.payload.corrected_text, "Caption words");
  const deletion = applyHammerCompositionCommand(HAMMER_COMPOSITION_FIXTURES.linkedPodcast, buildHammerTranscriptMediaDeleteCommand({ startFrame: 150, endFrame: 300, frameRate: { numerator: 30, denominator: 1 }, ripple: true }));
  assert.equal(deletion.tracks[0].clips.at(-1)?.timeline_end_sec, 25);
});

test("render completion becomes stale after composition changes and cannot enter Quench packet", () => {
  const composition = HAMMER_COMPOSITION_FIXTURES.packaged;
  const plan = compileHammerRenderPlan(composition);
  const profile = { profile_id: "creative-master", container: "mp4" as const, video_codec: "h264", audio_codec: "aac", width: 1920, height: 1080, frame_rate: 30, loudness_lufs: -16 };
  const job = createHammerRenderJob({ jobId: "job-1", composition, plan, rendererVersion: "renderer.v1", outputProfile: profile });
  const changed = commitHammerCompositionCommand(createHammerCompositionHistory(composition), { type: "trim_clip", clip_id: "program", start_sec: 5, end_sec: 60 }, "Trim");
  const stale = settleHammerRenderJob({ job: startHammerRenderJob(job), currentComposition: readHammerCompositionAtHead(changed), resultArtifacts: [] });
  assert.equal(stale.status, "stale");
  assert.throws(() => acknowledgeHammerRenderJob(stale), /render_job_not_current_complete/);
  assert.throws(() => buildHammerReleasePacketV2({ job: stale, thumbnailAssetId: "thumb" }), /render_job_not_acknowledged/);
});

test("only acknowledged current creative masters produce a validated Quench packet", () => {
  const composition = HAMMER_COMPOSITION_FIXTURES.packaged;
  const plan = compileHammerRenderPlan(composition);
  const job = createHammerRenderJob({ jobId: "job-2", composition, plan, rendererVersion: "renderer.v1", outputProfile: { profile_id: "creative-master", container: "mp4", video_codec: "h264", audio_codec: "aac", width: 1920, height: 1080, frame_rate: 30, loudness_lufs: -16 } });
  const kinds = ["video_master", "audio_master", "caption", "transcript", "thumbnail_reference", "render_manifest"] as const;
  const completed = settleHammerRenderJob({ job: startHammerRenderJob(job), currentComposition: composition, resultArtifacts: kinds.map((kind) => ({ kind, asset_id: `asset:${kind}`, fingerprint: `fp:${kind}` })) });
  const acknowledged = acknowledgeHammerRenderJob(completed);
  const packet = buildHammerReleasePacketV2({ job: acknowledged });
  assert.equal(packet.validated_for_quench, true);
  assert.equal(packet.video_master_asset_id, "asset:video_master");
  assert.equal(packet.thumbnail_asset_id, "asset:thumbnail_reference");
  assert.equal(packet.render_plan_fingerprint, plan.fingerprint);
  assert.equal(packet.acknowledged_result_fingerprint, acknowledged.acknowledged_result_fingerprint);
  const authorized = new Set(["asset:video_master", "asset:audio_master", "asset:caption", "asset:transcript", "asset:render_manifest", "asset:thumbnail_reference"]);
  const context = {
    workspace_id: composition.workspace_id,
    workpiece_id: composition.workpiece_id,
    recording_revision_id: composition.recording_revision_id,
    composition_revision: composition.revision,
    composition_fingerprint: composition.fingerprint,
    render_plan_fingerprint: plan.fingerprint,
    source_fingerprints: plan.source_fingerprints,
    authorized_asset_ids: authorized,
  };
  assert.deepEqual(validateHammerReleasePacketV2ForQuench(packet, context), { accepted: true });
  assert.equal(validateHammerReleasePacketV2ForQuench(packet, { ...context, workspace_id: "workspace-b" }).accepted, false);
  assert.equal(validateHammerReleasePacketV2ForQuench(packet, { ...context, composition_revision: composition.revision + 1 }).accepted, false);
  assert.deepEqual(validateHammerReleasePacketV2ForQuench(packet, { ...context, render_plan_fingerprint: "plan:other" }), { accepted: false, reason: "release_packet_render_plan_mismatch" });
  assert.equal(validateHammerReleasePacketV2ForQuench(packet, { ...context, authorized_asset_ids: new Set<string>() }).accepted, false);
});

test("Phase 9 render jobs handle cancel, retry, resume, source mismatch, duplicate acknowledgement, and packet exclusion", () => {
  const composition = HAMMER_COMPOSITION_FIXTURES.packaged;
  const plan = compileHammerRenderPlan(composition);
  const profile = { profile_id: "creative-master", container: "mp4" as const, video_codec: "h264", audio_codec: "aac", width: 1920, height: 1080, frame_rate: 30, loudness_lufs: -16 };
  const job = createHammerRenderJob({ jobId: "job-3", composition, plan, rendererVersion: "renderer.v1", outputProfile: profile });
  const cancelled = cancelHammerRenderJob(job);
  assert.equal(cancelled.status, "cancelled");
  const retry = retryHammerRenderJob({ job: cancelled, retryJobId: "job-3-retry" });
  assert.equal(retry.status, "queued");
  const running = startHammerRenderJob(retry);
  assert.equal(resumeHammerRenderJob(running).status, "running");
  const mismatchedSource = { ...composition, source_media: composition.source_media.map((source) => source.media_id === "program" ? { ...source, content_fingerprint: "sha256:changed-program" } : source) };
  assert.throws(() => settleHammerRenderJob({ job: running, currentComposition: mismatchedSource, resultArtifacts: [] }), /source_mismatch/);
  const failed = failHammerRenderJob(startHammerRenderJob(createHammerRenderJob({ jobId: "job-4", composition, plan, rendererVersion: "renderer.v1", outputProfile: profile })));
  assert.equal(retryHammerRenderJob({ job: failed, retryJobId: "job-4-retry" }).status, "queued");
  const completed = settleHammerRenderJob({ job: running, currentComposition: composition, resultArtifacts: [
    { kind: "video_master", asset_id: "asset:video", fingerprint: "fp:video" },
    { kind: "audio_master", asset_id: "asset:audio", fingerprint: "fp:audio" },
    { kind: "caption", asset_id: "asset:caption", fingerprint: "fp:caption" },
    { kind: "transcript", asset_id: "asset:transcript", fingerprint: "fp:transcript" },
    { kind: "thumbnail_reference", asset_id: "asset:thumbnail", fingerprint: "fp:thumbnail" },
    { kind: "render_manifest", asset_id: "asset:manifest", fingerprint: "fp:manifest" },
  ] });
  const acknowledged = acknowledgeHammerRenderJob(completed);
  assert.throws(() => acknowledgeHammerRenderJob(acknowledged), /render_job_not_current_complete/);
  assert.throws(() => acknowledgeHammerRenderJob({ ...completed, acknowledged_result_fingerprint: "fnv1a:other" }), /duplicate_acknowledgement/);
  const incomplete = acknowledgeHammerRenderJob(settleHammerRenderJob({ job: startHammerRenderJob(createHammerRenderJob({ jobId: "job-5", composition, plan, rendererVersion: "renderer.v1", outputProfile: profile })), currentComposition: composition, resultArtifacts: [
    { kind: "video_master", asset_id: "asset:video", fingerprint: "fp:video" },
    { kind: "audio_master", asset_id: "asset:audio", fingerprint: "fp:audio" },
    { kind: "transcript", asset_id: "asset:transcript", fingerprint: "fp:transcript" },
    { kind: "thumbnail_reference", asset_id: "asset:thumbnail", fingerprint: "fp:thumbnail" },
  ] }));
  assert.throws(() => buildHammerReleasePacketV2({ job: incomplete }), /release_packet_incomplete/);
});

const phase5Treatments: readonly HammerAudioTreatmentV1[] = [
  { treatment_id: "clip-gain", kind: "gain", scope: { kind: "clip", clip_id: "audio-main" }, bypassed: false, gain_db: -2 },
  { treatment_id: "host-eq", kind: "eq", scope: { kind: "speaker", speaker_id: "host" }, bypassed: false, bands: [{ frequency_hz: 90, gain_db: -3, q: 0.7 }] },
  { treatment_id: "dialogue-compressor", kind: "compressor", scope: { kind: "track", track_id: "audio" }, bypassed: false, threshold_db: -18, ratio: 3, attack_ms: 10, release_ms: 80, makeup_gain_db: 2 },
  { treatment_id: "dialogue-gate", kind: "gate", scope: { kind: "track", track_id: "audio" }, bypassed: true, threshold_db: -45, attack_ms: 5, release_ms: 120 },
  { treatment_id: "deesser", kind: "deesser", scope: { kind: "speaker", speaker_id: "host" }, bypassed: false, frequency_hz: 6500, threshold_db: -20, reduction_db: -5 },
  { treatment_id: "noise", kind: "noise_reduction", scope: { kind: "track", track_id: "audio" }, bypassed: false, amount: 0.25 },
  { treatment_id: "room", kind: "room_tone", scope: { kind: "program" }, bypassed: false, source_media_id: "linked-audio", gain_db: -30 },
  { treatment_id: "crossfade", kind: "crossfade", scope: { kind: "track", track_id: "audio" }, bypassed: false, from_clip_id: "audio-main", to_clip_id: "audio-tail", start_sec: 19.5, end_sec: 20.5, curve: "equal_power" },
  { treatment_id: "duck", kind: "sidechain_duck", scope: { kind: "program" }, bypassed: false, key_track_id: "audio", target_track_id: "music", reduction_db: -9, attack_ms: 25, release_ms: 250 },
  { treatment_id: "loudness", kind: "loudness", scope: { kind: "program" }, bypassed: false, target_lufs: -16, true_peak_ceiling_dbtp: -1 },
  { treatment_id: "limiter", kind: "limiter", scope: { kind: "program" }, bypassed: false, ceiling_dbtp: -1, release_ms: 100 },
];

test("Phase 5 compiles all podcast treatments into one deterministic non-destructive audio graph", () => {
  const composition = applyHammerCompositionCommand(HAMMER_COMPOSITION_FIXTURES.linkedPodcast, { type: "set_audio_treatments", treatments: phase5Treatments });
  const plan = compileHammerRenderPlan(composition);
  const graph = compileHammerAudioGraphV1(composition);
  assert.equal(plan.audio_graph.fingerprint, graph.fingerprint);
  assert.equal(graph.treatments.length, phase5Treatments.length);
  assert.deepEqual(graph.master_intents, ["creative_video", "creative_audio", "neutral_finished"]);
  assert.deepEqual(graph.source_nodes.map((node) => node.source_fingerprint), ["sha256:linked-audio", "sha256:linked-audio"]);
  assert.deepEqual(composition.source_media, HAMMER_COMPOSITION_FIXTURES.linkedPodcast.source_media);
  assert.equal(compileHammerAudioGraphV1(JSON.parse(JSON.stringify(composition))).fingerprint, graph.fingerprint);
});

test("preview and export select the exact same signed graph while bypass compare is explicit", () => {
  const composition = applyHammerCompositionCommand(HAMMER_COMPOSITION_FIXTURES.linkedPodcast, { type: "set_audio_treatments", treatments: phase5Treatments });
  const graph = compileHammerRenderPlan(composition).audio_graph;
  const preview = selectHammerAudioGraphExecution(graph, "processed");
  const exported = selectHammerAudioGraphExecution(graph, "processed");
  assert.deepEqual(preview, exported);
  assert.equal(preview.treatments.some((treatment) => treatment.treatment_id === "dialogue-gate"), false);
  const bypass = selectHammerAudioGraphExecution(graph, "bypass");
  assert.equal(bypass.graph_fingerprint, exported.graph_fingerprint);
  assert.equal(bypass.treatments.length, 0);
});

test("loudness, clipping, crossfade, and invalid master controls fail honestly", () => {
  assert.deepEqual(diagnoseHammerAudioMaster({ measured_lufs: -16.4, true_peak_dbtp: -1.2, target_lufs: -16, ceiling_dbtp: -1 }), { loudness_delta_lu: -0.3999999999999986, clipping: false, within_target: true });
  assert.equal(diagnoseHammerAudioMaster({ measured_lufs: -12, true_peak_dbtp: 0.2, target_lufs: -16, ceiling_dbtp: -1 }).clipping, true);
  assert.throws(() => compileHammerAudioGraphV1(applyHammerCompositionCommand(HAMMER_COMPOSITION_FIXTURES.linkedPodcast, { type: "set_audio_treatments", treatments: [{ treatment_id: "bad", kind: "crossfade", scope: { kind: "program" }, bypassed: false, from_clip_id: "a", to_clip_id: "b", start_sec: 2, end_sec: 1, curve: "linear" }] })), /audio_crossfade_invalid/);
  assert.throws(() => compileHammerAudioGraphV1(applyHammerCompositionCommand(HAMMER_COMPOSITION_FIXTURES.linkedPodcast, { type: "set_audio_treatments", treatments: [{ treatment_id: "bad", kind: "limiter", scope: { kind: "program" }, bypassed: false, ceiling_dbtp: 1, release_ms: 100 }] })), /audio_limiter_invalid/);
});

test("every audio treatment participates in canonical history and repeated Undo restores raw source", () => {
  const base = HAMMER_COMPOSITION_FIXTURES.linkedPodcast;
  let history = createHammerCompositionHistory(base);
  history = commitHammerCompositionCommand(history, { type: "set_audio_treatments", treatments: phase5Treatments }, "Podcast mix");
  history = commitHammerCompositionCommand(history, { type: "set_audio_treatments", treatments: [...phase5Treatments, { treatment_id: "track-gain", kind: "gain", scope: { kind: "track", track_id: "audio" }, bypassed: false, gain_db: 1 }] }, "Track gain");
  history = undoHammerComposition(undoHammerComposition(history));
  assert.deepEqual(readHammerCompositionAtHead(history), base);
});

test("Phase 6 source groups synchronize deterministically by timecode, waveform, and explicit manual alignment", () => {
  const timecode = createHammerSourceGroupV1({ sourceGroupId: "interview", primarySourceMediaId: "cam-a", method: "timecode", sources: [
    { source_media_id: "cam-a", timecode_sec: 100, evidence_fingerprint: "tc:a" },
    { source_media_id: "cam-b", timecode_sec: 100.25, evidence_fingerprint: "tc:b" },
  ] });
  assert.equal(timecode.members[1]?.offset_sec, 0.25);
  const waveform = createHammerSourceGroupV1({ sourceGroupId: "interview", primarySourceMediaId: "cam-a", method: "waveform", sources: [
    { source_media_id: "cam-a", waveform_lag_sec: 0, evidence_fingerprint: "wave:a" },
    { source_media_id: "cam-b", waveform_lag_sec: -0.12, evidence_fingerprint: "wave:b" },
  ] });
  assert.equal(waveform.members[1]?.offset_sec, -0.12);
  const manual = createHammerSourceGroupV1({ sourceGroupId: "interview", primarySourceMediaId: "cam-a", method: "manual", sources: [
    { source_media_id: "cam-a", manual_offset_sec: 0, evidence_fingerprint: "manual:a" },
    { source_media_id: "cam-b", manual_offset_sec: 0.08, evidence_fingerprint: "manual:b" },
  ] });
  assert.equal(diagnoseHammerSourceGroupDrift(manual, { "cam-a": 0, "cam-b": 0.2 })[1]?.status, "drifted");
  const corrected = applyHammerCompositionCommand(applyHammerCompositionCommand(HAMMER_COMPOSITION_FIXTURES.interview, { type: "upsert_source_group", source_group: timecode }), { type: "upsert_source_group", source_group: manual });
  assert.deepEqual(corrected.source_groups, [manual]);
  const synchronizedOperation = compileHammerRenderPlan(corrected).operations.find((operation) => operation.source_media_id === "cam-b");
  assert.deepEqual([synchronizedOperation?.source_group_id, synchronizedOperation?.source_sync_offset_sec], ["interview", 0.08]);
});

test("angle proposals are advisory and refuse stale, wrong-frame, missing, or non-group sources", () => {
  const group = createHammerSourceGroupV1({ sourceGroupId: "interview", primarySourceMediaId: "cam-a", method: "manual", sources: [
    { source_media_id: "cam-a", manual_offset_sec: 0, evidence_fingerprint: "manual:a" },
    { source_media_id: "cam-b", manual_offset_sec: 0, evidence_fingerprint: "manual:b" },
  ] });
  const composition = applyHammerCompositionCommand(HAMMER_COMPOSITION_FIXTURES.interview, { type: "upsert_source_group", source_group: group });
  const proposal = { proposal_id: "proposal:1", composition_id: composition.composition_id, composition_revision: composition.revision, composition_fingerprint: composition.fingerprint, source_group_id: "interview", clip_id: "angle-a", proposed_source_media_id: "cam-b", frame_identity: "frame:100", explanation: "Speaker B is active." };
  const command = acceptHammerAngleProposal({ composition, proposal, currentFrameIdentity: "frame:100" });
  const switched = applyHammerCompositionCommand(composition, command);
  assert.equal(switched.tracks[0]?.clips[0]?.source_media_id, "cam-b");
  assert.throws(() => acceptHammerAngleProposal({ composition, proposal, currentFrameIdentity: "frame:101" }), /wrong_frame/);
  assert.throws(() => acceptHammerAngleProposal({ composition: switched, proposal, currentFrameIdentity: "frame:100" }), /proposal_stale/);
  assert.throws(() => applyHammerCompositionCommand(composition, { type: "set_angle", clip_id: "angle-a", source_media_id: "missing-angle" }), /composition_source_missing/);
});

const phase6Visual: HammerVisualCompositionV1 = {
  layout: "picture_in_picture", role: "angle",
  transform: { x: 0.65, y: 0.62, scale: 0.32, rotation_deg: 0 },
  crop: { top: 0.05, right: 0.1, bottom: 0.05, left: 0.1 },
  color: { exposure: 0.1, contrast: 1.05, saturation: 0.95, temperature: -2 },
};

test("angle, split/PIP, crop, transform, color, B-roll, still, reference, lower-third, logo, and packaging decisions are canonical commands", () => {
  let history = createHammerCompositionHistory(HAMMER_COMPOSITION_FIXTURES.semanticPlan);
  history = commitHammerCompositionCommand(history, buildHammerVisualCompositionCommand("camera-a", { ...phase6Visual, layout: "split_screen" }), "Compose split screen");
  history = commitHammerCompositionCommand(history, buildHammerVisualCompositionCommand("camera-a", phase6Visual), "Compose PIP angle");
  const roles = ["broll", "still", "reference", "lower_third", "logo"] as const;
  roles.forEach((role, index) => {
    history = commitHammerCompositionCommand(history, buildHammerVisualClipCommand({ clip_id: `visual:${role}`, track_id: role === "lower_third" || role === "logo" ? "graphics" : "video", kind: role === "lower_third" || role === "logo" ? "graphic" : "media", source_media_id: role === "lower_third" || role === "logo" ? null : index % 2 ? "cam-b" : "cam-a", source_start_sec: 0, source_end_sec: 2, timeline_start_sec: 12 + index * 2, timeline_end_sec: 14 + index * 2, enabled: true, linked_group_id: null, payload: { visual: { ...phase6Visual, role } } }), `Add ${role}`);
  });
  const composition = readHammerCompositionAtHead(history);
  const plan = compileHammerRenderPlan(composition);
  const preview = buildHammerInteractivePreviewFrameV1({ plan, expectedCompositionFingerprint: composition.fingerprint, atSec: 13, provenance: composition.source_media });
  assert.deepEqual(plan.operations.find((operation) => operation.operation_id === "clip:camera-a")?.payload.visual, phase6Visual);
  assert.equal(preview.visual_layers.some((operation) => operation.operation_id === "clip:visual:broll"), true);
  assert.equal(plan.packaging.intro_operation_id, "clip:intro");
  assert.equal(plan.packaging.outro_operation_id, "clip:outro");
});

test("automatic placement remains an undoable timeline decision and canonical matte/frame policy remains unchanged", () => {
  const base = HAMMER_COMPOSITION_FIXTURES.semanticPlan;
  let history = createHammerCompositionHistory(base);
  history = commitHammerCompositionCommand(history, { type: "set_automated_placement", placement_id: "placement:advisory", payload: { start_sec: 5, end_sec: 9, frame_identity: "frame:current", x: 0.1, y: 0.8 } }, "Accept placement proposal");
  assert.equal(compileHammerRenderPlan(readHammerCompositionAtHead(history)).operations.some((operation) => operation.operation_id === "placement:placement:advisory"), true);
  assert.deepEqual(readHammerCompositionAtHead(undoHammerComposition(history)), base);
  const placementAuthority = readFileSync(new URL("../src/features/auto-placement/canonicalPlacementAuthority.ts", import.meta.url), "utf8");
  assert.match(placementAuthority, /matte\.alphaMask/);
  assert.match(placementAuthority, /sameFaceAnalysisFrame/);
  assert.match(placementAuthority, /decision\.kind === "commit_allowed"/);
});

const phase7Segments = [
  { segment_id: "s1", speaker: "Host", text: "Welcome back.", start_sec: 5, end_sec: 7 },
  { segment_id: "s2", speaker: "Guest", text: "The edit is canonical.", start_sec: 7, end_sec: 10 },
];

test("Phase 7 builds separately editable caption artifacts from transcript truth without rewriting transcript truth", () => {
  const base = HAMMER_COMPOSITION_FIXTURES.semanticPlan;
  const artifact = buildHammerCaptionArtifactFromTranscriptV1({
    artifactId: "captions:phase7",
    transcriptId: base.transcript.transcript_id!,
    stylePresetId: "podcast-readable",
    templateVersion: "caption-template.v1",
    segments: phase7Segments,
  });
  let history = createHammerCompositionHistory(base);
  history = commitHammerCompositionCommand(history, buildHammerCaptionArtifactCommand(artifact), "Build captions");
  history = commitHammerCompositionCommand(history, buildHammerCaptionCueEditCommand("cue:s1", "Welcome back!"), "Correct caption cue");
  const edited = readHammerCompositionAtHead(history);
  assert.equal(edited.captions.artifact?.cues[0]?.text, "Welcome back!");
  assert.deepEqual(edited.transcript, base.transcript);
  const plan = compileHammerRenderPlan(edited);
  const captionOperation = plan.operations.find((operation) => operation.operation_id === "caption-artifact:cue:s1");
  assert.equal(captionOperation?.payload.template_version, "caption-template.v1");
  assert.deepEqual((captionOperation?.payload.cue as { safe_area: unknown }).safe_area, { left: 0.08, top: 0.72, right: 0.92, bottom: 0.94 });
  const frame = buildHammerInteractivePreviewFrameV1({ plan, expectedCompositionFingerprint: edited.fingerprint, atSec: 6, provenance: edited.source_media });
  assert.equal(frame.captions.some((operation) => operation.operation_id === "caption-artifact:cue:s1"), true);
  assert.deepEqual(readHammerCompositionAtHead(undoHammerComposition(undoHammerComposition(history))), base);
});

test("transcript changes explicitly invalidate, rebuild, or preserve caption artifacts", () => {
  const base = HAMMER_COMPOSITION_FIXTURES.semanticPlan;
  const artifact = buildHammerCaptionArtifactFromTranscriptV1({ artifactId: "captions:phase7", transcriptId: base.transcript.transcript_id!, stylePresetId: "podcast-readable", templateVersion: "caption-template.v1", segments: phase7Segments });
  const captioned = applyHammerCompositionCommand(base, buildHammerCaptionArtifactCommand(artifact));
  const invalidated = applyHammerCompositionCommand(captioned, buildHammerTranscriptCorrectionCommand("s1", "Corrected transcript truth"));
  assert.equal(invalidated.captions.stale, true);
  assert.throws(() => compileHammerRenderPlan(invalidated), /caption_artifact_stale/);
  assert.deepEqual(reconcileHammerCaptionArtifactAfterTranscriptChangeV1({ current: artifact, action: "invalidate" }), { kind: "invalidate", reason: "transcript_changed" });
  const rebuilt = buildHammerCaptionArtifactFromTranscriptV1({ artifactId: "captions:phase7:rebuilt", transcriptId: base.transcript.transcript_id!, stylePresetId: "podcast-readable", templateVersion: "caption-template.v2", segments: [{ ...phase7Segments[0], text: "Corrected transcript truth" }, phase7Segments[1]!] });
  assert.equal(reconcileHammerCaptionArtifactAfterTranscriptChangeV1({ current: artifact, action: "rebuild", rebuilt }).kind, "rebuild");
  assert.equal(reconcileHammerCaptionArtifactAfterTranscriptChangeV1({ current: artifact, action: "preserve_explicit", preserveReason: "Creator keeps manual caption wording." }).kind, "preserve_explicit");
});

test("bounded graphic templates cover lower thirds, chapter cards, quote cards, statistic cards, and brand packages", () => {
  const base = HAMMER_COMPOSITION_FIXTURES.semanticPlan;
  const kinds = ["lower_third", "chapter_card", "quote_card", "statistic_card", "brand_package"] as const;
  let history = createHammerCompositionHistory(base);
  kinds.forEach((kind, index) => {
    const template: HammerGraphicTemplateV1 = {
      template_id: `template:${kind}`,
      template_version: "template.v1",
      kind,
      style_preset_id: "forge-brand",
      safe_area: { left: 0.06, top: 0.08, right: 0.94, bottom: 0.92 },
      keyframes: [{ property: "opacity", at_sec: 6 + index, value: 1, min: 0, max: 1 }],
    };
    history = commitHammerCompositionCommand(history, buildHammerGraphicTemplateCommand({ clip_id: `graphic:${kind}`, track_id: "graphics", kind: "graphic", source_media_id: null, source_start_sec: 0, source_end_sec: 0, timeline_start_sec: 6 + index, timeline_end_sec: 8 + index, enabled: true, linked_group_id: null, payload: { text: kind } }, template), `Add ${kind}`);
  });
  const composition = readHammerCompositionAtHead(history);
  const plan = compileHammerRenderPlan(composition);
  assert.deepEqual(plan.operations.filter((operation) => operation.kind === "graphic" && operation.operation_id.startsWith("clip:graphic:")).map((operation) => (operation.payload.template as HammerGraphicTemplateV1).kind), kinds);
  assert.equal(buildHammerInteractivePreviewFrameV1({ plan, expectedCompositionFingerprint: composition.fingerprint, atSec: 7.5, provenance: composition.source_media }).visual_layers.some((operation) => operation.operation_id === "clip:graphic:lower_third"), true);
  assert.throws(() => validateHammerGraphicTemplateV1({ template_id: "bad", template_version: "template.v1", kind: "lower_third", style_preset_id: "forge-brand", safe_area: { left: 0, top: 0, right: 1, bottom: 1 }, keyframes: [{ property: "opacity", at_sec: 0, value: 2, min: 0, max: 1 }] }), /graphic_keyframe_out_of_bounds/);
  for (let index = 0; index < kinds.length; index += 1) history = undoHammerComposition(history);
  assert.deepEqual(readHammerCompositionAtHead(history), base);
});

function buildPhase8PackagedHistory() {
  const base = HAMMER_COMPOSITION_FIXTURES.semanticPlan;
  const sourceGroup = createHammerSourceGroupV1({ sourceGroupId: "phase8-interview", primarySourceMediaId: "cam-a", method: "manual", sources: [
    { source_media_id: "cam-a", manual_offset_sec: 0, evidence_fingerprint: "manual:a" },
    { source_media_id: "cam-b", manual_offset_sec: 0.08, evidence_fingerprint: "manual:b" },
  ] });
  const captions = buildHammerCaptionArtifactFromTranscriptV1({
    artifactId: "captions:phase8",
    transcriptId: base.transcript.transcript_id!,
    stylePresetId: "podcast-readable",
    templateVersion: "caption-template.v1",
    segments: [
      { segment_id: "s1", speaker: "Host", text: "Intro lands cleanly.", start_sec: 5, end_sec: 8 },
      { segment_id: "s2", speaker: "Guest", text: "The package stays continuous.", start_sec: 35, end_sec: 38 },
      { segment_id: "s3", speaker: "Host", text: "Outro is ready.", start_sec: 62, end_sec: 65 },
    ],
  });
  const template: HammerGraphicTemplateV1 = {
    template_id: "template:phase8-brand",
    template_version: "template.v1",
    kind: "brand_package",
    style_preset_id: "forge-brand",
    safe_area: { left: 0.06, top: 0.08, right: 0.94, bottom: 0.92 },
    keyframes: [{ property: "opacity", at_sec: 5, value: 1, min: 0, max: 1 }],
  };
  let history = createHammerCompositionHistory(base);
  history = commitHammerCompositionCommand(history, { type: "upsert_source_group", source_group: sourceGroup }, "Sync cameras");
  history = commitHammerCompositionCommand(history, buildHammerCaptionArtifactCommand(captions), "Build package captions");
  history = commitHammerCompositionCommand(history, buildHammerGraphicTemplateCommand({ clip_id: "graphic:phase8-brand", track_id: "graphics", kind: "graphic", source_media_id: null, source_start_sec: 0, source_end_sec: 0, timeline_start_sec: 5, timeline_end_sec: 65, enabled: true, linked_group_id: null, payload: { text: "Forge" } }, template), "Add brand package");
  history = commitHammerCompositionCommand(history, buildHammerProgramPackageCommand({ intro_clip_id: "intro", outro_clip_id: "outro", thumbnail_asset_id: "thumb:phase8", reference_asset_ids: ["ref:thumbnail", "ref:show-notes"] }), "Assemble full program");
  return history;
}

test("Phase 8 proves intro-program-outro as one continuous package with all mounted creative elements", () => {
  const history = buildPhase8PackagedHistory();
  const composition = readHammerCompositionAtHead(history);
  const plan = compileHammerRenderPlan(composition);
  const proof = proveHammerFullProgramPackageAssemblyV1({ composition, plan });
  assert.deepEqual(proof.sequence, ["intro", "program", "outro"]);
  assert.deepEqual(proof.boundaries, { intro_start_sec: 0, program_start_sec: 5, outro_start_sec: 65, end_sec: 70 });
  assert.deepEqual(proof.includes, { music: true, graphics: true, captions: true, final_audio_treatment: true, transitions: true, thumbnail: true, references: true, multicamera: true });
  assert.deepEqual(plan.packaging, { intro_operation_id: "clip:intro", outro_operation_id: "clip:outro", thumbnail_asset_id: "thumb:phase8", reference_asset_ids: ["ref:thumbnail", "ref:show-notes"] });
  assert.equal(selectHammerPreviewOperations(plan, 2).some((operation) => operation.package_role === "intro"), true);
  assert.equal(selectHammerPreviewOperations(plan, 20).some((operation) => operation.package_role === "program"), true);
  assert.equal(selectHammerPreviewOperations(plan, 68).some((operation) => operation.package_role === "outro"), true);
  assert.equal(buildHammerInteractivePreviewFrameV1({ plan, expectedCompositionFingerprint: composition.fingerprint, atSec: 36, provenance: composition.source_media }).captions.some((operation) => operation.operation_id === "caption-artifact:cue:s2"), true);
});

test("Phase 8 package assembly fails closed for missing assets, boundary gaps, and unacknowledged stale reopen", () => {
  const history = buildPhase8PackagedHistory();
  const composition = readHammerCompositionAtHead(history);
  assert.throws(() => compileHammerRenderPlan(applyHammerCompositionCommand(composition, { type: "set_packaging", intro_clip_id: "missing-intro", outro_clip_id: "outro", thumbnail_asset_id: "thumb:phase8" })), /package_intro_unresolved/);
  const missingThumbnail = applyHammerCompositionCommand(composition, { type: "set_packaging", intro_clip_id: "intro", outro_clip_id: "outro", thumbnail_asset_id: null });
  assert.throws(() => proveHammerFullProgramPackageAssemblyV1({ composition: missingThumbnail, plan: compileHammerRenderPlan(missingThumbnail) }), /thumbnail_missing/);
  const gapped = applyHammerCompositionCommand(composition, { type: "trim_clip", clip_id: "camera-a", start_sec: 6, end_sec: 35 });
  assert.throws(() => proveHammerFullProgramPackageAssemblyV1({ composition: gapped, plan: compileHammerRenderPlan(gapped) }), /intro_boundary_gap/);
  const transaction = prepareHammerCompositionTransactionV2({ history, command: { type: "set_packaging", intro_clip_id: "intro", outro_clip_id: "outro", thumbnail_asset_id: "thumb:phase8:ack", reference_asset_ids: ["ref:thumbnail"] }, label: "Update package thumbnail", expectedRevisionUpdatedAt: composition.updated_at });
  const head = transaction.history.entries[transaction.history.head_index]!.entry_id;
  const reopened = readAcknowledgedHammerCompositionV2({ transaction, recordingRevisionId: composition.recording_revision_id, acknowledgedRevision: transaction.composition.revision, acknowledgedFingerprint: transaction.composition.fingerprint, acknowledgedHistoryHeadId: head });
  assert.equal(proveHammerFullProgramPackageAssemblyV1({ composition: reopened, plan: compileHammerRenderPlan(reopened) }).includes.references, true);
  assert.throws(() => readAcknowledgedHammerCompositionV2({ transaction, recordingRevisionId: composition.recording_revision_id, acknowledgedRevision: transaction.composition.revision - 1, acknowledgedFingerprint: transaction.composition.fingerprint, acknowledgedHistoryHeadId: head }), /not_acknowledged/);
});

test("Phase 8 package edits participate in canonical history and repeated Undo restores raw package state", () => {
  let history = buildPhase8PackagedHistory();
  const base = HAMMER_COMPOSITION_FIXTURES.semanticPlan;
  for (let index = 0; index < 4; index += 1) history = undoHammerComposition(history);
  assert.deepEqual(readHammerCompositionAtHead(history), base);
});

test("Phase 10 performance budgets identify the required optimization boundary without creating authority", () => {
  const passing = evaluateHammerPerformanceBudgetsV1(HAMMER_PERFORMANCE_BUDGETS_V1);
  assert.equal(passing.passed, true);
  assert.equal(passing.rows.every((row) => row.required_boundary === "none"), true);

  const measured = evaluateHammerPerformanceBudgetsV1({
    ...HAMMER_PERFORMANCE_BUDGETS_V1,
    long_form_startup_ms: HAMMER_PERFORMANCE_BUDGETS_V1.long_form_startup_ms + 1,
    seek_latency_ms: HAMMER_PERFORMANCE_BUDGETS_V1.seek_latency_ms + 1,
    analysis_incremental_ms: HAMMER_PERFORMANCE_BUDGETS_V1.analysis_incremental_ms + 1,
  });
  assert.equal(measured.passed, false);
  assert.equal(measured.rows.find((row) => row.key === "long_form_startup_ms")?.required_boundary, "virtualization");
  assert.equal(measured.rows.find((row) => row.key === "seek_latency_ms")?.required_boundary, "bounded_cache");
  assert.equal(measured.rows.find((row) => row.key === "analysis_incremental_ms")?.required_boundary, "worker");
});

test("Phase 10 bounded caches are disposable accelerators keyed by source fingerprint and generator version", () => {
  const composition = HAMMER_COMPOSITION_FIXTURES.semanticPlan;
  const source = composition.source_media[0]!;
  let cache = createHammerBoundedCacheV1<string>({ maxEntries: 2, maxBytes: 20 });
  cache = putHammerBoundedCacheEntryV1({ cache, cacheId: "waveform", sourceFingerprint: source.content_fingerprint, generatorVersion: "waveform.v1", value: "peaks", byteSize: 5, touchedAtMs: 1 });
  cache = putHammerBoundedCacheEntryV1({ cache, cacheId: "thumbnail", sourceFingerprint: source.content_fingerprint, generatorVersion: "thumb.v1", value: "image", byteSize: 5, touchedAtMs: 2 });
  cache = putHammerBoundedCacheEntryV1({ cache, cacheId: "proxy", sourceFingerprint: source.content_fingerprint, generatorVersion: "proxy.v1", value: "bytes", byteSize: 5, touchedAtMs: 3 });
  assert.equal(readHammerBoundedCacheEntryV1({ cache, cacheId: "waveform", sourceFingerprint: source.content_fingerprint, generatorVersion: "waveform.v1" }), null);
  assert.equal(readHammerBoundedCacheEntryV1({ cache, cacheId: "proxy", sourceFingerprint: source.content_fingerprint, generatorVersion: "proxy.v1" })?.value, "bytes");
  cache = deleteHammerBoundedCacheEntryV1({ cache, cacheId: "proxy", sourceFingerprint: source.content_fingerprint, generatorVersion: "proxy.v1" });
  assert.equal(readHammerBoundedCacheEntryV1({ cache, cacheId: "proxy", sourceFingerprint: source.content_fingerprint, generatorVersion: "proxy.v1" }), null);
  assert.deepEqual(composition, HAMMER_COMPOSITION_FIXTURES.semanticPlan);
});

test("Phase 10 AI assistance remains proposal-only, identity-bound, and stale-result rejected", () => {
  const composition = HAMMER_COMPOSITION_FIXTURES.semanticPlan;
  const proposal = createHammerAiProposalV1({
    proposalId: "ai:caption-correction:1",
    kind: "caption_correction",
    composition,
    proposedCommands: [{ type: "correct_caption", clip_id: "caption-1", corrected_text: "Welcome!" }],
    explanation: "Fix punctuation in a caption artifact only.",
    createdAt: "2026-07-13T00:00:00.000Z",
  });
  let history = createHammerCompositionHistory(composition);
  assert.deepEqual(readHammerCompositionAtHead(history), composition);
  const [command] = acceptHammerAiProposalV1({ composition, proposal });
  assert.deepEqual(command, { type: "correct_caption", clip_id: "caption-1", corrected_text: "Welcome!" });
  history = commitHammerCompositionCommand(history, command!, "Accept AI caption proposal");
  const accepted = readHammerCompositionAtHead(history);
  assert.equal(history.entries.length, 1);
  assert.equal(accepted.tracks.find((track) => track.track_id === "captions")?.clips[0]?.payload.corrected_text, "Welcome!");
  assert.deepEqual(readHammerCompositionAtHead(undoHammerComposition(history)), composition);
  assert.throws(() => acceptHammerAiProposalV1({ composition: accepted, proposal }), /hammer_ai_proposal_stale/);
  assert.equal(history.entries.length, 1);
  assert.throws(() => acceptHammerAiProposalV1({ composition: { ...composition, source_media: [{ ...composition.source_media[0]!, content_fingerprint: "sha256:changed" }, ...composition.source_media.slice(1)] }, proposal }), /hammer_ai_proposal_source_mismatch/);
  assert.deepEqual(readHammerCompositionAtHead(createHammerCompositionHistory(composition)), composition);
});

test("Phase 10 permanent expansion gate preserves Composition V2, preview/render parity, and full-program proof", () => {
  const history = buildPhase8PackagedHistory();
  const composition = readHammerCompositionAtHead(history);
  const plan = compileHammerRenderPlan(composition);
  const frame = buildHammerInteractivePreviewFrameV1({ plan, expectedCompositionFingerprint: composition.fingerprint, atSec: 36, provenance: composition.source_media });
  const packageProof = proveHammerFullProgramPackageAssemblyV1({ composition, plan });
  const performance = evaluateHammerPerformanceBudgetsV1({
    long_form_startup_ms: 2_000,
    seek_latency_ms: 120,
    edit_latency_ms: 80,
    save_acknowledgement_ms: 900,
    memory_mb: 640,
    analysis_incremental_ms: 350,
    render_plan_compile_ms: 200,
  });
  const report = auditHammerPermanentExpansionGateV1({
    performance,
    aiProposalOnly: true,
    boundedCacheDeletionProven: true,
    previewRenderParityProven: frame.plan_fingerprint === plan.fingerprint && frame.visual_layers.length > 0 && frame.captions.length > 0,
    fullProgramFixtureProven: packageProof.render_plan_fingerprint === plan.fingerprint,
    migrationRlsDisposition: "none_required",
    explicitDeferrals: ["deep_collaboration", "review_portals", "custom_shortcuts", "dual_monitor_layouts", "broader_motion_design"],
  });
  assert.equal(report.passed, true);
  assert.deepEqual(report.rules, HAMMER_PERMANENT_EXPANSION_RULES_V1);
  assert.equal(report.migration_rls_disposition, "none_required");
});

test("Phase 10 permanent gates are wired into discovery, ratchets, coverage, lint, and build scripts", () => {
  const packageJson = readFileSync(new URL("../package.json", import.meta.url), "utf8");
  const architectureRatchet = readFileSync(new URL("../scripts/check-architecture-ratchet.mjs", import.meta.url), "utf8");
  const coverageRatchet = readFileSync(new URL("../scripts/check-coverage-ratchet.mjs", import.meta.url), "utf8");
  const runAllTests = readFileSync(new URL("../scripts/run-all-tests.mjs", import.meta.url), "utf8");
  const persistence = readFileSync(new URL("../src/persistence/hammerRecordingRevisionPersistence.ts", import.meta.url), "utf8");
  assert.match(packageJson, /"test:all": "pnpm run types:ratchet && node scripts\/run-all-tests\.mjs"/);
  assert.match(packageJson, /"test:coverage": "pnpm run types:ratchet && pnpm run test:coverage:collect && node scripts\/check-coverage-ratchet\.mjs"/);
  assert.match(packageJson, /"lint": "node scripts\/check-lint-ratchet\.mjs"/);
  assert.match(architectureRatchet, /localStorage\|sessionStorage/);
  assert.equal(architectureRatchet.includes(`${"@ts-" + "nocheck"} is prohibited`), true);
  assert.match(coverageRatchet, /coverage/);
  assert.match(runAllTests, /tests/);
  assert.doesNotMatch(persistence, /localStorage|sessionStorage/);
});
