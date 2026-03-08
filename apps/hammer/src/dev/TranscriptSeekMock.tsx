import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, JSX, ReactNode } from "react";
import { useLocation } from "react-router-dom";
import type {
  MediaKind,
  MediaRef,
  ResolveMediaResult,
  WorkspaceMediaMapping,
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
  parseHammerEditPlanJson,
  resolveHammerLaunchContext,
} from "../lib/launchContext";
import type { ResolvedHammerLaunchContext } from "../lib/launchContext";
import { toMediaBadgeViewModel } from "../media/mediaBadgeViewModel";
import { V1HammerMediaResolver } from "../media/resolveMedia";
import { loadWorkspaceMapping } from "../media/workspaceMapping";
import { resolveHammerDevLaunchContext } from "./hammerLaunchPresets";
import { StagedEditsPanel } from "./StagedEditsPanel";
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
type TranscriptRowStageMarkerTone = "delete" | "mute" | "trim" | "split" | "merge";
type TranscriptRowStageMarker = {
  id: TranscriptRowStageMarkerTone;
  label: string;
  tone: TranscriptRowStageMarkerTone;
};

type TimelineClip = {
  id: string;
  start_sec: number;
  end_sec: number;
  label: string;
  tone: string;
  linked_row_id?: string | null;
  linked_segment_id?: string | null;
  editable?: boolean;
  ripple_hint?: boolean;
};

type TimelineTrack = {
  id: string;
  label: string;
  clips: TimelineClip[];
};

type TimelineRulerTick = {
  id: string;
  label: string;
  positionPercent: number;
};

