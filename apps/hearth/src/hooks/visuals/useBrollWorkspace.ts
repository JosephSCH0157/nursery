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

  function onBrollDraftChange(field: string, value: string): void {
    if (field === "anchorText") setBrollDraftEditing(setBrollAnchorDraft, value);
    else if (field === "description") setBrollDraftEditing(setBrollDescriptionDraft, value);
    else if (field === "motionIntent") setBrollDraftEditing(setBrollMotionIntentDraft, value);
    else if (field === "assetCategory") setBrollDraftEditing((next) => setBrollAssetCategoryDraft(next as EpisodeBrollMotionAssetCategory), value);
    else if (field === "priority") setBrollDraftEditing(setBrollPriorityDraft, value);
    else if (field === "keywords") setBrollDraftEditing(setBrollKeywordsDraft, value);
    else if (field === "mood") setBrollDraftEditing(setBrollMoodDraft, value);
    else if (field === "shotType") setBrollDraftEditing(setBrollShotTypeDraft, value);
    else if (field === "motionSuggestion") setBrollDraftEditing(setBrollMotionSuggestionDraft, value);
    else if (field === "suggestedDurationMs") setBrollDraftEditing(setBrollSuggestedDurationDraft, value);
    else if (field === "placementHint") setBrollDraftEditing(setBrollPlacementHintDraft, value);
    else if (field === "dataChartType") setBrollDraftEditing(setBrollDataChartTypeDraft, value);
    else if (field === "dataTitle") setBrollDraftEditing(setBrollDataTitleDraft, value);
    else if (field === "dataLabels") setBrollDraftEditing(setBrollDataLabelsDraft, value);
    else if (field === "dataValues") setBrollDraftEditing(setBrollDataValuesDraft, value);
    else if (field === "dataEmphasisKey") setBrollDraftEditing(setBrollDataEmphasisKeyDraft, value);
    else if (field === "dataAnimationStyle") setBrollDraftEditing(setBrollDataAnimationStyleDraft, value);
    else if (field === "providerId") setBrollDraftEditing(setBrollProviderIdDraft, value);
    else if (field === "sourceLabel") setBrollDraftEditing(setBrollSourceLabelDraft, value);
    else if (field === "sourceUrl") setBrollDraftEditing(setBrollSourceUrlDraft, value);
    else if (field === "providerNote") setBrollDraftEditing(setBrollProviderNoteDraft, value);
    else if (field === "usageNote") setBrollDraftEditing(setBrollUsageNoteDraft, value);
    else if (field === "resultMetadata") setBrollDraftEditing(setBrollResultMetadataDraft, value);
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
    onBrollDraftChange,
  };
}
