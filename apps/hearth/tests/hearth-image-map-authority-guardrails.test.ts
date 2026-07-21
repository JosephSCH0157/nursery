import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { buildEpisodeImagesWorkspaceViewModel } from "../src/lib/hearth-episode-images-view-model";
import { deriveHearthMediaWorkflow } from "../src/lib/hearth-media-workflow-view-model";
import { readWorkpieceProductionArtifact } from "../src/lib/hearth-production-repo";

function installBrowserAuthContext() {
  const storage = new Map<string, string>();
  storage.set("forge_tongs_api_token_v1", "DEV_TOKEN");
  const localStorageLike = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    },
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    get length() {
      return storage.size;
    },
  };
  Object.defineProperty(globalThis, "window", {
    value: {
      localStorage: localStorageLike,
      location: { search: "" },
    },
    configurable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageLike,
    configurable: true,
  });
}

test("zero entries never mark Episode Images complete", () => {
  const model = buildEpisodeImagesWorkspaceViewModel({
    entries: [],
    activeEntryId: null,
  });

  assert.equal(model.progress.total, 0);
  assert.equal(model.progress.ready, 0);
  assert.equal(model.stageComplete, false);
  assert.equal(model.progress.label, "0 of 0 ready");
});

test("visual-plan image count mismatch reports synchronization unavailable and blocks B-roll", () => {
  const workflow = deriveHearthMediaWorkflow({
    hasApprovedScript: true,
    visualPlan: {
      status: "activated",
      total: 12,
      images: 10,
      broll: 2,
      version: 7,
    },
    thumbnails: {
      eligible: 3,
      total: 3,
      previewAssetPaths: [],
    },
    images: {
      planned: 10,
      completed: 0,
      canonicalCount: 0,
      projectionLoaded: true,
    },
    broll: {
      planned: 2,
      completed: 0,
    },
    upstreamChanged: false,
  });

  const imageStage = workflow.stages.find((stage) => stage.id === "images");
  const brollStage = workflow.stages.find((stage) => stage.id === "broll");
  assert.equal(imageStage?.status, "needs_attention");
  assert.match(imageStage?.summary ?? "", /Synchronization unavailable/i);
  assert.equal(brollStage?.status, "blocked");
});

test("projection load failure never appears as image completion", () => {
  const workflow = deriveHearthMediaWorkflow({
    hasApprovedScript: true,
    visualPlan: {
      status: "activated",
      total: 8,
      images: 6,
      broll: 2,
      version: 3,
    },
    thumbnails: {
      eligible: 3,
      total: 3,
      previewAssetPaths: [],
    },
    images: {
      planned: 6,
      completed: 6,
      canonicalCount: 6,
      projectionLoaded: false,
    },
    broll: {
      planned: 2,
      completed: 2,
    },
    upstreamChanged: false,
  });

  const imageStage = workflow.stages.find((stage) => stage.id === "images");
  const brollStage = workflow.stages.find((stage) => stage.id === "broll");
  assert.equal(imageStage?.status, "needs_attention");
  assert.equal(brollStage?.status, "blocked");
});

test("authority-unavailable ImageMap panel copy and Retry action are present", () => {
  const source = readFileSync(resolve(process.cwd(), "src/components/visuals/ImageMapPanel.tsx"), "utf8");
  assert.match(source, /Episode Images is temporarily unavailable\./);
  assert.match(source, /does not support the current image-plan authority/);
  assert.match(source, />Retry<\/button>/);
  assert.match(source, /imageAuthorityUnavailable \? \(/);
});

test("image-map candidate generation conflict path does not auto-retry writes", () => {
  const source = readFileSync(resolve(process.cwd(), "src/hooks/visuals/useImageMapCandidateActions.ts"), "utf8");
  assert.doesNotMatch(source, /let\s+generated\s*=\s*await\s+requestCandidateGeneration\(/);
  assert.doesNotMatch(source, /requestCandidateGeneration\(latest\.metadataUpdatedAt\)/);
  assert.match(source, /generated\.reason === "conflict"/);
  assert.match(source, /Image map changed since last load\. Reloaded the latest canonical state\./);
});

test("optional missing production pack remains nonfatal", async () => {
  installBrowserAuthContext();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({ ok: true, exists: false }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  )) as typeof fetch;

  try {
    const result = await readWorkpieceProductionArtifact({
      workpieceId: "11111111-1111-4111-8111-111111111111",
      scriptVersion: 2,
      kind: "pack",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "not_found");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("production pack real failures remain surfaced", async () => {
  installBrowserAuthContext();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({ ok: false, error: { code: "unauthorized" } }), {
      status: 401,
      headers: { "content-type": "application/json" },
    })
  )) as typeof fetch;

  try {
    const result = await readWorkpieceProductionArtifact({
      workpieceId: "11111111-1111-4111-8111-111111111111",
      scriptVersion: 2,
      kind: "pack",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "request_failed");
      assert.equal(result.status, 401);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
