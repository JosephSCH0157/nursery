import { useCallback } from "react";
import { buildBrollPlanFromScript, regenerateBrollBeatFromDescription } from "../../lib/hearth-broll-plan";
import { advanceExternalRequestTracker } from "../../lib/hearth-visual-actionability";
import type { EpisodeBrollPlan, EpisodeBrollPlanBeat, EpisodePackageV2 } from "../../lib/episode-package-v2";
import type { HearthOperationAuthority } from "../../lib/hearth-operation-authority";

type PersistBrollPlanResult =
  | { ok: true; episodePackage: EpisodePackageV2 }
  | { ok: false; error: string };

type UseBrollCoreActionsArgs = {
  operationAuthority: HearthOperationAuthority;
  isApprovingScript: boolean;
  isAiProcessing: boolean;
  isBrollBusy: boolean;
  episodePackage: EpisodePackageV2 | null;
  workpieceId: string | null;
  selectedBrollBeat: EpisodeBrollPlanBeat | null;
  brollMotionIntentDraft: string;
  brollDescriptionDraft: string;
  brollAnchorDraft: string;
  brollAssetCategoryDraft: EpisodeBrollPlanBeat["asset_category"];
  brollPriorityDraft: string;
  brollKeywordsDraft: string;
  brollMoodDraft: string;
  brollShotTypeDraft: string;
  brollMotionSuggestionDraft: string;
  brollSuggestedDurationDraft: string;
  brollPlacementHintDraft: string;
  brollProviderIdDraft: string;
  brollSourceUrlDraft: string;
  brollProviderNoteDraft: string;
  brollUsageNoteDraft: string;
  brollResultMetadataDraft: string;
  setIsBrollBusy: (next: boolean) => void;
  setBrollSaveState: (next: "saved" | "editing" | "saving" | "error" | "offline") => void;
  setBrollSaveError: (next: string | null) => void;
  setBrollMessage: (next: string | null) => void;
  setSelectedBrollBeatId: (next: string | null) => void;
  readCanonicalScriptForImageMapGeneration: () => Promise<
    | { ok: true; text: string; source: "approved_script"; includesUnsavedLocalEdits: boolean }
    | { ok: false; message: string }
  >;
  resolveBrollDataVisualSpecFromDraft: (nextMotionIntent: EpisodeBrollPlanBeat["motion_intent"]) => EpisodeBrollPlanBeat["data_visual_spec"];
  persistBrollPlan: (args: {
    plan: EpisodeBrollPlan;
    eventName: string;
    eventPayload: Record<string, unknown>;
    baseEpisodePackage?: EpisodePackageV2;
  }) => Promise<PersistBrollPlanResult>;
};

