import type { HammerMediaProvenance } from "./hammerMediaProvenance";

export type HammerCompositionTrackKind = "video" | "audio" | "caption" | "graphic";
export type HammerCompositionClipKind = "media" | "caption" | "graphic" | "transition";

export type HammerCompositionClipV2 = Readonly<{
  clip_id: string;
  track_id: string;
  kind: HammerCompositionClipKind;
  source_media_id: string | null;
  source_start_sec: number;
  source_end_sec: number;
  timeline_start_sec: number;
  timeline_end_sec: number;
  enabled: boolean;
  linked_group_id: string | null;
  payload: Readonly<Record<string, unknown>>;
}>;

export type HammerCompositionTrackV2 = Readonly<{
  track_id: string;
  kind: HammerCompositionTrackKind;
  role: string;
  locked: boolean;
  muted: boolean;
  solo: boolean;
  visible: boolean;
  clips: readonly HammerCompositionClipV2[];
}>;

export type HammerCompositionV2 = Readonly<{
  schema_version: 2;
  composition_id: string;
  workspace_id: string;
  workpiece_id: string;
  recording_revision_id: string;
  revision: number;
  parent_revision: number | null;
  created_at: string;
  updated_at: string;
  source_media: readonly HammerMediaProvenance[];
  tracks: readonly HammerCompositionTrackV2[];
  transcript: Readonly<{ transcript_id: string | null; corrections: readonly { segment_id: string; corrected_text: string }[] }>;
  captions: Readonly<{ artifact_id: string | null; based_on_transcript_id: string | null; stale: boolean }>;
  audio_treatments: readonly Readonly<Record<string, unknown>>[];
  packaging: Readonly<{ intro_clip_id: string | null; outro_clip_id: string | null; thumbnail_asset_id: string | null }>;
  history_head_id: string | null;
  fingerprint: string;
}>;

export type HammerCompositionCommand =
  | Readonly<{ type: "split_clip"; clip_id: string; at_sec: number }>
  | Readonly<{ type: "trim_clip"; clip_id: string; start_sec: number; end_sec: number }>
  | Readonly<{ type: "delete_media_range"; start_sec: number; end_sec: number; ripple: boolean }>
  | Readonly<{ type: "set_track_state"; track_id: string; locked?: boolean; muted?: boolean; solo?: boolean; visible?: boolean }>
  | Readonly<{ type: "correct_transcript"; segment_id: string; corrected_text: string }>
  | Readonly<{ type: "correct_caption"; clip_id: string; corrected_text: string }>
  | Readonly<{ type: "set_clip_payload"; clip_id: string; payload: Readonly<Record<string, unknown>> }>
  | Readonly<{ type: "set_audio_treatments"; treatments: readonly Readonly<Record<string, unknown>>[] }>
  | Readonly<{ type: "set_packaging"; intro_clip_id: string | null; outro_clip_id: string | null; thumbnail_asset_id: string | null }>;

export type HammerCompositionHistoryEntryV2 = Readonly<{
  entry_id: string;
  label: string;
  command: HammerCompositionCommand;
  before: HammerCompositionV2;
  after: HammerCompositionV2;
  created_at: string;
}>;

