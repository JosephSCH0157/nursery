/* global Request */

import test from "node:test";
import assert from "node:assert/strict";
import { TextEncoder } from "node:util";
import { TongsCommitService, createTongsCommitApiHandlerWithService } from "../dist/workpiece-commit-api.js";

function mockService() {
  const calls = {
    createCradle: [],
    commitFile: [],
    generateEpisodeThumbnail: [],
    generateImageMapCandidates: [],
    createRecordingSessionRecord: [],
    listRecordingSessionsForPlanner: [],
    getRecordingSessionRecord: [],
    replaceRecordingSessionItems: [],
    createRecordingSession: [],
    updateRecordingSession: [],
    listRecordingSessions: [],
    attachEpisodeToSession: [],
    detachEpisodeFromSession: [],
    listSessionEpisodes: [],
    listWorkspaceSparks: [],
    listWorkspaceEpisodes: [],
    listWorkspaceStorage: [],
    listWorkpieceStorage: [],
    listWorkspaceCanonicalRecordings: [],
    archiveWorkpiece: [],
    restoreWorkpiece: [],
    listWorkspaceReadyScripts: [],
    getWorkpieceVisualPackage: [],
    getWorkpieceImageMap: [],
    saveWorkpieceImageMap: [],
    updateWorkspaceReadyQueueState: [],
    deleteReadyScript: [],
    readHammerWorkpieceState: [],
    saveHammerWorkpieceState: [],
    listHammerWorkpiecePresence: [],
    upsertHammerWorkpiecePresence: [],
    getWorkpieceRecordingTruth: [],
    appendEvent: [],
    readWorkpieceBinary: [],
    readWorkpieceText: [],
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
    async generateImageMapCandidates(workpieceId, input, options) {
      calls.generateImageMapCandidates.push({ workpieceId, input, options: options ?? null });
      return {
        image_map: {
          workpiece_id: workpieceId,
          workspace_id: input.workspace_id,
          entries: [
            {
              id: input.image_map_entry_id,
              anchor: "s1:p1#sent1",
              script_anchor: {
                section_id: "s1",
                paragraph_id: "s1:p1",
                paragraph_order: 1,
                sentence_start: 1,
                sentence_end: 1,
                char_start: 0,
                char_end: 27,
                span_text: "Jackson faced overwhelming odds.",
                speaker_block_id: null,
              },
              description: "Jackson faced overwhelming odds.",
              visual_intent: "Strategic troop comparison",
              prompt_basis: "Strategic troop comparison near New Orleans",
              intent: "broll",
              source_type: "ai",
              beat_order: 1,
              paragraph_beat_order: 1,
              candidate_assets: [
                {
                  asset_id: "candidate-01",
                  path: `assets/image-map/candidates/${workpieceId}/${input.image_map_entry_id}/explainer.png`,
                  variant_label: "explainer",
                  visual_mode: "comparison",
                  mime_type: "image/png",
                },
                {
                  asset_id: "candidate-02",
                  path: `assets/image-map/candidates/${workpieceId}/${input.image_map_entry_id}/illustrative.png`,
                  variant_label: "illustrative",
                  visual_mode: "comparison",
                  mime_type: "image/png",
                },
              ],
              selected_asset_id: null,
              status: "candidates_generated",
              placement_hint: null,
            },
          ],
          metadata_updated_at: "2026-03-11T19:05:00.000Z",
        },
        asset: {
          id: "77777777-7777-4777-8777-777777777777",
          asset_kind: "image_map_json",
          status: "ready",
          path: "assets/image-map/image-map.v1.json",
          storage_bucket: "forge-workpieces",
          storage_key: `workpieces/${workpieceId}/assets/image-map/image-map.v1.json`,
          metadata_json: {
            schema: "forge.image-map.v1",
            entry_count: 1,
          },
          created_at: "2026-03-11T19:05:00.000Z",
          updated_at: "2026-03-11T19:05:00.000Z",
          supersedes_asset_id: null,
        },
        generated_assets: [
          {
            id: "candidate-01",
            workspace_id: input.workspace_id,
            episode_id: workpieceId,
            image_map_entry_id: input.image_map_entry_id,
            path: `assets/image-map/candidates/${workpieceId}/${input.image_map_entry_id}/explainer.png`,
            storage_bucket: "forge-workpieces",
            storage_key: `workpieces/${workpieceId}/assets/image-map/candidates/${workpieceId}/${input.image_map_entry_id}/explainer.png`,
            mime_type: "image/png",
            bytes: 1234,
            provider: "openai",
            provider_request_id: "req_provider_01",
            request_id: "req_local_01",
            variant_label: "explainer",
            visual_mode: "comparison",
            prompt: "Prompt explainer",
            status: "ready",
          },
          {
            id: "candidate-02",
            workspace_id: input.workspace_id,
            episode_id: workpieceId,
            image_map_entry_id: input.image_map_entry_id,
            path: `assets/image-map/candidates/${workpieceId}/${input.image_map_entry_id}/illustrative.png`,
            storage_bucket: "forge-workpieces",
            storage_key: `workpieces/${workpieceId}/assets/image-map/candidates/${workpieceId}/${input.image_map_entry_id}/illustrative.png`,
            mime_type: "image/png",
            bytes: 1266,
            provider: "openai",
            provider_request_id: "req_provider_02",
            request_id: "req_local_02",
            variant_label: "illustrative",
            visual_mode: "comparison",
            prompt: "Prompt illustrative",
            status: "ready",
          },
        ],
        credits_warning: null,
        token_balance: 777,
      };
    },
    async createRecordingSessionRecord(input) {
      calls.createRecordingSessionRecord.push({ input });
      return {
        id: "22222222-2222-4222-8222-222222222222",
        workspace_id: input.workspace_id,
        title: input.title ?? "Recording Session",
        calendar_event_id: input.calendar_event_id ?? null,
        starts_at: "2026-03-01T10:00:00.000Z",
        ends_at: null,
        status: "planned",
        created_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        created_at: "2026-02-28T00:00:00.000Z",
        updated_at: "2026-02-28T00:00:00.000Z",
      };
    },
    async listRecordingSessionsForPlanner(options) {
      calls.listRecordingSessionsForPlanner.push({ options: options ?? null });
      return [
        {
          id: "22222222-2222-4222-8222-222222222222",
          workspace_id: options?.workspace_id ?? "11111111-1111-4111-8111-111111111111",
          title: "Session A",
          calendar_event_id: null,
          starts_at: "2026-03-01T10:00:00.000Z",
          ends_at: null,
          status: "planned",
          created_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          created_at: "2026-02-28T00:00:00.000Z",
          updated_at: "2026-02-28T00:00:00.000Z",
        },
      ];
    },
    async getRecordingSessionRecord(sessionId) {
      calls.getRecordingSessionRecord.push({ sessionId });
      return {
        id: sessionId,
        workspace_id: "11111111-1111-4111-8111-111111111111",
        title: "Session A",
        calendar_event_id: null,
        items: [
          {
            position: 1,
            episode_id: "33333333-3333-4333-8333-333333333333",
            script_path: "script/script.md",
          },
        ],
      };
    },
    async replaceRecordingSessionItems(sessionId, input) {
      calls.replaceRecordingSessionItems.push({ sessionId, input });
      return input.items.map((item, index) => ({
        position: index + 1,
        episode_id: item.episode_id,
        script_path: item.script_path,
      }));
    },
    async createRecordingSession(workspaceId, input) {
      calls.createRecordingSession.push({ workspaceId, input });
      return {
        id: "22222222-2222-4222-8222-222222222222",
        workspace_id: workspaceId,
        title: input.title,
        calendar_event_id: input.calendar_event_id ?? null,
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
        calendar_event_id: null,
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
          calendar_event_id: null,
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
    async listWorkspaceSparks(workspaceId, options) {
      calls.listWorkspaceSparks.push({ workspaceId, options: options ?? null });
      return [
        {
          id: "77777777-7777-4777-8777-777777777777",
          workspace_id: workspaceId,
          assignment_id: "88888888-8888-4888-8888-888888888888",
          title: "Spark 1",
          body: "Spark body",
          tags: ["community"],
          status: "forged",
          created_at: "2026-03-10T10:00:00.000Z",
          updated_at: "2026-03-10T11:00:00.000Z",
          linked_workpiece_id: "99999999-9999-4999-8999-999999999999",
        },
      ];
    },
    async listWorkspaceEpisodes(workspaceId, options) {
      calls.listWorkspaceEpisodes.push({ workspaceId, options: options ?? null });
      return [
        {
          id: "11111111-1111-4111-8111-111111111111",
          workspace_id: workspaceId,
          label: "Episode 1",
          created_at: "2026-02-20T00:00:00.000Z",
          updated_at: "2026-02-21T00:00:00.000Z",
          archived_at: null,
          archived_by: null,
          archive_reason: null,
        },
      ];
    },
    async listWorkspaceStorage(workspaceId, role, options) {
      calls.listWorkspaceStorage.push({ workspaceId, role, options: options ?? null });
      return {
        source: {
          kind: "cloud_canonical",
          bucket: "forge-workpieces",
          workspace_id: workspaceId,
          role,
          prefix: options?.prefix ?? null,
          root_path: options?.prefix ? `${role}/${options.prefix}` : role,
        },
        nodes: [
          {
            name: "session-01",
            kind: "directory",
            path: `${role}/session-01`,
            children: [
              {
                name: "take.wav",
                kind: "file",
                path: `${role}/session-01/take.wav`,
                bytes: 4096,
                updated_at: "2026-03-18T10:00:00.000Z",
              },
            ],
          },
        ],
      };
    },
    async listWorkpieceStorage(workpieceId, options) {
      calls.listWorkpieceStorage.push({ workpieceId, options: options ?? null });
      return {
        source: {
          kind: "cloud_workpiece",
          bucket: "forge-workpieces",
          workspace_id: "11111111-1111-4111-8111-111111111111",
          workpiece_id: workpieceId,
          prefix: options?.prefix ?? null,
          root_path: options?.prefix
            ? `workpieces/${workpieceId}/${options.prefix}`
            : `workpieces/${workpieceId}`,
        },
        nodes: [
          {
            name: "script",
            kind: "directory",
            path: `workpieces/${workpieceId}/script`,
            children: [
              {
                name: "script.md",
                kind: "file",
                path: `workpieces/${workpieceId}/script/script.md`,
                bytes: 2048,
                updated_at: "2026-03-18T10:00:00.000Z",
              },
            ],
          },
          {
            name: "manifest.json",
            kind: "file",
            path: `workpieces/${workpieceId}/manifest.json`,
            bytes: 512,
            updated_at: "2026-03-18T09:00:00.000Z",
          },
        ],
      };
    },
    async listWorkspaceCanonicalRecordings(workspaceId, options) {
      calls.listWorkspaceCanonicalRecordings.push({ workspaceId, options: options ?? null });
      return {
        source: {
          kind: "cloud_workpiece_recordings",
          bucket: "forge-workpieces",
          workspace_id: workspaceId,
          root_path: "workpieces/{workpiece_id}/recordings",
        },
        nodes: [
          {
            name: "Episode 1",
            kind: "directory",
            path: "workpieces/11111111-1111-4111-8111-111111111111",
            note: "11111111-1111-4111-8111-111111111111",
            children: [
              {
                name: "recordings",
                kind: "directory",
                path: "workpieces/11111111-1111-4111-8111-111111111111/recordings",
                children: [
                  {
                    name: "episode-kept.webm",
                    kind: "file",
                    path: "workpieces/11111111-1111-4111-8111-111111111111/recordings/episode-kept.webm",
                    bytes: 2048,
                    updated_at: "2026-03-17T12:00:00.000Z",
                  },
                ],
              },
            ],
          },
        ],
      };
    },
    async archiveWorkpiece(workpieceId, input, options) {
      calls.archiveWorkpiece.push({ workpieceId, input, options: options ?? null });
      return {
        id: workpieceId,
        workspace_id: input.workspace_id,
        label: "Episode 1",
        created_at: "2026-02-20T00:00:00.000Z",
        updated_at: "2026-02-21T00:00:00.000Z",
        archived_at: "2026-03-11T14:00:00.000Z",
        archived_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        archive_reason: input.reason ?? null,
      };
    },
    async restoreWorkpiece(workpieceId, input, options) {
      calls.restoreWorkpiece.push({ workpieceId, input, options: options ?? null });
      return {
        id: workpieceId,
        workspace_id: input.workspace_id,
        label: "Episode 1",
        created_at: "2026-02-20T00:00:00.000Z",
        updated_at: "2026-02-21T00:00:00.000Z",
        archived_at: null,
        archived_by: null,
        archive_reason: null,
      };
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
          marked_ready_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          marked_ready_at: "2026-02-21T00:00:00.000Z",
          queue_rank: 0,
          hidden_at: null,
          hidden_by: null,
        },
      ];
    },
    async getWorkpieceVisualPackage(workpieceId, options) {
      calls.getWorkpieceVisualPackage.push({ workpieceId, options: options ?? null });
      return {
        workspace_id: "11111111-1111-4111-8111-111111111111",
        workpiece_id: workpieceId,
        script_path: "script/script.md",
        script_updated_at: "2026-03-10T14:59:00.000Z",
        image_map_updated_at: "2026-03-10T15:00:00.000Z",
        image_map_asset_updated_at: "2026-03-10T15:05:00.000Z",
        visuals: [
          {
            entry_id: "image-map-01",
            beat_order: 1,
            paragraph_beat_order: 1,
            status: "selected",
            script_anchor: {
              section_id: "s1",
              paragraph_id: "s1:p1",
              paragraph_order: 1,
              sentence_start: 1,
              sentence_end: 1,
              char_start: 0,
              char_end: 27,
              span_text: "Jackson faced overwhelming odds.",
              speaker_block_id: null,
            },
            visual_mode: "comparison",
            selected_asset_id: "candidate-01",
            selected_asset: {
              asset_id: "candidate-01",
              path: `assets/image-map/candidates/${workpieceId}/image-map-01/explainer.png`,
              storage_bucket: "forge-workpieces",
              storage_key: `workpieces/${workpieceId}/assets/image-map/candidates/${workpieceId}/image-map-01/explainer.png`,
              mime_type: "image/png",
              bytes: 1234,
              created_at: "2026-03-10T15:01:00.000Z",
              updated_at: "2026-03-10T15:01:00.000Z",
              variant_label: "explainer",
              visual_mode: "comparison",
            },
          },
        ],
      };
    },
    async getWorkpieceImageMap(workpieceId, options) {
      calls.getWorkpieceImageMap.push({ workpieceId, options: options ?? null });
      return {
        image_map: {
          workpiece_id: workpieceId,
          workspace_id: "11111111-1111-4111-8111-111111111111",
          entries: [
            {
              id: "image-map-01",
              anchor: "s1:para1",
              description: "city skyline",
              intent: "broll",
              source_type: "stock",
              placement_hint: null,
            },
          ],
          metadata_updated_at: "2026-03-10T15:00:00.000Z",
        },
        asset: {
          id: "66666666-6666-4666-8666-666666666666",
          asset_kind: "image_map_json",
          status: "ready",
          path: "assets/image-map/image-map.v1.json",
          storage_bucket: "forge-workpieces",
          storage_key: `workpieces/${workpieceId}/assets/image-map/image-map.v1.json`,
          metadata_json: {
            schema: "forge.image-map.v1",
            entry_count: 1,
          },
          created_at: "2026-03-10T15:00:00.000Z",
          updated_at: "2026-03-10T15:00:00.000Z",
          supersedes_asset_id: null,
        },
      };
    },
    async saveWorkpieceImageMap(workpieceId, input, options) {
      calls.saveWorkpieceImageMap.push({ workpieceId, input, options: options ?? null });
      return {
        image_map: {
          workpiece_id: workpieceId,
          workspace_id: input.workspace_id,
          entries: input.entries,
          metadata_updated_at: "2026-03-10T15:05:00.000Z",
        },
        asset: {
          id: "77777777-7777-4777-8777-777777777777",
          asset_kind: "image_map_json",
          status: "ready",
          path: "assets/image-map/image-map.v1.json",
          storage_bucket: "forge-workpieces",
          storage_key: `workpieces/${workpieceId}/assets/image-map/image-map.v1.json`,
          metadata_json: {
            schema: "forge.image-map.v1",
            entry_count: input.entries.length,
          },
          created_at: "2026-03-10T15:05:00.000Z",
          updated_at: "2026-03-10T15:05:00.000Z",
          supersedes_asset_id: "66666666-6666-4666-8666-666666666666",
        },
      };
    },
    async updateWorkspaceReadyQueueState(workspaceId, input, options) {
      calls.updateWorkspaceReadyQueueState.push({ workspaceId, input, options: options ?? null });
      return {
        updated_count: input.entries.length,
        deleted_count: 0,
      };
    },
    async deleteReadyScript(workpieceId, path, options) {
      calls.deleteReadyScript.push({ workpieceId, path, options: options ?? null });
      return {
        deleted: true,
        already_deleted: false,
        workpiece_id: workpieceId,
        path,
        removed_session_item_count: 0,
        ready_meta_deleted: true,
        warnings: [],
      };
    },
    async readHammerWorkpieceState(workspaceId, workpieceId, options) {
      calls.readHammerWorkpieceState.push({ workspaceId, workpieceId, options: options ?? null });
      return {
        schema_version: 1,
        state: {
          workspace_id: workspaceId,
          workpiece_id: workpieceId,
          active_session_id: "session_hammer_01",
          editor_session_path: "hammer/session/editor-state.v1.json",
          transcript_artifact_path: "hammer/transcript/structured.v1.json",
          speaker_map_artifact_path: "hammer/transcript/speaker-map.v1.json",
          visual_placement_artifact_path: "hammer/prep/visual-placements.v1.json",
          audio_polish_artifact_path: "hammer/prep/audio-polish.v1.json",
          edit_plan_artifact_path: "hammer/edit-plan/current.v1.json",
          edit_plan_signature: "sig_123",
          prep_status: "prepared",
          alignment_status: "aligned",
          macro_recipe_ref: "macro_podcast_cleanup",
          last_macro_run_ref: "macro_run_01",
          last_opened_at: "2026-03-13T12:00:00.000Z",
          updated_at: "2026-03-13T12:00:05.000Z",
          updated_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        },
        editor_session: {
          path: "hammer/session/editor-state.v1.json",
          file_updated_at: "2026-03-13T12:00:01.000Z",
          data: { session_id: "session_hammer_01" },
        },
        structured_transcript: {
          path: "hammer/transcript/structured.v1.json",
          file_updated_at: "2026-03-13T12:00:02.000Z",
          data: { transcript_id: "transcript_01", segments: [] },
        },
        speaker_map: {
          path: "hammer/transcript/speaker-map.v1.json",
          file_updated_at: "2026-03-13T12:00:03.000Z",
          data: { mappings: [] },
        },
        visual_placements: {
          path: "hammer/prep/visual-placements.v1.json",
          file_updated_at: "2026-03-13T12:00:04.000Z",
          data: { placements: [] },
        },
        audio_polish: {
          path: "hammer/prep/audio-polish.v1.json",
          file_updated_at: "2026-03-13T12:00:04.000Z",
          data: {
            prepared_passes: [],
            audio_edit: {
              version: "v1",
              operations: [
                {
                  id: "cut_01",
                  type: "cut",
                  start_sec: 1.25,
                  end_sec: 2.5,
                },
              ],
            },
          },
        },
        edit_plan: {
          path: "hammer/edit-plan/current.v1.json",
          file_updated_at: "2026-03-13T12:00:05.000Z",
          data: { edit_plan_id: "plan_01", instructions: [] },
        },
        macro_hooks: {
          recipe_ref: "macro_podcast_cleanup",
          last_run_ref: "macro_run_01",
        },
      };
    },
    async saveHammerWorkpieceState(workspaceId, workpieceId, input, options) {
      calls.saveHammerWorkpieceState.push({ workspaceId, workpieceId, input, options: options ?? null });
      return service.readHammerWorkpieceState(workspaceId, workpieceId, options);
    },
    async listHammerWorkpiecePresence(workspaceId, workpieceId, options) {
      calls.listHammerWorkpiecePresence.push({ workspaceId, workpieceId, options: options ?? null });
      return [
        {
          workspace_id: workspaceId,
          workpiece_id: workpieceId,
          user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          session_id: "session_hammer_01",
          display_name: "Forge Editor",
          mode: "editing",
          last_seen_at: "2026-03-13T12:00:00.000Z",
          created_at: "2026-03-13T11:59:00.000Z",
        },
      ];
    },
    async upsertHammerWorkpiecePresence(workspaceId, workpieceId, input, options) {
      calls.upsertHammerWorkpiecePresence.push({ workspaceId, workpieceId, input, options: options ?? null });
      return {
        workspace_id: workspaceId,
        workpiece_id: workpieceId,
        user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        session_id: input.session_id ?? null,
        display_name: input.display_name ?? null,
        mode: input.mode,
        last_seen_at: "2026-03-13T12:00:30.000Z",
        created_at: "2026-03-13T11:59:00.000Z",
      };
    },
    async getWorkpieceRecordingTruth(workpieceId) {
      calls.getWorkpieceRecordingTruth.push({ workpieceId });
      return {
        workpiece_id: workpieceId,
        recorded: true,
        latest_kept_take: {
          event_id: 101,
          created_at: "2026-03-17T12:00:00.000Z",
          file_path: "recordings/episode-kept.webm",
          recording_session_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          anvil_capture_session_id: "capture-session-1",
          content_type: "video/webm",
          bytes: 2048,
          duration_ms: 42000,
          original_name: "episode-kept.webm",
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
    async readWorkpieceBinary(workpieceId, path) {
      calls.readWorkpieceBinary.push({ workpieceId, path });
      return {
        found: true,
        bytes_base64: "AQID",
        content_type: "image/png",
      };
    },
    async readWorkpieceText(workpieceId, path) {
      calls.readWorkpieceText.push({ workpieceId, path });
      return {
        found: true,
        text: "# Script",
        file_row: {
          updated_at: "2026-02-21T00:00:00.000Z",
        },
      };
    },
  };

  return { service, calls };
}

test("GET /tongs/workspaces/:workspaceId/workpieces/:workpieceId/hammer/state returns persisted Hammer snapshot", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);
  const request = new Request(
    "http://localhost/tongs/workspaces/11111111-1111-4111-8111-111111111111/workpieces/22222222-2222-4222-8222-222222222222/hammer/state",
    {
      method: "GET",
      headers: {
        "x-forge-user-authorization": "Bearer hammer_user_token",
      },
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.data?.snapshot?.state?.active_session_id, "session_hammer_01");
  assert.equal(body.data?.snapshot?.structured_transcript?.path, "hammer/transcript/structured.v1.json");
  assert.deepEqual(body.data?.snapshot?.audio_polish?.data?.audio_edit?.operations, [
    {
      id: "cut_01",
      type: "cut",
      start_sec: 1.25,
      end_sec: 2.5,
    },
  ]);
  assert.equal(calls.readHammerWorkpieceState.length, 1);
  assert.equal(calls.readHammerWorkpieceState[0]?.options?.userAccessToken, "hammer_user_token");
});

test("PUT /tongs/workspaces/:workspaceId/workpieces/:workpieceId/hammer/state forwards save payload and token", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);
  const request = new Request(
    "http://localhost/tongs/workspaces/11111111-1111-4111-8111-111111111111/workpieces/22222222-2222-4222-8222-222222222222/hammer/state",
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-forge-user-authorization": "Bearer hammer_user_token",
      },
      body: JSON.stringify({
        written_by: {
          tool: "hammer",
          tool_version: "forge-v1.2.0",
          lane: "forge-managed",
        },
        active_session_id: "session_hammer_02",
        prep_status: "prepared",
        alignment_status: "aligned",
        edit_plan_signature: "sig_next",
        editor_session: {
          data: {
            session_id: "session_hammer_02",
          },
        },
        audio_polish: {
          data: {
            audio_edit: {
              version: "v1",
              operations: [
                {
                  id: "cut_02",
                  type: "cut",
                  start_sec: 4,
                  end_sec: 5.5,
                },
              ],
            },
          },
        },
        edit_plan: {
          path: "hammer/edit-plan/current.v1.json",
          data: {
            edit_plan_id: "plan_next",
            instructions: [],
          },
        },
      }),
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(calls.saveHammerWorkpieceState.length, 1);
  assert.equal(calls.saveHammerWorkpieceState[0]?.options?.userAccessToken, "hammer_user_token");
  assert.equal(calls.saveHammerWorkpieceState[0]?.input?.active_session_id, "session_hammer_02");
  assert.equal(calls.saveHammerWorkpieceState[0]?.input?.editor_session?.data?.session_id, "session_hammer_02");
  assert.deepEqual(calls.saveHammerWorkpieceState[0]?.input?.audio_polish?.data?.audio_edit?.operations, [
    {
      id: "cut_02",
      type: "cut",
      start_sec: 4,
      end_sec: 5.5,
    },
  ]);
  assert.equal(calls.saveHammerWorkpieceState[0]?.input?.edit_plan?.path, "hammer/edit-plan/current.v1.json");
});

test("PUT /tongs/workspaces/:workspaceId/workpieces/:workpieceId/hammer/state normalizes invalid audio_edit to null before save", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);
  const request = new Request(
    "http://localhost/tongs/workspaces/11111111-1111-4111-8111-111111111111/workpieces/22222222-2222-4222-8222-222222222222/hammer/state",
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-forge-user-authorization": "Bearer hammer_user_token",
      },
      body: JSON.stringify({
        written_by: {
          tool: "hammer",
          tool_version: "forge-v1.2.0",
          lane: "forge-managed",
        },
        audio_polish: {
          data: {
            audio_edit: {
              version: "v1",
              operations: [
                {
                  id: "cut_invalid",
                  type: "cut",
                  start_sec: 5,
                  end_sec: 5,
                },
              ],
            },
          },
        },
      }),
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(calls.saveHammerWorkpieceState.length, 1);
  assert.equal(calls.saveHammerWorkpieceState[0]?.input?.audio_polish?.data?.audio_edit, null);
});

