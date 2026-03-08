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
import "./TranscriptSeekMock.css";

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

type HammerWorkflowTone = "ready" | "active" | "blocked" | "future";

type TimelineClip = {
  id: string;
  start_sec: number;
  end_sec: number;
  label: string;
  tone: string;
};

type TimelineTrack = {
  id: string;
  label: string;
  clips: TimelineClip[];
};

type HammerPaneLayout = {
  left_px: number;
  center_px: number;
  right_px: number;
};

type HammerPaneResizeHandle = "left-center" | "center-right";

type HammerPaneResizeState = {
  handle: HammerPaneResizeHandle;
  startClientX: number;
  startLayout: HammerPaneLayout;
};

const DEFAULT_PREVIEW_MODE: HammerPreviewMode = "edit-aware";
const HAMMER_EDIT_PLAN_VERSION = "1";
const HAMMER_DEV_TOOL_VERSION = "forge-v1.2.0/hammer-dev";
const FALLBACK_DURATION_SEC = 32;
const DEV_AUDIO_SAMPLE_RATE = 8_000;

type TranscriptSeekMockProps = {
  launchContext?: HammerLaunchContext;
};

type WorkPanelView = "script" | "assets";
type AssetPanelView = "video" | "images" | "music";
type HammerToolId = "polish" | "audio" | "video" | "captions" | "details" | "export";
type TimelineToolId = "select" | "hand" | "cut" | "marker" | "comment" | "text";

const LEFT_PANEL_MIN_PX = 320;
const LEFT_PANEL_MAX_PX = 540;
const CENTER_PANEL_MIN_PX = 360;
const CENTER_PANEL_MAX_PX = 760;
const RIGHT_PANEL_MIN_PX = 300;
const RIGHT_PANEL_MAX_PX = 520;
const PANE_DIVIDER_WIDTH_PX = 10;
const TOOL_STRIP_WIDTH_PX = 72;
const SESSION_PANE_LAYOUT_VERSION = "v1";
const DEFAULT_PANE_LAYOUT: HammerPaneLayout = {
  left_px: 380,
  center_px: 440,
  right_px: 360,
};

const WORK_PANEL_VIEWS: Array<{ id: WorkPanelView; label: string }> = [
  { id: "script", label: "Script" },
  { id: "assets", label: "Assets" },
];

const ASSET_PANEL_VIEWS: Array<{ id: AssetPanelView; label: string }> = [
  { id: "video", label: "Video" },
  { id: "images", label: "Images" },
  { id: "music", label: "Music" },
];

const HAMMER_TOOL_ORDER: Array<{ id: HammerToolId; label: string; shortLabel: string }> = [
  { id: "polish", label: "Polish", shortLabel: "P" },
  { id: "audio", label: "Audio", shortLabel: "A" },
  { id: "video", label: "Video", shortLabel: "V" },
  { id: "captions", label: "Captions", shortLabel: "C" },
  { id: "details", label: "Details", shortLabel: "D" },
  { id: "export", label: "Export", shortLabel: "E" },
];

const TIMELINE_TOOL_ORDER: Array<{ id: TimelineToolId; label: string }> = [
  { id: "select", label: "Select" },
  { id: "hand", label: "Hand / Move" },
  { id: "cut", label: "Cut / Split" },
  { id: "marker", label: "Marker" },
  { id: "comment", label: "Comment" },
  { id: "text", label: "Text" },
];

const FILLER_PATTERN = /\b(um|uh|you know|like|sort of|kind of|i mean)\b/i;
const GAP_TIGHTENING_THRESHOLD_SEC = 0.35;

type HammerPaneSectionProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  sectionStyle?: CSSProperties;
  bodyStyle?: CSSProperties;
  sectionClassName?: string;
  bodyClassName?: string;
};

type HammerWorkflowCardProps = {
  title: string;
  tone: HammerWorkflowTone;
  statusLabel: string;
  description: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
};

function cx(...tokens: Array<string | false | null | undefined>): string {
  return tokens.filter(Boolean).join(" ");
}

function HammerWorkflowCard(props: HammerWorkflowCardProps): JSX.Element {
  return (
    <section className="hammer-workflow-card">
      <header className="hammer-workflow-card__header">
        <div className="hammer-stack-4">
          <h4 className="hammer-workflow-card__title">{props.title}</h4>
          <div className="hammer-copy-sm hammer-copy-muted">{props.description}</div>
        </div>
        <span className={getWorkflowStatusClassName(props.tone)}>
          {props.statusLabel}
        </span>
      </header>
      {props.meta ? <div className="hammer-workflow-card__meta">{props.meta}</div> : null}
      {props.actions ? <div className="hammer-action-row">{props.actions}</div> : null}
    </section>
  );
}

