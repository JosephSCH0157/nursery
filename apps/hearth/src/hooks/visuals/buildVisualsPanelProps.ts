import type { ComponentProps, Dispatch, SetStateAction } from "react";
import type BrollPlanPanel from "../../components/visuals/BrollPlanPanel";
import type EpisodeMediaMapPanel from "../../components/visuals/EpisodeMediaMapPanel";
import type ImageMapPanel from "../../components/visuals/ImageMapPanel";
import type ReferenceClipPlanPanel from "../../components/visuals/ReferenceClipPlanPanel";
import type ThumbnailPanel from "../../components/visuals/ThumbnailPanel";
import type {
  EpisodeBrollPlan,
  EpisodeMediaMap,
  EpisodeMediaMapEntry,
  EpisodeReferenceClipPlan,
} from "../../lib/episode-package-v2";
import type {
  MediaMapConversationDirectionId,
  MediaMapConversationSeed,
  MediaMapGenerationScope,
} from "../../lib/hearth-media-map-conversation";
import type { ImageMapScriptSelection } from "../../lib/hearth-image-map-beats";
import type { FullMediaBudgetPolicy } from "../../lib/hearth-media-map-builder";
import { normalizeEpisodeThumbnailTitleStyle } from "../../lib/hearth-title-fonts";
import type { TitleFontPreset, TitleShadowStrength } from "../../lib/hearth-title-fonts";

type MediaMapPanelProps = ComponentProps<typeof EpisodeMediaMapPanel>;
type ImageMapPanelProps = ComponentProps<typeof ImageMapPanel>;
type BrollPanelProps = ComponentProps<typeof BrollPlanPanel>;
type ReferenceClipPanelProps = ComponentProps<typeof ReferenceClipPlanPanel>;
type ThumbnailPanelProps = ComponentProps<typeof ThumbnailPanel>;

type BuildMediaMapPanelArgs = {
  entries: EpisodeMediaMapEntry[];
  canonicalItems?: MediaMapPanelProps["canonicalItems"];
  selectedEntryId: string | null;
  approvedScriptVersion: number | null;
  mediaMap: EpisodeMediaMap | null;
  saveState: MediaMapPanelProps["saveState"];
  saveError: string | null;
  packageState: MediaMapPanelProps["packageState"];
  packageError: string | null;
  generateDisabledReason: string | null;
  onRetryLoad: () => void;
  canRecoverLastGeneration: boolean;
  onRecoverLastGeneration: () => void;
  message: string | null;
  disabled: boolean;
  operationStage: MediaMapPanelProps["operationStage"];
  generationScope: MediaMapGenerationScope;
  budgetPolicy: FullMediaBudgetPolicy;
  draft: MediaMapPanelProps["draft"];
  conversationState: MediaMapPanelProps["conversation"]["state"];
  conversationSeed: MediaMapConversationSeed | null;
  conversationError: string | null;
  onBuildAndApply: (args: {
    directionId: MediaMapConversationDirectionId;
    constraintsText: string;
    derivedFromScript: boolean;
  }) => Promise<boolean>;
  onSelectEntry: (entryId: string | null) => void;
  onDraftChange: MediaMapPanelProps["onDraftChange"];
  onGenerationScopeChange: MediaMapPanelProps["onGenerationScopeChange"];
  onGenerateFromPlans: () => void;
  onActivateMap: () => void;
  onAddEntry: () => void;
  onSaveEntry: () => void;
  onDeleteEntry: () => void;
};

