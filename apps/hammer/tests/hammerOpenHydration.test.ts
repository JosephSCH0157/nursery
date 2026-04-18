import assert from "node:assert/strict";
import test from "node:test";
import type { HammerPersistenceSnapshot } from "../src/persistence/hammerPersistenceContract";
import { hydrateHammerOpenLaunchContext } from "../src/editor/hammerOpenHydration";
import { projectEditorialAuthorityGraphFromEditPlan } from "../src/editor/hammerRenderAssembly";

const target = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  workpieceId: "22222222-2222-4222-8222-222222222222",
};

const canonicalEditPlan = {
  edit_plan_id: "plan_reopen_01",
  version: "1",
  created_at: "2026-04-17T12:00:00.000Z",
  updated_at: "2026-04-17T12:00:00.000Z",
  source_transcript_id: "transcript_reopen_01",
  preview_mode: "edit-aware" as const,
  instructions: [],
};

const canonicalGraph = projectEditorialAuthorityGraphFromEditPlan({
  editPlan: canonicalEditPlan,
  workspaceId: target.workspaceId,
  workpieceId: target.workpieceId,
  sessionId: "session_reopen_01",
});

const fallbackLaunchContext = {
  workspace_id: target.workspaceId,
  workpiece_id: target.workpieceId,
  session_id: "session_launch_fallback",
  source_mode: "tongs",
  transcript: {
    kind: "tongs-stub",
    transcript_id: "transcript_launch_fallback",
    segments: [],
    label: "transcript_launch_fallback",
  },
  media: {
    kind: "tongs-stub",
    ref: {
      media_id: "media_launch_fallback",
      kind: "recording_video",
      source_hint: "local",
    },
    label: "tongs:media_launch_fallback",
  },
  edit_plan: {
    edit_plan_id: "plan_launch_fallback",
    version: "1",
    created_at: "2026-04-16T10:00:00.000Z",
    updated_at: "2026-04-16T10:00:00.000Z",
    source_transcript_id: "transcript_launch_fallback",
    preview_mode: "edit-aware" as const,
    instructions: [],
  },
  preview_mode: "edit-aware",
} as const;

function buildCanonicalOnlySnapshot(): HammerPersistenceSnapshot {
  return {
    schema_version: 1,
    state: {
      workspace_id: target.workspaceId,
      workpiece_id: target.workpieceId,
      active_session_id: "session_reopen_01",
      current_pass: "transcript_cleanup",
      pass_order_version: 2,
      pass_status: {
        transcript_cleanup: "in_progress",
        retakes: "not_started",
      },
      editor_session_path: null,
      transcript_artifact_path: null,
      speaker_map_artifact_path: null,
      visual_placement_artifact_path: null,
      visual_timeline_artifact_path: null,
      audio_polish_artifact_path: null,
      edit_plan_artifact_path: null,
      editorial_authority_artifact_path: "hammer/session/editorial-authority.v1.json",
      edit_plan_signature: null,
      prep_status: "prepared",
      alignment_status: "aligned",
      macro_recipe_ref: null,
      last_macro_run_ref: null,
      last_opened_at: "2026-04-17T12:00:00.000Z",
      updated_at: "2026-04-17T12:00:00.000Z",
      updated_by: "33333333-3333-4333-8333-333333333333",
    },
    editor_session: { path: null, updated_at: null, data: null },
    structured_transcript: { path: null, updated_at: null, data: null },
    speaker_map: { path: null, updated_at: null, data: null },
    visual_placements: { path: null, updated_at: null, data: null },
    visual_timeline: { path: null, updated_at: null, data: null },
    audio_polish: { path: null, updated_at: null, data: null },
    edit_plan: { path: null, updated_at: null, data: null },
    editorial_authority: {
      path: "hammer/session/editorial-authority.v1.json",
      updated_at: "2026-04-17T12:00:00.000Z",
      data: canonicalGraph,
    },
    macro_hooks: { recipe_ref: null, last_run_ref: null },
  };
}

function buildStructuredTranscriptArtifact(): NonNullable<HammerPersistenceSnapshot["structured_transcript"]["data"]> {
  return {
    schema_version: 1,
    transcript_id: "transcript_reopen_01",
    media_id: "media_launch_fallback",
    media_signature: null,
    prepared_at: "2026-04-17T12:00:00.000Z",
    structure: "speaker_turns",
    source_media_ref: {
      media_id: "media_launch_fallback",
      kind: "recording_video",
      source_hint: "local",
    },
    diarization: {
      label_scheme: "forge-neutral-speakers.v1",
      labels: ["Speaker 1"],
      raw_labels: ["speaker_0"],
      version: null,
      provider: "openai",
      provider_request_id: null,
      model: null,
    },
    confidence_flags: [],
    segments: [{
      id: "seg_reopen_01",
      speaker: "Speaker 1",
      start: 0,
      end: 4,
      text: "Persisted transcript fallback text.",
    }],
  };
}

