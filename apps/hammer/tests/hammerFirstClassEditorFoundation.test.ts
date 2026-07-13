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
import { acknowledgeHammerRenderJob, createHammerRenderJob, settleHammerRenderJob } from "../src/composition/hammerRenderJobV1";
import { buildHammerReleasePacketV2, validateHammerReleasePacketV2ForQuench } from "../src/composition/hammerReleasePacketV2";
import { compileHammerAudioGraphV1, diagnoseHammerAudioMaster, selectHammerAudioGraphExecution, type HammerAudioTreatmentV1 } from "../src/composition/hammerAudioGraphV1";

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
  assert.equal(plan.fingerprint, "fnv1a:11265d34");
  assert.equal(plan.duration_sec, 70);
  assert.deepEqual(plan.packaging, { intro_operation_id: "clip:intro", outro_operation_id: "clip:outro", thumbnail_asset_id: "thumb:semantic" });
  assert.deepEqual(plan.operations.find((row) => row.operation_id === "clip:camera-b"), {
    operation_id: "clip:camera-b", kind: "video", track_id: "video", track_role: "program_camera", layer_index: 0,
    start_sec: 35, end_sec: 65, source_start_sec: 0, source_end_sec: 30, source_media_id: "cam-b", source_fingerprint: "sha256:cam-b", package_role: "program",
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
  assert.equal(frame.semantic_fingerprint, "fnv1a:3df6b569");
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
