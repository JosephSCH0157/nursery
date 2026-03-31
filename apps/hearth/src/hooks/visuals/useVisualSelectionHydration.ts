import { useEffect } from "react";
import type {
  EpisodeContextualDataCompositePlan,
  EpisodeImageMapAnchorScope,
  EpisodeImageMapEntry,
  EpisodeMediaMapEntry,
  EpisodeBrollPlanBeat,
  EpisodeLaunchVariant,
  EpisodeThumbnailVersion,
} from "../../lib/episode-package-v2";

type UseVisualSelectionHydrationArgs = {
  launchVariants: EpisodeLaunchVariant[];
  selectedLaunchVariant: EpisodeLaunchVariant | null;
  thumbnailTitleOptions: Array<{ id: string }>;
  preferredThumbnailTitleId: string | null;
  thumbnailVersions: EpisodeThumbnailVersion[];
  selectedThumbnailConceptId: string;
  primaryThumbnailVersionId: string | null;
  mediaMapEntries: EpisodeMediaMapEntry[];
  selectedMediaMapEntry: EpisodeMediaMapEntry | null;
  imageMapEntries: EpisodeImageMapEntry[];
  selectedImageMapEntry: EpisodeImageMapEntry | null;
  brollBeats: EpisodeBrollPlanBeat[];
  selectedBrollBeat: EpisodeBrollPlanBeat | null;
  referenceClipEntries: EpisodeContextualDataCompositePlan[];
  selectedReferenceClipEntry: EpisodeContextualDataCompositePlan | null;
  syncSelectedLaunchVariantId: (launchVariants: EpisodeLaunchVariant[]) => void;
  syncLaunchVariantDraftFromVariant: (selectedLaunchVariant: EpisodeLaunchVariant | null) => void;
  syncSelectedThumbnailTitleId: (thumbnailTitleOptions: Array<{ id: string }>, preferredTitleId: string | null) => void;
  syncSelectedThumbnailVersionId: (
    thumbnailVersions: EpisodeThumbnailVersion[],
    selectedThumbnailConceptId: string,
    primaryThumbnailVersionId: string | null,
  ) => void;
  syncSelectedMediaMapEntryId: (mediaMapEntries: EpisodeMediaMapEntry[]) => void;
  syncMediaMapDraftFromEntry: (selectedMediaMapEntry: EpisodeMediaMapEntry | null) => void;
  syncSelectedImageMapEntryId: (entries: EpisodeImageMapEntry[]) => void;
  syncImageMapDraftFromEntry: (
    selectedImageMapEntry: EpisodeImageMapEntry | null,
    resolveAnchorScope: (entry: EpisodeImageMapEntry) => EpisodeImageMapAnchorScope,
  ) => void;
  resolveImageMapEntryAnchorScope: (entry: EpisodeImageMapEntry) => EpisodeImageMapAnchorScope;
  syncSelectedBrollBeatId: (brollBeats: EpisodeBrollPlanBeat[]) => void;
  syncBrollDraftFromBeat: (selectedBrollBeat: EpisodeBrollPlanBeat | null) => void;
  syncSelectedReferenceClipEntryId: (entries: EpisodeContextualDataCompositePlan[]) => void;
  syncReferenceClipDraftFromEntry: (selectedReferenceClipEntry: EpisodeContextualDataCompositePlan | null) => void;
};

export function useVisualSelectionHydration(args: UseVisualSelectionHydrationArgs) {
  useEffect(() => {
    args.syncSelectedLaunchVariantId(args.launchVariants);
  }, [args.launchVariants, args.syncSelectedLaunchVariantId]);

  useEffect(() => {
    args.syncLaunchVariantDraftFromVariant(args.selectedLaunchVariant);
  }, [args.selectedLaunchVariant, args.syncLaunchVariantDraftFromVariant]);

  useEffect(() => {
    args.syncSelectedThumbnailTitleId(
      args.thumbnailTitleOptions,
      args.preferredThumbnailTitleId,
    );
  }, [args.preferredThumbnailTitleId, args.syncSelectedThumbnailTitleId, args.thumbnailTitleOptions]);

  useEffect(() => {
    args.syncSelectedThumbnailVersionId(
      args.thumbnailVersions,
      args.selectedThumbnailConceptId,
      args.primaryThumbnailVersionId,
    );
  }, [
    args.primaryThumbnailVersionId,
    args.selectedThumbnailConceptId,
    args.syncSelectedThumbnailVersionId,
    args.thumbnailVersions,
  ]);

  useEffect(() => {
    args.syncSelectedMediaMapEntryId(args.mediaMapEntries);
  }, [args.mediaMapEntries, args.syncSelectedMediaMapEntryId]);

  useEffect(() => {
    args.syncMediaMapDraftFromEntry(args.selectedMediaMapEntry);
  }, [args.selectedMediaMapEntry, args.syncMediaMapDraftFromEntry]);

  useEffect(() => {
    args.syncSelectedImageMapEntryId(args.imageMapEntries);
  }, [args.imageMapEntries, args.syncSelectedImageMapEntryId]);

  useEffect(() => {
    args.syncImageMapDraftFromEntry(args.selectedImageMapEntry, args.resolveImageMapEntryAnchorScope);
  }, [args.resolveImageMapEntryAnchorScope, args.selectedImageMapEntry, args.syncImageMapDraftFromEntry]);

  useEffect(() => {
    args.syncSelectedBrollBeatId(args.brollBeats);
  }, [args.brollBeats, args.syncSelectedBrollBeatId]);

  useEffect(() => {
    args.syncBrollDraftFromBeat(args.selectedBrollBeat);
  }, [args.selectedBrollBeat, args.syncBrollDraftFromBeat]);

  useEffect(() => {
    args.syncSelectedReferenceClipEntryId(args.referenceClipEntries);
  }, [args.referenceClipEntries, args.syncSelectedReferenceClipEntryId]);

  useEffect(() => {
    args.syncReferenceClipDraftFromEntry(args.selectedReferenceClipEntry);
  }, [args.selectedReferenceClipEntry, args.syncReferenceClipDraftFromEntry]);
}
