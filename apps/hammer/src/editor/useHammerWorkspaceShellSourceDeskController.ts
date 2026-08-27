import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { buildSourceDeskPreviewFetchKey } from "./sourceDeskPreviewChurn";
import { useHammerWorkspaceShellSourceDeskPreviews } from "./hammerWorkspaceShellSourceDeskPreviews";
import {
  listWorkpieceStoredMedia,
  loadIntroOutroSelection,
  loadWorkspaceIntroOutroDefaults,
  readHammerMediaPreviewErrorDiagnostics,
  loadWorkpieceMediaPreviewUrl,
  normalizeWorkpieceRelativePath,
  uploadWorkpieceMediaFile,
  type HammerIntroOutroSelection,
  type HammerStoredMediaFile,
  type HammerWorkspaceIntroOutroDefaults,
} from "../lib/hammerSourceDeskMediaApi";
import {
  buildIntroOutroCandidateItems,
  buildIntroOutroCandidateItemsById,
  buildWorkspaceIntroOutroDefaultsRepairPlan,
} from "./hammerIntroOutroState";
import { appendUniquePaths } from "./hammerWorkspaceShellMediaUtils";

/**
 * Source Desk authority owns media loading, upload coordination, stored-media synchronization,
 * and preview request lifecycles. It does not own media-map derivation, timeline placement,
 * visual-effect projection, view-model composition, or canonical persistence.
 */

const SOURCE_DESK_PREVIEW_FETCH_CONCURRENCY = 4;
const SOURCE_DESK_PREVIEW_MAX_ITEMS = 48;

function areStringArraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

type SourceDeskPreviewItem = {
  assetPath?: string | null;
};

type SelectedSourceDeskPlacement = {
  id: string;
  assetPath?: string | null;
};

export type UseHammerWorkspaceShellSourceDeskControllerArgs = {
  workspaceId: string;
  workpieceId: string;
  isPlaybackActive: boolean;
  sourceImageLibraryItems: Array<{ path: string }>;
  sourceImageItems: Array<SelectedSourceDeskPlacement>;
  sourceBrollItems: SourceDeskPreviewItem[];
  selectedImagePlacement: SelectedSourceDeskPlacement | null;
  activePreviewOverlayAssetPaths: string[];
  selectedSourceDeskPreviewAssetPath: string | null;
  introOutroSelectedIntroPath: string | null;
  introOutroSelectedOutroPath: string | null;
  packagingIntroAssetPath: string | null;
  packagingOutroAssetPath: string | null;
  storedMediaFiles: HammerStoredMediaFile[];
  setStoredMediaFiles: Dispatch<SetStateAction<HammerStoredMediaFile[]>>;
  sourceDeskLoading: boolean;
  setSourceDeskLoading: Dispatch<SetStateAction<boolean>>;
  sourceDeskError: string | null;
  setSourceDeskError: Dispatch<SetStateAction<string | null>>;
  uploadingCategory: "images" | "broll" | "introoutro" | null;
  setUploadingCategory: Dispatch<SetStateAction<"images" | "broll" | "introoutro" | null>>;
  introOutroSelection: HammerIntroOutroSelection;
  setIntroOutroSelection: Dispatch<SetStateAction<HammerIntroOutroSelection>>;
  workspaceIntroOutroDefaults: HammerWorkspaceIntroOutroDefaults | null;
  setWorkspaceIntroOutroDefaults: Dispatch<SetStateAction<HammerWorkspaceIntroOutroDefaults | null>>;
  sourceDeskPreviewUrls: Record<string, string>;
  setSourceDeskPreviewUrls: Dispatch<SetStateAction<Record<string, string>>>;
  sourceDeskPreviewFailures: Record<string, true>;
  setSourceDeskPreviewFailures: Dispatch<SetStateAction<Record<string, true>>>;
  sourceDeskRequestedPreviewPaths: string[];
  setSourceDeskRequestedPreviewPaths: Dispatch<SetStateAction<string[]>>;
  sourceDeskVisiblePreviewPaths: string[];
  setSourceDeskVisiblePreviewPaths: Dispatch<SetStateAction<string[]>>;
  applyWorkspaceIntroOutroDefaultsToWorkpiece: (
    defaults: HammerWorkspaceIntroOutroDefaults,
    args?: { existingSelection?: HammerIntroOutroSelection | null; mediaFiles?: HammerStoredMediaFile[] },
  ) => Promise<{
    selection: HammerIntroOutroSelection;
    appliedIntro: boolean;
    appliedOutro: boolean;
  } | null>;
  reconcileIntroOutroSelectionWithPackaging: (args: {
    selection: HammerIntroOutroSelection;
    mediaFiles: HammerStoredMediaFile[];
    introSource: "profile" | "episode";
    outroSource: "profile" | "episode";
  }) => void;
  backgroundReplacementAssetPath: string | null;
  backgroundReplacementPreviewUrl: string;
  setBackgroundReplacementPreviewUrl: Dispatch<SetStateAction<string>>;
};

