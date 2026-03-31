import { useState } from "react";
import type { EpisodeLaunchVariantStatus } from "../../lib/episode-package-v2";
import { DEFAULT_HEARTH_VISUAL_STYLE } from "../../lib/hearth-visual-styles";
import type { ThumbnailBrandTemplate } from "../../lib/hearth-thumbnail-brand-templates";
import {
  DEFAULT_TITLE_STYLE,
  type EpisodeThumbnailTitleStyle,
} from "../../lib/hearth-title-fonts";

export function useThumbnailWorkspace() {
  const [selectedThumbnailTitleId, setSelectedThumbnailTitleId] = useState<string | null>(null);
  const [selectedThumbnailConceptId, setSelectedThumbnailConceptId] = useState<string>("");
  const [selectedThumbnailVersionId, setSelectedThumbnailVersionId] = useState<string | null>(null);
  const [selectedLaunchVariantId, setSelectedLaunchVariantId] = useState<string | null>(null);
  const [launchVariantStatusDraft, setLaunchVariantStatusDraft] = useState<EpisodeLaunchVariantStatus>("draft");
  const [launchVariantNotesDraft, setLaunchVariantNotesDraft] = useState("");
  const [thumbnailConceptLabelDraft, setThumbnailConceptLabelDraft] = useState("");
  const [thumbnailConceptPromptDraft, setThumbnailConceptPromptDraft] = useState("");
  const [thumbnailConceptStyleDraft, setThumbnailConceptStyleDraft] = useState(DEFAULT_HEARTH_VISUAL_STYLE);
  const [thumbnailTitleStyleDraft, setThumbnailTitleStyleDraft] = useState<EpisodeThumbnailTitleStyle>(DEFAULT_TITLE_STYLE);
  const [thumbnailConceptBrandTemplateIdDraft, setThumbnailConceptBrandTemplateIdDraft] = useState<string | null>(null);
  const [thumbnailBrandTemplates, setThumbnailBrandTemplates] = useState<ThumbnailBrandTemplate[]>([]);
  const [isThumbnailBrandTemplatesLoading, setIsThumbnailBrandTemplatesLoading] = useState(false);
  const [thumbnailBrandTemplatesError, setThumbnailBrandTemplatesError] = useState<string | null>(null);
  const [thumbnailBrandLogoDataUrl, setThumbnailBrandLogoDataUrl] = useState<string | null>(null);
  const [isThumbnailBrandLogoUploading, setIsThumbnailBrandLogoUploading] = useState(false);
  const [thumbnailBrandLogoError, setThumbnailBrandLogoError] = useState<string | null>(null);
  const [thumbnailBrandLogoStatus, setThumbnailBrandLogoStatus] = useState<string | null>(null);
  const [thumbnailAspect, setThumbnailAspect] = useState<"16:9" | "1:1" | "9:16">("16:9");
  const [isThumbnailGenerating, setIsThumbnailGenerating] = useState(false);
  const [isThumbnailConceptSaving, setIsThumbnailConceptSaving] = useState(false);
  const [isThumbnailUploading, setIsThumbnailUploading] = useState(false);
  const [thumbnailGenerateError, setThumbnailGenerateError] = useState<string | null>(null);
  const [thumbnailUploadError, setThumbnailUploadError] = useState<string | null>(null);
  const [thumbnailPairingError, setThumbnailPairingError] = useState<string | null>(null);
  const [thumbnailPreviewState, setThumbnailPreviewState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [thumbnailPreviewDataUrl, setThumbnailPreviewDataUrl] = useState<string | null>(null);
  const [thumbnailPreviewError, setThumbnailPreviewError] = useState<string | null>(null);
  const [thumbnailSafeZoneEnabled, setThumbnailSafeZoneEnabled] = useState(false);

  return {
    selectedThumbnailTitleId,
    setSelectedThumbnailTitleId,
    selectedThumbnailConceptId,
    setSelectedThumbnailConceptId,
    selectedThumbnailVersionId,
    setSelectedThumbnailVersionId,
    selectedLaunchVariantId,
    setSelectedLaunchVariantId,
    launchVariantStatusDraft,
    setLaunchVariantStatusDraft,
    launchVariantNotesDraft,
    setLaunchVariantNotesDraft,
    thumbnailConceptLabelDraft,
    setThumbnailConceptLabelDraft,
    thumbnailConceptPromptDraft,
    setThumbnailConceptPromptDraft,
    thumbnailConceptStyleDraft,
    setThumbnailConceptStyleDraft,
    thumbnailTitleStyleDraft,
    setThumbnailTitleStyleDraft,
    thumbnailConceptBrandTemplateIdDraft,
    setThumbnailConceptBrandTemplateIdDraft,
    thumbnailBrandTemplates,
    setThumbnailBrandTemplates,
    isThumbnailBrandTemplatesLoading,
    setIsThumbnailBrandTemplatesLoading,
    thumbnailBrandTemplatesError,
    setThumbnailBrandTemplatesError,
    thumbnailBrandLogoDataUrl,
    setThumbnailBrandLogoDataUrl,
    isThumbnailBrandLogoUploading,
    setIsThumbnailBrandLogoUploading,
    thumbnailBrandLogoError,
    setThumbnailBrandLogoError,
    thumbnailBrandLogoStatus,
    setThumbnailBrandLogoStatus,
    thumbnailAspect,
    setThumbnailAspect,
    isThumbnailGenerating,
    setIsThumbnailGenerating,
    isThumbnailConceptSaving,
    setIsThumbnailConceptSaving,
    isThumbnailUploading,
    setIsThumbnailUploading,
    thumbnailGenerateError,
    setThumbnailGenerateError,
    thumbnailUploadError,
    setThumbnailUploadError,
    thumbnailPairingError,
    setThumbnailPairingError,
    thumbnailPreviewState,
    setThumbnailPreviewState,
    thumbnailPreviewDataUrl,
    setThumbnailPreviewDataUrl,
    thumbnailPreviewError,
    setThumbnailPreviewError,
    thumbnailSafeZoneEnabled,
    setThumbnailSafeZoneEnabled,
  };
}
