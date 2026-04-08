import assert from "node:assert/strict";
import {
  HAMMER_HISTORY_ARTIFACT_PATH,
  HAMMER_HISTORY_PRESENCE_PATH,
  loadHammerHistoryDocument,
  loadHammerHistoryPresence,
  saveHammerHistoryDocument,
} from "../src/lib/hammerHistoryArtifactApi";

type FetchCall = {
  url: string;
  options: Record<string, unknown>;
};

function createJsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function createMissingJsonResponse(): Response {
  return createJsonResponse(404, { ok: true, exists: false });
}

async function testHistoryMissing404IsNonError() {
  const fakeFetch = async () => createMissingJsonResponse();
  const result = await loadHammerHistoryDocument("workpiece-123", fakeFetch as never);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.exists, false);
  assert.equal(result.ok ? result.data : "x", null);
}

async function testPresenceMissing404IsNonError() {
  const fakeFetch = async () => createMissingJsonResponse();
  const result = await loadHammerHistoryPresence("workpiece-123", fakeFetch as never);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.exists, false);
  assert.equal(result.ok ? result.data : "x", null);
}

async function testSaveWritesPresenceSentinelBestEffort() {
  const calls: FetchCall[] = [];
  const fakeFetch = async (url: string, options: Record<string, unknown>) => {
    calls.push({ url, options });
    return createJsonResponse(200, { ok: true });
  };

  const result = await saveHammerHistoryDocument({
    workpieceId: "workpiece-123",
    document: {
      version: 1,
      workpieceId: "workpiece-123",
      sessionId: "session-123",
      baseRevisionId: "base-abc",
      createdAt: "2026-04-08T00:00:00.000Z",
      updatedAt: "2026-04-08T00:00:00.000Z",
      headEntryId: null,
      entries: [],
      checkpoints: [],
      undoStack: [],
      redoStack: [],
    },
    fetcher: fakeFetch as never,
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length >= 1, true);
  const historyCommit = calls.find((call) => call.url.includes("/commit-file") && call.url.includes("workpiece-123"));
  assert(historyCommit, "expected history commit-file call");

  const sentinelCommit = calls.find((call) => {
    const payload = call.options.json as Record<string, unknown> | undefined;
    return Boolean(payload && payload.path === HAMMER_HISTORY_PRESENCE_PATH);
  });
  assert(sentinelCommit, "expected presence sentinel commit-file call");
  const historyPayload = (historyCommit?.options.json as Record<string, unknown>) ?? {};
  assert.equal(historyPayload.path, HAMMER_HISTORY_ARTIFACT_PATH);
}

async function run() {
  await testHistoryMissing404IsNonError();
  await testPresenceMissing404IsNonError();
  await testSaveWritesPresenceSentinelBestEffort();
  // eslint-disable-next-line no-console
  console.log("Hammer history artifact API tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer history artifact API tests failed:", error);
  process.exit(1);
});
