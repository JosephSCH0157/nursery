import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildSourceDeskUploadPath,
  isAcceptedSourceDeskMediaUpload,
  loadIntroOutroSelection,
  loadWorkpieceMediaPreviewUrl,
  readHammerMediaPreviewErrorDiagnostics,
  saveIntroOutroSelection,
  uploadWorkpieceMediaFile,
} from "../src/lib/hammerSourceDeskMediaApi";
import { normalizeWorkpieceRelativePath } from "../src/lib/workpiecePaths";

type FetchCall = {
  url: string;
  options: Record<string, unknown>;
};

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

async function testIntroOutroSelectionSerializationRoundTrip() {
  const saveCalls: FetchCall[] = [];
  const saveFetch = async (url: string, options: Record<string, unknown>) => {
    saveCalls.push({ url, options });
    return createOkJsonResponse({ ok: true });
  };
  await saveIntroOutroSelection({
    workpieceId: "workpiece-abc",
    selection: {
      intro_path: "assets/uploads/introoutro/1-intro.mp4",
      outro_path: "assets/uploads/introoutro/2-outro.mp4",
      updated_at: "2026-03-21T12:00:00.000Z",
    },
    fetcher: saveFetch as never,
  });

  const savePayload = saveCalls[0]?.options.json as Record<string, unknown>;
  assert.equal(saveCalls[0]?.url, "/tongs/workpieces/workpiece-abc/commit-file");
  assert.equal(savePayload.path, "hammer/session/intro-outro.v1.json");
  assert.deepEqual(savePayload.json, {
    intro_path: "assets/uploads/introoutro/1-intro.mp4",
    outro_path: "assets/uploads/introoutro/2-outro.mp4",
    updated_at: "2026-03-21T12:00:00.000Z",
  });

  const readFetch = async () => createOkJsonResponse({
    exists: true,
    data: {
      intro_path: "assets/uploads/introoutro/1-intro.mp4",
      outro_path: "assets/uploads/introoutro/2-outro.mp4",
      updated_at: "2026-03-21T12:00:00.000Z",
    },
  });
  const loaded = await loadIntroOutroSelection("workpiece-abc", readFetch as never);
  assert.deepEqual(loaded, {
    intro_path: "assets/uploads/introoutro/1-intro.mp4",
    outro_path: "assets/uploads/introoutro/2-outro.mp4",
    updated_at: "2026-03-21T12:00:00.000Z",
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
    "d:/nursery/nursery/apps/hammer/src/lib/hammerSourceDeskMediaApi.ts",
    "utf-8",
  );
  assert.equal(source.includes("localStorage"), false);
}

async function run() {
  await testUploadPathRouting();
  await testMediaTypeAcceptance();
  await testUploadDestinationAndPayloadShape();
  await testInvalidUploadRejectedBeforeFetch();
  await testIntroOutroSelectionSerializationRoundTrip();
  await testNormalizeWorkpieceRelativePath();
  await testPreviewRequestUsesNormalizedRelativePath();
  await testPreviewErrorIncludesNormalizationDiagnostics();
  await testNoLocalStorageDependencyInApiModule();
  // eslint-disable-next-line no-console
  console.log("Hammer Source Desk media API tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer Source Desk media API tests failed:", error);
  process.exit(1);
});
