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
import type {
  EpisodeImageMapEntry,
  EpisodePackageV2,
  EpisodeSpokenBeat,
} from "../../lib/episode-package-v2";
import type { HearthOperationAuthority } from "../../lib/hearth-operation-authority";

type UseEpisodePackageLoaderArgs = {
  operationAuthority: HearthOperationAuthority;
  workpieceId: string | null;
  replaceEpisodePackageImageMap: (
    episodePackage: EpisodePackageV2,
    entries: EpisodeImageMapEntry[],
    spokenBeats: EpisodeSpokenBeat[],
  ) => EpisodePackageV2;
  resetReleasePrepState: () => void;
  setEpisodePackage: Dispatch<SetStateAction<EpisodePackageV2 | null>>;
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
      currentArgs.setMediaMapSaveState("saved");
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
      return;
    }
    const operation = currentArgs.operationAuthority.begin("visuals.package.load");

    try {
      const loaded = await readEpisodePackageForWorkpiece(episodeId);
      if (
        !currentArgs.operationAuthority.isCurrent(operation)
        ||
        episodePackageRequestSeqRef.current !== requestSeq
        || (latestArgsRef.current.workpieceId?.trim() ?? "") !== episodeId
      ) {
        return;
      }
      if (!loaded.ok) {
        currentArgs.setThumbnailGenerateError("Unable to load thumbnail metadata.");
        currentArgs.setThumbnailPreviewState("error");
        currentArgs.setThumbnailPreviewDataUrl(null);
        currentArgs.setThumbnailPreviewError("Unable to load thumbnail metadata.");
        return;
      }

      // Paint baseline episode package immediately so the primary list content can render
      // before slower image/media map hydration calls complete.
      currentArgs.setEpisodePackage(loaded.episodePackage);
      artifactStateWorkpieceIdRef.current = episodeId;
      currentArgs.setThumbnailGenerateError(null);
      currentArgs.setImageMapSaveError(null);
      {
        const versions = loaded.episodePackage.thumbnail.versions;
        const preferredVersionId = loaded.episodePackage.thumbnail.primary_version_id
          ?? versions[versions.length - 1]?.id
          ?? null;
        currentArgs.setSelectedThumbnailVersionId(preferredVersionId);
        const initialImageEntries = loaded.episodePackage.image_map.entries;
        currentArgs.setSelectedImageMapEntryId((prev) => {
          if (prev && initialImageEntries.some((entry) => entry.id === prev)) return prev;
          return initialImageEntries[0]?.id ?? null;
        });
      }

      const [imageMapLoaded, mediaMapLoaded] = await Promise.all([
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

      let nextEpisodePackage = loaded.episodePackage;
      if (imageMapLoaded.ok) {
        nextEpisodePackage = currentArgs.replaceEpisodePackageImageMap(
          loaded.episodePackage,
          imageMapLoaded.imageMap.entries,
          imageMapLoaded.imageMap.spokenBeats,
        );
        currentArgs.setImageMapMetadataUpdatedAt(imageMapLoaded.imageMap.metadataUpdatedAt);
      } else {
        currentArgs.setImageMapMetadataUpdatedAt(null);
      }
      if (mediaMapLoaded.ok && mediaMapLoaded.mediaMap) {
        nextEpisodePackage = {
          ...nextEpisodePackage,
          media_map: {
            ...mediaMapLoaded.mediaMap,
            workpiece_id: episodeId,
          },
        };
      }

      currentArgs.setEpisodePackage(nextEpisodePackage);
      const imageEntries = nextEpisodePackage.image_map.entries;
      currentArgs.setSelectedImageMapEntryId((prev) => {
        if (prev && imageEntries.some((entry) => entry.id === prev)) return prev;
        return imageEntries[0]?.id ?? null;
      });
    } catch {
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
    }
  }, [args.workpieceId]);
}
