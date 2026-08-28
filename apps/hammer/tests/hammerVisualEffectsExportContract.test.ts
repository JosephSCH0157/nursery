import assert from "node:assert/strict";
import {
  normalizeHammerBackgroundEffectSettingsV1,
} from "../../../packages/contracts/hammer/visual-effects-export.contract";
import { resolveSegmentationProviderDescriptor } from "../src/features/visual-effects/providers/segmentationProviderRegistry";
import { projectEditorialAuthorityGraphFromEditPlan } from "../src/editor/hammerRenderAssembly";
import { HAMMER_COMPOSITION_FIXTURES } from "../src/composition/hammerCompositionFixtures";
import { compileHammerRenderPlan } from "../src/composition/hammerRenderPlanV1";
import { readFileSync } from "node:fs";

async function testBackgroundEffectSettingsNormalization() {
  const blur = normalizeHammerBackgroundEffectSettingsV1({
    effect_kind: "blur",
    value: {
      blur_px: "999",
      edge_feather_px: -10,
      subject_expansion_px: 1000,
      temporal_smoothing: 5,
      quality_mode: "high",
      fallback_mode: "passthrough",
    },
  });
  assert.equal(Boolean(blur), true);
  assert.equal((blur as any).blur_px, 64);
  assert.equal((blur as any).edge_feather_px, 0);
  assert.equal((blur as any).subject_expansion_px, 64);
  assert.equal((blur as any).temporal_smoothing, 1);
  assert.equal((blur as any).quality_mode, "high");
  assert.equal((blur as any).fallback_mode, "passthrough");

  const wash = normalizeHammerBackgroundEffectSettingsV1({
    effect_kind: "wash",
    value: {
      dim_amount: -1,
      desaturate_amount: 2,
      quality_mode: "unknown",
    },
  });
  assert.equal(Boolean(wash), true);
  assert.equal((wash as any).dim_amount, 0);
  assert.equal((wash as any).desaturate_amount, 1);
  assert.equal((wash as any).quality_mode, "medium");

  const solid = normalizeHammerBackgroundEffectSettingsV1({
    effect_kind: "replacement_solid",
    value: {
      replacement_color: "  #ff00ff ",
    },
  });
  assert.equal(Boolean(solid), true);
  assert.equal((solid as any).replacement_color, "#ff00ff");

  const image = normalizeHammerBackgroundEffectSettingsV1({
    effect_kind: "replacement_image",
    value: {
      replacement_asset: {
        canonical_asset_id: "asset-A",
        canonical_content_hash: "a".repeat(64),
        workspace_id: "workspace-A",
        workpiece_id: "workpiece-A",
        asset_kind: "reference_visual_image",
        readiness: "ready",
        asset_path: "/presentation-only/background.png",
      },
      fit: "contain",
    },
  });
  assert.equal(Boolean(image), true);
  assert.equal((image as any).replacement_asset.canonical_asset_id, "asset-A");
  assert.equal((image as any).fit, "contain");
  assert.equal(normalizeHammerBackgroundEffectSettingsV1({
    effect_kind: "replacement_image",
    value: { replacement_url: "https://example.test/background.png" },
  }), null);
}

async function testProviderRegistryCapabilitiesAreCanonical() {
  const descriptor = resolveSegmentationProviderDescriptor("mediapipe_selfie_segmentation");
  assert.equal(Boolean(descriptor), true);
  assert.equal(descriptor?.capabilities.preview_safe, true);
  assert.equal(descriptor?.capabilities.export_safe, false);
  assert.equal(descriptor?.capabilities.supports_frame_source, false);
}

async function testExportPostureDegradesWhenProviderNotExportSafe() {
  const graph = projectEditorialAuthorityGraphFromEditPlan({
    editPlan: {
      edit_plan_id: "plan_bg_fx_contract_01",
      version: "1",
      created_at: "2026-03-25T10:00:00.000Z",
      updated_at: "2026-03-25T10:00:00.000Z",
      source_transcript_id: "transcript_bg_fx_contract_01",
      preview_mode: "edit-aware",
      instructions: [
        {
          instruction_id: "ins_bg_fx_contract_01",
          segment_id: "seg_01",
          type: "apply_background_effect",
          effect_kind: "blur",
          provider_id: "mediapipe_selfie_segmentation",
          applies_to: "primary_video",
          settings_v1: {
            blur_px: 10,
            edge_feather_px: 2,
            subject_expansion_px: 1,
            temporal_smoothing: 0.4,
            quality_mode: "medium",
            fallback_mode: "disable",
          },
          created_at: "2026-03-25T10:00:00.000Z",
        },
      ],
    },
    workspaceId: "ws_bg_fx_contract",
    workpieceId: "wp_bg_fx_contract",
    sessionId: "session_bg_fx_contract",
  });

  const operation = graph.operations[0];
  assert.equal(Boolean(operation), true);
  assert.equal(operation?.truth_posture.preview.posture, "authoritative");
  assert.equal(operation?.truth_posture.export.posture, "degraded");
  assert.equal(operation?.truth_posture.export.reason_codes.includes("export_not_supported"), true);
}

