import assert from "node:assert/strict";
import { createElement, createRef } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { listHearthAttachments } from "../src/lib/hearth-attachments-api";
import { listHearthBarStockSparks } from "../src/lib/hearth-barstock-sparks";
import { HearthDependencyError } from "../src/lib/hearth-dependency-state";
import { getWorkpieceImageMap } from "../src/lib/hearth-image-map-repo";
import { readWorkpieceEpisodeMediaMap } from "../src/lib/hearth-media-map-repo";
import { listHearthWorkpiecePresence } from "../src/lib/hearth-presence";
import { listHearthReadyScripts } from "../src/lib/hearth-ready-scripts";
import { listHearthWorkpieces } from "../src/lib/hearth-workpieces";
import HearthEpisodesMode from "../src/views/modes/HearthEpisodesMode";

const WORKSPACE_ID = "f7f581e2-94d0-4c7d-bd0c-b650f6f9d8b1";
const WORKPIECE_ID = "9287963f-e82a-4d9a-b810-db100e9d0021";

function createWindowStub(withToken = true) {
  return {
    location: { search: "" },
    localStorage: {
      getItem: (key: string) => withToken && key === "forge-auth"
        ? JSON.stringify({ access_token: "user-token" })
        : null,
      key: () => null,
      length: 0,
    },
    ...(withToken ? { __forgeTongsApiToken: "test-token" } : {}),
  } as unknown as Window & typeof globalThis;
}

async function withFetch<T>(
  fetchImpl: typeof fetch,
  run: () => Promise<T>,
  withToken = true,
): Promise<T> {
  const globalWithWindow = globalThis as typeof globalThis & { window?: Window & typeof globalThis };
  const originalWindow = globalWithWindow.window;
  const originalFetch = globalThis.fetch;
  globalWithWindow.window = createWindowStub(withToken);
  globalThis.fetch = fetchImpl;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalWithWindow, "window");
    } else {
      globalWithWindow.window = originalWindow;
    }
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("dependency degradation: a successful empty Ready response remains empty success", async () => {
  const entries = await withFetch(
    async () => jsonResponse({ ok: true, data: { scripts: [] } }),
    () => listHearthReadyScripts(WORKSPACE_ID),
  );
  assert.deepEqual(entries, []);
});

test("dependency degradation: unavailable Ready discovery cannot masquerade as an empty queue", async () => {
  await assert.rejects(
    () => withFetch(
      async () => jsonResponse({ ok: false }, 503),
      () => listHearthReadyScripts(WORKSPACE_ID),
    ),
    (error: unknown) => (
      error instanceof HearthDependencyError
      && error.dependency === "ready_scripts"
      && error.kind === "unavailable"
    ),
  );
});

test("dependency degradation: malformed Ready responses are failed, not empty", async () => {
  await assert.rejects(
    () => withFetch(
      async () => jsonResponse({ ok: true, data: {} }),
      () => listHearthReadyScripts(WORKSPACE_ID),
    ),
    (error: unknown) => error instanceof HearthDependencyError && error.kind === "failed",
  );
  await assert.rejects(
    () => withFetch(
      async () => jsonResponse({ ok: true, data: { scripts: [{}] } }),
      () => listHearthReadyScripts(WORKSPACE_ID),
    ),
    (error: unknown) => error instanceof HearthDependencyError && error.kind === "failed",
  );
});

test("dependency degradation: a successful empty Episode response remains empty success", async () => {
  const entries = await withFetch(
    async () => jsonResponse({ ok: true, data: { episodes: [] } }),
    () => listHearthWorkpieces(WORKSPACE_ID),
  );
  assert.deepEqual(entries, []);
});

test("dependency degradation: unavailable Episode discovery cannot masquerade as no Episodes", async () => {
  await assert.rejects(
    () => withFetch(
      async () => jsonResponse({ ok: false }, 503),
      () => listHearthWorkpieces(WORKSPACE_ID),
    ),
    (error: unknown) => (
      error instanceof HearthDependencyError
      && error.dependency === "workpieces"
      && error.kind === "unavailable"
    ),
  );
  await assert.rejects(
    () => withFetch(
      async () => jsonResponse({ ok: true, data: { episodes: [{}] } }),
      () => listHearthWorkpieces(WORKSPACE_ID),
    ),
    (error: unknown) => error instanceof HearthDependencyError && error.kind === "failed",
  );
});

test("dependency degradation: successful empty sparks differ from malformed spark discovery", async () => {
  const empty = await withFetch(
    async () => jsonResponse({ ok: true, data: { sparks: [] } }),
    () => listHearthBarStockSparks(WORKSPACE_ID),
  );
  assert.deepEqual(empty, []);

  await assert.rejects(
    () => withFetch(
      async () => jsonResponse({ ok: true, data: { sparks: [{}] } }),
      () => listHearthBarStockSparks(WORKSPACE_ID),
    ),
    (error: unknown) => (
      error instanceof HearthDependencyError
      && error.dependency === "bar_stock_sparks"
      && error.kind === "failed"
    ),
  );
});