type BuildBrollPanelArgs = {
  canonicalV2?: boolean;
  workspaceId?: string | null;
  canonicalPlanRevisionId?: string | null;
  canonicalPlanRevision?: number;
  beats: EpisodeBrollPlan["beats"];
  selectedBeatId: string | null;
  workpieceId: string | null;
  coverageStrength: EpisodeBrollPlan["coverage_strength"] | null;
  saveState: BrollPanelProps["saveState"];
  saveError: string | null;
  message: string | null;
  activeOperation?: BrollPanelProps["activeOperation"];
  disabled: boolean;
  draft: BrollPanelProps["draft"];
  requestState: string;
  providers: BrollPanelProps["providers"];
  selectedCandidateId: string | null;
  promptState: BrollPanelProps["promptState"];
  copyPromptAcknowledged: boolean;
  onSelectBeat: (beatId: string | null) => void;
  onDraftChange: BrollPanelProps["onDraftChange"];
  onSaveBeat: () => void;
  onDeleteBeat: () => void;
  onRegenerateBeat: () => void;
  onGeneratePlan: () => void;
  onGenerateMotionPrompt: NonNullable<BrollPanelProps["onGenerateMotionPrompt"]>;
  onSaveMotionPrompt: NonNullable<BrollPanelProps["onSaveMotionPrompt"]>;
  onCreateRunwayReadyPrompt: NonNullable<BrollPanelProps["onCreateRunwayReadyPrompt"]>;
  onGenerateVideo: NonNullable<BrollPanelProps["onGenerateVideo"]>;
  onFindStock: () => void;
  onUploadAsset: (file: File) => void;
  onSelectCandidate: (candidateId: string) => void;
  onRetryCandidateIngestion: (candidateId: string) => void;
  onCopyPrompt: () => void;
  onDownloadBrief: () => void;
  onDownloadBriefJson: () => void;
  onOpenProvider: () => void;
  onMarkSent: () => void;
  onMarkAwaitingResult: () => void;
  onClearRequestState: () => void;
  onAttachResultFromUrl: () => void;
};

type BuildImageMapPanelArgs = {
  panelTitle: string;
  manualOnly: boolean;
  entries: ImageMapPanelProps["entries"];
  selectedEntryId: string | null;
  draftAnchor: string;
  draftDescription: string;
  draftStylePreset: string;
  draftIntent: string;
  draftSourceType: string;
  draftVisualPriority: ImageMapPanelProps["draftVisualPriority"];
  draftVisualType: ImageMapPanelProps["draftVisualType"];
  draftSectionIntentNote: string;
  draftPlacementHint: string;
  saveState: ImageMapPanelProps["saveState"];
  saveError: string | null;
  expectedImageCount: number;
  exportMessage: string | null;
  copyExportAcknowledged: boolean;
  activeVisualProvider: ImageMapPanelProps["activeVisualProvider"];
  visualProviderOptions: ImageMapPanelProps["visualProviderOptions"];
  visualProviderOverride: ImageMapPanelProps["visualProviderOverride"];
  candidateCards: ImageMapPanelProps["candidateCards"];
  candidateGenerateBusy: boolean;
  candidateGenerateError: string | null;
  candidateSelectBusy: boolean;
  candidateSelectionError: string | null;
  promptAuthorityState: ImageMapPanelProps["promptAuthorityState"];
  anchorStatusLabel: string | null;
  anchorStatusTone: ImageMapPanelProps["anchorStatusTone"];
  anchorStatusDetail: string | null;
  reanchorMode: boolean;
  reanchorBusy: boolean;
  reanchorDisabledReason: string | null;
  nearestRepairAvailable: boolean;
  reanchorError: string | null;
  reanchorScriptSourceLabel: ImageMapPanelProps["reanchorScriptSourceLabel"];
  reanchorScriptHint: ImageMapPanelProps["reanchorScriptHint"];
  reanchorScriptLoading: boolean;
  reanchorParagraphs: ImageMapPanelProps["reanchorParagraphs"];
  activeAnchorLabel: string | null;
  disabled: boolean;
  onRetryLoad: () => void;
  onSelectEntry: (entryId: string | null) => void;
  onDraftAnchorChange: (value: string) => void;
  onDraftDescriptionChange: (value: string) => void;
  onDraftStylePresetChange: (value: string) => void;
  onDraftIntentChange: (value: string) => void;
  onDraftSourceTypeChange: (value: string) => void;
  onDraftVisualPriorityChange: (value: string) => void;
  onDraftVisualTypeChange: (value: string) => void;
  onDraftSectionIntentNoteChange: (value: string) => void;
  onDraftPlacementHintChange: (value: string) => void;
  onCreateEntry: () => void;
  onDuplicateEntry: () => void;
  onDeleteEntry: () => void;
  onSeedFromScript: () => void;
  onGenerateCandidates: (mode?: "ai" | "stock") => void;
  onInterpretPrompt: ImageMapPanelProps["onInterpretPrompt"];
  onSavePromptEdit: ImageMapPanelProps["onSavePromptEdit"];
  onRefreshPrompt: ImageMapPanelProps["onRefreshPrompt"];
  onUploadAsset: (file: File) => void;
  onSelectCandidate: (candidateId: string) => void;
  onCopyExport: () => void;
  onDownloadExport: () => void;
  onVisualProviderOverrideChange: ImageMapPanelProps["onVisualProviderOverrideChange"];
  onStartReanchor: () => void;
  onRepairNearestParagraph: () => void;
  onConvertToGlobalVisual: () => void;
  onLeaveOrphaned: () => void;
  onCancelReanchor: () => void;
  onPickReanchor: (selection: ImageMapScriptSelection) => void;
};

