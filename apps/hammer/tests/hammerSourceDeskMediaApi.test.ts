import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildHammerAssetIdentityKey,
  classifyHammerStoredMediaRoles,
  classifyHammerStoredMediaKind,
  buildSourceDeskUploadPath,
  isAcceptedSourceDeskMediaUpload,
  listWorkpieceStoredMedia,
  loadIntroOutroSelection,
  loadWorkspaceIntroOutroDefaults,
  loadWorkpieceMediaPreviewUrl,
  readHammerMediaPreviewErrorDiagnostics,
  saveWorkspaceIntroOutroDefaults,
  uploadWorkpieceMediaFile,
} from "../src/lib/hammerSourceDeskMediaApi";
import { deriveStableHammerAssetIdFromPath } from "../src/lib/hammerAssetIdentity";
import { detectMediaType, intake } from "../src/lib/hammerIntakeRecordingApi";
import { normalizeWorkpieceRelativePath } from "../../../packages/contracts/workpiece-paths";

type FetchCall = {
  url: string;
  options: Record<string, unknown>;
};

assert.deepEqual(classifyHammerStoredMediaRoles("assets/thumbnails/episode.png"), ["thumbnail"]);
assert.deepEqual(classifyHammerStoredMediaRoles("assets/image-map/candidates/episode/explainer.png"), ["timeline_visual"]);
assert.deepEqual(classifyHammerStoredMediaRoles("assets/misc/extra-thumbnail.png"), []);
assert.deepEqual(classifyHammerStoredMediaRoles("assets/custom/dual.png", ["thumbnail", "timeline_visual"]), ["thumbnail", "timeline_visual"]);
assert.equal(classifyHammerStoredMediaKind("recordings/old-episode.webm"), "other");
assert.equal(classifyHammerStoredMediaKind("assets/uploads/introoutro/workspace-intro.mp4"), "other");
assert.equal(classifyHammerStoredMediaKind("assets/uploads/broll/citrus-grove.mp4"), "broll");
assert.equal(classifyHammerStoredMediaKind("assets/broll-plan/opportunity/render.webm"), "broll");

function createOkJsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function testUploadPathRouting() {
  assert.equal(
    buildSourceDeskUploadPath({ category: "images", filename: "shot.png", timestampMs: 1000 }),
    "assets/uploads/images/1000-shot.png",
  );
  assert.equal(
    buildSourceDeskUploadPath({ category: "broll", filename: "roll.mp4", timestampMs: 2000 }),
    "assets/uploads/broll/2000-roll.mp4",
  );
  assert.equal(
    buildSourceDeskUploadPath({ category: "introoutro", filename: "intro.wav", timestampMs: 3000 }),
    "assets/uploads/introoutro/3000-intro.wav",
  );
}

async function testMediaTypeAcceptance() {
  assert.equal(isAcceptedSourceDeskMediaUpload({
    category: "images",
    mimeType: "image/png",
    filename: "a.png",
  }), true);
  assert.equal(isAcceptedSourceDeskMediaUpload({
    category: "broll",
    mimeType: "video/mp4",
    filename: "b.mp4",
  }), true);
  assert.equal(isAcceptedSourceDeskMediaUpload({
    category: "introoutro",
    mimeType: "audio/wav",
    filename: "c.wav",
  }), true);

  assert.equal(isAcceptedSourceDeskMediaUpload({
    category: "images",
    mimeType: "video/mp4",
    filename: "bad.mp4",
  }), false);
  assert.equal(isAcceptedSourceDeskMediaUpload({
    category: "broll",
    mimeType: "image/png",
    filename: "bad.png",
  }), false);
  assert.equal(isAcceptedSourceDeskMediaUpload({
    category: "introoutro",
    mimeType: "text/plain",
    filename: "bad.txt",
  }), false);
}

