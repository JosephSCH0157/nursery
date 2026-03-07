import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, JSX, ReactNode } from "react";
import { useLocation } from "react-router-dom";
import type {
  ResolveMediaResult,
} from "../../../../packages/contracts/hammer/media-resolver.contract";
import type {
  HammerEditPlan,
  HammerPreviewMode,
} from "../../../../packages/contracts/hammer/edit-plan.contract";
import type {
  HammerLaunchContext,
  HammerLaunchSourceMode,
} from "../../../../packages/contracts/hammer/launch-context.contract";
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
  PREVIEW_EPSILON_SEC,
  resolveCurrentPlayableSeekTarget,
  resolveNextPlayableSeekTarget,
  resolvePreviousPlayableSeekTarget,
  resolvePreviewBoundaryAction,
  resolveSeekTargetForRow,
  resolveSplitAtSec,
} from "../lib/transcriptPreview";
import type {
  PreviewSkipReason,
  TranscriptOverlayRow,
  TranscriptPlaybackRange,
  TranscriptSeekTarget,
} from "../lib/transcriptPreview";
import {
  loadHammerLaunchWorkspaceMapping,
  parseHammerEditPlanJson,
  resolveHammerLaunchContext,
} from "../lib/launchContext";
import type { ResolvedHammerLaunchContext } from "../lib/launchContext";
import { toMediaBadgeViewModel } from "../media/mediaBadgeViewModel";
import { V1HammerMediaResolver } from "../media/resolveMedia";
import { resolveHammerDevLaunchContext } from "./hammerLaunchPresets";
import { getDevTranscriptSegments } from "./transcriptFixtures";

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
  baselineOrigin: "fresh" | "reloaded";
};

type EditPlanStatus = "clean" | "dirty" | "reloaded";

type HammerSessionState = {
  sessionId: string;
  sourceMode: HammerLaunchSourceMode;
  previewMode: HammerPreviewMode;
  editPlanStatus: EditPlanStatus;
};

const DEFAULT_PREVIEW_MODE: HammerPreviewMode = "edit-aware";
const HAMMER_EDIT_PLAN_VERSION = "1";
const HAMMER_DEV_TOOL_VERSION = "forge-v1.2.0/hammer-dev";
const FALLBACK_DURATION_SEC = 32;
const DEV_AUDIO_SAMPLE_RATE = 8_000;

type TranscriptSeekMockProps = {
  launchContext?: HammerLaunchContext;
};

const ROOT_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(340px, 1.05fr) minmax(400px, 0.95fr) minmax(320px, 0.92fr)",
  gap: 14,
  minHeight: "calc(100vh - 138px)",
  alignItems: "stretch",
};

const PANEL_STYLE: CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.28)",
  borderRadius: 12,
  background: "rgba(15, 23, 38, 0.74)",
  display: "grid",
  alignContent: "start",
  minHeight: 0,
};

const PANE_STYLE: CSSProperties = {
  ...PANEL_STYLE,
  padding: 12,
  gap: 12,
  minWidth: 0,
  overflow: "hidden",
};

const SECTION_STYLE: CSSProperties = {
  border: "1px dashed rgba(148, 163, 184, 0.35)",
  borderRadius: 12,
  padding: "10px 12px",
  display: "grid",
  gap: 10,
  minHeight: 0,
  background: "rgba(2, 6, 23, 0.45)",
  color: "#c8d6ea",
};

const SECTION_HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
};

const SECTION_BODY_STYLE: CSSProperties = {
  display: "grid",
  gap: 10,
  minHeight: 0,
};

const SECTION_TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 16,
  color: "#dbe8ff",
};

const SECTION_SUBTITLE_STYLE: CSSProperties = {
  fontSize: 12,
  opacity: 0.72,
  maxWidth: 560,
};

const META_STRIP_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  fontSize: 12,
};

const PILL_BASE_STYLE: CSSProperties = {
  borderRadius: 999,
  padding: "2px 8px",
  border: "1px solid rgba(148, 163, 184, 0.24)",
  background: "rgba(15, 23, 42, 0.55)",
  color: "#dbe8ff",
};

const ACTION_ROW_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const MONO_STYLE: CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
};

