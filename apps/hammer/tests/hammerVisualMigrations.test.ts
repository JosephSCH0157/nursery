import assert from "node:assert/strict";
import test from "node:test";
import type {
  HammerPersistenceSnapshot,
  HammerPersistedVisualPlacements,
  HammerVisualPlacementRecord,
} from "../src/persistence/hammerPersistenceContract";
import { deriveStableHammerVisualAssetId, migrateLegacyPlacementRecordToClip, migrateLegacyPlacementRecordsToTimelineState } from "../src/visuals/model/hammerVisualMigrations";
import { loadHammerVisualTimelineStateFromSnapshot } from "../src/visuals/persistence/hammerVisualTimelinePersistence";

function buildPlacement(overrides?: Partial<HammerVisualPlacementRecord>): HammerVisualPlacementRecord {
  return {
    placement_id: overrides?.placement_id ?? "placement_001",
    entry_id: overrides?.entry_id ?? "packaging:intro",
    anchor_segment_id: overrides?.anchor_segment_id ?? "seg_001",
    matched_segment_ids: overrides?.matched_segment_ids ?? ["seg_001"],
    anchor_text: overrides?.anchor_text ?? "hello world",
    anchor_origin: overrides?.anchor_origin ?? null,
    asset_ref: overrides?.asset_ref ?? "visuals/hero.png",
    asset_id: overrides?.asset_id ?? null,
    asset_path: overrides?.asset_path ?? "visuals/hero.png",
    storage_key: overrides?.storage_key ?? null,
    label: overrides?.label ?? "Hero",
    visual_mode: overrides?.visual_mode ?? "packaging_intro",
    start_sec: overrides?.start_sec ?? 1,
    end_sec: overrides?.end_sec ?? 3,
    confidence: overrides?.confidence ?? 0.9,
    timing_source: overrides?.timing_source ?? "transcript_match",
    status: overrides?.status ?? "placed",
    ingest_state: overrides?.ingest_state ?? "approved",
    uncertainty_flags: overrides?.uncertainty_flags ?? [],
    alignment: overrides?.alignment,
    overlay_geometry: overrides?.overlay_geometry ?? {
      x: 0.5,
      y: 0.5,
      width: 0.4,
      height: 0.4,
      anchor: "center",
    },
    animation_preset: overrides?.animation_preset ?? "fade_in",
    overlay_opacity: overrides?.overlay_opacity ?? 0.8,
    overlay_z_index: overrides?.overlay_z_index ?? 2,
  };
}

function buildLegacyVisualPlacements(
  placements: HammerVisualPlacementRecord[],
): HammerPersistedVisualPlacements {
  return {
    schema_version: 1,
    status: "prepared",
    source_refs: ["transcript:tx_001"],
    uncertainty_flags: [],
    placements,
  };
}

function buildSnapshot(args?: {
  canonical?: HammerPersistenceSnapshot["visual_timeline"]["data"];
  legacy?: HammerPersistedVisualPlacements | null;
  selected_overlay_row_id?: string | null;
}): HammerPersistenceSnapshot {
  return {
    schema_version: 1,
    state: null,
    editor_session: {
      path: null,
      updated_at: "2026-04-02T12:00:00.000Z",
      data: {
        schema_version: 1,
        session_id: "session_001",
        source_mode: "tongs",
        preview_mode: "edit-aware",
        transcript_source_id: "tx_001",
        selected_segment_id: "seg_001",
        selected_overlay_row_id: args?.selected_overlay_row_id ?? null,
        media_ref: null,
        workspace_mapping: null,
        media_source_label: null,
        visual_preview: {
          white_balance: 0,
          color_amount: 0,
          background_blur: false,
        },
        last_opened_at: "2026-04-02T12:00:00.000Z",
      },
    },
    structured_transcript: { path: null, updated_at: null, data: null },
    transcript_version_registry: { path: null, updated_at: null, data: null },
    speaker_map: { path: null, updated_at: null, data: null },
    visual_placements: { path: null, updated_at: "2026-04-02T12:00:00.000Z", data: args?.legacy ?? null },
    visual_timeline: { path: null, updated_at: "2026-04-02T12:01:00.000Z", data: args?.canonical ?? null },
    audio_polish: { path: null, updated_at: null, data: null },
    edit_plan: { path: null, updated_at: null, data: null },
    editorial_authority: { path: null, updated_at: null, data: null },
    macro_hooks: {
      recipe_ref: null,
      last_run_ref: null,
    },
  };
}