test("TongsCommitService.readHammerWorkpieceState normalizes malformed structured_transcript on read", async () => {
  const workspaceId = "11111111-1111-4111-8111-111111111111";
  const workpieceId = "22222222-2222-4222-8222-222222222222";
  const stateRow = {
    workspace_id: workspaceId,
    workpiece_id: workpieceId,
    active_session_id: "session_hammer_01",
    editor_session_path: null,
    transcript_artifact_path: "hammer/transcript/structured.v1.json",
    speaker_map_artifact_path: null,
    visual_placement_artifact_path: null,
    audio_polish_artifact_path: null,
    edit_plan_artifact_path: null,
    edit_plan_signature: null,
    prep_status: "prepared",
    alignment_status: "aligned",
    current_pass: "transcript_cleanup",
    pass_order_version: 2,
    pass_status: {},
    macro_recipe_ref: null,
    last_macro_run_ref: null,
    last_opened_at: "2026-03-13T12:00:00.000Z",
    updated_at: "2026-03-13T12:00:05.000Z",
    updated_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  };
  const supabase = {
    schema() {
      return {
        from(table) {
          if (table !== "hammer_workpiece_state") {
            throw new Error(`Unexpected table ${table}`);
          }
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            async maybeSingle() {
              return { data: stateRow, error: null };
            },
          };
        },
      };
    },
  };

  const service = new TongsCommitService(supabase, "forge-workpieces", null);
  service.getWorkspaceOrThrow = async () => ({ id: workspaceId });
  service.assertWorkpieceInWorkspace = async () => ({ id: workpieceId, workspace_id: workspaceId });
  service.assertWorkspaceRoleFromAccessToken = async () => ({ userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "editor" });
  service.readWorkpieceJson = async (_workpieceId, path) => {
    if (path !== "hammer/transcript/structured.v1.json") {
      return { found: false };
    }
    return {
      found: true,
      data: {
        schema_version: 1,
        transcript_id: "transcript_01",
        media_id: "media_01",
        media_signature: "media_sig_01",
        prepared_at: "2026-03-13T10:00:00.000Z",
        structure: "speaker_turns",
        source_media_ref: null,
        diarization: {
          label_scheme: "forge-neutral-speakers.v1",
          labels: ["S1"],
          raw_labels: ["host"],
          version: "gpt-4o-transcribe",
          provider: "openai",
          provider_request_id: "req_01",
          model: "gpt-4o-transcribe",
        },
        confidence_flags: [],
        segments: [],
        derived_text_layers: {
          schema_version: 1,
          active_layer_id: "missing_active",
          output_layer_id: "missing_output",
          layers: [
            {
              layer_id: "legacy_macro_run",
              recipe_ref: "macro:podcast_cleanup.v1",
              macro_kind: "filler_cleanup",
              status: "review",
              created_at: "2026-03-13T10:15:00.000Z",
              based_on_transcript_id: "transcript_01",
              summary: {
                changed_segment_count: 1,
                removal_count: 1,
                untouched_segment_count: 0,
              },
              changes: [
                {
                  segment_id: "seg_001",
                  original_text: "Um line one.",
                  cleaned_text: "line one.",
                  removed_fillers: [
                    {
                      value: "Um",
                      start: 0,
                      end: 2,
                    },
                  ],
                },
              ],
            },
          ],
        },
        subtitle_outputs: {
          schema_version: 1,
          last_generated_format: "srt",
          srt: {
            format: "srt",
            generated_at: "2026-03-13T10:14:00.000Z",
            source_transcript_id: "transcript_01",
            source_layer_id: null,
            source_kind: "raw",
            source_recipe_ref: null,
            approximate_timing: false,
            entry_count: 1,
            content: "subtitle body",
          },
          vtt: "not-an-artifact",
        },
      },
      file_row: { updated_at: "2026-03-13T12:00:02.000Z" },
    };
  };

  const result = await service.readHammerWorkpieceState(workspaceId, workpieceId, { userAccessToken: "hammer_user_token" });

  assert.equal(result.structured_transcript.data?.derived_text_layers?.active_layer_id, null);
  assert.equal(result.structured_transcript.data?.derived_text_layers?.output_layer_id, null);
  assert.deepEqual(result.structured_transcript.data?.derived_text_layers?.layers[0]?.changes[0]?.operations, [
    {
      kind: "filler_removed",
      value: "Um",
      start: 0,
      end: 2,
    },
  ]);
  assert.equal(result.structured_transcript.data?.subtitle_outputs?.vtt, null);
});

test("TongsCommitService.saveHammerWorkpieceState normalizes malformed structured_transcript before commit", async () => {
  const workspaceId = "11111111-1111-4111-8111-111111111111";
  const workpieceId = "22222222-2222-4222-8222-222222222222";
  const committed = [];
  const upserts = [];
  const existingState = {
    workspace_id: workspaceId,
    workpiece_id: workpieceId,
    active_session_id: null,
    editor_session_path: null,
    transcript_artifact_path: null,
    speaker_map_artifact_path: null,
    visual_placement_artifact_path: null,
    audio_polish_artifact_path: null,
    edit_plan_artifact_path: null,
    edit_plan_signature: null,
    prep_status: "idle",
    alignment_status: "not_started",
    current_pass: "transcript_cleanup",
    pass_order_version: 2,
    pass_status: {},
    macro_recipe_ref: null,
    last_macro_run_ref: null,
    last_opened_at: "2026-03-13T12:00:00.000Z",
    updated_at: "2026-03-13T12:00:05.000Z",
    updated_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  };
  const supabase = {
    schema() {
      return {
        from(table) {
          if (table !== "hammer_workpiece_state") {
            throw new Error(`Unexpected table ${table}`);
          }
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            async maybeSingle() {
              return { data: existingState, error: null };
            },
            async upsert(row) {
              upserts.push(row);
              return { error: null };
            },
          };
        },
      };
    },
  };

  const service = new TongsCommitService(supabase, "forge-workpieces", null);
  service.getWorkspaceOrThrow = async () => ({ id: workspaceId });
  service.assertWorkpieceInWorkspace = async () => ({ id: workpieceId, workspace_id: workspaceId });
  service.assertWorkspaceRoleFromAccessToken = async () => ({ userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "editor" });
  service.commitFile = async (_workpieceId, input) => {
    committed.push(input);
    return {
      workpiece_id: workpieceId,
      path: input.path,
      storage_key: `workpieces/${workpieceId}/${input.path}`,
      hash: "hash-file",
      bytes: 77,
      content_type: input.content_type || "application/json",
      manifest_hash: "hash-manifest",
      manifest_bytes: 456,
      file_row: {
        updated_at: "2026-03-13T12:00:02.000Z",
      },
    };
  };
  service.readHammerWorkpieceState = async () => ({
    schema_version: 1,
    state: existingState,
    editor_session: { path: null, file_updated_at: null, data: null },
    structured_transcript: { path: "hammer/transcript/structured.v1.json", file_updated_at: "2026-03-13T12:00:02.000Z", data: committed[0]?.json ?? null },
    speaker_map: { path: null, file_updated_at: null, data: null },
    visual_placements: { path: null, file_updated_at: null, data: null },
    audio_polish: { path: null, file_updated_at: null, data: null },
    edit_plan: { path: null, file_updated_at: null, data: null },
    macro_hooks: { recipe_ref: null, last_run_ref: null },
  });

  await service.saveHammerWorkpieceState(workspaceId, workpieceId, {
    written_by: {
      tool: "hammer",
      tool_version: "forge-v1.2.0",
      lane: "forge-managed",
    },
    structured_transcript: {
      data: {
        schema_version: 1,
        transcript_id: "transcript_01",
        media_id: "media_01",
        media_signature: "media_sig_01",
        prepared_at: "2026-03-13T10:00:00.000Z",
        structure: "speaker_turns",
        source_media_ref: null,
        diarization: {
          label_scheme: "forge-neutral-speakers.v1",
          labels: ["S1"],
          raw_labels: ["host"],
          version: "gpt-4o-transcribe",
          provider: "openai",
          provider_request_id: "req_01",
          model: "gpt-4o-transcribe",
        },
        confidence_flags: [],
        segments: [],
        derived_text_layers: {
          schema_version: 1,
          active_layer_id: "missing_active",
          output_layer_id: "missing_output",
          layers: [
            {
              layer_id: "legacy_macro_run",
              recipe_ref: "macro:podcast_cleanup.v1",
              macro_kind: "filler_cleanup",
              status: "review",
              created_at: "2026-03-13T10:15:00.000Z",
              based_on_transcript_id: "transcript_01",
              summary: {
                changed_segment_count: 1,
                removal_count: 1,
                untouched_segment_count: 0,
              },
              changes: [
                {
                  segment_id: "seg_001",
                  original_text: "Um line one.",
                  cleaned_text: "line one.",
                  removed_fillers: [
                    {
                      value: "Um",
                      start: 0,
                      end: 2,
                    },
                  ],
                },
              ],
            },
          ],
        },
        subtitle_outputs: {
          schema_version: 1,
          last_generated_format: "srt",
          srt: {
            format: "srt",
            generated_at: "2026-03-13T10:14:00.000Z",
            source_transcript_id: "transcript_01",
            source_layer_id: null,
            source_kind: "raw",
            source_recipe_ref: null,
            approximate_timing: false,
            entry_count: 1,
            content: "subtitle body",
          },
          vtt: "not-an-artifact",
        },
      },
    },
  }, { userAccessToken: "hammer_user_token" });

  assert.equal(committed.length, 1);
  assert.equal(committed[0]?.path, "hammer/transcript/structured.v1.json");
  assert.equal(committed[0]?.json?.derived_text_layers?.active_layer_id, null);
  assert.equal(committed[0]?.json?.derived_text_layers?.output_layer_id, null);
  assert.deepEqual(committed[0]?.json?.derived_text_layers?.layers[0]?.changes[0]?.operations, [
    {
      kind: "filler_removed",
      value: "Um",
      start: 0,
      end: 2,
    },
  ]);
  assert.equal(committed[0]?.json?.subtitle_outputs?.vtt, null);
  assert.equal(upserts.length, 1);
});

test("TongsCommitService.readHammerWorkpieceState normalizes malformed orchestration state on read", async () => {
  const workspaceId = "11111111-1111-4111-8111-111111111111";
  const workpieceId = "22222222-2222-4222-8222-222222222222";
  const stateRow = {
    workspace_id: workspaceId,
    workpiece_id: workpieceId,
    active_session_id: "session_hammer_01",
    editor_session_path: null,
    transcript_artifact_path: null,
    speaker_map_artifact_path: null,
    visual_placement_artifact_path: null,
    audio_polish_artifact_path: null,
    edit_plan_artifact_path: null,
    edit_plan_signature: " ",
    prep_status: "drifted",
    alignment_status: "sideways",
    current_pass: "bogus_pass",
    pass_order_version: 0,
    pass_status: {
      retakes: "completed",
      ready: "weird",
      unknown_pass: "in_progress",
    },
    macro_recipe_ref: " ",
    last_macro_run_ref: "macro_run_02",
    last_opened_at: "2026-03-13T12:00:00.000Z",
    updated_at: "2026-03-13T12:00:05.000Z",
    updated_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  };
  const supabase = {
    schema() {
      return {
        from() {
          return {
            select() { return this; },
            eq() { return this; },
            async maybeSingle() { return { data: stateRow, error: null }; },
          };
        },
      };
    },
  };

  const service = new TongsCommitService(supabase, "forge-workpieces", null);
  service.getWorkspaceOrThrow = async () => ({ id: workspaceId });
  service.assertWorkpieceInWorkspace = async () => ({ id: workpieceId, workspace_id: workspaceId });
  service.assertWorkspaceRoleFromAccessToken = async () => ({ userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "editor" });

  const result = await service.readHammerWorkpieceState(workspaceId, workpieceId, { userAccessToken: "hammer_user_token" });

  assert.equal(result.state?.prep_status, "idle");
  assert.equal(result.state?.alignment_status, "not_started");
  assert.equal(result.state?.current_pass, "transcript_cleanup");
  assert.equal(result.state?.pass_order_version, 2);
  assert.equal(result.state?.pass_status.transcript_cleanup, "in_progress");
  assert.equal(result.state?.pass_status.retakes, "completed");
  assert.equal(result.state?.pass_status.ready, "not_started");
  assert.equal(result.state?.edit_plan_signature, null);
  assert.equal(result.state?.macro_recipe_ref, null);
  assert.equal(result.state?.last_macro_run_ref, "macro_run_02");
  assert.equal(result.macro_hooks.recipe_ref, null);
  assert.equal(result.macro_hooks.last_run_ref, "macro_run_02");
});

test("TongsCommitService.saveHammerWorkpieceState normalizes malformed stored orchestration state before upsert", async () => {
  const workspaceId = "11111111-1111-4111-8111-111111111111";
  const workpieceId = "22222222-2222-4222-8222-222222222222";
  const upserts = [];
  const existingState = {
    workspace_id: workspaceId,
    workpiece_id: workpieceId,
    active_session_id: "session_hammer_01",
    editor_session_path: null,
    transcript_artifact_path: null,
    speaker_map_artifact_path: null,
    visual_placement_artifact_path: null,
    audio_polish_artifact_path: null,
    edit_plan_artifact_path: null,
    edit_plan_signature: " ",
    prep_status: "drifted",
    alignment_status: "sideways",
    current_pass: "bogus_pass",
    pass_order_version: 0,
    pass_status: {
      retakes: "completed",
      ready: "weird",
      unknown_pass: "in_progress",
    },
    macro_recipe_ref: " ",
    last_macro_run_ref: "macro_run_02",
    last_opened_at: "2026-03-13T12:00:00.000Z",
    updated_at: "2026-03-13T12:00:05.000Z",
    updated_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  };
  const supabase = {
    schema() {
      return {
        from() {
          return {
            select() { return this; },
            eq() { return this; },
            async maybeSingle() { return { data: existingState, error: null }; },
            async upsert(row) {
              upserts.push(row);
              return { error: null };
            },
          };
        },
      };
    },
  };

  const service = new TongsCommitService(supabase, "forge-workpieces", null);
  service.getWorkspaceOrThrow = async () => ({ id: workspaceId });
  service.assertWorkpieceInWorkspace = async () => ({ id: workpieceId, workspace_id: workspaceId });
  service.assertWorkspaceRoleFromAccessToken = async () => ({ userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "editor" });
  service.readHammerWorkpieceState = async () => ({
    schema_version: 1,
    state: upserts[0] ?? null,
    editor_session: { path: null, file_updated_at: null, data: null },
    structured_transcript: { path: null, file_updated_at: null, data: null },
    speaker_map: { path: null, file_updated_at: null, data: null },
    visual_placements: { path: null, file_updated_at: null, data: null },
    audio_polish: { path: null, file_updated_at: null, data: null },
    edit_plan: { path: null, file_updated_at: null, data: null },
    macro_hooks: {
      recipe_ref: upserts[0]?.macro_recipe_ref ?? null,
      last_run_ref: upserts[0]?.last_macro_run_ref ?? null,
    },
  });

  await service.saveHammerWorkpieceState(workspaceId, workpieceId, {
    written_by: {
      tool: "hammer",
      tool_version: "forge-v1.2.0",
      lane: "editor",
    },
    last_opened_at: "2026-03-13T12:05:00.000Z",
  }, { userAccessToken: "hammer_user_token" });

  assert.equal(upserts.length, 1);
  assert.equal(upserts[0]?.prep_status, "idle");
  assert.equal(upserts[0]?.alignment_status, "not_started");
  assert.equal(upserts[0]?.current_pass, "transcript_cleanup");
  assert.equal(upserts[0]?.pass_order_version, 2);
  assert.equal(upserts[0]?.pass_status.transcript_cleanup, "in_progress");
  assert.equal(upserts[0]?.pass_status.retakes, "completed");
  assert.equal(upserts[0]?.pass_status.ready, "not_started");
  assert.equal(upserts[0]?.edit_plan_signature, null);
  assert.equal(upserts[0]?.macro_recipe_ref, null);
  assert.equal(upserts[0]?.last_macro_run_ref, "macro_run_02");
});

test("TongsCommitService.readHammerWorkpieceState normalizes malformed visual_placements on read", async () => {
  const workspaceId = "11111111-1111-4111-8111-111111111111";
  const workpieceId = "22222222-2222-4222-8222-222222222222";
  const stateRow = {
    workspace_id: workspaceId,
    workpiece_id: workpieceId,
    active_session_id: "session_hammer_01",
    editor_session_path: null,
    transcript_artifact_path: null,
    speaker_map_artifact_path: null,
    visual_placement_artifact_path: "hammer/prep/visual-placements.v1.json",
    audio_polish_artifact_path: null,
    edit_plan_artifact_path: null,
    edit_plan_signature: null,
    prep_status: "prepared",
    alignment_status: "aligned",
    current_pass: "image_placement",
    pass_order_version: 2,
    pass_status: {},
    macro_recipe_ref: null,
    last_macro_run_ref: null,
    last_opened_at: "2026-03-13T12:00:00.000Z",
    updated_at: "2026-03-13T12:00:05.000Z",
    updated_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  };
  const supabase = {
    schema() {
      return {
        from() {
          return {
            select() { return this; },
            eq() { return this; },
            async maybeSingle() { return { data: stateRow, error: null }; },
          };
        },
      };
    },
  };
  const service = new TongsCommitService(supabase, "forge-workpieces", null);
  service.getWorkspaceOrThrow = async () => ({ id: workspaceId });
  service.assertWorkpieceInWorkspace = async () => ({ id: workpieceId, workspace_id: workspaceId });
  service.assertWorkspaceRoleFromAccessToken = async () => ({ userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "editor" });
  service.readWorkpieceJson = async (_workpieceId, path) => ({
    found: path === "hammer/prep/visual-placements.v1.json",
    data: {
      schema_version: 1,
      status: "prepared",
      source_refs: ["transcript:tx_01", "transcript:tx_01", "", null],
      uncertainty_flags: ["match_missing:image-map-01", "", "match_missing:image-map-01"],
      placements: [
        {
          placement_id: "placement_01",
          entry_id: "image-map-01",
          anchor_segment_id: "seg_001",
          matched_segment_ids: ["seg_001", "", "seg_001"],
          anchor_text: "Anchor",
          asset_ref: "asset_01",
          asset_id: "asset_01",
          asset_path: "assets/example.png",
          storage_key: "workpieces/example/assets/example.png",
          label: "explainer",
          visual_mode: "comparison",
          start_sec: 1,
          end_sec: 3,
          timing_source: "weird",
          status: "bad",
          uncertainty_flags: ["timeline_remap_review", "", "timeline_remap_review"],
          overlay_geometry: {
            x: -2,
            y: 3,
            width: 0.01,
            height: 2,
            anchor: "nonsense",
          },
          animation_preset: "bad",
          overlay_opacity: 4,
        },
        {
          placement_id: "placement_02",
          entry_id: "image-map-invalid",
          anchor_segment_id: "seg_002",
          asset_ref: "asset_02",
          start_sec: 5,
          end_sec: 4,
          timing_source: "ordered_fallback",
          status: "uncertain",
          uncertainty_flags: [],
          matched_segment_ids: ["seg_002"],
        },
      ],
    },
    file_row: { updated_at: "2026-03-13T12:00:02.000Z" },
  });

  const result = await service.readHammerWorkpieceState(workspaceId, workpieceId, { userAccessToken: "hammer_user_token" });
  assert.deepEqual(result.visual_placements.data?.source_refs, ["transcript:tx_01"]);
  assert.deepEqual(result.visual_placements.data?.uncertainty_flags, ["match_missing:image-map-01"]);
  assert.equal(result.visual_placements.data?.placements.length, 1);
  assert.deepEqual(result.visual_placements.data?.placements[0]?.overlay_geometry, {
    x: 0,
    y: 1,
    width: 0.05,
    height: 1,
    anchor: "top_left",
  });
  assert.equal(result.visual_placements.data?.placements[0]?.animation_preset, null);
  assert.equal(result.visual_placements.data?.placements[0]?.overlay_opacity, 1);
});

test("TongsCommitService.saveHammerWorkpieceState normalizes malformed visual_placements before commit", async () => {
  const workspaceId = "11111111-1111-4111-8111-111111111111";
  const workpieceId = "22222222-2222-4222-8222-222222222222";
  const committed = [];
  const supabase = {
    schema() {
      return {
        from() {
          return {
            select() { return this; },
            eq() { return this; },
            async maybeSingle() { return { data: null, error: null }; },
            async upsert() { return { error: null }; },
          };
        },
      };
    },
  };
  const service = new TongsCommitService(supabase, "forge-workpieces", null);
  service.getWorkspaceOrThrow = async () => ({ id: workspaceId });
  service.assertWorkpieceInWorkspace = async () => ({ id: workpieceId, workspace_id: workspaceId });
  service.assertWorkspaceRoleFromAccessToken = async () => ({ userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "editor" });
  service.commitFile = async (_workpieceId, input) => {
    committed.push(input);
    return {
      workpiece_id: workpieceId,
      path: input.path,
      storage_key: `workpieces/${workpieceId}/${input.path}`,
      hash: "hash-file",
      bytes: 77,
      content_type: "application/json",
      manifest_hash: "hash-manifest",
      manifest_bytes: 456,
      file_row: { updated_at: "2026-03-13T12:00:02.000Z" },
    };
  };
  service.readHammerWorkpieceState = async () => ({
    schema_version: 1,
    state: null,
    editor_session: { path: null, file_updated_at: null, data: null },
    structured_transcript: { path: null, file_updated_at: null, data: null },
    speaker_map: { path: null, file_updated_at: null, data: null },
    visual_placements: { path: "hammer/prep/visual-placements.v1.json", file_updated_at: "2026-03-13T12:00:02.000Z", data: committed[0]?.json ?? null },
    audio_polish: { path: null, file_updated_at: null, data: null },
    edit_plan: { path: null, file_updated_at: null, data: null },
    macro_hooks: { recipe_ref: null, last_run_ref: null },
  });

  await service.saveHammerWorkpieceState(workspaceId, workpieceId, {
    written_by: {
      tool: "hammer",
      tool_version: "forge-v1.2.0",
      lane: "forge-managed",
    },
    visual_placements: {
      data: {
        schema_version: 1,
        status: "prepared",
        source_refs: ["transcript:tx_01", "", "transcript:tx_01"],
        uncertainty_flags: ["match_missing:image-map-01", "", "match_missing:image-map-01"],
        placements: [
          {
            placement_id: "placement_01",
            entry_id: "image-map-01",
            anchor_segment_id: "seg_001",
            matched_segment_ids: ["seg_001", "", "seg_001"],
            anchor_text: "Anchor",
            asset_ref: "asset_01",
            asset_id: "asset_01",
            asset_path: "assets/example.png",
            storage_key: "workpieces/example/assets/example.png",
            label: "explainer",
            visual_mode: "comparison",
            start_sec: 1,
            end_sec: 3,
            timing_source: "weird",
            status: "bad",
            uncertainty_flags: ["timeline_remap_review", "", "timeline_remap_review"],
            overlay_geometry: {
              x: -2,
              y: 3,
              width: 0.01,
              height: 2,
              anchor: "nonsense",
            },
            animation_preset: "bad",
            overlay_opacity: 4,
          },
        ],
      },
    },
  }, { userAccessToken: "hammer_user_token" });

  assert.equal(committed.length, 1);
  assert.deepEqual(committed[0]?.json?.source_refs, ["transcript:tx_01"]);
  assert.deepEqual(committed[0]?.json?.uncertainty_flags, ["match_missing:image-map-01"]);
  assert.deepEqual(committed[0]?.json?.placements[0]?.matched_segment_ids, ["seg_001"]);
  assert.equal(committed[0]?.json?.placements[0]?.timing_source, "transcript_match");
  assert.equal(committed[0]?.json?.placements[0]?.status, "placed");
  assert.deepEqual(committed[0]?.json?.placements[0]?.overlay_geometry, {
    x: 0,
    y: 1,
    width: 0.05,
    height: 1,
    anchor: "top_left",
  });
  assert.equal(committed[0]?.json?.placements[0]?.animation_preset, null);
  assert.equal(committed[0]?.json?.placements[0]?.overlay_opacity, 1);
});

test("GET /tongs/workspaces/:workspaceId/workpieces/:workpieceId/hammer/presence returns Hammer presence rows", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);
  const request = new Request(
    "http://localhost/tongs/workspaces/11111111-1111-4111-8111-111111111111/workpieces/22222222-2222-4222-8222-222222222222/hammer/presence",
    {
      method: "GET",
      headers: {
        "x-forge-user-authorization": "Bearer hammer_user_token",
      },
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.data?.presence?.[0]?.session_id, "session_hammer_01");
  assert.equal(calls.listHammerWorkpiecePresence.length, 1);
  assert.equal(calls.listHammerWorkpiecePresence[0]?.options?.userAccessToken, "hammer_user_token");
});

test("PUT /tongs/workspaces/:workspaceId/workpieces/:workpieceId/hammer/presence forwards session-aware presence payload", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);
  const request = new Request(
    "http://localhost/tongs/workspaces/11111111-1111-4111-8111-111111111111/workpieces/22222222-2222-4222-8222-222222222222/hammer/presence",
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-forge-user-authorization": "Bearer hammer_user_token",
      },
      body: JSON.stringify({
        mode: "editing",
        display_name: "Forge Editor",
        session_id: "session_hammer_02",
      }),
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(calls.upsertHammerWorkpiecePresence.length, 1);
  assert.equal(calls.upsertHammerWorkpiecePresence[0]?.options?.userAccessToken, "hammer_user_token");
  assert.equal(calls.upsertHammerWorkpiecePresence[0]?.input?.session_id, "session_hammer_02");
  assert.equal(body.data?.presence?.mode, "editing");
});

