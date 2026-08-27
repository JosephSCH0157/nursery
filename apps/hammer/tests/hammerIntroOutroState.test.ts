import assert from "node:assert/strict";
import { deriveStableHammerAssetIdFromPath } from "../src/lib/hammerAssetIdentity";
import {
  buildIntroOutroCandidateItems,
  buildIntroOutroCandidateItemsById,
  buildIntroOutroPackagingSyncPlan,
  buildWorkspaceIntroOutroDefaultsRepairPlan,
  resolveIntroOutroSelection,
} from "../src/editor/hammerIntroOutroState";
import type {
  HammerIntroOutroSelection,
  HammerStoredMediaFile,
  HammerWorkspaceIntroOutroDefaults,
} from "../src/lib/hammerSourceDeskMediaApi";

function createCandidateMap(paths: string[]) {
  const files: HammerStoredMediaFile[] = paths.map((path, index) => ({
    assetId: deriveStableHammerAssetIdFromPath(path),
    path,
    name: `asset-${index + 1}`,
    kind: path.endsWith(".mp3") ? "audio" : "broll",
    bytes: null,
    updatedAt: null,
    contentHash: "a".repeat(64),
    mimeType: path.endsWith(".mp3") ? "audio/mpeg" : "video/mp4",
    durationMs: 5000,
    roles: [],
  }));
  return buildIntroOutroCandidateItemsById(buildIntroOutroCandidateItems(files));
}

async function testResolveIntroOutroSelectionUsesStoredMediaPaths() {
  const introPath = "assets/uploads/introoutro/123-intro.mp3";
  const outroPath = "assets/uploads/introoutro/456-outro.mp4";
  const candidateMap = createCandidateMap([introPath, outroPath]);
  const selection: HammerIntroOutroSelection = {
    schema_version: 1,
    intro_asset_id: deriveStableHammerAssetIdFromPath(introPath),
    outro_asset_id: deriveStableHammerAssetIdFromPath(outroPath),
    updated_at: "2026-04-18T10:00:00.000Z",
  };

  const resolved = resolveIntroOutroSelection(selection, candidateMap);
  assert.equal(resolved.introPath, introPath);
  assert.equal(resolved.outroPath, outroPath);
  assert.equal(resolved.introResolved, true);
  assert.equal(resolved.outroResolved, true);
}

async function testWorkspaceDefaultsRepairPlanBootstrapsWhenSelectionMissing() {
  const defaults: HammerWorkspaceIntroOutroDefaults = {
    schema_version: 1,
    intro: { asset_id: null, workpiece_id: "template-1", path: "assets/uploads/introoutro/default-intro.mp3" },
    outro: { asset_id: null, workpiece_id: "template-1", path: "assets/uploads/introoutro/default-outro.mp3" },
    updated_at: "2026-04-18T10:00:00.000Z",
  };

  const plan = buildWorkspaceIntroOutroDefaultsRepairPlan({
    selection: null,
    candidateItemsById: new Map(),
    defaults,
  });

  assert.deepEqual(plan, {
    shouldApply: true,
    copyIntro: true,
    copyOutro: true,
  });
}

async function testWorkspaceDefaultsRepairPlanRepairsOnlyUnresolvedSides() {
  const resolvedOutroPath = "assets/uploads/introoutro/episode-outro.mp3";
  const missingIntroPath = "assets/uploads/introoutro/missing-intro.mp3";
  const candidateMap = createCandidateMap([resolvedOutroPath]);
  const selection: HammerIntroOutroSelection = {
    schema_version: 1,
    intro_asset_id: deriveStableHammerAssetIdFromPath(missingIntroPath),
    outro_asset_id: deriveStableHammerAssetIdFromPath(resolvedOutroPath),
    updated_at: "2026-04-18T10:00:00.000Z",
  };
  const defaults: HammerWorkspaceIntroOutroDefaults = {
    schema_version: 1,
    intro: { asset_id: null, workpiece_id: "template-1", path: "assets/uploads/introoutro/default-intro.mp3" },
    outro: { asset_id: null, workpiece_id: "template-1", path: "assets/uploads/introoutro/default-outro.mp3" },
    updated_at: "2026-04-18T10:00:00.000Z",
  };

  const plan = buildWorkspaceIntroOutroDefaultsRepairPlan({
    selection,
    candidateItemsById: candidateMap,
    defaults,
  });

  assert.deepEqual(plan, {
    shouldApply: true,
    copyIntro: true,
    copyOutro: false,
  });
}

async function testPackagingSyncPlanAppliesResolvedSelectionOnReload() {
  const introPath = "assets/uploads/introoutro/123-intro.mp3";
  const outroPath = "assets/uploads/introoutro/456-outro.mp3";
  const candidateMap = createCandidateMap([introPath, outroPath]);
  const selection: HammerIntroOutroSelection = {
    schema_version: 1,
    intro_asset_id: deriveStableHammerAssetIdFromPath(introPath),
    outro_asset_id: deriveStableHammerAssetIdFromPath(outroPath),
    updated_at: "2026-04-18T10:00:00.000Z",
  };

  const plan = buildIntroOutroPackagingSyncPlan({
    selection,
    candidateItemsById: candidateMap,
    currentIntroPlacementAssetId: null,
    currentIntroPlacementPath: null,
    currentOutroPlacementAssetId: null,
    currentOutroPlacementPath: null,
  });

  assert.deepEqual(plan, {
    applyIntro: {
      assetId: deriveStableHammerAssetIdFromPath(introPath),
      path: introPath,
    },
    removeIntro: false,
    applyOutro: {
      assetId: deriveStableHammerAssetIdFromPath(outroPath),
      path: outroPath,
    },
    removeOutro: false,
  });
}

async function testPackagingSyncPlanRemovesPlacementWhenSelectionCleared() {
  const plan = buildIntroOutroPackagingSyncPlan({
    selection: {
      schema_version: 1,
      intro_asset_id: null,
      outro_asset_id: null,
      updated_at: "2026-04-18T10:00:00.000Z",
    },
    candidateItemsById: new Map(),
    currentIntroPlacementAssetId: "asset:intro",
    currentIntroPlacementPath: "assets/uploads/introoutro/123-intro.mp3",
    currentOutroPlacementAssetId: "asset:outro",
    currentOutroPlacementPath: "assets/uploads/introoutro/456-outro.mp3",
  });

  assert.deepEqual(plan, {
    applyIntro: null,
    removeIntro: true,
    applyOutro: null,
    removeOutro: true,
  });
}

async function run() {
  await testResolveIntroOutroSelectionUsesStoredMediaPaths();
  await testWorkspaceDefaultsRepairPlanBootstrapsWhenSelectionMissing();
  await testWorkspaceDefaultsRepairPlanRepairsOnlyUnresolvedSides();
  await testPackagingSyncPlanAppliesResolvedSelectionOnReload();
  await testPackagingSyncPlanRemovesPlacementWhenSelectionCleared();
  // eslint-disable-next-line no-console
  console.log("Hammer intro/outro state tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer intro/outro state tests failed:", error);
  process.exit(1);
});
