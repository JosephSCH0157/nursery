import { useState } from "react";
import { DEFAULT_HEARTH_VISUAL_STYLE, normalizeHearthVisualStyle } from "../../lib/hearth-visual-styles";

export function useReferenceClipWorkspace() {
  const [selectedReferenceClipEntryId, setSelectedReferenceClipEntryId] = useState<string | null>(null);
  const [referenceClipAnchorDraft, setReferenceClipAnchorDraft] = useState("");
  const [referenceClipDescriptionDraft, setReferenceClipDescriptionDraft] = useState("");
  const [referenceClipPlacementHintDraft, setReferenceClipPlacementHintDraft] = useState("first_occurrence");
  const [referenceClipFormatDraft, setReferenceClipFormatDraft] = useState("still");
  const [referenceClipDataTypeDraft, setReferenceClipDataTypeDraft] = useState("quantitative");
  const [referenceClipContextTypeDraft, setReferenceClipContextTypeDraft] = useState("historical");
  const [referenceClipToneDraft, setReferenceClipToneDraft] = useState("neutral");
  const [referenceClipMotionLevelDraft, setReferenceClipMotionLevelDraft] = useState("static");
  const [referenceClipBackgroundContextDraft, setReferenceClipBackgroundContextDraft] = useState("");
  const [referenceClipForegroundDataDraft, setReferenceClipForegroundDataDraft] = useState("");
  const [referenceClipVisualStyleDraft, setReferenceClipVisualStyleDraft] = useState(DEFAULT_HEARTH_VISUAL_STYLE);
  const [referenceClipChartTypeDraft, setReferenceClipChartTypeDraft] = useState("line");
  const [referenceClipTitleDraft, setReferenceClipTitleDraft] = useState("");
  const [referenceClipLabelsDraft, setReferenceClipLabelsDraft] = useState("");
  const [referenceClipValuesDraft, setReferenceClipValuesDraft] = useState("");
  const [referenceClipEmphasisKeyDraft, setReferenceClipEmphasisKeyDraft] = useState("");
  const [referenceClipSourceTypeDraft, setReferenceClipSourceTypeDraft] = useState("planned");
  const [referenceClipProviderIdDraft, setReferenceClipProviderIdDraft] = useState("");
  const [referenceClipSourceLabelDraft, setReferenceClipSourceLabelDraft] = useState("");
  const [referenceClipSourceUrlDraft, setReferenceClipSourceUrlDraft] = useState("");
  const [referenceClipProviderNoteDraft, setReferenceClipProviderNoteDraft] = useState("");
  const [referenceClipUsageNoteDraft, setReferenceClipUsageNoteDraft] = useState("");
  const [referenceClipResultMetadataDraft, setReferenceClipResultMetadataDraft] = useState("");
  const [referenceClipSaveState, setReferenceClipSaveState] = useState<"saved" | "editing" | "saving" | "error" | "offline">("saved");
  const [referenceClipSaveError, setReferenceClipSaveError] = useState<string | null>(null);
  const [referenceClipMessage, setReferenceClipMessage] = useState<string | null>(null);
  const [isReferenceClipBusy, setIsReferenceClipBusy] = useState(false);

  function setReferenceClipDraftEditing(fieldSetter: (value: string) => void, value: string): void {
    fieldSetter(value);
    if (referenceClipSaveState !== "editing") {
      setReferenceClipSaveState("editing");
    }
    setReferenceClipSaveError(null);
  }

  function onReferenceClipDraftChange(field: string, value: string): void {
    if (field === "anchorText") setReferenceClipDraftEditing(setReferenceClipAnchorDraft, value);
    else if (field === "description") setReferenceClipDraftEditing(setReferenceClipDescriptionDraft, value);
    else if (field === "placementHint") setReferenceClipDraftEditing(setReferenceClipPlacementHintDraft, value);
    else if (field === "format") setReferenceClipDraftEditing(setReferenceClipFormatDraft, value);
    else if (field === "dataType") setReferenceClipDraftEditing(setReferenceClipDataTypeDraft, value);
    else if (field === "contextType") setReferenceClipDraftEditing(setReferenceClipContextTypeDraft, value);
    else if (field === "tone") setReferenceClipDraftEditing(setReferenceClipToneDraft, value);
    else if (field === "motionLevel") setReferenceClipDraftEditing(setReferenceClipMotionLevelDraft, value);
    else if (field === "backgroundContextDescription") setReferenceClipDraftEditing(setReferenceClipBackgroundContextDraft, value);
    else if (field === "foregroundDataDescription") setReferenceClipDraftEditing(setReferenceClipForegroundDataDraft, value);
    else if (field === "visualStyle") setReferenceClipDraftEditing((next) => setReferenceClipVisualStyleDraft(normalizeHearthVisualStyle(next)), value);
    else if (field === "chartType") setReferenceClipDraftEditing(setReferenceClipChartTypeDraft, value);
    else if (field === "title") setReferenceClipDraftEditing(setReferenceClipTitleDraft, value);
    else if (field === "labels") setReferenceClipDraftEditing(setReferenceClipLabelsDraft, value);
    else if (field === "values") setReferenceClipDraftEditing(setReferenceClipValuesDraft, value);
    else if (field === "emphasisKey") setReferenceClipDraftEditing(setReferenceClipEmphasisKeyDraft, value);
    else if (field === "sourceType") setReferenceClipDraftEditing(setReferenceClipSourceTypeDraft, value);
    else if (field === "providerId") setReferenceClipDraftEditing(setReferenceClipProviderIdDraft, value);
    else if (field === "sourceLabel") setReferenceClipDraftEditing(setReferenceClipSourceLabelDraft, value);
    else if (field === "sourceUrl") setReferenceClipDraftEditing(setReferenceClipSourceUrlDraft, value);
    else if (field === "providerNote") setReferenceClipDraftEditing(setReferenceClipProviderNoteDraft, value);
    else if (field === "usageNote") setReferenceClipDraftEditing(setReferenceClipUsageNoteDraft, value);
    else if (field === "resultMetadata") setReferenceClipDraftEditing(setReferenceClipResultMetadataDraft, value);
  }

  return {
    selectedReferenceClipEntryId,
    setSelectedReferenceClipEntryId,
    referenceClipAnchorDraft,
    setReferenceClipAnchorDraft,
    referenceClipDescriptionDraft,
    setReferenceClipDescriptionDraft,
    referenceClipPlacementHintDraft,
    setReferenceClipPlacementHintDraft,
    referenceClipFormatDraft,
    setReferenceClipFormatDraft,
    referenceClipDataTypeDraft,
    setReferenceClipDataTypeDraft,
    referenceClipContextTypeDraft,
    setReferenceClipContextTypeDraft,
    referenceClipToneDraft,
    setReferenceClipToneDraft,
    referenceClipMotionLevelDraft,
    setReferenceClipMotionLevelDraft,
    referenceClipBackgroundContextDraft,
    setReferenceClipBackgroundContextDraft,
    referenceClipForegroundDataDraft,
    setReferenceClipForegroundDataDraft,
    referenceClipVisualStyleDraft,
    setReferenceClipVisualStyleDraft,
    referenceClipChartTypeDraft,
    setReferenceClipChartTypeDraft,
    referenceClipTitleDraft,
    setReferenceClipTitleDraft,
    referenceClipLabelsDraft,
    setReferenceClipLabelsDraft,
    referenceClipValuesDraft,
    setReferenceClipValuesDraft,
    referenceClipEmphasisKeyDraft,
    setReferenceClipEmphasisKeyDraft,
    referenceClipSourceTypeDraft,
    setReferenceClipSourceTypeDraft,
    referenceClipProviderIdDraft,
    setReferenceClipProviderIdDraft,
    referenceClipSourceLabelDraft,
    setReferenceClipSourceLabelDraft,
    referenceClipSourceUrlDraft,
    setReferenceClipSourceUrlDraft,
    referenceClipProviderNoteDraft,
    setReferenceClipProviderNoteDraft,
    referenceClipUsageNoteDraft,
    setReferenceClipUsageNoteDraft,
    referenceClipResultMetadataDraft,
    setReferenceClipResultMetadataDraft,
    referenceClipSaveState,
    setReferenceClipSaveState,
    referenceClipSaveError,
    setReferenceClipSaveError,
    referenceClipMessage,
    setReferenceClipMessage,
    isReferenceClipBusy,
    setIsReferenceClipBusy,
    setReferenceClipDraftEditing,
    onReferenceClipDraftChange,
  };
}
