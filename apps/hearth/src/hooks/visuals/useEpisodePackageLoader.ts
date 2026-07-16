import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
  readEpisodePackageForWorkpiece,
} from "../../lib/hearth-thumbnail-api";
import {
  getWorkpieceImageMap,
} from "../../lib/hearth-image-map-repo";
import {
  readWorkpieceEpisodeMediaMap,
} from "../../lib/hearth-media-map-repo";
import type { EpisodePackageV2 } from "../../lib/episode-package-v2";
import type { HearthOperationAuthority } from "../../lib/hearth-operation-authority";
import { resolveCanonicalVisualArtifacts } from "../../lib/hearth-visual-artifact-authority";

type UseEpisodePackageLoaderArgs = {
  operationAuthority: HearthOperationAuthority;
  workpieceId: string | null;
  resetReleasePrepState: () => void;
  setEpisodePackage: Dispatch<SetStateAction<EpisodePackageV2 | null>>;
  setEpisodePackageState: Dispatch<SetStateAction<"idle" | "loading" | "loaded" | "error">>;
  setEpisodePackageError: Dispatch<SetStateAction<string | null>>;
  setImageMapMetadataUpdatedAt: Dispatch<SetStateAction<string | null>>;
  setSelectedThumbnailTitleId: Dispatch<SetStateAction<string | null>>;
  setSelectedThumbnailConceptId: Dispatch<SetStateAction<string>>;
  setSelectedThumbnailVersionId: Dispatch<SetStateAction<string | null>>;
  setSelectedLaunchVariantId: Dispatch<SetStateAction<string | null>>;
  setSelectedMediaMapEntryId: Dispatch<SetStateAction<string | null>>;
  setSelectedImageMapEntryId: Dispatch<SetStateAction<string | null>>;
  setSelectedBrollBeatId: Dispatch<SetStateAction<string | null>>;
  setSelectedReferenceClipEntryId: Dispatch<SetStateAction<string | null>>;
  setThumbnailGenerateError: Dispatch<SetStateAction<string | null>>;
  setThumbnailUploadError: Dispatch<SetStateAction<string | null>>;
  setThumbnailPairingError: Dispatch<SetStateAction<string | null>>;
  setThumbnailPreviewState: Dispatch<SetStateAction<"idle" | "loading" | "ready" | "error">>;
  setThumbnailPreviewDataUrl: Dispatch<SetStateAction<string | null>>;
  setThumbnailPreviewError: Dispatch<SetStateAction<string | null>>;
  setImageMapSaveState: Dispatch<SetStateAction<"saved" | "editing" | "saving" | "error" | "offline">>;
  setImageMapSaveError: Dispatch<SetStateAction<string | null>>;
  setImageMapExportMessage: Dispatch<SetStateAction<string | null>>;
  setMediaMapSaveState: Dispatch<SetStateAction<"saved" | "editing" | "saving" | "error">>;
  setMediaMapSaveError: Dispatch<SetStateAction<string | null>>;
  setMediaMapMessage: Dispatch<SetStateAction<string | null>>;
  setBrollSaveState: Dispatch<SetStateAction<"saved" | "editing" | "saving" | "error" | "offline">>;
  setBrollSaveError: Dispatch<SetStateAction<string | null>>;
  setBrollMessage: Dispatch<SetStateAction<string | null>>;
  setReferenceClipSaveState: Dispatch<SetStateAction<"saved" | "editing" | "saving" | "error" | "offline">>;
  setReferenceClipSaveError: Dispatch<SetStateAction<string | null>>;
  setReferenceClipMessage: Dispatch<SetStateAction<string | null>>;
};

