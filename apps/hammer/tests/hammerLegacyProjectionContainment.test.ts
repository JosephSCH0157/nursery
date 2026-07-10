import assert from "node:assert/strict";
import test from "node:test";
import type { HammerPersistenceSnapshot } from "../src/persistence/hammerPersistenceContract";
import {
  buildHammerLaunchContextFromPersistence,
} from "../src/persistence/hammerPersistence";
import { projectEditorialAuthorityGraphFromEditPlan } from "../src/editor/hammerRenderAssembly";

const target = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  workpieceId: "22222222-2222-4222-8222-222222222222",
};

const fallbackEditPlan = {
  edit_plan_id: "plan_gate_test",
  version: "1",
  created_at: "2026-04-17T12:00:00.000Z",
  updated_at: "2026-04-17T12:00:00.000Z",
  source_transcript_id: "transcript_gate_test",
  preview_mode: "edit-aware" as const,
  instructions: [],
};

const canonicalGraph = projectEditorialAuthorityGraphFromEditPlan({
  editPlan: fallbackEditPlan,
  workspaceId: target.workspaceId,
  workpieceId: target.workpieceId,
  sessionId: "session_gate_test",
});

function buildCanonicalOnlySnapshot(): HammerPersistenceSnapshot {
  return {
    schema_version: 1,
    state: {
      workspace_id: target.workspaceId,
      workpiece_id: target.workpieceId,
    } as any,
    editor_session: { path: null, updated_at: null, data: null },
    structured_transcript: { path: null, updated_at: null, data: null },
    transcript_version_registry: { path: null, updated_at: null, data: null },
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

const fallbackLaunchContext = {
  workspace_id: target.workspaceId,
  workpiece_id: target.workpieceId,
  session_id: "session_gate_fallback",
  source_mode: "tongs",
  transcript: {
    kind: "tongs-stub",
    transcript_id: "transcript_gate_fallback",
    segments: [],
    label: "transcript_gate_fallback",
  },
  media: {
    kind: "tongs-stub",
    ref: {
      media_id: "media_gate_fallback",
      kind: "recording_video",
      source_hint: "local",
    },
    label: "tongs:media_gate_fallback",
  },
  edit_plan: fallbackEditPlan,
  preview_mode: "edit-aware",
} as const;

test("launch hydration does not silently backfill legacy edit_plan by default", () => {
  const hydrated = buildHammerLaunchContextFromPersistence(
    target,
    buildCanonicalOnlySnapshot(),
    fallbackLaunchContext as any,
  );
  assert.ok(hydrated);
  assert.equal(hydrated?.launchContext.edit_plan, undefined);
});

test("launch hydration projects edit_plan only when legacy projection gate is enabled", () => {
  const hydrated = buildHammerLaunchContextFromPersistence(
    target,
    buildCanonicalOnlySnapshot(),
    fallbackLaunchContext as any,
    { allowLegacyEditPlanProjection: true },
  );
  assert.ok(hydrated);
  assert.equal(hydrated?.launchContext.edit_plan?.source_transcript_id, "transcript_gate_test");
});
