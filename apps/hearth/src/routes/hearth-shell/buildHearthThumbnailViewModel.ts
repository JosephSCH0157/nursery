import type {
  HearthCanonicalThumbnailProgress,
  HearthThumbnailLoadStatus,
} from "./hearth-thumbnail-contracts";

export const EMPTY_CANONICAL_THUMBNAIL_PROGRESS: HearthCanonicalThumbnailProgress = {
  workpieceId: "",
  conceptRevisionCount: 0,
  baseVersionCount: 0,
  candidateCount: 0,
  eligibleCandidateCount: 0,
  previewAssetPaths: [],
  titleCount: 0,
  tagCount: 0,
  hasDescriptions: false,
};

export function deriveHearthThumbnailLoadStatus(args: {
  workpieceId: string | null;
  loading: boolean;
  error: string | null;
  authorityUnavailable: boolean;
  candidateCount: number;
}): HearthThumbnailLoadStatus {
  if (!args.workpieceId?.trim()) return "inactive";
  if (args.loading) return "loading";
  if (args.authorityUnavailable) return "unavailable";
  if (args.error) return "error";
  return args.candidateCount > 0 ? "loaded" : "absent";
}

export function isCanonicalThumbnailSetComplete(progress: HearthCanonicalThumbnailProgress): boolean {
  return progress.candidateCount === 3
    && progress.eligibleCandidateCount === progress.candidateCount
    && progress.previewAssetPaths.length === progress.candidateCount;
}
