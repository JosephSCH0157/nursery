import { useCallback, useEffect, useRef, useState } from "react";
import type {
  EpisodeLaunchVariant,
  EpisodeLaunchVariantStatus,
  EpisodeSeoTitle,
  EpisodeThumbnailConcept,
  EpisodeThumbnailVersion,
} from "../../lib/episode-package-v2";
import {
  EPISODE_LAUNCH_VARIANT_STATUS_VALUES,
} from "../../lib/episode-package-v2";
import { HEARTH_VISUAL_STYLE_DEFINITIONS } from "../../lib/hearth-visual-styles";
import {
  TITLE_FONT_PRESETS,
  TITLE_SHADOW_STRENGTH_VALUES,
  normalizeEpisodeThumbnailTitleStyle,
} from "../../lib/hearth-title-fonts";
import type { EpisodeThumbnailTitleStyle, TitleShadowStrength } from "../../lib/hearth-title-fonts";
import {
  resolveThumbnailBrandRender,
} from "../../lib/hearth-thumbnail-brand-templates";
import type { ThumbnailBrandTemplate } from "../../lib/hearth-thumbnail-brand-templates";
import {
  lintThumbnail,
  type Rect,
  type ThumbnailLintResult,
  type ThumbnailLintStatus,
} from "../../lib/thumbnail-lint";
import {
  evaluateThumbnailConcepts,
  type ThumbnailEvaluation,
} from "../../lib/thumbnail-ctr-evaluator";
import { resolveHearthThumbnailOverlayText } from "../../lib/hearth-thumbnail-title-contract";
import {
  formatThumbnailPanelMeta,
  resolveThumbnailPreviewStatus,
  resolveThumbnailWorkspaceGuidance,
} from "../../lib/hearth-thumbnail-workflow";
import {
  buildThumbnailPrompts,
  type PromptVariant,
} from "../../lib/hearth-thumbnail-prompt-builder";
import ThumbnailVersions from "./ThumbnailVersions";

type ThumbnailPanelProps = {
  concepts: EpisodeThumbnailConcept[];
  versions: EpisodeThumbnailVersion[];
  titleOptions: EpisodeSeoTitle[];
  launchVariants: EpisodeLaunchVariant[];
  selectedTitleId: string | null;
  selectedTitleText: string;
  selectedConceptId: string;
  selectedVersionId: string | null;
  selectedLaunchVariantId: string | null;
  selectedLaunchVariantStatus: EpisodeLaunchVariantStatus;
  selectedLaunchVariantNotes: string;
  selectedLaunchVariantLastTestedAt: string | null;
  selectedLaunchVariantWinnerSelectedAt: string | null;
  primaryVersionId: string | null;
  selectedConceptLabel: string;
  selectedConceptPrompt: string;
  selectedConceptStylePreset: string;
  selectedConceptTitleStyle: EpisodeThumbnailTitleStyle;
  brandTemplates: ThumbnailBrandTemplate[];
  brandTemplatesLoading: boolean;
  brandTemplatesError: string | null;
  selectedConceptBrandTemplateId: string | null;
  selectedBrandTemplateLogoDataUrl: string | null;
  brandLogoUploading: boolean;
  brandLogoError: string | null;
  brandLogoStatus: string | null;
  aspect: "16:9" | "1:1" | "9:16";
  safeZoneEnabled: boolean;
  previewDataUrl: string | null;
  previewState: "idle" | "loading" | "ready" | "error";
  previewError: string | null;
  generateError: string | null;
  uploadError: string | null;
  pairingError: string | null;
  canGenerateConcepts?: boolean;
  isGeneratingConcepts?: boolean;
  canGenerateTitles?: boolean;
  isGeneratingTitles?: boolean;
  isGenerating: boolean;
  isSavingConcept: boolean;
  isUploading: boolean;
  onGenerateTitles?: () => void;
  onSelectTitle: (titleId: string) => void;
  onSelectConcept: (conceptId: string) => void;
  onSelectedConceptLabelChange: (value: string) => void;
  onSelectedConceptPromptChange: (value: string) => void;
  onSelectedConceptStylePresetChange: (value: string) => void;
  onSelectedConceptTitleFontPresetChange: (value: string) => void;
  onSelectedConceptTitleColorChange: (value: string) => void;
  onSelectedConceptTitleShadowEnabledChange: (value: boolean) => void;
  onSelectedConceptTitleShadowStrengthChange: (value: TitleShadowStrength) => void;
  onSelectedConceptBrandTemplateChange: (value: string | null) => void;
  onUploadBrandLogo: (file: File) => void;
  onRemoveBrandLogo: () => void;
  onGenerateConcepts?: () => void;
  onCreateConcept: () => void;
  onSaveConcept: () => void;
  onDeleteConcept: () => void;
  onAspectChange: (value: "16:9" | "1:1" | "9:16") => void;
  onToggleSafeZone: () => void;
  onUploadImage: (file: File) => void;
  onSelectVersion: (versionId: string) => void;
  onSetPrimary: (versionId: string) => void;
  onRetryVersion: (version: EpisodeThumbnailVersion) => void;
  onSelectLaunchVariant: (variantId: string) => void;
  onCreateLaunchVariant: () => void;
  onSelectedLaunchVariantStatusChange: (value: EpisodeLaunchVariantStatus) => void;
  onSelectedLaunchVariantNotesChange: (value: string) => void;
  onSaveLaunchVariant: () => void;
};

function resolveVariantLabel(index: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return `Variant ${alphabet[index] ?? index + 1}`;
}

function resolveLaunchVariantStatusLabel(status: EpisodeLaunchVariantStatus): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "tested":
      return "Tested";
    case "winner":
      return "Winner";
    default:
      return "Draft";
  }
}

function formatVariantTimestamp(timestamp: string | null): string | null {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toLocaleString();
}

function resolveColorInputValue(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : "#FFFFFF";
}

function resolveCtrLabel(label: ThumbnailEvaluation["labels"][number]): string {
  switch (label) {
    case "recommended_click_candidate":
      return "Recommended Click Candidate";
    case "strong_alternate":
      return "Strong Alternate";
    case "safe_pick":
      return "Safe Pick";
    case "high_risk_high_reward":
      return "High-Risk / High-Reward";
    default:
      return label;
  }
}

