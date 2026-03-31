import { useCallback, type Dispatch, type SetStateAction } from "react";
import {
  generateEpisodeThumbnail,
  uploadThumbnailImageVersion,
} from "../../lib/hearth-thumbnail-api";
import { getWorkpieceImageMap } from "../../lib/hearth-image-map-repo";
import {
  updateWorkspaceThumbnailBrandTemplate,
  uploadWorkspaceThumbnailBrandLogo,
  type ThumbnailBrandTemplate,
} from "../../lib/hearth-thumbnail-brand-templates";
import { resolveAiThumbnailAutoApproveFromStorage } from "../../lib/hearth-chat-api";
import type {
  EpisodeImageMapEntry,
  EpisodePackageV2,
  EpisodeSpokenBeat,
  EpisodeThumbnailVersion,
} from "../../lib/episode-package-v2";
import { DEFAULT_HEARTH_VISUAL_STYLE } from "../../lib/hearth-visual-styles";
import { DEFAULT_TITLE_STYLE } from "../../lib/hearth-title-fonts";

type PersistThumbnailEpisodePackage = (
  nextEpisodePackage: EpisodePackageV2,
  eventName: string,
  eventPayload: Record<string, unknown>,
) => Promise<EpisodePackageV2 | null>;

type UseThumbnailGenerationActionsArgs = {
  workpieceId: string | null;
  workspaceId: string | null;
  episodePackage: EpisodePackageV2 | null;
  selectedThumbnailConceptId: string;
  selectedThumbnailBrandTemplate: ThumbnailBrandTemplate | null;
  defaultThumbnailBrandTemplateId: string | null;
  thumbnailAspect: "16:9" | "1:1" | "9:16";
  isAiProcessing: boolean;
  isApprovingScript: boolean;
  isThumbnailGenerating: boolean;
  isThumbnailUploading: boolean;
  isThumbnailConceptSaving: boolean;
  aiBillingMode: string;
  aiTokenBalance: number | null;
  persistThumbnailEpisodePackage: PersistThumbnailEpisodePackage;
  replaceEpisodePackageImageMap: (
    episodePackage: EpisodePackageV2,
    entries: EpisodeImageMapEntry[],
    spokenBeats: EpisodeSpokenBeat[],
  ) => EpisodePackageV2;
  createThumbnailClientId: (prefix: string) => string;
  setEpisodePackage: (next: EpisodePackageV2) => void;
  setSelectedThumbnailConceptId: (next: string) => void;
  setSelectedThumbnailVersionId: (next: string | null) => void;
  setThumbnailBrandTemplates: Dispatch<SetStateAction<ThumbnailBrandTemplate[]>>;
  setImageMapMetadataUpdatedAt: (next: string | null) => void;
  setAiTokenBalance: (next: number | null) => void;
  setAiRuntimeWarning: (next: string | null) => void;
  setIsThumbnailGenerating: (next: boolean) => void;
  setIsThumbnailUploading: (next: boolean) => void;
  setIsThumbnailBrandLogoUploading: (next: boolean) => void;
  setThumbnailGenerateError: (next: string | null) => void;
  setThumbnailUploadError: (next: string | null) => void;
  setThumbnailBrandLogoError: (next: string | null) => void;
  setThumbnailBrandLogoStatus: (next: string | null) => void;
  setThumbnailBrandLogoDataUrl: (next: string | null) => void;
  publishForgeNotice: (notice: {
    job: "image-generated" | "job-failed";
    title: string;
    message?: string;
    severity: "success" | "error";
  }) => void;
};

