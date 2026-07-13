import { useCallback } from "react";
import { uploadBrollBeatAsset } from "../../lib/hearth-broll-plan-repo";
import {
  advanceExternalRequestTracker,
  buildReferenceClipBrief,
  createManualResultCandidate,
  formatVisualBriefAsText,
  type ExternalGenerationProvider,
} from "../../lib/hearth-visual-actionability";
import {
  serializePromptPack,
  type PromptPack,
  type ResolvedVisualProvider,
} from "../../lib/hearth-visual-provider-profiles";
import type {
  EpisodeContextualDataCompositePlan,
  EpisodeExternalRequestState,
  EpisodePackageV2,
  EpisodeReferenceClipPlan,
} from "../../lib/episode-package-v2";
import type { HearthOperationAuthority } from "../../lib/hearth-operation-authority";

type PersistReferenceClipPlanResult =
  | { ok: true; episodePackage: EpisodePackageV2 }
  | { ok: false; error: string };

type UseReferenceClipBridgeActionsArgs = {
  operationAuthority: HearthOperationAuthority;
  episodePackage: EpisodePackageV2 | null;
  selectedReferenceClipEntry: EpisodeContextualDataCompositePlan | null;
  activeVisualPromptPackForReferenceClip: {
    provider: ResolvedVisualProvider;
    pack: PromptPack;
  } | null;
  referenceClipProviders: ExternalGenerationProvider[];
  referenceClipProviderIdDraft: string;
  referenceClipSourceUrlDraft: string;
  referenceClipSourceLabelDraft: string;
  referenceClipProviderNoteDraft: string;
  referenceClipUsageNoteDraft: string;
  referenceClipResultMetadataDraft: string;
  referenceClipAnchorDraft: string;
  referenceClipDescriptionDraft: string;
  referenceClipTitleDraft: string;
  workpieceId: string | null;
  activeDraftTitle: string | null;
  isReferenceClipBusy: boolean;
  setIsReferenceClipBusy: (next: boolean) => void;
  setReferenceClipSaveState: (next: "saved" | "editing" | "saving" | "error" | "offline") => void;
  setReferenceClipSaveError: (next: string | null) => void;
  setReferenceClipMessage: (next: string | null) => void;
  writeTextToClipboard: (value: string) => Promise<boolean>;
  downloadTextFile: (args: { text: string; filename: string; mimeType?: string }) => void;
  persistReferenceClipPlan: (args: {
    plan: EpisodeReferenceClipPlan;
    eventName: string;
    eventPayload: Record<string, unknown>;
    baseEpisodePackage?: EpisodePackageV2;
  }) => Promise<PersistReferenceClipPlanResult>;
};