type BuildReferenceClipPanelArgs = {
  entries: EpisodeReferenceClipPlan["entries"];
  selectedEntryId: string | null;
  saveState: ReferenceClipPanelProps["saveState"];
  saveError: string | null;
  message: string | null;
  disabled: boolean;
  workpieceId: string | null;
  draft: ReferenceClipPanelProps["draft"];
  requestState: string;
  providers: ReferenceClipPanelProps["providers"];
  activeVisualProviderLabel: string;
  activeVisualProviderBanner: string;
  activeVisualProviderHelperText: string;
  activePromptPack: ReferenceClipPanelProps["activePromptPack"];
  selectedCandidateId: string | null;
  copyPromptAcknowledged: boolean;
  copyNegativeAcknowledged: boolean;
  onSelectEntry: (entryId: string | null) => void;
  onDraftChange: ReferenceClipPanelProps["onDraftChange"];
  onCreateReferenceClip: () => void;
  onSaveEntry: () => void;
  onDeleteEntry: () => void;
  onGenerateInForge: () => void;
  onRegenerateStub: () => void;
  onUploadAsset: (file: File) => void;
  onSelectCandidate: (candidateId: string) => void;
  onCopyPrompt: () => void;
  onCopyNegativePrompt: () => void;
  onDownloadPromptPack: () => void;
  onDownloadBrief: () => void;
  onDownloadBriefJson: () => void;
  onOpenProvider: () => void;
  onMarkSent: () => void;
  onMarkAwaitingResult: () => void;
  onClearRequestState: () => void;
  onAttachResultFromUrl: () => void;
};

type BuildThumbnailPanelArgs = {
  concepts: ThumbnailPanelProps["concepts"];
  versions: ThumbnailPanelProps["versions"];
  titleOptions: ThumbnailPanelProps["titleOptions"];
  launchVariants: ThumbnailPanelProps["launchVariants"];
  selectedTitleId: string | null;
  selectedTitleText: string;
  selectedConceptId: string;
  selectedVersionId: string | null;
  selectedLaunchVariantId: string | null;
  selectedLaunchVariantStatus: ThumbnailPanelProps["selectedLaunchVariantStatus"];
  selectedLaunchVariantNotes: string;
  selectedLaunchVariantLastTestedAt: string | null;
  selectedLaunchVariantWinnerSelectedAt: string | null;
  primaryVersionId: string | null;
  selectedConceptLabel: string;
  selectedConceptPrompt: string;
  selectedConceptStylePreset: string;
  selectedConceptTitleStyle: ThumbnailPanelProps["selectedConceptTitleStyle"];
  brandTemplates: ThumbnailPanelProps["brandTemplates"];
  brandTemplatesLoading: boolean;
  brandTemplatesError: string | null;
  selectedConceptBrandTemplateId: string | null;
  selectedBrandTemplateLogoDataUrl: string | null;
  brandLogoUploading: boolean;
  brandLogoError: string | null;
  brandLogoStatus: string | null;
  aspect: ThumbnailPanelProps["aspect"];
  activeVisualProvider: ThumbnailPanelProps["activeVisualProvider"];
  visualProviderOptions: ThumbnailPanelProps["visualProviderOptions"];
  visualProviderOverride: ThumbnailPanelProps["visualProviderOverride"];
  safeZoneEnabled: boolean;
  previewDataUrl: string | null;
  previewState: ThumbnailPanelProps["previewState"];
  previewError: string | null;
  generateError: string | null;
  uploadError: string | null;
  pairingError: string | null;
  canGenerateConcepts: boolean;
  isGeneratingConcepts: boolean;
  canGenerateTitles: boolean;
  isGeneratingTitles: boolean;
  isGenerating: boolean;
  isSavingConcept: boolean;
  isUploading: boolean;
  setSelectedConceptId: (conceptId: string) => void;
  setSelectedConceptLabel: (value: string) => void;
  setSelectedConceptPrompt: (value: string) => void;
  setSelectedConceptStyle: (value: string) => void;
  setSelectedConceptTitleStyle: Dispatch<SetStateAction<ThumbnailPanelProps["selectedConceptTitleStyle"]>>;
  setSelectedConceptBrandTemplate: (value: string | null) => void;
  setAspect: (value: ThumbnailPanelProps["aspect"]) => void;
  setSafeZoneEnabled: Dispatch<SetStateAction<boolean>>;
  onGenerateTitles: () => void;
  onSelectTitle: (titleId: string) => void;
  onUploadBrandLogo: (file: File) => void;
  onRemoveBrandLogo: () => void;
  onGenerateConcepts: () => void;
  onCreateConcept: () => void;
  onSaveConcept: () => void;
  onDeleteConcept: () => void;
  onVisualProviderOverrideChange: ThumbnailPanelProps["onVisualProviderOverrideChange"];
  onUploadImage: (file: File) => void;
  onSelectVersion: (versionId: string) => void;
  onSetPrimary: (versionId: string) => void;
  onRetryVersion: (version: ThumbnailPanelProps["versions"][number]) => void;
  onSelectLaunchVariant: (variantId: string) => void;
  onCreateLaunchVariant: () => void;
  onSelectedLaunchVariantStatusChange: ThumbnailPanelProps["onSelectedLaunchVariantStatusChange"];
  onSelectedLaunchVariantNotesChange: ThumbnailPanelProps["onSelectedLaunchVariantNotesChange"];
  onSaveLaunchVariant: () => void;
};