function createRoleGateSupabase({ userId, workspaceId, workspaceOwnerId, memberRole }) {
  return {
    auth: {
      async getUser(token) {
        if (!token || token === "bad_token") {
          return { data: { user: null }, error: null };
        }
        return { data: { user: { id: userId } }, error: null };
      },
    },
    schema(schemaName) {
      assert.equal(schemaName, "tongs");
      return {
        from(tableName) {
          if (tableName === "workspaces") {
            return {
              select() {
                return {
                  eq() {
                    return {
                      async maybeSingle() {
                        return {
                          data: {
                            id: workspaceId,
                            created_by: workspaceOwnerId,
                          },
                          error: null,
                        };
                      },
                    };
                  },
                };
              },
            };
          }

          if (tableName === "workspace_members") {
            return {
              select() {
                return {
                  eq() {
                    return {
                      eq() {
                        return {
                          async maybeSingle() {
                            return {
                              data: memberRole ? { role: memberRole } : null,
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
          }

          if (tableName === "workpiece_ready_script_meta") {
            return {
              async upsert() {
                return { data: null, error: null };
              },
              select() {
                return {
                  eq() {
                    return {
                      eq() {
                        return {
                          async in() {
                            return { data: [], error: null };
                          },
                        };
                      },
                    };
                  },
                };
              },
              delete() {
                return {
                  eq() {
                    return {
                      eq() {
                        return {
                          eq() {
                            return {
                              async select() {
                                return {
                                  data: [
                                    {
                                      workpiece_id: "11111111-1111-4111-8111-111111111111",
                                      script_path: "script/script.md",
                                    },
                                  ],
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
          }

          if (tableName === "workpiece_files") {
            return {
              select() {
                return {
                  eq() {
                    return {
                      eq() {
                        return {
                          async maybeSingle() {
                            return {
                              data: {
                                workpiece_id: "11111111-1111-4111-8111-111111111111",
                                path: "script/script.md",
                                file_type: "script_markdown",
                                content_type: "text/markdown; charset=utf-8",
                                bytes: 123,
                                hash_algo: "sha256",
                                hash_value: "abc",
                                storage_bucket: "forge-workpieces",
                                storage_key: "workpieces/11111111-1111-4111-8111-111111111111/script/script.md",
                                written_by_tool: "hearth",
                                written_by_tool_version: "0.0.0",
                                written_by_lane: "forge-managed",
                                created_at: "2026-03-02T00:00:00.000Z",
                                updated_at: "2026-03-02T00:00:00.000Z",
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
              delete() {
                return {
                  eq() {
                    return {
                      async eq() {
                        return { data: null, error: null };
                      },
                    };
                  },
                };
              },
            };
          }

          throw new Error(`Unexpected table: ${tableName}`);
        },
      };
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, "forge-workpieces");
        return {
          async upload() {
            return { data: {}, error: null };
          },
          async remove() {
            return { data: null, error: { message: "storage remove failed" } };
          },
        };
      },
    },
  };
}

function createReadyQueueSupabase({
  episodes = [],
  files = [],
  readyMeta = [],
  queueState = [],
  events = [],
} = {}) {
  const state = {
    fileRows: files.map((row) => ({ ...row })),
    readyMetaRows: readyMeta.map((row) => ({ ...row })),
    queueStateRows: queueState.map((row) => ({ ...row })),
    upsertCalls: [],
    deleteCalls: [],
  };

  function compareNullableValues(a, b, ascending = true) {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (a < b) return ascending ? -1 : 1;
    if (a > b) return ascending ? 1 : -1;
    return 0;
  }

  function sortRows(rows, field, ascending = true) {
    return rows.slice().sort((left, right) => compareNullableValues(left[field], right[field], ascending));
  }

  function matchesFilters(row, filters) {
    return Object.entries(filters).every(([key, value]) => (
      value === null ? row[key] == null : row[key] === value
    ));
  }

  return {
    state,
    schema(schemaName) {
      assert.equal(schemaName, "tongs");
      return {
        from(tableName) {
          if (tableName === "episodes") {
            return {
              select() {
                const filters = {};
                const mapEpisodeRows = (rows) => rows.map((row) => ({
                  id: row.id,
                  workspace_id: row.workspace_id,
                  label: row.label ?? null,
                  updated_at: row.updated_at ?? null,
                  created_at: row.created_at ?? null,
                  archived_at: row.archived_at ?? null,
                  archived_by: row.archived_by ?? null,
                  archive_reason: row.archive_reason ?? null,
                }));
                const buildOrderChain = (rows) => ({
                  order(nextOrderField, nextOptions) {
                    return buildOrderChain(
                      sortRows(rows, nextOrderField, nextOptions?.ascending ?? true),
                    );
                  },
                  async limit(limit) {
                    return {
                      data: mapEpisodeRows(rows.slice(0, limit)),
                      error: null,
                    };
                  },
                });
                return {
                  eq(field, value) {
                    filters[field] = value;
                    return this;
                  },
                  is(field, value) {
                    filters[field] = value;
                    return this;
                  },
                  async single() {
                    const row = episodes.find((candidate) => (
                      matchesFilters(candidate, filters)
                    )) ?? null;
                    if (!row) {
                      return { data: null, error: { code: "PGRST116", message: "No rows" } };
                    }
                    return { data: { ...row }, error: null };
                  },
                  async maybeSingle() {
                    const row = episodes.find((candidate) => (
                      matchesFilters(candidate, filters)
                    )) ?? null;
                    return { data: row ? { ...row } : null, error: null };
                  },
                  async in(innerField, values) {
                    assert.equal(innerField, "id");
                    const idSet = new Set(values);
                    return {
                      data: episodes
                        .filter((row) => matchesFilters(row, filters) && idSet.has(row.id))
                        .map((row) => ({ id: row.id })),
                      error: null,
                    };
                  },
                  order(orderField, options) {
                    return buildOrderChain(
                      sortRows(
                        episodes.filter((row) => matchesFilters(row, filters)),
                        orderField,
                        options?.ascending ?? true,
                      ),
                    );
                  },
                };
              },
              update(patch) {
                const filters = {};
                return {
                  eq(field, value) {
                    filters[field] = value;
                    return this;
                  },
                  select() {
                    return {
                      async single() {
                        const index = episodes.findIndex((candidate) => (
                          matchesFilters(candidate, filters)
                        ));
                        if (index < 0) {
                          return { data: null, error: { message: "No rows" } };
                        }
                        episodes[index] = {
                          ...episodes[index],
                          ...patch,
                          updated_at: "2026-03-11T14:00:00.000Z",
                        };
                        return {
                          data: { ...episodes[index] },
                          error: null,
                        };
                      },
                    };
                  },
                };
              },
            };
          }

          if (tableName === "workpiece_files") {
            return {
              select() {
                let workpieceFilter = null;
                const withWorkpieceFilter = {
                  async in(innerField, innerValues) {
                    assert.equal(innerField, "path");
                    const pathFilter = new Set(innerValues);
                    return {
                      data: state.fileRows.filter(
                        (row) => workpieceFilter.has(row.workpiece_id) && pathFilter.has(row.path),
                      ),
                      error: null,
                    };
                  },
                  like(innerField, pattern) {
                    assert.equal(innerField, "path");
                    const prefix = String(pattern).replace(/%$/, "");
                    return {
                      async limit(limit) {
                        return {
                          data: state.fileRows
                            .filter(
                              (row) => workpieceFilter.has(row.workpiece_id) && row.path.startsWith(prefix),
                            )
                            .slice(0, limit),
                          error: null,
                        };
                      },
                    };
                  },
                };
                return {
                  eq(field, value) {
                    assert.equal(field, "workpiece_id");
                    workpieceFilter = new Set([value]);
                    return withWorkpieceFilter;
                  },
                  in(field, values) {
                    assert.equal(field, "workpiece_id");
                    workpieceFilter = new Set(values);
                    return withWorkpieceFilter;
                  },
                };
              },
              delete() {
                return {
                  eq(field, value) {
                    assert.equal(field, "workpiece_id");
                    const workpieceId = value;
                    return {
                      async in(innerField, values) {
                        assert.equal(innerField, "path");
                        const pathSet = new Set(values);
                        const deletedRows = [];
                        state.fileRows = state.fileRows.filter((row) => {
                          const shouldDelete = row.workpiece_id === workpieceId && pathSet.has(row.path);
                          if (shouldDelete) deletedRows.push({ ...row });
                          return !shouldDelete;
                        });
                        return {
                          data: deletedRows,
                          error: null,
                        };
                      },
                    };
                  },
                };
              },
            };
          }

          if (tableName === "workpiece_ready_script_meta") {
            return {
              select() {
                let workspaceFilter = null;
                return {
                  eq(field, value) {
                    assert.equal(field, "workspace_id");
                    workspaceFilter = value;
                    return {
                      async in(innerField, values) {
                        assert.equal(innerField, "workpiece_id");
                        const idSet = new Set(values);
                        return {
                          data: state.readyMetaRows.filter(
                            (row) => row.workspace_id === workspaceFilter && idSet.has(row.workpiece_id),
                          ),
                          error: null,
                        };
                      },
                    };
                  },
                };
              },
              delete() {
                let workspaceFilter = null;
                return {
                  eq(field, value) {
                    assert.equal(field, "workspace_id");
                    workspaceFilter = value;
                    return {
                      eq(innerField, innerValue) {
                        assert.equal(innerField, "workpiece_id");
                        const workpieceId = innerValue;
                        return {
                          async select() {
                            const deletedRows = [];
                            state.readyMetaRows = state.readyMetaRows.filter((row) => {
                              const shouldDelete = row.workspace_id === workspaceFilter && row.workpiece_id === workpieceId;
                              if (shouldDelete) {
                                deletedRows.push({
                                  workpiece_id: row.workpiece_id,
                                  script_path: row.script_path,
                                });
                              }
                              return !shouldDelete;
                            });
                            return {
                              data: deletedRows,
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
          }

          if (tableName === "workspace_ready_queue_state") {
            return {
              select() {
                let workspaceFilter = null;
                return {
                  eq(field, value) {
                    assert.equal(field, "workspace_id");
                    workspaceFilter = value;
                    return {
                      async in(innerField, values) {
                        assert.equal(innerField, "workpiece_id");
                        const idSet = new Set(values);
                        return {
                          data: state.queueStateRows.filter(
                            (row) => row.workspace_id === workspaceFilter && idSet.has(row.workpiece_id),
                          ),
                          error: null,
                        };
                      },
                    };
                  },
                };
              },
              async upsert(rows, options) {
                state.upsertCalls.push({
                  rows: rows.map((row) => ({ ...row })),
                  options: options ?? null,
                });
                for (const row of rows) {
                  const index = state.queueStateRows.findIndex(
                    (existing) => existing.workspace_id === row.workspace_id && existing.workpiece_id === row.workpiece_id,
                  );
                  const nextRow = {
                    updated_at: "2026-03-10T14:45:00.000Z",
                    ...row,
                  };
                  if (index >= 0) {
                    state.queueStateRows[index] = {
                      ...state.queueStateRows[index],
                      ...nextRow,
                    };
                  } else {
                    state.queueStateRows.push(nextRow);
                  }
                }
                return { data: null, error: null };
              },
              delete() {
                let workspaceFilter = null;
                return {
                  eq(field, value) {
                    assert.equal(field, "workspace_id");
                    workspaceFilter = value;
                    return {
                      async in(innerField, values) {
                        assert.equal(innerField, "workpiece_id");
                        const idSet = new Set(values);
                        const deletedRows = [];
                        state.queueStateRows = state.queueStateRows.filter((row) => {
                          const shouldDelete = row.workspace_id === workspaceFilter && idSet.has(row.workpiece_id);
                          if (shouldDelete) deletedRows.push({ ...row });
                          return !shouldDelete;
                        });
                        state.deleteCalls.push({
                          workspace_id: workspaceFilter,
                          workpiece_ids: [...idSet],
                        });
                        return { data: deletedRows, error: null };
                      },
                    };
                  },
                };
              },
            };
          }

          if (tableName === "workpiece_events") {
            return {
              insert(row) {
                const inserted = {
                  id: events.length + 1,
                  created_at: "2026-03-11T14:05:00.000Z",
                  ...row,
                };
                return {
                  select() {
                    return {
                      async single() {
                        events.push({ ...inserted });
                        return {
                          data: { ...inserted },
                          error: null,
                        };
                      },
                    };
                  },
                };
              },
              select() {
                let workpieceFilter = null;
                let eventNameFilter = null;
                let ordered = events.slice();
                return {
                  in(field, values) {
                    assert.equal(field, "workpiece_id");
                    workpieceFilter = new Set(values);
                    return {
                      eq(innerField, innerValue) {
                        assert.equal(innerField, "event_name");
                        eventNameFilter = innerValue;
                        return {
                          order(orderField, options) {
                            ordered = sortRows(
                              events.filter(
                                (row) => workpieceFilter.has(row.workpiece_id) && row.event_name === eventNameFilter,
                              ),
                              orderField,
                              options?.ascending ?? true,
                            );
                            return {
                              order(nextOrderField, nextOptions) {
                                ordered = sortRows(ordered, nextOrderField, nextOptions?.ascending ?? true);
                                return {
                                  async limit(limit) {
                                    return {
                                      data: ordered.slice(0, limit),
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
              },
            };
          }

          throw new Error(`Unexpected table: ${tableName}`);
        },
      };
    },
    storage: {
      from() {
        return {
          async upload() {
            return { data: {}, error: null };
          },
          async remove() {
            return { data: null, error: null };
          },
        };
      },
    },
  };
}

function createImageMapAssetSupabase({ assets = [] } = {}) {
  const state = {
    assetRows: assets.map((row) => ({ ...row })),
    insertCalls: [],
    updateCalls: [],
  };

  function matchesFilters(row, filters, containsFilters) {
    const basicMatch = Object.entries(filters).every(([key, value]) => row[key] === value);
    if (!basicMatch) return false;
    return containsFilters.every(({ field, value }) => {
      const rowValue = row[field];
      if (!rowValue || typeof rowValue !== "object") return false;
      return Object.entries(value).every(([innerKey, innerValue]) => rowValue[innerKey] === innerValue);
    });
  }

  return {
    state,
    schema(schemaName) {
      assert.equal(schemaName, "tongs");
      return {
        from(tableName) {
          if (tableName !== "assets") {
            throw new Error(`Unexpected table: ${tableName}`);
          }

          return {
            select() {
              const filters = {};
              const containsFilters = [];
              return {
                eq(field, value) {
                  filters[field] = value;
                  return this;
                },
                contains(field, value) {
                  containsFilters.push({ field, value });
                  return this;
                },
                order(field, options) {
                  const rows = state.assetRows
                    .filter((row) => matchesFilters(row, filters, containsFilters))
                    .sort((left, right) => {
                      const leftValue = left[field] ?? null;
                      const rightValue = right[field] ?? null;
                      if (leftValue === rightValue) return 0;
                      if (leftValue == null) return 1;
                      if (rightValue == null) return -1;
                      return options?.ascending === false
                        ? String(rightValue).localeCompare(String(leftValue))
                        : String(leftValue).localeCompare(String(rightValue));
                    });
                  return {
                    data: rows.map((row) => ({ ...row })),
                    error: null,
                    async limit(limit) {
                      return {
                        data: rows.slice(0, limit).map((row) => ({ ...row })),
                        error: null,
                      };
                    },
                  };
                },
              };
            },
            insert(row) {
              const inserted = {
                created_at: row.created_at ?? "2026-03-10T16:05:00.000Z",
                updated_at: row.updated_at ?? "2026-03-10T16:05:00.000Z",
                ...row,
              };
              return {
                select() {
                  return {
                    async single() {
                      state.insertCalls.push({ ...inserted });
                      state.assetRows.push({ ...inserted });
                      return {
                        data: { ...inserted },
                        error: null,
                      };
                    },
                  };
                },
              };
            },
            update(patch) {
              return {
                async eq(field, value) {
                  state.updateCalls.push({ patch: { ...patch }, [field]: value });
                  state.assetRows = state.assetRows.map((row) => (
                    row[field] === value
                      ? {
                        ...row,
                        ...patch,
                        updated_at: "2026-03-10T16:05:00.000Z",
                      }
                      : row
                  ));
                  return { data: null, error: null };
                },
                async in(field, values) {
                  state.updateCalls.push({ patch: { ...patch }, [field]: [...values] });
                  state.assetRows = state.assetRows.map((row) => (
                    values.includes(row[field])
                      ? {
                        ...row,
                        ...patch,
                        updated_at: "2026-03-10T16:05:00.000Z",
                      }
                      : row
                  ));
                  return { data: null, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

function createManifestFixture(workpieceId, workspaceId) {
  const now = "2026-03-02T00:00:00.000Z";
  return {
    schema: "forge.manifest.v1",
    workpiece_id: workpieceId,
    workspace_id: workspaceId,
    created_at: now,
    updated_at: now,
    status: "draft",
    pointers: {
      script_primary: "script/script.md",
      script_format: null,
      script_sources: null,
      assets_registry: null,
      session_current: null,
      edit_current: null,
      export_current: null,
      publish_intent: null,
    },
    hashing: {
      algo: "sha256",
      text_newlines: "LF",
      json: {
        sorted_keys: true,
        minified: true,
        preserve_array_order: true,
      },
    },
    origin: {
      created_by: {
        user_id: null,
        display_name: null,
      },
      tool: {
        name: "tongs",
        version: "0.1.0",
      },
    },
    files: {
      "script/script.md": {
        type: "script_markdown",
        content_type: "text/markdown; charset=utf-8",
        bytes: 123,
        hash: {
          algo: "sha256",
          value: "abc",
        },
        written_by: {
          tool: "hearth",
          tool_version: "0.0.0",
          lane: "forge-managed",
        },
        updated_at: now,
      },
    },
  };
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
    headers: {
      "content-type": "application/json",
      "x-forge-user-authorization": "Bearer user_token_abc",
    },
    body: JSON.stringify({
      path: "script/script.md",
      content_type: "text/markdown; charset=utf-8",
      text: "Hello world",
      expected_previous_updated_at: "2026-03-01T00:00:00.000Z",
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
  assert.equal(calls.commitFile[0].input.user_access_token, "user_token_abc");
  assert.equal(calls.commitFile[0].input.expected_previous_updated_at, "2026-03-01T00:00:00.000Z");
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

test("GET /tongs/workpieces/:id/recording-truth dispatches getWorkpieceRecordingTruth", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request("http://localhost/tongs/workpieces/11111111-1111-4111-8111-111111111111/recording-truth", {
    method: "GET",
  });

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.getWorkpieceRecordingTruth.length, 1);
  assert.equal(calls.getWorkpieceRecordingTruth[0].workpieceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(body.ok, true);
  assert.equal(body.data?.truth?.recorded, true);
  assert.equal(body.data?.truth?.latest_kept_take?.file_path, "recordings/episode-kept.webm");
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

test("POST /tongs/workpieces/:id/image-map/generate-candidates dispatches generateImageMapCandidates", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workpieces/11111111-1111-4111-8111-111111111111/image-map/generate-candidates",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forge-user-authorization": "Bearer user_token_abc",
      },
      body: JSON.stringify({
        workspace_id: "11111111-1111-4111-8111-111111111111",
        image_map_entry_id: "image-map-01",
        expected_metadata_updated_at: "2026-03-11T19:00:00.000Z",
        context_before: "Jackson's men watched the British column advance.",
        context_after: "The Mississippi delta made retreat impossible.",
        confirm_spend: true,
      }),
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.generateImageMapCandidates.length, 1);
  assert.equal(calls.generateImageMapCandidates[0]?.workpieceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.generateImageMapCandidates[0]?.input.image_map_entry_id, "image-map-01");
  assert.equal(calls.generateImageMapCandidates[0]?.input.context_before, "Jackson's men watched the British column advance.");
  assert.equal(calls.generateImageMapCandidates[0]?.input.user_access_token, "user_token_abc");
  assert.equal(body.ok, true);
  assert.equal(body.data?.generated_assets?.length, 2);
  assert.equal(body.data?.image_map?.entries?.[0]?.candidate_assets?.length, 2);
});

test("GET /tongs/workpieces/:id/image-map dispatches getWorkpieceImageMap", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workpieces/11111111-1111-4111-8111-111111111111/image-map",
    {
      method: "GET",
      headers: {
        "x-forge-user-authorization": "Bearer user_token_abc",
      },
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.getWorkpieceImageMap.length, 1);
  assert.equal(calls.getWorkpieceImageMap[0]?.workpieceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.getWorkpieceImageMap[0]?.options?.userAccessToken, "user_token_abc");
  assert.equal(body.ok, true);
  assert.equal(body.data?.image_map?.workpiece_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(body.data?.asset?.asset_kind, "image_map_json");
});

test("GET /tongs/workpieces/:id/visual-package dispatches getWorkpieceVisualPackage", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workpieces/11111111-1111-4111-8111-111111111111/visual-package",
    {
      method: "GET",
      headers: {
        "x-forge-user-authorization": "Bearer user_token_abc",
      },
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.getWorkpieceVisualPackage.length, 1);
  assert.equal(calls.getWorkpieceVisualPackage[0]?.workpieceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.getWorkpieceVisualPackage[0]?.options?.userAccessToken, "user_token_abc");
  assert.equal(body.ok, true);
  assert.equal(body.data?.script_path, "script/script.md");
  assert.equal(body.data?.visuals?.length, 1);
  assert.equal(body.data?.visuals?.[0]?.selected_asset?.storage_key.includes("/image-map-01/"), true);
});

test("PUT /tongs/workpieces/:id/image-map dispatches saveWorkpieceImageMap", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workpieces/11111111-1111-4111-8111-111111111111/image-map",
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-forge-user-authorization": "Bearer user_token_abc",
      },
      body: JSON.stringify({
        workspace_id: "11111111-1111-4111-8111-111111111111",
        entries: [
          {
            id: "image-map-01",
            anchor: "s1:para1",
            description: "city skyline",
            intent: "broll",
            source_type: "stock",
            placement_hint: null,
          },
        ],
        expected_metadata_updated_at: "2026-03-10T15:00:00.000Z",
      }),
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.saveWorkpieceImageMap.length, 1);
  assert.equal(calls.saveWorkpieceImageMap[0]?.workpieceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.saveWorkpieceImageMap[0]?.options?.userAccessToken, "user_token_abc");
  assert.equal(calls.saveWorkpieceImageMap[0]?.input?.workspace_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.saveWorkpieceImageMap[0]?.input?.expected_metadata_updated_at, "2026-03-10T15:00:00.000Z");
  assert.equal(body.ok, true);
  assert.equal(body.data?.asset?.metadata_json?.entry_count, 1);
});

test("PUT /tongs/workpieces/:id/image-map rejects selected_asset_id outside candidate_assets", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workpieces/11111111-1111-4111-8111-111111111111/image-map",
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-forge-user-authorization": "Bearer user_token_abc",
      },
      body: JSON.stringify({
        workspace_id: "11111111-1111-4111-8111-111111111111",
        entries: [
          {
            id: "image-map-01",
            anchor: "s1:p1#sent1",
            script_anchor: {
              section_id: "s1",
              paragraph_id: "s1:p1",
              paragraph_order: 1,
              sentence_start: 1,
              sentence_end: 1,
              char_start: 0,
              char_end: 12,
              span_text: "city skyline",
              speaker_block_id: null,
            },
            description: "city skyline",
            visual_intent: "city skyline",
            prompt_basis: "city skyline",
            intent: "broll",
            source_type: "ai",
            beat_order: 1,
            paragraph_beat_order: 1,
            candidate_assets: [
              {
                asset_id: "candidate-a",
                path: "assets/image-map/candidates/a.png",
                variant_label: "explainer",
                visual_mode: "comparison",
                mime_type: "image/png",
              },
            ],
            selected_asset_id: "candidate-b",
            status: "selected",
            placement_hint: null,
          },
        ],
        expected_metadata_updated_at: "2026-03-10T15:00:00.000Z",
      }),
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.ok, false);
  assert.equal(body.error?.code, "invalid_selected_asset");
  assert.equal(calls.saveWorkpieceImageMap.length, 0);
});

test("GET /tongs/workpieces/:id/image-map requires x-forge-user-authorization header", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workpieces/11111111-1111-4111-8111-111111111111/image-map",
    { method: "GET" },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.ok, false);
  assert.equal(body.error?.code, "missing_user_token_header");
  assert.equal(calls.getWorkpieceImageMap.length, 0);
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

test("GET /tongs/workpieces/:id/read-file?encoding=binary returns raw bytes", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workpieces/11111111-1111-4111-8111-111111111111/read-file?path=assets%2Fthumbnails%2F111%2F222.png&encoding=binary",
    { method: "GET" },
  );

  const response = await handler(request);
  const body = new Uint8Array(await response.arrayBuffer());

  assert.equal(response.status, 200);
  assert.equal(calls.readWorkpieceBinary.length, 1);
  assert.equal(calls.readWorkpieceBinary[0].workpieceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.readWorkpieceBinary[0].path, "assets/thumbnails/111/222.png");
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.deepEqual(Array.from(body), [1, 2, 3]);
});

test("GET /tongs/workpieces/:id/read-file returns bootstrap-empty payload for missing primary script", async () => {
  const { service, calls } = mockService();
  service.readWorkpieceText = async (workpieceId, path) => {
    calls.readWorkpieceText.push({ workpieceId, path });
    return { found: false };
  };
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workpieces/11111111-1111-4111-8111-111111111111/read-file?path=script%2Fscript.md",
    { method: "GET" },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.readWorkpieceText.length, 1);
  assert.equal(calls.readWorkpieceText[0].workpieceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.readWorkpieceText[0].path, "script/script.md");
  assert.equal(body.ok, true);
  assert.equal(body.exists, false);
  assert.equal(body.data, null);
});

test("GET /tongs/workpieces/:id/read-file returns bootstrap-empty payload for missing Hearth chat snapshot", async () => {
  const { service, calls } = mockService();
  service.readWorkpieceJson = async (workpieceId, path) => {
    calls.readWorkpieceText.push({ workpieceId, path });
    return { found: false };
  };
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workpieces/11111111-1111-4111-8111-111111111111/read-file?path=hearth%2Fchat.v1.json",
    { method: "GET" },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.readWorkpieceText.length, 1);
  assert.equal(calls.readWorkpieceText[0].workpieceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.readWorkpieceText[0].path, "hearth/chat.v1.json");
  assert.equal(body.ok, true);
  assert.equal(body.exists, false);
  assert.equal(body.data, null);
});

test("GET /tongs/workpieces/:id/read-file returns bootstrap-empty payload for missing Hearth media map", async () => {
  const { service, calls } = mockService();
  service.readWorkpieceJson = async (workpieceId, path) => {
    calls.readWorkpieceText.push({ workpieceId, path });
    return { found: false };
  };
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workpieces/11111111-1111-4111-8111-111111111111/read-file?path=hearth%2Fmedia_map.v1.json",
    { method: "GET" },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.readWorkpieceText.length, 1);
  assert.equal(calls.readWorkpieceText[0].workpieceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.readWorkpieceText[0].path, "hearth/media_map.v1.json");
  assert.equal(body.ok, true);
  assert.equal(body.exists, false);
  assert.equal(body.data, null);
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
          titles: [
            { id: "seo-title-a", label: "A", text: "Launch title", is_primary: true },
          ],
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
              style_preset: "studio lighting",
            },
          ],
          versions: [
            {
              id: "thumb-existing",
              concept_id: "concept-01",
              created_at: "2026-02-28T00:05:00.000Z",
              provider: "upload",
              prompt: "Existing upload",
              provider_request_id: null,
              asset_id: "asset-existing",
              asset_path: "assets/thumbnails/existing.png",
              mime_type: "image/png",
              status: "ready",
              error: null,
            },
          ],
          primary_version_id: null,
        },
        launch_variants: [
          {
            id: "launch-variant-01",
            title_id: "seo-title-a",
            thumbnail_version_id: "thumb-existing",
            created_at: "2026-02-28T00:10:00.000Z",
            updated_at: "2026-02-28T00:10:00.000Z",
          },
        ],
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
  service.runAIRequest = async (args) => {
    const executed = await args.execute();
    return {
      ...executed,
      estimatedCostUsd: 0,
      actualCostUsd: 0,
      billableTokens: 0,
      providerRequestId: executed.providerRequestId ?? null,
    };
  };

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
  assert.match(providerCalls[0].prompt, /Visual style: Studio Photography\./);
  assert.equal(assetInsertCalls.length, 1);
  assert.equal(assetInsertCalls[0].workspace_id, workspaceId);
  assert.equal(assetInsertCalls[0].workpiece_id, workpieceId);
  assert.equal(assetInsertCalls[0].bytes, 3);
  assert.equal(assetInsertCalls[0].asset_kind, "thumbnail_image");
  assert.equal(assetInsertCalls[0].status, "ready");
  assert.equal(assetInsertCalls[0].metadata_json.schema, "forge.thumbnail-image.v1");
  assert.equal(assetInsertCalls[0].metadata_json.concept_id, "concept-01");
  assert.equal(assetInsertCalls[0].metadata_json.style_preset, "studio_photography");
  assert.equal(commitCalls.length, 2);
  assert.equal(commitCalls[0].input.path.startsWith("assets/thumbnails/"), true);
  assert.equal(commitCalls[1].input.path, "metadata.json");
  assert.equal(commitCalls[1].input.json.episode.thumbnail.concepts[0].style_preset, "studio_photography");
  assert.equal(commitCalls[1].input.json.episode.thumbnail.versions.length, 2);
  assert.equal(commitCalls[1].input.json.episode.thumbnail.primary_version_id, result.version.id);
  assert.equal(commitCalls[1].input.json.episode.launch_variants.length, 1);
  assert.equal(commitCalls[1].input.json.launch_variants.length, 1);
  assert.equal(result.version.status, "ready");
  assert.equal(result.primary_version_id, result.version.id);
  assert.equal(result.updated_episode_package.launch_variants.length, 1);
  assert.equal(result.asset.storage_bucket, "forge-workpieces");
});

test("TongsCommitService.generateImageMapCandidates writes candidate assets and canonical image-map refs", async () => {
  const workspaceId = "11111111-1111-4111-8111-111111111111";
  const workpieceId = "22222222-2222-4222-8222-222222222222";
  const userId = "33333333-3333-4333-8333-333333333333";
  const providerCalls = [];
  const commitCalls = [];
  const { state, ...supabase } = createImageMapAssetSupabase({
    assets: [
      {
        id: "asset-old-image-map",
        workspace_id: workspaceId,
        workpiece_id: workpieceId,
        path: "assets/image-map/image-map.v1.json",
        mime_type: "application/json",
        bytes: 111,
        storage_bucket: "forge-workpieces",
        storage_key: `workpieces/${workpieceId}/assets/image-map/image-map.v1.json`,
        provider: "hearth",
        provider_request_id: null,
        request_id: "req-old-image-map",
        prompt: null,
        created_by: userId,
        created_at: "2026-03-11T18:00:00.000Z",
        updated_at: "2026-03-11T18:00:00.000Z",
        asset_kind: "image_map_json",
        status: "ready",
        metadata_json: {
          schema: "forge.image-map.v1",
          entry_count: 1,
        },
        supersedes_asset_id: null,
      },
      {
        id: "asset-old-candidate-a",
        workspace_id: workspaceId,
        workpiece_id: workpieceId,
        path: `assets/image-map/candidates/${workpieceId}/image-map-01/explainer-old.png`,
        mime_type: "image/png",
        bytes: 222,
        storage_bucket: "forge-workpieces",
        storage_key: `workpieces/${workpieceId}/assets/image-map/candidates/${workpieceId}/image-map-01/explainer-old.png`,
        provider: "openai",
        provider_request_id: "req-old-a",
        request_id: "req-local-old-a",
        prompt: "old prompt",
        created_by: userId,
        created_at: "2026-03-11T18:01:00.000Z",
        updated_at: "2026-03-11T18:01:00.000Z",
        asset_kind: "image_map_candidate_image",
        status: "ready",
        metadata_json: {
          schema: "forge.image-map-candidate.v1",
          image_map_entry_id: "image-map-01",
          variant_label: "explainer",
          visual_mode: "comparison",
        },
        supersedes_asset_id: null,
      },
      {
        id: "asset-old-candidate-b",
        workspace_id: workspaceId,
        workpiece_id: workpieceId,
        path: `assets/image-map/candidates/${workpieceId}/image-map-01/illustrative-old.png`,
        mime_type: "image/png",
        bytes: 223,
        storage_bucket: "forge-workpieces",
        storage_key: `workpieces/${workpieceId}/assets/image-map/candidates/${workpieceId}/image-map-01/illustrative-old.png`,
        provider: "openai",
        provider_request_id: "req-old-b",
        request_id: "req-local-old-b",
        prompt: "old prompt",
        created_by: userId,
        created_at: "2026-03-11T18:02:00.000Z",
        updated_at: "2026-03-11T18:02:00.000Z",
        asset_kind: "image_map_candidate_image",
        status: "ready",
        metadata_json: {
          schema: "forge.image-map-candidate.v1",
          image_map_entry_id: "image-map-01",
          variant_label: "illustrative",
          visual_mode: "comparison",
        },
        supersedes_asset_id: null,
      },
    ],
  });

  const imageProvider = {
    async generateImage(input) {
      providerCalls.push(input);
      const index = providerCalls.length;
      return {
        bytesBase64: index === 1 ? "AQID" : "BAUG",
        mimeType: "image/png",
        provider: "openai",
        providerRequestId: `req_provider_${index}`,
        revisedPrompt: null,
        tokensUsed: 120 + index,
      };
    },
  };

  const service = new TongsCommitService(supabase, "forge-workpieces", imageProvider);
  service.getWorkspaceOrThrow = async () => ({
    id: workspaceId,
    created_by: userId,
    created_at: "2026-03-11T17:00:00.000Z",
    updated_at: "2026-03-11T17:00:00.000Z",
    storage_profile: null,
  });
  service.assertWorkpieceInWorkspace = async () => ({
    id: workpieceId,
    workspace_id: workspaceId,
    label: "Episode",
    status: "draft",
    manifest_path: "manifest.json",
    metadata: {},
    created_by: null,
    created_at: "2026-03-11T17:00:00.000Z",
    updated_at: "2026-03-11T17:00:00.000Z",
  });
  service.assertWorkspaceRoleFromAccessToken = async () => ({ userId, role: "editor" });
  service.readWorkpieceJson = async () => ({
    found: true,
    data: {
      schema: "forge.metadata.v1",
      workpiece_id: workpieceId,
      workspace_id: workspaceId,
      episode: {
        schema: "forge.episode.package.v2",
        image_map: {
          entries: [
            {
              id: "image-map-01",
              anchor: "s1:p1#sent1-2",
              script_anchor: {
                section_id: "s1",
                paragraph_id: "s1:p1",
                paragraph_order: 1,
                sentence_start: 1,
                sentence_end: 2,
                char_start: 0,
                char_end: 72,
                span_text: "Jackson faced 8,000 British troops against 3,500 defenders near New Orleans.",
                speaker_block_id: null,
              },
              description: "Strategic troop comparison near New Orleans",
              visual_intent: "Strategic troop comparison",
              prompt_basis: "Troop-count comparison near New Orleans",
              style_preset: "oil on canvas",
              intent: "broll",
              source_type: "script",
              beat_order: 1,
              paragraph_beat_order: 1,
              candidate_assets: [],
              selected_asset_id: null,
              status: "mapped",
              placement_hint: null,
            },
          ],
        },
      },
    },
    file_row: { updated_at: "2026-03-11T18:30:00.000Z" },
  });
  service.commitFile = async (inputWorkpieceId, input) => {
    commitCalls.push({ inputWorkpieceId, input });
    return {
      workpiece_id: inputWorkpieceId,
      path: input.path,
      storage_key: `workpieces/${inputWorkpieceId}/${input.path}`,
      hash: "hash_abc",
      bytes: input.path.endsWith(".png") ? 3 : 200,
      content_type: input.content_type ?? "application/octet-stream",
      manifest_hash: "manifest_hash",
      manifest_bytes: 123,
      file_row: {
        workpiece_id: inputWorkpieceId,
        path: input.path,
        file_type: input.file_type ?? "json",
        content_type: input.content_type ?? "application/octet-stream",
        bytes: input.path.endsWith(".png") ? 3 : 200,
        hash_algo: "sha256",
        hash_value: "hash_abc",
        storage_bucket: "forge-workpieces",
        storage_key: `workpieces/${inputWorkpieceId}/${input.path}`,
        written_by_tool: input.written_by.tool,
        written_by_tool_version: input.written_by.tool_version,
        written_by_lane: input.written_by.lane,
        created_at: "2026-03-11T19:00:00.000Z",
        updated_at: input.path === "metadata.json"
          ? "2026-03-11T19:00:00.000Z"
          : "2026-03-11T19:00:01.000Z",
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
        created_at: "2026-03-11T19:00:00.000Z",
        updated_at: "2026-03-11T19:00:00.000Z",
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
        created_at: "2026-03-11T19:00:00.000Z",
      },
    };
  };
  service.applyAiTokenDelta = async () => ({
    tokenBalance: 777,
  });
  service.runAIRequest = async (args) => {
    const executed = await args.execute();
    return {
      ...executed,
      estimatedCostUsd: 0,
      actualCostUsd: 0,
      billableTokens: 0,
      providerRequestId: executed.providerRequestId ?? null,
    };
  };

  const result = await service.generateImageMapCandidates(workpieceId, {
    workspace_id: workspaceId,
    image_map_entry_id: "image-map-01",
    context_before: "British forces regrouped after Napoleon's defeat.",
    context_after: "The Mississippi delta made New Orleans strategically decisive.",
    confirm_spend: true,
    lane: "forge",
    user_access_token: "token_abc",
  });

  assert.equal(providerCalls.length, 2);
  assert.equal(providerCalls[0]?.aspect, "16:9");
  assert.match(providerCalls[0]?.prompt ?? "", /Exact beat span:/);
  assert.match(providerCalls[0]?.prompt ?? "", /Jackson faced 8,000 British troops/);
  assert.match(providerCalls[0]?.prompt ?? "", /Visual style: Oil Painting\./);
  assert.match(providerCalls[0]?.prompt ?? "", /Variant goal: make the beat clearer and more diagrammatic or explanatory/);
  assert.match(providerCalls[1]?.prompt ?? "", /Variant goal: make the beat more cinematic and illustrative/);
  assert.notEqual(providerCalls[0]?.prompt, providerCalls[1]?.prompt);
  assert.match(providerCalls[0]?.prompt ?? "", /Do not render text, labels, captions, numbers, or map lettering into the image/);

  assert.equal(commitCalls.length, 4);
  assert.equal(commitCalls[0]?.input.path.includes("assets/image-map/candidates/"), true);
  assert.equal(commitCalls[1]?.input.path.includes("assets/image-map/candidates/"), true);
  assert.equal(commitCalls[2]?.input.path, "metadata.json");
  assert.equal(commitCalls[3]?.input.path, "assets/image-map/image-map.v1.json");

  const candidateInserts = state.insertCalls.filter((row) => row.asset_kind === "image_map_candidate_image");
  assert.equal(candidateInserts.length, 2);
  assert.equal(candidateInserts[0]?.status, "ready");
  assert.equal(candidateInserts[0]?.metadata_json?.schema, "forge.image-map-candidate.v1");
  assert.equal(candidateInserts[0]?.metadata_json?.image_map_entry_id, "image-map-01");
  assert.equal(candidateInserts[0]?.metadata_json?.variant_label, "explainer");
  assert.equal(candidateInserts[0]?.metadata_json?.style_preset, "oil_painting");
  assert.equal(candidateInserts[1]?.metadata_json?.variant_label, "illustrative");
  assert.equal(candidateInserts[0]?.prompt?.includes("Exact beat span:"), true);
  assert.match(
    candidateInserts[0]?.path ?? "",
    new RegExp(`/image-map-01/${candidateInserts[0]?.id}-explainer\\.png$`),
  );
  assert.match(
    candidateInserts[1]?.path ?? "",
    new RegExp(`/image-map-01/${candidateInserts[1]?.id}-illustrative\\.png$`),
  );
  assert.notEqual(
    candidateInserts[0]?.path,
    `assets/image-map/candidates/${workpieceId}/image-map-01/explainer-old.png`,
    "Regenerated explainer candidates should use a fresh storage path",
  );
  assert.notEqual(
    candidateInserts[1]?.path,
    `assets/image-map/candidates/${workpieceId}/image-map-01/illustrative-old.png`,
    "Regenerated illustrative candidates should use a fresh storage path",
  );

  assert.equal(result.generated_assets.length, 2);
  assert.equal(result.generated_assets[0]?.variant_label, "explainer");
  assert.equal(result.generated_assets[1]?.variant_label, "illustrative");
  assert.equal(result.image_map.entries[0]?.candidate_assets.length, 2);
  assert.equal(result.image_map.entries[0]?.candidate_assets[0]?.variant_label, "explainer");
  assert.equal(result.image_map.entries[0]?.candidate_assets[1]?.variant_label, "illustrative");
  assert.equal(result.image_map.entries[0]?.status, "candidates_generated");
  assert.equal(result.image_map.entries[0]?.selected_asset_id, null);
  assert.equal(result.image_map.entries[0]?.style_preset, "oil_painting");
  assert.equal(result.token_balance, 777);

  const candidateSupersedeCall = state.updateCalls.find((row) => Array.isArray(row.id));
  assert.deepEqual([...candidateSupersedeCall.id].sort(), ["asset-old-candidate-a", "asset-old-candidate-b"]);
  assert.equal(candidateSupersedeCall?.patch?.status, "superseded");
  const imageMapRefreshCall = state.updateCalls.find((row) => row.id === "asset-old-image-map");
  assert.equal(imageMapRefreshCall?.patch?.status, "ready");
  assert.equal(imageMapRefreshCall?.patch?.storage_key, `workpieces/${workpieceId}/assets/image-map/image-map.v1.json`);
});

test("TongsCommitService.generateImageMapCandidates accepts beat anchors for bullet scripts", async () => {
  const workspaceId = "12111111-1111-4111-8111-111111111111";
  const workpieceId = "23222222-2222-4222-8222-222222222222";
  const userId = "34333333-3333-4333-8333-333333333333";
  const providerCalls = [];
  const commitCalls = [];
  const { ...supabase } = createImageMapAssetSupabase();

  const imageProvider = {
    async generateImage(input) {
      providerCalls.push(input);
      const index = providerCalls.length;
      return {
        bytesBase64: index === 1 ? "AQID" : "BAUG",
        mimeType: "image/png",
        provider: "openai",
        providerRequestId: `req_provider_bullet_${index}`,
        revisedPrompt: null,
        tokensUsed: 80 + index,
      };
    },
  };

  const service = new TongsCommitService(supabase, "forge-workpieces", imageProvider);
  service.getWorkspaceOrThrow = async () => ({
    id: workspaceId,
    created_by: userId,
    created_at: "2026-03-11T17:00:00.000Z",
    updated_at: "2026-03-11T17:00:00.000Z",
    storage_profile: null,
  });
  service.assertWorkpieceInWorkspace = async () => ({
    id: workpieceId,
    workspace_id: workspaceId,
    label: "Episode",
    status: "draft",
    manifest_path: "manifest.json",
    metadata: {},
    created_by: null,
    created_at: "2026-03-11T17:00:00.000Z",
    updated_at: "2026-03-11T17:00:00.000Z",
  });
  service.assertWorkspaceRoleFromAccessToken = async () => ({ userId, role: "editor" });
  service.readWorkpieceJson = async () => ({
    found: true,
    data: {
      schema: "forge.metadata.v1",
      workpiece_id: workpieceId,
      workspace_id: workspaceId,
      episode: {
        schema: "forge.episode.package.v2",
        spoken_beats: [
          {
            id: "beat-s1-01",
            speaker: "s1",
            format: "bullet_outline",
            order: 1,
            speaker_order: 1,
            speaker_turn: 1,
            text: "Open with crowd estimates varying widely from outlet to outlet.",
            normalized_label: "open with crowd estimates varying widely from outlet to outlet",
            cue_phrase: "crowd estimates varying widely",
          },
          {
            id: "beat-s1-02",
            speaker: "s1",
            format: "bullet_outline",
            order: 2,
            speaker_order: 2,
            speaker_turn: 1,
            text: "Police response changed after dark and that shift matters visually.",
            normalized_label: "police response changed after dark and that shift matters visually",
            cue_phrase: "police response changed after dark",
          },
        ],
        image_map: {
          entries: [
            {
              id: "image-map-01",
              anchor: "s1 beat 2: police response changed after dark",
              script_anchor: null,
              beat_anchor: {
                mode: "bullet_beat",
                beat_id: "beat-s1-02",
                speaker: "s1",
                beat_index: 2,
                speaker_order: 2,
                speaker_turn: 1,
                beat_label: "police response changed after dark",
                cue_phrase: "police response changed after dark",
                purpose: "coverage",
              },
              description: "Street-level police response after dark",
              visual_intent: "Street-level police response after dark",
              prompt_basis: "Police response changed after dark",
              style_preset: "photographic",
              intent: "cutaway",
              source_type: "stock",
              beat_order: 2,
              paragraph_beat_order: 2,
              candidate_assets: [],
              selected_asset_id: null,
              status: "mapped",
              placement_hint: null,
            },
          ],
        },
      },
    },
    file_row: { updated_at: "2026-03-11T18:30:00.000Z" },
  });
  service.commitFile = async (inputWorkpieceId, input) => {
    commitCalls.push({ inputWorkpieceId, input });
    return {
      workpiece_id: inputWorkpieceId,
      path: input.path,
      storage_key: `workpieces/${inputWorkpieceId}/${input.path}`,
      hash: "hash_bullet",
      bytes: input.path.endsWith(".png") ? 3 : 200,
      content_type: input.content_type ?? "application/octet-stream",
      manifest_hash: "manifest_hash",
      manifest_bytes: 123,
      file_row: {
        workpiece_id: inputWorkpieceId,
        path: input.path,
        file_type: input.file_type ?? "json",
        content_type: input.content_type ?? "application/octet-stream",
        bytes: input.path.endsWith(".png") ? 3 : 200,
        hash_algo: "sha256",
        hash_value: "hash_bullet",
        storage_bucket: "forge-workpieces",
        storage_key: `workpieces/${inputWorkpieceId}/${input.path}`,
        written_by_tool: input.written_by.tool,
        written_by_tool_version: input.written_by.tool_version,
        written_by_lane: input.written_by.lane,
        created_at: "2026-03-11T19:00:00.000Z",
        updated_at: input.path === "metadata.json"
          ? "2026-03-11T19:00:00.000Z"
          : "2026-03-11T19:00:01.000Z",
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
        created_at: "2026-03-11T19:00:00.000Z",
        updated_at: "2026-03-11T19:00:00.000Z",
      },
      event: {
        id: 109,
        workpiece_id: inputWorkpieceId,
        event_name: input.event_name ?? "workpiece.file.committed",
        payload: {},
        correlation_id: null,
        written_by_tool: input.written_by.tool,
        written_by_tool_version: input.written_by.tool_version,
        written_by_lane: input.written_by.lane,
        created_at: "2026-03-11T19:00:00.000Z",
      },
    };
  };
  service.applyAiTokenDelta = async () => ({
    tokenBalance: 555,
  });
  service.runAIRequest = async (args) => {
    const executed = await args.execute();
    return {
      ...executed,
      estimatedCostUsd: 0,
      actualCostUsd: 0,
      billableTokens: 0,
      providerRequestId: executed.providerRequestId ?? null,
    };
  };

  const result = await service.generateImageMapCandidates(workpieceId, {
    workspace_id: workspaceId,
    image_map_entry_id: "image-map-01",
    confirm_spend: true,
    lane: "forge",
    user_access_token: "token_bullet",
  });

  assert.equal(providerCalls.length, 2);
  assert.match(providerCalls[0]?.prompt ?? "", /Editorial beat focus:/);
  assert.match(providerCalls[0]?.prompt ?? "", /Police response changed after dark/);
  assert.match(providerCalls[0]?.prompt ?? "", /Beat anchor: s1 beat 2:/);
  assert.equal(result.generated_assets.length, 2);
  assert.equal(result.image_map.entries[0]?.beat_anchor?.beat_id, "beat-s1-02");
  assert.equal(result.image_map.spoken_beats[1]?.id, "beat-s1-02");
  assert.equal(commitCalls[2]?.input.json?.episode?.spoken_beats?.[1]?.cue_phrase, "police response changed after dark");
  assert.equal(commitCalls[3]?.input.json?.spoken_beats?.[0]?.id, "beat-s1-01");
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

test("POST /api/recording-sessions dispatches createRecordingSessionRecord", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request("http://localhost/api/recording-sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workspace_id: "11111111-1111-4111-8111-111111111111",
    }),
  });

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(calls.createRecordingSessionRecord.length, 1);
  assert.equal(calls.createRecordingSessionRecord[0].input.workspace_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(typeof calls.createRecordingSessionRecord[0].input.title, "undefined");
  assert.equal(body.ok, true);
  assert.equal(body.data?.title, "Recording Session");
});

test("GET /api/recording-sessions dispatches listRecordingSessionsForPlanner", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/api/recording-sessions?workspace_id=11111111-1111-4111-8111-111111111111&limit=20",
    { method: "GET" },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.listRecordingSessionsForPlanner.length, 1);
  assert.equal(calls.listRecordingSessionsForPlanner[0].options.workspace_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.listRecordingSessionsForPlanner[0].options.limit, 20);
  assert.equal(body.ok, true);
  assert.equal(Array.isArray(body.data?.sessions), true);
});

test("GET /api/recording-sessions/:id dispatches getRecordingSessionRecord", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/api/recording-sessions/22222222-2222-4222-8222-222222222222",
    { method: "GET" },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.getRecordingSessionRecord.length, 1);
  assert.equal(calls.getRecordingSessionRecord[0].sessionId, "22222222-2222-4222-8222-222222222222");
  assert.equal(body.ok, true);
  assert.equal(Array.isArray(body.data?.items), true);
  assert.equal(body.data?.items[0]?.position, 1);
});

test("PUT /api/recording-sessions/:id/items dispatches replaceRecordingSessionItems", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/api/recording-sessions/22222222-2222-4222-8222-222222222222/items",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            episode_id: "33333333-3333-4333-8333-333333333333",
            script_path: "script/script.md",
          },
          {
            episode_id: "44444444-4444-4444-8444-444444444444",
            script_path: "script/alt.md",
          },
        ],
      }),
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.replaceRecordingSessionItems.length, 1);
  assert.equal(calls.replaceRecordingSessionItems[0].sessionId, "22222222-2222-4222-8222-222222222222");
  assert.equal(calls.replaceRecordingSessionItems[0].input.items.length, 2);
  assert.equal(calls.replaceRecordingSessionItems[0].input.items[0].script_path, "script/script.md");
  assert.equal(body.ok, true);
  assert.equal(Array.isArray(body.data?.items), true);
  assert.equal(body.data.items[0]?.position, 1);
  assert.equal(body.data.items[1]?.position, 2);
});

test("PUT /api/recording-sessions/:id/items rejects duplicate episode_id", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/api/recording-sessions/22222222-2222-4222-8222-222222222222/items",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            episode_id: "33333333-3333-4333-8333-333333333333",
            script_path: "script/script.md",
          },
          {
            episode_id: "33333333-3333-4333-8333-333333333333",
            script_path: "script/script-2.md",
          },
        ],
      }),
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(calls.replaceRecordingSessionItems.length, 0);
  assert.equal(body.ok, false);
  assert.equal(body.error?.code, "duplicate_episode");
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

test("GET /tongs/workspaces/:id/sparks dispatches listWorkspaceSparks", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workspaces/11111111-1111-4111-8111-111111111111/sparks",
    {
      method: "GET",
      headers: {
        "x-forge-user-authorization": "Bearer user_token_abc",
      },
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.listWorkspaceSparks.length, 1);
  assert.equal(calls.listWorkspaceSparks[0]?.workspaceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.listWorkspaceSparks[0]?.options?.userAccessToken, "user_token_abc");
  assert.equal(body.ok, true);
  assert.equal(Array.isArray(body.data?.sparks), true);
  assert.equal(body.data.sparks.length, 1);
  assert.equal(body.data.sparks[0]?.linked_workpiece_id, "99999999-9999-4999-8999-999999999999");
});

test("GET /tongs/workspaces/:id/sparks requires x-forge-user-authorization header", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workspaces/11111111-1111-4111-8111-111111111111/sparks",
    { method: "GET" },
  );

  const response = await handler(request);

  assert.equal(response.status, 401);
  assert.equal(calls.listWorkspaceSparks.length, 0);
});

test("GET /tongs/workspaces/:id/ready-scripts dispatches listWorkspaceReadyScripts", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workspaces/11111111-1111-4111-8111-111111111111/ready-scripts",
    {
      method: "GET",
      headers: {
        "x-forge-user-authorization": "Bearer user_token_abc",
      },
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.listWorkspaceReadyScripts.length, 1);
  assert.equal(calls.listWorkspaceReadyScripts[0]?.workspaceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.listWorkspaceReadyScripts[0]?.options?.unrecordedOnly, false);
  assert.equal(calls.listWorkspaceReadyScripts[0]?.options?.userAccessToken, "user_token_abc");
  assert.equal(body.ok, true);
  assert.equal(Array.isArray(body.data?.scripts), true);
  assert.equal(body.data.scripts.length, 1);
  assert.equal(body.data.scripts[0]?.content_category, "evergreen");
  assert.equal(body.data.scripts[0]?.primary_script_path, "script/script.md");
  assert.equal(Array.isArray(body.data.scripts[0]?.script_paths), true);
  assert.equal(body.data.scripts[0]?.marked_ready_by, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assert.equal(body.data.scripts[0]?.marked_ready_at, "2026-02-21T00:00:00.000Z");
});

test("GET /tongs/workspaces/:id/episodes dispatches listWorkspaceEpisodes", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workspaces/11111111-1111-4111-8111-111111111111/episodes",
    {
      method: "GET",
      headers: {
        "x-forge-user-authorization": "Bearer user_token_abc",
      },
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.listWorkspaceEpisodes.length, 1);
  assert.equal(calls.listWorkspaceEpisodes[0]?.workspaceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.listWorkspaceEpisodes[0]?.options?.userAccessToken, "user_token_abc");
  assert.equal(calls.listWorkspaceEpisodes[0]?.options?.includeArchived, false);
  assert.equal(body.ok, true);
  assert.equal(Array.isArray(body.data?.episodes), true);
  assert.equal(body.data.episodes.length, 1);
  assert.equal(body.data.episodes[0]?.workspace_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(body.data.episodes[0]?.label, "Episode 1");
  assert.equal(body.data.episodes[0]?.archived_at, null);
});

test("GET /tongs/workspaces/:id/episodes requires x-forge-user-authorization header", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workspaces/11111111-1111-4111-8111-111111111111/episodes",
    {
      method: "GET",
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(calls.listWorkspaceEpisodes.length, 0);
  assert.equal(body.ok, false);
  assert.equal(body.error?.code, "missing_user_token_header");
});

test("GET /tongs/workspaces/:id/episodes?include_archived=1 enables archived rows", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workspaces/11111111-1111-4111-8111-111111111111/episodes?include_archived=1",
    {
      method: "GET",
      headers: {
        "x-forge-user-authorization": "Bearer user_token_abc",
      },
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.listWorkspaceEpisodes.length, 1);
  assert.equal(calls.listWorkspaceEpisodes[0]?.options?.includeArchived, true);
  assert.equal(body.ok, true);
});

test("GET /tongs/workspaces/:id/storage/:role dispatches listWorkspaceStorage", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workspaces/11111111-1111-4111-8111-111111111111/storage/recordings?prefix=2026/march&depth=2",
    {
      method: "GET",
      headers: {
        "x-forge-user-authorization": "Bearer user_token_abc",
      },
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.listWorkspaceStorage.length, 1);
  assert.equal(calls.listWorkspaceStorage[0]?.workspaceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.listWorkspaceStorage[0]?.role, "recordings");
  assert.equal(calls.listWorkspaceStorage[0]?.options?.prefix, "2026/march");
  assert.equal(calls.listWorkspaceStorage[0]?.options?.depth, 2);
  assert.equal(calls.listWorkspaceStorage[0]?.options?.userAccessToken, "user_token_abc");
  assert.equal(body.ok, true);
  assert.equal(body.data?.listing?.source?.kind, "cloud_canonical");
  assert.equal(body.data?.listing?.source?.root_path, "recordings/2026/march");
  assert.equal(body.data?.listing?.nodes?.[0]?.path, "recordings/session-01");
});

test("GET /tongs/workspaces/:id/storage/:role requires x-forge-user-authorization header", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workspaces/11111111-1111-4111-8111-111111111111/storage/recordings",
    { method: "GET" },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.ok, false);
  assert.equal(body.error?.code, "missing_user_token_header");
  assert.equal(calls.listWorkspaceStorage.length, 0);
});

test("GET /tongs/workspaces/:id/canonical-recordings dispatches listWorkspaceCanonicalRecordings", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workspaces/11111111-1111-4111-8111-111111111111/canonical-recordings?include_archived=1",
    {
      method: "GET",
      headers: {
        "x-forge-user-authorization": "Bearer user_token_abc",
      },
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.listWorkspaceCanonicalRecordings.length, 1);
  assert.equal(calls.listWorkspaceCanonicalRecordings[0]?.workspaceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.listWorkspaceCanonicalRecordings[0]?.options?.includeArchived, true);
  assert.equal(calls.listWorkspaceCanonicalRecordings[0]?.options?.userAccessToken, "user_token_abc");
  assert.equal(body.ok, true);
  assert.equal(body.data?.listing?.source?.kind, "cloud_workpiece_recordings");
  assert.equal(body.data?.listing?.nodes?.[0]?.children?.[0]?.path, "workpieces/11111111-1111-4111-8111-111111111111/recordings");
});

test("GET /tongs/workspaces/:id/canonical-recordings requires x-forge-user-authorization header", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workspaces/11111111-1111-4111-8111-111111111111/canonical-recordings",
    { method: "GET" },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.ok, false);
  assert.equal(body.error?.code, "missing_user_token_header");
  assert.equal(calls.listWorkspaceCanonicalRecordings.length, 0);
});

test("GET /tongs/workpieces/:id/storage dispatches listWorkpieceStorage", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workpieces/11111111-1111-4111-8111-111111111111/storage?prefix=script&depth=2",
    {
      method: "GET",
      headers: {
        "x-forge-user-authorization": "Bearer user_token_abc",
      },
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.listWorkpieceStorage.length, 1);
  assert.equal(calls.listWorkpieceStorage[0]?.workpieceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.listWorkpieceStorage[0]?.options?.prefix, "script");
  assert.equal(calls.listWorkpieceStorage[0]?.options?.depth, 2);
  assert.equal(calls.listWorkpieceStorage[0]?.options?.userAccessToken, "user_token_abc");
  assert.equal(body.ok, true);
  assert.equal(body.data?.listing?.source?.kind, "cloud_workpiece");
  assert.equal(body.data?.listing?.source?.root_path, "workpieces/11111111-1111-4111-8111-111111111111/script");
  assert.equal(body.data?.listing?.nodes?.[0]?.path, "workpieces/11111111-1111-4111-8111-111111111111/script");
});

test("GET /tongs/workpieces/:id/storage requires x-forge-user-authorization header", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workpieces/11111111-1111-4111-8111-111111111111/storage",
    { method: "GET" },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.ok, false);
  assert.equal(body.error?.code, "missing_user_token_header");
  assert.equal(calls.listWorkpieceStorage.length, 0);
});

test("POST /tongs/workpieces/:id/archive dispatches archiveWorkpiece", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workpieces/11111111-1111-4111-8111-111111111111/archive",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forge-user-authorization": "Bearer user_token_abc",
      },
      body: JSON.stringify({
        workspace_id: "22222222-2222-4222-8222-222222222222",
        reason: "duplicate cleanup",
      }),
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.archiveWorkpiece.length, 1);
  assert.equal(calls.archiveWorkpiece[0]?.workpieceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.archiveWorkpiece[0]?.input?.workspace_id, "22222222-2222-4222-8222-222222222222");
  assert.equal(calls.archiveWorkpiece[0]?.input?.reason, "duplicate cleanup");
  assert.equal(calls.archiveWorkpiece[0]?.options?.userAccessToken, "user_token_abc");
  assert.equal(body.ok, true);
  assert.equal(body.data?.workpiece?.archived_at, "2026-03-11T14:00:00.000Z");
});

test("POST /tongs/workpieces/:id/restore dispatches restoreWorkpiece", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workpieces/11111111-1111-4111-8111-111111111111/restore",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forge-user-authorization": "Bearer user_token_abc",
      },
      body: JSON.stringify({
        workspace_id: "22222222-2222-4222-8222-222222222222",
      }),
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.restoreWorkpiece.length, 1);
  assert.equal(calls.restoreWorkpiece[0]?.workpieceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.restoreWorkpiece[0]?.input?.workspace_id, "22222222-2222-4222-8222-222222222222");
  assert.equal(calls.restoreWorkpiece[0]?.options?.userAccessToken, "user_token_abc");
  assert.equal(body.ok, true);
  assert.equal(body.data?.workpiece?.archived_at, null);
});

test("GET /tongs/workspaces/:id/ready-scripts?unrecorded=1 enables unrecorded filter", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workspaces/11111111-1111-4111-8111-111111111111/ready-scripts?unrecorded=1",
    {
      method: "GET",
      headers: {
        "x-forge-user-authorization": "Bearer user_token_abc",
      },
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.listWorkspaceReadyScripts.length, 1);
  assert.equal(calls.listWorkspaceReadyScripts[0]?.workspaceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.listWorkspaceReadyScripts[0]?.options?.unrecordedOnly, true);
  assert.equal(calls.listWorkspaceReadyScripts[0]?.options?.userAccessToken, "user_token_abc");
  assert.equal(body.ok, true);
});

test("GET /tongs/workspaces/:id/ready-scripts?include_hidden=1 enables hidden queue rows", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workspaces/11111111-1111-4111-8111-111111111111/ready-scripts?include_hidden=1",
    {
      method: "GET",
      headers: {
        "x-forge-user-authorization": "Bearer user_token_abc",
      },
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.listWorkspaceReadyScripts.length, 1);
  assert.equal(calls.listWorkspaceReadyScripts[0]?.options?.includeHidden, true);
  assert.equal(body.ok, true);
  assert.equal(body.data.scripts[0]?.queue_rank, 0);
  assert.equal(body.data.scripts[0]?.hidden_at, null);
  assert.equal(body.data.scripts[0]?.hidden_by, null);
});

test("GET /tongs/workspaces/:id/ready-scripts forwards x-forge-user-authorization token", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workspaces/11111111-1111-4111-8111-111111111111/ready-scripts",
    {
      method: "GET",
      headers: {
        "x-forge-user-authorization": "Bearer user_token_123",
      },
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.listWorkspaceReadyScripts.length, 1);
  assert.equal(calls.listWorkspaceReadyScripts[0]?.options?.userAccessToken, "user_token_123");
  assert.equal(body.ok, true);
});

test("GET /tongs/workspaces/:id/ready-scripts requires x-forge-user-authorization header", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workspaces/11111111-1111-4111-8111-111111111111/ready-scripts",
    { method: "GET" },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.ok, false);
  assert.equal(body.error?.code, "missing_user_token_header");
  assert.equal(typeof body.error?.request_id, "string");
  assert.equal(calls.listWorkspaceReadyScripts.length, 0);
});

test("DELETE /tongs/workpieces/:id/ready-script dispatches deleteReadyScript", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workpieces/11111111-1111-4111-8111-111111111111/ready-script?path=script%2Fscript.md",
    {
      method: "DELETE",
      headers: {
        "x-forge-user-authorization": "Bearer user_token_abc",
      },
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.deleteReadyScript.length, 1);
  assert.equal(calls.deleteReadyScript[0]?.workpieceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.deleteReadyScript[0]?.path, "script/script.md");
  assert.equal(calls.deleteReadyScript[0]?.options?.userAccessToken, "user_token_abc");
  assert.equal(body.ok, true);
  assert.equal(body.data?.deleted, true);
  assert.equal(body.data?.path, "script/script.md");
  assert.equal(body.data?.already_deleted, false);
  assert.equal(body.data?.removed_session_item_count, 0);
  assert.equal(body.data?.ready_meta_deleted, true);
  assert.equal(Array.isArray(body.data?.warnings), true);
});

test("POST /tongs/workspaces/:id/ready-queue-state dispatches updateWorkspaceReadyQueueState", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workspaces/11111111-1111-4111-8111-111111111111/ready-queue-state",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forge-user-authorization": "Bearer user_token_abc",
      },
      body: JSON.stringify({
        entries: [
          {
            workpiece_id: "22222222-2222-4222-8222-222222222222",
            queue_rank: 0,
          },
          {
            workpiece_id: "33333333-3333-4333-8333-333333333333",
            hidden: true,
          },
        ],
      }),
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.updateWorkspaceReadyQueueState.length, 1);
  assert.equal(calls.updateWorkspaceReadyQueueState[0]?.workspaceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls.updateWorkspaceReadyQueueState[0]?.options?.userAccessToken, "user_token_abc");
  assert.deepEqual(calls.updateWorkspaceReadyQueueState[0]?.input?.entries, [
    {
      workpiece_id: "22222222-2222-4222-8222-222222222222",
      queue_rank: 0,
    },
    {
      workpiece_id: "33333333-3333-4333-8333-333333333333",
      hidden: true,
    },
  ]);
  assert.equal(body.ok, true);
  assert.equal(body.data?.updated_count, 2);
  assert.equal(body.data?.deleted_count, 0);
});

test("POST /tongs/workspaces/:id/ready-queue-state requires x-forge-user-authorization header", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workspaces/11111111-1111-4111-8111-111111111111/ready-queue-state",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        entries: [{ workpiece_id: "22222222-2222-4222-8222-222222222222", hidden: true }],
      }),
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.ok, false);
  assert.equal(body.error?.code, "missing_user_token_header");
  assert.equal(calls.updateWorkspaceReadyQueueState.length, 0);
});

