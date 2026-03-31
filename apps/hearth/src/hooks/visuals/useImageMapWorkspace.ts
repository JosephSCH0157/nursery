import { useCallback, useState } from "react";
import type {
  EpisodeImageMapEntry,
  EpisodeImageMapAnchorScope,
  EpisodeImageMapVisualPriority,
  EpisodeImageMapVisualType,
} from "../../lib/episode-package-v2";
import { DEFAULT_HEARTH_VISUAL_STYLE, normalizeHearthVisualStyle } from "../../lib/hearth-visual-styles";

type CanonicalImageMapScriptState = {
  status: "idle" | "loading" | "ready" | "error";
  text: string | null;
  source: "primary_script" | "saved_draft" | null;
  includesUnsavedLocalEdits: boolean;
  error: string | null;
};

export function useImageMapWorkspace() {
  const [selectedImageMapEntryId, setSelectedImageMapEntryId] = useState<string | null>(null);
  const [imageMapAnchorDraft, setImageMapAnchorDraft] = useState("");
  const [imageMapDescriptionDraft, setImageMapDescriptionDraft] = useState("");
  const [imageMapStyleDraft, setImageMapStyleDraft] = useState(DEFAULT_HEARTH_VISUAL_STYLE);
  const [imageMapIntentDraft, setImageMapIntentDraft] = useState("cutaway");
  const [imageMapSourceTypeDraft, setImageMapSourceTypeDraft] = useState("stock");
  const [imageMapAnchorScopeDraft, setImageMapAnchorScopeDraft] = useState<EpisodeImageMapAnchorScope>("attached");
  const [imageMapVisualPriorityDraft, setImageMapVisualPriorityDraft] = useState<EpisodeImageMapVisualPriority>("supporting");
  const [imageMapVisualTypeDraft, setImageMapVisualTypeDraft] = useState<EpisodeImageMapVisualType>("still_image");
  const [imageMapSectionIntentNoteDraft, setImageMapSectionIntentNoteDraft] = useState("");
  const [imageMapPlacementHintDraft, setImageMapPlacementHintDraft] = useState("");
  const [imageMapMetadataUpdatedAt, setImageMapMetadataUpdatedAt] = useState<string | null>(null);
  const [imageMapSaveState, setImageMapSaveState] = useState<"saved" | "editing" | "saving" | "error" | "offline">("saved");
  const [imageMapSaveError, setImageMapSaveError] = useState<string | null>(null);
  const [imageMapExportMessage, setImageMapExportMessage] = useState<string | null>(null);
  const [isImageMapCandidateGenerating, setIsImageMapCandidateGenerating] = useState(false);
  const [isImageMapCandidateSelecting, setIsImageMapCandidateSelecting] = useState(false);
  const [imageMapCandidateError, setImageMapCandidateError] = useState<string | null>(null);
  const [imageMapCandidateSelectionError, setImageMapCandidateSelectionError] = useState<string | null>(null);
  const [imageMapCandidatePreviewStateById, setImageMapCandidatePreviewStateById] = useState<Record<string, "loading" | "ready" | "error">>({});
  const [imageMapCandidatePreviewUrlById, setImageMapCandidatePreviewUrlById] = useState<Record<string, string>>({});
  const [imageMapCandidatePreviewErrorById, setImageMapCandidatePreviewErrorById] = useState<Record<string, string>>({});
  const [canonicalImageMapScriptState, setCanonicalImageMapScriptState] = useState<CanonicalImageMapScriptState>({
    status: "idle",
    text: null,
    source: null,
    includesUnsavedLocalEdits: false,
    error: null,
  });
  const [isImageMapReanchorMode, setIsImageMapReanchorMode] = useState(false);
  const [isImageMapReanchorSaving, setIsImageMapReanchorSaving] = useState(false);
  const [imageMapReanchorError, setImageMapReanchorError] = useState<string | null>(null);

  const setImageMapDraftEditing = <T,>(setter: (value: T) => void, value: T) => {
    setter(value);
    if (imageMapSaveState !== "editing") {
      setImageMapSaveState("editing");
    }
    setImageMapSaveError(null);
  };

  function onImageMapDraftAnchorChange(value: string): void {
    setImageMapDraftEditing(setImageMapAnchorDraft, value);
  }

  function onImageMapDraftDescriptionChange(value: string): void {
    setImageMapDraftEditing(setImageMapDescriptionDraft, value);
  }

  function onImageMapDraftStylePresetChange(value: string): void {
    setImageMapDraftEditing(setImageMapStyleDraft, normalizeHearthVisualStyle(value));
  }

  function onImageMapDraftIntentChange(value: string): void {
    setImageMapDraftEditing(setImageMapIntentDraft, value);
  }

  function onImageMapDraftSourceTypeChange(value: string): void {
    setImageMapDraftEditing(setImageMapSourceTypeDraft, value);
  }

  function onImageMapDraftVisualPriorityChange(value: string): void {
    setImageMapDraftEditing(setImageMapVisualPriorityDraft, value as EpisodeImageMapVisualPriority);
  }

  function onImageMapDraftVisualTypeChange(value: string): void {
    setImageMapDraftEditing(setImageMapVisualTypeDraft, value as EpisodeImageMapVisualType);
  }

  function onImageMapDraftSectionIntentNoteChange(value: string): void {
    setImageMapDraftEditing(setImageMapSectionIntentNoteDraft, value);
  }

  function onImageMapDraftPlacementHintChange(value: string): void {
    setImageMapDraftEditing(setImageMapPlacementHintDraft, value);
  }

  const syncImageMapDraftFromEntry = useCallback((
    selectedImageMapEntry: EpisodeImageMapEntry | null,
    resolveAnchorScope: (entry: EpisodeImageMapEntry) => EpisodeImageMapAnchorScope,
  ): void => {
    if (!selectedImageMapEntry) {
      setImageMapAnchorDraft("");
      setImageMapDescriptionDraft("");
      setImageMapStyleDraft(DEFAULT_HEARTH_VISUAL_STYLE);
      setImageMapIntentDraft("cutaway");
      setImageMapSourceTypeDraft("stock");
      setImageMapAnchorScopeDraft("attached");
      setImageMapVisualPriorityDraft("supporting");
      setImageMapVisualTypeDraft("still_image");
      setImageMapSectionIntentNoteDraft("");
      setImageMapPlacementHintDraft("");
      setImageMapSaveState("saved");
      return;
    }
    setImageMapAnchorDraft(selectedImageMapEntry.anchor);
    setImageMapDescriptionDraft(selectedImageMapEntry.description);
    setImageMapStyleDraft(normalizeHearthVisualStyle(selectedImageMapEntry.style_preset));
    setImageMapIntentDraft(selectedImageMapEntry.intent || "cutaway");
    setImageMapSourceTypeDraft(selectedImageMapEntry.source_type || "stock");
    setImageMapAnchorScopeDraft(resolveAnchorScope(selectedImageMapEntry));
    setImageMapVisualPriorityDraft(selectedImageMapEntry.visual_priority ?? "supporting");
    setImageMapVisualTypeDraft(selectedImageMapEntry.visual_type ?? "still_image");
    setImageMapSectionIntentNoteDraft(selectedImageMapEntry.section_intent_note ?? "");
    setImageMapPlacementHintDraft(selectedImageMapEntry.placement_hint ?? "");
    setImageMapSaveState("saved");
    setImageMapCandidateError(null);
    setImageMapCandidateSelectionError(null);
  }, []);

  const syncSelectedImageMapEntryId = useCallback((entries: EpisodeImageMapEntry[]): void => {
    if (entries.length === 0) {
      setSelectedImageMapEntryId(null);
      setIsImageMapReanchorMode(false);
      setIsImageMapReanchorSaving(false);
      setImageMapReanchorError(null);
      return;
    }
    setSelectedImageMapEntryId((current) => (
      current && entries.some((entry) => entry.id === current)
        ? current
        : (entries[0]?.id ?? null)
    ));
  }, []);

  const resetImageMapReanchorState = useCallback((): void => {
    setIsImageMapReanchorMode(false);
    setIsImageMapReanchorSaving(false);
    setImageMapReanchorError(null);
  }, []);

  return {
    selectedImageMapEntryId,
    setSelectedImageMapEntryId,
    imageMapAnchorDraft,
    setImageMapAnchorDraft,
    imageMapDescriptionDraft,
    setImageMapDescriptionDraft,
    imageMapStyleDraft,
    setImageMapStyleDraft,
    imageMapIntentDraft,
    setImageMapIntentDraft,
    imageMapSourceTypeDraft,
    setImageMapSourceTypeDraft,
    imageMapAnchorScopeDraft,
    setImageMapAnchorScopeDraft,
    imageMapVisualPriorityDraft,
    setImageMapVisualPriorityDraft,
    imageMapVisualTypeDraft,
    setImageMapVisualTypeDraft,
    imageMapSectionIntentNoteDraft,
    setImageMapSectionIntentNoteDraft,
    imageMapPlacementHintDraft,
    setImageMapPlacementHintDraft,
    imageMapMetadataUpdatedAt,
    setImageMapMetadataUpdatedAt,
    imageMapSaveState,
    setImageMapSaveState,
    imageMapSaveError,
    setImageMapSaveError,
    imageMapExportMessage,
    setImageMapExportMessage,
    isImageMapCandidateGenerating,
    setIsImageMapCandidateGenerating,
    isImageMapCandidateSelecting,
    setIsImageMapCandidateSelecting,
    imageMapCandidateError,
    setImageMapCandidateError,
    imageMapCandidateSelectionError,
    setImageMapCandidateSelectionError,
    imageMapCandidatePreviewStateById,
    setImageMapCandidatePreviewStateById,
    imageMapCandidatePreviewUrlById,
    setImageMapCandidatePreviewUrlById,
    imageMapCandidatePreviewErrorById,
    setImageMapCandidatePreviewErrorById,
    canonicalImageMapScriptState,
    setCanonicalImageMapScriptState,
    isImageMapReanchorMode,
    setIsImageMapReanchorMode,
    isImageMapReanchorSaving,
    setIsImageMapReanchorSaving,
    imageMapReanchorError,
    setImageMapReanchorError,
    setImageMapDraftEditing,
    onImageMapDraftAnchorChange,
    onImageMapDraftDescriptionChange,
    onImageMapDraftStylePresetChange,
    onImageMapDraftIntentChange,
    onImageMapDraftSourceTypeChange,
    onImageMapDraftVisualPriorityChange,
    onImageMapDraftVisualTypeChange,
    onImageMapDraftSectionIntentNoteChange,
    onImageMapDraftPlacementHintChange,
    syncImageMapDraftFromEntry,
    syncSelectedImageMapEntryId,
    resetImageMapReanchorState,
  };
}
