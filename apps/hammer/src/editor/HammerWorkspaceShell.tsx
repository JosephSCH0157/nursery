import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import type { HammerEditPlan, HammerPreviewMode } from "../../../../packages/contracts/hammer/edit-plan.contract";
import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import type { MediaRef, WorkspaceMediaMapping } from "../../../../packages/contracts/hammer/media-resolver.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import { createSemanticEditPlanSignature } from "../lib/editPlanSignature";
import type { HammerWorkspaceSnapshot } from "./hammerWorkspaceSnapshot";
import type {
  HammerPersistedAudioPolish,
  HammerPersistedStructuredTranscript,
  HammerVisualPlacementRecord,
  HammerPersistedVisualPlacements,
} from "../persistence/hammerPersistenceContract";
import type { HammerPreparedNextStepActionId } from "./hammerPreparedHandoff";
import {
  moveSegmentTiming,
  resolveFocusAfterPlayheadChange,
  resolvePreviewLabel,
  resolvePlayheadSegment,
  resolveWorkspaceFocusMode,
  roundToTenth,
  trimSegmentEndTiming,
  trimSegmentStartTiming,
  updateSegmentInTimeline,
  type HammerWorkspaceFocusOverride,
  type HammerWorkspaceToolId,
} from "./hammerWorkspaceTimeline";
import {
  resolveTranscriptDurationSec,
  syncEditableTranscriptSegments,
  updateTranscriptSegmentSpeaker,
  updateTranscriptSegmentText,
} from "./hammerWorkspaceTranscript";
import {
  previewQuickClean,
  previewRemoveFillers,
  previewRemoveRetakes,
  previewShortenGaps,
  type HammerCleanupPreview,
  type RetakeCleanupOptions,
  type FillerCleanupOptions,
  type GapCleanupOptions,
} from "./hammerCleanupTools";
import {
  createHammerHistoryController,
  createHammerHistoryDocument,
  hashEditorState,
  normalizeHammerHistoryDocument,
  cloneEditorState,
  type HammerEditorStateSerializable,
  type HammerHistoryController,
  type HammerHistoryKind,
} from "./hammerWorkspaceHistory";
import {
  loadHammerHistoryDocument,
  saveHammerHistoryDocument,
} from "../lib/hammerHistoryArtifactApi";
import {
  listWorkpieceStoredMedia,
  loadIntroOutroSelection,
  readHammerMediaPreviewErrorDiagnostics,
  loadWorkpieceMediaPreviewUrl,
  saveIntroOutroSelection,
  uploadWorkpieceMediaFile,
  type HammerIntroOutroSelection,
  type HammerStoredMediaFile,
} from "../lib/hammerSourceDeskMediaApi";
import { normalizeWorkpieceRelativePath } from "../../../../packages/contracts/workpiece-paths";
import { preserveTranscriptMetadata } from "../prep/hammerPrep";
import { buildHammerReleasePrepPackage } from "../lib/hammerReleasePrepPackage";
import {
  HAMMER_PREPARED_RELEASE_PACKAGE_PATH,
  buildHammerPreparedReleasePackage,
  compareHammerPreparedReleasePackageToCurrent,
  type HammerPreparedReleasePackage,
  type HammerPreparedReleaseOverallStatus,
} from "../lib/hammerPreparedReleasePackage";
import {
  loadHammerPreparedReleasePackage,
  saveHammerPreparedReleasePackage,
} from "../lib/hammerPreparedReleasePackageApi";
import "./HammerWorkspaceShell.css";

const TOOLBAR_WIDTH_PX = 72;
const PREVIEW_BAY_MAX_WIDTH_PX = 460;
const TIMELINE_DOCK_BASELINE_HEIGHT_PX = 376;
const TIMELINE_DOCK_TIME_FOCUS_HEIGHT_PX = 504;
const SOURCE_DESK_PREVIEW_FETCH_CONCURRENCY = 4;
const SOURCE_DESK_PREVIEW_MAX_ITEMS = 48;
const HISTORY_MAX_SIZE = 100;
const HISTORY_PERSIST_DEBOUNCE_MS = 900;
const TEXT_EDIT_COALESCE_MS = 1500;

type HammerToolId = HammerWorkspaceToolId;
type HammerSourceTabId = "transcript" | "images" | "assets" | "broll" | "introoutro";

type HammerWorkspaceShellProps = {
  launchContext?: HammerLaunchContext;
  structuredTranscript?: HammerPersistedStructuredTranscript | null;
  visualPlacements?: HammerPersistedVisualPlacements | null;
  audioPolish?: HammerPersistedAudioPolish | null;
  releasePrepHref?: string | null;
  selectedMacroRecipeRef?: string | null;
  lastMacroRunRef?: string | null;
  prepHandoffAction?: {
    id: Exclude<HammerPreparedNextStepActionId, "export_later">;
    token: number;
  } | null;
  onWorkspaceSnapshotChange?: (snapshot: HammerWorkspaceSnapshot) => void;
};

const SOURCE_TABS: Array<{ id: HammerSourceTabId; label: string }> = [
  { id: "transcript", label: "Transcript" },
  { id: "images", label: "Images" },
  { id: "assets", label: "Assets" },
  { id: "broll", label: "B-roll" },
  { id: "introoutro", label: "Intro/Outro" },
];

const TOOL_ORDER: Array<{ id: HammerToolId; shortLabel: string; label: string }> = [
  { id: "polish", shortLabel: "P", label: "Polish" },
  { id: "audio", shortLabel: "A", label: "Audio" },
  { id: "video", shortLabel: "V", label: "Video" },
  { id: "captions", shortLabel: "C", label: "Captions" },
  { id: "details", shortLabel: "D", label: "Details" },
  { id: "finishing", shortLabel: "F", label: "Finishing" },
  { id: "export", shortLabel: "E", label: "Export" },
];

type HammerSourceImageItem = {
  id: string;
  label: string;
  anchorSegmentId: string;
  startSec: number;
  endSec: number;
  status: "placed" | "uncertain";
  confidence: number | null;
  visualMode: string | null;
  assetPath: string | null;
};

type HammerSourceAssetKind = "image" | "broll" | "audio" | "other";

type HammerSourceAssetItem = {
  id: string;
  label: string;
  kind: HammerSourceAssetKind;
  assetPath: string | null;
  visualMode: string | null;
  usageCount: number;
  firstStartSec: number;
  lastEndSec: number;
};

type HammerTimelineLaneBlock = {
  id: string;
  label: string;
  startSec: number;
  endSec: number;
  selected: boolean;
  tone: "dialogue" | "image" | "broll";
  onSelect: () => void;
};

type HammerTimelineLaneView = {
  id: string;
  label: string;
  tone: "dialogue" | "music" | "broll" | "stills";
  blocks: HammerTimelineLaneBlock[];
};

type HammerReleasePrepSaveState = {
  preparedAt: string;
  overallStatus: HammerPreparedReleaseOverallStatus;
  subtitleArtifactCount: number;
};

type HammerExportTruthState = "never_prepared" | "current" | "stale";

function readTranscriptSegments(
  launchContext: HammerLaunchContext,
  structuredTranscript: HammerPersistedStructuredTranscript | null,
): HammerTranscriptSegment[] {
  if (structuredTranscript?.segments?.length) {
    return structuredTranscript.segments.map((segment) => ({ ...segment }));
  }

  if (launchContext.transcript.kind === "tongs-stub") {
    return launchContext.transcript.segments.map((segment) => ({ ...segment }));
  }

  return [];
}

function resolveMediaRef(launchContext: HammerLaunchContext): MediaRef | null {
  if (launchContext.media.kind === "mapped-local" || launchContext.media.kind === "tongs-stub") {
    return { ...launchContext.media.ref };
  }
  return null;
}

function resolveWorkspaceMapping(launchContext: HammerLaunchContext): WorkspaceMediaMapping | null {
  if (launchContext.media.kind === "tongs-stub") {
    return launchContext.media.workspace_mapping ? { ...launchContext.media.workspace_mapping } : null;
  }
  return null;
}

function createFallbackEditPlan(
  launchContext: HammerLaunchContext,
  transcriptSourceId: string,
  previewMode: HammerPreviewMode,
): HammerEditPlan {
  const now = new Date().toISOString();
  const sessionId = launchContext.session_id ?? `${launchContext.workpiece_id}:session`;
  return {
    edit_plan_id: `${launchContext.workpiece_id}:plan`,
    version: "1",
    created_at: now,
    updated_at: now,
    source_transcript_id: transcriptSourceId,
    instructions: [],
    preview_mode: previewMode,
    workspace_id: launchContext.workspace_id,
    workpiece_id: launchContext.workpiece_id,
    session_id: sessionId,
  };
}

function deriveAssetKind(args: {
  visualMode: string | null;
  assetPath: string | null;
}): HammerSourceAssetKind {
  const mode = (args.visualMode ?? "").toLowerCase();
  const path = (args.assetPath ?? "").toLowerCase();
  if (mode.includes("broll") || path.includes("broll")) return "broll";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg") || path.endsWith(".png") || path.endsWith(".webp") || path.endsWith(".gif")) {
    return "image";
  }
  if (path.endsWith(".mp4") || path.endsWith(".mov") || path.endsWith(".m4v") || path.endsWith(".webm")) {
    return "broll";
  }
  if (path.endsWith(".wav") || path.endsWith(".mp3") || path.endsWith(".aac") || path.endsWith(".m4a")) {
    return "audio";
  }
  return "other";
}

function formatBytes(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "size unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function hasTranscriptSegmentChanged(
  previous: HammerTranscriptSegment | undefined,
  next: HammerTranscriptSegment,
): boolean {
  if (!previous) return true;
  return previous.speaker !== next.speaker
    || previous.text !== next.text
    || previous.start_sec !== next.start_sec
    || previous.end_sec !== next.end_sec;
}

