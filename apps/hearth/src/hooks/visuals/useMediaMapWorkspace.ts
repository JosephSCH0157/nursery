import { useState } from "react";
import type {
  MediaMapConversationSeed,
  MediaMapGenerationScope,
} from "../../lib/hearth-media-map-conversation";
import { normalizeMediaMapGenerationScope } from "../../lib/hearth-media-map-conversation";

export function useMediaMapWorkspace() {
  const [selectedMediaMapEntryId, setSelectedMediaMapEntryId] = useState<string | null>(null);
  const [mediaMapTypeDraft, setMediaMapTypeDraft] = useState("image");
  const [mediaMapAnchorModeDraft, setMediaMapAnchorModeDraft] = useState("phrase_match");
  const [mediaMapAnchorTargetDraft, setMediaMapAnchorTargetDraft] = useState("");
  const [mediaMapInOffsetDraft, setMediaMapInOffsetDraft] = useState("0");
  const [mediaMapDurationDraft, setMediaMapDurationDraft] = useState("6");
  const [mediaMapDescriptionDraft, setMediaMapDescriptionDraft] = useState("");
  const [mediaMapIntentDraft, setMediaMapIntentDraft] = useState("");
  const [mediaMapSourceStatusDraft, setMediaMapSourceStatusDraft] = useState("unresolved");
  const [mediaMapSourceAssetIdDraft, setMediaMapSourceAssetIdDraft] = useState("");
  const [mediaMapConfidenceDraft, setMediaMapConfidenceDraft] = useState("medium");
  const [mediaMapOptionalDraft, setMediaMapOptionalDraft] = useState(false);
  const [mediaMapCriticalDraft, setMediaMapCriticalDraft] = useState(false);
  const [mediaMapSaveState, setMediaMapSaveState] = useState<"saved" | "editing" | "saving" | "error">("saved");
  const [mediaMapSaveError, setMediaMapSaveError] = useState<string | null>(null);
  const [mediaMapMessage, setMediaMapMessage] = useState<string | null>(null);
  const [mediaMapGenerationScope, setMediaMapGenerationScope] = useState<MediaMapGenerationScope>("full_media_plan");
  const [isMediaMapBusy, setIsMediaMapBusy] = useState(false);
  const [mediaMapConversationSeed, setMediaMapConversationSeed] = useState<MediaMapConversationSeed | null>(null);
  const [mediaMapConversationState, setMediaMapConversationState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [mediaMapConversationError, setMediaMapConversationError] = useState<string | null>(null);

  function setMediaMapDraftEditing<T extends string | boolean>(fieldSetter: (value: T) => void, value: T): void {
    fieldSetter(value);
    if (mediaMapSaveState !== "editing") {
      setMediaMapSaveState("editing");
    }
    setMediaMapSaveError(null);
    setMediaMapMessage(null);
  }

  function onMediaMapDraftChange(field: string, value: unknown): void {
    if (field === "type") setMediaMapDraftEditing(setMediaMapTypeDraft, String(value));
    else if (field === "anchorMode") setMediaMapDraftEditing(setMediaMapAnchorModeDraft, String(value));
    else if (field === "anchorTarget") setMediaMapDraftEditing(setMediaMapAnchorTargetDraft, String(value));
    else if (field === "inOffsetSec") setMediaMapDraftEditing(setMediaMapInOffsetDraft, String(value));
    else if (field === "durationSec") setMediaMapDraftEditing(setMediaMapDurationDraft, String(value));
    else if (field === "description") setMediaMapDraftEditing(setMediaMapDescriptionDraft, String(value));
    else if (field === "intent") setMediaMapDraftEditing(setMediaMapIntentDraft, String(value));
    else if (field === "sourceStatus") setMediaMapDraftEditing(setMediaMapSourceStatusDraft, String(value));
    else if (field === "sourceAssetId") setMediaMapDraftEditing(setMediaMapSourceAssetIdDraft, String(value));
    else if (field === "confidence") setMediaMapDraftEditing(setMediaMapConfidenceDraft, String(value));
    else if (field === "optional") setMediaMapDraftEditing(setMediaMapOptionalDraft, Boolean(value));
    else if (field === "critical") setMediaMapDraftEditing(setMediaMapCriticalDraft, Boolean(value));
  }

  function onMediaMapGenerationScopeChange(value: string): void {
    setMediaMapGenerationScope(normalizeMediaMapGenerationScope(value));
  }

  return {
    selectedMediaMapEntryId,
    setSelectedMediaMapEntryId,
    mediaMapTypeDraft,
    setMediaMapTypeDraft,
    mediaMapAnchorModeDraft,
    setMediaMapAnchorModeDraft,
    mediaMapAnchorTargetDraft,
    setMediaMapAnchorTargetDraft,
    mediaMapInOffsetDraft,
    setMediaMapInOffsetDraft,
    mediaMapDurationDraft,
    setMediaMapDurationDraft,
    mediaMapDescriptionDraft,
    setMediaMapDescriptionDraft,
    mediaMapIntentDraft,
    setMediaMapIntentDraft,
    mediaMapSourceStatusDraft,
    setMediaMapSourceStatusDraft,
    mediaMapSourceAssetIdDraft,
    setMediaMapSourceAssetIdDraft,
    mediaMapConfidenceDraft,
    setMediaMapConfidenceDraft,
    mediaMapOptionalDraft,
    setMediaMapOptionalDraft,
    mediaMapCriticalDraft,
    setMediaMapCriticalDraft,
    mediaMapSaveState,
    setMediaMapSaveState,
    mediaMapSaveError,
    setMediaMapSaveError,
    mediaMapMessage,
    setMediaMapMessage,
    mediaMapGenerationScope,
    setMediaMapGenerationScope,
    isMediaMapBusy,
    setIsMediaMapBusy,
    mediaMapConversationSeed,
    setMediaMapConversationSeed,
    mediaMapConversationState,
    setMediaMapConversationState,
    mediaMapConversationError,
    setMediaMapConversationError,
    setMediaMapDraftEditing,
    onMediaMapDraftChange,
    onMediaMapGenerationScopeChange,
  };
}