test("TongsCommitService.listWorkspaceReadyScripts hides hidden and archived queue rows by default and ignores orphan queue state", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const otherWorkspaceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const viewerId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const workpieceA = "11111111-1111-4111-8111-111111111111";
  const workpieceB = "22222222-2222-4222-8222-222222222222";
  const workpieceC = "33333333-3333-4333-8333-333333333333";
  const workpieceD = "44444444-4444-4444-8444-444444444444";

  const { state, ...supabase } = createReadyQueueSupabase({
    workspaceId,
    episodes: [
      {
        id: workpieceA,
        workspace_id: workspaceId,
        label: "Ready Alpha",
        updated_at: "2026-03-09T10:00:00.000Z",
        created_at: "2026-03-01T10:00:00.000Z",
        archived_at: null,
        archived_by: null,
        archive_reason: null,
      },
      {
        id: workpieceB,
        workspace_id: workspaceId,
        label: "Ready Beta",
        updated_at: "2026-03-08T10:00:00.000Z",
        created_at: "2026-03-01T09:00:00.000Z",
        archived_at: null,
        archived_by: null,
        archive_reason: null,
      },
      {
        id: workpieceC,
        workspace_id: workspaceId,
        label: "Ready Gamma",
        updated_at: "2026-03-07T10:00:00.000Z",
        created_at: "2026-03-01T08:00:00.000Z",
        archived_at: null,
        archived_by: null,
        archive_reason: null,
      },
      {
        id: workpieceD,
        workspace_id: workspaceId,
        label: "Ready Delta",
        updated_at: "2026-03-06T10:00:00.000Z",
        created_at: "2026-03-01T07:00:00.000Z",
        archived_at: "2026-03-10T15:00:00.000Z",
        archived_by: viewerId,
        archive_reason: "sent back to archive",
      },
    ],
    files: [
      {
        workpiece_id: workpieceA,
        path: "script/script.md",
        updated_at: "2026-03-09T10:30:00.000Z",
        created_at: "2026-03-09T10:00:00.000Z",
      },
      {
        workpiece_id: workpieceB,
        path: "scripts/script.anvil.txt",
        updated_at: "2026-03-08T10:30:00.000Z",
        created_at: "2026-03-08T10:00:00.000Z",
      },
      {
        workpiece_id: workpieceD,
        path: "script/script.md",
        updated_at: "2026-03-06T10:30:00.000Z",
        created_at: "2026-03-06T10:00:00.000Z",
      },
    ],
    readyMeta: [
      {
        workspace_id: workspaceId,
        workpiece_id: workpieceA,
        script_path: "script/script.md",
        marked_ready_by: viewerId,
        marked_ready_at: "2026-03-09T10:30:00.000Z",
      },
      {
        workspace_id: workspaceId,
        workpiece_id: workpieceB,
        script_path: "scripts/script.anvil.txt",
        marked_ready_by: viewerId,
        marked_ready_at: "2026-03-08T10:30:00.000Z",
      },
      {
        workspace_id: workspaceId,
        workpiece_id: workpieceD,
        script_path: "script/script.md",
        marked_ready_by: viewerId,
        marked_ready_at: "2026-03-06T10:30:00.000Z",
      },
    ],
    queueState: [
      {
        workspace_id: workspaceId,
        workpiece_id: workpieceA,
        queue_rank: 5,
        hidden_at: null,
        hidden_by: null,
        updated_at: "2026-03-10T12:00:00.000Z",
        updated_by: viewerId,
      },
      {
        workspace_id: workspaceId,
        workpiece_id: workpieceB,
        queue_rank: 0,
        hidden_at: "2026-03-10T12:30:00.000Z",
        hidden_by: viewerId,
        updated_at: "2026-03-10T12:30:00.000Z",
        updated_by: viewerId,
      },
      {
        workspace_id: workspaceId,
        workpiece_id: workpieceC,
        queue_rank: 99,
        hidden_at: null,
        hidden_by: null,
        updated_at: "2026-03-10T13:00:00.000Z",
        updated_by: viewerId,
      },
      {
        workspace_id: otherWorkspaceId,
        workpiece_id: workpieceA,
        queue_rank: 0,
        hidden_at: "2026-03-09T00:00:00.000Z",
        hidden_by: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        updated_at: "2026-03-09T00:00:00.000Z",
        updated_by: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      },
    ],
  });

  const service = new TongsCommitService(supabase, "forge-workpieces", null);
  service.getWorkspaceOrThrow = async () => ({
    id: workspaceId,
    created_by: viewerId,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    storage_profile: null,
  });
  service.assertWorkspaceRoleFromAccessToken = async () => ({ userId: viewerId, role: "viewer" });

  const result = await service.listWorkspaceReadyScripts(workspaceId, {
    userAccessToken: "viewer_token",
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.workpiece_id, workpieceA);
  assert.equal(result[0]?.queue_rank, 5);
  assert.equal(result[0]?.hidden_at, null);
  assert.equal(result[0]?.hidden_by, null);
  assert.equal(result[0]?.primary_script_path, "script/script.md");
  assert.deepEqual(result[0]?.script_paths, ["script/script.md"]);
  assert.equal(result.some((row) => row.workpiece_id === workpieceB), false);
  assert.equal(result.some((row) => row.workpiece_id === workpieceC), false);
  assert.equal(result.some((row) => row.workpiece_id === workpieceD), false);
  assert.equal(state.queueStateRows.length, 4);
});

