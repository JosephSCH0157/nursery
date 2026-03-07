import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, JSX } from "react";
import { useLocation } from "react-router-dom";
import type {
  MediaRef,
  ResolveMediaResult,
  WorkspaceMediaMapping,
} from "../../../../packages/contracts/hammer/media-resolver.contract";
import type {
  HammerDeleteInstruction,
  HammerEditInstruction,
  HammerMergeInstruction,
  HammerMuteInstruction,
  HammerSplitInstruction,
  HammerTrimInstruction,
} from "../../../../packages/contracts/hammer/edit-instruction.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
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

type InstructionIndex = {
  deleteBySegmentId: Map<string, HammerDeleteInstruction>;
  muteBySegmentId: Map<string, HammerMuteInstruction>;
  trimBySegmentId: Map<string, HammerTrimInstruction>;
  splitBySegmentId: Map<string, HammerSplitInstruction>;
  mergeBySegmentId: Map<string, HammerMergeInstruction>;
};

type TranscriptOverlayBlock = {
  block_id: string;
  start_sec: number;
  end_sec: number;
  label: string | null;
  text: string;
  source_segment_ids: string[];
};

type TranscriptOverlayRow = {
  row_id: string;
  anchor_segment_id: string;
  next_segment_id: string | null;
  source_segment_ids: string[];
  speaker: string;
  start_sec: number;
  end_sec: number;
  structure: "base" | "split" | "merge";
  blocks: TranscriptOverlayBlock[];
  split_instruction: HammerSplitInstruction | null;
  merge_instruction: HammerMergeInstruction | null;
  is_deleted: boolean;
  is_muted: boolean;
  is_trimmed: boolean;
};

const DEFAULT_WORKSPACE_ID = "ws_demo";
const DEFAULT_MEDIA_ID = "media_local_01";
const DEFAULT_MEDIA_RELPATH = "recordings/episode014.mp4";
const FALLBACK_DURATION_SEC = 32;
const MIN_SEGMENT_DURATION_SEC = 0.2;
const MIN_SPLIT_EDGE_SEC = 0.05;
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

function uniqueIds(values: string[]): string[] {
  return Array.from(new Set(values));
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
  return null;
}

function formatInstructionTarget(instruction: HammerEditInstruction): string {
  if (instruction.type === "merge") {
    return `${instruction.segment_id} + ${instruction.merge_with_segment_id}`;
  }
  return instruction.segment_id;
}

function pickPlayableOverlayRowIdForTime(
  overlayRows: TranscriptOverlayRow[],
  timeSec: number,
): string | null {
  for (const row of overlayRows) {
    if (row.is_deleted) continue;
    if (timeSec >= row.start_sec && timeSec < row.end_sec) {
      return row.row_id;
    }
  }
  return null;
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

function createInstructionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ins_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function buildInstructionIndex(instructions: HammerEditInstruction[]): InstructionIndex {
  const index: InstructionIndex = {
    deleteBySegmentId: new Map<string, HammerDeleteInstruction>(),
    muteBySegmentId: new Map<string, HammerMuteInstruction>(),
    trimBySegmentId: new Map<string, HammerTrimInstruction>(),
    splitBySegmentId: new Map<string, HammerSplitInstruction>(),
    mergeBySegmentId: new Map<string, HammerMergeInstruction>(),
  };

  for (const instruction of instructions) {
    switch (instruction.type) {
      case "delete":
        index.deleteBySegmentId.set(instruction.segment_id, instruction);
        break;
      case "mute":
        index.muteBySegmentId.set(instruction.segment_id, instruction);
        break;
      case "trim":
        index.trimBySegmentId.set(instruction.segment_id, instruction);
        break;
      case "split":
        index.splitBySegmentId.set(instruction.segment_id, instruction);
        break;
      case "merge":
        index.mergeBySegmentId.set(instruction.segment_id, instruction);
        break;
    }
  }

  return index;
}

function getSegmentMidpointSec(segment: HammerTranscriptSegment): number {
  return segment.start_sec + ((segment.end_sec - segment.start_sec) / 2);
}

function normalizeSplitAtSec(segment: HammerTranscriptSegment, proposedSec: number): number {
  const duration = Math.max(segment.end_sec - segment.start_sec, MIN_SEGMENT_DURATION_SEC);
  if (duration <= MIN_SPLIT_EDGE_SEC * 2) {
    return segment.start_sec + (duration / 2);
  }
  return clamp(
    proposedSec,
    segment.start_sec + MIN_SPLIT_EDGE_SEC,
    segment.end_sec - MIN_SPLIT_EDGE_SEC,
  );
}

function resolveSplitAtSec(segment: HammerTranscriptSegment, currentSec: number): number {
  const useCurrentSec = currentSec > segment.start_sec && currentSec < segment.end_sec;
  const sourceSec = useCurrentSec ? currentSec : getSegmentMidpointSec(segment);
  return normalizeSplitAtSec(segment, sourceSec);
}

function splitTextForDisplay(text: string, ratio: number): [string, string] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return [text, text];

  const splitIndex = clamp(
    Math.round(words.length * clamp(ratio, 0.1, 0.9)),
    1,
    words.length - 1,
  );
  return [
    words.slice(0, splitIndex).join(" "),
    words.slice(splitIndex).join(" "),
  ];
}

