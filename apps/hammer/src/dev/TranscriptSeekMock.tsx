import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, JSX } from "react";
import { useLocation } from "react-router-dom";
import type {
  MediaRef,
  ResolveMediaResult,
  WorkspaceMediaMapping,
} from "../../../../packages/contracts/hammer/media-resolver.contract";
import type {
  HammerEditPlan,
  HammerPreviewMode,
} from "../../../../packages/contracts/hammer/edit-plan.contract";
import type {
  HammerDeleteInstruction,
  HammerEditInstruction,
  HammerMergeInstruction,
  HammerMuteInstruction,
  HammerSplitInstruction,
  HammerTrimInstruction,
} from "../../../../packages/contracts/hammer/edit-instruction.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import {
  buildDefaultTrimInstruction,
  buildInstructionIndex,
  buildPlaybackRanges,
  buildTranscriptOverlayRows,
  findPlaybackRangeByTime,
  MIN_SEGMENT_DURATION_SEC,
  PREVIEW_EPSILON_SEC,
  resolvePreviewBoundaryAction,
  resolveSeekTargetForRow,
  resolveSplitAtSec,
} from "../lib/transcriptPreview";
import type {
  PreviewSkipReason,
  TranscriptOverlayRow,
  TranscriptPlaybackRange,
} from "../lib/transcriptPreview";
import { toMediaBadgeViewModel } from "../media/mediaBadgeViewModel";
import { V1HammerMediaResolver } from "../media/resolveMedia";
import { loadWorkspaceMapping } from "../media/workspaceMapping";
import { DEFAULT_TRANSCRIPT_FIXTURE_ID, getDevTranscriptSegments } from "./transcriptFixtures";

type PreviewQuery = {
  workspaceId: string;
  mediaId: string;
  mediaLocalRelpath: string;
  mediaRootAbs: string | null;
  transcriptFixtureId: string;
  transcriptJson: string | null;
};

type PreviewSkipEvent = {
  reason: PreviewSkipReason;
  from_row_id: string | null;
  to_row_id: string | null;
};

type EditPlanMetaState = {
  editPlanId: string;
  createdAt: string;
  updatedAt: string;
  baselineSignature: string;
  lastSignature: string;
};

type SessionSourceMode = "dev-tone" | "mapped-media" | "tongs-media";
type EditPlanStatus = "clean" | "dirty";

type HammerSessionState = {
  sessionId: string;
  transcriptLoaded: boolean;
  sourceMode: SessionSourceMode;
  previewMode: HammerPreviewMode;
  editPlanStatus: EditPlanStatus;
};

const DEFAULT_WORKSPACE_ID = "ws_demo";
const DEFAULT_MEDIA_ID = "media_local_01";
const DEFAULT_MEDIA_RELPATH = "recordings/episode014.mp4";
const DEFAULT_PREVIEW_MODE: HammerPreviewMode = "edit-aware";
const HAMMER_EDIT_PLAN_VERSION = "1";
const HAMMER_DEV_TOOL_VERSION = "forge-v1.2.0/hammer-dev";
const FALLBACK_DURATION_SEC = 32;
const DEV_AUDIO_SAMPLE_RATE = 8_000;
const UNKNOWN_SPEAKER = "UNK";

const ROOT_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(340px, 0.95fr) minmax(420px, 1.05fr)",
  gap: 14,
  minHeight: "calc(100vh - 138px)",
};

