/* global Request */

import test from "node:test";
import assert from "node:assert/strict";
import { TongsCommitService, createTongsCommitApiHandlerWithService } from "../dist/workpiece-commit-api.js";

function mockService() {
  const calls = {
    createCradle: [],
    commitFile: [],
    generateEpisodeThumbnail: [],
    createRecordingSession: [],
    updateRecordingSession: [],
    listRecordingSessions: [],
    attachEpisodeToSession: [],
    detachEpisodeFromSession: [],
    listSessionEpisodes: [],
    listWorkspaceReadyScripts: [],
    appendEvent: [],
    readWorkpieceBinary: [],
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
    async generateEpisodeThumbnail(workpieceId, input) {
      calls.generateEpisodeThumbnail.push({ workpieceId, input });
      return {
        version: {
          id: "44444444-4444-4444-8444-444444444444",
          concept_id: input.concept_id ?? "concept-01",
          created_at: "2026-02-28T01:00:00.000Z",
          provider: "openai",
          prompt: input.prompt ?? "Prompt",
          provider_request_id: "req_provider_123",
          asset_id: "55555555-5555-4555-8555-555555555555",
          status: "ready",
          error: null,
        },
        asset: {
          id: "55555555-5555-4555-8555-555555555555",
          workspace_id: input.workspace_id,
          episode_id: workpieceId,
          path: "assets/thumbnails/111/222.png",
          storage_bucket: "forge-workpieces",
          storage_key: "workpieces/111/assets/thumbnails/111/222.png",
          mime_type: "image/png",
          bytes: 1234,
          provider: "openai",
          provider_request_id: "req_provider_123",
          request_id: "req_local_123",
        },
        updated_episode_package: {
          schema: "forge.episode.package.v2",
          seo: {
            titles: [],
            tags: [],
            description_short: null,
            description_long: null,
          },
          thumbnail: {
            concepts: [],
            versions: [],
            primary_version_id: "44444444-4444-4444-8444-444444444444",
          },
          image_map: {
            entries: [],
          },
        },
        primary_version_id: "44444444-4444-4444-8444-444444444444",
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
    async readWorkpieceBinary(workpieceId, path) {
      calls.readWorkpieceBinary.push({ workpieceId, path });
      return {
        found: true,
        bytes_base64: "AQID",
        content_type: "image/png",
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

test("POST /tongs/workpieces/:id/generate-thumbnail dispatches generateEpisodeThumbnail", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request("http://localhost/tongs/workpieces/11111111-1111-4111-8111-111111111111/generate-thumbnail", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forge-user-authorization": "Bearer user_token_abc",
    },
    body: JSON.stringify({
      workspace_id: "11111111-1111-4111-8111-111111111111",
      episode_id: "11111111-1111-4111-8111-111111111111",
      concept_id: "concept-01",
      confirm_spend: true,
    }),
  });

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.generateEpisodeThumbnail.length, 1);
  assert.equal(calls.generateEpisodeThumbnail[0].workpieceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.generateEpisodeThumbnail[0].input.concept_id, "concept-01");
  assert.equal(calls.generateEpisodeThumbnail[0].input.user_access_token, "user_token_abc");
  assert.equal(body.ok, true);
  assert.equal(body.data?.version?.status, "ready");
  assert.equal(typeof body.data?.asset?.storage_key, "string");
  assert.equal(body.data?.primary_version_id, "44444444-4444-4444-8444-444444444444");
});

test("GET /tongs/workpieces/:id/read-file?encoding=base64 dispatches readWorkpieceBinary", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workpieces/11111111-1111-4111-8111-111111111111/read-file?path=assets%2Fthumbnails%2F111%2F222.png&encoding=base64",
    { method: "GET" },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.readWorkpieceBinary.length, 1);
  assert.equal(calls.readWorkpieceBinary[0].workpieceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.readWorkpieceBinary[0].path, "assets/thumbnails/111/222.png");
  assert.equal(body.ok, true);
  assert.equal(body.data?.content_type, "image/png");
  assert.equal(body.data?.bytes_base64, "AQID");
});

