import { useState } from "react";
import type {
  EpisodeImageMapAnchorScope,
  EpisodeImageMapVisualPriority,
  EpisodeImageMapVisualType,
} from "../../lib/episode-package-v2";
import { DEFAULT_HEARTH_VISUAL_STYLE } from "../../lib/hearth-visual-styles";

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
  };
}