const PANEL_STYLE: CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.28)",
  borderRadius: 12,
  background: "rgba(15, 23, 38, 0.74)",
  display: "grid",
  alignContent: "start",
  minHeight: 0,
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function formatClock(totalSec: number): string {
  const sec = Math.floor(totalSec);
  const mm = Math.floor(sec / 60);
  const ss = sec % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function formatInstructionDetail(instruction: HammerEditInstruction): string | null {
  if (instruction.type === "split") {
    return `@ ${instruction.split_at_sec.toFixed(2)}s`;
  }
  if (instruction.type === "trim") {
    const trimStart = instruction.trim_start_sec != null
      ? instruction.trim_start_sec.toFixed(2)
      : "--";
    const trimEnd = instruction.trim_end_sec != null
      ? instruction.trim_end_sec.toFixed(2)
      : "--";
    return `@ ${trimStart}s-${trimEnd}s`;
  }
  return null;
}

function formatInstructionTarget(instruction: HammerEditInstruction): string {
  if (instruction.type === "merge") {
    return `${instruction.segment_id} + ${instruction.merge_with_segment_id}`;
  }
  return instruction.segment_id;
}

function formatOverlayRowLabel(row: TranscriptOverlayRow | null): string {
  if (!row) return "none";
  const primaryBlock = row.blocks[0] ?? null;
  const blockLabel = primaryBlock?.label ? ` ${primaryBlock.label}` : "";
  if (row.structure === "merge" && row.next_segment_id) {
    return `${row.speaker} ${row.anchor_segment_id} + ${row.next_segment_id}`;
  }
  return `${row.speaker}${blockLabel}`.trim();
}

function formatPlaybackRangeLabel(range: TranscriptPlaybackRange | null): string {
  if (!range) return "none";
  return range.row_id;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function createDevAudioWavBlob(durationSec: number): Blob {
  const sampleRate = DEV_AUDIO_SAMPLE_RATE;
  const sampleCount = Math.max(1, Math.ceil(durationSec * sampleRate));
  const dataSize = sampleCount * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const timeSec = sampleIndex / sampleRate;
    const secondPosition = timeSec % 1;
    const pulse = secondPosition < 0.08
      ? Math.sin((Math.PI * 2 * 220) * timeSec) * 0.12
      : 0;
    view.setInt16(44 + (sampleIndex * 2), Math.round(pulse * 32767), true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function readTrimmed(params: URLSearchParams, key: string): string | null {
  const raw = params.get(key);
  if (!raw) return null;
  const next = raw.trim();
  return next.length ? next : null;
}

function readPreviewQuery(search: string): PreviewQuery {
  const params = new URLSearchParams(search);
  const workspaceId = readTrimmed(params, "workspace_id")
    ?? readTrimmed(params, "workspaceId")
    ?? readTrimmed(params, "workspace")
    ?? DEFAULT_WORKSPACE_ID;
  const mediaId = readTrimmed(params, "media_id")
    ?? readTrimmed(params, "mediaId")
    ?? DEFAULT_MEDIA_ID;
  const mediaLocalRelpath = readTrimmed(params, "media_local_relpath")
    ?? readTrimmed(params, "media_relpath")
    ?? readTrimmed(params, "local_relpath")
    ?? DEFAULT_MEDIA_RELPATH;
  const mediaRootAbs = readTrimmed(params, "media_root_abs")
    ?? readTrimmed(params, "local_root_abs")
    ?? readTrimmed(params, "media_root");
  const transcriptFixtureId = readTrimmed(params, "transcript_fixture")
    ?? readTrimmed(params, "transcriptFixture")
    ?? DEFAULT_TRANSCRIPT_FIXTURE_ID;
  const transcriptJson = readTrimmed(params, "transcript_json")
    ?? readTrimmed(params, "transcript");
  return {
    workspaceId,
    mediaId,
    mediaLocalRelpath,
    mediaRootAbs,
    transcriptFixtureId,
    transcriptJson,
  };
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeTranscriptSegment(input: unknown, index: number): HammerTranscriptSegment | null {
  const row = readRecord(input);
  if (!row) return null;

  const startSec = readNumber(row.start_sec);
  if (startSec == null || startSec < 0) return null;
  const rawEndSec = readNumber(row.end_sec);
  const endSec = rawEndSec == null || rawEndSec <= startSec
    ? startSec + MIN_SEGMENT_DURATION_SEC
    : rawEndSec;

  const text = readString(row.text);
  if (!text) return null;

  const speaker = readString(row.speaker) ?? UNKNOWN_SPEAKER;
  const segmentId = readString(row.segment_id) ?? `seg_${index + 1}`;

  return {
    segment_id: segmentId,
    start_sec: startSec,
    end_sec: endSec,
    speaker,
    text,
  };
}

function parseTranscriptSegmentsJson(raw: string): HammerTranscriptSegment[] {
  const tryParse = (source: string): unknown => JSON.parse(source);
  let parsed: unknown;
  try {
    parsed = tryParse(raw);
  } catch {
    parsed = tryParse(decodeURIComponent(raw));
  }

  const parsedRecord = readRecord(parsed);
  const maybeSegments = Array.isArray(parsed)
    ? parsed
    : (parsedRecord && Array.isArray(parsedRecord.segments) ? parsedRecord.segments : null);
  if (!maybeSegments) return [];

  const normalized = maybeSegments
    .map((row, index) => normalizeTranscriptSegment(row, index))
    .filter((row): row is HammerTranscriptSegment => Boolean(row))
    .sort((a, b) => a.start_sec - b.start_sec);

  return normalized;
}

type TranscriptLoadResult = {
  segments: HammerTranscriptSegment[];
  sourceLabel: string;
  error: string | null;
};

function loadTranscriptFromQuery(query: PreviewQuery): TranscriptLoadResult {
  if (query.transcriptJson) {
    try {
      const fromQuery = parseTranscriptSegmentsJson(query.transcriptJson);
      if (fromQuery.length > 0) {
        return {
          segments: fromQuery,
          sourceLabel: "query:transcript_json",
          error: null,
        };
      }
      return {
        segments: getDevTranscriptSegments(query.transcriptFixtureId),
        sourceLabel: `fixture:${query.transcriptFixtureId}`,
        error: "transcript_json did not contain valid segments. Falling back to fixture.",
      };
    } catch (error) {
      return {
        segments: getDevTranscriptSegments(query.transcriptFixtureId),
        sourceLabel: `fixture:${query.transcriptFixtureId}`,
        error: toErrorMessage(error, "Failed to parse transcript_json. Falling back to fixture."),
      };
    }
  }

  return {
    segments: getDevTranscriptSegments(query.transcriptFixtureId),
    sourceLabel: `fixture:${query.transcriptFixtureId}`,
    error: null,
  };
}

async function resolveWorkspace(
  workspaceId: string,
  mediaRootAbs: string | null,
): Promise<WorkspaceMediaMapping | null> {
  if (mediaRootAbs) {
    return {
      workspace_id: workspaceId,
      local_root_abs: mediaRootAbs,
    };
  }
  return loadWorkspaceMapping(workspaceId);
}

function toBrowserVideoSrc(playableUri: string): string {
  const value = playableUri.trim();
  if (!value) return "";
  if (/^(https?:|blob:|data:)/i.test(value)) return value;
  if (value.startsWith("/@fs/")) return value;
  if (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("/")) {
    const normalized = value.replace(/\\/g, "/");
    return `/@fs/${encodeURI(normalized)}`;
  }
  return value;
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function createEntityId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function createInstructionId(): string {
  return createEntityId("ins");
}

function cloneEditInstructions(instructions: HammerEditInstruction[]): HammerEditInstruction[] {
  return instructions.map((instruction) => ({ ...instruction }));
}

function createEditPlanSignature(
  sourceTranscriptId: string,
  previewMode: HammerPreviewMode,
  instructions: HammerEditInstruction[],
): string {
  return JSON.stringify({
    source_transcript_id: sourceTranscriptId,
    preview_mode: previewMode,
    instructions,
  });
}

function createEditPlanMeta(
  sourceTranscriptId: string,
  previewMode: HammerPreviewMode,
  instructions: HammerEditInstruction[],
): EditPlanMetaState {
  const now = new Date().toISOString();
  const signature = createEditPlanSignature(sourceTranscriptId, previewMode, instructions);
  return {
    editPlanId: createEntityId("plan"),
    createdAt: now,
    updatedAt: now,
    baselineSignature: signature,
    lastSignature: signature,
  };
}

function readInstruction(input: unknown): HammerEditInstruction | null {
  const row = readRecord(input);
  if (!row) return null;

  const instructionId = readString(row.instruction_id);
  const segmentId = readString(row.segment_id);
  const type = readString(row.type);
  const createdAt = readString(row.created_at);
  if (!instructionId || !segmentId || !type || !createdAt) return null;

  switch (type) {
    case "delete":
      return {
        instruction_id: instructionId,
        segment_id: segmentId,
        type,
        created_at: createdAt,
      };
    case "mute":
      return {
        instruction_id: instructionId,
        segment_id: segmentId,
        type,
        created_at: createdAt,
      };
    case "trim": {
      const trimStartSec = readNumber(row.trim_start_sec);
      const trimEndSec = readNumber(row.trim_end_sec);
      return {
        instruction_id: instructionId,
        segment_id: segmentId,
        type,
        trim_start_sec: trimStartSec ?? undefined,
        trim_end_sec: trimEndSec ?? undefined,
        created_at: createdAt,
      };
    }
    case "split": {
      const splitAtSec = readNumber(row.split_at_sec);
      if (splitAtSec == null) return null;
      return {
        instruction_id: instructionId,
        segment_id: segmentId,
        type,
        split_at_sec: splitAtSec,
        created_at: createdAt,
      };
    }
    case "merge": {
      const mergeWithSegmentId = readString(row.merge_with_segment_id);
      if (!mergeWithSegmentId) return null;
      return {
        instruction_id: instructionId,
        segment_id: segmentId,
        type,
        merge_with_segment_id: mergeWithSegmentId,
        created_at: createdAt,
      };
    }
    default:
      return null;
  }
}

function parseEditPlanJson(raw: string): { plan: HammerEditPlan | null; error: string | null } {
  if (!raw.trim()) {
    return {
      plan: null,
      error: "Edit plan JSON is empty.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      plan: null,
      error: toErrorMessage(error, "Failed to parse edit plan JSON."),
    };
  }

  const record = readRecord(parsed);
  if (!record) {
    return {
      plan: null,
      error: "Edit plan must be a JSON object.",
    };
  }

  const editPlanId = readString(record.edit_plan_id);
  const version = readString(record.version);
  const createdAt = readString(record.created_at);
  const updatedAt = readString(record.updated_at);
  const sourceTranscriptId = readString(record.source_transcript_id);
  const previewMode = readString(record.preview_mode);
  const toolVersion = readString(record.tool_version);
  const workspaceId = readString(record.workspace_id);
  const workpieceId = readString(record.workpiece_id);
  const sessionId = readString(record.session_id);
  const instructionsInput = Array.isArray(record.instructions) ? record.instructions : null;

  if (!editPlanId || !version || !createdAt || !updatedAt || !sourceTranscriptId || !instructionsInput) {
    return {
      plan: null,
      error: "Edit plan is missing one or more required fields.",
    };
  }

  if (previewMode && previewMode !== "raw" && previewMode !== "edit-aware") {
    return {
      plan: null,
      error: `Unsupported preview_mode: ${previewMode}.`,
    };
  }

  const instructions: HammerEditInstruction[] = [];
  for (const input of instructionsInput) {
    const instruction = readInstruction(input);
    if (!instruction) {
      return {
        plan: null,
        error: "Edit plan contains an invalid instruction.",
      };
    }
    instructions.push(instruction);
  }

  return {
    plan: {
      edit_plan_id: editPlanId,
      version,
      created_at: createdAt,
      updated_at: updatedAt,
      source_transcript_id: sourceTranscriptId,
      preview_mode: previewMode as HammerPreviewMode | undefined,
      tool_version: toolVersion ?? undefined,
      workspace_id: workspaceId ?? undefined,
      workpiece_id: workpieceId ?? undefined,
      session_id: sessionId ?? undefined,
      instructions,
    },
    error: null,
  };
}

export default function TranscriptSeekMock(): JSX.Element {
  const location = useLocation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const activeRowRef = useRef<HTMLDivElement | null>(null);
  const resolver = useMemo(() => new V1HammerMediaResolver(), []);
  const query = useMemo(
    () => readPreviewQuery(location.search),
    [location.search],
  );
  const transcriptLoad = useMemo(
    () => loadTranscriptFromQuery(query),
    [query],
  );
  const transcriptSegments = transcriptLoad.segments;
  const firstSegment = transcriptSegments[0] ?? null;
  const transcriptDurationSec = useMemo(
    () => transcriptSegments.reduce(
      (maxEndSec, segment) => Math.max(maxEndSec, segment.end_sec),
      FALLBACK_DURATION_SEC,
    ),
    [transcriptSegments],
  );
  const mediaRef = useMemo<MediaRef>(
    () => ({
      media_id: query.mediaId,
      kind: "recording_video",
      source_hint: "local",
      local_relpath: query.mediaLocalRelpath,
      duration_ms: FALLBACK_DURATION_SEC * 1000,
    }),
    [query.mediaId, query.mediaLocalRelpath],
  );
  const [resolveResult, setResolveResult] = useState<ResolveMediaResult | null>(null);
  const [resolving, setResolving] = useState(true);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [durationSec, setDurationSec] = useState(FALLBACK_DURATION_SEC);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeOverlayRowId, setActiveOverlayRowId] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(
    firstSegment?.segment_id ?? null,
  );
  const [selectedOverlayRowId, setSelectedOverlayRowId] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [lastPreviewSkip, setLastPreviewSkip] = useState<PreviewSkipEvent | null>(null);
  const [editInstructions, setEditInstructions] = useState<HammerEditInstruction[]>([]);
  const [devAudioSrc, setDevAudioSrc] = useState<string | null>(null);
  const [preferDevAudioFallback, setPreferDevAudioFallback] = useState(false);
  const [previewMode, setPreviewMode] = useState<HammerPreviewMode>(DEFAULT_PREVIEW_MODE);
  const [sessionId, setSessionId] = useState(() => createEntityId("session"));
  const [editPlanMeta, setEditPlanMeta] = useState<EditPlanMetaState>(() => (
    createEditPlanMeta(transcriptLoad.sourceLabel, DEFAULT_PREVIEW_MODE, [])
  ));
  const [editPlanJsonDraft, setEditPlanJsonDraft] = useState("");
  const [editPlanFeedback, setEditPlanFeedback] = useState<string | null>(null);
  const [editPlanFeedbackTone, setEditPlanFeedbackTone] = useState<"neutral" | "success" | "warning">("neutral");

  useEffect(() => {
    let active = true;
    setResolving(true);
    setResolveError(null);
    setResolveResult(null);

    void resolveWorkspace(query.workspaceId, query.mediaRootAbs)
      .then(async (workspaceMapping) => {
        const result = await resolver.resolveMedia(workspaceMapping, mediaRef);
        if (!active) return;
        setResolveResult(result);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setResolveError(toErrorMessage(error, "Failed to resolve media."));
      })
      .finally(() => {
        if (!active) return;
        setResolving(false);
      });

    return () => {
      active = false;
    };
  }, [mediaRef, query.mediaRootAbs, query.workspaceId, resolver]);

  const badgeVm = useMemo(
    () => (resolveResult ? toMediaBadgeViewModel(resolveResult, true) : null),
    [resolveResult],
  );

  const resolvedPlayableUri = resolveResult?.status === "ok" ? resolveResult.playable_uri : null;
  const resolvedMediaSrc = useMemo(
    () => (resolvedPlayableUri ? toBrowserVideoSrc(resolvedPlayableUri) : null),
    [resolvedPlayableUri],
  );
  const playbackSrc = useMemo(
    () => ((preferDevAudioFallback || !resolvedMediaSrc) ? devAudioSrc : resolvedMediaSrc),
    [devAudioSrc, preferDevAudioFallback, resolvedMediaSrc],
  );
  const playbackSourceLabel = useMemo(() => {
    if (!playbackSrc) return "none";
    if (preferDevAudioFallback || !resolvedMediaSrc) return "dev-tone";
    return "mapped-media";
  }, [playbackSrc, preferDevAudioFallback, resolvedMediaSrc]);

  useEffect(() => {
    const blob = createDevAudioWavBlob(transcriptDurationSec);
    const nextUrl = URL.createObjectURL(blob);
    setDevAudioSrc(nextUrl);
    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [transcriptDurationSec]);

  useEffect(() => {
    setCurrentTimeSec(0);
    setActiveOverlayRowId(null);
    setSelectedSegmentId(firstSegment?.segment_id ?? null);
    setSelectedOverlayRowId(null);
    setDurationSec(FALLBACK_DURATION_SEC);
    setIsPlaying(false);
    setPlaybackError(null);
    setLastPreviewSkip(null);
    setPreferDevAudioFallback(false);
  }, [firstSegment?.segment_id, resolvedMediaSrc]);

  useEffect(() => {
    setEditInstructions([]);
    setPreviewMode(DEFAULT_PREVIEW_MODE);
    setSessionId(createEntityId("session"));
    setEditPlanMeta(createEditPlanMeta(transcriptLoad.sourceLabel, DEFAULT_PREVIEW_MODE, []));
    setEditPlanJsonDraft("");
    setEditPlanFeedback(null);
    setEditPlanFeedbackTone("neutral");
  }, [mediaRef.media_id, transcriptLoad.sourceLabel]);

  useEffect(() => {
    if (previewMode === "raw" || editInstructions.length === 0) {
      setLastPreviewSkip(null);
    }
  }, [editInstructions.length, previewMode]);

  const instructionIndex = useMemo(
    () => buildInstructionIndex(editInstructions),
    [editInstructions],
  );

  const previewInstructions = useMemo(
    () => (previewMode === "edit-aware" ? editInstructions : []),
    [editInstructions, previewMode],
  );

  const previewInstructionIndex = useMemo(
    () => buildInstructionIndex(previewInstructions),
    [previewInstructions],
  );

  const segmentById = useMemo(
    () => new Map(transcriptSegments.map((segment) => [segment.segment_id, segment])),
    [transcriptSegments],
  );

  const segmentIndexById = useMemo(
    () => new Map(transcriptSegments.map((segment, index) => [segment.segment_id, index])),
    [transcriptSegments],
  );

  const selectedSegment = useMemo(
    () => transcriptSegments.find((segment) => segment.segment_id === selectedSegmentId) ?? null,
    [selectedSegmentId, transcriptSegments],
  );

  const selectedNextSegment = useMemo(() => {
    if (!selectedSegment) return null;
    const index = segmentIndexById.get(selectedSegment.segment_id);
    if (index == null) return null;
    return transcriptSegments[index + 1] ?? null;
  }, [selectedSegment, segmentIndexById, transcriptSegments]);

  const overlayRows = useMemo(
    () => buildTranscriptOverlayRows(transcriptSegments, previewInstructionIndex),
    [previewInstructionIndex, transcriptSegments],
  );

  const playbackRanges = useMemo(
    () => buildPlaybackRanges(overlayRows, segmentById, previewInstructionIndex),
    [overlayRows, previewInstructionIndex, segmentById],
  );

  const rawActivePlaybackRange = useMemo(
    () => findPlaybackRangeByTime(playbackRanges, currentTimeSec, "raw"),
    [currentTimeSec, playbackRanges],
  );

  const activePlayableRange = useMemo(
    () => findPlaybackRangeByTime(playbackRanges, currentTimeSec, "playable"),
    [currentTimeSec, playbackRanges],
  );

  useEffect(() => {
    const nextActiveOverlayRowId = activePlayableRange?.row_id ?? null;
    if (nextActiveOverlayRowId !== activeOverlayRowId) {
      setActiveOverlayRowId(nextActiveOverlayRowId);
    }
  }, [activeOverlayRowId, activePlayableRange]);

  useEffect(() => {
    if (!overlayRows.length) {
      setSelectedOverlayRowId(null);
      return;
    }

    setSelectedOverlayRowId((currentSelectedOverlayRowId) => {
      if (
        currentSelectedOverlayRowId
        && overlayRows.some((row) => row.row_id === currentSelectedOverlayRowId)
      ) {
        return currentSelectedOverlayRowId;
      }

      if (selectedSegmentId) {
        const matchingRow = overlayRows.find((row) => row.anchor_segment_id === selectedSegmentId);
        if (matchingRow) return matchingRow.row_id;
      }

      return overlayRows[0]?.row_id ?? null;
    });
  }, [overlayRows, selectedSegmentId]);

  const effectiveDurationSec = durationSec > 0 ? durationSec : FALLBACK_DURATION_SEC;
  const progressPercent = useMemo(
    () => clamp((currentTimeSec / effectiveDurationSec) * 100, 0, 100),
    [currentTimeSec, effectiveDurationSec],
  );

  const canControlAudio = Boolean(playbackSrc);
  const canMergeSelected = Boolean(
    selectedSegment
    && selectedNextSegment
    && selectedNextSegment.speaker === selectedSegment.speaker,
  );
  const transcriptSourceId = transcriptLoad.sourceLabel;
  const currentEditPlanSignature = useMemo(
    () => createEditPlanSignature(transcriptSourceId, previewMode, editInstructions),
    [editInstructions, previewMode, transcriptSourceId],
  );
  const editPlanStatus: EditPlanStatus = currentEditPlanSignature === editPlanMeta.baselineSignature
    ? "clean"
    : "dirty";
  const sourceMode: SessionSourceMode = resolvedMediaSrc && !preferDevAudioFallback
    ? "mapped-media"
    : "dev-tone";
  const sessionState = useMemo<HammerSessionState>(
    () => ({
      sessionId,
      transcriptLoaded: transcriptSegments.length > 0,
      sourceMode,
      previewMode,
      editPlanStatus,
    }),
    [editPlanStatus, previewMode, sessionId, sourceMode, transcriptSegments.length],
  );
  const currentEditPlan = useMemo<HammerEditPlan>(
    () => ({
      edit_plan_id: editPlanMeta.editPlanId,
      version: HAMMER_EDIT_PLAN_VERSION,
      created_at: editPlanMeta.createdAt,
      updated_at: editPlanMeta.updatedAt,
      source_transcript_id: transcriptSourceId,
      preview_mode: previewMode,
      tool_version: HAMMER_DEV_TOOL_VERSION,
      workspace_id: query.workspaceId,
      session_id: sessionId,
      instructions: cloneEditInstructions(editInstructions),
    }),
    [editInstructions, editPlanMeta.createdAt, editPlanMeta.editPlanId, editPlanMeta.updatedAt, previewMode, query.workspaceId, sessionId, transcriptSourceId],
  );

  useEffect(() => {
    setEditPlanMeta((currentMeta) => {
      if (currentMeta.lastSignature === currentEditPlanSignature) {
        return currentMeta;
      }
      return {
        ...currentMeta,
        updatedAt: new Date().toISOString(),
        lastSignature: currentEditPlanSignature,
      };
    });
  }, [currentEditPlanSignature]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextAction = resolvePreviewBoundaryAction(
      rawActivePlaybackRange,
      playbackRanges,
      currentTimeSec,
      effectiveDurationSec,
    );
    if (nextAction.kind === "none" || !rawActivePlaybackRange) {
      return;
    }

    if (nextAction.kind === "seek") {
      audio.currentTime = nextAction.time_sec;
      setCurrentTimeSec(nextAction.time_sec);
      setLastPreviewSkip({
        reason: nextAction.reason,
        from_row_id: rawActivePlaybackRange.row_id,
        to_row_id: nextAction.to_row_id,
      });
      return;
    }

    audio.pause();
    audio.currentTime = nextAction.time_sec;
    setCurrentTimeSec(nextAction.time_sec);
    setIsPlaying(false);
    setLastPreviewSkip({
      reason: nextAction.reason,
      from_row_id: rawActivePlaybackRange.row_id,
      to_row_id: null,
    });
  }, [currentTimeSec, effectiveDurationSec, playbackRanges, rawActivePlaybackRange]);

  const selectedOverlayRow = useMemo(
    () => (
      selectedOverlayRowId
        ? overlayRows.find((row) => row.row_id === selectedOverlayRowId) ?? null
        : null
    ),
    [overlayRows, selectedOverlayRowId],
  );

  const activeOverlayRow = useMemo(
    () => (
      activeOverlayRowId
        ? overlayRows.find((row) => row.row_id === activeOverlayRowId) ?? null
        : null
    ),
    [activeOverlayRowId, overlayRows],
  );

  const selectedSegmentDeleteInstruction = useMemo(
    () => (selectedSegment ? instructionIndex.deleteBySegmentId.get(selectedSegment.segment_id) ?? null : null),
    [instructionIndex, selectedSegment],
  );

  const selectedSegmentMuteInstruction = useMemo(
    () => (selectedSegment ? instructionIndex.muteBySegmentId.get(selectedSegment.segment_id) ?? null : null),
    [instructionIndex, selectedSegment],
  );

  const selectedSegmentTrimInstruction = useMemo(
    () => (selectedSegment ? instructionIndex.trimBySegmentId.get(selectedSegment.segment_id) ?? null : null),
    [instructionIndex, selectedSegment],
  );

  const selectedSegmentSplitInstruction = useMemo(
    () => (selectedSegment ? instructionIndex.splitBySegmentId.get(selectedSegment.segment_id) ?? null : null),
    [instructionIndex, selectedSegment],
  );

  const selectedSegmentMergeInstruction = useMemo(
    () => (selectedSegment ? instructionIndex.mergeBySegmentId.get(selectedSegment.segment_id) ?? null : null),
    [instructionIndex, selectedSegment],
  );

  useEffect(() => {
    const container = transcriptScrollContainerRef.current;
    const activeRowElement = activeRowRef.current;
    if (!container || !activeRowElement || !activeOverlayRowId) return;

    const centeredTop = activeRowElement.offsetTop - (container.clientHeight / 2) + (activeRowElement.clientHeight / 2);
    const boundedTop = clamp(
      centeredTop,
      0,
      Math.max(container.scrollHeight - container.clientHeight, 0),
    );
    container.scrollTo({
      top: boundedTop,
      behavior: "smooth",
    });
  }, [activeOverlayRowId]);

  async function onTogglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch (error) {
        setPlaybackError(toErrorMessage(error, "Playback failed."));
      }
      return;
    }
    audio.pause();
  }

  function seekTo(nextSec: number, selectedRowId?: string, selectedSegmentRowId?: string) {
    const bounded = clamp(nextSec, 0, effectiveDurationSec);
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = bounded;
    }
    setCurrentTimeSec(bounded);
    if (selectedRowId) setSelectedOverlayRowId(selectedRowId);
    if (selectedSegmentRowId) setSelectedSegmentId(selectedSegmentRowId);
  }

  function seekToRow(row: TranscriptOverlayRow) {
    const playbackRange = playbackRanges.find((range) => range.row_id === row.row_id) ?? null;
    if (!playbackRange) {
      seekTo(row.start_sec, row.row_id, row.anchor_segment_id);
      return;
    }

    const resolvedSeekTarget = resolveSeekTargetForRow(playbackRange, playbackRanges);
    if (resolvedSeekTarget.timeSec == null) {
      const pauseAtSec = playbackRange.playable_end_sec ?? effectiveDurationSec;
      seekTo(pauseAtSec, row.row_id, row.anchor_segment_id);
      setLastPreviewSkip({
        reason: playbackRange.is_deleted ? "deleted" : "trim-end",
        from_row_id: row.row_id,
        to_row_id: null,
      });
      return;
    }

    seekTo(resolvedSeekTarget.timeSec, row.row_id, row.anchor_segment_id);
    if (resolvedSeekTarget.row_id !== row.row_id || resolvedSeekTarget.timeSec > row.start_sec + PREVIEW_EPSILON_SEC) {
      setLastPreviewSkip({
        reason: playbackRange.is_deleted ? "deleted" : "trim-start",
        from_row_id: row.row_id,
        to_row_id: resolvedSeekTarget.row_id,
      });
    }
  }

  function clearEdits() {
    setEditInstructions([]);
    setLastPreviewSkip(null);
    setEditPlanFeedback(null);
    setEditPlanFeedbackTone("neutral");
  }

  function exportEditPlan() {
    setEditPlanJsonDraft(JSON.stringify(currentEditPlan, null, 2));
    setEditPlanFeedback("Edit plan exported to the dev JSON buffer.");
    setEditPlanFeedbackTone("success");
  }

  function loadEditPlan() {
    const parsed = parseEditPlanJson(editPlanJsonDraft);
    if (!parsed.plan) {
      setEditPlanFeedback(parsed.error ?? "Failed to load edit plan.");
      setEditPlanFeedbackTone("warning");
      return;
    }

    const nextPlan = parsed.plan;
    const nextInstructions = cloneEditInstructions(nextPlan.instructions);
    const nextPreviewMode = nextPlan.preview_mode ?? DEFAULT_PREVIEW_MODE;
    const nextSignature = createEditPlanSignature(
      nextPlan.source_transcript_id,
      nextPreviewMode,
      nextInstructions,
    );

    setEditInstructions(nextInstructions);
    setPreviewMode(nextPreviewMode);
    setSessionId(nextPlan.session_id ?? createEntityId("session"));
    setEditPlanMeta({
      editPlanId: nextPlan.edit_plan_id,
      createdAt: nextPlan.created_at,
      updatedAt: nextPlan.updated_at,
      baselineSignature: nextSignature,
      lastSignature: nextSignature,
    });
    setLastPreviewSkip(null);
    setEditPlanJsonDraft(JSON.stringify(nextPlan, null, 2));
    if (nextPlan.source_transcript_id === transcriptSourceId) {
      setEditPlanFeedback("Edit plan loaded. Overlay and preview state restored.");
      setEditPlanFeedbackTone("success");
      return;
    }

    setEditPlanFeedback(
      `Edit plan loaded from ${nextPlan.source_transcript_id}. Applying it to ${transcriptSourceId}.`,
    );
    setEditPlanFeedbackTone("warning");
  }

  function removeInstruction(instructionId: string) {
    setEditInstructions((prev) => prev.filter((instruction) => instruction.instruction_id !== instructionId));
  }

  function toggleDeleteInstruction(segmentId: string) {
    setEditInstructions((prev) => {
      const existing = prev.find((instruction) => (
        instruction.type === "delete"
        && instruction.segment_id === segmentId
      ));
      if (existing) {
        return prev.filter((instruction) => instruction.instruction_id !== existing.instruction_id);
      }

      const next: HammerDeleteInstruction = {
        instruction_id: createInstructionId(),
        segment_id: segmentId,
        type: "delete",
        created_at: new Date().toISOString(),
      };
      return [...prev, next];
    });
  }

  function toggleMuteInstruction(segmentId: string) {
    setEditInstructions((prev) => {
      const existing = prev.find((instruction) => (
        instruction.type === "mute"
        && instruction.segment_id === segmentId
      ));
      if (existing) {
        return prev.filter((instruction) => instruction.instruction_id !== existing.instruction_id);
      }

      const next: HammerMuteInstruction = {
        instruction_id: createInstructionId(),
        segment_id: segmentId,
        type: "mute",
        created_at: new Date().toISOString(),
      };
      return [...prev, next];
    });
  }

  function toggleTrimInstruction(segment: HammerTranscriptSegment) {
    setEditInstructions((prev) => {
      const existing = prev.find((instruction) => (
        instruction.type === "trim"
        && instruction.segment_id === segment.segment_id
      ));
      if (existing) {
        return prev.filter((instruction) => instruction.instruction_id !== existing.instruction_id);
      }

      const defaults = buildDefaultTrimInstruction(segment);
      const next: HammerTrimInstruction = {
        instruction_id: createInstructionId(),
        segment_id: segment.segment_id,
        type: "trim",
        trim_start_sec: defaults.trim_start_sec,
        trim_end_sec: defaults.trim_end_sec,
        created_at: new Date().toISOString(),
      };
      return [...prev, next];
    });
  }

  function toggleSplitInstruction(segment: HammerTranscriptSegment) {
    setEditInstructions((prev) => {
      const existing = prev.find((instruction) => (
        instruction.type === "split"
        && instruction.segment_id === segment.segment_id
      ));
      if (existing) {
        return prev.filter((instruction) => instruction.instruction_id !== existing.instruction_id);
      }

      const next: HammerSplitInstruction = {
        instruction_id: createInstructionId(),
        segment_id: segment.segment_id,
        type: "split",
        split_at_sec: resolveSplitAtSec(segment, currentTimeSec),
        created_at: new Date().toISOString(),
      };
      return [...prev, next];
    });
  }

  function toggleMergeInstruction(
    segment: HammerTranscriptSegment,
    nextSegment: HammerTranscriptSegment | null,
  ) {
    setEditInstructions((prev) => {
      const existing = prev.find((instruction) => (
        instruction.type === "merge"
        && instruction.segment_id === segment.segment_id
      ));
      if (existing) {
        return prev.filter((instruction) => instruction.instruction_id !== existing.instruction_id);
      }

      if (!nextSegment || nextSegment.speaker !== segment.speaker) {
        return prev;
      }

      const filtered = prev.filter((instruction) => (
        instruction.type !== "merge"
        || (
          instruction.segment_id !== segment.segment_id
          && instruction.segment_id !== nextSegment.segment_id
          && instruction.merge_with_segment_id !== segment.segment_id
          && instruction.merge_with_segment_id !== nextSegment.segment_id
        )
      ));

      const next: HammerMergeInstruction = {
        instruction_id: createInstructionId(),
        segment_id: segment.segment_id,
        type: "merge",
        merge_with_segment_id: nextSegment.segment_id,
        created_at: new Date().toISOString(),
      };
      return [...filtered, next];
    });
  }

  return (
    <section style={ROOT_STYLE}>
      <div style={{ ...PANEL_STYLE, padding: 12, gap: 12 }}>
        <header style={{ display: "grid", gap: 2 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Transcript Preview</h2>
          <div style={{ fontSize: 13, opacity: 0.78 }}>
            Click a row to seek the current preview. Transcript text stays canonical; the edit plan only reshapes the overlay.
          </div>
          <div style={{ fontSize: 12, opacity: 0.72 }}>
            transcript source: {transcriptLoad.sourceLabel}
          </div>
          <div style={{ fontSize: 12, opacity: 0.72 }}>
            edit plan instructions: {editInstructions.length} (portable overlay state)
          </div>
          {transcriptLoad.error ? (
            <div style={{ fontSize: 12, color: "#fde68a" }}>
              {transcriptLoad.error}
            </div>
          ) : null}
          <div
            style={{
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(148, 163, 184, 0.24)",
              background: "rgba(2, 6, 23, 0.38)",
              fontSize: 12,
              color: "#dbe8ff",
            }}
          >
            <span>{formatClock(currentTimeSec)} / {formatClock(effectiveDurationSec)}</span>
            <span
              style={{
                borderRadius: 999,
                padding: "2px 8px",
                border: "1px solid rgba(148, 163, 184, 0.24)",
                background: isPlaying ? "rgba(20, 184, 166, 0.16)" : "rgba(15, 23, 42, 0.55)",
              }}
            >
              {isPlaying ? "PLAYING" : "PAUSED"}
            </span>
            <span>active raw: {formatPlaybackRangeLabel(rawActivePlaybackRange)}</span>
            <span>active playable: {formatPlaybackRangeLabel(activePlayableRange)}</span>
            <span>skip: {lastPreviewSkip?.reason ?? "none"}</span>
            <span>deleted rows: {sessionState.previewMode === "edit-aware" ? "skipped" : "raw playback"}</span>
            <span>muted rows: structural only</span>
            <span>preview mode: {sessionState.previewMode}</span>
            <span style={{ opacity: 0.72 }}>source mode: {sessionState.sourceMode}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            <button
              type="button"
              disabled={!selectedSegment}
              onClick={() => {
                if (!selectedSegment) return;
                toggleDeleteInstruction(selectedSegment.segment_id);
              }}
            >
              {selectedSegmentDeleteInstruction ? "Restore segment" : "Delete segment"}
            </button>
            <button
              type="button"
              disabled={!selectedSegment}
              onClick={() => {
                if (!selectedSegment) return;
                toggleMuteInstruction(selectedSegment.segment_id);
              }}
            >
              {selectedSegmentMuteInstruction ? "Unmute row" : "Mute row"}
            </button>
            <button
              type="button"
              disabled={!selectedSegment}
              onClick={() => {
                if (!selectedSegment) return;
                toggleTrimInstruction(selectedSegment);
              }}
            >
              {selectedSegmentTrimInstruction ? "Undo trim" : "Trim row"}
            </button>
            <button
              type="button"
              disabled={!selectedSegment}
              onClick={() => {
                if (!selectedSegment) return;
                toggleSplitInstruction(selectedSegment);
              }}
            >
              {selectedSegmentSplitInstruction ? "Undo split" : "Split segment"}
            </button>
            <button
              type="button"
              disabled={!selectedSegment || (!selectedSegmentMergeInstruction && !canMergeSelected)}
              onClick={() => {
                if (!selectedSegment) return;
                toggleMergeInstruction(selectedSegment, selectedNextSegment);
              }}
            >
              {selectedSegmentMergeInstruction ? "Undo merge" : "Merge with next"}
            </button>
            <button
              type="button"
              disabled={editInstructions.length === 0}
              onClick={() => clearEdits()}
            >
              Clear edits
            </button>
          </div>
        </header>

        <div
          style={{
            border: "1px dashed rgba(148, 163, 184, 0.35)",
            borderRadius: 10,
            padding: "8px 10px",
            display: "grid",
            gap: 6,
            fontSize: 12,
            color: "#c8d6ea",
            background: "rgba(2, 6, 23, 0.42)",
          }}
        >
          <strong style={{ color: "#dbe8ff" }}>Session State</strong>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>transcript: {sessionState.transcriptLoaded ? "loaded" : "empty"}</span>
            <span>source mode: {sessionState.sourceMode}</span>
            <span>preview mode: {sessionState.previewMode}</span>
            <span>edit plan: {sessionState.editPlanStatus}</span>
            <span>session: {sessionState.sessionId}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={sessionState.previewMode === "edit-aware"}
              onClick={() => setPreviewMode("edit-aware")}
            >
              Edit-aware preview
            </button>
            <button
              type="button"
              disabled={sessionState.previewMode === "raw"}
              onClick={() => setPreviewMode("raw")}
            >
              Raw preview
            </button>
            <span style={{ opacity: 0.72 }}>
              {sessionState.previewMode === "edit-aware"
                ? "Deleted rows skip in preview. Mute remains structural-only."
                : "Raw preview ignores the edit plan, but the loaded instructions remain below."}
            </span>
          </div>
        </div>

        <div
          ref={transcriptScrollContainerRef}
          data-testid="transcript-scroll-container"
          style={{ display: "grid", gap: 8, overflow: "auto", maxHeight: "calc(100vh - 260px)" }}
        >
          {overlayRows.length > 0 ? (
            overlayRows.map((row) => {
              const anchorSegment = segmentById.get(row.anchor_segment_id) ?? null;
              if (!anchorSegment) return null;

              const nextSegment = row.next_segment_id
                ? (segmentById.get(row.next_segment_id) ?? null)
                : null;
              const rowPlaybackRange = playbackRanges.find((range) => range.row_id === row.row_id) ?? null;
              const rowDeleteInstruction = instructionIndex.deleteBySegmentId.get(anchorSegment.segment_id) ?? null;
              const rowMuteInstruction = instructionIndex.muteBySegmentId.get(anchorSegment.segment_id) ?? null;
              const rowTrimInstruction = instructionIndex.trimBySegmentId.get(anchorSegment.segment_id) ?? null;
              const rowSplitInstruction = instructionIndex.splitBySegmentId.get(anchorSegment.segment_id) ?? null;
              const rowMergeInstruction = instructionIndex.mergeBySegmentId.get(anchorSegment.segment_id) ?? null;
              const canMergeRow = Boolean(
                nextSegment
                && nextSegment.speaker === anchorSegment.speaker,
              );
              const isSelected = row.row_id === selectedOverlayRowId;
              const isActive = row.row_id === activeOverlayRowId;
              const borderColor = isActive
                ? "rgba(45, 212, 191, 0.95)"
                : row.is_deleted
                ? "rgba(239, 68, 68, 0.62)"
                : row.is_muted
                ? "rgba(245, 158, 11, 0.56)"
                : row.structure === "merge"
                ? "rgba(56, 189, 248, 0.52)"
                : row.structure === "split"
                ? "rgba(129, 140, 248, 0.54)"
                : isSelected
                ? "rgba(96, 165, 250, 0.72)"
                : "rgba(148, 163, 184, 0.22)";
              const background = isActive
                ? "rgba(13, 148, 136, 0.2)"
                : row.is_deleted
                ? "rgba(239, 68, 68, 0.12)"
                : row.is_muted
                ? "rgba(180, 83, 9, 0.15)"
                : row.structure === "merge"
                ? "rgba(8, 145, 178, 0.14)"
                : row.structure === "split"
                ? "rgba(99, 102, 241, 0.14)"
                : isSelected
                ? "rgba(59, 130, 246, 0.2)"
                : "rgba(2, 6, 23, 0.42)";

              return (
                <div
                  key={row.row_id}
                  ref={(element) => {
                    if (isActive) {
                      activeRowRef.current = element;
                    }
                  }}
                  data-overlay-row-id={row.row_id}
                  data-active={isActive ? "true" : "false"}
                  data-deleted={row.is_deleted ? "true" : "false"}
                  data-muted={row.is_muted ? "true" : "false"}
                  data-playable-start={rowPlaybackRange?.playable_start_sec ?? ""}
                  data-playable-end={rowPlaybackRange?.playable_end_sec ?? ""}
                  style={{
                    border: `1px solid ${borderColor}`,
                    borderRadius: 10,
                    background,
                    padding: "8px 10px",
                    display: "grid",
                    gap: 8,
                    opacity: row.is_deleted ? 0.86 : 1,
                    boxShadow: isActive ? "0 0 0 1px rgba(45, 212, 191, 0.2), 0 8px 24px rgba(13, 148, 136, 0.12)" : "none",
                    transition: "border-color 140ms ease, background 140ms ease, box-shadow 140ms ease",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => seekToRow(row)}
                    aria-current={isActive ? "true" : undefined}
                    style={{
                      border: "none",
                      background: "transparent",
                      textAlign: "left",
                      padding: 0,
                      display: "grid",
                      gap: 6,
                      color: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, opacity: 0.85 }}>
                        {formatClock(row.start_sec)}-{formatClock(row.end_sec)} {row.speaker}
                      </span>
                      <span style={{ fontSize: 11, opacity: 0.72 }}>
                        id: {row.anchor_segment_id}
                        {row.next_segment_id ? ` + ${row.next_segment_id}` : ""}
                      </span>
                      {row.structure !== "base" ? (
                        <span
                          style={{
                            fontSize: 11,
                            borderRadius: 999,
                            padding: "1px 8px",
                            border: "1px solid rgba(191, 219, 254, 0.26)",
                            background: "rgba(15, 23, 42, 0.45)",
                          }}
                        >
                          {row.structure}
                        </span>
                      ) : null}
                      {isActive ? (
                        <span style={{ fontSize: 11, color: "#99f6e4" }}>active</span>
                      ) : null}
                      {row.is_muted ? (
                        <span style={{ fontSize: 11, color: "#fde68a" }}>mute</span>
                      ) : null}
                      {row.is_trimmed ? (
                        <span style={{ fontSize: 11, color: "#c4b5fd" }}>trim</span>
                      ) : null}
                    </div>

                    <div style={{ display: "grid", gap: 6 }}>
                      {row.blocks.map((block) => (
                        <div
                          key={block.block_id}
                          style={{
                            border: "1px solid rgba(148, 163, 184, 0.18)",
                            borderRadius: 8,
                            padding: "7px 8px",
                            background: "rgba(2, 6, 23, 0.32)",
                            display: "grid",
                            gap: 3,
                          }}
                        >
                          <div style={{ fontSize: 11, opacity: 0.68 }}>
                            {block.label ? `${block.label} · ` : ""}
                            {formatClock(block.start_sec)}-{formatClock(block.end_sec)}
                          </div>
                          <div
                            style={{
                              fontSize: 13,
                              lineHeight: 1.35,
                              textDecoration: row.is_deleted ? "line-through" : "none",
                            }}
                          >
                            {block.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  </button>

                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => toggleDeleteInstruction(anchorSegment.segment_id)}
                      style={{ padding: "4px 8px", fontSize: 11 }}
                    >
                      {rowDeleteInstruction ? "Restore" : "Delete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleMuteInstruction(anchorSegment.segment_id)}
                      style={{ padding: "4px 8px", fontSize: 11 }}
                    >
                      {rowMuteInstruction ? "Unmute" : "Mute"}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleTrimInstruction(anchorSegment)}
                      style={{ padding: "4px 8px", fontSize: 11 }}
                    >
                      {rowTrimInstruction ? "Undo trim" : "Trim"}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSplitInstruction(anchorSegment)}
                      style={{ padding: "4px 8px", fontSize: 11 }}
                    >
                      {rowSplitInstruction ? "Undo split" : "Split"}
                    </button>
                    <button
                      type="button"
                      disabled={!rowMergeInstruction && !canMergeRow}
                      onClick={() => toggleMergeInstruction(anchorSegment, nextSegment)}
                      style={{ padding: "4px 8px", fontSize: 11 }}
                    >
                      {rowMergeInstruction ? "Undo merge" : "Merge with next"}
                    </button>
                    {!canMergeRow && nextSegment ? (
                      <span style={{ fontSize: 11, opacity: 0.66 }}>
                        merge disabled: speaker mismatch
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ fontSize: 13, opacity: 0.78 }}>
              No transcript segments loaded.
            </div>
          )}
        </div>

        <div
          style={{
            border: "1px dashed rgba(148, 163, 184, 0.35)",
            borderRadius: 10,
            padding: "8px 10px",
            display: "grid",
            gap: 6,
            fontSize: 12,
            color: "#b8c7db",
            background: "rgba(2, 6, 23, 0.45)",
          }}
        >
          <strong style={{ color: "#dbe8ff" }}>Edit Stack</strong>
          {editInstructions.length === 0 ? (
            <div>No edits yet.</div>
          ) : (
            editInstructions.map((instruction) => {
              const detail = formatInstructionDetail(instruction);
              return (
                <div
                  key={instruction.instruction_id}
                  style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
                >
                  <span
                    style={{
                      minWidth: 60,
                      fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
                      color: "#dbe8ff",
                    }}
                  >
                    {instruction.type.toUpperCase()}
                  </span>
                  <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }}>
                    {formatInstructionTarget(instruction)}
                  </span>
                  {detail ? (
                    <span style={{ opacity: 0.68 }}>{detail}</span>
                  ) : null}
                  <span style={{ opacity: 0.56 }}>{instruction.instruction_id}</span>
                  <button
                    type="button"
                    onClick={() => removeInstruction(instruction.instruction_id)}
                    style={{ padding: "2px 8px", fontSize: 11 }}
                  >
                    Remove
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div
          style={{
            border: "1px dashed rgba(148, 163, 184, 0.35)",
            borderRadius: 10,
            padding: "8px 10px",
            display: "grid",
            gap: 8,
            fontSize: 12,
            color: "#b8c7db",
            background: "rgba(2, 6, 23, 0.45)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <strong style={{ color: "#dbe8ff" }}>Edit Plan JSON</strong>
            <span style={{ opacity: 0.74 }}>
              {currentEditPlan.edit_plan_id} · {currentEditPlan.version} · {sessionState.editPlanStatus}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              data-testid="edit-plan-export"
              onClick={() => exportEditPlan()}
            >
              Export Edit Plan
            </button>
            <button
              type="button"
              data-testid="edit-plan-load"
              onClick={() => loadEditPlan()}
            >
              Load Edit Plan
            </button>
            <span style={{ opacity: 0.72 }}>
              Round-trip this JSON to restore overlay rows and preview semantics.
            </span>
          </div>
          {editPlanFeedback ? (
            <div
              style={{
                color: editPlanFeedbackTone === "warning"
                  ? "#fde68a"
                  : editPlanFeedbackTone === "success"
                  ? "#a7f3d0"
                  : "#c8d6ea",
              }}
            >
              {editPlanFeedback}
            </div>
          ) : null}
          <textarea
            data-testid="edit-plan-json"
            value={editPlanJsonDraft}
            onChange={(event) => {
              setEditPlanJsonDraft(event.target.value);
              setEditPlanFeedback(null);
              setEditPlanFeedbackTone("neutral");
            }}
            spellCheck={false}
            placeholder="Export the current edit plan, clear edits, then paste or reload the JSON here."
            style={{
              width: "100%",
              minHeight: 180,
              resize: "vertical",
              borderRadius: 10,
              border: "1px solid rgba(148, 163, 184, 0.26)",
              background: "rgba(2, 6, 23, 0.65)",
              color: "#dbe8ff",
              padding: 10,
              fontSize: 12,
              fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
            }}
          />
        </div>
      </div>

      <div style={{ ...PANEL_STYLE, padding: 14, gap: 12 }}>
        <header style={{ display: "grid", gap: 4 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Playback Preview</h2>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            media_id: <strong>{mediaRef.media_id}</strong>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            local_relpath: {mediaRef.local_relpath}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            workspace_id: {query.workspaceId}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            source mode: {sessionState.sourceMode} ({playbackSourceLabel})
          </div>
        </header>

        <div
          style={{
            border: "1px solid rgba(148, 163, 184, 0.28)",
            borderRadius: 12,
            background: "linear-gradient(145deg, rgba(11, 20, 38, 0.9), rgba(2, 6, 23, 0.84))",
            padding: 12,
            display: "grid",
            gap: 10,
          }}
        >
          {resolving ? (
            <div style={{ fontSize: 13, opacity: 0.82 }}>Resolving media...</div>
          ) : resolveError ? (
            <div style={{ color: "#fecaca", fontSize: 13 }}>{resolveError}</div>
          ) : (
            <>
              {resolveResult ? (
                <div style={{ fontSize: 12, opacity: 0.82 }}>
                  {badgeVm?.badge.label}
                  {badgeVm?.tooltip ? ` - ${badgeVm.tooltip}` : ""}
                </div>
              ) : null}

              {resolveResult?.status === "ok" ? (
                <div style={{ fontSize: 12, opacity: 0.72 }}>
                  resolved_uri: {resolveResult.playable_uri}
                </div>
              ) : null}
              {resolveResult?.status === "unresolved" ? (
                <div style={{ fontSize: 13, color: "#fde68a" }}>
                  {resolveResult.user_message}
                  {" "}
                  Falling back to dev-tone preview audio.
                </div>
              ) : null}
              {playbackSrc ? (
                <audio
                  ref={audioRef}
                  src={playbackSrc}
                  controls
                  preload="metadata"
                  data-testid="hammer-audio-player"
                  style={{ width: "100%" }}
                  onLoadedMetadata={(event) => {
                    const nextDuration = event.currentTarget.duration;
                    if (Number.isFinite(nextDuration) && nextDuration > 0) {
                      setDurationSec(nextDuration);
                    }
                  }}
                  onTimeUpdate={(event) => {
                    setCurrentTimeSec(event.currentTarget.currentTime);
                  }}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  onError={() => {
                    setIsPlaying(false);
                    if (resolvedMediaSrc && !preferDevAudioFallback && devAudioSrc) {
                      setPreferDevAudioFallback(true);
                      setPlaybackError("Mapped media failed to load. Switched to dev-tone preview audio.");
                      return;
                    }
                    setPlaybackError("Preview audio failed to load.");
                  }}
                />
              ) : (
                <div style={{ fontSize: 13, color: "#fde68a" }}>
                  No playback source is available yet.
                </div>
              )}
            </>
          )}

          {playbackError ? (
            <div style={{ color: "#fecaca", fontSize: 12 }}>{playbackError}</div>
          ) : null}

          <div style={{ fontSize: 13, opacity: 0.85 }}>
            Time: {formatClock(currentTimeSec)} / {formatClock(effectiveDurationSec)} · {sessionState.previewMode} preview
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <div
              style={{
                height: 10,
                borderRadius: 999,
                border: "1px solid rgba(148, 163, 184, 0.25)",
                background: "rgba(2, 6, 23, 0.75)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, rgba(96, 165, 250, 0.75), rgba(14, 165, 233, 0.85))",
                }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={effectiveDurationSec}
              step={0.1}
              value={currentTimeSec}
              onChange={(event) => seekTo(Number(event.target.value))}
              aria-label="Playback playhead"
              disabled={!canControlAudio}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => void onTogglePlayback()} disabled={!canControlAudio}>
              {isPlaying ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              disabled={!canControlAudio}
              onClick={() => {
                const audio = audioRef.current;
                if (audio) {
                  audio.pause();
                  audio.currentTime = 0;
                }
                setIsPlaying(false);
                setCurrentTimeSec(0);
                setActiveOverlayRowId(null);
                setSelectedSegmentId(firstSegment?.segment_id ?? null);
                setSelectedOverlayRowId(overlayRows[0]?.row_id ?? null);
              }}
            >
              Reset
            </button>
          </div>
        </div>

        <div
          style={{
            border: "1px dashed rgba(148, 163, 184, 0.35)",
            borderRadius: 10,
            padding: "8px 10px",
            display: "grid",
            gap: 4,
            fontSize: 13,
            color: "#b8c7db",
            background: "rgba(2, 6, 23, 0.45)",
          }}
        >
          {selectedSegment ? (
            <>
              <div>
                Selected segment: {selectedSegment.segment_id} (
                {formatClock(selectedSegment.start_sec)}-{formatClock(selectedSegment.end_sec)})
                {" "}
                {selectedSegment.speaker}
                {" - "}
                {selectedSegment.text}
              </div>
              {selectedOverlayRow ? (
                <div style={{ fontSize: 12, opacity: 0.74 }}>
                  Overlay row: {selectedOverlayRow.structure}
                  {" · "}
                  {selectedOverlayRow.source_segment_ids.join(" + ")}
                  {" · "}
                  {formatClock(selectedOverlayRow.start_sec)}-{formatClock(selectedOverlayRow.end_sec)}
                </div>
              ) : null}
              {activeOverlayRow ? (
                <div style={{ fontSize: 12, opacity: 0.74 }}>
                  Active preview row: {formatOverlayRowLabel(activeOverlayRow)}
                  {" · "}
                  {formatClock(activeOverlayRow.start_sec)}-{formatClock(activeOverlayRow.end_sec)}
                </div>
              ) : null}
            </>
          ) : (
            "No row selected."
          )}
        </div>
      </div>
    </section>
  );
}