function normalizeForSnapshot<T extends { updated_at: string; debug_origin?: string; debug_migration_hash?: string | null }>(state: T) {
  return {
    ...state,
    updated_at: "__IGNORED__",
  };
}

test("same legacy asset variants collapse to one deterministic asset id", () => {
  const first = deriveStableHammerVisualAssetId(buildPlacement({
    asset_path: "./Visuals/Hero.png?version=1",
  }));
  const second = deriveStableHammerVisualAssetId(buildPlacement({
    asset_path: "visuals/hero.png",
  }));

  assert.equal(first, second);
});

test("migration is deterministic across repeated runs", () => {
  const legacy = [
    buildPlacement({
      placement_id: "placement_001",
      asset_path: "./Visuals/Hero.png?version=1",
    }),
    buildPlacement({
      placement_id: "placement_002",
      entry_id: "image-map-002",
      asset_path: "visuals/hero.png",
      start_sec: 4,
      end_sec: 2,
      visual_mode: "comparison",
      ingest_state: "suggested",
    }),
  ];

  const first = migrateLegacyPlacementRecordsToTimelineState({
    placements: legacy,
    selected_overlay_row_id: "placement_002",
    updated_at: "2026-04-02T12:00:00.000Z",
  });
  const second = migrateLegacyPlacementRecordsToTimelineState({
    placements: legacy,
    selected_overlay_row_id: "placement_002",
    updated_at: "2026-04-02T12:00:00.000Z",
  });

  assert.deepEqual(normalizeForSnapshot(first), normalizeForSnapshot(second));
  assert.equal(first.assets.length, 2);
  assert.deepEqual(first.clips.map((clip) => clip.clip_id), ["placement_001", "placement_002"]);
  assert.equal(first.selected_clip_id, "placement_002");
});

test("canonical timeline load takes precedence over legacy migration", () => {
  const canonical = migrateLegacyPlacementRecordsToTimelineState({
    placements: [buildPlacement()],
    updated_at: "2026-04-02T12:00:00.000Z",
  });
  canonical.debug_origin = "canonical_load";

  const snapshot = buildSnapshot({
    canonical,
    legacy: buildLegacyVisualPlacements([
      buildPlacement({
        placement_id: "legacy_only",
      }),
    ]),
  });

  const loaded = loadHammerVisualTimelineStateFromSnapshot(snapshot);

  assert.equal(loaded.debug_origin, "canonical_load");
  assert.deepEqual(loaded.clips.map((clip) => clip.clip_id), ["placement_001"]);
});

test("legacy migration is used only when canonical timeline is absent", () => {
  const snapshot = buildSnapshot({
    legacy: buildLegacyVisualPlacements([
      buildPlacement({
        placement_id: "placement_legacy",
      }),
    ]),
    selected_overlay_row_id: "placement_legacy",
  });

  const loaded = loadHammerVisualTimelineStateFromSnapshot(snapshot);

  assert.equal(loaded.debug_origin, "legacy_migration");
  assert.equal(loaded.selected_clip_id, "placement_legacy");
  assert.deepEqual(loaded.assets.map((asset) => asset.asset_id).length, 1);
});

