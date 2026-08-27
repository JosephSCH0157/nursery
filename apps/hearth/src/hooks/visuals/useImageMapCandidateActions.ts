import { useCallback, type Dispatch, type SetStateAction } from "react";
import {
  assessImageMapScriptAnchor,
  resolveImageMapAnchorContext,
} from "../../lib/hearth-image-map-beats";
import { resolveBulletBeatContext } from "../../lib/hearth-spoken-beats";
import {
  generateWorkpieceImageMapCandidates,
  selectWorkpieceImageMapCandidate,
  uploadWorkpieceImageMapCandidateAsset,
} from "../../lib/hearth-image-map-repo";
import { resolveAiThumbnailAutoApproveFromStorage } from "../../lib/hearth-chat-api";
import { nextUnresolvedEpisodeImageId } from "../../lib/hearth-episode-images-view-model";
import type { EpisodeImageMapEntry, EpisodePackageV2 } from "../../lib/episode-package-v2";
import type { HearthOperationAuthority } from "../../lib/hearth-operation-authority";
import type { CanonicalImagePromptRevision } from "../../lib/hearth-image-prompt-authority";
import { prepareOutsideImageForFrame } from "../../lib/hearth-thumbnail-outside-image-fit";

type CanonicalScriptResult =
  | {
      ok: true;
      text: string;
      source: "approved_script";
      includesUnsavedLocalEdits: boolean;
    }
  | {
      ok: false;
      message: string;
    };

export function describeImageCandidateGenerationFailure(error: string | undefined, status: number): string {
  const raw = error?.trim() ?? "";
  const normalized = raw.toLowerCase();
  if (normalized === "terminated" || normalized.includes("connection ended") || normalized.includes("submission_unknown")) {
    return "The image provider connection ended before Forge received a result. Your prompt and image plan are saved. The provider may still have accepted the request, so do not generate again yet. Refresh this episode to check for a completed image; if none appears, use Upload an image or check API / Ledger before retrying.";
  }
  if (status === 429 || normalized.includes("rate limit")) {
    return "The image provider is temporarily rate-limiting requests. Your prompt and image plan are saved. Wait about a minute, then choose Generate image again.";
  }
  if (status >= 500 || !raw) {
    return "The image service failed before it could return usable options. Your prompt and image plan are saved. Wait a moment and try Generate image again. If it repeats, use Upload an image or check Forge Cloud status.";
  }
  return `${raw} Your prompt and image plan are saved. Correct the issue above, then choose Generate image again.`;
}

type UseImageMapCandidateActionsArgs = {
  operationAuthority: HearthOperationAuthority;
  workpieceId: string | null;
  workspaceId: string | null;
  episodePackage: EpisodePackageV2 | null;
  selectedImageMapEntry: EpisodeImageMapEntry | null;
  canonicalPromptRevision: CanonicalImagePromptRevision | null;
  thumbnailAspect: "16:9" | "1:1" | "9:16";
  imageMapSaveState: "saved" | "editing" | "saving" | "error" | "offline";
  imageMapMetadataUpdatedAt: string | null;
  isAiProcessing: boolean;
  isApprovingScript: boolean;
  isImageMapCandidateGenerating: boolean;
  aiBillingMode: string;
  aiTokenBalance: number | null;
  readCanonicalScriptForImageMapGeneration: () => Promise<CanonicalScriptResult>;
  replaceEpisodePackageImageMap: (
    episodePackage: EpisodePackageV2,
    entries: EpisodePackageV2["image_map"]["entries"],
    spokenBeats: EpisodePackageV2["spoken_beats"],
  ) => EpisodePackageV2;
  persistImageMapEntries: (args: {
    entries: EpisodePackageV2["image_map"]["entries"];
    spokenBeats?: EpisodePackageV2["spoken_beats"] | null;
  }) => Promise<
    | { ok: true; episodePackage: EpisodePackageV2; metadataUpdatedAt: string | null }
    | { ok: false; error: string }
  >;
  setMode: (next: "sparks" | "episodes" | "ready" | "series" | "focus") => void;
  setShowManualDraft: (next: boolean) => void;
  setShowScriptPanel: (next: boolean) => void;
  setIsImageMapReanchorMode: (next: boolean) => void;
  setImageMapSourceTypeDraft: (next: string) => void;
  setEpisodePackage: Dispatch<SetStateAction<EpisodePackageV2 | null>>;
  setImageMapMetadataUpdatedAt: (next: string | null) => void;
  setAiTokenBalance: (next: number | null) => void;
  setAiRuntimeWarning: (next: string | null) => void;
  setIsImageMapCandidateGenerating: (next: boolean) => void;
  setIsImageMapCandidateSelecting: (next: boolean) => void;
  setImageMapCandidateError: (next: string | null) => void;
  setImageMapCandidateSelectionError: (next: string | null) => void;
  setImageMapExportMessage: (next: string | null) => void;
  setSelectedImageMapEntryId: (next: string | null) => void;
  resetImageWorkspaceScroll: () => void;
  publishForgeNotice: (notice: {
    job: "image-generated" | "job-failed";
    title: string;
    message?: string;
    severity: "success" | "warning" | "error";
  }) => void;
};

