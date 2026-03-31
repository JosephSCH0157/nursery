import { useCallback } from "react";
import { createReferenceClipPlan, inferReferenceClipSuitabilitySignals } from "../../lib/hearth-reference-clip-plan";
import { advanceExternalRequestTracker } from "../../lib/hearth-visual-actionability";
import { normalizeHearthVisualStyle } from "../../lib/hearth-visual-styles";
import type {
  EpisodeContextualDataCompositePlan,
  EpisodeImageMapEntry,
  EpisodeReferenceClipChartType,
  EpisodeReferenceClipContextType,
  EpisodeReferenceClipDataType,
  EpisodeReferenceClipFormat,
  EpisodeReferenceClipMotionLevel,
  EpisodeReferenceClipPlan,
  EpisodeReferenceClipTone,
  EpisodePackageV2,
} from "../../lib/episode-package-v2";

type PersistReferenceClipPlanResult =
  | { ok: true; episodePackage: EpisodePackageV2 }
  | { ok: false; error: string };

type UseReferenceClipCoreActionsArgs = {
  episodePackage: EpisodePackageV2 | null;
  workpieceId: string | null;
  activeDraftTitle: string | null;
  selectedImageMapEntry: EpisodeImageMapEntry | null;
  selectedBrollBeatAnchorText: string | null;
  selectedReferenceClipEntry: EpisodeContextualDataCompositePlan | null;
  isReferenceClipBusy: boolean;
  referenceClipFormatDraft: string;
  referenceClipAnchorDraft: string;
  referenceClipDescriptionDraft: string;
  referenceClipPlacementHintDraft: string;
  referenceClipDataTypeDraft: string;
  referenceClipContextTypeDraft: string;
  referenceClipToneDraft: string;
  referenceClipMotionLevelDraft: string;
  referenceClipBackgroundContextDraft: string;
  referenceClipForegroundDataDraft: string;
  referenceClipVisualStyleDraft: string;
  referenceClipChartTypeDraft: string;
  referenceClipTitleDraft: string;
  referenceClipLabelsDraft: string;
  referenceClipEmphasisKeyDraft: string;
  referenceClipSourceTypeDraft: string;
  referenceClipProviderIdDraft: string;
  referenceClipSourceUrlDraft: string;
  referenceClipProviderNoteDraft: string;
  referenceClipUsageNoteDraft: string;
  referenceClipResultMetadataDraft: string;
  resolveReferenceClipValuesFromDraft: () => Array<number | string>;
  setIsReferenceClipBusy: (next: boolean) => void;
  setReferenceClipSaveState: (next: "saved" | "editing" | "saving" | "error" | "offline") => void;
  setReferenceClipSaveError: (next: string | null) => void;
  setReferenceClipMessage: (next: string | null) => void;
  setSelectedReferenceClipEntryId: (next: string | null) => void;
  persistReferenceClipPlan: (args: {
    plan: EpisodeReferenceClipPlan;
    eventName: string;
    eventPayload: Record<string, unknown>;
    baseEpisodePackage?: EpisodePackageV2;
  }) => Promise<PersistReferenceClipPlanResult>;
};

