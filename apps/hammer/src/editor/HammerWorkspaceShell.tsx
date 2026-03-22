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
  listWorkpieceStoredMedia,
  loadIntroOutroSelection,
  loadWorkpieceMediaPreviewUrl,
  saveIntroOutroSelection,
  uploadWorkpieceMediaFile,
  type HammerIntroOutroSelection,
  type HammerStoredMediaFile,
} from "../lib/hammerSourceDeskMediaApi";
import "./HammerWorkspaceShell.css";

const TOOLBAR_WIDTH_PX = 72;
const PREVIEW_BAY_MAX_WIDTH_PX = 460;
const TIMELINE_DOCK_BASELINE_HEIGHT_PX = 376;
const TIMELINE_DOCK_TIME_FOCUS_HEIGHT_PX = 504;

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

function isSourceDeskAuthMessage(message: string | null): boolean {
  if (!message) return false;
  return /(auth|session|token|sign[ -]?in|unauthorized|forbidden)/i.test(message);
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
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(transcriptSegments[0]?.segment_id ?? null);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [focusOverride, setFocusOverride] = useState<HammerWorkspaceFocusOverride>("auto");
  const [polishStrength, setPolishStrength] = useState(60);
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
  const imageUploadInputRef = useRef<HTMLInputElement | null>(null);
  const brollUploadInputRef = useRef<HTMLInputElement | null>(null);
  const introOutroUploadInputRef = useRef<HTMLInputElement | null>(null);
  const lastHandledHandoffTokenRef = useRef<number | null>(null);

  const previewMode: HammerPreviewMode = launchContext.preview_mode ?? launchContext.edit_plan?.preview_mode ?? "edit-aware";
  const workspaceFocusMode = focusOverride === "auto" ? resolveWorkspaceFocusMode(activeTool) : focusOverride;
  const mediaRef = resolveMediaRef(launchContext);
  const workspaceMapping = resolveWorkspaceMapping(launchContext);
  const mediaSourceLabel = launchContext.media.kind === "dev-tone"
    ? "Dev tone"
    : launchContext.media.label ?? mediaRef?.local_relpath ?? null;

  const selectedSegment = editableTranscriptSegments.find((segment) => segment.segment_id === selectedSegmentId) ?? null;
  const playheadSegment = resolvePlayheadSegment(editableTranscriptSegments, playheadSec);
  const transcriptDurationSec = resolveTranscriptDurationSec(editableTranscriptSegments);
  const sourceImageItems = useMemo<HammerSourceImageItem[]>(() => (
    (props.visualPlacements?.placements ?? []).map((placement) => ({
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
  ), [props.visualPlacements?.placements]);
  const sourceAssetItems = useMemo<HammerSourceAssetItem[]>(() => {
    const byId = new Map<string, HammerSourceAssetItem>();
    for (const placement of props.visualPlacements?.placements ?? []) {
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
  }, [mediaRef, props.visualPlacements?.placements, storedMediaFiles, transcriptDurationSec]);
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
  const dialogueLaneBlocks = useMemo<HammerTimelineLaneBlock[]>(() => (
    editableTranscriptSegments.map((segment) => ({
      id: `dialogue:${segment.segment_id}`,
      label: segment.speaker,
      startSec: segment.start_sec,
      endSec: segment.end_sec,
      selected: segment.segment_id === selectedSegmentId,
      tone: "dialogue",
      onSelect: () => {
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

  useEffect(() => {
    const synced = syncEditableTranscriptSegments(transcriptSegments, selectedSegmentId);
    setEditableTranscriptSegments(synced.segments);
    setSelectedSegmentId(synced.selectedSegmentId);
  }, [transcriptSegments, transcriptSourceId]);

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
    const nextUrls: Record<string, string> = {};

    void Promise.all(sourceDeskPreviewPaths.map(async (path) => {
      try {
        const url = await loadWorkpieceMediaPreviewUrl({
          workpieceId: launchContext.workpiece_id,
          path,
        });
        nextUrls[path] = url;
      } catch {
        // Keep missing previews non-blocking; cards still render metadata/actions.
      }
    })).then(() => {
      if (!active) {
        for (const url of Object.values(nextUrls)) URL.revokeObjectURL(url);
        return;
      }
      setSourceDeskPreviewUrls((previous) => {
        for (const url of Object.values(previous)) URL.revokeObjectURL(url);
        return nextUrls;
      });
    });

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
    updater: (segment: HammerTranscriptSegment) => HammerTranscriptSegment,
  ): void {
    setEditableTranscriptSegments((current) => updateSegmentInTimeline(current, segmentId, updater));
  }

  function moveSegment(segmentId: string, deltaSec: number): void {
    updateSegmentTiming(segmentId, (segment) => moveSegmentTiming(segment, deltaSec));
    setPlayheadSec((current) => Math.max(0, roundToTenth(current + deltaSec)));
  }

  function trimSegmentStart(segmentId: string, deltaSec: number): void {
    updateSegmentTiming(segmentId, (segment) => trimSegmentStartTiming(segment, deltaSec));
    setPlayheadSec((current) => Math.max(0, roundToTenth(current + deltaSec)));
  }

  function trimSegmentEnd(segmentId: string, deltaSec: number): void {
    updateSegmentTiming(segmentId, (segment) => trimSegmentEndTiming(segment, deltaSec));
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
      visualPlacements: props.visualPlacements ?? null,
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
    props.visualPlacements,
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

              {selectedSourceTab === "transcript" ? (
                editableTranscriptSegments.length > 0 ? (
                  <>
                    {selectedSegment ? (
                      <section className="hammer-transcript-editor" aria-label="Selected transcript segment editor">
                        <div className="hammer-transcript-editor__meta">
                          <span>{selectedSegment.start_sec.toFixed(1)}s - {selectedSegment.end_sec.toFixed(1)}s</span>
                          <span>{selectedSegment.segment_id}</span>
                        </div>
                        <label className="hammer-transcript-editor__field">
                          <span>Speaker</span>
                          <input
                            type="text"
                            value={selectedSegment.speaker}
                            onFocus={() => setFocusOverride("source-focus")}
                            onChange={(event) => {
                              setFocusOverride("source-focus");
                              setEditableTranscriptSegments((current) => updateTranscriptSegmentSpeaker(
                                current,
                                selectedSegment.segment_id,
                                event.target.value,
                              ));
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
                              setEditableTranscriptSegments((current) => updateTranscriptSegmentText(
                                current,
                                selectedSegment.segment_id,
                                event.target.value,
                              ));
                            }}
                          />
                        </label>
                      </section>
                    ) : null}
                    {editableTranscriptSegments.map((segment) => (
                      <button
                        key={segment.segment_id}
                        type="button"
                        className={segment.segment_id === selectedSegmentId ? "hammer-transcript-row is-active" : "hammer-transcript-row"}
                        onClick={() => {
                          setFocusOverride("source-focus");
                          setSelectedSegmentId(segment.segment_id);
                          setPlayheadSec(segment.start_sec);
                        }}
                      >
                        <span>{segment.speaker}</span>
                        <span>{segment.text}</span>
                      </button>
                    ))}
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
                          <div className="hammer-source-card__thumb hammer-source-card__thumb--placeholder">No thumbnail</div>
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
                              setFocusOverride("time-focus");
                              setSelectedSegmentId(item.anchorSegmentId);
                              setPlayheadSec(item.startSec);
                            }}
                          >
                            Jump to timeline
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
                          <div className="hammer-source-card__thumb hammer-source-card__thumb--placeholder">No thumbnail</div>
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
                          <div className="hammer-source-card__thumb hammer-source-card__thumb--placeholder">No thumbnail</div>
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
                  <div className="hammer-tool-hint">Applies cleanup suggestions without altering original media.</div>
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
                  <div className="hammer-tool-hint">Placed visuals: {props.visualPlacements?.placements.length ?? 0}</div>
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
                    {props.releasePrepHref ? "Handoff path available." : "Handoff path unavailable."}
                  </div>
                </section>
              ) : null}

              <div className="hammer-tool-state-grid">
                <div>Workspace mode: {workspaceFocusMode}</div>
                <div>Macro: {props.selectedMacroRecipeRef ?? "none"}</div>
                <div>Last run: {props.lastMacroRunRef ?? "none"}</div>
                <div>Release prep: {props.releasePrepHref ? "available" : "unavailable"}</div>
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
            <div className="hammer-timeline-track-scroll">
              {editableTranscriptSegments.length > 0 ? (
                <section className="hammer-timeline-board" aria-label="Track-based timeline">
                  <div className="hammer-timeline-ruler">
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
                      className="hammer-timeline-playhead"
                      style={{ left: `${Math.min(100, (playheadSec / timelineDurationSec) * 100)}%` }}
                    />
                  </div>

                  <div className="hammer-timeline-lane">
                    <div className="hammer-timeline-lane__label">Dialogue</div>
                    <div className="hammer-timeline-lane__track">
                      {dialogueLaneBlocks.map((block) => (
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

                  <div className="hammer-timeline-lane">
                    <div className="hammer-timeline-lane__label">Images</div>
                    <div className="hammer-timeline-lane__track">
                      {imageLaneBlocks.map((block) => (
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

                  <div className="hammer-timeline-lane">
                    <div className="hammer-timeline-lane__label">B-roll</div>
                    <div className="hammer-timeline-lane__track">
                      {brollLaneBlocks.map((block) => (
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
