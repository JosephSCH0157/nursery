import assert from "node:assert/strict";
import {
  createEmptyRevisionSnapshot,
  revisionToEntry,
  type HearthRevisionSnapshot,
} from "../src/lib/hearth-revisions-contract";
import { LocalHearthStore } from "../src/storage/local-store";
import { LocalSessionStore } from "../src/storage/local-session-store";
import {
  loadRevisionSnapshotFallback,
  saveRevisionSnapshotFallback,
} from "../src/storage/revision-storage";
import { TongsHearthStore } from "../src/storage/tongs-store";
import type { Draft } from "../src/domain/draft";
import type { Revision } from "../src/domain/revision";
import { applyHearthOps, buildEpisodeContext } from "../src/lib/hearth-ai-ops";
import { requestHearthChatReply } from "../src/lib/hearth-chat-api";
import {
  listHearthReadyScripts,
  removeHearthReadyScripts,
  reorderHearthReadyScripts,
  setHearthReadyScriptHidden,
} from "../src/lib/hearth-ready-scripts";
import {
  generateWorkpieceImageMapCandidates,
  getWorkpieceImageMap,
  loadImageMapCandidatePreviewDataUrl,
  saveWorkpieceImageMap,
  selectWorkpieceImageMapCandidate,
} from "../src/lib/hearth-image-map-repo";
import { loadThumbnailPreviewDataUrl } from "../src/lib/hearth-thumbnail-api";
import { readHearthPrimaryScript } from "../src/lib/hearth-script-repo";
import {
  assessImageMapScriptAnchor,
  buildImageMapAnchorPickerParagraphs,
  buildExactScriptAnchorFromSelection,
  generateImageMapEntriesFromScript,
  reanchorImageMapEntry,
  resolveImageMapScriptAnchorFromText,
} from "../src/lib/hearth-image-map-beats";
import { resolveBarStockSparkHearthWorkpieceId } from "../src/lib/barstock-sparks";
import {
  isCanonicalSparkDiscoveryResolved,
  listHearthBarStockSparks,
  resolveCanonicalSparkIntakeError,
} from "../src/lib/hearth-barstock-sparks";
import {
  archiveHearthWorkpiece,
  listHearthWorkpieces,
  restoreHearthWorkpiece,
  type HearthWorkpieceSummary,
} from "../src/lib/hearth-workpieces";
import {
  chooseCanonicalImageMapScriptSource,
  choosePreferredHydratedDraft,
  draftHasUsableScriptBody,
  hydrateDraftBodyFromCanonicalScript,
} from "../src/lib/hearth-draft-hydration";
import {
  selectActiveWorkpieceContext,
  selectWorkpieceNavItems,
} from "../src/lib/hearth-nav-model";
import { formatScriptToAnvilTagsNoAi, validateAnvilTagContract } from "../src/lib/anvil-tag-contract";
import {
  applyProductionArtifactToEpisodePackage,
  createEmptyEpisodePackageV2,
  ensureImageMapV2,
  ensureLaunchVariantsV2,
  hydrateEpisodePackageV2,
  mirrorEpisodePackageV2ToLegacy,
  resolvePrimarySeoTitle,
  type EpisodeImageMapEntry,
} from "../src/lib/episode-package-v2";
import {
  DEFAULT_HEARTH_VISUAL_STYLE,
  buildHearthVisualStylePromptLines,
  normalizeHearthVisualStyle,
  resolveHearthVisualStyleDefinition,
} from "../src/lib/hearth-visual-styles";
import {
  DEFAULT_TITLE_STYLE,
  getShadowCss,
  normalizeEpisodeThumbnailTitleStyle,
} from "../src/lib/hearth-title-fonts";
import {
  resolveThumbnailBrandRender,
  type ThumbnailBrandTemplate,
} from "../src/lib/hearth-thumbnail-brand-templates";

class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string) {
    this.store.set(key, value);
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }

  get length() {
    return this.store.size;
  }
}

type LocalStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

function resetLocalStorage(): LocalStorageLike {
  const storage = new MemoryStorage();
  storage.setItem("forge_tongs_api_token_v1", "DEV_TOKEN");
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: {
      localStorage: storage,
      location: { search: "" },
    },
    configurable: true,
  });
  return storage;
}

function createDraft(id: string, overrides?: Partial<Draft>): Draft {
  const now = Date.now();
  return {
    id,
    title: "Draft",
    body: "Body",
    createdAt: now,
    updatedAt: now,
    revisionCount: 0,
    lastRevisionAt: undefined,
    archived: false,
    pinned: false,
    ...overrides,
  };
}

function createRevision(id: string, draftId: string, createdAt: number): Revision {
  return {
    id,
    draftId,
    createdAt,
    titleSnapshot: "Title",
    bodySnapshot: "Body",
    kind: "manual",
    note: "Note",
  };
}

const WORKPIECE_A = "2980fc39-8c8b-489a-a900-8d3bd3248432";
const WORKPIECE_B = "54d58d65-7abf-4d50-b17f-5905f4b1ee61";
const WORKSPACE_ID = "2b2ef7aa-44d4-4d0d-93d7-b0aa4ec2b99d";
const ARCHIVE_ACTOR_ID = "6f4a0a73-19d2-4926-bf70-ebf2b9306db4";
const HEARTH_TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
const HEARTH_TEST_ORG_ID = "22222222-2222-4222-8222-222222222222";

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createTestAccessToken(userId = HEARTH_TEST_USER_ID): string {
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encodeBase64Url(JSON.stringify({
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + 3600,
  }));
  return `${header}.${payload}.signature`;
}

function primeHearthAiRequestTestSession(): void {
  const runtimeWindow = globalThis.window as typeof globalThis.window & Record<string, unknown>;
  runtimeWindow.__forgeSupabaseUrl = "https://example.supabase.co";
  runtimeWindow.__forgeSupabaseAnonKey = "test-anon-key";
  runtimeWindow.localStorage.setItem("forge-auth", JSON.stringify({
    currentSession: {
      access_token: createTestAccessToken(),
    },
  }));
}

function buildImageMapEntryFixture(id: string, overrides?: Partial<EpisodeImageMapEntry>): EpisodeImageMapEntry {
  return {
    id,
    anchor: "wide skyline",
    script_anchor: {
      section_id: "s1",
      paragraph_id: "s1:p1",
      paragraph_order: 1,
      sentence_start: 1,
      sentence_end: 1,
      char_start: 0,
      char_end: 12,
      span_text: "wide skyline",
      speaker_block_id: null,
    },
    description: "wide skyline",
    visual_intent: "wide skyline",
    prompt_basis: "wide skyline",
    purpose: "coverage",
    intent: "cutaway",
    source_type: "stock",
    beat_order: 1,
    paragraph_beat_order: 1,
    candidate_assets: [],
    selected_asset_id: null,
    status: "mapped",
    placement_hint: "after-hook",
    ...overrides,
  };
}

function buildRevisionSnapshot(workpieceId: string, revisions: Revision[]): HearthRevisionSnapshot {
  return {
    ...createEmptyRevisionSnapshot(workpieceId),
    updated_at: new Date().toISOString(),
    revisions: revisions.map((revision) => revisionToEntry(revision)),
  };
}

function testResolvePrimarySeoTitlePrefersPrimaryThenPopulatedFallback() {
  const primary = resolvePrimarySeoTitle([
    { id: "title-a", label: "A", text: "Primary title", is_primary: true },
    { id: "title-b", label: "B", text: "Secondary title", is_primary: false },
  ]);
  assert.equal(primary?.id, "title-a", "Resolver should return the marked primary title when it has text");

  const fallback = resolvePrimarySeoTitle([
    { id: "title-a", label: "A", text: "   ", is_primary: true },
    { id: "title-b", label: "B", text: "Secondary title", is_primary: false },
    { id: "title-c", label: "C", text: "Third title", is_primary: false },
  ]);
  assert.equal(fallback?.id, "title-b", "Resolver should fall back to the first populated title when primary is empty");

  const empty = resolvePrimarySeoTitle([
    { id: "title-a", label: "A", text: "", is_primary: true },
  ]);
  assert.equal(empty, null, "Resolver should return null when no populated titles exist");
}

