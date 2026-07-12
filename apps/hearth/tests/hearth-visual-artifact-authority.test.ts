import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildDefaultMetadataDocument,
  createEmptyEpisodePackageV2,
  hydrateEpisodePackageV2,
  mirrorEpisodePackageV2ToLegacy,
  type EpisodeImageMapEntry,
  type EpisodeMediaMap,
} from "../src/lib/episode-package-v2";
import { saveEpisodePackageForWorkpiece } from "../src/lib/hearth-thumbnail-api";
import { saveWorkpieceEpisodeMediaMap } from "../src/lib/hearth-media-map-repo";
import {
  resolveCanonicalVisualArtifacts,
  retainCanonicalVisualArtifacts,
  retainPersistedArtifactsForMetadataCommit,
} from "../src/lib/hearth-visual-artifact-authority";

const WORKPIECE_ID = "9287963f-e82a-4d9a-b810-db100e9d0021";
const WORKSPACE_ID = "f7f581e2-94d0-4c7d-bd0c-b650f6f9d8b1";

function createImageEntry(id: string): EpisodeImageMapEntry {
  return {
    id,
    anchor: `${id} anchor`,
    script_anchor: null,
    beat_anchor: null,
    anchor_scope: "attached",
    purpose: "coverage",
    description: `${id} description`,
    visual_intent: `${id} description`,
    prompt_basis: `${id} description`,
    style_preset: null,
    intent: "cutaway",
    source_type: "stock",
    origin: "hearth",
    visual_priority: "supporting",
    visual_type: "still_image",
    section_intent_note: null,
    beat_order: 1,
    paragraph_beat_order: 1,
    candidate_assets: [],
    selected_asset_id: null,
    status: "mapped",
    placement_hint: null,
  };
}

function createMediaMap(id: string): EpisodeMediaMap {
  const empty = createEmptyEpisodePackageV2().media_map;
  return {
    ...empty,
    id,
    workpiece_id: WORKPIECE_ID,
    version: empty.version + 1,
  };
}

function createWindowStub() {
  return {
    location: { search: "" },
    localStorage: {
      getItem: () => null,
      key: () => null,
      length: 0,
    },
    __forgeTongsApiToken: "test-token",
  } as unknown as Window & typeof globalThis;
}

test("visual artifact authority: canonical standalone artifacts defeat usable metadata copies", () => {
  const metadataPackage = {
    ...createEmptyEpisodePackageV2(),
    image_map: { entries: [createImageEntry("metadata-image")] },
    media_map: createMediaMap("metadata-media"),
  };
  const canonicalImage = createImageEntry("canonical-image");
  const canonicalMedia = createMediaMap("canonical-media");

  const resolved = resolveCanonicalVisualArtifacts({
    metadataPackage,
    imageMap: { kind: "available", value: { entries: [canonicalImage], spokenBeats: [] } },
    mediaMap: { kind: "available", value: canonicalMedia },
  });

  assert.equal(resolved.image_map.entries[0]?.id, "canonical-image");
  assert.equal(resolved.media_map.id, "canonical-media");
  assert.equal(resolved.thumbnail, metadataPackage.thumbnail);
});

test("visual artifact authority: absent standalone media retains the legacy metadata fallback", () => {
  const metadataPackage = {
    ...createEmptyEpisodePackageV2(),
    media_map: createMediaMap("legacy-media"),
  };

  const resolved = resolveCanonicalVisualArtifacts({
    metadataPackage,
    imageMap: { kind: "missing" },
    mediaMap: { kind: "missing" },
  });

  assert.equal(resolved.media_map.id, "legacy-media");
});

test("visual artifact authority: unavailable canonical reads never masquerade as legacy success", () => {
  const metadataPackage = {
    ...createEmptyEpisodePackageV2(),
    image_map: { entries: [createImageEntry("legacy-image")] },
    media_map: createMediaMap("legacy-media"),
  };

  const resolved = resolveCanonicalVisualArtifacts({
    metadataPackage,
    imageMap: { kind: "unavailable" },
    mediaMap: { kind: "unavailable" },
  });

  assert.deepEqual(resolved.image_map.entries, []);
  assert.deepEqual(resolved.media_map.entries, []);
  assert.notEqual(resolved.media_map.id, "legacy-media");
});

test("visual artifact authority: metadata acknowledgements cannot replace canonical working artifacts", () => {
  const canonicalPackage = {
    ...createEmptyEpisodePackageV2(),
    image_map: { entries: [createImageEntry("canonical-image")] },
    media_map: createMediaMap("canonical-media"),
  };
  const metadataAcknowledgement = {
    ...createEmptyEpisodePackageV2(),
    image_map: { entries: [createImageEntry("stale-image")] },
    media_map: createMediaMap("stale-media"),
    seo: {
      ...createEmptyEpisodePackageV2().seo,
      tags: ["new-metadata"],
    },
  };

  const resolved = retainCanonicalVisualArtifacts(metadataAcknowledgement, canonicalPackage);

  assert.deepEqual(resolved.seo.tags, ["new-metadata"]);
  assert.equal(resolved.image_map.entries[0]?.id, "canonical-image");
  assert.equal(resolved.media_map.id, "canonical-media");
});

