import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalAssetAuthority, CanonicalAssetId, MediaContentHash, StorageObjectKey } from "@forge/tongs/canonical-asset-authority";
import { projectHammerPackagingIntent, validateHammerPackagingIntent } from "../src/lib/hammerPackageMediaAuthority";
import { createEmptyVisualTimelineState } from "../src/visuals/model/hammerVisualDefaults";
import { deriveLegacyVisualPlacementsFromTimeline } from "../src/visuals/persistence/hammerVisualTimelineLegacyAdapter";
import { he9CommittedTimeline } from "./fixtures/he9SequenceOneFullShellFixture";
import { buildHammerReleasePrepPackage } from "../src/lib/hammerReleasePrepPackage";
import { buildHammerQuenchReleasePacket } from "../src/lib/hammerQuenchReleasePacket";
import { buildHammerReadinessVerdict } from "../src/editor/hammerReadinessTypes";
import { buildHammerPreparedReleasePackage } from "../src/lib/hammerPreparedReleasePackage";
import { saveHammerPreparedReleasePackage } from "../src/lib/hammerPreparedReleasePackageApi";
import { saveHammerQuenchReleasePacket } from "../src/lib/hammerQuenchReleasePacketApi";

const assetA = "asset-A" as CanonicalAssetId;
const hashA = "AAA" as MediaContentHash;

function timeline() {
  const asset = { ...he9CommittedTimeline.assets[0]!, asset_id: assetA, canonical_asset_id: assetA,
    authority_state: "canonical_proven" as const, authority_workspace_id: "workspace-A",
    authority_workpiece_id: "episode-A", authority_content_hash: hashA, path: "/visuals/foo.png", kind: "image" as const };
  const clip = { ...he9CommittedTimeline.clips[0]!, clip_id: "placement-P", asset_id: assetA,
    canonical_asset_id: assetA, canonical_asset_state: "canonical_proven" as const, enabled: true, placement_status: "placed" as const };
  return createEmptyVisualTimelineState({ assets: [asset], clips: [clip] });
}

const readyA = (): CanonicalAssetAuthority => ({ state: "ready", code: null, canonicalAssetId: assetA,
  workspaceId: "workspace-A", scope: { kind: "workpiece", workpieceId: "episode-A", workspaceReusePolicy: "not_applicable" },
  assetKind: "image", contentHash: hashA, storageObjectKey: "objects/A" as StorageObjectKey, path: "/visuals/foo.png" });

test("same-path replacement cannot retarget package source identity", async () => {
  const projected = projectHammerPackagingIntent({ workspaceId: "workspace-A", workpieceId: "episode-A", timeline: timeline() });
  const requested: string[] = [];
  const validated = await validateHammerPackagingIntent(projected, async (request) => {
    requested.push(request.canonicalAssetId);
    return readyA();
  });
  assert.deepEqual(requested, [assetA]);
  assert.equal(validated.media[0]?.state, "validated");
  assert.equal(validated.media[0]?.state === "validated" ? validated.media[0].canonicalAssetId : null, assetA);
  assert.notEqual(validated.media[0]?.state === "validated" ? validated.media[0].canonicalAssetId : null, "asset-B");
});

test("relationship mismatch remains explicit and blocks packaging", async () => {
  const projected = projectHammerPackagingIntent({ workspaceId: "workspace-A", workpieceId: "episode-A", timeline: timeline() });
  const validated = await validateHammerPackagingIntent(projected, async (): Promise<CanonicalAssetAuthority> => ({
    state: "relationship_mismatch", code: "canonical_asset_workpiece_mismatch", canonicalAssetId: assetA,
  }));
  assert.equal(validated.media[0]?.state, "unresolved");
  assert.equal(validated.media[0]?.state === "unresolved" ? validated.media[0].reason : null, "canonical_asset_relationship_mismatch");
  assert.equal(validated.readiness.state, "blocked_relationship_mismatch");
});

test("release packet retains canonical identity and treats path as optional evidence", () => {
  const canonicalTimeline = timeline();
  const packagingMedia = projectHammerPackagingIntent({ workspaceId: "workspace-A", workpieceId: "episode-A", timeline: canonicalTimeline });
  const visualPlacements = deriveLegacyVisualPlacementsFromTimeline(canonicalTimeline);
  const release = buildHammerReleasePrepPackage({ workspaceId: "workspace-A", workpieceId: "episode-A", visualPlacements, packagingMedia });
  const packet = buildHammerQuenchReleasePacket({ releasePrepPackage: release,
    readinessGate: buildHammerReadinessVerdict({ blockingReasons: [], reviewReasons: [] }), preparedAt: "2026-08-27T00:00:00.000Z" });
  assert.equal(packet.visuals[0]?.media_reference.state, "validated");
  assert.equal(packet.visuals[0]?.media_reference.state === "validated" ? packet.visuals[0].media_reference.canonicalAssetId : null, assetA);
  assert.equal(packet.visuals[0]?.asset_path, "/visuals/foo.png");
  assert.equal(packet.manifest.packaging_media_readiness.state, "ready");
});

