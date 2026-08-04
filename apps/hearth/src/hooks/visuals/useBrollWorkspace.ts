import { useCallback, useState } from "react";
import type { EpisodeBrollMotionAssetCategory, EpisodeBrollPlanBeat } from "../../lib/episode-package-v2";

export function resolveCanonicalBrollBeatSelection(brollBeats: EpisodeBrollPlanBeat[], current: string | null): string | null {
  if (current && brollBeats.some((beat) => beat.id === current)) return current;
  return brollBeats.find((beat) => !beat.selected_asset_id && (beat.candidate_assets?.length ?? 0) > 0)?.id
    ?? brollBeats.find((beat) => !beat.selected_asset_id)?.id
    ?? brollBeats[0]?.id
    ?? null;
}

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

  const syncBrollDraftFromBeat = useCallback((selectedBrollBeat: EpisodeBrollPlanBeat | null): void => {
    if (!selectedBrollBeat) {
      setBrollAnchorDraft("");
      setBrollDescriptionDraft("");
      setBrollMotionIntentDraft("broll");
      setBrollAssetCategoryDraft("stock_video");
      setBrollPriorityDraft("supporting");
      setBrollKeywordsDraft("");
      setBrollMoodDraft("");
      setBrollShotTypeDraft("mixed");
      setBrollMotionSuggestionDraft("");
      setBrollSuggestedDurationDraft("");
      setBrollPlacementHintDraft("first_occurrence");
      setBrollDataChartTypeDraft("bar");
      setBrollDataTitleDraft("");
      setBrollDataLabelsDraft("");
      setBrollDataValuesDraft("");
      setBrollDataEmphasisKeyDraft("");
      setBrollDataAnimationStyleDraft("");
      setBrollProviderIdDraft("");
      setBrollSourceLabelDraft("");
      setBrollSourceUrlDraft("");
      setBrollProviderNoteDraft("");
      setBrollUsageNoteDraft("");
      setBrollResultMetadataDraft("");
      setBrollSaveState("saved");
      return;
    }
    setBrollAnchorDraft(selectedBrollBeat.anchor_text);
    setBrollDescriptionDraft(selectedBrollBeat.description);
    setBrollMotionIntentDraft(selectedBrollBeat.motion_intent);
    setBrollAssetCategoryDraft(selectedBrollBeat.asset_category ?? "stock_video");
    setBrollPriorityDraft(selectedBrollBeat.priority);
    setBrollKeywordsDraft((selectedBrollBeat.keywords ?? []).join(", "));
    setBrollMoodDraft(selectedBrollBeat.mood ?? "");
    setBrollShotTypeDraft(selectedBrollBeat.shot_type ?? "mixed");
    setBrollMotionSuggestionDraft(selectedBrollBeat.motion_suggestion ?? "");
    setBrollSuggestedDurationDraft(
      selectedBrollBeat.suggested_duration_ms != null ? String(selectedBrollBeat.suggested_duration_ms) : "",
    );
    setBrollPlacementHintDraft(selectedBrollBeat.placement_hint ?? "first_occurrence");
    setBrollDataChartTypeDraft(selectedBrollBeat.data_visual_spec?.chart_type ?? "bar");
    setBrollDataTitleDraft(selectedBrollBeat.data_visual_spec?.title ?? "");
    setBrollDataLabelsDraft((selectedBrollBeat.data_visual_spec?.labels ?? []).join(", "));
    setBrollDataValuesDraft((selectedBrollBeat.data_visual_spec?.values ?? []).map((value) => String(value)).join(", "));
    setBrollDataEmphasisKeyDraft(selectedBrollBeat.data_visual_spec?.emphasis_key ?? "");
    setBrollDataAnimationStyleDraft(selectedBrollBeat.data_visual_spec?.animation_style ?? "");
    setBrollProviderIdDraft(selectedBrollBeat.external_request?.provider_id ?? "");
    setBrollSourceLabelDraft(
      (selectedBrollBeat.selected_asset_id
        ? (selectedBrollBeat.candidate_assets ?? []).find((asset) => asset.asset_id === selectedBrollBeat.selected_asset_id)?.source_label
        : null) ?? "",
    );
    setBrollSourceUrlDraft(selectedBrollBeat.external_request?.source_url ?? "");
    setBrollProviderNoteDraft(selectedBrollBeat.external_request?.provider_note ?? "");
    setBrollUsageNoteDraft(selectedBrollBeat.external_request?.usage_note ?? "");
    setBrollResultMetadataDraft(selectedBrollBeat.external_request?.result_metadata ?? "");
    setBrollSaveState("saved");
    setBrollSaveError(null);
  }, []);

  const syncSelectedBrollBeatId = useCallback((brollBeats: EpisodeBrollPlanBeat[]): void => {
    if (brollBeats.length === 0) {
      setSelectedBrollBeatId(null);
      return;
    }
    setSelectedBrollBeatId((current) => resolveCanonicalBrollBeatSelection(brollBeats, current));
  }, []);

  const resetBrollWorkspaceForWorkpieceSwitch = useCallback((): void => {
    setSelectedBrollBeatId(null);
    setBrollSaveState("saved");
    setBrollSaveError(null);
    setBrollMessage(null);
  }, []);

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
    syncBrollDraftFromBeat,
    syncSelectedBrollBeatId,
    resetBrollWorkspaceForWorkpieceSwitch,
  };
}
