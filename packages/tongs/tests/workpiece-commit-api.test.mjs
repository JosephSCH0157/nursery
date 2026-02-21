/* global Request */

import test from "node:test";
import assert from "node:assert/strict";
import { createTongsCommitApiHandlerWithService } from "../dist/workpiece-commit-api.js";

function mockService() {
  const calls = {
    createCradle: [],
    commitFile: [],
    appendEvent: [],
  };

  const service = {
    async createCradle(input) {
      calls.createCradle.push(input);
      return {
        cradle: {
          id: "11111111-1111-4111-8111-111111111111",
          workspace_id: input.workspace_id,
          status: input.status || "draft",
          manifest_path: "manifest.json",
          metadata: {},
          created_by: null,
          created_at: "2026-02-21T00:00:00.000Z",
          updated_at: "2026-02-21T00:00:00.000Z",
        },
        manifest_hash: "hash-manifest",
        manifest_bytes: 123,
        files_indexed: 3,
        event: {
          id: 1,
          workpiece_id: "11111111-1111-4111-8111-111111111111",
          event_name: "workpiece.created",
          payload: {},
          correlation_id: null,
          written_by_tool: "tongs",
          written_by_tool_version: "0.1.0",
          written_by_lane: "forge-managed",
          created_at: "2026-02-21T00:00:00.000Z",
        },
      };
    },
    async commitFile(workpieceId, input) {
      calls.commitFile.push({ workpieceId, input });
      return {
        workpiece_id: workpieceId,
        path: input.path,
        storage_key: `workpieces/${workpieceId}/${input.path}`,
        hash: "hash-file",
        bytes: 77,
        content_type: input.content_type || "application/json",
        manifest_hash: "hash-manifest-2",
        manifest_bytes: 456,
        file_row: {
          workpiece_id: workpieceId,
          path: input.path,
          file_type: "json",
          content_type: input.content_type || "application/json",
          bytes: 77,
          hash_algo: "sha256",
          hash_value: "hash-file",
          storage_bucket: "forge-workpieces",
          storage_key: `workpieces/${workpieceId}/${input.path}`,
          written_by_tool: input.written_by.tool,
          written_by_tool_version: input.written_by.tool_version,
          written_by_lane: input.written_by.lane,
          created_at: "2026-02-21T00:00:00.000Z",
          updated_at: "2026-02-21T00:00:00.000Z",
        },
        manifest_row: {
          workpiece_id: workpieceId,
          path: "manifest.json",
          file_type: "manifest",
          content_type: "application/json",
          bytes: 456,
          hash_algo: "sha256",
          hash_value: "hash-manifest-2",
          storage_bucket: "forge-workpieces",
          storage_key: `workpieces/${workpieceId}/manifest.json`,
          written_by_tool: input.written_by.tool,
          written_by_tool_version: input.written_by.tool_version,
          written_by_lane: input.written_by.lane,
          created_at: "2026-02-21T00:00:00.000Z",
          updated_at: "2026-02-21T00:00:00.000Z",
        },
        event: {
          id: 2,
          workpiece_id: workpieceId,
          event_name: input.event_name || "workpiece.file.committed",
          payload: {},
          correlation_id: null,
          written_by_tool: input.written_by.tool,
          written_by_tool_version: input.written_by.tool_version,
          written_by_lane: input.written_by.lane,
          created_at: "2026-02-21T00:00:00.000Z",
        },
      };
    },
    async appendEvent(workpieceId, input) {
      calls.appendEvent.push({ workpieceId, input });
      return {
        id: 3,
        workpiece_id: workpieceId,
        event_name: input.event_name,
        payload: input.payload || {},
        correlation_id: input.correlation_id || null,
        written_by_tool: input.written_by.tool,
        written_by_tool_version: input.written_by.tool_version,
        written_by_lane: input.written_by.lane,
        created_at: "2026-02-21T00:00:00.000Z",
      };
    },
  };

  return { service, calls };
}

test("token guard rejects missing bearer token", async () => {
  const { service } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service, "secret-token");

  const request = new Request("http://localhost/tongs/cradles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspace_id: "11111111-1111-4111-8111-111111111111" }),
  });

  const response = await handler(request);
  assert.equal(response.status, 401);
});

test("POST /tongs/cradles dispatches createCradle", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request("http://localhost/tongs/cradles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspace_id: "11111111-1111-4111-8111-111111111111" }),
  });

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(calls.createCradle.length, 1);
  assert.equal(calls.createCradle[0].workspace_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(body.ok, true);
});

test("POST /tongs/workpieces/:id/commit-file dispatches commitFile", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request("http://localhost/tongs/workpieces/11111111-1111-4111-8111-111111111111/commit-file", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      path: "script/script.md",
      content_type: "text/markdown; charset=utf-8",
      text: "Hello world",
      written_by: {
        tool: "anvil",
        tool_version: "1.8.5",
        lane: "forge-managed",
      },
    }),
  });

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.commitFile.length, 1);
  assert.equal(calls.commitFile[0].workpieceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.commitFile[0].input.path, "script/script.md");
  assert.equal(body.ok, true);
});

test("POST /tongs/workpieces/:id/append-event dispatches appendEvent", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request("http://localhost/tongs/workpieces/11111111-1111-4111-8111-111111111111/append-event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      event_name: "workpiece.note",
      payload: { message: "hello" },
      written_by: {
        tool: "nursery",
        tool_version: "0.0.0",
        lane: "forge-managed",
      },
    }),
  });

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(calls.appendEvent.length, 1);
  assert.equal(calls.appendEvent[0].input.event_name, "workpiece.note");
  assert.equal(body.ok, true);
});