const INSPECTOR_GRID_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 8,
};

type HammerPaneSectionProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  sectionStyle?: CSSProperties;
  bodyStyle?: CSSProperties;
};

function HammerPaneSection(props: HammerPaneSectionProps): JSX.Element {
  return (
    <section style={{ ...SECTION_STYLE, ...props.sectionStyle }}>
      <header style={SECTION_HEADER_STYLE}>
        <div style={{ display: "grid", gap: 4 }}>
          <h3 style={SECTION_TITLE_STYLE}>{props.title}</h3>
          {props.subtitle ? (
            <div style={SECTION_SUBTITLE_STYLE}>{props.subtitle}</div>
          ) : null}
        </div>
        {props.action ? <div>{props.action}</div> : null}
      </header>
      <div style={{ ...SECTION_BODY_STYLE, ...props.bodyStyle }}>
        {props.children}
      </div>
    </section>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function formatClock(totalSec: number): string {
  const sec = Math.floor(totalSec);
  const mm = Math.floor(sec / 60);
  const ss = sec % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function formatTimeDetail(totalSec: number | null): string {
  if (totalSec == null || !Number.isFinite(totalSec)) return "none";
  return `${formatClock(totalSec)} (${totalSec.toFixed(2)}s)`;
}

function formatPlayableSlices(playbackRange: TranscriptPlaybackRange | null): string {
  if (!playbackRange || playbackRange.playable_slices.length === 0) {
    return "none";
  }

  return playbackRange.playable_slices
    .map((slice) => `${formatClock(slice.start_sec)}-${formatClock(slice.end_sec)}`)
    .join(" | ");
}

function formatSeekTargetLabel(target: TranscriptSeekTarget): string {
  if (target.timeSec == null) return "none";
  if (!target.row_id) return formatTimeDetail(target.timeSec);
  return `${target.row_id} @ ${formatTimeDetail(target.timeSec)}`;
}

function formatFlagState(value: boolean): string {
  return value ? "yes" : "no";
}

function formatSegmentAncestry(segmentIds: string[]): string {
  if (segmentIds.length === 0) return "none";
  return segmentIds.join(" -> ");
}

function formatInstructionEffects(row: TranscriptOverlayRow | null): string {
  if (!row) return "none";
  const effects: string[] = [];
  if (row.is_deleted) effects.push("delete");
  if (row.is_muted) effects.push("mute");
  if (row.is_trimmed) effects.push("trim");
  if (row.split_instruction) effects.push("split");
  if (row.merge_instruction) effects.push("merge");
  return effects.length > 0 ? effects.join(", ") : "none";
}

function getEditPlanStatusBadgeStyle(status: EditPlanStatus): CSSProperties {
  if (status === "dirty") {
    return {
      ...PILL_BASE_STYLE,
      background: "rgba(245, 158, 11, 0.16)",
      color: "#fde68a",
    };
  }
  if (status === "reloaded") {
    return {
      ...PILL_BASE_STYLE,
      background: "rgba(14, 165, 233, 0.16)",
      color: "#bae6fd",
    };
  }
  return PILL_BASE_STYLE;
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
    baselineOrigin: "fresh",
  };
}

function createReloadedEditPlanMeta(
  plan: HammerEditPlan,
  previewMode: HammerPreviewMode,
): EditPlanMetaState {
  const signature = createEditPlanSignature(
    plan.source_transcript_id,
    previewMode,
    plan.instructions,
  );
  return {
    editPlanId: plan.edit_plan_id,
    createdAt: plan.created_at,
    updatedAt: plan.updated_at,
    baselineSignature: signature,
    lastSignature: signature,
    baselineOrigin: "reloaded",
  };
}

function createLaunchEditPlanMeta(
  resolvedLaunch: ResolvedHammerLaunchContext,
): EditPlanMetaState {
  if (resolvedLaunch.initial_edit_plan) {
    return createReloadedEditPlanMeta(
      resolvedLaunch.initial_edit_plan,
      resolvedLaunch.initial_preview_mode,
    );
  }

  return createEditPlanMeta(
    resolvedLaunch.transcript.source_label,
    resolvedLaunch.initial_preview_mode,
    [],
  );
}

function buildInitialEditPlanJsonDraft(
  resolvedLaunch: ResolvedHammerLaunchContext,
): string {
  if (!resolvedLaunch.initial_edit_plan) {
    return "";
  }

  const initialPlan: HammerEditPlan = {
    ...resolvedLaunch.initial_edit_plan,
    preview_mode: resolvedLaunch.initial_preview_mode,
    workspace_id: resolvedLaunch.launch_context.workspace_id,
    workpiece_id: resolvedLaunch.launch_context.workpiece_id,
    session_id: resolvedLaunch.initial_session_id
      ?? resolvedLaunch.initial_edit_plan.session_id,
    instructions: cloneEditInstructions(resolvedLaunch.initial_edit_plan.instructions),
  };

  return JSON.stringify(initialPlan, null, 2);
}

export default function TranscriptSeekMock(
  props: TranscriptSeekMockProps,
): JSX.Element {
  const location = useLocation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const activeRowRef = useRef<HTMLDivElement | null>(null);
  const resolver = useMemo(() => new V1HammerMediaResolver(), []);
  const launchContext = useMemo(
    () => props.launchContext ?? resolveHammerDevLaunchContext(location.search),
    [location.search, props.launchContext],
  );
  const launchContextSignature = useMemo(
    () => JSON.stringify(launchContext),
    [launchContext],
  );
  const resolvedLaunch = useMemo(
    () => resolveHammerLaunchContext(launchContext, { getFixtureSegments: getDevTranscriptSegments }),
    [launchContext],
  );
  const transcriptLoad = resolvedLaunch.transcript;
  const transcriptSegments = transcriptLoad.segments;
  const firstSegment = transcriptSegments[0] ?? null;
  const transcriptDurationSec = useMemo(
    () => transcriptSegments.reduce(
      (maxEndSec, segment) => Math.max(maxEndSec, segment.end_sec),
      FALLBACK_DURATION_SEC,
    ),
    [transcriptSegments],
  );
  const mediaRef = resolvedLaunch.media.media_ref;
  const [resolveResult, setResolveResult] = useState<ResolveMediaResult | null>(null);
  const [resolving, setResolving] = useState(resolvedLaunch.media.requires_resolution);
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
  const [editInstructions, setEditInstructions] = useState<HammerEditInstruction[]>(
    () => cloneEditInstructions(resolvedLaunch.initial_edit_plan?.instructions ?? []),
  );
  const [devAudioSrc, setDevAudioSrc] = useState<string | null>(null);
  const [preferDevAudioFallback, setPreferDevAudioFallback] = useState(false);
  const [previewMode, setPreviewMode] = useState<HammerPreviewMode>(
    () => resolvedLaunch.initial_preview_mode,
  );
  const [sessionId, setSessionId] = useState(
    () => resolvedLaunch.initial_session_id ?? createEntityId("session"),
  );
  const [editPlanMeta, setEditPlanMeta] = useState<EditPlanMetaState>(
    () => createLaunchEditPlanMeta(resolvedLaunch),
  );
  const [editPlanJsonDraft, setEditPlanJsonDraft] = useState(
    () => buildInitialEditPlanJsonDraft(resolvedLaunch),
  );
  const [editPlanFeedback, setEditPlanFeedback] = useState<string | null>(null);
  const [editPlanFeedbackTone, setEditPlanFeedbackTone] = useState<"neutral" | "success" | "warning">("neutral");

  useEffect(() => {
    if (!resolvedLaunch.media.requires_resolution || !mediaRef) {
      setResolving(false);
      setResolveError(null);
      setResolveResult(null);
      return;
    }

    let active = true;
    setResolving(true);
    setResolveError(null);
    setResolveResult(null);

    void loadHammerLaunchWorkspaceMapping(resolvedLaunch)
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
  }, [mediaRef, resolvedLaunch, resolver]);

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
    if (resolvedLaunch.media.kind === "dev-tone") return "dev-tone";
    if (preferDevAudioFallback || !resolvedMediaSrc) return "dev-tone";
    return resolvedLaunch.media.source_label;
  }, [playbackSrc, preferDevAudioFallback, resolvedLaunch.media.kind, resolvedLaunch.media.source_label, resolvedMediaSrc]);

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
    setEditInstructions(cloneEditInstructions(resolvedLaunch.initial_edit_plan?.instructions ?? []));
    setPreviewMode(resolvedLaunch.initial_preview_mode);
    setSessionId(resolvedLaunch.initial_session_id ?? createEntityId("session"));
    setEditPlanMeta(createLaunchEditPlanMeta(resolvedLaunch));
    setEditPlanJsonDraft(buildInitialEditPlanJsonDraft(resolvedLaunch));
    setEditPlanFeedback(null);
    setEditPlanFeedbackTone("neutral");
  }, [launchContextSignature, resolvedLaunch]);

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

  const overlayRowById = useMemo(
    () => new Map(overlayRows.map((row) => [row.row_id, row])),
    [overlayRows],
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
  const transcriptSourceId = transcriptLoad.source_label;
  const currentEditPlanSignature = useMemo(
    () => createEditPlanSignature(transcriptSourceId, previewMode, editInstructions),
    [editInstructions, previewMode, transcriptSourceId],
  );
  const editPlanStatus: EditPlanStatus = currentEditPlanSignature !== editPlanMeta.baselineSignature
    ? "dirty"
    : editPlanMeta.baselineOrigin === "reloaded"
    ? "reloaded"
    : "clean";
  const sourceMode = resolvedLaunch.launch_context.source_mode;
  const sessionState = useMemo<HammerSessionState>(
    () => ({
      sessionId,
      sourceMode,
      previewMode,
      editPlanStatus,
    }),
    [editPlanStatus, previewMode, sessionId, sourceMode],
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
      workspace_id: resolvedLaunch.launch_context.workspace_id,
      workpiece_id: resolvedLaunch.launch_context.workpiece_id,
      session_id: sessionId,
      instructions: cloneEditInstructions(editInstructions),
    }),
    [
      editInstructions,
      editPlanMeta.createdAt,
      editPlanMeta.editPlanId,
      editPlanMeta.updatedAt,
      previewMode,
      resolvedLaunch.launch_context.workpiece_id,
      resolvedLaunch.launch_context.workspace_id,
      sessionId,
      transcriptSourceId,
    ],
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

  const selectedOverlayPlaybackRange = useMemo(
    () => (
      selectedOverlayRow
        ? playbackRanges.find((range) => range.row_id === selectedOverlayRow.row_id) ?? null
        : null
    ),
    [playbackRanges, selectedOverlayRow],
  );

  const selectedOverlaySeekTarget = useMemo<TranscriptSeekTarget>(
    () => (
      selectedOverlayPlaybackRange
        ? resolveSeekTargetForRow(selectedOverlayPlaybackRange, playbackRanges)
        : { row_id: null, timeSec: null }
    ),
    [playbackRanges, selectedOverlayPlaybackRange],
  );

  const previousPlayableTarget = useMemo(
    () => resolvePreviousPlayableSeekTarget(playbackRanges, currentTimeSec),
    [currentTimeSec, playbackRanges],
  );

  const nextPlayableTarget = useMemo(
    () => resolveNextPlayableSeekTarget(playbackRanges, currentTimeSec),
    [currentTimeSec, playbackRanges],
  );

  const jumpToActiveTarget = useMemo(
    () => resolveCurrentPlayableSeekTarget(playbackRanges, currentTimeSec),
    [currentTimeSec, playbackRanges],
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

  function seekToResolvedTarget(target: TranscriptSeekTarget) {
    if (target.timeSec == null) return;
    const targetRow = target.row_id ? (overlayRowById.get(target.row_id) ?? null) : null;
    seekTo(target.timeSec, targetRow?.row_id, targetRow?.anchor_segment_id);
    setLastPreviewSkip(null);
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

  function resetPreview() {
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
    setLastPreviewSkip(null);
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
    const parsed = parseHammerEditPlanJson(editPlanJsonDraft);
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
      baselineOrigin: "reloaded",
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

  const selectedRowEffects = formatInstructionEffects(selectedOverlayRow);
  const selectedRowPreviewStatus = [
    `current ${formatClock(currentTimeSec)}`,
    `raw ${formatPlaybackRangeLabel(rawActivePlaybackRange)}`,
    `playable ${formatPlaybackRangeLabel(activePlayableRange)}`,
    `skip ${lastPreviewSkip?.reason ?? "none"}`,
  ].join(" · ");

  return (
    <section style={ROOT_STYLE}>
      <div style={{ ...PANE_STYLE, gridTemplateRows: "auto auto auto minmax(0, 1fr)" }}>
        <HammerPaneSection
          title="Transcript Console"
          subtitle="Canonical transcript state stays on the left. Overlay rows and preview behavior derive from the edit plan."
          action={(
            <span style={getEditPlanStatusBadgeStyle(sessionState.editPlanStatus)}>
              plan {sessionState.editPlanStatus}
            </span>
          )}
        >
          <div style={META_STRIP_STYLE}>
            <span style={PILL_BASE_STYLE}>{transcriptSegments.length} segments</span>
            <span style={PILL_BASE_STYLE}>{overlayRows.length} rows</span>
            <span style={PILL_BASE_STYLE}>preview {sessionState.previewMode}</span>
            <span style={PILL_BASE_STYLE}>source {sessionState.sourceMode}</span>
          </div>
          <div style={{ display: "grid", gap: 4, fontSize: 12 }}>
            <div>transcript source: {transcriptLoad.source_label}</div>
            <div>session: {sessionState.sessionId}</div>
            <div>edit plan instructions: {editInstructions.length} (portable overlay state)</div>
          </div>
          {transcriptLoad.error ? (
            <div style={{ fontSize: 12, color: "#fde68a" }}>
              {transcriptLoad.error}
            </div>
          ) : null}
          <div style={{ fontSize: 12, opacity: 0.72 }}>
            Click a row to seek the current preview. Transcript text stays canonical; the edit plan only reshapes the overlay.
          </div>
        </HammerPaneSection>

        <HammerPaneSection
          title="Transport Controls"
          subtitle="Navigation uses the pure transcript preview helpers. Deleted spans are skipped only when edit-aware preview is active."
          action={(
            <span
              style={{
                ...PILL_BASE_STYLE,
                background: isPlaying ? "rgba(20, 184, 166, 0.16)" : PILL_BASE_STYLE.background,
                color: isPlaying ? "#99f6e4" : PILL_BASE_STYLE.color,
              }}
            >
              {isPlaying ? "PLAYING" : "PAUSED"}
            </span>
          )}
        >
          <div style={META_STRIP_STYLE}>
            <span>{formatClock(currentTimeSec)} / {formatClock(effectiveDurationSec)}</span>
            <span>active raw: {formatPlaybackRangeLabel(rawActivePlaybackRange)}</span>
            <span>active playable: {formatPlaybackRangeLabel(activePlayableRange)}</span>
            <span>skip: {lastPreviewSkip?.reason ?? "none"}</span>
          </div>
          <div style={{ ...META_STRIP_STYLE, opacity: 0.8 }}>
            <span>deleted rows: {sessionState.previewMode === "edit-aware" ? "skipped" : "raw playback"}</span>
            <span>muted rows: structural only</span>
            <span>source mode: {sessionState.sourceMode}</span>
          </div>
          <div style={ACTION_ROW_STYLE}>
            <button
              type="button"
              disabled={previousPlayableTarget.timeSec == null}
              onClick={() => seekToResolvedTarget(previousPlayableTarget)}
              title={formatSeekTargetLabel(previousPlayableTarget)}
            >
              Prev playable
            </button>
            <button type="button" onClick={() => void onTogglePlayback()} disabled={!canControlAudio}>
              {isPlaying ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              disabled={nextPlayableTarget.timeSec == null}
              onClick={() => seekToResolvedTarget(nextPlayableTarget)}
              title={formatSeekTargetLabel(nextPlayableTarget)}
            >
              Next playable
            </button>
            <button
              type="button"
              disabled={jumpToActiveTarget.timeSec == null}
              onClick={() => seekToResolvedTarget(jumpToActiveTarget)}
              title={formatSeekTargetLabel(jumpToActiveTarget)}
            >
              Jump to active
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode((currentMode) => (
                currentMode === "edit-aware" ? "raw" : "edit-aware"
              ))}
            >
              {previewMode === "edit-aware" ? "Switch to raw" : "Switch to edit-aware"}
            </button>
            <button
              type="button"
              disabled={!canControlAudio}
              onClick={() => resetPreview()}
            >
              Reset
            </button>
          </div>
          <div style={{ fontSize: 12, opacity: 0.74 }}>
            prev: {formatSeekTargetLabel(previousPlayableTarget)}
            {" · "}
            active: {formatSeekTargetLabel(jumpToActiveTarget)}
            {" · "}
            next: {formatSeekTargetLabel(nextPlayableTarget)}
          </div>
        </HammerPaneSection>

        <HammerPaneSection
          title="Row Actions"
          subtitle="Row edits stay grouped here so transport and plan controls do not scatter across the shell."
          action={(
            <span style={PILL_BASE_STYLE}>
              {selectedOverlayRow ? formatOverlayRowLabel(selectedOverlayRow) : "no row selected"}
            </span>
          )}
        >
          {selectedSegment ? (
            <div style={{ display: "grid", gap: 4, fontSize: 12 }}>
              <div style={{ color: "#dbe8ff" }}>
                {selectedSegment.segment_id} · {selectedSegment.speaker}
              </div>
              <div style={{ opacity: 0.76 }}>{selectedSegment.text}</div>
            </div>
          ) : (
            <div style={{ fontSize: 12, opacity: 0.76 }}>
              Select a transcript row to inspect it and apply segment-level edit instructions.
            </div>
          )}
          <div style={ACTION_ROW_STYLE}>
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
          </div>
          {!canMergeSelected && selectedNextSegment ? (
            <div style={{ fontSize: 12, opacity: 0.66 }}>
              Merge disabled for the selected row because the next segment speaker does not match.
            </div>
          ) : null}
        </HammerPaneSection>

        <HammerPaneSection
          title="Transcript Overlay"
          subtitle="Overlay rows remain the operational list for preview and navigation. This pane becomes the left-column workbench."
          action={(
            <span style={PILL_BASE_STYLE}>
              active {activeOverlayRow ? formatOverlayRowLabel(activeOverlayRow) : "none"}
            </span>
          )}
          sectionStyle={{ minHeight: 0, overflow: "hidden" }}
          bodyStyle={{ minHeight: 0, overflow: "hidden" }}
        >
          <div
          ref={transcriptScrollContainerRef}
          data-testid="transcript-scroll-container"
          style={{ display: "grid", gap: 8, overflow: "auto", minHeight: 0 }}
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
        </HammerPaneSection>
      </div>

      <div style={{ ...PANE_STYLE, gridTemplateRows: "auto minmax(0, 1fr)" }}>
        <HammerPaneSection
          title="Media Source Status"
          subtitle="Media wiring stays separate from transport and edit-plan controls. This pane is the future home for real source health."
          action={<span style={PILL_BASE_STYLE}>{playbackSourceLabel}</span>}
        >
          <div style={{ display: "grid", gap: 4, fontSize: 12 }}>
            <div>media source kind: {resolvedLaunch.launch_context.media.kind}</div>
            <div>media source label: {resolvedLaunch.media.source_label}</div>
            <div>media_id: <strong>{mediaRef?.media_id ?? "none"}</strong></div>
            <div>workspace_id: {resolvedLaunch.launch_context.workspace_id}</div>
            <div>local_relpath: {mediaRef?.local_relpath ?? "n/a"}</div>
            <div>source mode: {sessionState.sourceMode}</div>
          </div>
          {!resolvedLaunch.media.requires_resolution ? (
            <div style={{ fontSize: 13, opacity: 0.82 }}>
              Launch context requested generated dev-tone media. No external media resolution is required.
            </div>
          ) : resolving ? (
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
                <div style={{ ...MONO_STYLE, fontSize: 12, opacity: 0.72 }}>
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
            </>
          )}
        </HammerPaneSection>

        <HammerPaneSection
          title="Preview Stage"
          subtitle="The center pane stays intentionally simple for now: live media, playhead, and the active preview state."
          action={<span style={PILL_BASE_STYLE}>{sessionState.previewMode} preview</span>}
          sectionStyle={{ minHeight: 0, overflow: "hidden" }}
          bodyStyle={{ minHeight: 0, overflow: "auto" }}
        >
          <div
            style={{
              border: "1px solid rgba(148, 163, 184, 0.28)",
              borderRadius: 12,
              background: "linear-gradient(145deg, rgba(11, 20, 38, 0.9), rgba(2, 6, 23, 0.84))",
              padding: 12,
              display: "grid",
              gap: 12,
            }}
          >
            <div
              style={{
                border: "1px solid rgba(148, 163, 184, 0.18)",
                borderRadius: 12,
                background: "rgba(15, 23, 42, 0.54)",
                padding: 12,
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <strong style={{ color: "#dbe8ff" }}>Active Preview</strong>
                <span style={{ fontSize: 12, opacity: 0.76 }}>
                  {formatClock(currentTimeSec)} / {formatClock(effectiveDurationSec)}
                </span>
              </div>
              <div style={{ fontSize: 16, color: "#dbe8ff" }}>
                {activeOverlayRow ? formatOverlayRowLabel(activeOverlayRow) : "No active row"}
              </div>
              <div style={{ fontSize: 12, opacity: 0.72 }}>
                selected row: {selectedOverlayRow ? formatOverlayRowLabel(selectedOverlayRow) : "none"}
                {" · "}
                skip: {lastPreviewSkip?.reason ?? "none"}
              </div>
            </div>

            {resolving ? (
              <div style={{ fontSize: 13, opacity: 0.82 }}>Resolving media...</div>
            ) : resolveError ? (
              <div style={{ color: "#fecaca", fontSize: 13 }}>{resolveError}</div>
            ) : playbackSrc ? (
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
          </div>
        </HammerPaneSection>
      </div>

      <div style={{ ...PANE_STYLE, gridTemplateRows: "auto minmax(0, 0.85fr) minmax(0, 1.15fr)" }}>
        <HammerPaneSection
          title="Launch Context"
          subtitle="This shows the single launch object currently driving Hammer startup and source resolution."
          action={<span style={PILL_BASE_STYLE}>{resolvedLaunch.launch_context.source_mode}</span>}
        >
          <div style={INSPECTOR_GRID_STYLE}>
            <div>
              <div style={{ fontSize: 11, opacity: 0.62 }}>source mode</div>
              <div>{resolvedLaunch.launch_context.source_mode}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.62 }}>workspace id</div>
              <div style={MONO_STYLE}>{resolvedLaunch.launch_context.workspace_id}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.62 }}>workpiece id</div>
              <div style={MONO_STYLE}>{resolvedLaunch.launch_context.workpiece_id}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.62 }}>session id</div>
              <div style={MONO_STYLE}>{resolvedLaunch.initial_session_id ?? "none"}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.62 }}>transcript source kind</div>
              <div>{resolvedLaunch.launch_context.transcript.kind}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.62 }}>media source kind</div>
              <div>{resolvedLaunch.launch_context.media.kind}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.62 }}>edit plan present</div>
              <div>{resolvedLaunch.initial_edit_plan ? "yes" : "no"}</div>
            </div>
          </div>
        </HammerPaneSection>

        <HammerPaneSection
          title="Selected Row Inspector"
          subtitle="This is the debugging truth panel for the current row: identity, ancestry, timing, instruction effects, and resolved seek behavior."
          action={<span style={PILL_BASE_STYLE}>{selectedOverlayRow ? selectedOverlayRow.row_id : "none"}</span>}
          sectionStyle={{ minHeight: 0, overflow: "hidden" }}
          bodyStyle={{ minHeight: 0, overflow: "auto" }}
        >
          {selectedOverlayRow ? (
            <>
              <div style={INSPECTOR_GRID_STYLE}>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.62 }}>row identity</div>
                  <div style={MONO_STYLE}>{selectedOverlayRow.row_id}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.62 }}>source segment ancestry</div>
                  <div style={MONO_STYLE}>{formatSegmentAncestry(selectedOverlayRow.source_segment_ids)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.62 }}>raw timing</div>
                  <div>
                    {formatTimeDetail(selectedOverlayRow.start_sec)}
                    {" -> "}
                    {formatTimeDetail(selectedOverlayRow.end_sec)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.62 }}>playable timing</div>
                  <div>
                    {formatTimeDetail(selectedOverlayPlaybackRange?.playable_start_sec ?? null)}
                    {" -> "}
                    {formatTimeDetail(selectedOverlayPlaybackRange?.playable_end_sec ?? null)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.62 }}>playable slices</div>
                  <div>{formatPlayableSlices(selectedOverlayPlaybackRange)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.62 }}>instruction effects</div>
                  <div>{selectedRowEffects}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.62 }}>flags</div>
                  <div>
                    deleted={formatFlagState(selectedOverlayRow.is_deleted)}
                    {" · "}
                    muted={formatFlagState(selectedOverlayRow.is_muted)}
                    {" · "}
                    trimmed={formatFlagState(selectedOverlayRow.is_trimmed)}
                    {" · "}
                    merged={formatFlagState(selectedOverlayRow.structure === "merge")}
                    {" · "}
                    split={formatFlagState(selectedOverlayRow.structure === "split")}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.62 }}>seek target</div>
                  <div>{formatSeekTargetLabel(selectedOverlaySeekTarget)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.62 }}>preview status</div>
                  <div>{selectedRowPreviewStatus}</div>
                </div>
              </div>
              {selectedSegment ? (
                <div style={{ fontSize: 12, opacity: 0.76 }}>
                  selected segment: {selectedSegment.segment_id}
                  {" · "}
                  {selectedSegment.speaker}
                  {" · "}
                  {selectedSegment.text}
                </div>
              ) : null}
            </>
          ) : (
            <div style={{ fontSize: 12, opacity: 0.78 }}>No row selected.</div>
          )}
        </HammerPaneSection>

        <HammerPaneSection
          title="Edit Plan Panel"
          subtitle="Plan state, round-trip controls, and the instruction stack live together so plan-level operations stay out of row editing."
          action={(
            <span style={getEditPlanStatusBadgeStyle(sessionState.editPlanStatus)}>
              {currentEditPlan.edit_plan_id} · {sessionState.editPlanStatus}
            </span>
          )}
          sectionStyle={{ minHeight: 0, overflow: "hidden" }}
          bodyStyle={{ minHeight: 0, overflow: "auto" }}
        >
          <div style={INSPECTOR_GRID_STYLE}>
            <div>
              <div style={{ fontSize: 11, opacity: 0.62 }}>plan id</div>
              <div style={MONO_STYLE}>{currentEditPlan.edit_plan_id}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.62 }}>preview mode</div>
              <div>{sessionState.previewMode}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.62 }}>instruction count</div>
              <div>{editInstructions.length}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.62 }}>status</div>
              <div>{sessionState.editPlanStatus}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.62 }}>created</div>
              <div>{currentEditPlan.created_at}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.62 }}>updated</div>
              <div>{currentEditPlan.updated_at}</div>
            </div>
          </div>

          <div style={ACTION_ROW_STYLE}>
            <button
              type="button"
              disabled={editInstructions.length === 0}
              onClick={() => clearEdits()}
            >
              Clear edits
            </button>
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
          </div>
          <div style={{ fontSize: 12, opacity: 0.72 }}>
            Round-trip this JSON to restore overlay rows and preview semantics.
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

          <div style={{ display: "grid", gap: 6 }}>
            <strong style={{ color: "#dbe8ff" }}>Instruction Stack</strong>
            {editInstructions.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.78 }}>No edits yet.</div>
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
                        ...MONO_STYLE,
                        color: "#dbe8ff",
                      }}
                    >
                      {instruction.type.toUpperCase()}
                    </span>
                    <span style={MONO_STYLE}>
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

          <div style={{ display: "grid", gap: 8 }}>
            <strong style={{ color: "#dbe8ff" }}>Edit Plan JSON</strong>
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
                ...MONO_STYLE,
              }}
            />
          </div>
        </HammerPaneSection>
      </div>
    </section>
  );
}