test("dependency degradation: successful zero-peer presence differs from unavailable presence", async () => {
  const available = await withFetch(
    async () => jsonResponse({ ok: true, data: { presence: [] } }),
    () => listHearthWorkpiecePresence(WORKSPACE_ID, WORKPIECE_ID),
  );
  assert.equal(available.kind, "success");
  if (available.kind === "success") assert.deepEqual(available.value, []);

  const unavailable = await withFetch(
    async () => jsonResponse({ ok: false }, 503),
    () => listHearthWorkpiecePresence(WORKSPACE_ID, WORKPIECE_ID),
  );
  assert.equal(unavailable.kind, "unavailable");

  const malformed = await withFetch(
    async () => jsonResponse({ ok: true, data: { presence: [{}] } }),
    () => listHearthWorkpiecePresence(WORKSPACE_ID, WORKPIECE_ID),
  );
  assert.equal(malformed.kind, "failed");
});

test("dependency degradation: missing authentication makes presence unavailable, not idle", async () => {
  const result = await withFetch(
    async () => assert.fail("Presence must not call the provider without authentication."),
    () => listHearthWorkpiecePresence(WORKSPACE_ID, WORKPIECE_ID),
    false,
  );
  assert.equal(result.kind, "unavailable");
});

test("dependency degradation: an absent attachment route is unavailable, not an empty attachment list", async () => {
  const result = await withFetch(
    async () => jsonResponse({ ok: false }, 404),
    () => listHearthAttachments({ workspaceId: WORKSPACE_ID, episodeId: WORKPIECE_ID }),
  );
  assert.equal(result.ok, false);
  if (result.ok) assert.fail("Expected attachment discovery to be unavailable.");
  assert.equal(result.reason, "unavailable");

  const malformed = await withFetch(
    async () => jsonResponse({ ok: true, data: { attachments: [{}] } }),
    () => listHearthAttachments({ workspaceId: WORKSPACE_ID, episodeId: WORKPIECE_ID }),
  );
  assert.equal(malformed.ok, false);
  if (malformed.ok) assert.fail("Expected malformed attachment discovery to fail.");
  assert.equal(malformed.reason, "failed");
});

test("dependency degradation: network failures remain explicit at attachment and visual boundaries", async () => {
  const results = await withFetch(
    async () => {
      throw new TypeError("Failed to fetch");
    },
    async () => Promise.all([
      listHearthAttachments({ workspaceId: WORKSPACE_ID, episodeId: WORKPIECE_ID }),
      getWorkpieceImageMap(WORKPIECE_ID),
      readWorkpieceEpisodeMediaMap(WORKPIECE_ID),
    ]),
  );

  const [attachments, imageMap, mediaMap] = results;
  assert.ok(attachments && !attachments.ok);
  assert.ok(imageMap && !imageMap.ok);
  assert.ok(mediaMap && !mediaMap.ok);
  assert.equal(attachments.status, 0);
  assert.equal(imageMap.status, 0);
  assert.equal(mediaMap.status, 0);
});

test("dependency degradation: orchestration surfaces failures instead of resolving discovery lanes", () => {
  const initialLoader = readFileSync(resolve(process.cwd(), "src/hooks/useHearthInitialLoader.ts"), "utf8");
  const sparkDiscovery = readFileSync(resolve(process.cwd(), "src/hooks/useHearthSparkDiscovery.ts"), "utf8");

  assert.doesNotMatch(initialLoader, /listHearthWorkpieces[\s\S]{0,300}\.catch\(\(\) => \[\]/);
  assert.match(initialLoader, /setWorkpiecesError\(workpiecesResult\.ok/);
  assert.match(sparkDiscovery, /Bar Stock spark discovery is currently unavailable\./);
  assert.match(sparkDiscovery, /catch[\s\S]{0,180}setSparkDiscoveryWorkspaceId\(null\)/);
});

test("dependency degradation: Episode collection renders explicit presence boundary labels", () => {
  const html = renderToStaticMarkup(createElement(HearthEpisodesMode, {
    isMobile: false,
    startFromScratch: () => undefined,
    isForging: false,
    onCreateDraft: () => undefined,
    openReadyInMobileOverlay: () => undefined,
    searchRef: createRef<HTMLInputElement>(),
    searchText: "",
    setSearchText: () => undefined,
    sortKey: "updated",
    setSortKey: () => undefined,
    filteredWorkpieceNavItems: [
      { workpieceId: "active", draftId: null, title: "Active", updatedAtMs: 1, isArchived: false },
      { workpieceId: "unchecked", draftId: null, title: "Unchecked", updatedAtMs: 1, isArchived: false },
    ],
    draftsById: new Map(),
    workpieceId: "active",
    archivingWorkpieceIds: [],
    restoringWorkpieceIds: [],
    openWorkpieceInFocus: () => undefined,
    resolveWorkpiecePresenceClass: (id) => id === "active" ? "is-unknown" : "",
    resolveWorkpiecePresenceBadge: (id) => id === "active" ? "Presence unavailable" : "Not checked",
    formatUpdatedAt: () => "now",
    resolveDraftEditorName: () => "Unknown",
    saveDraftMeta: () => undefined,
    onRestoreWorkpiece: () => undefined,
    onArchiveWorkpiece: () => undefined,
    onDeleteDraft: () => undefined,
  }));
  assert.match(html, /Presence unavailable/);
  assert.match(html, /Not checked/);
});