export function useEpisodePackageLoader(args: UseEpisodePackageLoaderArgs) {
  const episodePackageRequestSeqRef = useRef(0);
  const artifactStateWorkpieceIdRef = useRef<string | null>(null);
  const latestArgsRef = useRef(args);

  useEffect(() => {
    latestArgsRef.current = args;
  }, [args]);

  return useCallback(async () => {
    const currentArgs = latestArgsRef.current;
    const episodeId = currentArgs.workpieceId?.trim() ?? "";
    const requestSeq = episodePackageRequestSeqRef.current + 1;
    episodePackageRequestSeqRef.current = requestSeq;

    if (artifactStateWorkpieceIdRef.current !== episodeId) {
      // Clear stale artifact state as soon as the active workpiece changes so prior package
      // residue never renders as current truth for the new target.
      currentArgs.setEpisodePackage(null);
      currentArgs.setEpisodePackageState(episodeId ? "loading" : "idle");
      currentArgs.setEpisodePackageError(null);
      currentArgs.setImageMapMetadataUpdatedAt(null);
      currentArgs.setSelectedThumbnailTitleId(null);
      currentArgs.setSelectedThumbnailConceptId("");
      currentArgs.setSelectedThumbnailVersionId(null);
      currentArgs.setSelectedLaunchVariantId(null);
      currentArgs.setSelectedMediaMapEntryId(null);
      currentArgs.setSelectedImageMapEntryId(null);
      currentArgs.setSelectedBrollBeatId(null);
      currentArgs.setSelectedReferenceClipEntryId(null);
      currentArgs.setThumbnailGenerateError(null);
      currentArgs.setThumbnailUploadError(null);
      currentArgs.setThumbnailPairingError(null);
      currentArgs.setThumbnailPreviewState("idle");
      currentArgs.setThumbnailPreviewDataUrl(null);
      currentArgs.setThumbnailPreviewError(null);
      currentArgs.setImageMapSaveState("saved");
      currentArgs.setImageMapSaveError(null);
      currentArgs.setImageMapExportMessage(null);
      currentArgs.setMediaMapSaveError(null);
      currentArgs.setMediaMapMessage(null);
      currentArgs.setBrollSaveState("saved");
      currentArgs.setBrollSaveError(null);
      currentArgs.setBrollMessage(null);
      currentArgs.setReferenceClipSaveState("saved");
      currentArgs.setReferenceClipSaveError(null);
      currentArgs.setReferenceClipMessage(null);
      currentArgs.resetReleasePrepState();
      artifactStateWorkpieceIdRef.current = episodeId || null;
    }

    if (!episodeId) {
      artifactStateWorkpieceIdRef.current = null;
      currentArgs.setEpisodePackageState("idle");
      return;
    }
    currentArgs.setEpisodePackageState("loading");
    currentArgs.setEpisodePackageError(null);
    const operation = currentArgs.operationAuthority.begin("visuals.package.load");

    try {
      const [loaded, imageMapLoaded, mediaMapLoaded] = await Promise.all([
        readEpisodePackageForWorkpiece(episodeId),
        getWorkpieceImageMap(episodeId),
        readWorkpieceEpisodeMediaMap(episodeId),
      ]);
      if (
        !currentArgs.operationAuthority.isCurrent(operation)
        ||
        episodePackageRequestSeqRef.current !== requestSeq
        || (latestArgsRef.current.workpieceId?.trim() ?? "") !== episodeId
      ) {
        return;
      }
      if (!loaded.ok) {
        currentArgs.setEpisodePackageState("error");
        currentArgs.setEpisodePackageError(loaded.error);
        currentArgs.setThumbnailGenerateError("Unable to load thumbnail metadata.");
        currentArgs.setThumbnailPreviewState("error");
        currentArgs.setThumbnailPreviewDataUrl(null);
        currentArgs.setThumbnailPreviewError("Unable to load thumbnail metadata.");
        return;
      }

      const nextEpisodePackage = resolveCanonicalVisualArtifacts({
        metadataPackage: loaded.episodePackage,
        imageMap: imageMapLoaded.ok
          ? {
            kind: "available",
            value: {
              entries: imageMapLoaded.imageMap.entries,
              spokenBeats: imageMapLoaded.imageMap.spokenBeats,
            },
          }
          : { kind: "unavailable" },
        mediaMap: mediaMapLoaded.ok && mediaMapLoaded.mediaMap
          ? {
            kind: "available",
            value: {
              ...mediaMapLoaded.mediaMap,
              workpiece_id: episodeId,
            },
          }
          : mediaMapLoaded.ok
            ? { kind: "missing" }
            : { kind: "unavailable" },
      });
      if (imageMapLoaded.ok) {
        currentArgs.setImageMapMetadataUpdatedAt(imageMapLoaded.imageMap.metadataUpdatedAt);
        currentArgs.setImageMapSaveState("saved");
        currentArgs.setImageMapSaveError(null);
      } else {
        currentArgs.setImageMapMetadataUpdatedAt(null);
        currentArgs.setImageMapSaveState("error");
        currentArgs.setImageMapSaveError(
          "error" in imageMapLoaded && typeof imageMapLoaded.error === "string"
            ? imageMapLoaded.error
            : "Image-map discovery is currently unavailable.",
        );
      }
      if (mediaMapLoaded.ok) {
        currentArgs.setMediaMapSaveState("saved");
        currentArgs.setMediaMapSaveError(null);
      } else {
        currentArgs.setMediaMapSaveState("error");
        currentArgs.setMediaMapSaveError(mediaMapLoaded.error);
      }

      currentArgs.setEpisodePackage(nextEpisodePackage);
      currentArgs.setEpisodePackageState("loaded");
      currentArgs.setEpisodePackageError(null);
      artifactStateWorkpieceIdRef.current = episodeId;
      currentArgs.setThumbnailGenerateError(null);
      const versions = nextEpisodePackage.thumbnail.versions;
      const preferredVersionId = nextEpisodePackage.thumbnail.primary_version_id
        ?? versions[versions.length - 1]?.id
        ?? null;
      currentArgs.setSelectedThumbnailVersionId(preferredVersionId);
      const imageEntries = nextEpisodePackage.image_map.entries;
      currentArgs.setSelectedImageMapEntryId((prev) => {
        if (prev && imageEntries.some((entry) => entry.id === prev)) return prev;
        return imageEntries[0]?.id ?? null;
      });
    } catch (error) {
      if (
        !currentArgs.operationAuthority.isCurrent(operation)
        ||
        episodePackageRequestSeqRef.current !== requestSeq
        || (latestArgsRef.current.workpieceId?.trim() ?? "") !== episodeId
      ) {
        return;
      }
      currentArgs.setThumbnailGenerateError("Unable to load thumbnail metadata.");
      currentArgs.setThumbnailPreviewState("error");
      currentArgs.setThumbnailPreviewDataUrl(null);
      currentArgs.setThumbnailPreviewError("Unable to load thumbnail metadata.");
      currentArgs.setEpisodePackageState("error");
      currentArgs.setEpisodePackageError(
        error instanceof Error ? error.message : "Unable to load the episode package.",
      );
    }
  }, [args.workpieceId]);
}
