import { useCallback } from "react";
import { buildStockCandidatesForBrollBeat } from "../../lib/hearth-broll-plan";
import { ingestBrollBeatAssetCandidate, uploadBrollBeatAsset } from "../../lib/hearth-broll-plan-repo";
import {
  advanceExternalRequestTracker,
  buildBrollBeatBrief,
  createManualResultCandidate,
  formatVisualBriefAsText,
  type ExternalGenerationProvider,
} from "../../lib/hearth-visual-actionability";
import type {
  EpisodeBrollMotionAssetCategory,
  EpisodeBrollAssetCandidate,
  EpisodeBrollPlan,
  EpisodeBrollPlanBeat,
  EpisodeExternalRequestState,
  EpisodePackageV2,
} from "../../lib/episode-package-v2";

type PersistBrollPlanResult =
  | { ok: true; episodePackage: EpisodePackageV2 }
  | { ok: false; error: string };

type UseBrollBridgeActionsArgs = {
  episodePackage: EpisodePackageV2 | null;
  selectedBrollBeat: EpisodeBrollPlanBeat | null;
  brollProviders: ExternalGenerationProvider[];
  brollProviderIdDraft: string;
  brollSourceUrlDraft: string;
  brollSourceLabelDraft: string;
  brollProviderNoteDraft: string;
  brollUsageNoteDraft: string;
  brollResultMetadataDraft: string;
  brollAnchorDraft: string;
  brollDescriptionDraft: string;
  brollKeywordsDraft: string;
  brollMotionIntentDraft: string;
  brollAssetCategoryDraft: EpisodeBrollPlanBeat["asset_category"];
  brollMoodDraft: string;
  brollDataVisualSpecFromDraft: (intent: EpisodeBrollPlanBeat["motion_intent"]) => EpisodeBrollPlanBeat["data_visual_spec"];
  workpieceId: string | null;
  activeDraftTitle: string | null;
  isBrollBusy: boolean;
  setIsBrollBusy: (next: boolean) => void;
  setBrollSaveState: (next: "saved" | "editing" | "saving" | "error" | "offline") => void;
  setBrollSaveError: (next: string | null) => void;
  setBrollMessage: (next: string | null) => void;
  writeTextToClipboard: (value: string) => Promise<boolean>;
  downloadTextFile: (args: { text: string; filename: string; mimeType?: string }) => void;
  persistBrollPlan: (args: {
    plan: EpisodeBrollPlan;
    eventName: string;
    eventPayload: Record<string, unknown>;
    baseEpisodePackage?: EpisodePackageV2;
  }) => Promise<PersistBrollPlanResult>;
};

