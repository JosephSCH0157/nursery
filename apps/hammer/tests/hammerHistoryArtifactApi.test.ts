import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import type { HammerHistoryDocumentV1 } from "../src/editor/hammerWorkspaceHistory";
import {
  HAMMER_HISTORY_ARTIFACT_PATH,
  HAMMER_HISTORY_PRESENCE_PATH,
  loadHammerHistoryDocument,
  loadHammerHistoryPresence,
  loadHammerRevisionHistoryDocument,
  saveHammerHistoryDocument,
  saveHammerRevisionHistoryDocument,
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

async function testRevisionHistoryMissing404IsNonError() {
  const fakeFetch = async () => createMissingJsonResponse();
  const result = await loadHammerRevisionHistoryDocument({
    workpieceId: "workpiece-123",
    historyPath: "hammer/revisions/rev-123/history.v1.json",
    fetcher: fakeFetch as never,
  });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.exists, false);
  assert.equal(result.ok ? result.data : "x", null);
}

async function testCanonicalRevisionHistoryEnvelopeInstallsFrozenControllerState() {
  const frozenPath = "C:/Users/Iam11/Documents/Forge Recovery Bundles/florida-oranges-2026-08-16T00-27-57-200Z/intended.history.v1.json";
  if (!existsSync(frozenPath)) return;
  const document = JSON.parse(readFileSync(frozenPath, "utf8")) as HammerHistoryDocumentV1;
  const fakeFetch = async () => createJsonResponse(200, {
    ok: true,
    data: document,
    file_row: { revision: 77, hash_value: "69542d9f7d3d7c16ef9d3e0eb23b5afc9a6272919fcdf10b480ac3223d0eb832" },
  });
  for (let mount = 0; mount < 2; mount += 1) {
    const result = await loadHammerRevisionHistoryDocument({
      workpieceId: "85d076d6-54e6-4b56-ab60-5eff4c87cdd0",
      historyPath: "hammer/revisions/f642b5d9-cec2-4656-804e-49bb33bc0cb5/history.v1.json",
      fetcher: fakeFetch as never,
    });
    assert.equal(result.ok && result.exists, true);
    if (!result.ok || !result.data) continue;
    assert.equal(result.data.entries.length, 2);
    assert.equal(result.data.undoStack.length, 2);
    assert.equal(result.data.redoStack.length, 0);
    assert.equal(result.data.baseRevisionId, "hammer-state:7cf64e31");
    assert.equal(result.data.headEntryId, "entry:6ba40e41-8e00-4fb1-9f70-224789f61a73");
    assert.equal(result.data.sessionId, "session_fc4374ab-0097-4c0f-abd5-5a0099940abf");
  }
}

async function testHistoryReadFailuresRemainClassified() {
  const malformed = await loadHammerRevisionHistoryDocument({ workpieceId: "w", historyPath: "exact", fetcher: (async () => new Response("not-json", { status: 200 })) as never });
  assert.equal(!malformed.ok && malformed.classification, "malformed");
  const unauthorized = await loadHammerRevisionHistoryDocument({ workpieceId: "w", historyPath: "exact", fetcher: (async () => createJsonResponse(403, { ok: false })) as never });
  assert.equal(!unauthorized.ok && unauthorized.classification, "unauthorized");
  const invalid = await loadHammerRevisionHistoryDocument({ workpieceId: "w", historyPath: "exact", fetcher: (async () => createJsonResponse(200, { ok: true, data: { version: 1 }, file_row: {} })) as never });
  assert.equal(!invalid.ok && invalid.classification, "schema_invalid");
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

async function testSaveRevisionHistoryUsesRevisionEndpoint() {
  const calls: FetchCall[] = [];
  const fakeFetch = async (url: string, options: Record<string, unknown>) => {
    calls.push({ url, options });
    return createJsonResponse(200, { ok: true, data: { revision: { id: "rev-123" } } });
  };

  const document: HammerHistoryDocumentV1 = {
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
  };

  const result = await saveHammerRevisionHistoryDocument({
    workspaceId: "workspace-123",
    workpieceId: "workpiece-123",
    revisionId: "rev-123",
    document,
    fetcher: fakeFetch as never,
  });
  assert.equal(result.ok, true);

  const call = calls[0];
  assert(call, "expected fetch call");
  assert.equal(call.url.includes("/hammer/revisions/rev-123"), true);
  assert.equal((call.options.method as string) ?? "GET", "PUT");
  const payload = call.options.json as Record<string, unknown>;
  assert(payload, "expected json payload");
  assert.deepEqual(payload.history, { data: document });
}

async function run() {
  await testHistoryMissing404IsNonError();
  await testPresenceMissing404IsNonError();
  await testRevisionHistoryMissing404IsNonError();
  await testCanonicalRevisionHistoryEnvelopeInstallsFrozenControllerState();
  await testHistoryReadFailuresRemainClassified();
  await testSaveWritesPresenceSentinelBestEffort();
  await testSaveRevisionHistoryUsesRevisionEndpoint();
  // eslint-disable-next-line no-console
  console.log("Hammer history artifact API tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer history artifact API tests failed:", error);
  process.exit(1);
});
