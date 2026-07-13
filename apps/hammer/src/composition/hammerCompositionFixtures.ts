import { hammerStableFingerprint, type HammerCompositionClipV2, type HammerCompositionV2 } from "./hammerCompositionV2";
import type { HammerMediaProvenance, HammerMediaRole } from "./hammerMediaProvenance";

const at = "2026-07-13T00:00:00.000Z";
const media = (id: string, role: HammerMediaRole, durationMs: number): HammerMediaProvenance => Object.freeze({
  schema_version: 1, media_id: id, canonical_asset_id: `asset:${id}`, role,
  content_fingerprint: `sha256:${id}`, canonical_path: `recordings/${id}.mp4`, mime_type: "video/mp4",
  duration_ms: durationMs, availability: "available", relinked_from_path: null,
  derived_from_fingerprint: null, generator_version: null,
});
const clip = (id: string, track: string, source: string, start: number, end: number, payload: Record<string, unknown> = {}): HammerCompositionClipV2 => Object.freeze({
  clip_id: id, track_id: track, kind: "media", source_media_id: source, source_start_sec: 0,
  source_end_sec: end - start, timeline_start_sec: start, timeline_end_sec: end,
  enabled: true, linked_group_id: null, payload: Object.freeze(payload),
});
const derivedClip = (id: string, track: string, kind: "caption" | "graphic", start: number, end: number, payload: Record<string, unknown>): HammerCompositionClipV2 => Object.freeze({
  clip_id: id, track_id: track, kind, source_media_id: null, source_start_sec: 0, source_end_sec: 0,
  timeline_start_sec: start, timeline_end_sec: end, enabled: true, linked_group_id: null, payload: Object.freeze(payload),
});

function build(id: string, sources: readonly HammerMediaProvenance[], clips: readonly HammerCompositionClipV2[], extras?: Partial<HammerCompositionV2>): HammerCompositionV2 {
  const draft = {
    schema_version: 2 as const, composition_id: id, workspace_id: "11111111-1111-4111-8111-111111111111",
    workpiece_id: "22222222-2222-4222-8222-222222222222", recording_revision_id: "33333333-3333-4333-8333-333333333333",
    revision: 1, parent_revision: null, created_at: at, updated_at: at, source_media: sources,
    tracks: [Object.freeze({ track_id: "program", kind: "video" as const, role: "program", locked: false, muted: false, solo: false, visible: true, clips })],
    transcript: Object.freeze({ transcript_id: "transcript:1", corrections: [] }), captions: Object.freeze({ artifact_id: null, based_on_transcript_id: "transcript:1", stale: false }),
    audio_treatments: [], editorial_authority: Object.freeze({}), automated_placements: [], packaging: Object.freeze({ intro_clip_id: null, outro_clip_id: null, thumbnail_asset_id: "thumb:1" }), history_head_id: null,
    ...extras, fingerprint: "",
  };
  return Object.freeze({ ...draft, fingerprint: hammerStableFingerprint({ ...draft, fingerprint: undefined }) });
}

