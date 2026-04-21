import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, MouseEvent, MutableRefObject, SetStateAction } from "react";
import type { HammerPassId } from "../persistence/hammerPersistenceContract";
import type { HammerEditorStateSerializable, HammerHistoryKind } from "./hammerWorkspaceHistory";
import type {
  HammerPersistedVisualPlacements,
  HammerVisualPlacementRecord,
} from "../persistence/hammerPersistenceContract";
import type { HammerVisualClip, HammerVisualGeometry, HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import { selectClipById } from "../visuals/state/hammerVisualSelectors";
import type { HammerVisualTimelineAction } from "../visuals/state/hammerVisualActions";
import { deriveLegacyVisualPlacementsFromTimeline } from "../visuals/persistence/hammerVisualTimelineLegacyAdapter";
import {
  deriveStableHammerVisualAssetId,
  migrateLegacyPlacementRecordToAsset,
  migrateLegacyPlacementRecordToClip,
} from "../visuals/model/hammerVisualMigrations";
import {
  buildIntroOutroCandidateItems,
  buildIntroOutroCandidateItemsById,
  buildIntroOutroPackagingSyncPlan,
  buildWorkspaceIntroOutroDefaultsRepairPlan,
} from "./hammerIntroOutroState";
import {
  copyWorkpieceMediaFile,
  saveIntroOutroSelection,
  saveWorkspaceIntroOutroDefaults,
  type HammerIntroOutroSelection,
  type HammerStoredMediaFile,
  type HammerWorkspaceIntroOutroDefaults,
} from "../lib/hammerSourceDeskMediaApi";
import { deriveStableHammerAssetIdFromPath } from "../lib/hammerAssetIdentity";
import type { HammerWorkspaceFocusOverride } from "./hammerWorkspaceTimeline";
import { roundToTenth } from "./hammerWorkspaceTimeline";
import { normalizeWorkpieceRelativePath } from "../../../../packages/contracts/workpiece-paths";
import {
  clampImagePlacementTransform,
  clampNumber,
  createVisualPlacementId,
  DEFAULT_VISUAL_PLACEMENT_GEOMETRY,
  geometryToTransform,
  IMAGE_PLACEMENT_COARSE_STEP_SEC,
  IMAGE_PLACEMENT_FINE_STEP_SEC,
  LOGO_POSITION_OPTIONS,
  LOGO_SIZE_OPTIONS,
  MIN_IMAGE_PLACEMENT_DURATION_SEC,
  PACKAGING_INTRO_ENTRY_ID,
  PACKAGING_LOGO_ENTRY_ID,
  PACKAGING_OUTRO_ENTRY_ID,
  positionFromLogoOption,
  resolvePlacementGeometry,
  roundImagePlacementTime,
  snapImagePlacementTime,
  transformToGeometry,
  type HammerImageAnimationContextMenuState,
  type HammerImageAnimationPreset,
  type HammerImagePlacementDraftWindow,
  type HammerImagePlacementTransform,
  type HammerLogoOverlayPosition,
  type HammerLogoOverlaySize,
  type HammerPreviewCanvasDragState,
  type HammerTimelineImageDragState,
  type HammerVisualFlowStepId,
} from "./hammerWorkspaceShellVisualUtils";

type HammerApplyHistoryMutationFn = (args: {
  label: string;
  kind: HammerHistoryKind;
  toolId: string;
  affectedSegments?: string[];
  affectedPlacementIds?: string[];
  immediatePersist?: boolean;
  computeAfter: (before: HammerEditorStateSerializable) => HammerEditorStateSerializable;
}) => unknown;

export type UseHammerWorkspaceShellVisualEditingArgs = {
  workpieceId: string;
  workspaceId: string;
  currentPass: HammerPassId;
  transcriptDurationSec: number;
  timelineDurationSec: number;
  visualPlacementEditingEnabled: boolean;
  storedMediaFiles: HammerStoredMediaFile[];
  editableVisualTimeline: HammerVisualTimelineState | null;
  editableVisualPlacements: HammerPersistedVisualPlacements | null;
  previewSurfaceRef: MutableRefObject<HTMLDivElement | null>;
  setFocusOverride: Dispatch<SetStateAction<HammerWorkspaceFocusOverride>>;
  setTranscriptTimingHint: Dispatch<SetStateAction<string | null>>;
  setSourceDeskError: Dispatch<SetStateAction<string | null>>;
  setSelectedClipId: (clipId: string | null) => void;
  seekPlayheadToTime: (
    nextTimeSec: number,
    origin?: "timeline" | "playhead",
    options?: { snapToBoundary?: boolean },
  ) => void;
  requestDurablePersistBoundary: () => void;
  applyHistoryMutation: HammerApplyHistoryMutationFn;
  applyVisualTimelineAction: (
    before: HammerEditorStateSerializable,
    action: HammerVisualTimelineAction,
  ) => HammerEditorStateSerializable;
  applyVisualTimelineActions: (
    before: HammerEditorStateSerializable,
    actions: HammerVisualTimelineAction[],
  ) => HammerEditorStateSerializable;
  resolveCanonicalVisualTimeline: (before: HammerEditorStateSerializable) => HammerVisualTimelineState;
};

export type UseHammerWorkspaceShellVisualEditingResult = {
  selectedVisualFlowStep: HammerVisualFlowStepId;
  setSelectedVisualFlowStep: Dispatch<SetStateAction<HammerVisualFlowStepId>>;
  imagePlacementDraftWindows: Record<string, HammerImagePlacementDraftWindow>;
  setImagePlacementDraftWindows: Dispatch<SetStateAction<Record<string, HammerImagePlacementDraftWindow>>>;
  timelineImageDragState: HammerTimelineImageDragState | null;
  setTimelineImageDragState: Dispatch<SetStateAction<HammerTimelineImageDragState | null>>;
  imagePlacementTransforms: Record<string, HammerImagePlacementTransform>;
  setImagePlacementTransforms: Dispatch<SetStateAction<Record<string, HammerImagePlacementTransform>>>;
  previewCanvasDragState: HammerPreviewCanvasDragState | null;
  setPreviewCanvasDragState: Dispatch<SetStateAction<HammerPreviewCanvasDragState | null>>;
  imageAnimationContextMenu: HammerImageAnimationContextMenuState | null;
  setImageAnimationContextMenu: Dispatch<SetStateAction<HammerImageAnimationContextMenuState | null>>;
  introOutroSelection: HammerIntroOutroSelection;
  setIntroOutroSelection: Dispatch<SetStateAction<HammerIntroOutroSelection>>;
  packagingLogoAssetPath: string | null;
  setPackagingLogoAssetPath: Dispatch<SetStateAction<string | null>>;
  packagingLogoPosition: HammerLogoOverlayPosition;
  setPackagingLogoPosition: Dispatch<SetStateAction<HammerLogoOverlayPosition>>;
  packagingLogoSize: HammerLogoOverlaySize;
  setPackagingLogoSize: Dispatch<SetStateAction<HammerLogoOverlaySize>>;
  savingIntroOutro: boolean;
  workspaceIntroOutroDefaults: HammerWorkspaceIntroOutroDefaults | null;
  setWorkspaceIntroOutroDefaults: Dispatch<SetStateAction<HammerWorkspaceIntroOutroDefaults | null>>;
  savingWorkspaceIntroOutroDefaults: boolean;
  applyIntroOutroSelectionToFutureEpisodes: boolean;
  setApplyIntroOutroSelectionToFutureEpisodes: Dispatch<SetStateAction<boolean>>;
  applyWorkspaceIntroOutroDefaultsToWorkpiece: (
    defaults: HammerWorkspaceIntroOutroDefaults,
    options?: { existingSelection?: HammerIntroOutroSelection | null; mediaFiles?: HammerStoredMediaFile[] },
  ) => Promise<{
    selection: HammerIntroOutroSelection;
    appliedIntro: boolean;
    appliedOutro: boolean;
  } | null>;
  reconcileIntroOutroSelectionWithPackaging: (args: {
    selection: HammerIntroOutroSelection | null | undefined;
    mediaFiles: HammerStoredMediaFile[];
    introSource: "profile" | "episode" | "manual";
    outroSource: "profile" | "episode" | "manual";
  }) => void;
  persistIntroOutroSelection: (next: HammerIntroOutroSelection) => Promise<void>;
  persistWorkspaceIntroOutroDefaultsNow: () => Promise<void>;
  commitVisualPlacementWindow: (placementId: string, args: { startSec: number; endSec: number; label: string }) => boolean;
  updateVisualPlacementTiming: (placementId: string, deltaSec: number) => void;
  updateImagePlacementTransform: (
    placementId: string,
    updater: (current: HammerImagePlacementTransform) => HammerImagePlacementTransform,
  ) => void;
  commitImagePlacementTransform: (
    placementId: string,
    transform: HammerImagePlacementTransform,
    label: string,
  ) => boolean;
  beginTimelineImagePlacementDrag: (
    event: MouseEvent<HTMLElement | SVGElement>,
    args: { placementId: string; mode: HammerTimelineImageDragState["mode"]; startSec: number; endSec: number },
  ) => void;
  beginPreviewCanvasDrag: (
    event: MouseEvent<HTMLElement>,
    args: { placementId: string; mode: HammerPreviewCanvasDragState["mode"] },
  ) => void;
  openImageAnimationContextMenu: (event: MouseEvent<SVGGElement>, placementId: string) => void;
  applyImageAnimationPreset: (placementId: string, preset: HammerImageAnimationPreset) => void;
  removeVisualPlacement: (placementId: string) => void;
  removePackagingPlacement: (entryId: string, label: string) => void;
  addImagePlacementFromLibrary: (args: { assetPath: string; label: string }) => void;
  addVisualAssetPlacementFromLibrary: (args: {
    assetPath: string;
    label: string;
    kind: "broll" | "reference_clip";
  }) => void;
  applyIntroPlacement: () => void;
  applyOutroPlacement: () => void;
  toggleLogoOverlay: () => void;
  applyLogoOverlayStyle: (next: {
    position?: HammerLogoOverlayPosition;
    size?: HammerLogoOverlaySize;
    assetPath?: string | null;
  }) => void;
  flushPendingPlacementDrafts: () => void;
};

export function useHammerWorkspaceShellVisualEditing(
  args: UseHammerWorkspaceShellVisualEditingArgs,
): UseHammerWorkspaceShellVisualEditingResult {
  const [selectedVisualFlowStep, setSelectedVisualFlowStep] = useState<HammerVisualFlowStepId>("media_map");
  const [imagePlacementDraftWindows, setImagePlacementDraftWindows] = useState<Record<string, HammerImagePlacementDraftWindow>>({});
  const [timelineImageDragState, setTimelineImageDragState] = useState<HammerTimelineImageDragState | null>(null);
  const [imagePlacementTransforms, setImagePlacementTransforms] = useState<Record<string, HammerImagePlacementTransform>>({});
  const [previewCanvasDragState, setPreviewCanvasDragState] = useState<HammerPreviewCanvasDragState | null>(null);
  const [imageAnimationContextMenu, setImageAnimationContextMenu] = useState<HammerImageAnimationContextMenuState | null>(null);
  const [introOutroSelection, setIntroOutroSelection] = useState<HammerIntroOutroSelection>({
    schema_version: 1,
    intro_asset_id: null,
    outro_asset_id: null,
    updated_at: new Date().toISOString(),
  });
  const [packagingLogoAssetPath, setPackagingLogoAssetPath] = useState<string | null>(null);
  const [packagingLogoPosition, setPackagingLogoPosition] = useState<HammerLogoOverlayPosition>("top_right");
  const [packagingLogoSize, setPackagingLogoSize] = useState<HammerLogoOverlaySize>("medium");
  const [savingIntroOutro, setSavingIntroOutro] = useState(false);
  const [workspaceIntroOutroDefaults, setWorkspaceIntroOutroDefaults] = useState<HammerWorkspaceIntroOutroDefaults | null>(null);
  const [savingWorkspaceIntroOutroDefaults, setSavingWorkspaceIntroOutroDefaults] = useState(false);
  const [applyIntroOutroSelectionToFutureEpisodes, setApplyIntroOutroSelectionToFutureEpisodes] = useState(false);

  const imagePlacementDraftWindowsRef = useRef<Record<string, HammerImagePlacementDraftWindow>>({});
  const imagePlacementTransformsRef = useRef<Record<string, HammerImagePlacementTransform>>({});

  const visualPlacementsById = useRef<Map<string, HammerVisualPlacementRecord>>(new Map());
  visualPlacementsById.current = new Map((args.editableVisualPlacements?.placements ?? []).map((placement) => [placement.placement_id, placement]));

  const derivedSourceImageLibraryItems = args.storedMediaFiles.filter((file) => file.kind === "image");
  const introOutroCandidateItemsById = buildIntroOutroCandidateItemsById(buildIntroOutroCandidateItems(args.storedMediaFiles));
  const packagingIntroPlacement = (args.editableVisualPlacements?.placements ?? []).find((item) => item.entry_id === PACKAGING_INTRO_ENTRY_ID) ?? null;
  const packagingOutroPlacement = (args.editableVisualPlacements?.placements ?? []).find((item) => item.entry_id === PACKAGING_OUTRO_ENTRY_ID) ?? null;
  const packagingLogoPlacement = (args.editableVisualPlacements?.placements ?? []).find((item) => item.entry_id === PACKAGING_LOGO_ENTRY_ID) ?? null;

  useEffect(() => {
    imagePlacementDraftWindowsRef.current = imagePlacementDraftWindows;
  }, [imagePlacementDraftWindows]);

  useEffect(() => {
    imagePlacementTransformsRef.current = imagePlacementTransforms;
  }, [imagePlacementTransforms]);

  const commitVisualPlacementWindow = useCallback((
    placementId: string,
    commitArgs: { startSec: number; endSec: number; label: string },
  ): boolean => {
    const clampedStart = Math.max(0, Math.min(args.transcriptDurationSec, roundImagePlacementTime(commitArgs.startSec)));
    const clampedEnd = Math.max(
      roundImagePlacementTime(clampedStart + MIN_IMAGE_PLACEMENT_DURATION_SEC),
      Math.min(args.transcriptDurationSec, roundImagePlacementTime(commitArgs.endSec)),
    );
    const currentClip = args.editableVisualTimeline ? selectClipById(args.editableVisualTimeline, placementId) : null;
    const currentStart = currentClip?.start_sec ?? null;
    const currentEnd = currentClip?.end_sec ?? null;
    if (currentStart === clampedStart && currentEnd === clampedEnd) {
      return false;
    }
    const applied = args.applyHistoryMutation({
      label: commitArgs.label,
      kind: "visual_adjustment",
      toolId: "video",
      affectedPlacementIds: [placementId],
      immediatePersist: true,
      computeAfter: (before) => args.applyVisualTimelineAction(before, {
        type: "UPDATE_CLIP_TIMING",
        clip_id: placementId,
        start_sec: clampedStart,
        end_sec: clampedEnd,
        updated_at: new Date().toISOString(),
      }),
    });
    if (applied) {
      args.requestDurablePersistBoundary();
      return true;
    }
    return false;
  }, [args]);

  const commitImagePlacementTransform = useCallback((
    placementId: string,
    transform: HammerImagePlacementTransform,
    label: string,
  ): boolean => {
    const nextGeometry = transformToGeometry(transform);
    const currentClip = args.editableVisualTimeline ? selectClipById(args.editableVisualTimeline, placementId) : null;
    const currentGeometry = currentClip?.geometry ?? resolvePlacementGeometry(visualPlacementsById.current.get(placementId));
    if (
      currentGeometry.x === nextGeometry.x
      && currentGeometry.y === nextGeometry.y
      && currentGeometry.width === nextGeometry.width
      && currentGeometry.height === nextGeometry.height
      && currentGeometry.anchor === nextGeometry.anchor
    ) {
      return false;
    }
    const applied = args.applyHistoryMutation({
      label,
      kind: "visual_adjustment",
      toolId: "video",
      affectedPlacementIds: [placementId],
      immediatePersist: true,
      computeAfter: (before) => args.applyVisualTimelineAction(before, {
        type: "UPDATE_CLIP_GEOMETRY",
        clip_id: placementId,
        geometry: nextGeometry,
        updated_at: new Date().toISOString(),
      }),
    });
    if (applied) {
      args.requestDurablePersistBoundary();
      return true;
    }
    return false;
  }, [args]);

  const updateVisualPlacementTiming = useCallback((placementId: string, deltaSec: number): void => {
    const placement = args.editableVisualTimeline ? selectClipById(args.editableVisualTimeline, placementId) : null;
    if (!placement) return;
    const duration = Math.max(MIN_IMAGE_PLACEMENT_DURATION_SEC, roundImagePlacementTime(placement.end_sec - placement.start_sec));
    const nextStart = Math.max(0, roundImagePlacementTime(placement.start_sec + deltaSec));
    const maxStart = Math.max(0, roundImagePlacementTime(args.transcriptDurationSec - duration));
    const clampedStart = Math.min(nextStart, maxStart);
    const nextEnd = Math.min(args.transcriptDurationSec, roundImagePlacementTime(clampedStart + duration));
    commitVisualPlacementWindow(placementId, {
      startSec: clampedStart,
      endSec: nextEnd,
      label: "Adjust visual placement timing",
    });
  }, [args.editableVisualTimeline, args.transcriptDurationSec, commitVisualPlacementWindow]);

  const updateImagePlacementTransform = useCallback((
    placementId: string,
    updater: (current: HammerImagePlacementTransform) => HammerImagePlacementTransform,
  ): void => {
    setImagePlacementTransforms((current) => {
      const clip = args.editableVisualTimeline ? selectClipById(args.editableVisualTimeline, placementId) : null;
      const base = current[placementId]
        ?? (clip
          ? geometryToTransform(clip.geometry)
          : geometryToTransform(resolvePlacementGeometry(visualPlacementsById.current.get(placementId))));
      return {
        ...current,
        [placementId]: clampImagePlacementTransform(updater(base)),
      };
    });
  }, [args.editableVisualTimeline]);

  const beginTimelineImagePlacementDrag = useCallback((
    event: MouseEvent<HTMLElement | SVGElement>,
    dragArgs: { placementId: string; mode: HammerTimelineImageDragState["mode"]; startSec: number; endSec: number },
  ): void => {
    if (!args.visualPlacementEditingEnabled) return;
    const button = (event as unknown as { button?: number }).button;
    if (button != null && button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const currentTarget = event.currentTarget as Element;
    const laneTrack = currentTarget.closest(".hammer-visual-timeline-lane__track, .hammer-timeline-lane__track");
    const ownerSvg = currentTarget instanceof SVGElement ? currentTarget.ownerSVGElement : null;
    const trackRect = laneTrack instanceof HTMLElement
      ? laneTrack.getBoundingClientRect()
      : ownerSvg?.getBoundingClientRect() ?? currentTarget.getBoundingClientRect();
    if (trackRect.width <= 0) return;
    args.setFocusOverride("time-focus");
    args.setSelectedClipId(dragArgs.placementId);
    setTimelineImageDragState({
      placementId: dragArgs.placementId,
      mode: dragArgs.mode,
      pointerStartX: event.clientX,
      originStartSec: dragArgs.startSec,
      originEndSec: dragArgs.endSec,
      pxToSec: args.timelineDurationSec / trackRect.width,
    });
  }, [args]);

  const beginPreviewCanvasDrag = useCallback((
    event: MouseEvent<HTMLElement>,
    dragArgs: { placementId: string; mode: HammerPreviewCanvasDragState["mode"] },
  ): void => {
    if (!args.visualPlacementEditingEnabled || event.button !== 0) return;
    const clip = args.editableVisualTimeline ? selectClipById(args.editableVisualTimeline, dragArgs.placementId) : null;
    const activeTransform = imagePlacementTransforms[dragArgs.placementId]
      ?? (clip
        ? geometryToTransform(clip.geometry)
        : geometryToTransform(resolvePlacementGeometry(visualPlacementsById.current.get(dragArgs.placementId))));
    event.preventDefault();
    event.stopPropagation();
    args.setFocusOverride("tool-focus");
    args.setSelectedClipId(dragArgs.placementId);
    setPreviewCanvasDragState({
      placementId: dragArgs.placementId,
      mode: dragArgs.mode,
      pointerStartX: event.clientX,
      pointerStartY: event.clientY,
      origin: activeTransform,
      originAspectRatio: activeTransform.widthPct / Math.max(1, activeTransform.heightPct),
    });
  }, [args, imagePlacementTransforms]);

  const openImageAnimationContextMenu = useCallback((event: MouseEvent<SVGGElement>, placementId: string): void => {
    if (args.currentPass !== "image_placement") return;
    event.preventDefault();
    event.stopPropagation();
    args.setFocusOverride("time-focus");
    args.setSelectedClipId(placementId);
    setImageAnimationContextMenu({ placementId, x: event.clientX, y: event.clientY });
  }, [args]);

  const applyImageAnimationPreset = useCallback((placementId: string, preset: HammerImageAnimationPreset): void => {
    args.applyHistoryMutation({
      label: "Set image animation preset",
      kind: "visual_adjustment",
      toolId: "video",
      affectedPlacementIds: [placementId],
      immediatePersist: true,
      computeAfter: (before) => args.applyVisualTimelineAction(before, {
        type: "UPDATE_CLIP_ANIMATION",
        clip_id: placementId,
        animation: { preset },
        updated_at: new Date().toISOString(),
      }),
    });
    setImageAnimationContextMenu(null);
  }, [args]);

  const removeVisualPlacement = useCallback((placementId: string): void => {
    const placement = args.editableVisualPlacements?.placements.find((item) => item.placement_id === placementId) ?? null;
    args.applyHistoryMutation({
      label: "Remove image placement",
      kind: "visual_adjustment",
      toolId: "video",
      affectedSegments: placement ? [placement.anchor_segment_id] : undefined,
      affectedPlacementIds: [placementId],
      immediatePersist: true,
      computeAfter: (before) => args.applyVisualTimelineAction(before, {
        type: "DELETE_CLIP",
        clip_id: placementId,
        updated_at: new Date().toISOString(),
      }),
    });
  }, [args]);

  const addImagePlacementFromLibrary = useCallback((placementArgs: { assetPath: string; label: string }): void => {
    const placementId = createVisualPlacementId();
    args.applyHistoryMutation({
      label: "Add image placement",
      kind: "visual_adjustment",
      toolId: "video",
      affectedPlacementIds: [placementId],
      immediatePersist: true,
      computeAfter: (before) => {
        const anchorSegment = before.selectedSegmentId
          ? before.transcriptSegments.find((segment) => segment.segment_id === before.selectedSegmentId) ?? null
          : before.transcriptSegments[0] ?? null;
        if (!anchorSegment) return before;
        const nextStart = Math.max(0, roundToTenth(before.playheadSec));
        const nextEnd = Math.max(nextStart + 0.5, Math.min(args.transcriptDurationSec, roundToTenth(nextStart + 3)));
        const visualTimeline = args.resolveCanonicalVisualTimeline(before);
        const updatedAt = new Date().toISOString();
        const nextPlacement: HammerVisualPlacementRecord = {
          placement_id: placementId,
          entry_id: `manual:${placementId}`,
          anchor_segment_id: anchorSegment.segment_id,
          matched_segment_ids: [anchorSegment.segment_id],
          anchor_text: anchorSegment.text,
          asset_ref: placementArgs.assetPath,
          asset_id: null,
          asset_path: placementArgs.assetPath,
          storage_key: placementArgs.assetPath,
          label: placementArgs.label,
          visual_mode: "still_image",
          start_sec: nextStart,
          end_sec: nextEnd,
          confidence: null,
          timing_source: "ordered_fallback",
          status: "placed",
          ingest_state: "approved",
          uncertainty_flags: [],
          overlay_geometry: DEFAULT_VISUAL_PLACEMENT_GEOMETRY,
          animation_preset: "none",
          overlay_opacity: 1,
          overlay_z_index: visualTimeline.clips.length + 1,
        };
        const assetId = deriveStableHammerVisualAssetId(nextPlacement);
        return args.applyVisualTimelineActions({
          ...before,
          selectedSegmentId: anchorSegment.segment_id,
        }, [
          {
            type: "UPSERT_ASSETS",
            assets: [migrateLegacyPlacementRecordToAsset({ record: nextPlacement, asset_id: assetId, updated_at: updatedAt })],
            updated_at: updatedAt,
          },
          {
            type: "CREATE_CLIP",
            clip: migrateLegacyPlacementRecordToClip({ record: nextPlacement, asset_id: assetId, updated_at: updatedAt }),
            updated_at: updatedAt,
          },
        ]);
      },
    });
  }, [args]);

  const addVisualAssetPlacementFromLibrary = useCallback((placementArgs: {
    assetPath: string;
    label: string;
    kind: "broll" | "reference_clip";
  }): void => {
    if (!placementArgs.assetPath.trim()) {
      args.setTranscriptTimingHint("Stored asset path is unavailable. Reload workspace media state before placing it.");
      return;
    }
    const placementId = createVisualPlacementId();
    args.applyHistoryMutation({
      label: placementArgs.kind === "reference_clip" ? "Add reference clip placement" : "Add b-roll placement",
      kind: "visual_adjustment",
      toolId: "video",
      affectedPlacementIds: [placementId],
      immediatePersist: true,
      computeAfter: (before) => {
        const anchorSegment = before.selectedSegmentId
          ? before.transcriptSegments.find((segment) => segment.segment_id === before.selectedSegmentId) ?? null
          : before.transcriptSegments[0] ?? null;
        if (!anchorSegment) return before;
        const nextStart = Math.max(0, roundToTenth(before.playheadSec));
        const nextEnd = Math.max(nextStart + 0.5, Math.min(args.transcriptDurationSec, roundToTenth(nextStart + 3)));
        const visualTimeline = args.resolveCanonicalVisualTimeline(before);
        const updatedAt = new Date().toISOString();
        const nextPlacement: HammerVisualPlacementRecord = {
          placement_id: placementId,
          entry_id: `manual:${placementId}`,
          anchor_segment_id: anchorSegment.segment_id,
          matched_segment_ids: [anchorSegment.segment_id],
          anchor_text: anchorSegment.text,
          asset_ref: placementArgs.assetPath,
          asset_id: null,
          asset_path: placementArgs.assetPath,
          storage_key: placementArgs.assetPath,
          label: placementArgs.label,
          visual_mode: placementArgs.kind,
          start_sec: nextStart,
          end_sec: nextEnd,
          confidence: null,
          timing_source: "ordered_fallback",
          status: "placed",
          ingest_state: "approved",
          uncertainty_flags: [],
          overlay_geometry: {
            ...DEFAULT_VISUAL_PLACEMENT_GEOMETRY,
            x: 0.08,
            y: 0.08,
            width: 0.84,
            height: 0.84,
          },
          animation_preset: "none",
          overlay_opacity: 1,
          overlay_z_index: visualTimeline.clips.length + 1,
        };
        const assetId = deriveStableHammerVisualAssetId(nextPlacement);
        return args.applyVisualTimelineActions({
          ...before,
          selectedSegmentId: anchorSegment.segment_id,
        }, [
          {
            type: "UPSERT_ASSETS",
            assets: [migrateLegacyPlacementRecordToAsset({ record: nextPlacement, asset_id: assetId, updated_at: updatedAt })],
            updated_at: updatedAt,
          },
          {
            type: "CREATE_CLIP",
            clip: migrateLegacyPlacementRecordToClip({ record: nextPlacement, asset_id: assetId, updated_at: updatedAt }),
            updated_at: updatedAt,
          },
        ]);
      },
    });
  }, [args]);

  const upsertPackagingPlacement = useCallback((placementArgs: {
    entryId: string;
    assetPath: string;
    assetId?: string;
    label: string;
    startSec: number;
    endSec: number;
    visualMode: string;
    uncertaintyFlags?: string[];
    overlayGeometry?: HammerVisualGeometry;
    systemMeta?: {
      system_managed: true;
      system_type: "intro" | "outro";
      system_source: "profile" | "episode" | "manual";
      system_asset_id: string;
    };
  }): void => {
    args.applyHistoryMutation({
      label: `Apply ${placementArgs.label}`,
      kind: "visual_adjustment",
      toolId: "finishing",
      immediatePersist: true,
      computeAfter: (before) => {
        const anchorSegment = before.transcriptSegments[0] ?? null;
        if (!anchorSegment) return before;
        const visualTimeline = args.resolveCanonicalVisualTimeline(before);
        const existingClip = visualTimeline.clips.find((clip) => clip.entry_id === placementArgs.entryId) ?? null;
        const placementId = existingClip ? existingClip.clip_id : createVisualPlacementId();
        const updatedAt = new Date().toISOString();
        const nextPlacement: HammerVisualPlacementRecord = {
          placement_id: placementId,
          entry_id: placementArgs.entryId,
          anchor_segment_id: anchorSegment.segment_id,
          matched_segment_ids: [anchorSegment.segment_id],
          anchor_text: anchorSegment.text,
          asset_ref: placementArgs.assetPath,
          asset_id: null,
          asset_path: placementArgs.assetPath,
          storage_key: placementArgs.assetPath,
          label: placementArgs.label,
          visual_mode: placementArgs.visualMode,
          start_sec: Math.max(0, roundToTenth(placementArgs.startSec)),
          end_sec: Math.max(roundToTenth(placementArgs.startSec + MIN_IMAGE_PLACEMENT_DURATION_SEC), roundToTenth(placementArgs.endSec)),
          confidence: null,
          timing_source: "ordered_fallback",
          status: "placed",
          ingest_state: "approved",
          uncertainty_flags: placementArgs.uncertaintyFlags ?? [],
          overlay_geometry: placementArgs.entryId === PACKAGING_LOGO_ENTRY_ID
            ? (placementArgs.overlayGeometry ?? positionFromLogoOption(packagingLogoPosition, packagingLogoSize))
            : { ...DEFAULT_VISUAL_PLACEMENT_GEOMETRY, x: 0, y: 0, width: 1, height: 1 },
          animation_preset: "none",
          overlay_opacity: 1,
          overlay_z_index: existingClip?.z_index ?? (visualTimeline.clips.length + 1),
        };
        const assetId = placementArgs.assetId ?? deriveStableHammerVisualAssetId(nextPlacement);
        const nextClipBase = migrateLegacyPlacementRecordToClip({ record: nextPlacement, asset_id: assetId, updated_at: updatedAt });
        const nextClip: HammerVisualClip = placementArgs.systemMeta
          ? {
            ...nextClipBase,
            system_managed: true,
            system_type: placementArgs.systemMeta.system_type,
            system_source: placementArgs.systemMeta.system_source,
            system_asset_id: placementArgs.systemMeta.system_asset_id,
          }
          : nextClipBase;
        if (existingClip) {
          let nextState = args.applyVisualTimelineAction(before, {
            type: "UPDATE_CLIP_TIMING",
            clip_id: existingClip.clip_id,
            start_sec: nextClip.start_sec,
            end_sec: nextClip.end_sec,
            updated_at: updatedAt,
          });
          nextState = args.applyVisualTimelineAction(nextState, {
            type: "UPDATE_CLIP_GEOMETRY",
            clip_id: existingClip.clip_id,
            geometry: nextClip.geometry,
            updated_at: updatedAt,
          });
          nextState = args.applyVisualTimelineAction(nextState, {
            type: "UPDATE_CLIP_ANIMATION",
            clip_id: existingClip.clip_id,
            animation: nextClip.animation,
            updated_at: updatedAt,
          });
          const nextTimeline = args.resolveCanonicalVisualTimeline(nextState);
          const nextAssets = nextTimeline.assets.some((asset) => asset.asset_id === assetId)
            ? nextTimeline.assets.map((asset) => (asset.asset_id === assetId
              ? migrateLegacyPlacementRecordToAsset({ record: nextPlacement, asset_id: assetId, updated_at: updatedAt })
              : asset))
            : [...nextTimeline.assets, migrateLegacyPlacementRecordToAsset({ record: nextPlacement, asset_id: assetId, updated_at: updatedAt })];
          const nextClips = nextTimeline.clips.map((clip) => (
            clip.clip_id === existingClip.clip_id
              ? {
                ...clip,
                asset_id: assetId,
                entry_id: nextClip.entry_id,
                system_managed: placementArgs.systemMeta?.system_managed ?? clip.system_managed,
                system_type: placementArgs.systemMeta?.system_type ?? clip.system_type,
                system_source: placementArgs.systemMeta?.system_source ?? clip.system_source,
                system_asset_id: placementArgs.systemMeta?.system_asset_id ?? clip.system_asset_id,
                label: nextClip.label,
                visual_mode: nextClip.visual_mode,
                confidence: nextClip.confidence,
                placement_status: nextClip.placement_status,
                ingest_state: nextClip.ingest_state,
                uncertainty_flags: [...nextClip.uncertainty_flags],
                source_mode: nextClip.source_mode,
                opacity: nextClip.opacity,
                z_index: nextClip.z_index,
                enabled: nextClip.enabled,
                locked: nextClip.locked,
                anchor_hint: { ...nextClip.anchor_hint, matched_segment_ids: [...nextClip.anchor_hint.matched_segment_ids] },
                authority_operation_id: nextClip.authority_operation_id,
                updated_at: updatedAt,
              }
              : clip
          ));
          return {
            ...nextState,
            visualTimeline: {
              ...nextTimeline,
              assets: nextAssets,
              clips: nextClips,
            },
            visualPlacements: deriveLegacyVisualPlacementsFromTimeline({
              ...nextTimeline,
              assets: nextAssets,
              clips: nextClips,
            }),
          };
        }
        return args.applyVisualTimelineActions(before, [
          {
            type: "UPSERT_ASSETS",
            assets: [migrateLegacyPlacementRecordToAsset({ record: nextPlacement, asset_id: assetId, updated_at: updatedAt })],
            updated_at: updatedAt,
          },
          {
            type: "CREATE_CLIP",
            clip: nextClip,
            updated_at: updatedAt,
          },
        ]);
      },
    });
  }, [args, packagingLogoPosition, packagingLogoSize]);

  const removePackagingPlacement = useCallback((entryId: string, label: string): void => {
    args.applyHistoryMutation({
      label,
      kind: "visual_adjustment",
      toolId: "finishing",
      immediatePersist: true,
      computeAfter: (before) => {
        const clip = args.resolveCanonicalVisualTimeline(before).clips.find((candidate) => candidate.entry_id === entryId) ?? null;
        if (!clip) return before;
        return args.applyVisualTimelineAction(before, {
          type: "DELETE_CLIP",
          clip_id: clip.clip_id,
          updated_at: new Date().toISOString(),
        });
      },
    });
  }, [args]);

  const upsertResolvedIntroPlacement = useCallback((assetId: string, assetPath: string, source: "profile" | "episode" | "manual"): void => {
    const introDurationSec = Math.min(6, Math.max(2, roundToTenth(Math.max(2, args.transcriptDurationSec * 0.1))));
    upsertPackagingPlacement({
      entryId: PACKAGING_INTRO_ENTRY_ID,
      assetPath,
      assetId,
      label: "Packaging Intro",
      startSec: 0,
      endSec: introDurationSec,
      visualMode: "packaging_intro",
      uncertaintyFlags: ["packaging:intro"],
      systemMeta: { system_managed: true, system_type: "intro", system_source: source, system_asset_id: assetId },
    });
  }, [args.transcriptDurationSec, upsertPackagingPlacement]);

  const upsertResolvedOutroPlacement = useCallback((assetId: string, assetPath: string, source: "profile" | "episode" | "manual"): void => {
    const outroDurationSec = Math.min(6, Math.max(2, roundToTenth(Math.max(2, args.transcriptDurationSec * 0.1))));
    const startSec = Math.max(0, roundToTenth(args.transcriptDurationSec - outroDurationSec));
    upsertPackagingPlacement({
      entryId: PACKAGING_OUTRO_ENTRY_ID,
      assetPath,
      assetId,
      label: "Packaging Outro",
      startSec,
      endSec: args.transcriptDurationSec,
      visualMode: "packaging_outro",
      uncertaintyFlags: ["packaging:outro"],
      systemMeta: { system_managed: true, system_type: "outro", system_source: source, system_asset_id: assetId },
    });
  }, [args.transcriptDurationSec, upsertPackagingPlacement]);

  const buildWorkspaceDefaultIntroOutroDestPath = useCallback((kind: "intro" | "outro", sourcePath: string): string => {
    const normalized = normalizeWorkpieceRelativePath(args.workpieceId, sourcePath);
    const extMatch = normalized.match(/(\.[a-z0-9]+)$/i);
    const ext = extMatch?.[1]?.toLowerCase() ?? "";
    const filename = kind === "intro" ? `workspace-default-intro${ext}` : `workspace-default-outro${ext}`;
    return `assets/uploads/introoutro/${filename}`;
  }, [args.workpieceId]);

  const applyWorkspaceIntroOutroDefaultsToWorkpiece = useCallback(async (
    defaults: HammerWorkspaceIntroOutroDefaults,
    options?: { existingSelection?: HammerIntroOutroSelection | null; mediaFiles?: HammerStoredMediaFile[] },
  ): Promise<{
    selection: HammerIntroOutroSelection;
    appliedIntro: boolean;
    appliedOutro: boolean;
  } | null> => {
    const candidateItemsById = buildIntroOutroCandidateItemsById(buildIntroOutroCandidateItems(options?.mediaFiles ?? args.storedMediaFiles));
    const repairPlan = buildWorkspaceIntroOutroDefaultsRepairPlan({
      selection: options?.existingSelection ?? null,
      candidateItemsById,
      defaults,
    });
    if (!repairPlan.shouldApply) return null;

    const next: HammerIntroOutroSelection = {
      schema_version: 1,
      intro_asset_id: options?.existingSelection?.intro_asset_id ?? null,
      outro_asset_id: options?.existingSelection?.outro_asset_id ?? null,
      updated_at: new Date().toISOString(),
    };

    let appliedIntro = false;
    let appliedOutro = false;
    if (repairPlan.copyIntro && defaults.intro) {
      try {
        const destPath = buildWorkspaceDefaultIntroOutroDestPath("intro", defaults.intro.path);
        await copyWorkpieceMediaFile({
          sourceWorkpieceId: defaults.intro.workpiece_id,
          sourcePath: defaults.intro.path,
          destWorkpieceId: args.workpieceId,
          destPath,
        });
        next.intro_asset_id = deriveStableHammerAssetIdFromPath(destPath);
        appliedIntro = true;
      } catch (error) {
        console.warn("[Hammer][IntroOutroDefaults] Failed to apply intro default:", error);
      }
    }
    if (repairPlan.copyOutro && defaults.outro) {
      try {
        const destPath = buildWorkspaceDefaultIntroOutroDestPath("outro", defaults.outro.path);
        await copyWorkpieceMediaFile({
          sourceWorkpieceId: defaults.outro.workpiece_id,
          sourcePath: defaults.outro.path,
          destWorkpieceId: args.workpieceId,
          destPath,
        });
        next.outro_asset_id = deriveStableHammerAssetIdFromPath(destPath);
        appliedOutro = true;
      } catch (error) {
        console.warn("[Hammer][IntroOutroDefaults] Failed to apply outro default:", error);
      }
    }
    if (!appliedIntro && !appliedOutro) return null;
    await saveIntroOutroSelection({ workpieceId: args.workpieceId, selection: next });
    return { selection: next, appliedIntro, appliedOutro };
  }, [args.storedMediaFiles, args.workpieceId, buildWorkspaceDefaultIntroOutroDestPath]);

  const reconcileIntroOutroSelectionWithPackaging = useCallback((syncArgs: {
    selection: HammerIntroOutroSelection | null | undefined;
    mediaFiles: HammerStoredMediaFile[];
    introSource: "profile" | "episode" | "manual";
    outroSource: "profile" | "episode" | "manual";
  }): void => {
    const candidateItemsById = buildIntroOutroCandidateItemsById(buildIntroOutroCandidateItems(syncArgs.mediaFiles));
    const syncPlan = buildIntroOutroPackagingSyncPlan({
      selection: syncArgs.selection,
      candidateItemsById,
      currentIntroPlacementPath: packagingIntroPlacement?.asset_path ?? null,
      currentOutroPlacementPath: packagingOutroPlacement?.asset_path ?? null,
    });
    if (syncPlan.removeIntro) {
      removePackagingPlacement(PACKAGING_INTRO_ENTRY_ID, "Remove packaging intro");
    } else if (syncPlan.applyIntro) {
      upsertResolvedIntroPlacement(syncPlan.applyIntro.assetId, syncPlan.applyIntro.path, syncArgs.introSource);
    }
    if (syncPlan.removeOutro) {
      removePackagingPlacement(PACKAGING_OUTRO_ENTRY_ID, "Remove packaging outro");
    } else if (syncPlan.applyOutro) {
      upsertResolvedOutroPlacement(syncPlan.applyOutro.assetId, syncPlan.applyOutro.path, syncArgs.outroSource);
    }
  }, [packagingIntroPlacement?.asset_path, packagingOutroPlacement?.asset_path, removePackagingPlacement, upsertResolvedIntroPlacement, upsertResolvedOutroPlacement]);

  const persistIntroOutroSelection = useCallback(async (next: HammerIntroOutroSelection): Promise<void> => {
    setSavingIntroOutro(true);
    args.setSourceDeskError(null);
    try {
      await saveIntroOutroSelection({ workpieceId: args.workpieceId, selection: next });
      setIntroOutroSelection(next);
      reconcileIntroOutroSelectionWithPackaging({
        selection: next,
        mediaFiles: args.storedMediaFiles,
        introSource: "episode",
        outroSource: "episode",
      });
      if (applyIntroOutroSelectionToFutureEpisodes) {
        const introSourcePath = next.intro_asset_id ? introOutroCandidateItemsById.get(next.intro_asset_id)?.path ?? null : null;
        const outroSourcePath = next.outro_asset_id ? introOutroCandidateItemsById.get(next.outro_asset_id)?.path ?? null : null;
        const defaults: HammerWorkspaceIntroOutroDefaults = {
          schema_version: 1,
          intro: introSourcePath ? { workpiece_id: args.workpieceId, path: introSourcePath } : null,
          outro: outroSourcePath ? { workpiece_id: args.workpieceId, path: outroSourcePath } : null,
          updated_at: new Date().toISOString(),
        };
        setSavingWorkspaceIntroOutroDefaults(true);
        try {
          await saveWorkspaceIntroOutroDefaults({ workspaceId: args.workspaceId, defaults });
          setWorkspaceIntroOutroDefaults(defaults);
        } finally {
          setSavingWorkspaceIntroOutroDefaults(false);
        }
      }
    } catch (error) {
      args.setSourceDeskError(error instanceof Error ? error.message : "Hammer could not save intro/outro selection.");
    } finally {
      setSavingIntroOutro(false);
    }
  }, [applyIntroOutroSelectionToFutureEpisodes, args, reconcileIntroOutroSelectionWithPackaging]);

  const persistWorkspaceIntroOutroDefaultsNow = useCallback(async (): Promise<void> => {
    args.setSourceDeskError(null);
    const introSourcePath = introOutroSelection.intro_asset_id ? introOutroCandidateItemsById.get(introOutroSelection.intro_asset_id)?.path ?? null : null;
    const outroSourcePath = introOutroSelection.outro_asset_id ? introOutroCandidateItemsById.get(introOutroSelection.outro_asset_id)?.path ?? null : null;
    const defaults: HammerWorkspaceIntroOutroDefaults = {
      schema_version: 1,
      intro: introSourcePath ? { workpiece_id: args.workpieceId, path: introSourcePath } : null,
      outro: outroSourcePath ? { workpiece_id: args.workpieceId, path: outroSourcePath } : null,
      updated_at: new Date().toISOString(),
    };
    setSavingWorkspaceIntroOutroDefaults(true);
    try {
      await saveWorkspaceIntroOutroDefaults({ workspaceId: args.workspaceId, defaults });
      setWorkspaceIntroOutroDefaults(defaults);
    } catch (error) {
      args.setSourceDeskError(error instanceof Error ? error.message : "Hammer could not save workspace intro/outro defaults.");
    } finally {
      setSavingWorkspaceIntroOutroDefaults(false);
    }
  }, [args, introOutroSelection]);

  const applyIntroToTimeline = useCallback((assetId: string, source: "profile" | "episode" | "manual"): void => {
    const resolved = introOutroCandidateItemsById.get(assetId) ?? null;
    if (!resolved?.path) {
      args.setTranscriptTimingHint("Intro asset is unavailable. Re-upload or re-select it in Intro/Outro Source Desk.");
      return;
    }
    upsertResolvedIntroPlacement(assetId, resolved.path, source);
  }, [args.setTranscriptTimingHint, upsertResolvedIntroPlacement]);

  const applyOutroToTimeline = useCallback((assetId: string, source: "profile" | "episode" | "manual"): void => {
    const resolved = introOutroCandidateItemsById.get(assetId) ?? null;
    if (!resolved?.path) {
      args.setTranscriptTimingHint("Outro asset is unavailable. Re-upload or re-select it in Intro/Outro Source Desk.");
      return;
    }
    upsertResolvedOutroPlacement(assetId, resolved.path, source);
  }, [args.setTranscriptTimingHint, upsertResolvedOutroPlacement]);

  const applyIntroPlacement = useCallback((): void => {
    const assetId = introOutroSelection.intro_asset_id;
    if (!assetId) {
      args.setTranscriptTimingHint("Select an intro asset first in Intro/Outro Source Desk.");
      return;
    }
    applyIntroToTimeline(assetId, "manual");
  }, [applyIntroToTimeline, args.setTranscriptTimingHint, introOutroSelection.intro_asset_id]);

  const applyOutroPlacement = useCallback((): void => {
    const assetId = introOutroSelection.outro_asset_id;
    if (!assetId) {
      args.setTranscriptTimingHint("Select an outro asset first in Intro/Outro Source Desk.");
      return;
    }
    applyOutroToTimeline(assetId, "manual");
  }, [applyOutroToTimeline, args.setTranscriptTimingHint, introOutroSelection.outro_asset_id]);

  const toggleLogoOverlay = useCallback((): void => {
    if (packagingLogoPlacement) {
      removePackagingPlacement(PACKAGING_LOGO_ENTRY_ID, "Remove logo overlay");
      return;
    }
    if (!packagingLogoAssetPath) {
      args.setTranscriptTimingHint("Select a logo asset before enabling overlay.");
      return;
    }
    upsertPackagingPlacement({
      entryId: PACKAGING_LOGO_ENTRY_ID,
      assetPath: packagingLogoAssetPath,
      label: `Logo Overlay (${packagingLogoPosition.replace("_", " ")}, ${packagingLogoSize})`,
      startSec: 0,
      endSec: args.transcriptDurationSec,
      visualMode: "overlay_graphic",
      overlayGeometry: positionFromLogoOption(packagingLogoPosition, packagingLogoSize),
      uncertaintyFlags: ["packaging:logo", `logo_position:${packagingLogoPosition}`, `logo_size:${packagingLogoSize}`],
    });
  }, [args.setTranscriptTimingHint, args.transcriptDurationSec, packagingLogoAssetPath, packagingLogoPlacement, packagingLogoPosition, packagingLogoSize, removePackagingPlacement, upsertPackagingPlacement]);

  const applyLogoOverlayStyle = useCallback((next: {
    position?: HammerLogoOverlayPosition;
    size?: HammerLogoOverlaySize;
    assetPath?: string | null;
  }): void => {
    if (next.position) setPackagingLogoPosition(next.position);
    if (next.size) setPackagingLogoSize(next.size);
    if (typeof next.assetPath !== "undefined") setPackagingLogoAssetPath(next.assetPath);
    if (!packagingLogoPlacement) return;
    const position = next.position ?? packagingLogoPosition;
    const size = next.size ?? packagingLogoSize;
    const assetPath = next.assetPath ?? packagingLogoAssetPath ?? packagingLogoPlacement.asset_path ?? "";
    if (!assetPath) return;
    upsertPackagingPlacement({
      entryId: PACKAGING_LOGO_ENTRY_ID,
      assetPath,
      label: `Logo Overlay (${position.replace("_", " ")}, ${size})`,
      startSec: 0,
      endSec: args.transcriptDurationSec,
      visualMode: "overlay_graphic",
      overlayGeometry: positionFromLogoOption(position, size),
      uncertaintyFlags: ["packaging:logo", `logo_position:${position}`, `logo_size:${size}`],
    });
  }, [args.transcriptDurationSec, packagingLogoAssetPath, packagingLogoPlacement, packagingLogoPosition, packagingLogoSize, upsertPackagingPlacement]);

  const flushPendingPlacementDrafts = useCallback((): void => {
    const timelineDrafts = imagePlacementDraftWindowsRef.current;
    const transformDrafts = imagePlacementTransformsRef.current;
    for (const [placementId, draft] of Object.entries(timelineDrafts)) {
      commitVisualPlacementWindow(placementId, {
        startSec: draft.startSec,
        endSec: draft.endSec,
        label: "Commit visual placement timing",
      });
    }
    for (const [placementId, draft] of Object.entries(transformDrafts)) {
      commitImagePlacementTransform(placementId, draft, "Commit visual overlay geometry");
    }
    if (Object.keys(timelineDrafts).length > 0) {
      imagePlacementDraftWindowsRef.current = {};
      setImagePlacementDraftWindows({});
    }
    if (Object.keys(transformDrafts).length > 0) {
      imagePlacementTransformsRef.current = {};
      setImagePlacementTransforms({});
    }
    if (timelineImageDragState) setTimelineImageDragState(null);
    if (previewCanvasDragState) setPreviewCanvasDragState(null);
  }, [commitImagePlacementTransform, commitVisualPlacementWindow, previewCanvasDragState, timelineImageDragState]);

  useEffect(() => {
    if (args.visualPlacementEditingEnabled) return;
    setTimelineImageDragState(null);
    setPreviewCanvasDragState(null);
    setImagePlacementDraftWindows({});
  }, [args.visualPlacementEditingEnabled]);

  useEffect(() => {
    if (packagingLogoAssetPath) return;
    const preferred = packagingLogoPlacement?.asset_path ?? derivedSourceImageLibraryItems[0]?.path ?? null;
    if (preferred) setPackagingLogoAssetPath(preferred);
  }, [derivedSourceImageLibraryItems, packagingLogoAssetPath, packagingLogoPlacement?.asset_path]);

  useEffect(() => {
    if (!packagingLogoPlacement) return;
    const positionFlag = packagingLogoPlacement.uncertainty_flags.find((flag) => flag.startsWith("logo_position:")) ?? null;
    const sizeFlag = packagingLogoPlacement.uncertainty_flags.find((flag) => flag.startsWith("logo_size:")) ?? null;
    const nextPosition = positionFlag?.slice("logo_position:".length) as HammerLogoOverlayPosition | undefined;
    const nextSize = sizeFlag?.slice("logo_size:".length) as HammerLogoOverlaySize | undefined;
    if (nextPosition && LOGO_POSITION_OPTIONS.some((option) => option.id === nextPosition)) setPackagingLogoPosition(nextPosition);
    if (nextSize && LOGO_SIZE_OPTIONS.some((option) => option.id === nextSize)) setPackagingLogoSize(nextSize);
    if (packagingLogoPlacement.asset_path) setPackagingLogoAssetPath(packagingLogoPlacement.asset_path);
  }, [packagingLogoPlacement]);

  useEffect(() => {
    if (!imageAnimationContextMenu) return;
    const closeMenu = (): void => setImageAnimationContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setImageAnimationContextMenu(null);
    };
    window.addEventListener("mousedown", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("mousedown", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [imageAnimationContextMenu]);

  useEffect(() => {
    if (args.visualPlacementEditingEnabled) return;
    setImageAnimationContextMenu(null);
  }, [args.visualPlacementEditingEnabled]);

  useEffect(() => {
    if (args.currentPass !== "image_animation") return;
    setSelectedVisualFlowStep("broll");
  }, [args.currentPass]);

  useEffect(() => {
    if (!timelineImageDragState) return;
    const handleMouseMove = (event: globalThis.MouseEvent): void => {
      if (event.buttons === 0) {
        const draft = imagePlacementDraftWindowsRef.current[timelineImageDragState.placementId] ?? null;
        if (draft) {
          commitVisualPlacementWindow(timelineImageDragState.placementId, {
            startSec: draft.startSec,
            endSec: draft.endSec,
            label: timelineImageDragState.mode === "move" ? "Move image clip" : "Resize image clip",
          });
          setImagePlacementDraftWindows((current) => {
            if (!current[timelineImageDragState.placementId]) return current;
            const next = { ...current };
            delete next[timelineImageDragState.placementId];
            return next;
          });
        }
        setTimelineImageDragState(null);
        return;
      }
      const dragStepSec = event.shiftKey ? IMAGE_PLACEMENT_COARSE_STEP_SEC : IMAGE_PLACEMENT_FINE_STEP_SEC;
      const deltaSec = snapImagePlacementTime((event.clientX - timelineImageDragState.pointerStartX) * timelineImageDragState.pxToSec, dragStepSec);
      const originalDuration = Math.max(MIN_IMAGE_PLACEMENT_DURATION_SEC, roundImagePlacementTime(timelineImageDragState.originEndSec - timelineImageDragState.originStartSec));
      let startSec = timelineImageDragState.originStartSec;
      let endSec = timelineImageDragState.originEndSec;
      if (timelineImageDragState.mode === "move") {
        const tentativeStart = snapImagePlacementTime(timelineImageDragState.originStartSec + deltaSec, dragStepSec);
        const maxStart = Math.max(0, snapImagePlacementTime(args.transcriptDurationSec - originalDuration, dragStepSec));
        startSec = Math.max(0, Math.min(maxStart, tentativeStart));
        endSec = Math.min(args.transcriptDurationSec, snapImagePlacementTime(startSec + originalDuration, dragStepSec));
      } else if (timelineImageDragState.mode === "resize_start") {
        const maxStart = snapImagePlacementTime(timelineImageDragState.originEndSec - MIN_IMAGE_PLACEMENT_DURATION_SEC, dragStepSec);
        startSec = Math.max(0, Math.min(maxStart, snapImagePlacementTime(timelineImageDragState.originStartSec + deltaSec, dragStepSec)));
        endSec = timelineImageDragState.originEndSec;
      } else {
        const minEnd = snapImagePlacementTime(timelineImageDragState.originStartSec + MIN_IMAGE_PLACEMENT_DURATION_SEC, dragStepSec);
        endSec = Math.max(minEnd, Math.min(args.timelineDurationSec, snapImagePlacementTime(timelineImageDragState.originEndSec + deltaSec, dragStepSec)));
        startSec = timelineImageDragState.originStartSec;
      }
      setImagePlacementDraftWindows((current) => ({
        ...current,
        [timelineImageDragState.placementId]: { startSec, endSec },
      }));
      args.seekPlayheadToTime(startSec, "playhead", { snapToBoundary: false });
    };
    const handleMouseUp = (): void => {
      const draft = imagePlacementDraftWindowsRef.current[timelineImageDragState.placementId] ?? null;
      if (draft) {
        commitVisualPlacementWindow(timelineImageDragState.placementId, {
          startSec: draft.startSec,
          endSec: draft.endSec,
          label: timelineImageDragState.mode === "move" ? "Move image clip" : "Resize image clip",
        });
      }
      setImagePlacementDraftWindows((current) => {
        if (!current[timelineImageDragState.placementId]) return current;
        const next = { ...current };
        delete next[timelineImageDragState.placementId];
        return next;
      });
      setTimelineImageDragState(null);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [args.seekPlayheadToTime, args.timelineDurationSec, args.transcriptDurationSec, commitVisualPlacementWindow, timelineImageDragState]);

  useEffect(() => {
    if (!previewCanvasDragState) return;
    const handleMouseMove = (event: globalThis.MouseEvent): void => {
      if (event.buttons === 0) {
        const draft = imagePlacementTransformsRef.current[previewCanvasDragState.placementId] ?? null;
        if (draft) {
          commitImagePlacementTransform(previewCanvasDragState.placementId, draft, "Adjust visual overlay geometry");
          setImagePlacementTransforms((current) => {
            if (!current[previewCanvasDragState.placementId]) return current;
            const next = { ...current };
            delete next[previewCanvasDragState.placementId];
            return next;
          });
        }
        setPreviewCanvasDragState(null);
        return;
      }
      const canvasRect = args.previewSurfaceRef.current?.getBoundingClientRect() ?? null;
      if (!canvasRect || canvasRect.width <= 0 || canvasRect.height <= 0) return;
      const deltaXPct = ((event.clientX - previewCanvasDragState.pointerStartX) / canvasRect.width) * 100;
      const deltaYPct = ((event.clientY - previewCanvasDragState.pointerStartY) / canvasRect.height) * 100;
      if (previewCanvasDragState.mode === "move") {
        updateImagePlacementTransform(previewCanvasDragState.placementId, (current) => ({
          ...current,
          leftPct: previewCanvasDragState.origin.leftPct + deltaXPct,
          topPct: previewCanvasDragState.origin.topPct + deltaYPct,
        }));
        return;
      }
      const safeAspectRatio = Number.isFinite(previewCanvasDragState.originAspectRatio) && previewCanvasDragState.originAspectRatio > 0
        ? previewCanvasDragState.originAspectRatio
        : previewCanvasDragState.origin.widthPct / Math.max(1, previewCanvasDragState.origin.heightPct);
      const dominantDeltaPct = Math.abs(deltaXPct) >= Math.abs(deltaYPct * safeAspectRatio) ? deltaXPct : deltaYPct * safeAspectRatio;
      const maxWidthPct = Math.min(92, 100 - previewCanvasDragState.origin.leftPct);
      const maxHeightPct = Math.min(92, 100 - previewCanvasDragState.origin.topPct);
      const maxWidthFromHeight = maxHeightPct * safeAspectRatio;
      const nextWidthPct = clampNumber(previewCanvasDragState.origin.widthPct + dominantDeltaPct, 8, Math.min(maxWidthPct, maxWidthFromHeight));
      const nextHeightPct = clampNumber(nextWidthPct / safeAspectRatio, 8, maxHeightPct);
      updateImagePlacementTransform(previewCanvasDragState.placementId, (current) => ({
        ...current,
        widthPct: nextWidthPct,
        heightPct: nextHeightPct,
      }));
    };
    const handleMouseUp = (): void => {
      const draft = imagePlacementTransforms[previewCanvasDragState.placementId] ?? null;
      if (draft) {
        commitImagePlacementTransform(previewCanvasDragState.placementId, draft, "Adjust visual overlay geometry");
      }
      setImagePlacementTransforms((current) => {
        if (!current[previewCanvasDragState.placementId]) return current;
        const next = { ...current };
        delete next[previewCanvasDragState.placementId];
        return next;
      });
      setPreviewCanvasDragState(null);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [args.previewSurfaceRef, commitImagePlacementTransform, imagePlacementTransforms, previewCanvasDragState, updateImagePlacementTransform]);

  return {
    selectedVisualFlowStep,
    setSelectedVisualFlowStep,
    imagePlacementDraftWindows,
    setImagePlacementDraftWindows,
    timelineImageDragState,
    setTimelineImageDragState,
    imagePlacementTransforms,
    setImagePlacementTransforms,
    previewCanvasDragState,
    setPreviewCanvasDragState,
    imageAnimationContextMenu,
    setImageAnimationContextMenu,
    introOutroSelection,
    setIntroOutroSelection,
    packagingLogoAssetPath,
    setPackagingLogoAssetPath,
    packagingLogoPosition,
    setPackagingLogoPosition,
    packagingLogoSize,
    setPackagingLogoSize,
    savingIntroOutro,
    workspaceIntroOutroDefaults,
    setWorkspaceIntroOutroDefaults,
    savingWorkspaceIntroOutroDefaults,
    applyIntroOutroSelectionToFutureEpisodes,
    setApplyIntroOutroSelectionToFutureEpisodes,
    applyWorkspaceIntroOutroDefaultsToWorkpiece,
    reconcileIntroOutroSelectionWithPackaging,
    persistIntroOutroSelection,
    persistWorkspaceIntroOutroDefaultsNow,
    commitVisualPlacementWindow,
    updateVisualPlacementTiming,
    updateImagePlacementTransform,
    commitImagePlacementTransform,
    beginTimelineImagePlacementDrag,
    beginPreviewCanvasDrag,
    openImageAnimationContextMenu,
    applyImageAnimationPreset,
    removeVisualPlacement,
    removePackagingPlacement,
    addImagePlacementFromLibrary,
    addVisualAssetPlacementFromLibrary,
    applyIntroPlacement,
    applyOutroPlacement,
    toggleLogoOverlay,
    applyLogoOverlayStyle,
    flushPendingPlacementDrafts,
  };
}