function resolveCtrBadgeClassName(label: ThumbnailEvaluation["labels"][number]): string {
  switch (label) {
    case "recommended_click_candidate":
      return "hs-thumb-ctr-badge is-recommended";
    case "strong_alternate":
      return "hs-thumb-ctr-badge is-strong-alt";
    case "safe_pick":
      return "hs-thumb-ctr-badge is-safe";
    case "high_risk_high_reward":
      return "hs-thumb-ctr-badge is-risky";
    default:
      return "hs-thumb-ctr-badge";
  }
}

function buildRecommendationSummary(evaluation: ThumbnailEvaluation): string {
  const signals: string[] = [];
  if (evaluation.curiosityScore >= 70) signals.push("high curiosity");
  if (evaluation.clarityScore >= 70) signals.push("strong contrast/readability");
  if (evaluation.emotionScore >= 70) signals.push("good emotional pull");
  if (!signals.length) signals.push("balanced engagement signals");
  return signals.join(", ");
}

type ThumbnailAuditState = {
  mode: "idle" | "running" | "ready" | "error";
  result: ThumbnailLintResult | null;
  error: string | null;
};

function formatAuditOverallLabel(status: ThumbnailLintStatus): string {
  switch (status) {
    case "fail":
      return "Needs Attention";
    case "warning":
      return "Warning";
    default:
      return "Pass";
  }
}

function formatAuditStateLabel(state: ThumbnailAuditState): string {
  if (state.mode === "running") return "Analyzing";
  if (!state.result) return "Not Run";
  return formatAuditOverallLabel(state.result.overall);
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Thumbnail preview image could not be loaded for analysis."));
    image.src = src;
  });
}

async function loadRenderedPreviewImageData(
  src: string,
  treatment: { darken: number; blur: number },
): Promise<{ width: number; height: number; imageData: ImageData }> {
  const image = await loadImageElement(src);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, image.naturalWidth || image.width);
  canvas.height = Math.max(1, image.naturalHeight || image.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Canvas 2D context was unavailable for thumbnail analysis.");
  }

  if (treatment.blur > 0) {
    ctx.filter = `blur(${treatment.blur}px)`;
  }
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  ctx.filter = "none";

  if (treatment.darken > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${treatment.darken})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  return {
    width: canvas.width,
    height: canvas.height,
    imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
  };
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back for browsers that reject direct Clipboard API writes.
    }
  }

  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.left = "-1000px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

function resolvePromptVariantLabel(style: PromptVariant["style"]): string {
  switch (style) {
    case "high_ctr":
      return "High CTR";
    case "balanced":
      return "Balanced";
    default:
      return "Subtle";
  }
}

function measureRenderedTextBox(
  previewEl: HTMLDivElement,
  textEl: HTMLDivElement,
  imageWidth: number,
  imageHeight: number,
): { rect: Rect; lineCount: number } {
  const previewRect = previewEl.getBoundingClientRect();
  const textRect = textEl.getBoundingClientRect();
  const scaleX = previewRect.width > 0 ? imageWidth / previewRect.width : 1;
  const scaleY = previewRect.height > 0 ? imageHeight / previewRect.height : 1;
  const style = window.getComputedStyle(textEl);
  const fontSize = Number.parseFloat(style.fontSize) || 32;
  const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.05;

  return {
    rect: {
      x: Math.max(0, (textRect.left - previewRect.left) * scaleX),
      y: Math.max(0, (textRect.top - previewRect.top) * scaleY),
      width: Math.max(1, textRect.width * scaleX),
      height: Math.max(1, textRect.height * scaleY),
    },
    lineCount: Math.max(1, Math.round(textRect.height / Math.max(1, lineHeight))),
  };
}

