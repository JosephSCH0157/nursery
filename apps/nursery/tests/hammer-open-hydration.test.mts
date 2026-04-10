import assert from "node:assert/strict";
import test from "node:test";

import type { HammerLaunchContext } from "../../../packages/contracts/hammer/launch-context.contract";
import type { HammerPersistenceSnapshot, HammerPersistenceTarget } from "../../hammer/src/persistence/hammerPersistenceContract";
import { hydrateHammerOpenLaunchContext } from "../../hammer/src/editor/hammerOpenHydration";

function buildBootstrapLaunchContext(args: {
  workspaceId: string;
  workpieceId: string;
  transcriptId: string;
}): HammerLaunchContext {
  return {
    workspace_id: args.workspaceId,
    workpiece_id: args.workpieceId,
    session_id: "session_bootstrap_01",
    source_mode: "tongs",
    preview_mode: "edit-aware",
    transcript: {
      kind: "tongs-stub",
      transcript_id: args.transcriptId,
      label: args.transcriptId,
      segments: [
        { segment_id: "seg_boot_01", start_sec: 0, end_sec: 1, speaker: "S1", text: "Raw." },
      ],
    },
    media: {
      kind: "tongs-stub",
      label: "bootstrap-media",
      ref: {
        media_id: "media_bootstrap_01",
        kind: "recording_video",
        source_hint: "local",
        local_relpath: "recordings/bootstrap.mp4",
        duration_ms: 1000,
      },
      workspace_mapping: {
        workspace_id: args.workspaceId,
        local_root_abs: "D:\\ForgeMedia\\bootstrap",
      },
    },
  };
}

function buildSnapshotWithTranscriptOnly(args: {
  workspaceId: string;
  workpieceId: string;
  transcriptId: string;
}): HammerPersistenceSnapshot {
  return {
    schema_version: 1,
    state: null,
    editor_session: { path: null, updated_at: null, data: null },
    structured_transcript: {
      path: "hammer/revisions/rev_01/transcript.v1.json",
      updated_at: "2026-04-10T00:00:00.000Z",
      data: {
        schema_version: 1,
        transcript_id: args.transcriptId,
        media_id: "media_bootstrap_01",
        media_signature: null,
        prepared_at: "2026-04-10T00:00:00.000Z",
        structure: "speaker_turns",
        source_media_ref: null,
        diarization: {
          label_scheme: "forge-neutral-speakers.v1",
          labels: ["S1"],
          raw_labels: ["S1"],
          version: null,
          provider: "openai",
          provider_request_id: null,
          model: null,
        },
        confidence_flags: [],
        segments: [
          { segment_id: "seg_edit_01", start_sec: 0, end_sec: 1, speaker: "S1", text: "Edited." },
        ],
      },
    },
    speaker_map: { path: null, updated_at: null, data: null },
    visual_placements: { path: null, updated_at: null, data: null },
    visual_timeline: { path: null, updated_at: null, data: null },
    audio_polish: { path: null, updated_at: null, data: null },
    edit_plan: { path: null, updated_at: null, data: null },
    editorial_authority: { path: null, updated_at: null, data: null },
    macro_hooks: { recipe_ref: null, last_run_ref: null },
  };
}

test("hydrateHammerOpenLaunchContext merges transcript onto bootstrap when editor_session is missing", () => {
  const target: HammerPersistenceTarget = { workspaceId: "ws_01", workpieceId: "wp_01" };
  const hydratedSnapshot = buildSnapshotWithTranscriptOnly({
    workspaceId: target.workspaceId,
    workpieceId: target.workpieceId,
    transcriptId: "transcript_edited_01",
  });
  const bootstrapLaunchContext = buildBootstrapLaunchContext({
    workspaceId: target.workspaceId,
    workpieceId: target.workpieceId,
    transcriptId: "transcript_raw_01",
  });

  const result = hydrateHammerOpenLaunchContext({
    target,
    hydratedSnapshot,
    initialLaunchContext: undefined,
    bootstrapLaunchContext,
  });

  assert.ok(result.launchContext);
  assert.equal(result.hasCanonicalBasis, true);
  assert.equal(result.launchContext.transcript.kind, "tongs-stub");
  assert.equal(result.launchContext.transcript.transcript_id, "transcript_edited_01");
  assert.equal(result.launchContext.transcript.segments[0]?.text, "Edited.");
});

test("hydrateHammerOpenLaunchContext returns bootstrap when no persistence snapshot exists", () => {
  const target: HammerPersistenceTarget = { workspaceId: "ws_02", workpieceId: "wp_02" };
  const bootstrapLaunchContext = buildBootstrapLaunchContext({
    workspaceId: target.workspaceId,
    workpieceId: target.workpieceId,
    transcriptId: "transcript_raw_02",
  });

  const result = hydrateHammerOpenLaunchContext({
    target,
    hydratedSnapshot: null,
    initialLaunchContext: undefined,
    bootstrapLaunchContext,
  });

  assert.ok(result.launchContext);
  assert.equal(result.launchContext.transcript.kind, "tongs-stub");
  assert.equal(result.launchContext.transcript.transcript_id, "transcript_raw_02");
});