export type UseHammerWorkspaceShellSourceDeskControllerResult = {
  sourceDeskPreviewPaths: string[];
  sourceDeskRequestedPreviewPathSet: Set<string>;
  sourceDeskPreviewPendingPathSet: Set<string>;
  sourceDeskRemainingPreviewPaths: string[];
  requestSourceDeskPreviews: (paths: Array<string | null | undefined>) => void;
  reportSourceDeskPreviewLoadError: (rawPath: string) => void;
  reportVisibleSourceDeskPreviewPaths: (paths: string[]) => void;
  refreshSourceDeskMedia: () => Promise<void>;
  handleSourceDeskUpload: (category: "images" | "broll" | "introoutro", fileList: FileList | null) => Promise<void>;
};

export function useHammerSourceDeskStoredMediaState() {
  return useState<HammerStoredMediaFile[]>([]);
}

export function useHammerSourceDeskRuntimeState() {
  const [sourceDeskLoading, setSourceDeskLoading] = useState(false);
  const [sourceDeskError, setSourceDeskError] = useState<string | null>(null);
  const [uploadingCategory, setUploadingCategory] = useState<"images" | "broll" | "introoutro" | null>(null);
  const [sourceDeskPreviewUrls, setSourceDeskPreviewUrls] = useState<Record<string, string>>({});
  const [sourceDeskPreviewFailures, setSourceDeskPreviewFailures] = useState<Record<string, true>>({});
  const [sourceDeskRequestedPreviewPaths, setSourceDeskRequestedPreviewPaths] = useState<string[]>([]);
  const [sourceDeskVisiblePreviewPaths, setSourceDeskVisiblePreviewPaths] = useState<string[]>([]);
  return { sourceDeskLoading, setSourceDeskLoading, sourceDeskError, setSourceDeskError,
    uploadingCategory, setUploadingCategory, sourceDeskPreviewUrls, setSourceDeskPreviewUrls,
    sourceDeskPreviewFailures, setSourceDeskPreviewFailures, sourceDeskRequestedPreviewPaths,
    setSourceDeskRequestedPreviewPaths, sourceDeskVisiblePreviewPaths, setSourceDeskVisiblePreviewPaths };
}

export function useHammerSourceDeskUploadRefs() {
  const imageUploadInputRef = useRef<HTMLInputElement | null>(null);
  const brollUploadInputRef = useRef<HTMLInputElement | null>(null);
  const introOutroUploadInputRef = useRef<HTMLInputElement | null>(null);
  return { imageUploadInputRef, brollUploadInputRef, introOutroUploadInputRef };
}

