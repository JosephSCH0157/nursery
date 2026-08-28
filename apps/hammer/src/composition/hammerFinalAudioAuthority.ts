export type HammerFinalAudioMasterAuthority = Readonly<{
  workspace_id: string;
  workpiece_id: string;
  recording_revision_id: string;
  composition_revision: number;
  composition_fingerprint: string;
  render_job_id: string;
  render_plan_fingerprint: string;
  renderer_version: string;
  output_profile_id: string;
  acknowledged_result_fingerprint: string;
  canonical_asset_id: CanonicalAssetId;
  canonical_content_hash: string;
  storage_bucket: string;
  storage_key: string;
  mime_type: string;
  duration_ms: number;
  readiness: "ready";
}>;

export type HammerFinalAudioRenderIdentity = Readonly<{
  recording_revision_id: string;
  composition_revision: number;
  composition_fingerprint: string;
  render_job_id: string;
  render_plan_fingerprint: string;
  operation_fingerprint: string;
  renderer_version: string;
  output_profile_id: string;
}>;

export function isReadyHammerFinalAudioMaster(
  value: HammerFinalAudioMasterAuthority | null | undefined,
): value is HammerFinalAudioMasterAuthority {
  return Boolean(
    value
    && value.readiness === "ready"
    && value.canonical_asset_id.trim()
    && /^[0-9a-f]{64}$/.test(value.canonical_content_hash)
    && value.duration_ms > 0,
  );
}
import type { CanonicalAssetId } from "@forge/tongs/canonical-asset-authority";
