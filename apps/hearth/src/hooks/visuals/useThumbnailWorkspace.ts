import { useCallback, useState } from "react";
import type {
  EpisodeLaunchVariant,
  EpisodeLaunchVariantStatus,
  EpisodeThumbnailConcept,
  EpisodeThumbnailVersion,
} from "../../lib/episode-package-v2";
import { DEFAULT_HEARTH_VISUAL_STYLE, normalizeHearthVisualStyle } from "../../lib/hearth-visual-styles";
import type { ThumbnailBrandTemplate } from "../../lib/hearth-thumbnail-brand-templates";
import {
  DEFAULT_TITLE_STYLE,
  normalizeEpisodeThumbnailTitleStyle,
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

  const syncSelectedThumbnailConceptId = useCallback((thumbnailConcepts: EpisodeThumbnailConcept[]): void => {
    if (thumbnailConcepts.length === 0) {
      setSelectedThumbnailConceptId("");
      return;
    }
    setSelectedThumbnailConceptId((current) => (
      current && thumbnailConcepts.some((concept) => concept.id === current)
        ? current
        : (thumbnailConcepts[0]?.id ?? "")
    ));
  }, []);

  const syncThumbnailConceptDraftFromConcept = useCallback((
    selectedThumbnailConcept: EpisodeThumbnailConcept | null,
    defaultThumbnailBrandTemplateId: string | null,
  ): void => {
    if (!selectedThumbnailConcept) {
      setThumbnailConceptLabelDraft("");
      setThumbnailConceptPromptDraft("");
      setThumbnailConceptStyleDraft(DEFAULT_HEARTH_VISUAL_STYLE);
      setThumbnailTitleStyleDraft(DEFAULT_TITLE_STYLE);
      setThumbnailConceptBrandTemplateIdDraft(defaultThumbnailBrandTemplateId);
      return;
    }
    setThumbnailConceptLabelDraft(selectedThumbnailConcept.label);
    setThumbnailConceptPromptDraft(selectedThumbnailConcept.prompt_text);
    setThumbnailConceptStyleDraft(normalizeHearthVisualStyle(selectedThumbnailConcept.style_preset));
    setThumbnailTitleStyleDraft(normalizeEpisodeThumbnailTitleStyle(selectedThumbnailConcept.title_style));
    setThumbnailConceptBrandTemplateIdDraft(selectedThumbnailConcept.brand_template_id ?? null);
  }, []);

  const syncSelectedLaunchVariantId = useCallback((launchVariants: EpisodeLaunchVariant[]): void => {
    if (launchVariants.length === 0) {
      setSelectedLaunchVariantId(null);
      return;
    }
    setSelectedLaunchVariantId((current) => (
      current && launchVariants.some((variant) => variant.id === current)
        ? current
        : null
    ));
  }, []);

  const syncLaunchVariantDraftFromVariant = useCallback((selectedLaunchVariant: EpisodeLaunchVariant | null): void => {
    if (!selectedLaunchVariant) {
      setLaunchVariantStatusDraft("draft");
      setLaunchVariantNotesDraft("");
      return;
    }
    setLaunchVariantStatusDraft(selectedLaunchVariant.status);
    setLaunchVariantNotesDraft(selectedLaunchVariant.notes ?? "");
  }, []);

  const syncSelectedThumbnailTitleId = useCallback((
    thumbnailTitleOptions: Array<{ id: string }>,
    preferredTitleId: string | null,
  ): void => {
    if (thumbnailTitleOptions.length === 0) {
      setSelectedThumbnailTitleId(null);
      return;
    }
    setSelectedThumbnailTitleId((current) => (
      current && thumbnailTitleOptions.some((title) => title.id === current)
        ? current
        : (preferredTitleId ?? thumbnailTitleOptions[0]?.id ?? null)
    ));
  }, []);

  const syncSelectedThumbnailVersionId = useCallback((
    thumbnailVersions: EpisodeThumbnailVersion[],
    selectedThumbnailConceptId: string,
    primaryThumbnailVersionId: string | null,
  ): void => {
    if (thumbnailVersions.length === 0) {
      setSelectedThumbnailVersionId(null);
      return;
    }
    const eligibleVersions = selectedThumbnailConceptId
      ? thumbnailVersions.filter((version) => version.concept_id === selectedThumbnailConceptId)
      : thumbnailVersions;
    if (selectedThumbnailConceptId && eligibleVersions.length === 0) {
      setSelectedThumbnailVersionId(null);
      return;
    }
    setSelectedThumbnailVersionId((current) => {
      if (current && eligibleVersions.some((version) => version.id === current)) {
        return current;
      }
      return (primaryThumbnailVersionId && eligibleVersions.some((version) => version.id === primaryThumbnailVersionId))
        ? primaryThumbnailVersionId
        : eligibleVersions
          .slice()
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.id
        ?? null;
    });
  }, []);

  const resetThumbnailWorkspaceViewState = useCallback((): void => {
    setThumbnailAspect("16:9");
    setThumbnailSafeZoneEnabled(false);
    setThumbnailPairingError(null);
    setThumbnailPreviewState("idle");
    setThumbnailPreviewDataUrl(null);
    setThumbnailPreviewError(null);
  }, []);

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
    syncSelectedThumbnailConceptId,
    syncThumbnailConceptDraftFromConcept,
    syncSelectedLaunchVariantId,
    syncLaunchVariantDraftFromVariant,
    syncSelectedThumbnailTitleId,
    syncSelectedThumbnailVersionId,
    resetThumbnailWorkspaceViewState,
  };
}
