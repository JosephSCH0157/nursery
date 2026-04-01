import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { loadImageMapCandidatePreviewDataUrl } from "../../lib/hearth-image-map-repo";
import type { EpisodeImageMapEntry } from "../../lib/episode-package-v2";

type UseImageMapCandidatePreviewLoaderArgs = {
  workpieceId: string | null;
  selectedImageMapEntry: EpisodeImageMapEntry | null;
  selectedImageMapEntryId: string | null;
  setImageMapCandidatePreviewStateById: Dispatch<SetStateAction<Record<string, "loading" | "ready" | "error">>>;
  setImageMapCandidatePreviewUrlById: Dispatch<SetStateAction<Record<string, string>>>;
  setImageMapCandidatePreviewErrorById: Dispatch<SetStateAction<Record<string, string>>>;
};

export function useImageMapCandidatePreviewLoader(args: UseImageMapCandidatePreviewLoaderArgs) {
  const imageMapCandidatePreviewRequestSeqRef = useRef(0);

  useEffect(() => {
    const episodeId = args.workpieceId?.trim() ?? "";
    const previewSeq = imageMapCandidatePreviewRequestSeqRef.current + 1;
    imageMapCandidatePreviewRequestSeqRef.current = previewSeq;

    if (!episodeId || !args.selectedImageMapEntry) {
      args.setImageMapCandidatePreviewStateById({});
      args.setImageMapCandidatePreviewUrlById({});
      args.setImageMapCandidatePreviewErrorById({});
      return;
    }

    const candidates = args.selectedImageMapEntry.candidate_assets.filter((asset) => asset.asset_id && asset.path);
    if (candidates.length === 0) {
      args.setImageMapCandidatePreviewStateById({});
      args.setImageMapCandidatePreviewUrlById({});
      args.setImageMapCandidatePreviewErrorById({});
      return;
    }

    const loadingState = Object.fromEntries(candidates.map((asset) => [asset.asset_id, "loading"] as const));
    args.setImageMapCandidatePreviewStateById(loadingState);
    args.setImageMapCandidatePreviewUrlById({});
    args.setImageMapCandidatePreviewErrorById({});

    let cancelled = false;
    void Promise.all(candidates.map(async (asset) => {
      const result = await loadImageMapCandidatePreviewDataUrl({
        workpieceId: episodeId,
        path: asset.path,
        mimeType: asset.mime_type ?? null,
      });
      return { assetId: asset.asset_id, result };
    })).then((results) => {
      if (
        cancelled
        || imageMapCandidatePreviewRequestSeqRef.current !== previewSeq
        || (args.workpieceId?.trim() ?? "") !== episodeId
        || args.selectedImageMapEntryId !== args.selectedImageMapEntry?.id
      ) {
        return;
      }

      const nextState: Record<string, "loading" | "ready" | "error"> = {};
      const nextUrls: Record<string, string> = {};
      const nextErrors: Record<string, string> = {};
      for (const { assetId, result } of results) {
        if (result.ok) {
          nextState[assetId] = "ready";
          nextUrls[assetId] = result.dataUrl;
        } else {
          nextState[assetId] = "error";
          nextErrors[assetId] = result.error;
        }
      }
      args.setImageMapCandidatePreviewStateById(nextState);
      args.setImageMapCandidatePreviewUrlById(nextUrls);
      args.setImageMapCandidatePreviewErrorById(nextErrors);
    });

    return () => {
      cancelled = true;
    };
  }, [
    args.selectedImageMapEntry,
    args.selectedImageMapEntryId,
    args.setImageMapCandidatePreviewErrorById,
    args.setImageMapCandidatePreviewStateById,
    args.setImageMapCandidatePreviewUrlById,
    args.workpieceId,
  ]);
}
