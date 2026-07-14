import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildDefaultMetadataDocument,
  createEmptyEpisodePackageV2,
  mirrorEpisodePackageV2ToLegacy,
} from "../src/lib/episode-package-v2";
import { hasCanonicalFraming, resolveCanonicalFraming } from "../src/lib/hearth-framing-authority";
import {
  readEpisodePackageForWorkpiece,
  saveEpisodePackageForWorkpiece,
} from "../src/lib/hearth-thumbnail-api";

const WORKPIECE_ID = "9287963f-e82a-4d9a-b810-db100e9d0021";
const WORKSPACE_ID = "494c2ae5-9037-4208-b898-fab4898ab430";

function createWindowStub() {
  return {
    location: { search: "" },
    localStorage: { getItem: () => null, key: () => null, length: 0 },
    __forgeTongsApiToken: "test-token",
  } as unknown as Window & typeof globalThis;
}

test("framing persistence: Saved is returned only after canonical reload recovers exact framing", async () => {
  const pkg = createEmptyEpisodePackageV2();
  pkg.seo = {
    titles: [
      { id: "a", label: "A", text: "The Citrus Collapse", is_primary: true },
      { id: "b", label: "B", text: "Florida's Vanishing Orange Groves", is_primary: false },
      { id: "c", label: "C", text: "What Killed Florida Citrus?", is_primary: false },
    ],
    tags: ["florida-oranges", "citrus-greening"],
    description_short: "A concise history of Florida's citrus collapse.",
    description_long: "A documented look at disease, storms, development, and the people rebuilding Florida citrus.",
  };
  let metadata = mirrorEpisodePackageV2ToLegacy({
    ...buildDefaultMetadataDocument({
      workpieceId: WORKPIECE_ID,
      workspaceId: WORKSPACE_ID,
      createdAt: "2026-07-14T12:00:00.000Z",
      updatedAt: "2026-07-14T12:00:00.000Z",
      status: "draft",
      notes: null,
      origin: null,
    }),
  });

  const globalWithWindow = globalThis as typeof globalThis & { window?: Window & typeof globalThis };
  const originalWindow = globalWithWindow.window;
  const originalFetch = globalThis.fetch;
  globalWithWindow.window = createWindowStub();
  globalThis.fetch = async (_input, init) => {
    if ((init?.method ?? "GET") === "GET") {
      return new Response(JSON.stringify({ ok: true, data: metadata }), { status: 200 });
    }
    const body = JSON.parse(String(init?.body)) as { json: Record<string, unknown> };
    metadata = body.json;
    return new Response(JSON.stringify({
      ok: true,
      data: { file_row: { updated_at: "2026-07-14T12:01:00.000Z" } },
    }), { status: 200 });
  };

  try {
    const saved = await saveEpisodePackageForWorkpiece({
      workpieceId: WORKPIECE_ID,
      workspaceId: WORKSPACE_ID,
      episodePackage: pkg,
      eventName: "hearth.metadata.autosave.v1",
      eventPayload: { section: "seo" },
    });
    assert.equal(saved.ok, true);

    // Simulate destroying every client/store value and reload only from Tongs.
    const reloaded = await readEpisodePackageForWorkpiece(WORKPIECE_ID);
    assert.equal(reloaded.ok, true);
    if (!reloaded.ok) return;
    assert.deepEqual(reloaded.episodePackage.seo, resolveCanonicalFraming(pkg));
    assert.equal(hasCanonicalFraming(reloaded.episodePackage), true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) Reflect.deleteProperty(globalWithWindow, "window");
    else globalWithWindow.window = originalWindow;
  }
});

test("framing persistence: mismatched reload cannot be reported as Saved", async () => {
  const requested = createEmptyEpisodePackageV2();
  requested.seo.description_short = "Expected framing";
  const emptyMetadata = mirrorEpisodePackageV2ToLegacy({
    ...buildDefaultMetadataDocument({
      workpieceId: WORKPIECE_ID,
      workspaceId: WORKSPACE_ID,
      createdAt: "2026-07-14T12:00:00.000Z",
      updatedAt: "2026-07-14T12:00:00.000Z",
      status: "draft",
      notes: null,
      origin: null,
    }),
  });
  const globalWithWindow = globalThis as typeof globalThis & { window?: Window & typeof globalThis };
  const originalWindow = globalWithWindow.window;
  const originalFetch = globalThis.fetch;
  let committed = false;
  globalWithWindow.window = createWindowStub();
  globalThis.fetch = async (_input, init) => {
    if ((init?.method ?? "GET") === "GET") {
      return new Response(JSON.stringify({ ok: true, data: emptyMetadata }), { status: 200 });
    }
    committed = true;
    return new Response(JSON.stringify({ ok: true, data: { file_row: {} } }), { status: 200 });
  };
  try {
    const saved = await saveEpisodePackageForWorkpiece({
      workpieceId: WORKPIECE_ID,
      workspaceId: WORKSPACE_ID,
      episodePackage: requested,
      eventName: "hearth.metadata.autosave.v1",
    });
    assert.equal(committed, true);
    assert.equal(saved.ok, false);
    if (saved.ok) return;
    assert.equal(saved.status, 409);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) Reflect.deleteProperty(globalWithWindow, "window");
    else globalWithWindow.window = originalWindow;
  }
});

test("framing persistence: reload hydration is pending before package data and pack loads eagerly", () => {
  const metadataHook = readFileSync(resolve(process.cwd(), "src/hooks/visuals/useMetadataWorkspace.ts"), "utf8");
  const packHook = readFileSync(resolve(process.cwd(), "src/hooks/visuals/useReleasePrepPackWorkspace.ts"), "utf8");
  assert.match(metadataHook, /useState<MetadataSaveState>\("loading"\)/);
  assert.match(metadataHook, /if \(!episodePackage\)[\s\S]*?setMetadataSaveState\("loading"\)/);
  assert.match(packHook, /void loadLatestReleasePrepPack\(args\.approvedScriptVersion\)/);
  assert.doesNotMatch(packHook, /Avoid eager fetch spam/);
});
