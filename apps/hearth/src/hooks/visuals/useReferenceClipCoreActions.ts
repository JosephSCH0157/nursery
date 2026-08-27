import { useCallback } from "react";
import {
  buildReferenceClipImageMapBridgeEntry,
  createReferenceClipPlan,
  inferReferenceClipSuitabilitySignals,
  resolveReferenceClipSourceImageEntry,
} from "../../lib/hearth-reference-clip-plan";
import { resolveImageMapAnchorContext, resolveImageMapScriptAnchorFromText } from "../../lib/hearth-image-map-beats";
import { advanceExternalRequestTracker } from "../../lib/hearth-visual-actionability";
import { normalizeHearthVisualStyle } from "../../lib/hearth-visual-styles";
import { generateWorkpieceImageMapCandidates } from "../../lib/hearth-image-map-repo";
import { resolveBulletBeatContext } from "../../lib/hearth-spoken-beats";
import { resolveAiThumbnailAutoApproveFromStorage } from "../../lib/hearth-chat-api";
import type {
  EpisodeBrollAssetCandidate,
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
import type { HearthOperationAuthority } from "../../lib/hearth-operation-authority";

type PersistReferenceClipPlanResult =
  | { ok: true; episodePackage: EpisodePackageV2 }
  | { ok: false; error: string };

type UseReferenceClipCoreActionsArgs = {
  operationAuthority: HearthOperationAuthority;
  episodePackage: EpisodePackageV2 | null;
  workpieceId: string | null;
  workspaceId: string | null;
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
  persistImageMapEntries: (args: {
    entries: EpisodeImageMapEntry[];
    spokenBeats?: EpisodePackageV2["spoken_beats"] | null;
    skipOptimisticConflictCheck?: boolean;
  }) => Promise<
    | { ok: true; episodePackage: EpisodePackageV2; metadataUpdatedAt: string | null }
    | { ok: false; error: string }
  >;
  readCanonicalScriptForImageMapGeneration: () => Promise<
    | { ok: true; text: string; source: "approved_script"; includesUnsavedLocalEdits: boolean }
    | { ok: false; message: string }
  >;
};

function dedupeReferenceClipCandidates(
  candidates: EpisodeBrollAssetCandidate[] | null | undefined,
): EpisodeBrollAssetCandidate[] {
  if (!candidates?.length) return [];
  const seen = new Set<string>();
  const deduped: EpisodeBrollAssetCandidate[] = [];
  for (const candidate of candidates) {
    const normalizedPath = candidate.path?.trim()?.toLowerCase() ?? "";
    const normalizedSourceUrl = candidate.source_url?.trim()?.toLowerCase() ?? "";
    const normalizedLabel = candidate.label?.trim()?.toLowerCase() ?? "";
    const dedupeKey = [
      normalizedPath || normalizedSourceUrl || (candidate.asset_id?.trim() ?? ""),
      normalizedLabel,
    ].join("|");
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    deduped.push(candidate);
  }
  return deduped;
}

export function useReferenceClipCoreActions(args: UseReferenceClipCoreActionsArgs) {
  const buildReferenceClipEntryFromDraft = useCallback((
    entry: EpisodeContextualDataCompositePlan,
  ): EpisodeContextualDataCompositePlan => ({
    ...entry,
    anchor_text: args.referenceClipAnchorDraft.trim() || entry.anchor_text,
    placement_hint: (args.referenceClipPlacementHintDraft.trim() || "first_occurrence") as EpisodeContextualDataCompositePlan["placement_hint"],
    format: (args.referenceClipFormatDraft.trim() || "still") as EpisodeReferenceClipFormat,
    data_type: (args.referenceClipDataTypeDraft.trim() || "quantitative") as EpisodeReferenceClipDataType,
    context_type: (args.referenceClipContextTypeDraft.trim() || "historical") as EpisodeReferenceClipContextType,
    tone: (args.referenceClipToneDraft.trim() || "neutral") as EpisodeReferenceClipTone,
    motion_level: (args.referenceClipMotionLevelDraft.trim() || "static") as EpisodeReferenceClipMotionLevel,
    description: args.referenceClipDescriptionDraft.trim() || entry.description,
    background_context_description: args.referenceClipBackgroundContextDraft.trim(),
    foreground_data_description: args.referenceClipForegroundDataDraft.trim(),
    visual_style: normalizeHearthVisualStyle(args.referenceClipVisualStyleDraft),
    chart_type: (args.referenceClipChartTypeDraft.trim() || "line") as EpisodeReferenceClipChartType,
    title: args.referenceClipTitleDraft.trim() || null,
    labels: args.referenceClipLabelsDraft
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    values: args.resolveReferenceClipValuesFromDraft(),
    emphasis_key: args.referenceClipEmphasisKeyDraft.trim() || null,
    source_type: args.referenceClipSourceTypeDraft as EpisodeContextualDataCompositePlan["source_type"],
    external_request: advanceExternalRequestTracker(
      entry.external_request,
      entry.external_request?.state ?? "planned",
      {
        providerId: args.referenceClipProviderIdDraft,
        sourceUrl: args.referenceClipSourceUrlDraft,
        providerNote: args.referenceClipProviderNoteDraft,
        usageNote: args.referenceClipUsageNoteDraft,
        resultMetadata: args.referenceClipResultMetadataDraft,
        attachedAssetId: entry.selected_asset_id ?? null,
      },
    ),
    origin: args.referenceClipSourceTypeDraft === "hammer_upload" && entry.origin === "hearth"
      ? "mixed"
      : entry.origin,
    updated_at: new Date().toISOString(),
  }), [args]);

  const runReferenceClipForgeGeneration = useCallback(async (
    referenceClipEntry: EpisodeContextualDataCompositePlan,
    baseEpisodePackage: EpisodePackageV2,
    options: {
      confirmSpend: boolean;
      alwaysApproveAiSpend: boolean;
    },
  ): Promise<boolean> => {
    const episodeId = args.workpieceId?.trim() ?? "";
    const workspace = args.workspaceId?.trim() ?? "";
    if (!episodeId || !workspace) {
      args.setReferenceClipSaveError("Select an Episode before generating Reference Clip images.");
      args.setReferenceClipSaveState("error");
      return false;
    }
    const operation = args.operationAuthority.begin("reference-clip.generate");

    const sourceImageEntry = resolveReferenceClipSourceImageEntry({
      entry: referenceClipEntry,
      imageMapEntries: baseEpisodePackage.image_map.entries,
      selectedImageMapEntry: args.selectedImageMapEntry,
    });

    let canonicalScriptText: string | null = null;
    let scriptAnchor = sourceImageEntry?.script_anchor ?? null;
    const beatAnchor = sourceImageEntry?.beat_anchor ?? null;

    if (!scriptAnchor || sourceImageEntry?.script_anchor) {
      const canonicalScript = await args.readCanonicalScriptForImageMapGeneration();
      if (!args.operationAuthority.isCurrent(operation)) return false;
      if (canonicalScript.ok) {
        canonicalScriptText = canonicalScript.text;
        if (!scriptAnchor) {
          scriptAnchor = resolveImageMapScriptAnchorFromText(
            canonicalScript.text,
            referenceClipEntry.anchor_text,
            referenceClipEntry.placement_hint,
          ) ?? resolveImageMapScriptAnchorFromText(
            canonicalScript.text,
            referenceClipEntry.description,
            referenceClipEntry.placement_hint,
          ) ?? resolveImageMapScriptAnchorFromText(
            canonicalScript.text,
            referenceClipEntry.foreground_data_description,
            referenceClipEntry.placement_hint,
          ) ?? resolveImageMapScriptAnchorFromText(
            canonicalScript.text,
            referenceClipEntry.background_context_description,
            referenceClipEntry.placement_hint,
          );
        }
      } else if (!beatAnchor) {
        args.setReferenceClipSaveError(canonicalScript.message);
        args.setReferenceClipSaveState("error");
        return false;
      }
    }

    if (!scriptAnchor && !beatAnchor) {
      args.setReferenceClipSaveError(
        "Forge could not find this reference clip in the canonical script. Select the matching Timeline Image beat or use a script phrase that exists verbatim.",
      );
      args.setReferenceClipSaveState("error");
      return false;
    }

    const tempImageEntryId = `rc_temp_${referenceClipEntry.id}`;
    const bridgeEntry = buildReferenceClipImageMapBridgeEntry({
      entry: referenceClipEntry,
      tempEntryId: tempImageEntryId,
      beatOrder: Math.max(1, baseEpisodePackage.image_map.entries.length + 1),
      sourceEntry: sourceImageEntry,
      scriptAnchor,
      beatAnchor,
    });

    let contextBefore: string | null = null;
    let contextAfter: string | null = null;
    if (scriptAnchor && canonicalScriptText) {
      const anchorContext = resolveImageMapAnchorContext(canonicalScriptText, scriptAnchor);
      contextBefore = anchorContext.before;
      contextAfter = anchorContext.after;
    } else if (beatAnchor) {
      const beatContext = resolveBulletBeatContext({
        spokenBeats: baseEpisodePackage.spoken_beats,
        beatAnchor,
      });
      contextBefore = beatContext.before;
      contextAfter = beatContext.after;
    }

    args.setIsReferenceClipBusy(true);
    args.setReferenceClipSaveState("saving");
    args.setReferenceClipSaveError(null);

    try {
      const withTempImageMap = await args.persistImageMapEntries({
        entries: [
          ...baseEpisodePackage.image_map.entries.filter((entry) => entry.id !== tempImageEntryId),
          bridgeEntry,
        ],
        spokenBeats: baseEpisodePackage.spoken_beats,
        skipOptimisticConflictCheck: true,
      });
      if (!args.operationAuthority.isCurrent(operation)) return false;
      if (!withTempImageMap.ok) {
        args.setReferenceClipSaveError(withTempImageMap.error);
        args.setReferenceClipSaveState("error");
        return false;
      }

      const generated = await generateWorkpieceImageMapCandidates({
        workpieceId: episodeId,
        workspaceId: workspace,
        imageMapEntryId: tempImageEntryId,
        contextBefore,
        contextAfter,
        aspect: "16:9",
        confirmSpend: options.confirmSpend,
        alwaysApproveAiSpend: options.alwaysApproveAiSpend,
      });
      if (!args.operationAuthority.isCurrent(operation)) return false;

      const cleanedImageMapEntries = withTempImageMap.episodePackage.image_map.entries.filter((entry) => entry.id !== tempImageEntryId);
      const cleanedImageMap = await args.persistImageMapEntries({
        entries: cleanedImageMapEntries,
        spokenBeats: withTempImageMap.episodePackage.spoken_beats,
        skipOptimisticConflictCheck: true,
      });
      if (!args.operationAuthority.isCurrent(operation)) return false;
      if (!cleanedImageMap.ok) {
        args.setReferenceClipSaveState("saved");
        args.setReferenceClipMessage("Reference Clip generation finished, but the temporary bridge beat cleanup needs a refresh.");
        return false;
      }

      if (!generated.ok) {
        args.setReferenceClipSaveState("saved");
        args.setReferenceClipMessage(generated.error ?? "Reference Clip generation failed. Try again after saving the latest script anchor.");
        return false;
      }

      const generatedAt = new Date().toISOString();
      const generatedCandidates = generated.generatedAssets.map((asset) => ({
        asset_id: asset.id,
        source: "hearth_ai" as const,
        asset_class: "reference_clip" as const,
        source_beat_id: referenceClipEntry.id,
        source_label: `Forge · ${asset.provider}`,
        source_url: asset.path,
        label: asset.variantLabel,
        path: asset.path,
        mime_type: asset.mimeType,
        created_at: generatedAt,
      }));
      const dedupedGeneratedCandidates = dedupeReferenceClipCandidates(generatedCandidates);
      if (!dedupedGeneratedCandidates.length) {
        args.setReferenceClipSaveError("Forge returned duplicate or unusable candidates only. Try generating again.");
        args.setReferenceClipSaveState("error");
        return false;
      }
      const selectedGeneratedAssetId = dedupedGeneratedCandidates[0]?.asset_id ?? null;
      const preservedCandidates = (referenceClipEntry.candidate_assets ?? []).filter((asset) => asset.source !== "hearth_ai");
      const mergedCandidates = dedupeReferenceClipCandidates([...preservedCandidates, ...dedupedGeneratedCandidates]);
      const nextGeneratedEntry: EpisodeContextualDataCompositePlan = {
        ...referenceClipEntry,
        source_type: "hearth_ai",
        candidate_assets: mergedCandidates,
        selected_asset_id: selectedGeneratedAssetId,
        external_request: advanceExternalRequestTracker(referenceClipEntry.external_request, "resolved", {
          providerId: "forge",
          attachedAssetId: selectedGeneratedAssetId,
        }),
        updated_at: generatedAt,
      };
      const generatedPlan: EpisodeReferenceClipPlan = {
        ...cleanedImageMap.episodePackage.cdc_plan,
        version: Math.max(1, cleanedImageMap.episodePackage.cdc_plan.version + 1),
        entries: cleanedImageMap.episodePackage.cdc_plan.entries.map((entry) => (
          entry.id === referenceClipEntry.id ? nextGeneratedEntry : entry
        )),
        generated_at: generatedAt,
      };
      const generatedSaved = await args.persistReferenceClipPlan({
        plan: generatedPlan,
        eventName: "hearth.cdc_plan.generated_in_forge.v1",
        eventPayload: {
          cdc_id: referenceClipEntry.id,
          generated_asset_count: dedupedGeneratedCandidates.length,
          duplicate_asset_count: Math.max(0, generatedCandidates.length - dedupedGeneratedCandidates.length),
        },
        baseEpisodePackage: cleanedImageMap.episodePackage,
      });
      if (!args.operationAuthority.isCurrent(operation)) return false;
      if (!generatedSaved.ok) {
        args.setReferenceClipSaveState("saved");
        args.setReferenceClipMessage("Reference Clip images generated, but the canonical clip update failed.");
        return false;
      }

      args.setReferenceClipSaveState("saved");
      const duplicateCount = Math.max(0, generatedCandidates.length - dedupedGeneratedCandidates.length);
      args.setReferenceClipMessage(
        duplicateCount > 0
          ? `Reference Clip generated in Forge (${dedupedGeneratedCandidates.length} usable candidate${dedupedGeneratedCandidates.length === 1 ? "" : "s"}, ${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"} removed).`
          : `Reference Clip generated in Forge (${dedupedGeneratedCandidates.length} candidate${dedupedGeneratedCandidates.length === 1 ? "" : "s"}).`,
      );
      return true;
    } catch {
      if (!args.operationAuthority.isCurrent(operation)) return false;
      args.setReferenceClipSaveError("Unable to generate this Reference Clip in Forge.");
      args.setReferenceClipSaveState("error");
      return false;
    } finally {
      if (args.operationAuthority.isCurrent(operation)) args.setIsReferenceClipBusy(false);
    }
  }, [args]);

  const onCreateReferenceClipEntry = useCallback(async () => {
    if (args.isReferenceClipBusy) return;
    if (!args.episodePackage) return;
    const episodeId = args.workpieceId?.trim() ?? "";
    if (!episodeId) {
      args.setReferenceClipSaveError("Select an Episode before creating Reference Clips.");
      args.setReferenceClipSaveState("error");
      return;
    }
    const operation = args.operationAuthority.begin("reference-clip.create");
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
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (!saved.ok) {
        args.setReferenceClipSaveError(saved.error);
        args.setReferenceClipSaveState("error");
        return;
      }
      const alwaysApproveAiSpend = resolveAiThumbnailAutoApproveFromStorage();
      const confirmSpend = alwaysApproveAiSpend
        ? true
        : window.confirm("Generate this Reference Clip inside Forge now? This will spend AI credits.");
      args.setSelectedReferenceClipEntryId(created.id);
      if (!confirmSpend) {
        args.setReferenceClipSaveState("saved");
        args.setReferenceClipMessage("Reference Clip created. Generation skipped.");
        return;
      }
      await runReferenceClipForgeGeneration(created, saved.episodePackage, {
        confirmSpend,
        alwaysApproveAiSpend,
      });
      if (!args.operationAuthority.isCurrent(operation)) return;
    } catch {
      if (!args.operationAuthority.isCurrent(operation)) return;
      args.setReferenceClipSaveError("Unable to create this reference clip.");
      args.setReferenceClipSaveState("error");
    } finally {
      if (args.operationAuthority.isCurrent(operation)) args.setIsReferenceClipBusy(false);
    }
  }, [args]);

  const onSaveReferenceClipEntry = useCallback(async () => {
    if (!args.episodePackage || !args.selectedReferenceClipEntry) return;
    if (args.isReferenceClipBusy) return;
    const operation = args.operationAuthority.begin("reference-clip.save");
    const nextEntry = buildReferenceClipEntryFromDraft(args.selectedReferenceClipEntry);
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
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (!saved.ok) {
        args.setReferenceClipSaveError(saved.error);
        args.setReferenceClipSaveState("error");
        return;
      }
      args.setReferenceClipSaveState("saved");
      args.setReferenceClipMessage("Reference Clip saved.");
    } catch {
      if (!args.operationAuthority.isCurrent(operation)) return;
      args.setReferenceClipSaveError("Unable to save this reference clip.");
      args.setReferenceClipSaveState("error");
    } finally {
      if (args.operationAuthority.isCurrent(operation)) args.setIsReferenceClipBusy(false);
    }
  }, [args, buildReferenceClipEntryFromDraft]);

  const onDeleteReferenceClipEntry = useCallback(async () => {
    if (!args.episodePackage || !args.selectedReferenceClipEntry) return;
    if (args.isReferenceClipBusy) return;
    const confirmed = window.confirm("Delete this Reference Clip?");
    if (!confirmed) return;
    const operation = args.operationAuthority.begin("reference-clip.delete");
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
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (!saved.ok) {
        args.setReferenceClipSaveError(saved.error);
        args.setReferenceClipSaveState("error");
        return;
      }
      args.setSelectedReferenceClipEntryId(nextEntries[0]?.id ?? null);
      args.setReferenceClipSaveState("saved");
      args.setReferenceClipMessage("Reference Clip removed.");
    } catch {
      if (!args.operationAuthority.isCurrent(operation)) return;
      args.setReferenceClipSaveError("Unable to delete this reference clip.");
      args.setReferenceClipSaveState("error");
    } finally {
      if (args.operationAuthority.isCurrent(operation)) args.setIsReferenceClipBusy(false);
    }
  }, [args]);

  const onGenerateReferenceClipInForge = useCallback(async () => {
    if (!args.episodePackage || !args.selectedReferenceClipEntry) return;
    if (args.isReferenceClipBusy) return;
    const alwaysApproveAiSpend = resolveAiThumbnailAutoApproveFromStorage();
    const confirmSpend = alwaysApproveAiSpend
      ? true
      : window.confirm("Generate this Reference Clip inside Forge now? This will spend AI credits.");
    if (!confirmSpend) return;
    const nextEntry = buildReferenceClipEntryFromDraft(args.selectedReferenceClipEntry);
    await runReferenceClipForgeGeneration(nextEntry, args.episodePackage, {
      confirmSpend,
      alwaysApproveAiSpend,
    });
  }, [args, buildReferenceClipEntryFromDraft, runReferenceClipForgeGeneration]);

  const onRegenerateReferenceClipEntryStub = useCallback(async () => {
    if (!args.episodePackage || !args.selectedReferenceClipEntry) return;
    if (args.isReferenceClipBusy) return;
    const operation = args.operationAuthority.begin("reference-clip.guidance.regenerate");
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
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (!saved.ok) {
        args.setReferenceClipSaveError(saved.error);
        args.setReferenceClipSaveState("error");
        return;
      }
      args.setReferenceClipSaveState("saved");
      args.setReferenceClipMessage("Reference Clip guidance refreshed.");
    } catch {
      if (!args.operationAuthority.isCurrent(operation)) return;
      args.setReferenceClipSaveError("Unable to regenerate reference clip guidance.");
      args.setReferenceClipSaveState("error");
    } finally {
      if (args.operationAuthority.isCurrent(operation)) args.setIsReferenceClipBusy(false);
    }
  }, [args]);

  return {
    onCreateReferenceClipEntry,
    onSaveReferenceClipEntry,
    onDeleteReferenceClipEntry,
    onGenerateReferenceClipInForge,
    onRegenerateReferenceClipEntryStub,
  };
}