test("canonical v1 normalization is pure, deterministic, and staged", () => {
  const v2 = migrateLegacyPlacementRecordsToTimelineState({
    placements: [buildPlacement()],
    updated_at: "2026-04-02T12:00:00.000Z",
  });
  const v1 = {
    ...v2,
    version: 1,
    assets: v2.assets.map(({ roles: _roles, ...asset }) => asset),
    clips: v2.clips.map(({ semantic_anchor: _semanticAnchor, divergence: _divergence, ...clip }) => clip),
  } as unknown as HammerPersistenceSnapshot["visual_timeline"]["data"];
  const snapshot = buildSnapshot({ canonical: v1 });
  const before = JSON.stringify(snapshot);
  const first = loadHammerVisualTimelineStateFromSnapshot(snapshot);
  const second = loadHammerVisualTimelineStateFromSnapshot(snapshot);
  assert.equal(JSON.stringify(snapshot), before);
  assert.deepEqual(first, second);
  assert.equal(first.version, 2);
  assert.equal(first.debug_origin, "legacy_migration");
  assert.match(first.debug_migration_hash ?? "", /^v2-[0-9a-f]{8}$/);
  assert.deepEqual(first.assets[0]?.roles, ["timeline_visual"]);
  assert.equal(first.clips[0]?.semantic_anchor.status, "anchor_supplied_resolution_failed");
});

test("structurally unusable canonical data cannot suppress viable legacy recovery", () => {
  const snapshot = buildSnapshot({
    canonical: {
      version: 1,
      source_mode: "packaging",
      revision: 1,
      updated_at: "2026-04-02T12:00:00.000Z",
      assets: [],
      lanes: [{ lane_id: "lane:primary", label: "Visuals", clip_ids: ["missing_clip"] }],
      clips: [],
      selected_clip_id: null,
    },
    legacy: buildLegacyVisualPlacements([buildPlacement({ placement_id: "legacy_recovery" })]),
  });

  const loaded = loadHammerVisualTimelineStateFromSnapshot(snapshot);
  assert.equal(loaded.debug_origin, "legacy_migration");
  assert.deepEqual(loaded.clips.map((clip) => clip.clip_id), ["legacy_recovery"]);
});

test("empty init is returned when neither canonical nor legacy visuals exist", () => {
  const loaded = loadHammerVisualTimelineStateFromSnapshot(buildSnapshot());

  assert.equal(loaded.debug_origin, "empty_init");
  assert.equal(loaded.assets.length, 0);
  assert.equal(loaded.clips.length, 0);
});

test("legacy anchor evidence maps every durable resolution state without losing timing", () => {
  const detached = migrateLegacyPlacementRecordToClip({
    record: buildPlacement({ uncertainty_flags: ["anchor_provenance_stale"], anchor_origin: "hammer_timeline" }),
    asset_id: "asset:detached", updated_at: "2026-04-02T12:00:00.000Z",
  });
  assert.equal(detached.semantic_anchor.status, "detached");
  assert.equal(detached.semantic_anchor.script?.resolution_state, "stale");
  assert.equal(detached.semantic_anchor.origin, "hammer_timeline");

  const ambiguous = migrateLegacyPlacementRecordToClip({
    record: buildPlacement({ uncertainty_flags: ["anchor_match_ambiguous"] }), asset_id: "asset:ambiguous",
  });
  assert.equal(ambiguous.semantic_anchor.status, "ambiguous_match");

  for (const match_method of ["deterministic_phrase", "fuzzy_text"] as const) {
    const aligned = migrateLegacyPlacementRecordToClip({
      record: buildPlacement({
        alignment: { state: "aligned", transcript_segment_id: "seg_001", transcript_start_sec: 1.25, transcript_end_sec: 2.75, confidence: 0.88, match_method },
      }),
      asset_id: `asset:${match_method}`, updated_at: "2026-04-02T12:00:00.000Z",
    });
    assert.equal(aligned.semantic_anchor.status, "anchored");
    assert.equal(aligned.semantic_anchor.resolution_method, match_method === "deterministic_phrase" ? "exact_ordered_words" : "fuzzy_text");
    assert.deepEqual(aligned.divergence, { state: "aligned", start_delta_sec: -0.25, end_delta_sec: 0.25 });
  }
});
