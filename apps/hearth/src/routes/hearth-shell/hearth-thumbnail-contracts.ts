import type { buildHearthThumbnailPanelProps } from "../../views/modes/buildHearthThumbnailPanelProps";
import type { useThumbnailWorkspace } from "../../hooks/visuals/useThumbnailWorkspace";

export type HearthCanonicalThumbnailProgress = {
  workpieceId: string;
  candidateSetRevision: number;
  conceptRevisionCount: number;
  baseVersionCount: number;
  candidateCount: number;
  eligibleCandidateCount: number;
  pendingCandidateCount: number;
  previewAssetPaths: string[];
  titleCount: number;
  tagCount: number;
  hasDescriptions: boolean;
};

export type HearthThumbnailLoadStatus =
  | "inactive"
  | "loading"
  | "absent"
  | "loaded"
  | "unavailable"
  | "error";

export type HearthThumbnailController = {
  state: {
    workspace: ReturnType<typeof useThumbnailWorkspace>;
    canonical: HearthCanonicalThumbnailProgress;
  };
  commands: {
    refreshThumbnails: () => void;
    retryThumbnailLoad: () => void;
  };
  status: {
    load: HearthThumbnailLoadStatus;
    generation: "idle" | "running";
    upload: "idle" | "running";
    preview: "idle" | "loading" | "ready" | "error";
    authority: "available" | "unavailable";
  };
  surface: ReturnType<typeof buildHearthThumbnailPanelProps>;
};
