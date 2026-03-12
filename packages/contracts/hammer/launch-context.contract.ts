import type { HammerEditPlan, HammerPreviewMode } from "./edit-plan.contract";
import type { MediaRef, WorkspaceMediaMapping } from "./media-resolver.contract";
import type { HammerTranscriptSegment } from "./transcript.contract";
import type { HammerVisualPackage } from "./visual-package.contract";

export type HammerLaunchSourceMode = "dev" | "mapped" | "tongs";

export interface HammerFixtureTranscriptSource {
  kind: "fixture";
  fixture_id: string;
}

export interface HammerInlineJsonTranscriptSource {
  kind: "inline-json";
  transcript_json: string;
  fallback_fixture_id?: string;
  label?: string;
}

export interface HammerTongsStubTranscriptSource {
  kind: "tongs-stub";
  transcript_id: string;
  segments: HammerTranscriptSegment[];
  label?: string;
}

export type HammerTranscriptSource =
  | HammerFixtureTranscriptSource
  | HammerInlineJsonTranscriptSource
  | HammerTongsStubTranscriptSource;

export interface HammerDevToneMediaSource {
  kind: "dev-tone";
  media_id: string;
  duration_sec?: number;
}

export interface HammerMappedLocalMediaSource {
  kind: "mapped-local";
  ref: MediaRef;
  media_root_abs?: string;
  label?: string;
}

export interface HammerTongsStubMediaSource {
  kind: "tongs-stub";
  ref: MediaRef;
  workspace_mapping?: WorkspaceMediaMapping;
  label?: string;
}

export type HammerMediaSource =
  | HammerDevToneMediaSource
  | HammerMappedLocalMediaSource
  | HammerTongsStubMediaSource;

export interface HammerLaunchContext {
  workspace_id: string;
  workpiece_id: string;
  session_id?: string;
  source_mode: HammerLaunchSourceMode;
  transcript: HammerTranscriptSource;
  media: HammerMediaSource;
  visual_package?: HammerVisualPackage;
  edit_plan?: HammerEditPlan;
  preview_mode?: HammerPreviewMode;
}