async function testUploadDestinationAndPayloadShape() {
  const calls: FetchCall[] = [];
  const fakeFetch = async (url: string, options: Record<string, unknown>) => {
    calls.push({ url, options });
    return createOkJsonResponse({ ok: true });
  };

  const file = new File([new Uint8Array([1, 2, 3])], "frame.png", { type: "image/png" });
  const result = await uploadWorkpieceMediaFile({
    workpieceId: "workpiece-123",
    file,
    category: "images",
    timestampMs: 1111,
    fetcher: fakeFetch as never,
  });

  assert.equal(result.path, "assets/uploads/images/1111-frame.png");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "/tongs/workpieces/workpiece-123/commit-file");
  const payload = (calls[0]?.options.json ?? null) as Record<string, unknown> | null;
  assert.ok(payload, "upload request should include a JSON payload");
  assert.equal(payload?.path, "assets/uploads/images/1111-frame.png");
  assert.equal(payload?.content_type, "image/png");
  assert.equal(typeof payload?.bytes_base64, "string");
}

async function testInvalidUploadRejectedBeforeFetch() {
  const fakeFetch = async () => createOkJsonResponse({ ok: true });
  const badFile = new File([new Uint8Array([1])], "bad.mp4", { type: "video/mp4" });
  await assert.rejects(
    () => uploadWorkpieceMediaFile({
      workpieceId: "workpiece-123",
      file: badFile,
      category: "images",
      fetcher: fakeFetch as never,
    }),
    /unsupported images media type/i,
  );
}

async function testLegacyIntroOutroSelectionImport() {
  const readFetch = async () => createOkJsonResponse({
    exists: true,
    data: {
      schema_version: 1,
      intro_asset_id: "asset_intro",
      outro_asset_id: "asset_outro",
      updated_at: "2026-03-21T12:00:00.000Z",
    },
  });
  const loaded = await loadIntroOutroSelection("workpiece-abc", readFetch as never);
  assert.deepEqual(loaded, {
    schema_version: 1,
    intro_asset_id: "asset_intro",
    outro_asset_id: "asset_outro",
    updated_at: "2026-03-21T12:00:00.000Z",
  });
}

async function testIntroOutroSelectionParsesTongsEnvelope() {
  const readFetch = async () => createOkJsonResponse({
    ok: true,
    data: {
      schema_version: 1,
      intro_asset_id: "asset_intro",
      outro_asset_id: "asset_outro",
      updated_at: "2026-03-21T12:00:00.000Z",
    },
  });
  const loaded = await loadIntroOutroSelection("workpiece-abc", readFetch as never);
  assert.deepEqual(loaded, {
    schema_version: 1,
    intro_asset_id: "asset_intro",
    outro_asset_id: "asset_outro",
    updated_at: "2026-03-21T12:00:00.000Z",
  });
}

async function testIntroOutroSelectionLegacyPathMigration() {
  const legacyIntroPath = "assets/uploads/introoutro/1-intro.mp4";
  const legacyOutroPath = "assets/uploads/introoutro/2-outro.mp4";
  const readFetch = async () => createOkJsonResponse({
    exists: true,
    data: {
      intro_path: legacyIntroPath,
      outro_path: legacyOutroPath,
      updated_at: "2026-03-21T12:00:00.000Z",
    },
  });
  const loaded = await loadIntroOutroSelection("workpiece-abc", readFetch as never);
  assert.deepEqual(loaded, {
    schema_version: 1,
    intro_asset_id: deriveStableHammerAssetIdFromPath(legacyIntroPath),
    outro_asset_id: deriveStableHammerAssetIdFromPath(legacyOutroPath),
    updated_at: "2026-03-21T12:00:00.000Z",
  });
}

