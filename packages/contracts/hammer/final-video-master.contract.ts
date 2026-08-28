import type { HammerExportSegmentationAuthority } from "./visual-effects-export.contract";

export type HammerFinalVideoRenderRequest = Readonly<{
  workspace_id: string;
  workpiece_id: string;
  recording_revision_id: string;
  composition_revision: number;
  composition_fingerprint: string;
  render_job_id: string;
  operation_fingerprint: string;
  render_plan_fingerprint: string;
  background_effect_fingerprint: string | null;
  replacement_asset_id: string | null;
  audio_master_asset_id: string;
  renderer_version: string;
  output_profile_id: string;
  segmentation_authority: HammerExportSegmentationAuthority | null;
}>;

export type HammerFinalVideoMasterAuthority = Readonly<{
  workspace_id: string;
  workpiece_id: string;
  recording_revision_id: string;
  composition_revision: number;
  composition_fingerprint: string;
  render_job_id: string;
  render_plan_fingerprint: string;
  background_effect_fingerprint: string | null;
  replacement_asset_id: string | null;
  audio_master_asset_id: string;
  canonical_asset_id: string;
  canonical_content_hash: string;
  mime_type: string;
  duration_ms: number;
  width: number;
  height: number;
  fps: number;
  readiness: "ready";
  acknowledged_result_fingerprint: string;
  segmentation_authority: HammerExportSegmentationAuthority | null;
}>;

export type HammerFinalVideoRenderErrorCode =
  | "background_effect_replacement_unresolved"
  | "background_effect_replacement_relationship_mismatch"
  | "background_effect_provider_model_mismatch"
  | "background_effect_mask_failure"
  | "final_video_composition_stale"
  | "final_video_render_failed"
  | "final_video_master_stale";

export function validateHammerFinalVideoMasterCurrent(args: {
  master: HammerFinalVideoMasterAuthority | null;
  workspaceId: string;
  workpieceId: string;
  recordingRevisionId: string;
  compositionRevision: number;
  compositionFingerprint: string;
  renderPlanFingerprint: string;
  backgroundEffectFingerprint: string | null;
  replacementAssetId: string | null;
  audioMasterAssetId: string;
}): Readonly<{ ready: true } | { ready: false; code: HammerFinalVideoRenderErrorCode }> {
  const master = args.master;
  if (!master) return { ready: false, code: "final_video_master_stale" };
  if (master.workspace_id !== args.workspaceId || master.workpiece_id !== args.workpieceId
    || master.recording_revision_id !== args.recordingRevisionId) return { ready: false, code: "final_video_composition_stale" };
  if (master.composition_revision !== args.compositionRevision || master.composition_fingerprint !== args.compositionFingerprint
    || master.render_plan_fingerprint !== args.renderPlanFingerprint
    || master.background_effect_fingerprint !== args.backgroundEffectFingerprint
    || master.replacement_asset_id !== args.replacementAssetId
    || master.audio_master_asset_id !== args.audioMasterAssetId) return { ready: false, code: "final_video_master_stale" };
  return { ready: true };
}