function createBaseBlock(segment: HammerTranscriptSegment): TranscriptOverlayBlock {
  return {
    block_id: segment.segment_id,
    start_sec: segment.start_sec,
    end_sec: segment.end_sec,
    label: null,
    text: segment.text,
    source_segment_ids: [segment.segment_id],
  };
}

function createSplitBlocks(
  segment: HammerTranscriptSegment,
  instruction: HammerSplitInstruction,
): TranscriptOverlayBlock[] {
  const splitAtSec = normalizeSplitAtSec(segment, instruction.split_at_sec);
  const ratio = clamp(
    (splitAtSec - segment.start_sec) / Math.max(segment.end_sec - segment.start_sec, MIN_SEGMENT_DURATION_SEC),
    0.1,
    0.9,
  );
  const [firstText, secondText] = splitTextForDisplay(segment.text, ratio);

  return [
    {
      block_id: `${segment.segment_id}::split-a`,
      start_sec: segment.start_sec,
      end_sec: splitAtSec,
      label: "Split A",
      text: firstText,
      source_segment_ids: [segment.segment_id],
    },
    {
      block_id: `${segment.segment_id}::split-b`,
      start_sec: splitAtSec,
      end_sec: segment.end_sec,
      label: "Split B",
      text: secondText,
      source_segment_ids: [segment.segment_id],
    },
  ];
}

function createMergedBlock(blocks: TranscriptOverlayBlock[]): TranscriptOverlayBlock {
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  return {
    block_id: `${first.block_id}::merge`,
    start_sec: first.start_sec,
    end_sec: last.end_sec,
    label: "Merged",
    text: blocks.map((block) => block.text).join(" ").replace(/\s+/g, " ").trim(),
    source_segment_ids: uniqueIds(blocks.flatMap((block) => block.source_segment_ids)),
  };
}

function buildOverlayFlags(
  sourceSegmentIds: string[],
  instructionIndex: InstructionIndex,
): Pick<TranscriptOverlayRow, "is_deleted" | "is_muted" | "is_trimmed"> {
  return {
    is_deleted: sourceSegmentIds.some((segmentId) => instructionIndex.deleteBySegmentId.has(segmentId)),
    is_muted: sourceSegmentIds.some((segmentId) => instructionIndex.muteBySegmentId.has(segmentId)),
    is_trimmed: sourceSegmentIds.some((segmentId) => instructionIndex.trimBySegmentId.has(segmentId)),
  };
}

