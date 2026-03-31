import type { ComponentProps } from "react";
import BrollPlanPanel from "../../components/visuals/BrollPlanPanel";
import EpisodeMediaMapPanel from "../../components/visuals/EpisodeMediaMapPanel";
import ReferenceClipPlanPanel from "../../components/visuals/ReferenceClipPlanPanel";
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

type MediaMapPanelProps = ComponentProps<typeof EpisodeMediaMapPanel>;
type BrollPanelProps = ComponentProps<typeof BrollPlanPanel>;
type ReferenceClipPanelProps = ComponentProps<typeof ReferenceClipPlanPanel>;

type BuildMediaMapPanelArgs = {
  entries: EpisodeMediaMapEntry[];
  selectedEntryId: string | null;
  approvedScriptVersion: number | null;
  mediaMap: EpisodeMediaMap | null;
  saveState: MediaMapPanelProps["saveState"];
  saveError: string | null;
  message: string | null;
  disabled: boolean;
  generationScope: MediaMapGenerationScope;
  draft: MediaMapPanelProps["draft"];
  conversationState: MediaMapPanelProps["conversation"]["state"];
  conversationSeed: MediaMapConversationSeed | null;
  conversationError: string | null;
  onBuildAndApply: (args: {
    directionId: MediaMapConversationDirectionId;
    constraintsText: string;
    derivedFromScript: boolean;
  }) => void;
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
  beats: EpisodeBrollPlan["beats"];
  selectedBeatId: string | null;
  coverageStrength: EpisodeBrollPlan["coverage_strength"] | null;
  saveState: BrollPanelProps["saveState"];
  saveError: string | null;
  message: string | null;
  disabled: boolean;
  draft: BrollPanelProps["draft"];
  requestState: string;
  providers: BrollPanelProps["providers"];
  selectedCandidateId: string | null;
  onSelectBeat: (beatId: string | null) => void;
  onDraftChange: BrollPanelProps["onDraftChange"];
  onSaveBeat: () => void;
  onDeleteBeat: () => void;
  onRegenerateBeat: () => void;
  onGeneratePlan: () => void;
  onFindStock: () => void;
  onUploadAsset: (file: File) => void;
  onSelectCandidate: (candidateId: string) => void;
  onCopyPrompt: () => void;
  onDownloadBrief: () => void;
  onDownloadBriefJson: () => void;
  onOpenProvider: () => void;
  onMarkSent: () => void;
  onMarkAwaitingResult: () => void;
  onClearRequestState: () => void;
  onAttachResultFromUrl: () => void;
};

type BuildReferenceClipPanelArgs = {
  entries: EpisodeReferenceClipPlan["entries"];
  selectedEntryId: string | null;
  saveState: ReferenceClipPanelProps["saveState"];
  saveError: string | null;
  message: string | null;
  disabled: boolean;
  draft: ReferenceClipPanelProps["draft"];
  requestState: string;
  providers: ReferenceClipPanelProps["providers"];
  activeVisualProviderLabel: string;
  activeVisualProviderBanner: string;
  activeVisualProviderHelperText: string;
  activePromptPack: ReferenceClipPanelProps["activePromptPack"];
  selectedCandidateId: string | null;
  onSelectEntry: (entryId: string | null) => void;
  onDraftChange: ReferenceClipPanelProps["onDraftChange"];
  onCreateReferenceClip: () => void;
  onSaveEntry: () => void;
  onDeleteEntry: () => void;
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

export function buildMediaMapPanelProps(args: BuildMediaMapPanelArgs): MediaMapPanelProps {
  return {
    entries: args.entries,
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
    message: args.message,
    disabled: args.disabled,
    generationScope: args.generationScope,
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
    beats: args.beats,
    selectedBeatId: args.selectedBeatId,
    coverageStrength: args.coverageStrength,
    saveState: args.saveState,
    saveError: args.saveError,
    message: args.message,
    disabled: args.disabled,
    draft: args.draft,
    requestState: args.requestState,
    providers: args.providers,
    selectedCandidateId: args.selectedCandidateId,
    onSelectBeat: args.onSelectBeat,
    onDraftChange: args.onDraftChange,
    onSaveBeat: args.onSaveBeat,
    onDeleteBeat: args.onDeleteBeat,
    onRegenerateBeat: args.onRegenerateBeat,
    onGeneratePlan: args.onGeneratePlan,
    onFindStock: args.onFindStock,
    onUploadAsset: args.onUploadAsset,
    onSelectCandidate: args.onSelectCandidate,
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

export function buildReferenceClipPlanPanelProps(args: BuildReferenceClipPanelArgs): ReferenceClipPanelProps {
  return {
    entries: args.entries,
    selectedEntryId: args.selectedEntryId,
    saveState: args.saveState,
    saveError: args.saveError,
    message: args.message,
    disabled: args.disabled,
    draft: args.draft,
    requestState: args.requestState,
    providers: args.providers,
    activeVisualProviderLabel: args.activeVisualProviderLabel,
    activeVisualProviderBanner: args.activeVisualProviderBanner,
    activeVisualProviderHelperText: args.activeVisualProviderHelperText,
    activePromptPack: args.activePromptPack,
    selectedCandidateId: args.selectedCandidateId,
    onSelectEntry: args.onSelectEntry,
    onDraftChange: args.onDraftChange,
    onCreateReferenceClip: args.onCreateReferenceClip,
    onSaveEntry: args.onSaveEntry,
    onDeleteEntry: args.onDeleteEntry,
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
