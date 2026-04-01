import { useCallback } from "react";
import { activateEpisodeMediaMapForFulfillment } from "../../lib/hearth-media-map-fulfillment";
import {
  applyProducerDirectionToMediaMap,
  resolveMediaMapConversationScope,
  type MediaMapConversationDirectionId,
  type MediaMapGenerationScope,
} from "../../lib/hearth-media-map-conversation";
import type { EpisodeMediaMap, EpisodePackageV2 } from "../../lib/episode-package-v2";

type PersistMediaMapResult =
  | { ok: true; episodePackage: EpisodePackageV2 }
  | { ok: false; error: string };

type PrepareSourceEpisodePackageResult =
  | {
    ok: true;
    episodePackage: EpisodePackageV2;
    bootstrappedImageCount: number;
    bootstrappedBrollCount: number;
    bootstrappedReferenceClipCount: number;
  }
  | { ok: false; error: string };

type UseMediaMapGenerationActionsArgs = {
  episodePackage: EpisodePackageV2 | null;
  isMediaMapBusy: boolean;
  approvedScriptVersion: number | null;
  mediaMapGenerationScope: MediaMapGenerationScope;
  setMediaMapGenerationScope: (scope: MediaMapGenerationScope) => void;
  setIsMediaMapBusy: (next: boolean) => void;
  setMediaMapSaveState: (next: "saved" | "editing" | "saving" | "error") => void;
  setMediaMapSaveError: (next: string | null) => void;
  setMediaMapMessage: (next: string | null) => void;
  setSelectedMediaMapEntryId: (next: string | null) => void;
  prepareSourceEpisodePackageForMediaMapGeneration: (scope: MediaMapGenerationScope) => Promise<PrepareSourceEpisodePackageResult>;
  buildMediaMapFromExistingPlans: (
    packageSource: EpisodePackageV2,
    scriptVersionId: string | null,
    scope: MediaMapGenerationScope,
  ) => EpisodeMediaMap;
  persistMediaMap: (args: {
    map: EpisodeMediaMap;
    eventName: string;
    eventPayload: Record<string, unknown>;
    baseEpisodePackage?: EpisodePackageV2;
  }) => Promise<PersistMediaMapResult>;
};