test("missing canonical evidence cannot be packaged as path-only media", () => {
  const broken = timeline();
  broken.assets[0] = { ...broken.assets[0]!, authority_content_hash: null };
  const intent = projectHammerPackagingIntent({ workspaceId: "workspace-A", workpieceId: "episode-A", timeline: broken });
  assert.equal(intent.media[0]?.state, "unresolved");
  assert.equal(intent.readiness.state, "blocked_evidence_mismatch");
});

test("moving and duplicating placements changes instructions without changing source identity", () => {
  const base = timeline();
  const duplicate = { ...base.clips[0]!, clip_id: "placement-P2", start_sec: 22, end_sec: 25 };
  const moved = { ...base.clips[0]!, start_sec: 14.2, end_sec: 19.5 };
  const projected = projectHammerPackagingIntent({ workspaceId: "workspace-A", workpieceId: "episode-A",
    timeline: createEmptyVisualTimelineState({ assets: base.assets, clips: [moved, duplicate] }) });
  assert.deepEqual(projected.media.map((reference) => reference.state === "validated" ? reference.canonicalAssetId : null), [assetA, assetA]);
  assert.deepEqual(projected.media.map((reference) => reference.placementId), ["placement-P", "placement-P2"]);
});

test("processing and contradictory canonical evidence block without fallback", async () => {
  const projected = projectHammerPackagingIntent({ workspaceId: "workspace-A", workpieceId: "episode-A", timeline: timeline() });
  const processing = await validateHammerPackagingIntent(projected, async (): Promise<CanonicalAssetAuthority> => ({
    state: "processing", code: null, canonicalAssetId: assetA,
  }));
  assert.equal(processing.readiness.state, "blocked_asset_not_ready");
  const invalid = await validateHammerPackagingIntent(projected, async (): Promise<CanonicalAssetAuthority> => ({
    state: "invalid", code: "canonical_asset_hash_mismatch", canonicalAssetId: assetA,
  }));
  assert.equal(invalid.readiness.state, "blocked_evidence_mismatch");
});

test("declared workspace-global reuse remains the same validated identity", async () => {
  const projected = projectHammerPackagingIntent({ workspaceId: "workspace-A", workpieceId: "episode-A", timeline: timeline() });
  const validated = await validateHammerPackagingIntent(projected, async (): Promise<CanonicalAssetAuthority> => ({
    ...readyA(), scope: { kind: "workspace", workpieceId: null, workspaceReusePolicy: "allowed" },
  }));
  assert.equal(validated.readiness.state, "ready");
  assert.equal(validated.media[0]?.state === "validated" ? validated.media[0].canonicalAssetId : null, assetA);
});

test("artifact persistence rejects unresolved package media before any write", async () => {
  const broken = timeline();
  broken.assets[0] = { ...broken.assets[0]!, authority_content_hash: null };
  const packagingMedia = projectHammerPackagingIntent({ workspaceId: "workspace-A", workpieceId: "episode-A", timeline: broken });
  const visualPlacements = deriveLegacyVisualPlacementsFromTimeline(broken);
  const release = buildHammerReleasePrepPackage({ workspaceId: "workspace-A", workpieceId: "episode-A", visualPlacements, packagingMedia });
  const prepared = buildHammerPreparedReleasePackage({ current: release, preparedAt: "2026-08-27T00:00:00.000Z" });
  const preparedSave = await saveHammerPreparedReleasePackage({ workpieceId: "episode-A", pkg: prepared });
  assert.deepEqual({ ok: preparedSave.ok, status: preparedSave.status }, { ok: false, status: 422 });
  const packet = buildHammerQuenchReleasePacket({ releasePrepPackage: release,
    readinessGate: buildHammerReadinessVerdict({ blockingReasons: [], reviewReasons: [] }) });
  const packetSave = await saveHammerQuenchReleasePacket({ workpieceId: "episode-A", packet });
  assert.deepEqual({ ok: packetSave.ok, status: packetSave.status }, { ok: false, status: 422 });
});