async function testWorkspaceIntroOutroDefaultsSerializationRoundTrip() {
  const saveCalls: FetchCall[] = [];
  const saveFetch = async (url: string, options: Record<string, unknown>) => {
    saveCalls.push({ url, options });
    return createOkJsonResponse({ ok: true });
  };

  await saveWorkspaceIntroOutroDefaults({
    workspaceId: "workspace-abc",
    defaults: {
      schema_version: 1,
      intro: { asset_id: null, workpiece_id: "template-1", path: "assets/uploads/introoutro/default-intro.mp3" },
      outro: { asset_id: null, workpiece_id: "template-1", path: "assets/uploads/introoutro/default-outro.mp3" },
      updated_at: "2026-04-18T10:00:00.000Z",
    },
    fetcher: saveFetch as never,
  });

  const savePayload = saveCalls[0]?.options.json as Record<string, unknown>;
  assert.equal(saveCalls[0]?.url, "/tongs/workspaces/workspace-abc/commit-file");
  assert.equal(savePayload.path, "hammer/settings/intro-outro-defaults.v1.json");
  assert.deepEqual(savePayload.json, {
    schema_version: 1,
    intro: { asset_id: null, workpiece_id: "template-1", path: "assets/uploads/introoutro/default-intro.mp3" },
    outro: { asset_id: null, workpiece_id: "template-1", path: "assets/uploads/introoutro/default-outro.mp3" },
    updated_at: "2026-04-18T10:00:00.000Z",
  });

  const readFetch = async () => createOkJsonResponse({
    exists: true,
    data: {
      schema_version: 1,
      intro: { asset_id: null, workpiece_id: "template-1", path: "assets/uploads/introoutro/default-intro.mp3" },
      outro: { asset_id: null, workpiece_id: "template-1", path: "assets/uploads/introoutro/default-outro.mp3" },
      updated_at: "2026-04-18T10:00:00.000Z",
    },
  });

  const loaded = await loadWorkspaceIntroOutroDefaults("workspace-abc", readFetch as never);
  assert.deepEqual(loaded, {
    schema_version: 1,
    intro: { asset_id: null, workpiece_id: "template-1", path: "assets/uploads/introoutro/default-intro.mp3" },
    outro: { asset_id: null, workpiece_id: "template-1", path: "assets/uploads/introoutro/default-outro.mp3" },
    updated_at: "2026-04-18T10:00:00.000Z",
  });
}

