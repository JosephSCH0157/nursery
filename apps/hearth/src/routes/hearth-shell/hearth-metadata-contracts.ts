import type { ComponentProps } from "react";
import type MetadataPanel from "../../components/metadata/MetadataPanel";

export type HearthMetadataLoadStatus =
  | "inactive"
  | "loading"
  | "loaded"
  | "absent"
  | "failed"
  | "unavailable";

export type HearthMetadataCompletion =
  | "inactive"
  | "loading"
  | "unavailable"
  | "incomplete"
  | "dirty"
  | "complete";

export type HearthMetadataProgress = {
  titleCount: number;
  tagCount: number;
  hasShortDescription: boolean;
  hasLongDescription: boolean;
  completion: HearthMetadataCompletion;
};

export type HearthMetadataController = {
  state: {
    progress: HearthMetadataProgress;
    tagSuggestions: string[];
    dirty: boolean;
  };
  status: {
    load: HearthMetadataLoadStatus;
    save: ComponentProps<typeof MetadataPanel>["saveState"];
    authority: "available" | "unavailable";
    stale: "current" | "unknown";
  };
  commands: {
    retryMetadata: () => void;
  };
  releaseInput: Readonly<{
    complete: boolean;
  }>;
  meta: string;
  surface: ComponentProps<typeof MetadataPanel>;
};
