import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerPersistedAudioEdit, HammerPersistedEditorSession, HammerPersistedStructuredTranscript, HammerPersistedVisualPlacements } from "../persistence/hammerPersistenceContract";
import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import type { HammerStudioRackState } from "./hammerStudioRack";
import type { HammerHistoryDocumentV1 } from "./hammerWorkspaceHistory";

export const HAMMER_SHORT_PROJECTION_VERSION = "HammerShortProjectionV1" as const;

export interface HammerShortProjectionRange { start_sec: number; end_sec: number }
export interface HammerShortTimingInterval {
  segment_id: string;
  source_start_sec: number;
  source_end_sec: number;
  output_start_sec: number;
  output_end_sec: number;
}

export interface HammerShortProjectionInput {
  childWorkpieceId: string;
  childRevisionId: string;
  basisLockId: string;
  candidateId: string;
  projectedAt: string;
  envelope: HammerShortProjectionRange;
  core: HammerShortProjectionRange;
  transcript: readonly HammerTranscriptSegment[];
  structuredTranscript: HammerPersistedStructuredTranscript;
  timingMap: readonly HammerShortTimingInterval[];
  editorSession: HammerPersistedEditorSession;
  visualTimeline: HammerVisualTimelineState | null;
  visualPlacements: HammerPersistedVisualPlacements | null;
  audioEdit: HammerPersistedAudioEdit | null;
  studioRack: HammerStudioRackState;
}

export interface HammerShortProjectedArtifacts {
  schema_version: typeof HAMMER_SHORT_PROJECTION_VERSION;
  basis_lock_id: string;
  candidate_id: string;
  child_workpiece_id: string;
  child_revision_id: string;
  envelope_duration_sec: number;
  core_range: HammerShortProjectionRange;
  transcript: HammerPersistedStructuredTranscript;
  timing_map: { version: 1; intervals: HammerShortTimingInterval[] };
  editor_session: HammerPersistedEditorSession;
  visual_timeline: HammerVisualTimelineState | null;
  visual_placements: HammerPersistedVisualPlacements | null;
  audio_polish: { version: 1; audio_edit: HammerPersistedAudioEdit | null; studio_rack: HammerStudioRackState };
  history: HammerHistoryDocumentV1;
}

function finite(value: number, code: string): number {
  if (!Number.isFinite(value)) throw new Error(code);
  return value;
}

function overlap(start: number, end: number, envelope: HammerShortProjectionRange): HammerShortProjectionRange | null {
  const clippedStart = Math.max(start, envelope.start_sec);
  const clippedEnd = Math.min(end, envelope.end_sec);
  return clippedEnd > clippedStart ? { start_sec: clippedStart - envelope.start_sec, end_sec: clippedEnd - envelope.start_sec } : null;
}

function stableClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function projectHammerShortArtifacts(input: HammerShortProjectionInput): HammerShortProjectedArtifacts {
  const start = finite(input.envelope.start_sec, "hammer_short_envelope_invalid");
  const end = finite(input.envelope.end_sec, "hammer_short_envelope_invalid");
  if (start < 0 || end <= start || input.core.start_sec < start || input.core.end_sec > end || input.core.end_sec <= input.core.start_sec) {
    throw new Error("hammer_short_projection_range_invalid");
  }
  const duration = end - start;
  const retainedSegmentIds = new Set<string>();
  const timingBySegmentId = new Map(input.timingMap.map((interval) => [interval.segment_id, interval]));
  const segments = input.transcript.flatMap((segment) => {
    const timing = timingBySegmentId.get(segment.segment_id);
    if (!timing) return [];
    const range = overlap(timing.output_start_sec, timing.output_end_sec, input.envelope);
    if (!range) return [];
    retainedSegmentIds.add(segment.segment_id);
    return [{ ...stableClone(segment), start_sec: range.start_sec, end_sec: range.end_sec }];
  });
  const intervals = input.timingMap.flatMap((interval) => {
    const range = overlap(interval.output_start_sec, interval.output_end_sec, input.envelope);
    if (!range) return [];
    const leftTrim = Math.max(0, start - interval.output_start_sec);
    const rightTrim = Math.max(0, interval.output_end_sec - end);
    return [{
      ...stableClone(interval),
      source_start_sec: interval.source_start_sec + leftTrim,
      source_end_sec: interval.source_end_sec - rightTrim,
      output_start_sec: range.start_sec,
      output_end_sec: range.end_sec,
    }];
  });
  const clips = input.visualTimeline?.clips.flatMap((clip) => {
    const range = overlap(clip.start_sec, clip.end_sec, input.envelope);
    if (!range) return [];
    const cloned = stableClone(clip);
    cloned.start_sec = range.start_sec;
    cloned.end_sec = range.end_sec;
    cloned.anchor_hint.matched_segment_ids = cloned.anchor_hint.matched_segment_ids.filter((id) => retainedSegmentIds.has(id));
    if (cloned.anchor_hint.anchor_segment_id && !retainedSegmentIds.has(cloned.anchor_hint.anchor_segment_id)) cloned.anchor_hint.anchor_segment_id = null;
    cloned.semantic_anchor.transcript.segment_ids = cloned.semantic_anchor.transcript.segment_ids.filter((id) => retainedSegmentIds.has(id));
    if (cloned.semantic_anchor.transcript.start_sec != null) cloned.semantic_anchor.transcript.start_sec = Math.max(0, cloned.semantic_anchor.transcript.start_sec - start);
    if (cloned.semantic_anchor.transcript.end_sec != null) cloned.semantic_anchor.transcript.end_sec = Math.min(duration, cloned.semantic_anchor.transcript.end_sec - start);
    return [cloned];
  }) ?? [];
  const usedAssetIds = new Set(clips.map((clip) => clip.asset_id).filter((id): id is string => Boolean(id)));
  const visualTimeline = input.visualTimeline ? {
    ...stableClone(input.visualTimeline),
    selected_clip_id: null,
    clips,
    assets: input.visualTimeline.assets.filter((asset) => usedAssetIds.has(asset.asset_id)).map(stableClone),
    lanes: input.visualTimeline.lanes.map((lane) => ({ ...stableClone(lane), clip_ids: lane.clip_ids.filter((id) => clips.some((clip) => clip.clip_id === id)) })),
    updated_at: input.projectedAt,
  } : null;
  const placements = input.visualPlacements?.placements.flatMap((placement) => {
    const range = overlap(placement.start_sec, placement.end_sec, input.envelope);
    if (!range) return [];
    const cloned = stableClone(placement);
    cloned.start_sec = range.start_sec;
    cloned.end_sec = range.end_sec;
    cloned.matched_segment_ids = cloned.matched_segment_ids.filter((id) => retainedSegmentIds.has(id));
    if (!retainedSegmentIds.has(cloned.anchor_segment_id)) cloned.anchor_segment_id = cloned.matched_segment_ids[0] ?? cloned.anchor_segment_id;
    if (cloned.alignment) {
      cloned.alignment.transcript_start_sec = Math.max(0, cloned.alignment.transcript_start_sec - start);
      cloned.alignment.transcript_end_sec = Math.min(duration, cloned.alignment.transcript_end_sec - start);
    }
    return [cloned];
  }) ?? [];
  const audioEdit = input.audioEdit ? {
    ...stableClone(input.audioEdit),
    operations: input.audioEdit.operations.flatMap((operation) => {
      const range = overlap(operation.start_sec, operation.end_sec, input.envelope);
      return range ? [{ ...stableClone(operation), start_sec: range.start_sec, end_sec: range.end_sec }] : [];
    }),
  } : null;
  const history: HammerHistoryDocumentV1 = {
    version: 1,
    workpieceId: input.childWorkpieceId,
    sessionId: `short-projection:${input.candidateId}`,
    baseRevisionId: input.childRevisionId,
    createdAt: input.projectedAt,
    updatedAt: input.projectedAt,
    headEntryId: null,
    entries: [], checkpoints: [], undoStack: [], redoStack: [],
    metadata: { lastKnownSelectionSegmentId: null, lastKnownTool: "shorts" },
  };
  return {
    schema_version: HAMMER_SHORT_PROJECTION_VERSION,
    basis_lock_id: input.basisLockId,
    candidate_id: input.candidateId,
    child_workpiece_id: input.childWorkpieceId,
    child_revision_id: input.childRevisionId,
    envelope_duration_sec: duration,
    core_range: { start_sec: input.core.start_sec - start, end_sec: input.core.end_sec - start },
    transcript: {
      ...stableClone(input.structuredTranscript),
      transcript_id: `short:${input.candidateId}`,
      prepared_at: input.projectedAt,
      segments,
      derived_text_layers: undefined,
      subtitle_outputs: undefined,
    },
    timing_map: { version: 1, intervals },
    editor_session: {
      ...stableClone(input.editorSession),
      session_id: `short-projection:${input.candidateId}`,
      selected_segment_id: null,
      selected_overlay_row_id: null,
      last_opened_at: input.projectedAt,
    },
    visual_timeline: visualTimeline,
    visual_placements: input.visualPlacements ? { ...stableClone(input.visualPlacements), placements } : null,
    audio_polish: { version: 1, audio_edit: audioEdit, studio_rack: stableClone(input.studioRack) },
    history,
  };
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("hammer_short_projection_non_finite");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
}

export async function fingerprintHammerShortProjection(value: HammerShortProjectedArtifacts): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
