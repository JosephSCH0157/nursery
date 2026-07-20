import { useCallback } from "react";
import { activateEpisodeMediaMapForFulfillment } from "../../lib/hearth-media-map-fulfillment";
import {
  applyProducerDirectionToMediaMap,
  resolveMediaMapConversationScope,
  type MediaMapConversationDirectionId,
  type MediaMapGenerationScope,
} from "../../lib/hearth-media-map-conversation";
import type { EpisodeMediaMap, EpisodePackageV2 } from "../../lib/episode-package-v2";
import {
  summarizeMediaMapModalities,
  validateFullMediaDistribution,
  type FullMediaBudgetPolicy,
} from "../../lib/hearth-media-map-builder";
import type { HearthOperationAuthority } from "../../lib/hearth-operation-authority";

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
    budgetPolicy: FullMediaBudgetPolicy;
  }
  | { ok: false; error: string };

type UseMediaMapGenerationActionsArgs = {
  operationAuthority: HearthOperationAuthority;
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
    options?: { videoHeavy?: boolean; budgetPolicy?: FullMediaBudgetPolicy },
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
    const operation = args.operationAuthority.begin("media-map.generate");
    const scriptVersionId = args.approvedScriptVersion ? String(args.approvedScriptVersion) : null;
    args.setIsMediaMapBusy(true);
    args.setMediaMapSaveState("saving");
    args.setMediaMapSaveError(null);
    try {
      const prepared = await args.prepareSourceEpisodePackageForMediaMapGeneration(args.mediaMapGenerationScope);
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (!prepared.ok) {
        args.setMediaMapSaveError(prepared.error);
        args.setMediaMapSaveState("error");
        return;
      }

      const nextMap = args.buildMediaMapFromExistingPlans(
        prepared.episodePackage,
        scriptVersionId,
        args.mediaMapGenerationScope,
        { budgetPolicy: prepared.budgetPolicy },
      );
      if (nextMap.entries.length === 0) {
        args.setMediaMapSaveState("saved");
        args.setMediaMapMessage("No visual plans are ready yet. Pull beats from the script or add thumbnails, B-roll, or reference clips first.");
        return;
      }
      if (args.mediaMapGenerationScope === "full_media_plan") {
        const validation = validateFullMediaDistribution(nextMap.entries, { budgetPolicy: prepared.budgetPolicy });
        if (!validation.ok) {
          args.setMediaMapSaveError(validation.error);
          args.setMediaMapSaveState("error");
          return;
        }
      }

      const modalitySummary = summarizeMediaMapModalities(nextMap.entries);
      const saved = await args.persistMediaMap({
        map: nextMap,
        eventName: "hearth.media_map.generated_from_plans.v1",
        eventPayload: {
          entry_count: nextMap.entries.length,
          script_version_id: scriptVersionId,
          scope: args.mediaMapGenerationScope,
          image_count: modalitySummary.images,
          motion_broll_count: modalitySummary.motionBroll,
          generated_motion_broll_count: modalitySummary.generatedMotionBroll,
          reference_clip_count: modalitySummary.referenceClips,
          data_composite_count: modalitySummary.dataComposites,
          generation_burden: modalitySummary.generationBurden.toLowerCase(),
          estimated_duration_sec: Math.round(prepared.budgetPolicy.estimatedDurationSec),
          duration_source: prepared.budgetPolicy.durationSource,
          target_placement_min: prepared.budgetPolicy.minimumPlacements,
          target_placement_target: prepared.budgetPolicy.targetPlacements,
          target_placement_max: prepared.budgetPolicy.maximumPlacements,
          default_motion_allowance: prepared.budgetPolicy.defaultMotionAllowance,
          visual_cadence_sec_per_placement: nextMap.entries.length > 0
            ? Math.round(prepared.budgetPolicy.estimatedDurationSec / nextMap.entries.length)
            : null,
        },
        baseEpisodePackage: prepared.episodePackage,
      });
      if (!args.operationAuthority.isCurrent(operation)) return;
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
        `${prepared.bootstrappedImageCount > 0 ? `Seeded ${prepared.bootstrappedImageCount} timeline image beat${prepared.bootstrappedImageCount === 1 ? "" : "s"} from the canonical script. ` : ""}${prepared.bootstrappedBrollCount > 0 ? `Seeded ${prepared.bootstrappedBrollCount} B-roll beat${prepared.bootstrappedBrollCount === 1 ? "" : "s"} from the canonical script. ` : ""}${prepared.bootstrappedReferenceClipCount > 0 ? `Seeded ${prepared.bootstrappedReferenceClipCount} Reference Clip${prepared.bootstrappedReferenceClipCount === 1 ? "" : "s"} from explanatory Timeline Image beats. ` : ""}Created ${nextMap.entries.length} visual plan entries from the current visual plans using scope: ${args.mediaMapGenerationScope.replaceAll("_", " ")} (image: ${nextMap.entries.filter((entry) => entry.final_media_kind === "image").length}, b-roll: ${brollCount}, reference clips: ${referenceClipCount}). Next: Frame the episode (titles, SEO, tags).`,
      );
    } catch {
      if (!args.operationAuthority.isCurrent(operation)) return;
      args.setMediaMapSaveError("Unable to create the Episode Visual Plan.");
      args.setMediaMapSaveState("error");
    } finally {
      if (args.operationAuthority.isCurrent(operation)) args.setIsMediaMapBusy(false);
    }
  }, [args]);

  const onBuildAndApplyMediaMapFromConversation = useCallback(async (conversationArgs: {
    directionId: MediaMapConversationDirectionId;
    constraintsText: string;
    derivedFromScript: boolean;
  }): Promise<boolean> => {
    if (!args.episodePackage) return false;
    if (args.isMediaMapBusy) return false;
    const operation = args.operationAuthority.begin("media-map.conversation.apply");
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
      if (!args.operationAuthority.isCurrent(operation)) return false;
      if (!prepared.ok) {
        args.setMediaMapSaveError(prepared.error);
        args.setMediaMapSaveState("error");
        return false;
      }
      const videoHeavyRequested = /\b(?:heavier on b-?roll|more b-?roll|b-?roll heavy|video[- ]heavy)\b/i.test(conversationArgs.constraintsText);
      const generatedMap = args.buildMediaMapFromExistingPlans(
        prepared.episodePackage,
        scriptVersionId,
        conversationScope,
        { videoHeavy: videoHeavyRequested, budgetPolicy: prepared.budgetPolicy },
      );
      if (generatedMap.entries.length === 0) {
        args.setMediaMapSaveState("saved");
        args.setMediaMapMessage("No visual plans are ready yet. Pull beats from the script or add thumbnails, B-roll, or reference clips first.");
        return false;
      }
      if (conversationScope === "full_media_plan") {
        const validation = validateFullMediaDistribution(generatedMap.entries, {
          videoHeavy: videoHeavyRequested,
          budgetPolicy: prepared.budgetPolicy,
        });
        if (!validation.ok) {
          args.setMediaMapSaveError(validation.error);
          args.setMediaMapSaveState("error");
          return false;
        }
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
      const modalitySummary = summarizeMediaMapModalities(activatedMap.entries);
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
          image_count: modalitySummary.images,
          motion_broll_count: modalitySummary.motionBroll,
          generated_motion_broll_count: modalitySummary.generatedMotionBroll,
          reference_clip_count: modalitySummary.referenceClips,
          data_composite_count: modalitySummary.dataComposites,
          generation_burden: modalitySummary.generationBurden.toLowerCase(),
          estimated_duration_sec: Math.round(prepared.budgetPolicy.estimatedDurationSec),
          duration_source: prepared.budgetPolicy.durationSource,
          target_placement_min: prepared.budgetPolicy.minimumPlacements,
          target_placement_target: prepared.budgetPolicy.targetPlacements,
          target_placement_max: prepared.budgetPolicy.maximumPlacements,
          default_motion_allowance: prepared.budgetPolicy.defaultMotionAllowance,
          visual_cadence_sec_per_placement: activatedMap.entries.length > 0
            ? Math.round(prepared.budgetPolicy.estimatedDurationSec / activatedMap.entries.length)
            : null,
        },
        baseEpisodePackage: prepared.episodePackage,
      });
      if (!args.operationAuthority.isCurrent(operation)) return false;
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
      if (!args.operationAuthority.isCurrent(operation)) return false;
      args.setMediaMapSaveError("Unable to build and apply the Episode Visual Plan.");
      args.setMediaMapSaveState("error");
      return false;
    } finally {
      if (args.operationAuthority.isCurrent(operation)) args.setIsMediaMapBusy(false);
    }
  }, [args]);

  return {
    onGenerateEpisodeMediaMapFromPlans,
    onBuildAndApplyMediaMapFromConversation,
  };
}