test("visual artifact authority: metadata commits preserve persisted artifact fields", () => {
  const persisted = {
    ...createEmptyEpisodePackageV2(),
    image_map: { entries: [createImageEntry("persisted-image")] },
    media_map: createMediaMap("persisted-media"),
  };
  const requested = {
    ...createEmptyEpisodePackageV2(),
    image_map: { entries: [createImageEntry("stale-request-image")] },
    media_map: createMediaMap("stale-request-media"),
    seo: {
      ...createEmptyEpisodePackageV2().seo,
      tags: ["requested-metadata"],
    },
  };

  const committed = retainPersistedArtifactsForMetadataCommit(requested, persisted);

  assert.deepEqual(committed.seo.tags, ["requested-metadata"]);
  assert.equal(committed.image_map.entries[0]?.id, "persisted-image");
  assert.equal(committed.media_map.id, "persisted-media");
});

test("visual artifact authority: the real metadata writer cannot overwrite persisted maps", async () => {
  const persistedPackage = {
    ...createEmptyEpisodePackageV2(),
    image_map: { entries: [createImageEntry("persisted-image")] },
    media_map: createMediaMap("persisted-media"),
  };
  const requestedPackage = {
    ...persistedPackage,
    image_map: { entries: [createImageEntry("stale-request-image")] },
    media_map: createMediaMap("stale-request-media"),
    seo: {
      ...persistedPackage.seo,
      tags: ["requested-metadata"],
    },
  };
  const existingMetadata = mirrorEpisodePackageV2ToLegacy({
    ...buildDefaultMetadataDocument({
      workpieceId: WORKPIECE_ID,
      workspaceId: WORKSPACE_ID,
      createdAt: "2026-07-12T12:00:00.000Z",
      updatedAt: "2026-07-12T12:00:00.000Z",
      status: "draft",
      notes: null,
      origin: null,
    }),
    episode: persistedPackage,
  });

  const globalWithWindow = globalThis as typeof globalThis & { window?: Window & typeof globalThis };
  const originalWindow = globalWithWindow.window;
  const originalFetch = globalThis.fetch;
  let committedMetadata: Record<string, unknown> | null = null;
  globalWithWindow.window = createWindowStub();
  globalThis.fetch = async (_input, init) => {
    if ((init?.method ?? "GET") === "GET") {
      return new Response(JSON.stringify({ ok: true, data: existingMetadata }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const requestBody = JSON.parse(String(init?.body)) as { json?: Record<string, unknown> };
    committedMetadata = requestBody.json ?? null;
    return new Response(JSON.stringify({
      ok: true,
      data: { file_row: { updated_at: "2026-07-12T12:01:00.000Z" } },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const saved = await saveEpisodePackageForWorkpiece({
      workpieceId: WORKPIECE_ID,
      workspaceId: WORKSPACE_ID,
      episodePackage: requestedPackage,
    });
    assert.equal(saved.ok, true);
    assert.ok(committedMetadata);
    const committedPackage = hydrateEpisodePackageV2(committedMetadata);
    assert.deepEqual(committedPackage.seo.tags, ["requested-metadata"]);
    assert.equal(committedPackage.image_map.entries[0]?.id, "persisted-image");
    assert.equal(committedPackage.media_map.id, "persisted-media");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalWithWindow, "window");
    } else {
      globalWithWindow.window = originalWindow;
    }
  }
});

test("visual artifact authority: media-map persistence has one canonical writer", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/hooks/visuals/useVisualsPersistence.ts"),
    "utf8",
  );
  const start = source.indexOf("const persistMediaMap = useCallback");
  const end = source.indexOf("const persistReferenceClipPlan = useCallback", start);
  assert.ok(start >= 0 && end > start);
  const persistMediaMapSource = source.slice(start, end);

  assert.match(persistMediaMapSource, /saveWorkpieceEpisodeMediaMap/);
  assert.doesNotMatch(persistMediaMapSource, /saveEpisodePackageForWorkpiece/);
});

test("visual artifact authority: media-map save requires an exact artifact acknowledgement", async () => {
  const globalWithWindow = globalThis as typeof globalThis & { window?: Window & typeof globalThis };
  const originalWindow = globalWithWindow.window;
  const originalFetch = globalThis.fetch;
  globalWithWindow.window = createWindowStub();
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  try {
    const saved = await saveWorkpieceEpisodeMediaMap({
      workpieceId: WORKPIECE_ID,
      mediaMap: createMediaMap("canonical-media"),
    });
    assert.equal(saved.ok, false);
    if (saved.ok) assert.fail("Expected a generic acknowledgement to be rejected.");
    assert.match(saved.error, /invalid canonical acknowledgement/i);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalWithWindow, "window");
    } else {
      globalWithWindow.window = originalWindow;
    }
  }
});

test("visual artifact authority: exact media-map acknowledgement returns the committed input", async () => {
  const mediaMap = createMediaMap("canonical-media");
  const globalWithWindow = globalThis as typeof globalThis & { window?: Window & typeof globalThis };
  const originalWindow = globalWithWindow.window;
  const originalFetch = globalThis.fetch;
  globalWithWindow.window = createWindowStub();
  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: true,
    data: {
      path: "hearth/media_map.v1.json",
      file_row: { updated_at: "2026-07-12T12:02:00.000Z" },
    },
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  try {
    const saved = await saveWorkpieceEpisodeMediaMap({
      workpieceId: WORKPIECE_ID,
      mediaMap,
    });
    assert.equal(saved.ok, true);
    if (!saved.ok) assert.fail("Expected an exact acknowledgement to succeed.");
    assert.equal(saved.artifactUpdatedAt, "2026-07-12T12:02:00.000Z");
    assert.equal(saved.mediaMap, mediaMap);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalWithWindow, "window");
    } else {
      globalWithWindow.window = originalWindow;
    }
  }
});
