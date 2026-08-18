import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildHammerWorkspaceShellMediaPrepPackage,
} from "../src/editor/hammerWorkspaceShellMediaPrepPackage";

test("media-prep package authority preserves exact empty and raw-source projections", () => {
  const empty = buildHammerWorkspaceShellMediaPrepPackage({
    structuredTranscript: null,
    visualPlacements: null,
    audioPolish: null,
    mediaRef: null,
    mediaSourceLabel: null,
  });
  assert.deepEqual(empty, {
    schema_version: 1,
    visuals: {
      status: "missing", freshness: "missing", transcript_source_ref: null,
      source_refs: [], placement_count: 0, uncertain_placement_count: 0,
      uncertainty_flags: [], placements: [],
    },
    audio: {
      raw_source: {
        media_id: null, kind: null, media_signature: null, local_relpath: null,
        cloud_uri: null, source_hint: null, media_source_label: null, duration_ms: null,
      },
      polish: {
        status: "missing", freshness: "missing", prepared_passes: [], failure_code: null,
        failure_reason: null, processor_version: null, settings_summary: {}, output_local_relpath: null,
        output_workpiece_path: null, output_mime_type: null, output_duration_ms: null,
      },
      preferred_playback: {
        kind: "none", reason: "no_media_source", media_id: null, local_relpath: null,
        workpiece_path: null, mime_type: null, source_label: null,
      },
    },
  });

  const mediaRef = {
    media_id: "media1",
    kind: "recording_audio" as const,
    source_hint: "local",
    local_relpath: "recordings/source.wav",
    duration_ms: 1200,
  };
  const before = structuredClone(mediaRef);
  const raw = buildHammerWorkspaceShellMediaPrepPackage({
    structuredTranscript: null,
    visualPlacements: null,
    audioPolish: null,
    mediaRef,
    mediaSourceLabel: "Source",
  });
  assert.deepEqual(mediaRef, before);
  assert.deepEqual(raw.audio.preferred_playback, {
    kind: "raw", reason: "audio_polish_missing", media_id: "media1",
    local_relpath: "recordings/source.wav", workpiece_path: null,
    mime_type: null, source_label: "Source",
  });
  mediaRef.local_relpath = "later.wav";
  assert.equal(raw.audio.raw_source.local_relpath, "recordings/source.wav");
  assert.deepEqual(raw, buildHammerWorkspaceShellMediaPrepPackage({
    structuredTranscript: null, visualPlacements: null, audioPolish: null,
    mediaRef: before, mediaSourceLabel: "Source",
  }));
});

test("media-prep package owner excludes I/O, lifecycle, mutation, placement, and release authority", () => {
  const owner = readFileSync(new URL("../src/editor/hammerWorkspaceShellMediaPrepPackage.ts", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../src/editor/HammerWorkspaceShell.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(owner, /\b(?:useState|useEffect|useLayoutEffect|useRef|fetch|saveHammer|upload|resolveHammerAutomaticPlacementCommand|applyHistoryMutation|buildHammerWorkspaceShellReleasePackage)\s*\(/);
  assert.doesNotMatch(shell, /buildHammerMediaPrepOutputsPackage\s*\(/);
  assert.match(shell, /useHammerWorkspaceShellMediaPrepPackage\s*\(/);
});