function installTongsRevisionFetchHarness(options?: { failReads?: boolean }) {
  const originalFetch = globalThis.fetch;
  const files = new Map<string, { json: unknown; updatedAt: string }>();
  let sequence = 0;

  const keyFor = (workpieceId: string, path: string) => `${workpieceId}:${path}`;
  const nextUpdatedAt = () => {
    sequence += 1;
    return new Date(Date.UTC(2026, 2, 10, 12, 0, sequence)).toISOString();
  };

  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const rawUrl = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : String(input);
    const url = new URL(rawUrl, "https://example.test");
    const match = url.pathname.match(/^\/tongs\/workpieces\/([^/]+)\/(read-file|commit-file)$/);
    if (!match) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const workpieceId = decodeURIComponent(match[1] ?? "");
    const action = match[2];
    if (action === "read-file") {
      if (options?.failReads) {
        return new Response(JSON.stringify({ ok: false }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }

      const path = url.searchParams.get("path") ?? "";
      const found = files.get(keyFor(workpieceId, path));
      if (!found) {
        return new Response(JSON.stringify({ ok: true, exists: false }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        ok: true,
        data: found.json,
        file_row: { updated_at: found.updatedAt },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const body = init?.body ? JSON.parse(String(init.body)) as {
      path?: string;
      json?: unknown;
      expected_previous_updated_at?: string;
    } : {};
    const path = typeof body.path === "string" ? body.path : "";
    const existing = files.get(keyFor(workpieceId, path));
    if (body.expected_previous_updated_at && existing && existing.updatedAt !== body.expected_previous_updated_at) {
      return new Response(JSON.stringify({
        error: {
          code: "file_conflict",
          details: {
            path,
            expected_previous_updated_at: body.expected_previous_updated_at,
            current_updated_at: existing.updatedAt,
          },
        },
      }), {
        status: 409,
        headers: { "content-type": "application/json" },
      });
    }

    const updatedAt = nextUpdatedAt();
    files.set(keyFor(workpieceId, path), { json: body.json ?? null, updatedAt });
    return new Response(JSON.stringify({
      ok: true,
      data: { file_row: { updated_at: updatedAt } },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  return {
    restore() {
      globalThis.fetch = originalFetch;
    },
    setSnapshot(workpieceId: string, snapshot: HearthRevisionSnapshot) {
      files.set(keyFor(workpieceId, "hearth/revisions.v1.json"), {
        json: snapshot,
        updatedAt: nextUpdatedAt(),
      });
    },
  };
}

function installReadyQueueFetchHarness() {
  const originalFetch = globalThis.fetch;
  const listRequests: Array<{ workspaceId: string; includeHidden: string | null; unrecorded: string | null }> = [];
  const queueUpdates: Array<{
    workspaceId: string;
    entries: Array<{ workpiece_id: string; queue_rank?: number | null; hidden?: boolean | null }>;
  }> = [];
  const readyDeletes: Array<{ workpieceId: string; path: string | null }> = [];
  let readyScriptsPayload: unknown[] = [];
  let queueUpdateResponse = { updated_count: 0, deleted_count: 0 };

  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const rawUrl = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : String(input);
    const url = new URL(rawUrl, "https://example.test");

    const readyMatch = url.pathname.match(/^\/tongs\/workspaces\/([^/]+)\/ready-scripts$/);
    if (readyMatch && (init?.method ?? "GET") === "GET") {
      listRequests.push({
        workspaceId: decodeURIComponent(readyMatch[1] ?? ""),
        includeHidden: url.searchParams.get("include_hidden"),
        unrecorded: url.searchParams.get("unrecorded"),
      });
      return new Response(JSON.stringify({
        ok: true,
        data: {
          scripts: readyScriptsPayload,
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const updateMatch = url.pathname.match(/^\/tongs\/workspaces\/([^/]+)\/ready-queue-state$/);
    if (updateMatch && (init?.method ?? "GET") === "POST") {
      const parsed = init?.body
        ? JSON.parse(String(init.body)) as { entries?: Array<{ workpiece_id: string; queue_rank?: number | null; hidden?: boolean | null }> }
        : {};
      queueUpdates.push({
        workspaceId: decodeURIComponent(updateMatch[1] ?? ""),
        entries: parsed.entries ?? [],
      });
      return new Response(JSON.stringify({
        ok: true,
        data: queueUpdateResponse,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const deleteMatch = url.pathname.match(/^\/tongs\/workpieces\/([^/]+)\/ready-script$/);
    if (deleteMatch && (init?.method ?? "GET") === "DELETE") {
      readyDeletes.push({
        workpieceId: decodeURIComponent(deleteMatch[1] ?? ""),
        path: url.searchParams.get("path"),
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  return {
    restore() {
      globalThis.fetch = originalFetch;
    },
    setReadyScriptsPayload(value: unknown[]) {
      readyScriptsPayload = value;
    },
    setQueueUpdateResponse(value: { updated_count: number; deleted_count: number }) {
      queueUpdateResponse = value;
    },
    listRequests,
    queueUpdates,
    readyDeletes,
  };
}

function installImageMapFetchHarness() {
  const originalFetch = globalThis.fetch;
  const getRequests: string[] = [];
  const saveRequests: Array<{
    workpieceId: string;
    body: {
      workspace_id?: string;
      entries?: unknown[];
      expected_metadata_updated_at?: string | null;
    };
  }> = [];
  const generateRequests: Array<{
    workpieceId: string;
    body: {
      workspace_id?: string;
      image_map_entry_id?: string;
      expected_metadata_updated_at?: string | null;
      context_before?: string | null;
      context_after?: string | null;
    };
  }> = [];
  let getPayload: unknown = {
    image_map: {
      workpiece_id: WORKPIECE_A,
      workspace_id: WORKSPACE_ID,
      entries: [],
      metadata_updated_at: null,
    },
    asset: null,
  };
  let savePayload: unknown = getPayload;
  let generatePayload: unknown = {
    image_map: {
      workpiece_id: WORKPIECE_A,
      workspace_id: WORKSPACE_ID,
      entries: [],
      metadata_updated_at: "2026-03-10T16:20:00.000Z",
    },
    asset: null,
    generated_assets: [],
  };
  let conflictMode = false;
  let generateConflictMode = false;
  const previewFiles = new Map<string, { bytesBase64: string; contentType: string }>();

  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const rawUrl = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : String(input);
    const url = new URL(rawUrl, "https://example.test");
    const match = url.pathname.match(/^\/tongs\/workpieces\/([^/]+)\/image-map$/);
    const generateMatch = url.pathname.match(/^\/tongs\/workpieces\/([^/]+)\/image-map\/generate-candidates$/);
    const readMatch = url.pathname.match(/^\/tongs\/workpieces\/([^/]+)\/read-file$/);
    if (readMatch) {
      const path = url.searchParams.get("path") ?? "";
      const preview = previewFiles.get(path);
      if (!preview) {
        return new Response(JSON.stringify({ ok: false }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        ok: true,
        data: {
          bytes_base64: preview.bytesBase64,
          content_type: preview.contentType,
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (generateMatch) {
      const workpieceId = decodeURIComponent(generateMatch[1] ?? "");
      const body = init?.body
        ? JSON.parse(String(init.body)) as {
          workspace_id?: string;
          image_map_entry_id?: string;
          expected_metadata_updated_at?: string | null;
          context_before?: string | null;
          context_after?: string | null;
        }
        : {};
      generateRequests.push({ workpieceId, body });
      if (generateConflictMode) {
        return new Response(JSON.stringify({
          ok: false,
          error: {
            code: "image_map_conflict",
            message: "Image map changed since last load.",
          },
        }), {
          status: 409,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        ok: true,
        data: generatePayload,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (!match) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const workpieceId = decodeURIComponent(match[1] ?? "");
    const method = init?.method ?? "GET";
    if (method === "GET") {
      getRequests.push(workpieceId);
      return new Response(JSON.stringify({
        ok: true,
        data: getPayload,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const body = init?.body
      ? JSON.parse(String(init.body)) as {
        workspace_id?: string;
        entries?: unknown[];
        expected_metadata_updated_at?: string | null;
      }
      : {};
    saveRequests.push({ workpieceId, body });

    if (conflictMode) {
      return new Response(JSON.stringify({
        ok: false,
        error: {
          code: "image_map_conflict",
          message: "Image map changed since last load.",
        },
      }), {
        status: 409,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      data: savePayload,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  return {
    restore() {
      globalThis.fetch = originalFetch;
    },
    setGetPayload(value: unknown) {
      getPayload = value;
    },
    setSavePayload(value: unknown) {
      savePayload = value;
    },
    setGeneratePayload(value: unknown) {
      generatePayload = value;
    },
    setConflictMode(value: boolean) {
      conflictMode = value;
    },
    setGenerateConflictMode(value: boolean) {
      generateConflictMode = value;
    },
    setPreviewFile(path: string, bytesBase64: string, contentType = "image/png") {
      previewFiles.set(path, { bytesBase64, contentType });
    },
    getRequests,
    saveRequests,
    generateRequests,
  };
}

function installWorkpieceFetchHarness() {
  const originalFetch = globalThis.fetch;
  const listRequests: Array<{ workspaceId: string; includeArchived: string | null }> = [];
  const scriptReads: string[] = [];
  const draftReads: string[] = [];
  const archiveRequests: Array<{ workpieceId: string; body: Record<string, unknown> | null }> = [];
  const restoreRequests: Array<{ workpieceId: string; body: Record<string, unknown> | null }> = [];
  let episodesPayload: unknown[] = [];
  const primaryScripts = new Map<string, { text: string | null; updatedAt: string | null }>();
  const draftSnapshots = new Map<string, { json: unknown; updatedAt: string | null }>();

  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const rawUrl = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : String(input);
    const url = new URL(rawUrl, "https://example.test");

    const episodesMatch = url.pathname.match(/^\/tongs\/workspaces\/([^/]+)\/episodes$/);
    if (episodesMatch && (init?.method ?? "GET") === "GET") {
      listRequests.push({
        workspaceId: decodeURIComponent(episodesMatch[1] ?? ""),
        includeArchived: url.searchParams.get("include_archived"),
      });
      return new Response(JSON.stringify({
        ok: true,
        data: {
          episodes: episodesPayload,
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const archiveMatch = url.pathname.match(/^\/tongs\/workpieces\/([^/]+)\/archive$/);
    if (archiveMatch && (init?.method ?? "GET") === "POST") {
      const workpieceId = decodeURIComponent(archiveMatch[1] ?? "");
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
      archiveRequests.push({ workpieceId, body });

      const currentRow = (episodesPayload.find((entry) => (
        entry && typeof entry === "object" && !Array.isArray(entry) && (entry as { id?: unknown }).id === workpieceId
      )) as Record<string, unknown> | undefined) ?? {};
      const archivedRow = {
        ...currentRow,
        id: workpieceId,
        workspace_id: typeof body?.workspace_id === "string" ? body.workspace_id : WORKSPACE_ID,
        label: currentRow.label ?? null,
        created_at: currentRow.created_at ?? "2026-03-10T12:00:00.000Z",
        updated_at: "2026-03-11T15:30:00.000Z",
        archived_at: "2026-03-11T15:30:00.000Z",
        archived_by: ARCHIVE_ACTOR_ID,
        archive_reason: typeof body?.reason === "string" ? body.reason : null,
      };
      episodesPayload = episodesPayload.map((entry) => (
        entry && typeof entry === "object" && !Array.isArray(entry) && (entry as { id?: unknown }).id === workpieceId
          ? archivedRow
          : entry
      ));

      return new Response(JSON.stringify({
        ok: true,
        data: {
          workpiece: archivedRow,
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const restoreMatch = url.pathname.match(/^\/tongs\/workpieces\/([^/]+)\/restore$/);
    if (restoreMatch && (init?.method ?? "GET") === "POST") {
      const workpieceId = decodeURIComponent(restoreMatch[1] ?? "");
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
      restoreRequests.push({ workpieceId, body });

      const currentRow = (episodesPayload.find((entry) => (
        entry && typeof entry === "object" && !Array.isArray(entry) && (entry as { id?: unknown }).id === workpieceId
      )) as Record<string, unknown> | undefined) ?? {};
      const restoredRow = {
        ...currentRow,
        id: workpieceId,
        workspace_id: typeof body?.workspace_id === "string" ? body.workspace_id : WORKSPACE_ID,
        label: currentRow.label ?? null,
        created_at: currentRow.created_at ?? "2026-03-10T12:00:00.000Z",
        updated_at: "2026-03-11T15:35:00.000Z",
        archived_at: null,
        archived_by: null,
        archive_reason: null,
      };
      episodesPayload = episodesPayload.map((entry) => (
        entry && typeof entry === "object" && !Array.isArray(entry) && (entry as { id?: unknown }).id === workpieceId
          ? restoredRow
          : entry
      ));

      return new Response(JSON.stringify({
        ok: true,
        data: {
          workpiece: restoredRow,
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const scriptMatch = url.pathname.match(/^\/tongs\/workpieces\/([^/]+)\/read-file$/);
    if (scriptMatch && (init?.method ?? "GET") === "GET" && url.searchParams.get("path") === "script/script.md") {
      const workpieceId = decodeURIComponent(scriptMatch[1] ?? "");
      scriptReads.push(workpieceId);
      const script = primaryScripts.get(workpieceId);
      if (!script) {
        return new Response(JSON.stringify({ ok: true, exists: false }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        ok: true,
        data: script.text,
        file_row: {
          updated_at: script.updatedAt,
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (scriptMatch && (init?.method ?? "GET") === "GET" && url.searchParams.get("path") === "hearth/drafts.v1.json") {
      const workpieceId = decodeURIComponent(scriptMatch[1] ?? "");
      draftReads.push(workpieceId);
      const snapshot = draftSnapshots.get(workpieceId);
      if (!snapshot) {
        return new Response(JSON.stringify({ ok: true, exists: false }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        ok: true,
        data: snapshot.json,
        file_row: {
          updated_at: snapshot.updatedAt,
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  return {
    restore() {
      globalThis.fetch = originalFetch;
    },
    setEpisodesPayload(value: unknown[]) {
      episodesPayload = value;
    },
    setPrimaryScript(workpieceId: string, text: string | null, updatedAt: string | null) {
      primaryScripts.set(workpieceId, { text, updatedAt });
    },
    setDraftSnapshot(workpieceId: string, json: unknown, updatedAt: string | null) {
      draftSnapshots.set(workpieceId, { json, updatedAt });
    },
    listRequests,
    archiveRequests,
    restoreRequests,
    scriptReads,
    draftReads,
  };
}

function installSparkFetchHarness() {
  const originalFetch = globalThis.fetch;
  const listRequests: string[] = [];
  let sparksPayload: unknown[] = [];

  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const rawUrl = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : String(input);
    const url = new URL(rawUrl, "https://example.test");

    const sparksMatch = url.pathname.match(/^\/tongs\/workspaces\/([^/]+)\/sparks$/);
    if (sparksMatch && (init?.method ?? "GET") === "GET") {
      listRequests.push(decodeURIComponent(sparksMatch[1] ?? ""));
      return new Response(JSON.stringify({
        ok: true,
        data: {
          sparks: sparksPayload,
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  return {
    restore() {
      globalThis.fetch = originalFetch;
    },
    setSparksPayload(value: unknown[]) {
      sparksPayload = value;
    },
    listRequests,
  };
}

function createWorkpieceSummary(
  workpieceId: string,
  overrides?: Partial<HearthWorkpieceSummary>,
): HearthWorkpieceSummary {
  return {
    workpieceId,
    workspaceId: WORKSPACE_ID,
    title: `Episode ${workpieceId.slice(0, 8)}`,
    label: `Episode ${workpieceId.slice(0, 8)}`,
    createdAt: "2026-03-10T12:00:00.000Z",
    updatedAt: "2026-03-10T12:00:00.000Z",
    createdAtMs: Date.parse("2026-03-10T12:00:00.000Z"),
    updatedAtMs: Date.parse("2026-03-10T12:00:00.000Z"),
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
    isArchived: false,
    ...overrides,
  };
}

async function testDraftFlagsRoundtrip() {
  resetLocalStorage();
  const store = new LocalHearthStore();
  const draft = createDraft("draft-flags", { pinned: true, archived: true });
  await store.saveDraft(draft);

  const loaded = await store.getDraft(draft.id);
  assert.ok(loaded, "Draft should load");
  assert.equal(loaded?.pinned, true, "Pinned flag should roundtrip");
  assert.equal(loaded?.archived, true, "Archived flag should roundtrip");
}

async function testRevisionCap() {
  resetLocalStorage();
  const store = new LocalHearthStore();
  const draft = createDraft("draft-rev");
  await store.saveDraft(draft);

  for (let i = 0; i < 201; i += 1) {
    await store.saveRevision(WORKPIECE_A, createRevision(`rev-${i}`, draft.id, 1000 + i));
  }

  const revisions = await store.listRevisions(WORKPIECE_A, draft.id);
  assert.equal(revisions.length, 200, "Should cap revisions at 200");
  assert.equal(revisions[0]?.id, "rev-200", "Newest revision should be first");
  assert.equal(revisions[revisions.length - 1]?.id, "rev-1", "Oldest should be pruned");
}

async function testTongsRevisionRoundtrip() {
  resetLocalStorage();
  const harness = installTongsRevisionFetchHarness();
  const store = new TongsHearthStore();

  try {
    const revision = createRevision("rev-remote", "draft-remote", 1_000);
    await store.saveRevision(WORKPIECE_A, revision);

    const revisions = await store.listRevisions(WORKPIECE_A, revision.draftId);
    assert.equal(revisions.length, 1, "Tongs-backed revision should roundtrip");
    assert.equal(revisions[0]?.id, revision.id, "Saved revision should load from canonical snapshot");

    const restored = await store.restoreRevision(WORKPIECE_A, revision.id);
    assert.equal(restored?.title, revision.titleSnapshot, "Restore should read canonical title snapshot");
    assert.equal(restored?.body, revision.bodySnapshot, "Restore should read canonical body snapshot");
  } finally {
    harness.restore();
  }
}

async function testTongsRevisionIsolationByWorkpiece() {
  resetLocalStorage();
  const harness = installTongsRevisionFetchHarness();
  const store = new TongsHearthStore();

  try {
    await store.saveRevision(WORKPIECE_A, createRevision("rev-a", "draft-a", 1_000));
    await store.saveRevision(WORKPIECE_B, createRevision("rev-b", "draft-b", 2_000));

    const revisionsA = await store.listRevisions(WORKPIECE_A);
    const revisionsB = await store.listRevisions(WORKPIECE_B);
    assert.deepEqual(revisionsA.map((revision) => revision.id), ["rev-a"]);
    assert.deepEqual(revisionsB.map((revision) => revision.id), ["rev-b"]);
  } finally {
    harness.restore();
  }
}

async function testTongsRevisionFallbackPrecedence() {
  resetLocalStorage();
  const store = new TongsHearthStore();
  const staleRevision = createRevision("rev-stale", "draft-stale", 1_000);
  saveRevisionSnapshotFallback(WORKPIECE_A, buildRevisionSnapshot(WORKPIECE_A, [staleRevision]));

  const harness = installTongsRevisionFetchHarness();
  try {
    const remoteRevision = createRevision("rev-remote", "draft-remote", 2_000);
    harness.setSnapshot(WORKPIECE_A, buildRevisionSnapshot(WORKPIECE_A, [remoteRevision]));

    const revisions = await store.listRevisions(WORKPIECE_A);
    assert.deepEqual(revisions.map((revision) => revision.id), ["rev-remote"], "Remote snapshot should beat stale fallback");

    const mirroredFallback = loadRevisionSnapshotFallback(WORKPIECE_A);
    assert.equal(mirroredFallback?.revisions[0]?.id, "rev-remote", "Fallback mirror should be updated from remote");
  } finally {
    harness.restore();
  }

  const failHarness = installTongsRevisionFetchHarness({ failReads: true });
  try {
    const revisions = await store.listRevisions(WORKPIECE_A);
    assert.deepEqual(revisions.map((revision) => revision.id), ["rev-remote"], "Fallback should be used when canonical read fails");
  } finally {
    failHarness.restore();
  }
}

async function testTongsRevisionCap() {
  resetLocalStorage();
  const harness = installTongsRevisionFetchHarness();
  const store = new TongsHearthStore();

  try {
    for (let i = 0; i < 201; i += 1) {
      await store.saveRevision(WORKPIECE_A, createRevision(`remote-${i}`, "draft-remote", 1_000 + i));
    }

    const revisions = await store.listRevisions(WORKPIECE_A, "draft-remote");
    assert.equal(revisions.length, 200, "Canonical snapshot should cap revision history");
    assert.equal(revisions[0]?.id, "remote-200");
    assert.equal(revisions[revisions.length - 1]?.id, "remote-1");
  } finally {
    harness.restore();
  }
}

async function testReadyScriptsRoundtripIgnoresLegacyLocalOrder() {
  const storage = resetLocalStorage();
  storage.setItem(`hearth:ready-order:v1:${WORKSPACE_ID}`, JSON.stringify([
    `ready:${WORKPIECE_A}:script/script.md`,
    `ready:${WORKPIECE_B}:script/script.md`,
  ]));
  storage.setItem(`hearth:ready-removed:v1:${WORKSPACE_ID}`, JSON.stringify([
    `ready:${WORKPIECE_B}:script/script.md`,
  ]));

  const harness = installReadyQueueFetchHarness();
  harness.setReadyScriptsPayload([
    {
      workspace_id: WORKSPACE_ID,
      workpiece_id: WORKPIECE_B,
      primary_script_path: "script/script.md",
      script_paths: ["script/script.md"],
      title: "Ready Beta",
      updated_at: "2026-03-10T14:30:00.000Z",
      queue_rank: 0,
      hidden_at: "2026-03-10T14:31:00.000Z",
      hidden_by: WORKPIECE_A,
      marked_ready_at: "2026-03-10T14:30:00.000Z",
      marked_ready_by: WORKPIECE_A,
    },
    {
      workspace_id: WORKSPACE_ID,
      workpiece_id: WORKPIECE_A,
      primary_script_path: "script/script.md",
      script_paths: ["script/script.md"],
      title: "Ready Alpha",
      updated_at: "2026-03-10T14:00:00.000Z",
      queue_rank: 2,
      hidden_at: null,
      hidden_by: null,
      marked_ready_at: "2026-03-10T14:00:00.000Z",
      marked_ready_by: WORKPIECE_B,
    },
  ]);

  try {
    const scripts = await listHearthReadyScripts(WORKSPACE_ID);
    assert.deepEqual(
      scripts.map((entry) => entry.workpieceId),
      [WORKPIECE_B, WORKPIECE_A],
      "Remote queue order should win over legacy local Ready order keys",
    );
    assert.equal(harness.listRequests.length, 1);
    assert.equal(harness.listRequests[0]?.workspaceId, WORKSPACE_ID);
    assert.equal(harness.listRequests[0]?.includeHidden, "1");
    assert.equal(harness.listRequests[0]?.unrecorded, null);
    assert.equal(scripts[0]?.queueRank, 0);
    assert.equal(scripts[0]?.hiddenAt, "2026-03-10T14:31:00.000Z");
    assert.equal(scripts[0]?.hiddenBy, WORKPIECE_A);
    assert.equal(scripts[1]?.queueRank, 2);
    assert.equal(scripts[1]?.hiddenAt, null);
  } finally {
    harness.restore();
  }
}

async function testReadyScriptsCanonicalQueryOverridesPriorClientResidueAcrossRefresh() {
  const firstClientStorage = resetLocalStorage();
  firstClientStorage.setItem(`hearth:ready-order:v1:${WORKSPACE_ID}`, JSON.stringify([
    `ready:${WORKPIECE_A}:script/script.md`,
    `ready:${WORKPIECE_B}:script/script.md`,
  ]));
  const harness = installReadyQueueFetchHarness();
  harness.setReadyScriptsPayload([
    {
      workspace_id: WORKSPACE_ID,
      workpiece_id: WORKPIECE_B,
      primary_script_path: "script/script.md",
      script_paths: ["script/script.md"],
      title: "Ready Beta",
      updated_at: "2026-03-10T14:30:00.000Z",
      queue_rank: 0,
      hidden_at: null,
      hidden_by: null,
      marked_ready_at: "2026-03-10T14:30:00.000Z",
      marked_ready_by: WORKPIECE_A,
    },
    {
      workspace_id: WORKSPACE_ID,
      workpiece_id: WORKPIECE_A,
      primary_script_path: "script/script.md",
      script_paths: ["script/script.md"],
      title: "Ready Alpha",
      updated_at: "2026-03-10T14:00:00.000Z",
      queue_rank: 1,
      hidden_at: null,
      hidden_by: null,
      marked_ready_at: "2026-03-10T14:00:00.000Z",
      marked_ready_by: WORKPIECE_B,
    },
  ]);

  try {
    const firstClient = await listHearthReadyScripts(WORKSPACE_ID);
    assert.deepEqual(
      firstClient.map((entry) => entry.workpieceId),
      [WORKPIECE_B, WORKPIECE_A],
      "First client should derive candidate membership and order from canonical query results",
    );

    resetLocalStorage();
    const secondClient = await listHearthReadyScripts(WORKSPACE_ID);
    assert.deepEqual(
      secondClient.map((entry) => entry.workpieceId),
      [WORKPIECE_B, WORKPIECE_A],
      "Second client should see the same canonical candidate truth without inherited local residue",
    );

    harness.setReadyScriptsPayload([
      {
        workspace_id: WORKSPACE_ID,
        workpiece_id: WORKPIECE_A,
        primary_script_path: "script/script.md",
        script_paths: ["script/script.md"],
        title: "Ready Alpha",
        updated_at: "2026-03-10T15:00:00.000Z",
        queue_rank: 0,
        hidden_at: null,
        hidden_by: null,
        marked_ready_at: "2026-03-10T15:00:00.000Z",
        marked_ready_by: WORKPIECE_B,
      },
    ]);

    const refreshed = await listHearthReadyScripts(WORKSPACE_ID);
    assert.deepEqual(
      refreshed.map((entry) => entry.workpieceId),
      [WORKPIECE_A],
      "Canonical refresh should overwrite prior client residue and remove ineligible candidates cleanly",
    );
    assert.equal(refreshed[0]?.queueRank, 0);
    assert.equal(harness.listRequests.length, 3);
  } finally {
    harness.restore();
  }
}

async function testReadyQueueReorderPayload() {
  resetLocalStorage();
  const harness = installReadyQueueFetchHarness();
  harness.setQueueUpdateResponse({ updated_count: 2, deleted_count: 0 });

  try {
    const result = await reorderHearthReadyScripts({
      workspaceId: WORKSPACE_ID,
      orderedWorkpieceIds: [WORKPIECE_B, WORKPIECE_A, WORKPIECE_B, "not-a-uuid"],
    });
    assert.equal(result.ok, true);
    assert.equal(harness.queueUpdates.length, 1);
    assert.equal(harness.queueUpdates[0]?.workspaceId, WORKSPACE_ID);
    assert.deepEqual(harness.queueUpdates[0]?.entries, [
      { workpiece_id: WORKPIECE_B, queue_rank: 0 },
      { workpiece_id: WORKPIECE_A, queue_rank: 1 },
    ]);
  } finally {
    harness.restore();
  }
}

async function testReadyQueueHiddenMutationPayload() {
  resetLocalStorage();
  const harness = installReadyQueueFetchHarness();
  harness.setQueueUpdateResponse({ updated_count: 1, deleted_count: 0 });

  try {
    const result = await setHearthReadyScriptHidden({
      workspaceId: WORKSPACE_ID,
      workpieceId: WORKPIECE_A,
      hidden: true,
    });
    assert.equal(result.ok, true);
    assert.equal(harness.queueUpdates.length, 1);
    assert.deepEqual(harness.queueUpdates[0], {
      workspaceId: WORKSPACE_ID,
      entries: [{ workpiece_id: WORKPIECE_A, hidden: true }],
    });
  } finally {
    harness.restore();
  }
}

async function testReadyScriptRemovalDeletesAllCanonicalPaths() {
  resetLocalStorage();
  const harness = installReadyQueueFetchHarness();

  try {
    const result = await removeHearthReadyScripts({
      workpieceId: WORKPIECE_A,
      paths: [
        "script/script.md",
        "script/script.published.md",
        "script/script.md",
        "not-a-ready-path",
      ],
    });
    assert.equal(result.ok, true);
    assert.deepEqual(harness.readyDeletes, [
      { workpieceId: WORKPIECE_A, path: "script/script.md" },
      { workpieceId: WORKPIECE_A, path: "script/script.published.md" },
    ]);
  } finally {
    harness.restore();
  }
}

async function testImageMapRepoReadNormalizesSemanticEntriesAndAssetSummary() {
  resetLocalStorage();
  const harness = installImageMapFetchHarness();
  harness.setGetPayload({
    image_map: {
      workpiece_id: WORKPIECE_A,
      workspace_id: WORKSPACE_ID,
      entries: [
        buildImageMapEntryFixture("image-map-01", {
          anchor: "s1:p1#sent1",
          source_type: "script",
        }),
      ],
      metadata_updated_at: "2026-03-10T16:20:00.000Z",
    },
    asset: {
      id: "asset-image-map",
      asset_kind: "image_map_json",
      status: "ready",
      path: "assets/image-map/image-map.v1.json",
      storage_bucket: "forge-workpieces",
      storage_key: `workpieces/${WORKPIECE_A}/assets/image-map/image-map.v1.json`,
      metadata_json: {
        schema: "forge.image-map.v1",
        entry_count: 1,
      },
      created_at: "2026-03-10T16:20:00.000Z",
      updated_at: "2026-03-10T16:20:00.000Z",
      supersedes_asset_id: null,
    },
  });

  try {
    const result = await getWorkpieceImageMap(WORKPIECE_A);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.imageMap.workpieceId, WORKPIECE_A);
      assert.equal(result.imageMap.workspaceId, WORKSPACE_ID);
      assert.equal(result.imageMap.entries[0]?.anchor, "wide skyline");
      assert.equal(result.imageMap.entries[0]?.source_type, "stock");
      assert.equal(result.imageMap.entries[0]?.script_anchor?.paragraph_id, "s1:p1");
      assert.equal(result.imageMap.entries[0]?.beat_order, 1);
      assert.equal(result.imageMap.metadataUpdatedAt, "2026-03-10T16:20:00.000Z");
      assert.equal(result.imageMap.asset?.assetKind, "image_map_json");
      assert.equal(result.imageMap.asset?.entryCount, 1);
    }
    assert.deepEqual(harness.getRequests, [WORKPIECE_A]);
  } finally {
    harness.restore();
  }
}

async function testImageMapRepoSaveForwardsExpectedTimestampAndReturnsLatestOnConflict() {
  resetLocalStorage();
  const harness = installImageMapFetchHarness();
  harness.setSavePayload({
    image_map: {
      workpiece_id: WORKPIECE_A,
      workspace_id: WORKSPACE_ID,
      entries: [
        buildImageMapEntryFixture("image-map-01"),
      ],
      metadata_updated_at: "2026-03-10T16:25:00.000Z",
    },
    asset: {
      id: "asset-image-map-next",
      asset_kind: "image_map_json",
      status: "ready",
      path: "assets/image-map/image-map.v1.json",
      storage_bucket: "forge-workpieces",
      storage_key: `workpieces/${WORKPIECE_A}/assets/image-map/image-map.v1.json`,
      metadata_json: {
        schema: "forge.image-map.v1",
        entry_count: 1,
      },
      created_at: "2026-03-10T16:25:00.000Z",
      updated_at: "2026-03-10T16:25:00.000Z",
      supersedes_asset_id: "asset-image-map",
    },
  });

  try {
    const saveResult = await saveWorkpieceImageMap({
      workpieceId: WORKPIECE_A,
      workspaceId: WORKSPACE_ID,
      entries: [
        buildImageMapEntryFixture("image-map-01"),
      ],
      expectedMetadataUpdatedAt: "2026-03-10T16:20:00.000Z",
    });
    assert.equal(saveResult.ok, true);
    assert.equal(harness.saveRequests.length, 1);
    assert.equal(harness.saveRequests[0]?.body.expected_metadata_updated_at, "2026-03-10T16:20:00.000Z");

    harness.setConflictMode(true);
    harness.setGetPayload({
      image_map: {
        workpiece_id: WORKPIECE_A,
        workspace_id: WORKSPACE_ID,
        entries: [
          buildImageMapEntryFixture("image-map-latest", {
            anchor: "s1:p9#sent1",
            script_anchor: {
              section_id: "s1",
              paragraph_id: "s1:p9",
              paragraph_order: 9,
              sentence_start: 1,
              sentence_end: 1,
              char_start: 0,
              char_end: 12,
              span_text: "latest state",
              speaker_block_id: null,
            },
            description: "latest state",
            visual_intent: "latest state",
            prompt_basis: "latest state",
            intent: "graphic",
            placement_hint: null,
          }),
        ],
        metadata_updated_at: "2026-03-10T16:30:00.000Z",
      },
      asset: null,
    });

    const conflictResult = await saveWorkpieceImageMap({
      workpieceId: WORKPIECE_A,
      workspaceId: WORKSPACE_ID,
      entries: [],
      expectedMetadataUpdatedAt: "2026-03-10T16:25:00.000Z",
    });
    assert.equal(conflictResult.ok, false);
    if (!conflictResult.ok) {
      assert.equal(conflictResult.reason, "conflict");
      assert.equal(conflictResult.latest?.entries[0]?.id, "image-map-latest");
      assert.equal(conflictResult.latest?.metadataUpdatedAt, "2026-03-10T16:30:00.000Z");
    }
  } finally {
    harness.restore();
  }
}

async function testImageMapRepoRejectsMismatchedCanonicalAttachment() {
  resetLocalStorage();
  const harness = installImageMapFetchHarness();
  harness.setGetPayload({
    image_map: {
      workpiece_id: WORKPIECE_B,
      workspace_id: WORKSPACE_ID,
      entries: [],
      metadata_updated_at: "2026-03-10T16:20:00.000Z",
    },
    asset: null,
  });

  try {
    const result = await getWorkpieceImageMap(WORKPIECE_A);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_response");
    }
  } finally {
    harness.restore();
  }
}

async function testImageMapCandidateGenerationRoundTripsCanonicalRefs() {
  resetLocalStorage();
  const harness = installImageMapFetchHarness();
  harness.setGeneratePayload({
    image_map: {
      workpiece_id: WORKPIECE_A,
      workspace_id: WORKSPACE_ID,
      entries: [
        buildImageMapEntryFixture("image-map-01", {
          source_type: "ai",
          status: "candidates_generated",
          candidate_assets: [
            {
              asset_id: "candidate-a",
              path: "assets/image-map/candidates/a.png",
              variant_label: "explainer",
              visual_mode: "comparison",
              mime_type: "image/png",
            },
            {
              asset_id: "candidate-b",
              path: "assets/image-map/candidates/b.png",
              variant_label: "illustrative",
              visual_mode: "comparison",
              mime_type: "image/png",
            },
          ],
        }),
      ],
      metadata_updated_at: "2026-03-10T18:00:00.000Z",
    },
    asset: null,
    generated_assets: [
      {
        id: "candidate-a",
        workspace_id: WORKSPACE_ID,
        episode_id: WORKPIECE_A,
        image_map_entry_id: "image-map-01",
        path: "assets/image-map/candidates/a.png",
        storage_bucket: "forge-workpieces",
        storage_key: `workpieces/${WORKPIECE_A}/assets/image-map/candidates/a.png`,
        mime_type: "image/png",
        bytes: 256,
        provider: "openai",
        provider_request_id: "req-a",
        request_id: "request-a",
        variant_label: "explainer",
        visual_mode: "comparison",
        prompt: "Prompt A",
      },
      {
        id: "candidate-b",
        workspace_id: WORKSPACE_ID,
        episode_id: WORKPIECE_A,
        image_map_entry_id: "image-map-01",
        path: "assets/image-map/candidates/b.png",
        storage_bucket: "forge-workpieces",
        storage_key: `workpieces/${WORKPIECE_A}/assets/image-map/candidates/b.png`,
        mime_type: "image/png",
        bytes: 257,
        provider: "openai",
        provider_request_id: "req-b",
        request_id: "request-b",
        variant_label: "illustrative",
        visual_mode: "comparison",
        prompt: "Prompt B",
      },
    ],
    token_balance: 17,
  });

  try {
    const result = await generateWorkpieceImageMapCandidates({
      workpieceId: WORKPIECE_A,
      workspaceId: WORKSPACE_ID,
      imageMapEntryId: "image-map-01",
      expectedMetadataUpdatedAt: "2026-03-10T16:20:00.000Z",
      contextBefore: "Prior sentence.",
      contextAfter: "Following sentence.",
      aspect: "16:9",
      confirmSpend: true,
      alwaysApproveAiSpend: true,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.generatedAssets.length, 2);
      assert.equal(result.generatedAssets[0]?.variantLabel, "explainer");
      assert.equal(result.generatedAssets[1]?.visualMode, "comparison");
      assert.equal(result.imageMap.entries[0]?.candidate_assets[1]?.variant_label, "illustrative");
      assert.equal(result.tokenBalance, 17);
    }
    assert.equal(harness.generateRequests.length, 1);
    assert.equal(harness.generateRequests[0]?.body.image_map_entry_id, "image-map-01");
    assert.equal(harness.generateRequests[0]?.body.context_before, "Prior sentence.");
  } finally {
    harness.restore();
  }
}

async function testImageMapCandidateSelectionPersistsCanonicalSelectedAsset() {
  resetLocalStorage();
  const harness = installImageMapFetchHarness();
  harness.setSavePayload({
    image_map: {
      workpiece_id: WORKPIECE_A,
      workspace_id: WORKSPACE_ID,
      entries: [
        buildImageMapEntryFixture("image-map-01", {
          source_type: "ai",
          status: "selected",
          candidate_assets: [
            {
              asset_id: "candidate-a",
              path: "assets/image-map/candidates/a.png",
              variant_label: "explainer",
              visual_mode: "comparison",
              mime_type: "image/png",
            },
            {
              asset_id: "candidate-b",
              path: "assets/image-map/candidates/b.png",
              variant_label: "illustrative",
              visual_mode: "comparison",
              mime_type: "image/png",
            },
          ],
          selected_asset_id: "candidate-b",
        }),
      ],
      metadata_updated_at: "2026-03-10T19:00:00.000Z",
    },
    asset: null,
  });

  try {
    const result = await selectWorkpieceImageMapCandidate({
      workpieceId: WORKPIECE_A,
      workspaceId: WORKSPACE_ID,
      imageMapEntryId: "image-map-01",
      candidateAssetId: "candidate-b",
      expectedMetadataUpdatedAt: "2026-03-10T18:00:00.000Z",
      currentImageMap: {
        workpieceId: WORKPIECE_A,
        workspaceId: WORKSPACE_ID,
        spokenBeats: [],
        entries: [
          buildImageMapEntryFixture("image-map-01", {
            source_type: "ai",
            status: "candidates_generated",
            candidate_assets: [
              {
                asset_id: "candidate-a",
                path: "assets/image-map/candidates/a.png",
                variant_label: "explainer",
                visual_mode: "comparison",
                mime_type: "image/png",
              },
              {
                asset_id: "candidate-b",
                path: "assets/image-map/candidates/b.png",
                variant_label: "illustrative",
                visual_mode: "comparison",
                mime_type: "image/png",
              },
            ],
            selected_asset_id: null,
          }),
        ],
        metadataUpdatedAt: "2026-03-10T18:00:00.000Z",
        asset: null,
      },
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.imageMap.entries[0]?.selected_asset_id, "candidate-b");
      assert.equal(result.imageMap.entries[0]?.status, "selected");
    }
    assert.equal(harness.saveRequests.length, 1);
    assert.equal(harness.saveRequests[0]?.body.expected_metadata_updated_at, "2026-03-10T18:00:00.000Z");
    assert.equal((harness.saveRequests[0]?.body.entries?.[0] as { selected_asset_id?: string } | undefined)?.selected_asset_id, "candidate-b");
  } finally {
    harness.restore();
  }
}

async function testImageMapCandidateSelectionRejectsDetachedCandidate() {
  resetLocalStorage();
  const harness = installImageMapFetchHarness();

  try {
    const result = await selectWorkpieceImageMapCandidate({
      workpieceId: WORKPIECE_A,
      workspaceId: WORKSPACE_ID,
      imageMapEntryId: "image-map-01",
      candidateAssetId: "candidate-z",
      currentImageMap: {
        workpieceId: WORKPIECE_A,
        workspaceId: WORKSPACE_ID,
        spokenBeats: [],
        entries: [
          buildImageMapEntryFixture("image-map-01", {
            source_type: "ai",
            status: "candidates_generated",
            candidate_assets: [
              {
                asset_id: "candidate-a",
                path: "assets/image-map/candidates/a.png",
                variant_label: "explainer",
                visual_mode: "comparison",
                mime_type: "image/png",
              },
            ],
          }),
        ],
        metadataUpdatedAt: "2026-03-10T18:00:00.000Z",
        asset: null,
      },
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "candidate_not_attached");
    }
    assert.equal(harness.saveRequests.length, 0);
  } finally {
    harness.restore();
  }
}

async function testImageMapCandidatePreviewLoaderReadsCanonicalFilePath() {
  resetLocalStorage();
  const harness = installImageMapFetchHarness();
  harness.setPreviewFile("assets/image-map/candidates/a.png", "cHJldmlldy1pbWFnZQ==", "image/png");

  try {
    const result = await loadImageMapCandidatePreviewDataUrl({
      workpieceId: WORKPIECE_A,
      path: "assets/image-map/candidates/a.png",
      mimeType: "image/png",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.match(result.dataUrl, /^data:image\/png;base64,/);
      assert.equal(result.path, "assets/image-map/candidates/a.png");
    }
  } finally {
    harness.restore();
  }
}

async function testImageMapCandidatePreviewLoaderNormalizesRepeatedWorkpiecePrefixes() {
  resetLocalStorage();
  const harness = installImageMapFetchHarness();
  harness.setPreviewFile("assets/image-map/candidates/a.png", "cHJldmlldy1pbWFnZQ==", "image/png");

  try {
    const result = await loadImageMapCandidatePreviewDataUrl({
      workpieceId: WORKPIECE_A,
      path: `workpieces/${WORKPIECE_A}/workpieces/${WORKPIECE_A}/assets/image-map/candidates/a.png`,
      mimeType: "image/png",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.match(result.dataUrl, /^data:image\/png;base64,/);
      assert.equal(result.path, "assets/image-map/candidates/a.png");
    }
  } finally {
    harness.restore();
  }
}

async function testThumbnailPreviewLoaderNormalizesRepeatedWorkpiecePrefixes() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown) => {
    const rawUrl = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : String(input);
    const url = new URL(rawUrl, "https://example.test");
    assert.equal(url.pathname, `/tongs/workpieces/${encodeURIComponent(WORKPIECE_A)}/read-file`);
    assert.equal(url.searchParams.get("path"), `assets/thumbnails/${WORKPIECE_A}/version-a.png`);
    return new Response(JSON.stringify({
      ok: true,
      data: {
        bytes_base64: "cHJldmlldy1pbWFnZQ==",
        content_type: "image/png",
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await loadThumbnailPreviewDataUrl({
      workpieceId: WORKPIECE_A,
      version: {
        id: "version-a",
        concept_id: "concept-a",
        created_at: "2026-03-10T16:20:00.000Z",
        provider: "openai",
        prompt: "poster art",
        asset_id: `path:workpieces/${WORKPIECE_A}/workpieces/${WORKPIECE_A}/assets/thumbnails/${WORKPIECE_A}/version-a.png`,
        status: "ready",
        asset_path: `workpieces/${WORKPIECE_A}/workpieces/${WORKPIECE_A}/assets/thumbnails/${WORKPIECE_A}/version-a.png`,
        mime_type: "image/png",
        provider_request_id: null,
        error: null,
      },
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.match(result.dataUrl, /^data:image\/png;base64,/);
      assert.equal(result.path, `assets/thumbnails/${WORKPIECE_A}/version-a.png`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function testGenerateImageMapEntriesFromScriptEmitsMultipleBeatsWithinParagraph() {
  const scriptText = [
    "## History",
    "",
    "The Union fielded 77,000 troops against roughly 50,000 Confederates. After Napoleon, veteran officers were redeployed across the Atlantic world. Control of the Mississippi and New Orleans became the strategic hinge of the campaign.",
  ].join("\n");

  const entries = generateImageMapEntriesFromScript(scriptText);
  assert.equal(entries.length, 3);
  assert.deepEqual(
    entries.map((entry) => entry.script_anchor?.sentence_start),
    [1, 2, 3],
  );
  assert.deepEqual(
    entries.map((entry) => entry.paragraph_beat_order),
    [1, 2, 3],
  );
  assert.equal(entries[0]?.anchor, entries[0]?.script_anchor?.span_text);
  assert.equal(entries[0]?.script_anchor?.paragraph_id, "s1:p1");
  assert.equal(entries[0]?.style_preset, DEFAULT_HEARTH_VISUAL_STYLE);
  assert.match(entries[2]?.prompt_basis ?? "", /mississippi/i);
}

function testGenerateImageMapEntriesFromTaggedScriptSkipsSpeakerAndNoteTags() {
  const scriptText = [
    "## Opening",
    "",
    "[s1]",
    "The army moved 40,000 troops to the river crossing.",
    "[/s1]",
    "",
    "[note]",
    "Show the archival map only in Anvil.",
    "[/note]",
    "",
    "[s2]",
    "New Orleans never received the reserve column before dawn.",
    "[/s2]",
  ].join("\n");

  const entries = generateImageMapEntriesFromScript(scriptText);
  assert.equal(entries.length, 2);
  assert.equal(entries[0]?.script_anchor?.span_text, "The army moved 40,000 troops to the river crossing.");
  assert.equal(entries[0]?.script_anchor?.speaker_block_id, "s1");
  assert.equal(entries[1]?.script_anchor?.span_text, "New Orleans never received the reserve column before dawn.");
  assert.equal(entries[1]?.script_anchor?.speaker_block_id, "s2");
  assert.ok(entries.every((entry) => !/\[\/?(?:s1|s2|note)\]/i.test(entry.script_anchor?.span_text ?? "")));
}

function testBuildImageMapAnchorPickerParagraphsSkipsStandaloneBlockTags() {
  const scriptText = [
    "[s1]",
    "The fleet arrived before sunrise.",
    "[/s1]",
    "[s2]",
    "Smoke drifted over the harbor.",
    "[/s2]",
  ].join("\n");

  const paragraphs = buildImageMapAnchorPickerParagraphs(scriptText);
  assert.equal(paragraphs.length, 2);
  assert.equal(paragraphs[0]?.text, "The fleet arrived before sunrise.");
  assert.equal(paragraphs[1]?.text, "Smoke drifted over the harbor.");
  assert.ok(paragraphs.every((paragraph) => !/\[\/?s[12]\]/i.test(paragraph.text)));
  assert.ok(
    paragraphs.every((paragraph) => paragraph.sentenceOptions.every((option) => !/^\[/.test(option.text))),
    "Picker options should only contain real sentence content",
  );
}

function testEnsureImageMapV2RoundTripsStructuredEntries() {
  const entry = buildImageMapEntryFixture("image-map-structured", {
    candidate_assets: [{
      asset_id: "asset-a",
      path: "assets/image-a.png",
      variant_label: "explainer",
      visual_mode: "map",
      mime_type: "image/png",
    }],
    selected_asset_id: "asset-a",
    status: "selected",
  });

  const pkg = ensureImageMapV2({
    ...createEmptyEpisodePackageV2(),
    schema: "forge.episode.package.v2",
    seo: { titles: [], tags: [], description_short: null, description_long: null },
    thumbnail: { concepts: [], versions: [], primary_version_id: null },
    image_map: { entries: [entry] },
  });

  assert.equal(pkg.image_map.entries.length, 1);
  assert.equal(pkg.image_map.entries[0]?.script_anchor?.paragraph_id, "s1:p1");
  assert.equal(pkg.image_map.entries[0]?.candidate_assets[0]?.asset_id, "asset-a");
  assert.equal(pkg.image_map.entries[0]?.candidate_assets[0]?.variant_label, "explainer");
  assert.equal(pkg.image_map.entries[0]?.candidate_assets[0]?.visual_mode, "map");
  assert.equal(pkg.image_map.entries[0]?.selected_asset_id, "asset-a");
  assert.equal(pkg.image_map.entries[0]?.status, "selected");
  assert.equal(pkg.image_map.entries[0]?.style_preset, DEFAULT_HEARTH_VISUAL_STYLE);
}

function testHydrateEpisodePackageV2KeepsLaunchVariantsBoundToCanonicalAssets() {
  const episodePackage = hydrateEpisodePackageV2({
    episode: {
      schema: "forge.episode.package.v2",
      seo: {
        titles: [
          { id: "seo-title-a", label: "A", text: "Primary launch title", is_primary: true },
          { id: "seo-title-b", label: "B", text: "Backup launch title", is_primary: false },
        ],
        tags: [],
        description_short: null,
        description_long: null,
      },
      thumbnail: {
        concepts: [{
          id: "concept-01",
          label: "Hero frame",
          prompt_text: "Storm over harbor",
          style_preset: "studio_photography",
        }],
        versions: [{
          id: "thumb-version-01",
          concept_id: "concept-01",
          created_at: "2026-03-14T01:00:00.000Z",
          provider: "upload",
          prompt: "Storm over harbor",
          asset_id: "asset-thumb-01",
          status: "ready",
          provider_request_id: null,
          asset_path: "assets/thumbnails/thumb-version-01.png",
          mime_type: "image/png",
          error: null,
        }],
        primary_version_id: "thumb-version-01",
      },
      launch_variants: [
        {
          id: "launch-variant-a",
          title_id: "seo-title-a",
          thumbnail_version_id: "thumb-version-01",
          created_at: "2026-03-14T01:05:00.000Z",
          updated_at: "2026-03-14T01:05:00.000Z",
        },
        {
          id: "launch-variant-bad",
          title_id: "seo-title-missing",
          thumbnail_version_id: "thumb-version-01",
          created_at: "2026-03-14T01:06:00.000Z",
          updated_at: "2026-03-14T01:06:00.000Z",
        },
      ],
      image_map: {
        entries: [],
      },
    },
  });

  assert.equal(episodePackage.launch_variants.length, 1);
  assert.equal(episodePackage.launch_variants[0]?.id, "launch-variant-a");
  assert.equal(episodePackage.launch_variants[0]?.title_id, "seo-title-a");
  assert.equal(episodePackage.launch_variants[0]?.thumbnail_version_id, "thumb-version-01");
  assert.equal(episodePackage.launch_variants[0]?.status, "draft");
  assert.equal(episodePackage.launch_variants[0]?.notes, null);
  assert.equal(episodePackage.launch_variants[0]?.last_tested_at, null);
  assert.equal(episodePackage.launch_variants[0]?.winner_selected_at, null);

  const mirrored = mirrorEpisodePackageV2ToLegacy({ episode: episodePackage });
  assert.equal(Array.isArray(mirrored.launch_variants), true);
  assert.equal((mirrored.launch_variants as unknown[]).length, 1);
}

function testHydrateEpisodePackageV2NormalizesLaunchVariantStatusMetadata() {
  const episodePackage = hydrateEpisodePackageV2({
    episode: {
      schema: "forge.episode.package.v2",
      seo: {
        titles: [
          { id: "seo-title-a", label: "A", text: "First launch title", is_primary: true },
          { id: "seo-title-b", label: "B", text: "Second launch title", is_primary: false },
        ],
        tags: [],
        description_short: null,
        description_long: null,
      },
      thumbnail: {
        concepts: [{
          id: "concept-01",
          label: "Storm over harbor",
          prompt_text: "Storm over harbor",
          style_preset: "studio_photography",
        }],
        versions: [
          {
            id: "thumb-version-01",
            concept_id: "concept-01",
            created_at: "2026-03-14T01:00:00.000Z",
            provider: "upload",
            prompt: "Storm over harbor",
            asset_id: "asset-thumb-01",
            status: "ready",
            provider_request_id: null,
            asset_path: "assets/thumbnails/thumb-version-01.png",
            mime_type: "image/png",
            error: null,
          },
          {
            id: "thumb-version-02",
            concept_id: "concept-01",
            created_at: "2026-03-14T01:10:00.000Z",
            provider: "upload",
            prompt: "Storm over harbor alternate",
            asset_id: "asset-thumb-02",
            status: "ready",
            provider_request_id: null,
            asset_path: "assets/thumbnails/thumb-version-02.png",
            mime_type: "image/png",
            error: null,
          },
        ],
        primary_version_id: "thumb-version-01",
      },
      launch_variants: [
        {
          id: "launch-variant-ready",
          title_id: "seo-title-a",
          thumbnail_version_id: "thumb-version-01",
          created_at: "2026-03-14T01:05:00.000Z",
          updated_at: "2026-03-14T01:05:00.000Z",
          status: "ready",
          notes: "Queue for release review",
          winner_selected_at: "2026-03-15T02:00:00.000Z",
        },
        {
          id: "launch-variant-winner",
          title_id: "seo-title-b",
          thumbnail_version_id: "thumb-version-02",
          created_at: "2026-03-14T01:15:00.000Z",
          updated_at: "2026-03-14T01:20:00.000Z",
          status: "winner",
          notes: "Strongest click package",
          last_tested_at: "2026-03-16T04:30:00.000Z",
          winner_selected_at: "2026-03-17T05:45:00.000Z",
        },
      ],
      image_map: {
        entries: [],
      },
    },
  });

  assert.equal(episodePackage.launch_variants.length, 2);
  assert.equal(episodePackage.launch_variants[0]?.status, "ready");
  assert.equal(episodePackage.launch_variants[0]?.notes, "Queue for release review");
  assert.equal(episodePackage.launch_variants[0]?.winner_selected_at, null);
  assert.equal(episodePackage.launch_variants[1]?.status, "winner");
  assert.equal(episodePackage.launch_variants[1]?.last_tested_at, "2026-03-16T04:30:00.000Z");
  assert.equal(episodePackage.launch_variants[1]?.winner_selected_at, "2026-03-17T05:45:00.000Z");
}

function testResolveImageMapScriptAnchorFromTextRecoversExactSentenceAnchor() {
  const scriptText = [
    "## Memory",
    "",
    "It landed right on the tip of your tongue, like your brain was half-convinced you were tasting something. Golden-hour drive on Orange Blossom Trail with a car window cracked and warm light streaming in.",
  ].join("\n");

  const anchor = resolveImageMapScriptAnchorFromText(
    scriptText,
    "It landed right on the tip of your tongue, like your brain was half-convinced you were tasting something.",
  );

  assert.ok(anchor, "Exact sentence text should resolve to a structured script anchor");
  assert.equal(anchor?.paragraph_id, "s1:p1");
  assert.equal(anchor?.sentence_start, 1);
  assert.equal(anchor?.sentence_end, 1);
  assert.match(anchor?.span_text ?? "", /tip of your tongue/i);
}

function testResolveImageMapScriptAnchorFromTextSupportsOccurrenceHintsAndSentenceRanges() {
  const scriptText = [
    "## Citrus",
    "",
    "Florida was booming. Groves gave way to subdivisions.",
    "",
    "Florida was booming.",
  ].join("\n");

  const combinedAnchor = resolveImageMapScriptAnchorFromText(
    scriptText,
    "Florida was booming. Groves gave way to subdivisions.",
  );
  assert.ok(combinedAnchor, "Multi-sentence exact quotes should resolve to a structured anchor");
  assert.equal(combinedAnchor?.paragraph_id, "s1:p1");
  assert.equal(combinedAnchor?.sentence_start, 1);
  assert.equal(combinedAnchor?.sentence_end, 2);

  const firstOccurrence = resolveImageMapScriptAnchorFromText(
    scriptText,
    "Florida was booming.",
    "first occurrence",
  );
  const secondOccurrence = resolveImageMapScriptAnchorFromText(
    scriptText,
    "Florida was booming.",
    "second occurrence",
  );

  assert.equal(firstOccurrence?.paragraph_id, "s1:p1");
  assert.equal(secondOccurrence?.paragraph_id, "s1:p2");
}

function testAssessImageMapScriptAnchorDetectsMissingAndStaleAnchors() {
  const scriptText = [
    "## Harbor",
    "",
    "A convoy crossed the river at dawn. The bridge burned behind them.",
  ].join("\n");
  const exactAnchor = buildExactScriptAnchorFromSelection(scriptText, {
    paragraphId: "s1:p1",
    sentenceStart: 1,
    sentenceEnd: 1,
  });

  assert.ok(exactAnchor, "Selection should resolve to an exact structured anchor");

  const missing = assessImageMapScriptAnchor(scriptText, null);
  assert.equal(missing.status, "orphaned");

  const anchored = assessImageMapScriptAnchor(scriptText, exactAnchor);
  assert.equal(anchored.status, "attached");
  assert.equal(anchored.exactAnchor?.paragraph_id, "s1:p1");

  const stale = assessImageMapScriptAnchor([
    "## Harbor",
    "",
    "A convoy slipped through the harbor at dusk. The bridge burned behind them.",
  ].join("\n"), exactAnchor);
  assert.equal(stale.status, "orphaned");
  assert.equal(stale.exactAnchor, null);
}

function testBuildExactScriptAnchorFromSelectionSpansSentenceRange() {
  const scriptText = [
    "## Campaign",
    "",
    "The fleet arrived before sunrise. Smoke drifted over the harbor. Citizens watched from the walls.",
  ].join("\n");

  const anchor = buildExactScriptAnchorFromSelection(scriptText, {
    paragraphId: "s1:p1",
    sentenceStart: 1,
    sentenceEnd: 2,
  });

  assert.ok(anchor, "Sentence-range selection should produce a structured anchor");
  assert.equal(anchor?.paragraph_id, "s1:p1");
  assert.equal(anchor?.sentence_start, 1);
  assert.equal(anchor?.sentence_end, 2);
  assert.match(anchor?.span_text ?? "", /smoke drifted/i);
}

function testReanchorImageMapEntryPreservesBeatMetadata() {
  const scriptText = [
    "## Campaign",
    "",
    "The fleet arrived before sunrise. Smoke drifted over the harbor. Citizens watched from the walls.",
  ].join("\n");
  const entry = buildImageMapEntryFixture("image-map-reanchor", {
    anchor: "manual:p1",
    script_anchor: {
      section_id: "s1",
      paragraph_id: "s1:p1",
      paragraph_order: 1,
      sentence_start: 1,
      sentence_end: 1,
      char_start: 0,
      char_end: 12,
      span_text: "wide skyline",
      speaker_block_id: null,
    },
    description: "Keep the harbor wide and tense.",
    visual_intent: "Keep the harbor wide and tense.",
    prompt_basis: "Keep the harbor wide and tense.",
    candidate_assets: [{
      asset_id: "asset-a",
      path: "assets/image-map/candidates/a.png",
      variant_label: "explainer",
      visual_mode: "map",
      mime_type: "image/png",
    }],
    selected_asset_id: "asset-a",
    status: "selected",
    placement_hint: "after-hook",
  });

  const repaired = reanchorImageMapEntry(entry, scriptText, {
    paragraphId: "s1:p1",
    sentenceStart: 2,
    sentenceEnd: 2,
  });

  assert.ok(repaired, "Re-anchor should rebuild the structured anchor");
  assert.equal(repaired?.description, entry.description);
  assert.equal(repaired?.prompt_basis, entry.prompt_basis);
  assert.equal(repaired?.selected_asset_id, "asset-a");
  assert.equal(repaired?.candidate_assets[0]?.asset_id, "asset-a");
  assert.equal(repaired?.status, "selected");
  assert.equal(repaired?.anchor, repaired?.script_anchor?.span_text);
  assert.match(repaired?.script_anchor?.span_text ?? "", /smoke drifted/i);
}

async function testImageMapRepoSavePersistsReanchoredAnchor() {
  resetLocalStorage();
  const harness = installImageMapFetchHarness();
  const scriptText = [
    "## Campaign",
    "",
    "The fleet arrived before sunrise. Smoke drifted over the harbor. Citizens watched from the walls.",
  ].join("\n");
  const entry = reanchorImageMapEntry(buildImageMapEntryFixture("image-map-01"), scriptText, {
    paragraphId: "s1:p1",
    sentenceStart: 2,
    sentenceEnd: 2,
  });

  assert.ok(entry, "Re-anchor should create a saveable entry");

  try {
    harness.setSavePayload({
      image_map: {
        workpiece_id: WORKPIECE_A,
        workspace_id: WORKSPACE_ID,
        entries: [entry],
        metadata_updated_at: "2026-03-11T09:15:00.000Z",
      },
      asset: null,
    });

    const result = await saveWorkpieceImageMap({
      workpieceId: WORKPIECE_A,
      workspaceId: WORKSPACE_ID,
      entries: [entry!],
      expectedMetadataUpdatedAt: "2026-03-11T09:10:00.000Z",
    });

    assert.equal(result.ok, true);
    assert.equal(harness.saveRequests.length, 1);
    assert.equal(
      (harness.saveRequests[0]?.body.entries?.[0] as { anchor?: string } | undefined)?.anchor,
      entry?.script_anchor?.span_text,
    );
    assert.equal(
      ((harness.saveRequests[0]?.body.entries?.[0] as { script_anchor?: { sentence_start?: number } } | undefined)?.script_anchor?.sentence_start),
      2,
    );
  } finally {
    harness.restore();
  }
}

function testApplyProductionArtifactImageBeatSheetResolvesStructuredAnchorsFromCanonicalScript() {
  const scriptText = [
    "## Citrus",
    "",
    "As Florida's population exploded, groves turned into subdivisions.",
  ].join("\n");

  const metadata = {
    schema: "forge.metadata.v1",
    workpiece_id: WORKPIECE_A,
    workspace_id: WORKSPACE_ID,
    created_at: "2026-03-14T01:00:00.000Z",
    updated_at: "2026-03-14T01:00:00.000Z",
    status: "draft",
    notes: null,
    origin: null,
    content_category: null,
    episode: createEmptyEpisodePackageV2(),
  };

  const nextMetadata = applyProductionArtifactToEpisodePackage({
    metadata,
    action: "image_beat_sheet",
    rawText: [
      "IMAGE_01",
      "Attach after: \"As Florida's population exploded, groves turned into subdivisions.\"",
      "Description: Time-lapse style composite of citrus rows fading into cul-de-sacs.",
      "Prompt: Time-lapse style composite of citrus rows fading into cul-de-sacs.",
      "Match: first occurrence",
    ].join("\n"),
    resolveImageMapScriptAnchor: (anchorText, matchHint) => (
      resolveImageMapScriptAnchorFromText(scriptText, anchorText, matchHint)
    ),
  });

  const episodePackage = hydrateEpisodePackageV2(nextMetadata);
  assert.equal(episodePackage.image_map.entries.length, 1);
  assert.equal(
    episodePackage.image_map.entries[0]?.anchor,
    "As Florida's population exploded, groves turned into subdivisions.",
  );
  assert.equal(episodePackage.image_map.entries[0]?.script_anchor?.paragraph_id, "s1:p1");
  assert.equal(episodePackage.image_map.entries[0]?.script_anchor?.sentence_start, 1);
  assert.equal(episodePackage.image_map.entries[0]?.status, "mapped");
}

function testVisualStyleCatalogNormalizesAliasesAndPromptHints() {
  assert.equal(normalizeHearthVisualStyle(null), DEFAULT_HEARTH_VISUAL_STYLE);
  assert.equal(normalizeHearthVisualStyle("oil on canvas"), "oil_painting");
  assert.equal(normalizeHearthVisualStyle("3D animation"), "three_d_animation");
  assert.equal(resolveHearthVisualStyleDefinition("marker").label, "Marker Render");
  assert.deepEqual(buildHearthVisualStylePromptLines("studio lighting"), [
    "Visual style: Studio Photography.",
    "Style direction: studio photography, controlled lighting, crisp subject separation, polished commercial finish.",
  ]);
}

function testHydrateEpisodePackageV2NormalizesLegacyVisualStyles() {
  const episodePackage = hydrateEpisodePackageV2({
    episode: {
      schema: "forge.episode.package.v2",
      seo: {
        titles: [],
        tags: [],
        description_short: null,
        description_long: null,
      },
      thumbnail: {
        concepts: [{
          id: "concept-legacy",
          label: "Legacy concept",
          prompt_text: "Heroic portrait",
          mood_style: "oil on canvas",
        }],
        versions: [],
        primary_version_id: null,
      },
      image_map: {
        entries: [{
          id: "image-map-legacy",
          anchor: "s1:p1#sent1",
          script_anchor: {
            section_id: "s1",
            paragraph_id: "s1:p1",
            paragraph_order: 1,
            sentence_start: 1,
            sentence_end: 1,
            char_start: 0,
            char_end: 12,
            span_text: "wide skyline",
            speaker_block_id: null,
          },
          description: "wide skyline",
          visual_intent: "wide skyline",
          prompt_basis: "wide skyline",
          intent: "cutaway",
          source_type: "stock",
          beat_order: 1,
          paragraph_beat_order: 1,
          candidate_assets: [],
          selected_asset_id: null,
          status: "mapped",
          placement_hint: null,
        }],
      },
    },
  });

  assert.equal(episodePackage.thumbnail.concepts[0]?.style_preset, "oil_painting");
  assert.equal(episodePackage.image_map.entries[0]?.anchor, "wide skyline");
  assert.equal(episodePackage.image_map.entries[0]?.style_preset, DEFAULT_HEARTH_VISUAL_STYLE);
}

function testThumbnailTitleStyleDefaultsNormalizeDeterministically() {
  assert.deepEqual(
    normalizeEpisodeThumbnailTitleStyle(null),
    DEFAULT_TITLE_STYLE,
    "Missing title style metadata should hydrate to deterministic defaults",
  );

  const episodePackage = hydrateEpisodePackageV2({
    episode: {
      schema: "forge.episode.package.v2",
      seo: {
        titles: [],
        tags: [],
        description_short: null,
        description_long: null,
      },
      thumbnail: {
        concepts: [{
          id: "concept-default-style",
          label: "Default style",
          prompt_text: "High-contrast portrait",
          style_preset: "studio_photography",
        }],
        versions: [],
        primary_version_id: null,
      },
      image_map: {
        entries: [],
      },
    },
  });

  assert.deepEqual(
    episodePackage.thumbnail.concepts[0]?.title_style,
    DEFAULT_TITLE_STYLE,
    "Hydration should apply title styling defaults to legacy thumbnail concepts",
  );
}

function testThumbnailTitleStylePartialMetadataDefaultsMissingFields() {
  const episodePackage = hydrateEpisodePackageV2({
    episode: {
      schema: "forge.episode.package.v2",
      seo: {
        titles: [],
        tags: [],
        description_short: null,
        description_long: null,
      },
      thumbnail: {
        concepts: [{
          id: "concept-partial-style",
          label: "Partial style",
          prompt_text: "Golden-hour highway",
          title_style: {
            text_color: "#ff00aa",
            shadow: {
              enabled: false,
            },
          },
        }],
        versions: [],
        primary_version_id: null,
      },
      image_map: {
        entries: [],
      },
    },
  });

  assert.deepEqual(episodePackage.thumbnail.concepts[0]?.title_style, {
    font_preset: "bold_sans",
    text_color: "#FF00AA",
    shadow: {
      enabled: false,
      strength: "medium",
    },
  });
}

function testThumbnailTitleStylePersistenceRoundTripsThroughEpisodePackage() {
  const episodePackage = ensureLaunchVariantsV2({
    ...createEmptyEpisodePackageV2(),
    schema: "forge.episode.package.v2",
    seo: {
      titles: [],
      tags: [],
      description_short: null,
      description_long: null,
    },
    thumbnail: {
      concepts: [{
        id: "concept-persist-style",
        label: "Persistent style",
        prompt_text: "Storm over harbor",
        style_preset: "studio_photography",
        title_style: {
          font_preset: "modern_clean",
          text_color: "#12ab34",
          shadow: {
            enabled: true,
            strength: "strong",
          },
        },
      }],
      versions: [],
      primary_version_id: null,
    },
    launch_variants: [],
    image_map: {
      entries: [],
    },
  });

  const mirrored = mirrorEpisodePackageV2ToLegacy({ episode: episodePackage });
  assert.deepEqual(
    ((mirrored.thumbnail_concepts as Array<{ title_style?: unknown }> | undefined)?.[0]?.title_style),
    {
      font_preset: "modern_clean",
      text_color: "#12AB34",
      shadow: {
        enabled: true,
        strength: "strong",
      },
    },
    "Mirroring should keep persisted thumbnail title styling metadata on the episode package",
  );

  const rehydrated = hydrateEpisodePackageV2(mirrored);
  assert.deepEqual(
    rehydrated.thumbnail.concepts[0]?.title_style,
    {
      font_preset: "modern_clean",
      text_color: "#12AB34",
      shadow: {
        enabled: true,
        strength: "strong",
      },
    },
    "Reloading the episode package should restore persisted thumbnail title styling",
  );
}

function testThumbnailTitleShadowCssVariants() {
  assert.equal(getShadowCss({ enabled: false, strength: "strong" }), "none");
  assert.equal(getShadowCss({ enabled: true, strength: "soft" }), "0 1px 2px rgba(0,0,0,0.6)");
  assert.equal(
    getShadowCss({ enabled: true, strength: "medium" }),
    "0 2px 8px rgba(0,0,0,0.55), 0 8px 18px rgba(0,0,0,0.38)",
  );
  assert.equal(getShadowCss({ enabled: true, strength: "strong" }), "0 4px 10px rgba(0,0,0,0.9)");
}

function createThumbnailBrandTemplateFixture(
  overrides?: Partial<ThumbnailBrandTemplate>,
): ThumbnailBrandTemplate {
  return {
    id: "8f7ac12b-4386-4ef5-978d-d6152341f5a3",
    workspaceId: WORKSPACE_ID,
    slug: "bold-commentary",
    name: "Bold Commentary",
    templateJson: {
      title_style: {
        font_preset: "modern_clean",
        text_color: "#FF6600",
        shadow: {
          enabled: true,
          strength: "strong",
        },
      },
      layout: {
        title_position: "top",
        alignment: "center",
        max_lines: 2,
      },
      background_treatment: {
        darken: 0.35,
        blur: 3,
      },
      accent: {
        border_color: "#FF2200",
        border_width: 4,
        corner_radius: 16,
      },
      logo: {
        workpiece_id: null,
        asset_path: null,
        mime_type: null,
        placement: "top_right",
        width_percent: 20,
        opacity: 1,
      },
    },
    isDefault: true,
    archivedAt: null,
    createdAt: "2026-03-14T12:00:00.000Z",
    updatedAt: "2026-03-14T12:00:00.000Z",
    updatedBy: "8ddf173f-4651-47cc-aa05-ef4ea0f5c44b",
    ...overrides,
  };
}

function testThumbnailBrandTemplateIdRoundTripsThroughEpisodePackage() {
  const templateId = "c1a5c4eb-2480-46bb-b5a4-2b555707f381";
  const episodePackage = hydrateEpisodePackageV2({
    episode: {
      schema: "forge.episode.package.v2",
      seo: {
        titles: [],
        tags: [],
        description_short: null,
        description_long: null,
      },
      thumbnail: {
        concepts: [{
          id: "concept-brand-template",
          label: "Brand template",
          prompt_text: "Serious commentary portrait",
          style_preset: "studio_photography",
          brand_template_id: templateId,
        }],
        versions: [],
        primary_version_id: null,
      },
      image_map: {
        entries: [],
      },
    },
  });

  assert.equal(
    episodePackage.thumbnail.concepts[0]?.brand_template_id,
    templateId,
    "Hydration should keep thumbnail concept brand template bindings",
  );

  const mirrored = mirrorEpisodePackageV2ToLegacy({ episode: episodePackage });
  assert.equal(
    ((mirrored.thumbnail_concepts as Array<{ brand_template_id?: unknown }> | undefined)?.[0]?.brand_template_id),
    templateId,
    "Mirroring should preserve thumbnail concept brand template ids",
  );
}

function testResolveThumbnailBrandRenderUsesTemplateForDefaultConceptStyle() {
  const template = createThumbnailBrandTemplateFixture();
  const resolved = resolveThumbnailBrandRender({
    template,
    conceptTitleStyle: DEFAULT_TITLE_STYLE,
  });

  assert.deepEqual(
    resolved.title_style,
    template.templateJson.title_style,
    "Template title styling should drive rendering when the concept has no explicit override",
  );
  assert.deepEqual(resolved.layout, template.templateJson.layout);
  assert.deepEqual(resolved.background_treatment, template.templateJson.background_treatment);
  assert.deepEqual(resolved.accent, template.templateJson.accent);
  assert.equal(resolved.text_shadow_css, "0 4px 10px rgba(0,0,0,0.9)");
}

function testResolveThumbnailBrandRenderKeepsExplicitConceptTitleStyleOverride() {
  const template = createThumbnailBrandTemplateFixture();
  const resolved = resolveThumbnailBrandRender({
    template,
    conceptTitleStyle: {
      font_preset: "condensed_sans",
      text_color: "#00AAFF",
      shadow: {
        enabled: false,
        strength: "soft",
      },
    },
  });

  assert.deepEqual(
    resolved.title_style,
    {
      font_preset: "condensed_sans",
      text_color: "#00AAFF",
      shadow: {
        enabled: false,
        strength: "soft",
      },
    },
    "Explicit concept title styling should override the workspace template styling",
  );
  assert.deepEqual(
    resolved.layout,
    template.templateJson.layout,
    "Template layout should still apply when only title styling is overridden",
  );
  assert.equal(resolved.text_shadow_css, "none");
}

async function testBarStockSparkListDiscoveryStaysCanonicalAcrossClients() {
  resetLocalStorage();
  const localSpark = {
    id: "7fce5928-fcab-4f41-9894-09a7254f78e1",
    body: "Local overlay spark",
    createdAt: Date.parse("2026-03-10T09:00:00.000Z"),
    updatedAt: Date.parse("2026-03-10T11:30:00.000Z"),
    status: "forged",
    links: {
      hearthWorkpieceId: WORKPIECE_A,
      hearthDraftId: "draft-local",
    },
  };
  globalThis.localStorage.setItem("barstock_sparks_v2:2b2ef7aa-44d4-4d0d-93d7-b0aa4ec2b99d", JSON.stringify([localSpark]));

  const harness = installSparkFetchHarness();
  harness.setSparksPayload([
    {
      id: "47d34493-ce9f-4cce-9406-5ba4720d4745",
      workspace_id: WORKSPACE_ID,
      assignment_id: null,
      title: "Remote Canonical Spark",
      body: "Remote canonical body",
      tags: ["news"],
      status: "raw",
      created_at: "2026-03-10T09:00:00.000Z",
      updated_at: "2026-03-10T11:00:00.000Z",
      linked_workpiece_id: null,
    },
    {
      id: "919a34cf-8481-429c-b9bf-2b319ed72b19",
      workspace_id: WORKSPACE_ID,
      assignment_id: "3d829722-f4e1-4f35-9d16-5e10cfcf1bd8",
      title: "Project-linked Spark",
      body: "Remote project body",
      tags: [],
      status: "forged",
      created_at: "2026-03-10T08:30:00.000Z",
      updated_at: "2026-03-10T10:30:00.000Z",
      linked_workpiece_id: WORKPIECE_B,
    },
  ]);

  try {
    const firstClient = await listHearthBarStockSparks(WORKSPACE_ID);
    resetLocalStorage();
    const secondClient = await listHearthBarStockSparks(WORKSPACE_ID);

    assert.deepEqual(harness.listRequests, [WORKSPACE_ID, WORKSPACE_ID]);
    assert.equal(firstClient.length, 2);
    assert.equal(firstClient[0]?.title, "Remote Canonical Spark");
    assert.equal(resolveBarStockSparkHearthWorkpieceId(firstClient[1]), WORKPIECE_B);
    assert.equal(
      firstClient.some((spark) => spark.id === localSpark.id),
      false,
      "Local mirror residue must not determine canonical spark discovery",
    );
    assert.deepEqual(
      secondClient,
      firstClient,
      "A second client should observe the same canonical entry truth without mirror state",
    );
  } finally {
    harness.restore();
  }
}

async function testSparkIntakeWaitsForCanonicalDiscoveryBeforeDeclaringMissing() {
  const sparkId = "7fce5928-fcab-4f41-9894-09a7254f78e1";

  assert.equal(
    resolveCanonicalSparkIntakeError({
      routeSparkId: sparkId,
      workspaceId: WORKSPACE_ID,
      discoveryWorkspaceId: null,
      spark: null,
    }),
    null,
    "Deep-link intake should wait for canonical spark discovery before declaring a spark missing",
  );
  assert.equal(
    isCanonicalSparkDiscoveryResolved(WORKSPACE_ID, null),
    false,
    "Discovery should be unresolved until the current workspace has completed canonical spark loading",
  );
  assert.equal(
    resolveCanonicalSparkIntakeError({
      routeSparkId: sparkId,
      workspaceId: null,
      discoveryWorkspaceId: null,
      spark: null,
    }),
    "Spark intake requires workspace_id.",
  );
  assert.equal(
    resolveCanonicalSparkIntakeError({
      routeSparkId: sparkId,
      workspaceId: WORKSPACE_ID,
      discoveryWorkspaceId: WORKSPACE_ID,
      spark: null,
    }),
    "Spark not found in Bar Stock. Sync and retry.",
  );
}

async function testWorkpieceListRoundtripAndPrimaryScriptRead() {
  resetLocalStorage();
  const harness = installWorkpieceFetchHarness();
  harness.setEpisodesPayload([
    {
      id: WORKPIECE_B,
      workspace_id: WORKSPACE_ID,
      label: null,
      created_at: "2026-03-09T12:00:00.000Z",
      updated_at: "2026-03-10T13:00:00.000Z",
    },
    {
      id: WORKPIECE_A,
      workspace_id: WORKSPACE_ID,
      label: "Canonical Alpha",
      created_at: "2026-03-08T12:00:00.000Z",
      updated_at: "2026-03-10T12:00:00.000Z",
    },
  ]);
  harness.setPrimaryScript(WORKPIECE_A, "## Canonical Script", "2026-03-10T12:05:00.000Z");

  try {
    const workpieces = await listHearthWorkpieces(WORKSPACE_ID);
    assert.deepEqual(harness.listRequests[0], { workspaceId: WORKSPACE_ID, includeArchived: null });
    assert.deepEqual(
      workpieces.map((entry) => entry.workpieceId),
      [WORKPIECE_B, WORKPIECE_A],
      "Canonical workspace episodes should sort by freshness",
    );
    assert.equal(workpieces[0]?.title, `Episode ${WORKPIECE_B.slice(0, 8)}`, "Fallback title should come from workpiece id");
    assert.equal(workpieces[1]?.title, "Canonical Alpha");

    const script = await readHearthPrimaryScript(WORKPIECE_A);
    assert.equal(script.ok, true);
    if (script.ok) {
      assert.equal(script.data.text, "## Canonical Script");
      assert.equal(script.data.updatedAt, "2026-03-10T12:05:00.000Z");
    }

    const missing = await readHearthPrimaryScript(WORKPIECE_B);
    assert.equal(missing.ok, true);
    if (missing.ok) {
      assert.equal(missing.data.text, null, "Missing primary script should stay a non-fatal empty read");
    }
    assert.deepEqual(harness.scriptReads, [WORKPIECE_A, WORKPIECE_B]);
  } finally {
    harness.restore();
  }
}

async function testWorkpieceArchiveRoundtripUsesCanonicalEndpoints() {
  resetLocalStorage();
  const harness = installWorkpieceFetchHarness();
  harness.setEpisodesPayload([
    {
      id: WORKPIECE_A,
      workspace_id: WORKSPACE_ID,
      label: "Archive Candidate",
      created_at: "2026-03-08T12:00:00.000Z",
      updated_at: "2026-03-10T12:00:00.000Z",
      archived_at: null,
      archived_by: null,
      archive_reason: null,
    },
    {
      id: WORKPIECE_B,
      workspace_id: WORKSPACE_ID,
      label: "Already Archived",
      created_at: "2026-03-09T12:00:00.000Z",
      updated_at: "2026-03-10T13:00:00.000Z",
      archived_at: "2026-03-10T14:00:00.000Z",
      archived_by: ARCHIVE_ACTOR_ID,
      archive_reason: "duplicate",
    },
  ]);

  try {
    const listed = await listHearthWorkpieces(WORKSPACE_ID, { includeArchived: true });
    assert.deepEqual(harness.listRequests[0], { workspaceId: WORKSPACE_ID, includeArchived: "1" });
    assert.equal(listed.find((entry) => entry.workpieceId === WORKPIECE_B)?.isArchived, true);

    const archived = await archiveHearthWorkpiece({
      workspaceId: WORKSPACE_ID,
      workpieceId: WORKPIECE_A,
      reason: "duplicate",
    });
    assert.equal(archived.isArchived, true);
    assert.equal(archived.archiveReason, "duplicate");
    assert.deepEqual(harness.archiveRequests[0], {
      workpieceId: WORKPIECE_A,
      body: {
        workspace_id: WORKSPACE_ID,
        reason: "duplicate",
      },
    });

    const restored = await restoreHearthWorkpiece({
      workspaceId: WORKSPACE_ID,
      workpieceId: WORKPIECE_A,
    });
    assert.equal(restored.isArchived, false);
    assert.equal(restored.archiveReason, null);
    assert.deepEqual(harness.restoreRequests[0], {
      workpieceId: WORKPIECE_A,
      body: {
        workspace_id: WORKSPACE_ID,
      },
    });
  } finally {
    harness.restore();
  }
}

async function testWorkpieceListDedupesCanonicalIdsBeforeRailConsumption() {
  resetLocalStorage();
  const harness = installWorkpieceFetchHarness();
  harness.setEpisodesPayload([
    {
      id: WORKPIECE_A,
      workspace_id: WORKSPACE_ID,
      label: "Alpha Episode (stale)",
      created_at: "2026-03-08T12:00:00.000Z",
      updated_at: "2026-03-09T12:00:00.000Z",
    },
    {
      id: WORKPIECE_A,
      workspace_id: WORKSPACE_ID,
      label: "Alpha Episode",
      created_at: "2026-03-08T12:00:00.000Z",
      updated_at: "2026-03-10T12:00:00.000Z",
    },
    {
      id: WORKPIECE_B,
      workspace_id: WORKSPACE_ID,
      label: "Beta Episode",
      created_at: "2026-03-09T12:00:00.000Z",
      updated_at: "2026-03-10T11:00:00.000Z",
    },
  ]);

  try {
    const workpieces = await listHearthWorkpieces(WORKSPACE_ID);
    assert.deepEqual(
      workpieces.map((entry) => entry.workpieceId),
      [WORKPIECE_A, WORKPIECE_B],
      "Duplicate canonical ids should collapse before Hearth builds rail rows",
    );
    assert.equal(
      workpieces.filter((entry) => entry.workpieceId === WORKPIECE_A).length,
      1,
      "A canonical workpiece id should appear at most once after ingest normalization",
    );
    assert.equal(
      workpieces.find((entry) => entry.workpieceId === WORKPIECE_A)?.title,
      "Alpha Episode",
      "The freshest canonical summary should win when duplicate workpiece rows arrive from Tongs",
    );
  } finally {
    harness.restore();
  }
}

async function testWorkpieceDraftHydrationReadsCanonicalSnapshotWithoutCachedMapping() {
  const storage = resetLocalStorage();
  storage.setItem("forge_workspace_id_v1", WORKSPACE_ID);
  const harness = installWorkpieceFetchHarness();
  const canonicalDraft = createDraft("canonical-buffer-a", {
    title: "Canonical Buffer",
    body: "Hydrated from canonical draft snapshot",
    updatedAt: Date.parse("2026-03-10T15:00:00.000Z"),
  });
  harness.setDraftSnapshot(WORKPIECE_A, {
    drafts: [canonicalDraft],
    updatedAt: "2026-03-10T15:00:00.000Z",
  }, "2026-03-10T15:01:00.000Z");

  try {
    const store = new TongsHearthStore();
    const beforeHydration = await store.listDrafts();
    assert.deepEqual(
      beforeHydration,
      [],
      "Workspace draft discovery should stay empty until explicit canonical workpiece hydration occurs",
    );

    const workpieceDrafts = await store.listWorkpieceDrafts(WORKPIECE_A);
    assert.equal(workpieceDrafts.length, 1, "Explicit workpiece hydration should read the canonical draft snapshot");
    assert.equal(workpieceDrafts[0]?.id, canonicalDraft.id);
    assert.equal(workpieceDrafts[0]?.title, canonicalDraft.title);
    assert.deepEqual(
      harness.draftReads,
      [WORKPIECE_A],
      "Canonical workpiece hydration must read the workpiece-scoped draft snapshot directly",
    );

    const afterHydration = await store.listDrafts();
    assert.equal(afterHydration.length, 1, "Explicit canonical hydration should seed the workspace draft cache");
    assert.equal(afterHydration[0]?.id, canonicalDraft.id);
  } finally {
    harness.restore();
  }
}

function testDraftHydrationPrefersUsableCanonicalBodyOverNewerEmptyBuffer() {
  const localEmptyDraft = createDraft(WORKPIECE_A, {
    title: "Episode Title",
    body: "",
    updatedAt: Date.parse("2026-03-12T12:00:00.000Z"),
  });
  const canonicalDraft = createDraft(WORKPIECE_A, {
    title: "Episode Title",
    body: "[s1]\nApproved script body\n[/s1]",
    updatedAt: Date.parse("2026-03-11T12:00:00.000Z"),
  });

  const preferred = choosePreferredHydratedDraft([localEmptyDraft, canonicalDraft]);

  assert.equal(draftHasUsableScriptBody(localEmptyDraft), false);
  assert.equal(draftHasUsableScriptBody(canonicalDraft), true);
  assert.equal(preferred?.body, canonicalDraft.body);
}

function testHydrateDraftBodyFromCanonicalScriptRepairsBlankWorkpieceBuffer() {
  const blankDraft = createDraft(WORKPIECE_A, {
    title: "Episode Title",
    body: "",
    updatedAt: Date.parse("2026-03-10T12:00:00.000Z"),
  });

  const repaired = hydrateDraftBodyFromCanonicalScript({
    draft: blankDraft,
    scriptText: "[s1]\nRecovered approved script\n[/s1]",
    updatedAt: Date.parse("2026-03-10T15:00:00.000Z"),
    updatedBy: { userId: "user-1", displayName: "Forge User" },
  });

  assert.equal(repaired.body, "[s1]\nRecovered approved script\n[/s1]");
  assert.equal(repaired.updatedAt, Date.parse("2026-03-10T15:00:00.000Z"));
  assert.equal(repaired.updatedBy?.displayName, "Forge User");
}

function testChooseCanonicalImageMapScriptSourcePrefersNewerSavedDraftOverStalePrimaryShell() {
  const savedDraft = createDraft(WORKPIECE_A, {
    body: "[s1]\nRecovered approved script body with actual anchorable text.\n[/s1]",
    updatedAt: Date.parse("2026-03-12T15:00:00.000Z"),
  });

  const selected = chooseCanonicalImageMapScriptSource({
    primaryText: "# Episode Title",
    primaryUpdatedAtMs: Date.parse("2026-03-11T09:00:00.000Z"),
    drafts: [savedDraft],
    preferredDraftId: WORKPIECE_A,
  });

  assert.equal(selected?.source, "saved_draft");
  assert.equal(selected?.text, savedDraft.body);
}

function testChooseCanonicalImageMapScriptSourceKeepsPublishedScriptWhenItMatchesCurrentTruth() {
  const primaryText = "[s1]\nCurrent approved script body.\n[/s1]";
  const savedDraft = createDraft(WORKPIECE_A, {
    body: primaryText,
    updatedAt: Date.parse("2026-03-10T15:00:00.000Z"),
  });

  const selected = chooseCanonicalImageMapScriptSource({
    primaryText,
    primaryUpdatedAtMs: Date.parse("2026-03-12T15:00:00.000Z"),
    drafts: [savedDraft],
    preferredDraftId: WORKPIECE_A,
  });

  assert.equal(selected?.source, "primary_script");
  assert.equal(selected?.text, primaryText);
}

async function testWorkpieceNavModelStaysWorkpieceFirst() {
  const workpieces = [
    createWorkpieceSummary(WORKPIECE_A, { title: "Alpha Episode" }),
    createWorkpieceSummary(WORKPIECE_B, { title: "Beta Episode", updatedAtMs: Date.parse("2026-03-10T13:00:00.000Z") }),
  ];
  const orphanDraft = createDraft("draft-orphan", { title: "Orphan Draft" });
  const legacyBoundDraft = createDraft("legacy-draft-b", { title: "Legacy Buffer B" });
  const sparks = [{
    id: "spark-b",
    body: "Bound to B",
    createdAt: 1,
    updatedAt: 1,
    links: {
      hearthDraftId: legacyBoundDraft.id,
      hearthWorkpieceId: WORKPIECE_B,
    },
  }];

  const items = selectWorkpieceNavItems({
    workpieces,
    drafts: [orphanDraft, legacyBoundDraft],
    sparks,
    searchText: "",
    sortKey: "updated",
  });

  assert.deepEqual(
    items.map((item) => item.workpieceId),
    [WORKPIECE_B, WORKPIECE_A],
    "Rail items should come from canonical workpieces, not orphan drafts",
  );
  assert.equal(items.length, 2, "Unbound drafts must not mint rail rows");
  assert.equal(items[0]?.id, WORKPIECE_B);
  assert.equal(items[0]?.draftId, legacyBoundDraft.id, "Compatibility bindings may attach a draft buffer to a workpiece");
  assert.equal(items[1]?.draftId, null, "Zero-draft workpieces still appear in the rail");
  assert.equal(items[0]?.title, "Beta Episode", "Rail title must come from workpiece summary, not draft title");
}

async function testActiveWorkpieceContextResolvesAttachedArtifactsWithoutCreatingNavRows() {
  const draft = createDraft("legacy-draft-a", { title: "Legacy Buffer A" });
  const revisions = [
    createRevision("rev-a", draft.id, 1000),
    createRevision("rev-b", "other-draft", 1001),
  ];
  const readyScripts = [{
    id: `ready:${WORKPIECE_A}:script/script.md`,
    workspaceId: WORKSPACE_ID,
    workpieceId: WORKPIECE_A,
    path: "script/script.md",
    primaryScriptPath: "script/script.md",
    scriptPaths: ["script/script.md"],
    title: "Ready Alpha",
    updatedAt: "2026-03-10T12:00:00.000Z",
    contentCategory: null,
    markedReadyBy: null,
    markedReadyAt: null,
    queueRank: 0,
    hiddenAt: null,
    hiddenBy: null,
  }];
  const sparks = [{
    id: "spark-a",
    body: "Spark A",
    createdAt: 1,
    updatedAt: 1,
    links: {
      hearthDraftId: draft.id,
      hearthWorkpieceId: WORKPIECE_A,
    },
  }];

  const context = selectActiveWorkpieceContext({
    activeWorkpieceId: WORKPIECE_A,
    workpieces: [createWorkpieceSummary(WORKPIECE_A, { title: "Alpha Episode" })],
    drafts: [draft],
    readyScripts,
    sparks,
    revisions,
    preferredDraftId: draft.id,
  });

  assert.equal(context.workpiece?.workpieceId, WORKPIECE_A);
  assert.equal(context.draft?.id, draft.id, "Active context should resolve the attached draft buffer through workpiece binding");
  assert.equal(context.readyEntry?.workpieceId, WORKPIECE_A);
  assert.deepEqual(context.linkedSparks.map((spark) => spark.id), ["spark-a"]);
  assert.deepEqual(context.revisions.map((revision) => revision.id), ["rev-a"], "Only attached draft revisions should hydrate into context");
}

async function testForgedSparkRouteResolutionPrefersBoundWorkpiece() {
  const spark = {
    id: "spark-route-a",
    body: "Open the bound workpiece",
    createdAt: 1,
    updatedAt: 1,
    status: "forged",
    links: {
      hearthDraftId: "legacy-draft-a",
      hearthWorkpieceId: WORKPIECE_A,
    },
  };

  assert.equal(
    resolveBarStockSparkHearthWorkpieceId(spark),
    WORKPIECE_A,
    "Already-forged spark intake should resolve directly to the bound workpiece",
  );
}

async function testSessionRoundtrip() {
  const storage = resetLocalStorage();
  storage.setItem("forge_workspace_id_v1", "2980fc39-8c8b-489a-a900-8d3bd3248432");
  const sessionStore = new LocalSessionStore();
  await sessionStore.saveSession({
    id: "default",
    createdAt: 1,
    updatedAt: 2,
    activeDraftId: "draft-1",
    activeWorkpieceId: WORKPIECE_A,
    lastOpenedAt: 3,
    uiState: {
      cursorPosition: 120,
      scrollTop: 456,
      splitPane: true,
      selectedTab: "compare",
    },
  });

  const restored = await sessionStore.getSession();
  assert.ok(restored, "Session should restore");
  assert.equal(restored?.activeWorkpieceId, WORKPIECE_A, "Session should preserve the active workpiece hint");
  assert.equal(restored?.uiState?.cursorPosition, 120, "Cursor position should roundtrip");
  assert.equal(restored?.uiState?.scrollTop, 456, "Scroll position should roundtrip");
}

function createEpisodeContextFixture() {
  return buildEpisodeContext({
    episodeId: "episode-123",
    workspaceId: "2980fc39-8c8b-489a-a900-8d3bd3248432",
    draft: {
      id: "draft-episode",
      title: "Episode Title",
      body: "Intro line [src_alpha] and closing [src_alpha]",
    },
    planningSession: {
      title: "Planning Title",
      title_variants: {
        A: "Title A",
        B: "Title B",
        C: "Title C",
      },
      outline: ["Hook", "Main", "CTA"],
      tone_preset: "newsroom_neutral",
    },
    workpieceSources: [
      { source_id: "src_alpha", notes: "Primary source" },
    ],
    sourceIndexById: new Map([
      ["src_alpha", { source_id: "src_alpha", title: "Alpha Source", url: "https://example.com/alpha" }],
    ]),
    sparks: [
      { id: "spark-1", body: "Spark body" },
    ],
  });
}

async function testBuildEpisodeContextIncludesFields() {
  const context = createEpisodeContextFixture();
  assert.equal(context.episodeId, "episode-123");
  assert.equal(context.workspaceId, "2980fc39-8c8b-489a-a900-8d3bd3248432");
  assert.equal(context.title, "Episode Title");
  assert.equal(context.titleVariants.A, "Title A");
  assert.equal(context.outline, "Hook\nMain\nCTA");
  assert.equal(context.tonePreset, "newsroom_neutral");
  assert.equal(context.body, "Intro line [src_alpha] and closing [src_alpha]");
  assert.equal(context.sources.length, 1);
  assert.equal(context.sources[0]?.id, "src_alpha");
  assert.equal(context.sources[0]?.title, "Alpha Source");
  assert.equal(context.sources[0]?.note, "Primary source");
  assert.deepEqual(context.sources[0]?.citedIn, ["[src_alpha]"]);
}

async function testApplyHearthOpsRequestsSave() {
  const writes: string[] = [];
  let requestedSave = 0;

  await applyHearthOps({
    setTitle: (value) => { writes.push(`title:${value}`); },
    setTitleVariant: (slot, value) => { writes.push(`variant:${slot}:${value}`); },
    setOutline: (value) => { writes.push(`outline:${value}`); },
    setBody: (value) => { writes.push(`body:${value}`); },
    addSource: (source) => { writes.push(`add:${source.title ?? ""}`); },
    updateSource: (id, patch) => { writes.push(`update:${id}:${patch.note ?? ""}`); },
    removeSource: (id) => { writes.push(`remove:${id}`); },
    requestSave: (reason) => {
      assert.equal(reason, "ai_apply_ops");
      requestedSave += 1;
    },
  }, [
    { op: "set_title", value: "New Title" },
    { op: "set_title_variant", slot: "A", value: "A/B title" },
    { op: "set_outline", value: "Outline" },
    { op: "set_body", value: "Body" },
    { op: "add_source", source: { title: "Added Source", note: "note" } },
    { op: "update_source", id: "src_alpha", patch: { note: "updated" } },
    { op: "remove_source", id: "src_alpha" },
  ]);

  assert.ok(writes.includes("title:New Title"));
  assert.ok(writes.includes("variant:A:A/B title"));
  assert.ok(writes.includes("outline:Outline"));
  assert.ok(writes.includes("body:Body"));
  assert.ok(writes.includes("add:Added Source"));
  assert.ok(writes.includes("update:src_alpha:updated"));
  assert.ok(writes.includes("remove:src_alpha"));
  assert.equal(requestedSave, 1, "apply ops should request save once");
}

async function testAiRequestPayloadIncludesEpisodeId() {
  resetLocalStorage();
  primeHearthAiRequestTestSession();
  const originalFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input: unknown, init?: { body?: unknown }) => {
    const url = String(input);
    if (url.includes("/rest/v1/workspaces?id=eq.")) {
      return new Response(JSON.stringify([{ org_id: HEARTH_TEST_ORG_ID }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/rest/v1/rpc/resolve_ai_policy")) {
      return new Response(JSON.stringify([{ decision_type: "ALLOW", reason_code: null }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    capturedBody = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
    return new Response(JSON.stringify({
      assistant_text: "All set.",
      ops: [],
      script_text: "[s1]\nHello\n[/s1]",
      tag_audit: { speaker_blocks_closed: true },
      billing_mode: "forge",
      token_balance: 99,
      total_tokens: 11,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await requestHearthChatReply(
      [{ role: "user", content: "Refine this." }],
      createEpisodeContextFixture(),
    );
    assert.ok(result.ok, "AI request should succeed in mocked fetch");
    if (result.ok) {
      const scriptText = result.scriptText ?? "";
      assert.match(scriptText, /^\[s1\]\nHello\n(?:\n)?\[\/s1\]\n?$/);
      assert.deepEqual(result.ops, [{ op: "set_body", value: scriptText }]);
      assert.equal((result.tagAudit as { speaker_blocks_closed?: boolean } | undefined)?.speaker_blocks_closed, true);
    }
    const submittedBody = capturedBody as unknown as Record<string, unknown>;
    assert.equal((submittedBody.episode_context as { episodeId?: string } | undefined)?.episodeId, "episode-123");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testAiRequestTreatsScriptTextOnlyAsDeliverable() {
  resetLocalStorage();
  primeHearthAiRequestTestSession();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    if (url.includes("/rest/v1/workspaces?id=eq.")) {
      return new Response(JSON.stringify([{ org_id: HEARTH_TEST_ORG_ID }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/rest/v1/rpc/resolve_ai_policy")) {
      return new Response(JSON.stringify([{ decision_type: "ALLOW", reason_code: null }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({
    assistant_text: "",
    ops: [],
    script_text: "[s1]\nCold open\n[/s1]",
    billing_mode: "forge",
    token_balance: 77,
    total_tokens: 9,
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  }) as typeof fetch;

  try {
    const result = await requestHearthChatReply(
      [{ role: "user", content: "Write the script." }],
      createEpisodeContextFixture(),
    );
    assert.ok(result.ok, "script_text alone should still count as a deliverable");
    if (result.ok) {
      assert.equal(result.assistantText, "");
      const scriptText = result.scriptText ?? "";
      assert.match(scriptText, /^\[s1\]\nCold open\n(?:\n)?\[\/s1\]\n?$/);
      assert.deepEqual(result.ops, [{ op: "set_body", value: scriptText }]);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testAiRequestPromotesCanonicalAssistantTextToScriptPayload() {
  resetLocalStorage();
  primeHearthAiRequestTestSession();
  const originalFetch = globalThis.fetch;
  const assistantScript = [
    "Here is the panel-ready bullet script:",
    "",
    "[s1]",
    "- Open with the basic fact.",
    "- Frame the episode as a media-framing comparison.",
    "[/s1]",
    "",
    "[s2]",
    "- Close with the practical takeaway.",
    "[/s2]",
  ].join("\n");

  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    if (url.includes("/rest/v1/workspaces?id=eq.")) {
      return new Response(JSON.stringify([{ org_id: HEARTH_TEST_ORG_ID }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/rest/v1/rpc/resolve_ai_policy")) {
      return new Response(JSON.stringify([{ decision_type: "ALLOW", reason_code: null }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({
    assistant_text: assistantScript,
    ops: [],
    billing_mode: "forge",
    token_balance: 63,
    total_tokens: 17,
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  }) as typeof fetch;

  try {
    const result = await requestHearthChatReply(
      [{ role: "user", content: "Put this into the script panel." }],
      createEpisodeContextFixture(),
    );
    assert.ok(result.ok, "canonical assistant text should still populate the script panel");
    if (result.ok) {
      const scriptText = result.scriptText ?? "";
      assert.match(scriptText, /\[s1\]/);
      assert.match(scriptText, /Open with the basic fact\./);
      assert.match(scriptText, /Frame the episode as a media-framing comparison\./);
      assert.match(scriptText, /\[s2\]/);
      assert.match(scriptText, /Close with the practical takeaway\./);
      assert.deepEqual(result.ops, [{ op: "set_body", value: scriptText }]);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testAnvilTagValidatorAndFormatter() {
  const invalidScript = [
    "**Brad:** intro line",
    "(Joe:) response line",
  ].join("\n");

  const invalid = validateAnvilTagContract(invalidScript);
  assert.equal(invalid.ok, false, "Invalid script should fail tag contract");
  assert.ok(
    invalid.problems.some((item) => item.includes("Forbidden markup")),
    "Validator should report forbidden markup",
  );

  const formatted = formatScriptToAnvilTagsNoAi(invalidScript);
  const fixed = validateAnvilTagContract(formatted);
  assert.equal(fixed.ok, true, "Formatter should produce valid canonical tag output for common label issues");
  assert.ok(formatted.includes("[s1]"), "Formatter should map Joe/S1 labels to [s1]");
  assert.ok(formatted.includes("[s2]"), "Formatter should map Brad/S2 labels to [s2]");

  const cadenceScript = [
    "# Opening",
    "[s1] Hello there.",
    "(pause)",
    "Brad: Copy that.",
  ].join("\n");
  const cadenceFormatted = formatScriptToAnvilTagsNoAi(cadenceScript);
  assert.ok(cadenceFormatted.includes("Opening"), "Formatter should keep heading text");
  assert.ok(!cadenceFormatted.includes("# Opening"), "Formatter should strip markdown heading markers");
  assert.ok(cadenceFormatted.includes("[pause]"), "Formatter should convert (pause) to [pause]");
  assert.ok(
    /\[s1\]\nHello there\.\n(?:\[pause\]\n)?\[\/s1\]/.test(cadenceFormatted),
    "Formatter should force speaker tags to their own lines and close blocks",
  );
  assert.ok(
    cadenceFormatted.includes("[s2]\nCopy that.\n[/s2]"),
    "Formatter should convert Brad label into canonical S2 block",
  );

  const cadenceFormattedTwice = formatScriptToAnvilTagsNoAi(cadenceFormatted);
  assert.equal(
    cadenceFormattedTwice,
    cadenceFormatted,
    "Formatter should be idempotent across repeated formatting passes",
  );

  const misnestedSpeakerScript = [
    "[s1]",
    "First line.",
    "[s2]",
    "Second line.",
  ].join("\n");
  const misnestedFormatted = formatScriptToAnvilTagsNoAi(misnestedSpeakerScript);
  assert.ok(
    !misnestedFormatted.includes("[s1]\n[s2]"),
    "Formatter should not keep nested speaker opens when healing malformed scripts",
  );
  assert.ok(
    misnestedFormatted.includes("[/s1]\n[s2]"),
    "Formatter should close the currently open speaker block before opening another one",
  );
  assert.equal(
    (misnestedFormatted.match(/\[\/s1\]/g) ?? []).length,
    1,
    "Formatter should only add one close tag for S1 when auto-closing at EOF",
  );
  assert.equal(
    (misnestedFormatted.match(/\[\/s2\]/g) ?? []).length,
    1,
    "Formatter should close only the currently open speaker block at EOF",
  );
  assert.equal(
    validateAnvilTagContract(misnestedFormatted).ok,
    true,
    "Formatter healing should produce a valid script without introducing invalid nesting",
  );

  const inlineCueAndNoteScript = [
    "[s1]",
    "That was the moment it hit me [beat] and I knew we were in trouble [pause].",
    "Land the line [note]slow down here[/note] then keep moving.",
    "Style cue [b]bold[/b], [i]lean in[/i], [u]underline[/u], [color=red]alert[/color], [bg=#112233]bg[/bg].",
    "[/s1]",
  ].join("\n");
  const inlineCueAndNoteValidation = validateAnvilTagContract(inlineCueAndNoteScript);
  assert.equal(
    inlineCueAndNoteValidation.ok,
    true,
    "Inline cue/style/note tags should be valid inside speaker text",
  );
  assert.ok(
    inlineCueAndNoteValidation.problems.every((item) => !item.includes("Speaker tags must be on their own line")),
    "Inline tags should not trigger speaker standalone-line errors",
  );

  const inlineSpeakerTagScript = "[s1] Hello there";
  const inlineSpeakerValidation = validateAnvilTagContract(inlineSpeakerTagScript);
  assert.equal(inlineSpeakerValidation.ok, false, "Inline speaker tag usage should fail validation");
  assert.ok(
    inlineSpeakerValidation.problems.some((item) => item.includes("Speaker tags must be on their own line")),
    "Inline speaker tags should still be blocked as structural tags",
  );
}

async function run() {
  await testDraftFlagsRoundtrip();
  await testRevisionCap();
  await testTongsRevisionRoundtrip();
  await testTongsRevisionIsolationByWorkpiece();
  await testTongsRevisionFallbackPrecedence();
  await testTongsRevisionCap();
  await testReadyScriptsRoundtripIgnoresLegacyLocalOrder();
  await testReadyScriptsCanonicalQueryOverridesPriorClientResidueAcrossRefresh();
  await testReadyQueueReorderPayload();
  await testReadyQueueHiddenMutationPayload();
  await testReadyScriptRemovalDeletesAllCanonicalPaths();
  await testImageMapRepoReadNormalizesSemanticEntriesAndAssetSummary();
  await testImageMapRepoSaveForwardsExpectedTimestampAndReturnsLatestOnConflict();
  await testImageMapRepoRejectsMismatchedCanonicalAttachment();
  await testImageMapCandidateGenerationRoundTripsCanonicalRefs();
  await testImageMapCandidateSelectionPersistsCanonicalSelectedAsset();
  await testImageMapCandidateSelectionRejectsDetachedCandidate();
  await testImageMapCandidatePreviewLoaderReadsCanonicalFilePath();
  await testImageMapCandidatePreviewLoaderNormalizesRepeatedWorkpiecePrefixes();
  await testThumbnailPreviewLoaderNormalizesRepeatedWorkpiecePrefixes();
  testGenerateImageMapEntriesFromScriptEmitsMultipleBeatsWithinParagraph();
  testGenerateImageMapEntriesFromTaggedScriptSkipsSpeakerAndNoteTags();
  testBuildImageMapAnchorPickerParagraphsSkipsStandaloneBlockTags();
  testEnsureImageMapV2RoundTripsStructuredEntries();
  testHydrateEpisodePackageV2KeepsLaunchVariantsBoundToCanonicalAssets();
  testHydrateEpisodePackageV2NormalizesLaunchVariantStatusMetadata();
  testResolvePrimarySeoTitlePrefersPrimaryThenPopulatedFallback();
  testResolveImageMapScriptAnchorFromTextRecoversExactSentenceAnchor();
  testResolveImageMapScriptAnchorFromTextSupportsOccurrenceHintsAndSentenceRanges();
  testAssessImageMapScriptAnchorDetectsMissingAndStaleAnchors();
  testBuildExactScriptAnchorFromSelectionSpansSentenceRange();
  testReanchorImageMapEntryPreservesBeatMetadata();
  await testImageMapRepoSavePersistsReanchoredAnchor();
  testApplyProductionArtifactImageBeatSheetResolvesStructuredAnchorsFromCanonicalScript();
  testVisualStyleCatalogNormalizesAliasesAndPromptHints();
  testHydrateEpisodePackageV2NormalizesLegacyVisualStyles();
  testThumbnailTitleStyleDefaultsNormalizeDeterministically();
  testThumbnailTitleStylePartialMetadataDefaultsMissingFields();
  testThumbnailTitleStylePersistenceRoundTripsThroughEpisodePackage();
  testThumbnailTitleShadowCssVariants();
  testThumbnailBrandTemplateIdRoundTripsThroughEpisodePackage();
  testResolveThumbnailBrandRenderUsesTemplateForDefaultConceptStyle();
  testResolveThumbnailBrandRenderKeepsExplicitConceptTitleStyleOverride();
  await testBarStockSparkListDiscoveryStaysCanonicalAcrossClients();
  await testSparkIntakeWaitsForCanonicalDiscoveryBeforeDeclaringMissing();
  await testWorkpieceListRoundtripAndPrimaryScriptRead();
  await testWorkpieceArchiveRoundtripUsesCanonicalEndpoints();
  await testWorkpieceListDedupesCanonicalIdsBeforeRailConsumption();
  await testWorkpieceDraftHydrationReadsCanonicalSnapshotWithoutCachedMapping();
  testDraftHydrationPrefersUsableCanonicalBodyOverNewerEmptyBuffer();
  testHydrateDraftBodyFromCanonicalScriptRepairsBlankWorkpieceBuffer();
  testChooseCanonicalImageMapScriptSourcePrefersNewerSavedDraftOverStalePrimaryShell();
  testChooseCanonicalImageMapScriptSourceKeepsPublishedScriptWhenItMatchesCurrentTruth();
  await testWorkpieceNavModelStaysWorkpieceFirst();
  await testActiveWorkpieceContextResolvesAttachedArtifactsWithoutCreatingNavRows();
  await testForgedSparkRouteResolutionPrefersBoundWorkpiece();
  await testSessionRoundtrip();
  await testBuildEpisodeContextIncludesFields();
  await testApplyHearthOpsRequestsSave();
  await testAiRequestPayloadIncludesEpisodeId();
  await testAiRequestTreatsScriptTextOnlyAsDeliverable();
  await testAiRequestPromotesCanonicalAssistantTextToScriptPayload();
  await testAnvilTagValidatorAndFormatter();
  // eslint-disable-next-line no-console
  console.log("Hearth confidence tests passed.");
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Hearth confidence tests failed:", err);
  process.exit(1);
});
