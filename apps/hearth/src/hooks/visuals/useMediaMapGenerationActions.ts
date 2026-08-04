import { useCallback } from "react";
import {
  resolveMediaMapConversationScope,
  type MediaMapConversationDirectionId,
  type MediaMapGenerationScope,
} from "../../lib/hearth-media-map-conversation";
import type { EpisodeMediaMap, EpisodePackageV2 } from "../../lib/episode-package-v2";
import type { FullMediaBudgetPolicy } from "../../lib/hearth-media-map-builder";
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
  repairImageMapAuthority: () => Promise<{ ok: true } | { ok: false; error: string }>;
  generateUnifiedVisualPlan: (creatorDirection?: string | null) => Promise<
    | { ok: true; data: { imageMapRevision: number; brollPlanRevision: number; referenceClipPlanRevision: number } }
    | { ok: false; error: string; stage: string | null }
  >;
  refreshCanonicalBroll: () => Promise<boolean>;
  notifyCanonicalReferenceClipsChanged: () => void;
};

export function useMediaMapGenerationActions(args: UseMediaMapGenerationActionsArgs) {
  const onGenerateEpisodeMediaMapFromPlans = useCallback(async () => {
    if (!args.episodePackage) return;
    if (args.isMediaMapBusy) return;
    const operation = args.operationAuthority.begin("media-map.generate");
    args.setIsMediaMapBusy(true);
    args.setMediaMapSaveState("saving");
    args.setMediaMapSaveError(null);
    try {
      const generated = await args.generateUnifiedVisualPlan(null);
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (!generated.ok) {
        args.setMediaMapSaveError(`${generated.stage ? `${generated.stage}: ` : ""}${generated.error}`);
        args.setMediaMapSaveState("error");
        return;
      }
      const repaired = await args.repairImageMapAuthority();
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (!repaired.ok) {
        args.setMediaMapSaveError(repaired.error);
        args.setMediaMapSaveState("error");
        return;
      }
      await args.refreshCanonicalBroll();
      args.notifyCanonicalReferenceClipsChanged();
      args.setMediaMapSaveState("saved");
      args.setMediaMapMessage(
        `Canonical Visual Plan verified: Image plan v${generated.data.imageMapRevision}, B-roll plan v${generated.data.brollPlanRevision}, and Reference Clip plan v${generated.data.referenceClipPlanRevision}. Unresolved Reference Clips are ready for Source fulfillment.`,
      );
    } catch (error) {
      if (!args.operationAuthority.isCurrent(operation)) return;
      args.setMediaMapSaveError(error instanceof Error ? error.message : "Unable to create the canonical Episode Visual Plan.");
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
    const operation = args.operationAuthority.begin("media-map.conversation.apply");
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
      const creatorDirection = [conversationArgs.directionId.replaceAll("_", " "), conversationArgs.constraintsText.trim()].filter(Boolean).join(". ");
      const generated = await args.generateUnifiedVisualPlan(creatorDirection);
      if (!args.operationAuthority.isCurrent(operation)) return false;
      if (!generated.ok) {
        args.setMediaMapSaveError(`${generated.stage ? `${generated.stage}: ` : ""}${generated.error}`);
        args.setMediaMapSaveState("error");
        return false;
      }
      const repaired = await args.repairImageMapAuthority();
      if (!args.operationAuthority.isCurrent(operation)) return false;
      if (!repaired.ok) {
        args.setMediaMapSaveError(repaired.error);
        args.setMediaMapSaveState("error");
        return false;
      }
      await args.refreshCanonicalBroll();
      args.notifyCanonicalReferenceClipsChanged();
      args.setMediaMapSaveState("saved");
      args.setMediaMapMessage(
        `Canonical Visual Plan verified from the approved script with producer direction. Image v${generated.data.imageMapRevision}, B-roll v${generated.data.brollPlanRevision}, Reference Clips v${generated.data.referenceClipPlanRevision}.`,
      );
      return true;
    } catch {
      if (!args.operationAuthority.isCurrent(operation)) return false;
      args.setMediaMapSaveError("Unable to build and apply the Episode Visual Plan.");
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