function buildTranscriptOverlayRows(
  segments: HammerTranscriptSegment[],
  instructionIndex: InstructionIndex,
): TranscriptOverlayRow[] {
  const rows: TranscriptOverlayRow[] = [];
  const hiddenByMerge = new Set<string>();

  // Structural instructions reshape the overlay before behavioral flags are layered on top.
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (hiddenByMerge.has(segment.segment_id)) continue;

    const nextSegment = segments[index + 1] ?? null;
    const splitInstruction = instructionIndex.splitBySegmentId.get(segment.segment_id) ?? null;
    const mergeInstruction = instructionIndex.mergeBySegmentId.get(segment.segment_id) ?? null;
    const segmentBlocks = splitInstruction
      ? createSplitBlocks(segment, splitInstruction)
      : [createBaseBlock(segment)];

    const canApplyMerge = Boolean(
      mergeInstruction
      && nextSegment
      && mergeInstruction.merge_with_segment_id === nextSegment.segment_id
      && nextSegment.speaker === segment.speaker,
    );

    if (canApplyMerge && nextSegment) {
      const nextSplitInstruction = instructionIndex.splitBySegmentId.get(nextSegment.segment_id) ?? null;
      const nextBlocks = nextSplitInstruction
        ? createSplitBlocks(nextSegment, nextSplitInstruction)
        : [createBaseBlock(nextSegment)];
      const mergedBlock = createMergedBlock([...segmentBlocks, ...nextBlocks]);
      const sourceSegmentIds = mergedBlock.source_segment_ids;

      rows.push({
        row_id: `${segment.segment_id}::merge`,
        anchor_segment_id: segment.segment_id,
        next_segment_id: nextSegment.segment_id,
        source_segment_ids: sourceSegmentIds,
        speaker: segment.speaker,
        start_sec: mergedBlock.start_sec,
        end_sec: mergedBlock.end_sec,
        structure: "merge",
        blocks: [mergedBlock],
        split_instruction: splitInstruction,
        merge_instruction: mergeInstruction,
        ...buildOverlayFlags(sourceSegmentIds, instructionIndex),
      });
      hiddenByMerge.add(nextSegment.segment_id);
      continue;
    }

    if (splitInstruction) {
      for (const block of segmentBlocks) {
        rows.push({
          row_id: block.block_id,
          anchor_segment_id: segment.segment_id,
          next_segment_id: nextSegment?.segment_id ?? null,
          source_segment_ids: [segment.segment_id],
          speaker: segment.speaker,
          start_sec: block.start_sec,
          end_sec: block.end_sec,
          structure: "split",
          blocks: [block],
          split_instruction: splitInstruction,
          merge_instruction: mergeInstruction,
          ...buildOverlayFlags([segment.segment_id], instructionIndex),
        });
      }
      continue;
    }

    rows.push({
      row_id: segment.segment_id,
      anchor_segment_id: segment.segment_id,
      next_segment_id: nextSegment?.segment_id ?? null,
      source_segment_ids: [segment.segment_id],
      speaker: segment.speaker,
      start_sec: segmentBlocks[0].start_sec,
      end_sec: segmentBlocks[0].end_sec,
      structure: "base",
      blocks: [segmentBlocks[0]],
      split_instruction: splitInstruction,
      merge_instruction: mergeInstruction,
      ...buildOverlayFlags([segment.segment_id], instructionIndex),
    });
  }

  return rows;
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
  const [editInstructions, setEditInstructions] = useState<HammerEditInstruction[]>([]);
  const [devAudioSrc, setDevAudioSrc] = useState<string | null>(null);
  const [preferDevAudioFallback, setPreferDevAudioFallback] = useState(false);

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
    if (preferDevAudioFallback || !resolvedMediaSrc) return "dev:generated_tone";
    return "resolved:local_media";
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
    setPreferDevAudioFallback(false);
  }, [firstSegment?.segment_id, resolvedMediaSrc]);

  useEffect(() => {
    setEditInstructions([]);
  }, [mediaRef.media_id, transcriptLoad.sourceLabel]);

  const instructionIndex = useMemo(
    () => buildInstructionIndex(editInstructions),
    [editInstructions],
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
    () => buildTranscriptOverlayRows(transcriptSegments, instructionIndex),
    [instructionIndex, transcriptSegments],
  );

  useEffect(() => {
    const nextActiveOverlayRowId = pickPlayableOverlayRowIdForTime(overlayRows, currentTimeSec);
    if (nextActiveOverlayRowId !== activeOverlayRowId) {
      setActiveOverlayRowId(nextActiveOverlayRowId);
    }
  }, [activeOverlayRowId, currentTimeSec, overlayRows]);

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

  const selectedSegmentSplitInstruction = useMemo(
    () => (selectedSegment ? instructionIndex.splitBySegmentId.get(selectedSegment.segment_id) ?? null : null),
    [instructionIndex, selectedSegment],
  );

  const selectedSegmentMergeInstruction = useMemo(
    () => (selectedSegment ? instructionIndex.mergeBySegmentId.get(selectedSegment.segment_id) ?? null : null),
    [instructionIndex, selectedSegment],
  );

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
    seekTo(row.start_sec, row.row_id, row.anchor_segment_id);
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
          <h2 style={{ margin: 0, fontSize: 18 }}>Transcript</h2>
          <div style={{ fontSize: 13, opacity: 0.78 }}>
            Click a row to seek the audio preview.
          </div>
          <div style={{ fontSize: 12, opacity: 0.72 }}>
            source: {transcriptLoad.sourceLabel}
          </div>
          <div style={{ fontSize: 12, opacity: 0.72 }}>
            edit instructions: {editInstructions.length} (in-memory overlay)
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
            <span>active: {formatOverlayRowLabel(activeOverlayRow)}</span>
            <span style={{ opacity: 0.72 }}>src: {playbackSourceLabel}</span>
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
              onClick={() => setEditInstructions([])}
            >
              Clear edits
            </button>
          </div>
        </header>

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
              const rowDeleteInstruction = instructionIndex.deleteBySegmentId.get(anchorSegment.segment_id) ?? null;
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
          <strong style={{ color: "#dbe8ff" }}>Edit Stack (In Memory)</strong>
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
      </div>

      <div style={{ ...PANEL_STYLE, padding: 14, gap: 12 }}>
        <header style={{ display: "grid", gap: 4 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Playback (Audio Sync)</h2>
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
            playback_src: {playbackSourceLabel}
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
                  Using generated dev audio.
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
                      setPlaybackError("Resolved media failed to load. Switched to generated dev audio.");
                      return;
                    }
                    setPlaybackError("Audio failed to load.");
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
            Time: {formatClock(currentTimeSec)} / {formatClock(effectiveDurationSec)}
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
                  Active row: {formatOverlayRowLabel(activeOverlayRow)}
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
