import assert from "node:assert/strict";
import { detectMediaType, intake } from "../src/lib/hammerIntakeRecordingApi";

type FetchCall = {
  url: string;
  options: Record<string, unknown>;
};

function createJsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function testDetectMediaType() {
  assert.equal(detectMediaType({ name: "clip.wav", type: "" }), "audio");
  assert.equal(detectMediaType({ name: "clip.mp4", type: "" }), "video");
  assert.equal(detectMediaType({ name: "clip.unknown", type: "audio/mpeg" }), "audio");
  assert.equal(detectMediaType({ name: "clip.unknown", type: "video/mp4" }), "video");
  assert.equal(detectMediaType({ name: "clip.txt", type: "text/plain" }), "unsupported");
}

async function testEpisodeAttachedIntakeSkipsCradleCreation() {
  const calls: FetchCall[] = [];
  const fakeFetch = async (url: string, options: Record<string, unknown>) => {
    calls.push({ url, options });
    if (url.includes("/commit-file")) {
      return createJsonResponse(200, { ok: true, data: {} });
    }
    if (url.includes("/append-event")) {
      return createJsonResponse(201, { ok: true, data: { id: 123 } });
    }
    return createJsonResponse(404, { ok: false, error: { message: "unexpected url" } });
  };

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
  assert.equal(calls.filter((call) => call.url.includes("/commit-file")).length, 1);
  assert.equal(calls.filter((call) => call.url.includes("/append-event")).length, 1);

  const commitPayload = (calls.find((call) => call.url.includes("/commit-file"))?.options.json ?? null) as Record<string, unknown> | null;
  assert.ok(commitPayload);
  assert.equal(typeof commitPayload.path, "string");
  assert.ok(String(commitPayload.path).startsWith("recordings/imported-"));
  assert.equal(commitPayload.event_name, "take_completed");
}

async function testStandaloneIntakeCreatesCradleThenCommits() {
  const calls: FetchCall[] = [];
  const fakeFetch = async (url: string, options: Record<string, unknown>) => {
    calls.push({ url, options });
    if (url === "/tongs/cradles") {
      return createJsonResponse(201, { ok: true, data: { cradle: { id: "workpiece-new" } } });
    }
    if (url.includes("/commit-file")) {
      return createJsonResponse(200, { ok: true, data: {} });
    }
    if (url.includes("/append-event")) {
      return createJsonResponse(201, { ok: true, data: { id: 987 } });
    }
    return createJsonResponse(404, { ok: false, error: { message: "unexpected url" } });
  };

  const file = new File([new Uint8Array([9, 8, 7])], "audio.mp3", { type: "audio/mpeg" });
  const result = await intake({
    mode: "standalone",
    workspaceId: "workspace-2",
    file,
    fetcher: fakeFetch as never,
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0]?.url, "/tongs/cradles");
  assert.equal(calls.filter((call) => call.url.includes("/commit-file")).length, 1);
  assert.equal(calls.filter((call) => call.url.includes("/append-event")).length, 1);
}

async function testUnsupportedFileRejectedBeforeFetch() {
  const calls: FetchCall[] = [];
  const fakeFetch = async (url: string, options: Record<string, unknown>) => {
    calls.push({ url, options });
    return createJsonResponse(200, { ok: true, data: {} });
  };

  const file = new File([new Uint8Array([1])], "notes.txt", { type: "text/plain" });
  const result = await intake({
    mode: "episode_attached",
    workspaceId: "workspace-3",
    workpieceId: "workpiece-3",
    file,
    fetcher: fakeFetch as never,
  });

  assert.equal(result.ok, false);
  assert.equal(calls.length, 0);
}

async function run() {
  const originalInfo = console.info;
  console.info = (() => {}) as typeof console.info;
  try {
    await testDetectMediaType();
    await testEpisodeAttachedIntakeSkipsCradleCreation();
    await testStandaloneIntakeCreatesCradleThenCommits();
    await testUnsupportedFileRejectedBeforeFetch();
    // eslint-disable-next-line no-console
    console.log("Hammer intake recording API tests passed.");
  } finally {
    console.info = originalInfo;
  }
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer intake recording API tests failed:", error);
  process.exit(1);
});
