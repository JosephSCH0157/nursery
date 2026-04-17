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

test("reopen hydration prefers persisted canonical basis and strips stale launch edit_plan", () => {
  const result = hydrateHammerOpenLaunchContext({
    target,
    hydratedSnapshot: buildCanonicalOnlySnapshot(),
    initialLaunchContext: fallbackLaunchContext as any,
    bootstrapLaunchContext: undefined,
  });
  assert.equal(result.persistenceSource, "persistence");
  assert.equal(result.hasCanonicalBasis, true);
  assert.equal(result.launchContext?.edit_plan, undefined);
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
