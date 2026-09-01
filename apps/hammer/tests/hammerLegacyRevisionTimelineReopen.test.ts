import assert from "node:assert/strict";
import test from "node:test";
import {
  loadHammerRecordingRevisionArtifacts,
  validateCanonicalVisualTimelineArtifact,
  type HammerRecordingRevisionRecord,
} from "../src/persistence/hammerRecordingRevisionPersistence";

const updatedAt = "2026-08-13T20:37:34.507Z";
const fixtureRevisionId = "22222222-2222-4222-8222-222222222222";
const timelinePath = `hammer/revisions/${fixtureRevisionId}/visual-timeline.v1.json`;
const runtime = globalThis as typeof globalThis & { window?: unknown; localStorage?: unknown; location?: unknown };
const originalWindow = runtime.window;
const originalLocalStorage = runtime.localStorage;
const originalLocation = runtime.location;
const testStorage = { getItem: () => "fixture-user-token", length: 0, key: () => null };
runtime.window = { localStorage: testStorage, location: { search: "" } };
runtime.localStorage = testStorage;
runtime.location = { search: "" };

function anvilV1() {
  return {
    version: 1,
    revision: 3,
    updated_at: updatedAt,
    source_mode: "packaging",
    selected_clip_id: null,
    debug_origin: "empty_init",
    assets: [{
      asset_id: "asset_0b368a47",
      asset_ref: "assets/uploads/introoutro/workspace-default-intro.mp4",
      kind: "image",
      label: "Workspace intro",
      path: "assets/uploads/introoutro/workspace-default-intro.mp4",
      storage_key: null,
      mime_type: "video/mp4",
      source_mode: "packaging",
      updated_at: updatedAt,
    }],
    lanes: [{ lane_id: "lane:primary", label: "Visuals", clip_ids: ["placement:2d636122-5e96-4979-bef2-ffbea2f31a7a"] }],
    clips: [{
      clip_id: "placement:2d636122-5e96-4979-bef2-ffbea2f31a7a",
      asset_id: "asset_0b368a47",
      lane_id: "lane:primary",
      entry_id: null,
      system_managed: true,
      system_type: "intro",
      system_source: "profile",
      system_asset_id: "asset_0b368a47",
      label: "Intro",
      visual_mode: "intro",
      confidence: 1,
      placement_status: "placed",
      ingest_state: "approved",
      uncertainty_flags: [],
      start_sec: 0,
      end_sec: 3.2,
      geometry: { x: 0, y: 0, width: 1, height: 1, anchor: "center" },
      fit_mode: "contain",
      animation: { preset: "none" },
      opacity: 1,
      z_index: 0,
      enabled: true,
      locked: true,
      source_mode: "packaging",
      anchor_hint: { anchor_segment_id: null, matched_segment_ids: [], anchor_text: null, anchor_label: null, detached: false },
      updated_at: updatedAt,
    }],
  };
}

function revision(): HammerRecordingRevisionRecord {
  return {
    id: fixtureRevisionId,
    workspace_id: "fixture-workspace",
    workpiece_id: "fixture-workpiece",
    canonical_recording_id: "fixture-recording",
    status: "active",
    label: null,
    editor_session_path: null,
    revision_transcript_path: null,
    audio_polish_path: null,
    visual_timeline_path: timelinePath,
    visual_placements_path: null,
    history_path: null,
    snapshots_manifest_path: null,
    editorial_authority_path: null,
    editorial_authority_fingerprint: null,
    editorial_authority_revision: 0,
    updated_at: updatedAt,
  };
}

