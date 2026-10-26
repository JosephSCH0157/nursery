import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useMediaMapGenerationActions } from "../src/hooks/visuals/useMediaMapGenerationActions";
import { createHearthOperationAuthority } from "../src/lib/hearth-operation-authority";
import { deriveFullMediaBudgetPolicy } from "../src/lib/hearth-media-map-builder";
import type { HearthVisualPlanFailure } from "../src/lib/hearth-visual-plan-operation";
import {
  createEmptyEpisodePackageV2,
  type EpisodeMediaMap,
} from "../src/lib/episode-package-v2";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const WORKPIECE_ID = "22222222-2222-4222-8222-222222222222";

function createMap(): EpisodeMediaMap {
  return {
    id: "media-map-1",
    workpiece_id: WORKPIECE_ID,
    script_version_id: "4",
    status: "draft",
    version: 1,
    generated_at: "2026-07-25T12:00:00.000Z",
    entries: [{
      id: "image-entry-1",
      final_media_kind: "image",
      purpose: "coverage",
      anchor: { mode: "phrase_match", target: "opening scene" },
      timing: { in_offset_sec: 0, duration_sec: 6 },
      description: "Opening scene",
      intent: "Establish the episode",
      source: { status: "unresolved", asset_id: null },
      confidence: "high",
      fulfillment_status: "planned",
      fulfillment_path: null,
      optional: false,
      critical: true,
      stale: false,
      created_at: "2026-07-25T12:00:00.000Z",
      updated_at: "2026-07-25T12:00:00.000Z",
    }],
  };
}

test("Visual Plan apply verifies canonical image-map authority before reporting success", async () => {
  const episodePackage = createEmptyEpisodePackageV2();
  const map = createMap();
  const order: string[] = [];
  const saveStates: string[] = [];
  const saveErrors: Array<string | null> = [];
  const busyStates: boolean[] = [];
  const operationStages: string[] = [];
  const visualPlanFailures: Array<HearthVisualPlanFailure | null> = [];
  const selectedEntries: Array<string | null> = [];
  const generationScopes: string[] = [];
  const authority = createHearthOperationAuthority({
    workspaceId: WORKSPACE_ID,
    workpieceId: WORKPIECE_ID,
    draftId: WORKPIECE_ID,
    draftVersion: 1,
    revisionId: null,
  }, { createAuthorityId: () => "visual-plan-characterization" });
  let api: ReturnType<typeof useMediaMapGenerationActions> | null = null;

  function Harness() {
    api = useMediaMapGenerationActions({
      operationAuthority: authority,
      episodePackage,
      isMediaMapBusy: false,
      approvedScriptVersion: 4,
      mediaMapGenerationScope: "images_only",
      setMediaMapGenerationScope: () => undefined,
      setIsMediaMapBusy: (busy) => busyStates.push(busy),
      setVisualPlanOperationStage: (stage) => operationStages.push(stage),
      setVisualPlanFailure: (failure) => visualPlanFailures.push(failure),
      setMediaMapSaveState: (state) => saveStates.push(state),
      setMediaMapSaveError: (error) => saveErrors.push(error),
      setMediaMapMessage: () => undefined,
      setSelectedMediaMapEntryId: (id) => selectedEntries.push(id),
      prepareSourceEpisodePackageForMediaMapGeneration: async () => ({
        ok: true,
        episodePackage,
        bootstrappedImageCount: 0,
        bootstrappedBrollCount: 0,
        bootstrappedReferenceClipCount: 0,
        budgetPolicy: deriveFullMediaBudgetPolicy({ scriptText: "A short canonical script." }),
      }),
      buildMediaMapFromExistingPlans: () => map,
      persistMediaMap: async () => {
        order.push("persist");
        return { ok: true, episodePackage };
      },
      repairImageMapAuthority: async () => {
        order.push("verify");
        return { ok: true };
      },
      generateUnifiedVisualPlan: async (generationScope) => {
        generationScopes.push(generationScope);
        order.push("unified");
        return { ok: true, data: { imageMapRevision: 1, brollPlanRevision: 1, referenceClipPlanRevision: 1, referenceVisualPlanRevision: 1 } };
      },
      refreshCanonicalBroll: async () => { order.push("broll-readback"); return true; },
      notifyCanonicalReferenceClipsChanged: () => order.push("reference-readback"),
    });
    return null;
  }

  renderToStaticMarkup(createElement(Harness));
  assert.ok(api);
  const applied = await api.onBuildAndApplyMediaMapFromConversation({
    directionId: "comparison",
    constraintsText: "Keep it simple.",
    derivedFromScript: true,
  });

  assert.equal(applied, true);
  assert.deepEqual(order, ["unified", "verify", "broll-readback", "reference-readback"]);
  assert.deepEqual(saveStates, ["saving", "saved"]);
  assert.deepEqual(saveErrors, [null]);
  assert.deepEqual(busyStates, [true, false]);
  assert.deepEqual(operationStages, ["generating", "validating", "refreshing", "complete"]);
  assert.deepEqual(visualPlanFailures, [null]);
  assert.deepEqual(selectedEntries, []);
  assert.deepEqual(generationScopes, ["images_only"]);
});