function HammerPaneSection(props: HammerPaneSectionProps): JSX.Element {
  return (
    <section className={cx("hammer-pane-section", props.sectionClassName)} style={props.sectionStyle}>
      <header className="hammer-pane-section__header">
        <div className="hammer-pane-section__title-wrap">
          <h3 className="hammer-pane-section__title">{props.title}</h3>
          {props.subtitle ? (
            <div className="hammer-pane-section__subtitle">{props.subtitle}</div>
          ) : null}
        </div>
        {props.action ? <div>{props.action}</div> : null}
      </header>
      <div className={cx("hammer-pane-section__body", props.bodyClassName)} style={props.bodyStyle}>
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

function hasLikelyFillerText(text: string): boolean {
  return FILLER_PATTERN.test(text);
}

function formatGapLabel(value: number | null): string {
  if (value == null || value <= 0) return "none";
  return `${value.toFixed(2)}s`;
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

function getEditPlanStatusBadgeClassName(status: EditPlanStatus): string {
  return cx(
    "hammer-pill",
    status === "dirty" && "hammer-pill--dirty",
    status === "reloaded" && "hammer-pill--reloaded",
  );
}

function getToggleButtonClassName(active: boolean): string {
  return cx("hammer-toggle-button", active && "is-active");
}

function getToolStripButtonClassName(active: boolean): string {
  return cx("hammer-tool-button", active && "is-active");
}

function getPaneDividerClassName(active: boolean): string {
  return cx("hammer-editor-shell__divider", active && "is-active");
}

function getWorkflowStatusClassName(tone: HammerWorkflowTone): string {
  return cx(
    "hammer-workflow-status",
    tone === "ready" && "is-ready",
    tone === "active" && "is-active",
    tone === "blocked" && "is-blocked",
    tone === "future" && "is-future",
  );
}

function clampPaneLayout(layout: HammerPaneLayout): HammerPaneLayout {
  return {
    left_px: clamp(layout.left_px, LEFT_PANEL_MIN_PX, LEFT_PANEL_MAX_PX),
    center_px: clamp(layout.center_px, CENTER_PANEL_MIN_PX, CENTER_PANEL_MAX_PX),
    right_px: clamp(layout.right_px, RIGHT_PANEL_MIN_PX, RIGHT_PANEL_MAX_PX),
  };
}

function readSessionPaneLayout(storageKey: string): HammerPaneLayout | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HammerPaneLayout> | null;
    if (!parsed) return null;
    if (
      typeof parsed.left_px !== "number"
      || typeof parsed.center_px !== "number"
      || typeof parsed.right_px !== "number"
    ) {
      return null;
    }
    return clampPaneLayout({
      left_px: parsed.left_px,
      center_px: parsed.center_px,
      right_px: parsed.right_px,
    });
  } catch {
    return null;
  }
}

function writeSessionPaneLayout(
  storageKey: string,
  layout: HammerPaneLayout,
): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(clampPaneLayout(layout)));
  } catch {
    // Session-level pane caching is convenience-only. Ignore storage failures.
  }
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
  const paneResizeStateRef = useRef<HammerPaneResizeState | null>(null);
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
  const paneLayoutStorageKey = useMemo(
    () => [
      "hammer-pane-layout",
      SESSION_PANE_LAYOUT_VERSION,
      resolvedLaunch.launch_context.workspace_id,
      resolvedLaunch.launch_context.workpiece_id,
    ].join(":"),
    [
      resolvedLaunch.launch_context.workpiece_id,
      resolvedLaunch.launch_context.workspace_id,
    ],
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
  const [activeWorkPanel, setActiveWorkPanel] = useState<WorkPanelView>("script");
  const [activeAssetPanel, setActiveAssetPanel] = useState<AssetPanelView>("video");
  const [activeTool, setActiveTool] = useState<HammerToolId>("polish");
  const [activeTimelineTool, setActiveTimelineTool] = useState<TimelineToolId>("select");
  const [showDebugPanels, setShowDebugPanels] = useState(false);
  const [studioSoundPrepared, setStudioSoundPrepared] = useState(false);
  const [paneLayout, setPaneLayout] = useState<HammerPaneLayout>(DEFAULT_PANE_LAYOUT);
  const [activeResizeHandle, setActiveResizeHandle] = useState<HammerPaneResizeHandle | null>(null);

  useEffect(() => {
    const persistedLayout = readSessionPaneLayout(paneLayoutStorageKey);
    setPaneLayout(persistedLayout ?? DEFAULT_PANE_LAYOUT);
  }, [paneLayoutStorageKey]);

  useEffect(() => {
    writeSessionPaneLayout(paneLayoutStorageKey, paneLayout);
  }, [paneLayout, paneLayoutStorageKey]);

  useEffect(() => {
    if (!activeResizeHandle) return;

    const onMouseMove = (event: MouseEvent) => {
      const resizeState = paneResizeStateRef.current;
      if (!resizeState) return;

      const delta = event.clientX - resizeState.startClientX;

      if (resizeState.handle === "left-center") {
        const lowerBound = Math.max(
          LEFT_PANEL_MIN_PX - resizeState.startLayout.left_px,
          resizeState.startLayout.center_px - CENTER_PANEL_MAX_PX,
        );
        const upperBound = Math.min(
          LEFT_PANEL_MAX_PX - resizeState.startLayout.left_px,
          resizeState.startLayout.center_px - CENTER_PANEL_MIN_PX,
        );
        const boundedDelta = clamp(delta, lowerBound, upperBound);
        setPaneLayout(clampPaneLayout({
          ...resizeState.startLayout,
          left_px: resizeState.startLayout.left_px + boundedDelta,
          center_px: resizeState.startLayout.center_px - boundedDelta,
        }));
        return;
      }

      const lowerBound = Math.max(
        CENTER_PANEL_MIN_PX - resizeState.startLayout.center_px,
        resizeState.startLayout.right_px - RIGHT_PANEL_MAX_PX,
      );
      const upperBound = Math.min(
        CENTER_PANEL_MAX_PX - resizeState.startLayout.center_px,
        resizeState.startLayout.right_px - RIGHT_PANEL_MIN_PX,
      );
      const boundedDelta = clamp(delta, lowerBound, upperBound);
      setPaneLayout(clampPaneLayout({
        ...resizeState.startLayout,
        center_px: resizeState.startLayout.center_px + boundedDelta,
        right_px: resizeState.startLayout.right_px - boundedDelta,
      }));
    };

    const onMouseUp = () => {
      paneResizeStateRef.current = null;
      setActiveResizeHandle(null);
    };

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [activeResizeHandle]);

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

  const selectedPreviousSegment = useMemo(() => {
    if (!selectedSegment) return null;
    const index = segmentIndexById.get(selectedSegment.segment_id);
    if (index == null || index <= 0) return null;
    return transcriptSegments[index - 1] ?? null;
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

  const fillerCandidateCount = useMemo(
    () => transcriptSegments.filter((segment) => hasLikelyFillerText(segment.text)).length,
    [transcriptSegments],
  );

  const sameSpeakerContinuationCount = useMemo(
    () => transcriptSegments.slice(0, -1).filter((segment, index) => (
      transcriptSegments[index + 1]?.speaker === segment.speaker
    )).length,
    [transcriptSegments],
  );

  const selectedGapBeforeSec = useMemo(
    () => (selectedSegment && selectedPreviousSegment
      ? Math.max(selectedSegment.start_sec - selectedPreviousSegment.end_sec, 0)
      : null),
    [selectedPreviousSegment, selectedSegment],
  );

  const selectedGapAfterSec = useMemo(
    () => (selectedSegment && selectedNextSegment
      ? Math.max(selectedNextSegment.start_sec - selectedSegment.end_sec, 0)
      : null),
    [selectedNextSegment, selectedSegment],
  );

  const selectedDurationSec = useMemo(
    () => (selectedSegment ? Math.max(selectedSegment.end_sec - selectedSegment.start_sec, 0) : null),
    [selectedSegment],
  );

  const hasSelectedGapOpportunity = Boolean(
    (selectedGapBeforeSec != null && selectedGapBeforeSec >= GAP_TIGHTENING_THRESHOLD_SEC)
    || (selectedGapAfterSec != null && selectedGapAfterSec >= GAP_TIGHTENING_THRESHOLD_SEC),
  );

  const selectedSegmentLooksLikeFiller = selectedSegment ? hasLikelyFillerText(selectedSegment.text) : false;
  const deleteInstructionCount = instructionIndex.deleteBySegmentId.size;
  const trimInstructionCount = instructionIndex.trimBySegmentId.size;
  const mergeInstructionCount = instructionIndex.mergeBySegmentId.size;
  const muteInstructionCount = instructionIndex.muteBySegmentId.size;
  const blurBackgroundBlocked = resolvedLaunch.launch_context.media.kind === "dev-tone";

  const polishSummaryItems = useMemo(() => {
    const items: string[] = [];

    if (studioSoundPrepared) {
      items.push("Studio Sound is prepared for the final audio pass.");
    }

    if (deleteInstructionCount > 0) {
      items.push(`${deleteInstructionCount} transcript cuts are staged for cleanup.`);
    }

    if (trimInstructionCount > 0) {
      items.push(`${trimInstructionCount} timing trims are staged for tighter pacing.`);
    }

    if (mergeInstructionCount > 0) {
      items.push(`${mergeInstructionCount} same-speaker continuations are merged for retake cleanup.`);
    }

    if (muteInstructionCount > 0) {
      items.push(`${muteInstructionCount} muted segments are preserved in the current edit plan.`);
    }

    return items;
  }, [
    deleteInstructionCount,
    mergeInstructionCount,
    muteInstructionCount,
    studioSoundPrepared,
    trimInstructionCount,
  ]);

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

  function beginPaneResize(handle: HammerPaneResizeHandle, clientX: number) {
    paneResizeStateRef.current = {
      handle,
      startClientX: clientX,
      startLayout: paneLayout,
    };
    setActiveResizeHandle(handle);
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

  const projectAssets = useMemo(
    () => ({
      video: [
        {
          id: mediaRef?.media_id ?? "dev-tone-preview",
          title: mediaRef?.media_id ? "Primary recording" : "Generated preview tone",
          detail: mediaRef?.local_relpath ?? resolvedLaunch.media.source_label,
          status: resolvedLaunch.media.kind === "dev-tone"
            ? "linked preview proxy"
            : resolveResult?.status ?? "launch-linked",
        },
      ],
      images: [] as Array<{ id: string; title: string; detail: string; status: string }>,
      music: [] as Array<{ id: string; title: string; detail: string; status: string }>,
    }),
    [mediaRef?.local_relpath, mediaRef?.media_id, resolvedLaunch.media.kind, resolvedLaunch.media.source_label, resolveResult?.status],
  );

  const activeAssetItems = projectAssets[activeAssetPanel];
  const previewSourceStatusLabel = useMemo(() => {
    if (!playbackSrc) return "Preview source unavailable";
    if (!resolvedLaunch.media.requires_resolution) return "Generated preview tone ready";
    if (preferDevAudioFallback || !resolvedMediaSrc) return "Running on dev-tone fallback";
    return "Mapped media connected";
  }, [
    playbackSrc,
    preferDevAudioFallback,
    resolvedLaunch.media.requires_resolution,
    resolvedMediaSrc,
  ]);
  const previewSourceDetail = useMemo(() => {
    if (resolving) return "Resolving project media for preview.";
    if (resolveError) return resolveError;
    if (resolveResult?.status === "unresolved") {
      return `${resolveResult.user_message} Preview is using the fallback tone.`;
    }
    if (badgeVm?.tooltip) return badgeVm.tooltip;
    return "Select a script row to verify timing, cuts, and pacing.";
  }, [badgeVm?.tooltip, resolveError, resolveResult, resolving]);

  const toolPanelContent = useMemo((): JSX.Element => {
    switch (activeTool) {
      case "polish":
        return (
          <div className="hammer-stack-10">
            <div className="hammer-meta-strip">
              <span className="hammer-pill">{selectedOverlayRow ? selectedOverlayRow.row_id : "select a row"}</span>
              <span className={getEditPlanStatusBadgeClassName(sessionState.editPlanStatus)}>
                {sessionState.editPlanStatus}
              </span>
              <span className="hammer-pill">{editInstructions.length} plan actions</span>
              <span className="hammer-pill">{previewSourceStatusLabel}</span>
            </div>
            <div className="hammer-copy-md">
              Polish is the first pass. It stays focused on spoken-content cleanup and enhancement, not on marketplace features or random utilities.
            </div>

            <div className="hammer-polish-focus">
              <div className="hammer-polish-focus__head">
                <strong className="hammer-copy-strong">Current Focus</strong>
                <span className="hammer-pill">{selectedRowEffects}</span>
              </div>
              {selectedOverlayRow && selectedSegment ? (
                <div className="hammer-stack-6">
                  <div className="hammer-copy-md">
                    {formatOverlayRowLabel(selectedOverlayRow)}
                  </div>
                  <div className="hammer-copy-sm hammer-copy-muted">
                    {selectedSegment.text}
                  </div>
                  <div className="hammer-meta-strip">
                    <span className="hammer-pill">duration {formatGapLabel(selectedDurationSec)}</span>
                    <span className="hammer-pill">before gap {formatGapLabel(selectedGapBeforeSec)}</span>
                    <span className="hammer-pill">after gap {formatGapLabel(selectedGapAfterSec)}</span>
                  </div>
                  <div className="hammer-copy-sm hammer-copy-muted">
                    {selectedRowPreviewStatus}
                  </div>
                </div>
              ) : (
                <div className="hammer-copy-sm hammer-copy-muted">
                  Select a transcript line in the left Script panel to drive filler cleanup, pacing trims, and retake review.
                </div>
              )}
            </div>

            <div className="hammer-workflow-grid">
              <HammerWorkflowCard
                title="Studio Sound"
                tone={studioSoundPrepared ? "active" : playbackSrc ? "ready" : "blocked"}
                statusLabel={studioSoundPrepared ? "Prepared" : playbackSrc ? "Ready" : "Unavailable"}
                description="Prepare dialogue enhancement for the final spoken-audio pass without changing the transcript edit plan."
                meta={(
                  <div className="hammer-meta-strip">
                    <span className="hammer-pill">{playbackSourceLabel}</span>
                    <span className="hammer-pill">{studioSoundPrepared ? "queued for export" : "not queued"}</span>
                  </div>
                )}
                actions={(
                  <button
                    type="button"
                    className="hammer-button-xs"
                    onClick={() => setStudioSoundPrepared((current) => !current)}
                    disabled={!playbackSrc}
                  >
                    {studioSoundPrepared ? "Remove from pass" : "Prepare audio pass"}
                  </button>
                )}
              />

              <HammerWorkflowCard
                title="Filler Cleanup"
                tone={selectedSegmentDeleteInstruction ? "active" : selectedSegment ? "ready" : "blocked"}
                statusLabel={selectedSegmentDeleteInstruction ? "Cut staged" : selectedSegment ? "Ready" : "Select a row"}
                description="Review the selected transcript line and stage a spoken-content cut when it reads like filler, drift, or unnecessary repetition."
                meta={(
                  <div className="hammer-stack-6">
                    <div className="hammer-meta-strip">
                      <span className="hammer-pill">auto hits {fillerCandidateCount}</span>
                      <span className="hammer-pill">{selectedSegmentLooksLikeFiller ? "likely filler" : "manual review"}</span>
                    </div>
                    <div className="hammer-copy-sm hammer-copy-muted">
                      {selectedSegment
                        ? selectedSegmentLooksLikeFiller
                          ? "The selected line matches the current filler-phrase heuristic."
                          : "No filler phrase was auto-detected here, but you can still stage a manual cleanup cut."
                        : "Select a transcript row to stage or restore a filler cut."}
                    </div>
                  </div>
                )}
                actions={(
                  <button
                    type="button"
                    className="hammer-button-xs"
                    onClick={() => {
                      if (!selectedSegment) return;
                      toggleDeleteInstruction(selectedSegment.segment_id);
                    }}
                    disabled={!selectedSegment}
                  >
                    {selectedSegmentDeleteInstruction ? "Restore selected line" : "Cut selected line"}
                  </button>
                )}
              />

              <HammerWorkflowCard
                title="Gap Tightening"
                tone={selectedSegmentTrimInstruction ? "active" : selectedSegment ? "ready" : "blocked"}
                statusLabel={selectedSegmentTrimInstruction ? "Trim staged" : selectedSegment ? "Ready" : "Select a row"}
                description="Use transcript selection to tighten pacing around the current line and stage non-destructive trim instructions in the edit plan."
                meta={(
                  <div className="hammer-stack-6">
                    <div className="hammer-meta-strip">
                      <span className="hammer-pill">before {formatGapLabel(selectedGapBeforeSec)}</span>
                      <span className="hammer-pill">after {formatGapLabel(selectedGapAfterSec)}</span>
                      <span className="hammer-pill">{hasSelectedGapOpportunity ? "gap candidate" : "manual tighten"}</span>
                    </div>
                    <div className="hammer-copy-sm hammer-copy-muted">
                      {selectedSegment
                        ? hasSelectedGapOpportunity
                          ? "The selected line has surrounding slack that can be tightened."
                          : "No large transcript gap is detected here, but you can still stage a pacing trim."
                        : "Select a transcript row to stage or restore timing trims."}
                    </div>
                  </div>
                )}
                actions={(
                  <button
                    type="button"
                    className="hammer-button-xs"
                    onClick={() => {
                      if (!selectedSegment) return;
                      toggleTrimInstruction(selectedSegment);
                    }}
                    disabled={!selectedSegment}
                  >
                    {selectedSegmentTrimInstruction ? "Undo timing trim" : "Tighten selected line"}
                  </button>
                )}
              />

              <HammerWorkflowCard
                title="Retake Cleanup"
                tone={selectedSegmentMergeInstruction ? "active" : canMergeSelected ? "ready" : "blocked"}
                statusLabel={selectedSegmentMergeInstruction ? "Merge staged" : canMergeSelected ? "Ready" : "Unavailable"}
                description="Clean up back-to-back same-speaker takes by merging the selected line into its continuation when the transcript supports it."
                meta={(
                  <div className="hammer-stack-6">
                    <div className="hammer-meta-strip">
                      <span className="hammer-pill">continuations {sameSpeakerContinuationCount}</span>
                      <span className="hammer-pill">
                        {selectedNextSegment ? `next ${selectedNextSegment.speaker}` : "end of transcript"}
                      </span>
                    </div>
                    <div className="hammer-copy-sm hammer-copy-muted">
                      {selectedSegmentMergeInstruction
                        ? "This merge is already staged in the current edit plan."
                        : canMergeSelected
                        ? `The next line (${selectedNextSegment?.segment_id}) continues the same speaker and can be merged.`
                        : "Select a row with a same-speaker continuation to stage retake cleanup."}
                    </div>
                  </div>
                )}
                actions={(
                  <button
                    type="button"
                    className="hammer-button-xs"
                    onClick={() => {
                      if (!selectedSegment) return;
                      toggleMergeInstruction(selectedSegment, selectedNextSegment);
                    }}
                    disabled={!selectedSegment || (!selectedSegmentMergeInstruction && !canMergeSelected)}
                  >
                    {selectedSegmentMergeInstruction ? "Undo merge" : "Merge with next line"}
                  </button>
                )}
              />

              <HammerWorkflowCard
                title="Blur Background"
                tone={blurBackgroundBlocked ? "blocked" : "future"}
                statusLabel={blurBackgroundBlocked ? "Unavailable" : "Future"}
                description="Background cleanup belongs in Polish, but it should only appear as a project-linked video enhancement once a real video polish path exists."
                meta={(
                  <div className="hammer-copy-sm hammer-copy-muted">
                    {blurBackgroundBlocked
                      ? "This launch is using preview-tone or non-video media, so background blur is intentionally unavailable."
                      : "Mapped video is present, but the blur engine is not wired into Hammer yet."}
                  </div>
                )}
              />

              <HammerWorkflowCard
                title="Eye Contact"
                tone="future"
                statusLabel="Future"
                description="Eye contact correction remains a later Polish-stage enhancement once Hammer owns the video adjustment pipeline."
                meta={(
                  <div className="hammer-copy-sm hammer-copy-muted">
                    Keep the slot visible, but do not fake the feature before the video engine exists.
                  </div>
                )}
              />
            </div>

            <div className="hammer-polish-output">
              <div className="hammer-polish-output__head">
                <strong className="hammer-copy-strong">Polish Output</strong>
                <span className="hammer-pill">{currentEditPlan.edit_plan_id}</span>
              </div>
              <div className="hammer-inspector-grid">
                <div>
                  <div className="hammer-label">cuts</div>
                  <div>{deleteInstructionCount}</div>
                </div>
                <div>
                  <div className="hammer-label">trims</div>
                  <div>{trimInstructionCount}</div>
                </div>
                <div>
                  <div className="hammer-label">merges</div>
                  <div>{mergeInstructionCount}</div>
                </div>
                <div>
                  <div className="hammer-label">studio sound</div>
                  <div>{studioSoundPrepared ? "prepared" : "not queued"}</div>
                </div>
              </div>
              {polishSummaryItems.length > 0 ? (
                <ul className="hammer-polish-output__list">
                  {polishSummaryItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <div className="hammer-copy-sm hammer-copy-muted">
                  No polish actions are staged yet. Select a row and start the first cleanup pass.
                </div>
              )}
              <div className="hammer-copy-sm hammer-copy-muted">
                Current preview: {selectedRowPreviewStatus}
              </div>
            </div>
          </div>
        );
      case "audio":
        return (
          <div className="hammer-stack-10">
            <div className="hammer-meta-strip">
              <span className="hammer-pill">dialogue track</span>
              <span className="hammer-pill">music bed</span>
              <span className="hammer-pill">voice polish</span>
            </div>
            <div className="hammer-copy-md">
              Audio stays focused on spoken clarity, bed levels, and episode consistency. Processing remains non-destructive.
            </div>
            <div className="hammer-copy-sm hammer-copy-muted">
              playback source: {playbackSourceLabel} · preview {sessionState.previewMode}
            </div>
          </div>
        );
      case "video":
        return (
          <div className="hammer-stack-10">
            <div className="hammer-meta-strip">
              <span className="hammer-pill">main video</span>
              <span className="hammer-pill">picture-in-picture</span>
              <span className="hammer-pill">visual cleanup</span>
            </div>
            <div className="hammer-copy-md">
              Video controls stay tied to the current project and launch context. Preview remains moderate so the timeline and transcript keep equal weight.
            </div>
            <div className="hammer-copy-sm hammer-copy-muted">
              source: {resolvedLaunch.media.source_label} · media kind {resolvedLaunch.launch_context.media.kind}
            </div>
          </div>
        );
      case "captions":
        return (
          <div className="hammer-stack-10">
            <div className="hammer-meta-strip">
              <span className="hammer-pill">{transcriptSegments.length} transcript segments</span>
              <span className="hammer-pill">{overlayRows.length} caption rows</span>
            </div>
            <div className="hammer-copy-md">
              Captions follow the transcript and timeline together. This panel owns subtitle timing and caption track preparation.
            </div>
          </div>
        );
      case "details":
        return (
          <div className="hammer-stack-10">
            <div className="hammer-inspector-grid">
              <div>
                <div className="hammer-label">workspace</div>
                <div className="hammer-mono">{resolvedLaunch.launch_context.workspace_id}</div>
              </div>
              <div>
                <div className="hammer-label">workpiece</div>
                <div className="hammer-mono">{resolvedLaunch.launch_context.workpiece_id}</div>
              </div>
              <div>
                <div className="hammer-label">source mode</div>
                <div>{resolvedLaunch.launch_context.source_mode}</div>
              </div>
              <div>
                <div className="hammer-label">preview mode</div>
                <div>{sessionState.previewMode}</div>
              </div>
            </div>
            <div className="hammer-copy-md hammer-copy-dim">
              Details carries project-level editing context and source metadata. Debug surfaces stay hidden unless you explicitly open them.
            </div>
          </div>
        );
      case "export":
        return (
          <div className="hammer-stack-10">
            <div className="hammer-meta-strip">
              <span className={getEditPlanStatusBadgeClassName(sessionState.editPlanStatus)}>
                {sessionState.editPlanStatus}
              </span>
              <span className="hammer-pill">main edit</span>
              <span className="hammer-pill">shorts</span>
            </div>
            <div className="hammer-copy-md">
              Export is the final delivery stage inside Hammer. Render/output controls belong here, separate from the editing work panels.
            </div>
            <div className="hammer-copy-sm hammer-copy-muted">
              current plan {currentEditPlan.edit_plan_id} · instructions {editInstructions.length}
            </div>
          </div>
        );
      default:
        return <></>;
    }
  }, [
    activeTool,
    currentEditPlan.edit_plan_id,
    blurBackgroundBlocked,
    canMergeSelected,
    currentTimeSec,
    deleteInstructionCount,
    editInstructions.length,
    fillerCandidateCount,
    hasSelectedGapOpportunity,
    instructionIndex.deleteBySegmentId,
    instructionIndex.mergeBySegmentId,
    instructionIndex.muteBySegmentId,
    instructionIndex.trimBySegmentId,
    mergeInstructionCount,
    muteInstructionCount,
    overlayRows.length,
    playbackSourceLabel,
    playbackSrc,
    polishSummaryItems,
    projectAssets,
    previewSourceStatusLabel,
    resolvedLaunch.launch_context.media.kind,
    resolvedLaunch.launch_context.source_mode,
    resolvedLaunch.launch_context.workpiece_id,
    resolvedLaunch.launch_context.workspace_id,
    resolvedLaunch.media.source_label,
    sameSpeakerContinuationCount,
    selectedDurationSec,
    selectedGapAfterSec,
    selectedGapBeforeSec,
    selectedNextSegment,
    selectedOverlayRow,
    selectedRowEffects,
    selectedRowPreviewStatus,
    selectedSegment,
    selectedSegmentDeleteInstruction,
    selectedSegmentLooksLikeFiller,
    selectedSegmentMergeInstruction,
    selectedSegmentTrimInstruction,
    sessionState.editPlanStatus,
    sessionState.previewMode,
    studioSoundPrepared,
    trimInstructionCount,
    transcriptSegments.length,
  ]);

  const timelineTracks = useMemo<TimelineTrack[]>(
    () => {
      const primaryClips = overlayRows.map((row) => ({
        id: row.row_id,
        start_sec: row.start_sec,
        end_sec: row.end_sec,
        label: row.anchor_segment_id,
        tone: row.is_deleted
          ? "#dc2626"
          : row.structure === "merge"
          ? "#0ea5e9"
          : row.structure === "split"
          ? "#818cf8"
          : "#60a5fa",
      }));

      return [
        { id: "video-main", label: "Main Video", clips: primaryClips },
        { id: "video-pip", label: "Picture-in-Picture", clips: [] },
        {
          id: "audio-dialogue",
          label: "Main Audio",
          clips: primaryClips.map((clip) => ({ ...clip, tone: "#34d399" })),
        },
        {
          id: "audio-bed",
          label: "Music / Bed Audio",
          clips: selectedSegmentMuteInstruction
            ? [{ id: "music-bed", start_sec: 0, end_sec: effectiveDurationSec, label: "bed", tone: "#f59e0b" }]
            : [],
        },
        {
          id: "text",
          label: "Text",
          clips: selectedOverlayRow
            ? [{
              id: `text_${selectedOverlayRow.row_id}`,
              start_sec: selectedOverlayRow.start_sec,
              end_sec: selectedOverlayRow.end_sec,
              label: "text",
              tone: "#f472b6",
            }]
            : [],
        },
        {
          id: "captions",
          label: "Captions",
          clips: primaryClips.map((clip) => ({ ...clip, tone: "#c084fc" })),
        },
      ];
    },
    [effectiveDurationSec, overlayRows, selectedOverlayRow, selectedSegmentMuteInstruction],
  );

  const playheadPercent = clamp((currentTimeSec / effectiveDurationSec) * 100, 0, 100);
  const activeToolDefinition = HAMMER_TOOL_ORDER.find((tool) => tool.id === activeTool) ?? HAMMER_TOOL_ORDER[0];
  const upperPaneMinWidth = paneLayout.left_px
    + paneLayout.center_px
    + paneLayout.right_px
    + TOOL_STRIP_WIDTH_PX
    + (PANE_DIVIDER_WIDTH_PX * 2);

  return (
    <section className="hammer-editor-shell">
      <div className="hammer-editor-shell__upper-wrap">
        <div
          className="hammer-editor-shell__upper"
          style={{
            gridTemplateColumns: [
              `${paneLayout.left_px}px`,
              `${PANE_DIVIDER_WIDTH_PX}px`,
              `minmax(${paneLayout.center_px}px, 1fr)`,
              `${PANE_DIVIDER_WIDTH_PX}px`,
              `${paneLayout.right_px}px`,
              `${TOOL_STRIP_WIDTH_PX}px`,
            ].join(" "),
            minWidth: upperPaneMinWidth,
          }}
        >
          <div
            className="hammer-pane hammer-pane--left"
            style={{ gridTemplateRows: "minmax(0, 1fr)" }}
          >
        {activeWorkPanel === "script" ? (
        <>
        <HammerPaneSection
          title="Script"
          subtitle="Transcript navigation is the primary editing surface. Select a line to seek the monitor and apply spoken-content edits."
          action={(
            <div className="hammer-tab-row">
              {WORK_PANEL_VIEWS.map((panel) => (
                <button
                  key={panel.id}
                  type="button"
                  onClick={() => setActiveWorkPanel(panel.id)}
                  className={getToggleButtonClassName(activeWorkPanel === panel.id)}
                >
                  {panel.label}
                </button>
              ))}
            </div>
          )}
        >
          <div className="hammer-meta-strip">
            <span className="hammer-pill">{overlayRows.length} lines</span>
            <span className="hammer-pill">{selectedOverlayRow ? "line selected" : "select a line"}</span>
            <span className="hammer-pill">{activeOverlayRow ? "preview locked" : "ready to preview"}</span>
          </div>
          {selectedSegment ? (
            <div className="hammer-script-panel__selection">
              <div className="hammer-stack-4">
                <div className="hammer-copy-sm hammer-copy-strong">
                {selectedSegment.segment_id} · {selectedSegment.speaker}
                </div>
                <div className="hammer-copy-sm hammer-copy-muted">{selectedSegment.text}</div>
              </div>
              <div className="hammer-action-row">
                <button
                  type="button"
                  disabled={!selectedSegment}
                  onClick={() => {
                    if (!selectedSegment) return;
                    toggleDeleteInstruction(selectedSegment.segment_id);
                  }}
                >
                  {selectedSegmentDeleteInstruction ? "Restore" : "Delete"}
                </button>
                <button
                  type="button"
                  disabled={!selectedSegment}
                  onClick={() => {
                    if (!selectedSegment) return;
                    toggleMuteInstruction(selectedSegment.segment_id);
                  }}
                >
                  {selectedSegmentMuteInstruction ? "Unmute" : "Mute"}
                </button>
                <button
                  type="button"
                  disabled={!selectedSegment}
                  onClick={() => {
                    if (!selectedSegment) return;
                    toggleTrimInstruction(selectedSegment);
                  }}
                >
                  {selectedSegmentTrimInstruction ? "Undo trim" : "Trim"}
                </button>
                <button
                  type="button"
                  disabled={!selectedSegment}
                  onClick={() => {
                    if (!selectedSegment) return;
                    toggleSplitInstruction(selectedSegment);
                  }}
                >
                  {selectedSegmentSplitInstruction ? "Undo split" : "Split"}
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
                <div className="hammer-copy-sm hammer-copy-muted">
                  Merge is disabled because the next segment speaker does not match.
                </div>
              ) : null}
              {transcriptLoad.error ? (
                <div className="hammer-copy-sm hammer-copy-warning">
                  {transcriptLoad.error}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="hammer-script-panel__selection">
              <div className="hammer-copy-sm hammer-copy-muted">
              Select a transcript row to inspect it and apply segment-level edit instructions.
              </div>
              {transcriptLoad.error ? (
                <div className="hammer-copy-sm hammer-copy-warning">
                  {transcriptLoad.error}
                </div>
              ) : null}
            </div>
          )}
        </HammerPaneSection>

        <HammerPaneSection
          title="Transcript"
          subtitle="Click any line to seek the monitor. Transcript editing and preview navigation operate on the same current project state."
          action={(
            <span className="hammer-pill">
              active {activeOverlayRow ? formatOverlayRowLabel(activeOverlayRow) : "none"}
            </span>
          )}
          sectionStyle={{ minHeight: 0, overflow: "hidden" }}
          bodyStyle={{ minHeight: 0, overflow: "hidden" }}
        >
          <div
            ref={transcriptScrollContainerRef}
            data-testid="transcript-scroll-container"
            className="hammer-script-panel__list"
          >
          {overlayRows.length > 0 ? (
            overlayRows.map((row) => {
              const anchorSegment = segmentById.get(row.anchor_segment_id) ?? null;
              if (!anchorSegment) return null;

              const rowPlaybackRange = playbackRanges.find((range) => range.row_id === row.row_id) ?? null;
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
                      className="hammer-script-row__button"
                    >
                      <div className="hammer-script-row__meta">
                        <span className="hammer-copy-sm hammer-copy-muted">
                          {formatClock(row.start_sec)}-{formatClock(row.end_sec)} {row.speaker}
                        </span>
                        {row.structure !== "base" ? (
                          <span className="hammer-pill">{row.structure}</span>
                        ) : null}
                        {isActive ? (
                          <span className="hammer-copy-sm" style={{ color: "#99f6e4" }}>active</span>
                        ) : null}
                        {row.is_muted ? (
                          <span className="hammer-copy-sm" style={{ color: "#fde68a" }}>mute</span>
                        ) : null}
                        {row.is_trimmed ? (
                          <span className="hammer-copy-sm" style={{ color: "#c4b5fd" }}>trim</span>
                        ) : null}
                      </div>

                      <div className="hammer-script-blocks">
                        {row.blocks.map((block) => (
                          <div key={block.block_id} className="hammer-script-block">
                            <div className="hammer-label">
                              {block.label ? `${block.label} · ` : ""}
                              {formatClock(block.start_sec)}-{formatClock(block.end_sec)}
                            </div>
                            <div
                              className="hammer-copy-md"
                              style={{ textDecoration: row.is_deleted ? "line-through" : "none" }}
                            >
                              {block.text}
                            </div>
                          </div>
                        ))}
                      </div>
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="hammer-copy-md hammer-copy-dim">
                No transcript segments loaded.
              </div>
            )}
        </div>
        </HammerPaneSection>
        </>
        ) : (
          <HammerPaneSection
            title="Assets"
            subtitle="Assets stays limited to project-linked video, images, and music already attached to this workpiece."
            action={(
              <div className="hammer-tab-row">
                {WORK_PANEL_VIEWS.map((panel) => (
                  <button
                    key={panel.id}
                    type="button"
                    onClick={() => setActiveWorkPanel(panel.id)}
                    className={getToggleButtonClassName(activeWorkPanel === panel.id)}
                  >
                    {panel.label}
                  </button>
                ))}
              </div>
            )}
            sectionStyle={{ minHeight: 0, overflow: "hidden" }}
            bodyStyle={{ minHeight: 0, overflow: "auto" }}
          >
            <div className="hammer-tab-row">
              {ASSET_PANEL_VIEWS.map((panel) => (
                <button
                  key={panel.id}
                  type="button"
                  onClick={() => setActiveAssetPanel(panel.id)}
                  className={getToggleButtonClassName(activeAssetPanel === panel.id)}
                >
                  {panel.label}
                </button>
              ))}
            </div>
            <div className="hammer-meta-strip">
              <span className="hammer-pill">{projectAssets.video.length} video</span>
              <span className="hammer-pill">{projectAssets.images.length} images</span>
              <span className="hammer-pill">{projectAssets.music.length} music</span>
            </div>
            {activeAssetItems.length > 0 ? (
              activeAssetItems.map((asset) => (
                <div key={asset.id} className="hammer-asset-card">
                  <div className="hammer-asset-card__header">
                    <strong className="hammer-copy-strong">{asset.title}</strong>
                    <span className="hammer-pill">{asset.status}</span>
                  </div>
                  <div className="hammer-copy-sm hammer-copy-muted hammer-mono">{asset.id}</div>
                  <div className="hammer-copy-sm">{asset.detail}</div>
                </div>
              ))
            ) : (
              <div className="hammer-copy-md hammer-copy-dim">
                No {activeAssetPanel} assets are linked to this workpiece yet.
              </div>
            )}
          </HammerPaneSection>
        )}
      </div>

      <button
        type="button"
        aria-label="Resize left and center Hammer panes"
        title="Drag to resize the left and center panes"
        onMouseDown={(event) => {
          event.preventDefault();
          beginPaneResize("left-center", event.clientX);
        }}
        className={getPaneDividerClassName(activeResizeHandle === "left-center")}
      />

      <div
        className="hammer-pane hammer-pane--center"
        style={{ gridTemplateRows: "minmax(0, 1fr)" }}
      >
        <HammerPaneSection
          title="Preview Monitor"
          subtitle="The monitor stays modest inside the workspace, but it is the unmistakable place to verify playback, timing, and pacing."
          action={(
            <div className="hammer-action-row">
              <span className={cx("hammer-pill", isPlaying && "hammer-pill--playing")}>
                {isPlaying ? "Playing" : "Paused"}
              </span>
              <span className="hammer-pill">{sessionState.previewMode} preview</span>
              <span className="hammer-pill">{previewSourceStatusLabel}</span>
            </div>
          )}
          sectionClassName="hammer-preview-panel"
          bodyClassName="hammer-preview-panel__body"
        >
          <div className="hammer-preview-stage">
            <div className="hammer-monitor">
              <div className="hammer-monitor__chrome">
                <div className="hammer-stack-4">
                  <div className="hammer-label">Preview Window</div>
                  <div className="hammer-copy-sm hammer-copy-muted">{previewSourceDetail}</div>
                </div>
                <div className="hammer-meta-strip">
                  <span className="hammer-pill">{playbackSourceLabel}</span>
                  <span className="hammer-pill">
                    {selectedOverlayRow ? selectedOverlayRow.row_id : "no row selected"}
                  </span>
                </div>
              </div>

              <div className="hammer-monitor__surface">
                <div className="hammer-monitor__center">
                  {resolving ? (
                    <>
                      <div className="hammer-monitor__eyebrow">Connecting Preview</div>
                      <h4 className="hammer-monitor__title">Resolving project media</h4>
                      <div className="hammer-monitor__hint">{previewSourceDetail}</div>
                    </>
                  ) : resolveError ? (
                    <>
                      <div className="hammer-monitor__eyebrow">Preview Warning</div>
                      <h4 className="hammer-monitor__title">Preview source needs attention</h4>
                      <div className="hammer-monitor__hint">{previewSourceDetail}</div>
                    </>
                  ) : !playbackSrc ? (
                    <>
                      <div className="hammer-monitor__eyebrow">Preview Offline</div>
                      <h4 className="hammer-monitor__title">No playback source available</h4>
                      <div className="hammer-monitor__hint">
                        Add or resolve project media to use the preview monitor.
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="hammer-monitor__eyebrow">Video Preview</div>
                      <h4 className="hammer-monitor__title">
                        {activeOverlayRow
                          ? formatOverlayRowLabel(activeOverlayRow)
                          : selectedOverlayRow
                          ? formatOverlayRowLabel(selectedOverlayRow)
                          : "Ready for review"}
                      </h4>
                      <div className="hammer-monitor__hint">{previewSourceDetail}</div>
                      <div className="hammer-meta-strip">
                        <span className="hammer-pill">
                          {formatClock(currentTimeSec)} / {formatClock(effectiveDurationSec)}
                        </span>
                        <span className="hammer-pill">
                          selected {selectedOverlayRow ? selectedOverlayRow.row_id : "none"}
                        </span>
                        {lastPreviewSkip ? (
                          <span className="hammer-pill">skip {lastPreviewSkip.reason}</span>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {!resolving && !resolveError && playbackSrc ? (
              <>
                <audio
                  ref={audioRef}
                  src={playbackSrc}
                  className="hammer-audio-hidden"
                  preload="metadata"
                  data-testid="hammer-audio-player"
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
              </>
            ) : null}

            {playbackError ? (
              <div className="hammer-preview-feedback hammer-copy-sm hammer-copy-error">{playbackError}</div>
            ) : null}

            <div className="hammer-preview-transport">
              <div className="hammer-preview-transport__head">
                <div className="hammer-stack-4">
                  <strong className="hammer-copy-strong">Transport</strong>
                  <div className="hammer-copy-sm hammer-copy-muted">
                    Playback, seek, and preview-mode controls stay with the monitor instead of the transcript pane.
                  </div>
                </div>
                <div className="hammer-meta-strip">
                  <span className={cx("hammer-pill", isPlaying && "hammer-pill--playing")}>
                    {isPlaying ? "playing" : "paused"}
                  </span>
                  <span className="hammer-pill">{sessionState.previewMode}</span>
                </div>
              </div>

              <div className="hammer-action-row">
                <button
                  type="button"
                  onClick={() => seekToResolvedTarget(previousPlayableTarget)}
                  disabled={previousPlayableTarget.timeSec == null}
                  className="hammer-button-xs"
                >
                  Prev playable
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void onTogglePlayback();
                  }}
                  disabled={!canControlAudio}
                  className="hammer-button-xs"
                >
                  {isPlaying ? "Pause" : "Play"}
                </button>
                <button
                  type="button"
                  onClick={() => seekToResolvedTarget(nextPlayableTarget)}
                  disabled={nextPlayableTarget.timeSec == null}
                  className="hammer-button-xs"
                >
                  Next playable
                </button>
                <button
                  type="button"
                  onClick={() => seekToResolvedTarget(jumpToActiveTarget)}
                  disabled={jumpToActiveTarget.timeSec == null}
                  className="hammer-button-xs"
                >
                  Jump to active
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode((current) => (current === "raw" ? "edit-aware" : "raw"))}
                  className="hammer-button-xs"
                >
                  {sessionState.previewMode === "raw" ? "Edit-aware" : "Raw"}
                </button>
                <button
                  type="button"
                  onClick={resetPreview}
                  className="hammer-button-xs"
                >
                  Reset
                </button>
              </div>

              <div className="hammer-copy-md">
                Time: {formatClock(currentTimeSec)} / {formatClock(effectiveDurationSec)}
                {" · "}
                Source: {previewSourceStatusLabel}
                {" · "}
                Skip: {lastPreviewSkip?.reason ?? "none"}
              </div>

              <div className="hammer-stack-6">
                <div className="hammer-progress-track">
                  <div
                    className="hammer-progress-fill"
                    style={{
                      width: `${progressPercent}%`,
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
          </div>
        </HammerPaneSection>
      </div>

      <button
        type="button"
        aria-label="Resize center and right Hammer panes"
        title="Drag to resize the center and right panes"
        onMouseDown={(event) => {
          event.preventDefault();
          beginPaneResize("center-right", event.clientX);
        }}
        className={getPaneDividerClassName(activeResizeHandle === "center-right")}
      />

      <div className="hammer-pane hammer-pane--right">
        <HammerPaneSection
          title={`${activeToolDefinition.label} Panel`}
          subtitle="The far-right workflow strip selects the tool. This content panel changes immediately and deterministically with the current tool."
          action={(
            <div className="hammer-action-row">
              <span className="hammer-pill">{activeToolDefinition.label}</span>
              <button
                type="button"
                onClick={() => setShowDebugPanels((current) => !current)}
                className={getToggleButtonClassName(showDebugPanels)}
              >
                {showDebugPanels ? "Hide Debug" : "Show Debug"}
              </button>
            </div>
          )}
        >
          {toolPanelContent}
        </HammerPaneSection>

        {showDebugPanels ? (
          <>
        <HammerPaneSection
          title="Launch Context"
          subtitle="This shows the single launch object currently driving Hammer startup and source resolution."
          action={<span className="hammer-pill">{resolvedLaunch.launch_context.source_mode}</span>}
        >
          <div className="hammer-inspector-grid">
            <div>
              <div style={{ fontSize: 11, opacity: 0.62 }}>source mode</div>
              <div>{resolvedLaunch.launch_context.source_mode}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.62 }}>workspace id</div>
              <div className="hammer-mono">{resolvedLaunch.launch_context.workspace_id}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.62 }}>workpiece id</div>
              <div className="hammer-mono">{resolvedLaunch.launch_context.workpiece_id}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.62 }}>session id</div>
              <div className="hammer-mono">{resolvedLaunch.initial_session_id ?? "none"}</div>
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
          action={<span className="hammer-pill">{selectedOverlayRow ? selectedOverlayRow.row_id : "none"}</span>}
          sectionStyle={{ minHeight: 0, overflow: "hidden" }}
          bodyStyle={{ minHeight: 0, overflow: "auto" }}
        >
          {selectedOverlayRow ? (
            <>
              <div className="hammer-inspector-grid">
                <div>
                  <div style={{ fontSize: 11, opacity: 0.62 }}>row identity</div>
                  <div className="hammer-mono">{selectedOverlayRow.row_id}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.62 }}>source segment ancestry</div>
                  <div className="hammer-mono">{formatSegmentAncestry(selectedOverlayRow.source_segment_ids)}</div>
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
            <span className={getEditPlanStatusBadgeClassName(sessionState.editPlanStatus)}>
              {currentEditPlan.edit_plan_id} · {sessionState.editPlanStatus}
            </span>
          )}
          sectionStyle={{ minHeight: 0, overflow: "hidden" }}
          bodyStyle={{ minHeight: 0, overflow: "auto" }}
        >
          <div className="hammer-inspector-grid">
            <div>
              <div style={{ fontSize: 11, opacity: 0.62 }}>plan id</div>
              <div className="hammer-mono">{currentEditPlan.edit_plan_id}</div>
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

          <div className="hammer-action-row">
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
                        color: "#dbe8ff",
                      }}
                      className="hammer-mono"
                    >
                      {instruction.type.toUpperCase()}
                    </span>
                    <span className="hammer-mono">
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
              }}
              className="hammer-mono"
            />
          </div>
        </HammerPaneSection>
        </>
        ) : (
          <HammerPaneSection
            title="Debug Panels"
            subtitle="Launch context, inspector, and edit-plan round-trip diagnostics are hidden until explicitly requested."
            action={<span className="hammer-pill">hidden</span>}
          >
            <div style={{ fontSize: 13, opacity: 0.78 }}>
              Toggle debug to inspect launch payloads, row truth data, and edit-plan JSON round-trip state without turning the main editor into a diagnostics console.
            </div>
          </HammerPaneSection>
        )}
      </div>

      <div className="hammer-pane hammer-pane--tool-strip">
        <div className="hammer-tool-strip__head">
          <strong className="hammer-tool-strip__title">
            Tools
          </strong>
          <span className="hammer-tool-strip__caption">
            Fixed workflow strip
          </span>
        </div>
        {HAMMER_TOOL_ORDER.map((tool) => (
          <button
            key={tool.id}
            type="button"
            onClick={() => setActiveTool(tool.id)}
            className={getToolStripButtonClassName(activeTool === tool.id)}
          >
            <strong style={{ fontSize: 18, lineHeight: 1 }}>{tool.shortLabel}</strong>
            <span style={{ fontSize: 11 }}>{tool.label}</span>
          </button>
        ))}
      </div>
        </div>
      </div>

      <div className="hammer-pane hammer-pane--timeline">
        <HammerPaneSection
          title="Timeline"
          subtitle="Hammer stays transcript-first, but the bottom timeline remains a real multi-track editing surface for placement, layering, and track-aware work."
          action={(
            <div className="hammer-tab-row">
              {TIMELINE_TOOL_ORDER.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => setActiveTimelineTool(tool.id)}
                  className={getToggleButtonClassName(activeTimelineTool === tool.id)}
                >
                  {tool.label}
                </button>
              ))}
            </div>
          )}
          sectionStyle={{ minHeight: 0, overflow: "hidden" }}
          bodyStyle={{ minHeight: 0, overflow: "auto" }}
        >
          <div className="hammer-meta-strip">
            <span className="hammer-pill">tool {activeTimelineTool}</span>
            <span className="hammer-pill">tracks {timelineTracks.length}</span>
            <span className="hammer-pill">playhead {formatClock(currentTimeSec)}</span>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {timelineTracks.map((track) => (
              <div key={track.id} className="hammer-timeline-track">
                <div className="hammer-timeline-track__label">
                  <strong className="hammer-timeline-track__title">{track.label}</strong>
                  <span className="hammer-timeline-track__meta">{track.id}</span>
                </div>
                <div className="hammer-track-viewport">
                  <div className="hammer-track-viewport__backdrop" />
                  {track.clips.map((clip) => {
                    const left = clamp((clip.start_sec / effectiveDurationSec) * 100, 0, 100);
                    const width = clamp(((clip.end_sec - clip.start_sec) / effectiveDurationSec) * 100, 1.2, 100);
                    return (
                      <div
                        key={clip.id}
                        title={`${clip.label} · ${formatClock(clip.start_sec)}-${formatClock(clip.end_sec)}`}
                        className="hammer-timeline-clip"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          background: clip.tone,
                        }}
                      >
                        {clip.label}
                      </div>
                    );
                  })}
                  <div
                    aria-hidden="true"
                    className="hammer-track-viewport__playhead"
                    style={{ left: `${playheadPercent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </HammerPaneSection>
      </div>
    </section>
  );
}