export function buildMediaMapPanelProps(args: BuildMediaMapPanelArgs): MediaMapPanelProps {
  return {
    entries: args.entries,
    canonicalItems: args.canonicalItems,
    selectedEntryId: args.selectedEntryId,
    scriptVersionLabel: args.approvedScriptVersion ? `v${args.approvedScriptVersion}` : "none",
    mapStatus: args.mediaMap?.status ?? "draft",
    stale: Boolean(
      args.mediaMap?.script_version_id
      && args.approvedScriptVersion
      && args.mediaMap.script_version_id !== String(args.approvedScriptVersion)
    ),
    saveState: args.saveState,
    saveError: args.saveError,
    packageState: args.packageState,
    packageError: args.packageError,
    generateDisabledReason: args.generateDisabledReason,
    onRetryLoad: args.onRetryLoad,
    canRecoverLastGeneration: args.canRecoverLastGeneration,
    onRecoverLastGeneration: args.onRecoverLastGeneration,
    message: args.message,
    disabled: args.disabled,
    operationStage: args.operationStage,
    generationScope: args.generationScope,
    budgetPolicy: args.budgetPolicy,
    draft: args.draft,
    conversation: {
      state: args.conversationState,
      seed: args.conversationSeed,
      error: args.conversationError,
      onBuildAndApply: args.onBuildAndApply,
    },
    onSelectEntry: args.onSelectEntry,
    onDraftChange: args.onDraftChange,
    onGenerationScopeChange: args.onGenerationScopeChange,
    onGenerateFromPlans: args.onGenerateFromPlans,
    onActivateMap: args.onActivateMap,
    onAddEntry: args.onAddEntry,
    onSaveEntry: args.onSaveEntry,
    onDeleteEntry: args.onDeleteEntry,
  };
}

