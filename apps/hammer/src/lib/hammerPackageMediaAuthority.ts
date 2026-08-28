import type {
  CanonicalAssetAuthority,
  CanonicalAssetId,
  MediaContentHash,
  ScriptDerivativeBasis,
  ScriptDerivativeId,
} from "@forge/tongs/canonical-asset-authority";
import type { HammerVisualAsset, HammerVisualClip, HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import { resolveHammerCanonicalAssetAuthority } from "./hammerCanonicalAssetAuthority";
import type { HammerReleasePrepPackage } from "./hammerReleasePrepPackage";

export type HammerPackagingMediaBlockReason =
  | "canonical_asset_missing"
  | "canonical_asset_not_ready"
  | "canonical_asset_relationship_mismatch"
  | "canonical_asset_evidence_mismatch"
  | "legacy_asset_unresolved";

export type HammerPackageAssetReference = Readonly<{
  state: "validated";
  workspaceId: string;
  workpieceId: string;
  canonicalAssetId: CanonicalAssetId;
  canonicalContentHash: MediaContentHash;
  assetKind: string;
  placementId: string;
  sourceDerivativeId?: ScriptDerivativeId;
  scriptDerivativeBasis?: ScriptDerivativeBasis;
  assetPath?: string;
}>;

export type UnresolvedPackageAssetReference = Readonly<{
  state: "unresolved";
  workspaceId: string;
  workpieceId: string;
  placementId: string;
  expectedCanonicalAssetId: CanonicalAssetId | null;
  sourceDerivativeId?: ScriptDerivativeId;
  scriptDerivativeBasis?: ScriptDerivativeBasis;
  assetPath?: string;
  reason: HammerPackagingMediaBlockReason;
}>;

export type HammerPackageMediaReference = HammerPackageAssetReference | UnresolvedPackageAssetReference;
export type PackagingMediaReadiness = Readonly<{
  state: "ready" | "blocked_unresolved_asset" | "blocked_asset_not_ready" | "blocked_relationship_mismatch" | "blocked_evidence_mismatch";
  blockingPlacementIds: readonly string[];
}>;
export type HammerPackagingIntent = Readonly<{
  schemaVersion: 1;
  workspaceId: string;
  workpieceId: string;
  media: readonly HammerPackageMediaReference[];
  readiness: PackagingMediaReadiness;
}>;

function derivativeBasis(clip: HammerVisualClip, workspaceId: string, workpieceId: string): ScriptDerivativeBasis | undefined {
  const script = clip.semantic_anchor.script;
  if (!script.script_approval_id || script.script_approval_revision == null || !script.script_content_hash) return undefined;
  return { workspaceId, workpieceId, scriptApprovalId: script.script_approval_id,
    scriptApprovalRevision: script.script_approval_revision, scriptContentHash: script.script_content_hash as MediaContentHash };
}

function sourceDerivativeId(clip: HammerVisualClip): ScriptDerivativeId | undefined {
  return clip.semantic_anchor.hearth_entry_id ? clip.semantic_anchor.hearth_entry_id as ScriptDerivativeId : undefined;
}

function findAsset(timeline: HammerVisualTimelineState, clip: HammerVisualClip): HammerVisualAsset | null {
  const canonicalId = clip.canonical_asset_id ?? null;
  if (!canonicalId) return null;
  return timeline.assets.find((asset) => asset.canonical_asset_id === canonicalId) ?? null;
}

function readiness(media: readonly HammerPackageMediaReference[]): PackagingMediaReadiness {
  const unresolved = media.filter((reference): reference is UnresolvedPackageAssetReference => reference.state === "unresolved");
  if (!unresolved.length) return { state: "ready", blockingPlacementIds: [] };
  const reasons = new Set(unresolved.map((reference) => reference.reason));
  const state = reasons.has("canonical_asset_relationship_mismatch") ? "blocked_relationship_mismatch"
    : reasons.has("canonical_asset_evidence_mismatch") ? "blocked_evidence_mismatch"
      : reasons.has("canonical_asset_not_ready") ? "blocked_asset_not_ready" : "blocked_unresolved_asset";
  return { state, blockingPlacementIds: unresolved.map((reference) => reference.placementId) };
}

export function projectHammerPackagingIntent(args: {
  workspaceId: string;
  workpieceId: string;
  timeline: HammerVisualTimelineState | null;
}): HammerPackagingIntent {
  const clips = args.timeline?.clips.filter((clip) => clip.enabled && clip.placement_status === "placed") ?? [];
  const media = clips.map((clip): HammerPackageMediaReference => {
    const asset = args.timeline ? findAsset(args.timeline, clip) : null;
    const basis = derivativeBasis(clip, args.workspaceId, args.workpieceId);
    const derivativeId = sourceDerivativeId(clip);
    const expectedCanonicalAssetId = (clip.canonical_asset_id ?? asset?.canonical_asset_id ?? null) as CanonicalAssetId | null;
    const common = { workspaceId: args.workspaceId, workpieceId: args.workpieceId, placementId: clip.clip_id,
      ...(derivativeId ? { sourceDerivativeId: derivativeId } : {}), ...(basis ? { scriptDerivativeBasis: basis } : {}),
      ...(asset?.path ? { assetPath: asset.path } : {}) };
    if (clip.canonical_asset_state !== "canonical_proven" || asset?.authority_state !== "canonical_proven" || !expectedCanonicalAssetId) {
      return { ...common, state: "unresolved", expectedCanonicalAssetId, reason: "legacy_asset_unresolved" };
    }
    if (!asset.authority_content_hash) {
      return { ...common, state: "unresolved", expectedCanonicalAssetId, reason: "canonical_asset_evidence_mismatch" };
    }
    return { ...common, state: "validated", canonicalAssetId: expectedCanonicalAssetId,
      canonicalContentHash: asset.authority_content_hash as MediaContentHash, assetKind: asset.kind };
  });
  return { schemaVersion: 1, workspaceId: args.workspaceId, workpieceId: args.workpieceId, media, readiness: readiness(media) };
}

function failed(reference: HammerPackageAssetReference, authority: CanonicalAssetAuthority | null): UnresolvedPackageAssetReference {
  const reason: HammerPackagingMediaBlockReason = authority?.state === "relationship_mismatch" ? "canonical_asset_relationship_mismatch"
    : authority?.state === "processing" ? "canonical_asset_not_ready"
      : authority?.state === "invalid" ? "canonical_asset_evidence_mismatch" : "canonical_asset_missing";
  return { state: "unresolved", workspaceId: reference.workspaceId, workpieceId: reference.workpieceId,
    placementId: reference.placementId, expectedCanonicalAssetId: reference.canonicalAssetId, reason,
    ...(reference.sourceDerivativeId ? { sourceDerivativeId: reference.sourceDerivativeId } : {}),
    ...(reference.scriptDerivativeBasis ? { scriptDerivativeBasis: reference.scriptDerivativeBasis } : {}),
    ...(reference.assetPath ? { assetPath: reference.assetPath } : {}) };
}

export async function validateHammerPackagingIntent(
  intent: HammerPackagingIntent,
  resolveAuthority: typeof resolveHammerCanonicalAssetAuthority = resolveHammerCanonicalAssetAuthority,
): Promise<HammerPackagingIntent> {
  const media = await Promise.all(intent.media.map(async (reference): Promise<HammerPackageMediaReference> => {
    if (reference.state === "unresolved") return reference;
    const authority = await resolveAuthority({ workspaceId: reference.workspaceId, workpieceId: reference.workpieceId,
      canonicalAssetId: reference.canonicalAssetId, requiredAssetKind: reference.assetKind,
      expectedContentHash: reference.canonicalContentHash, expectedPath: reference.assetPath ?? null }).catch(() => null);
    if (!authority || authority.state !== "ready") return failed(reference, authority);
    return { ...reference, canonicalAssetId: authority.canonicalAssetId,
      canonicalContentHash: (authority.contentHash ?? reference.canonicalContentHash) as MediaContentHash,
      assetKind: authority.assetKind ?? reference.assetKind, ...(authority.path ? { assetPath: authority.path } : {}) };
  }));
  return { ...intent, media, readiness: readiness(media) };
}

export async function validateHammerReleasePrepPackageMedia(pkg: HammerReleasePrepPackage): Promise<HammerReleasePrepPackage> {
  const packagingMedia = await validateHammerPackagingIntent(pkg.packaging_media);
  if (packagingMedia.readiness.state === "ready") return { ...pkg, packaging_media: packagingMedia };
  return { ...pkg, packaging_media: packagingMedia, readiness: { ...pkg.readiness, visuals: "failed",
    blocking_statuses: Array.from(new Set([...pkg.readiness.blocking_statuses, "failed" as const])),
    status_flags: { ...pkg.readiness.status_flags, failed: true }, fully_prepared: false } };
}