export type HammerCompositionHistoryV2 = Readonly<{
  schema_version: 2;
  base: HammerCompositionV2;
  entries: readonly HammerCompositionHistoryEntryV2[];
  head_index: number;
}>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function hammerStableFingerprint(value: unknown): string {
  const text = stable(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function withRevision(composition: HammerCompositionV2, patch: Omit<Partial<HammerCompositionV2>, "fingerprint">): HammerCompositionV2 {
  const next = { ...composition, ...patch, parent_revision: composition.revision, revision: composition.revision + 1, updated_at: new Date().toISOString(), fingerprint: "" };
  return Object.freeze({ ...next, fingerprint: hammerStableFingerprint({ ...next, fingerprint: undefined }) });
}

function mapClips(composition: HammerCompositionV2, mapper: (clip: HammerCompositionClipV2) => HammerCompositionClipV2 | readonly HammerCompositionClipV2[]): readonly HammerCompositionTrackV2[] {
  return composition.tracks.map((track) => Object.freeze({ ...track, clips: track.clips.flatMap(mapper) }));
}

export function applyHammerCompositionCommand(composition: HammerCompositionV2, command: HammerCompositionCommand): HammerCompositionV2 {
  if (command.type === "set_track_state") return withRevision(composition, { tracks: composition.tracks.map((track) => track.track_id === command.track_id ? Object.freeze({ ...track, ...command }) : track) });
  if (command.type === "correct_transcript") return withRevision(composition, { transcript: Object.freeze({ ...composition.transcript, corrections: [...composition.transcript.corrections.filter((row) => row.segment_id !== command.segment_id), { segment_id: command.segment_id, corrected_text: command.corrected_text }] }), captions: Object.freeze({ ...composition.captions, stale: true }) });
  if (command.type === "set_audio_treatments") return withRevision(composition, { audio_treatments: command.treatments });
  if (command.type === "set_packaging") return withRevision(composition, { packaging: Object.freeze({ ...command }) });
  if (command.type === "correct_caption" || command.type === "set_clip_payload") return withRevision(composition, { tracks: mapClips(composition, (clip) => clip.clip_id === command.clip_id ? Object.freeze({ ...clip, payload: command.type === "correct_caption" ? Object.freeze({ ...clip.payload, corrected_text: command.corrected_text }) : command.payload }) : clip) });
  if (command.type === "trim_clip") return withRevision(composition, { tracks: mapClips(composition, (clip) => clip.clip_id === command.clip_id ? Object.freeze({ ...clip, timeline_start_sec: command.start_sec, timeline_end_sec: command.end_sec }) : clip) });
  if (command.type === "split_clip") return withRevision(composition, { tracks: mapClips(composition, (clip) => clip.clip_id !== command.clip_id || command.at_sec <= clip.timeline_start_sec || command.at_sec >= clip.timeline_end_sec ? clip : [Object.freeze({ ...clip, clip_id: `${clip.clip_id}:a`, timeline_end_sec: command.at_sec, source_end_sec: clip.source_start_sec + (command.at_sec - clip.timeline_start_sec) }), Object.freeze({ ...clip, clip_id: `${clip.clip_id}:b`, timeline_start_sec: command.at_sec, source_start_sec: clip.source_start_sec + (command.at_sec - clip.timeline_start_sec) })]) });
  const duration = command.end_sec - command.start_sec;
  return withRevision(composition, { tracks: composition.tracks.map((track) => Object.freeze({ ...track, clips: track.clips.filter((clip) => clip.timeline_end_sec <= command.start_sec || clip.timeline_start_sec >= command.end_sec).map((clip) => command.ripple && clip.timeline_start_sec >= command.end_sec ? Object.freeze({ ...clip, timeline_start_sec: clip.timeline_start_sec - duration, timeline_end_sec: clip.timeline_end_sec - duration }) : clip) })) });
}

export function createHammerCompositionHistory(base: HammerCompositionV2): HammerCompositionHistoryV2 {
  return Object.freeze({ schema_version: 2, base, entries: [], head_index: -1 });
}

export function commitHammerCompositionCommand(history: HammerCompositionHistoryV2, command: HammerCompositionCommand, label: string): HammerCompositionHistoryV2 {
  const before = history.head_index >= 0 ? history.entries[history.head_index].after : history.base;
  const after = applyHammerCompositionCommand(before, command);
  const entries = [...history.entries.slice(0, history.head_index + 1), Object.freeze({ entry_id: `history:${after.revision}:${hammerStableFingerprint(command)}`, label, command, before, after, created_at: after.updated_at })];
  return Object.freeze({ ...history, entries, head_index: entries.length - 1 });
}

export function undoHammerComposition(history: HammerCompositionHistoryV2): HammerCompositionHistoryV2 {
  return Object.freeze({ ...history, head_index: Math.max(-1, history.head_index - 1) });
}

export function redoHammerComposition(history: HammerCompositionHistoryV2): HammerCompositionHistoryV2 {
  return Object.freeze({ ...history, head_index: Math.min(history.entries.length - 1, history.head_index + 1) });
}

export function readHammerCompositionAtHead(history: HammerCompositionHistoryV2): HammerCompositionV2 {
  return history.head_index < 0 ? history.base : history.entries[history.head_index].after;
}