export function buildBrollPlanPanelProps(args: BuildBrollPanelArgs): BrollPanelProps {
  return {
    canonicalV2: args.canonicalV2,
    workspaceId: args.workspaceId,
    canonicalPlanRevisionId: args.canonicalPlanRevisionId,
    canonicalPlanRevision: args.canonicalPlanRevision,
    beats: args.beats,
    selectedBeatId: args.selectedBeatId,
    workpieceId: args.workpieceId,
    coverageStrength: args.coverageStrength ?? null,
    saveState: args.saveState,
    saveError: args.saveError,
    message: args.message,
    activeOperation: args.activeOperation,
    disabled: args.disabled,
    draft: args.draft,
    requestState: args.requestState,
    providers: args.providers,
    selectedCandidateId: args.selectedCandidateId,
    promptState: args.promptState,
    copyPromptAcknowledged: args.copyPromptAcknowledged,
    onSelectBeat: args.onSelectBeat,
    onDraftChange: args.onDraftChange,
    onSaveBeat: args.onSaveBeat,
    onDeleteBeat: args.onDeleteBeat,
    onRegenerateBeat: args.onRegenerateBeat,
    onGeneratePlan: args.onGeneratePlan,
    onGenerateMotionPrompt: args.onGenerateMotionPrompt,
    onSaveMotionPrompt: args.onSaveMotionPrompt,
    onCreateRunwayReadyPrompt: args.onCreateRunwayReadyPrompt,
    onGenerateVideo: args.onGenerateVideo,
    onFindStock: args.onFindStock,
    onUploadAsset: args.onUploadAsset,
    onSelectCandidate: args.onSelectCandidate,
    onRetryCandidateIngestion: args.onRetryCandidateIngestion,
    onCopyPrompt: args.onCopyPrompt,
    onDownloadBrief: args.onDownloadBrief,
    onDownloadBriefJson: args.onDownloadBriefJson,
    onOpenProvider: args.onOpenProvider,
    onMarkSent: args.onMarkSent,
    onMarkAwaitingResult: args.onMarkAwaitingResult,
    onClearRequestState: args.onClearRequestState,
    onAttachResultFromUrl: args.onAttachResultFromUrl,
  };
}

export function buildImageMapPanelProps(args: BuildImageMapPanelArgs): ImageMapPanelProps {
  return {
    panelTitle: args.panelTitle,
    manualOnly: args.manualOnly,
    entries: args.entries,
    selectedEntryId: args.selectedEntryId,
    draftAnchor: args.draftAnchor,
    draftDescription: args.draftDescription,
    draftStylePreset: args.draftStylePreset,
    draftIntent: args.draftIntent,
    draftSourceType: args.draftSourceType,
    draftVisualPriority: args.draftVisualPriority,
    draftVisualType: args.draftVisualType,
    draftSectionIntentNote: args.draftSectionIntentNote,
    draftPlacementHint: args.draftPlacementHint,
    saveState: args.saveState,
    saveError: args.saveError,
    expectedImageCount: args.expectedImageCount,
    exportMessage: args.exportMessage,
    copyExportAcknowledged: args.copyExportAcknowledged,
    activeVisualProvider: args.activeVisualProvider,
    visualProviderOptions: args.visualProviderOptions,
    visualProviderOverride: args.visualProviderOverride,
    candidateCards: args.candidateCards,
    candidateGenerateBusy: args.candidateGenerateBusy,
    candidateGenerateError: args.candidateGenerateError,
    candidateSelectBusy: args.candidateSelectBusy,
    candidateSelectionError: args.candidateSelectionError,
    promptAuthorityState: args.promptAuthorityState,
    anchorStatusLabel: args.anchorStatusLabel,
    anchorStatusTone: args.anchorStatusTone,
    anchorStatusDetail: args.anchorStatusDetail,
    reanchorMode: args.reanchorMode,
    reanchorBusy: args.reanchorBusy,
    reanchorDisabledReason: args.reanchorDisabledReason,
    nearestRepairAvailable: args.nearestRepairAvailable,
    reanchorError: args.reanchorError,
    reanchorScriptSourceLabel: args.reanchorScriptSourceLabel,
    reanchorScriptHint: args.reanchorScriptHint,
    reanchorScriptLoading: args.reanchorScriptLoading,
    reanchorParagraphs: args.reanchorParagraphs,
    activeAnchorLabel: args.activeAnchorLabel,
    disabled: args.disabled,
    onRetryLoad: args.onRetryLoad,
    onSelectEntry: args.onSelectEntry,
    onDraftAnchorChange: args.onDraftAnchorChange,
    onDraftDescriptionChange: args.onDraftDescriptionChange,
    onDraftStylePresetChange: args.onDraftStylePresetChange,
    onDraftIntentChange: args.onDraftIntentChange,
    onDraftSourceTypeChange: args.onDraftSourceTypeChange,
    onDraftVisualPriorityChange: args.onDraftVisualPriorityChange,
    onDraftVisualTypeChange: args.onDraftVisualTypeChange,
    onDraftSectionIntentNoteChange: args.onDraftSectionIntentNoteChange,
    onDraftPlacementHintChange: args.onDraftPlacementHintChange,
    onCreateEntry: args.onCreateEntry,
    onDuplicateEntry: args.onDuplicateEntry,
    onDeleteEntry: args.onDeleteEntry,
    onSeedFromScript: args.onSeedFromScript,
    onGenerateCandidates: args.onGenerateCandidates,
    onInterpretPrompt: args.onInterpretPrompt,
    onSavePromptEdit: args.onSavePromptEdit,
    onRefreshPrompt: args.onRefreshPrompt,
    onUploadAsset: args.onUploadAsset,
    onSelectCandidate: args.onSelectCandidate,
    onCopyExport: args.onCopyExport,
    onDownloadExport: args.onDownloadExport,
    onVisualProviderOverrideChange: args.onVisualProviderOverrideChange,
    onStartReanchor: args.onStartReanchor,
    onRepairNearestParagraph: args.onRepairNearestParagraph,
    onConvertToGlobalVisual: args.onConvertToGlobalVisual,
    onLeaveOrphaned: args.onLeaveOrphaned,
    onCancelReanchor: args.onCancelReanchor,
    onPickReanchor: args.onPickReanchor,
  };
}

