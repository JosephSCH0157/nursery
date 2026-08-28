import type { HammerPersistedVisualPlacements } from "../persistence/hammerPersistenceContract";
import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import { deriveLegacyVisualPlacementsFromTimeline } from "../visuals/persistence/hammerVisualTimelineLegacyAdapter";
import { resolveHammerCanonicalAssetAuthority } from "../lib/hammerCanonicalAssetAuthority";
import type { CanonicalAssetId } from "@forge/tongs/canonical-asset-authority";

export type HammerCanonicalVisualHydrationProjection = Readonly<{
  visualTimeline: HammerVisualTimelineState | null;
  visualPlacements: HammerPersistedVisualPlacements | null;
  placementAuthority: "canonical_timeline" | "compatibility_artifact" | "absent";
}>;

/**
 * A revision-scoped visual timeline is the durable editing authority. The
 * placements document is retained as a compatibility artifact, but must not
 * project a different editorial state into the shell or history verifier.
 */
export function projectHammerCanonicalVisualHydration(args: {
  canonicalTimeline: HammerVisualTimelineState | null;
  compatibilityPlacements: HammerPersistedVisualPlacements | null;
}): HammerCanonicalVisualHydrationProjection {
  if (args.canonicalTimeline) {
    return {
      visualTimeline: args.canonicalTimeline,
      visualPlacements: deriveLegacyVisualPlacementsFromTimeline(args.canonicalTimeline),
      placementAuthority: "canonical_timeline",
    };
  }
  if (args.compatibilityPlacements) {
    return {
      visualTimeline: null,
      visualPlacements: args.compatibilityPlacements,
      placementAuthority: "compatibility_artifact",
    };
  }
  return { visualTimeline: null, visualPlacements: null, placementAuthority: "absent" };
}

export async function resolveHammerCanonicalVisualHydration(args: {
  workspaceId: string;
  workpieceId: string;
  timeline: HammerVisualTimelineState;
  resolveAuthority?: typeof resolveHammerCanonicalAssetAuthority;
}): Promise<HammerVisualTimelineState> {
  const resolveAuthority = args.resolveAuthority ?? resolveHammerCanonicalAssetAuthority;
  const assets = await Promise.all(args.timeline.assets.map(async (asset) => {
    if (!asset.canonical_asset_id) return { ...asset, authority_state: "legacy_unresolved" as const };
    const authority = await resolveAuthority({
      workspaceId: args.workspaceId,
      workpieceId: args.workpieceId,
      canonicalAssetId: asset.canonical_asset_id as CanonicalAssetId,
      expectedContentHash: asset.authority_content_hash,
    }).catch(() => null);
    if (!authority || authority.state !== "ready") return { ...asset, authority_state: "legacy_unresolved" as const };
    return {
      ...asset,
      asset_id: authority.canonicalAssetId,
      canonical_asset_id: authority.canonicalAssetId,
      authority_state: "canonical_proven" as const,
      authority_workspace_id: authority.workspaceId ?? args.workspaceId,
      authority_workpiece_id: authority.scope?.kind === "workpiece" ? authority.scope.workpieceId : null,
      authority_content_hash: authority.contentHash ?? null,
      path: authority.path ?? asset.path,
      storage_key: authority.storageObjectKey ?? asset.storage_key,
      mime_type: authority.mimeType ?? asset.mime_type,
    };
  }));
  const assetsByCanonicalId = new Map(assets.flatMap((asset) => asset.canonical_asset_id ? [[asset.canonical_asset_id, asset] as const] : []));
  const clips = args.timeline.clips.map((clip) => {
    const canonicalAssetId = clip.canonical_asset_id ?? null;
    const asset = canonicalAssetId ? assetsByCanonicalId.get(canonicalAssetId) : null;
    return asset?.authority_state === "canonical_proven"
      ? { ...clip, asset_id: asset.asset_id, canonical_asset_id: asset.canonical_asset_id, canonical_asset_state: "canonical_proven" as const }
      : { ...clip, canonical_asset_state: "legacy_unresolved" as const };
  });
  return { ...args.timeline, assets, clips };
}
