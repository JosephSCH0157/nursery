import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
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

type UseEpisodePackageLoaderArgs = {
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

  return useCallback(async () => {
    const episodeId = args.workpieceId?.trim() ?? "";
    const requestSeq = episodePackageRequestSeqRef.current + 1;
    episodePackageRequestSeqRef.current = requestSeq;

    if (artifactStateWorkpieceIdRef.current !== episodeId) {
      // Clear stale artifact state as soon as the active workpiece changes so prior package
      // residue never renders as current truth for the new target.
      args.setEpisodePackage(null);
      args.setImageMapMetadataUpdatedAt(null);
      args.setSelectedThumbnailTitleId(null);
      args.setSelectedThumbnailConceptId("");
      args.setSelectedThumbnailVersionId(null);
      args.setSelectedLaunchVariantId(null);
      args.setSelectedMediaMapEntryId(null);
      args.setSelectedImageMapEntryId(null);
      args.setSelectedBrollBeatId(null);
      args.setSelectedReferenceClipEntryId(null);
      args.setThumbnailGenerateError(null);
      args.setThumbnailUploadError(null);
      args.setThumbnailPairingError(null);
      args.setThumbnailPreviewState("idle");
      args.setThumbnailPreviewDataUrl(null);
      args.setThumbnailPreviewError(null);
      args.setImageMapSaveState("saved");
      args.setImageMapSaveError(null);
      args.setImageMapExportMessage(null);
      args.setMediaMapSaveState("saved");
      args.setMediaMapSaveError(null);
      args.setMediaMapMessage(null);
      args.setBrollSaveState("saved");
      args.setBrollSaveError(null);
      args.setBrollMessage(null);
      args.setReferenceClipSaveState("saved");
      args.setReferenceClipSaveError(null);
      args.setReferenceClipMessage(null);
      args.resetReleasePrepState();
      artifactStateWorkpieceIdRef.current = episodeId || null;
    }

    if (!episodeId) {
      artifactStateWorkpieceIdRef.current = null;
      return;
    }

    const loaded = await readEpisodePackageForWorkpiece(episodeId);
    if (episodePackageRequestSeqRef.current !== requestSeq || (args.workpieceId?.trim() ?? "") !== episodeId) {
      return;
    }
    if (!loaded.ok) {
      args.setThumbnailGenerateError("Unable to load thumbnail metadata.");
      args.setThumbnailPreviewState("error");
      args.setThumbnailPreviewDataUrl(null);
      args.setThumbnailPreviewError("Unable to load thumbnail metadata.");
      return;
    }

    // Paint baseline episode package immediately so the primary list content can render
    // before slower image/media map hydration calls complete.
    args.setEpisodePackage(loaded.episodePackage);
    artifactStateWorkpieceIdRef.current = episodeId;
    args.setThumbnailGenerateError(null);
    args.setImageMapSaveError(null);
    {
      const versions = loaded.episodePackage.thumbnail.versions;
      const preferredVersionId = loaded.episodePackage.thumbnail.primary_version_id
        ?? versions[versions.length - 1]?.id
        ?? null;
      args.setSelectedThumbnailVersionId(preferredVersionId);
      const initialImageEntries = loaded.episodePackage.image_map.entries;
      args.setSelectedImageMapEntryId((prev) => {
        if (prev && initialImageEntries.some((entry) => entry.id === prev)) return prev;
        return initialImageEntries[0]?.id ?? null;
      });
    }

    const [imageMapLoaded, mediaMapLoaded] = await Promise.all([
      getWorkpieceImageMap(episodeId),
      readWorkpieceEpisodeMediaMap(episodeId),
    ]);
    if (episodePackageRequestSeqRef.current !== requestSeq || (args.workpieceId?.trim() ?? "") !== episodeId) {
      return;
    }

    let nextEpisodePackage = loaded.episodePackage;
    if (imageMapLoaded.ok) {
      nextEpisodePackage = args.replaceEpisodePackageImageMap(
        loaded.episodePackage,
        imageMapLoaded.imageMap.entries,
        imageMapLoaded.imageMap.spokenBeats,
      );
      args.setImageMapMetadataUpdatedAt(imageMapLoaded.imageMap.metadataUpdatedAt);
    } else {
      args.setImageMapMetadataUpdatedAt(null);
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

    args.setEpisodePackage(nextEpisodePackage);
    const imageEntries = nextEpisodePackage.image_map.entries;
    args.setSelectedImageMapEntryId((prev) => {
      if (prev && imageEntries.some((entry) => entry.id === prev)) return prev;
      return imageEntries[0]?.id ?? null;
    });
  }, [args]);
}