export function buildReferenceClipPlanPanelProps(args: BuildReferenceClipPanelArgs): ReferenceClipPanelProps {
  return {
    entries: args.entries,
    selectedEntryId: args.selectedEntryId,
    saveState: args.saveState,
    saveError: args.saveError,
    message: args.message,
    disabled: args.disabled,
    workpieceId: args.workpieceId,
    draft: args.draft,
    requestState: args.requestState,
    providers: args.providers,
    activeVisualProviderLabel: args.activeVisualProviderLabel,
    activeVisualProviderBanner: args.activeVisualProviderBanner,
    activeVisualProviderHelperText: args.activeVisualProviderHelperText,
    activePromptPack: args.activePromptPack,
    selectedCandidateId: args.selectedCandidateId,
    copyPromptAcknowledged: args.copyPromptAcknowledged,
    copyNegativeAcknowledged: args.copyNegativeAcknowledged,
    onSelectEntry: args.onSelectEntry,
    onDraftChange: args.onDraftChange,
    onCreateReferenceClip: args.onCreateReferenceClip,
    onSaveEntry: args.onSaveEntry,
    onDeleteEntry: args.onDeleteEntry,
    onGenerateInForge: args.onGenerateInForge,
    onRegenerateStub: args.onRegenerateStub,
    onUploadAsset: args.onUploadAsset,
    onSelectCandidate: args.onSelectCandidate,
    onCopyPrompt: args.onCopyPrompt,
    onCopyNegativePrompt: args.onCopyNegativePrompt,
    onDownloadPromptPack: args.onDownloadPromptPack,
    onDownloadBrief: args.onDownloadBrief,
    onDownloadBriefJson: args.onDownloadBriefJson,
    onOpenProvider: args.onOpenProvider,
    onMarkSent: args.onMarkSent,
    onMarkAwaitingResult: args.onMarkAwaitingResult,
    onClearRequestState: args.onClearRequestState,
    onAttachResultFromUrl: args.onAttachResultFromUrl,
  };
}

