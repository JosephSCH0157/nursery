import assert from "node:assert/strict";
import test from "node:test";
import { buildHearthProductionViewModel } from "../src/routes/hearth-shell/buildHearthProductionViewModel";
import type { HearthProductionController } from "../src/routes/hearth-shell/hearth-production-contracts";

function controller(): HearthProductionController {
  const status = { authority: "unavailable", load: "error" };
  return {
    state: {} as never,
    commands: {} as never,
    status: {
      package: "error",
      thumbnails: status,
      imagePlanning: status,
      broll: status,
      referenceClips: status,
      metadata: status,
      releasePreparation: { load: "failed", stale: "unknown", readiness: "blocked" },
    } as never,
    surfaces: {
      thumbnails: { id: "thumbnail" },
      visualPlan: { id: "visual-plan" },
      episodeImages: { id: "episode-images" },
      broll: { id: "broll" },
      referenceClips: { id: "reference-clips" },
      metadata: { id: "metadata" },
      release: { id: "release" },
    } as never,
    workflow: {
      releaseSummary: "2/4 ready · Pending",
      blockedReasons: ["Canonical Metadata unavailable."],
      handoffReady: false,
    },
  };
}

function view(activeTab: string) {
  const source = controller();
  return {
    source,
    result: buildHearthProductionViewModel({
      controller: source,
      activeTab,
      metadataPanelMeta: "0 titles · 0 tags",
      summary: {
        visuals: { visualCount: 0, briefCount: 0, mediaMapStatus: "draft", coverageLevel: "low" },
        metadata: { titleCount: 0, tagCount: 0, complete: false, framingPackReady: false },
      },
      metadata: {} as never,
      visuals: {} as never,
    }),
  };
}

test("explicit status and blocked authority pass through without flattening", () => {
  const { source, result } = view("visuals");
  assert.equal(result.status, source.status);
  assert.equal(result.workflow, source.workflow);
  assert.deepEqual(result.workflow.blockedReasons, ["Canonical Metadata unavailable."]);
  assert.equal(result.tabSummaries.metadata, "0 titles · 0 tags · Needs work");
});

test("active tabs preserve the existing production surface selection", () => {
  assert.equal(view("visuals").result.activeSurface, "visuals");
  assert.equal(view("metadata").result.activeSurface, "metadata");
  assert.equal(view("release").result.activeSurface, "release");
  assert.equal(view("script").result.activeSurface, null);
  assert.equal(view("metadata").result.metadata.visible, true);
  assert.equal(view("visuals").result.visuals.visible, true);
});

test("every established surface contract passes through by identity", () => {
  const { source, result } = view("visuals");
  assert.equal(result.visuals.thumbnailPanelProps, source.surfaces.thumbnails);
  assert.equal(result.visuals.mediaMapPanelProps, source.surfaces.visualPlan);
  assert.equal(result.visuals.imageMapPanelProps, source.surfaces.episodeImages);
  assert.equal(result.visuals.brollPlanPanelProps, source.surfaces.broll);
  assert.equal(result.visuals.referenceClipPlanPanelProps, source.surfaces.referenceClips);
  assert.equal(result.metadata.metadataPanelProps, source.surfaces.metadata);
});

test("release remains Phase 5E-owned, four-item, and non-executing", () => {
  const { source, result } = view("release");
  assert.equal(result.release, source.surfaces.release);
  assert.equal(result.tabSummaries.release, source.workflow.releaseSummary);
  assert.equal(result.workflow.handoffReady, false);
  assert.equal("quench" in result, false);
  assert.equal("publish" in result, false);
  assert.equal("brollRequired" in result.workflow, false);
  assert.equal("referenceClipsRequired" in result.workflow, false);
});