export function useImageMapCandidateActions(args: UseImageMapCandidateActionsArgs) {
  const onGenerateImageMapCandidates = useCallback(async (mode: "ai" | "stock" = "ai") => {
    if (args.isAiProcessing || args.isApprovingScript || args.isImageMapCandidateGenerating) return;
    if (!args.episodePackage || !args.selectedImageMapEntry) return;

    const episodeId = args.workpieceId?.trim() ?? "";
    const workspace = args.workspaceId?.trim() ?? "";
    if (!episodeId || !workspace) {
      args.setImageMapCandidateError("Select an Episode before generating still candidates.");
      return;
    }
    if (args.imageMapSaveState === "editing" || args.imageMapSaveState === "saving") {
      args.setImageMapCandidateError("Save the image-map entry before generating candidates.");
      return;
    }
    if (args.aiBillingMode === "forge" && args.aiTokenBalance != null && args.aiTokenBalance <= 0) {
      args.setImageMapCandidateError("No AI credits remaining.");
      return;
    }
    if (!args.canonicalPromptRevision || args.canonicalPromptRevision.imageMomentId !== args.selectedImageMapEntry.id) {
      args.setImageMapCandidateError("Create or load the canonical final prompt before generating images.");
      return;
    }

    let expectedMetadataUpdatedAt = args.imageMapMetadataUpdatedAt;
    let context: { before: string | null; after: string | null };
    const operation = args.operationAuthority.begin("ig");

    if (args.selectedImageMapEntry.beat_anchor) {
      const beatContext = resolveBulletBeatContext({
        spokenBeats: args.episodePackage.spoken_beats,
        beatAnchor: args.selectedImageMapEntry.beat_anchor,
      });
      context = {
        before: beatContext.before,
        after: beatContext.after,
      };
    } else {
      const canonicalScript = await args.readCanonicalScriptForImageMapGeneration();
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (!canonicalScript.ok) {
        args.setImageMapCandidateError(canonicalScript.message);
        return;
      }

      const exactAnchorAssessment = assessImageMapScriptAnchor(canonicalScript.text, args.selectedImageMapEntry.script_anchor);
      const effectiveScriptAnchor = exactAnchorAssessment.exactAnchor;
      if (!effectiveScriptAnchor) {
        args.setMode("focus");
        args.setShowManualDraft(false);
        args.setShowScriptPanel(true);
        args.setIsImageMapReanchorMode(true);
        args.setImageMapCandidateError("This visual beat needs an exact script anchor before candidate generation. Use Re-anchor to bind it to the current canonical script.");
        return;
      }

      context = resolveImageMapAnchorContext(canonicalScript.text, effectiveScriptAnchor);
    }

    const alwaysApproveSpend = resolveAiThumbnailAutoApproveFromStorage();

    const requestedSourceType = mode === "stock" ? "stock" : "ai";
    if (args.selectedImageMapEntry.source_type !== requestedSourceType) {
      const updatedEntries = args.episodePackage.image_map.entries.map((entry) => (
        entry.id === args.selectedImageMapEntry?.id
          ? {
              ...entry,
              source_type: requestedSourceType,
              origin: entry.origin === "creator_hearth" ? "creator_hearth" as const : "hearth" as const,
            }
          : entry
      ));
      const sourceSaved = await args.persistImageMapEntries({ entries: updatedEntries });
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (!sourceSaved.ok) {
        args.setImageMapCandidateError(sourceSaved.error);
        return;
      }
      expectedMetadataUpdatedAt = sourceSaved.metadataUpdatedAt;
      args.setImageMapSourceTypeDraft(requestedSourceType);
    }

    args.setIsImageMapCandidateGenerating(true);
    args.setImageMapCandidateError(null);
    args.setImageMapCandidateSelectionError(null);
    args.setAiRuntimeWarning(null);
    try {
      const requestCandidateGeneration = (metadataUpdatedAt: string | null | undefined, confirmSpend: boolean) => (
        generateWorkpieceImageMapCandidates({
          workpieceId: episodeId,
          workspaceId: workspace,
          imageMapEntryId: args.selectedImageMapEntry!.id,
          promptRevisionId: args.canonicalPromptRevision!.id,
          promptRevision: args.canonicalPromptRevision!.revision,
          promptContentHash: args.canonicalPromptRevision!.contentHash,
          expectedMetadataUpdatedAt: metadataUpdatedAt,
          contextBefore: context.before,
          contextAfter: context.after,
          aspect: args.thumbnailAspect,
          confirmSpend,
          alwaysApproveAiSpend: confirmSpend && alwaysApproveSpend,
        })
      );

      let confirmed = true;
      if (args.aiBillingMode === "forge") {
        const quote = await requestCandidateGeneration(expectedMetadataUpdatedAt, false);
        if (!args.operationAuthority.isCurrent(operation)) return;
        if (quote.ok || !quote.requiresConfirmation) {
          args.setImageMapCandidateError(quote.ok ? "Paid image quote unexpectedly generated media before approval." : quote.error ?? "Unable to quote image generation.");
          return;
        }
        confirmed = alwaysApproveSpend || window.confirm(quote.authorizationMessage
          ?? `Generate two images? Up to ${(quote.authorizedCustomerCeiling ?? 0).toLocaleString()} AI credits will be held.`);
        if (!confirmed) return;
      } else {
        confirmed = window.confirm(mode === "stock" ? "Find stock-style candidates with your configured provider?" : "Generate two images with your configured provider?");
        if (!confirmed) return;
      }
      const generated = await requestCandidateGeneration(expectedMetadataUpdatedAt, confirmed);
      if (!args.operationAuthority.isCurrent(operation)) return;

      if (!generated.ok) {
        const failureMessage = generated.reason === "conflict"
            ? "Image map changed since last load. Reloaded the latest canonical state."
            : describeImageCandidateGenerationFailure(generated.error, generated.status);
        console.error("[hearth][image-generation-failed]", {
          status: generated.status,
          reason: generated.reason,
          providerMessage: generated.error ?? null,
        });
        if (generated.reason === "conflict" && generated.latest) {
          const latest = generated.latest;
          args.setEpisodePackage((prev) => (
            prev ? args.replaceEpisodePackageImageMap(prev, latest.entries, latest.spokenBeats) : prev
          ));
          args.setImageMapMetadataUpdatedAt(latest.metadataUpdatedAt);
        }
        args.setImageMapCandidateError(failureMessage);
        args.publishForgeNotice({
          job: "job-failed",
          title: "Timeline image generation failed",
          message: failureMessage,
          severity: generated.reason === "conflict" ? "warning" : "error",
        });
        return;
      }

      args.setEpisodePackage((prev) => (
        prev ? args.replaceEpisodePackageImageMap(prev, generated.imageMap.entries, generated.imageMap.spokenBeats) : prev
      ));
      args.setImageMapMetadataUpdatedAt(generated.imageMap.metadataUpdatedAt);
      args.setImageMapCandidateSelectionError(null);
      args.setImageMapExportMessage(
        mode === "stock"
          ? `Found ${generated.generatedAssets.length} stock-style still candidates for the selected visual beat.${typeof generated.aiCreditsUsed === "number" ? ` ${generated.aiCreditsUsed.toLocaleString()} AI credits used.` : ""}`
          : `Generated ${generated.generatedAssets.length} still candidates for the selected visual beat.${typeof generated.aiCreditsUsed === "number" ? ` ${generated.aiCreditsUsed.toLocaleString()} AI credits used.` : ""}`,
      );
      if (typeof generated.tokenBalance === "number") {
        args.setAiTokenBalance(generated.tokenBalance);
      }
      if (generated.creditsWarning) {
        args.setAiRuntimeWarning(generated.creditsWarning);
      }
      args.publishForgeNotice({
        job: "image-generated",
        title: mode === "stock" ? "Stock candidates ready" : "Timeline images ready",
        message: `${mode === "stock" ? "Found" : "Generated"} ${generated.generatedAssets.length} still candidate${generated.generatedAssets.length === 1 ? "" : "s"} for the selected visual beat.${typeof generated.aiCreditsUsed === "number" ? ` ${generated.aiCreditsUsed.toLocaleString()} AI credits used.` : ""}`,
        severity: "success",
      });
    } catch (error) {
      if (!args.operationAuthority.isCurrent(operation)) return;
      const message = error instanceof Error ? error.message : "Still-candidate generation failed.";
      args.setImageMapCandidateError(message);
      args.publishForgeNotice({
        job: "job-failed",
        title: "Timeline image generation failed",
        message,
        severity: "error",
      });
    } finally {
      if (args.operationAuthority.isCurrent(operation)) {
        args.setIsImageMapCandidateGenerating(false);
      }
    }
  }, [args]);

  const onSelectImageMapCandidate = useCallback(async (candidateAssetId: string) => {
    if (!args.episodePackage || !args.selectedImageMapEntry) return;
    const currentEntryId = args.selectedImageMapEntry.id;
    if (args.imageMapSaveState === "editing" || args.imageMapSaveState === "saving") {
      args.setImageMapCandidateSelectionError("Save or finish editing this visual beat before selecting a still candidate.");
      return;
    }

    const workspace = args.workspaceId?.trim() ?? "";
    const episodeId = args.workpieceId?.trim() ?? "";
    if (!workspace || !episodeId) {
      args.setImageMapCandidateSelectionError("Workspace or workpiece is missing.");
      return;
    }

    if (args.selectedImageMapEntry.selected_asset_id === candidateAssetId) {
      args.setImageMapCandidateSelectionError(null);
      return;
    }
    const operation = args.operationAuthority.begin("is");

    args.setIsImageMapCandidateSelecting(true);
    args.setImageMapCandidateSelectionError(null);
    try {
      const selected = await selectWorkpieceImageMapCandidate({
        workpieceId: episodeId,
        workspaceId: workspace,
        imageMapEntryId: currentEntryId,
        candidateAssetId,
        expectedMetadataUpdatedAt: args.imageMapMetadataUpdatedAt,
        currentImageMap: {
          workpieceId: episodeId,
          workspaceId: workspace,
          entries: args.episodePackage.image_map.entries,
          spokenBeats: args.episodePackage.spoken_beats,
          metadataUpdatedAt: args.imageMapMetadataUpdatedAt,
          asset: null,
        },
      });
      if (!args.operationAuthority.isCurrent(operation)) return;

      if (!selected.ok) {
        const latest = selected.reason === "conflict" ? selected.latest ?? null : null;
        if (latest) {
          args.setEpisodePackage((prev) => (
            prev ? args.replaceEpisodePackageImageMap(prev, latest.entries, latest.spokenBeats) : prev
          ));
          args.setImageMapMetadataUpdatedAt(latest.metadataUpdatedAt);
        }
        args.setSelectedImageMapEntryId(currentEntryId);
        args.setImageMapCandidateSelectionError(
          selected.error
            ?? (selected.reason === "candidate_not_attached"
              ? "That still candidate is no longer attached to this visual beat."
              : selected.reason === "entry_not_found"
                ? "This visual beat no longer exists in the canonical image map."
                : selected.reason === "conflict"
                  ? "Image map changed since last load. Reloaded the latest canonical state."
                  : "Unable to save the selected still candidate."),
        );
        return;
      }

      args.setEpisodePackage((prev) => (
        prev ? args.replaceEpisodePackageImageMap(prev, selected.imageMap.entries, selected.imageMap.spokenBeats) : prev
      ));
      args.setImageMapMetadataUpdatedAt(selected.imageMap.metadataUpdatedAt);
      args.setImageMapCandidateSelectionError(null);
      const completedIndex = selected.imageMap.entries.findIndex((entry) => entry.id === currentEntryId);
      const nextEntryId = nextUnresolvedEpisodeImageId(selected.imageMap.entries, currentEntryId);
      if (!nextEntryId) {
        args.setImageMapExportMessage("Episode images complete. B-roll is ready.");
        args.setSelectedImageMapEntryId(currentEntryId);
      } else {
        const nextIndex = selected.imageMap.entries.findIndex((entry) => entry.id === nextEntryId);
        const completedNumber = completedIndex + 1;
        const nextNumber = nextIndex + 1;
        args.setImageMapExportMessage(`Image ${completedNumber} complete. Image ${nextNumber} is ready.`);
        args.setSelectedImageMapEntryId(nextEntryId);
        args.resetImageWorkspaceScroll();
      }
    } catch (error) {
      if (!args.operationAuthority.isCurrent(operation)) return;
      const message = error instanceof Error ? error.message : "Unable to save the selected still candidate.";
      args.setImageMapCandidateSelectionError(message);
    } finally {
      if (args.operationAuthority.isCurrent(operation)) {
        args.setIsImageMapCandidateSelecting(false);
      }
    }
  }, [args]);

  const onUploadImageMapAsset = useCallback(async (file: File) => {
    if (!args.episodePackage || !args.selectedImageMapEntry) return;
    if (args.imageMapSaveState === "editing" || args.imageMapSaveState === "saving") {
      args.setImageMapCandidateSelectionError("Save or finish editing this visual beat before uploading an asset.");
      return;
    }
    const workspace = args.workspaceId?.trim() ?? "";
    const episodeId = args.workpieceId?.trim() ?? "";
    if (!workspace || !episodeId) {
      args.setImageMapCandidateSelectionError("Workspace or workpiece is missing.");
      return;
    }
    const operation = args.operationAuthority.begin("iu");

    args.setIsImageMapCandidateSelecting(true);
    args.setImageMapCandidateSelectionError(null);
    args.setImageMapCandidateError(null);
    try {
      const targetWidth = args.thumbnailAspect === "9:16" ? 1080 : args.thumbnailAspect === "1:1" ? 1080 : 1280;
      const targetHeight = args.thumbnailAspect === "9:16" ? 1920 : args.thumbnailAspect === "1:1" ? 1080 : 720;
      const prepared = await prepareOutsideImageForFrame(file, targetWidth, targetHeight);
      const fittedBytes = new Uint8Array(prepared.bytes.byteLength);
      fittedBytes.set(prepared.bytes);
      const fittedFile = new File([fittedBytes.buffer], file.name.replace(/\.[^.]+$/, "") + ".png", {
        type: prepared.mimeType,
        lastModified: file.lastModified,
      });
      const uploaded = await uploadWorkpieceImageMapCandidateAsset({
        workpieceId: episodeId,
        entryId: args.selectedImageMapEntry.id,
        file: fittedFile,
        source: "upload",
        preparationEvidence: prepared.fitEvidence,
      });
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (!uploaded.ok) {
        args.setImageMapCandidateSelectionError(uploaded.error);
        return;
      }

      const updatedEntries = args.episodePackage.image_map.entries.map((entry) => {
        if (entry.id !== args.selectedImageMapEntry?.id) return entry;
        const existing = entry.candidate_assets.filter((asset) => asset.asset_id !== uploaded.candidateAsset.asset_id);
        const nextOrigin = entry.origin === "hammer"
          ? "mixed" as const
          : entry.origin === "creator_hearth"
          ? "creator_hearth" as const
          : "hearth" as const;
        return {
          ...entry,
          source_type: "upload",
          origin: nextOrigin,
          candidate_assets: [...existing, uploaded.candidateAsset],
          selected_asset_id: entry.selected_asset_id,
          status: entry.selected_asset_id ? "selected" as const : "candidates_generated" as const,
        };
      });

      const saved = await args.persistImageMapEntries({ entries: updatedEntries });
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (!saved.ok) {
        args.setImageMapCandidateSelectionError(saved.error);
        return;
      }
      args.setImageMapSourceTypeDraft("upload");
      args.setImageMapExportMessage("Uploaded image verified and ready to review. Choose Use this image to complete the script moment.");
      args.publishForgeNotice({
        job: "image-generated",
        title: "Visual asset uploaded",
        message: "Uploaded image is ready to review.",
        severity: "success",
      });
    } catch (error) {
      if (!args.operationAuthority.isCurrent(operation)) return;
      const message = error instanceof Error ? error.message : "Unable to upload this visual asset.";
      args.setImageMapCandidateSelectionError(message);
    } finally {
      if (args.operationAuthority.isCurrent(operation)) {
        args.setIsImageMapCandidateSelecting(false);
      }
    }
  }, [args]);

  return {
    onGenerateImageMapCandidates,
    onSelectImageMapCandidate,
    onUploadImageMapAsset,
  };
}