test("Visual Plan apply remains failed when canonical image-map verification fails", async () => {
  const episodePackage = createEmptyEpisodePackageV2();
  const errors: Array<string | null> = [];
  const saveStates: string[] = [];
  const busyStates: boolean[] = [];
  const operationStages: string[] = [];
  const visualPlanFailures: Array<HearthVisualPlanFailure | null> = [];
  let generationAttempts = 0;
  const authority = createHearthOperationAuthority({
    workspaceId: WORKSPACE_ID,
    workpieceId: WORKPIECE_ID,
    draftId: WORKPIECE_ID,
    draftVersion: 1,
    revisionId: null,
  }, { createAuthorityId: () => "visual-plan-verification-failure" });
  let api: ReturnType<typeof useMediaMapGenerationActions> | null = null;

  function Harness() {
    api = useMediaMapGenerationActions({
      operationAuthority: authority,
      episodePackage,
      isMediaMapBusy: false,
      approvedScriptVersion: 4,
      mediaMapGenerationScope: "images_only",
      setMediaMapGenerationScope: () => undefined,
      setIsMediaMapBusy: (busy) => busyStates.push(busy),
      setVisualPlanOperationStage: (stage) => operationStages.push(stage),
      setVisualPlanFailure: (failure) => visualPlanFailures.push(failure),
      setMediaMapSaveState: (state) => saveStates.push(state),
      setMediaMapSaveError: (error) => errors.push(error),
      setMediaMapMessage: () => undefined,
      setSelectedMediaMapEntryId: () => assert.fail("Unverified entry must not become active."),
      prepareSourceEpisodePackageForMediaMapGeneration: async () => ({
        ok: true,
        episodePackage,
        bootstrappedImageCount: 0,
        bootstrappedBrollCount: 0,
        bootstrappedReferenceClipCount: 0,
        budgetPolicy: deriveFullMediaBudgetPolicy({ scriptText: "A short canonical script." }),
      }),
      buildMediaMapFromExistingPlans: () => createMap(),
      persistMediaMap: async () => ({ ok: true, episodePackage }),
      repairImageMapAuthority: async () => ({ ok: false, error: "Canonical verification failed." }),
      generateUnifiedVisualPlan: async () => {
        generationAttempts += 1;
        return { ok: true, data: { imageMapRevision: 1, brollPlanRevision: 1, referenceClipPlanRevision: 1, referenceVisualPlanRevision: 1 } };
      },
      refreshCanonicalBroll: async () => true,
      notifyCanonicalReferenceClipsChanged: () => undefined,
    });
    return null;
  }

  renderToStaticMarkup(createElement(Harness));
  assert.ok(api);
  const applied = await api.onBuildAndApplyMediaMapFromConversation({
    directionId: "comparison",
    constraintsText: "Keep it simple.",
    derivedFromScript: true,
  });

  assert.equal(applied, false);
  assert.deepEqual(saveStates, ["saving", "error"]);
  assert.deepEqual(errors, [null, "Canonical verification failed."]);
  assert.deepEqual(busyStates, [true, false]);
  assert.deepEqual(operationStages, ["generating", "validating", "failed"]);
  assert.equal(generationAttempts, 1);
  assert.deepEqual(visualPlanFailures, [
    null,
    {
      status: null,
      code: "visual_plan_canonical_repair_failed",
      stage: "canonical_persistence",
      message: "Canonical verification failed.",
    },
  ]);
});