test("TongsCommitService.listWorkspaceEpisodes returns workspace-scoped summaries ordered by freshness", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const otherWorkspaceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const viewerId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  const { ...supabase } = createReadyQueueSupabase({
    workspaceId,
    episodes: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        workspace_id: workspaceId,
        label: "Newest Episode",
        updated_at: "2026-03-10T10:00:00.000Z",
        created_at: "2026-03-01T10:00:00.000Z",
        archived_at: null,
        archived_by: null,
        archive_reason: null,
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        workspace_id: workspaceId,
        label: "Older Episode",
        updated_at: "2026-03-08T10:00:00.000Z",
        created_at: "2026-03-01T09:00:00.000Z",
        archived_at: "2026-03-11T09:00:00.000Z",
        archived_by: viewerId,
        archive_reason: "duplicate cleanup",
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        workspace_id: otherWorkspaceId,
        label: "Other Workspace Episode",
        updated_at: "2026-03-11T10:00:00.000Z",
        created_at: "2026-03-01T08:00:00.000Z",
        archived_at: null,
        archived_by: null,
        archive_reason: null,
      },
    ],
  });

  const service = new TongsCommitService(supabase, "forge-workpieces", null);
  service.getWorkspaceOrThrow = async () => ({
    id: workspaceId,
    created_by: viewerId,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    storage_profile: null,
  });
  service.assertWorkspaceRoleFromAccessToken = async () => ({ userId: viewerId, role: "viewer" });

  const result = await service.listWorkspaceEpisodes(workspaceId, {
    userAccessToken: "viewer_token",
  });

  assert.deepEqual(
    result.map((row) => row.id),
    [
      "11111111-1111-4111-8111-111111111111",
    ],
  );
  assert.equal(result[0]?.workspace_id, workspaceId);
  assert.equal(result[0]?.label, "Newest Episode");
  assert.equal(result.some((row) => row.workspace_id === otherWorkspaceId), false);
  assert.equal(result.some((row) => row.archived_at != null), false);
});

test("TongsCommitService.listWorkspaceEpisodes includes archived rows when requested", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const viewerId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  const { ...supabase } = createReadyQueueSupabase({
    workspaceId,
    episodes: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        workspace_id: workspaceId,
        label: "Active Episode",
        updated_at: "2026-03-10T10:00:00.000Z",
        created_at: "2026-03-01T10:00:00.000Z",
        archived_at: null,
        archived_by: null,
        archive_reason: null,
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        workspace_id: workspaceId,
        label: "Archived Episode",
        updated_at: "2026-03-11T10:00:00.000Z",
        created_at: "2026-03-01T09:00:00.000Z",
        archived_at: "2026-03-11T09:00:00.000Z",
        archived_by: viewerId,
        archive_reason: "cleanup",
      },
    ],
  });

  const service = new TongsCommitService(supabase, "forge-workpieces", null);
  service.getWorkspaceOrThrow = async () => ({
    id: workspaceId,
    created_by: viewerId,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    storage_profile: null,
  });
  service.assertWorkspaceRoleFromAccessToken = async () => ({ userId: viewerId, role: "viewer" });

  const result = await service.listWorkspaceEpisodes(workspaceId, {
    userAccessToken: "viewer_token",
    includeArchived: true,
  });

  assert.deepEqual(
    result.map((row) => row.id),
    [
      "22222222-2222-4222-8222-222222222222",
      "11111111-1111-4111-8111-111111111111",
    ],
  );
  assert.equal(result[0]?.archived_at, "2026-03-11T09:00:00.000Z");
});

test("TongsCommitService.archiveWorkpiece and restoreWorkpiece update episodes and append events", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const editorId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const workpieceId = "11111111-1111-4111-8111-111111111111";
  const events = [];

  const { ...supabase } = createReadyQueueSupabase({
    workspaceId,
    episodes: [
      {
        id: workpieceId,
        workspace_id: workspaceId,
        label: "Archivable Episode",
        updated_at: "2026-03-10T10:00:00.000Z",
        created_at: "2026-03-01T10:00:00.000Z",
        archived_at: null,
        archived_by: null,
        archive_reason: null,
      },
    ],
    events,
  });

  const service = new TongsCommitService(supabase, "forge-workpieces", null);
  service.getWorkspaceOrThrow = async () => ({
    id: workspaceId,
    created_by: editorId,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    storage_profile: null,
  });
  service.assertWorkspaceRoleFromAccessToken = async () => ({ userId: editorId, role: "editor" });

  const archived = await service.archiveWorkpiece(workpieceId, {
    workspace_id: workspaceId,
    reason: "duplicate cleanup",
  }, {
    userAccessToken: "editor_token",
  });
  assert.equal(archived.archived_by, editorId);
  assert.equal(archived.archive_reason, "duplicate cleanup");
  assert.ok(typeof archived.archived_at === "string");

  const restored = await service.restoreWorkpiece(workpieceId, {
    workspace_id: workspaceId,
  }, {
    userAccessToken: "editor_token",
  });
  assert.equal(restored.archived_at, null);
  assert.equal(restored.archived_by, null);
  assert.equal(restored.archive_reason, null);

  assert.equal(events.length, 2);
  assert.equal(events[0]?.event_name, "hearth.workpiece.archived.v1");
  assert.equal(events[1]?.event_name, "hearth.workpiece.restored.v1");
});

