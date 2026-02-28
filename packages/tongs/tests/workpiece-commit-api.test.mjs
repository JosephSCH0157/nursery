/* global Request */

import test from "node:test";
import assert from "node:assert/strict";
import { createTongsCommitApiHandlerWithService } from "../dist/workpiece-commit-api.js";

function mockService() {
  const calls = {
    createCradle: [],
    commitFile: [],
    createRecordingSession: [],
    updateRecordingSession: [],
    listRecordingSessions: [],
    attachEpisodeToSession: [],
    detachEpisodeFromSession: [],
    listSessionEpisodes: [],
    listWorkspaceReadyScripts: [],
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
    async createRecordingSession(workspaceId, input) {
      calls.createRecordingSession.push({ workspaceId, input });
      return {
        id: "22222222-2222-4222-8222-222222222222",
        workspace_id: workspaceId,
        title: input.title,
        starts_at: input.starts_at,
        ends_at: input.ends_at ?? null,
        status: "planned",
        created_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        created_at: "2026-02-28T00:00:00.000Z",
        updated_at: "2026-02-28T00:00:00.000Z",
      };
    },
    async updateRecordingSession(sessionId, patch) {
      calls.updateRecordingSession.push({ sessionId, patch });
      return {
        id: sessionId,
        workspace_id: "11111111-1111-4111-8111-111111111111",
        title: patch.title ?? "Session",
        starts_at: patch.starts_at ?? "2026-03-01T10:00:00.000Z",
        ends_at: Object.prototype.hasOwnProperty.call(patch, "ends_at")
          ? patch.ends_at
          : "2026-03-01T11:00:00.000Z",
        status: patch.status ?? "planned",
        created_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        created_at: "2026-02-28T00:00:00.000Z",
        updated_at: "2026-02-28T00:10:00.000Z",
      };
    },
    async listRecordingSessions(workspaceId, range) {
      calls.listRecordingSessions.push({ workspaceId, range: range ?? null });
      return [
        {
          id: "22222222-2222-4222-8222-222222222222",
          workspace_id: workspaceId,
          title: "Session A",
          starts_at: "2026-03-01T10:00:00.000Z",
          ends_at: null,
          status: "planned",
          created_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          created_at: "2026-02-28T00:00:00.000Z",
          updated_at: "2026-02-28T00:00:00.000Z",
        },
      ];
    },
    async attachEpisodeToSession(sessionId, input) {
      calls.attachEpisodeToSession.push({ sessionId, input });
      return {
        recording_session_id: sessionId,
        episode_id: input.episode_id,
        position: input.position ?? 0,
        notes: input.notes ?? null,
        created_at: "2026-02-28T00:00:00.000Z",
        updated_at: "2026-02-28T00:00:00.000Z",
      };
    },
    async detachEpisodeFromSession(sessionId, episodeId) {
      calls.detachEpisodeFromSession.push({ sessionId, episodeId });
    },
    async listSessionEpisodes(sessionId) {
      calls.listSessionEpisodes.push({ sessionId });
      return [
        {
          recording_session_id: sessionId,
          episode_id: "33333333-3333-4333-8333-333333333333",
          position: 0,
          notes: null,
          created_at: "2026-02-28T00:00:00.000Z",
          updated_at: "2026-02-28T00:00:00.000Z",
          episode: {
            id: "33333333-3333-4333-8333-333333333333",
            workspace_id: "11111111-1111-4111-8111-111111111111",
            label: "Episode 3",
            created_at: "2026-02-20T00:00:00.000Z",
            updated_at: "2026-02-21T00:00:00.000Z",
          },
        },
      ];
    },
    async listWorkspaceReadyScripts(workspaceId, options) {
      calls.listWorkspaceReadyScripts.push({ workspaceId, options: options ?? null });
      return [
        {
          workspace_id: workspaceId,
          workpiece_id: "11111111-1111-4111-8111-111111111111",
          path: "script/script.md",
          primary_script_path: "script/script.md",
          script_paths: ["script/script.md", "scripts/script.anvil.txt"],
          title: "Episode 1",
          updated_at: "2026-02-21T00:00:00.000Z",
          content_category: "evergreen",
        },
      ];
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

test("POST /tongs/workspaces/:id/recording-sessions dispatches createRecordingSession", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workspaces/11111111-1111-4111-8111-111111111111/recording-sessions",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Session One",
        starts_at: "2026-03-01T10:00:00.000Z",
      }),
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(calls.createRecordingSession.length, 1);
  assert.equal(calls.createRecordingSession[0].workspaceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.createRecordingSession[0].input.title, "Session One");
  assert.equal(body.ok, true);
});

