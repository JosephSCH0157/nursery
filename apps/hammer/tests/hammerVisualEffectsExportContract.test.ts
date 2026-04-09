import assert from "node:assert/strict";
import {
  normalizeHammerBackgroundEffectSettingsV1,
} from "../../../packages/contracts/hammer/visual-effects-export.contract";
import { resolveSegmentationProviderDescriptor } from "../src/features/visual-effects/providers/segmentationProviderRegistry";
import { projectEditorialAuthorityGraphFromEditPlan } from "../src/editor/hammerRenderAssembly";

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

async function run() {
  await testBackgroundEffectSettingsNormalization();
  await testProviderRegistryCapabilitiesAreCanonical();
  await testExportPostureDegradesWhenProviderNotExportSafe();
  // eslint-disable-next-line no-console
  console.log("Hammer visual-effects export contract tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer visual-effects export contract tests failed:", error);
  process.exit(1);
});