export function useHammerWorkspaceShellSourceDeskController(
  args: UseHammerWorkspaceShellSourceDeskControllerArgs,
): UseHammerWorkspaceShellSourceDeskControllerResult {
  const { backgroundReplacementAssetPath, backgroundReplacementPreviewUrl, setBackgroundReplacementPreviewUrl } = args;
  const [previewRequestRevision, setPreviewRequestRevision] = useState(0);
  const attemptedWorkspaceDefaultsApplyRef = useRef<string | null>(null);
  const refreshRunIdRef = useRef(0);
  const latestArgsRef = useRef(args);
  latestArgsRef.current = args;

  const sourceDeskPreviewPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const item of args.sourceImageLibraryItems) {
      paths.add(item.path);
    }
    for (const item of args.sourceImageItems) {
      if (item.assetPath) paths.add(item.assetPath);
    }
    for (const item of args.sourceBrollItems) {
      if (item.assetPath) paths.add(item.assetPath);
    }
    if (args.introOutroSelectedIntroPath) {
      paths.add(args.introOutroSelectedIntroPath);
    }
    if (args.introOutroSelectedOutroPath) {
      paths.add(args.introOutroSelectedOutroPath);
    }
    if (args.packagingIntroAssetPath) {
      paths.add(args.packagingIntroAssetPath);
    }
    if (args.packagingOutroAssetPath) {
      paths.add(args.packagingOutroAssetPath);
    }
    return [...paths];
  }, [
    args.introOutroSelectedIntroPath,
    args.introOutroSelectedOutroPath,
    args.packagingIntroAssetPath,
    args.packagingOutroAssetPath,
    args.sourceBrollItems,
    args.sourceImageItems,
    args.sourceImageLibraryItems,
  ]);

  const prioritizedSourceDeskPreviewPaths = useMemo(() => {
    const ordered: string[] = [];
    appendUniquePaths(ordered, [args.packagingIntroAssetPath, args.packagingOutroAssetPath]);
    appendUniquePaths(ordered, [args.introOutroSelectedIntroPath, args.introOutroSelectedOutroPath]);
    appendUniquePaths(ordered, args.activePreviewOverlayAssetPaths);
    appendUniquePaths(ordered, [args.selectedSourceDeskPreviewAssetPath]);
    appendUniquePaths(ordered, args.sourceImageItems.map((item) => item.assetPath));
    appendUniquePaths(ordered, args.sourceDeskVisiblePreviewPaths);
    appendUniquePaths(ordered, args.sourceImageLibraryItems.map((file) => file.path));
    appendUniquePaths(ordered, args.sourceBrollItems.map((item) => item.assetPath));
    appendUniquePaths(ordered, sourceDeskPreviewPaths);
    return ordered;
  }, [
    args.activePreviewOverlayAssetPaths,
    args.introOutroSelectedIntroPath,
    args.introOutroSelectedOutroPath,
    args.packagingIntroAssetPath,
    args.packagingOutroAssetPath,
    args.selectedSourceDeskPreviewAssetPath,
    args.sourceBrollItems,
    args.sourceDeskVisiblePreviewPaths,
    args.sourceImageItems,
    args.sourceImageLibraryItems,
    sourceDeskPreviewPaths,
  ]);

  const sourceDeskPreviewFetchPaths = useMemo(
    () => prioritizedSourceDeskPreviewPaths.slice(0, SOURCE_DESK_PREVIEW_MAX_ITEMS),
    [prioritizedSourceDeskPreviewPaths],
  );
  const sourceDeskAutomaticPreviewPathSet = useMemo(
    () => new Set(sourceDeskPreviewFetchPaths),
    [sourceDeskPreviewFetchPaths],
  );
  const sourceDeskRemainingPreviewPaths = useMemo(() => (
    sourceDeskPreviewPaths.filter((path) => (
      !sourceDeskAutomaticPreviewPathSet.has(path)
      && !args.sourceDeskRequestedPreviewPaths.includes(path)
    ))
  ), [args.sourceDeskRequestedPreviewPaths, sourceDeskAutomaticPreviewPathSet, sourceDeskPreviewPaths]);
  const sourceDeskAllRequestedPreviewPaths = useMemo(() => {
    const ordered = [...sourceDeskPreviewFetchPaths];
    appendUniquePaths(ordered, args.sourceDeskRequestedPreviewPaths);
    return ordered;
  }, [args.sourceDeskRequestedPreviewPaths, sourceDeskPreviewFetchPaths]);
  const sourceDeskRequestedPreviewPathSet = useMemo(
    () => new Set(sourceDeskAllRequestedPreviewPaths),
    [sourceDeskAllRequestedPreviewPaths],
  );
  const sourceDeskPreviewPendingPathSet = useMemo(() => {
    const pending = new Set<string>();
    for (const path of sourceDeskAllRequestedPreviewPaths) {
      if (args.sourceDeskPreviewUrls[path] || args.sourceDeskPreviewFailures[path]) continue;
      pending.add(path);
    }
    return pending;
  }, [sourceDeskAllRequestedPreviewPaths, args.sourceDeskPreviewFailures, args.sourceDeskPreviewUrls]);
  const sourceDeskPreviewFetchKey = useMemo(
    () => `${buildSourceDeskPreviewFetchKey(sourceDeskAllRequestedPreviewPaths)}:${previewRequestRevision}`,
    [previewRequestRevision, sourceDeskAllRequestedPreviewPaths],
  );

  const requestSourceDeskPreviews = useCallback((paths: Array<string | null | undefined>): void => {
    const requested = paths.map((path) => path?.trim() ?? "").filter(Boolean);
    args.setSourceDeskPreviewFailures((current) => {
      const next = { ...current };
      let changed = false;
      for (const path of requested) {
        if (next[path]) {
          delete next[path];
          changed = true;
        }
      }
      return changed ? next : current;
    });
    args.setSourceDeskRequestedPreviewPaths((current) => {
      const next = [...current];
      appendUniquePaths(next, paths);
      return areStringArraysEqual(current, next) ? current : next;
    });
    setPreviewRequestRevision((current) => current + 1);
  }, [args.setSourceDeskPreviewFailures, args.setSourceDeskRequestedPreviewPaths]);

  const reportSourceDeskPreviewLoadError = useCallback((rawPath: string): void => {
    const path = rawPath.trim();
    if (!path) return;
    args.setSourceDeskPreviewUrls((current) => {
      const existing = current[path];
      if (!existing) return current;
      const next = { ...current };
      delete next[path];
      URL.revokeObjectURL(existing);
      return next;
    });
    args.setSourceDeskPreviewFailures((current) => (
      current[path]
        ? current
        : { ...current, [path]: true }
    ));
  }, [args.setSourceDeskPreviewFailures, args.setSourceDeskPreviewUrls]);

  const reportVisibleSourceDeskPreviewPaths = useCallback((paths: string[]): void => {
    args.setSourceDeskVisiblePreviewPaths((current) => (areStringArraysEqual(current, paths) ? current : paths));
  }, [args.setSourceDeskVisiblePreviewPaths]);

  useEffect(() => {
    args.setSourceDeskRequestedPreviewPaths([]);
    args.setSourceDeskVisiblePreviewPaths([]);
    args.setSourceDeskPreviewFailures({});
    args.setSourceDeskPreviewUrls((current) => {
      for (const url of Object.values(current)) {
        URL.revokeObjectURL(url);
      }
      return {};
    });
  }, [args.workpieceId]);

  useEffect(() => {
    const assetPath = args.selectedImagePlacement?.assetPath ?? null;
    if (!assetPath || args.sourceDeskPreviewUrls[assetPath] || args.sourceDeskPreviewFailures[assetPath]) {
      return;
    }
    const selectedIndex = args.sourceImageItems.findIndex((item) => item.id === args.selectedImagePlacement?.id);
    const neighboringPaths = selectedIndex >= 0
      ? [
        args.sourceImageItems[selectedIndex - 1]?.assetPath,
        assetPath,
        args.sourceImageItems[selectedIndex + 1]?.assetPath,
      ]
      : [assetPath];
    requestSourceDeskPreviews(neighboringPaths);
  }, [
    args.selectedImagePlacement?.assetPath,
    args.selectedImagePlacement?.id,
    args.sourceDeskPreviewFailures,
    args.sourceDeskPreviewUrls,
    args.sourceImageItems,
    requestSourceDeskPreviews,
  ]);

  useEffect(() => {
    const path = backgroundReplacementAssetPath;
    if (!path || args.sourceDeskPreviewUrls[path]) return;
    requestSourceDeskPreviews([path]);
  }, [backgroundReplacementAssetPath, args.sourceDeskPreviewUrls, requestSourceDeskPreviews]);
  useEffect(() => {
    const path = backgroundReplacementAssetPath;
    if (!path) return;
    const previewUrl = args.sourceDeskPreviewUrls[path] ?? "";
    if (!previewUrl || previewUrl === backgroundReplacementPreviewUrl) return;
    setBackgroundReplacementPreviewUrl(previewUrl);
  }, [args.sourceDeskPreviewUrls, backgroundReplacementAssetPath, backgroundReplacementPreviewUrl, setBackgroundReplacementPreviewUrl]);

  const refreshSourceDeskMedia = useCallback(async (): Promise<void> => {
    const refreshRunId = refreshRunIdRef.current + 1;
    refreshRunIdRef.current = refreshRunId;
    const latestArgs = latestArgsRef.current;
    const { workpieceId, workspaceId } = latestArgs;
    latestArgs.setSourceDeskLoading(true);
    latestArgs.setSourceDeskError(null);
    try {
      const [mediaFilesResult, selectionResult, defaultsResult] = await Promise.allSettled([
        listWorkpieceStoredMedia(workpieceId),
        loadIntroOutroSelection(workpieceId),
        loadWorkspaceIntroOutroDefaults(workspaceId),
      ]);
      if (mediaFilesResult.status === "rejected") {
        const reason = mediaFilesResult.reason instanceof Error ? mediaFilesResult.reason.message : String(mediaFilesResult.reason ?? "unknown");
        throw new Error(`[SourceDesk:listWorkpieceStoredMedia] workspaceId=${workspaceId} workpieceId=${workpieceId} reason=${reason}`);
      }
      if (selectionResult.status === "rejected") {
        const reason = selectionResult.reason instanceof Error ? selectionResult.reason.message : String(selectionResult.reason ?? "unknown");
        throw new Error(`[SourceDesk:loadIntroOutroSelection] workspaceId=${workspaceId} workpieceId=${workpieceId} reason=${reason}`);
      }
      if (defaultsResult.status === "rejected") {
        const reason = defaultsResult.reason instanceof Error ? defaultsResult.reason.message : String(defaultsResult.reason ?? "unknown");
        throw new Error(`[SourceDesk:loadWorkspaceIntroOutroDefaults] workspaceId=${workspaceId} workpieceId=${workpieceId} reason=${reason}`);
      }
      const mediaFiles = mediaFilesResult.value;
      const selection = selectionResult.value;
      const defaults = defaultsResult.value;
      if (refreshRunId !== refreshRunIdRef.current) return;
      latestArgs.setWorkspaceIntroOutroDefaults(defaults);

      let nextMediaFiles = mediaFiles;
      let nextSelection = selection;

      const repairPlan = buildWorkspaceIntroOutroDefaultsRepairPlan({
        selection: nextSelection,
        candidateItemsById: buildIntroOutroCandidateItemsById(buildIntroOutroCandidateItems(nextMediaFiles)),
        defaults,
      });

      if (repairPlan.shouldApply && attemptedWorkspaceDefaultsApplyRef.current !== workpieceId) {
        attemptedWorkspaceDefaultsApplyRef.current = workpieceId;
        try {
          const applied = defaults
            ? await latestArgs.applyWorkspaceIntroOutroDefaultsToWorkpiece(defaults, {
              existingSelection: nextSelection,
              mediaFiles: nextMediaFiles,
            })
            : null;
          if (applied) {
            nextSelection = applied.selection;
            latestArgs.reconcileIntroOutroSelectionWithPackaging({
              selection: applied.selection,
              mediaFiles: await listWorkpieceStoredMedia(workpieceId),
              introSource: applied.appliedIntro ? "profile" : "episode",
              outroSource: applied.appliedOutro ? "profile" : "episode",
            });
            nextMediaFiles = await listWorkpieceStoredMedia(workpieceId);
          }
        } catch (error) {
          console.warn("[Hammer][IntroOutroDefaults] Failed to auto-apply workspace defaults:", error);
        }
      }

      latestArgs.setStoredMediaFiles(nextMediaFiles);
      const resolvedSelection = nextSelection ?? {
        schema_version: 1,
        intro_asset_id: null,
        outro_asset_id: null,
        updated_at: new Date().toISOString(),
      };
      latestArgs.setIntroOutroSelection(resolvedSelection);
    } catch (error) {
      if (refreshRunId === refreshRunIdRef.current) {
        latestArgs.setSourceDeskError(error instanceof Error ? error.message : "Hammer could not load Source Desk media.");
      }
    } finally {
      if (refreshRunId === refreshRunIdRef.current) {
        latestArgs.setSourceDeskLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refreshSourceDeskMedia();
  }, [args.workpieceId, args.workspaceId, refreshSourceDeskMedia]);

  useHammerWorkspaceShellSourceDeskPreviews({
    workpieceId: args.workpieceId,
    previewPaths: sourceDeskAllRequestedPreviewPaths,
    requestedPreviewPathCount: sourceDeskPreviewPaths.length,
    fetchKey: sourceDeskPreviewFetchKey,
    maxItems: SOURCE_DESK_PREVIEW_MAX_ITEMS,
    concurrency: SOURCE_DESK_PREVIEW_FETCH_CONCURRENCY,
    paused: args.isPlaybackActive && args.sourceDeskRequestedPreviewPaths.length === 0,
    loadWorkpieceMediaPreviewUrl,
    readHammerMediaPreviewErrorDiagnostics,
    normalizeWorkpieceRelativePath,
    setPreviewUrls: args.setSourceDeskPreviewUrls,
    setPreviewFailures: args.setSourceDeskPreviewFailures,
    previewFailures: args.sourceDeskPreviewFailures,
    previewUrls: args.sourceDeskPreviewUrls,
  });

  const handleSourceDeskUpload = useCallback(async (
    category: "images" | "broll" | "introoutro",
    fileList: FileList | null,
  ): Promise<void> => {
    const latestArgs = latestArgsRef.current;
    const file = fileList?.[0] ?? null;
    if (!file) return;
    latestArgs.setUploadingCategory(category);
    latestArgs.setSourceDeskError(null);
    try {
      await uploadWorkpieceMediaFile({
        workpieceId: latestArgs.workpieceId,
        file,
        category,
      });
      await refreshSourceDeskMedia();
    } catch (error) {
      latestArgs.setSourceDeskError(error instanceof Error ? error.message : "Hammer could not upload the selected file.");
    } finally {
      latestArgs.setUploadingCategory(null);
    }
  }, [refreshSourceDeskMedia]);

  return {
    sourceDeskPreviewPaths,
    sourceDeskRequestedPreviewPathSet,
    sourceDeskPreviewPendingPathSet,
    sourceDeskRemainingPreviewPaths,
    requestSourceDeskPreviews,
    reportSourceDeskPreviewLoadError,
    reportVisibleSourceDeskPreviewPaths,
    refreshSourceDeskMedia,
    handleSourceDeskUpload,
  };
}