test("TongsCommitService.restoreWorkpiece clears active ready eligibility without deleting planner history", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const editorId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const workpieceId = "11111111-1111-4111-8111-111111111111";
  const events = [];

  const { state, ...supabase } = createReadyQueueSupabase({
    workspaceId,
    episodes: [
      {
        id: workpieceId,
        workspace_id: workspaceId,
        label: "Restorable Ready Episode",
        updated_at: "2026-03-10T10:00:00.000Z",
        created_at: "2026-03-01T10:00:00.000Z",
        archived_at: "2026-03-11T09:00:00.000Z",
        archived_by: editorId,
        archive_reason: "pause work",
      },
    ],
    files: [
      {
        workpiece_id: workpieceId,
        path: "script/script.md",
        updated_at: "2026-03-10T10:30:00.000Z",
        created_at: "2026-03-10T10:00:00.000Z",
        file_type: "script_markdown",
        content_type: "text/markdown; charset=utf-8",
        bytes: 123,
        hash_algo: "sha256",
        hash_value: "abc",
        storage_bucket: "forge-workpieces",
        storage_key: `workpieces/${workpieceId}/script/script.md`,
      },
    ],
    readyMeta: [
      {
        workspace_id: workspaceId,
        workpiece_id: workpieceId,
        script_path: "script/script.md",
        marked_ready_by: editorId,
        marked_ready_at: "2026-03-10T10:30:00.000Z",
      },
    ],
    events,
  });

  const service = new TongsCommitService(supabase, "forge-workpieces", null);
  service.getWorkspaceOrThrow = async () => ({
    id: workspaceId,
    created_by: editorId,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    storage_profile: null,
  });
  service.assertWorkspaceRoleFromAccessToken = async () => ({ userId: editorId, role: "editor" });
  service.getCradleOrThrow = async () => ({
    id: workpieceId,
    workspace_id: workspaceId,
    label: "Restorable Ready Episode",
    status: "draft",
    manifest_path: "manifest.json",
    metadata: {},
    created_by: null,
    created_at: "2026-03-01T10:00:00.000Z",
    updated_at: "2026-03-10T10:00:00.000Z",
  });
  service.loadManifestOrDefault = async () => createManifestFixture(workpieceId, workspaceId);
  service.upsertWorkpieceFile = async () => {};

  const beforeRestore = await service.listWorkspaceReadyScripts(workspaceId, {
    userAccessToken: "editor_token",
  });
  assert.equal(beforeRestore.length, 0, "Archived workpieces are excluded before restore");

  const restored = await service.restoreWorkpiece(workpieceId, {
    workspace_id: workspaceId,
  }, {
    userAccessToken: "editor_token",
  });

  assert.equal(restored.archived_at, null);
  assert.equal(state.fileRows.some((row) => row.workpiece_id === workpieceId && row.path === "script/script.md"), false);
  assert.equal(state.readyMetaRows.some((row) => row.workpiece_id === workpieceId), false);

  const afterRestore = await service.listWorkspaceReadyScripts(workspaceId, {
    userAccessToken: "editor_token",
  });
  assert.deepEqual(afterRestore, [], "Restore should not silently reinstate Ready candidacy");

  assert.equal(events.at(-1)?.event_name, "hearth.workpiece.restored.v1");
  assert.deepEqual(events.at(-1)?.payload?.cleared_ready_paths, ["script/script.md"]);
  assert.equal(events.at(-1)?.payload?.ready_revalidation_required, true);
});

test("TongsCommitService.getWorkpieceImageMap returns normalized semantic entries plus current asset summary", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const workpieceId = "11111111-1111-4111-8111-111111111111";
  const viewerId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const { ...supabase } = createImageMapAssetSupabase({
    assets: [
      {
        id: "asset-current",
        workspace_id: workspaceId,
        workpiece_id: workpieceId,
        path: "assets/image-map/image-map.v1.json",
        mime_type: "application/json",
        bytes: 123,
        storage_bucket: "forge-workpieces",
        storage_key: `workpieces/${workpieceId}/assets/image-map/image-map.v1.json`,
        provider: "hearth",
        provider_request_id: null,
        request_id: "req-current",
        prompt: null,
        created_by: viewerId,
        created_at: "2026-03-10T16:00:00.000Z",
        updated_at: "2026-03-10T16:00:00.000Z",
        asset_kind: "image_map_json",
        status: "ready",
        metadata_json: {
          schema: "forge.image-map.v1",
          entry_count: 1,
        },
        supersedes_asset_id: null,
      },
    ],
  });

  const service = new TongsCommitService(supabase, "forge-workpieces", null);
  service.getCradleOrThrow = async () => ({
    id: workpieceId,
    workspace_id: workspaceId,
    label: "Episode",
    status: "draft",
    manifest_path: "manifest.json",
    metadata: {},
    created_by: null,
    created_at: "2026-03-02T00:00:00.000Z",
    updated_at: "2026-03-02T00:00:00.000Z",
  });
  service.assertWorkspaceRoleFromAccessToken = async () => ({ userId: viewerId, role: "viewer" });
  service.readWorkpieceJson = async () => ({
    found: true,
    data: {
      episode: {
        schema: "forge.episode.package.v2",
        image_map: {
          entries: [
            {
              id: "image-map-01",
              anchor: "s1:p1#sent1",
              script_anchor: {
                section_id: "s1",
                paragraph_id: "s1:p1",
                paragraph_order: 1,
                sentence_start: 1,
                sentence_end: 1,
                char_start: 0,
                char_end: 18,
                span_text: "wide city skyline",
                speaker_block_id: null,
              },
              description: "wide city skyline",
              visual_intent: "wide city skyline",
              prompt_basis: "wide city skyline",
              intent: "broll",
              source_type: "script",
              beat_order: 1,
              paragraph_beat_order: 1,
              candidate_assets: [],
              selected_asset_id: null,
              status: "mapped",
              placement_hint: "after-hook",
            },
          ],
        },
      },
    },
    file_row: { updated_at: "2026-03-10T15:59:00.000Z" },
  });

  const result = await service.getWorkpieceImageMap(workpieceId, {
    userAccessToken: "viewer_token",
  });

  assert.equal(result.image_map.workpiece_id, workpieceId);
  assert.equal(result.image_map.workspace_id, workspaceId);
  assert.equal(result.image_map.metadata_updated_at, "2026-03-10T15:59:00.000Z");
  assert.equal(result.image_map.entries.length, 1);
  assert.equal(result.image_map.entries[0]?.source_type, "stock");
  assert.equal(result.image_map.entries[0]?.script_anchor?.paragraph_id, "s1:p1");
  assert.equal(result.image_map.entries[0]?.beat_order, 1);
  assert.equal(result.asset?.asset_kind, "image_map_json");
  assert.equal(result.asset?.metadata_json.entry_count, 1);
});

test("TongsCommitService.getWorkpieceVisualPackage returns Hammer-ready ordering plus selected asset retrieval info", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const workpieceId = "11111111-1111-4111-8111-111111111111";
  const viewerId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const { ...supabase } = createImageMapAssetSupabase({
    assets: [
      {
        id: "asset-current",
        workspace_id: workspaceId,
        workpiece_id: workpieceId,
        path: "assets/image-map/image-map.v1.json",
        mime_type: "application/json",
        bytes: 123,
        storage_bucket: "forge-workpieces",
        storage_key: `workpieces/${workpieceId}/assets/image-map/image-map.v1.json`,
        provider: "hearth",
        provider_request_id: null,
        request_id: "req-current",
        prompt: null,
        created_by: viewerId,
        created_at: "2026-03-10T16:00:00.000Z",
        updated_at: "2026-03-10T16:00:00.000Z",
        asset_kind: "image_map_json",
        status: "ready",
        metadata_json: {
          schema: "forge.image-map.v1",
          entry_count: 2,
        },
        supersedes_asset_id: null,
      },
      {
        id: "candidate-01",
        workspace_id: workspaceId,
        workpiece_id: workpieceId,
        path: `assets/image-map/candidates/${workpieceId}/image-map-01/explainer.png`,
        mime_type: "image/png",
        bytes: 4567,
        storage_bucket: "forge-workpieces",
        storage_key: `workpieces/${workpieceId}/assets/image-map/candidates/${workpieceId}/image-map-01/explainer.png`,
        provider: "openai",
        provider_request_id: "req-provider-01",
        request_id: "req-local-01",
        prompt: "Prompt explainer",
        created_by: viewerId,
        created_at: "2026-03-10T16:01:00.000Z",
        updated_at: "2026-03-10T16:01:00.000Z",
        asset_kind: "image_map_candidate_image",
        status: "ready",
        metadata_json: {
          schema: "forge.image-map-candidate.v1",
          image_map_entry_id: "image-map-01",
          visual_mode: "comparison",
          variant_label: "explainer",
          beat_order: 1,
          paragraph_beat_order: 1,
        },
        supersedes_asset_id: null,
      },
    ],
  });

  const service = new TongsCommitService(supabase, "forge-workpieces", null);
  service.getCradleOrThrow = async () => ({
    id: workpieceId,
    workspace_id: workspaceId,
    label: "Episode",
    status: "draft",
    manifest_path: "manifest.json",
    metadata: {},
    created_by: null,
    created_at: "2026-03-02T00:00:00.000Z",
    updated_at: "2026-03-02T00:00:00.000Z",
  });
  service.assertWorkspaceRoleFromAccessToken = async () => ({ userId: viewerId, role: "viewer" });
  service.loadManifestOrDefault = async () => {
    const manifest = createManifestFixture(workpieceId, workspaceId);
    manifest.pointers.script_primary = "script/script.md";
    manifest.files["script/script.md"] = {
      type: "script",
      content_type: "text/markdown; charset=utf-8",
      bytes: 321,
      hash: {
        algo: "sha256",
        value: "hash-script",
      },
      written_by: {
        tool: "hearth",
        tool_version: "0.0.0",
        lane: "forge-managed",
      },
      updated_at: "2026-03-10T15:58:00.000Z",
    };
    return manifest;
  };
  service.readWorkpieceJson = async () => ({
    found: true,
    data: {
      episode: {
        schema: "forge.episode.package.v2",
        image_map: {
          entries: [
            {
              id: "image-map-02",
              anchor: "s1:p1#sent2",
              script_anchor: {
                section_id: "s1",
                paragraph_id: "s1:p1",
                paragraph_order: 1,
                sentence_start: 2,
                sentence_end: 2,
                char_start: 28,
                char_end: 55,
                span_text: "The skyline held at dawn.",
                speaker_block_id: null,
              },
              description: "The skyline held at dawn.",
              visual_intent: "wide skyline hold",
              prompt_basis: "wide skyline hold",
              intent: "broll",
              source_type: "stock",
              beat_order: 2,
              paragraph_beat_order: 2,
              candidate_assets: [],
              selected_asset_id: null,
              status: "mapped",
              placement_hint: "after-scene",
            },
            {
              id: "image-map-01",
              anchor: "s1:p1#sent1",
              script_anchor: {
                section_id: "s1",
                paragraph_id: "s1:p1",
                paragraph_order: 1,
                sentence_start: 1,
                sentence_end: 1,
                char_start: 0,
                char_end: 27,
                span_text: "Jackson faced overwhelming odds.",
                speaker_block_id: null,
              },
              description: "Jackson faced overwhelming odds.",
              visual_intent: "Strategic troop comparison",
              prompt_basis: "Strategic troop comparison near New Orleans",
              intent: "broll",
              source_type: "ai",
              beat_order: 1,
              paragraph_beat_order: 1,
              candidate_assets: [
                {
                  asset_id: "candidate-01",
                  path: `assets/image-map/candidates/${workpieceId}/image-map-01/explainer.png`,
                  variant_label: "explainer",
                  visual_mode: "comparison",
                  mime_type: "image/png",
                },
              ],
              selected_asset_id: "candidate-01",
              status: "selected",
              placement_hint: null,
            },
          ],
        },
      },
    },
    file_row: { updated_at: "2026-03-10T15:59:00.000Z" },
  });

  const result = await service.getWorkpieceVisualPackage(workpieceId, {
    userAccessToken: "viewer_token",
  });

  assert.equal(result.workspace_id, workspaceId);
  assert.equal(result.workpiece_id, workpieceId);
  assert.equal(result.script_path, "script/script.md");
  assert.equal(result.script_updated_at, "2026-03-10T15:58:00.000Z");
  assert.equal(result.image_map_updated_at, "2026-03-10T15:59:00.000Z");
  assert.equal(result.image_map_asset_updated_at, "2026-03-10T16:00:00.000Z");
  assert.equal(result.visuals.length, 2);
  assert.equal(result.visuals[0]?.entry_id, "image-map-01");
  assert.equal(result.visuals[0]?.visual_mode, "comparison");
  assert.equal(result.visuals[0]?.selected_asset?.asset_id, "candidate-01");
  assert.equal(result.visuals[0]?.selected_asset?.storage_key.endsWith("/image-map-01/explainer.png"), true);
  assert.equal(result.visuals[1]?.entry_id, "image-map-02");
  assert.equal(result.visuals[1]?.selected_asset, null);
});

test("TongsCommitService.saveWorkpieceImageMap writes metadata, asset file, and refreshes the current image-map asset row", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const workpieceId = "11111111-1111-4111-8111-111111111111";
  const editorId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const commitCalls = [];
  const { state, ...supabase } = createImageMapAssetSupabase({
    assets: [
      {
        id: "asset-old",
        workspace_id: workspaceId,
        workpiece_id: workpieceId,
        path: "assets/image-map/image-map.v1.json",
        mime_type: "application/json",
        bytes: 111,
        storage_bucket: "forge-workpieces",
        storage_key: `workpieces/${workpieceId}/assets/image-map/image-map.v1.json`,
        provider: "hearth",
        provider_request_id: null,
        request_id: "req-old",
        prompt: null,
        created_by: editorId,
        created_at: "2026-03-10T15:00:00.000Z",
        updated_at: "2026-03-10T15:00:00.000Z",
        asset_kind: "image_map_json",
        status: "ready",
        metadata_json: {
          schema: "forge.image-map.v1",
          entry_count: 1,
        },
        supersedes_asset_id: null,
      },
    ],
  });

  const service = new TongsCommitService(supabase, "forge-workpieces", null);
  service.getWorkspaceOrThrow = async () => ({
    id: workspaceId,
    created_by: editorId,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    storage_profile: null,
  });
  service.assertWorkpieceInWorkspace = async () => ({
    id: workpieceId,
    workspace_id: workspaceId,
    label: "Episode",
    status: "draft",
    manifest_path: "manifest.json",
    metadata: {},
    created_by: null,
    created_at: "2026-03-02T00:00:00.000Z",
    updated_at: "2026-03-02T00:00:00.000Z",
  });
  service.assertWorkspaceRoleFromAccessToken = async () => ({ userId: editorId, role: "editor" });
  service.readWorkpieceJson = async () => ({
    found: true,
    data: {
      schema: "forge.metadata.v1",
      workpiece_id: workpieceId,
      workspace_id: workspaceId,
      episode: {
        schema: "forge.episode.package.v2",
        image_map: {
          entries: [],
        },
      },
    },
    file_row: { updated_at: "2026-03-10T15:30:00.000Z" },
  });
  service.commitFile = async (targetWorkpieceId, input) => {
    commitCalls.push({ targetWorkpieceId, input });
    return {
      workpiece_id: targetWorkpieceId,
      path: input.path,
      storage_key: `workpieces/${targetWorkpieceId}/${input.path}`,
      hash: "hash-file",
      bytes: input.path === "metadata.json" ? 222 : 333,
      content_type: input.content_type || "application/json",
      manifest_hash: "hash-manifest",
      manifest_bytes: 456,
      file_row: {
        workpiece_id: targetWorkpieceId,
        path: input.path,
        file_type: "json",
        content_type: input.content_type || "application/json",
        bytes: input.path === "metadata.json" ? 222 : 333,
        hash_algo: "sha256",
        hash_value: "hash-file",
        storage_bucket: "forge-workpieces",
        storage_key: `workpieces/${targetWorkpieceId}/${input.path}`,
        written_by_tool: input.written_by.tool,
        written_by_tool_version: input.written_by.tool_version,
        written_by_lane: input.written_by.lane,
        created_at: "2026-03-10T16:05:00.000Z",
        updated_at: input.path === "metadata.json"
          ? "2026-03-10T16:05:00.000Z"
          : "2026-03-10T16:05:01.000Z",
      },
      manifest_row: {
        workpiece_id: targetWorkpieceId,
        path: "manifest.json",
        file_type: "manifest",
        content_type: "application/json",
        bytes: 456,
        hash_algo: "sha256",
        hash_value: "hash-manifest",
        storage_bucket: "forge-workpieces",
        storage_key: `workpieces/${targetWorkpieceId}/manifest.json`,
        written_by_tool: input.written_by.tool,
        written_by_tool_version: input.written_by.tool_version,
        written_by_lane: input.written_by.lane,
        created_at: "2026-03-10T16:05:00.000Z",
        updated_at: "2026-03-10T16:05:00.000Z",
      },
      event: {
        id: 900,
        workpiece_id: targetWorkpieceId,
        event_name: input.event_name || "workpiece.file.committed",
        payload: {},
        correlation_id: "corr-123",
        written_by_tool: input.written_by.tool,
        written_by_tool_version: input.written_by.tool_version,
        written_by_lane: input.written_by.lane,
        created_at: "2026-03-10T16:05:00.000Z",
      },
    };
  };

  const result = await service.saveWorkpieceImageMap(
    workpieceId,
    {
      workspace_id: workspaceId,
      entries: [
        {
          id: "image-map-01",
          anchor: "s1:p1#sent1",
          script_anchor: {
            section_id: "s1",
            paragraph_id: "s1:p1",
            paragraph_order: 1,
            sentence_start: 1,
            sentence_end: 1,
            char_start: 0,
            char_end: 18,
            span_text: "wide city skyline",
            speaker_block_id: null,
          },
          description: "wide city skyline",
          visual_intent: "wide city skyline",
          prompt_basis: "wide city skyline",
          intent: "broll",
          source_type: "stock",
          beat_order: 1,
          paragraph_beat_order: 1,
          candidate_assets: [],
          selected_asset_id: null,
          status: "mapped",
          placement_hint: "after-hook",
        },
      ],
      spoken_beats: [
        {
          id: "beat-s1-01",
          speaker: "s1",
          format: "bullet_outline",
          order: 1,
          speaker_order: 1,
          speaker_turn: 1,
          text: "Open with the skyline establishing shot.",
          normalized_label: "open with the skyline establishing shot",
          cue_phrase: "Open with the skyline",
        },
      ],
      expected_metadata_updated_at: "2026-03-10T15:30:00.000Z",
    },
    { userAccessToken: "editor_token" },
  );

  assert.equal(commitCalls.length, 2);
  assert.equal(commitCalls[0]?.input.path, "metadata.json");
  assert.equal(commitCalls[1]?.input.path, "assets/image-map/image-map.v1.json");
  assert.equal(commitCalls[0]?.input.json?.episode?.image_map?.entries?.length, 1);
  assert.equal(commitCalls[0]?.input.json?.episode?.image_map?.entries?.[0]?.script_anchor?.paragraph_id, "s1:p1");
  assert.equal(commitCalls[0]?.input.json?.episode?.spoken_beats?.[0]?.id, "beat-s1-01");
  assert.equal(commitCalls[1]?.input.json?.spoken_beats?.[0]?.cue_phrase, "Open with the skyline");
  assert.equal(commitCalls[1]?.input.json?.schema, "forge.image-map.v1");
  assert.equal(commitCalls[1]?.input.json?.workpiece_id, workpieceId);
  assert.equal(state.updateCalls.length, 1);
  assert.equal(state.updateCalls[0]?.id, "asset-old");
  assert.equal(state.updateCalls[0]?.patch?.status, "ready");
  assert.equal(state.updateCalls[0]?.patch?.request_id, "corr-123");
  assert.equal(state.updateCalls[0]?.patch?.storage_key, `workpieces/${workpieceId}/assets/image-map/image-map.v1.json`);
  assert.equal(state.insertCalls.length, 0);
  assert.equal(result.image_map.metadata_updated_at, "2026-03-10T16:05:00.000Z");
  assert.equal(result.asset?.supersedes_asset_id, null);
});

test("TongsCommitService.saveWorkpieceImageMap recovers a superseded image-map asset when no ready row exists", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const workpieceId = "11111111-1111-4111-8111-111111111111";
  const editorId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const commitCalls = [];
  const { state, ...supabase } = createImageMapAssetSupabase({
    assets: [
      {
        id: "asset-superseded",
        workspace_id: workspaceId,
        workpiece_id: workpieceId,
        path: "assets/image-map/image-map.v1.json",
        mime_type: "application/json",
        bytes: 111,
        storage_bucket: "forge-workpieces",
        storage_key: `workpieces/${workpieceId}/assets/image-map/image-map.v1.json`,
        provider: "hearth",
        provider_request_id: null,
        request_id: "req-old",
        prompt: null,
        created_by: editorId,
        created_at: "2026-03-10T15:00:00.000Z",
        updated_at: "2026-03-10T15:00:00.000Z",
        asset_kind: "image_map_json",
        status: "superseded",
        metadata_json: {
          schema: "forge.image-map.v1",
          entry_count: 1,
        },
        supersedes_asset_id: null,
      },
    ],
  });

  const service = new TongsCommitService(supabase, "forge-workpieces", null);
  service.getWorkspaceOrThrow = async () => ({
    id: workspaceId,
    created_by: editorId,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    storage_profile: null,
  });
  service.assertWorkpieceInWorkspace = async () => ({
    id: workpieceId,
    workspace_id: workspaceId,
    label: "Episode",
    status: "draft",
    manifest_path: "manifest.json",
    metadata: {},
    created_by: null,
    created_at: "2026-03-02T00:00:00.000Z",
    updated_at: "2026-03-02T00:00:00.000Z",
  });
  service.assertWorkspaceRoleFromAccessToken = async () => ({ userId: editorId, role: "editor" });
  service.readWorkpieceJson = async () => ({
    found: true,
    data: {
      schema: "forge.metadata.v1",
      workpiece_id: workpieceId,
      workspace_id: workspaceId,
      episode: {
        schema: "forge.episode.package.v2",
        image_map: {
          entries: [],
        },
      },
    },
    file_row: { updated_at: "2026-03-10T15:30:00.000Z" },
  });
  service.commitFile = async (targetWorkpieceId, input) => {
    commitCalls.push({ targetWorkpieceId, input });
    return {
      workpiece_id: targetWorkpieceId,
      path: input.path,
      storage_key: `workpieces/${targetWorkpieceId}/${input.path}`,
      hash: "hash-file",
      bytes: input.path === "metadata.json" ? 222 : 333,
      content_type: input.content_type || "application/json",
      manifest_hash: "hash-manifest",
      manifest_bytes: 456,
      file_row: {
        workpiece_id: targetWorkpieceId,
        path: input.path,
        file_type: "json",
        content_type: input.content_type || "application/json",
        bytes: input.path === "metadata.json" ? 222 : 333,
        hash_algo: "sha256",
        hash_value: "hash-file",
        storage_bucket: "forge-workpieces",
        storage_key: `workpieces/${targetWorkpieceId}/${input.path}`,
        written_by_tool: input.written_by.tool,
        written_by_tool_version: input.written_by.tool_version,
        written_by_lane: input.written_by.lane,
        created_at: "2026-03-10T16:05:00.000Z",
        updated_at: input.path === "metadata.json"
          ? "2026-03-10T16:05:00.000Z"
          : "2026-03-10T16:05:01.000Z",
      },
      manifest_row: {
        workpiece_id: targetWorkpieceId,
        path: "manifest.json",
        file_type: "manifest",
        content_type: "application/json",
        bytes: 456,
        hash_algo: "sha256",
        hash_value: "hash-manifest",
        storage_bucket: "forge-workpieces",
        storage_key: `workpieces/${targetWorkpieceId}/manifest.json`,
        written_by_tool: input.written_by.tool,
        written_by_tool_version: input.written_by.tool_version,
        written_by_lane: input.written_by.lane,
        created_at: "2026-03-10T16:05:00.000Z",
        updated_at: "2026-03-10T16:05:00.000Z",
      },
      event: {
        id: 901,
        workpiece_id: targetWorkpieceId,
        event_name: input.event_name || "workpiece.file.committed",
        payload: {},
        correlation_id: "corr-456",
        written_by_tool: input.written_by.tool,
        written_by_tool_version: input.written_by.tool_version,
        written_by_lane: input.written_by.lane,
        created_at: "2026-03-10T16:05:00.000Z",
      },
    };
  };

  const result = await service.saveWorkpieceImageMap(
    workpieceId,
    {
      workspace_id: workspaceId,
      entries: [],
      expected_metadata_updated_at: "2026-03-10T15:30:00.000Z",
    },
    { userAccessToken: "editor_token" },
  );

  assert.equal(commitCalls.length, 2);
  assert.equal(state.insertCalls.length, 0);
  assert.equal(state.updateCalls.length, 1);
  assert.equal(state.updateCalls[0]?.id, "asset-superseded");
  assert.equal(state.updateCalls[0]?.patch?.status, "ready");
  assert.equal(state.updateCalls[0]?.patch?.request_id, "corr-456");
  assert.equal(result.asset?.id, "asset-superseded");
  assert.equal(result.asset?.status, "ready");
});