export function buildThumbnailPanelProps(args: BuildThumbnailPanelArgs): ThumbnailPanelProps {
  return {
    concepts: args.concepts,
    versions: args.versions,
    titleOptions: args.titleOptions,
    launchVariants: args.launchVariants,
    selectedTitleId: args.selectedTitleId,
    selectedTitleText: args.selectedTitleText,
    selectedConceptId: args.selectedConceptId,
    selectedVersionId: args.selectedVersionId,
    selectedLaunchVariantId: args.selectedLaunchVariantId,
    selectedLaunchVariantStatus: args.selectedLaunchVariantStatus,
    selectedLaunchVariantNotes: args.selectedLaunchVariantNotes,
    selectedLaunchVariantLastTestedAt: args.selectedLaunchVariantLastTestedAt,
    selectedLaunchVariantWinnerSelectedAt: args.selectedLaunchVariantWinnerSelectedAt,
    primaryVersionId: args.primaryVersionId,
    selectedConceptLabel: args.selectedConceptLabel,
    selectedConceptPrompt: args.selectedConceptPrompt,
    selectedConceptStylePreset: args.selectedConceptStylePreset,
    selectedConceptTitleStyle: args.selectedConceptTitleStyle,
    brandTemplates: args.brandTemplates,
    brandTemplatesLoading: args.brandTemplatesLoading,
    brandTemplatesError: args.brandTemplatesError,
    selectedConceptBrandTemplateId: args.selectedConceptBrandTemplateId,
    selectedBrandTemplateLogoDataUrl: args.selectedBrandTemplateLogoDataUrl,
    brandLogoUploading: args.brandLogoUploading,
    brandLogoError: args.brandLogoError,
    brandLogoStatus: args.brandLogoStatus,
    aspect: args.aspect,
    activeVisualProvider: args.activeVisualProvider,
    visualProviderOptions: args.visualProviderOptions,
    visualProviderOverride: args.visualProviderOverride,
    safeZoneEnabled: args.safeZoneEnabled,
    previewDataUrl: args.previewDataUrl,
    previewState: args.previewState,
    previewError: args.previewError,
    generateError: args.generateError,
    uploadError: args.uploadError,
    pairingError: args.pairingError,
    canGenerateConcepts: args.canGenerateConcepts,
    isGeneratingConcepts: args.isGeneratingConcepts,
    canGenerateTitles: args.canGenerateTitles,
    isGeneratingTitles: args.isGeneratingTitles,
    isGenerating: args.isGenerating,
    isSavingConcept: args.isSavingConcept,
    isUploading: args.isUploading,
    onGenerateTitles: args.onGenerateTitles,
    onSelectTitle: args.onSelectTitle,
    onSelectConcept: args.setSelectedConceptId,
    onSelectedConceptLabelChange: args.setSelectedConceptLabel,
    onSelectedConceptPromptChange: args.setSelectedConceptPrompt,
    onSelectedConceptStylePresetChange: args.setSelectedConceptStyle,
    onSelectedConceptTitleFontPresetChange: (value: string) => args.setSelectedConceptTitleStyle((prev) => ({
      ...normalizeEpisodeThumbnailTitleStyle(prev),
      font_preset: value as TitleFontPreset,
    })),
    onSelectedConceptTitleColorChange: (value: string) => args.setSelectedConceptTitleStyle((prev) => ({
      ...normalizeEpisodeThumbnailTitleStyle(prev),
      text_color: value.toUpperCase(),
    })),
    onSelectedConceptTitleShadowEnabledChange: (value: boolean) => args.setSelectedConceptTitleStyle((prev) => ({
      ...normalizeEpisodeThumbnailTitleStyle(prev),
      shadow: {
        ...normalizeEpisodeThumbnailTitleStyle(prev).shadow,
        enabled: value,
      },
    })),
    onSelectedConceptTitleShadowStrengthChange: (value: string) => args.setSelectedConceptTitleStyle((prev) => ({
      ...normalizeEpisodeThumbnailTitleStyle(prev),
      shadow: {
        ...normalizeEpisodeThumbnailTitleStyle(prev).shadow,
        strength: value as TitleShadowStrength,
      },
    })),
    onSelectedConceptBrandTemplateChange: args.setSelectedConceptBrandTemplate,
    onUploadBrandLogo: args.onUploadBrandLogo,
    onRemoveBrandLogo: args.onRemoveBrandLogo,
    onGenerateConcepts: args.onGenerateConcepts,
    onCreateConcept: args.onCreateConcept,
    onSaveConcept: args.onSaveConcept,
    onDeleteConcept: args.onDeleteConcept,
    onAspectChange: args.setAspect,
    onVisualProviderOverrideChange: args.onVisualProviderOverrideChange,
    onToggleSafeZone: () => args.setSafeZoneEnabled((prev) => !prev),
    onUploadImage: args.onUploadImage,
    onSelectVersion: args.onSelectVersion,
    onSetPrimary: args.onSetPrimary,
    onRetryVersion: args.onRetryVersion,
    onSelectLaunchVariant: args.onSelectLaunchVariant,
    onCreateLaunchVariant: args.onCreateLaunchVariant,
    onSelectedLaunchVariantStatusChange: args.onSelectedLaunchVariantStatusChange,
    onSelectedLaunchVariantNotesChange: args.onSelectedLaunchVariantNotesChange,
    onSaveLaunchVariant: args.onSaveLaunchVariant,
  };
}