async function testPinnedExportAuthorityMakesAcceptedEffectExecutable() {
  const graph = projectEditorialAuthorityGraphFromEditPlan({
    editPlan: {
      edit_plan_id: "plan_bg_fx_export_01",
      version: "1",
      created_at: "2026-08-28T10:00:00.000Z",
      updated_at: "2026-08-28T10:00:00.000Z",
      source_transcript_id: "transcript_bg_fx_export_01",
      preview_mode: "edit-aware",
      instructions: [{
        instruction_id: "ins_bg_fx_export_01",
        segment_id: "seg_01",
        type: "apply_background_effect",
        effect_kind: "blur",
        provider_id: "mediapipe_selfie_segmentation",
        applies_to: "primary_video",
        settings_v1: { blur_px: 14, edge_feather_px: 6, subject_expansion_px: 0, temporal_smoothing: 0.25, quality_mode: "medium", fallback_mode: "disable" },
        export_authority: {
          provider_id: "mediapipe_tasks_image_segmenter",
          provider_version: "0.10.21",
          model_id: "mediapipe_selfie_segmentation_landscape",
          model_sha256: "a".repeat(64),
          model_license: "Apache-2.0",
          runtime_image: "forge-ffmpeg:background-effects-v1",
          runtime_version: "python-3.11.9",
          ffmpeg_version: "6.1.1",
          refinement_version: "forge-matte-v1",
          confidence_threshold: 0.35,
          failure_policy: "fail_closed",
          frame_policy: { fps: 30, timestamp_mode: "monotonic_milliseconds", reset_on_cut: true, reset_on_source_change: true, reset_on_dimension_change: true },
        },
        production_mode: "production",
        created_at: "2026-08-28T10:00:00.000Z",
      }],
    },
    workspaceId: "ws_bg_fx_export",
    workpieceId: "wp_bg_fx_export",
  });
  assert.equal(graph.operations[0]?.truth_posture.export.posture, "authoritative");
  assert.equal(graph.operations[0]?.truth_posture.handoff.posture, "authoritative");
  const composition = { ...HAMMER_COMPOSITION_FIXTURES.solo, editorial_authority: graph };
  const plan = compileHammerRenderPlan(composition);
  assert.equal(plan.operations.some((operation) => operation.kind === "background_effect"), true);
  assert.equal(Boolean(plan.background_effect_fingerprint), true);
  assert.equal(plan.segmentation_authority?.model_sha256, "a".repeat(64));
  const changedGraph = structuredClone(graph);
  const instruction = changedGraph.operations[0]?.instruction;
  if (instruction?.type === "apply_background_effect") instruction.settings_v1 = { ...instruction.settings_v1, blur_px: 15 };
  const changedPlan = compileHammerRenderPlan({ ...composition, editorial_authority: changedGraph });
  assert.notEqual(changedPlan.background_effect_fingerprint, plan.background_effect_fingerprint);
  assert.notEqual(changedPlan.fingerprint, plan.fingerprint);
}

async function run() {
  await testBackgroundEffectSettingsNormalization();
  await testProviderRegistryCapabilitiesAreCanonical();
  await testExportPostureDegradesWhenProviderNotExportSafe();
  await testPinnedExportAuthorityMakesAcceptedEffectExecutable();
  const migration = readFileSync(new URL("../../../supabase/migrations/20260828140000_tongs_hammer_video_master_authority.sql", import.meta.url), "utf8");
  assert.match(migration, /create table tongs\.hammer_video_render_operations/);
  assert.match(migration, /create table tongs\.hammer_video_render_attempts/);
  assert.match(migration, /asset_kind='hammer_video_master'/);
  assert.match(migration, /auth\.role\(\)<>'service_role'/);
  assert.match(migration, /state='completed'.*output_asset_id/s);
  assert.match(migration, /replacement_asset_id uuid null references tongs\.assets/);
  const quenchPacketBuilder = readFileSync(new URL("../src/lib/hammerQuenchReleasePacket.ts", import.meta.url), "utf8");
  assert.match(quenchPacketBuilder, /activeBackgroundEffect && !args\.finalVideoMaster/);
  assert.match(quenchPacketBuilder, /throw new Error\("final_video_master_stale"\)/);
  const runner = readFileSync(new URL("../../nursery/server/tongs/workpiece-job-runner.ts", import.meta.url), "utf8");
  assert.match(runner, /from\("recording_revisions"\)/);
  assert.match(runner, /resolveReadyWorkpieceAssetStorage/);
  assert.doesNotMatch(runner, /required\("source_path"\)/);
  // eslint-disable-next-line no-console
  console.log("Hammer visual-effects export contract tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer visual-effects export contract tests failed:", error);
  process.exit(1);
});