function buildEditorSessionArtifact(): NonNullable<HammerPersistenceSnapshot["editor_session"]["data"]> {
  return {
    schema_version: 1,
    session_id: "session_reopen_01",
    source_mode: "tongs",
    preview_mode: "edit-aware",
    transcript_source_id: "transcript_reopen_01",
    selected_segment_id: "seg_reopen_01",
    selected_overlay_row_id: null,
    media_ref: {
      media_id: "media_launch_fallback",
      kind: "recording_video",
      source_hint: "local",
    },
    workspace_mapping: null,
    media_source_label: "tongs:media_launch_fallback",
    visual_preview: {
      white_balance: 0,
      color_amount: 0,
      background_blur: false,
    },
    last_opened_at: "2026-04-17T12:00:00.000Z",
  };
}

test("reopen hydration prefers persisted canonical basis and strips stale launch edit_plan", () => {
  const result = hydrateHammerOpenLaunchContext({
    target,
    hydratedSnapshot: buildCanonicalOnlySnapshot(),
    initialLaunchContext: fallbackLaunchContext as any,
    bootstrapLaunchContext: undefined,
  });
  assert.equal(result.persistenceSource, "persistence");
  assert.equal(result.hasCanonicalBasis, true);
  assert.equal(result.launchContext?.edit_plan?.edit_plan_id, "plan_reopen_01");
});

test("reopen hydration preserves persisted canonical edit_plan when present", () => {
  const snapshotWithPlan: HammerPersistenceSnapshot = {
    ...buildCanonicalOnlySnapshot(),
    edit_plan: {
      path: "hammer/edit-plan/current.v1.json",
      updated_at: "2026-04-17T12:00:00.000Z",
      data: canonicalEditPlan,
    },
  };
  const result = hydrateHammerOpenLaunchContext({
    target,
    hydratedSnapshot: snapshotWithPlan,
    initialLaunchContext: fallbackLaunchContext as any,
    bootstrapLaunchContext: undefined,
  });
  assert.equal(result.persistenceSource, "persistence");
  assert.equal(result.hasCanonicalBasis, true);
  assert.equal(result.launchContext?.edit_plan?.edit_plan_id, "plan_reopen_01");
});

test("reopen hydration marks persisted state non-canonical when editorial authority and transcript are both missing", () => {
  const result = hydrateHammerOpenLaunchContext({
    target,
    hydratedSnapshot: {
      ...buildCanonicalOnlySnapshot(),
      editorial_authority: { path: null, updated_at: null, data: null },
      edit_plan: {
        path: "hammer/edit-plan/current.v1.json",
        updated_at: "2026-04-17T12:00:00.000Z",
        data: canonicalEditPlan,
      },
    },
    initialLaunchContext: fallbackLaunchContext as any,
    bootstrapLaunchContext: undefined,
  });
  assert.equal(result.persistenceSource, "launch");
  assert.equal(result.hasCanonicalBasis, false);
  assert.equal(result.launchContext?.edit_plan?.edit_plan_id, "plan_launch_fallback");
});

test("reopen hydration uses structured transcript fallback when editorial authority is missing", () => {
  const warnCalls: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnCalls.push(args);
  };

  try {
    const result = hydrateHammerOpenLaunchContext({
      target,
      hydratedSnapshot: {
        ...buildCanonicalOnlySnapshot(),
        editorial_authority: { path: null, updated_at: null, data: null },
        structured_transcript: {
          path: "hammer/transcript/structured.v1.json",
          updated_at: "2026-04-17T12:00:00.000Z",
          data: buildStructuredTranscriptArtifact(),
        },
        editor_session: {
          path: "hammer/session/editor-state.v1.json",
          updated_at: "2026-04-17T12:00:00.000Z",
          data: buildEditorSessionArtifact(),
        },
      },
      initialLaunchContext: undefined,
      bootstrapLaunchContext: fallbackLaunchContext as any,
    });

    assert.equal(result.persistenceSource, "transitional");
    assert.equal(result.hasCanonicalBasis, false);
    assert.equal(result.launchContext?.transcript.kind, "tongs-stub");
    assert.equal(result.launchContext?.transcript.kind === "tongs-stub" ? result.launchContext.transcript.transcript_id : null, "transcript_reopen_01");
    assert.equal(result.launchContext?.edit_plan, undefined);
    assert.equal(warnCalls.length, 1);
    assert.equal(warnCalls[0]?.[0], "[HammerReopen] reopening from structured transcript fallback; canonical authority missing");
  } finally {
    console.warn = originalWarn;
  }
});