test("TongsCommitService.saveWorkpieceImageMap reuses the asset row that already owns the committed storage location", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const workpieceId = "11111111-1111-4111-8111-111111111111";
  const editorId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const { state, ...supabase } = createImageMapAssetSupabase({
    assets: [
      {
        id: "asset-fixed-path",
        workspace_id: workspaceId,
        workpiece_id: workpieceId,
        path: "assets/image-map/image-map.v1.json",
        mime_type: "application/json",
        bytes: 111,
        storage_bucket: "forge-workpieces",
        storage_key: `workpieces/${workpieceId}/assets/image-map/image-map.v1.json`,
        provider: "hearth",
        provider_request_id: null,
        request_id: "req-old-fixed",
        prompt: null,
        created_by: editorId,
        created_at: "2026-03-10T15:00:00.000Z",
        updated_at: "2026-03-10T15:00:00.000Z",
        asset_kind: "image_map_json",
        status: "superseded",
        metadata_json: {
          schema: "forge.image-map.v1",
          entry_count: 1,
        },
        supersedes_asset_id: null,
      },
      {
        id: "asset-ready-other-key",
        workspace_id: workspaceId,
        workpiece_id: workpieceId,
        path: "assets/image-map/image-map.v1.json",
        mime_type: "application/json",
        bytes: 222,
        storage_bucket: "forge-workpieces",
        storage_key: `workpieces/${workpieceId}/assets/image-map/image-map.v2.json`,
        provider: "hearth",
        provider_request_id: null,
        request_id: "req-old-ready",
        prompt: null,
        created_by: editorId,
        created_at: "2026-03-10T15:30:00.000Z",
        updated_at: "2026-03-10T15:30:00.000Z",
        asset_kind: "image_map_json",
        status: "ready",
        metadata_json: {
          schema: "forge.image-map.v1",
          entry_count: 1,
        },
        supersedes_asset_id: null,
      },
    ],
  });

  const service = new TongsCommitService(supabase, "forge-workpieces", null);
  service.getWorkspaceOrThrow = async () => ({
    id: workspaceId,
    created_by: editorId,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    storage_profile: null,
  });
  service.assertWorkpieceInWorkspace = async () => ({
    id: workpieceId,
    workspace_id: workspaceId,
    label: "Episode",
    status: "draft",
    manifest_path: "manifest.json",
    metadata: {},
    created_by: null,
    created_at: "2026-03-02T00:00:00.000Z",
    updated_at: "2026-03-02T00:00:00.000Z",
  });
  service.assertWorkspaceRoleFromAccessToken = async () => ({ userId: editorId, role: "editor" });
  service.readWorkpieceJson = async () => ({
    found: true,
    data: {
      schema: "forge.metadata.v1",
      workpiece_id: workpieceId,
      workspace_id: workspaceId,
      episode: {
        schema: "forge.episode.package.v2",
        image_map: {
          entries: [],
        },
      },
    },
    file_row: { updated_at: "2026-03-10T15:30:00.000Z" },
  });
  service.commitFile = async (targetWorkpieceId, input) => ({
    workpiece_id: targetWorkpieceId,
    path: input.path,
    storage_key: `workpieces/${targetWorkpieceId}/${input.path}`,
    hash: "hash-file",
    bytes: input.path === "metadata.json" ? 222 : 333,
    content_type: input.content_type || "application/json",
    manifest_hash: "hash-manifest",
    manifest_bytes: 456,
    file_row: {
      workpiece_id: targetWorkpieceId,
      path: input.path,
      file_type: "json",
      content_type: input.content_type || "application/json",
      bytes: input.path === "metadata.json" ? 222 : 333,
      hash_algo: "sha256",
      hash_value: "hash-file",
      storage_bucket: "forge-workpieces",
      storage_key: `workpieces/${targetWorkpieceId}/${input.path}`,
      written_by_tool: input.written_by.tool,
      written_by_tool_version: input.written_by.tool_version,
      written_by_lane: input.written_by.lane,
      created_at: "2026-03-10T16:05:00.000Z",
      updated_at: input.path === "metadata.json"
        ? "2026-03-10T16:05:00.000Z"
        : "2026-03-10T16:05:01.000Z",
    },
    manifest_row: {
      workpiece_id: targetWorkpieceId,
      path: "manifest.json",
      file_type: "manifest",
      content_type: "application/json",
      bytes: 456,
      hash_algo: "sha256",
      hash_value: "hash-manifest",
      storage_bucket: "forge-workpieces",
      storage_key: `workpieces/${targetWorkpieceId}/manifest.json`,
      written_by_tool: input.written_by.tool,
      written_by_tool_version: input.written_by.tool_version,
      written_by_lane: input.written_by.lane,
      created_at: "2026-03-10T16:05:00.000Z",
      updated_at: "2026-03-10T16:05:00.000Z",
    },
    event: {
      id: 902,
      workpiece_id: targetWorkpieceId,
      event_name: input.event_name || "workpiece.file.committed",
      payload: {},
      correlation_id: "corr-789",
      written_by_tool: input.written_by.tool,
      written_by_tool_version: input.written_by.tool_version,
      written_by_lane: input.written_by.lane,
      created_at: "2026-03-10T16:05:00.000Z",
    },
  });

  const result = await service.saveWorkpieceImageMap(
    workpieceId,
    {
      workspace_id: workspaceId,
      entries: [],
      expected_metadata_updated_at: "2026-03-10T15:30:00.000Z",
    },
    { userAccessToken: "editor_token" },
  );

  assert.equal(state.insertCalls.length, 0);
  assert.equal(state.updateCalls.length, 2);
  assert.equal(state.updateCalls[0]?.id, "asset-ready-other-key");
  assert.equal(state.updateCalls[0]?.patch?.status, "superseded");
  assert.equal(state.updateCalls[1]?.id, "asset-fixed-path");
  assert.equal(state.updateCalls[1]?.patch?.status, "ready");
  assert.equal(state.updateCalls[1]?.patch?.request_id, "corr-789");
  assert.equal(result.asset?.id, "asset-fixed-path");
  assert.equal(result.asset?.status, "ready");
});

test("TongsCommitService.saveWorkpieceImageMap rejects stale metadata timestamps with image_map_conflict", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const workpieceId = "11111111-1111-4111-8111-111111111111";
  const editorId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const commitCalls = [];
  const { state, ...supabase } = createImageMapAssetSupabase();

  const service = new TongsCommitService(supabase, "forge-workpieces", null);
  service.getWorkspaceOrThrow = async () => ({
    id: workspaceId,
    created_by: editorId,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    storage_profile: null,
  });
  service.assertWorkpieceInWorkspace = async () => ({
    id: workpieceId,
    workspace_id: workspaceId,
    label: "Episode",
    status: "draft",
    manifest_path: "manifest.json",
    metadata: {},
    created_by: null,
    created_at: "2026-03-02T00:00:00.000Z",
    updated_at: "2026-03-02T00:00:00.000Z",
  });
  service.assertWorkspaceRoleFromAccessToken = async () => ({ userId: editorId, role: "editor" });
  service.readWorkpieceJson = async () => ({
    found: true,
    data: {
      schema: "forge.metadata.v1",
      workpiece_id: workpieceId,
      workspace_id: workspaceId,
      episode: {
        schema: "forge.episode.package.v2",
        image_map: { entries: [] },
      },
    },
    file_row: { updated_at: "2026-03-10T16:10:00.000Z" },
  });
  service.commitFile = async (...args) => {
    commitCalls.push(args);
    throw new Error("commitFile should not be called on stale conflict");
  };

  await assert.rejects(
    () => service.saveWorkpieceImageMap(
      workpieceId,
      {
        workspace_id: workspaceId,
        entries: [],
        expected_metadata_updated_at: "2026-03-10T16:00:00.000Z",
      },
      { userAccessToken: "editor_token" },
    ),
    (error) => {
      assert.equal(error.status, 409);
      assert.equal(error.code, "image_map_conflict");
      assert.equal(error.details?.expected_metadata_updated_at, "2026-03-10T16:00:00.000Z");
      assert.equal(error.details?.current_metadata_updated_at, "2026-03-10T16:10:00.000Z");
      return true;
    },
  );

  assert.equal(commitCalls.length, 0);
  assert.equal(state.insertCalls.length, 0);
  assert.equal(state.updateCalls.length, 0);
});

test("TongsCommitService.saveWorkpieceImageMap accepts matching metadata timestamps with different precision", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const workpieceId = "11111111-1111-4111-8111-111111111111";
  const editorId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const commitCalls = [];
  const { state, ...supabase } = createImageMapAssetSupabase();

  const service = new TongsCommitService(supabase, "forge-workpieces", null);
  service.getWorkspaceOrThrow = async () => ({
    id: workspaceId,
    created_by: editorId,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    storage_profile: null,
  });
  service.assertWorkpieceInWorkspace = async () => ({
    id: workpieceId,
    workspace_id: workspaceId,
    label: "Episode",
    status: "draft",
    manifest_path: "manifest.json",
    metadata: {},
    created_by: null,
    created_at: "2026-03-02T00:00:00.000Z",
    updated_at: "2026-03-02T00:00:00.000Z",
  });
  service.assertWorkspaceRoleFromAccessToken = async () => ({ userId: editorId, role: "editor" });
  service.readWorkpieceJson = async () => ({
    found: true,
    data: {
      schema: "forge.metadata.v1",
      workpiece_id: workpieceId,
      workspace_id: workspaceId,
      episode: {
        schema: "forge.episode.package.v2",
        image_map: { entries: [] },
      },
    },
    file_row: { updated_at: "2026-03-10T16:00:00.123456+00:00" },
  });
  service.commitFile = async (...args) => {
    commitCalls.push(args);
    const [episodeId, input] = args;
    return {
      file_row: {
        id: "file-row-precision",
        workpiece_id: episodeId,
        path: input.path,
        size_bytes: 512,
        content_type: input.content_type,
        sha256: "sha-precision",
        storage_bucket: "forge-workpieces",
        storage_key: `workpieces/${episodeId}/${input.path}`,
        file_type: "json",
        created_at: "2026-03-10T16:05:00.000Z",
        updated_at: "2026-03-10T16:05:00.789654+00:00",
        created_by: editorId,
        written_by_tool: input.written_by.tool,
        written_by_tool_version: input.written_by.tool_version,
        written_by_lane: input.written_by.lane,
      },
      storage_key: `workpieces/${episodeId}/${input.path}`,
      event: {
        id: 901,
        workpiece_id: episodeId,
        event_name: input.event_name || "workpiece.file.committed",
        payload: {},
        correlation_id: "corr-precision",
        written_by_tool: input.written_by.tool,
        written_by_tool_version: input.written_by.tool_version,
        written_by_lane: input.written_by.lane,
        created_at: "2026-03-10T16:05:00.000Z",
      },
    };
  };

  const result = await service.saveWorkpieceImageMap(
    workpieceId,
    {
      workspace_id: workspaceId,
      entries: [],
      expected_metadata_updated_at: "2026-03-10T16:00:00.123Z",
    },
    { userAccessToken: "editor_token" },
  );

  assert.equal(commitCalls.length, 2);
  assert.equal(commitCalls[0]?.[1]?.expected_previous_updated_at, "2026-03-10T16:00:00.123Z");
  assert.equal(result.image_map.metadata_updated_at, "2026-03-10T16:05:00.789Z");
  assert.equal(state.insertCalls.length, 1);
});

test("TongsCommitService.generateImageMapCandidates tolerates matching metadata timestamps with different precision", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const workpieceId = "11111111-1111-4111-8111-111111111111";
  const editorId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const { ...supabase } = createImageMapAssetSupabase();

  const service = new TongsCommitService(supabase, "forge-workpieces", {
    generateImage: async () => ({
      bytesBase64: "ZmFrZQ==",
      mimeType: "image/png",
      provider: "test-provider",
      providerRequestId: "provider-req-1",
      revisedPrompt: null,
      tokensUsed: 1,
    }),
  });
  service.getWorkspaceOrThrow = async () => ({
    id: workspaceId,
    created_by: editorId,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    storage_profile: null,
  });
  service.assertWorkpieceInWorkspace = async () => ({
    id: workpieceId,
    workspace_id: workspaceId,
    label: "Episode",
    status: "draft",
    manifest_path: "manifest.json",
    metadata: {},
    created_by: null,
    created_at: "2026-03-02T00:00:00.000Z",
    updated_at: "2026-03-02T00:00:00.000Z",
  });
  service.assertWorkspaceRoleFromAccessToken = async () => ({ userId: editorId, role: "editor" });
  service.readWorkpieceJson = async () => ({
    found: true,
    data: {
      schema: "forge.metadata.v1",
      workpiece_id: workpieceId,
      workspace_id: workspaceId,
      episode: {
        schema: "forge.episode.package.v2",
        image_map: {
          entries: [
            {
              id: "image-map-01",
              anchor: "s1:p1#sent1",
              script_anchor: null,
              description: "wide city skyline",
              visual_intent: "wide city skyline",
              prompt_basis: "wide city skyline",
              intent: "broll",
              source_type: "stock",
              beat_order: 1,
              paragraph_beat_order: 1,
              candidate_assets: [],
              selected_asset_id: null,
              status: "draft",
              placement_hint: null,
            },
          ],
        },
      },
    },
    file_row: { updated_at: "2026-03-10T16:10:00.123456+00:00" },
  });

  await assert.rejects(
    () => service.generateImageMapCandidates(
      workpieceId,
      {
        workspace_id: workspaceId,
        image_map_entry_id: "image-map-01",
        expected_metadata_updated_at: "2026-03-10T16:10:00.123Z",
        confirm_spend: true,
      },
      { userAccessToken: "editor_token" },
    ),
    (error) => {
      assert.equal(error.status, 400);
      assert.equal(error.code, "image_map_anchor_required");
      return true;
    },
  );
});

test("TongsCommitService.listWorkspaceReadyScripts includes hidden ranked entries and preserves queue state across ready-path changes", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const viewerId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const workpieceA = "11111111-1111-4111-8111-111111111111";
  const workpieceB = "22222222-2222-4222-8222-222222222222";
  const workpieceC = "33333333-3333-4333-8333-333333333333";

  const { ...supabase } = createReadyQueueSupabase({
    workspaceId,
    episodes: [
      {
        id: workpieceA,
        workspace_id: workspaceId,
        label: "Ready Alpha",
        updated_at: "2026-03-09T10:00:00.000Z",
        created_at: "2026-03-01T10:00:00.000Z",
      },
      {
        id: workpieceB,
        workspace_id: workspaceId,
        label: "Ready Beta",
        updated_at: "2026-03-08T10:00:00.000Z",
        created_at: "2026-03-01T09:00:00.000Z",
      },
      {
        id: workpieceC,
        workspace_id: workspaceId,
        label: "Ready Gamma",
        updated_at: "2026-03-07T10:00:00.000Z",
        created_at: "2026-03-01T08:00:00.000Z",
      },
    ],
    files: [
      {
        workpiece_id: workpieceA,
        path: "script/script.md",
        updated_at: "2026-03-09T10:30:00.000Z",
        created_at: "2026-03-09T10:00:00.000Z",
      },
      {
        workpiece_id: workpieceB,
        path: "scripts/script.anvil.txt",
        updated_at: "2026-03-08T10:30:00.000Z",
        created_at: "2026-03-08T10:00:00.000Z",
      },
    ],
    readyMeta: [
      {
        workspace_id: workspaceId,
        workpiece_id: workpieceA,
        script_path: "script/script.md",
        marked_ready_by: viewerId,
        marked_ready_at: "2026-03-09T10:30:00.000Z",
      },
      {
        workspace_id: workspaceId,
        workpiece_id: workpieceB,
        script_path: "scripts/script.anvil.txt",
        marked_ready_by: viewerId,
        marked_ready_at: "2026-03-08T10:30:00.000Z",
      },
    ],
    queueState: [
      {
        workspace_id: workspaceId,
        workpiece_id: workpieceA,
        queue_rank: 5,
        hidden_at: null,
        hidden_by: null,
        updated_at: "2026-03-10T12:00:00.000Z",
        updated_by: viewerId,
      },
      {
        workspace_id: workspaceId,
        workpiece_id: workpieceB,
        queue_rank: 0,
        hidden_at: "2026-03-10T12:30:00.000Z",
        hidden_by: viewerId,
        updated_at: "2026-03-10T12:30:00.000Z",
        updated_by: viewerId,
      },
      {
        workspace_id: workspaceId,
        workpiece_id: workpieceC,
        queue_rank: 99,
        hidden_at: "2026-03-10T13:00:00.000Z",
        hidden_by: viewerId,
        updated_at: "2026-03-10T13:00:00.000Z",
        updated_by: viewerId,
      },
    ],
  });

  const service = new TongsCommitService(supabase, "forge-workpieces", null);
  service.getWorkspaceOrThrow = async () => ({
    id: workspaceId,
    created_by: viewerId,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    storage_profile: null,
  });
  service.assertWorkspaceRoleFromAccessToken = async () => ({ userId: viewerId, role: "viewer" });

  const result = await service.listWorkspaceReadyScripts(workspaceId, {
    userAccessToken: "viewer_token",
    includeHidden: true,
  });

  assert.deepEqual(
    result.map((row) => row.workpiece_id),
    [workpieceB, workpieceA],
  );
  assert.equal(result[0]?.primary_script_path, "scripts/script.anvil.txt");
  assert.deepEqual(result[0]?.script_paths, ["scripts/script.anvil.txt"]);
  assert.equal(result[0]?.queue_rank, 0);
  assert.equal(result[0]?.hidden_at, "2026-03-10T12:30:00.000Z");
  assert.equal(result[0]?.hidden_by, viewerId);
  assert.equal(result.some((row) => row.workpiece_id === workpieceC), false);
});

test("TongsCommitService.listWorkspaceReadyScripts treats take_kept as recorded truth for unrecorded filters", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const viewerId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const workpieceA = "11111111-1111-4111-8111-111111111111";
  const workpieceB = "22222222-2222-4222-8222-222222222222";
  const workpieceC = "33333333-3333-4333-8333-333333333333";

  const { ...supabase } = createReadyQueueSupabase({
    workspaceId,
    episodes: [
      {
        id: workpieceA,
        workspace_id: workspaceId,
        label: "Ready Alpha",
        updated_at: "2026-03-09T10:00:00.000Z",
        created_at: "2026-03-01T10:00:00.000Z",
      },
      {
        id: workpieceB,
        workspace_id: workspaceId,
        label: "Ready Beta",
        updated_at: "2026-03-08T10:00:00.000Z",
        created_at: "2026-03-01T09:00:00.000Z",
      },
      {
        id: workpieceC,
        workspace_id: workspaceId,
        label: "Ready Gamma",
        updated_at: "2026-03-07T10:00:00.000Z",
        created_at: "2026-03-01T08:00:00.000Z",
      },
    ],
    files: [
      {
        workpiece_id: workpieceA,
        path: "script/script.md",
        updated_at: "2026-03-09T10:30:00.000Z",
        created_at: "2026-03-09T10:00:00.000Z",
      },
      {
        workpiece_id: workpieceB,
        path: "script/script.md",
        updated_at: "2026-03-08T10:30:00.000Z",
        created_at: "2026-03-08T10:00:00.000Z",
      },
      {
        workpiece_id: workpieceC,
        path: "script/script.md",
        updated_at: "2026-03-07T10:30:00.000Z",
        created_at: "2026-03-07T10:00:00.000Z",
      },
    ],
    readyMeta: [
      {
        workspace_id: workspaceId,
        workpiece_id: workpieceA,
        script_path: "script/script.md",
        marked_ready_by: viewerId,
        marked_ready_at: "2026-03-09T10:30:00.000Z",
      },
      {
        workspace_id: workspaceId,
        workpiece_id: workpieceB,
        script_path: "script/script.md",
        marked_ready_by: viewerId,
        marked_ready_at: "2026-03-08T10:30:00.000Z",
      },
      {
        workspace_id: workspaceId,
        workpiece_id: workpieceC,
        script_path: "script/script.md",
        marked_ready_by: viewerId,
        marked_ready_at: "2026-03-07T10:30:00.000Z",
      },
    ],
    events: [
      {
        id: 11,
        workpiece_id: workpieceB,
        event_name: "take_completed",
        payload: { file_path: "recordings/beta.webm" },
        correlation_id: null,
        written_by_tool: "anvil",
        written_by_tool_version: "1.8.5",
        written_by_lane: "forge-managed",
        created_at: "2026-03-10T12:00:00.000Z",
      },
      {
        id: 12,
        workpiece_id: workpieceC,
        event_name: "take_kept",
        payload: { file_path: "recordings/gamma.webm" },
        correlation_id: null,
        written_by_tool: "anvil",
        written_by_tool_version: "1.8.5",
        written_by_lane: "forge-managed",
        created_at: "2026-03-10T13:00:00.000Z",
      },
    ],
  });

  const service = new TongsCommitService(supabase, "forge-workpieces", null);
  service.getWorkspaceOrThrow = async () => ({
    id: workspaceId,
    created_by: viewerId,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    storage_profile: null,
  });
  service.assertWorkspaceRoleFromAccessToken = async () => ({ userId: viewerId, role: "viewer" });

  const result = await service.listWorkspaceReadyScripts(workspaceId, {
    userAccessToken: "viewer_token",
    unrecordedOnly: true,
  });

  assert.deepEqual(
    result.map((row) => row.workpiece_id),
    [workpieceA, workpieceB],
  );
  assert.equal(result.some((row) => row.workpiece_id === workpieceC), false);
});

test("TongsCommitService.updateWorkspaceReadyQueueState upserts rank and hide state while clearing empty rows", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const otherWorkspaceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const editorId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const workpieceA = "11111111-1111-4111-8111-111111111111";
  const workpieceB = "22222222-2222-4222-8222-222222222222";
  const workpieceC = "33333333-3333-4333-8333-333333333333";

  const { state, ...supabase } = createReadyQueueSupabase({
    workspaceId,
    episodes: [
      {
        id: workpieceA,
        workspace_id: workspaceId,
        label: "Ready Alpha",
        updated_at: "2026-03-09T10:00:00.000Z",
        created_at: "2026-03-01T10:00:00.000Z",
      },
      {
        id: workpieceB,
        workspace_id: workspaceId,
        label: "Ready Beta",
        updated_at: "2026-03-08T10:00:00.000Z",
        created_at: "2026-03-01T09:00:00.000Z",
      },
      {
        id: workpieceC,
        workspace_id: workspaceId,
        label: "Ready Gamma",
        updated_at: "2026-03-07T10:00:00.000Z",
        created_at: "2026-03-01T08:00:00.000Z",
      },
    ],
    queueState: [
      {
        workspace_id: workspaceId,
        workpiece_id: workpieceA,
        queue_rank: 7,
        hidden_at: null,
        hidden_by: null,
        updated_at: "2026-03-09T10:00:00.000Z",
        updated_by: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      },
      {
        workspace_id: workspaceId,
        workpiece_id: workpieceB,
        queue_rank: null,
        hidden_at: "2026-03-09T11:00:00.000Z",
        hidden_by: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        updated_at: "2026-03-09T11:00:00.000Z",
        updated_by: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      },
      {
        workspace_id: otherWorkspaceId,
        workpiece_id: workpieceA,
        queue_rank: 55,
        hidden_at: null,
        hidden_by: null,
        updated_at: "2026-03-09T12:00:00.000Z",
        updated_by: "99999999-9999-4999-8999-999999999999",
      },
    ],
  });

  const service = new TongsCommitService(supabase, "forge-workpieces", null);
  service.getWorkspaceOrThrow = async () => ({
    id: workspaceId,
    created_by: editorId,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    storage_profile: null,
  });
  service.assertWorkspaceRoleFromAccessToken = async () => ({ userId: editorId, role: "editor" });

  const result = await service.updateWorkspaceReadyQueueState(
    workspaceId,
    {
      entries: [
        { workpiece_id: workpieceA, hidden: true },
        { workpiece_id: workpieceB, queue_rank: null, hidden: false },
        { workpiece_id: workpieceC, queue_rank: 0 },
      ],
    },
    { userAccessToken: "editor_token" },
  );

  assert.deepEqual(result, {
    updated_count: 2,
    deleted_count: 1,
  });
  assert.equal(state.upsertCalls.length, 1);
  assert.equal(state.deleteCalls.length, 1);
  assert.deepEqual(state.deleteCalls[0], {
    workspace_id: workspaceId,
    workpiece_ids: [workpieceB],
  });

  const updatedA = state.queueStateRows.find(
    (row) => row.workspace_id === workspaceId && row.workpiece_id === workpieceA,
  );
  const insertedC = state.queueStateRows.find(
    (row) => row.workspace_id === workspaceId && row.workpiece_id === workpieceC,
  );
  const preservedOtherWorkspace = state.queueStateRows.find(
    (row) => row.workspace_id === otherWorkspaceId && row.workpiece_id === workpieceA,
  );

  assert.equal(updatedA?.queue_rank, 7);
  assert.equal(typeof updatedA?.hidden_at, "string");
  assert.equal(updatedA?.hidden_by, editorId);
  assert.equal(updatedA?.updated_by, editorId);
  assert.equal(insertedC?.queue_rank, 0);
  assert.equal(insertedC?.hidden_at, null);
  assert.equal(insertedC?.hidden_by, null);
  assert.equal(insertedC?.updated_by, editorId);
  assert.equal(
    state.queueStateRows.some((row) => row.workspace_id === workspaceId && row.workpiece_id === workpieceB),
    false,
  );
  assert.equal(preservedOtherWorkspace?.queue_rank, 55);
  assert.equal(preservedOtherWorkspace?.hidden_at, null);
});

test("TongsCommitService.updateWorkspaceReadyQueueState rejects workpieces outside the workspace", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const editorId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const workpieceA = "11111111-1111-4111-8111-111111111111";
  const foreignWorkpiece = "44444444-4444-4444-8444-444444444444";

  const { ...supabase } = createReadyQueueSupabase({
    workspaceId,
    episodes: [
      {
        id: workpieceA,
        workspace_id: workspaceId,
        label: "Ready Alpha",
        updated_at: "2026-03-09T10:00:00.000Z",
        created_at: "2026-03-01T10:00:00.000Z",
      },
    ],
  });

  const service = new TongsCommitService(supabase, "forge-workpieces", null);
  service.getWorkspaceOrThrow = async () => ({
    id: workspaceId,
    created_by: editorId,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    storage_profile: null,
  });
  service.assertWorkspaceRoleFromAccessToken = async () => ({ userId: editorId, role: "editor" });

  await assert.rejects(
    () => service.updateWorkspaceReadyQueueState(
      workspaceId,
      {
        entries: [
          { workpiece_id: workpieceA, queue_rank: 0 },
          { workpiece_id: foreignWorkpiece, hidden: true },
        ],
      },
      { userAccessToken: "editor_token" },
    ),
    (error) => {
      assert.equal(error.status, 400);
      assert.equal(error.code, "workspace_mismatch");
      assert.equal(error.details?.workpiece_id, foreignWorkpiece);
      return true;
    },
  );
});

