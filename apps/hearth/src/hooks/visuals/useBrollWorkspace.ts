import { useState } from "react";
import type { EpisodeBrollMotionAssetCategory } from "../../lib/episode-package-v2";

export function useBrollWorkspace() {
  const [selectedBrollBeatId, setSelectedBrollBeatId] = useState<string | null>(null);
  const [brollAnchorDraft, setBrollAnchorDraft] = useState("");
  const [brollDescriptionDraft, setBrollDescriptionDraft] = useState("");
  const [brollMotionIntentDraft, setBrollMotionIntentDraft] = useState("broll");
  const [brollAssetCategoryDraft, setBrollAssetCategoryDraft] = useState<EpisodeBrollMotionAssetCategory>("stock_video");
  const [brollPriorityDraft, setBrollPriorityDraft] = useState("supporting");
  const [brollKeywordsDraft, setBrollKeywordsDraft] = useState("");
  const [brollMoodDraft, setBrollMoodDraft] = useState("");
  const [brollShotTypeDraft, setBrollShotTypeDraft] = useState("mixed");
  const [brollMotionSuggestionDraft, setBrollMotionSuggestionDraft] = useState("");
  const [brollSuggestedDurationDraft, setBrollSuggestedDurationDraft] = useState("");
  const [brollPlacementHintDraft, setBrollPlacementHintDraft] = useState("first_occurrence");
  const [brollDataChartTypeDraft, setBrollDataChartTypeDraft] = useState("bar");
  const [brollDataTitleDraft, setBrollDataTitleDraft] = useState("");
  const [brollDataLabelsDraft, setBrollDataLabelsDraft] = useState("");
  const [brollDataValuesDraft, setBrollDataValuesDraft] = useState("");
  const [brollDataEmphasisKeyDraft, setBrollDataEmphasisKeyDraft] = useState("");
  const [brollDataAnimationStyleDraft, setBrollDataAnimationStyleDraft] = useState("");
  const [brollProviderIdDraft, setBrollProviderIdDraft] = useState("");
  const [brollSourceLabelDraft, setBrollSourceLabelDraft] = useState("");
  const [brollSourceUrlDraft, setBrollSourceUrlDraft] = useState("");
  const [brollProviderNoteDraft, setBrollProviderNoteDraft] = useState("");
  const [brollUsageNoteDraft, setBrollUsageNoteDraft] = useState("");
  const [brollResultMetadataDraft, setBrollResultMetadataDraft] = useState("");
  const [brollSaveState, setBrollSaveState] = useState<"saved" | "editing" | "saving" | "error" | "offline">("saved");
  const [brollSaveError, setBrollSaveError] = useState<string | null>(null);
  const [brollMessage, setBrollMessage] = useState<string | null>(null);
  const [isBrollBusy, setIsBrollBusy] = useState(false);

  function setBrollDraftEditing(fieldSetter: (value: string) => void, value: string): void {
    fieldSetter(value);
    if (brollSaveState !== "editing") {
      setBrollSaveState("editing");
    }
    setBrollSaveError(null);
  }

  return {
    selectedBrollBeatId,
    setSelectedBrollBeatId,
    brollAnchorDraft,
    setBrollAnchorDraft,
    brollDescriptionDraft,
    setBrollDescriptionDraft,
    brollMotionIntentDraft,
    setBrollMotionIntentDraft,
    brollAssetCategoryDraft,
    setBrollAssetCategoryDraft,
    brollPriorityDraft,
    setBrollPriorityDraft,
    brollKeywordsDraft,
    setBrollKeywordsDraft,
    brollMoodDraft,
    setBrollMoodDraft,
    brollShotTypeDraft,
    setBrollShotTypeDraft,
    brollMotionSuggestionDraft,
    setBrollMotionSuggestionDraft,
    brollSuggestedDurationDraft,
    setBrollSuggestedDurationDraft,
    brollPlacementHintDraft,
    setBrollPlacementHintDraft,
    brollDataChartTypeDraft,
    setBrollDataChartTypeDraft,
    brollDataTitleDraft,
    setBrollDataTitleDraft,
    brollDataLabelsDraft,
    setBrollDataLabelsDraft,
    brollDataValuesDraft,
    setBrollDataValuesDraft,
    brollDataEmphasisKeyDraft,
    setBrollDataEmphasisKeyDraft,
    brollDataAnimationStyleDraft,
    setBrollDataAnimationStyleDraft,
    brollProviderIdDraft,
    setBrollProviderIdDraft,
    brollSourceLabelDraft,
    setBrollSourceLabelDraft,
    brollSourceUrlDraft,
    setBrollSourceUrlDraft,
    brollProviderNoteDraft,
    setBrollProviderNoteDraft,
    brollUsageNoteDraft,
    setBrollUsageNoteDraft,
    brollResultMetadataDraft,
    setBrollResultMetadataDraft,
    brollSaveState,
    setBrollSaveState,
    brollSaveError,
    setBrollSaveError,
    brollMessage,
    setBrollMessage,
    isBrollBusy,
    setIsBrollBusy,
    setBrollDraftEditing,
  };
}