async function testListWorkpieceStoredMediaParsesTongsEnvelopeAndNormalizesPaths() {
  const storageFetch = async () => createOkJsonResponse({
    ok: true,
    data: {
      listing: {
        nodes: [
          {
            kind: "directory",
            path: "workpieces/abc123/assets",
            children: [
              {
                kind: "directory",
                path: "workpieces/abc123/assets/uploads",
                children: [
                  {
                    kind: "file",
                    path: "workpieces/abc123/assets/uploads/introoutro/123-intro.mp3",
                    bytes: 100,
                    updated_at: "2026-04-14T12:00:00.000Z",
                    asset_id: "11111111-1111-4111-8111-111111111111",
                    content_hash: "a".repeat(64),
                    mime_type: "audio/mpeg",
                    duration_ms: 1250,
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  });

  const files = await listWorkpieceStoredMedia("abc123", storageFetch as never);
  assert.equal(files.length, 1);
  assert.deepEqual(files[0], {
    assetId: "11111111-1111-4111-8111-111111111111",
    path: "assets/uploads/introoutro/123-intro.mp3",
    name: "123-intro.mp3",
    kind: "audio",
    bytes: 100,
    roles: [],
    updatedAt: "2026-04-14T12:00:00.000Z",
    contentHash: "a".repeat(64),
    mimeType: "audio/mpeg",
    durationMs: 1250,
  });
}

async function testNormalizeWorkpieceRelativePath() {
  assert.equal(
    normalizeWorkpieceRelativePath("abc123", "workpieces/abc123/assets/image.png"),
    "assets/image.png",
  );
  assert.equal(
    normalizeWorkpieceRelativePath("abc123", "/workpieces/abc123/assets/image.png"),
    "assets/image.png",
  );
  assert.equal(
    normalizeWorkpieceRelativePath("abc123", "assets/image.png"),
    "assets/image.png",
  );
  assert.equal(
    normalizeWorkpieceRelativePath("abc123", "workpieces/abc123/workpieces/abc123/assets/image.png"),
    "assets/image.png",
  );
}

async function testPreviewRequestUsesNormalizedRelativePath() {
  const calls: FetchCall[] = [];
  const createObjectUrl = URL.createObjectURL;
  URL.createObjectURL = ((blob: Blob) => `blob:${blob.type}`) as typeof URL.createObjectURL;
  try {
    const fakeFetch = async (url: string, options: Record<string, unknown>) => {
      calls.push({ url, options });
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    };

    const url = await loadWorkpieceMediaPreviewUrl({
      workpieceId: "abc123",
      path: "/workpieces/abc123/assets/image.png",
      fetcher: fakeFetch as never,
    });

    assert.equal(url, "blob:image/png");
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0]?.url,
      "/tongs/workpieces/abc123/read-file?path=assets%2Fimage.png&encoding=binary",
    );
  } finally {
    URL.createObjectURL = createObjectUrl;
  }
}

async function testPreviewRequestCachesNetworkFetchPerAssetIdentity() {
  const calls: FetchCall[] = [];
  const createObjectUrl = URL.createObjectURL;
  URL.createObjectURL = ((blob: Blob) => `blob:${blob.type}:${blob.size}`) as typeof URL.createObjectURL;
  try {
    const uniquePath = `assets/cache-test-${Date.now()}.png`;
    const fakeFetch = async (url: string, options: Record<string, unknown>) => {
      calls.push({ url, options });
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    };

    const first = await loadWorkpieceMediaPreviewUrl({
      workpieceId: "abc123",
      path: uniquePath,
      fetcher: fakeFetch as never,
    });
    const second = await loadWorkpieceMediaPreviewUrl({
      workpieceId: "abc123",
      path: uniquePath,
      fetcher: fakeFetch as never,
    });

    assert.equal(first.startsWith("blob:image/png:"), true);
    assert.equal(second.startsWith("blob:image/png:"), true);
    assert.equal(calls.length, 1);
  } finally {
    URL.createObjectURL = createObjectUrl;
  }
}

async function testDeterministicAssetIdentityKey() {
  const key = buildHammerAssetIdentityKey({
    workpieceId: "workpiece_01",
    assetId: "asset_01",
    variantKind: "preview",
    variantVersion: 2,
  });
  assert.equal(key, "workpiece_01:asset_01:preview:v2");
}

async function testPreviewErrorIncludesNormalizationDiagnostics() {
  const fakeFetch = async () => new Response(null, { status: 404 });

  await assert.rejects(async () => {
    try {
      await loadWorkpieceMediaPreviewUrl({
        workpieceId: "abc123",
        path: "workpieces/abc123/assets/missing.png",
        fetcher: fakeFetch as never,
      });
    } catch (error) {
      const diagnostics = readHammerMediaPreviewErrorDiagnostics(error);
      assert.deepEqual(diagnostics, {
        workpieceId: "abc123",
        originalPath: "workpieces/abc123/assets/missing.png",
        normalizedPath: "assets/missing.png",
        status: 404,
      });
      throw error;
    }
  }, /source desk media preview/i);
}

async function testNoLocalStorageDependencyInApiModule() {
  const source = await readFile(
    new URL("../src/lib/hammerSourceDeskMediaApi.ts", import.meta.url),
    "utf-8",
  );
  assert.equal(source.includes("localStorage"), false);
}

async function testHammerIntakeDetectMediaType() {
  assert.equal(detectMediaType({ name: "clip.wav", type: "" }), "audio");
  assert.equal(detectMediaType({ name: "clip.mp4", type: "" }), "video");
  assert.equal(detectMediaType({ name: "clip.unknown", type: "audio/mpeg" }), "audio");
  assert.equal(detectMediaType({ name: "clip.unknown", type: "video/mp4" }), "video");
  assert.equal(detectMediaType({ name: "clip.txt", type: "text/plain" }), "unsupported");
}

async function testHammerIntakeEpisodeAttachedSkipsCradleCreation() {
  const calls: FetchCall[] = [];
  const fakeFetch = async (url: string, options: Record<string, unknown>) => {
    calls.push({ url, options });
    if (url.includes("/hammer/recording-import")) {
      return createOkJsonResponse({ ok: true, data: { outcome: "committed", import: { id: "import-1", media_path: "recordings/imports/op/hash.mp4" } } });
    }
    return new Response(JSON.stringify({ ok: false, error: { message: "unexpected url" } }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  };

  const originalInfo = console.info;
  console.info = (() => {}) as typeof console.info;
  try {
    const file = new File([new Uint8Array([1, 2, 3])], "clip.mp4", { type: "video/mp4" });
    const result = await intake({
      mode: "episode_attached",
      workspaceId: "workspace-1",
      workpieceId: "workpiece-1",
      file,
      fetcher: fakeFetch as never,
    });

    assert.equal(result.ok, true);
    assert.equal(calls.some((call) => call.url === "/tongs/cradles"), false);
    assert.equal(calls.filter((call) => call.url.includes("/hammer/recording-import")).length, 1);
    const importPayload = (calls.find((call) => call.url.includes("/hammer/recording-import"))?.options.json ?? null) as Record<string, unknown> | null;
    assert.ok(importPayload);
    assert.equal(importPayload.media_content_type, "video/mp4");
    assert.equal((importPayload.provenance as Record<string, unknown>).source, "hammer.intake");
  } finally {
    console.info = originalInfo;
  }
}

async function testHammerIntakeStandaloneCreatesCradleThenCommits() {
  const calls: FetchCall[] = [];
  const fakeFetch = async (url: string, options: Record<string, unknown>) => {
    calls.push({ url, options });
    if (url === "/tongs/cradles") {
      return new Response(JSON.stringify({ ok: true, data: { cradle: { id: "workpiece-new" } } }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/hammer/recording-import")) {
      return createOkJsonResponse({ ok: true, data: { outcome: "committed", import: { id: "import-2", media_path: "recordings/imports/op/hash.mp3" } } });
    }
    return new Response(JSON.stringify({ ok: false, error: { message: "unexpected url" } }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  };

  const originalInfo = console.info;
  console.info = (() => {}) as typeof console.info;
  try {
    const file = new File([new Uint8Array([9, 8, 7])], "audio.mp3", { type: "audio/mpeg" });
    const result = await intake({
      mode: "standalone",
      workspaceId: "workspace-2",
      file,
      fetcher: fakeFetch as never,
    });

    assert.equal(result.ok, true);
    assert.equal(calls[0]?.url, "/tongs/cradles");
    assert.equal(calls.filter((call) => call.url.includes("/hammer/recording-import")).length, 1);
  } finally {
    console.info = originalInfo;
  }
}

async function run() {
  await testUploadPathRouting();
  await testMediaTypeAcceptance();
  await testUploadDestinationAndPayloadShape();
  await testInvalidUploadRejectedBeforeFetch();
  await testLegacyIntroOutroSelectionImport();
  await testIntroOutroSelectionParsesTongsEnvelope();
  await testIntroOutroSelectionLegacyPathMigration();
  await testWorkspaceIntroOutroDefaultsSerializationRoundTrip();
  await testListWorkpieceStoredMediaParsesTongsEnvelopeAndNormalizesPaths();
  await testNormalizeWorkpieceRelativePath();
  await testPreviewRequestUsesNormalizedRelativePath();
  await testPreviewRequestCachesNetworkFetchPerAssetIdentity();
  await testDeterministicAssetIdentityKey();
  await testPreviewErrorIncludesNormalizationDiagnostics();
  await testNoLocalStorageDependencyInApiModule();
  await testHammerIntakeDetectMediaType();
  await testHammerIntakeEpisodeAttachedSkipsCradleCreation();
  await testHammerIntakeStandaloneCreatesCradleThenCommits();
  // eslint-disable-next-line no-console
  console.log("Hammer Source Desk media API tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer Source Desk media API tests failed:", error);
  process.exit(1);
});
