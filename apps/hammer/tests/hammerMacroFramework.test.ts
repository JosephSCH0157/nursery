import assert from "node:assert/strict";
import {
  evaluateHammerMacroCatalogReadiness,
  findHammerFinishingMacroRecipe,
  listHammerFinishingMacroRecipes,
  summarizeHammerMacroReadiness,
} from "../src/macros/hammerMacroFramework";

{
  const recipes = listHammerFinishingMacroRecipes();
  assert.equal(recipes.length >= 3, true);
  assert.equal(findHammerFinishingMacroRecipe("macro:podcast_cleanup.v1")?.name, "Podcast Cleanup");
}

{
  const readiness = evaluateHammerMacroCatalogReadiness({
    transcriptSegmentCount: 18,
    activeMediaKind: "recording_video",
    playbackSourceAvailable: true,
    audioPolish: {
      schema_version: 1,
      status: "prepared",
      prepared_passes: ["studio_sound", "noise_cleanup", "level_consistency"],
      source_artifact_paths: ["recordings/example.wav"],
      settings_summary: {
        supported_source: true,
      },
      source_media_id: "media_01",
      source_media_signature: "sig_01",
      processor_version: "forge-v1.2.0/audio-polish.v1",
      prepared_at: "2026-03-15T01:00:00.000Z",
      output_local_relpath: "hammer/prep/audio-polish/example.wav",
      output_mime_type: "audio/wav",
      output_duration_ms: 30_000,
      failure_code: null,
      failure_reason: null,
    },
    visualPlacements: {
      schema_version: 1,
      status: "prepared",
      source_refs: ["transcript:example"],
      uncertainty_flags: [],
      placements: [
        {
          placement_id: "placement_01",
          entry_id: "image-map-01",
          anchor_segment_id: "seg_001",
          matched_segment_ids: ["seg_001"],
          anchor_text: "Opening line",
          asset_ref: "asset_01",
          asset_id: "asset_01",
          asset_path: "assets/example.png",
          storage_key: "assets/example.png",
          label: "open",
          visual_mode: "comparison",
          start_sec: 0,
          end_sec: 4,
          confidence: 0.91,
          timing_source: "transcript_match",
          status: "placed",
          uncertainty_flags: [],
        },
      ],
    },
  });

  const podcastCleanup = readiness.find((entry) => entry.recipe.ref === "macro:podcast_cleanup.v1");
  const videoPolish = readiness.find((entry) => entry.recipe.ref === "macro:video_polish.v1");
  const summary = summarizeHammerMacroReadiness(readiness);

  assert.equal(podcastCleanup?.status, "ready");
  assert.equal(videoPolish?.status, "ready");
  assert.equal(summary.ready >= 2, true);
}

{
  const readiness = evaluateHammerMacroCatalogReadiness({
    transcriptSegmentCount: 12,
    activeMediaKind: "recording_audio",
    playbackSourceAvailable: true,
    audioPolish: {
      schema_version: 1,
      status: "failed",
      prepared_passes: [],
      source_artifact_paths: ["recordings/example.mp4"],
      settings_summary: {
        source_extension: ".mp4",
      },
      source_media_id: "media_02",
      source_media_signature: "sig_02",
      processor_version: "forge-v1.2.0/audio-polish.v1",
      prepared_at: null,
      output_local_relpath: null,
      output_mime_type: null,
      output_duration_ms: null,
      failure_code: "unsupported_source",
      failure_reason: "Unsupported sources will open normally without polish.",
    },
    visualPlacements: null,
  });

  const podcastCleanup = readiness.find((entry) => entry.recipe.ref === "macro:podcast_cleanup.v1");
  const videoPolish = readiness.find((entry) => entry.recipe.ref === "macro:video_polish.v1");
  const interviewTightCut = readiness.find((entry) => entry.recipe.ref === "macro:interview_tight_cut.v1");

  assert.equal(podcastCleanup?.status, "warning");
  assert.equal(interviewTightCut?.status, "warning");
  assert.equal(videoPolish?.status, "blocked");
}

console.log("Hammer macro framework tests passed.");