export function useThumbnailGenerationActions(args: UseThumbnailGenerationActionsArgs) {
  const onGenerateThumbnailVersion = useCallback(async (options?: {
    forceConceptId?: string | null;
    forcePrompt?: string | null;
  }) => {
    if (args.isAiProcessing || args.isApprovingScript || args.isThumbnailGenerating || args.isThumbnailUploading) return;

    const episodeId = args.workpieceId?.trim() ?? "";
    const workspace = args.workspaceId?.trim() ?? "";
    if (!episodeId || !workspace || !args.episodePackage) {
      args.setThumbnailGenerateError("Select an Episode before generating thumbnails.");
      return;
    }
    if (args.aiBillingMode === "forge" && args.aiTokenBalance != null && args.aiTokenBalance <= 0) {
      args.setThumbnailGenerateError("No AI credits remaining.");
      return;
    }

    const conceptId = options?.forceConceptId ?? (args.selectedThumbnailConceptId.trim() || null);
    const resolvedConcept = conceptId
      ? args.episodePackage.thumbnail.concepts.find((concept) => concept.id === conceptId) ?? null
      : null;
    const promptOverride = options?.forcePrompt?.trim() || null;
    const effectiveStylePreset = conceptId && conceptId === args.selectedThumbnailConceptId
      ? resolvedConcept?.style_preset ?? DEFAULT_HEARTH_VISUAL_STYLE
      : resolvedConcept?.style_preset ?? DEFAULT_HEARTH_VISUAL_STYLE;
    const usedPrompt = (promptOverride || resolvedConcept?.prompt_text || "").trim();
    if (!conceptId && !promptOverride) {
      args.setThumbnailGenerateError("Select a concept or provide a prompt override.");
      return;
    }
    if (!usedPrompt) {
      args.setThumbnailGenerateError("Prompt is empty.");
      return;
    }

    const alwaysApproveSpend = resolveAiThumbnailAutoApproveFromStorage();
    const confirmed = alwaysApproveSpend
      ? true
      : window.confirm("Generate thumbnail? This will spend credits.");
    if (!confirmed) return;

    args.setIsThumbnailGenerating(true);
    args.setThumbnailGenerateError(null);
    args.setThumbnailUploadError(null);
    args.setAiRuntimeWarning(null);
    try {
      const generated = await generateEpisodeThumbnail({
        workspaceId: workspace,
        workpieceId: episodeId,
        conceptId,
        prompt: promptOverride,
        preset: effectiveStylePreset,
        aspect: args.thumbnailAspect,
        confirmSpend: confirmed,
        alwaysApproveAiSpend: alwaysApproveSpend,
      });
      if (!generated.ok) {
        args.setThumbnailGenerateError(generated.error);
        const failedVersionId = args.createThumbnailClientId("thumb-failed-version");
        const failedVersion: EpisodeThumbnailVersion = {
          id: failedVersionId,
          concept_id: conceptId ?? resolvedConcept?.id ?? "concept-failed",
          created_at: new Date().toISOString(),
          provider: "openai",
          prompt: usedPrompt,
          asset_id: `failed:${failedVersionId}`,
          status: "failed",
          error: generated.error,
          provider_request_id: null,
          asset_path: null,
          mime_type: null,
        };
        const failedEpisodePackage: EpisodePackageV2 = {
          ...args.episodePackage,
          thumbnail: {
            ...args.episodePackage.thumbnail,
            versions: [...args.episodePackage.thumbnail.versions, failedVersion],
          },
        };
        const savedFailed = await args.persistThumbnailEpisodePackage(
          failedEpisodePackage,
          "hearth.thumbnail.version.failed.v1",
          { version_id: failedVersion.id, concept_id: failedVersion.concept_id },
        );
        if (savedFailed) {
          args.setSelectedThumbnailVersionId(failedVersion.id);
        }
        args.publishForgeNotice({
          job: "job-failed",
          title: "Thumbnail generation failed",
          message: generated.error,
          severity: "error",
        });
        return;
      }

      let nextEpisodePackage = generated.updatedEpisodePackage;
      const refreshedImageMap = await getWorkpieceImageMap(episodeId);
      if (refreshedImageMap.ok) {
        nextEpisodePackage = args.replaceEpisodePackageImageMap(
          generated.updatedEpisodePackage,
          refreshedImageMap.imageMap.entries,
          refreshedImageMap.imageMap.spokenBeats,
        );
        args.setImageMapMetadataUpdatedAt(refreshedImageMap.imageMap.metadataUpdatedAt);
      }
      args.setEpisodePackage(nextEpisodePackage);
      args.setSelectedThumbnailConceptId(generated.version.concept_id);
      args.setSelectedThumbnailVersionId(generated.version.id);
      if (typeof generated.tokenBalance === "number") {
        args.setAiTokenBalance(generated.tokenBalance);
      }
      if (generated.creditsWarning) {
        args.setAiRuntimeWarning(generated.creditsWarning);
      }
      args.publishForgeNotice({
        job: "image-generated",
        title: "Thumbnail ready",
        message: "Hearth finished generating a thumbnail for this episode.",
        severity: "success",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Thumbnail generation failed.";
      args.setThumbnailGenerateError(message);
      args.publishForgeNotice({
        job: "job-failed",
        title: "Thumbnail generation failed",
        message,
        severity: "error",
      });
    } finally {
      args.setIsThumbnailGenerating(false);
    }
  }, [args]);

  const onRetryFailedThumbnailVersion = useCallback(async (version: EpisodeThumbnailVersion) => {
    await onGenerateThumbnailVersion({
      forceConceptId: version.concept_id,
      forcePrompt: version.prompt,
    });
  }, [onGenerateThumbnailVersion]);

  const onUploadThumbnailBrandLogo = useCallback(async (file: File) => {
    const template = args.selectedThumbnailBrandTemplate;
    const workspace = template?.workspaceId?.trim() ?? "";
    const episodeId = args.workpieceId?.trim() ?? "";
    if (!workspace || !episodeId || !template) {
      args.setThumbnailBrandLogoError("Select a brand template before uploading a logo.");
      return;
    }

    args.setIsThumbnailBrandLogoUploading(true);
    args.setThumbnailBrandLogoError(null);
    args.setThumbnailBrandLogoStatus(null);
    try {
      const uploaded = await uploadWorkspaceThumbnailBrandLogo({
        workpieceId: episodeId,
        templateId: template.id,
        file,
      });
      if (!uploaded.ok) {
        args.setThumbnailBrandLogoError(uploaded.error);
        return;
      }

      const updatedTemplateJson = {
        ...template.templateJson,
        logo: {
          ...template.templateJson.logo,
          workpiece_id: episodeId,
          asset_path: uploaded.assetPath,
          mime_type: uploaded.mimeType,
        },
      };

      const updated = await updateWorkspaceThumbnailBrandTemplate(workspace, template.id, {
        templateJson: updatedTemplateJson,
      });
      if (!updated.ok) {
        args.setThumbnailBrandLogoError(updated.error);
        return;
      }

      args.setThumbnailBrandTemplates((prev) => prev.map((item) => (
        item.id === updated.data.id ? updated.data : item
      )));
      args.setThumbnailBrandLogoError(null);
      args.setThumbnailBrandLogoStatus(`Logo uploaded for "${updated.data.name}".`);
      args.publishForgeNotice({
        job: "image-generated",
        title: "Brand logo uploaded",
        message: "Thumbnail branding logo was saved successfully.",
        severity: "success",
      });
    } finally {
      args.setIsThumbnailBrandLogoUploading(false);
    }
  }, [args]);

  const onRemoveThumbnailBrandLogo = useCallback(async () => {
    const template = args.selectedThumbnailBrandTemplate;
    const workspace = template?.workspaceId?.trim() ?? "";
    if (!workspace || !template) {
      args.setThumbnailBrandLogoError("Select a brand template before removing a logo.");
      return;
    }

    args.setIsThumbnailBrandLogoUploading(true);
    args.setThumbnailBrandLogoError(null);
    args.setThumbnailBrandLogoStatus(null);
    try {
      const updated = await updateWorkspaceThumbnailBrandTemplate(workspace, template.id, {
        templateJson: {
          ...template.templateJson,
          logo: {
            ...template.templateJson.logo,
            workpiece_id: null,
            asset_path: null,
            mime_type: null,
          },
        },
      });
      if (!updated.ok) {
        args.setThumbnailBrandLogoError(updated.error);
        return;
      }

      args.setThumbnailBrandTemplates((prev) => prev.map((item) => (
        item.id === updated.data.id ? updated.data : item
      )));
      args.setThumbnailBrandLogoDataUrl(null);
      args.setThumbnailBrandLogoError(null);
      args.setThumbnailBrandLogoStatus(`Logo removed from "${updated.data.name}".`);
    } finally {
      args.setIsThumbnailBrandLogoUploading(false);
    }
  }, [args]);

  const onUploadThumbnailImage = useCallback(async (file: File) => {
    if (args.isThumbnailUploading || args.isThumbnailGenerating || args.isThumbnailConceptSaving) return;
    if (!args.episodePackage) return;

    const episodeId = args.workpieceId?.trim() ?? "";
    const workspace = args.workspaceId?.trim() ?? "";
    if (!episodeId || !workspace) {
      args.setThumbnailUploadError("Select an Episode before uploading.");
      return;
    }

    const selectedConcept = args.selectedThumbnailConceptId
      ? args.episodePackage.thumbnail.concepts.find((concept) => concept.id === args.selectedThumbnailConceptId) ?? null
      : null;

    let effectiveConcept = selectedConcept;
    let workingEpisodePackage = args.episodePackage;
    if (!effectiveConcept) {
      effectiveConcept = {
        id: args.createThumbnailClientId("thumb-concept-upload"),
        label: "Uploaded",
        prompt_text: "Uploaded image",
        style_preset: DEFAULT_HEARTH_VISUAL_STYLE,
        title_style: DEFAULT_TITLE_STYLE,
        brand_template_id: args.defaultThumbnailBrandTemplateId,
      };
      workingEpisodePackage = {
        ...args.episodePackage,
        thumbnail: {
          ...args.episodePackage.thumbnail,
          concepts: [...args.episodePackage.thumbnail.concepts, effectiveConcept],
        },
      };
    }

    args.setIsThumbnailUploading(true);
    args.setThumbnailUploadError(null);
    args.setThumbnailGenerateError(null);
    try {
      const uploaded = await uploadThumbnailImageVersion({
        workpieceId: episodeId,
        concept: effectiveConcept,
        file,
      });
      if (!uploaded.ok) {
        args.setThumbnailUploadError(uploaded.error);
        return;
      }

      const nextEpisodePackage: EpisodePackageV2 = {
        ...workingEpisodePackage,
        thumbnail: {
          ...workingEpisodePackage.thumbnail,
          versions: [...workingEpisodePackage.thumbnail.versions, uploaded.version],
          primary_version_id: uploaded.version.id,
        },
      };

      const saved = await args.persistThumbnailEpisodePackage(
        nextEpisodePackage,
        "hearth.thumbnail.upload.version.saved.v1",
        { version_id: uploaded.version.id, concept_id: uploaded.version.concept_id },
      );
      if (!saved) return;
      args.setSelectedThumbnailConceptId(uploaded.version.concept_id);
      args.setSelectedThumbnailVersionId(uploaded.version.id);
    } finally {
      args.setIsThumbnailUploading(false);
    }
  }, [args]);

  return {
    onGenerateThumbnailVersion,
    onRetryFailedThumbnailVersion,
    onUploadThumbnailBrandLogo,
    onRemoveThumbnailBrandLogo,
    onUploadThumbnailImage,
  };
}
