import { useState } from "react";
import { DEFAULT_HEARTH_VISUAL_STYLE } from "../../lib/hearth-visual-styles";

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
  };
}