export function useMediaMapGenerationActions(args: UseMediaMapGenerationActionsArgs) {
  const onGenerateEpisodeMediaMapFromPlans = useCallback(async () => {
    if (!args.episodePackage) return;
    if (args.isMediaMapBusy) return;
    const scriptVersionId = args.approvedScriptVersion ? String(args.approvedScriptVersion) : null;
    args.setIsMediaMapBusy(true);
    args.setMediaMapSaveState("saving");
    args.setMediaMapSaveError(null);
    try {
      const prepared = await args.prepareSourceEpisodePackageForMediaMapGeneration(args.mediaMapGenerationScope);
      if (!prepared.ok) {
        args.setMediaMapSaveError(prepared.error);
        args.setMediaMapSaveState("error");
        return;
      }

      const nextMap = args.buildMediaMapFromExistingPlans(
        prepared.episodePackage,
        scriptVersionId,
        args.mediaMapGenerationScope,
      );
      if (nextMap.entries.length === 0) {
        args.setMediaMapSaveState("saved");
        args.setMediaMapMessage("No visual plans are ready yet. Pull beats from the script or add thumbnails, B-roll, or reference clips first.");
        return;
      }

      const saved = await args.persistMediaMap({
        map: nextMap,
        eventName: "hearth.media_map.generated_from_plans.v1",
        eventPayload: {
          entry_count: nextMap.entries.length,
          script_version_id: scriptVersionId,
          scope: args.mediaMapGenerationScope,
        },
        baseEpisodePackage: prepared.episodePackage,
      });
      if (!saved.ok) {
        args.setMediaMapSaveError(saved.error);
        args.setMediaMapSaveState("error");
        return;
      }
      args.setSelectedMediaMapEntryId(nextMap.entries[0]?.id ?? null);
      args.setMediaMapSaveState("saved");
      const brollCount = nextMap.entries.filter((entry) => entry.final_media_kind === "b_roll").length;
      const referenceClipCount = nextMap.entries.filter((entry) => entry.final_media_kind === "contextual_data_composite").length;
      args.setMediaMapMessage(
        `${prepared.bootstrappedImageCount > 0 ? `Seeded ${prepared.bootstrappedImageCount} timeline image beat${prepared.bootstrappedImageCount === 1 ? "" : "s"} from the canonical script. ` : ""}${prepared.bootstrappedBrollCount > 0 ? `Seeded ${prepared.bootstrappedBrollCount} B-roll beat${prepared.bootstrappedBrollCount === 1 ? "" : "s"} from the canonical script. ` : ""}${prepared.bootstrappedReferenceClipCount > 0 ? `Seeded ${prepared.bootstrappedReferenceClipCount} Reference Clip${prepared.bootstrappedReferenceClipCount === 1 ? "" : "s"} from explanatory Timeline Image beats. ` : ""}Generated ${nextMap.entries.length} media map entries from the current visual plans using scope: ${args.mediaMapGenerationScope.replaceAll("_", " ")} (image: ${nextMap.entries.filter((entry) => entry.final_media_kind === "image").length}, b-roll: ${brollCount}, reference clips: ${referenceClipCount}). Next: Frame the episode (titles, SEO, tags).`,
      );
    } catch {
      args.setMediaMapSaveError("Unable to generate Episode Media Map.");
      args.setMediaMapSaveState("error");
    } finally {
      args.setIsMediaMapBusy(false);
    }
  }, [args]);

  const onBuildAndApplyMediaMapFromConversation = useCallback(async (conversationArgs: {
    directionId: MediaMapConversationDirectionId;
    constraintsText: string;
    derivedFromScript: boolean;
  }): Promise<boolean> => {
    if (!args.episodePackage) return false;
    if (args.isMediaMapBusy) return false;
    const scriptVersionId = args.approvedScriptVersion ? String(args.approvedScriptVersion) : null;
    const conversationScope = resolveMediaMapConversationScope({
      directionId: conversationArgs.directionId,
      constraintsText: conversationArgs.constraintsText,
      fallbackScope: args.mediaMapGenerationScope,
    });
    args.setMediaMapGenerationScope(conversationScope);
    args.setIsMediaMapBusy(true);
    args.setMediaMapSaveState("saving");
    args.setMediaMapSaveError(null);
    try {
      const prepared = await args.prepareSourceEpisodePackageForMediaMapGeneration(conversationScope);
      if (!prepared.ok) {
        args.setMediaMapSaveError(prepared.error);
        args.setMediaMapSaveState("error");
        return false;
      }
      const generatedMap = args.buildMediaMapFromExistingPlans(
        prepared.episodePackage,
        scriptVersionId,
        conversationScope,
      );
      if (generatedMap.entries.length === 0) {
        args.setMediaMapSaveState("saved");
        args.setMediaMapMessage("No visual plans are ready yet. Pull beats from the script or add thumbnails, B-roll, or reference clips first.");
        return false;
      }
      const directedMap = applyProducerDirectionToMediaMap({
        map: generatedMap,
        directionId: conversationArgs.directionId,
        constraintsText: conversationArgs.constraintsText,
      });
      const activatedMap = activateEpisodeMediaMapForFulfillment({
        ...directedMap,
        script_version_id: scriptVersionId,
      });
      const saved = await args.persistMediaMap({
        map: activatedMap,
        eventName: "hearth.media_map.conversation_applied.v1",
        eventPayload: {
          entry_count: activatedMap.entries.length,
          direction: conversationArgs.directionId,
          constraints: conversationArgs.constraintsText.trim() || null,
          derived_from_script: conversationArgs.derivedFromScript,
          scope: conversationScope,
          script_version_id: scriptVersionId,
        },
        baseEpisodePackage: prepared.episodePackage,
      });
      if (!saved.ok) {
        args.setMediaMapSaveError(saved.error);
        args.setMediaMapSaveState("error");
        return false;
      }
      args.setSelectedMediaMapEntryId(activatedMap.entries[0]?.id ?? null);
      args.setMediaMapSaveState("saved");
      args.setMediaMapMessage(
        `${prepared.bootstrappedImageCount > 0 ? `Seeded ${prepared.bootstrappedImageCount} timeline image beat${prepared.bootstrappedImageCount === 1 ? "" : "s"} from the canonical script. ` : ""}${prepared.bootstrappedBrollCount > 0 ? `Seeded ${prepared.bootstrappedBrollCount} B-roll beat${prepared.bootstrappedBrollCount === 1 ? "" : "s"} from the canonical script. ` : ""}${prepared.bootstrappedReferenceClipCount > 0 ? `Seeded ${prepared.bootstrappedReferenceClipCount} Reference Clip${prepared.bootstrappedReferenceClipCount === 1 ? "" : "s"} from explanatory Timeline Image beats. ` : ""}Applied a ${conversationArgs.directionId} visual plan with ${activatedMap.entries.length} mapped beats. ${conversationArgs.constraintsText.trim() ? `Constraints: ${conversationArgs.constraintsText.trim()}. ` : ""}${conversationArgs.derivedFromScript ? "Started from the current script read." : "Direction was chosen manually."}`,
      );
      return true;
    } catch {
      args.setMediaMapSaveError("Unable to build and apply the Episode Media Map.");
      args.setMediaMapSaveState("error");
      return false;
    } finally {
      args.setIsMediaMapBusy(false);
    }
  }, [args]);

  return {
    onGenerateEpisodeMediaMapFromPlans,
    onBuildAndApplyMediaMapFromConversation,
  };
}
