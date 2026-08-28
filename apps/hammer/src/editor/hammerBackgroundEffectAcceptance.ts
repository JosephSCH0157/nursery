import type { HammerBackgroundEffectQualityMode, HammerBackgroundEffectFallbackMode, HammerBackgroundEffectSettingsV1 } from "../../../../packages/contracts/hammer/visual-effects-export.contract";
import type { CanonicalAssetId } from "../../../../packages/tongs/src/canonical-asset-authority";
import { requireReadyHammerCanonicalAssetAuthority } from "../lib/hammerCanonicalAssetAuthority";

export const HAMMER_EXPORT_SEGMENTATION_AUTHORITY_V1 = Object.freeze({
  provider_id: "mediapipe_tasks_image_segmenter", provider_version: "0.10.21", model_id: "mediapipe_selfie_segmentation_landscape",
  model_sha256: "490e9ea734313e0de10fa0cd9e3c6133e36ea4db2b7a49bde9ef019f72796b8e", model_license: "Apache-2.0",
  runtime_image: "forge-ffmpeg:background-effects-v1", runtime_version: "python-3.11.9", ffmpeg_version: "6.1", refinement_version: "forge-matte-v1",
  confidence_threshold: 0.35, failure_policy: "fail_closed",
  frame_policy: { fps: 30, timestamp_mode: "monotonic_milliseconds", reset_on_cut: true, reset_on_source_change: true, reset_on_dimension_change: true },
} as const satisfies import("../../../../packages/contracts/hammer/visual-effects-export.contract").HammerExportSegmentationAuthority);

type Commit = (input: Readonly<{ effectKind: "blur" | "wash" | "replacement_solid" | "replacement_image" | null; settings: HammerBackgroundEffectSettingsV1 | null; previewProviderId: string; exportAuthority: typeof HAMMER_EXPORT_SEGMENTATION_AUTHORITY_V1 }>) => unknown;

export async function acceptHammerBackgroundEffect(args: {
  workspaceId: string; workpieceId: string; commit: Commit; previewProviderId: string;
  blur: boolean; blurPx: number; wash: boolean; washDim: number; washDesaturate: number;
  replacement: boolean; replacementMode: "solid" | "image" | "checkerboard"; replacementColor: string;
  replacementAsset: { assetId: string | null; contentHash: string | null; path: string } | null;
  feather: number; expansion: number; smoothing: number; quality: HammerBackgroundEffectQualityMode; fallback: HammerBackgroundEffectFallbackMode;
}): Promise<void> {
  const common = { edge_feather_px: args.feather, subject_expansion_px: Math.max(0, args.expansion), temporal_smoothing: args.smoothing, quality_mode: args.quality, fallback_mode: args.fallback } as const;
  const base = { previewProviderId: args.previewProviderId, exportAuthority: HAMMER_EXPORT_SEGMENTATION_AUTHORITY_V1 };
  if (args.replacement && args.replacementMode === "checkerboard") throw new Error("Checkerboard is diagnostic-only and cannot be accepted for production.");
  if (args.replacement && args.replacementMode === "image") {
    if (!args.replacementAsset?.assetId) throw new Error("Select a canonical background asset before accepting replacement.");
    const authority = await requireReadyHammerCanonicalAssetAuthority({ workspaceId: args.workspaceId, workpieceId: args.workpieceId, canonicalAssetId: args.replacementAsset.assetId as CanonicalAssetId, expectedContentHash: args.replacementAsset.contentHash, expectedPath: args.replacementAsset.path });
    if (!authority.contentHash || !authority.workspaceId || authority.mimeType?.startsWith("image/") !== true || authority.scope?.kind !== "workpiece" || authority.scope.workpieceId !== args.workpieceId) throw new Error("The selected background is not a ready canonical image for this workpiece.");
    args.commit({ ...base, effectKind: "replacement_image", settings: { ...common, replacement_asset: { canonical_asset_id: authority.canonicalAssetId, canonical_content_hash: authority.contentHash, workspace_id: authority.workspaceId, workpiece_id: args.workpieceId, asset_kind: authority.assetKind ?? "image", readiness: "ready", asset_path: authority.path ?? null }, fit: "cover" } }); return;
  }
  if (args.replacement) { args.commit({ ...base, effectKind: "replacement_solid", settings: { ...common, replacement_color: args.replacementColor } }); return; }
  if (args.wash) { args.commit({ ...base, effectKind: "wash", settings: { ...common, dim_amount: args.washDim, desaturate_amount: args.washDesaturate } }); return; }
  if (args.blur) { args.commit({ ...base, effectKind: "blur", settings: { ...common, blur_px: args.blurPx } }); return; }
  args.commit({ ...base, effectKind: null, settings: null });
}