test("TongsCommitService.generateEpisodeThumbnail writes asset + metadata version", async () => {
  const workspaceId = "11111111-1111-4111-8111-111111111111";
  const workpieceId = "22222222-2222-4222-8222-222222222222";
  const userId = "33333333-3333-4333-8333-333333333333";
  const providerCalls = [];
  const assetInsertCalls = [];
  const commitCalls = [];

  const imageProvider = {
    async generateImage(input) {
      providerCalls.push(input);
      return {
        bytesBase64: "AQID",
        mimeType: "image/png",
        provider: "openai",
        providerRequestId: "req_provider_abc",
        revisedPrompt: null,
        tokensUsed: 123,
      };
    },
  };

  const supabase = {
    schema(schemaName) {
      assert.equal(schemaName, "tongs");
      return {
        from(tableName) {
          assert.equal(tableName, "assets");
          return {
            insert(payload) {
              assetInsertCalls.push(payload);
              return {
                select() {
                  return {
                    async single() {
                      return {
                        data: {
                          ...payload,
                          created_at: "2026-02-28T02:00:00.000Z",
                          updated_at: "2026-02-28T02:00:00.000Z",
                        },
                        error: null,
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  const service = new TongsCommitService(supabase, "forge-workpieces", imageProvider);

  service.getWorkspaceOrThrow = async () => ({
    id: workspaceId,
    created_at: "2026-02-28T00:00:00.000Z",
    updated_at: "2026-02-28T00:00:00.000Z",
    storage_profile: null,
  });
  service.getCradleOrThrow = async () => ({
    id: workpieceId,
    workspace_id: workspaceId,
    label: "Episode",
    status: "draft",
    manifest_path: "manifest.json",
    metadata: {},
    created_by: null,
    created_at: "2026-02-28T00:00:00.000Z",
    updated_at: "2026-02-28T00:00:00.000Z",
  });
  service.resolveUserIdFromAccessToken = async () => userId;
  service.readWorkpieceJson = async () => ({
    found: true,
    data: {
      schema: "forge.metadata.v1",
      workpiece_id: workpieceId,
      workspace_id: workspaceId,
      created_at: "2026-02-28T00:00:00.000Z",
      updated_at: "2026-02-28T00:00:00.000Z",
      status: "draft",
      episode: {
        schema: "forge.episode.package.v2",
        seo: {
          titles: [],
          tags: [],
          description_short: null,
          description_long: null,
        },
        thumbnail: {
          concepts: [
            {
              id: "concept-01",
              label: "Concept 01",
              prompt_text: "Host in studio with neon glow",
              style_preset: null,
            },
          ],
          versions: [],
          primary_version_id: null,
        },
        image_map: {
          entries: [],
        },
      },
    },
  });
  service.commitFile = async (inputWorkpieceId, input) => {
    commitCalls.push({ inputWorkpieceId, input });
    return {
      workpiece_id: inputWorkpieceId,
      path: input.path,
      storage_key: `workpieces/${inputWorkpieceId}/${input.path}`,
      hash: "hash_abc",
      bytes: 3,
      content_type: input.content_type ?? "application/octet-stream",
      manifest_hash: "manifest_hash",
      manifest_bytes: 123,
      file_row: {
        workpiece_id: inputWorkpieceId,
        path: input.path,
        file_type: input.file_type ?? "json",
        content_type: input.content_type ?? "application/octet-stream",
        bytes: 3,
        hash_algo: "sha256",
        hash_value: "hash_abc",
        storage_bucket: "forge-workpieces",
        storage_key: `workpieces/${inputWorkpieceId}/${input.path}`,
        written_by_tool: input.written_by.tool,
        written_by_tool_version: input.written_by.tool_version,
        written_by_lane: input.written_by.lane,
        created_at: "2026-02-28T02:00:00.000Z",
        updated_at: "2026-02-28T02:00:00.000Z",
      },
      manifest_row: {
        workpiece_id: inputWorkpieceId,
        path: "manifest.json",
        file_type: "manifest",
        content_type: "application/json",
        bytes: 120,
        hash_algo: "sha256",
        hash_value: "manifest_hash",
        storage_bucket: "forge-workpieces",
        storage_key: `workpieces/${inputWorkpieceId}/manifest.json`,
        written_by_tool: input.written_by.tool,
        written_by_tool_version: input.written_by.tool_version,
        written_by_lane: input.written_by.lane,
        created_at: "2026-02-28T02:00:00.000Z",
        updated_at: "2026-02-28T02:00:00.000Z",
      },
      event: {
        id: 99,
        workpiece_id: inputWorkpieceId,
        event_name: input.event_name ?? "workpiece.file.committed",
        payload: {},
        correlation_id: null,
        written_by_tool: input.written_by.tool,
        written_by_tool_version: input.written_by.tool_version,
        written_by_lane: input.written_by.lane,
        created_at: "2026-02-28T02:00:00.000Z",
      },
    };
  };
  service.applyAiTokenDelta = async () => ({
    tokenBalance: 777,
  });

  const result = await service.generateEpisodeThumbnail(workpieceId, {
    workspace_id: workspaceId,
    episode_id: workpieceId,
    concept_id: "concept-01",
    confirm_spend: true,
    lane: "forge",
    user_access_token: "token_abc",
  });

  assert.equal(providerCalls.length, 1);
  assert.equal(providerCalls[0].aspect, "16:9");
  assert.match(providerCalls[0].prompt, /Host in studio with neon glow/);
  assert.equal(assetInsertCalls.length, 1);
  assert.equal(assetInsertCalls[0].workspace_id, workspaceId);
  assert.equal(assetInsertCalls[0].workpiece_id, workpieceId);
  assert.equal(assetInsertCalls[0].bytes, 3);
  assert.equal(commitCalls.length, 2);
  assert.equal(commitCalls[0].input.path.startsWith("assets/thumbnails/"), true);
  assert.equal(commitCalls[1].input.path, "metadata.json");
  assert.equal(commitCalls[1].input.json.episode.thumbnail.versions.length, 1);
  assert.equal(commitCalls[1].input.json.episode.thumbnail.primary_version_id, result.version.id);
  assert.equal(result.version.status, "ready");
  assert.equal(result.primary_version_id, result.version.id);
  assert.equal(result.asset.storage_bucket, "forge-workpieces");
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
