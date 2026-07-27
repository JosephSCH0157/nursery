import assert from "node:assert/strict";
import test from "node:test";
import { buildHearthProductionController } from "../src/routes/hearth-shell/buildHearthProductionController";
import type { HearthProductionControllerInput } from "../src/routes/hearth-shell/hearth-production-contracts";

function input(): HearthProductionControllerInput {
  const domain = (surface: string) => ({
    state: { surface },
    commands: { retry: () => surface },
    status: { authority: "unavailable" },
    surface: { surface },
  });
  return {
    package: { schema: "forge.episode.package.v2" } as never,
    packageStatus: "error",
    refreshPackage: () => {},
    thumbnails: domain("thumbnail") as never,
    imagePlanning: {
      ...domain("images"),
      surfaces: { visualPlan: { surface: "visual-plan" }, episodeImages: { surface: "episode-images" } },
      brollEligibilityInput: Object.freeze({ eligible: false, reason: "authority_unavailable" }),
    } as never,
    broll: domain("broll") as never,
    referenceClips: domain("references") as never,
    metadata: domain("metadata") as never,
    releasePreparation: {
      ...domain("release"),
      handoff: Object.freeze({
        workspaceId: "workspace",
        workpieceId: "workpiece",
        ready: false,
        blockingReasons: Object.freeze(["Metadata unavailable."]),
      }),
      summary: "3/4 ready · Pending",
    } as never,
  };
}

test("assembly preserves package and every domain object by identity", () => {
  const source = input();
  const assembled = buildHearthProductionController(source);
  assert.equal(assembled.state.package, source.package);
  assert.equal(assembled.state.thumbnails, source.thumbnails.state);
  assert.equal(assembled.state.imagePlanning, source.imagePlanning.state);
  assert.equal(assembled.state.broll, source.broll.state);
  assert.equal(assembled.state.referenceClips, source.referenceClips.state);
  assert.equal(assembled.state.metadata, source.metadata.state);
  assert.equal(assembled.state.releasePreparation, source.releasePreparation.state);
});

test("commands and explicit unavailable statuses pass through unchanged", () => {
  const source = input();
  const assembled = buildHearthProductionController(source);
  assert.equal(assembled.commands.broll, source.broll.commands);
  assert.equal(assembled.commands.referenceClips, source.referenceClips.commands);
  assert.equal(assembled.status.package, "error");
  assert.equal(assembled.status.metadata, source.metadata.status);
});

test("all production surfaces remain independently addressable", () => {
  const source = input();
  const surfaces = buildHearthProductionController(source).surfaces;
  assert.equal(surfaces.thumbnails, source.thumbnails.surface);
  assert.equal(surfaces.visualPlan, source.imagePlanning.surfaces.visualPlan);
  assert.equal(surfaces.episodeImages, source.imagePlanning.surfaces.episodeImages);
  assert.equal(surfaces.broll, source.broll.surface);
  assert.equal(surfaces.referenceClips, source.referenceClips.surface);
  assert.equal(surfaces.metadata, source.metadata.surface);
  assert.equal(surfaces.release, source.releasePreparation.surface);
});

test("release readiness remains owned by Phase 5E without new requirements", () => {
  const source = input();
  const workflow = buildHearthProductionController(source).workflow;
  assert.equal(workflow.handoffReady, false);
  assert.deepEqual(workflow.blockedReasons, ["Metadata unavailable."]);
  assert.equal("brollRequired" in workflow, false);
  assert.equal("referenceClipsRequired" in workflow, false);
});