function isSourceDeskAuthMessage(message: string | null): boolean {
  if (!message) return false;
  return /(auth|session|token|sign[ -]?in|unauthorized|forbidden)/i.test(message);
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function stableHashToken(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function toEditorState(args: {
  segments: HammerTranscriptSegment[];
  visualPlacements: HammerPersistedVisualPlacements | null;
  selectedSegmentId: string | null;
  playheadSec: number;
  transcriptTimingHint: string | null;
}): HammerEditorStateSerializable {
  return {
    transcriptSegments: args.segments.map((segment) => ({ ...segment })),
    visualPlacements: args.visualPlacements
      ? {
        ...args.visualPlacements,
        source_refs: [...args.visualPlacements.source_refs],
        uncertainty_flags: [...args.visualPlacements.uncertainty_flags],
        placements: args.visualPlacements.placements.map((placement) => ({
          ...placement,
          matched_segment_ids: [...placement.matched_segment_ids],
          uncertainty_flags: [...placement.uncertainty_flags],
        })),
      }
      : null,
    selectedSegmentId: args.selectedSegmentId,
    playheadSec: args.playheadSec,
    transcriptTimingHint: args.transcriptTimingHint,
  };
}

function toShellState(state: HammerEditorStateSerializable): {
  segments: HammerTranscriptSegment[];
  visualPlacements: HammerPersistedVisualPlacements | null;
  selectedSegmentId: string | null;
  playheadSec: number;
  transcriptTimingHint: string | null;
} {
  return {
    segments: state.transcriptSegments.map((segment) => ({ ...segment })),
    visualPlacements: state.visualPlacements
      ? {
        ...state.visualPlacements,
        source_refs: [...state.visualPlacements.source_refs],
        uncertainty_flags: [...state.visualPlacements.uncertainty_flags],
        placements: state.visualPlacements.placements.map((placement) => ({
          ...placement,
          matched_segment_ids: [...placement.matched_segment_ids],
          uncertainty_flags: [...placement.uncertainty_flags],
        })),
      }
      : null,
    selectedSegmentId: state.selectedSegmentId,
    playheadSec: state.playheadSec,
    transcriptTimingHint: state.transcriptTimingHint,
  };
}

function compactHistoryActionLabel(label: string | null): string {
  if (!label) return "";
  const trimmed = label.trim();
  if (trimmed.length <= 28) return trimmed;
  return `${trimmed.slice(0, 25)}...`;
}

function createVisualPlacementId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `placement:${crypto.randomUUID()}`;
  }
  return `placement:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

function buildPreparedPackageIdentityFingerprint(pkg: HammerPreparedReleasePackage): string {
  const basis = [
    `v:${String(pkg.version)}`,
    `ws:${pkg.workspaceId ?? ""}`,
    `wp:${pkg.workpieceId}`,
    `at:${pkg.preparedAt}`,
    `ts:${pkg.transcript.fingerprint ?? ""}`,
    `srt:${pkg.subtitles.srt.fingerprint ?? ""}`,
    `vtt:${pkg.subtitles.vtt.fingerprint ?? ""}`,
    `m:${pkg.media.fingerprint ?? ""}`,
    `tl:${pkg.provenance.timelineRevision ?? ""}`,
  ].join("|");
  return `hppkg:${stableHashToken(basis)}`;
}

function resolveLaneGaps(blocks: HammerTimelineLaneBlock[], durationSec: number): Array<{ id: string; startSec: number; endSec: number }> {
  const sorted = [...blocks]
    .map((block) => ({
      startSec: Math.max(0, Math.min(durationSec, block.startSec)),
      endSec: Math.max(0, Math.min(durationSec, block.endSec)),
    }))
    .filter((block) => block.endSec > block.startSec)
    .sort((a, b) => a.startSec - b.startSec);

  const gaps: Array<{ id: string; startSec: number; endSec: number }> = [];
  let cursor = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    const block = sorted[index];
    if (block.startSec > cursor) {
      gaps.push({
        id: `gap-${index}-${cursor.toFixed(2)}-${block.startSec.toFixed(2)}`,
        startSec: cursor,
        endSec: block.startSec,
      });
    }
    cursor = Math.max(cursor, block.endSec);
  }
  if (cursor < durationSec) {
    gaps.push({
      id: `gap-tail-${cursor.toFixed(2)}-${durationSec.toFixed(2)}`,
      startSec: cursor,
      endSec: durationSec,
    });
  }
  return gaps;
}

export default function HammerWorkspaceShell(props: HammerWorkspaceShellProps): JSX.Element {
  if (!props.launchContext) {
    return (
      <section className="hammer-workspace-shell__missing-context">
        <h2>Hammer needs a workpiece context.</h2>
        <p>Select a workpiece from the Hammer library to open the workspace shell.</p>
      </section>
    );
  }

  const launchContext = props.launchContext;
  const transcriptSegments = useMemo(
    () => readTranscriptSegments(launchContext, props.structuredTranscript ?? null),
    [launchContext, props.structuredTranscript],
  );
  const transcriptSourceId = props.structuredTranscript?.transcript_id
    ?? (launchContext.transcript.kind === "tongs-stub" ? launchContext.transcript.transcript_id : "runtime-transcript");

  const [selectedSourceTab, setSelectedSourceTab] = useState<HammerSourceTabId>("transcript");
  const [activeTool, setActiveTool] = useState<HammerToolId>("polish");
  const [editableTranscriptSegments, setEditableTranscriptSegments] = useState<HammerTranscriptSegment[]>(
    () => transcriptSegments,
  );
  const [editableVisualPlacements, setEditableVisualPlacements] = useState<HammerPersistedVisualPlacements | null>(
    () => props.visualPlacements ?? null,
  );
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(transcriptSegments[0]?.segment_id ?? null);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [focusOverride, setFocusOverride] = useState<HammerWorkspaceFocusOverride>("auto");
  const [polishStrength, setPolishStrength] = useState(60);
  const [gapCleanupOptions, setGapCleanupOptions] = useState<GapCleanupOptions>({
    maxGapSec: 0.4,
    minPauseSec: 0.1,
    preserveDramaticPauses: true,
  });
  const [fillerCleanupOptions, setFillerCleanupOptions] = useState<FillerCleanupOptions>({
    aggressiveness: "medium",
    protectIntentionalPhrasing: true,
  });
  const [retakeCleanupOptions, setRetakeCleanupOptions] = useState<RetakeCleanupOptions>({
    detection: "normal",
    preferLaterCleanerTake: true,
    honorExplicitRetakePhrases: true,
    sameSpeakerOnly: true,
  });
  const [cleanupPreview, setCleanupPreview] = useState<HammerCleanupPreview | null>(null);
  const [audioLevelingEnabled, setAudioLevelingEnabled] = useState(true);
  const [audioNoiseReductionEnabled, setAudioNoiseReductionEnabled] = useState(true);
  const [videoSnapMode, setVideoSnapMode] = useState<"timeline" | "segment">("timeline");
  const [captionStyle, setCaptionStyle] = useState<"sentence" | "title" | "upper">("sentence");
  const [detailTag, setDetailTag] = useState("main-edit");
  const [finishingChecklist, setFinishingChecklist] = useState({
    transcriptReviewed: false,
    visualsReviewed: false,
    audioReviewed: false,
  });
  const [storedMediaFiles, setStoredMediaFiles] = useState<HammerStoredMediaFile[]>([]);
  const [sourceDeskLoading, setSourceDeskLoading] = useState(false);
  const [sourceDeskError, setSourceDeskError] = useState<string | null>(null);
  const [uploadingCategory, setUploadingCategory] = useState<"images" | "broll" | "introoutro" | null>(null);
  const [introOutroSelection, setIntroOutroSelection] = useState<HammerIntroOutroSelection>({
    intro_path: null,
    outro_path: null,
    updated_at: new Date().toISOString(),
  });
  const [savingIntroOutro, setSavingIntroOutro] = useState(false);
  const [sourceDeskPreviewUrls, setSourceDeskPreviewUrls] = useState<Record<string, string>>({});
  const [sourceDeskPreviewFailures, setSourceDeskPreviewFailures] = useState<Record<string, true>>({});
  const [releasePrepSaving, setReleasePrepSaving] = useState(false);
  const [releasePrepLoading, setReleasePrepLoading] = useState(false);
  const [releasePrepError, setReleasePrepError] = useState<string | null>(null);
  const [releasePrepSaved, setReleasePrepSaved] = useState<HammerReleasePrepSaveState | null>(null);
  const [loadedPreparedPackage, setLoadedPreparedPackage] = useState<HammerPreparedReleasePackage | null>(null);
  const [transcriptTimingHint, setTranscriptTimingHint] = useState<string | null>(null);
  const [historyStatus, setHistoryStatus] = useState<string | null>(null);
  const imageUploadInputRef = useRef<HTMLInputElement | null>(null);
  const brollUploadInputRef = useRef<HTMLInputElement | null>(null);
  const introOutroUploadInputRef = useRef<HTMLInputElement | null>(null);
  const lastHandledHandoffTokenRef = useRef<number | null>(null);
  const transcriptLineRefs = useRef(new Map<string, HTMLButtonElement>());
  const timelineTrackScrollRef = useRef<HTMLDivElement | null>(null);
  const selectionOriginRef = useRef<"system" | "transcript" | "timeline" | "playhead">("system");
  const historyControllerRef = useRef<HammerHistoryController | null>(null);
  const historyPersistTimerRef = useRef<number | null>(null);

  const previewMode: HammerPreviewMode = launchContext.preview_mode ?? launchContext.edit_plan?.preview_mode ?? "edit-aware";
  const workspaceFocusMode = focusOverride === "auto" ? resolveWorkspaceFocusMode(activeTool) : focusOverride;
  const mediaRef = useMemo(
    () => resolveMediaRef(launchContext),
    [launchContext.media],
  );
  const workspaceMapping = useMemo(
    () => resolveWorkspaceMapping(launchContext),
    [launchContext.media],
  );
  const mediaSourceLabel = launchContext.media.kind === "dev-tone"
    ? "Dev tone"
    : launchContext.media.label ?? mediaRef?.local_relpath ?? null;

  const selectedSegment = editableTranscriptSegments.find((segment) => segment.segment_id === selectedSegmentId) ?? null;
  const playheadSegment = resolvePlayheadSegment(editableTranscriptSegments, playheadSec);
  const transcriptDurationSec = resolveTranscriptDurationSec(editableTranscriptSegments);
  const sourceImageItems = useMemo<HammerSourceImageItem[]>(() => (
    (editableVisualPlacements?.placements ?? []).map((placement) => ({
      id: placement.placement_id,
      label: placement.label ?? placement.asset_ref ?? placement.asset_path ?? placement.entry_id,
      anchorSegmentId: placement.anchor_segment_id,
      startSec: placement.start_sec,
      endSec: placement.end_sec,
      status: placement.status,
      confidence: placement.confidence,
      visualMode: placement.visual_mode,
      assetPath: placement.asset_path,
    }))
  ), [editableVisualPlacements?.placements]);
  const sourceAssetItems = useMemo<HammerSourceAssetItem[]>(() => {
    const byId = new Map<string, HammerSourceAssetItem>();
    for (const placement of editableVisualPlacements?.placements ?? []) {
      const assetId = placement.asset_id ?? placement.asset_ref ?? placement.asset_path ?? placement.placement_id;
      const existing = byId.get(assetId);
      const nextKind = deriveAssetKind({
        visualMode: placement.visual_mode,
        assetPath: placement.asset_path,
      });
      if (!existing) {
        byId.set(assetId, {
          id: assetId,
          label: placement.label ?? placement.asset_ref ?? placement.asset_path ?? assetId,
          kind: nextKind,
          assetPath: placement.asset_path,
          visualMode: placement.visual_mode,
          usageCount: 1,
          firstStartSec: placement.start_sec,
          lastEndSec: placement.end_sec,
        });
        continue;
      }

      byId.set(assetId, {
        ...existing,
        usageCount: existing.usageCount + 1,
        firstStartSec: Math.min(existing.firstStartSec, placement.start_sec),
        lastEndSec: Math.max(existing.lastEndSec, placement.end_sec),
      });
    }

    if (mediaRef) {
      const mediaPath = mediaRef.local_relpath ?? null;
      const mediaKind: HammerSourceAssetKind = mediaRef.kind === "recording_audio" ? "audio" : "other";
      const existing = byId.get(mediaRef.media_id);
      if (!existing) {
        byId.set(mediaRef.media_id, {
          id: mediaRef.media_id,
          label: mediaPath ?? mediaRef.media_id,
          kind: mediaKind,
          assetPath: mediaPath,
          visualMode: null,
          usageCount: 1,
          firstStartSec: 0,
          lastEndSec: transcriptDurationSec,
        });
      }
    }

    for (const file of storedMediaFiles) {
      if (byId.has(file.path)) continue;
      byId.set(file.path, {
        id: file.path,
        label: file.name,
        kind: file.kind,
        assetPath: file.path,
        visualMode: "stored",
        usageCount: 0,
        firstStartSec: 0,
        lastEndSec: transcriptDurationSec,
      });
    }

    return [...byId.values()].sort((a, b) => a.firstStartSec - b.firstStartSec);
  }, [editableVisualPlacements?.placements, mediaRef, storedMediaFiles, transcriptDurationSec]);
  const sourceBrollItems = useMemo(
    () => sourceAssetItems.filter((item) => item.kind === "broll"),
    [sourceAssetItems],
  );
  const sourceImageLibraryItems = useMemo(
    () => storedMediaFiles.filter((file) => file.kind === "image"),
    [storedMediaFiles],
  );
  const introOutroCandidateItems = useMemo(
    () => storedMediaFiles.filter((file) => file.kind === "broll" || file.kind === "audio" || file.kind === "other"),
    [storedMediaFiles],
  );
  const timelineDurationSec = Math.max(transcriptDurationSec, 1);
  const timelineTicks = useMemo(() => {
    const tickCount = 10;
    return Array.from({ length: tickCount + 1 }).map((_, index) => {
      const ratio = index / tickCount;
      return {
        ratio,
        timeSec: ratio * timelineDurationSec,
      };
    });
  }, [timelineDurationSec]);
  const timelineMinorTicks = useMemo(() => {
    const tickCount = 50;
    return Array.from({ length: tickCount + 1 })
      .map((_, index) => ({
        ratio: index / tickCount,
        isMajor: index % 5 === 0,
      }))
      .filter((tick) => !tick.isMajor);
  }, []);
  const dialogueLaneBlocks = useMemo<HammerTimelineLaneBlock[]>(() => (
    editableTranscriptSegments.map((segment) => ({
      id: `dialogue:${segment.segment_id}`,
      label: segment.speaker,
      startSec: segment.start_sec,
      endSec: segment.end_sec,
      selected: segment.segment_id === selectedSegmentId,
      tone: "dialogue",
      onSelect: () => {
        selectionOriginRef.current = "timeline";
        setFocusOverride("time-focus");
        setSelectedSegmentId(segment.segment_id);
        setPlayheadSec(segment.start_sec);
      },
    }))
  ), [editableTranscriptSegments, selectedSegmentId]);
  const imageLaneBlocks = useMemo<HammerTimelineLaneBlock[]>(() => (
    sourceImageItems.map((item) => ({
      id: `image:${item.id}`,
      label: item.label,
      startSec: item.startSec,
      endSec: item.endSec,
      selected: item.anchorSegmentId === selectedSegmentId,
      tone: "image",
      onSelect: () => {
        selectionOriginRef.current = "timeline";
        setFocusOverride("time-focus");
        setSelectedSegmentId(item.anchorSegmentId);
        setPlayheadSec(item.startSec);
      },
    }))
  ), [sourceImageItems, selectedSegmentId]);
  const brollLaneBlocks = useMemo<HammerTimelineLaneBlock[]>(() => (
    sourceBrollItems
      .filter((item) => item.usageCount > 0)
      .map((item) => ({
        id: `broll:${item.id}`,
        label: item.label,
        startSec: item.firstStartSec,
        endSec: item.lastEndSec,
        selected: false,
        tone: "broll",
        onSelect: () => {
          setFocusOverride("time-focus");
          setPlayheadSec(item.firstStartSec);
        },
      }))
  ), [sourceBrollItems]);
  const timelineLanes = useMemo<HammerTimelineLaneView[]>(() => ([
    { id: "dialogue", label: "Dialogue", tone: "dialogue", blocks: dialogueLaneBlocks },
    { id: "music", label: "Music", tone: "music", blocks: [] },
    { id: "broll", label: "B-roll", tone: "broll", blocks: brollLaneBlocks },
    { id: "stills", label: "Stills", tone: "stills", blocks: imageLaneBlocks },
  ]), [brollLaneBlocks, dialogueLaneBlocks, imageLaneBlocks]);
  const laneGapsById = useMemo(() => {
    const byLane = new Map<string, Array<{ id: string; startSec: number; endSec: number }>>();
    for (const lane of timelineLanes) {
      byLane.set(lane.id, resolveLaneGaps(lane.blocks, timelineDurationSec));
    }
    return byLane;
  }, [timelineDurationSec, timelineLanes]);
  const playheadRatioPercent = Math.min(100, (playheadSec / timelineDurationSec) * 100);
  const sourceTranscriptById = useMemo(() => {
    const byId = new Map<string, HammerTranscriptSegment>();
    for (const segment of transcriptSegments) {
      byId.set(segment.segment_id, segment);
    }
    return byId;
  }, [transcriptSegments]);
  const modifiedTranscriptSegmentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const segment of editableTranscriptSegments) {
      if (hasTranscriptSegmentChanged(sourceTranscriptById.get(segment.segment_id), segment)) {
        ids.add(segment.segment_id);
      }
    }
    return ids;
  }, [editableTranscriptSegments, sourceTranscriptById]);
  const modifiedSegmentCount = modifiedTranscriptSegmentIds.size;
  const sourceDeskPreviewPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const item of sourceImageLibraryItems) {
      paths.add(item.path);
    }
    for (const item of sourceImageItems) {
      if (item.assetPath) paths.add(item.assetPath);
    }
    for (const item of sourceBrollItems) {
      if (item.assetPath) paths.add(item.assetPath);
    }
    return [...paths];
  }, [sourceBrollItems, sourceImageItems, sourceImageLibraryItems]);
  const imageUsageByPath = useMemo(() => {
    const usage = new Map<string, number>();
    for (const item of sourceImageItems) {
      if (!item.assetPath) continue;
      usage.set(item.assetPath, (usage.get(item.assetPath) ?? 0) + 1);
    }
    return usage;
  }, [sourceImageItems]);
  const historyController = historyControllerRef.current;
  const canUndo = historyController?.canUndo() ?? false;
  const canRedo = historyController?.canRedo() ?? false;
  const undoLabel = historyController?.peekUndoEntry()?.label ?? null;
  const redoLabel = historyController?.peekRedoEntry()?.label ?? null;
  const undoDepth = historyController?.document.undoStack.length ?? 0;
  const redoDepth = historyController?.document.redoStack.length ?? 0;
  const undoLabelCompact = compactHistoryActionLabel(undoLabel);
  const redoLabelCompact = compactHistoryActionLabel(redoLabel);

  function captureWorkspaceState(): HammerEditorStateSerializable {
    return toEditorState({
      segments: editableTranscriptSegments,
      visualPlacements: editableVisualPlacements,
      selectedSegmentId,
      playheadSec,
      transcriptTimingHint,
    });
  }

  function applyWorkspaceState(nextState: HammerEditorStateSerializable): void {
    const normalized = toShellState(nextState);
    setEditableTranscriptSegments(normalized.segments);
    setEditableVisualPlacements(normalized.visualPlacements);
    setSelectedSegmentId(normalized.selectedSegmentId);
    setPlayheadSec(normalized.playheadSec);
    setTranscriptTimingHint(normalized.transcriptTimingHint);
    setCleanupPreview(null);
  }

  function clearPersistTimer(): void {
    if (historyPersistTimerRef.current != null) {
      window.clearTimeout(historyPersistTimerRef.current);
      historyPersistTimerRef.current = null;
    }
  }

  async function persistHistoryDocument(): Promise<void> {
    const controller = historyControllerRef.current;
    if (!controller) return;

    controller.document.metadata = {
      ...(controller.document.metadata ?? {}),
      lastKnownSelectionSegmentId: selectedSegmentId,
      lastKnownTool: activeTool,
    };
    controller.document.updatedAt = new Date().toISOString();

    const result = await saveHammerHistoryDocument({
      workpieceId: launchContext.workpiece_id,
      document: controller.document,
    });
    if (!result.ok) {
      setHistoryStatus(result.error);
      return;
    }
    setHistoryStatus(null);
  }

  function scheduleHistoryPersist(immediate = false): void {
    clearPersistTimer();
    if (immediate) {
      void persistHistoryDocument();
      return;
    }

    historyPersistTimerRef.current = window.setTimeout(() => {
      historyPersistTimerRef.current = null;
      void persistHistoryDocument();
    }, HISTORY_PERSIST_DEBOUNCE_MS);
  }

  function applyHistoryMutation(args: {
    label: string;
    kind?: HammerHistoryKind;
    affectedSegments?: string[];
    affectedPlacementIds?: string[];
    toolId?: string;
    transactionId?: string;
    allowCoalesce?: boolean;
    immediatePersist?: boolean;
    computeAfter: (before: HammerEditorStateSerializable) => HammerEditorStateSerializable;
  }): boolean {
    const controller = historyControllerRef.current;
    if (!controller) return false;

    const before = captureWorkspaceState();
    const after = cloneEditorState(args.computeAfter(cloneEditorState(before)));

    const entry = controller.applyMutation({
      label: args.label,
      kind: args.kind,
      toolId: args.toolId,
      affectedSegmentIds: args.affectedSegments,
      affectedPlacementIds: args.affectedPlacementIds,
      transactionId: args.transactionId ?? null,
      allowCoalesce: args.allowCoalesce,
      coalesceWindowMs: TEXT_EDIT_COALESCE_MS,
      nextState: after,
    });
    if (!entry) return false;

    applyWorkspaceState(controller.getState());
    scheduleHistoryPersist(args.immediatePersist === true);
    return true;
  }

  function undoHistory(): void {
    const controller = historyControllerRef.current;
    if (!controller) return;
    const entry = controller.undo();
    if (!entry) return;
    applyWorkspaceState(controller.getState());
    selectionOriginRef.current = "system";
    setFocusOverride("source-focus");
    scheduleHistoryPersist();
  }

  function redoHistory(): void {
    const controller = historyControllerRef.current;
    if (!controller) return;
    const entry = controller.redo();
    if (!entry) return;
    applyWorkspaceState(controller.getState());
    selectionOriginRef.current = "system";
    setFocusOverride("source-focus");
    scheduleHistoryPersist();
  }

  useEffect(() => {
    let active = true;
    clearPersistTimer();

    const synced = syncEditableTranscriptSegments(transcriptSegments, selectedSegmentId);
    const baselineState = toEditorState({
      segments: synced.segments,
      visualPlacements: props.visualPlacements ?? null,
      selectedSegmentId: synced.selectedSegmentId,
      playheadSec: Math.max(0, Math.min(playheadSec, resolveTranscriptDurationSec(synced.segments))),
      transcriptTimingHint: null,
    });
    const baseRevisionId = hashEditorState(baselineState);

    historyControllerRef.current = createHammerHistoryController({
      document: createHammerHistoryDocument({
        workpieceId: launchContext.workpiece_id,
        sessionId: launchContext.session_id ?? `${launchContext.workpiece_id}:session`,
        baseRevisionId,
      }),
      initialState: baselineState,
      maxUndoSteps: HISTORY_MAX_SIZE,
    });

    applyWorkspaceState(baselineState);
    selectionOriginRef.current = "system";

    void loadHammerHistoryDocument(launchContext.workpiece_id)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setHistoryStatus(result.error);
          return;
        }
        if (!result.exists || !result.data) {
          setHistoryStatus(null);
          return;
        }

        const loaded = normalizeHammerHistoryDocument(result.data, {
          workpieceId: launchContext.workpiece_id,
          sessionId: launchContext.session_id ?? `${launchContext.workpiece_id}:session`,
          baseRevisionId,
        });

        if (loaded.baseRevisionId !== baseRevisionId) {
          setHistoryStatus("History base revision mismatch detected. Opened baseline without replay.");
          return;
        }

        const controller = createHammerHistoryController({
          document: loaded,
          initialState: baselineState,
          maxUndoSteps: HISTORY_MAX_SIZE,
        });
        const replayed = controller.getReplayStateFromBaseline(baselineState);
        controller.replaceState(replayed);
        historyControllerRef.current = controller;
        applyWorkspaceState(replayed);
        setHistoryStatus(null);
      })
      .catch((error) => {
        if (!active) return;
        setHistoryStatus(toErrorMessage(error, "Hammer could not recover persistent history."));
      });

    return () => {
      active = false;
      clearPersistTimer();
    };
  }, [
    launchContext.session_id,
    launchContext.workpiece_id,
    editableVisualPlacements,
    transcriptSegments,
    transcriptSourceId,
  ]);

  useEffect(() => {
    const segment = resolvePlayheadSegment(editableTranscriptSegments, playheadSec);
    if (!segment) return;
    if (segment.segment_id === selectedSegmentId) return;
    selectionOriginRef.current = "playhead";
    setSelectedSegmentId(segment.segment_id);
  }, [editableTranscriptSegments, playheadSec, selectedSegmentId]);

  useEffect(() => {
    if (!selectedSegmentId) return;
    const selected = editableTranscriptSegments.find((segment) => segment.segment_id === selectedSegmentId);
    if (!selected) return;

    const origin = selectionOriginRef.current;
    const line = transcriptLineRefs.current.get(selectedSegmentId) ?? null;
    if (line) {
      const parentScroll = line.closest(".hammer-bay-body");
      if (parentScroll instanceof HTMLElement) {
        const lineTop = line.offsetTop;
        const lineBottom = lineTop + line.offsetHeight;
        const viewTop = parentScroll.scrollTop;
        const viewBottom = viewTop + parentScroll.clientHeight;
        const comfortPadding = Math.min(84, Math.floor(parentScroll.clientHeight * 0.2));
        const inComfortBand = lineTop >= (viewTop + comfortPadding) && lineBottom <= (viewBottom - comfortPadding);
        if (origin !== "playhead" || !inComfortBand) {
          line.scrollIntoView({ block: "center", behavior: origin === "playhead" ? "auto" : "smooth" });
        }
      }
    }

    const trackScroll = timelineTrackScrollRef.current;
    if (trackScroll && timelineDurationSec > 0) {
      const midpoint = (selected.start_sec + selected.end_sec) / 2;
      const ratio = Math.max(0, Math.min(1, midpoint / timelineDurationSec));
      const targetPixel = ratio * trackScroll.scrollWidth;
      const viewLeft = trackScroll.scrollLeft;
      const viewRight = viewLeft + trackScroll.clientWidth;
      const comfortLeft = viewLeft + (trackScroll.clientWidth * 0.2);
      const comfortRight = viewRight - (trackScroll.clientWidth * 0.2);
      const inComfortBand = targetPixel >= comfortLeft && targetPixel <= comfortRight;
      if (origin !== "playhead" || !inComfortBand) {
        const centeredLeft = Math.max(0, targetPixel - (trackScroll.clientWidth / 2));
        trackScroll.scrollTo({
          left: centeredLeft,
          behavior: origin === "playhead" ? "auto" : "smooth",
        });
      }
    }

    selectionOriginRef.current = "system";
  }, [editableTranscriptSegments, selectedSegmentId, timelineDurationSec]);

  async function refreshSourceDeskMedia(): Promise<void> {
    setSourceDeskLoading(true);
    setSourceDeskError(null);
    try {
      const [mediaFiles, selection] = await Promise.all([
        listWorkpieceStoredMedia(launchContext.workpiece_id),
        loadIntroOutroSelection(launchContext.workpiece_id),
      ]);
      setStoredMediaFiles(mediaFiles);
      setIntroOutroSelection(selection ?? {
        intro_path: null,
        outro_path: null,
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      setSourceDeskError(error instanceof Error ? error.message : "Hammer could not load Source Desk media.");
    } finally {
      setSourceDeskLoading(false);
    }
  }

  useEffect(() => {
    void refreshSourceDeskMedia();
    // launchContext workpiece is the canonical scope boundary for stored media.
  }, [launchContext.workpiece_id]);

  useEffect(() => {
    let active = true;
    setReleasePrepLoading(true);
    setReleasePrepError(null);
    setLoadedPreparedPackage(null);
    setReleasePrepSaved(null);

    void loadHammerPreparedReleasePackage(launchContext.workpiece_id)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setReleasePrepError(result.error);
          setReleasePrepLoading(false);
          return;
        }
        setLoadedPreparedPackage(result.exists ? (result.data ?? null) : null);
        setReleasePrepLoading(false);
      })
      .catch((error) => {
        if (!active) return;
        setReleasePrepError(toErrorMessage(error, "Hammer could not load prepared release package state."));
        setReleasePrepLoading(false);
      });

    return () => {
      active = false;
    };
  }, [launchContext.workpiece_id]);

  useEffect(() => {
    let active = true;
    const nextUrls: Record<string, string> = {};
    const nextFailures: Record<string, true> = {};
    const previewPaths = sourceDeskPreviewPaths.slice(0, SOURCE_DESK_PREVIEW_MAX_ITEMS);

    if (sourceDeskPreviewPaths.length > SOURCE_DESK_PREVIEW_MAX_ITEMS) {
      console.info("Hammer Source Desk preview load capped", {
        workpieceId: launchContext.workpiece_id,
        requested: sourceDeskPreviewPaths.length,
        loaded: previewPaths.length,
      });
    }

    async function loadPreviewBatch(paths: string[]): Promise<void> {
      await Promise.all(paths.map(async (path) => {
        try {
          const url = await loadWorkpieceMediaPreviewUrl({
            workpieceId: launchContext.workpiece_id,
            path,
          });
          nextUrls[path] = url;
        } catch (error) {
          nextFailures[path] = true;
          const diagnostics = readHammerMediaPreviewErrorDiagnostics(error);
          console.warn("Hammer Source Desk preview unavailable", {
            workpieceId: launchContext.workpiece_id,
            originalPath: diagnostics?.originalPath ?? path,
            normalizedPath: diagnostics?.normalizedPath
              ?? normalizeWorkpieceRelativePath(launchContext.workpiece_id, path),
            status: diagnostics?.status ?? null,
            error,
          });
        }
      }));
    }

    void (async () => {
      for (let index = 0; index < previewPaths.length; index += SOURCE_DESK_PREVIEW_FETCH_CONCURRENCY) {
        if (!active) break;
        const batch = previewPaths.slice(index, index + SOURCE_DESK_PREVIEW_FETCH_CONCURRENCY);
        await loadPreviewBatch(batch);
      }

      if (!active) {
        for (const url of Object.values(nextUrls)) URL.revokeObjectURL(url);
        return;
      }
      setSourceDeskPreviewUrls((previous) => {
        const previousKeys = Object.keys(previous);
        const nextKeys = Object.keys(nextUrls);
        const unchanged = previousKeys.length === nextKeys.length
          && nextKeys.every((key) => previous[key] === nextUrls[key]);
        if (unchanged) return previous;
        for (const url of Object.values(previous)) URL.revokeObjectURL(url);
        return nextUrls;
      });
      setSourceDeskPreviewFailures((previous) => {
        const previousKeys = Object.keys(previous);
        const nextKeys = Object.keys(nextFailures);
        const unchanged = previousKeys.length === nextKeys.length
          && nextKeys.every((key) => previous[key] === nextFailures[key]);
        return unchanged ? previous : nextFailures;
      });
    })();

    return () => {
      active = false;
    };
  }, [launchContext.workpiece_id, sourceDeskPreviewPaths]);

  useEffect(() => () => {
    for (const url of Object.values(sourceDeskPreviewUrls)) URL.revokeObjectURL(url);
  }, [sourceDeskPreviewUrls]);

  async function handleSourceDeskUpload(
    category: "images" | "broll" | "introoutro",
    fileList: FileList | null,
  ): Promise<void> {
    const file = fileList?.[0] ?? null;
    if (!file) return;
    setUploadingCategory(category);
    setSourceDeskError(null);
    try {
      await uploadWorkpieceMediaFile({
        workpieceId: launchContext.workpiece_id,
        file,
        category,
      });
      await refreshSourceDeskMedia();
    } catch (error) {
      setSourceDeskError(error instanceof Error ? error.message : "Hammer could not upload the selected file.");
    } finally {
      setUploadingCategory(null);
    }
  }

  async function persistIntroOutroSelection(next: HammerIntroOutroSelection): Promise<void> {
    setSavingIntroOutro(true);
    setSourceDeskError(null);
    try {
      await saveIntroOutroSelection({
        workpieceId: launchContext.workpiece_id,
        selection: next,
      });
      setIntroOutroSelection(next);
    } catch (error) {
      setSourceDeskError(error instanceof Error ? error.message : "Hammer could not save intro/outro selection.");
    } finally {
      setSavingIntroOutro(false);
    }
  }

  function updateSegmentTiming(
    segmentId: string,
    label: string,
    updater: (segment: HammerTranscriptSegment) => HammerTranscriptSegment,
    playheadUpdater?: (currentPlayheadSec: number) => number,
  ): void {
    applyHistoryMutation({
      label,
      kind: "timing_adjustment",
      affectedSegments: [segmentId],
      computeAfter: (before) => ({
        ...before,
        transcriptSegments: updateSegmentInTimeline(before.transcriptSegments, segmentId, updater),
        playheadSec: playheadUpdater ? playheadUpdater(before.playheadSec) : before.playheadSec,
        transcriptTimingHint: null,
      }),
    });
  }

  function moveSegment(segmentId: string, deltaSec: number): void {
    updateSegmentTiming(
      segmentId,
      "Adjust segment timing",
      (segment) => moveSegmentTiming(segment, deltaSec),
      (current) => Math.max(0, roundToTenth(current + deltaSec)),
    );
  }

  function trimSegmentStart(segmentId: string, deltaSec: number): void {
    updateSegmentTiming(
      segmentId,
      "Trim segment start",
      (segment) => trimSegmentStartTiming(segment, deltaSec),
      (current) => Math.max(0, roundToTenth(current + deltaSec)),
    );
  }

  function trimSegmentEnd(segmentId: string, deltaSec: number): void {
    updateSegmentTiming(segmentId, "Trim segment end", (segment) => trimSegmentEndTiming(segment, deltaSec));
  }

  function applyCleanup(preview: HammerCleanupPreview): void {
    const toolId = preview.label.toLowerCase().replace(/\s+/g, "-");
    historyControllerRef.current?.createCheckpoint(`Before ${preview.label}`);
    applyHistoryMutation({
      label: preview.label,
      kind: "cleanup_tool",
      affectedSegments: preview.suggestions.map((suggestion) => suggestion.segmentId),
      toolId,
      immediatePersist: true,
      computeAfter: (before) => {
        const synced = syncEditableTranscriptSegments(preview.resultSegments, before.selectedSegmentId);
        const selected = synced.selectedSegmentId
          ? synced.segments.find((segment) => segment.segment_id === synced.selectedSegmentId) ?? null
          : null;
        return {
          ...before,
          transcriptSegments: synced.segments,
          selectedSegmentId: synced.selectedSegmentId,
          playheadSec: selected ? selected.start_sec : before.playheadSec,
          transcriptTimingHint: null,
        };
      },
    });
  }

  function updateVisualPlacementTiming(placementId: string, deltaSec: number): void {
    applyHistoryMutation({
      label: "Adjust visual placement timing",
      kind: "visual_adjustment",
      toolId: "video",
      affectedPlacementIds: [placementId],
      immediatePersist: true,
      computeAfter: (before) => {
        const current = before.visualPlacements;
        if (!current) return before;
        const nextPlacements = current.placements.map((placement) => {
          if (placement.placement_id !== placementId) return placement;
          const duration = Math.max(0.5, roundToTenth(placement.end_sec - placement.start_sec));
          const nextStart = Math.max(0, roundToTenth(placement.start_sec + deltaSec));
          const maxStart = Math.max(0, roundToTenth(transcriptDurationSec - duration));
          const clampedStart = Math.min(nextStart, maxStart);
          const nextEnd = Math.min(transcriptDurationSec, roundToTenth(clampedStart + duration));
          return {
            ...placement,
            start_sec: clampedStart,
            end_sec: Math.max(roundToTenth(clampedStart + 0.5), nextEnd),
          };
        });

        return {
          ...before,
          visualPlacements: {
            ...current,
            placements: nextPlacements,
          },
        };
      },
    });
  }

  function removeVisualPlacement(placementId: string): void {
    const placement = editableVisualPlacements?.placements.find((item) => item.placement_id === placementId) ?? null;
    applyHistoryMutation({
      label: "Remove image placement",
      kind: "visual_adjustment",
      toolId: "video",
      affectedSegments: placement ? [placement.anchor_segment_id] : undefined,
      affectedPlacementIds: [placementId],
      immediatePersist: true,
      computeAfter: (before) => {
        const current = before.visualPlacements;
        if (!current) return before;

        return {
          ...before,
          visualPlacements: {
            ...current,
            placements: current.placements.filter((item) => item.placement_id !== placementId),
          },
        };
      },
    });
  }

  function addImagePlacementFromLibrary(args: {
    assetPath: string;
    label: string;
  }): void {
    const placementId = createVisualPlacementId();

    applyHistoryMutation({
      label: "Add image placement",
      kind: "visual_adjustment",
      toolId: "video",
      affectedPlacementIds: [placementId],
      immediatePersist: true,
      computeAfter: (before) => {
        const current = before.visualPlacements;
        if (!current) return before;

        const anchorSegment = before.selectedSegmentId
          ? before.transcriptSegments.find((segment) => segment.segment_id === before.selectedSegmentId) ?? null
          : before.transcriptSegments[0] ?? null;
        if (!anchorSegment) return before;

        const nextStart = Math.max(0, roundToTenth(before.playheadSec));
        const nextEnd = Math.max(nextStart + 0.5, Math.min(transcriptDurationSec, roundToTenth(nextStart + 3)));
        const nextPlacement: HammerVisualPlacementRecord = {
          placement_id: placementId,
          entry_id: `manual:${placementId}`,
          anchor_segment_id: anchorSegment.segment_id,
          matched_segment_ids: [anchorSegment.segment_id],
          anchor_text: anchorSegment.text,
          asset_ref: args.assetPath,
          asset_id: null,
          asset_path: args.assetPath,
          storage_key: args.assetPath,
          label: args.label,
          visual_mode: "still_image",
          start_sec: nextStart,
          end_sec: nextEnd,
          confidence: null,
          timing_source: "ordered_fallback",
          status: "placed",
          ingest_state: "approved",
          uncertainty_flags: [],
        };

        return {
          ...before,
          selectedSegmentId: anchorSegment.segment_id,
          visualPlacements: {
            ...current,
            placements: [...current.placements, nextPlacement],
          },
        };
      },
    });
  }

  useEffect(() => {
    function handleKeyboardHistory(event: KeyboardEvent): void {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();

      const wantsUndo = key === "z" && !event.shiftKey;
      const wantsRedo = (key === "z" && event.shiftKey) || key === "y";
      if (!wantsUndo && !wantsRedo) return;

      event.preventDefault();
      event.stopPropagation();

      if (wantsUndo) {
        undoHistory();
        return;
      }
      redoHistory();
    }

    window.addEventListener("keydown", handleKeyboardHistory);
    return () => {
      window.removeEventListener("keydown", handleKeyboardHistory);
    };
  }, [editableTranscriptSegments, playheadSec, selectedSegmentId, transcriptTimingHint]);

  const exportBasis = useMemo(() => {
    const transcriptForRelease = preserveTranscriptMetadata(
      editableTranscriptSegments,
      props.structuredTranscript ?? null,
      mediaRef,
      transcriptSourceId,
    );
    const editPlan = launchContext.edit_plan
      ? {
        ...launchContext.edit_plan,
        instructions: launchContext.edit_plan.instructions.map((instruction) => ({ ...instruction })),
      }
      : createFallbackEditPlan(launchContext, transcriptSourceId, previewMode);
    const timelineRevision = createSemanticEditPlanSignature(
      transcriptSourceId,
      previewMode,
      editPlan.instructions,
    );
    const currentReleasePackage = buildHammerReleasePrepPackage({
      workspaceId: launchContext.workspace_id,
      workpieceId: launchContext.workpiece_id,
      prepStatus: transcriptForRelease.segments.length > 0 ? "prepared" : "idle",
      alignmentStatus: transcriptForRelease.segments.length > 0 ? "aligned" : "not_started",
      structuredTranscript: transcriptForRelease,
      visualPlacements: editableVisualPlacements,
      audioPolish: props.audioPolish ?? null,
      editorSession: {
        schema_version: 1,
        session_id: launchContext.session_id ?? editPlan.session_id ?? `${launchContext.workpiece_id}:session`,
        source_mode: launchContext.source_mode,
        preview_mode: previewMode,
        transcript_source_id: transcriptSourceId,
        selected_segment_id: selectedSegmentId,
        selected_overlay_row_id: selectedSegmentId,
        media_ref: mediaRef ? { ...mediaRef } : null,
        workspace_mapping: workspaceMapping ? { ...workspaceMapping } : null,
        media_source_label: mediaSourceLabel,
        last_opened_at: new Date().toISOString(),
      },
    });

    return {
      transcriptForRelease,
      currentReleasePackage,
      timelineRevision,
      subtitles: {
        srt: currentReleasePackage.text_outputs?.subtitles.srt.artifact?.content ?? null,
        vtt: currentReleasePackage.text_outputs?.subtitles.vtt.artifact?.content ?? null,
      },
    };
  }, [
    editableTranscriptSegments,
    launchContext,
    mediaRef,
    mediaSourceLabel,
    previewMode,
    props.audioPolish,
    props.structuredTranscript,
    editableVisualPlacements,
    selectedSegmentId,
    transcriptSourceId,
    workspaceMapping,
  ]);

  const releasePrepComparison = useMemo(
    () => compareHammerPreparedReleasePackageToCurrent(
      loadedPreparedPackage,
      exportBasis.currentReleasePackage,
      { timelineRevision: exportBasis.timelineRevision },
    ),
    [exportBasis.currentReleasePackage, exportBasis.timelineRevision, loadedPreparedPackage],
  );
  const timelineRevisionChanged = useMemo(() => {
    if (!loadedPreparedPackage) return false;
    const previous = loadedPreparedPackage.provenance.timelineRevision ?? null;
    const current = exportBasis.timelineRevision ?? null;
    return previous !== current;
  }, [exportBasis.timelineRevision, loadedPreparedPackage]);
  const releasePrepStaleReasons = useMemo(() => {
    const reasons = [...releasePrepComparison.staleReasons];
    if (timelineRevisionChanged) reasons.push("Timeline revision changed");
    return reasons;
  }, [releasePrepComparison.staleReasons, timelineRevisionChanged]);
  const exportTruthState: HammerExportTruthState = !loadedPreparedPackage
    ? "never_prepared"
    : releasePrepComparison.preparedStatus === "current" && !timelineRevisionChanged
    ? "current"
    : "stale";
  const exportStatusLabel = exportTruthState === "never_prepared"
    ? "Never prepared"
    : exportTruthState === "current"
    ? "Prepared and current"
    : "Prepared, but stale";
  const prepareButtonLabel = exportTruthState === "stale"
    ? "Prepare Updated Package"
    : "Prepare Release Package";
  const releasePrepOpenHref = useMemo(() => {
    if (!props.releasePrepHref || !loadedPreparedPackage) return null;
    try {
      const parsed = new URL(props.releasePrepHref, "https://forge.local");
      parsed.searchParams.set("quench_open", "prepared_release");
      parsed.searchParams.set("prepared_package_path", HAMMER_PREPARED_RELEASE_PACKAGE_PATH);
      parsed.searchParams.set("prepared_package_version", String(loadedPreparedPackage.version));
      parsed.searchParams.set(
        "prepared_package_fingerprint",
        buildPreparedPackageIdentityFingerprint(loadedPreparedPackage),
      );
      if (loadedPreparedPackage.preparedAt) {
        parsed.searchParams.set("prepared_package_prepared_at", loadedPreparedPackage.preparedAt);
      } else {
        parsed.searchParams.delete("prepared_package_prepared_at");
      }
      parsed.searchParams.set("prepared_package_state", exportTruthState);
      const search = parsed.searchParams.toString();
      return search ? `${parsed.pathname}?${search}` : parsed.pathname;
    } catch {
      return props.releasePrepHref;
    }
  }, [exportTruthState, loadedPreparedPackage, props.releasePrepHref]);

  async function handlePrepareReleasePackage(): Promise<void> {
    if (releasePrepSaving) return;

    setReleasePrepSaving(true);
    setReleasePrepError(null);
    setReleasePrepSaved(null);

    try {
      const preparedPackage = buildHammerPreparedReleasePackage({
        current: exportBasis.currentReleasePackage,
        timelineRevision: exportBasis.timelineRevision,
      });

      const result = await saveHammerPreparedReleasePackage({
        workpieceId: launchContext.workpiece_id,
        pkg: preparedPackage,
        subtitles: exportBasis.subtitles,
      });
      if (!result.ok) {
        throw new Error(result.error);
      }

      const subtitleArtifactCount = Number(Boolean(preparedPackage.subtitles.srt.artifactPath))
        + Number(Boolean(preparedPackage.subtitles.vtt.artifactPath));

      setReleasePrepSaved({
        preparedAt: preparedPackage.preparedAt,
        overallStatus: preparedPackage.overallStatus,
        subtitleArtifactCount,
      });
      setLoadedPreparedPackage(result.data ?? preparedPackage);
    } catch (error) {
      setReleasePrepError(toErrorMessage(error, "Hammer could not prepare the release package."));
    } finally {
      setReleasePrepSaving(false);
    }
  }

  useEffect(() => {
    if (!props.prepHandoffAction) return;
    if (props.prepHandoffAction.token === lastHandledHandoffTokenRef.current) return;

    lastHandledHandoffTokenRef.current = props.prepHandoffAction.token;

    switch (props.prepHandoffAction.id) {
      case "review_transcript":
      case "begin_manual_editing":
        setSelectedSourceTab("transcript");
        setFocusOverride("source-focus");
        break;
      case "review_visuals":
        setSelectedSourceTab("images");
        setActiveTool("video");
        setFocusOverride("tool-focus");
        break;
      case "review_audio":
        setActiveTool("audio");
        setFocusOverride("tool-focus");
        break;
      case "review_macros":
        setActiveTool("finishing");
        setFocusOverride("tool-focus");
        break;
      default:
        break;
    }
  }, [props.prepHandoffAction]);

  useEffect(() => {
    if (!props.onWorkspaceSnapshotChange) return;

    const editPlan = launchContext.edit_plan
      ? {
        ...launchContext.edit_plan,
        instructions: launchContext.edit_plan.instructions.map((instruction) => ({ ...instruction })),
      }
      : createFallbackEditPlan(launchContext, transcriptSourceId, previewMode);

    const snapshot: HammerWorkspaceSnapshot = {
      workspaceId: launchContext.workspace_id,
      workpieceId: launchContext.workpiece_id,
      sessionId: launchContext.session_id ?? editPlan.session_id ?? `${launchContext.workpiece_id}:session`,
      sourceMode: launchContext.source_mode,
      previewMode,
      editPlanStatus: "clean",
      editPlanSignature: createSemanticEditPlanSignature(transcriptSourceId, previewMode, editPlan.instructions),
      transcriptSourceId: transcriptSourceId,
      transcriptSegments: editableTranscriptSegments,
      selectedSegmentId,
      selectedOverlayRowId: selectedSegmentId,
      mediaRef,
      workspaceMapping,
      mediaSourceLabel,
      selectedMacroRecipeRef: props.selectedMacroRecipeRef ?? null,
      lastMacroRunRef: props.lastMacroRunRef ?? null,
      structuredTranscript: props.structuredTranscript ?? null,
      editPlan,
      visualPlacements: editableVisualPlacements,
      audioPolish: props.audioPolish ?? null,
    };

    props.onWorkspaceSnapshotChange(snapshot);
  }, [
    launchContext,
    mediaRef,
    mediaSourceLabel,
    previewMode,
    props.audioPolish,
    props.lastMacroRunRef,
    props.onWorkspaceSnapshotChange,
    props.selectedMacroRecipeRef,
    props.structuredTranscript,
    editableVisualPlacements,
    selectedSegmentId,
    editableTranscriptSegments,
    transcriptSourceId,
    workspaceMapping,
  ]);

  return (
    <section
      className={[
        "hammer-workspace-shell",
        workspaceFocusMode === "source-focus" ? "is-source-focus" : "",
        workspaceFocusMode === "tool-focus" ? "is-tool-focus" : "",
        workspaceFocusMode === "time-focus" ? "is-time-focus" : "",
        workspaceFocusMode === "balanced" ? "is-balanced" : "",
      ].filter(Boolean).join(" ")}
      style={{
        ["--hammer-shell-toolbar-width" as string]: `${TOOLBAR_WIDTH_PX}px`,
        ["--hammer-shell-preview-width" as string]: `${PREVIEW_BAY_MAX_WIDTH_PX}px`,
        ["--hammer-shell-timeline-height" as string]: `${TIMELINE_DOCK_BASELINE_HEIGHT_PX}px`,
        ["--hammer-shell-timeline-time-focus-height" as string]: `${TIMELINE_DOCK_TIME_FOCUS_HEIGHT_PX}px`,
      }}
    >
      <div className="hammer-workspace-shell__main">
        <div className="hammer-workspace-shell__top">
          <section className="hammer-source-bay">
            <header className="hammer-bay-head">
              <strong>Source Desk</strong>
              <div className="hammer-bay-tabs">
                <button
                  type="button"
                  onClick={undoHistory}
                  disabled={!canUndo}
                  title={undoLabel ? `Undo ${undoLabel}` : "Undo"}
                >
                  {canUndo && undoLabelCompact ? `Undo ${undoLabelCompact}` : "Undo"}
                </button>
                <button
                  type="button"
                  onClick={redoHistory}
                  disabled={!canRedo}
                  title={redoLabel ? `Redo ${redoLabel}` : "Redo"}
                >
                  {canRedo && redoLabelCompact ? `Redo ${redoLabelCompact}` : "Redo"}
                </button>
              </div>
              <div className="hammer-bay-tabs">
                {SOURCE_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={selectedSourceTab === tab.id ? "is-active" : ""}
                    onClick={() => setSelectedSourceTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </header>
            <div className="hammer-bay-body">
              {sourceDeskLoading ? (
                <div className="hammer-source-status">Loading stored Source Desk media...</div>
              ) : null}
              {sourceDeskError ? (
                <div
                  className={isSourceDeskAuthMessage(sourceDeskError)
                    ? "hammer-source-status hammer-source-status--info"
                    : "hammer-source-status hammer-source-status--error"}
                  role="status"
                >
                  {sourceDeskError}
                </div>
              ) : null}
              {historyStatus ? (
                <div className="hammer-source-status hammer-source-status--info" role="status">
                  {historyStatus}
                </div>
              ) : null}
              <div className="hammer-source-status hammer-source-status--info" role="status">
                History: {undoDepth} undo / {redoDepth} redo
              </div>

              {selectedSourceTab === "transcript" ? (
                editableTranscriptSegments.length > 0 ? (
                  <>
                    {selectedSegment ? (
                      <section className="hammer-transcript-editor" aria-label="Selected transcript segment editor">
                        <div className="hammer-transcript-editor__meta">
                          <span>{selectedSegment.start_sec.toFixed(1)}s - {selectedSegment.end_sec.toFixed(1)}s</span>
                          <span>{selectedSegment.segment_id}</span>
                        </div>
                        <div className="hammer-transcript-editor__meta">
                          <label className="hammer-transcript-editor__field">
                            <span>Start (s)</span>
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={selectedSegment.start_sec}
                              onFocus={() => setFocusOverride("source-focus")}
                              onChange={(event) => {
                                const parsed = Number(event.target.value);
                                if (!Number.isFinite(parsed)) return;
                                const nextStart = Math.max(0, roundToTenth(parsed));
                                setFocusOverride("source-focus");
                                applyHistoryMutation({
                                  label: "Adjust segment start",
                                  kind: "timing_adjustment",
                                  affectedSegments: [selectedSegment.segment_id],
                                  computeAfter: (before) => ({
                                    ...before,
                                    transcriptSegments: updateSegmentInTimeline(
                                      before.transcriptSegments,
                                      selectedSegment.segment_id,
                                      (segment) => {
                                        const endFloor = roundToTenth(nextStart + 0.1);
                                        return {
                                          ...segment,
                                          start_sec: nextStart,
                                          end_sec: Math.max(roundToTenth(segment.end_sec), endFloor),
                                        };
                                      },
                                    ),
                                    selectedSegmentId: selectedSegment.segment_id,
                                    playheadSec: nextStart,
                                    transcriptTimingHint: nextStart !== parsed
                                      ? `Start adjusted to ${nextStart.toFixed(1)}s to stay on the timeline grid.`
                                      : null,
                                  }),
                                });
                              }}
                            />
                          </label>
                          <label className="hammer-transcript-editor__field">
                            <span>End (s)</span>
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={selectedSegment.end_sec}
                              onFocus={() => setFocusOverride("source-focus")}
                              onChange={(event) => {
                                const parsed = Number(event.target.value);
                                if (!Number.isFinite(parsed)) return;
                                const nextEnd = Math.max(0, roundToTenth(parsed));
                                const minimumEnd = roundToTenth(selectedSegment.start_sec + 0.1);
                                const adjustedEnd = Math.max(nextEnd, minimumEnd);
                                setFocusOverride("source-focus");
                                applyHistoryMutation({
                                  label: "Adjust segment end",
                                  kind: "timing_adjustment",
                                  affectedSegments: [selectedSegment.segment_id],
                                  computeAfter: (before) => ({
                                    ...before,
                                    transcriptSegments: updateSegmentInTimeline(
                                      before.transcriptSegments,
                                      selectedSegment.segment_id,
                                      (segment) => ({
                                        ...segment,
                                        end_sec: Math.max(adjustedEnd, roundToTenth(segment.start_sec + 0.1)),
                                      }),
                                    ),
                                    selectedSegmentId: selectedSegment.segment_id,
                                    transcriptTimingHint: adjustedEnd !== parsed
                                      ? `End adjusted to ${adjustedEnd.toFixed(1)}s to remain after start time.`
                                      : null,
                                  }),
                                });
                              }}
                            />
                          </label>
                        </div>
                        {transcriptTimingHint ? (
                          <div className="hammer-transcript-editor__hint" role="status">
                            {transcriptTimingHint}
                          </div>
                        ) : null}
                        <label className="hammer-transcript-editor__field">
                          <span>Speaker</span>
                          <input
                            type="text"
                            value={selectedSegment.speaker}
                            onFocus={() => setFocusOverride("source-focus")}
                            onChange={(event) => {
                              setFocusOverride("source-focus");
                              applyHistoryMutation({
                                label: "Edit speaker label",
                                kind: "speaker_edit",
                                affectedSegments: [selectedSegment.segment_id],
                                transactionId: `speaker:${selectedSegment.segment_id}:${activeTool}:${selectedSourceTab}`,
                                allowCoalesce: true,
                                computeAfter: (before) => ({
                                  ...before,
                                  transcriptSegments: updateTranscriptSegmentSpeaker(
                                    before.transcriptSegments,
                                    selectedSegment.segment_id,
                                    event.target.value,
                                  ),
                                  transcriptTimingHint: null,
                                }),
                              });
                            }}
                          />
                        </label>
                        <label className="hammer-transcript-editor__field">
                          <span>Text</span>
                          <textarea
                            value={selectedSegment.text}
                            onFocus={() => setFocusOverride("source-focus")}
                            onChange={(event) => {
                              setFocusOverride("source-focus");
                              applyHistoryMutation({
                                label: "Edit transcript text",
                                kind: "transcript_text_edit",
                                affectedSegments: [selectedSegment.segment_id],
                                transactionId: `text:${selectedSegment.segment_id}:${activeTool}:${selectedSourceTab}`,
                                allowCoalesce: true,
                                computeAfter: (before) => ({
                                  ...before,
                                  transcriptSegments: updateTranscriptSegmentText(
                                    before.transcriptSegments,
                                    selectedSegment.segment_id,
                                    event.target.value,
                                  ),
                                  transcriptTimingHint: null,
                                }),
                              });
                            }}
                          />
                        </label>
                      </section>
                    ) : null}
                    <div className="hammer-transcript-status-rail" role="status">
                      <span>{editableTranscriptSegments.length} segments</span>
                      <span>{modifiedSegmentCount} modified</span>
                      <span>{modifiedSegmentCount > 0 ? "recompute needed" : "in sync"}</span>
                    </div>
                    <article className="hammer-transcript-document" aria-label="Transcript document">
                      {editableTranscriptSegments.map((segment) => (
                        <button
                          key={segment.segment_id}
                          type="button"
                          className={[
                            "hammer-transcript-line",
                            segment.segment_id === selectedSegmentId ? "is-active" : "",
                            modifiedTranscriptSegmentIds.has(segment.segment_id) ? "is-modified" : "",
                          ].filter(Boolean).join(" ")}
                          onClick={() => {
                            selectionOriginRef.current = "transcript";
                            setFocusOverride("source-focus");
                            setSelectedSegmentId(segment.segment_id);
                            setTranscriptTimingHint(null);
                            setPlayheadSec(segment.start_sec);
                          }}
                          ref={(element) => {
                            if (element) {
                              transcriptLineRefs.current.set(segment.segment_id, element);
                            } else {
                              transcriptLineRefs.current.delete(segment.segment_id);
                            }
                          }}
                        >
                          <span className="hammer-transcript-line__meta">
                            {segment.start_sec.toFixed(1)}s - {segment.end_sec.toFixed(1)}s
                            {" · "}
                            {(segment.end_sec - segment.start_sec).toFixed(1)}s
                            {modifiedTranscriptSegmentIds.has(segment.segment_id) ? " · modified" : ""}
                          </span>
                          <span className="hammer-transcript-line__speaker">{segment.speaker}:</span>
                          <span className="hammer-transcript-line__text">{segment.text}</span>
                        </button>
                      ))}
                    </article>
                  </>
                ) : <div className="hammer-empty-state">Transcript is not loaded yet.</div>
              ) : null}

              {selectedSourceTab === "images" ? (
                sourceImageItems.length > 0 || sourceImageLibraryItems.length > 0 ? (
                  <>
                    <div className="hammer-source-summary">
                      <span>{sourceImageItems.length} placements</span>
                      <span>{sourceImageItems.filter((item) => item.status === "uncertain").length} uncertain</span>
                    </div>
                    <div className="hammer-source-summary">
                      <span>{sourceImageLibraryItems.length} stored images</span>
                      <button
                        type="button"
                        className="hammer-source-upload-button is-secondary"
                        onClick={() => imageUploadInputRef.current?.click()}
                        disabled={uploadingCategory != null}
                      >
                        {uploadingCategory === "images" ? "Uploading..." : "Upload Image"}
                      </button>
                    </div>
                    <input
                      ref={imageUploadInputRef}
                      type="file"
                      accept="image/*"
                      className="hammer-source-upload-input"
                      onChange={(event) => {
                        void handleSourceDeskUpload("images", event.currentTarget.files);
                        event.currentTarget.value = "";
                      }}
                    />
                    {sourceImageItems.map((item) => (
                      <article key={item.id} className="hammer-source-card">
                        {item.assetPath && sourceDeskPreviewUrls[item.assetPath] ? (
                          <img
                            className="hammer-source-card__thumb"
                            src={sourceDeskPreviewUrls[item.assetPath]}
                            alt={item.label}
                          />
                        ) : (
                          <div className="hammer-source-card__thumb hammer-source-card__thumb--placeholder">
                            {item.assetPath && sourceDeskPreviewFailures[item.assetPath] ? "Preview unavailable" : "No thumbnail"}
                          </div>
                        )}
                        <header className="hammer-source-card__head">
                          <strong>{item.label}</strong>
                          <span className={item.status === "uncertain" ? "is-warning" : "is-ready"}>{item.status}</span>
                        </header>
                        <div className="hammer-source-card__meta">
                          <span>Type: image</span>
                          <span>{item.startSec.toFixed(1)}s - {item.endSec.toFixed(1)}s</span>
                          <span>Uses: 1</span>
                          <span>{item.visualMode ?? "visual"}</span>
                          <span>{item.confidence != null ? `${Math.round(item.confidence * 100)}% match` : "match n/a"}</span>
                        </div>
                        <div className="hammer-source-card__actions">
                          <button
                            type="button"
                            onClick={() => {
                              selectionOriginRef.current = "timeline";
                              setFocusOverride("time-focus");
                              setSelectedSegmentId(item.anchorSegmentId);
                              setPlayheadSec(item.startSec);
                            }}
                          >
                            Jump to timeline
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFocusOverride("time-focus");
                              updateVisualPlacementTiming(item.id, -0.5);
                            }}
                          >
                            -0.5s
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFocusOverride("time-focus");
                              updateVisualPlacementTiming(item.id, 0.5);
                            }}
                          >
                            +0.5s
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFocusOverride("tool-focus");
                              removeVisualPlacement(item.id);
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </article>
                    ))}
                    {sourceImageLibraryItems.map((file) => (
                      <article key={file.path} className="hammer-source-card">
                        {sourceDeskPreviewUrls[file.path] ? (
                          <img
                            className="hammer-source-card__thumb"
                            src={sourceDeskPreviewUrls[file.path]}
                            alt={file.name}
                          />
                        ) : (
                          <div className="hammer-source-card__thumb hammer-source-card__thumb--placeholder">
                            {sourceDeskPreviewFailures[file.path] ? "Preview unavailable" : "No thumbnail"}
                          </div>
                        )}
                        <header className="hammer-source-card__head">
                          <strong>{file.name}</strong>
                          <span>stored</span>
                        </header>
                        <div className="hammer-source-card__meta">
                          <span>Type: image</span>
                          <span>Uses: {imageUsageByPath.get(file.path) ?? 0}</span>
                          <span>{formatBytes(file.bytes)}</span>
                          <span>{file.updatedAt ?? "updated time unavailable"}</span>
                        </div>
                        <div className="hammer-source-card__path">{file.path}</div>
                        <div className="hammer-source-card__actions">
                          <button
                            type="button"
                            onClick={() => {
                              setFocusOverride("tool-focus");
                              addImagePlacementFromLibrary({
                                assetPath: file.path,
                                label: file.name,
                              });
                            }}
                          >
                            Add placement
                          </button>
                        </div>
                      </article>
                    ))}
                  </>
                ) : (
                  <>
                    <div className="hammer-source-summary">
                      <span>No image placements are available yet.</span>
                      <button
                        type="button"
                        className="hammer-source-upload-button is-secondary"
                        onClick={() => imageUploadInputRef.current?.click()}
                        disabled={uploadingCategory != null}
                      >
                        {uploadingCategory === "images" ? "Uploading..." : "Upload Image"}
                      </button>
                    </div>
                    <input
                      ref={imageUploadInputRef}
                      type="file"
                      accept="image/*"
                      className="hammer-source-upload-input"
                      onChange={(event) => {
                        void handleSourceDeskUpload("images", event.currentTarget.files);
                        event.currentTarget.value = "";
                      }}
                    />
                  </>
                )
              ) : null}

              {selectedSourceTab === "assets" ? (
                sourceAssetItems.length > 0 ? (
                  <>
                    <div className="hammer-source-summary">
                      <span>{sourceAssetItems.length} assets linked</span>
                      <span>{workspaceMapping ? "workspace mapped" : "mapping unavailable"}</span>
                    </div>
                    {sourceAssetItems.map((item) => (
                      <article key={item.id} className="hammer-source-card">
                        <header className="hammer-source-card__head">
                          <strong>{item.label}</strong>
                          <span>{item.kind}</span>
                        </header>
                        <div className="hammer-source-card__meta">
                          <span>Uses: {item.usageCount}</span>
                          <span>{item.firstStartSec.toFixed(1)}s - {item.lastEndSec.toFixed(1)}s</span>
                          <span>{item.visualMode ?? "mode n/a"}</span>
                        </div>
                        <div className="hammer-source-card__path">{item.assetPath ?? "asset path unavailable"}</div>
                        <div className="hammer-source-card__actions">
                          <button
                            type="button"
                            onClick={() => {
                              setFocusOverride("time-focus");
                              setPlayheadSec(item.firstStartSec);
                            }}
                          >
                            Reveal in timeline
                          </button>
                        </div>
                      </article>
                    ))}
                  </>
                ) : <div className="hammer-empty-state">No linked assets found for this workpiece.</div>
              ) : null}

              {selectedSourceTab === "broll" ? (
                sourceBrollItems.length > 0 ? (
                  <>
                    <div className="hammer-source-summary">
                      <span>{sourceBrollItems.length} b-roll assets</span>
                      <button
                        type="button"
                        className="hammer-source-upload-button is-secondary"
                        onClick={() => brollUploadInputRef.current?.click()}
                        disabled={uploadingCategory != null}
                      >
                        {uploadingCategory === "broll" ? "Uploading..." : "Upload B-roll"}
                      </button>
                    </div>
                    <input
                      ref={brollUploadInputRef}
                      type="file"
                      accept="video/*"
                      className="hammer-source-upload-input"
                      onChange={(event) => {
                        void handleSourceDeskUpload("broll", event.currentTarget.files);
                        event.currentTarget.value = "";
                      }}
                    />
                    {sourceBrollItems.map((item) => (
                      <article key={item.id} className="hammer-source-card">
                        {item.assetPath && sourceDeskPreviewUrls[item.assetPath] ? (
                          <video
                            className="hammer-source-card__thumb"
                            src={sourceDeskPreviewUrls[item.assetPath]}
                            muted
                            preload="metadata"
                          />
                        ) : (
                          <div className="hammer-source-card__thumb hammer-source-card__thumb--placeholder">
                            {item.assetPath && sourceDeskPreviewFailures[item.assetPath] ? "Preview unavailable" : "No thumbnail"}
                          </div>
                        )}
                        <header className="hammer-source-card__head">
                          <strong>{item.label}</strong>
                          <span>b-roll</span>
                        </header>
                        <div className="hammer-source-card__meta">
                          <span>Type: b-roll</span>
                          <span>{item.firstStartSec.toFixed(1)}s - {item.lastEndSec.toFixed(1)}s</span>
                          <span>Uses: {item.usageCount}</span>
                          <span>{item.visualMode ?? "mode n/a"}</span>
                        </div>
                        <div className="hammer-source-card__path">{item.assetPath ?? "asset path unavailable"}</div>
                        <div className="hammer-source-card__actions">
                          <button
                            type="button"
                            onClick={() => {
                              setFocusOverride("time-focus");
                              setPlayheadSec(item.firstStartSec);
                            }}
                          >
                            Cue b-roll window
                          </button>
                        </div>
                      </article>
                    ))}
                  </>
                ) : (
                  <>
                    <div className="hammer-source-summary">
                      <span>No b-roll assets are currently linked.</span>
                      <button
                        type="button"
                        className="hammer-source-upload-button is-secondary"
                        onClick={() => brollUploadInputRef.current?.click()}
                        disabled={uploadingCategory != null}
                      >
                        {uploadingCategory === "broll" ? "Uploading..." : "Upload B-roll"}
                      </button>
                    </div>
                    <input
                      ref={brollUploadInputRef}
                      type="file"
                      accept="video/*"
                      className="hammer-source-upload-input"
                      onChange={(event) => {
                        void handleSourceDeskUpload("broll", event.currentTarget.files);
                        event.currentTarget.value = "";
                      }}
                    />
                  </>
                )
              ) : null}

              {selectedSourceTab === "introoutro" ? (
                <>
                  <div className="hammer-source-summary">
                    <span>Choose project intro and outro media</span>
                    <button
                      type="button"
                      className="hammer-source-upload-button"
                      onClick={() => introOutroUploadInputRef.current?.click()}
                      disabled={uploadingCategory != null}
                    >
                      {uploadingCategory === "introoutro" ? "Uploading..." : "Upload Intro/Outro"}
                    </button>
                  </div>
                  <input
                    ref={introOutroUploadInputRef}
                    type="file"
                    accept="video/*,audio/*"
                    className="hammer-source-upload-input"
                    onChange={(event) => {
                      void handleSourceDeskUpload("introoutro", event.currentTarget.files);
                      event.currentTarget.value = "";
                    }}
                  />

                  <section className="hammer-source-card">
                    <header className="hammer-source-card__head">
                      <strong>Project Intro</strong>
                      <span>{introOutroSelection.intro_path ? "selected" : "not set"}</span>
                    </header>
                    <select
                      className="hammer-source-select"
                      value={introOutroSelection.intro_path ?? ""}
                      onChange={(event) => {
                        const next: HammerIntroOutroSelection = {
                          ...introOutroSelection,
                          intro_path: event.target.value || null,
                          updated_at: new Date().toISOString(),
                        };
                        void persistIntroOutroSelection(next);
                      }}
                      disabled={savingIntroOutro}
                    >
                      <option value="">No intro</option>
                      {introOutroCandidateItems.map((item) => (
                        <option key={`intro-${item.path}`} value={item.path}>
                          {item.name} ({item.kind})
                        </option>
                      ))}
                    </select>
                    <div className="hammer-source-card__path">{introOutroSelection.intro_path ?? "No intro selected"}</div>
                  </section>

                  <section className="hammer-source-card">
                    <header className="hammer-source-card__head">
                      <strong>Project Outro</strong>
                      <span>{introOutroSelection.outro_path ? "selected" : "not set"}</span>
                    </header>
                    <select
                      className="hammer-source-select"
                      value={introOutroSelection.outro_path ?? ""}
                      onChange={(event) => {
                        const next: HammerIntroOutroSelection = {
                          ...introOutroSelection,
                          outro_path: event.target.value || null,
                          updated_at: new Date().toISOString(),
                        };
                        void persistIntroOutroSelection(next);
                      }}
                      disabled={savingIntroOutro}
                    >
                      <option value="">No outro</option>
                      {introOutroCandidateItems.map((item) => (
                        <option key={`outro-${item.path}`} value={item.path}>
                          {item.name} ({item.kind})
                        </option>
                      ))}
                    </select>
                    <div className="hammer-source-card__path">{introOutroSelection.outro_path ?? "No outro selected"}</div>
                  </section>
                  <div className="hammer-source-summary">
                    <span>Saved to Tongs workpiece storage</span>
                    <span>{savingIntroOutro ? "Saving..." : `Updated ${introOutroSelection.updated_at}`}</span>
                  </div>
                </>
              ) : null}
            </div>
          </section>

          <section className="hammer-preview-bay">
            <header className="hammer-bay-head">
              <strong>Preview Monitors</strong>
              <span>{previewMode}</span>
            </header>
            <div className="hammer-bay-body hammer-preview-bay__body">
              <div className="hammer-preview-surface">
                {playheadSegment ? (
                  <div className="hammer-preview-surface__label">
                    {resolvePreviewLabel(playheadSegment, playheadSec)}
                  </div>
                ) : (
                  <div className="hammer-preview-surface__label">{resolvePreviewLabel(playheadSegment, playheadSec)}</div>
                )}
              </div>
              <div className="hammer-preview-meta">
                <span>Playhead {playheadSec.toFixed(1)}s</span>
                <span>{mediaSourceLabel ?? "No media source"}</span>
              </div>
            </div>
          </section>

          <section className="hammer-tool-bay">
            <header className="hammer-bay-head">
              <strong>Tool Rack</strong>
              <span>{TOOL_ORDER.find((tool) => tool.id === activeTool)?.label}</span>
            </header>
            <div className="hammer-bay-body">
              {activeTool === "polish" ? (
                <section className="hammer-tool-card">
                  <header className="hammer-tool-card__head">Transcript Polish</header>
                  <label className="hammer-tool-field">
                    <span>Cleanup Strength: {polishStrength}%</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={polishStrength}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setPolishStrength(Number(event.target.value));
                      }}
                    />
                  </label>
                  <section className="hammer-cleanup-tool">
                    <div className="hammer-cleanup-tool__head">
                      <strong>Shorten Gaps</strong>
                      <span>Tighten dead air without changing spoken content.</span>
                    </div>
                    <label className="hammer-tool-field">
                      <span>Max allowed gap (sec)</span>
                      <input
                        type="number"
                        min={0.1}
                        step={0.05}
                        value={gapCleanupOptions.maxGapSec}
                        onChange={(event) => {
                          setFocusOverride("tool-focus");
                          setGapCleanupOptions((current) => ({
                            ...current,
                            maxGapSec: Math.max(0.1, Number(event.target.value) || 0.4),
                          }));
                        }}
                      />
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={gapCleanupOptions.preserveDramaticPauses}
                        onChange={(event) => setGapCleanupOptions((current) => ({
                          ...current,
                          preserveDramaticPauses: event.target.checked,
                        }))}
                      />
                      <span>Preserve dramatic pauses</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("tool-focus");
                        setCleanupPreview(previewShortenGaps(editableTranscriptSegments, gapCleanupOptions));
                      }}
                    >
                      Preview Changes
                    </button>
                  </section>

                  <section className="hammer-cleanup-tool">
                    <div className="hammer-cleanup-tool__head">
                      <strong>Remove Fillers</strong>
                      <span>Cut ums, uhs, and verbal clutter deterministically.</span>
                    </div>
                    <label className="hammer-tool-field">
                      <span>Aggressiveness</span>
                      <select
                        value={fillerCleanupOptions.aggressiveness}
                        onChange={(event) => setFillerCleanupOptions((current) => ({
                          ...current,
                          aggressiveness: event.target.value as FillerCleanupOptions["aggressiveness"],
                        }))}
                      >
                        <option value="light">Light</option>
                        <option value="medium">Medium</option>
                        <option value="strong">Strong</option>
                      </select>
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={fillerCleanupOptions.protectIntentionalPhrasing}
                        onChange={(event) => setFillerCleanupOptions((current) => ({
                          ...current,
                          protectIntentionalPhrasing: event.target.checked,
                        }))}
                      />
                      <span>Protect intentional phrasing</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("tool-focus");
                        setCleanupPreview(previewRemoveFillers(editableTranscriptSegments, fillerCleanupOptions));
                      }}
                    >
                      Preview Changes
                    </button>
                  </section>

                  <section className="hammer-cleanup-tool">
                    <div className="hammer-cleanup-tool__head">
                      <strong>Remove Retakes</strong>
                      <span>Remove false starts and repeated takes with confidence scoring.</span>
                    </div>
                    <label className="hammer-tool-field">
                      <span>Detection mode</span>
                      <select
                        value={retakeCleanupOptions.detection}
                        onChange={(event) => setRetakeCleanupOptions((current) => ({
                          ...current,
                          detection: event.target.value as RetakeCleanupOptions["detection"],
                        }))}
                      >
                        <option value="conservative">Conservative</option>
                        <option value="normal">Normal</option>
                        <option value="aggressive">Aggressive</option>
                      </select>
                    </label>
                    <label className="hammer-tool-check">
                      <input
                        type="checkbox"
                        checked={retakeCleanupOptions.preferLaterCleanerTake}
                        onChange={(event) => setRetakeCleanupOptions((current) => ({
                          ...current,
                          preferLaterCleanerTake: event.target.checked,
                        }))}
                      />
                      <span>Prefer later cleaner take</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("tool-focus");
                        setCleanupPreview(previewRemoveRetakes(editableTranscriptSegments, retakeCleanupOptions));
                      }}
                    >
                      Preview Changes
                    </button>
                  </section>

                  <section className="hammer-cleanup-tool hammer-cleanup-tool--quick">
                    <div className="hammer-cleanup-tool__head">
                      <strong>Quick Clean</strong>
                      <span>Run Retakes → Fillers → Gaps in one deterministic pass.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("tool-focus");
                        setCleanupPreview(previewQuickClean({
                          segments: editableTranscriptSegments,
                          retakes: retakeCleanupOptions,
                          fillers: fillerCleanupOptions,
                          gaps: gapCleanupOptions,
                        }));
                      }}
                    >
                      Preview Quick Clean
                    </button>
                  </section>

                  {cleanupPreview ? (
                    <section className="hammer-cleanup-preview" aria-label="Cleanup preview">
                      <div className="hammer-cleanup-preview__head">
                        <strong>{cleanupPreview.label}</strong>
                        <span>
                          {cleanupPreview.summary.changedSegments} segments affected · {cleanupPreview.summary.removedSegments} removed ·{" "}
                          {cleanupPreview.summary.timeSavedSec.toFixed(1)}s saved
                        </span>
                      </div>
                      <div className="hammer-cleanup-preview__list">
                        {cleanupPreview.suggestions.slice(0, 8).map((suggestion) => (
                          <div key={suggestion.id}>
                            {suggestion.description} ({Math.round(suggestion.confidence * 100)}% confidence)
                          </div>
                        ))}
                        {cleanupPreview.suggestions.length > 8 ? (
                          <div>+{cleanupPreview.suggestions.length - 8} more suggestions</div>
                        ) : null}
                      </div>
                      <div className="hammer-cleanup-preview__actions">
                        <button type="button" onClick={() => applyCleanup(cleanupPreview)}>Apply</button>
                        <button type="button" onClick={() => setCleanupPreview(null)}>Discard</button>
                      </div>
                    </section>
                  ) : null}
                  <div className="hammer-tool-hint">Deterministic cleanup only. No AI inference path.</div>
                </section>
              ) : null}

              {activeTool === "audio" ? (
                <section className="hammer-tool-card">
                  <header className="hammer-tool-card__head">Audio Adjustments</header>
                  <label className="hammer-tool-check">
                    <input
                      type="checkbox"
                      checked={audioLevelingEnabled}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setAudioLevelingEnabled(event.target.checked);
                      }}
                    />
                    <span>Level dialogue track</span>
                  </label>
                  <label className="hammer-tool-check">
                    <input
                      type="checkbox"
                      checked={audioNoiseReductionEnabled}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setAudioNoiseReductionEnabled(event.target.checked);
                      }}
                    />
                    <span>Reduce background noise</span>
                  </label>
                  <div className="hammer-tool-hint">Current prep status: {props.audioPolish?.status ?? "not_started"}</div>
                </section>
              ) : null}

              {activeTool === "video" ? (
                <section className="hammer-tool-card">
                  <header className="hammer-tool-card__head">Visual Placement</header>
                  <label className="hammer-tool-field">
                    <span>Snap Mode</span>
                    <select
                      value={videoSnapMode}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setVideoSnapMode(event.target.value as "timeline" | "segment");
                      }}
                    >
                      <option value="timeline">Timeline grid</option>
                      <option value="segment">Segment boundaries</option>
                    </select>
                  </label>
                  <div className="hammer-tool-hint">Placed visuals: {editableVisualPlacements?.placements.length ?? 0}</div>
                </section>
              ) : null}

              {activeTool === "captions" ? (
                <section className="hammer-tool-card">
                  <header className="hammer-tool-card__head">Caption Output</header>
                  <label className="hammer-tool-field">
                    <span>Caption Style</span>
                    <select
                      value={captionStyle}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setCaptionStyle(event.target.value as "sentence" | "title" | "upper");
                      }}
                    >
                      <option value="sentence">Sentence case</option>
                      <option value="title">Title case</option>
                      <option value="upper">UPPERCASE</option>
                    </select>
                  </label>
                </section>
              ) : null}

              {activeTool === "details" ? (
                <section className="hammer-tool-card">
                  <header className="hammer-tool-card__head">Edit Metadata</header>
                  <label className="hammer-tool-field">
                    <span>Tag</span>
                    <input
                      type="text"
                      value={detailTag}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setDetailTag(event.target.value);
                      }}
                    />
                  </label>
                </section>
              ) : null}

              {activeTool === "finishing" ? (
                <section className="hammer-tool-card">
                  <header className="hammer-tool-card__head">Finishing Checklist</header>
                  <label className="hammer-tool-check">
                    <input
                      type="checkbox"
                      checked={finishingChecklist.transcriptReviewed}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setFinishingChecklist((current) => ({
                          ...current,
                          transcriptReviewed: event.target.checked,
                        }));
                      }}
                    />
                    <span>Transcript reviewed</span>
                  </label>
                  <label className="hammer-tool-check">
                    <input
                      type="checkbox"
                      checked={finishingChecklist.visualsReviewed}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setFinishingChecklist((current) => ({
                          ...current,
                          visualsReviewed: event.target.checked,
                        }));
                      }}
                    />
                    <span>Visuals reviewed</span>
                  </label>
                  <label className="hammer-tool-check">
                    <input
                      type="checkbox"
                      checked={finishingChecklist.audioReviewed}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setFinishingChecklist((current) => ({
                          ...current,
                          audioReviewed: event.target.checked,
                        }));
                      }}
                    />
                    <span>Audio reviewed</span>
                  </label>
                </section>
              ) : null}

              {activeTool === "export" ? (
                <section className="hammer-tool-card">
                  <header className="hammer-tool-card__head">Quench Handoff</header>
                  <div className="hammer-tool-hint">
                    {releasePrepOpenHref ? "Handoff path available." : "Handoff path unavailable."}
                  </div>
                  <div className="hammer-tool-hint">Export status: {exportStatusLabel}</div>
                  {releasePrepLoading ? (
                    <div className="hammer-tool-hint">Checking prepared package state...</div>
                  ) : null}
                  {loadedPreparedPackage?.preparedAt ? (
                    <div className="hammer-tool-hint">
                      Last prepared {new Date(loadedPreparedPackage.preparedAt).toLocaleString()}.
                    </div>
                  ) : null}
                  {loadedPreparedPackage?.transcript.fingerprint ? (
                    <div className="hammer-tool-hint">
                      Basis {loadedPreparedPackage.transcript.fingerprint.slice(0, 18)}...
                    </div>
                  ) : null}
                  {exportTruthState === "stale" && releasePrepStaleReasons.length > 0 ? (
                    <div className="hammer-tool-hint">
                      Changes since last prepare: {releasePrepStaleReasons.join("; ")}.
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      void handlePrepareReleasePackage();
                    }}
                    disabled={releasePrepSaving || releasePrepLoading}
                  >
                    {releasePrepSaving ? "Preparing..." : prepareButtonLabel}
                  </button>
                  {releasePrepSaved ? (
                    <div className="hammer-tool-hint">
                      Prepared {new Date(releasePrepSaved.preparedAt).toLocaleString()}.
                      Status {releasePrepSaved.overallStatus}.
                      Subtitle artifacts {releasePrepSaved.subtitleArtifactCount}.
                    </div>
                  ) : null}
                  {releasePrepError ? (
                    <div className="hammer-tool-hint">
                      {releasePrepError}
                    </div>
                  ) : null}
                  {releasePrepOpenHref && exportTruthState !== "never_prepared" ? (
                    <a href={releasePrepOpenHref}>
                      {exportTruthState === "current" ? "Open Release Prep" : "Open Release Prep (stale)"}
                    </a>
                  ) : null}
                </section>
              ) : null}

              <div className="hammer-tool-state-grid">
                <div>Workspace mode: {workspaceFocusMode}</div>
                <div>Macro: {props.selectedMacroRecipeRef ?? "none"}</div>
                <div>Last run: {props.lastMacroRunRef ?? "none"}</div>
                <div>Release prep: {releasePrepOpenHref ? "available" : "unavailable"}</div>
              </div>
            </div>
          </section>
        </div>

        <section className="hammer-timeline-dock">
            <header className="hammer-bay-head">
              <strong>Timeline Dock</strong>
              <div className="hammer-timeline-tools">
                <button type="button" onClick={() => setFocusOverride("auto")}>Auto</button>
                <button type="button" onClick={() => setFocusOverride("source-focus")}>Source</button>
                <button type="button" onClick={() => setFocusOverride("tool-focus")}>Tool</button>
                <button type="button" onClick={() => setFocusOverride("time-focus")}>Time</button>
              </div>
            </header>
          <div className="hammer-bay-body hammer-timeline-dock__body">
            <input
              type="range"
              min={0}
              max={transcriptDurationSec}
              step={0.1}
              value={playheadSec}
              onChange={(event) => {
                selectionOriginRef.current = "playhead";
                setPlayheadSec(Number(event.target.value));
                setFocusOverride(resolveFocusAfterPlayheadChange(focusOverride));
              }}
              aria-label="Timeline playhead"
            />
            {selectedSegment ? (
              <section className="hammer-timeline-editor" aria-label="Selected segment timing inspector">
                <div className="hammer-timeline-editor__meta">
                  <span>{selectedSegment.speaker}</span>
                  <span>{selectedSegment.start_sec.toFixed(1)}s - {selectedSegment.end_sec.toFixed(1)}s</span>
                </div>
                <div className="hammer-timeline-editor__controls">
                  <div className="hammer-timeline-editor__control-group">
                    <span>Move</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("time-focus");
                        moveSegment(selectedSegment.segment_id, -0.5);
                      }}
                    >
                      -0.5s
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("time-focus");
                        moveSegment(selectedSegment.segment_id, 0.5);
                      }}
                    >
                      +0.5s
                    </button>
                  </div>
                  <div className="hammer-timeline-editor__control-group">
                    <span>Trim In</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("time-focus");
                        trimSegmentStart(selectedSegment.segment_id, -0.1);
                      }}
                    >
                      -0.1s
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("time-focus");
                        trimSegmentStart(selectedSegment.segment_id, 0.1);
                      }}
                    >
                      +0.1s
                    </button>
                  </div>
                  <div className="hammer-timeline-editor__control-group">
                    <span>Trim Out</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("time-focus");
                        trimSegmentEnd(selectedSegment.segment_id, -0.1);
                      }}
                    >
                      -0.1s
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusOverride("time-focus");
                        trimSegmentEnd(selectedSegment.segment_id, 0.1);
                      }}
                    >
                      +0.1s
                    </button>
                  </div>
                </div>
              </section>
            ) : null}
            <div className="hammer-timeline-track-scroll" ref={timelineTrackScrollRef}>
              {editableTranscriptSegments.length > 0 ? (
                <section className="hammer-timeline-board" aria-label="Track-based timeline">
                  <div className="hammer-timeline-ruler">
                    {timelineMinorTicks.map((tick) => (
                      <div
                        key={`minor-tick-${tick.ratio}`}
                        className="hammer-timeline-ruler__tick hammer-timeline-ruler__tick--minor"
                        style={{ left: `${tick.ratio * 100}%` }}
                      />
                    ))}
                    {timelineTicks.map((tick) => (
                      <div
                        key={`tick-${tick.ratio}`}
                        className="hammer-timeline-ruler__tick"
                        style={{ left: `${tick.ratio * 100}%` }}
                      >
                        <span>{tick.timeSec.toFixed(0)}s</span>
                      </div>
                    ))}
                    <div
                      className="hammer-timeline-ruler__time-readout"
                      style={{ left: `${playheadRatioPercent}%` }}
                    >
                      {playheadSec.toFixed(1)}s
                    </div>
                    <div
                      className="hammer-timeline-playhead"
                      style={{ left: `${playheadRatioPercent}%` }}
                    />
                  </div>

                  {timelineLanes.map((lane) => (
                    <div key={lane.id} className={`hammer-timeline-lane hammer-timeline-lane--${lane.tone}`}>
                      <div className="hammer-timeline-lane__label">
                        <strong>{lane.label}</strong>
                        <span>{lane.blocks.length} clips</span>
                      </div>
                      <div className={`hammer-timeline-lane__track hammer-timeline-lane__track--${lane.tone}`}>
                        {(laneGapsById.get(lane.id) ?? []).map((gap) => (
                          <div
                            key={gap.id}
                            className="hammer-timeline-gap"
                            style={{
                              left: `${(gap.startSec / timelineDurationSec) * 100}%`,
                              width: `${Math.max(0.8, ((gap.endSec - gap.startSec) / timelineDurationSec) * 100)}%`,
                            }}
                          />
                        ))}
                        <div
                          className="hammer-timeline-lane__playhead"
                          style={{ left: `${playheadRatioPercent}%` }}
                        />
                        {lane.blocks.map((block) => (
                          <button
                            key={block.id}
                            type="button"
                            className={`hammer-timeline-block hammer-timeline-block--${block.tone}${block.selected ? " is-active" : ""}`}
                            style={{
                              left: `${(block.startSec / timelineDurationSec) * 100}%`,
                              width: `${Math.max(1.4, ((block.endSec - block.startSec) / timelineDurationSec) * 100)}%`,
                            }}
                            onClick={block.onSelect}
                            title={`${block.label} ${block.startSec.toFixed(1)}-${block.endSec.toFixed(1)}s`}
                          >
                            <span>{block.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              ) : (
                <div className="hammer-empty-state">Timeline content transplant pending.</div>
              )}
            </div>
          </div>
        </section>
      </div>

      <nav className="hammer-toolbar" aria-label="Patch Bay Toolbar">
        <div className="hammer-toolbar__title">Tools</div>
        {TOOL_ORDER.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={activeTool === tool.id ? "hammer-toolbar__tool is-active" : "hammer-toolbar__tool"}
            onClick={() => setActiveTool(tool.id)}
            title={tool.label}
          >
            <strong>{tool.shortLabel}</strong>
            <span>{tool.label}</span>
          </button>
        ))}
      </nav>
    </section>
  );
}