type HammerProjectAsset = {
  id: string;
  title: string;
  kindLabel: string;
  sourceLabel: string;
  detail: string;
  status: string;
  usageHint: string;
  workpieceId: string;
  durationLabel: string | null;
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

type HammerDevRecordingEntry = {
  media_id: string;
  name: string;
  extension: string;
  kind: MediaKind;
  local_relpath: string;
  transcript_sidecar_relpath: string | null;
  byte_size: number | null;
  modified_at: string | null;
};

type HammerDevRecordingResponse =
  | {
    ok: true;
    local_root_abs: string;
    directory_abs: string;
    files: HammerDevRecordingEntry[];
  }
  | {
    ok: false;
    error: string;
  };

const DEFAULT_PREVIEW_MODE: HammerPreviewMode = "edit-aware";
const HAMMER_EDIT_PLAN_VERSION = "1";
const HAMMER_DEV_TOOL_VERSION = "forge-v1.2.0/hammer-dev";
const FALLBACK_DURATION_SEC = 32;
const DEV_AUDIO_SAMPLE_RATE = 8_000;
const DEV_RECORDINGS_FALLBACK_ROOT_ABS = "C:\\Users\\Iam11\\OneDrive\\Documents\\Podcasters Forge\\Recordings";

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
const TIMELINE_RULER_DIVISIONS = 6;

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

function formatDurationMs(totalMs: number | null | undefined): string | null {
  if (totalMs == null || !Number.isFinite(totalMs) || totalMs <= 0) return null;
  return formatClock(totalMs / 1000);
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

function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${Math.round(value * 100)}%`;
}

function formatByteSize(totalBytes: number | null | undefined): string {
  if (totalBytes == null || !Number.isFinite(totalBytes) || totalBytes < 0) return "size unavailable";
  if (totalBytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = totalBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const decimals = value >= 100 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

function formatDateTimeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatExtensionLabel(extension: string): string {
  const normalized = extension.trim().replace(/^\./, "");
  return normalized ? normalized.toUpperCase() : "MEDIA";
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

function getTranscriptRowStageMarkerClassName(tone: TranscriptRowStageMarkerTone): string {
  return cx(
    "hammer-script-row__status-pill",
    tone === "delete" && "is-delete",
    tone === "mute" && "is-mute",
    tone === "trim" && "is-trim",
    tone === "split" && "is-split",
    tone === "merge" && "is-merge",
  );
}

function formatMediaKindLabel(kind: MediaKind | null | undefined): string {
  switch (kind) {
    case "recording_video":
      return "Recording Video";
    case "recording_audio":
      return "Recording Audio";
    case "export_video":
      return "Export Video";
    case "export_audio":
      return "Export Audio";
    case "asset_image":
      return "Image Asset";
    case "asset_broll":
      return "B-Roll Asset";
    case "asset_audio":
      return "Audio Asset";
    default:
      return "Linked Asset";
  }
}

function formatSourceModeLabel(mode: HammerLaunchSourceMode): string {
  switch (mode) {
    case "dev":
      return "Dev launch";
    case "mapped":
      return "Mapped media";
    case "tongs":
      return "Tongs-linked";
    default:
      return mode;
  }
}

function getTimelineToolHint(tool: TimelineToolId): string {
  switch (tool) {
    case "select":
      return "Select mode keeps transcript-linked clips in focus so you can inspect the current row across tracks.";
    case "hand":
      return "Hand / Move mode is reserved for timeline navigation and future repositioning work.";
    case "cut":
      return "Cut / Split mode exposes trim edges and ripple cues where downstream timing would shift.";
    case "marker":
      return "Marker mode is the future home for review anchors and editorial notes.";
    case "comment":
      return "Comment mode will add discussion anchors without changing the edit plan.";
    case "text":
      return "Text mode prepares title cards and transcript-linked overlays without leaving Hammer.";
    default:
      return "Timeline tools stay grounded in the current transcript and edit-plan state.";
  }
}

function getHammerToolHint(tool: HammerToolId): string {
  switch (tool) {
    case "polish":
      return "Polish owns the first cleanup pass: spoken-content cuts, pacing trims, and early enhancement decisions.";
    case "audio":
      return "Audio stays scoped to dialogue clarity, bed balance, and consistent spoken sound once that workflow opens up.";
    case "video":
      return "Video remains tied to project media, framing, and visual cleanup without pulling the edit away from the transcript.";
    case "captions":
      return "Captions stays transcript-linked so subtitle timing follows the edit instead of becoming a separate timing system.";
    case "details":
      return "Details carries project context, launch facts, and session-level metadata without turning Hammer into a settings maze.";
    case "export":
      return "Export is the delivery lane for the main cut and derivative outputs after the edit is locked.";
    default:
      return "Hammer tools stay grounded in project state, transcript timing, and the current edit plan.";
  }
}

function getTimelineTrackRoleLabel(trackId: string): string {
  switch (trackId) {
    case "video-main":
      return "primary picture";
    case "video-pip":
      return "secondary picture";
    case "audio-dialogue":
      return "spoken audio";
    case "audio-bed":
      return "music / ambience";
    case "text":
      return "titles / overlays";
    case "captions":
      return "subtitle track";
    default:
      return "track";
  }
}

function getTimelineTrackEmptyMessage(trackId: string, hasSelectedRow: boolean): string {
  switch (trackId) {
    case "video-pip":
      return "No picture-in-picture clip is staged on this edit yet.";
    case "audio-bed":
      return "No music bed is staged yet. Audio work will place bed clips here.";
    case "text":
      return hasSelectedRow
        ? "No text overlay is staged on the selected row yet."
        : "Select a row to preview transcript-linked text timing here.";
    default:
      return "No clips are staged on this track yet.";
  }
}

function buildTimelineRulerTicks(durationSec: number): TimelineRulerTick[] {
  const safeDurationSec = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 1;
  return Array.from({ length: TIMELINE_RULER_DIVISIONS + 1 }, (_, index) => {
    const ratio = index / TIMELINE_RULER_DIVISIONS;
    return {
      id: `tick_${index}`,
      label: formatClock(safeDurationSec * ratio),
      positionPercent: ratio * 100,
    };
  });
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

function getTranscriptRowStageMarkers(row: TranscriptOverlayRow): TranscriptRowStageMarker[] {
  const markers: TranscriptRowStageMarker[] = [];

  if (row.is_deleted) {
    markers.push({ id: "delete", label: "Delete staged", tone: "delete" });
  }

  if (row.is_muted) {
    markers.push({ id: "mute", label: "Mute staged", tone: "mute" });
  }

  if (row.is_trimmed) {
    markers.push({ id: "trim", label: "Trim staged", tone: "trim" });
  }

  if (row.split_instruction || row.structure === "split") {
    markers.push({ id: "split", label: "Split staged", tone: "split" });
  }

  if (row.merge_instruction || row.structure === "merge") {
    markers.push({ id: "merge", label: "Merge staged", tone: "merge" });
  }

  return markers;
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
  const transcriptRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const activeRowRef = useRef<HTMLDivElement | null>(null);
  const transcriptRevealTimeoutRef = useRef<number | null>(null);
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
  const launchMediaRef = resolvedLaunch.media.media_ref;
  const [resolveResult, setResolveResult] = useState<ResolveMediaResult | null>(null);
  const [resolving, setResolving] = useState(resolvedLaunch.media.requires_resolution);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [workspaceMapping, setWorkspaceMapping] = useState<WorkspaceMediaMapping | null>(
    resolvedLaunch.media.workspace_mapping ?? null,
  );
  const [workspaceMappingError, setWorkspaceMappingError] = useState<string | null>(null);
  const [devRecordings, setDevRecordings] = useState<HammerDevRecordingEntry[]>([]);
  const [devRecordingsDirectoryAbs, setDevRecordingsDirectoryAbs] = useState<string | null>(null);
  const [devRecordingsRootMapping, setDevRecordingsRootMapping] = useState<WorkspaceMediaMapping | null>(null);
  const [devRecordingsLoading, setDevRecordingsLoading] = useState(false);
  const [devRecordingsError, setDevRecordingsError] = useState<string | null>(null);
  const [devRecordingsRefreshToken, setDevRecordingsRefreshToken] = useState(0);
  const [selectedDevRecordingId, setSelectedDevRecordingId] = useState<string | null>(null);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [durationSec, setDurationSec] = useState(FALLBACK_DURATION_SEC);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeOverlayRowId, setActiveOverlayRowId] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(
    firstSegment?.segment_id ?? null,
  );
  const [selectedOverlayRowId, setSelectedOverlayRowId] = useState<string | null>(null);
  const [revealedTranscriptRowId, setRevealedTranscriptRowId] = useState<string | null>(null);
  const [pendingTranscriptRevealRowId, setPendingTranscriptRevealRowId] = useState<string | null>(null);
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
  const [noiseCleanupPrepared, setNoiseCleanupPrepared] = useState(false);
  const [levelConsistencyPrepared, setLevelConsistencyPrepared] = useState(false);
  const [paneLayout, setPaneLayout] = useState<HammerPaneLayout>(DEFAULT_PANE_LAYOUT);
  const [activeResizeHandle, setActiveResizeHandle] = useState<HammerPaneResizeHandle | null>(null);
  const launchWorkspaceMapping = useMemo(
    () => resolvedLaunch.media.workspace_mapping ?? workspaceMapping,
    [resolvedLaunch.media.workspace_mapping, workspaceMapping],
  );
  const devRecordingsFallbackMapping = useMemo<WorkspaceMediaMapping>(() => ({
    workspace_id: resolvedLaunch.launch_context.workspace_id,
    local_root_abs: DEV_RECORDINGS_FALLBACK_ROOT_ABS,
  }), [resolvedLaunch.launch_context.workspace_id]);
  const devRecordingsCandidateMappings = useMemo(() => {
    const mappings = [launchWorkspaceMapping, devRecordingsFallbackMapping].filter(
      (mapping): mapping is WorkspaceMediaMapping => Boolean(mapping),
    );
    const seenRoots = new Set<string>();
    return mappings.filter((mapping) => {
      const key = mapping.local_root_abs.toLowerCase();
      if (seenRoots.has(key)) return false;
      seenRoots.add(key);
      return true;
    });
  }, [devRecordingsFallbackMapping, launchWorkspaceMapping]);
  const activeDevRecording = useMemo(
    () => devRecordings.find((recording) => recording.media_id === selectedDevRecordingId) ?? null,
    [devRecordings, selectedDevRecordingId],
  );
  const activeDevMediaRef = useMemo<MediaRef | null>(
    () => (activeDevRecording
      ? {
        media_id: activeDevRecording.media_id,
        kind: activeDevRecording.kind,
        source_hint: "local",
        local_relpath: activeDevRecording.local_relpath,
        byte_size: activeDevRecording.byte_size ?? undefined,
      }
      : null),
    [activeDevRecording],
  );
  const activeMediaRef = activeDevMediaRef ?? launchMediaRef;
  const activeMediaRequiresResolution = activeDevMediaRef
    ? true
    : resolvedLaunch.media.requires_resolution;
  const activeMediaWorkspaceMapping = activeDevMediaRef
    ? devRecordingsRootMapping
    : launchWorkspaceMapping;
  const activeSourceMode: HammerLaunchSourceMode = activeDevMediaRef
    ? "mapped"
    : resolvedLaunch.launch_context.source_mode;
  const activeMediaSourceLabel = activeDevRecording?.name ?? resolvedLaunch.media.source_label;
  const activeMediaKind = activeMediaRef?.kind ?? null;
  const activeMediaUsesDevTone = !activeDevMediaRef && resolvedLaunch.media.kind === "dev-tone";
  const activeMediaDisplayTitle = activeDevRecording?.name
    ?? activeMediaRef?.local_relpath?.split(/[\\/]/).pop()
    ?? resolvedLaunch.media.source_label;
  const activeMediaDetailLabel = activeDevRecording?.local_relpath
    ?? activeMediaRef?.local_relpath
    ?? resolvedLaunch.media.source_label;
  const transcriptStatusLabel = activeDevRecording
    ? activeDevRecording.transcript_sidecar_relpath
      ? "Transcript: sidecar detected"
      : "Transcript: mock fallback"
    : transcriptLoad.kind === "fixture"
    ? "Transcript: mock fallback"
    : `Transcript: ${transcriptLoad.source_label}`;
  const transcriptStatusDetail = activeDevRecording
    ? activeDevRecording.transcript_sidecar_relpath
      ? "A transcript sidecar was found for this media. Hammer is still using the current transcript until transcript import is wired."
      : "No transcript found for this media. Hammer is keeping the current transcript as a mock fallback."
    : "Select a recording below to attach real media while Hammer keeps the current transcript stable.";

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
    let active = true;
    const launchMapping = resolvedLaunch.media.workspace_mapping ?? null;
    setWorkspaceMapping(launchMapping);
    setWorkspaceMappingError(null);

    void loadWorkspaceMapping(resolvedLaunch.launch_context.workspace_id)
      .then((mapping) => {
        if (!active) return;
        if (mapping) {
          setWorkspaceMapping(mapping);
          return;
        }
        setWorkspaceMapping(launchMapping);
        if (!launchMapping) {
          setWorkspaceMappingError("No runtime workspace mapping is configured for this workspace yet.");
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        setWorkspaceMapping(launchMapping);
        if (!launchMapping) {
          setWorkspaceMappingError(toErrorMessage(error, "Failed to load workspace mapping."));
        }
      });

    return () => {
      active = false;
    };
  }, [resolvedLaunch.launch_context.workspace_id, resolvedLaunch.media.workspace_mapping]);

  useEffect(() => {
    if (devRecordingsCandidateMappings.length === 0) {
      setDevRecordings([]);
      setDevRecordingsDirectoryAbs(null);
      setDevRecordingsRootMapping(null);
      setDevRecordingsError("No mapped recordings root is available for this dev session.");
      setDevRecordingsLoading(false);
      return;
    }

    let active = true;
    setDevRecordingsLoading(true);
    setDevRecordingsError(null);

    void (async () => {
      let lastError = "Failed to load recordings from the mapped media folder.";

      for (const mapping of devRecordingsCandidateMappings) {
        try {
          const url = new URL("/api/hammer/dev-recordings", window.location.origin);
          url.searchParams.set("local_root_abs", mapping.local_root_abs);
          const response = await fetch(url.toString(), {
            headers: { accept: "application/json" },
          });
          const payload = await response.json() as HammerDevRecordingResponse;
          if (!response.ok || !payload.ok) {
            lastError = payload.ok ? "Failed to load recordings from the mapped media folder." : payload.error;
            continue;
          }

          if (!active) return;
          setDevRecordings(payload.files);
          setDevRecordingsDirectoryAbs(payload.directory_abs);
          setDevRecordingsRootMapping({
            workspace_id: mapping.workspace_id,
            local_root_abs: payload.local_root_abs,
          });
          setDevRecordingsError(null);
          setSelectedDevRecordingId((current) => (
            current && payload.files.some((recording) => recording.media_id === current)
              ? current
              : null
          ));
          return;
        } catch (error) {
          lastError = toErrorMessage(error, "Failed to load recordings from the mapped media folder.");
        }
      }

      if (!active) return;
      setDevRecordings([]);
      setDevRecordingsDirectoryAbs(null);
      setDevRecordingsRootMapping(null);
      setSelectedDevRecordingId(null);
      setDevRecordingsError(lastError);
    })()
      .finally(() => {
        if (!active) return;
        setDevRecordingsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [devRecordingsCandidateMappings, devRecordingsRefreshToken]);

  useEffect(() => {
    if (!activeMediaRequiresResolution || !activeMediaRef) {
      setResolving(false);
      setResolveError(null);
      setResolveResult(null);
      return;
    }

    let active = true;
    setResolving(true);
    setResolveError(null);
    setResolveResult(null);

    void resolver.resolveMedia(activeMediaWorkspaceMapping, activeMediaRef)
      .then((result) => {
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
  }, [activeMediaRef, activeMediaRequiresResolution, activeMediaWorkspaceMapping, resolver]);

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
    if (activeMediaUsesDevTone) return "dev-tone";
    if (preferDevAudioFallback || !resolvedMediaSrc) return "dev-tone";
    return activeMediaSourceLabel;
  }, [activeMediaSourceLabel, activeMediaUsesDevTone, playbackSrc, preferDevAudioFallback, resolvedMediaSrc]);

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
  }, [activeMediaRef?.media_id, firstSegment?.segment_id, resolvedMediaSrc]);

  useEffect(() => {
    setEditInstructions(cloneEditInstructions(resolvedLaunch.initial_edit_plan?.instructions ?? []));
    setPreviewMode(resolvedLaunch.initial_preview_mode);
    setSessionId(resolvedLaunch.initial_session_id ?? createEntityId("session"));
    setEditPlanMeta(createLaunchEditPlanMeta(resolvedLaunch));
    setEditPlanJsonDraft(buildInitialEditPlanJsonDraft(resolvedLaunch));
    setEditPlanFeedback(null);
    setEditPlanFeedbackTone("neutral");
    setStudioSoundPrepared(false);
    setNoiseCleanupPrepared(false);
    setLevelConsistencyPrepared(false);
    setSelectedDevRecordingId(null);
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
  const overlayRowBySegmentId = useMemo(
    () => {
      const nextMap = new Map<string, TranscriptOverlayRow>();

      for (const row of overlayRows) {
        if (!nextMap.has(row.anchor_segment_id)) {
          nextMap.set(row.anchor_segment_id, row);
        }

        for (const sourceSegmentId of row.source_segment_ids) {
          if (!nextMap.has(sourceSegmentId)) {
            nextMap.set(sourceSegmentId, row);
          }
        }
      }

      return nextMap;
    },
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
  const sourceMode = activeSourceMode;
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

  const projectDialogueDurationSec = useMemo(
    () => transcriptSegments.reduce(
      (sum, segment) => sum + Math.max(segment.end_sec - segment.start_sec, 0),
      0,
    ),
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
  const blurBackgroundBlocked = activeMediaUsesDevTone;
  const mutedDialogueDurationSec = useMemo(
    () => transcriptSegments.reduce((sum, segment) => (
      instructionIndex.muteBySegmentId.has(segment.segment_id)
        ? sum + Math.max(segment.end_sec - segment.start_sec, 0)
        : sum
    ), 0),
    [instructionIndex, transcriptSegments],
  );
  const dialogueCoveragePercent = effectiveDurationSec > 0
    ? clamp(projectDialogueDurationSec / effectiveDurationSec, 0, 1)
    : null;
  const audioMonitoringStateLabel = !playbackSrc
    ? "Unavailable"
    : preferDevAudioFallback || activeMediaUsesDevTone
    ? "Fallback monitor"
    : "Linked source";
  const selectedAudioStateLabel = !selectedSegment
    ? "No row selected"
    : selectedSegmentDeleteInstruction
    ? "Cut in plan"
    : selectedSegmentMuteInstruction
    ? "Muted in plan"
    : selectedSegmentTrimInstruction
    ? "Timing staged"
    : studioSoundPrepared
    ? "Ready for polish"
    : "Monitoring";
  const audioPassCount = Number(studioSoundPrepared)
    + Number(noiseCleanupPrepared)
    + Number(levelConsistencyPrepared);

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
  const audioSummaryItems = useMemo(() => {
    const items: string[] = [];

    if (studioSoundPrepared) {
      items.push("Studio Sound is staged for the spoken-audio pass.");
    }

    if (noiseCleanupPrepared) {
      items.push("Noise cleanup review is staged, but Hammer is still carrying pass state rather than a real reduction engine.");
    }

    if (levelConsistencyPrepared) {
      items.push("Level consistency review is staged for project-wide dialogue balancing.");
    }

    if (muteInstructionCount > 0) {
      items.push(`${muteInstructionCount} dialogue segments are muted across ${formatClock(mutedDialogueDurationSec)} of material.`);
    }

    if (selectedSegment && selectedSegmentMuteInstruction) {
      items.push(`${selectedSegment.segment_id} is currently muted in the edit plan.`);
    }

    if (preferDevAudioFallback || activeMediaUsesDevTone) {
      items.push("Preview is monitoring a fallback source, so audio review is currently about structure and staging rather than final sound.");
    }

    return items;
  }, [
    levelConsistencyPrepared,
    muteInstructionCount,
    mutedDialogueDurationSec,
    noiseCleanupPrepared,
    preferDevAudioFallback,
    activeMediaUsesDevTone,
    selectedSegment,
    selectedSegmentMuteInstruction,
    studioSoundPrepared,
  ]);

  useEffect(() => (
    () => {
      if (transcriptRevealTimeoutRef.current != null) {
        window.clearTimeout(transcriptRevealTimeoutRef.current);
      }
    }
  ), []);

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

  useEffect(() => {
    if (!pendingTranscriptRevealRowId) return;

    const container = transcriptScrollContainerRef.current;
    const rowElement = transcriptRowRefs.current.get(pendingTranscriptRevealRowId) ?? null;
    if (!container || !rowElement) return;

    const centeredTop = rowElement.offsetTop - (container.clientHeight / 2) + (rowElement.clientHeight / 2);
    const boundedTop = clamp(
      centeredTop,
      0,
      Math.max(container.scrollHeight - container.clientHeight, 0),
    );
    container.scrollTo({
      top: boundedTop,
      behavior: "smooth",
    });

    setRevealedTranscriptRowId(pendingTranscriptRevealRowId);
    if (transcriptRevealTimeoutRef.current != null) {
      window.clearTimeout(transcriptRevealTimeoutRef.current);
    }
    transcriptRevealTimeoutRef.current = window.setTimeout(() => {
      setRevealedTranscriptRowId((currentRowId) => (
        currentRowId === pendingTranscriptRevealRowId ? null : currentRowId
      ));
    }, 900);
    setPendingTranscriptRevealRowId(null);
  }, [overlayRows, pendingTranscriptRevealRowId]);

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

  function revealTranscriptRow(rowId: string): boolean {
    const container = transcriptScrollContainerRef.current;
    const rowElement = transcriptRowRefs.current.get(rowId) ?? null;
    if (!container || !rowElement) {
      return false;
    }

    const centeredTop = rowElement.offsetTop - (container.clientHeight / 2) + (rowElement.clientHeight / 2);
    const boundedTop = clamp(
      centeredTop,
      0,
      Math.max(container.scrollHeight - container.clientHeight, 0),
    );
    container.scrollTo({
      top: boundedTop,
      behavior: "smooth",
    });

    setRevealedTranscriptRowId(rowId);
    if (transcriptRevealTimeoutRef.current != null) {
      window.clearTimeout(transcriptRevealTimeoutRef.current);
    }
    transcriptRevealTimeoutRef.current = window.setTimeout(() => {
      setRevealedTranscriptRowId((currentRowId) => (currentRowId === rowId ? null : currentRowId));
    }, 900);
    return true;
  }

  function inspectStagedInstruction(instruction: HammerEditInstruction) {
    const targetRow = overlayRowBySegmentId.get(instruction.segment_id)
      ?? (instruction.type === "merge"
        ? overlayRowBySegmentId.get(instruction.merge_with_segment_id) ?? null
        : null);

    setActiveWorkPanel("script");
    setSelectedSegmentId(instruction.segment_id);
    setPendingTranscriptRevealRowId(null);

    if (!targetRow) {
      return;
    }

    setSelectedOverlayRowId(targetRow.row_id);
    if (!revealTranscriptRow(targetRow.row_id)) {
      setPendingTranscriptRevealRowId(targetRow.row_id);
    }
  }

  function selectTimelineClip(clip: TimelineClip) {
    if (clip.linked_row_id) {
      const linkedRow = overlayRowById.get(clip.linked_row_id) ?? null;
      if (linkedRow) {
        seekToRow(linkedRow);
        return;
      }
    }

    seekTo(clip.start_sec, undefined, clip.linked_segment_id ?? undefined);
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
  const timelineFocusRow = activeOverlayRow ?? selectedOverlayRow;
  const timelineFocusLabel = timelineFocusRow ? formatOverlayRowLabel(timelineFocusRow) : "none";
  const timelineToolHint = getTimelineToolHint(activeTimelineTool);
  const selectedRowHasTimelineEditCue = Boolean(
    selectedOverlayRow?.is_deleted
    || selectedOverlayRow?.is_trimmed
    || selectedSegmentDeleteInstruction
    || selectedSegmentTrimInstruction
    || selectedSegmentSplitInstruction
    || selectedSegmentMergeInstruction,
  );
  const timelineRippleLabel = !selectedOverlayRow
    ? "Select a transcript row to see where ripple or trim behavior would matter."
    : selectedOverlayRow.is_deleted || selectedSegmentDeleteInstruction
    ? "This row is staged as a cut, so downstream row-linked clips would close the gap."
    : selectedOverlayRow.is_trimmed || selectedSegmentTrimInstruction
    ? "This row has a timing trim staged; trim edges show where the edit would tighten."
    : selectedSegmentSplitInstruction
    ? "This row has a split staged; the cut point is now the primary timeline cue."
    : selectedSegmentMergeInstruction
    ? "This row is merged into the next same-speaker line, reducing the visible boundary."
    : "No ripple or trim action is staged on the selected row yet.";
  const sourceModeLabel = formatSourceModeLabel(activeSourceMode);
  const resolvedDurationMs = resolveResult?.status === "ok" ? resolveResult.duration_ms ?? null : null;
  const primaryAssetDurationLabel = formatDurationMs(activeMediaRef?.duration_ms ?? resolvedDurationMs)
    ?? formatClock(transcriptDurationSec);

  const projectAssets = useMemo(
    () => {
      const assets: Record<AssetPanelView, HammerProjectAsset[]> = {
        video: [],
        images: [],
        music: [],
      };

      const primaryAsset: HammerProjectAsset = {
        id: activeMediaRef?.media_id ?? "media_dev_tone_preview",
        title: activeDevRecording ? "Attached Dev Recording" : activeMediaRef?.media_id ? "Primary Source Media" : "Generated Preview Proxy",
        kindLabel: activeMediaRef ? formatMediaKindLabel(activeMediaRef.kind) : "Preview Proxy",
        sourceLabel: sourceModeLabel,
        detail: activeMediaDetailLabel,
        status: activeMediaUsesDevTone
          ? "preview proxy"
          : activeDevRecording
          ? resolveResult?.status === "ok"
            ? "attached"
            : resolveResult?.status === "unresolved"
            ? "needs relink"
            : "attaching"
          : resolveResult?.status === "ok"
          ? "linked"
          : resolveResult?.status === "unresolved"
          ? "needs relink"
          : "launch-linked",
        usageHint: activeMediaUsesDevTone
          ? "This proxy keeps Hammer previewable in dev mode until a real workpiece media source is attached."
          : activeDevRecording
          ? "This local dev recording is attached as the current preview source while Hammer keeps the current transcript loaded."
          : "This is the launch-linked source media backing the current edit and preview path.",
        workpieceId: resolvedLaunch.launch_context.workpiece_id,
        durationLabel: primaryAssetDurationLabel,
      };

      if (!activeMediaRef || activeMediaRef.kind === "recording_video" || activeMediaRef.kind === "export_video" || activeMediaRef.kind === "recording_audio" || activeMediaRef.kind === "export_audio" || activeMediaUsesDevTone) {
        assets.video.push(primaryAsset);
      } else if (activeMediaRef.kind === "asset_image" || activeMediaRef.kind === "asset_broll") {
        assets.images.push(primaryAsset);
      } else if (activeMediaRef.kind === "asset_audio") {
        assets.music.push(primaryAsset);
      } else {
        assets.video.push(primaryAsset);
      }

      return assets;
    },
    [
      activeDevRecording,
      activeMediaDetailLabel,
      activeMediaRef,
      activeMediaUsesDevTone,
      primaryAssetDurationLabel,
      resolveResult?.status,
      resolvedLaunch.launch_context.workpiece_id,
      sourceModeLabel,
    ],
  );

  const activeAssetItems = projectAssets[activeAssetPanel];
  const activeAssetViewDefinition = ASSET_PANEL_VIEWS.find((panel) => panel.id === activeAssetPanel) ?? ASSET_PANEL_VIEWS[0];
  const linkedAssetCount = projectAssets.video.length + projectAssets.images.length + projectAssets.music.length;
  const activeAssetEmptyMessage = useMemo(() => {
    switch (activeAssetPanel) {
      case "video":
        return "No video media is linked to this workpiece yet.";
      case "images":
        return "No images are linked to this workpiece yet.";
      case "music":
        return "No music assets are available for this edit yet.";
      default:
        return "No assets are linked to this workpiece yet.";
    }
  }, [activeAssetPanel]);
  const previewSourceStatusLabel = useMemo(() => {
    if (!playbackSrc) return "Preview source unavailable";
    if (!activeMediaRequiresResolution) return "Generated preview tone ready";
    if (preferDevAudioFallback || !resolvedMediaSrc) return "Running on dev-tone fallback";
    return activeDevRecording ? "Dev recording connected" : "Mapped media connected";
  }, [
    activeDevRecording,
    activeMediaRequiresResolution,
    playbackSrc,
    preferDevAudioFallback,
    resolvedMediaSrc,
  ]);
  const previewSourceDetail = useMemo(() => {
    if (resolving) {
      return activeDevRecording
        ? "Connecting the selected recording for preview."
        : "Resolving project media for preview.";
    }
    if (resolveError) return resolveError;
    if (resolveResult?.status === "unresolved") {
      return `${resolveResult.user_message} Preview is using the fallback tone.`;
    }
    if (activeDevRecording) {
      return activeDevRecording.transcript_sidecar_relpath
        ? "Selected recording is attached. Transcript import is not wired yet, so Hammer is still using the current transcript."
        : "Selected recording is attached. No transcript was found, so Hammer is using the current transcript as a mock fallback.";
    }
    if (badgeVm?.tooltip) return badgeVm.tooltip;
    return "Select a script row to verify timing, cuts, and pacing.";
  }, [activeDevRecording, badgeVm?.tooltip, resolveError, resolveResult, resolving]);
  const selectionSummaryTitle = selectedSegment ? "Primary segment" : "No active selection";
  const selectionSummaryCountLabel = selectedSegment ? "1 segment selected" : "No segment selected";
  const selectionSummaryDetail = selectedSegment
    ? "Next tool actions will target the current transcript selection."
    : "Select a transcript row to tell Hammer what the next tool action should act on.";
  const selectionSummaryScopeLabel = selectedOverlayRow
    ? formatOverlayRowLabel(selectedOverlayRow)
    : selectedSegment
    ? selectedSegment.segment_id
    : "none";

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
              <span className="hammer-pill">{audioMonitoringStateLabel}</span>
              <span className="hammer-pill">{muteInstructionCount} muted lines</span>
              <span className="hammer-pill">{audioPassCount} staged audio passes</span>
              <span className="hammer-pill">{previewSourceStatusLabel}</span>
            </div>
            <div className="hammer-copy-md">
              Audio stays focused on spoken clarity, transcript-linked dialogue review, and project-wide consistency. This is not a DAW surface.
            </div>

            <div className="hammer-audio-focus">
              <div className="hammer-audio-focus__head">
                <strong className="hammer-copy-strong">Current Audio Focus</strong>
                <span className="hammer-pill">{selectedAudioStateLabel}</span>
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
                    <span className="hammer-pill">{selectedSegment.speaker}</span>
                    <span className="hammer-pill">duration {formatTimeDetail(selectedDurationSec)}</span>
                    <span className="hammer-pill">source {audioMonitoringStateLabel}</span>
                    <span className="hammer-pill">
                      {selectedRowHasTimelineEditCue ? selectedRowEffects : "clean row"}
                    </span>
                  </div>
                  <div className="hammer-inspector-grid">
                    <div>
                      <div className="hammer-label">selection</div>
                      <div className="hammer-mono">{selectedSegment.segment_id}</div>
                    </div>
                    <div>
                      <div className="hammer-label">audio state</div>
                      <div>{selectedAudioStateLabel}</div>
                    </div>
                    <div>
                      <div className="hammer-label">gaps</div>
                      <div>
                        before {formatGapLabel(selectedGapBeforeSec)}
                        {" · "}
                        after {formatGapLabel(selectedGapAfterSec)}
                      </div>
                    </div>
                    <div>
                      <div className="hammer-label">preview</div>
                      <div>{selectedRowPreviewStatus}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="hammer-copy-sm hammer-copy-muted">
                  Select a transcript line to inspect dialogue timing, mute state, and spoken-audio cleanup context.
                </div>
              )}
            </div>

            <div className="hammer-workflow-grid">
              <HammerWorkflowCard
                title="Dialogue Track Focus"
                tone={selectedSegmentDeleteInstruction || selectedSegmentMuteInstruction ? "active" : selectedSegment ? "ready" : "blocked"}
                statusLabel={selectedSegmentDeleteInstruction
                  ? "Cut in plan"
                  : selectedSegmentMuteInstruction
                  ? "Muted"
                  : selectedSegment
                  ? "Ready"
                  : "Select a row"}
                description="Keep spoken-content review close to transcript selection by muting or restoring the current dialogue line without leaving Hammer's main edit flow."
                meta={(
                  <div className="hammer-stack-6">
                    <div className="hammer-meta-strip">
                      <span className="hammer-pill">{selectedSegment ? selectedSegment.speaker : "no speaker"}</span>
                      <span className="hammer-pill">duration {formatTimeDetail(selectedDurationSec)}</span>
                      <span className="hammer-pill">{selectedRowHasTimelineEditCue ? selectedRowEffects : "clean row"}</span>
                    </div>
                    <div className="hammer-copy-sm hammer-copy-muted">
                      {selectedSegmentDeleteInstruction
                        ? "This line is already staged as a cut, so dialogue muting is secondary."
                        : selectedSegmentMuteInstruction
                        ? "This dialogue line is muted in the current edit plan and can be restored here."
                        : selectedSegment
                        ? "Use mute for spoken lines that should drop out without changing the surrounding transcript structure."
                        : "Select a transcript row to control the current dialogue line."}
                    </div>
                  </div>
                )}
                actions={(
                  <button
                    type="button"
                    className="hammer-button-xs"
                    onClick={() => {
                      if (!selectedSegment) return;
                      toggleMuteInstruction(selectedSegment.segment_id);
                    }}
                    disabled={!selectedSegment || Boolean(selectedSegmentDeleteInstruction)}
                  >
                    {selectedSegmentMuteInstruction ? "Restore selected line" : "Mute selected line"}
                  </button>
                )}
              />

              <HammerWorkflowCard
                title="Studio Sound"
                tone={studioSoundPrepared ? "active" : playbackSrc ? "ready" : "blocked"}
                statusLabel={studioSoundPrepared ? "Prepared" : playbackSrc ? "Ready" : "Unavailable"}
                description="Prepare dialogue enhancement for the final spoken-audio pass without changing the transcript edit plan."
                meta={(
                  <div className="hammer-stack-6">
                    <div className="hammer-meta-strip">
                      <span className="hammer-pill">{playbackSourceLabel}</span>
                      <span className="hammer-pill">{studioSoundPrepared ? "queued for export" : "not queued"}</span>
                    </div>
                    <div className="hammer-copy-sm hammer-copy-muted">
                      {playbackSrc
                        ? "Keep Studio Sound visible here so spoken-audio finishing has a clear handoff out of editorial cleanup."
                        : "Resolve a playback source before queuing the spoken-audio finishing pass."}
                    </div>
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
                title="Noise Cleanup"
                tone={noiseCleanupPrepared ? "active" : playbackSrc ? "ready" : "blocked"}
                statusLabel={noiseCleanupPrepared ? "Review staged" : playbackSrc ? "Stage only" : "Unavailable"}
                description="Stage a spoken-audio cleanup review for hiss, room tone, and handling noise before final finishing."
                meta={(
                  <div className="hammer-stack-6">
                    <div className="hammer-meta-strip">
                      <span className="hammer-pill">{audioMonitoringStateLabel}</span>
                      <span className="hammer-pill">{playbackSourceLabel}</span>
                    </div>
                    <div className="hammer-copy-sm hammer-copy-muted">
                      {playbackSrc
                        ? "The pass state is real, but the cleanup engine is not wired yet. Keep the workflow visible without pretending the DSP exists."
                        : "Audio cleanup stays unavailable until Hammer has a monitorable source."}
                    </div>
                  </div>
                )}
                actions={(
                  <button
                    type="button"
                    className="hammer-button-xs"
                    onClick={() => setNoiseCleanupPrepared((current) => !current)}
                    disabled={!playbackSrc}
                  >
                    {noiseCleanupPrepared ? "Remove cleanup review" : "Stage cleanup review"}
                  </button>
                )}
              />

              <HammerWorkflowCard
                title="Level Consistency"
                tone={levelConsistencyPrepared ? "active" : playbackSrc ? "ready" : "blocked"}
                statusLabel={levelConsistencyPrepared ? "Pass staged" : playbackSrc ? "Ready" : "Unavailable"}
                description="Prepare a dialogue-level consistency pass so spoken-word energy stays stable across the episode."
                meta={(
                  <div className="hammer-stack-6">
                    <div className="hammer-meta-strip">
                      <span className="hammer-pill">coverage {formatPercent(dialogueCoveragePercent)}</span>
                      <span className="hammer-pill">muted {formatClock(mutedDialogueDurationSec)}</span>
                      <span className="hammer-pill">project {formatClock(projectDialogueDurationSec)}</span>
                    </div>
                    <div className="hammer-copy-sm hammer-copy-muted">
                      {playbackSrc
                        ? "Use this to stage the project-wide leveling pass before export. It remains non-destructive for now."
                        : "Resolve project audio first so consistency review has something real to monitor."}
                    </div>
                  </div>
                )}
                actions={(
                  <button
                    type="button"
                    className="hammer-button-xs"
                    onClick={() => setLevelConsistencyPrepared((current) => !current)}
                    disabled={!playbackSrc}
                  >
                    {levelConsistencyPrepared ? "Remove consistency pass" : "Stage consistency pass"}
                  </button>
                )}
              />

              <HammerWorkflowCard
                title="Music Bed"
                tone="future"
                statusLabel="Future"
                description="Music bed shaping belongs in Audio once Hammer starts placing scoped bed clips instead of only showing the bed lane on the timeline."
                meta={(
                  <div className="hammer-copy-sm hammer-copy-muted">
                    Keep the slot visible so Audio reads as the home for spoken audio first, bed work second.
                  </div>
                )}
              />
            </div>

            <div className="hammer-audio-output">
              <div className="hammer-audio-output__head">
                <strong className="hammer-copy-strong">Audio Output</strong>
                <span className="hammer-pill">{currentEditPlan.edit_plan_id}</span>
              </div>
              <div className="hammer-inspector-grid">
                <div>
                  <div className="hammer-label">dialogue coverage</div>
                  <div>
                    {formatClock(projectDialogueDurationSec)}
                    {" · "}
                    {formatPercent(dialogueCoveragePercent)}
                  </div>
                </div>
                <div>
                  <div className="hammer-label">muted dialogue</div>
                  <div>
                    {muteInstructionCount} lines
                    {" · "}
                    {formatClock(mutedDialogueDurationSec)}
                  </div>
                </div>
                <div>
                  <div className="hammer-label">staged passes</div>
                  <div>{audioPassCount}</div>
                </div>
                <div>
                  <div className="hammer-label">monitoring</div>
                  <div>{audioMonitoringStateLabel}</div>
                </div>
              </div>
              {audioSummaryItems.length > 0 ? (
                <ul className="hammer-audio-output__list">
                  {audioSummaryItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <div className="hammer-copy-sm hammer-copy-muted">
                  No audio passes are staged yet. Select a row or prepare a spoken-audio pass.
                </div>
              )}
              <div className="hammer-copy-sm hammer-copy-muted">
                Current preview: {selectedRowPreviewStatus}
              </div>
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
              source: {activeMediaSourceLabel} · media kind {activeMediaKind ?? resolvedLaunch.launch_context.media.kind}
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
                <div>{sourceModeLabel}</div>
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
    audioMonitoringStateLabel,
    audioPassCount,
    audioSummaryItems,
    dialogueCoveragePercent,
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
    levelConsistencyPrepared,
    mergeInstructionCount,
    muteInstructionCount,
    mutedDialogueDurationSec,
    noiseCleanupPrepared,
    overlayRows.length,
    playbackSourceLabel,
    playbackSrc,
    polishSummaryItems,
    projectAssets,
    projectDialogueDurationSec,
    previewSourceStatusLabel,
    activeMediaKind,
    activeMediaSourceLabel,
    activeSourceMode,
    resolvedLaunch.launch_context.workpiece_id,
    resolvedLaunch.launch_context.workspace_id,
    sameSpeakerContinuationCount,
    selectedDurationSec,
    selectedAudioStateLabel,
    selectedGapAfterSec,
    selectedGapBeforeSec,
    selectedNextSegment,
    selectedOverlayRow,
    selectedRowHasTimelineEditCue,
    selectedRowEffects,
    selectedRowPreviewStatus,
    selectedSegment,
    selectedSegmentDeleteInstruction,
    selectedSegmentLooksLikeFiller,
    selectedSegmentMergeInstruction,
    selectedSegmentMuteInstruction,
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
        linked_row_id: row.row_id,
        linked_segment_id: row.anchor_segment_id,
        editable: true,
        ripple_hint: row.is_deleted || row.is_trimmed || row.structure !== "base",
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
            ? [{
              id: "music-bed",
              start_sec: 0,
              end_sec: effectiveDurationSec,
              label: "bed",
              tone: "#f59e0b",
              linked_row_id: selectedOverlayRow?.row_id ?? null,
              linked_segment_id: selectedOverlayRow?.anchor_segment_id ?? null,
              editable: false,
              ripple_hint: false,
            }]
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
              linked_row_id: selectedOverlayRow.row_id,
              linked_segment_id: selectedOverlayRow.anchor_segment_id,
              editable: true,
              ripple_hint: selectedOverlayRow.is_trimmed || selectedOverlayRow.is_deleted,
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
  const activeToolHint = getHammerToolHint(activeTool);
  const activeTimelineToolDefinition = TIMELINE_TOOL_ORDER.find((tool) => tool.id === activeTimelineTool) ?? TIMELINE_TOOL_ORDER[0];
  const timelineRulerTicks = useMemo(
    () => buildTimelineRulerTicks(effectiveDurationSec),
    [effectiveDurationSec],
  );
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
                  aria-pressed={activeWorkPanel === panel.id}
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
                  className="hammer-button-xs"
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
                  className="hammer-button-xs"
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
                  className="hammer-button-xs"
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
                  className="hammer-button-xs"
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
                  className="hammer-button-xs"
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
              const rowStageMarkers = getTranscriptRowStageMarkers(row);
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
                    if (element) {
                      transcriptRowRefs.current.set(row.row_id, element);
                    } else {
                      transcriptRowRefs.current.delete(row.row_id);
                    }
                    if (isActive) {
                      activeRowRef.current = element;
                    }
                  }}
                  className={cx(
                    "hammer-script-row",
                    revealedTranscriptRowId === row.row_id && "is-revealed",
                  )}
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
                        {isActive ? (
                          <span className="hammer-copy-sm" style={{ color: "#99f6e4" }}>active</span>
                        ) : null}
                      </div>
                      {rowStageMarkers.length > 0 ? (
                        <div className="hammer-script-row__status-list">
                          {rowStageMarkers.map((marker) => (
                            <span
                              key={marker.id}
                              className={getTranscriptRowStageMarkerClassName(marker.tone)}
                            >
                              {marker.label}
                            </span>
                          ))}
                        </div>
                      ) : null}

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
                    aria-pressed={activeWorkPanel === panel.id}
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
                  aria-pressed={activeAssetPanel === panel.id}
                >
                  {panel.label}
                </button>
              ))}
            </div>
            <div className="hammer-meta-strip">
              <span className="hammer-pill">{projectAssets.video.length} video</span>
              <span className="hammer-pill">{projectAssets.images.length} images</span>
              <span className="hammer-pill">{projectAssets.music.length} music</span>
              <span className="hammer-pill">{linkedAssetCount} linked</span>
            </div>
            <div className="hammer-assets-context">
              <div className="hammer-assets-context__head">
                <strong className="hammer-copy-strong">{activeAssetViewDefinition.label} Collection</strong>
                <span className="hammer-pill">{sourceModeLabel}</span>
              </div>
              <div className="hammer-inspector-grid">
                <div>
                  <div className="hammer-label">workpiece</div>
                  <div className="hammer-mono">{resolvedLaunch.launch_context.workpiece_id}</div>
                </div>
                <div>
                  <div className="hammer-label">source mode</div>
                  <div>{sourceModeLabel}</div>
                </div>
                <div>
                  <div className="hammer-label">media source</div>
                  <div>{activeMediaSourceLabel}</div>
                </div>
                <div>
                  <div className="hammer-label">collection</div>
                  <div>{activeAssetViewDefinition.label}</div>
                </div>
              </div>
            </div>
            {activeAssetItems.length > 0 ? (
              activeAssetItems.map((asset) => (
                <div key={asset.id} className="hammer-asset-card">
                  <div className="hammer-asset-card__header">
                    <div className="hammer-stack-4">
                      <strong className="hammer-copy-strong">{asset.title}</strong>
                      <div className="hammer-copy-sm hammer-copy-muted">{asset.usageHint}</div>
                    </div>
                    <div className="hammer-inline-list">
                      <span className="hammer-pill">{asset.kindLabel}</span>
                      <span className="hammer-pill">{asset.status}</span>
                    </div>
                  </div>
                  <div className="hammer-asset-card__meta-grid">
                    <div>
                      <div className="hammer-label">source</div>
                      <div>{asset.sourceLabel}</div>
                    </div>
                    <div>
                      <div className="hammer-label">duration</div>
                      <div>{asset.durationLabel ?? "n/a"}</div>
                    </div>
                    <div>
                      <div className="hammer-label">workpiece</div>
                      <div className="hammer-mono">{asset.workpieceId}</div>
                    </div>
                  </div>
                  <div className="hammer-copy-sm hammer-copy-muted hammer-mono">{asset.id}</div>
                  <div className="hammer-copy-sm">{asset.detail}</div>
                </div>
              ))
            ) : (
              <div className="hammer-assets-empty-state">
                <div className="hammer-copy-md hammer-copy-dim">
                  {activeAssetEmptyMessage}
                </div>
                <div className="hammer-copy-sm hammer-copy-muted">
                  When this workpiece gains {activeAssetPanel} assets through its launch context or Tongs-linked media, they will appear here.
                </div>
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
            <div className="hammer-dev-media-loader">
              <div className="hammer-dev-media-loader__head">
                <div className="hammer-stack-4">
                  <div className="hammer-label">Source Media</div>
                  <div className="hammer-copy-lg hammer-copy-strong">{activeMediaDisplayTitle}</div>
                  <div className="hammer-copy-sm hammer-copy-muted">{activeMediaDetailLabel}</div>
                </div>
                <div className="hammer-action-row">
                  <span className="hammer-pill">
                    {activeDevRecording
                      ? "Dev recording attached"
                      : activeMediaUsesDevTone
                      ? "Preview proxy active"
                      : "Launch media active"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDevRecordingsRefreshToken((current) => current + 1)}
                    disabled={devRecordingsLoading}
                    className="hammer-button-xs"
                  >
                    {devRecordingsLoading ? "Scanning..." : "Refresh recordings"}
                  </button>
                  {activeDevRecording ? (
                    <button
                      type="button"
                      onClick={() => setSelectedDevRecordingId(null)}
                      className="hammer-button-xs"
                    >
                      Use launch media
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="hammer-dev-media-loader__context">
                <div className="hammer-stack-4">
                  <div className="hammer-copy-sm hammer-copy-strong">{transcriptStatusLabel}</div>
                  <div className="hammer-copy-sm hammer-copy-muted">{transcriptStatusDetail}</div>
                </div>
                <div className="hammer-stack-4">
                  <div className="hammer-label">
                    {devRecordingsRootMapping?.local_root_abs === launchWorkspaceMapping?.local_root_abs
                      ? "Mapped folder"
                      : "Dev folder"}
                  </div>
                  <div className="hammer-copy-sm hammer-copy-muted hammer-mono">
                    {devRecordingsDirectoryAbs ?? devRecordingsRootMapping?.local_root_abs ?? "Unavailable"}
                  </div>
                  {workspaceMappingError ? (
                    <div className="hammer-copy-sm hammer-copy-muted">{workspaceMappingError}</div>
                  ) : null}
                </div>
              </div>

              <div className="hammer-dev-media-loader__list">
                {devRecordingsLoading && devRecordings.length === 0 ? (
                  <div className="hammer-dev-media-loader__empty">
                    Scanning the recordings folder for local media.
                  </div>
                ) : devRecordingsError ? (
                  <div className="hammer-dev-media-loader__empty is-error">
                    {devRecordingsError}
                  </div>
                ) : devRecordings.length === 0 ? (
                  <div className="hammer-dev-media-loader__empty">
                    No recordings were found in the current folder yet.
                  </div>
                ) : (
                  devRecordings.map((recording) => {
                    const modifiedLabel = formatDateTimeLabel(recording.modified_at);
                    const isActive = recording.media_id === activeDevRecording?.media_id;
                    return (
                      <button
                        key={recording.media_id}
                        type="button"
                        onClick={() => setSelectedDevRecordingId(recording.media_id)}
                        className={cx("hammer-dev-media-loader__item", isActive && "is-active")}
                      >
                        <div className="hammer-dev-media-loader__item-main">
                          <div className="hammer-dev-media-loader__item-title">{recording.name}</div>
                          <div className="hammer-dev-media-loader__item-meta">
                            <span>{formatExtensionLabel(recording.extension)}</span>
                            <span>{formatByteSize(recording.byte_size)}</span>
                            {modifiedLabel ? <span>{modifiedLabel}</span> : null}
                          </div>
                          <div className="hammer-dev-media-loader__item-status">
                            {recording.transcript_sidecar_relpath
                              ? "Transcript sidecar detected"
                              : "Transcript: mock fallback"}
                          </div>
                        </div>
                        <span className="hammer-pill">
                          {isActive ? "Attached" : "Load recording"}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

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
        <div className="hammer-selection-summary">
          <div className="hammer-selection-summary__head">
            <div className="hammer-stack-4">
              <span className="hammer-selection-summary__eyebrow">Selection</span>
              <strong className="hammer-selection-summary__title">{selectionSummaryTitle}</strong>
            </div>
            <span className="hammer-pill">{selectionSummaryCountLabel}</span>
          </div>
          <div className="hammer-copy-sm hammer-copy-muted">{selectionSummaryDetail}</div>
          {selectedSegment ? (
            <div className="hammer-meta-strip">
              <span className="hammer-pill">scope {selectionSummaryScopeLabel}</span>
              <span className="hammer-pill">{selectedSegment.segment_id}</span>
              <span className="hammer-pill">{selectedSegment.speaker}</span>
            </div>
          ) : null}
        </div>

        <HammerPaneSection
          title={activeToolDefinition.label}
          subtitle={activeToolHint}
          action={(
            <div className="hammer-action-row">
              <span className="hammer-pill">{activeToolDefinition.label}</span>
              <span className={getEditPlanStatusBadgeClassName(sessionState.editPlanStatus)}>
                {sessionState.editPlanStatus}
              </span>
              <button
                type="button"
                onClick={() => setShowDebugPanels((current) => !current)}
                className={getToggleButtonClassName(showDebugPanels)}
                aria-pressed={showDebugPanels}
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

          <StagedEditsPanel
            instructions={editInstructions}
            segmentById={segmentById}
            segmentIndexById={segmentIndexById}
            onUndoInstruction={removeInstruction}
            onClearAll={clearEdits}
            onNavigateToInstruction={inspectStagedInstruction}
          />

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
            aria-pressed={activeTool === tool.id}
            title={`${tool.label} workspace`}
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
                  aria-pressed={activeTimelineTool === tool.id}
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
            <span className="hammer-pill">mode {activeTimelineToolDefinition.label}</span>
            <span className="hammer-pill">tracks {timelineTracks.length}</span>
            <span className="hammer-pill">playhead {formatClock(currentTimeSec)}</span>
            <span className="hammer-pill">focus {timelineFocusLabel}</span>
          </div>
          <div className="hammer-timeline-status">
            <div className="hammer-timeline-status__head">
              <div className="hammer-stack-4">
                <strong className="hammer-copy-strong">Timeline Focus</strong>
                <div className="hammer-copy-sm hammer-copy-muted">{timelineToolHint}</div>
              </div>
              <div className="hammer-meta-strip">
                <span className={cx("hammer-pill", activeOverlayRow && "hammer-pill--playing")}>
                  active {activeOverlayRow ? activeOverlayRow.row_id : "none"}
                </span>
                <span className="hammer-pill">selected {selectedOverlayRow ? selectedOverlayRow.row_id : "none"}</span>
              </div>
            </div>
            <div className="hammer-inspector-grid">
              <div>
                <div className="hammer-label">current transcript row</div>
                <div>{timelineFocusLabel}</div>
              </div>
              <div>
                <div className="hammer-label">tool feedback</div>
                <div>{activeTimelineToolDefinition.label}</div>
              </div>
              <div>
                <div className="hammer-label">trim / ripple cue</div>
                <div>{timelineRippleLabel}</div>
              </div>
              <div>
                <div className="hammer-label">edit state</div>
                <div>{selectedRowHasTimelineEditCue ? selectedRowEffects : "no staged clip edit"}</div>
              </div>
            </div>
          </div>
          <div className="hammer-timeline-ruler">
            <div className="hammer-timeline-ruler__label">Time</div>
            <div className="hammer-timeline-ruler__track">
              {timelineRulerTicks.map((tick) => (
                <div
                  key={tick.id}
                  className="hammer-timeline-ruler__tick"
                  style={{ left: `${tick.positionPercent}%` }}
                >
                  <span className="hammer-timeline-ruler__tick-label">{tick.label}</span>
                </div>
              ))}
              <div
                aria-hidden="true"
                className="hammer-track-viewport__playhead hammer-track-viewport__playhead--ruler"
                style={{ left: `${playheadPercent}%` }}
              />
            </div>
          </div>
          <div className="hammer-timeline-track-list">
            {timelineTracks.map((track) => (
              <div key={track.id} className="hammer-timeline-track">
                {(() => {
                  const trackHasSelectedClip = track.clips.some((clip) => clip.linked_row_id === selectedOverlayRow?.row_id);
                  const trackHasActiveClip = track.clips.some((clip) => clip.linked_row_id === activeOverlayRow?.row_id);
                  const clipCount = track.clips.length;
                  const editableClipCount = track.clips.filter((clip) => clip.editable).length;
                  const trackStateLabel = trackHasSelectedClip
                    ? "selected row"
                    : trackHasActiveClip
                    ? "active playback"
                    : clipCount === 0
                    ? "empty"
                    : `${clipCount} linked clips`;

                  return (
                    <>
                <div className="hammer-timeline-track__label">
                  <div className="hammer-inline-list-wide">
                    <strong className="hammer-timeline-track__title">{track.label}</strong>
                    <span className="hammer-pill">{clipCount} clips</span>
                  </div>
                  <span className="hammer-timeline-track__meta">
                    {getTimelineTrackRoleLabel(track.id)}
                    {" · "}
                    {trackStateLabel}
                    {editableClipCount > 0 ? ` · ${editableClipCount} editable` : ""}
                  </span>
                </div>
                <div className={cx(
                  "hammer-track-viewport",
                  trackHasSelectedClip && "is-selected",
                  trackHasActiveClip && "is-active",
                )}>
                  <div className="hammer-track-viewport__backdrop" />
                  {track.clips.length === 0 ? (
                    <div className="hammer-track-viewport__empty">
                      {getTimelineTrackEmptyMessage(track.id, Boolean(selectedOverlayRow))}
                    </div>
                  ) : track.clips.map((clip) => {
                    const left = clamp((clip.start_sec / effectiveDurationSec) * 100, 0, 100);
                    const width = clamp(((clip.end_sec - clip.start_sec) / effectiveDurationSec) * 100, 1.2, 100);
                    const isSelected = clip.linked_row_id === selectedOverlayRow?.row_id;
                    const isActive = clip.linked_row_id === activeOverlayRow?.row_id
                      || (currentTimeSec >= clip.start_sec && currentTimeSec <= clip.end_sec && !clip.linked_row_id);
                    const showTrimHandles = activeTimelineTool === "cut" && clip.editable && (isSelected || isActive);
                    const showRippleCue = (activeTimelineTool === "cut" || activeTimelineTool === "select")
                      && clip.ripple_hint
                      && (isSelected || isActive);
                    return (
                      <button
                        key={clip.id}
                        type="button"
                        title={`${clip.label} · ${formatClock(clip.start_sec)}-${formatClock(clip.end_sec)}`}
                        onClick={() => selectTimelineClip(clip)}
                        aria-pressed={isSelected}
                        className={cx(
                          "hammer-timeline-clip",
                          clip.editable && "is-editable",
                          isSelected && "is-selected",
                          isActive && "is-active",
                          showTrimHandles && "has-trim-handles",
                        )}
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          background: clip.tone,
                        }}
                      >
                        {showTrimHandles ? (
                          <>
                            <span className="hammer-timeline-clip__trim-handle hammer-timeline-clip__trim-handle--start" />
                            <span className="hammer-timeline-clip__trim-handle hammer-timeline-clip__trim-handle--end" />
                          </>
                        ) : null}
                        {clip.label}
                        {showRippleCue ? (
                          <span className="hammer-timeline-clip__ripple-cue">Ripple</span>
                        ) : null}
                      </button>
                    );
                  })}
                  <div
                    aria-hidden="true"
                    className="hammer-track-viewport__playhead"
                    style={{ left: `${playheadPercent}%` }}
                  />
                </div>
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        </HammerPaneSection>
      </div>
    </section>
  );
}