export default function ThumbnailPanel({
  concepts,
  versions,
  titleOptions,
  launchVariants,
  selectedTitleId,
  selectedTitleText,
  selectedConceptId,
  selectedVersionId,
  selectedLaunchVariantId,
  selectedLaunchVariantStatus,
  selectedLaunchVariantNotes,
  selectedLaunchVariantLastTestedAt,
  selectedLaunchVariantWinnerSelectedAt,
  primaryVersionId,
  selectedConceptLabel,
  selectedConceptPrompt,
  selectedConceptStylePreset,
  selectedConceptTitleStyle,
  brandTemplates,
  brandTemplatesLoading,
  brandTemplatesError,
  selectedConceptBrandTemplateId,
  selectedBrandTemplateLogoDataUrl,
  brandLogoUploading,
  brandLogoError,
  brandLogoStatus,
  aspect,
  safeZoneEnabled,
  previewDataUrl,
  previewState,
  previewError,
  generateError,
  uploadError,
  pairingError,
  canGenerateConcepts = false,
  isGeneratingConcepts = false,
  canGenerateTitles = false,
  isGeneratingTitles = false,
  isGenerating,
  isSavingConcept,
  isUploading,
  onGenerateTitles,
  onSelectTitle,
  onSelectConcept,
  onSelectedConceptLabelChange,
  onSelectedConceptPromptChange,
  onSelectedConceptStylePresetChange,
  onSelectedConceptTitleFontPresetChange,
  onSelectedConceptTitleColorChange,
  onSelectedConceptTitleShadowEnabledChange,
  onSelectedConceptTitleShadowStrengthChange,
  onSelectedConceptBrandTemplateChange,
  onUploadBrandLogo,
  onRemoveBrandLogo,
  onGenerateConcepts,
  onCreateConcept,
  onSaveConcept,
  onDeleteConcept,
  onAspectChange,
  onToggleSafeZone,
  onUploadImage,
  onSelectVersion,
  onSetPrimary,
  onRetryVersion,
  onSelectLaunchVariant,
  onCreateLaunchVariant,
  onSelectedLaunchVariantStatusChange,
  onSelectedLaunchVariantNotesChange,
  onSaveLaunchVariant,
}: ThumbnailPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const brandLogoFileInputRef = useRef<HTMLInputElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const previewTextRef = useRef<HTMLDivElement | null>(null);
  const auditRunIdRef = useRef(0);
  const [auditState, setAuditState] = useState<ThumbnailAuditState>({
    mode: "idle",
    result: null,
    error: null,
  });
  const [promptVariants, setPromptVariants] = useState<PromptVariant[] | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const previewAspectClass = aspect === "1:1"
    ? " is-square"
    : aspect === "9:16"
      ? " is-vertical"
      : " is-widescreen";
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? null;
  const previewStatusMessage = resolveThumbnailPreviewStatus({
    selectedVersionId,
    selectedVersionProvider: selectedVersion?.provider ?? null,
  });
  const workspaceGuidance = resolveThumbnailWorkspaceGuidance({
    conceptCount: concepts.length,
    versionCount: versions.length,
    titleCount: titleOptions.length,
  });
  const hasFramingTitles = titleOptions.length > 0;
  const framingFirst = workspaceGuidance.primaryAction === "generate_titles";
  const draftBriefIsPrimary = workspaceGuidance.primaryAction === "draft_brief";
  const uploadImageIsPrimary = workspaceGuidance.primaryAction === "upload_image";
  const hasOverlayTitle = selectedTitleText.trim().length > 0;
  const launchVariantActionLabel = selectedLaunchVariantId ? "Update Pairing" : "Save Pairing";
  const interactionDisabled = isGenerating || isSavingConcept || isUploading;
  const conceptEditingDisabled = interactionDisabled || !hasFramingTitles;
  const uploadImageDisabled = isGenerating || isUploading || !hasFramingTitles;
  const canSaveLaunchVariant = Boolean(selectedTitleId && selectedVersionId);
  const lastTestedLabel = formatVariantTimestamp(selectedLaunchVariantLastTestedAt);
  const winnerSelectedLabel = formatVariantTimestamp(selectedLaunchVariantWinnerSelectedAt);
  const normalizedTitleStyle = normalizeEpisodeThumbnailTitleStyle(selectedConceptTitleStyle);
  const colorInputValue = resolveColorInputValue(normalizedTitleStyle.text_color);
  const selectedBrandTemplate = brandTemplates.find((template) => template.id === selectedConceptBrandTemplateId) ?? null;
  const resolvedBrandRender = resolveThumbnailBrandRender({
    template: selectedBrandTemplate,
    conceptTitleStyle: selectedConceptTitleStyle,
  });
  const resolvedFontPreset = TITLE_FONT_PRESETS[resolvedBrandRender.title_style.font_preset];
  const seoTitleText = titleOptions.find((title) => title.is_primary)?.text ?? titleOptions[0]?.text ?? null;
  const conceptEvaluations = evaluateThumbnailConcepts(concepts.map((concept) => ({
    id: concept.id,
    title: concept.label,
    description: concept.prompt_text,
    hasFace: concept.has_face,
    emotionIntensity: concept.emotion_intensity ?? undefined,
    textLength: concept.text_length ?? concept.label.length,
    contrastScore: concept.contrast_score ?? 0.7,
    noveltyScore: concept.novelty_score ?? 0.5,
    topicRelevance: concept.topic_relevance ?? 0.8,
  })));
  const conceptEvaluationsById = new Map(conceptEvaluations.map((evaluation) => [evaluation.conceptId, evaluation]));
  const rankedConceptEvaluations = conceptEvaluations
    .map((evaluation, index) => ({
      evaluation,
      index,
      concept: concepts[index],
    }))
    .sort((a, b) => {
      if (b.evaluation.ctrScore !== a.evaluation.ctrScore) {
        return b.evaluation.ctrScore - a.evaluation.ctrScore;
      }
      return a.index - b.index;
    });
  const recommendedEvaluation = conceptEvaluations.find((evaluation) => (
    evaluation.labels.includes("recommended_click_candidate")
  ));
  const selectedConceptEvaluation = conceptEvaluationsById.get(selectedConceptId) ?? null;
  const selectedRecommendationHeadline = selectedConceptEvaluation?.labels.includes("recommended_click_candidate")
    ? "Recommended Click Candidate"
    : "Recommendation";
  const selectedRecommendationSummary = selectedConceptEvaluation
    ? buildRecommendationSummary(selectedConceptEvaluation)
    : null;
  const canManageBrandLogo = Boolean(selectedConceptBrandTemplateId);
  const canAudit = Boolean(
    previewDataUrl
    && previewState === "ready"
    && hasOverlayTitle
    && previewRef.current
    && previewTextRef.current,
  );
  const canGeneratePrompt = Boolean(
    hasFramingTitles
    && selectedConceptPrompt.trim().length > 0
    && selectedTitleText.trim().length > 0,
  );
  const onGeneratePromptVariants = useCallback(() => {
    if (!canGeneratePrompt) return;
    const result = buildThumbnailPrompts({
      conceptBrief: selectedConceptPrompt,
      title: selectedTitleText,
      tone: selectedConceptStylePreset,
    });
    setPromptVariants(result.variants);
  }, [canGeneratePrompt, selectedConceptPrompt, selectedConceptStylePreset, selectedTitleText]);
  const onCopyPromptVariant = useCallback((prompt: string) => {
    void copyTextToClipboard(prompt);
  }, []);

  useEffect(() => {
    setPromptVariants(null);
  }, [selectedConceptId, selectedConceptPrompt, selectedConceptStylePreset, selectedTitleId, selectedTitleText]);

  const runThumbnailAudit = useCallback(async () => {
    if (!previewDataUrl || previewState !== "ready" || !hasOverlayTitle) {
      setAuditState({ mode: "idle", result: null, error: null });
      return;
    }

    const previewEl = previewRef.current;
    const textEl = previewTextRef.current;
    if (!previewEl || !textEl) {
      setAuditState({ mode: "idle", result: null, error: null });
      return;
    }

    const runId = auditRunIdRef.current + 1;
    auditRunIdRef.current = runId;
    setAuditState((current) => ({
      mode: "running",
      result: current.result,
      error: null,
    }));

    try {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      const rendered = await loadRenderedPreviewImageData(previewDataUrl, {
        darken: resolvedBrandRender.background_treatment.darken,
        blur: resolvedBrandRender.background_treatment.blur,
      });
      if (auditRunIdRef.current !== runId) return;

      const measured = measureRenderedTextBox(previewEl, textEl, rendered.width, rendered.height);
      const result = lintThumbnail(
        {
          width: rendered.width,
          height: rendered.height,
          textBoundingBox: measured.rect,
          textLineCount: measured.lineCount,
          backgroundImageData: rendered.imageData,
        },
        {
          overlayText: selectedTitleText,
          titleStyle: resolvedBrandRender.title_style,
          brandTemplateId: selectedConceptBrandTemplateId,
          seoTitle: seoTitleText,
        },
      );

      if (auditRunIdRef.current !== runId) return;
      setAuditState({
        mode: "ready",
        result,
        error: null,
      });
    } catch (error) {
      if (auditRunIdRef.current !== runId) return;
      setAuditState({
        mode: "error",
        result: null,
        error: error instanceof Error ? error.message : "Thumbnail analysis failed.",
      });
    }
  }, [
    hasOverlayTitle,
    previewDataUrl,
    previewState,
    resolvedBrandRender.background_treatment.blur,
    resolvedBrandRender.background_treatment.darken,
    resolvedBrandRender.title_style,
    selectedConceptBrandTemplateId,
    selectedTitleText,
    seoTitleText,
  ]);

  useEffect(() => {
    const previewEl = previewRef.current;
    if (!previewEl) return;

    const copyPosition = resolvedBrandRender.layout.title_position === "top"
      ? { top: "10%", bottom: "auto", transform: "none" }
      : resolvedBrandRender.layout.title_position === "center"
        ? { top: "50%", bottom: "auto", transform: "translateY(-50%)" }
        : { top: "auto", bottom: "10%", transform: "none" };
    const justifyItems = resolvedBrandRender.layout.alignment === "center"
      ? "center"
      : resolvedBrandRender.layout.alignment === "right"
        ? "end"
        : "start";
    const accentBorder = resolvedBrandRender.accent.border_color && resolvedBrandRender.accent.border_width > 0
      ? `${resolvedBrandRender.accent.border_width}px solid ${resolvedBrandRender.accent.border_color}`
      : "none";
    const treatmentBlur = resolvedBrandRender.background_treatment.blur > 0
      ? `blur(${resolvedBrandRender.background_treatment.blur}px)`
      : "none";

    previewEl.style.setProperty("--hs-thumb-treatment-color", `rgba(0, 0, 0, ${resolvedBrandRender.background_treatment.darken})`);
    previewEl.style.setProperty("--hs-thumb-treatment-blur", treatmentBlur);
    previewEl.style.setProperty("--hs-thumb-accent-border", accentBorder);
    previewEl.style.setProperty("--hs-thumb-accent-radius", `${resolvedBrandRender.accent.corner_radius}px`);
    previewEl.style.setProperty("--hs-thumb-copy-top", copyPosition.top);
    previewEl.style.setProperty("--hs-thumb-copy-bottom", copyPosition.bottom);
    previewEl.style.setProperty("--hs-thumb-copy-transform", copyPosition.transform);
    previewEl.style.setProperty("--hs-thumb-copy-justify", justifyItems);
    previewEl.style.setProperty("--hs-thumb-copy-font", resolvedFontPreset.css);
    previewEl.style.setProperty("--hs-thumb-copy-color", resolvedBrandRender.title_style.text_color);
    previewEl.style.setProperty("--hs-thumb-copy-shadow", resolvedBrandRender.text_shadow_css);
    previewEl.style.setProperty("--hs-thumb-copy-align", resolvedBrandRender.layout.alignment);
    previewEl.style.setProperty("--hs-thumb-copy-lines", String(resolvedBrandRender.layout.max_lines));
    previewEl.style.setProperty("--hs-thumb-logo-width", `${resolvedBrandRender.logo.width_percent}%`);
    previewEl.style.setProperty("--hs-thumb-logo-opacity", String(resolvedBrandRender.logo.opacity));
  }, [resolvedBrandRender, resolvedFontPreset.css]);

  useEffect(() => {
    if (!previewDataUrl || previewState !== "ready" || !hasOverlayTitle) {
      setAuditState({ mode: "idle", result: null, error: null });
      return;
    }
    void runThumbnailAudit();
  }, [hasOverlayTitle, previewDataUrl, previewState, runThumbnailAudit]);

  const auditOverall = auditState.result?.overall ?? null;
  const auditButtonLabel = auditState.mode === "running"
    ? "Analyzing..."
    : auditState.mode === "ready"
      ? "Re-analyze"
      : "Analyze Thumbnail";
  const draftBriefButton = onGenerateConcepts ? (
    <button
      type="button"
      className={draftBriefIsPrimary ? "is-primary" : undefined}
      onClick={onGenerateConcepts}
      disabled={!canGenerateConcepts || isGeneratingConcepts || isGenerating || isUploading || !hasFramingTitles}
    >
      {isGeneratingConcepts ? "Drafting Brief..." : workspaceGuidance.primaryAction === "draft_brief" ? workspaceGuidance.primaryActionLabel : "Draft Concept Brief"}
    </button>
  ) : null;
  const generateTitlesButton = onGenerateTitles ? (
    <button
      type="button"
      className={framingFirst ? "is-primary" : undefined}
      onClick={onGenerateTitles}
      disabled={!canGenerateTitles || isGeneratingTitles || interactionDisabled}
    >
      {isGeneratingTitles ? "Generating Titles..." : "Generate Titles"}
    </button>
  ) : null;
  const uploadImageButton = (
    <button
      type="button"
      className={uploadImageIsPrimary ? "is-primary" : undefined}
      onClick={() => fileInputRef.current?.click()}
      disabled={uploadImageDisabled}
    >
      {isUploading ? "Uploading Image..." : uploadImageIsPrimary ? workspaceGuidance.primaryActionLabel : "Upload Final Image"}
    </button>
  );
  const workflowPrimaryActionButton = framingFirst && onGenerateTitles ? (
    <button
      type="button"
      className="is-primary"
      onClick={onGenerateTitles}
      disabled={!canGenerateTitles || isGeneratingTitles || interactionDisabled}
    >
      {isGeneratingTitles ? "Generating Titles..." : "Generate Titles"}
    </button>
  ) : workspaceGuidance.primaryAction === "generate_prompt" ? (
    <button
      type="button"
      className="is-primary"
      onClick={onGeneratePromptVariants}
      disabled={!canGeneratePrompt}
    >
      Generate Image Prompt
    </button>
  ) : draftBriefIsPrimary && onGenerateConcepts ? (
    <button
      type="button"
      className="is-primary"
      onClick={onGenerateConcepts}
      disabled={!canGenerateConcepts || isGeneratingConcepts || isGenerating || isUploading || !hasFramingTitles}
    >
      {isGeneratingConcepts ? "Drafting Brief..." : workspaceGuidance.primaryActionLabel}
    </button>
  ) : (
    <button
      type="button"
      className="is-primary"
      onClick={() => fileInputRef.current?.click()}
      disabled={uploadImageDisabled}
    >
      {isUploading ? "Uploading Image..." : workspaceGuidance.primaryActionLabel}
    </button>
  );

  return (
    <section className="hs-thumb-panel" aria-label="Visuals panel">
      <header className="hs-thumb-header">
        <div className="hs-thumb-title">Thumbnail Workspace</div>
        <div className="hs-thumb-meta">
          {formatThumbnailPanelMeta(concepts.length, versions.length)}
        </div>
        <div className="hs-thumb-state-cue">{workspaceGuidance.stateCue}</div>
      </header>

      <div className="hs-thumb-mobile-concept-header" aria-label="Selected concept">
        <div className="hs-thumb-mobile-concept-header-label">
          <span className="hs-thumb-mobile-concept-label-text">{selectedConceptLabel || "No concept"}</span>
        </div>
        <button
          type="button"
          className="hs-thumb-mobile-concept-change-btn"
          onClick={() => {
            const conceptsSection = document.querySelector(".hs-thumb-concepts");
            if (conceptsSection) {
              conceptsSection.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          }}
          disabled={conceptEditingDisabled}
        >
          Change
        </button>
      </div>

      <div className="hs-thumb-grid">
        <section className="hs-thumb-concepts" aria-label="Thumbnail concepts">
          <div className="hs-thumb-section-title">Concept Briefs</div>
          <div className="hs-thumb-concepts-list">
            {concepts.length === 0 ? (
              <div className="hs-thumb-empty">Start by drafting a concept brief.</div>
            ) : (
              concepts.map((concept) => (
                <button
                  key={concept.id}
                  type="button"
                  className={`hs-thumb-concept-item${concept.id === selectedConceptId ? " is-selected" : ""}`}
                  onClick={() => onSelectConcept(concept.id)}
                  disabled={conceptEditingDisabled}
                >
                  <span className="hs-thumb-concept-item-label">{concept.label}</span>
                  {conceptEvaluationsById.get(concept.id) ? (
                    <div className="hs-thumb-concept-item-meta">
                      <span className="hs-thumb-ctr-score">
                        CTR {conceptEvaluationsById.get(concept.id)?.ctrScore}
                      </span>
                      <span className="hs-thumb-ctr-mini-scores">
                        C{Math.round(conceptEvaluationsById.get(concept.id)?.curiosityScore ?? 0)} ·
                        L{Math.round(conceptEvaluationsById.get(concept.id)?.clarityScore ?? 0)} ·
                        E{Math.round(conceptEvaluationsById.get(concept.id)?.emotionScore ?? 0)}
                      </span>
                    </div>
                  ) : null}
                  {conceptEvaluationsById.get(concept.id)?.labels.length ? (
                    <div className="hs-thumb-ctr-badge-row">
                      {conceptEvaluationsById.get(concept.id)?.labels.map((label) => (
                        <span key={`${concept.id}:${label}`} className={resolveCtrBadgeClassName(label)}>
                          {resolveCtrLabel(label)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </button>
              ))
            )}
          </div>

          {recommendedEvaluation?.recommendationReason ? (
            <div className="hs-thumb-ctr-recommendation" role="status" aria-live="polite">
              <div className="hs-thumb-ctr-recommendation-title">Recommendation</div>
              <div className="hs-thumb-ctr-recommendation-copy">
                {recommendedEvaluation.recommendationReason}
              </div>
            </div>
          ) : null}

          <details className="hs-thumb-ctr-breakdown" aria-label="Predicted CTR breakdown">
            <summary>Predicted CTR Breakdown</summary>
            {rankedConceptEvaluations.length === 0 ? (
              <div className="hs-thumb-empty">No concepts to score yet.</div>
            ) : (
              <div className="hs-thumb-ctr-table-wrap">
                <table className="hs-thumb-ctr-table">
                  <thead>
                    <tr>
                      <th scope="col">Concept</th>
                      <th scope="col">CTR</th>
                      <th scope="col">Curiosity</th>
                      <th scope="col">Clarity</th>
                      <th scope="col">Emotion</th>
                      <th scope="col">Brand Fit</th>
                      <th scope="col">Signals</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankedConceptEvaluations.map(({ evaluation, concept }) => (
                      <tr key={evaluation.conceptId}>
                        <td>{concept?.label ?? evaluation.conceptId}</td>
                        <td>{evaluation.ctrScore}</td>
                        <td>{Math.round(evaluation.curiosityScore)}</td>
                        <td>{Math.round(evaluation.clarityScore)}</td>
                        <td>{Math.round(evaluation.emotionScore)}</td>
                        <td>{Math.round(evaluation.brandFitScore)}</td>
                        <td>
                          {evaluation.labels.length ? evaluation.labels.map(resolveCtrLabel).join(" · ") : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </details>

          <div className="hs-thumb-concept-actions">
            <button
              type="button"
              onClick={onCreateConcept}
              disabled={conceptEditingDisabled}
            >
              New Concept
            </button>
            <button
              type="button"
              onClick={onSaveConcept}
              disabled={conceptEditingDisabled || !selectedConceptId}
            >
              {isSavingConcept ? "Saving..." : "Save Concept"}
            </button>
            <button
              type="button"
              onClick={onDeleteConcept}
              disabled={conceptEditingDisabled || !selectedConceptId}
            >
              Delete
            </button>
          </div>
        </section>

        <section className="hs-thumb-center" aria-label="Thumbnail creative workspace">
          <button
            type="button"
            className="hs-thumb-sidebar-toggle visible"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="Toggle controls panel"
            aria-label="Toggle controls panel"
          >
            {sidebarOpen ? "◀ Close" : "Refine ▶"}
          </button>

          <div className="hs-thumb-preview-note">{previewStatusMessage}</div>

          <section className="hs-thumb-workflow-card" aria-label="Next step guidance">
            <div className="hs-thumb-workflow-eyebrow">{workspaceGuidance.cardTitle}</div>
            <div className="hs-thumb-workflow-copy">
              {workspaceGuidance.cardLead}
            </div>
            <div className="hs-thumb-workflow-actions">
              {workflowPrimaryActionButton}
            </div>
            <ol className="hs-thumb-workflow-steps">
              {workspaceGuidance.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <div className="hs-thumb-workflow-note">
              {workspaceGuidance.note}
            </div>
          </section>

          <div
            ref={previewRef}
            className={`hs-thumb-preview${previewAspectClass}${safeZoneEnabled ? " show-safe-zone" : ""}`}
          >
            {previewState === "loading" ? (
              <div className="hs-thumb-preview-empty">Loading preview...</div>
            ) : null}
            {previewState === "error" ? (
              <div className="hs-thumb-preview-empty">{previewError || "Preview unavailable."}</div>
            ) : null}
            {previewState === "idle" ? (
              <div className="hs-thumb-preview-empty">Upload or select an image version to preview it here.</div>
            ) : null}
            {previewDataUrl && previewState === "ready" ? (
              <>
                <img src={previewDataUrl} alt="Selected thumbnail preview" className="hs-thumb-preview-image" />
                <div className="hs-thumb-preview-treatment" aria-hidden="true" />
                <div
                  className="hs-thumb-preview-accent"
                  aria-hidden="true"
                />
                {selectedBrandTemplateLogoDataUrl ? (
                  <div className={`hs-thumb-preview-logo hs-thumb-preview-logo-${resolvedBrandRender.logo.placement}`} aria-hidden="true">
                    <img src={selectedBrandTemplateLogoDataUrl} alt="" className="hs-thumb-preview-logo-image" />
                  </div>
                ) : null}
                {hasOverlayTitle ? (
                  <div
                    className="hs-thumb-preview-copy"
                    aria-label="Thumbnail title preview"
                  >
                    <div
                      ref={previewTextRef}
                      className="hs-thumb-preview-copy-text"
                    >
                      {selectedTitleText}
                    </div>
                  </div>
                ) : null}
                <div className="hs-thumb-safe-zone" aria-hidden="true" />
              </>
            ) : null}
          </div>

          <div className="hs-thumb-controls">
            {framingFirst ? generateTitlesButton : null}
            {uploadImageIsPrimary ? uploadImageButton : draftBriefButton}
            {uploadImageIsPrimary ? draftBriefButton : uploadImageButton}
            <select
              aria-label="Thumbnail aspect ratio"
              title="Thumbnail aspect ratio"
              value={aspect}
              onChange={(event) => onAspectChange(event.target.value as "16:9" | "1:1" | "9:16")}
              disabled={uploadImageDisabled}
            >
              <option value="16:9">16:9</option>
              <option value="1:1">1:1</option>
              <option value="9:16">9:16</option>
            </select>
            <button
              type="button"
              onClick={onToggleSafeZone}
              disabled={uploadImageDisabled}
            >
              {safeZoneEnabled ? "Hide Safe Zone" : "Show Safe Zone"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label="Upload thumbnail image"
              title="Upload thumbnail image"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                onUploadImage(file);
                event.target.value = "";
              }}
              className="hs-thumb-file-input"
            />
          </div>

          {generateError ? (
            <div className="hs-error-text-small">{generateError}</div>
          ) : null}
          {uploadError ? (
            <div className="hs-error-text-small">{uploadError}</div>
          ) : null}
          <div className="hs-field-label-muted">
            This is your planning space. Once the image comes back in, we'll keep the text, framing, and pairing aligned.
          </div>

          <section className="hs-thumb-prompt-section" aria-label="Image prompt generation">
            <div className="hs-thumb-prompt-header">
              <div>
                <div className="hs-field-label">Image Prompts</div>
                <div className="hs-thumb-field-helper">
                  Hearth turns the selected concept brief and title into copy-ready image prompts for your outside tool.
                </div>
              </div>
              {promptVariants ? (
                <button
                  type="button"
                  onClick={onGeneratePromptVariants}
                  disabled={!canGeneratePrompt}
                >
                  Generate Again
                </button>
              ) : null}
            </div>
            <div className="hs-thumb-prompt-context">
              <span><strong>Concept:</strong> {selectedConceptLabel.trim() || "No concept selected"}</span>
              <span><strong>Title:</strong> {selectedTitleText.trim() || "Choose a title on the right"}</span>
            </div>
            {!hasFramingTitles ? (
              <div className="hs-thumb-empty">Start with a title. Framing helps shape thumbnail ideas.</div>
            ) : !selectedConceptPrompt.trim() ? (
              <div className="hs-thumb-empty">Add enough detail to the concept brief so Hearth has something concrete to translate.</div>
            ) : !selectedTitleText.trim() ? (
              <div className="hs-thumb-empty">Choose a title on the right, then generate the image prompt.</div>
            ) : promptVariants?.length ? (
              <div className="hs-thumb-prompt-output" aria-label="Generated image prompt variants">
                {promptVariants.map((variant) => (
                  <article key={variant.id} className="hs-thumb-prompt-card">
                    <div className="hs-thumb-prompt-card-header">
                      <div>
                        <div className="hs-thumb-prompt-card-title">{resolvePromptVariantLabel(variant.style)}</div>
                        {variant.tagline ? (
                          <div className="hs-thumb-prompt-card-tagline">{variant.tagline}</div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => onCopyPromptVariant(variant.prompt)}
                      >
                        Copy
                      </button>
                    </div>
                    <textarea
                      value={variant.prompt}
                      readOnly
                      rows={6}
                      className="hs-thumb-prompt-card-text"
                    />
                  </article>
                ))}
              </div>
            ) : (
              <div className="hs-thumb-prompt-empty">
                Use <strong>Generate Image Prompt</strong> to turn this concept and title into outside-tool prompt variants.
              </div>
            )}
            <details className="hs-thumb-advanced-options">
              <summary>Concept Source</summary>
              <div className="hs-thumb-advanced-options-body">
                <label className="hs-field">
                  <span className="hs-field-label">Concept Label</span>
                  <input
                    type="text"
                    value={selectedConceptLabel}
                    onChange={(event) => onSelectedConceptLabelChange(event.target.value)}
                    placeholder="Concept label"
                    disabled={conceptEditingDisabled}
                  />
                </label>
                <label className="hs-field">
                  <span className="hs-field-label">Visual Style</span>
                  <select
                    value={selectedConceptStylePreset}
                    onChange={(event) => onSelectedConceptStylePresetChange(event.target.value)}
                    disabled={conceptEditingDisabled}
                  >
                    {HEARTH_VISUAL_STYLE_DEFINITIONS.map((style) => (
                      <option key={style.value} value={style.value}>
                        {style.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="hs-field">
                  <span className="hs-field-label">Concept Brief (source)</span>
                  <div className="hs-thumb-field-helper">This is the planning brief Hearth interprets. It is not the final provider prompt.</div>
                  <textarea
                    value={selectedConceptPrompt}
                    onChange={(event) => onSelectedConceptPromptChange(event.target.value)}
                    placeholder="Outline the focal subject, framing, contrast, and tone."
                    rows={7}
                    disabled={conceptEditingDisabled}
                    className="hs-thumb-prompt-input"
                  />
                </label>
              </div>
            </details>
          </section>
        </section>

        <div
          className={`hs-thumb-sidebar-backdrop${sidebarOpen ? " is-open" : ""}`}
          onClick={() => setSidebarOpen(false)}
          role="presentation"
        />

        <section className={`hs-thumb-sidebar-right${sidebarOpen ? " is-open" : ""}`} aria-label="Thumbnail controls and insights">
          {selectedConceptEvaluation ? (
            <section className="hs-thumb-sidebar-section" aria-label="Recommendation">
              <div className="hs-thumb-section-title hs-thumb-section-title-strong">Recommendation</div>
              <div className="hs-thumb-recommendation-summary-title">{selectedRecommendationHeadline}</div>
              <div className="hs-thumb-recommendation-summary-copy">{selectedRecommendationSummary}</div>
            </section>
          ) : null}

          <details className="hs-thumb-sidebar-section" open>
            <summary>Text & Branding</summary>
            <div>
              {titleOptions.length === 0 ? (
                <div className="hs-thumb-empty">
                  Start with a title. Framing helps shape thumbnail ideas.
                </div>
              ) : (
                <div className="hs-thumb-title-list">
                  {titleOptions.map((title) => (
                    <button
                      key={title.id}
                      type="button"
                      className={`hs-thumb-title-chip${title.id === selectedTitleId ? " is-selected" : ""}`}
                      onClick={() => onSelectTitle(title.id)}
                      disabled={isGenerating || isUploading}
                      title={resolveHearthThumbnailOverlayText(title) === title.text
                        ? title.text
                        : `Overlay: ${resolveHearthThumbnailOverlayText(title)}\nSEO title: ${title.text}`}
                    >
                      <span className="hs-thumb-title-chip-label">{title.label}</span>
                      <span className="hs-thumb-title-chip-text">{resolveHearthThumbnailOverlayText(title)}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="hs-thumb-title-help">
                Hearth derives a thumbnail-safe overlay hook from the selected title, so you can carry the same line into your outside image tool.
              </div>
              <details className="hs-thumb-advanced-options">
                <summary>Branding Options</summary>
                <div className="hs-thumb-advanced-options-body">
                  <label className="hs-field">
                    <span className="hs-field-label">Brand Template</span>
                    <select
                      value={selectedConceptBrandTemplateId ?? ""}
                      onChange={(event) => onSelectedConceptBrandTemplateChange(event.target.value || null)}
                      disabled={interactionDisabled || brandTemplatesLoading}
                    >
                      <option value="">None</option>
                      {brandTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.isDefault ? `${template.name} (Default)` : template.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {brandTemplatesLoading ? (
                    <div className="hs-thumb-template-meta">Loading workspace brand templates...</div>
                  ) : null}
                  {brandTemplatesError ? (
                    <div className="hs-error-text-small">{brandTemplatesError}</div>
                  ) : null}
                  <div className="hs-thumb-brand-logo-actions">
                    <button
                      type="button"
                      onClick={() => brandLogoFileInputRef.current?.click()}
                      disabled={interactionDisabled || brandLogoUploading || !canManageBrandLogo}
                    >
                      {brandLogoUploading ? "Uploading Logo..." : "Upload Logo"}
                    </button>
                    <button
                      type="button"
                      onClick={onRemoveBrandLogo}
                      disabled={interactionDisabled || brandLogoUploading || !canManageBrandLogo || !selectedBrandTemplateLogoDataUrl}
                    >
                      Remove Logo
                    </button>
                  </div>
                  <input
                    ref={brandLogoFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    aria-label="Upload brand logo"
                    title="Upload brand logo"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      onUploadBrandLogo(file);
                      event.target.value = "";
                    }}
                    className="hs-thumb-file-input"
                  />
                  {!canManageBrandLogo ? (
                    <div className="hs-thumb-template-meta">Select a brand template to upload a logo.</div>
                  ) : null}
                  {brandLogoError ? (
                    <div className="hs-error-text-small">{brandLogoError}</div>
                  ) : null}
                  {brandLogoStatus ? (
                    <div className="hs-thumb-template-meta">{brandLogoStatus}</div>
                  ) : null}
                  {selectedBrandTemplateLogoDataUrl ? (
                    <div className="hs-thumb-template-meta">Logo attached to this brand template.</div>
                  ) : null}
                  <section className="hs-thumb-title-style" aria-label="Thumbnail title styling">
                    <div className="hs-thumb-section-title">Title Styling</div>
                    <div className="hs-thumb-title-style-grid">
                      <label className="hs-field">
                        <span className="hs-field-label">Font Preset</span>
                        <select
                          value={normalizedTitleStyle.font_preset}
                          onChange={(event) => onSelectedConceptTitleFontPresetChange(event.target.value)}
                          disabled={interactionDisabled}
                        >
                          {Object.entries(TITLE_FONT_PRESETS).map(([value, preset]) => (
                            <option key={value} value={value}>
                              {preset.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="hs-field hs-thumb-color-field">
                        <span className="hs-field-label">Text Color</span>
                        <input
                          type="color"
                          value={colorInputValue}
                          onChange={(event) => onSelectedConceptTitleColorChange(event.target.value)}
                          disabled={interactionDisabled}
                          className="hs-thumb-color-input"
                        />
                      </label>
                    </div>
                    <label className="hs-thumb-shadow-toggle">
                      <input
                        type="checkbox"
                        checked={normalizedTitleStyle.shadow.enabled}
                        onChange={(event) => onSelectedConceptTitleShadowEnabledChange(event.target.checked)}
                        disabled={interactionDisabled}
                      />
                      <span>Drop Shadow</span>
                    </label>
                    {normalizedTitleStyle.shadow.enabled ? (
                      <label className="hs-field">
                        <span className="hs-field-label">Shadow Strength</span>
                        <select
                          value={normalizedTitleStyle.shadow.strength}
                          onChange={(event) => onSelectedConceptTitleShadowStrengthChange(event.target.value as TitleShadowStrength)}
                          disabled={interactionDisabled}
                        >
                          {TITLE_SHADOW_STRENGTH_VALUES.map((strength) => (
                            <option key={strength} value={strength}>
                              {strength[0]?.toUpperCase()}{strength.slice(1)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </section>
                </div>
              </details>
            </div>
          </details>

          <details className="hs-thumb-sidebar-section">
            <summary>Analysis</summary>
            <div>
              <section className="hs-thumb-audit" aria-label="Thumbnail readability audit">
                <div className="hs-thumb-audit-header">
                  <div>
                    <div className="hs-thumb-section-title">Re-analyze</div>
                    <div className="hs-thumb-audit-subtitle">
                      Deterministic checks for readability, contrast, coverage, and redundancy.
                    </div>
                  </div>
                  <div className={`hs-thumb-audit-status${auditOverall ? ` is-${auditOverall}` : ""}`}>
                    {formatAuditStateLabel(auditState)}
                  </div>
                </div>
                <div className="hs-thumb-audit-toolbar">
                  <button
                    type="button"
                    onClick={() => {
                      void runThumbnailAudit();
                    }}
                    disabled={auditState.mode === "running" || !previewDataUrl || previewState !== "ready" || !hasOverlayTitle}
                  >
                    {auditButtonLabel}
                  </button>
                </div>
                {!previewDataUrl || previewState !== "ready" ? (
                  <div className="hs-thumb-audit-empty">Upload or select a preview image to run the audit.</div>
                ) : !hasOverlayTitle ? (
                  <div className="hs-thumb-audit-empty">Select overlay text to analyze thumbnail readability.</div>
                ) : auditState.mode === "error" ? (
                  <div className="hs-error-text-small">{auditState.error || "Thumbnail analysis failed."}</div>
                ) : auditState.result ? (
                  <div className="hs-thumb-audit-list">
                    {auditState.result.checks.map((check) => (
                      <div key={check.id} className={`hs-thumb-audit-item is-${check.status}`}>
                        <div className={`hs-thumb-audit-check-status is-${check.status}`}>
                          {check.status === "pass" ? "PASS" : check.status === "warning" ? "WARN" : "FAIL"}
                        </div>
                        <div className="hs-thumb-audit-check-copy">
                          <div className="hs-thumb-audit-check-label">{check.label}</div>
                          <div className="hs-thumb-audit-check-message">{check.message}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="hs-thumb-audit-empty">
                    {canAudit ? "Run the audit to inspect this thumbnail." : "Thumbnail audit is unavailable for the current state."}
                  </div>
                )}
              </section>
            </div>
          </details>
        </section>
      </div>

      <section className="hs-thumb-versions" aria-label="Thumbnail versions">
        <div className="hs-thumb-section-title">Image Versions</div>
        <ThumbnailVersions
          versions={versions}
          selectedVersionId={selectedVersionId}
          primaryVersionId={primaryVersionId}
          disabled={interactionDisabled}
          onSelectVersion={onSelectVersion}
          onSetPrimary={onSetPrimary}
          onRetryVersion={onRetryVersion}
        />
      </section>

      <section className="hs-thumb-launch-variants" aria-label="Launch variants">
        <div className="hs-thumb-section-title">Launch Variants</div>
        <div className="hs-thumb-launch-toolbar">
          <div className="hs-field-label-muted">
            Once you have a title and image version selected, save the pairing as a launch-ready variant.
          </div>
          <div className="hs-thumb-launch-actions">
            <button
              type="button"
              onClick={onSaveLaunchVariant}
              disabled={interactionDisabled || !canSaveLaunchVariant}
            >
              {launchVariantActionLabel}
            </button>
            <button
              type="button"
              onClick={onCreateLaunchVariant}
              disabled={interactionDisabled}
            >
              New Pairing
            </button>
          </div>
        </div>
        <div className="hs-thumb-launch-editor">
          <label className="hs-field">
            <span className="hs-field-label">Status</span>
            <select
              value={selectedLaunchVariantStatus}
              onChange={(event) => onSelectedLaunchVariantStatusChange(event.target.value as EpisodeLaunchVariantStatus)}
              disabled={interactionDisabled}
            >
              {EPISODE_LAUNCH_VARIANT_STATUS_VALUES.map((status) => (
                <option key={status} value={status}>
                  {resolveLaunchVariantStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="hs-field">
            <span className="hs-field-label">Notes</span>
            <textarea
              value={selectedLaunchVariantNotes}
              onChange={(event) => onSelectedLaunchVariantNotesChange(event.target.value)}
              rows={3}
              placeholder="Optional operator notes for this launch variant"
              disabled={interactionDisabled}
            />
          </label>
          {lastTestedLabel || winnerSelectedLabel ? (
            <div className="hs-thumb-launch-editor-meta">
              {lastTestedLabel ? <div>Last tested: {lastTestedLabel}</div> : null}
              {winnerSelectedLabel ? <div>Winner selected: {winnerSelectedLabel}</div> : null}
            </div>
          ) : null}
        </div>

        {!canSaveLaunchVariant ? (
          <div className="hs-thumb-empty">Choose both a title and an image version to save a pairing.</div>
        ) : null}

        {launchVariants.length === 0 ? (
          <div className="hs-thumb-empty">No title/image pairings saved yet.</div>
        ) : (
          <div className="hs-thumb-launch-list">
            {launchVariants.map((variant, index) => {
              const linkedTitle = titleOptions.find((title) => title.id === variant.title_id) ?? null;
              const linkedVersion = versions.find((version) => version.id === variant.thumbnail_version_id) ?? null;
              const linkedConcept = linkedVersion
                ? concepts.find((concept) => concept.id === linkedVersion.concept_id) ?? null
                : null;

              return (
                <button
                  key={variant.id}
                  type="button"
                  className={`hs-thumb-launch-card${variant.id === selectedLaunchVariantId ? " is-selected" : ""}`}
                  onClick={() => onSelectLaunchVariant(variant.id)}
                  disabled={interactionDisabled}
                >
                  <div className="hs-thumb-launch-card-heading">
                    <div className="hs-thumb-launch-card-title">{resolveVariantLabel(index)}</div>
                    <div className={`hs-thumb-launch-status is-${variant.status}`}>
                      {resolveLaunchVariantStatusLabel(variant.status)}
                    </div>
                  </div>
                  <div className="hs-thumb-launch-card-copy">
                    {linkedTitle?.text.trim() || "Linked title unavailable"}
                  </div>
                  <div className="hs-thumb-launch-card-meta">
                    {linkedConcept?.label ?? "Missing concept"} · {linkedVersion ? `Version ${linkedVersion.id.slice(0, 8)}` : "Missing version"}
                  </div>
                  {variant.notes ? (
                    <div className="hs-thumb-launch-card-notes">{variant.notes}</div>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}

        {pairingError ? (
          <div className="hs-error-text-small">{pairingError}</div>
        ) : null}
      </section>
    </section>
  );
}
