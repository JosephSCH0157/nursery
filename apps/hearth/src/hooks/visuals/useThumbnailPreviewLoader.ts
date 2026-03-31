import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { loadThumbnailPreviewDataUrl } from "../../lib/hearth-thumbnail-api";
import type { EpisodeThumbnailVersion } from "../../lib/episode-package-v2";

type UseThumbnailPreviewLoaderArgs = {
  workpieceId: string | null;
  selectedThumbnailVersion: EpisodeThumbnailVersion | null;
  selectedThumbnailVersionId: string | null;
  setThumbnailPreviewState: Dispatch<SetStateAction<"idle" | "loading" | "ready" | "error">>;
  setThumbnailPreviewDataUrl: Dispatch<SetStateAction<string | null>>;
  setThumbnailPreviewError: Dispatch<SetStateAction<string | null>>;
};

export function useThumbnailPreviewLoader(args: UseThumbnailPreviewLoaderArgs) {
  const thumbnailPreviewRequestSeqRef = useRef(0);

  useEffect(() => {
    const episodeId = args.workpieceId?.trim() ?? "";
    const previewSeq = thumbnailPreviewRequestSeqRef.current + 1;
    thumbnailPreviewRequestSeqRef.current = previewSeq;
    if (!episodeId || !args.selectedThumbnailVersion) {
      args.setThumbnailPreviewState("idle");
      args.setThumbnailPreviewDataUrl(null);
      args.setThumbnailPreviewError(null);
      return;
    }

    if (args.selectedThumbnailVersion.status === "failed") {
      args.setThumbnailPreviewState("error");
      args.setThumbnailPreviewDataUrl(null);
      args.setThumbnailPreviewError(args.selectedThumbnailVersion.error ?? "This version failed.");
      return;
    }

    let cancelled = false;
    args.setThumbnailPreviewState("loading");
    args.setThumbnailPreviewError(null);

    void loadThumbnailPreviewDataUrl({
      workpieceId: episodeId,
      version: args.selectedThumbnailVersion,
    }).then((result) => {
      if (
        cancelled
        || thumbnailPreviewRequestSeqRef.current !== previewSeq
        || (args.workpieceId?.trim() ?? "") !== episodeId
        || args.selectedThumbnailVersionId !== args.selectedThumbnailVersion?.id
      ) {
        return;
      }
      if (!result.ok) {
        args.setThumbnailPreviewState("error");
        args.setThumbnailPreviewDataUrl(null);
        args.setThumbnailPreviewError(result.error);
        return;
      }
      args.setThumbnailPreviewState("ready");
      args.setThumbnailPreviewDataUrl(result.dataUrl);
      args.setThumbnailPreviewError(null);
    });

    return () => {
      cancelled = true;
    };
  }, [
    args.selectedThumbnailVersion,
    args.selectedThumbnailVersionId,
    args.setThumbnailPreviewDataUrl,
    args.setThumbnailPreviewError,
    args.setThumbnailPreviewState,
    args.workpieceId,
  ]);
}