export function useBrollBridgeActions(args: UseBrollBridgeActionsArgs) {
  const resolveReadyCandidate = useCallback((beat: EpisodeBrollPlanBeat, candidateId: string | null): EpisodeBrollAssetCandidate | null => {
    if (!candidateId) return null;
    const candidate = (beat.candidate_assets ?? []).find((entry) => entry.asset_id === candidateId) ?? null;
    if (!candidate) return null;
    if (candidate.ingest_status === "failed" || candidate.ingest_status === "processing") return null;
    return candidate;
  }, []);

  const resolveFulfillmentState = useCallback((beat: EpisodeBrollPlanBeat, selectedAssetId: string | null): EpisodeBrollPlanBeat["fulfillment_state"] => {
    const selectedReady = resolveReadyCandidate(beat, selectedAssetId);
    if (selectedReady) return "resolved";
    if ((beat.candidate_assets ?? []).length > 0) return "candidate_assets_available";
    return "unresolved";
  }, [resolveReadyCandidate]);

  const onMarkBrollRequestState = useCallback(async (nextState: EpisodeExternalRequestState) => {
    if (!args.episodePackage || !args.selectedBrollBeat) return;
    const nextBeat: EpisodeBrollPlanBeat = {
      ...args.selectedBrollBeat,
      external_request: advanceExternalRequestTracker(args.selectedBrollBeat.external_request, nextState, {
        providerId: args.brollProviderIdDraft,
        sourceUrl: args.brollSourceUrlDraft,
        providerNote: args.brollProviderNoteDraft,
        usageNote: args.brollUsageNoteDraft,
        resultMetadata: args.brollResultMetadataDraft,
        attachedAssetId: args.selectedBrollBeat.selected_asset_id ?? null,
      }),
      updated_at: new Date().toISOString(),
    };
    const nextPlan: EpisodeBrollPlan = {
      ...args.episodePackage.broll_plan,
      version: Math.max(1, args.episodePackage.broll_plan.version + 1),
      beats: args.episodePackage.broll_plan.beats.map((beat) => (beat.id === args.selectedBrollBeat?.id ? nextBeat : beat)),
      generated_at: new Date().toISOString(),
    };
    const saved = await args.persistBrollPlan({
      plan: nextPlan,
      eventName: "hearth.broll_plan.request_state.updated.v1",
      eventPayload: { beat_id: args.selectedBrollBeat.id, request_state: nextState },
    });
    if (!saved.ok) {
      args.setBrollSaveError(saved.error);
      args.setBrollSaveState("error");
      return;
    }
    args.setBrollSaveState("saved");
  }, [args]);

  const onClearBrollRequestState = useCallback(async () => {
    if (!args.episodePackage || !args.selectedBrollBeat) return;
    const nextBeat: EpisodeBrollPlanBeat = {
      ...args.selectedBrollBeat,
      external_request: {
        state: "planned",
        updated_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    };
    const nextPlan: EpisodeBrollPlan = {
      ...args.episodePackage.broll_plan,
      version: Math.max(1, args.episodePackage.broll_plan.version + 1),
      beats: args.episodePackage.broll_plan.beats.map((beat) => (beat.id === args.selectedBrollBeat?.id ? nextBeat : beat)),
      generated_at: new Date().toISOString(),
    };
    const saved = await args.persistBrollPlan({
      plan: nextPlan,
      eventName: "hearth.broll_plan.request_state.cleared.v1",
      eventPayload: { beat_id: args.selectedBrollBeat.id },
    });
    if (!saved.ok) {
      args.setBrollSaveError(saved.error);
      args.setBrollSaveState("error");
      return;
    }
    args.setBrollSaveState("saved");
    args.setBrollMessage("Request state cleared.");
  }, [args]);

  const onCopyBrollPrompt = useCallback(async () => {
    if (!args.episodePackage || !args.selectedBrollBeat) return false;
    const brief = buildBrollBeatBrief({
      beat: {
        ...args.selectedBrollBeat,
        anchor_text: args.brollAnchorDraft.trim() || args.selectedBrollBeat.anchor_text,
        description: args.brollDescriptionDraft.trim() || args.selectedBrollBeat.description,
      },
      workpieceId: args.workpieceId?.trim() ?? "",
      workpieceTitle: args.activeDraftTitle,
    });
    const copied = await args.writeTextToClipboard(formatVisualBriefAsText(brief));
    if (!copied) {
      args.setBrollSaveError("Unable to copy prompt to clipboard.");
      args.setBrollSaveState("error");
      return false;
    }
    const nextBeat: EpisodeBrollPlanBeat = {
      ...args.selectedBrollBeat,
      external_request: advanceExternalRequestTracker(args.selectedBrollBeat.external_request, "brief_exported", {
        providerId: args.brollProviderIdDraft,
        sourceUrl: args.brollSourceUrlDraft,
        providerNote: args.brollProviderNoteDraft,
        usageNote: args.brollUsageNoteDraft,
        resultMetadata: args.brollResultMetadataDraft,
      }),
      updated_at: new Date().toISOString(),
    };
    const nextPlan: EpisodeBrollPlan = {
      ...args.episodePackage.broll_plan,
      version: Math.max(1, args.episodePackage.broll_plan.version + 1),
      beats: args.episodePackage.broll_plan.beats.map((beat) => (beat.id === args.selectedBrollBeat?.id ? nextBeat : beat)),
      generated_at: new Date().toISOString(),
    };
    const saved = await args.persistBrollPlan({
      plan: nextPlan,
      eventName: "hearth.broll_plan.brief_copied.v1",
      eventPayload: { beat_id: args.selectedBrollBeat.id },
    });
    if (!saved.ok) {
      args.setBrollSaveError(saved.error);
      args.setBrollSaveState("error");
      return false;
    }
    args.setBrollMessage("Prompt copied. Manual bridge state updated.");
    args.setBrollSaveState("saved");
    return true;
  }, [args]);

  const onDownloadBrollBrief = useCallback(async (format: "text" | "json") => {
    if (!args.episodePackage || !args.selectedBrollBeat) return;
    const brief = buildBrollBeatBrief({
      beat: {
        ...args.selectedBrollBeat,
        anchor_text: args.brollAnchorDraft.trim() || args.selectedBrollBeat.anchor_text,
        description: args.brollDescriptionDraft.trim() || args.selectedBrollBeat.description,
      },
      workpieceId: args.workpieceId?.trim() ?? "",
      workpieceTitle: args.activeDraftTitle,
    });
    const suffix = (args.workpieceId?.slice(0, 8) ?? "episode").toLowerCase();
    if (format === "json") {
      args.downloadTextFile({
        text: JSON.stringify(brief, null, 2),
        filename: `broll-brief-${suffix}-${args.selectedBrollBeat.id}.json`,
        mimeType: "application/json;charset=utf-8",
      });
    } else {
      args.downloadTextFile({
        text: formatVisualBriefAsText(brief),
        filename: `broll-brief-${suffix}-${args.selectedBrollBeat.id}.txt`,
      });
    }
    const nextBeat: EpisodeBrollPlanBeat = {
      ...args.selectedBrollBeat,
      external_request: advanceExternalRequestTracker(args.selectedBrollBeat.external_request, "brief_exported", {
        providerId: args.brollProviderIdDraft,
        sourceUrl: args.brollSourceUrlDraft,
        providerNote: args.brollProviderNoteDraft,
        usageNote: args.brollUsageNoteDraft,
        resultMetadata: args.brollResultMetadataDraft,
      }),
      updated_at: new Date().toISOString(),
    };
    const nextPlan: EpisodeBrollPlan = {
      ...args.episodePackage.broll_plan,
      version: Math.max(1, args.episodePackage.broll_plan.version + 1),
      beats: args.episodePackage.broll_plan.beats.map((beat) => (beat.id === args.selectedBrollBeat?.id ? nextBeat : beat)),
      generated_at: new Date().toISOString(),
    };
    const saved = await args.persistBrollPlan({
      plan: nextPlan,
      eventName: "hearth.broll_plan.brief_downloaded.v1",
      eventPayload: { beat_id: args.selectedBrollBeat.id, format },
    });
    if (!saved.ok) {
      args.setBrollSaveError(saved.error);
      args.setBrollSaveState("error");
      return;
    }
    args.setBrollMessage(format === "json" ? "JSON brief downloaded." : "Brief downloaded.");
    args.setBrollSaveState("saved");
  }, [args]);

  const onOpenBrollProvider = useCallback(async () => {
    if (!args.selectedBrollBeat) return;
    const provider = args.brollProviders.find((entry) => entry.id === args.brollProviderIdDraft) ?? null;
    if (!provider) {
      args.setBrollSaveError("Choose a provider before opening a manual bridge.");
      args.setBrollSaveState("error");
      return;
    }
    const brief = buildBrollBeatBrief({
      beat: {
        ...args.selectedBrollBeat,
        anchor_text: args.brollAnchorDraft.trim() || args.selectedBrollBeat.anchor_text,
        description: args.brollDescriptionDraft.trim() || args.selectedBrollBeat.description,
      },
      workpieceId: args.workpieceId?.trim() ?? "",
      workpieceTitle: args.activeDraftTitle,
    });
    await args.writeTextToClipboard(formatVisualBriefAsText(brief));
    if (typeof window !== "undefined") {
      window.open(provider.launchUrl, "_blank", "noopener,noreferrer");
    }
    await onMarkBrollRequestState("sent_external");
    args.setBrollMessage(`Opened ${provider.name}. Prompt copied for manual paste.`);
  }, [args, onMarkBrollRequestState]);

  const onAttachBrollResultFromUrl = useCallback(async () => {
    if (!args.episodePackage || !args.selectedBrollBeat) return;
    const sourceUrl = args.brollSourceUrlDraft.trim();
    if (!sourceUrl) {
      args.setBrollSaveError("Add a source URL before attaching a result.");
      args.setBrollSaveState("error");
      return;
    }
    const candidate = createManualResultCandidate({
      assetClass: "broll",
      beatId: args.selectedBrollBeat.id,
      sourceLabel: args.brollSourceLabelDraft || "External provider",
      sourceUrl,
      title: args.brollDescriptionDraft || args.selectedBrollBeat.description,
      providerNote: args.brollProviderNoteDraft,
      usageNote: args.brollUsageNoteDraft,
    });
    const nextBeat: EpisodeBrollPlanBeat = {
      ...args.selectedBrollBeat,
      source_type: "external",
      candidate_assets: [
        ...(args.selectedBrollBeat.candidate_assets ?? []).filter((asset) => asset.asset_id !== candidate.asset_id),
        candidate,
      ],
      selected_asset_id: candidate.asset_id,
      external_request: advanceExternalRequestTracker(args.selectedBrollBeat.external_request, "asset_attached", {
        providerId: args.brollProviderIdDraft,
        sourceUrl: args.brollSourceUrlDraft,
        providerNote: args.brollProviderNoteDraft,
        usageNote: args.brollUsageNoteDraft,
        resultMetadata: args.brollResultMetadataDraft,
        attachedAssetId: candidate.asset_id,
      }),
      fulfillment_state: "resolved",
      updated_at: new Date().toISOString(),
    };
    const nextPlan: EpisodeBrollPlan = {
      ...args.episodePackage.broll_plan,
      version: Math.max(1, args.episodePackage.broll_plan.version + 1),
      beats: args.episodePackage.broll_plan.beats.map((beat) => (beat.id === args.selectedBrollBeat?.id ? nextBeat : beat)),
      generated_at: new Date().toISOString(),
    };
    const saved = await args.persistBrollPlan({
      plan: nextPlan,
      eventName: "hearth.broll_plan.result_url_attached.v1",
      eventPayload: { beat_id: args.selectedBrollBeat.id },
    });
    if (!saved.ok) {
      args.setBrollSaveError(saved.error);
      args.setBrollSaveState("error");
      return;
    }
    args.setBrollSaveState("saved");
    args.setBrollMessage("Result URL attached as a classed B-roll candidate.");
  }, [args]);

  const onFindStockForBrollBeat = useCallback(async () => {
    if (!args.episodePackage || !args.selectedBrollBeat) return;
    if (args.isBrollBusy) return;
    const nextMotionIntent = args.brollMotionIntentDraft as EpisodeBrollPlanBeat["motion_intent"];
    const baseBeat: EpisodeBrollPlanBeat = {
      ...args.selectedBrollBeat,
      description: args.brollDescriptionDraft.trim() || args.selectedBrollBeat.description,
      keywords: args.brollKeywordsDraft
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
      motion_intent: nextMotionIntent,
      asset_category: args.brollAssetCategoryDraft,
      mood: args.brollMoodDraft.trim() || args.selectedBrollBeat.mood,
      data_visual_spec: args.brollDataVisualSpecFromDraft(nextMotionIntent),
    };
    const stockCandidates = buildStockCandidatesForBrollBeat(baseBeat);
    const nextBeat: EpisodeBrollPlanBeat = {
      ...baseBeat,
      source_type: "stock",
      candidate_assets: stockCandidates,
      selected_asset_id: stockCandidates[0]?.asset_id ?? null,
      fulfillment_state: stockCandidates.length > 0 ? "resolved" : "unresolved",
      updated_at: new Date().toISOString(),
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
        eventName: "hearth.broll_plan.stock_candidates.generated.v1",
        eventPayload: { beat_id: args.selectedBrollBeat.id, candidate_count: stockCandidates.length },
      });
      if (!saved.ok) {
        args.setBrollSaveError(saved.error);
        args.setBrollSaveState("error");
        return;
      }
      args.setBrollSaveState("saved");
      args.setBrollMessage(`Attached ${stockCandidates.length} stock candidate links.`);
    } catch {
      args.setBrollSaveError("Unable to attach stock candidates for this B-roll beat.");
      args.setBrollSaveState("error");
    } finally {
      args.setIsBrollBusy(false);
    }
  }, [args]);

  const onUploadBrollBeatAsset = useCallback(async (file: File) => {
    if (!args.episodePackage || !args.selectedBrollBeat) return;
    if (args.isBrollBusy) return;
    const episodeId = args.workpieceId?.trim() ?? "";
    if (!episodeId) {
      args.setBrollSaveError("Select an Episode before uploading B-roll assets.");
      args.setBrollSaveState("error");
      return;
    }
    args.setIsBrollBusy(true);
    args.setBrollSaveState("saving");
    args.setBrollSaveError(null);
    try {
      const uploaded = await uploadBrollBeatAsset({
        workpieceId: episodeId,
        beatId: args.selectedBrollBeat.id,
        file,
        source: "upload",
        assetClass: "broll",
        sourceLabel: args.brollSourceLabelDraft,
        sourceUrl: args.brollSourceUrlDraft,
        providerNote: args.brollProviderNoteDraft,
        usageNote: args.brollUsageNoteDraft,
      });
      if (!uploaded.ok) {
        args.setBrollSaveError(uploaded.error);
        args.setBrollSaveState("error");
        return;
      }
      const uploadedCategory: EpisodeBrollMotionAssetCategory = file.type.startsWith("video/")
        ? "uploaded_video"
        : "animated_graphic";
      const uploadReady = uploaded.candidateAsset.ingest_status !== "processing" && uploaded.candidateAsset.ingest_status !== "failed";
      const nextSelectedAssetId = uploadReady
        ? uploaded.candidateAsset.asset_id
        : (resolveReadyCandidate(args.selectedBrollBeat, args.selectedBrollBeat.selected_asset_id ?? null)?.asset_id ?? null);
      const nextBeat: EpisodeBrollPlanBeat = {
        ...args.selectedBrollBeat,
        source_type: "upload",
        asset_category: uploadedCategory,
        origin: args.selectedBrollBeat.origin === "hammer" ? "mixed" : "hearth",
        candidate_assets: [
          ...(args.selectedBrollBeat.candidate_assets ?? []).filter((asset) => asset.asset_id !== uploaded.candidateAsset.asset_id),
          uploaded.candidateAsset,
        ],
        external_request: advanceExternalRequestTracker(args.selectedBrollBeat.external_request, "asset_attached", {
          providerId: args.brollProviderIdDraft,
          sourceUrl: args.brollSourceUrlDraft,
          providerNote: args.brollProviderNoteDraft,
          usageNote: args.brollUsageNoteDraft,
          resultMetadata: args.brollResultMetadataDraft,
          attachedAssetId: uploaded.candidateAsset.asset_id,
        }),
        selected_asset_id: nextSelectedAssetId,
        fulfillment_state: resolveFulfillmentState({
          ...args.selectedBrollBeat,
          candidate_assets: [
            ...(args.selectedBrollBeat.candidate_assets ?? []).filter((asset) => asset.asset_id !== uploaded.candidateAsset.asset_id),
            uploaded.candidateAsset,
          ],
        }, nextSelectedAssetId),
        updated_at: new Date().toISOString(),
      };
      const nextPlan: EpisodeBrollPlan = {
        ...args.episodePackage.broll_plan,
        version: Math.max(1, args.episodePackage.broll_plan.version + 1),
        beats: args.episodePackage.broll_plan.beats.map((beat) => (beat.id === args.selectedBrollBeat?.id ? nextBeat : beat)),
        generated_at: new Date().toISOString(),
      };
      const saved = await args.persistBrollPlan({
        plan: nextPlan,
        eventName: "hearth.broll_plan.asset_uploaded.v1",
        eventPayload: { beat_id: args.selectedBrollBeat.id, source: "upload" },
      });
      if (!saved.ok) {
        args.setBrollSaveError(saved.error);
        args.setBrollSaveState("error");
        return;
      }
      args.setBrollSaveState("saved");
      if (uploaded.candidateAsset.ingest_status === "processing") {
        args.setBrollMessage("Upload received. Processing media preview...");
      } else if (uploaded.candidateAsset.ingest_status === "failed") {
        args.setBrollMessage("Upload received, but media preview ingestion failed. Retry processing from the candidate card.");
      } else {
        args.setBrollMessage("Uploaded asset selected for this B-roll beat.");
      }
    } catch {
      args.setBrollSaveError("Unable to upload this B-roll asset.");
      args.setBrollSaveState("error");
    } finally {
      args.setIsBrollBusy(false);
    }
  }, [args]);

  const onSelectBrollCandidate = useCallback(async (candidateId: string) => {
    if (!args.episodePackage || !args.selectedBrollBeat) return;
    if (args.isBrollBusy) return;
    if (args.selectedBrollBeat.selected_asset_id === candidateId) return;
    const candidate = (args.selectedBrollBeat.candidate_assets ?? []).find((asset) => asset.asset_id === candidateId) ?? null;
    if (!candidate) {
      args.setBrollSaveError("Selected candidate is no longer attached to this beat.");
      args.setBrollSaveState("error");
      return;
    }
    if (candidate.ingest_status === "processing") {
      args.setBrollSaveError("This upload is still processing. Wait until preview ingestion is ready.");
      args.setBrollSaveState("error");
      return;
    }
    if (candidate.ingest_status === "failed") {
      args.setBrollSaveError("This candidate failed preview ingestion. Retry processing before selecting it.");
      args.setBrollSaveState("error");
      return;
    }
    const nextBeat: EpisodeBrollPlanBeat = {
      ...args.selectedBrollBeat,
      source_type: candidate.source,
      asset_category: candidate.asset_category ?? args.selectedBrollBeat.asset_category,
      data_visual_spec: candidate.data_visual_spec ?? args.selectedBrollBeat.data_visual_spec ?? null,
      external_request: advanceExternalRequestTracker(args.selectedBrollBeat.external_request, "resolved", {
        providerId: args.brollProviderIdDraft,
        sourceUrl: candidate.source_url ?? args.brollSourceUrlDraft,
        providerNote: candidate.provider_note ?? args.brollProviderNoteDraft,
        usageNote: candidate.usage_note ?? args.brollUsageNoteDraft,
        resultMetadata: args.brollResultMetadataDraft,
        attachedAssetId: candidate.asset_id,
      }),
      selected_asset_id: candidate.asset_id,
      fulfillment_state: "resolved",
      updated_at: new Date().toISOString(),
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
        eventName: "hearth.broll_plan.asset_selected.v1",
        eventPayload: { beat_id: args.selectedBrollBeat.id, candidate_id: candidate.asset_id },
      });
      if (!saved.ok) {
        args.setBrollSaveError(saved.error);
        args.setBrollSaveState("error");
        return;
      }
      args.setBrollSaveState("saved");
      args.setBrollMessage("Selected asset attached to B-roll beat.");
    } catch {
      args.setBrollSaveError("Unable to select this B-roll candidate.");
      args.setBrollSaveState("error");
    } finally {
      args.setIsBrollBusy(false);
    }
  }, [args]);

  const onRetryBrollCandidateIngestion = useCallback(async (candidateId: string) => {
    if (!args.episodePackage || !args.selectedBrollBeat) return;
    if (args.isBrollBusy) return;
    const episodeId = args.workpieceId?.trim() ?? "";
    if (!episodeId) {
      args.setBrollSaveError("Select an Episode before retrying ingestion.");
      args.setBrollSaveState("error");
      return;
    }
    const existingCandidate = (args.selectedBrollBeat.candidate_assets ?? []).find((candidate) => candidate.asset_id === candidateId) ?? null;
    if (!existingCandidate) {
      args.setBrollSaveError("Candidate asset no longer exists for this beat.");
      args.setBrollSaveState("error");
      return;
    }

    args.setIsBrollBusy(true);
    args.setBrollSaveState("saving");
    args.setBrollSaveError(null);
    try {
      const pendingCandidate: EpisodeBrollAssetCandidate = {
        ...existingCandidate,
        ingest_status: "processing",
        ingest_error: null,
      };
      const ingestedCandidate = await ingestBrollBeatAssetCandidate({
        workpieceId: episodeId,
        beatId: args.selectedBrollBeat.id,
        candidateAsset: pendingCandidate,
      });

      const nextCandidates = (args.selectedBrollBeat.candidate_assets ?? []).map((candidate) => (
        candidate.asset_id === ingestedCandidate.asset_id ? ingestedCandidate : candidate
      ));
      const nextSelectedAssetId = (
        ingestedCandidate.ingest_status === "ready"
          ? (args.selectedBrollBeat.selected_asset_id === ingestedCandidate.asset_id
            ? ingestedCandidate.asset_id
            : args.selectedBrollBeat.selected_asset_id)
          : (args.selectedBrollBeat.selected_asset_id === ingestedCandidate.asset_id
            ? null
            : args.selectedBrollBeat.selected_asset_id)
      ) ?? null;
      const nextBeat: EpisodeBrollPlanBeat = {
        ...args.selectedBrollBeat,
        candidate_assets: nextCandidates,
        selected_asset_id: nextSelectedAssetId,
        fulfillment_state: resolveFulfillmentState({
          ...args.selectedBrollBeat,
          candidate_assets: nextCandidates,
        }, nextSelectedAssetId),
        updated_at: new Date().toISOString(),
      };
      const nextPlan: EpisodeBrollPlan = {
        ...args.episodePackage.broll_plan,
        version: Math.max(1, args.episodePackage.broll_plan.version + 1),
        beats: args.episodePackage.broll_plan.beats.map((beat) => (beat.id === args.selectedBrollBeat?.id ? nextBeat : beat)),
        generated_at: new Date().toISOString(),
      };
      const saved = await args.persistBrollPlan({
        plan: nextPlan,
        eventName: "hearth.broll_plan.asset_ingest_retried.v1",
        eventPayload: { beat_id: args.selectedBrollBeat.id, candidate_id: ingestedCandidate.asset_id },
      });
      if (!saved.ok) {
        args.setBrollSaveError(saved.error);
        args.setBrollSaveState("error");
        return;
      }
      args.setBrollSaveState("saved");
      if (ingestedCandidate.ingest_status === "failed") {
        args.setBrollMessage("Ingestion retry failed. Candidate remains unavailable for selection.");
      } else {
        args.setBrollMessage("Candidate ingestion completed and preview is ready.");
      }
    } catch {
      args.setBrollSaveError("Unable to retry candidate ingestion.");
      args.setBrollSaveState("error");
    } finally {
      args.setIsBrollBusy(false);
    }
  }, [args, resolveFulfillmentState, resolveReadyCandidate]);

  return {
    onCopyBrollPrompt,
    onDownloadBrollBrief,
    onOpenBrollProvider,
    onMarkBrollRequestState,
    onClearBrollRequestState,
    onAttachBrollResultFromUrl,
    onFindStockForBrollBeat,
    onUploadBrollBeatAsset,
    onSelectBrollCandidate,
    onRetryBrollCandidateIngestion,
  };
}
