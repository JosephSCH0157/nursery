import { useMemo, type Dispatch, type SetStateAction } from "react";
import { useMetadataWorkspace } from "../../hooks/visuals/useMetadataWorkspace";
import type { EpisodePackageV2, EpisodeSeoTitle } from "../../lib/episode-package-v2";
import {
  buildMetadataTagSuggestions,
  normalizeMetadataTag,
  parseMetadataTagInput,
} from "./hearth-shell-formatting";
import {
  buildHearthMetadataMeta,
  isHearthMetadataComplete,
  resolveHearthMetadataLoadStatus,
} from "./buildHearthMetadataViewModel";
import type { HearthMetadataController } from "./hearth-metadata-contracts";
import { buildHearthMetadataProgress } from "./hearth-metadata-progress";

export function useHearthMetadataWorkspaceState(args: {
  workpieceId: string | null;
  workspaceId: string | null;
  episodePackage: EpisodePackageV2 | null;
  setEpisodePackage: Dispatch<SetStateAction<EpisodePackageV2 | null>>;
  setImageMapMetadataUpdatedAt: (value: string | null) => void;
}) {
  return useMetadataWorkspace({
    ...args,
    parseTagInput: parseMetadataTagInput,
    normalizeTag: normalizeMetadataTag,
  });
}

export function useHearthMetadataTagSuggestions(args: {
  currentTags: string[];
  contentCategory: string | null;
  bodyText: string;
  titles: EpisodeSeoTitle[];
}): string[] {
  return useMemo(
    () => buildMetadataTagSuggestions({
      currentTags: args.currentTags,
      contentCategory: args.contentCategory,
      bodyText: args.bodyText,
      titleTexts: args.titles.map((title) => title.text),
    }),
    [args.bodyText, args.contentCategory, args.currentTags, args.titles],
  );
}

type MetadataWorkspace = ReturnType<typeof useHearthMetadataWorkspaceState>;

export function buildHearthMetadataController(args: {
  active: boolean;
  loaded: boolean;
  loadFailed: boolean;
  authorityAvailable: boolean;
  episodePackage: EpisodePackageV2 | null;
  canonicalTitleCount: number;
  canonicalTagCount: number;
  canonicalHasDescriptions: boolean;
  displayedTitleCount: number;
  displayedTagCount: number;
  framingPackReady: boolean;
  disabled: boolean;
  tagSuggestions: string[];
  workspace: MetadataWorkspace;
  retryMetadata: () => void;
}): HearthMetadataController {
  const progress = buildHearthMetadataProgress({
    active: args.active,
    loaded: args.loaded,
    authorityAvailable: args.authorityAvailable,
    episodePackage: args.episodePackage,
    canonicalTitleCount: args.canonicalTitleCount,
    canonicalTagCount: args.canonicalTagCount,
    canonicalHasDescriptions: args.canonicalHasDescriptions,
    dirty: args.workspace.hasUnsavedMetadataChanges,
  });
  const canonicalPresent = progress.titleCount > 0
    || progress.tagCount > 0
    || progress.hasShortDescription
    || progress.hasLongDescription;

  return {
    state: {
      progress,
      tagSuggestions: args.tagSuggestions,
      dirty: args.workspace.hasUnsavedMetadataChanges,
    },
    status: {
      load: resolveHearthMetadataLoadStatus({
        active: args.active,
        loaded: args.loaded,
        failed: args.loadFailed,
        authorityAvailable: args.authorityAvailable,
        canonicalPresent,
      }),
      save: args.workspace.metadataSaveState,
      authority: args.authorityAvailable ? "available" : "unavailable",
      stale: "unknown",
    },
    commands: {
      retryMetadata: args.retryMetadata,
    },
    releaseInput: Object.freeze({
      complete: isHearthMetadataComplete(progress),
    }),
    meta: buildHearthMetadataMeta({
      titleCount: args.displayedTitleCount,
      tagCount: args.displayedTagCount,
      framingPackReady: args.framingPackReady,
    }),
    surface: {
      titles: args.workspace.metadataTitlesDraft,
      tags: args.workspace.metadataTagsDraft,
      tagInput: args.workspace.metadataTagInputDraft,
      tagSuggestions: args.tagSuggestions,
      descriptionShort: args.workspace.metadataDescriptionShortDraft,
      descriptionLong: args.workspace.metadataDescriptionLongDraft,
      previewMode: args.workspace.metadataPreviewMode,
      saveState: args.workspace.metadataSaveState,
      saveError: args.workspace.metadataSaveError,
      hasUnsavedChanges: args.workspace.hasUnsavedMetadataChanges,
      disabled: args.disabled,
      onTitleChange: args.workspace.onMetadataTitleChange,
      onSetPrimaryTitle: args.workspace.onMetadataSetPrimaryTitle,
      onTagInputChange: args.workspace.setMetadataTagInputDraft,
      onAddTagFromInput: args.workspace.onMetadataAddTagFromInput,
      onRemoveTag: args.workspace.onMetadataRemoveTag,
      onAddTagSuggestion: args.workspace.onMetadataAddTagSuggestion,
      onDescriptionShortChange: args.workspace.onMetadataDescriptionShortChange,
      onDescriptionLongChange: args.workspace.onMetadataDescriptionLongChange,
      onPreviewModeChange: args.workspace.onMetadataPreviewModeChange,
      onSaveNow: args.workspace.onMetadataSaveNow,
      onRetrySave: args.workspace.onMetadataRetrySave,
    },
  };
}
