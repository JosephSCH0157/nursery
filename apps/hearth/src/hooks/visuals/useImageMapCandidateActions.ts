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
import type { EpisodeImageMapEntry, EpisodePackageV2 } from "../../lib/episode-package-v2";

type CanonicalScriptResult =
  | {
      ok: true;
      text: string;
      source: "primary_script" | "saved_draft";
      includesUnsavedLocalEdits: boolean;
    }
  | {
      ok: false;
      message: string;
    };

type UseImageMapCandidateActionsArgs = {
  workpieceId: string | null;
  workspaceId: string | null;
  episodePackage: EpisodePackageV2 | null;
  selectedImageMapEntry: EpisodeImageMapEntry | null;
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

    let expectedMetadataUpdatedAt = args.imageMapMetadataUpdatedAt;
    let context: { before: string | null; after: string | null };

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
    const confirmed = alwaysApproveSpend
      ? true
      : window.confirm(
          mode === "stock"
            ? "Find stock-style still candidates for this visual beat? This will spend AI credits."
            : "Generate two still candidates for this visual beat? This will spend AI credits.",
        );
    if (!confirmed) return;

    const requestedSourceType = mode === "stock" ? "stock" : "ai";
    if (args.selectedImageMapEntry.source_type !== requestedSourceType) {
      const updatedEntries = args.episodePackage.image_map.entries.map((entry) => (
        entry.id === args.selectedImageMapEntry?.id
          ? {
              ...entry,
              source_type: requestedSourceType,
              origin: "hearth" as const,
            }
          : entry
      ));
      const sourceSaved = await args.persistImageMapEntries({ entries: updatedEntries });
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
      const requestCandidateGeneration = (metadataUpdatedAt: string | null | undefined) => (
        generateWorkpieceImageMapCandidates({
          workpieceId: episodeId,
          workspaceId: workspace,
          imageMapEntryId: args.selectedImageMapEntry!.id,
          expectedMetadataUpdatedAt: metadataUpdatedAt,
          contextBefore: context.before,
          contextAfter: context.after,
          aspect: args.thumbnailAspect,
          confirmSpend: confirmed,
          alwaysApproveAiSpend: alwaysApproveSpend,
        })
      );

      let generated = await requestCandidateGeneration(expectedMetadataUpdatedAt);

      if (!generated.ok && generated.reason === "conflict" && generated.latest) {
        const latest = generated.latest;
        args.setEpisodePackage((prev) => (
          prev ? args.replaceEpisodePackageImageMap(prev, latest.entries, latest.spokenBeats) : prev
        ));
        args.setImageMapMetadataUpdatedAt(latest.metadataUpdatedAt);
        generated = await requestCandidateGeneration(latest.metadataUpdatedAt);
      }

      if (!generated.ok) {
        const failureMessage = generated.error
          ?? (generated.reason === "conflict"
            ? "Image map changed since last load. Reloaded the latest canonical state."
            : "Still-candidate generation failed.");
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
          ? `Found ${generated.generatedAssets.length} stock-style still candidates for the selected visual beat.`
          : `Generated ${generated.generatedAssets.length} still candidates for the selected visual beat.`,
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
        message: `${mode === "stock" ? "Found" : "Generated"} ${generated.generatedAssets.length} still candidate${generated.generatedAssets.length === 1 ? "" : "s"} for the selected visual beat.`,
        severity: "success",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Still-candidate generation failed.";
      args.setImageMapCandidateError(message);
      args.publishForgeNotice({
        job: "job-failed",
        title: "Timeline image generation failed",
        message,
        severity: "error",
      });
    } finally {
      args.setIsImageMapCandidateGenerating(false);
    }
  }, [args]);

  const onSelectImageMapCandidate = useCallback(async (candidateAssetId: string) => {
    if (!args.episodePackage || !args.selectedImageMapEntry) return;
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

    args.setIsImageMapCandidateSelecting(true);
    args.setImageMapCandidateSelectionError(null);
    try {
      const selected = await selectWorkpieceImageMapCandidate({
        workpieceId: episodeId,
        workspaceId: workspace,
        imageMapEntryId: args.selectedImageMapEntry.id,
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

      if (!selected.ok) {
        const latest = selected.reason === "conflict" ? selected.latest ?? null : null;
        if (latest) {
          args.setEpisodePackage((prev) => (
            prev ? args.replaceEpisodePackageImageMap(prev, latest.entries, latest.spokenBeats) : prev
          ));
          args.setImageMapMetadataUpdatedAt(latest.metadataUpdatedAt);
        }
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
      args.setImageMapExportMessage("Selected still candidate saved canonically for this visual beat.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save the selected still candidate.";
      args.setImageMapCandidateSelectionError(message);
    } finally {
      args.setIsImageMapCandidateSelecting(false);
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

    args.setIsImageMapCandidateSelecting(true);
    args.setImageMapCandidateSelectionError(null);
    args.setImageMapCandidateError(null);
    try {
      const uploaded = await uploadWorkpieceImageMapCandidateAsset({
        workpieceId: episodeId,
        entryId: args.selectedImageMapEntry.id,
        file,
        source: "upload",
      });
      if (!uploaded.ok) {
        args.setImageMapCandidateSelectionError(uploaded.error);
        return;
      }

      const updatedEntries = args.episodePackage.image_map.entries.map((entry) => {
        if (entry.id !== args.selectedImageMapEntry?.id) return entry;
        const existing = entry.candidate_assets.filter((asset) => asset.asset_id !== uploaded.candidateAsset.asset_id);
        const nextOrigin: "hearth" | "mixed" = entry.origin === "hammer" ? "mixed" : "hearth";
        return {
          ...entry,
          source_type: "upload",
          origin: nextOrigin,
          candidate_assets: [...existing, uploaded.candidateAsset],
          selected_asset_id: uploaded.candidateAsset.asset_id,
          status: "selected" as const,
        };
      });

      const saved = await args.persistImageMapEntries({ entries: updatedEntries });
      if (!saved.ok) {
        args.setImageMapCandidateSelectionError(saved.error);
        return;
      }
      args.setImageMapSourceTypeDraft("upload");
      args.setImageMapExportMessage("Uploaded visual asset attached and selected for this beat.");
      args.publishForgeNotice({
        job: "image-generated",
        title: "Visual asset uploaded",
        message: "Uploaded asset is now selected for this visual beat.",
        severity: "success",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to upload this visual asset.";
      args.setImageMapCandidateSelectionError(message);
    } finally {
      args.setIsImageMapCandidateSelecting(false);
    }
  }, [args]);

  return {
    onGenerateImageMapCandidates,
    onSelectImageMapCandidate,
    onUploadImageMapAsset,
  };
}