test("Anvil-shaped canonical v1 normalizes losslessly and deterministically", () => {
  const source = anvilV1();
  const before = JSON.stringify(source);
  const first = validateCanonicalVisualTimelineArtifact(source);
  const second = validateCanonicalVisualTimelineArtifact(source);
  assert.equal(first.ok, true);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(source), before);
  if (!first.ok) return;
  const timeline = first.timeline;
  assert.equal(timeline.version, 2);
  assert.equal(timeline.revision, source.revision);
  assert.equal(timeline.source_mode, "packaging");
  assert.equal(timeline.debug_origin, "legacy_migration");
  assert.match(timeline.debug_migration_hash ?? "", /^v2-[0-9a-f]{8}$/);
  assert.deepEqual(timeline.assets.map(({ roles: _roles, ...asset }) => asset), source.assets.map((asset) => ({
    ...asset,
    canonical_asset_id: null,
    authority_state: "legacy_unresolved",
    authority_workspace_id: null,
    authority_workpiece_id: null,
    authority_content_hash: null,
  })));
  assert.deepEqual(timeline.lanes, source.lanes);
  assert.deepEqual(timeline.clips[0] && {
    clip_id: timeline.clips[0].clip_id,
    asset_id: timeline.clips[0].asset_id,
    lane_id: timeline.clips[0].lane_id,
    start_sec: timeline.clips[0].start_sec,
    end_sec: timeline.clips[0].end_sec,
    geometry: timeline.clips[0].geometry,
    fit_mode: timeline.clips[0].fit_mode,
    system_managed: timeline.clips[0].system_managed,
    system_type: timeline.clips[0].system_type,
    system_source: timeline.clips[0].system_source,
    system_asset_id: timeline.clips[0].system_asset_id,
  }, {
    clip_id: source.clips[0].clip_id,
    asset_id: source.clips[0].asset_id,
    lane_id: source.clips[0].lane_id,
    start_sec: source.clips[0].start_sec,
    end_sec: source.clips[0].end_sec,
    geometry: source.clips[0].geometry,
    fit_mode: source.clips[0].fit_mode,
    system_managed: source.clips[0].system_managed,
    system_type: source.clips[0].system_type,
    system_source: source.clips[0].system_source,
    system_asset_id: source.clips[0].system_asset_id,
  });
});

test("explicit revision pointer hydrates v1 without fallback or writes", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), method: init?.method ?? "GET" });
    return new Response(JSON.stringify({ ok: true, data: anvilV1(), file_row: { path: timelinePath } }), { status: 200 });
  };
  try {
    const loaded = await loadHammerRecordingRevisionArtifacts(revision());
    assert.equal(loaded.ok, true);
    if (loaded.ok) assert.equal(loaded.data.visual_timeline?.version, 2);
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.method, "GET");
    assert.match(requests[0]?.url ?? "", /visual-timeline\.v1\.json/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("valid v2 passes unchanged without migration metadata", () => {
  const migrated = validateCanonicalVisualTimelineArtifact(anvilV1());
  assert.equal(migrated.ok, true);
  if (!migrated.ok) return;
  const v2 = { ...migrated.timeline, debug_origin: "canonical_load" as const, debug_migration_hash: null };
  const result = validateCanonicalVisualTimelineArtifact(v2);
  assert.equal(result.ok, true);
  if (result.ok) assert.strictEqual(result.timeline, v2);
});

test("malformed, structurally invalid, and unsupported timelines fail closed", () => {
  for (const value of ["{not-json", null, [], 7]) assert.equal(validateCanonicalVisualTimelineArtifact(value).ok, false);
  for (const version of [0, 3, 99]) assert.equal(validateCanonicalVisualTimelineArtifact({ ...anvilV1(), version }).ok, false);
  for (const mutate of [
    (value: ReturnType<typeof anvilV1>) => { value.assets = [] as never; },
    (value: ReturnType<typeof anvilV1>) => { value.clips[0].clip_id = ""; },
    (value: ReturnType<typeof anvilV1>) => { value.lanes[0].lane_id = ""; },
    (value: ReturnType<typeof anvilV1>) => { value.clips[0].asset_id = "missing"; },
    (value: ReturnType<typeof anvilV1>) => { value.clips[0].lane_id = "missing"; },
  ]) {
    const value = anvilV1();
    mutate(value);
    assert.equal(validateCanonicalVisualTimelineArtifact(value).ok, false);
  }
  assert.equal(validateCanonicalVisualTimelineArtifact({ ...anvilV1(), version: 2, clips: "invalid" }).ok, false);
});

test("pointer-present invalid v2 and missing artifact remain fail-closed", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const response of [
      new Response(JSON.stringify({ ok: true, data: { ...anvilV1(), version: 2, clips: "invalid" } }), { status: 200 }),
      new Response(JSON.stringify({ ok: true, exists: false }), { status: 404 }),
    ]) {
      globalThis.fetch = async () => response.clone();
      const loaded = await loadHammerRecordingRevisionArtifacts(revision());
      assert.equal(loaded.ok, false);
      if (!loaded.ok) assert.match(loaded.error, /canonical visual timeline|active revision|missing/i);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test.after(() => {
  runtime.window = originalWindow;
  runtime.localStorage = originalLocalStorage;
  runtime.location = originalLocation;
});