export function useReferenceClipBridgeActions(args: UseReferenceClipBridgeActionsArgs) {
  const onMarkReferenceClipRequestState = useCallback(async (nextState: EpisodeExternalRequestState) => {
    if (!args.episodePackage || !args.selectedReferenceClipEntry) return;
    const operation = args.operationAuthority.begin("reference-clip.request-state.update");
    const nextEntry: EpisodeContextualDataCompositePlan = {
      ...args.selectedReferenceClipEntry,
      external_request: advanceExternalRequestTracker(args.selectedReferenceClipEntry.external_request, nextState, {
        providerId: args.referenceClipProviderIdDraft,
        sourceUrl: args.referenceClipSourceUrlDraft,
        providerNote: args.referenceClipProviderNoteDraft,
        usageNote: args.referenceClipUsageNoteDraft,
        resultMetadata: args.referenceClipResultMetadataDraft,
        attachedAssetId: args.selectedReferenceClipEntry.selected_asset_id ?? null,
      }),
      updated_at: new Date().toISOString(),
    };
    const nextPlan: EpisodeReferenceClipPlan = {
      ...args.episodePackage.cdc_plan,
      version: Math.max(1, args.episodePackage.cdc_plan.version + 1),
      entries: args.episodePackage.cdc_plan.entries.map((entry) => (entry.id === args.selectedReferenceClipEntry?.id ? nextEntry : entry)),
      generated_at: new Date().toISOString(),
    };
    const saved = await args.persistReferenceClipPlan({
      plan: nextPlan,
      eventName: "hearth.cdc_plan.request_state.updated.v1",
      eventPayload: { cdc_id: args.selectedReferenceClipEntry.id, request_state: nextState },
    });
    if (!args.operationAuthority.isCurrent(operation)) return;
    if (!saved.ok) {
      args.setReferenceClipSaveError(saved.error);
      args.setReferenceClipSaveState("error");
      return;
    }
    args.setReferenceClipSaveState("saved");
  }, [args]);

  const onClearReferenceClipRequestState = useCallback(async () => {
    if (!args.episodePackage || !args.selectedReferenceClipEntry) return;
    const operation = args.operationAuthority.begin("reference-clip.request-state.clear");
    const nextEntry: EpisodeContextualDataCompositePlan = {
      ...args.selectedReferenceClipEntry,
      external_request: {
        state: "planned",
        updated_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    };
    const nextPlan: EpisodeReferenceClipPlan = {
      ...args.episodePackage.cdc_plan,
      version: Math.max(1, args.episodePackage.cdc_plan.version + 1),
      entries: args.episodePackage.cdc_plan.entries.map((entry) => (entry.id === args.selectedReferenceClipEntry?.id ? nextEntry : entry)),
      generated_at: new Date().toISOString(),
    };
    const saved = await args.persistReferenceClipPlan({
      plan: nextPlan,
      eventName: "hearth.cdc_plan.request_state.cleared.v1",
      eventPayload: { cdc_id: args.selectedReferenceClipEntry.id },
    });
    if (!args.operationAuthority.isCurrent(operation)) return;
    if (!saved.ok) {
      args.setReferenceClipSaveError(saved.error);
      args.setReferenceClipSaveState("error");
      return;
    }
    args.setReferenceClipSaveState("saved");
    args.setReferenceClipMessage("Request state cleared.");
  }, [args]);

  const onCopyReferenceClipPrompt = useCallback(async () => {
    if (!args.episodePackage || !args.selectedReferenceClipEntry || !args.activeVisualPromptPackForReferenceClip) return false;
    const operation = args.operationAuthority.begin("reference-clip.prompt.copy");
    const copied = await args.writeTextToClipboard(args.activeVisualPromptPackForReferenceClip.pack.prompt);
    if (!args.operationAuthority.isCurrent(operation)) return false;
    if (!copied) {
      args.setReferenceClipSaveError("Unable to copy prompt to clipboard.");
      args.setReferenceClipSaveState("error");
      return false;
    }
    const nextEntry: EpisodeContextualDataCompositePlan = {
      ...args.selectedReferenceClipEntry,
      external_request: advanceExternalRequestTracker(args.selectedReferenceClipEntry.external_request, "brief_exported", {
        providerId: args.referenceClipProviderIdDraft,
        sourceUrl: args.referenceClipSourceUrlDraft,
        providerNote: args.referenceClipProviderNoteDraft,
        usageNote: args.referenceClipUsageNoteDraft,
        resultMetadata: args.referenceClipResultMetadataDraft,
      }),
      updated_at: new Date().toISOString(),
    };
    const nextPlan: EpisodeReferenceClipPlan = {
      ...args.episodePackage.cdc_plan,
      version: Math.max(1, args.episodePackage.cdc_plan.version + 1),
      entries: args.episodePackage.cdc_plan.entries.map((entry) => (entry.id === args.selectedReferenceClipEntry?.id ? nextEntry : entry)),
      generated_at: new Date().toISOString(),
    };
    const saved = await args.persistReferenceClipPlan({
      plan: nextPlan,
      eventName: "hearth.cdc_plan.prompt_copied.v1",
      eventPayload: {
        cdc_id: args.selectedReferenceClipEntry.id,
        provider: args.activeVisualPromptPackForReferenceClip.provider.id,
      },
    });
    if (!args.operationAuthority.isCurrent(operation)) return false;
    if (!saved.ok) {
      args.setReferenceClipSaveError(saved.error);
      args.setReferenceClipSaveState("error");
      return false;
    }
    args.setReferenceClipSaveState("saved");
    args.setReferenceClipMessage(`${args.activeVisualPromptPackForReferenceClip.provider.label} prompt copied. Manual bridge state updated.`);
    return true;
  }, [args]);

  const onCopyReferenceClipNegativePrompt = useCallback(async () => {
    if (!args.episodePackage || !args.selectedReferenceClipEntry || !args.activeVisualPromptPackForReferenceClip?.pack.negative) return false;
    const operation = args.operationAuthority.begin("reference-clip.negative-prompt.copy");
    const copied = await args.writeTextToClipboard(args.activeVisualPromptPackForReferenceClip.pack.negative);
    if (!args.operationAuthority.isCurrent(operation)) return false;
    if (!copied) {
      args.setReferenceClipSaveError("Unable to copy negative prompt to clipboard.");
      args.setReferenceClipSaveState("error");
      return false;
    }
    args.setReferenceClipSaveState("saved");
    args.setReferenceClipMessage("Negative prompt copied.");
    return true;
  }, [args]);

  const onDownloadReferenceClipPromptPack = useCallback(async () => {
    if (!args.episodePackage || !args.selectedReferenceClipEntry || !args.activeVisualPromptPackForReferenceClip) return;
    const operation = args.operationAuthority.begin("reference-clip.prompt-pack.download");
    const suffix = (args.workpieceId?.slice(0, 8) ?? "episode").toLowerCase();
    args.downloadTextFile({
      text: serializePromptPack(args.activeVisualPromptPackForReferenceClip.pack),
      filename: `reference-clip-prompt-pack-${suffix}-${args.selectedReferenceClipEntry.id}.json`,
      mimeType: "application/json;charset=utf-8",
    });
    const nextEntry: EpisodeContextualDataCompositePlan = {
      ...args.selectedReferenceClipEntry,
      external_request: advanceExternalRequestTracker(args.selectedReferenceClipEntry.external_request, "brief_exported", {
        providerId: args.referenceClipProviderIdDraft,
        sourceUrl: args.referenceClipSourceUrlDraft,
        providerNote: args.referenceClipProviderNoteDraft,
        usageNote: args.referenceClipUsageNoteDraft,
        resultMetadata: args.referenceClipResultMetadataDraft,
      }),
      updated_at: new Date().toISOString(),
    };
    const nextPlan: EpisodeReferenceClipPlan = {
      ...args.episodePackage.cdc_plan,
      version: Math.max(1, args.episodePackage.cdc_plan.version + 1),
      entries: args.episodePackage.cdc_plan.entries.map((entry) => (entry.id === args.selectedReferenceClipEntry?.id ? nextEntry : entry)),
      generated_at: new Date().toISOString(),
    };
    const saved = await args.persistReferenceClipPlan({
      plan: nextPlan,
      eventName: "hearth.cdc_plan.prompt_pack_downloaded.v1",
      eventPayload: {
        cdc_id: args.selectedReferenceClipEntry.id,
        provider: args.activeVisualPromptPackForReferenceClip.provider.id,
      },
    });
    if (!args.operationAuthority.isCurrent(operation)) return;
    if (!saved.ok) {
      args.setReferenceClipSaveError(saved.error);
      args.setReferenceClipSaveState("error");
      return;
    }
    args.setReferenceClipSaveState("saved");
    args.setReferenceClipMessage(`${args.activeVisualPromptPackForReferenceClip.provider.label} prompt pack downloaded.`);
  }, [args]);

  const onDownloadReferenceClipBrief = useCallback(async (format: "text" | "json") => {
    if (!args.episodePackage || !args.selectedReferenceClipEntry) return;
    const operation = args.operationAuthority.begin("reference-clip.brief.download");
    const brief = buildReferenceClipBrief({
      entry: {
        ...args.selectedReferenceClipEntry,
        anchor_text: args.referenceClipAnchorDraft.trim() || args.selectedReferenceClipEntry.anchor_text,
        description: args.referenceClipDescriptionDraft.trim() || args.selectedReferenceClipEntry.description,
      },
      workpieceId: args.workpieceId?.trim() ?? "",
      workpieceTitle: args.activeDraftTitle,
    });
    const suffix = (args.workpieceId?.slice(0, 8) ?? "episode").toLowerCase();
    if (format === "json") {
      args.downloadTextFile({
        text: JSON.stringify(brief, null, 2),
        filename: `reference-clip-brief-${suffix}-${args.selectedReferenceClipEntry.id}.json`,
        mimeType: "application/json;charset=utf-8",
      });
    } else {
      args.downloadTextFile({
        text: formatVisualBriefAsText(brief),
        filename: `reference-clip-brief-${suffix}-${args.selectedReferenceClipEntry.id}.txt`,
      });
    }
    const nextEntry: EpisodeContextualDataCompositePlan = {
      ...args.selectedReferenceClipEntry,
      external_request: advanceExternalRequestTracker(args.selectedReferenceClipEntry.external_request, "brief_exported", {
        providerId: args.referenceClipProviderIdDraft,
        sourceUrl: args.referenceClipSourceUrlDraft,
        providerNote: args.referenceClipProviderNoteDraft,
        usageNote: args.referenceClipUsageNoteDraft,
        resultMetadata: args.referenceClipResultMetadataDraft,
      }),
      updated_at: new Date().toISOString(),
    };
    const nextPlan: EpisodeReferenceClipPlan = {
      ...args.episodePackage.cdc_plan,
      version: Math.max(1, args.episodePackage.cdc_plan.version + 1),
      entries: args.episodePackage.cdc_plan.entries.map((entry) => (entry.id === args.selectedReferenceClipEntry?.id ? nextEntry : entry)),
      generated_at: new Date().toISOString(),
    };
    const saved = await args.persistReferenceClipPlan({
      plan: nextPlan,
      eventName: "hearth.cdc_plan.brief_downloaded.v1",
      eventPayload: { cdc_id: args.selectedReferenceClipEntry.id, format },
    });
    if (!args.operationAuthority.isCurrent(operation)) return;
    if (!saved.ok) {
      args.setReferenceClipSaveError(saved.error);
      args.setReferenceClipSaveState("error");
      return;
    }
    args.setReferenceClipSaveState("saved");
    args.setReferenceClipMessage(format === "json" ? "JSON brief downloaded." : "Brief downloaded.");
  }, [args]);

  const onOpenReferenceClipProvider = useCallback(async () => {
    if (!args.selectedReferenceClipEntry) return;
    const operation = args.operationAuthority.begin("reference-clip.provider.open");
    const provider = args.referenceClipProviders.find((entry) => entry.id === args.referenceClipProviderIdDraft) ?? null;
    if (!provider) {
      args.setReferenceClipSaveError("Choose a provider before opening a manual bridge.");
      args.setReferenceClipSaveState("error");
      return;
    }
    if (args.activeVisualPromptPackForReferenceClip) {
      await args.writeTextToClipboard(args.activeVisualPromptPackForReferenceClip.pack.prompt);
      if (!args.operationAuthority.isCurrent(operation)) return;
    }
    if (typeof window !== "undefined") {
      window.open(provider.launchUrl, "_blank", "noopener,noreferrer");
    }
    await onMarkReferenceClipRequestState("sent_external");
    if (!args.operationAuthority.isCurrent(operation)) return;
    args.setReferenceClipMessage(`Opened ${provider.name}. ${args.activeVisualPromptPackForReferenceClip?.provider.label ?? "Prompt"} copied for manual paste.`);
  }, [args, onMarkReferenceClipRequestState]);

  const onAttachReferenceClipResultFromUrl = useCallback(async () => {
    if (!args.episodePackage || !args.selectedReferenceClipEntry) return;
    const operation = args.operationAuthority.begin("reference-clip.result-url.attach");
    const sourceUrl = args.referenceClipSourceUrlDraft.trim();
    if (!sourceUrl) {
      args.setReferenceClipSaveError("Add a source URL before attaching a result.");
      args.setReferenceClipSaveState("error");
      return;
    }
    const candidate = createManualResultCandidate({
      assetClass: "reference_clip",
      beatId: args.selectedReferenceClipEntry.id,
      sourceLabel: args.referenceClipSourceLabelDraft || "External provider",
      sourceUrl,
      title: args.referenceClipTitleDraft || args.selectedReferenceClipEntry.description,
      providerNote: args.referenceClipProviderNoteDraft,
      usageNote: args.referenceClipUsageNoteDraft,
    });
    const nextEntry: EpisodeContextualDataCompositePlan = {
      ...args.selectedReferenceClipEntry,
      source_type: "external",
      candidate_assets: [
        ...(args.selectedReferenceClipEntry.candidate_assets ?? []).filter((asset) => asset.asset_id !== candidate.asset_id),
        candidate,
      ],
      selected_asset_id: candidate.asset_id,
      external_request: advanceExternalRequestTracker(args.selectedReferenceClipEntry.external_request, "asset_attached", {
        providerId: args.referenceClipProviderIdDraft,
        sourceUrl: args.referenceClipSourceUrlDraft,
        providerNote: args.referenceClipProviderNoteDraft,
        usageNote: args.referenceClipUsageNoteDraft,
        resultMetadata: args.referenceClipResultMetadataDraft,
        attachedAssetId: candidate.asset_id,
      }),
      updated_at: new Date().toISOString(),
    };
    const nextPlan: EpisodeReferenceClipPlan = {
      ...args.episodePackage.cdc_plan,
      version: Math.max(1, args.episodePackage.cdc_plan.version + 1),
      entries: args.episodePackage.cdc_plan.entries.map((entry) => (entry.id === args.selectedReferenceClipEntry?.id ? nextEntry : entry)),
      generated_at: new Date().toISOString(),
    };
    const saved = await args.persistReferenceClipPlan({
      plan: nextPlan,
      eventName: "hearth.cdc_plan.result_url_attached.v1",
      eventPayload: { cdc_id: args.selectedReferenceClipEntry.id },
    });
    if (!args.operationAuthority.isCurrent(operation)) return;
    if (!saved.ok) {
      args.setReferenceClipSaveError(saved.error);
      args.setReferenceClipSaveState("error");
      return;
    }
    args.setReferenceClipSaveState("saved");
    args.setReferenceClipMessage("Result URL attached as a classed reference clip candidate.");
  }, [args]);

  const onUploadReferenceClipAsset = useCallback(async (file: File) => {
    if (!args.episodePackage || !args.selectedReferenceClipEntry) return;
    if (args.isReferenceClipBusy) return;
    const episodeId = args.workpieceId?.trim() ?? "";
    if (!episodeId) {
      args.setReferenceClipSaveError("Select an Episode before uploading Reference Clip assets.");
      args.setReferenceClipSaveState("error");
      return;
    }
    const operation = args.operationAuthority.begin("reference-clip.asset.upload");
    args.setIsReferenceClipBusy(true);
    args.setReferenceClipSaveState("saving");
    args.setReferenceClipSaveError(null);
    try {
      const uploaded = await uploadBrollBeatAsset({
        workpieceId: episodeId,
        beatId: args.selectedReferenceClipEntry.id,
        file,
        source: "upload",
        assetClass: "reference_clip",
        sourceLabel: args.referenceClipSourceLabelDraft,
        sourceUrl: args.referenceClipSourceUrlDraft,
        providerNote: args.referenceClipProviderNoteDraft,
        usageNote: args.referenceClipUsageNoteDraft,
      });
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (!uploaded.ok) {
        args.setReferenceClipSaveError(uploaded.error);
        args.setReferenceClipSaveState("error");
        return;
      }
      const nextEntry: EpisodeContextualDataCompositePlan = {
        ...args.selectedReferenceClipEntry,
        source_type: "upload",
        origin: args.selectedReferenceClipEntry.origin === "hammer" ? "mixed" : "hearth",
        candidate_assets: [
          ...(args.selectedReferenceClipEntry.candidate_assets ?? []).filter((asset) => asset.asset_id !== uploaded.candidateAsset.asset_id),
          uploaded.candidateAsset,
        ],
        external_request: advanceExternalRequestTracker(args.selectedReferenceClipEntry.external_request, "asset_attached", {
          providerId: args.referenceClipProviderIdDraft,
          sourceUrl: args.referenceClipSourceUrlDraft,
          providerNote: args.referenceClipProviderNoteDraft,
          usageNote: args.referenceClipUsageNoteDraft,
          resultMetadata: args.referenceClipResultMetadataDraft,
          attachedAssetId: uploaded.candidateAsset.asset_id,
        }),
        selected_asset_id: uploaded.candidateAsset.asset_id,
        updated_at: new Date().toISOString(),
      };
      const nextPlan: EpisodeReferenceClipPlan = {
        ...args.episodePackage.cdc_plan,
        version: Math.max(1, args.episodePackage.cdc_plan.version + 1),
        entries: args.episodePackage.cdc_plan.entries.map((entry) => (entry.id === args.selectedReferenceClipEntry?.id ? nextEntry : entry)),
        generated_at: new Date().toISOString(),
      };
      const saved = await args.persistReferenceClipPlan({
        plan: nextPlan,
        eventName: "hearth.cdc_plan.asset_uploaded.v1",
        eventPayload: { cdc_id: args.selectedReferenceClipEntry.id, source: "upload" },
      });
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (!saved.ok) {
        args.setReferenceClipSaveError(saved.error);
        args.setReferenceClipSaveState("error");
        return;
      }
      args.setReferenceClipSaveState("saved");
      args.setReferenceClipMessage("Uploaded asset selected for this reference clip.");
    } catch {
      if (!args.operationAuthority.isCurrent(operation)) return;
      args.setReferenceClipSaveError("Unable to upload this reference clip asset.");
      args.setReferenceClipSaveState("error");
    } finally {
      if (args.operationAuthority.isCurrent(operation)) args.setIsReferenceClipBusy(false);
    }
  }, [args]);

  const onSelectReferenceClipCandidate = useCallback(async (candidateId: string) => {
    if (!args.episodePackage || !args.selectedReferenceClipEntry) return;
    if (args.isReferenceClipBusy) return;
    if (args.selectedReferenceClipEntry.selected_asset_id === candidateId) return;
    const candidate = (args.selectedReferenceClipEntry.candidate_assets ?? []).find((asset) => asset.asset_id === candidateId) ?? null;
    if (!candidate) {
      args.setReferenceClipSaveError("Selected candidate is no longer attached to this reference clip.");
      args.setReferenceClipSaveState("error");
      return;
    }
    const operation = args.operationAuthority.begin("reference-clip.candidate.select");
    const nextEntry: EpisodeContextualDataCompositePlan = {
      ...args.selectedReferenceClipEntry,
      source_type: candidate.source,
      origin: candidate.source === "hammer_upload" && args.selectedReferenceClipEntry.origin === "hearth"
        ? "mixed"
        : args.selectedReferenceClipEntry.origin,
      external_request: advanceExternalRequestTracker(args.selectedReferenceClipEntry.external_request, "resolved", {
        providerId: args.referenceClipProviderIdDraft,
        sourceUrl: candidate.source_url ?? args.referenceClipSourceUrlDraft,
        providerNote: candidate.provider_note ?? args.referenceClipProviderNoteDraft,
        usageNote: candidate.usage_note ?? args.referenceClipUsageNoteDraft,
        resultMetadata: args.referenceClipResultMetadataDraft,
        attachedAssetId: candidate.asset_id,
      }),
      selected_asset_id: candidate.asset_id,
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
        eventName: "hearth.cdc_plan.asset_selected.v1",
        eventPayload: { cdc_id: args.selectedReferenceClipEntry.id, candidate_id: candidate.asset_id },
      });
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (!saved.ok) {
        args.setReferenceClipSaveError(saved.error);
        args.setReferenceClipSaveState("error");
        return;
      }
      args.setReferenceClipSaveState("saved");
      args.setReferenceClipMessage("Selected asset attached to reference clip.");
    } catch {
      if (!args.operationAuthority.isCurrent(operation)) return;
      args.setReferenceClipSaveError("Unable to select this reference clip candidate.");
      args.setReferenceClipSaveState("error");
    } finally {
      if (args.operationAuthority.isCurrent(operation)) args.setIsReferenceClipBusy(false);
    }
  }, [args]);

  return {
    onCopyReferenceClipPrompt,
    onCopyReferenceClipNegativePrompt,
    onDownloadReferenceClipPromptPack,
    onDownloadReferenceClipBrief,
    onOpenReferenceClipProvider,
    onMarkReferenceClipRequestState,
    onClearReferenceClipRequestState,
    onAttachReferenceClipResultFromUrl,
    onUploadReferenceClipAsset,
    onSelectReferenceClipCandidate,
  };
}
