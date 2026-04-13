import assert from "node:assert/strict";
import { deriveHammerIssueDiagnostics } from "../src/editor/hammerIssueDiagnostics";
import type { HammerSessionStateResult } from "../src/editor/hammerSessionState";
import type { HammerMediaPrepOutputsPackage } from "../src/lib/hammerMediaPrepOutputsPackage";

function sessionState(partial: Partial<HammerSessionStateResult>): HammerSessionStateResult {
  return {
    status: "idle",
    reasonCodes: [],
    humanLabel: "Editing",
    detail: null,
    isBlocking: false,
    isDegraded: false,
    ...partial,
  };
}

function mediaPrep(partial: Partial<HammerMediaPrepOutputsPackage>): HammerMediaPrepOutputsPackage {
  return {
    schema_version: 1,
    visuals: {
      status: "missing",
      freshness: "missing",
      transcript_source_ref: null,
      source_refs: [],
      placement_count: 0,
      uncertain_placement_count: 0,
      uncertainty_flags: [],
      placements: [],
    },
    audio: {
      raw_source: {
        media_id: null,
        kind: null,
        media_signature: null,
        local_relpath: null,
        cloud_uri: null,
        source_hint: null,
        media_source_label: null,
        duration_ms: null,
      },
      polish: {
        status: "missing",
        freshness: "missing",
        prepared_passes: [],
        failure_code: null,
        failure_reason: null,
        processor_version: null,
        settings_summary: {},
        output_local_relpath: null,
        output_workpiece_path: null,
        output_mime_type: null,
        output_duration_ms: null,
      },
      preferred_playback: {
        kind: "none",
        reason: "no_media_source",
        media_id: null,
        local_relpath: null,
        workpiece_path: null,
        mime_type: null,
        source_label: null,
      },
    },
    ...partial,
  };
}

async function testAudioPolishStaleMapsToAction() {
  const issues = deriveHammerIssueDiagnostics({
    sessionState: sessionState({ status: "degraded_mode", reasonCodes: ["audio_polish_stale"], isDegraded: true }),
    mediaPrepOutputs: mediaPrep({
      audio: {
        ...mediaPrep({}).audio,
        polish: { ...mediaPrep({}).audio.polish, status: "prepared", freshness: "stale" },
      },
    }),
    mediaLabelMismatchWarning: null,
  });

  const stale = issues.find((issue) => issue.id === "audio_polish_stale") ?? null;
  assert.ok(stale);
  assert.equal(stale.fixActionId, "refresh_audio_prep");
  assert.equal(stale.canAutoFix, true);
  assert.ok(stale.affectedAreas.includes("playback"));
}

async function testVisualsUncertainIncludesCounts() {
  const issues = deriveHammerIssueDiagnostics({
    sessionState: sessionState({ status: "degraded_mode", reasonCodes: ["visuals_uncertain"], isDegraded: true }),
    mediaPrepOutputs: mediaPrep({
      visuals: {
        ...mediaPrep({}).visuals,
        freshness: "current",
        uncertain_placement_count: 3,
        uncertainty_flags: ["low_confidence_match"],
      },
    }),
    mediaLabelMismatchWarning: null,
  });

  const uncertain = issues.find((issue) => issue.id === "visuals_uncertain") ?? null;
  assert.ok(uncertain);
  assert.equal(uncertain.fixActionId, "refresh_visual_placements");
  assert.ok(uncertain.summary.includes("3"));
}

async function testMediaMismatchProducesStandaloneIssue() {
  const issues = deriveHammerIssueDiagnostics({
    sessionState: sessionState({ status: "idle", reasonCodes: [] }),
    mediaPrepOutputs: null,
    mediaLabelMismatchWarning: "Capture label \"A\" does not match this episode title \"B\".",
  });

  const mismatch = issues.find((issue) => issue.id === "media_label_mismatch") ?? null;
  assert.ok(mismatch);
  assert.equal(mismatch.canAutoFix, false);
  assert.equal(mismatch.fixActionId, null);
  assert.ok(mismatch.summary.includes("\"A\""));
  assert.ok(mismatch.summary.includes("\"B\""));
}

async function run() {
  await testAudioPolishStaleMapsToAction();
  await testVisualsUncertainIncludesCounts();
  await testMediaMismatchProducesStandaloneIssue();
  // eslint-disable-next-line no-console
  console.log("Hammer issue diagnostics tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer issue diagnostics tests failed:", error);
  process.exit(1);
});