export const HAMMER_COMPOSITION_FIXTURES = Object.freeze({
  solo: build("fixture:solo", [media("solo", "program_video", 60_000)], [clip("solo-program", "program", "solo", 0, 60)]),
  interview: build("fixture:interview", [media("cam-a", "camera", 60_000), media("cam-b", "camera", 60_000)], [clip("angle-a", "program", "cam-a", 0, 30), clip("angle-b", "program", "cam-b", 30, 60)]),
  panel: build("fixture:panel", [media("panel-wide", "camera", 60_000)], [clip("panel", "program", "panel-wide", 0, 60, { layout: "panel" })]),
  missingMedia: build("fixture:missing", [Object.freeze({ ...media("missing", "program_video", 60_000), availability: "missing" as const })], [clip("missing-program", "program", "missing", 0, 60)]),
  packaged: build("fixture:packaged", [media("intro", "intro", 5_000), media("program", "program_video", 60_000), media("outro", "outro", 5_000)], [clip("intro", "program", "intro", 0, 5, { transition_out: "crossfade" }), clip("program", "program", "program", 5, 65, { captions: true, graphics: true, music: true }), clip("outro", "program", "outro", 65, 70, { transition_in: "crossfade" })], { packaging: Object.freeze({ intro_clip_id: "intro", outro_clip_id: "outro", thumbnail_asset_id: "thumb:1" }), audio_treatments: [Object.freeze({ treatment_id: "master-loudness", kind: "loudness", scope: Object.freeze({ kind: "program" }), bypassed: false, target_lufs: -16, true_peak_ceiling_dbtp: -1 })] }),
  semanticPlan: build("fixture:semantic-plan", [media("intro", "intro", 5_000), media("cam-a", "camera", 60_000), media("cam-b", "camera", 60_000), media("outro", "outro", 5_000), media("music", "music", 70_000)], [], {
    tracks: [
      Object.freeze({ track_id: "video", kind: "video" as const, role: "program_camera", locked: false, muted: false, solo: false, visible: true, clips: [clip("intro", "video", "intro", 0, 5, { transform: { scale: 1 }, transition_out: "crossfade" }), clip("camera-a", "video", "cam-a", 5, 35, { angle: "a", transform: { x: 0, y: 0, scale: 1 } }), clip("camera-b", "video", "cam-b", 35, 65, { angle: "b", transform: { x: 0.1, y: 0, scale: 0.9 }, transition: { kind: "crossfade", duration_sec: 0.5 } }), clip("outro", "video", "outro", 65, 70, { transition_in: "crossfade" })] }),
      Object.freeze({ track_id: "music", kind: "audio" as const, role: "music", locked: false, muted: false, solo: false, visible: true, clips: [clip("music-bed", "music", "music", 0, 70, { gain_db: -18, duck_under_dialogue: true })] }),
      Object.freeze({ track_id: "captions", kind: "caption" as const, role: "captions", locked: false, muted: false, solo: false, visible: true, clips: [derivedClip("caption-1", "captions", "caption", 5, 10, { text: "Welcome", speaker: "Host", style: "podcast" })] }),
      Object.freeze({ track_id: "graphics", kind: "graphic" as const, role: "lower_thirds", locked: false, muted: false, solo: false, visible: true, clips: [derivedClip("lower-third", "graphics", "graphic", 6, 12, { text: "Host", transform: { x: 0.08, y: 0.82, scale: 1 } })] }),
    ],
    captions: Object.freeze({ artifact_id: "captions:semantic", based_on_transcript_id: "transcript:1", stale: false }),
    packaging: Object.freeze({ intro_clip_id: "intro", outro_clip_id: "outro", thumbnail_asset_id: "thumb:semantic" }),
    audio_treatments: [Object.freeze({ treatment_id: "master-loudness", kind: "loudness", scope: Object.freeze({ kind: "program" }), bypassed: false, target_lufs: -16, true_peak_ceiling_dbtp: -1 }), Object.freeze({ treatment_id: "master-limiter", kind: "limiter", scope: Object.freeze({ kind: "program" }), bypassed: false, ceiling_dbtp: -1, release_ms: 100 })],
    automated_placements: [Object.freeze({ placement_id: "placement:lower-third", payload: Object.freeze({ start_sec: 6, end_sec: 12, x: 0.08, y: 0.82 }) })],
  }),
  linkedPodcast: build("fixture:linked-podcast", [media("linked-video", "program_video", 30_000), media("linked-audio", "program_audio", 30_000)], [], {
    tracks: [
      Object.freeze({ track_id: "video", kind: "video" as const, role: "program_video", locked: false, muted: false, solo: false, visible: true, clips: [Object.freeze({ ...clip("video-main", "video", "linked-video", 0, 20), linked_group_id: "av:1" }), clip("video-tail", "video", "linked-video", 20, 30)] }),
      Object.freeze({ track_id: "audio", kind: "audio" as const, role: "dialogue", locked: false, muted: false, solo: false, visible: true, clips: [Object.freeze({ ...clip("audio-main", "audio", "linked-audio", 0, 20), linked_group_id: "av:1" }), clip("audio-tail", "audio", "linked-audio", 20, 30)] }),
    ],
  }),
});