test("DELETE /tongs/workpieces/:id/ready-script returns idempotent payload", async () => {
  const { service } = mockService();
  service.deleteReadyScript = async (workpieceId, path) => ({
    deleted: true,
    already_deleted: true,
    workpiece_id: workpieceId,
    path,
    removed_session_item_count: 2,
    ready_meta_deleted: false,
    warnings: ["storage_delete_failed"],
  });

  const handler = createTongsCommitApiHandlerWithService(service);
  const request = new Request(
    "http://localhost/tongs/workpieces/11111111-1111-4111-8111-111111111111/ready-script?path=script%2Fscript.md",
    {
      method: "DELETE",
      headers: {
        "x-forge-user-authorization": "Bearer user_token_abc",
      },
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.data?.deleted, true);
  assert.equal(body.data?.already_deleted, true);
  assert.equal(body.data?.removed_session_item_count, 2);
  assert.equal(body.data?.ready_meta_deleted, false);
  assert.deepEqual(body.data?.warnings, ["storage_delete_failed"]);
});

test("DELETE /tongs/workpieces/:id/ready-script forwards x-forge-user-authorization token", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);
  const request = new Request(
    "http://localhost/tongs/workpieces/11111111-1111-4111-8111-111111111111/ready-script?path=script%2Fscript.md",
    {
      method: "DELETE",
      headers: {
        "x-forge-user-authorization": "Bearer user_token_abc",
      },
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.deleteReadyScript.length, 1);
  assert.equal(calls.deleteReadyScript[0]?.options?.userAccessToken, "user_token_abc");
  assert.equal(body.ok, true);
});

test("DELETE /tongs/workpieces/:id/ready-script requires x-forge-user-authorization header", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);
  const request = new Request(
    "http://localhost/tongs/workpieces/11111111-1111-4111-8111-111111111111/ready-script?path=script%2Fscript.md",
    { method: "DELETE" },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.ok, false);
  assert.equal(body.error?.code, "missing_user_token_header");
  assert.equal(typeof body.error?.request_id, "string");
  assert.equal(calls.deleteReadyScript.length, 0);
});

test("POST /tongs/workpieces/:id/commit-file for ready path requires x-forge-user-authorization header", async () => {
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

  assert.equal(response.status, 401);
  assert.equal(body.ok, false);
  assert.equal(body.error?.code, "missing_user_token_header");
  assert.equal(typeof body.error?.request_id, "string");
  assert.equal(calls.commitFile.length, 0);
});

test("DELETE /tongs/workpieces/:id/ready-script rejects traversal path before dispatch", async () => {
  const { service, calls } = mockService();
  const handler = createTongsCommitApiHandlerWithService(service);

  const request = new Request(
    "http://localhost/tongs/workpieces/11111111-1111-4111-8111-111111111111/ready-script?path=..%2Fscript%2Fscript.md",
    {
      method: "DELETE",
      headers: {
        "x-forge-user-authorization": "Bearer user_token_abc",
      },
    },
  );

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.ok, false);
  assert.equal(body.error?.code, "invalid_path");
  assert.equal(calls.deleteReadyScript.length, 0);
});

test("TongsCommitService.deleteReadyScript denies viewer role", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const workpieceId = "11111111-1111-4111-8111-111111111111";
  const supabase = createRoleGateSupabase({
    userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    workspaceId,
    workspaceOwnerId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    memberRole: "viewer",
  });
  const service = new TongsCommitService(supabase, "forge-workpieces", null);
  service.getCradleOrThrow = async () => ({
    id: workpieceId,
    workspace_id: workspaceId,
    label: "Episode",
    status: "draft",
    manifest_path: "manifest.json",
    metadata: {},
    created_by: null,
    created_at: "2026-03-02T00:00:00.000Z",
    updated_at: "2026-03-02T00:00:00.000Z",
  });

  await assert.rejects(
    () => service.deleteReadyScript(workpieceId, "script/script.md", { userAccessToken: "viewer_token" }),
    (error) => {
      assert.equal(error.status, 403);
      assert.equal(error.code, "insufficient_role");
      assert.equal(error.details?.required, "editor");
      assert.equal(error.details?.actual, "viewer");
      return true;
    },
  );
});

test("TongsCommitService.deleteReadyScript denies non-members", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const workpieceId = "11111111-1111-4111-8111-111111111111";
  const supabase = createRoleGateSupabase({
    userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    workspaceId,
    workspaceOwnerId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    memberRole: null,
  });
  const service = new TongsCommitService(supabase, "forge-workpieces", null);
  service.getCradleOrThrow = async () => ({
    id: workpieceId,
    workspace_id: workspaceId,
    label: "Episode",
    status: "draft",
    manifest_path: "manifest.json",
    metadata: {},
    created_by: null,
    created_at: "2026-03-02T00:00:00.000Z",
    updated_at: "2026-03-02T00:00:00.000Z",
  });

  await assert.rejects(
    () => service.deleteReadyScript(workpieceId, "script/script.md", { userAccessToken: "memberless_token" }),
    (error) => {
      assert.equal(error.status, 403);
      assert.equal(error.code, "workspace_access_denied");
      return true;
    },
  );
});

test("TongsCommitService.commitFile requires user token for ready-script paths", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const workpieceId = "11111111-1111-4111-8111-111111111111";
  const supabase = createRoleGateSupabase({
    userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    workspaceId,
    workspaceOwnerId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    memberRole: "editor",
  });
  const service = new TongsCommitService(supabase, "forge-workpieces", null);
  service.getCradleOrThrow = async () => ({
    id: workpieceId,
    workspace_id: workspaceId,
    label: "Episode",
    status: "draft",
    manifest_path: "manifest.json",
    metadata: {},
    created_by: null,
    created_at: "2026-03-02T00:00:00.000Z",
    updated_at: "2026-03-02T00:00:00.000Z",
  });

  await assert.rejects(
    () => service.commitFile(workpieceId, {
      path: "script/script.md",
      text: "ready script text",
      written_by: {
        tool: "hearth",
        tool_version: "0.0.0",
        lane: "forge-managed",
      },
    }),
    (error) => {
      assert.equal(error.status, 401);
      assert.equal(error.code, "missing_user_token_header");
      return true;
    },
  );
});

test("TongsCommitService.commitFile denies viewer role for ready-script paths", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const workpieceId = "11111111-1111-4111-8111-111111111111";
  const supabase = createRoleGateSupabase({
    userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    workspaceId,
    workspaceOwnerId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    memberRole: "viewer",
  });
  const service = new TongsCommitService(supabase, "forge-workpieces", null);
  service.getCradleOrThrow = async () => ({
    id: workpieceId,
    workspace_id: workspaceId,
    label: "Episode",
    status: "draft",
    manifest_path: "manifest.json",
    metadata: {},
    created_by: null,
    created_at: "2026-03-02T00:00:00.000Z",
    updated_at: "2026-03-02T00:00:00.000Z",
  });

  await assert.rejects(
    () => service.commitFile(workpieceId, {
      path: "script/script.md",
      text: "ready script text",
      user_access_token: "viewer_token",
      written_by: {
        tool: "hearth",
        tool_version: "0.0.0",
        lane: "forge-managed",
      },
    }),
    (error) => {
      assert.equal(error.status, 403);
      assert.equal(error.code, "insufficient_role");
      assert.equal(error.details?.required, "editor");
      assert.equal(error.details?.actual, "viewer");
      return true;
    },
  );
});

test("TongsCommitService.commitWorkspaceFile maps oversized storage uploads to 413", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const service = new TongsCommitService({
    storage: {
      from(bucket) {
        assert.equal(bucket, "forge-workpieces");
        return {
          async upload() {
            return {
              data: null,
              error: {
                message: "The object exceeded the maximum allowed size",
                status: 400,
                statusCode: "413",
              },
            };
          },
        };
      },
    },
  }, "forge-workpieces", null);

  service.getWorkspaceOrThrow = async () => ({
    id: workspaceId,
    created_by: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    created_at: "2026-03-02T00:00:00.000Z",
    updated_at: "2026-03-02T00:00:00.000Z",
    storage_profile: null,
  });

  await assert.rejects(
    () => service.commitWorkspaceFile(workspaceId, {
      path: "metadata.json",
      json: { title: "Episode" },
      written_by: {
        tool: "anvil",
        tool_version: "0.0.0",
        lane: "forge-managed",
      },
    }),
    (error) => {
      assert.equal(error.status, 413);
      assert.equal(error.code, "storage_object_too_large");
      assert.equal(error.details?.bucket, "forge-workpieces");
      assert.equal(error.details?.key, `workspaces/${workspaceId}/metadata.json`);
      return true;
    },
  );
});

test("TongsCommitService.commitWorkspaceFile writes canonical role-root keys when path starts with a storage role", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const uploadCalls = [];
  const service = new TongsCommitService({
    storage: {
      from(bucket) {
        assert.equal(bucket, "forge-workpieces");
        return {
          async upload(key) {
            uploadCalls.push(key);
            return { data: { path: key }, error: null };
          },
        };
      },
    },
  }, "forge-workpieces", null);

  service.getWorkspaceOrThrow = async () => ({
    id: workspaceId,
    created_by: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    created_at: "2026-03-02T00:00:00.000Z",
    updated_at: "2026-03-02T00:00:00.000Z",
    storage_profile: null,
  });

  const result = await service.commitWorkspaceFile(workspaceId, {
    path: "recordings/session-index.json",
    json: { takes: 3 },
    written_by: {
      tool: "anvil",
      tool_version: "0.0.0",
      lane: "forge-managed",
    },
  });

  assert.equal(uploadCalls.length, 1);
  assert.equal(uploadCalls[0], `workspaces/${workspaceId}/recordings/session-index.json`);
  assert.equal(result.storage_key, `workspaces/${workspaceId}/recordings/session-index.json`);
});

test("TongsCommitService.readWorkspaceJson falls back to owner-prefixed legacy role-root key when canonical object is absent", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const ownerUserId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const downloadCalls = [];
  const service = new TongsCommitService({
    storage: {
      from(bucket) {
        assert.equal(bucket, "forge-workpieces");
        return {
          async download(key) {
            downloadCalls.push(key);
            if (key === `workspaces/${workspaceId}/recordings/index.json`) {
              return {
                data: null,
                error: { message: "Object not found", statusCode: "404" },
              };
            }

            if (key === `${ownerUserId}/${workspaceId}/recordings/index.json`) {
              return {
                data: {
                  async arrayBuffer() {
                    return new TextEncoder().encode(JSON.stringify({ legacy: true })).buffer;
                  },
                },
                error: null,
              };
            }

            return {
              data: null,
              error: { message: "Object not found", statusCode: "404" },
            };
          },
        };
      },
    },
  }, "forge-workpieces", null);

  service.getWorkspaceOrThrow = async () => ({
    id: workspaceId,
    created_by: ownerUserId,
    created_at: "2026-03-02T00:00:00.000Z",
    updated_at: "2026-03-02T00:00:00.000Z",
    storage_profile: null,
  });

  const result = await service.readWorkspaceJson(workspaceId, "recordings/index.json");

  assert.equal(downloadCalls.length, 2);
  assert.equal(downloadCalls[0], `workspaces/${workspaceId}/recordings/index.json`);
  assert.equal(downloadCalls[1], `${ownerUserId}/${workspaceId}/recordings/index.json`);
  assert.equal(result.found, true);
  assert.deepEqual(result.data, { legacy: true });
});

test("TongsCommitService.deleteReadyScript returns warning when storage delete fails", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const workpieceId = "11111111-1111-4111-8111-111111111111";
  const supabase = createRoleGateSupabase({
    userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    workspaceId,
    workspaceOwnerId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    memberRole: "editor",
  });
  const service = new TongsCommitService(supabase, "forge-workpieces", null);

  service.getCradleOrThrow = async () => ({
    id: workpieceId,
    workspace_id: workspaceId,
    label: "Episode",
    status: "draft",
    manifest_path: "manifest.json",
    metadata: {},
    created_by: null,
    created_at: "2026-03-02T00:00:00.000Z",
    updated_at: "2026-03-02T00:00:00.000Z",
  });
  service.removeRecordingSessionItemsForScript = async () => 3;
  service.loadManifestOrDefault = async () => createManifestFixture(workpieceId, workspaceId);
  service.upsertWorkpieceFile = async () => {};
  service.insertEvent = async () => ({
    id: 777,
    workpiece_id: workpieceId,
    event_name: "workpiece.file.deleted",
    payload: {},
    correlation_id: null,
    written_by_tool: "tongs",
    written_by_tool_version: "0.1.0",
    written_by_lane: "forge-managed",
    created_at: "2026-03-02T00:00:00.000Z",
  });

  const result = await service.deleteReadyScript(workpieceId, "script/script.md", {
    userAccessToken: "editor_token",
  });

  assert.equal(result.deleted, true);
  assert.equal(result.already_deleted, false);
  assert.equal(result.removed_session_item_count, 3);
  assert.equal(result.ready_meta_deleted, true);
  assert.deepEqual(result.warnings, ["storage_delete_failed"]);
});

test("TongsCommitService.deleteReadyScript does not touch ready queue state", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const workpieceId = "11111111-1111-4111-8111-111111111111";
  const queueStateAccesses = [];
  const baseSupabase = createRoleGateSupabase({
    userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    workspaceId,
    workspaceOwnerId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    memberRole: "editor",
  });
  const supabase = {
    ...baseSupabase,
    schema(schemaName) {
      const scoped = baseSupabase.schema(schemaName);
      return {
        from(tableName) {
          if (tableName === "workspace_ready_queue_state") {
            queueStateAccesses.push(tableName);
          }
          return scoped.from(tableName);
        },
      };
    },
  };
  const service = new TongsCommitService(supabase, "forge-workpieces", null);

  service.getCradleOrThrow = async () => ({
    id: workpieceId,
    workspace_id: workspaceId,
    label: "Episode",
    status: "draft",
    manifest_path: "manifest.json",
    metadata: {},
    created_by: null,
    created_at: "2026-03-02T00:00:00.000Z",
    updated_at: "2026-03-02T00:00:00.000Z",
  });
  service.removeRecordingSessionItemsForScript = async () => 0;
  service.loadManifestOrDefault = async () => createManifestFixture(workpieceId, workspaceId);
  service.upsertWorkpieceFile = async () => {};
  service.insertEvent = async () => ({
    id: 778,
    workpiece_id: workpieceId,
    event_name: "workpiece.file.deleted",
    payload: {},
    correlation_id: null,
    written_by_tool: "tongs",
    written_by_tool_version: "0.1.0",
    written_by_lane: "forge-managed",
    created_at: "2026-03-02T00:00:00.000Z",
  });

  const result = await service.deleteReadyScript(workpieceId, "script/script.md", {
    userAccessToken: "editor_token",
  });

  assert.equal(result.deleted, true);
  assert.deepEqual(queueStateAccesses, []);
});

test("TongsCommitService.listWorkspaceStorage returns nested canonical cloud nodes", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const storageCalls = [];
  const service = new TongsCommitService({
    storage: {
      from(bucket) {
        assert.equal(bucket, "forge-workpieces");
        return {
          async list(path, options) {
            storageCalls.push({ path, options });

            if (path === `workspaces/${workspaceId}/recordings`) {
              return {
                data: [
                  { name: "session-a" },
                  {
                    name: "mixdown.wav",
                    id: "file-mixdown",
                    metadata: { size: 8192 },
                    updated_at: "2026-03-18T12:00:00.000Z",
                  },
                ],
                error: null,
              };
            }

            if (path === `workspaces/${workspaceId}/recordings/session-a`) {
              return {
                data: [
                  {
                    name: "take-01.wav",
                    id: "file-take-01",
                    metadata: { size: 2048 },
                    updated_at: "2026-03-18T12:05:00.000Z",
                  },
                ],
                error: null,
              };
            }

            return { data: [], error: null };
          },
        };
      },
    },
  }, "forge-workpieces", null);

  service.assertWorkspaceRoleFromAccessToken = async () => ({
    userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    role: "viewer",
  });
  service.getWorkspaceOrThrow = async () => ({
    id: workspaceId,
    created_by: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    created_at: "2026-03-18T00:00:00.000Z",
    updated_at: "2026-03-18T00:00:00.000Z",
    storage_profile: null,
  });

  const result = await service.listWorkspaceStorage(workspaceId, "recordings", {
    userAccessToken: "viewer_token",
  });

  assert.equal(result.source.kind, "cloud_canonical");
  assert.equal(result.source.root_path, `workspaces/${workspaceId}/recordings`);
  assert.equal(storageCalls.length, 2);
  assert.equal(storageCalls[0]?.path, `workspaces/${workspaceId}/recordings`);
  assert.equal(storageCalls[1]?.path, `workspaces/${workspaceId}/recordings/session-a`);
  assert.equal(result.nodes.length, 2);
  assert.equal(result.nodes[0]?.kind, "directory");
  assert.equal(result.nodes[0]?.path, `workspaces/${workspaceId}/recordings/session-a`);
  assert.equal(result.nodes[0]?.children?.[0]?.path, `workspaces/${workspaceId}/recordings/session-a/take-01.wav`);
  assert.equal(result.nodes[1]?.kind, "file");
  assert.equal(result.nodes[1]?.bytes, 8192);
});

test("TongsCommitService.listWorkspaceCanonicalRecordings returns kept takes grouped by workpiece", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const viewerId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const { ...supabase } = createReadyQueueSupabase({
    workspaceId,
    episodes: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        workspace_id: workspaceId,
        label: "Episode Beta",
        updated_at: "2026-03-18T09:00:00.000Z",
        created_at: "2026-03-10T09:00:00.000Z",
        archived_at: null,
        archived_by: null,
        archive_reason: null,
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        workspace_id: workspaceId,
        label: "Episode Alpha",
        updated_at: "2026-03-17T09:00:00.000Z",
        created_at: "2026-03-09T09:00:00.000Z",
        archived_at: null,
        archived_by: null,
        archive_reason: null,
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        workspace_id: workspaceId,
        label: "No Take Yet",
        updated_at: "2026-03-16T09:00:00.000Z",
        created_at: "2026-03-08T09:00:00.000Z",
        archived_at: null,
        archived_by: null,
        archive_reason: null,
      },
    ],
    events: [
      {
        id: 201,
        workpiece_id: "11111111-1111-4111-8111-111111111111",
        event_name: "take_kept",
        payload: {
          file_path: "recordings/beta/episode-beta.mp4",
          bytes: 4096,
          content_type: "video/mp4",
          original_name: "episode-beta.mp4",
        },
        correlation_id: null,
        written_by_tool: "anvil",
        written_by_tool_version: "1.0.0",
        written_by_lane: "forge-managed",
        created_at: "2026-03-18T12:00:00.000Z",
      },
      {
        id: 202,
        workpiece_id: "22222222-2222-4222-8222-222222222222",
        event_name: "take_kept",
        payload: {
          file_path: "recordings/episode-alpha.wav",
          bytes: 2048,
          content_type: "audio/wav",
          original_name: "episode-alpha.wav",
        },
        correlation_id: null,
        written_by_tool: "anvil",
        written_by_tool_version: "1.0.0",
        written_by_lane: "forge-managed",
        created_at: "2026-03-17T12:00:00.000Z",
      },
    ],
  });

  const service = new TongsCommitService(supabase, "forge-workpieces", null);
  service.getWorkspaceOrThrow = async () => ({
    id: workspaceId,
    created_by: viewerId,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    storage_profile: null,
  });
  service.assertWorkspaceRoleFromAccessToken = async () => ({ userId: viewerId, role: "viewer" });

  const result = await service.listWorkspaceCanonicalRecordings(workspaceId, {
    userAccessToken: "viewer_token",
  });

  assert.equal(result.source.kind, "cloud_workpiece_recordings");
  assert.equal(result.source.root_path, "workpieces/{workpiece_id}/recordings");
  assert.equal(result.nodes.length, 2);
  assert.equal(result.nodes[0]?.name, "Episode Beta");
  assert.equal(result.nodes[0]?.note, "11111111-1111-4111-8111-111111111111");
  assert.equal(
    result.nodes[0]?.children?.[0]?.path,
    "workpieces/11111111-1111-4111-8111-111111111111/recordings",
  );
  assert.equal(
    result.nodes[0]?.children?.[0]?.children?.[0]?.path,
    "workpieces/11111111-1111-4111-8111-111111111111/recordings/beta",
  );
  assert.equal(
    result.nodes[0]?.children?.[0]?.children?.[0]?.children?.[0]?.path,
    "workpieces/11111111-1111-4111-8111-111111111111/recordings/beta/episode-beta.mp4",
  );
  assert.equal(
    result.nodes[1]?.children?.[0]?.children?.[0]?.path,
    "workpieces/22222222-2222-4222-8222-222222222222/recordings/episode-alpha.wav",
  );
});

test("TongsCommitService.listWorkspaceStorage falls back to owner-prefixed legacy role-root prefix when canonical root is empty", async () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const ownerUserId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const storageCalls = [];
  const service = new TongsCommitService({
    storage: {
      from(bucket) {
        assert.equal(bucket, "forge-workpieces");
        return {
          async list(path) {
            storageCalls.push(path);

            if (path === `workspaces/${workspaceId}/exports`) {
              return { data: [], error: null };
            }

            if (path === `${ownerUserId}/${workspaceId}/exports`) {
              return {
                data: [
                  {
                    name: "final.mp4",
                    id: "legacy-export",
                    metadata: { size: 16384 },
                    updated_at: "2026-03-18T16:00:00.000Z",
                  },
                ],
                error: null,
              };
            }

            return { data: [], error: null };
          },
        };
      },
    },
  }, "forge-workpieces", null);

  service.assertWorkspaceRoleFromAccessToken = async () => ({
    userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    role: "viewer",
  });
  service.getWorkspaceOrThrow = async () => ({
    id: workspaceId,
    created_by: ownerUserId,
    created_at: "2026-03-18T00:00:00.000Z",
    updated_at: "2026-03-18T00:00:00.000Z",
    storage_profile: null,
  });

  const result = await service.listWorkspaceStorage(workspaceId, "exports", {
    userAccessToken: "viewer_token",
  });

  assert.deepEqual(storageCalls, [
    `workspaces/${workspaceId}/exports`,
    `${ownerUserId}/${workspaceId}/exports`,
  ]);
  assert.equal(result.source.root_path, `${ownerUserId}/${workspaceId}/exports`);
  assert.equal(result.nodes.length, 1);
  assert.equal(result.nodes[0]?.path, `${ownerUserId}/${workspaceId}/exports/final.mp4`);
});

test("TongsCommitService.listWorkpieceStorage returns nested canonical workpiece nodes", async () => {
  const workpieceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const workspaceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const storageCalls = [];
  const service = new TongsCommitService({
    storage: {
      from(bucket) {
        assert.equal(bucket, "forge-workpieces");
        return {
          async list(path, options) {
            storageCalls.push({ path, options });

            if (path === `workpieces/${workpieceId}`) {
              return {
                data: [
                  { name: "script" },
                  {
                    name: "manifest.json",
                    id: "file-manifest",
                    metadata: { size: 512 },
                    updated_at: "2026-03-18T12:00:00.000Z",
                  },
                ],
                error: null,
              };
            }

            if (path === `workpieces/${workpieceId}/script`) {
              return {
                data: [
                  {
                    name: "script.md",
                    id: "file-script",
                    metadata: { size: 2048 },
                    updated_at: "2026-03-18T12:05:00.000Z",
                  },
                ],
                error: null,
              };
            }

            return { data: [], error: null };
          },
        };
      },
    },
  }, "forge-workpieces", null);

  service.assertWorkspaceRoleFromAccessToken = async () => ({
    userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    role: "viewer",
  });
  service.getCradleOrThrow = async () => ({
    id: workpieceId,
    workspace_id: workspaceId,
    label: "Episode A",
    status: "draft",
    manifest_path: "manifest.json",
    metadata: {},
    created_by: null,
    created_at: "2026-03-18T00:00:00.000Z",
    updated_at: "2026-03-18T00:00:00.000Z",
    archived_at: null,
    archived_by: null,
    archive_reason: null,
  });

  const result = await service.listWorkpieceStorage(workpieceId, {
    userAccessToken: "viewer_token",
  });

  assert.equal(result.source.kind, "cloud_workpiece");
  assert.equal(result.source.workspace_id, workspaceId);
  assert.equal(result.source.root_path, `workpieces/${workpieceId}`);
  assert.equal(storageCalls.length, 2);
  assert.equal(storageCalls[0]?.path, `workpieces/${workpieceId}`);
  assert.equal(storageCalls[1]?.path, `workpieces/${workpieceId}/script`);
  assert.equal(result.nodes.length, 2);
  assert.equal(result.nodes[0]?.kind, "directory");
  assert.equal(result.nodes[0]?.path, `workpieces/${workpieceId}/script`);
  assert.equal(result.nodes[0]?.children?.[0]?.path, `workpieces/${workpieceId}/script/script.md`);
  assert.equal(result.nodes[1]?.kind, "file");
  assert.equal(result.nodes[1]?.path, `workpieces/${workpieceId}/manifest.json`);
  assert.equal(result.nodes[1]?.bytes, 512);
});