export function useBrollCoreActions(args: UseBrollCoreActionsArgs) {
  const onGenerateBrollPlan = useCallback(async () => {
    if (args.isApprovingScript || args.isAiProcessing || args.isBrollBusy) return;
    if (!args.episodePackage) return;
    const operation = args.operationAuthority.begin("broll.plan.generate");
    const canonicalScript = await args.readCanonicalScriptForImageMapGeneration();
    if (!args.operationAuthority.isCurrent(operation)) return;
    if (!canonicalScript.ok) {
      args.setBrollSaveError(canonicalScript.message);
      args.setBrollSaveState("error");
      return;
    }
    const episodeId = args.workpieceId?.trim() ?? "";
    if (!episodeId) {
      args.setBrollSaveError("Select an Episode before generating a B-roll plan.");
      args.setBrollSaveState("error");
      return;
    }
    args.setIsBrollBusy(true);
    args.setBrollSaveState("saving");
    args.setBrollSaveError(null);
    try {
      const plan = buildBrollPlanFromScript({
        workpieceId: episodeId,
        scriptText: canonicalScript.text,
        previousPlan: args.episodePackage.broll_plan,
      });
      const saved = await args.persistBrollPlan({
        plan,
        eventName: "hearth.broll_plan.generated.v1",
        eventPayload: {
          beat_count: plan.beats.length,
          coverage_strength: plan.coverage_strength ?? null,
          source: canonicalScript.source,
        },
      });
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (!saved.ok) {
        args.setBrollSaveError(saved.error);
        args.setBrollSaveState("error");
        return;
      }
      args.setSelectedBrollBeatId(plan.beats[0]?.id ?? null);
      args.setBrollSaveState("saved");
      args.setBrollMessage(`Generated ${plan.beats.length} B-roll beats from the canonical script.`);
    } finally {
      if (args.operationAuthority.isCurrent(operation)) args.setIsBrollBusy(false);
    }
  }, [args]);

  const onSaveBrollBeat = useCallback(async () => {
    if (!args.episodePackage || !args.selectedBrollBeat) return;
    if (args.isBrollBusy) return;
    const operation = args.operationAuthority.begin("broll.beat.save");
    const nextMotionIntent = args.brollMotionIntentDraft as EpisodeBrollPlanBeat["motion_intent"];
    const nextDataVisualSpec = args.resolveBrollDataVisualSpecFromDraft(nextMotionIntent);
    const nextKeywords = args.brollKeywordsDraft
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    const nextBeat: EpisodeBrollPlanBeat = {
      ...args.selectedBrollBeat,
      anchor_text: args.brollAnchorDraft.trim(),
      description: args.brollDescriptionDraft.trim(),
      motion_intent: nextMotionIntent,
      asset_category: args.brollAssetCategoryDraft,
      priority: args.brollPriorityDraft as EpisodeBrollPlanBeat["priority"],
      keywords: nextKeywords,
      mood: args.brollMoodDraft.trim() || null,
      shot_type: (args.brollShotTypeDraft.trim() || "mixed") as EpisodeBrollPlanBeat["shot_type"],
      motion_suggestion: args.brollMotionSuggestionDraft.trim() || null,
      suggested_duration_ms: Number.isFinite(Number(args.brollSuggestedDurationDraft))
        ? Math.max(0, Math.trunc(Number(args.brollSuggestedDurationDraft)))
        : null,
      data_visual_spec: nextDataVisualSpec,
      placement_hint: (args.brollPlacementHintDraft.trim() || "first_occurrence") as EpisodeBrollPlanBeat["placement_hint"],
      external_request: advanceExternalRequestTracker(
        args.selectedBrollBeat.external_request,
        args.selectedBrollBeat.external_request?.state ?? "planned",
        {
          providerId: args.brollProviderIdDraft,
          sourceUrl: args.brollSourceUrlDraft,
          providerNote: args.brollProviderNoteDraft,
          usageNote: args.brollUsageNoteDraft,
          resultMetadata: args.brollResultMetadataDraft,
          attachedAssetId: args.selectedBrollBeat.selected_asset_id ?? null,
        },
      ),
      updated_at: new Date().toISOString(),
      fulfillment_state: args.selectedBrollBeat.selected_asset_id ? "stale" : args.selectedBrollBeat.fulfillment_state,
    };
    const nextPlan: EpisodeBrollPlan = {
      ...args.episodePackage.broll_plan,
      version: Math.max(1, args.episodePackage.broll_plan.version + 1),
      beats: args.episodePackage.broll_plan.beats.map((beat) => (beat.id === args.selectedBrollBeat?.id ? nextBeat : beat)),
      generated_at: new Date().toISOString(),
    };
    args.setIsBrollBusy(true);
    args.setBrollSaveState("saving");
    args.setBrollSaveError(null);
    try {
      const saved = await args.persistBrollPlan({
        plan: nextPlan,
        eventName: "hearth.broll_plan.beat_updated.v1",
        eventPayload: { beat_id: args.selectedBrollBeat.id },
      });
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (!saved.ok) {
        args.setBrollSaveError(saved.error);
        args.setBrollSaveState("error");
        return;
      }
      args.setBrollSaveState("saved");
      args.setBrollMessage("B-roll beat saved.");
    } catch {
      if (!args.operationAuthority.isCurrent(operation)) return;
      args.setBrollSaveError("Unable to save this B-roll beat.");
      args.setBrollSaveState("error");
    } finally {
      if (args.operationAuthority.isCurrent(operation)) args.setIsBrollBusy(false);
    }
  }, [args]);

  const onDeleteBrollBeat = useCallback(async () => {
    if (!args.episodePackage || !args.selectedBrollBeat) return;
    if (args.isBrollBusy) return;
    const confirmed = window.confirm("Delete this B-roll beat?");
    if (!confirmed) return;
    const operation = args.operationAuthority.begin("broll.beat.delete");
    const nextBeats = args.episodePackage.broll_plan.beats.filter((beat) => beat.id !== args.selectedBrollBeat?.id);
    const nextPlan: EpisodeBrollPlan = {
      ...args.episodePackage.broll_plan,
      version: Math.max(1, args.episodePackage.broll_plan.version + 1),
      beats: nextBeats,
      generated_at: new Date().toISOString(),
    };
    args.setIsBrollBusy(true);
    args.setBrollSaveState("saving");
    args.setBrollSaveError(null);
    try {
      const saved = await args.persistBrollPlan({
        plan: nextPlan,
        eventName: "hearth.broll_plan.beat_deleted.v1",
        eventPayload: { beat_id: args.selectedBrollBeat.id },
      });
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (!saved.ok) {
        args.setBrollSaveError(saved.error);
        args.setBrollSaveState("error");
        return;
      }
      args.setSelectedBrollBeatId(nextBeats[0]?.id ?? null);
      args.setBrollSaveState("saved");
      args.setBrollMessage("B-roll beat removed.");
    } catch {
      if (!args.operationAuthority.isCurrent(operation)) return;
      args.setBrollSaveError("Unable to delete this B-roll beat.");
      args.setBrollSaveState("error");
    } finally {
      if (args.operationAuthority.isCurrent(operation)) args.setIsBrollBusy(false);
    }
  }, [args]);

  const onRegenerateBrollBeat = useCallback(async () => {
    if (!args.episodePackage || !args.selectedBrollBeat) return;
    if (args.isBrollBusy) return;
    const operation = args.operationAuthority.begin("broll.beat.regenerate");
    const regenerated = regenerateBrollBeatFromDescription({
      ...args.selectedBrollBeat,
      description: args.brollDescriptionDraft.trim() || args.selectedBrollBeat.description,
    });
    const nextPlan: EpisodeBrollPlan = {
      ...args.episodePackage.broll_plan,
      version: Math.max(1, args.episodePackage.broll_plan.version + 1),
      beats: args.episodePackage.broll_plan.beats.map((beat) => (beat.id === args.selectedBrollBeat?.id ? regenerated : beat)),
      generated_at: new Date().toISOString(),
    };
    args.setIsBrollBusy(true);
    args.setBrollSaveState("saving");
    args.setBrollSaveError(null);
    try {
      const saved = await args.persistBrollPlan({
        plan: nextPlan,
        eventName: "hearth.broll_plan.beat_regenerated.v1",
        eventPayload: { beat_id: args.selectedBrollBeat.id },
      });
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (!saved.ok) {
        args.setBrollSaveError(saved.error);
        args.setBrollSaveState("error");
        return;
      }
      args.setBrollSaveState("saved");
      args.setBrollMessage("B-roll beat regenerated.");
    } catch {
      if (!args.operationAuthority.isCurrent(operation)) return;
      args.setBrollSaveError("Unable to regenerate this B-roll beat.");
      args.setBrollSaveState("error");
    } finally {
      if (args.operationAuthority.isCurrent(operation)) args.setIsBrollBusy(false);
    }
  }, [args]);

  return {
    onGenerateBrollPlan,
    onSaveBrollBeat,
    onDeleteBrollBeat,
    onRegenerateBrollBeat,
  };
}
