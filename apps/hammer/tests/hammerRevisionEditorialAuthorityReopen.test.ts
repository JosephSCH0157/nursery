import assert from "node:assert/strict";
import test from "node:test";
import type { HammerEditorialAuthorityGraph } from "../../../packages/contracts/hammer/editorial-authority.contract";
import { hydrateHammerOpenLaunchContext } from "../src/editor/hammerOpenHydration";
import {
  loadHammerRecordingRevisionArtifacts,
  type HammerRecordingRevisionRecord,
} from "../src/persistence/hammerRecordingRevisionPersistence";
import type { HammerPersistenceSnapshot } from "../src/persistence/hammerPersistenceContract";

const originalFetch = globalThis.fetch;
const runtime = globalThis as typeof globalThis & { window?: unknown; localStorage?: unknown; location?: unknown };
const originalWindow = runtime.window;
const originalLocalStorage = runtime.localStorage;
const originalLocation = runtime.location;
const fingerprint = "a".repeat(64);
const revision: HammerRecordingRevisionRecord = {
  id: "22222222-2222-4222-8222-222222222222",
  workspace_id: "11111111-1111-4111-8111-111111111111",
  workpiece_id: "33333333-3333-4333-8333-333333333333",
  canonical_recording_id: "44444444-4444-4444-8444-444444444444",
  status: "active",
  label: null,
  editor_session_path: null,
  revision_transcript_path: null,
  audio_polish_path: null,
  visual_timeline_path: null,
  visual_placements_path: null,
  history_path: null,
  snapshots_manifest_path: null,
  editorial_authority_path: "hammer/revisions/22222222-2222-4222-8222-222222222222/editorial-authority.v1.json",
  editorial_authority_fingerprint: fingerprint,
  editorial_authority_revision: 1,
  updated_at: "2026-08-18T00:00:00.000Z",
};
const authority: HammerEditorialAuthorityGraph = {
  schema_version: 1,
  graph_id: "authority:florida",
  graph_version: 7,
  workspace_id: revision.workspace_id,
  workpiece_id: revision.workpiece_id,
  session_id: "session:florida",
  source_transcript_id: "transcript:florida",
  operation_order: [],
  operations: [],
  created_at: "2026-08-16T00:00:00.000Z",
  updated_at: "2026-08-18T00:00:00.000Z",
};

function artifact(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    workspace_id: revision.workspace_id,
    workpiece_id: revision.workpiece_id,
    canonical_recording_id: revision.canonical_recording_id,
    recording_revision_id: revision.id,
    authority,
    ...overrides,
  };
}

function installFetch(value: unknown, options?: { status?: number; hash?: string | null; throwRead?: boolean }) {
  globalThis.fetch = async (input): Promise<Response> => {
    const url = String(input);
    if (url.includes("visual-timeline")) {
      return new Response(JSON.stringify({ ok: true, exists: false }), { status: 404 });
    }
    if (options?.throwRead) throw new Error("authority read unavailable");
    const status = options?.status ?? 200;
    if (status === 404) return new Response(JSON.stringify({ ok: true, exists: false }), { status });
    return new Response(JSON.stringify({
      ok: true,
      data: value,
      file_row: { hash_value: options?.hash === undefined ? fingerprint : options.hash },
    }), { status });
  };
}

function snapshotWithAuthority(graph: HammerEditorialAuthorityGraph): HammerPersistenceSnapshot {
  return {
    schema_version: 1,
    state: null,
    editor_session: { path: null, updated_at: null, data: null },
    structured_transcript: {
      path: "hammer/revisions/current/transcript.v1.json",
      updated_at: null,
      data: {
        schema_version: 1,
        transcript_id: "transcript:florida",
        workspace_id: revision.workspace_id,
        workpiece_id: revision.workpiece_id,
        source_media_id: "media:florida",
        source_mode: "tongs",
        language: "en",
        segments: [{ segment_id: "segment:1", start_sec: 0, end_sec: 1, text: "Florida oranges" }],
        prepared_at: "2026-08-18T00:00:00.000Z",
      } as any,
    },
    transcript_version_registry: { path: null, updated_at: null, data: null },
    speaker_map: { path: null, updated_at: null, data: null },
    visual_placements: { path: null, updated_at: null, data: null },
    visual_timeline: { path: null, updated_at: null, data: null },
    audio_polish: { path: null, updated_at: null, data: null },
    edit_plan: { path: null, updated_at: null, data: null },
    editorial_authority: { path: revision.editorial_authority_path, updated_at: null, data: graph },
    macro_hooks: { recipe_ref: null, last_run_ref: null },
  };
}

const testStorage = { getItem: () => "test-user-token", length: 0, key: () => null };
const testLocation = { search: "" };
runtime.window = { localStorage: testStorage, location: testLocation };
runtime.localStorage = testStorage;
runtime.location = testLocation;

test("revision pointer loads authority and produces canonical reopen hydration", async () => {
  installFetch(artifact());
  const loaded = await loadHammerRecordingRevisionArtifacts(revision);
  assert.equal(loaded.ok, true);
  if (!loaded.ok || !loaded.data.editorial_authority) return;
  const reopened = hydrateHammerOpenLaunchContext({
    target: { workspaceId: revision.workspace_id, workpieceId: revision.workpiece_id },
    hydratedSnapshot: snapshotWithAuthority(loaded.data.editorial_authority),
    initialLaunchContext: {
      workspace_id: revision.workspace_id,
      workpiece_id: revision.workpiece_id,
      source_mode: "tongs",
      transcript: { kind: "tongs-stub", transcript_id: "transcript:florida", segments: [] },
      media: { kind: "tongs-stub", ref: { media_id: "media:florida", kind: "recording_video" } },
    },
    bootstrapLaunchContext: undefined,
  });
  assert.equal(reopened.persistenceSource, "persistence");
  assert.equal(reopened.hasCanonicalBasis, true);
});

test("missing revision authority pointer permits compatibility fallback", async () => {
  installFetch(artifact());
  const loaded = await loadHammerRecordingRevisionArtifacts({ ...revision, editorial_authority_path: null, editorial_authority_fingerprint: null });
  assert.deepEqual(loaded.ok && loaded.data.editorial_authority, null);
});

for (const scenario of [
  { name: "missing artifact", value: artifact(), options: { status: 404 }, status: 409 },
  { name: "malformed artifact", value: { schema_version: 1 }, options: {}, status: 422 },
  { name: "fingerprint mismatch", value: artifact(), options: { hash: "b".repeat(64) }, status: 409 },
  { name: "stale revision identity", value: artifact({ recording_revision_id: "55555555-5555-4555-8555-555555555555" }), options: {}, status: 422 },
  { name: "read failure", value: artifact(), options: { throwRead: true }, status: 504 },
] as const) {
  test(`revision authority ${scenario.name} fails closed`, async () => {
    installFetch(scenario.value, scenario.options);
    const loaded = await loadHammerRecordingRevisionArtifacts(revision);
    assert.equal(loaded.ok, false);
    assert.equal(loaded.status, scenario.status);
  });
}

test.after(() => {
  globalThis.fetch = originalFetch;
  runtime.window = originalWindow;
  runtime.localStorage = originalLocalStorage;
  runtime.location = originalLocation;
});