export function useReferenceClipCoreActions(args: UseReferenceClipCoreActionsArgs) {
  const onCreateReferenceClipEntry = useCallback(async () => {
    if (args.isReferenceClipBusy) return;
    if (!args.episodePackage) return;
    const episodeId = args.workpieceId?.trim() ?? "";
    if (!episodeId) {
      args.setReferenceClipSaveError("Select an Episode before creating Reference Clips.");
      args.setReferenceClipSaveState("error");
      return;
    }
    const baseAnchor = (
      args.selectedImageMapEntry?.anchor
      || args.selectedBrollBeatAnchorText
      || args.activeDraftTitle
      || "New reference clip"
    ).trim();
    const created = createReferenceClipPlan({
      workpieceId: episodeId,
      anchorText: baseAnchor,
      description: baseAnchor,
      format: (args.referenceClipFormatDraft.trim() || "still") as EpisodeReferenceClipFormat,
    });
    const nextPlan: EpisodeReferenceClipPlan = {
      ...args.episodePackage.cdc_plan,
      version: Math.max(1, args.episodePackage.cdc_plan.version + 1),
      entries: [...args.episodePackage.cdc_plan.entries, created],
      generated_at: new Date().toISOString(),
    };
    args.setIsReferenceClipBusy(true);
    args.setReferenceClipSaveState("saving");
    args.setReferenceClipSaveError(null);
    try {
      const saved = await args.persistReferenceClipPlan({
        plan: nextPlan,
        eventName: "hearth.cdc_plan.entry_created.v1",
        eventPayload: {
          cdc_id: created.id,
          format: created.format,
          data_type: created.data_type,
        },
      });
      if (!saved.ok) {
        args.setReferenceClipSaveError(saved.error);
        args.setReferenceClipSaveState("error");
        return;
      }
      args.setSelectedReferenceClipEntryId(created.id);
      args.setReferenceClipSaveState("saved");
      args.setReferenceClipMessage("Reference Clip created.");
    } catch {
      args.setReferenceClipSaveError("Unable to create this reference clip.");
      args.setReferenceClipSaveState("error");
    } finally {
      args.setIsReferenceClipBusy(false);
    }
  }, [args]);

  const onSaveReferenceClipEntry = useCallback(async () => {
    if (!args.episodePackage || !args.selectedReferenceClipEntry) return;
    if (args.isReferenceClipBusy) return;
    const nextEntry: EpisodeContextualDataCompositePlan = {
      ...args.selectedReferenceClipEntry,
      anchor_text: args.referenceClipAnchorDraft.trim(),
      placement_hint: (args.referenceClipPlacementHintDraft.trim() || "first_occurrence") as EpisodeContextualDataCompositePlan["placement_hint"],
      format: (args.referenceClipFormatDraft.trim() || "still") as EpisodeReferenceClipFormat,
      data_type: (args.referenceClipDataTypeDraft.trim() || "quantitative") as EpisodeReferenceClipDataType,
      context_type: (args.referenceClipContextTypeDraft.trim() || "historical") as EpisodeReferenceClipContextType,
      tone: (args.referenceClipToneDraft.trim() || "neutral") as EpisodeReferenceClipTone,
      motion_level: (args.referenceClipMotionLevelDraft.trim() || "static") as EpisodeReferenceClipMotionLevel,
      description: args.referenceClipDescriptionDraft.trim(),
      background_context_description: args.referenceClipBackgroundContextDraft.trim(),
      foreground_data_description: args.referenceClipForegroundDataDraft.trim(),
      visual_style: normalizeHearthVisualStyle(args.referenceClipVisualStyleDraft),
      chart_type: (args.referenceClipChartTypeDraft.trim() || "line") as EpisodeReferenceClipChartType,
      title: args.referenceClipTitleDraft.trim() || null,
      labels: args.referenceClipLabelsDraft
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
      values: args.resolveReferenceClipValuesFromDraft(),
      emphasis_key: args.referenceClipEmphasisKeyDraft.trim() || null,
      source_type: args.referenceClipSourceTypeDraft as EpisodeContextualDataCompositePlan["source_type"],
      external_request: advanceExternalRequestTracker(
        args.selectedReferenceClipEntry.external_request,
        args.selectedReferenceClipEntry.external_request?.state ?? "planned",
        {
          providerId: args.referenceClipProviderIdDraft,
          sourceUrl: args.referenceClipSourceUrlDraft,
          providerNote: args.referenceClipProviderNoteDraft,
          usageNote: args.referenceClipUsageNoteDraft,
          resultMetadata: args.referenceClipResultMetadataDraft,
          attachedAssetId: args.selectedReferenceClipEntry.selected_asset_id ?? null,
        },
      ),
      origin: args.referenceClipSourceTypeDraft === "hammer_upload" && args.selectedReferenceClipEntry.origin === "hearth"
        ? "mixed"
        : args.selectedReferenceClipEntry.origin,
      updated_at: new Date().toISOString(),
    };
    const nextPlan: EpisodeReferenceClipPlan = {
      ...args.episodePackage.cdc_plan,
      version: Math.max(1, args.episodePackage.cdc_plan.version + 1),
      entries: args.episodePackage.cdc_plan.entries.map((entry) => (entry.id === args.selectedReferenceClipEntry?.id ? nextEntry : entry)),
      generated_at: new Date().toISOString(),
    };
    args.setIsReferenceClipBusy(true);
    args.setReferenceClipSaveState("saving");
    args.setReferenceClipSaveError(null);
    try {
      const saved = await args.persistReferenceClipPlan({
        plan: nextPlan,
        eventName: "hearth.cdc_plan.entry_updated.v1",
        eventPayload: { cdc_id: args.selectedReferenceClipEntry.id },
      });
      if (!saved.ok) {
        args.setReferenceClipSaveError(saved.error);
        args.setReferenceClipSaveState("error");
        return;
      }
      args.setReferenceClipSaveState("saved");
      args.setReferenceClipMessage("Reference Clip saved.");
    } catch {
      args.setReferenceClipSaveError("Unable to save this reference clip.");
      args.setReferenceClipSaveState("error");
    } finally {
      args.setIsReferenceClipBusy(false);
    }
  }, [args]);

  const onDeleteReferenceClipEntry = useCallback(async () => {
    if (!args.episodePackage || !args.selectedReferenceClipEntry) return;
    if (args.isReferenceClipBusy) return;
    const confirmed = window.confirm("Delete this Reference Clip?");
    if (!confirmed) return;
    const nextEntries = args.episodePackage.cdc_plan.entries.filter((entry) => entry.id !== args.selectedReferenceClipEntry?.id);
    const nextPlan: EpisodeReferenceClipPlan = {
      ...args.episodePackage.cdc_plan,
      version: Math.max(1, args.episodePackage.cdc_plan.version + 1),
      entries: nextEntries,
      generated_at: new Date().toISOString(),
    };
    args.setIsReferenceClipBusy(true);
    args.setReferenceClipSaveState("saving");
    args.setReferenceClipSaveError(null);
    try {
      const saved = await args.persistReferenceClipPlan({
        plan: nextPlan,
        eventName: "hearth.cdc_plan.entry_deleted.v1",
        eventPayload: { cdc_id: args.selectedReferenceClipEntry.id },
      });
      if (!saved.ok) {
        args.setReferenceClipSaveError(saved.error);
        args.setReferenceClipSaveState("error");
        return;
      }
      args.setSelectedReferenceClipEntryId(nextEntries[0]?.id ?? null);
      args.setReferenceClipSaveState("saved");
      args.setReferenceClipMessage("Reference Clip removed.");
    } catch {
      args.setReferenceClipSaveError("Unable to delete this reference clip.");
      args.setReferenceClipSaveState("error");
    } finally {
      args.setIsReferenceClipBusy(false);
    }
  }, [args]);

  const onRegenerateReferenceClipEntryStub = useCallback(async () => {
    if (!args.episodePackage || !args.selectedReferenceClipEntry) return;
    if (args.isReferenceClipBusy) return;
    const nextDescription = args.referenceClipDescriptionDraft.trim() || args.selectedReferenceClipEntry.description || args.selectedReferenceClipEntry.anchor_text;
    const signals = inferReferenceClipSuitabilitySignals(nextDescription);
    const inferredDataType: EpisodeReferenceClipDataType = signals.includes("geographic")
      ? "geographic"
      : signals.includes("over_time")
        ? "timeline"
        : signals.includes("comparison")
          ? "comparison"
          : signals.includes("statistics")
            ? "quantitative"
            : "categorical";
    const inferredContextType: EpisodeReferenceClipContextType = signals.includes("geographic") ? "location" : "historical";
    const inferredChartType: EpisodeReferenceClipChartType = inferredDataType === "timeline"
      ? "timeline"
      : inferredDataType === "geographic"
        ? "map"
        : inferredDataType === "comparison"
          ? "comparison"
          : inferredDataType === "categorical"
            ? "bar"
            : "line";
    const nextEntry: EpisodeContextualDataCompositePlan = {
      ...args.selectedReferenceClipEntry,
      description: nextDescription,
      data_type: inferredDataType,
      context_type: inferredContextType,
      chart_type: inferredChartType,
      tone: signals.includes("policy_impact") ? "investigative" : (signals.includes("trend") ? "analytical" : args.selectedReferenceClipEntry.tone),
      motion_level: (args.referenceClipFormatDraft === "animated" || args.referenceClipFormatDraft === "hybrid") ? "full_animation" : "static",
      updated_at: new Date().toISOString(),
    };
    const nextPlan: EpisodeReferenceClipPlan = {
      ...args.episodePackage.cdc_plan,
      version: Math.max(1, args.episodePackage.cdc_plan.version + 1),
      entries: args.episodePackage.cdc_plan.entries.map((entry) => (entry.id === args.selectedReferenceClipEntry?.id ? nextEntry : entry)),
      generated_at: new Date().toISOString(),
    };
    args.setIsReferenceClipBusy(true);
    args.setReferenceClipSaveState("saving");
    args.setReferenceClipSaveError(null);
    try {
      const saved = await args.persistReferenceClipPlan({
        plan: nextPlan,
        eventName: "hearth.cdc_plan.entry_regenerated_stub.v1",
        eventPayload: {
          cdc_id: args.selectedReferenceClipEntry.id,
          signal_count: signals.length,
        },
      });
      if (!saved.ok) {
        args.setReferenceClipSaveError(saved.error);
        args.setReferenceClipSaveState("error");
        return;
      }
      args.setReferenceClipSaveState("saved");
      args.setReferenceClipMessage("Reference Clip guidance refreshed.");
    } catch {
      args.setReferenceClipSaveError("Unable to regenerate reference clip guidance.");
      args.setReferenceClipSaveState("error");
    } finally {
      args.setIsReferenceClipBusy(false);
    }
  }, [args]);

  return {
    onCreateReferenceClipEntry,
    onSaveReferenceClipEntry,
    onDeleteReferenceClipEntry,
    onRegenerateReferenceClipEntryStub,
  };
}
