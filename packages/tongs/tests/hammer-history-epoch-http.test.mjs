/* global Request */

import test from "node:test";
import assert from "node:assert/strict";
import { createTongsCommitApiHandlerWithService } from "../dist/workpiece-commit-api.js";

const ids = {
  workspace: "11111111-1111-4111-8111-111111111111",
  workpiece: "22222222-2222-4222-8222-222222222222",
  recording: "33333333-3333-4333-8333-333333333333",
  revision: "44444444-4444-4444-8444-444444444444",
  epoch: "55555555-5555-4555-8555-555555555555",
  user: "66666666-6666-4666-8666-666666666666",
};
const predecessorHash = "a".repeat(64);
const baseUrl = `https://tongs.test/tongs/workspaces/${ids.workspace}/workpieces/${ids.workpiece}/hammer/revisions/${ids.revision}/history-epochs`;
const body = {
  canonical_recording_id: ids.recording,
  idempotency_key: "history-epoch-operation-0001",
  expected_revision_updated_at: "2026-08-19T13:00:00.123456Z",
  expected_history_path: `hammer/revisions/${ids.revision}/history.v1.json`,
  expected_predecessor: { revision: 7, updated_at: "2026-08-19T12:59:59.654321Z", sha256: predecessorHash, bytes: 208379 },
  epoch_path: `hammer/revisions/${ids.revision}/history/epochs/${ids.epoch}.v1.json`,
  envelope: {
    schema: "forge.hammer-history-epoch", schema_version: 1, epoch_id: ids.epoch,
    workspace_id: ids.workspace, workpiece_id: ids.workpiece, canonical_recording_id: ids.recording, recording_revision_id: ids.revision,
    base: { editor_state_hash: "hammer-state:1234abcd", component_sha256: { audio: "1".repeat(64), editorial_authority: "2".repeat(64), transcript: "3".repeat(64), visual_placements: "4".repeat(64), visual_timeline: "5".repeat(64) } },
    creation: { reason: "legacy_history_unrecoverable", created_at: "2026-08-19T13:01:00.123456Z", initiating_user_id: ids.user },
    predecessor: { original_path: `hammer/revisions/${ids.revision}/history.v1.json`, archive_path: `hammer/revisions/${ids.revision}/history/archive/${predecessorHash}.history.v1.json`, sha256: predecessorHash, bytes: 208379, registry_revision: 7, registry_updated_at: "2026-08-19T12:59:59.654321Z" },
    history: { entries: [], undo_stack: [], redo_stack: [], checkpoints: [] },
    boundary: { prior_history_status: "unavailable", merged: false, traversable: false, statement: "Prior undo history is unavailable and was not merged into this epoch." },
  },
};

function serviceWithAuthorization() {
  const calls = [];
  return {
    calls,
    async startHammerHistoryEpoch(workspaceId, workpieceId, revisionId, input, options) {
      calls.push({ kind: "start", workspaceId, workpieceId, revisionId, input, token: options.userAccessToken });
      if (options.userAccessToken === "viewer" || options.userAccessToken === "foreign-editor") {
        const denied = new Error(options.userAccessToken === "viewer" ? "Editor role required." : "Cross-workspace access denied.");
        denied.status = 403;
        denied.code = "workspace_role_forbidden";
        throw denied;
      }
      return { outcome: "committed", epoch_id: ids.epoch, transition_id: "77777777-7777-4777-8777-777777777777", history_path: body.epoch_path, revision_updated_at: "2026-08-19T13:02:00.000001Z", operation_fingerprint: "b".repeat(64) };
    },
    async readHammerHistoryEpochOperation(workspaceId, workpieceId, revisionId, idempotencyKey, options) {
      calls.push({ kind: "read", workspaceId, workpieceId, revisionId, idempotencyKey, token: options.userAccessToken });
      return idempotencyKey === body.idempotency_key
        ? { outcome: "committed", epoch_id: ids.epoch, transition_id: "77777777-7777-4777-8777-777777777777", history_path: body.epoch_path, revision_updated_at: "2026-08-19T13:02:00.000001Z", operation_fingerprint: "b".repeat(64) }
        : { outcome: "absent" };
    },
  };
}

function post(token) {
  return new Request(baseUrl, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-forge-user-token": token } : {}) }, body: JSON.stringify(body) });
}

test("authenticated editor transport preserves exact microsecond tokens", async () => {
  const service = serviceWithAuthorization();
  const response = await createTongsCommitApiHandlerWithService(service)(post("editor"));
  assert.equal(response.status, 200);
  assert.equal(service.calls[0].input.expected_revision_updated_at, "2026-08-19T13:00:00.123456Z");
  assert.equal(service.calls[0].input.expected_predecessor.updated_at, "2026-08-19T12:59:59.654321Z");
});

test("anonymous, viewer, and cross-workspace mutation requests are denied", async () => {
  for (const [token, status] of [[null, 401], ["viewer", 403], ["foreign-editor", 403]]) {
    const response = await createTongsCommitApiHandlerWithService(serviceWithAuthorization())(post(token));
    assert.equal(response.status, status);
  }
});

test("authenticated status transport returns committed and absent operations", async () => {
  const service = serviceWithAuthorization();
  const handler = createTongsCommitApiHandlerWithService(service);
  for (const [key, outcome] of [[body.idempotency_key, "committed"], ["history-epoch-operation-absent", "absent"]]) {
    const response = await handler(new Request(`${baseUrl}/operations/${key}`, { headers: { "x-forge-user-token": "viewer" } }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.outcome, outcome);
  }
});

test("history epoch transport rejects extra fields before dispatch", async () => {
  const service = serviceWithAuthorization();
  const response = await createTongsCommitApiHandlerWithService(service)(new Request(baseUrl, {
    method: "POST", headers: { "content-type": "application/json", "x-forge-user-token": "editor" }, body: JSON.stringify({ ...body, unexpected: true }),
  }));
  assert.equal(response.status, 400);
  assert.equal(service.calls.length, 0);
});