test("GET /tongs/workspaces/:id/recording-sessions dispatches listRecordingSessions", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workspaces/11111111-1111-4111-8111-111111111111/recording-sessions?starts_at=2026-03-01T00:00:00.000Z&limit=20",
    { method: "GET" },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.listRecordingSessions.length, 1);
  assert.equal(calls.listRecordingSessions[0].workspaceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.listRecordingSessions[0].range.starts_at, "2026-03-01T00:00:00.000Z");
  assert.equal(calls.listRecordingSessions[0].range.limit, 20);
  assert.equal(body.ok, true);
  assert.equal(Array.isArray(body.data?.sessions), true);
});

test("PATCH /tongs/recording-sessions/:id dispatches updateRecordingSession", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/recording-sessions/22222222-2222-4222-8222-222222222222",
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "active",
      }),
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.updateRecordingSession.length, 1);
  assert.equal(calls.updateRecordingSession[0].sessionId, "22222222-2222-4222-8222-222222222222");
  assert.equal(calls.updateRecordingSession[0].patch.status, "active");
  assert.equal(body.ok, true);
});

test("POST /tongs/recording-sessions/:id/episodes dispatches attachEpisodeToSession", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/recording-sessions/22222222-2222-4222-8222-222222222222/episodes",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        episode_id: "33333333-3333-4333-8333-333333333333",
        position: 1,
      }),
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(calls.attachEpisodeToSession.length, 1);
  assert.equal(calls.attachEpisodeToSession[0].sessionId, "22222222-2222-4222-8222-222222222222");
  assert.equal(calls.attachEpisodeToSession[0].input.episode_id, "33333333-3333-4333-8333-333333333333");
  assert.equal(body.ok, true);
});

test("GET /tongs/recording-sessions/:id/episodes dispatches listSessionEpisodes", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/recording-sessions/22222222-2222-4222-8222-222222222222/episodes",
    { method: "GET" },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.listSessionEpisodes.length, 1);
  assert.equal(calls.listSessionEpisodes[0].sessionId, "22222222-2222-4222-8222-222222222222");
  assert.equal(body.ok, true);
  assert.equal(Array.isArray(body.data?.episodes), true);
});

test("DELETE /tongs/recording-sessions/:id/episodes/:episodeId dispatches detachEpisodeFromSession", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/recording-sessions/22222222-2222-4222-8222-222222222222/episodes/33333333-3333-4333-8333-333333333333",
    { method: "DELETE" },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.detachEpisodeFromSession.length, 1);
  assert.equal(calls.detachEpisodeFromSession[0].sessionId, "22222222-2222-4222-8222-222222222222");
  assert.equal(calls.detachEpisodeFromSession[0].episodeId, "33333333-3333-4333-8333-333333333333");
  assert.equal(body.ok, true);
});

test("GET /tongs/workspaces/:id/ready-scripts dispatches listWorkspaceReadyScripts", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workspaces/11111111-1111-4111-8111-111111111111/ready-scripts",
    { method: "GET" },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.listWorkspaceReadyScripts.length, 1);
  assert.equal(calls.listWorkspaceReadyScripts[0]?.workspaceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.listWorkspaceReadyScripts[0]?.options?.unrecordedOnly, false);
  assert.equal(body.ok, true);
  assert.equal(Array.isArray(body.data?.scripts), true);
  assert.equal(body.data.scripts.length, 1);
  assert.equal(body.data.scripts[0]?.content_category, "evergreen");
  assert.equal(body.data.scripts[0]?.primary_script_path, "script/script.md");
  assert.equal(Array.isArray(body.data.scripts[0]?.script_paths), true);
});

test("GET /tongs/workspaces/:id/ready-scripts?unrecorded=1 enables unrecorded filter", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workspaces/11111111-1111-4111-8111-111111111111/ready-scripts?unrecorded=1",
    { method: "GET" },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.listWorkspaceReadyScripts.length, 1);
  assert.equal(calls.listWorkspaceReadyScripts[0]?.workspaceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.listWorkspaceReadyScripts[0]?.options?.unrecordedOnly, true);
  assert.equal(body.ok, true);
});
