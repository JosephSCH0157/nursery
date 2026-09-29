import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Draft } from "../domain/draft";
import type { HearthPlanningSession, HearthSessionDecision, HearthSessionOrigin } from "../domain/hearth-session";
import { HEARTH_SESSION_SCHEMA } from "../domain/hearth-session";
import { createRevision, type RevisionKind } from "../domain/revision";
import type { HearthSession } from "../domain/session";
import {
  resolveBarstockSparkIdFromQuery,
} from "../lib/barstock-sparks";
import {
  readBarstockProjectContext,
  resolveBarstockProjectIdFromQuery,
} from "../lib/barstock-project-links";
import "./HearthShell.css";
import {
  readHearthPlanningSessionCache,
  writeHearthPlanningSessionCache,
} from "../lib/hearth-session-registry";
import {
  fetchHearthAiStatus,
  recordHearthEvent,
  requestHearthChatReply,
  requestHearthSttTranscript,
  refreshMyAiCredits,
  resolveAiLaneFromStorage,
  resolveDefaultVisualProviderFromStorage,
  uploadHearthSttAudio,
  type HearthChatMessage,
  type HearthExplicitUiAction,
  type HearthInteractionEventType,
} from "../lib/hearth-chat-api";
import { writeHearthAiRuntimeStatus } from "../lib/ai-runtime-status";
import {
  serializeHearthConversation,
} from "../lib/hearth-conversation-export";
import { resolveHearthChatPanelMeta } from "../lib/hearth-chat-readiness";
import { commitHearthSession } from "../lib/hearth-session-repo";
import {
  getHearthPrimaryScriptPath,
} from "../lib/hearth-script-repo";
import { isCanonicalThumbnailSetComplete } from "./hearth-shell/buildHearthThumbnailViewModel";
import {
  selectDraftForWorkpiece,
} from "../lib/hearth-nav-model";
import { mirrorApprovedScriptToLocal } from "../lib/hearth-script-mirror";
import type { HearthReadyScript } from "../lib/hearth-ready-scripts";
import { useHearthVisualsWorkspace } from "../hooks/useHearthVisualsWorkspace";
import { useHearthFocusOpenActions } from "../hooks/useHearthFocusOpenActions";
import { useHearthInitialLoader } from "../hooks/useHearthInitialLoader";
import type { HearthLoadGuard } from "../lib/hearth-discovery-retry";
import { useHearthWorkspaceResetLifecycle } from "../hooks/useHearthWorkspaceResetLifecycle";
import { useHearthIntakeLifecycle } from "../hooks/useHearthIntakeLifecycle";
import { useHearthWorkspaceSessionLifecycle } from "../hooks/useHearthWorkspaceSessionLifecycle";
import { useHearthWorkpieceTabLifecycle } from "../hooks/useHearthWorkpieceTabLifecycle";
import { useClipboardButtonAcks } from "../hooks/useClipboardButtonAcks";
import { useVisualsPersistence } from "../hooks/visuals/useVisualsPersistence";
import { useImagePromptAuthority } from "../hooks/visuals/useImagePromptAuthority";
import { useEpisodePackageLoader } from "../hooks/visuals/useEpisodePackageLoader";
import { useVisualWorkspaceResetLifecycle } from "../hooks/visuals/useVisualWorkspaceResetLifecycle";
import { shouldInvalidateMediaMapForScriptVersion } from "../lib/hearth-visual-artifact-authority";
import { deriveHearthMediaWorkflow } from "../lib/hearth-media-workflow-view-model";
import { subscribeToForgeUserAccessToken } from "../lib/tongs-fetch";
import type { HearthPreflightAuthority } from "../lib/hearth-research-preflight-authority";
import { useVisualSelectionHydration } from "../hooks/visuals/useVisualSelectionHydration";
import { resolveWorkpieceId, resolveWorkspaceId } from "../lib/sources-repo";
import {
  nextApprovedScriptVersion,
  type ScriptApprovalState,
} from "../lib/hearth-approval-authority";
import { createHearthStore } from "../storage/store-factory";
import { isCanonicalHearthRevisionSave } from "../storage/hearth-store";
import { LocalSessionStore } from "../storage/local-session-store";
import {
  applyHearthOps,
  buildEpisodeContext,
  describeHearthOp,
  type EpisodeContext,
  type HearthOp,
  type HearthOpsStore,
} from "../lib/hearth-ai-ops";
import {
  cloneHearthProposalOps,
  isHearthProposalBodyOpDirty,
  normalizeHearthProposalOpsForScriptIngress,
  resetHearthProposalBodyOp,
  updateHearthProposalBodyOp,
} from "../lib/hearth-ai-proposal";
import {
  deriveFullScriptAuthoringMeta,
  deriveOutlineScriptAuthoringMeta,
} from "../lib/hearth-script-authoring-meta";
import { insertVoiceTranscriptIntoScript } from "../lib/hearth-script-dictation";
import {
  confirmHearthUserEditorialTransition,
  evaluateHearthFormatOnlyPreservation,
} from "../lib/hearth-format-only";
import {
  parseHearthDraftConflictError,
} from "../lib/hearth-draft-persistence";
import {
  beginHearthScriptProposalApplication,
  completeHearthScriptProposalApplication,
  readPendingHearthScriptProposal,
  rejectHearthScriptProposal,
} from "../lib/hearth-script-proposal-authority";
import {
  type ScriptValidationResult,
  type ScriptValidationIssue,
} from "@forge/shared/script-tags";
import { HENRY_HEARTH_SIGNAL_EVENT, type HearthHenrySignal } from "@forge/shared/henry";
import { evaluateHearthScriptValidation } from "../lib/hearth-script-tag-policy";
import type { EpisodeWorkspaceReadModel } from "@forge/shared/episode-workspace";
import type {
  ComposeSetup,
  ProductionDefaults,
  ScriptCompletionBadge,
} from "../domain/compose";
import { buildComposeScriptRequest } from "../lib/build-compose-request";
import { resolveComposeConflicts } from "../lib/compose-conflicts";
import {
  buildSetupFromDefaults,
  readProductionDefaults,
  resolveProductionDefaultsUpdate,
  writeProductionDefaults,
} from "../lib/compose-defaults";
import {
  buildWritingFormatShortcutPrompt,
  getHearthWritingFormatProfile,
  HEARTH_WRITING_FORMATS,
  readLastHearthWritingFormat,
  resolveHearthWritingFormatRequest,
  writeLastHearthWritingFormat,
  type HearthWritingFormat,
} from "../lib/hearth-writing-format";
import { resolveHearthAiActionAvailability } from "../lib/hearth-ai-admission";
import { inferSpeakersFromScript } from "../lib/compose-content-validation";
import { buildComposePrompt } from "../lib/compose-prompt";
import HearthReadyMode from "../views/modes/HearthReadyMode";
import HearthSeriesMode from "../views/modes/HearthSeriesMode";
import HearthEpisodesMode from "../views/modes/HearthEpisodesMode";
import HearthPlanningMode from "../views/modes/HearthPlanningMode";
import HearthRevisionsMode from "../views/modes/HearthRevisionsMode";
import HearthSparksMode from "../views/modes/HearthSparksMode";
import HearthSparkBootstrapMode from "../views/modes/HearthSparkBootstrapMode";
import HearthFocusMode from "../views/modes/HearthFocusMode";
import HearthDraftMode from "../views/modes/HearthDraftMode";
import HearthShellModals from "../views/modes/HearthShellModals";
import HearthMainContentSwitch from "../views/modes/HearthMainContentSwitch";
import HearthDesktopFrame from "../views/modes/HearthDesktopFrame";
import { buildHearthDraftScriptSurfaceProps } from "../views/modes/buildHearthDraftScriptSurfaceProps";
import { buildHearthDraftScriptPanelState } from "../views/modes/buildHearthDraftScriptPanelState";
import HearthDesktopRail from "../views/modes/HearthDesktopRail";
import {
  persistProductionArtifact as persistHearthProductionArtifact,
  canReprojectRecoveredPackDescriptions,
  resolveAcceptedTagProposal,
  runProductionAction,
  type ProductionAction,
} from "../lib/hearth-production-actions";
import { parseReleasePrepPackSections } from "../lib/hearth-release-prep-pack";
import { readWorkpieceProductionArtifact, type ProductionCommitResult } from "../lib/hearth-production-repo";
import {
  assessImageMapScriptAnchor,
  buildImageMapAnchorPickerParagraphs,
  resolveNearestParagraphSelection,
  type ImageMapScriptSelection,
} from "../lib/hearth-image-map-beats";
import {
  hasStructuredImageMapAnchor,
  resolveImageMapEntryAnchorScope,
} from "../lib/hearth-image-map-anchor";
import { replaceEpisodePackageImageMap } from "../lib/hearth-episode-package-image-map";
import {
  listExternalGenerationProviders,
  type ExternalGenerationProvider,
} from "../lib/hearth-visual-actionability";
import {
  buildReferenceClipPromptPack,
  listVisualProviderOptions,
  resolveActiveVisualProvider,
  type VisualProviderId,
} from "../lib/hearth-visual-provider-profiles";
import {
  buildMediaMapFromExistingPlans,
  deriveFullMediaBudgetPolicy,
} from "../lib/hearth-media-map-builder";
import type {
  EpisodeReferenceClipPlan,
  EpisodeReferenceClipTone,
  EpisodeBrollPlan,
  EpisodeBrollPlanBeat,
  EpisodeContextualDataCompositePlan,
  EpisodeImageMapEntry,
  EpisodeMediaMap,
  EpisodeMediaMapEntry,
  EpisodeMediaMapStatus,
  EpisodePackageV2,
  EpisodeThumbnailVersion,
} from "../lib/episode-package-v2";
import {
  buildBulletBeatAnchorLabel,
  buildImageMapAnchorLabel,
  resolvePrimarySeoTitle,
  updateImageMapEntry,
} from "../lib/episode-package-v2";
import {
  normalizeHearthVisualStyle,
} from "../lib/hearth-visual-styles";
import {
  buildScriptTabSummary,
  normalizeWorkpieceWorkspaceTab,
  resolveHistoryMilestoneMarker,
  resolveMediaPlanCoverageLevel,
  resolveMediaPlanScopeLabel,
  type WorkpieceWorkspaceTab,
} from "../lib/hearth-workpiece-tab-shell";
import {
  resolveDefaultThumbnailBrandTemplate,
} from "../lib/hearth-thumbnail-brand-templates";
import {
  normalizeEpisodeThumbnailTitleStyle,
} from "../lib/hearth-title-fonts";
import {
  resolveHearthThumbnailOverlayText,
} from "../lib/hearth-thumbnail-title-contract";
import { useLayoutMode } from "@forge/ui-mobile";
import { hasBrowserSpeechRecognition } from "../lib/browser-speech-contract";
import {
  getMyWritingProfile,
  setMyWritingTonePreset,
  updateStyleProfileFromReadyCheckpoint,
  type WritingProfile,
} from "../lib/hearth-style-service";
import CopyIcon from "./hearth-shell/CopyIcon";
import OscilloscopeFill from "./hearth-shell/OscilloscopeFill";
import {
  AI_STT_MAX_BYTES,
  AI_STT_MAX_DURATION_MS,
  CHAT_HISTORY_WRITE_DEBOUNCE_MS,
  DEFAULT_TONE_PRESET,
  FORGE_NOTICE_EVENT,
  PRESENCE_HEARTBEAT_MS,
  SAFE_SCRIPT_STARTER,
  SCRIPT_TAG_VALIDATOR_VERSION,
  SESSION_SAVE_DELAY_MS,
  STT_INLINE_FEEDBACK_MS,
  STT_PREVIEW_MAX_CHARS,
  TAB_SWITCH_UNSAVED_WARNING,
  TONE_PRESET_OPTIONS,
  WORKPIECE_WORKSPACE_TABS,
  type ApprovalPersistenceStatus,
  type DraftConflictState,
  type ForgeNoticeDetail,
  type ForgeNoticeJob,
  type ForgeNoticeSeverity,
  type HearthShellProps,
  type HearthUserContext,
  type PendingAiProposal,
  type ProposalSaveReasonCode,
  type ReadyLabel,
} from "./hearth-shell/hearth-shell-contracts";
import {
  buildDraftAttribution,
  buildDiffLines,
  buildSparkPreview,
  dedupeDraftListById,
  deriveReadyUrgency,
  deriveSparkTitle,
  diffCellClass,
  formatDecisionAt,
  formatRelativeUpdatedAt,
  formatSparkDate,
  formatSparkStatus,
  formatUpdatedAt,
  isSparkForged,
  normalizeGreetingName,
  normalizeRailTitleKey,
  normalizeTitle,
  normalizeTonePreset,
  parseIsoTimestamp,
  READY_LABEL_TO_CATEGORY,
  READY_URGENCY_LABEL,
  reorderVisibleReadyEntries,
  resolveCanonicalImageMapScriptHint,
  resolveCanonicalImageMapScriptSourceLabel,
  resolveDraftEditorName,
  resolveImageMapAnchorStatusView,
  resolveReadyLabel,
  resolveVisualRequestStateLabel,
  shortenUserIdForUi,
  splitLines,
  countWords,
} from "./hearth-shell/hearth-shell-formatting";
import {
  buildPersistedValidationMeta,
  buildProjectDraftSeed,
  buildSessionFingerprint,
  buildValidationReport,
  countProducerQuestions,
  createPlanningSessionForEpisode,
  deriveIntentFromOrigin,
  detectAiAutosaveReasonCode,
  evaluateScriptValidation,
  isLegacyDraftScriptPlaceholder,
  isPlanningSessionEmpty,
  parsePlanningLines,
  reclassifyHearthFormatProposal,
} from "./hearth-shell/hearth-shell-planning";
import {
  buildCurrentForgeNoticeRoute as buildForgeNoticeRoute,
  buildHearthRouteContextUrl,
  normalizeUuid,
  readTrimmedString,
  resolveReadyOpenHref,
} from "./hearth-shell/hearth-shell-route";
import {
  isDevMode,
  resolveStoreKind,
  writeWorkpieceWorkspaceTab,
} from "./hearth-shell/hearth-shell-preferences";
import {
  useHearthActiveIdentityRef,
  useHearthActiveIdentityRefSync,
  useHearthShellIdentityState,
  useHearthShellOperationAuthority,
  useHearthWorkspaceIdentitySync,
} from "./hearth-shell/useHearthShellIdentity";
import {
  useHearthMobileOverlayState,
  useHearthMobileOverlayCommands,
  useHearthDesktopNavigationCommands,
  useHearthDensityPreferenceLifecycle,
  useHearthModePreferenceLifecycle,
  useHearthModeRestorationLifecycle,
  useHearthResolvedWorkpieceTabState,
  useHearthResponsiveNavigationLifecycle,
  useHearthWorkpieceTabPreferenceLifecycle,
} from "./hearth-shell/useHearthShellNavigation";
import {
  useHearthCollectionArchiveActions,
  useHearthActiveCollectionContext,
  useHearthEpisodeCollectionState,
  useHearthCollectionViewModel,
  useHearthCollectionReadyNavigationActions,
  useHearthCollectionReadyQueueActions,
  useHearthCollectionSparkDiscovery,
  useHearthReadyCollectionLifecycle,
  useHearthReadyCollectionState,
  useHearthSparkCollectionState,
  useHearthWorkpieceCollectionLoader,
  createHearthCollectionWorkpiece,
  getOrCreateHearthProjectWorkpiece,
  getOrCreateHearthSparkWorkpiece,
  renameHearthCollectionWorkpiece,
  enqueueBarStockSpark,
  resolveBarStockSparkHearthWorkpieceId,
  upsertBarStockSpark,
  writeBarStockSparks,
  type BarStockSpark,
  type HearthWorkpieceSummary,
} from "./hearth-shell/useHearthCollectionController";
import {
  useHearthScriptApprovalFlow,
  useHearthScriptApprovalIdentityReset,
  useHearthScriptApprovalPersistenceActions,
  useHearthScriptAuthorityRefs,
  useHearthCanonicalScriptApprovalLoader,
  useHearthCanonicalScriptApprovalState,
  useHearthScriptCoreState,
  useHearthScriptDraftCommands,
  useHearthScriptDraftHydration,
  useHearthScriptDraftPersistence,
  useHearthScriptPersistenceWorkspace,
  useHearthScriptReadModel,
  useHearthScriptRepairActions,
  useHearthScriptRevisionLoader,
  useHearthScriptController,
} from "./hearth-shell/useHearthScriptController";
import {
  listHearthConversationAttachments,
  updateHearthConversationAttachmentText,
  uploadHearthConversationAttachment,
  isChatContextHydrated,
  useHearthConversationAttachmentState,
  useHearthConversationController,
  useHearthConversationHistory,
  useHearthConversationProposal,
  useHearthConversationRuntime,
  useHearthConversationRuntimeState,
  useHearthConversationStt,
  useHearthConversationState,
  useHearthConversationSurface,
} from "./hearth-shell/useHearthConversationController";
import { useHearthSourcesController } from "./hearth-shell/useHearthSourcesController";
import {
  buildHearthPresenceController,
  HEARTH_PRESENCE_REFRESH_EVENT,
  useHearthPresenceBadges,
  useHearthPresenceLifecycle,
  useHearthPresenceProjection,
  useHearthPresenceState,
} from "./hearth-shell/useHearthPresenceController";
import {
  buildHearthAnvilHandoffController,
  useHearthAnvilHandoffOpenCommand,
  useHearthAnvilHandoffProjection,
} from "./hearth-shell/useHearthAnvilHandoffController";
import {
  buildHearthThumbnailController,
  useHearthCanonicalThumbnailProjection,
  useHearthThumbnailConceptCommands,
  useHearthThumbnailGenerationCommands,
  useHearthThumbnailLifecycle,
  useHearthThumbnailPreviewLifecycle,
  useHearthThumbnailWorkspaceState,
} from "./hearth-shell/useHearthThumbnailController";
import {
  buildHearthImagePlanningController,
  useHearthCanonicalImageMapScriptLifecycle,
  useHearthCanonicalImageMapScriptReader,
  useHearthEpisodeImagesWorkspaceState,
  useHearthImageCandidateCommands,
  useHearthImageCandidatePreviewLifecycle,
  useHearthImageEntryCommands,
  useHearthImageMapReanchorCommands,
  useHearthImageMapViewCommands,
  useHearthImageSeedExportCommands,
  useHearthVisualPlanConversationBootstrap,
  useHearthVisualPlanEntryCommands,
  useHearthVisualPlanGenerationCommands,
  useHearthVisualPlanSourcePreparation,
  useHearthVisualPlanWorkspaceState,
} from "./hearth-shell/useHearthImagePlanningController";
import {
  buildHearthBrollController,
  useHearthBrollBridgeCommands,
  useHearthBrollCoreCommands,
  useHearthBrollWorkspaceState,
} from "./hearth-shell/useHearthBrollController";
import { buildHearthBrollDataVisualSpec } from "./hearth-shell/buildHearthBrollViewModel";
import { useCanonicalBrollV2 } from "../hooks/visuals/useCanonicalBrollV2";
import { useUnifiedVisualPlanRecovery } from "../hooks/visuals/useUnifiedVisualPlanRecovery";
import { generateOrResumeUnifiedVisualPlan } from "../lib/hearth-unified-visual-plan-authority";
import { readCanonicalReferenceClips, type ReferenceClipState } from "../lib/hearth-reference-clip-authority";
import { readCanonicalReferenceVisuals, type ReferenceVisualState } from "../lib/hearth-reference-visual-authority";
import { readVisualOpportunityDispositions, type VisualOpportunityDisposition } from "../lib/hearth-visual-disposition-authority";
import {
  buildHearthReferenceClipsController,
  useHearthReferenceClipsBridgeCommands,
  useHearthReferenceClipsCoreCommands,
  useHearthReferenceClipsWorkspaceState,
} from "./hearth-shell/useHearthReferenceClipsController";
import { parseHearthReferenceClipValues } from "./hearth-shell/buildHearthReferenceClipsViewModel";
import {
  buildHearthMetadataController,
  useHearthMetadataTagSuggestions,
  useHearthMetadataWorkspaceState,
} from "./hearth-shell/useHearthMetadataController";
import { buildHearthMetadataProgress } from "./hearth-shell/hearth-metadata-progress";
import {
  buildHearthReleasePreparationController,
  useHearthReleasePreparationWorkspaceState,
} from "./hearth-shell/useHearthReleasePreparationController";
import { buildHearthProductionController } from "./hearth-shell/buildHearthProductionController";
import { buildHearthProductionViewModel } from "./hearth-shell/buildHearthProductionViewModel";
import HearthProductionContent from "./hearth-shell/HearthProductionContent";
import { buildHearthDesktopRailViewModel } from "./hearth-shell/buildHearthDesktopRailViewModel";
import { buildHearthMobileNavigationViewModel } from "./hearth-shell/buildHearthMobileNavigationViewModel";
import HearthMobileNavigation from "./hearth-shell/HearthMobileNavigation";
import { buildHearthModalViewModel } from "./hearth-shell/buildHearthModalViewModel";

const SCRIPT_APPROVAL_STORAGE_PREFIX = "hearth:script-approval:v1:";
const CHAT_HISTORY_STORAGE_PREFIX = "hearth:chat:v1:";
const CHAT_HISTORY_MAX_MESSAGES = 200;
const WORKSPACE_STORAGE_KEYS = new Set(["forge_workspace_id_v1", "barstock_workspace_id"]);
const FORGE_AUTH_STORAGE_KEY = "forge-auth";
const SUPABASE_AUTH_KEY_RE = /supabase-auth-token/i;
const PROJECT_PENDING_WORKPIECE_PREFIX = "hearth:project-pending-workpiece:v1:";

function buildCurrentForgeNoticeRoute(workspaceId: string | null, workpieceId: string | null): string | null {
  if (typeof window === "undefined") return null;
  return buildForgeNoticeRoute({
    href: window.location.href,
    workspaceId,
    workpieceId,
  });
}

function dispatchWindowForgeNotice(detail: Omit<ForgeNoticeDetail, "timestamp">): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ForgeNoticeDetail>(FORGE_NOTICE_EVENT, {
    detail: {
      ...detail,
      timestamp: Date.now(),
    },
  }));
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function pickDisplayNameFromUser(user: Record<string, unknown>): string | null {
  const metadata = isRecord(user.user_metadata) ? user.user_metadata : null;
  return readTrimmedString(user.display_name)
    ?? readTrimmedString(metadata?.display_name)
    ?? readTrimmedString(metadata?.full_name)
    ?? readTrimmedString(metadata?.name)
    ?? readTrimmedString(user.email)
    ?? null;
}

function pickDisplayNameFromAuthPayload(value: unknown): string | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = pickDisplayNameFromAuthPayload(item);
      if (nested) return nested;
    }
    return null;
  }
  if (!isRecord(value)) return null;

  const directUser = isRecord(value.user) ? value.user : null;
  if (directUser) {
    const name = pickDisplayNameFromUser(directUser);
    if (name) return name;
  }
  const directDisplayName = readTrimmedString(value.display_name);
  if (directDisplayName) return directDisplayName;

  const nested = [
    value.session,
    value.currentSession,
    value.current_session,
    value.data,
  ];
  for (const item of nested) {
    const name = pickDisplayNameFromAuthPayload(item);
    if (name) return name;
  }
  return null;
}

function pickUserIdFromAuthPayload(value: unknown): string | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = pickUserIdFromAuthPayload(item);
      if (nested) return nested;
    }
    return null;
  }
  if (!isRecord(value)) return null;

  const directUser = isRecord(value.user) ? value.user : null;
  const directUserId = readTrimmedString(directUser?.id);
  if (directUserId) return directUserId;

  const directId = readTrimmedString(value.user_id) ?? readTrimmedString(value.id);
  if (directId) return directId;

  const nested = [
    value.session,
    value.currentSession,
    value.current_session,
    value.data,
  ];
  for (const item of nested) {
    const nestedId = pickUserIdFromAuthPayload(item);
    if (nestedId) return nestedId;
  }

  return null;
}

async function readProfileDisplayNameFromRuntimeClient(
  runtimeClient: unknown,
  userId: string,
): Promise<string | null> {
  const trimmedUserId = userId.trim();
  if (!trimmedUserId) return null;
  if (!isRecord(runtimeClient)) return null;

  const tryRead = async (scope: unknown): Promise<string | null> => {
    if (!isRecord(scope)) return null;
    const from = scope.from;
    if (typeof from !== "function") return null;
    const table = from.call(scope, "profiles");
    if (!isRecord(table)) return null;
    const select = table.select;
    if (typeof select !== "function") return null;
    const selected = select.call(table, "display_name");
    if (!isRecord(selected)) return null;
    const eq = selected.eq;
    if (typeof eq !== "function") return null;
    const filtered = eq.call(selected, "user_id", trimmedUserId);
    if (!isRecord(filtered)) return null;

    const maybeSingle = filtered.maybeSingle;
    const single = filtered.single;
    try {
      const response = typeof maybeSingle === "function"
        ? await maybeSingle.call(filtered)
        : typeof single === "function"
          ? await single.call(filtered)
          : null;
      if (!isRecord(response)) return null;
      if (response.error) return null;
      const data = isRecord(response.data) ? response.data : null;
      return readTrimmedString(data?.display_name);
    } catch {
      return null;
    }
  };

  const direct = await tryRead(runtimeClient);
  if (direct) return direct;

  const schema = runtimeClient.schema;
  if (typeof schema === "function") {
    try {
      const tongsScoped = schema.call(runtimeClient, "tongs");
      const fromTongs = await tryRead(tongsScoped);
      if (fromTongs) return fromTongs;
    } catch {
      // ignore schema scoped lookup failures
    }
  }

  return null;
}

function listAuthStorageValues(): string[] {
  if (typeof window === "undefined") return [];

  const keys = [FORGE_AUTH_STORAGE_KEY];
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || key === FORGE_AUTH_STORAGE_KEY) continue;
      if (!SUPABASE_AUTH_KEY_RE.test(key)) continue;
      keys.push(key);
    }
  } catch {
    // ignore storage access failures
  }

  const values: string[] = [];
  for (const key of keys) {
    try {
      const raw = window.localStorage.getItem(key);
      const direct = readTrimmedString(raw);
      if (direct) {
        values.push(direct);
      }
    } catch {
      // ignore storage access failures
    }
  }
  return values;
}

function readAuthUserIdFromStorage(): string | null {
  for (const raw of listAuthStorageValues()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      const userId = pickUserIdFromAuthPayload(parsed);
      if (userId) return userId;
    } catch {
      // ignore non-JSON auth storage values
    }
  }

  return null;
}

function readGreetingNameFromStorage(): string {
  if (typeof window === "undefined") return "Creator";

  for (const raw of listAuthStorageValues()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      const parsedName = pickDisplayNameFromAuthPayload(parsed);
      if (parsedName) return normalizeGreetingName(parsedName);
    } catch {
      return normalizeGreetingName(raw);
    }
  }

  return "Creator";
}

function buildPendingProjectWorkpieceKey(workspaceId: string, projectId: string): string {
  return `${PROJECT_PENDING_WORKPIECE_PREFIX}${workspaceId}:${projectId}`;
}

function readPendingProjectWorkpieceId(workspaceId: string, projectId: string): string | null {
  if (typeof window === "undefined") return null;
  const workspace = normalizeUuid(workspaceId);
  const project = normalizeUuid(projectId);
  if (!workspace || !project) return null;
  const key = buildPendingProjectWorkpieceKey(workspace, project);
  try {
    return normalizeUuid(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

function writePendingProjectWorkpieceId(workspaceId: string, projectId: string, workpieceId: string | null): void {
  if (typeof window === "undefined") return;
  const workspace = normalizeUuid(workspaceId);
  const project = normalizeUuid(projectId);
  if (!workspace || !project) return;
  const key = buildPendingProjectWorkpieceKey(workspace, project);
  try {
    const normalized = normalizeUuid(workpieceId);
    if (!normalized) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, normalized);
  } catch {
    // ignore storage failures
  }
}

function resolveChatHistoryKey(workpieceId: string | null, draftId: string | null): string | null {
  const workpiece = workpieceId?.trim();
  if (workpiece) return `${CHAT_HISTORY_STORAGE_PREFIX}${workpiece}`;
  const draft = draftId?.trim();
  if (draft) return `${CHAT_HISTORY_STORAGE_PREFIX}draft:${draft}`;
  return null;
}

function resolveLegacyWorkpieceChatHistoryKey(historyKey: string): string | null {
  if (!historyKey.startsWith(CHAT_HISTORY_STORAGE_PREFIX)) return null;
  const suffix = historyKey.slice(CHAT_HISTORY_STORAGE_PREFIX.length);
  if (!suffix || suffix.startsWith("draft:")) return null;
  return `${CHAT_HISTORY_STORAGE_PREFIX}workpiece:${suffix}`;
}

function normalizeChatRole(value: unknown): HearthChatMessage["role"] | null {
  if (value === "assistant" || value === "user" || value === "system") {
    return value;
  }
  return null;
}

function trimChatContentForStorage(content: string): string {
  return content.trim();
}

function sanitizeChatMessageForStorage(entry: unknown): HearthChatMessage | null {
  if (!entry || typeof entry !== "object") return null;
  const row = entry as { role?: unknown; content?: unknown };
  const role = normalizeChatRole(row.role);
  if (!role || typeof row.content !== "string") return null;
  const content = trimChatContentForStorage(row.content);
  if (!content) return null;
  return { role, content };
}

function sanitizeChatMessagesForStorage(messages: ReadonlyArray<unknown>): HearthChatMessage[] {
  return messages
    .map((entry) => sanitizeChatMessageForStorage(entry))
    .filter((entry): entry is HearthChatMessage => Boolean(entry));
}

function readChatHistoryFromStorageKey(storageKey: string): { found: boolean; messages: HearthChatMessage[] } {
  if (typeof window === "undefined") return { found: false, messages: [] };
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw == null) return { found: false, messages: [] };
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return { found: true, messages: [] };
    const normalized = sanitizeChatMessagesForStorage(parsed);
    return { found: true, messages: normalized };
  } catch {
    return { found: true, messages: [] };
  }
}

function readChatHistoryFromCache(historyKey: string | null): HearthChatMessage[] {
  if (!historyKey || typeof window === "undefined") return [];

  const primary = readChatHistoryFromStorageKey(historyKey);
  if (primary.found) {
    return primary.messages;
  }

  const legacyKey = resolveLegacyWorkpieceChatHistoryKey(historyKey);
  if (!legacyKey) return [];
  const legacy = readChatHistoryFromStorageKey(legacyKey);
  if (!legacy.found) return [];

  writeChatHistoryCache(historyKey, legacy.messages);
  try {
    window.localStorage.removeItem(legacyKey);
  } catch {
    // ignore storage failures
  }
  return legacy.messages;
}

function writeChatHistoryCache(historyKey: string | null, messages: HearthChatMessage[]): void {
  if (!historyKey || typeof window === "undefined") return;
  const sanitized = sanitizeChatMessagesForStorage(messages);
  try {
    if (sanitized.length === 0) {
      return;
    }
    window.localStorage.setItem(historyKey, JSON.stringify(sanitized));
  } catch {
    // ignore storage failures
  }
}

function clearChatHistoryCache(historyKey: string): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(historyKey); } catch { /* best-effort cache cleanup after canonical acknowledgement */ }
}

function writeScriptApprovalRecoveryEvidence(workpieceId: string | null, value: ScriptApprovalState): void {
  if (!workpieceId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${SCRIPT_APPROVAL_STORAGE_PREFIX}${workpieceId}`, JSON.stringify(value));
  } catch {
    // ignore storage failures
  }
}

function replaceHearthRouteContext(workspaceId: string | null, workpieceId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const nextUrl = buildHearthRouteContextUrl({
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
      workspaceId,
      workpieceId,
    });
    window.history.replaceState(window.history.state, "", nextUrl);
  } catch {
    // ignore route cleanup failures
  }
}

async function writeTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back for browsers that reject Clipboard API writes.
    }
  }

  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  textarea.style.left = "-9999px";

  const selection = document.getSelection();
  const previousRanges = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index))
    : [];

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
    if (selection) {
      selection.removeAllRanges();
      for (const range of previousRanges) {
        selection.addRange(range);
      }
    }
  }
}

function downloadTextFile(args: { text: string; filename: string; mimeType?: string }): void {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const blob = new Blob([args.text], { type: args.mimeType ?? "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = args.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function createThumbnailClientId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function resolveAiSttMimeType(): string | null {
  if (typeof window === "undefined") return null;
  const mediaRecorder = window.MediaRecorder;
  if (!mediaRecorder || typeof mediaRecorder.isTypeSupported !== "function") return null;
  const preferred = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ];
  for (const candidate of preferred) {
    if (mediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return null;
}

const HearthDraftScriptHeader = lazy(() => import("../views/modes/HearthDraftScriptHeader"));

export default function HearthShell({
  onEpisodeReadModelChange,
  onEpisodeContextLoadingChange,
}: HearthShellProps = {}) {
  const storeKind = resolveStoreKind();
  const devMode = isDevMode();
  const layoutMode = useLayoutMode();
  const isMobile = layoutMode === "mobile";
  const store = useMemo(() => createHearthStore(storeKind), [storeKind]);
  const sessionStore = useMemo(() => new LocalSessionStore(), []);
  const {
    incomingBarStockIntakeRoute,
    mode,
    setMode,
    focusTab,
    setFocusTab,
    workspaceId,
    setWorkspaceId,
    uiDensity,
    setUiDensity,
    workpieceId,
    setWorkpieceId,
  } = useHearthShellIdentityState();
  const [unifiedVisualPlanOperationProjection, setUnifiedVisualPlanOperationProjection] = useState<{
    workpieceId: string | null;
    state: string | null;
  }>({ workpieceId: null, state: null });
  const setUnifiedVisualPlanOperationState = useCallback((state: string | null) => {
    setUnifiedVisualPlanOperationProjection({ workpieceId, state });
  }, [workpieceId]);
  const {
    state: {
      sparks,
      isSparksLoading,
      sparkDiscoveryWorkspaceId,
      sparkDiscoveryError,
      selectedSparkId,
      forgeError,
      isForging,
    },
    bindings: {
      setSparks,
      setIsSparksLoading,
      setSparkDiscoveryWorkspaceId,
      setSparkDiscoveryError,
      setSelectedSparkId,
      setForgeError,
      setIsForging,
    },
  } = useHearthSparkCollectionState(resolveWorkspaceId());
  const [routeProjectId] = useState<string | null>(() => resolveBarstockProjectIdFromQuery());
  const [routeSparkId] = useState<string | null>(() => resolveBarstockSparkIdFromQuery());
  const [routeProjectTitle, setRouteProjectTitle] = useState<string | null>(null);
  const projectEpisodeCreationKeyRef = useRef<string | null>(null);

  const [planningSession, setPlanningSession] = useState<HearthPlanningSession | null>(() => (
    incomingBarStockIntakeRoute
      ? null
      : readHearthPlanningSessionCache(resolveWorkpieceId(), resolveWorkspaceId())
  ));
  const [sessionTouched, setSessionTouched] = useState(false);
  const [decisionDraft, setDecisionDraft] = useState("");

  const {
    state: { workpieceSummaries, isWorkpiecesLoading, workpiecesError },
    bindings: { setWorkpieceSummaries, setIsWorkpiecesLoading, setWorkpiecesError },
  } = useHearthEpisodeCollectionState();
  const {
    state: {
      drafts,
      activeDraft,
      revisions,
      revisionWorkpieceId,
      draftSnapshot,
      isSaving,
      isLoading,
      error,
      aiAutosaveStatusAt,
      aiAutosaveWarning,
      isRepairingScript,
    },
    bindings: {
      setDrafts,
      setActiveDraft,
      setRevisions,
      setDraftSnapshot,
      setIsSaving,
      setIsLoading,
      setError,
      setAiAutosaveStatusAt,
      setAiAutosaveWarning,
      setIsRepairingScript,
    },
  } = useHearthScriptCoreState(workpieceId);
  const {
    state: {
      searchText,
      sortKey,
      showArchived,
      readyScripts,
      readyScriptsWorkspaceId,
      isReadyScriptsLoading,
      readyScriptsError,
      updatingReadyCategoryId,
      readyCategoryError,
      removingReadyIds,
      sendingBackReadyIds,
      isRestoringReady,
      draggingReadyId,
    },
    bindings: {
      setSearchText,
      setSortKey,
      setShowArchived,
      setReadyScripts,
      setReadyScriptsWorkspaceId,
      setIsReadyScriptsLoading,
      setReadyScriptsError,
      setUpdatingReadyCategoryId,
      setReadyCategoryError,
      setRemovingReadyIds,
      setSendingBackReadyIds,
      setIsRestoringReady,
      setDraggingReadyId,
    },
  } = useHearthReadyCollectionState();
  const [session, setSession] = useState<HearthSession | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [cursorPosition, setCursorPosition] = useState<number | null>(null);
  const [scrollTop, setScrollTop] = useState<number | null>(null);
  const [isBodyComposing, setIsBodyComposing] = useState(false);
  const {
    chatMessages,
    setChatMessages,
    chatDraft,
    setChatDraft,
    chatError,
    setChatError,
    sttLane,
    setSttLane,
    sttTarget,
    setSttTarget,
    sttState,
    setSttState,
    sttError,
    setSttError,
    sttNotice,
    setSttNotice,
    sttPreview,
    setSttPreview,
    pendingAiProposal,
    setPendingAiProposal,
    isApplyingAiOps,
    setIsApplyingAiOps,
    aiRuntimeWarning,
    setAiRuntimeWarning,
    isAiProcessing,
    setIsAiProcessing,
    hydratedChatHistoryKey,
    setHydratedChatHistoryKey,
    chatHydrationStatus,
    setChatHydrationStatus,
    lastTurnResult,
    setLastTurnResult,
    chatInputRef,
    aiRequestControllerRef,
    speechRecognitionRef,
    mediaRecorderRef,
    mediaStreamRef,
    aiSttChunksRef,
    aiSttStartedAtRef,
    aiSttMimeTypeRef,
    aiSttEpisodeIdRef,
    aiSttStopTimerRef,
    aiSttDiscardNextStopRef,
    aiSttTranscribeControllerRef,
    sttNoticeTimerRef,
    sttPreviewTimerRef,
    browserSttStopTimerRef,
    chatPersistTimerRef,
    chatMessagesRef,
    latestChatHistoryKeyRef,
    latestChatDraftIdRef,
    latestChatWorkpieceIdRef,
    skipChatHydrationKeyRef,
    pendingChatHydrationKeyRef,
    chatHydrationSeqRef,
  } = useHearthConversationState<PendingAiProposal>();
  const aiActionAvailability = resolveHearthAiActionAvailability(
    lastTurnResult?.validation.failureKind ?? null,
  );
  const {
    state: {
      attachments: chatAttachments,
      isLoading: isAttachmentsLoading,
      error: chatAttachmentError,
    },
    bindings: {
      setAttachments: setChatAttachments,
      setIsLoading: setIsAttachmentsLoading,
      setError: setChatAttachmentError,
    },
  } = useHearthConversationAttachmentState();
  const [showManualDraft, setShowManualDraft] = useState(false);
  const [showScriptPanel, setShowScriptPanel] = useState(false);
  const [isVisualScriptMode, setIsVisualScriptMode] = useState(false);
  const [composeModalOpen, setComposeModalOpen] = useState(false);
  const [productionDefaults, setProductionDefaults] = useState<ProductionDefaults>(() => readProductionDefaults());
  const [, setComposeSetupDraft] = useState<ComposeSetup>(() => buildSetupFromDefaults(readProductionDefaults()));
  const [selectedWritingFormat, setSelectedWritingFormat] = useState<HearthWritingFormat>(() => readLastHearthWritingFormat());
  const [scriptCompletionBadge, setScriptCompletionBadge] = useState<ScriptCompletionBadge | null>(null);
  const [scriptCompletionReasons, setScriptCompletionReasons] = useState<string[]>([]);
  const [scriptApprovalState, setScriptApprovalState] = useHearthCanonicalScriptApprovalState();
  const [preflightAuthority, setPreflightAuthority] = useState<HearthPreflightAuthority | null>(null);
  const [isReviewingPreflight, setIsReviewingPreflight] = useState(false);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [approvalPersistenceStatus, setApprovalPersistenceStatus] = useState<ApprovalPersistenceStatus | null>(null);
  const [activeProductionAction, setActiveProductionAction] = useState<ProductionAction | null>(null);
  const productionActionInFlightRef = useRef(false);
  const lastProductionCommitResultRef = useRef<ProductionCommitResult | null>(null);
  const [writingProfile, setWritingProfile] = useState<WritingProfile | null>(null);
  const [forgeGreetingName, setForgeGreetingName] = useState<string>(() => readGreetingNameFromStorage());
  const [hearthUser, setHearthUser] = useState<HearthUserContext>({
    userId: readAuthUserIdFromStorage(),
    displayName: readGreetingNameFromStorage(),
  });
  const {
    state: {
      tokenBalance: aiTokenBalance,
      billingMode: aiBillingMode,
      ownerChatCapability,
    },
    bindings: {
      setTokenBalance: setAiTokenBalance,
      setBillingMode: setAiBillingMode,
      setOwnerChatCapability,
    },
  } = useHearthConversationRuntimeState(resolveAiLaneFromStorage());
  const [aiStatusRefreshNonce, setAiStatusRefreshNonce] = useState(0);
  const [defaultVisualProvider, setDefaultVisualProvider] = useState<VisualProviderId>(() => resolveDefaultVisualProviderFromStorage());
  const [episodePackage, setEpisodePackage] = useState<EpisodePackageV2 | null>(null);
  const [episodePackageState, setEpisodePackageState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [episodePackageError, setEpisodePackageError] = useState<string | null>(null);
  const [recoverableMediaMap, setRecoverableMediaMap] = useState<EpisodeMediaMap | null>(null);
  const [generatedTagProposal, setGeneratedTagProposal] = useState<{
    tags: string[];
    scriptVersion: number;
    generatedAt: string;
  } | null>(null);
  const [scriptPanelCopyMessage, setScriptPanelCopyMessage] = useState<string | null>(null);
  const [activeWorkpieceTab, setActiveWorkpieceTab] = useHearthResolvedWorkpieceTabState({
    incomingBarStockIntakeRoute,
    initialWorkpieceId: workpieceId,
    initialWorkspaceId: workspaceId,
  });
  const {
    participants: presenceRows,
    setParticipants: setPresenceRows,
    connection: presenceState,
    setConnection: setPresenceState,
  } = useHearthPresenceState();
  const clearPresence = () => setPresenceRows([]);
  const [draftConflictState, setDraftConflictState] = useState<DraftConflictState | null>(null);
  const [mobileOverlayView, setMobileOverlayView] = useHearthMobileOverlayState();
  const { acknowledgeCopy, isCopyAcknowledged } = useClipboardButtonAcks();

  const {
    draftEditVersionRef,
    activeDraftRef,
    approveScriptActionRef,
    draftSnapshotRef,
    draftsRef,
  } = useHearthScriptAuthorityRefs(drafts);
  const workpieceIdRef = useHearthActiveIdentityRef(workpieceId);
  const workpieceSummariesRef = useRef<HearthWorkpieceSummary[]>(workpieceSummaries);
  const sessionSaveTimer = useRef<number | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const sessionCommitRef = useRef<string | null>(null);
  const sessionCommitInFlight = useRef(false);
  const sessionCommitQueued = useRef(false);
  const projectIntakeHandledRef = useRef<string | null>(null);
  const sparkIntakeHandledRef = useRef<string | null>(null);
  const intakeResetKeyRef = useRef<string | null>(null);
  const restoredCursorDraftIdRef = useRef<string | null>(null);
  const restoredModeDraftKeyRef = useRef<string | null>(null);
  const pendingFocusOpenCountRef = useRef(0);
  const pendingDraftEditorPanelRef = useRef<"script" | "manual" | null>(null);
  const gateAwaitingAnswersRef = useRef(false);
  const pendingShortcutIntentRef = useRef<"outline" | "script" | null>(null);
  const pendingExplicitActionRef = useRef<HearthExplicitUiAction | null>(null);
  const thumbnailWorkspace = useHearthThumbnailWorkspaceState();
  const {
    selectedThumbnailTitleId,
    setSelectedThumbnailTitleId,
    selectedThumbnailConceptId,
    setSelectedThumbnailConceptId,
    selectedThumbnailVersionId,
    setSelectedThumbnailVersionId,
    selectedLaunchVariantId,
    setSelectedLaunchVariantId,
    launchVariantStatusDraft,
    setLaunchVariantStatusDraft,
    launchVariantNotesDraft,
    setLaunchVariantNotesDraft,
    thumbnailConceptLabelDraft,
    setThumbnailConceptLabelDraft,
    thumbnailConceptPromptDraft,
    setThumbnailConceptPromptDraft,
    thumbnailConceptStyleDraft,
    setThumbnailConceptStyleDraft,
    thumbnailTitleStyleDraft,
    setThumbnailTitleStyleDraft,
    thumbnailConceptBrandTemplateIdDraft,
    setThumbnailConceptBrandTemplateIdDraft,
    thumbnailBrandTemplates,
    setThumbnailBrandTemplates,
    isThumbnailBrandTemplatesLoading,
    setIsThumbnailBrandTemplatesLoading,
    thumbnailBrandTemplatesError,
    setThumbnailBrandTemplatesError,
    thumbnailBrandLogoDataUrl,
    setThumbnailBrandLogoDataUrl,
    isThumbnailBrandLogoUploading,
    setIsThumbnailBrandLogoUploading,
    thumbnailBrandLogoError,
    setThumbnailBrandLogoError,
    thumbnailBrandLogoStatus,
    setThumbnailBrandLogoStatus,
    thumbnailAspect,
    setThumbnailAspect,
    isThumbnailGenerating,
    setIsThumbnailGenerating,
    isThumbnailConceptSaving,
    setIsThumbnailConceptSaving,
    isThumbnailUploading,
    setIsThumbnailUploading,
    thumbnailGenerateError,
    setThumbnailGenerateError,
    thumbnailUploadError,
    setThumbnailUploadError,
    thumbnailPairingError,
    setThumbnailPairingError,
    thumbnailPreviewState,
    setThumbnailPreviewState,
    thumbnailPreviewDataUrl,
    setThumbnailPreviewDataUrl,
    thumbnailPreviewError,
    setThumbnailPreviewError,
    thumbnailSafeZoneEnabled,
    setThumbnailSafeZoneEnabled,
    syncSelectedThumbnailConceptId,
    syncThumbnailConceptDraftFromConcept,
    syncSelectedLaunchVariantId,
    syncLaunchVariantDraftFromVariant,
    syncSelectedThumbnailTitleId,
    syncSelectedThumbnailVersionId,
    resetThumbnailWorkspaceViewState,
  } = thumbnailWorkspace;
  const {
    selectedMediaMapEntryId,
    setSelectedMediaMapEntryId,
    mediaMapTypeDraft,
    mediaMapAnchorModeDraft,
    mediaMapAnchorTargetDraft,
    mediaMapInOffsetDraft,
    mediaMapDurationDraft,
    mediaMapDescriptionDraft,
    mediaMapIntentDraft,
    mediaMapSourceStatusDraft,
    mediaMapSourceAssetIdDraft,
    mediaMapConfidenceDraft,
    mediaMapOptionalDraft,
    mediaMapCriticalDraft,
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
    visualPlanOperationStage,
    setVisualPlanOperationStage,
    mediaMapConversationSeed,
    setMediaMapConversationSeed,
    mediaMapConversationState,
    setMediaMapConversationState,
    mediaMapConversationError,
    setMediaMapConversationError,
    onMediaMapDraftChange,
    onMediaMapGenerationScopeChange,
    syncMediaMapDraftFromEntry,
    syncSelectedMediaMapEntryId,
    resetMediaMapWorkspaceForWorkpieceSwitch,
  } = useHearthVisualPlanWorkspaceState();
  const {
    selectedImageMapEntryId,
    setSelectedImageMapEntryId,
    imageMapAnchorDraft,
    imageMapDescriptionDraft,
    imageMapStyleDraft,
    imageMapIntentDraft,
    imageMapSourceTypeDraft,
    setImageMapSourceTypeDraft,
    imageMapAnchorScopeDraft,
    imageMapVisualPriorityDraft,
    imageMapVisualTypeDraft,
    imageMapSectionIntentNoteDraft,
    imageMapPlacementHintDraft,
    imageMapMetadataUpdatedAt,
    setImageMapMetadataUpdatedAt,
    imageMapProjectionLoaded,
    setImageMapProjectionLoaded,
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
  } = useHearthEpisodeImagesWorkspaceState();
  const {
    selectedBrollBeatId,
    setSelectedBrollBeatId,
    brollAnchorDraft,
    brollDescriptionDraft,
    brollMotionIntentDraft,
    brollAssetCategoryDraft,
    brollPriorityDraft,
    brollKeywordsDraft,
    brollMoodDraft,
    brollShotTypeDraft,
    brollMotionSuggestionDraft,
    brollSuggestedDurationDraft,
    brollPlacementHintDraft,
    brollDataChartTypeDraft,
    brollDataTitleDraft,
    brollDataLabelsDraft,
    brollDataValuesDraft,
    brollDataEmphasisKeyDraft,
    brollDataAnimationStyleDraft,
    brollProviderIdDraft,
    brollSourceLabelDraft,
    brollSourceUrlDraft,
    brollProviderNoteDraft,
    brollUsageNoteDraft,
    brollResultMetadataDraft,
    brollSaveState,
    setBrollSaveState,
    setBrollSaveError,
    brollMessage,
    setBrollMessage,
    isBrollBusy,
    setIsBrollBusy,
    onBrollDraftChange,
    syncBrollDraftFromBeat,
    syncSelectedBrollBeatId,
    resetBrollWorkspaceForWorkpieceSwitch,
  } = useHearthBrollWorkspaceState();
  const {
    selectedReferenceClipEntryId,
    setSelectedReferenceClipEntryId,
    referenceClipAnchorDraft,
    referenceClipDescriptionDraft,
    referenceClipPlacementHintDraft,
    referenceClipFormatDraft,
    referenceClipDataTypeDraft,
    referenceClipContextTypeDraft,
    referenceClipToneDraft,
    referenceClipMotionLevelDraft,
    referenceClipBackgroundContextDraft,
    referenceClipForegroundDataDraft,
    referenceClipVisualStyleDraft,
    referenceClipChartTypeDraft,
    referenceClipTitleDraft,
    referenceClipLabelsDraft,
    referenceClipValuesDraft,
    referenceClipEmphasisKeyDraft,
    referenceClipSourceTypeDraft,
    referenceClipProviderIdDraft,
    referenceClipSourceLabelDraft,
    referenceClipSourceUrlDraft,
    referenceClipProviderNoteDraft,
    referenceClipUsageNoteDraft,
    referenceClipResultMetadataDraft,
    referenceClipSaveState,
    setReferenceClipSaveState,
    referenceClipSaveError,
    setReferenceClipSaveError,
    referenceClipMessage,
    setReferenceClipMessage,
    isReferenceClipBusy,
    setIsReferenceClipBusy,
    onReferenceClipDraftChange,
    syncReferenceClipDraftFromEntry,
    syncSelectedReferenceClipEntryId,
    resetReferenceClipWorkspaceForWorkpieceSwitch,
  } = useHearthReferenceClipsWorkspaceState();
  const metadataWorkspace = useHearthMetadataWorkspaceState({
    workpieceId,
    workspaceId,
    episodePackage,
    setEpisodePackage,
    setImageMapMetadataUpdatedAt,
  });
  const {
    metadataTitlesDraft,
    metadataTagsDraft,
    metadataDescriptionShortDraft,
    metadataDescriptionLongDraft,
    setMetadataTitlesDraft,
    setMetadataTagsDraft,
    setMetadataDescriptionShortDraft,
    setMetadataDescriptionLongDraft,
    onMetadataApplyTags,
    hasUnsavedMetadataChanges,
  } = metadataWorkspace;

  const {
    hearthScriptState,
    effectiveComposeSetup,
    composeContentValidation,
    approvalBlocked,
    handoffBlocked,
  } = useHearthScriptReadModel({
    activeDraft,
    draftSnapshotBody: draftSnapshot?.body ?? null,
    evaluateScriptValidation,
  });

  useEffect(() => {
    setScriptCompletionBadge(composeContentValidation.badge);
    setScriptCompletionReasons(composeContentValidation.reasons);
  }, [composeContentValidation.badge, composeContentValidation.reasons]);

  const recordInteractionEvent = useCallback((
    eventType: HearthInteractionEventType,
    payload?: Record<string, unknown>,
  ) => {
    const episodeId = workpieceId?.trim() ?? null;
    void recordHearthEvent({
      eventType,
      payload,
      episodeId,
    });
  }, [workpieceId]);

  const publishForgeNotice = useCallback((notice: {
    job: ForgeNoticeJob;
    title: string;
    message?: string;
    severity: ForgeNoticeSeverity;
    route?: string | null;
  }) => {
    dispatchWindowForgeNotice({
      tool: "hearth",
      job: notice.job,
      title: notice.title,
      message: readTrimmedString(notice.message) ?? undefined,
      route: readTrimmedString(notice.route) ?? buildCurrentForgeNoticeRoute(workspaceId, workpieceId) ?? undefined,
      workspaceId: readTrimmedString(workspaceId) ?? undefined,
      workpieceId: readTrimmedString(workpieceId) ?? undefined,
      severity: notice.severity,
    });
  }, [workspaceId, workpieceId]);

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId) {
      setWritingProfile(null);
      return () => {
        cancelled = true;
      };
    }

    void getMyWritingProfile(workspaceId, { force: true })
      .then((result) => {
        if (cancelled || !result.ok) return;
        setWritingProfile(result.data);
      })
      .catch(() => {
        if (!cancelled) {
          setWritingProfile(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const {
    queueAiAutosave,
    onRetryAiAutosave,
    noteManualSaveSuccess,
    isDirty,
    resolveRevisionWorkpieceId,
    reportRevisionPersistenceWarning,
    refreshRevisions,
    revisionModalOpen,
    revisionNote,
    revisionKind,
    setRevisionNote,
    setRevisionKind,
    openRevisionModal,
    closeRevisionModal,
    onConfirmRevision,
    scriptValidation,
    setScriptValidation,
    clearScriptValidation,
    onDraftTitleChange,
    onDraftBodyChange,
    selectedRevision,
    setSelectedRevision,
    revisionView,
    setRevisionView,
    isSavingRevision,
    selectRevisionPreview,
    selectRevisionCompare,
    updateSelectedRevisionDraftNote,
    onRestoreRevision,
    onUpdateRevisionNote,
    resetRevisionSelection,
  } = useHearthScriptPersistenceWorkspace({
    activeDraft,
    draftSnapshot,
    revisions,
    revisionWorkpieceId,
    isBodyComposing,
    persistDraft,
    store,
    draftEditVersionRef,
    setActiveDraft,
    setRevisions,
    setAiAutosaveWarning,
    setAiAutosaveStatusAt,
    setAiRuntimeWarning,
    setError,
  });
  const operationAuthority = useHearthShellOperationAuthority({
    workspaceId,
    workpieceId,
    draftId: activeDraft?.id ?? null,
    draftVersion: draftEditVersionRef.current,
    revisionId: selectedRevision?.id ?? null,
  });
  useEffect(() => {
    setSelectedRevision((prev) => {
      if (!prev) return null;
      return revisions.find((revision) => revision.id === prev.id) ?? null;
    });
  }, [revisions, setSelectedRevision]);

  const commitScriptTranscript = useCallback(async (text: string): Promise<boolean> => {
    if (!activeDraft) {
      setSttError("Open a draft to dictate into the script.");
      return false;
    }
    if ((isImageMapReanchorMode || isVisualScriptMode) && showScriptPanel) {
      setSttError("Script dictation is unavailable while viewing the canonical script.");
      return false;
    }

    const liveCursorPosition = bodyRef.current && typeof bodyRef.current.selectionStart === "number"
      ? bodyRef.current.selectionStart
      : cursorPosition;
    const nextScript = insertVoiceTranscriptIntoScript({
      body: activeDraft.body,
      transcript: text,
      cursorPosition: liveCursorPosition,
    });

    setMode("focus");
    setActiveWorkpieceTab("script");
    setShowManualDraft(false);
    setShowScriptPanel(true);
    onDraftBodyChange(nextScript.body);
    setCursorPosition(nextScript.cursorPosition);

    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        const textarea = bodyRef.current;
        if (!textarea) return;
        textarea.focus();
        textarea.selectionStart = nextScript.cursorPosition;
        textarea.selectionEnd = nextScript.cursorPosition;
      });
    }

    return true;
  }, [
    activeDraft,
    bodyRef,
    cursorPosition,
    isImageMapReanchorMode,
    isVisualScriptMode,
    onDraftBodyChange,
    showScriptPanel,
    setActiveWorkpieceTab,
  ]);

  const wordCount = useMemo(() => countWords(activeDraft?.body ?? ""), [activeDraft?.body]);
  const charCount = useMemo(() => activeDraft?.body?.length ?? 0, [activeDraft?.body]);
  const aiSavedStatusText = useMemo(
    () => (aiAutosaveStatusAt ? `Saved • ${formatUpdatedAt(aiAutosaveStatusAt)}` : null),
    [aiAutosaveStatusAt],
  );
  const statusText = isSaving
    ? "Saving..."
    : isDirty
      ? "Unsaved changes"
      : aiSavedStatusText ?? "Saved";
  const sessionTitle = planningSession?.title ?? "";
  const sessionGoalsText = useMemo(
    () => (planningSession?.goals ?? []).join("\n"),
    [planningSession?.goals],
  );
  const sessionOutlineText = useMemo(
    () => (planningSession?.outline ?? []).join("\n"),
    [planningSession?.outline],
  );
  const workspaceTonePreset = normalizeTonePreset(writingProfile?.lastUsedTonePreset) ?? DEFAULT_TONE_PRESET;
  const activeTonePreset = normalizeTonePreset(planningSession?.tone_preset) ?? workspaceTonePreset;
  const sessionDecisions = planningSession?.decisions ?? [];
  const sessionIntent = planningSession?.intent ?? deriveIntentFromOrigin(planningSession?.origin);
  const sessionSparkId = planningSession?.origin?.spark_id ?? planningSession?.links?.spark_id ?? null;
  const sourcesController = useHearthSourcesController({
    workspaceId,
    workpieceId,
    draftId: activeDraft?.id ?? null,
    draftText: activeDraft?.body ?? "",
    mode: mode === "focus" && focusTab === "sources" ? "full" : "summary",
    operationAuthority,
  });
  const workpieceSources = sourcesController.state.sources.workpiece;
  const sourceIndexById = sourcesController.state.sources.indexById;
  const missingSourcesCount = sourcesController.state.sources.missingCitedCount;
  const unusedSourcesCount = sourcesController.state.sources.unusedRefsCount;
  const canonicalResearchContentHash = sourcesController.state.provenance.canonicalContentHash;
  useEffect(() => {
    if (!workspaceId || !workpieceId) {
      setPreflightAuthority(null);
      setPreflightError(null);
      return;
    }
    let cancelled = false;
    setPreflightError(null);
    void import("../lib/hearth-research-preflight-authority")
      .then(({ readCurrentHearthPreflight }) => readCurrentHearthPreflight({ workspaceId, workpieceId }))
      .then((value) => {
      if (!cancelled) setPreflightAuthority(value);
    }).catch((error: unknown) => {
      if (!cancelled) setPreflightError(error instanceof Error ? error.message : "Optional script check could not be loaded.");
    });
    return () => { cancelled = true; };
  }, [workspaceId, workpieceId]);
  useEffect(() => {
    if (!activeDraft || !preflightAuthority || preflightAuthority.stale) return;
    let cancelled = false;
    void import("../lib/hearth-research-preflight-authority")
      .then(({ hashHearthScriptContent }) => hashHearthScriptContent(activeDraft.body))
      .then((contentHash) => {
      if (cancelled || contentHash === preflightAuthority.scriptHash) return;
      setPreflightAuthority((current) => current?.id === preflightAuthority.id
        ? { ...current, stale: true, staleReasons: Array.from(new Set([...current.staleReasons, "script_changed"])) }
        : current);
    });
    return () => { cancelled = true; };
  }, [activeDraft?.body, preflightAuthority?.id, preflightAuthority?.scriptHash, preflightAuthority?.stale]);
  useEffect(() => {
    if (!preflightAuthority || preflightAuthority.stale || sourcesController.state.provenance.canonicalPersistence !== "saved") return;
    if (preflightAuthority.researchArtifactHash === canonicalResearchContentHash) return;
    setPreflightAuthority((current) => current?.id === preflightAuthority.id
      ? { ...current, stale: true, staleReasons: Array.from(new Set([...current.staleReasons, "research_changed"])) }
      : current);
  }, [canonicalResearchContentHash, preflightAuthority?.id, preflightAuthority?.researchArtifactHash, preflightAuthority?.stale, sourcesController.state.provenance.canonicalPersistence]);
  const preferredDraftIdsByWorkpiece = useMemo(() => {
    const next = new Map<string, string | null>();
    if (workpieceId && activeDraft?.id) {
      next.set(workpieceId, activeDraft.id);
    }
    return next;
  }, [activeDraft?.id, workpieceId]);
  const activeWorkpieceContext = useHearthActiveCollectionContext({
    activeWorkpieceId: workpieceId,
    workpieces: workpieceSummaries,
    drafts,
    readyScripts,
    sparks,
    revisions,
    preferredDraftId: activeDraft?.id ?? session?.activeDraftId ?? null,
  });
  const activeWorkpiece = activeWorkpieceContext.workpiece;
  const activeWorkpieceIsArchived = Boolean(activeWorkpiece?.isArchived);
  const draftsById = useMemo(() => new Map(drafts.map((draft) => [draft.id, draft] as const)), [drafts]);
  const hasActiveEpisode = Boolean(workpieceId);
  const {
    editingParticipants: editingPeers,
    viewingParticipants: viewingPeers,
    activeEditorName,
    activeViewerName,
  } = useHearthPresenceProjection({
    participants: presenceRows,
    currentUserId: hearthUser.userId,
  });
  const activeUserDisplayName = hearthUser.displayName.trim() || forgeGreetingName;
  const resolveReadyMarkerName = useCallback((entry: HearthReadyScript): string => {
    const markerUserId = readTrimmedString(entry.markedReadyBy);
    if (!markerUserId) return "Unknown";
    if (hearthUser.userId && markerUserId === hearthUser.userId) return activeUserDisplayName;
    return shortenUserIdForUi(markerUserId);
  }, [activeUserDisplayName, hearthUser.userId]);
  const resolveReadyAttribution = useCallback((entry: HearthReadyScript): string => {
    const markerUserId = readTrimmedString(entry.markedReadyBy);
    const markerTime = parseIsoTimestamp(entry.markedReadyAt) ?? parseIsoTimestamp(entry.updatedAt);
    if (markerUserId) {
      const markerName = resolveReadyMarkerName(entry);
      if (markerTime) {
        return `Marked ready by ${markerName} • ${formatRelativeUpdatedAt(markerTime)}`;
      }
      return `Marked ready by ${markerName}`;
    }
    if (markerTime) {
      return `Approved ${formatRelativeUpdatedAt(markerTime)}`;
    }
    return "Approved script";
  }, [resolveReadyMarkerName]);
  const localPresenceMode = activeDraft ? "editing" : "viewing";
  const {
    destination: openInAnvilHref,
    stepModeHint: anvilStepModeHint,
  } = useHearthAnvilHandoffProjection({
    workspaceId,
    workpieceId,
    archived: activeWorkpieceIsArchived,
    scriptText: activeDraft?.body ?? "",
  });
  const aiCreditsDepleted = aiBillingMode === "forge" && aiTokenBalance != null && aiTokenBalance <= 0;
  const ownerChatBlocked = ownerChatCapability.status === "checking"
    || ownerChatCapability.status === "unavailable"
    || ownerChatCapability.status === "unknown";
  const aiEpisodeReady = Boolean(workpieceId?.trim());
  const thumbnailConcepts = useMemo(
    () => episodePackage?.thumbnail?.concepts ?? [],
    [episodePackage?.thumbnail?.concepts],
  );
  const thumbnailVersions = useMemo(
    () => episodePackage?.thumbnail?.versions ?? [],
    [episodePackage?.thumbnail?.versions],
  );
  const canonicalThumbnailProjection = useHearthCanonicalThumbnailProjection({
    workspaceId,
    workpieceId,
  });
  const canonicalThumbnailProgress = canonicalThumbnailProjection.canonical;
  const [visualPlanRevisionChanged, setVisualPlanRevisionChanged] = useState(false);
  const visualPlanRevisionRef = useRef<{ workpieceId: string; version: number } | null>(null);
  useEffect(() => {
    const currentWorkpieceId=workpieceId?.trim()??""; const version=episodePackage?.media_map.version??0;
    const previous=visualPlanRevisionRef.current;
    if(!currentWorkpieceId){visualPlanRevisionRef.current=null;setVisualPlanRevisionChanged(false);return;}
    if(version <= 0) return;
    if(previous?.workpieceId===currentWorkpieceId&&version>previous.version){
      const hasDownstream=(episodePackage?.image_map.entries.some((entry)=>Boolean(entry.selected_asset_id))??false)||(episodePackage?.broll_plan.beats.some((beat)=>Boolean(beat.selected_asset_id))??false);
      if(hasDownstream)setVisualPlanRevisionChanged(true);
    }else if(!previous||previous.workpieceId!==currentWorkpieceId)setVisualPlanRevisionChanged(false);
    visualPlanRevisionRef.current={workpieceId:currentWorkpieceId,version};
  },[episodePackage?.broll_plan.beats,episodePackage?.image_map.entries,episodePackage?.media_map.version,workpieceId]);
  const canonicalThumbnailConceptCount = canonicalThumbnailProgress.workpieceId === (workpieceId?.trim() ?? "")
    ? canonicalThumbnailProgress.conceptRevisionCount
    : 0;
  const displayedThumbnailConceptCount = Math.max(thumbnailConcepts.length, canonicalThumbnailConceptCount);
  const canonicalFramingTitleCount = canonicalThumbnailProgress.workpieceId === (workpieceId?.trim() ?? "")
    ? canonicalThumbnailProgress.titleCount : 0;
  const canonicalFramingTagCount = canonicalThumbnailProgress.workpieceId === (workpieceId?.trim() ?? "")
    ? canonicalThumbnailProgress.tagCount : 0;
  const canonicalFramingHasDescriptions = canonicalThumbnailProgress.workpieceId === (workpieceId?.trim() ?? "")
    && canonicalThumbnailProgress.hasDescriptions;
  const launchVariants = useMemo(
    () => episodePackage?.launch_variants ?? [],
    [episodePackage?.launch_variants],
  );
  const selectedLaunchVariant = useMemo(
    () => launchVariants.find((variant) => variant.id === selectedLaunchVariantId) ?? null,
    [launchVariants, selectedLaunchVariantId],
  );
  const primaryThumbnailVersionId = episodePackage?.thumbnail.primary_version_id ?? null;
  const thumbnailTitleOptions = useMemo(
    () => metadataTitlesDraft.filter((title) => resolveHearthThumbnailOverlayText(title).trim().length > 0),
    [metadataTitlesDraft],
  );
  const selectedThumbnailTitle = useMemo(
    () => thumbnailTitleOptions.find((title) => title.id === selectedThumbnailTitleId)
      ?? resolvePrimarySeoTitle(metadataTitlesDraft),
    [metadataTitlesDraft, selectedThumbnailTitleId, thumbnailTitleOptions],
  );
  const selectedThumbnailConcept = thumbnailConcepts.find((concept) => concept.id === selectedThumbnailConceptId) ?? null;
  const defaultThumbnailBrandTemplate = useMemo(
    () => resolveDefaultThumbnailBrandTemplate(thumbnailBrandTemplates),
    [thumbnailBrandTemplates],
  );
  const defaultThumbnailBrandTemplateId = defaultThumbnailBrandTemplate?.id ?? null;
  const selectedThumbnailBrandTemplate = useMemo(
    () => thumbnailBrandTemplates.find((template) => template.id === thumbnailConceptBrandTemplateIdDraft) ?? null,
    [thumbnailBrandTemplates, thumbnailConceptBrandTemplateIdDraft],
  );
  const selectedThumbnailBrandLogoWorkpieceId = selectedThumbnailBrandTemplate?.templateJson.logo.workpiece_id ?? null;
  const selectedThumbnailBrandLogoAssetPath = selectedThumbnailBrandTemplate?.templateJson.logo.asset_path ?? null;
  const selectedThumbnailVersion = thumbnailVersions.find((version) => version.id === selectedThumbnailVersionId) ?? null;
  const imageMapEntries: EpisodeImageMapEntry[] = useMemo(
    () => episodePackage?.image_map?.entries ?? [],
    [episodePackage?.image_map?.entries],
  );
  const mediaMap: EpisodeMediaMap | null = episodePackage?.media_map ?? null;
  const mediaMapEntries: EpisodeMediaMapEntry[] = useMemo(
    () => mediaMap?.entries ?? [],
    [mediaMap?.entries],
  );
  const selectedMediaMapEntry = mediaMapEntries.find((entry) => entry.id === selectedMediaMapEntryId) ?? null;
  const selectedImageMapEntry = imageMapEntries.find((entry) => entry.id === selectedImageMapEntryId) ?? null;
  const imagePromptAuthority = useImagePromptAuthority({
    workpieceId,
    workspaceId,
    entries: imageMapEntries,
    selectedEntry: selectedImageMapEntry,
    creatorDirection: imageMapDescriptionDraft,
    style: imageMapStyleDraft,
  });
  const canonicalBrollV2 = useCanonicalBrollV2({
    workspaceId,
    workpieceId,
    plannedMoments: mediaMapEntries.filter((entry) => entry.final_media_kind === "b_roll").map((entry) => ({
      id: entry.id,
      anchorText: entry.anchor.target || entry.description,
      description: entry.description,
      placementHint: null,
    })),
  });
  const aiRuntimeBusy = isAiProcessing || isThumbnailGenerating || isImageMapCandidateGenerating || canonicalBrollV2.activeOperation !== null;
  const brollPlan: EpisodeBrollPlan | null = canonicalBrollV2.state.plan;
  const brollBeats: EpisodeBrollPlanBeat[] = useMemo(
    () => brollPlan?.beats ?? [],
    [brollPlan?.beats],
  );
  const selectedBrollBeat = brollBeats.find((beat) => beat.id === selectedBrollBeatId) ?? null;
  const brollProviders: ExternalGenerationProvider[] = listExternalGenerationProviders("broll");
  const brollRequestStateLabel = resolveVisualRequestStateLabel(selectedBrollBeat?.external_request?.state);
  const referenceClipPlan: EpisodeReferenceClipPlan | null = episodePackage?.cdc_plan ?? null;
  const referenceClipEntries: EpisodeContextualDataCompositePlan[] = useMemo(
    () => referenceClipPlan?.entries ?? [],
    [referenceClipPlan?.entries],
  );
  const selectedReferenceClipEntry = referenceClipEntries.find((entry) => entry.id === selectedReferenceClipEntryId) ?? null;
  const preferredThumbnailTitleId = resolvePrimarySeoTitle(thumbnailTitleOptions)?.id ?? null;
  useHearthThumbnailPreviewLifecycle({
    workpieceId,
    selectedThumbnailVersion,
    selectedThumbnailVersionId,
    setThumbnailPreviewState,
    setThumbnailPreviewDataUrl,
    setThumbnailPreviewError,
  });
  useHearthImageCandidatePreviewLifecycle({
    workpieceId,
    selectedImageMapEntry,
    selectedImageMapEntryId,
    setImageMapCandidatePreviewStateById,
    setImageMapCandidatePreviewUrlById,
    setImageMapCandidatePreviewErrorById,
  });
  useVisualWorkspaceResetLifecycle({
    workpieceId,
    resetThumbnailWorkspaceViewState,
    resetMediaMapWorkspaceForWorkpieceSwitch,
    resetBrollWorkspaceForWorkpieceSwitch,
    resetReferenceClipWorkspaceForWorkpieceSwitch,
    resetImageMapReanchorState,
    setIsVisualScriptMode,
    setImageMapMetadataUpdatedAt,
    setImageMapSaveState,
    setImageMapSaveError,
    setImageMapExportMessage,
    setImageMapCandidateError,
    setImageMapCandidateSelectionError,
    setImageMapCandidatePreviewStateById,
    setImageMapCandidatePreviewUrlById,
    setImageMapCandidatePreviewErrorById,
  });
  const referenceClipProviders: ExternalGenerationProvider[] = listExternalGenerationProviders("reference_clip");
  const referenceClipRequestStateLabel = resolveVisualRequestStateLabel(selectedReferenceClipEntry?.external_request?.state);
  const visualProviderOptions = useMemo(() => listVisualProviderOptions(), []);
  const activeVisualProvider = useMemo(() => resolveActiveVisualProvider({
    override: planningSession?.visual_provider_override ?? null,
    defaultProvider: defaultVisualProvider,
  }), [defaultVisualProvider, planningSession?.visual_provider_override]);
  const activeVisualPromptPackForReferenceClip = useMemo(() => {
    if (!selectedReferenceClipEntry || !workpieceId?.trim()) return null;
    return buildReferenceClipPromptPack({
      entry: {
        ...selectedReferenceClipEntry,
        anchor_text: referenceClipAnchorDraft.trim() || selectedReferenceClipEntry.anchor_text,
        description: referenceClipDescriptionDraft.trim() || selectedReferenceClipEntry.description,
        background_context_description: referenceClipBackgroundContextDraft.trim() || selectedReferenceClipEntry.background_context_description,
        foreground_data_description: referenceClipForegroundDataDraft.trim() || selectedReferenceClipEntry.foreground_data_description,
        visual_style: referenceClipVisualStyleDraft || selectedReferenceClipEntry.visual_style,
        title: referenceClipTitleDraft.trim() || selectedReferenceClipEntry.title,
        labels: referenceClipLabelsDraft.trim()
          ? referenceClipLabelsDraft.split(",").map((value) => value.trim()).filter(Boolean)
          : selectedReferenceClipEntry.labels,
        values: referenceClipValuesDraft.trim()
          ? referenceClipValuesDraft.split(",").map((value) => value.trim()).filter(Boolean)
          : selectedReferenceClipEntry.values,
        emphasis_key: referenceClipEmphasisKeyDraft.trim() || selectedReferenceClipEntry.emphasis_key,
        tone: (referenceClipToneDraft || selectedReferenceClipEntry.tone) as EpisodeReferenceClipTone,
      },
      workpieceId: workpieceId.trim(),
      workpieceTitle: activeDraft?.title ?? planningSession?.title ?? null,
      providerId: activeVisualProvider.id,
      resolvedProvider: activeVisualProvider,
      aspectRatio: "16:9",
    });
  }, [
    activeDraft?.title,
    activeVisualProvider.id,
    planningSession?.title,
    referenceClipAnchorDraft,
    referenceClipBackgroundContextDraft,
    referenceClipDescriptionDraft,
    referenceClipEmphasisKeyDraft,
    referenceClipForegroundDataDraft,
    referenceClipLabelsDraft,
    referenceClipTitleDraft,
    referenceClipToneDraft,
    referenceClipValuesDraft,
    referenceClipVisualStyleDraft,
    selectedReferenceClipEntry,
    workpieceId,
  ]);
  const selectedImageMapExactAnchor = useMemo(() => {
    if (
      !selectedImageMapEntry
      || selectedImageMapEntry.beat_anchor
      || canonicalImageMapScriptState.status !== "ready"
      || !canonicalImageMapScriptState.text
    ) {
      return null;
    }
    return assessImageMapScriptAnchor(
      canonicalImageMapScriptState.text,
      selectedImageMapEntry.script_anchor,
      resolveImageMapEntryAnchorScope(selectedImageMapEntry) === "global" ? "global" : "attached",
    );
  }, [canonicalImageMapScriptState.status, canonicalImageMapScriptState.text, selectedImageMapEntry]);
  const imageMapAnchorStatusView = useMemo(() => {
    if (!selectedImageMapEntry) return null;
    if (selectedImageMapEntry.beat_anchor) {
      return resolveImageMapAnchorStatusView({
        status: "beat",
        scriptState: canonicalImageMapScriptState,
      });
    }
    const status = selectedImageMapExactAnchor?.status
      ?? ((resolveImageMapEntryAnchorScope(selectedImageMapEntry) === "global")
        ? "global"
        : (selectedImageMapEntry.script_anchor ? "attached" : "orphaned"));
    return resolveImageMapAnchorStatusView({
      status,
      scriptState: canonicalImageMapScriptState,
    });
  }, [canonicalImageMapScriptState, selectedImageMapEntry, selectedImageMapExactAnchor]);
  const imageMapAnchorPickerParagraphs = useMemo(() => (
    canonicalImageMapScriptState.status === "ready" && canonicalImageMapScriptState.text
      ? buildImageMapAnchorPickerParagraphs(canonicalImageMapScriptState.text)
      : []
  ), [canonicalImageMapScriptState.status, canonicalImageMapScriptState.text]);
  const visualScriptParagraphRail = useMemo(() => {
    const countByParagraphId = new Map<string, number>();
    let beatCount = 0;
    let globalCount = 0;
    let orphanedCount = 0;

    for (const entry of imageMapEntries) {
      const scope = resolveImageMapEntryAnchorScope(entry);
      if (scope === "global") {
        globalCount += 1;
        continue;
      }
      if (scope === "beat") {
        beatCount += 1;
        continue;
      }
      if (scope === "orphaned" || !entry.script_anchor?.paragraph_id) {
        orphanedCount += 1;
        continue;
      }
      countByParagraphId.set(
        entry.script_anchor.paragraph_id,
        (countByParagraphId.get(entry.script_anchor.paragraph_id) ?? 0) + 1,
      );
    }

    const paragraphs = imageMapAnchorPickerParagraphs.map((paragraph) => {
      const count = countByParagraphId.get(paragraph.key) ?? 0;
      return {
        paragraphId: paragraph.key,
        label: paragraph.label,
        count,
        density: count === 0 ? "none" : count >= 3 ? "dense" : "normal",
      };
    });

    return {
      paragraphs,
      beatCount,
      globalCount,
      orphanedCount,
    };
  }, [imageMapAnchorPickerParagraphs, imageMapEntries]);
  const imageMapActiveAnchorLabel = useMemo(() => {
    if (selectedImageMapEntry?.beat_anchor) {
      return buildBulletBeatAnchorLabel(selectedImageMapEntry.beat_anchor);
    }
    const anchor = selectedImageMapExactAnchor?.exactAnchor
      ?? selectedImageMapExactAnchor?.weakAnchor
      ?? selectedImageMapEntry?.script_anchor
      ?? null;
    return buildImageMapAnchorLabel(anchor);
  }, [selectedImageMapEntry?.beat_anchor, selectedImageMapEntry?.script_anchor, selectedImageMapExactAnchor]);
  const isCanonicalImageMapScriptPanel = (isImageMapReanchorMode || isVisualScriptMode) && showScriptPanel;
  const scriptPanelBodyText = useMemo(
    () => (isCanonicalImageMapScriptPanel ? (canonicalImageMapScriptState.text ?? "") : (activeDraft?.body ?? "")),
    [activeDraft?.body, canonicalImageMapScriptState.text, isCanonicalImageMapScriptPanel],
  );
  const scriptPanelSourceLabel = useMemo(
    () => (isCanonicalImageMapScriptPanel ? resolveCanonicalImageMapScriptSourceLabel(canonicalImageMapScriptState) : null),
    [canonicalImageMapScriptState, isCanonicalImageMapScriptPanel],
  );
  const scriptPanelHint = useMemo(
    () => (isCanonicalImageMapScriptPanel ? resolveCanonicalImageMapScriptHint(canonicalImageMapScriptState) : null),
    [canonicalImageMapScriptState, isCanonicalImageMapScriptPanel],
  );
  const imageMapReanchorDisabledReason = useMemo(() => {
    if (!selectedImageMapEntry) return "Select a visual beat first.";
    if (!(scriptApprovalState.hasApprovedScript && scriptApprovalState.approvedScriptVersion && scriptApprovalState.approvedScriptVersion > 0)) {
      return "Approve the current script before repairing image anchors.";
    }
    if (imageMapSaveState === "editing" || imageMapSaveState === "saving") {
      return "Save this visual beat before re-anchoring it.";
    }
    if (isImageMapCandidateGenerating || isImageMapCandidateSelecting) {
      return "Wait for the current image-map action to finish.";
    }
    return null;
  }, [
    scriptApprovalState.approvedScriptVersion,
    scriptApprovalState.hasApprovedScript,
    imageMapSaveState,
    isImageMapCandidateGenerating,
    isImageMapCandidateSelecting,
    selectedImageMapEntry,
  ]);
  const isImageMapNearestRepairAvailable = useMemo(() => (
    Boolean(
      selectedImageMapEntry
      && canonicalImageMapScriptState.status === "ready"
      && canonicalImageMapScriptState.text
      && !selectedImageMapEntry.beat_anchor
      && imageMapAnchorScopeDraft !== "global"
      && resolveNearestParagraphSelection(canonicalImageMapScriptState.text, selectedImageMapEntry.script_anchor),
    )
  ), [
    canonicalImageMapScriptState.status,
    canonicalImageMapScriptState.text,
    imageMapAnchorScopeDraft,
    selectedImageMapEntry?.beat_anchor,
    selectedImageMapEntry,
  ]);
  const dirtyProposalBodyCount = useMemo(
    () => pendingAiProposal?.ops.reduce((count, op, index) => (
      op.op === "set_body" && isHearthProposalBodyOpDirty(pendingAiProposal.ops, pendingAiProposal.originalOps, index)
        ? count + 1
        : count
    ), 0) ?? 0,
    [pendingAiProposal],
  );
  const rememberWritingFormat = useCallback((format: HearthWritingFormat) => {
    setSelectedWritingFormat(format);
    writeLastHearthWritingFormat(format);
  }, []);
  const writingFormatOptions = useMemo(() => (
    HEARTH_WRITING_FORMATS.map((format) => {
      const profile = getHearthWritingFormatProfile(format);
      return {
        id: profile.id,
        label: profile.label,
        helperText: profile.helperText,
      };
    })
  ), []);
  const draftShortcutLabel = useMemo(() => (
    selectedWritingFormat === "explore_expand"
      ? "Explore & Expand"
      : `Start with ${getHearthWritingFormatProfile(selectedWritingFormat).shortLabel}`
  ), [selectedWritingFormat]);
  const selectedImageMapCandidates = selectedImageMapEntry?.candidate_assets ?? [];
  const imageMapCandidateCards = selectedImageMapCandidates.map((candidate) => ({
    id: candidate.asset_id,
    variantLabel: candidate.variant_label ?? "candidate",
    visualMode: candidate.visual_mode ?? null,
    isSelected: selectedImageMapEntry?.selected_asset_id === candidate.asset_id,
    previewState: imageMapCandidatePreviewStateById[candidate.asset_id] ?? "loading",
    previewDataUrl: imageMapCandidatePreviewUrlById[candidate.asset_id] ?? null,
    previewError: imageMapCandidatePreviewErrorById[candidate.asset_id] ?? null,
    source: candidate.source ?? selectedImageMapEntry?.source_type ?? null,
  }));
  const [canonicalReferenceClipState, setCanonicalReferenceClipState] = useState<ReferenceClipState | null>(null);
  const [canonicalReferenceVisualState, setCanonicalReferenceVisualState] = useState<ReferenceVisualState | null>(null);
  const [canonicalReferenceClipAuthorityState, setCanonicalReferenceClipAuthorityState] = useState<"available"|"loading"|"error">("loading");
  const [canonicalReferenceVisualAuthorityState, setCanonicalReferenceVisualAuthorityState] = useState<"available"|"loading"|"error">("loading");
  const canonicalReferenceClipRefreshSequence = useRef(0);
  const canonicalReferenceVisualRefreshSequence = useRef(0);
  const [visualOpportunityDispositions, setVisualOpportunityDispositions] = useState<VisualOpportunityDisposition[]>([]);
  const refreshCanonicalReferenceClips = useCallback(async () => {
    const sequence = ++canonicalReferenceClipRefreshSequence.current;
    if (!workspaceId || !workpieceId) { setCanonicalReferenceClipState(null); setCanonicalReferenceClipAuthorityState("loading"); return false; }
    setCanonicalReferenceClipAuthorityState("loading");
    const result = await readCanonicalReferenceClips(workspaceId, workpieceId);
    if (sequence !== canonicalReferenceClipRefreshSequence.current) return false;
    if (!result.ok) { setCanonicalReferenceClipAuthorityState("error"); return false; }
    setCanonicalReferenceClipState(result.data);
    setCanonicalReferenceClipAuthorityState("available");
    return true;
  }, [workspaceId, workpieceId]);
  useEffect(() => { void refreshCanonicalReferenceClips(); }, [refreshCanonicalReferenceClips]);
  const refreshCanonicalReferenceVisuals = useCallback(async () => {
    const sequence = ++canonicalReferenceVisualRefreshSequence.current;
    if (!workspaceId || !workpieceId) { setCanonicalReferenceVisualState(null); setCanonicalReferenceVisualAuthorityState("loading"); return false; }
    setCanonicalReferenceVisualAuthorityState("loading");
    const result = await readCanonicalReferenceVisuals(workspaceId, workpieceId);
    if (sequence !== canonicalReferenceVisualRefreshSequence.current) return false;
    if (!result.ok) { setCanonicalReferenceVisualAuthorityState("error"); return false; }
    setCanonicalReferenceVisualState(result.data);
    setCanonicalReferenceVisualAuthorityState("available");
    return true;
  }, [workspaceId, workpieceId]);
  useEffect(() => { void refreshCanonicalReferenceVisuals(); }, [refreshCanonicalReferenceVisuals]);
  useEffect(() => subscribeToForgeUserAccessToken(() => {
    void refreshCanonicalReferenceClips();
    void refreshCanonicalReferenceVisuals();
  }), [refreshCanonicalReferenceClips, refreshCanonicalReferenceVisuals]);
  const refreshVisualOpportunityDispositions = useCallback(async () => {
    if (!workspaceId || !workpieceId) { setVisualOpportunityDispositions([]); return false; }
    const result = await readVisualOpportunityDispositions(workspaceId, workpieceId);
    if (!result.ok) return false;
    setVisualOpportunityDispositions(result.data);
    return true;
  }, [workspaceId, workpieceId]);
  useEffect(() => { void refreshVisualOpportunityDispositions(); }, [refreshVisualOpportunityDispositions]);
  useEffect(() => { const listener=()=>void refreshCanonicalReferenceVisuals(); window.addEventListener("forge:canonical-reference-visuals-changed",listener); return()=>window.removeEventListener("forge:canonical-reference-visuals-changed",listener); }, [refreshCanonicalReferenceVisuals]);
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ workspaceId?: string; workpieceId?: string; state?: ReferenceClipState | null }>).detail;
      if (detail?.workspaceId === workspaceId && detail?.workpieceId === workpieceId && "state" in detail) {
        canonicalReferenceClipRefreshSequence.current += 1;
        setCanonicalReferenceClipState(detail.state ?? null);
        setCanonicalReferenceClipAuthorityState("available");
      }
    };
    window.addEventListener("forge:canonical-reference-clips-progress", listener);
    return () => window.removeEventListener("forge:canonical-reference-clips-progress", listener);
  }, [workspaceId, workpieceId]);
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ workspaceId?: string; workpieceId?: string; state?: ReferenceVisualState | null }>).detail;
      if (detail?.workspaceId === workspaceId && detail?.workpieceId === workpieceId && "state" in detail) {
        canonicalReferenceVisualRefreshSequence.current += 1;
        setCanonicalReferenceVisualState(detail.state ?? null);
        setCanonicalReferenceVisualAuthorityState("available");
      }
    };
    window.addEventListener("forge:canonical-reference-visuals-progress", listener);
    return () => window.removeEventListener("forge:canonical-reference-visuals-progress", listener);
  }, [workspaceId, workpieceId]);
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ workspaceId?: string; workpieceId?: string; dispositions?: VisualOpportunityDisposition[] }>).detail;
      if (detail?.workspaceId === workspaceId && detail?.workpieceId === workpieceId && Array.isArray(detail.dispositions)) setVisualOpportunityDispositions(detail.dispositions);
    };
    window.addEventListener("forge:visual-opportunity-dispositions-progress", listener);
    return () => window.removeEventListener("forge:visual-opportunity-dispositions-progress", listener);
  }, [workspaceId, workpieceId]);
  const skippedReferenceClipIds = new Set(visualOpportunityDispositions.filter((item) => item.kind === "reference_clip" && item.state === "skipped").map((item) => item.opportunityId));
  const skippedReferenceVisualIds = new Set(visualOpportunityDispositions.filter((item) => item.kind === "reference_visual" && item.state === "skipped").map((item) => item.opportunityId));
  const sourcedReferenceClips = canonicalReferenceClipState?.opportunities.filter((opportunity) => opportunity.sourceStatus === "linked") ?? [];
  const sourcedReferenceVisuals = canonicalReferenceVisualState?.opportunities.filter((opportunity) => opportunity.sourceStatus === "linked" || (opportunity.sources?.length ?? 0) > 0) ?? [];
  const plannedImageCount = imageMapEntries.length;
  const imageMapAuthorityUnavailable = imageMapSaveError === "canonical_image_map_authority_unavailable";
  const mediaWorkflowInput = {
    hasApprovedScript: Boolean(scriptApprovalState.hasApprovedScript && scriptApprovalState.approvedScriptVersion && scriptApprovalState.approvedScriptVersion > 0),
    visualPlan: {
      status: imageMapEntries.length || brollBeats.length || canonicalReferenceClipState?.opportunities.length || canonicalReferenceVisualState?.opportunities.length ? "activated" : null,
      operationState: unifiedVisualPlanOperationProjection.workpieceId === workpieceId
        ? unifiedVisualPlanOperationProjection.state
        : "readback_pending",
      total: imageMapEntries.length + brollBeats.length + (canonicalReferenceClipState?.opportunities.length ?? 0) + (canonicalReferenceVisualState?.opportunities.length ?? 0),
      images: imageMapEntries.length,
      broll: brollBeats.length,
      referenceClips: canonicalReferenceClipState?.opportunities.length ?? 0,
      referenceVisuals: canonicalReferenceVisualState?.opportunities.length ?? 0,
      version: Math.max(canonicalBrollV2.state.planRevision, canonicalReferenceClipState?.planRevision ?? 0, canonicalReferenceVisualState?.planRevision ?? 0),
    },
    thumbnails: {
      total: canonicalThumbnailProgress.workpieceId === (workpieceId?.trim() ?? "") ? canonicalThumbnailProgress.candidateCount : 0,
      eligible: canonicalThumbnailProgress.workpieceId === (workpieceId?.trim() ?? "") ? canonicalThumbnailProgress.eligibleCandidateCount : 0,
      pending: canonicalThumbnailProgress.workpieceId === (workpieceId?.trim() ?? "") ? canonicalThumbnailProgress.pendingCandidateCount : 0,
      previewAssetPaths: canonicalThumbnailProgress.workpieceId === (workpieceId?.trim() ?? "") ? canonicalThumbnailProgress.previewAssetPaths : [],
      authorityState: canonicalThumbnailProjection.loadError?"error" as const:canonicalThumbnailProjection.loading?"loading" as const:"available" as const,
    },
    images: {
      planned: plannedImageCount,
      completed: imageMapEntries.filter((entry) => Boolean(entry.selected_asset_id)).length,
      canonicalCount: imageMapEntries.length,
      projectionLoaded: imageMapProjectionLoaded && !imageMapAuthorityUnavailable,
    },
    referenceClips: {
      planned: sourcedReferenceClips.length,
      completed: sourcedReferenceClips.filter((opportunity) => opportunity.selectedRevisionIds.length > 0 || skippedReferenceClipIds.has(opportunity.id)).length,
      unsourced: (canonicalReferenceClipState?.opportunities.length ?? 0) - sourcedReferenceClips.length,
      exists: Boolean(canonicalReferenceClipState?.planRevisionId),
      authorityState: canonicalReferenceClipAuthorityState,
    },
    referenceVisuals: {
      planned: sourcedReferenceVisuals.length,
      completed: sourcedReferenceVisuals.filter((opportunity) => Boolean(opportunity.selectedCandidateRevisionId) || skippedReferenceVisualIds.has(opportunity.id)).length,
      unsourced: (canonicalReferenceVisualState?.opportunities.length ?? 0) - sourcedReferenceVisuals.length,
      exists: Boolean(canonicalReferenceVisualState?.planRevisionId),
      authorityState: canonicalReferenceVisualAuthorityState,
    },
    broll: { planned: brollBeats.length, completed: brollBeats.filter((beat) => beat.fulfillment_state === "resolved" && Boolean(beat.selected_asset_id)).length },
    upstreamChanged: visualPlanRevisionChanged,
  };
  const canonicalMediaWorkflow = deriveHearthMediaWorkflow(mediaWorkflowInput);
  const canonicalMediaPlanStatus = mediaWorkflowInput.visualPlan.status as EpisodeMediaMapStatus | null;
  const canonicalMediaComplete = canonicalMediaWorkflow.stages
    .filter((stage) => stage.id !== "review")
    .every((stage) => stage.status === "complete");
  const hasBrowserSpeech = (
    typeof window !== "undefined"
    && hasBrowserSpeechRecognition(window)
  );
  const hasApprovedScript = Boolean(
    scriptApprovalState.hasApprovedScript
    && scriptApprovalState.approvedScriptVersion
    && scriptApprovalState.approvedScriptVersion > 0,
  );
  const approvedScriptVersion = hasApprovedScript ? scriptApprovalState.approvedScriptVersion : null;
  const releasePreparationWorkspace = useHearthReleasePreparationWorkspaceState({
    workpieceId,
    hasApprovedScript,
    approvedScriptVersion,
  });
  const {
    latestReleasePrepRawText,
    latestReleasePrepSections,
    releasePrepLoadState,
    releasePrepScriptVersion,
    loadLatestReleasePrepPack,
    resetReleasePrepState,
  } = releasePreparationWorkspace;
  const framingPackReady = releasePrepLoadState === "ready" && latestReleasePrepSections.length > 0;
  const displayedFramingTitleCount = Math.max(thumbnailTitleOptions.length, canonicalFramingTitleCount);
  const displayedFramingTagCount = Math.max(metadataTagsDraft.length, canonicalFramingTagCount);
  const {
    persistThumbnailEpisodePackage,
    persistImageMapEntries,
    persistBrollPlan,
    persistMediaMap,
    persistReferenceClipPlan,
  } = useVisualsPersistence({
    operationAuthority,
    episodePackage,
    workpieceId,
    workspaceId,
    imageMapMetadataUpdatedAt,
    setEpisodePackage,
    setImageMapMetadataUpdatedAt,
    setThumbnailGenerateError,
  });
  const { readCanonicalScriptForImageMapGeneration } = useHearthCanonicalImageMapScriptReader({
    workpieceId,
    activeDraft,
    listWorkpieceDrafts: (episodeId: string) => store.listWorkpieceDrafts(episodeId),
  });
  useHearthVisualPlanConversationBootstrap({
    activeWorkpieceTab,
    episodePackage,
    mediaMapEntriesLength: mediaMapEntries.length,
    mediaMapConversationState,
    setMediaMapConversationSeed,
    setMediaMapConversationState,
    setMediaMapConversationError,
    readCanonicalScriptForImageMapGeneration,
  });
  useHearthCanonicalImageMapScriptLifecycle({
    workpieceId,
    selectedImageMapEntry,
    setCanonicalImageMapScriptState,
    readCanonicalScriptForImageMapGeneration,
  });
  useVisualSelectionHydration({
    launchVariants,
    selectedLaunchVariant,
    thumbnailTitleOptions,
    preferredThumbnailTitleId,
    thumbnailVersions,
    selectedThumbnailConceptId,
    primaryThumbnailVersionId,
    mediaMapEntries,
    selectedMediaMapEntry,
    imageMapEntries,
    selectedImageMapEntry,
    brollBeats,
    selectedBrollBeat,
    referenceClipEntries,
    selectedReferenceClipEntry,
    syncSelectedLaunchVariantId,
    syncLaunchVariantDraftFromVariant,
    syncSelectedThumbnailTitleId,
    syncSelectedThumbnailVersionId,
    syncSelectedMediaMapEntryId,
    syncMediaMapDraftFromEntry,
    syncSelectedImageMapEntryId,
    syncImageMapDraftFromEntry,
    resolveImageMapEntryAnchorScope,
    syncSelectedBrollBeatId,
    syncBrollDraftFromBeat,
    syncSelectedReferenceClipEntryId,
    syncReferenceClipDraftFromEntry,
  });
  const {
    onAddMediaMapEntry,
    onSaveMediaMapEntry,
    onDeleteMediaMapEntry,
    onActivateEpisodeMediaMap,
  } = useHearthVisualPlanEntryCommands({
    operationAuthority,
    episodePackage,
    workpieceId,
    selectedMediaMapEntry,
    approvedScriptVersion,
    isMediaMapBusy,
    mediaMapTypeDraft,
    mediaMapAnchorModeDraft,
    mediaMapAnchorTargetDraft,
    mediaMapInOffsetDraft,
    mediaMapDurationDraft,
    mediaMapDescriptionDraft,
    mediaMapIntentDraft,
    mediaMapSourceStatusDraft,
    mediaMapSourceAssetIdDraft,
    mediaMapConfidenceDraft,
    mediaMapOptionalDraft,
    mediaMapCriticalDraft,
    mediaMapSaveState,
    setIsMediaMapBusy,
    setMediaMapSaveState,
    setMediaMapSaveError,
    setMediaMapMessage,
    setSelectedMediaMapEntryId,
    persistImageMapEntries,
    persistBrollPlan,
    persistReferenceClipPlan,
    persistMediaMap,
  });
  const { prepareSourceEpisodePackageForMediaMapGeneration } = useHearthVisualPlanSourcePreparation({
    episodePackage,
    workpieceId,
    effectiveComposeSetupMode: effectiveComposeSetup?.mode ?? null,
    readCanonicalScriptForImageMapGeneration,
    persistImageMapEntries,
    persistBrollPlan,
    persistReferenceClipPlan,
  });
  const {
    onGenerateEpisodeMediaMapFromPlans,
    onBuildAndApplyMediaMapFromConversation,
  } = useHearthVisualPlanGenerationCommands({
    operationAuthority,
    episodePackage,
    isMediaMapBusy,
    approvedScriptVersion,
    mediaMapGenerationScope,
    setMediaMapGenerationScope,
    setIsMediaMapBusy,
    setVisualPlanOperationStage,
    setMediaMapSaveState,
    setMediaMapSaveError,
    setMediaMapMessage,
    setSelectedMediaMapEntryId,
    prepareSourceEpisodePackageForMediaMapGeneration,
    buildMediaMapFromExistingPlans,
    persistMediaMap,
    repairImageMapAuthority: async () => {
      if (!workpieceId || !workspaceId || !episodePackage) {
        return { ok: false as const, error: missingImageMapContextError };
      }
      const { repairWorkpieceImageMapAuthority } = await import("../lib/hearth-image-map-authority");
      const repaired = await repairWorkpieceImageMapAuthority({ workpieceId, workspaceId });
      if (!repaired.ok) {
        return { ok: false as const, error: repaired.error ?? "Tongs could not verify the applied visual plan." };
      }
      applyCanonicalImageMap({
        entries: repaired.imageMap.entries,
        spokenBeats: repaired.imageMap.spokenBeats,
        metadataUpdatedAt: repaired.imageMap.metadataUpdatedAt,
      });
      return { ok: true as const };
    },
    generateUnifiedVisualPlan: async (generationScope, creatorDirection) => {
      if (!workspaceId || !workpieceId) return { ok: false as const, error: "Select an episode before generating its Visual Plan.", stage: "context" };
      return generateOrResumeUnifiedVisualPlan({ workspaceId, workpieceId, generationScope, creatorDirection });
    },
    refreshCanonicalBroll: canonicalBrollV2.refresh,
    notifyCanonicalReferenceClipsChanged: () => { void refreshCanonicalReferenceClips(); window.dispatchEvent(new CustomEvent("forge:canonical-reference-clips-changed", { detail: { workspaceId, workpieceId } })); },
  });
  const onRecoverLastMediaMapGeneration = useCallback(async () => {
    if (!recoverableMediaMap || !episodePackage || isMediaMapBusy) return;
    setIsMediaMapBusy(true);
    setMediaMapSaveState("saving");
    setMediaMapSaveError(null);
    try {
      const recovered = await persistMediaMap({
        map: recoverableMediaMap,
        eventName: "hearth.media_map.generation.recovered.v1",
        eventPayload: { entry_count: recoverableMediaMap.entries.length, source: "last_generation_artifact" },
      });
      if (!recovered.ok) {
        setMediaMapSaveState("error");
        setMediaMapSaveError(recovered.error);
        return;
      }
      setRecoverableMediaMap(null);
      setSelectedMediaMapEntryId(recovered.episodePackage.media_map.entries[0]?.id ?? null);
      setMediaMapSaveState("saved");
      setMediaMapMessage("Recovered the last generated visual plan without a new AI request.");
    } finally {
      setIsMediaMapBusy(false);
    }
  }, [episodePackage, isMediaMapBusy, persistMediaMap, recoverableMediaMap, setIsMediaMapBusy, setMediaMapMessage, setMediaMapSaveError, setMediaMapSaveState, setSelectedMediaMapEntryId]);
  const approvedAtText = scriptApprovalState.approvedAt
    ? formatUpdatedAt(scriptApprovalState.approvedAt)
    : "Unknown";
  const mediaMapCoverageLevel = useMemo(() => resolveMediaPlanCoverageLevel(mediaMapEntries), [mediaMapEntries]);
  const mediaMapScopeLabel = useMemo(() => resolveMediaPlanScopeLabel(mediaMapEntries), [mediaMapEntries]);
  const framingTitleCount = displayedFramingTitleCount;
  // Downstream readiness consumes the same hydrated Tongs-backed package as
  // the Framing editor, never transient draft/proposal state.
  const metadataProgress = buildHearthMetadataProgress({
    active: Boolean(workpieceId),
    loaded: episodePackageState === "loaded" && Boolean(episodePackage),
    authorityAvailable: episodePackageState !== "error",
    episodePackage,
    canonicalTitleCount: canonicalFramingTitleCount,
    canonicalTagCount: canonicalFramingTagCount,
    canonicalHasDescriptions: canonicalFramingHasDescriptions,
    dirty: hasUnsavedMetadataChanges,
  });
  const metadataComplete = metadataProgress.completion === "complete";
  // Thumbnail V3 selects an immutable candidate set, not the legacy V2
  // primary_version_id. Release review must consume the same Tongs-backed
  // authority used by the visual workflow or a valid three-thumbnail set is
  // incorrectly reported as missing after reload.
  const thumbnailsSelected = canonicalThumbnailProgress.workpieceId === (workpieceId?.trim() ?? "")
    && isCanonicalThumbnailSetComplete(canonicalThumbnailProgress);
  const releasePreparationController = buildHearthReleasePreparationController({
    workspaceId,
    workpieceId,
    active: Boolean(workpieceId),
    scriptAuthorityAvailable: true,
    hasApprovedScript,
    approvedScriptVersion,
    mediaAuthorityAvailable: !imageMapAuthorityUnavailable,
    mediaMapStatus: canonicalMediaPlanStatus,
    metadataAuthorityAvailable: episodePackageState !== "error",
    metadataComplete: metadataComplete || framingPackReady,
    thumbnailAuthorityAvailable: canonicalThumbnailProgress.workpieceId === (workpieceId?.trim() ?? "")&&!canonicalThumbnailProjection.loadError,
    thumbnailsSelected,
    workspace: releasePreparationWorkspace,
  });
  const latestMilestoneRevision = useMemo(() => revisions.find((revision) => revision.kind === "milestone") ?? null, [revisions]);
  const tabDirtyById: Record<WorkpieceWorkspaceTab, boolean> = {
    script: isDirty || isSaving || isAiProcessing,
    visuals: (
      mediaMapSaveState === "editing"
      || mediaMapSaveState === "saving"
      || imageMapSaveState === "editing"
      || imageMapSaveState === "saving"
      || brollSaveState === "editing"
      || brollSaveState === "saving"
      || referenceClipSaveState === "editing"
      || referenceClipSaveState === "saving"
      || isThumbnailConceptSaving
      || isThumbnailUploading
    ),
    metadata: hasUnsavedMetadataChanges,
    release: false,
    history: false,
  };
  const hasAnyUnsavedTab = Object.values(tabDirtyById).some(Boolean);
  const canonicalActiveDraftId = activeWorkpieceContext.draft?.id ?? null;
  const hasCanonicalActiveDraft = Boolean(activeDraft?.id && activeDraft.id === canonicalActiveDraftId);
  const chatHistoryKey = useMemo(
    () => hasCanonicalActiveDraft ? resolveChatHistoryKey(workpieceId, canonicalActiveDraftId) : null,
    [canonicalActiveDraftId, hasCanonicalActiveDraft, workpieceId],
  );
  const chatContextHydrated = isChatContextHydrated({
    historyKey: chatHistoryKey,
    hydratedHistoryKey: hydratedChatHistoryKey,
    draftId: activeDraft?.id ?? null,
    canonicalDraftId: canonicalActiveDraftId,
  });
  const chatReadinessStatus = !aiEpisodeReady
    ? "idle" as const
    : chatContextHydrated
      ? "ready" as const
      : chatHydrationStatus === "error"
        ? "error" as const
        : "loading" as const;
  const chatPanelMeta = resolveHearthChatPanelMeta(chatReadinessStatus, chatMessages.length);
  const buildActiveEpisodeContext = useCallback((): EpisodeContext | null => {
    const episodeId = workpieceId?.trim();
    if (!episodeId) return null;
    if (!activeDraft || !hasCanonicalActiveDraft) return null;
    const episodeSparks = sparks.filter((spark) => (
      (workpieceId && spark.links?.hearthWorkpieceId === workpieceId)
      || (activeDraft?.id && spark.links?.hearthDraftId === activeDraft.id)
    ));
    return buildEpisodeContext({
      episodeId,
      workspaceId,
      draft: activeDraft,
      planningSession,
      workpieceSources,
      sourceIndexById,
      sparks: episodeSparks,
    });
  }, [activeDraft, hasCanonicalActiveDraft, planningSession, sourceIndexById, sparks, workpieceId, workpieceSources, workspaceId]);
  const refreshChatAttachments = useCallback(async () => {
    const episodeId = workpieceId?.trim();
    const activeWorkspaceId = workspaceId?.trim();
    if (!episodeId || !activeWorkspaceId) {
      setChatAttachments([]);
      setChatAttachmentError(null);
      return;
    }
    const operation = operationAuthority.begin("attachments.refresh");

    setIsAttachmentsLoading(true);
    const result = await listHearthConversationAttachments({
      workspaceId: activeWorkspaceId,
      episodeId,
    });
    if (!operationAuthority.isCurrent(operation)) return;
    if (!result.ok) {
      setChatAttachmentError(result.error);
      setIsAttachmentsLoading(false);
      return;
    }

    setChatAttachments(result.attachments.map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mime_type,
      status: attachment.parse_status === "failed"
        ? "failed"
        : attachment.parse_status === "needs_text_extraction"
          ? "needs_text_extraction"
          : attachment.parse_status === "pending"
            ? "reading"
            : "attached",
      error: attachment.parse_error,
    })));
    setChatAttachmentError(null);
    setIsAttachmentsLoading(false);
  }, [operationAuthority, workpieceId, workspaceId]);

  useEffect(() => {
    void refreshChatAttachments();
  }, [refreshChatAttachments]);

  const onUploadChatAttachments = useCallback(async (files: FileList | null) => {
    const episodeId = workpieceId?.trim();
    const activeWorkspaceId = workspaceId?.trim();
    if (!episodeId || !activeWorkspaceId || !files || files.length === 0) return;
    const operation = operationAuthority.begin("attachments.upload");

    const uploadItems = Array.from(files);
    for (const file of uploadItems) {
      const tempId = `temp-${crypto.randomUUID()}`;
      setChatAttachments((prev) => ([
        {
          id: tempId,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          status: "uploading",
          error: null,
        },
        ...prev,
      ]));

      setChatAttachments((prev) => prev.map((entry) => (
        entry.id === tempId
          ? { ...entry, status: "reading" }
          : entry
      )));

      const upload = await uploadHearthConversationAttachment({
        workspaceId: activeWorkspaceId,
        episodeId,
        file,
      });
      if (!operationAuthority.isCurrent(operation)) return;

      if (!upload.ok) {
        setChatAttachments((prev) => prev.map((entry) => (
          entry.id === tempId
            ? {
              ...entry,
              status: "failed",
              error: upload.error,
            }
            : entry
        )));
        continue;
      }

      const uploadedAttachment = upload.attachment;
      setChatAttachments((prev) => prev.map((entry) => (
        entry.id === tempId
          ? {
            id: uploadedAttachment.id,
            filename: uploadedAttachment.filename,
            mimeType: uploadedAttachment.mime_type,
            status: uploadedAttachment.parse_status === "failed"
              ? "failed"
              : uploadedAttachment.parse_status === "needs_text_extraction"
                ? "needs_text_extraction"
                : uploadedAttachment.parse_status === "pending"
                  ? "reading"
                  : "attached",
            error: uploadedAttachment.parse_error,
          }
          : entry
      )));
    }
  }, [operationAuthority, workpieceId, workspaceId]);

  const onRemoveChatAttachment = useCallback((id: string) => {
    setChatAttachments((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  const onPasteAttachmentText = useCallback(async (attachmentId: string, text: string) => {
    const activeWorkspaceId = workspaceId?.trim();
    if (!activeWorkspaceId) return;
    const operation = operationAuthority.begin(`attachments.text:${attachmentId}`);
    const result = await updateHearthConversationAttachmentText({
      attachmentId,
      workspaceId: activeWorkspaceId,
      extractedText: text,
    });
    if (!operationAuthority.isCurrent(operation)) return;
    if (!result.ok) {
      setChatAttachments((prev) => prev.map((entry) =>
        entry.id === attachmentId
          ? { ...entry, error: result.error }
          : entry,
      ));
      return;
    }
    setChatAttachments((prev) => prev.map((entry) =>
      entry.id === attachmentId
        ? { ...entry, status: "attached", error: null }
        : entry,
    ));
  }, [operationAuthority, workspaceId]);

  const {
    onFixScriptFormattingNoAi,
    onAskAiRepairScript,
  } = useHearthScriptRepairActions({
    operationAuthority,
    activeDraft,
    isRepairingScript,
    isAiProcessing,
    aiTokenBalance,
    ownerChatCapability,
    chatHistoryMaxMessages: CHAT_HISTORY_MAX_MESSAGES,
    aiRequestControllerRef,
    draftEditVersionRef,
    activeDraftRef,
    buildActiveEpisodeContext,
    persistDraft,
    dedupeDraftListById,
    queueAiAutosave,
    requestHearthChatReply,
    refreshMyAiCredits,
    resolveAiLaneFromStorage,
    buildValidationReport,
    setAiBillingMode,
    setAiTokenBalance,
    setIsRepairingScript,
    setIsAiProcessing,
    setChatError,
    setAiRuntimeWarning,
    setScriptValidation,
    setError,
    setActiveDraft,
    setDrafts,
    setChatMessages,
  });
  const { flushChatHistoryNow, retryChatHydration, clearChatHistoryNow } = useHearthConversationHistory<PendingAiProposal>({
    store,
    activeDraftId: activeDraft?.id ?? null,
    activeWorkpieceId: workpieceId,
    chatHistoryKey,
    chatMessages,
    setChatMessages,
    setChatError,
    setPendingAiProposal,
    chatPersistTimerRef,
    chatMessagesRef,
    latestChatHistoryKeyRef,
    latestChatDraftIdRef,
    latestChatWorkpieceIdRef,
    skipChatHydrationKeyRef,
    pendingChatHydrationKeyRef,
    chatHydrationSeqRef,
    setHydratedChatHistoryKey,
    setChatHydrationStatus,
    setLastTurnPersistence: (persistence) => setLastTurnResult((current) => current ? {
      ...current,
      persistence,
      validation: persistence === "failed"
        ? {
          ok: false,
          failureKind: "persistence_failure" as const,
          message: "The conversation is still visible, but this turn has not been saved to Tongs.",
        }
        : current.validation.failureKind === "persistence_failure"
          ? { ok: true, failureKind: "none" as const, message: null }
          : current.validation,
    } : current),
    readChatHistoryFromCache,
    writeChatHistoryCache,
    clearChatHistoryCache,
    sanitizeChatMessagesForStorage,
    chatHistoryWriteDebounceMs: CHAT_HISTORY_WRITE_DEBOUNCE_MS,
  });
  useEffect(() => {
    if (!chatContextHydrated || !workspaceId || !workpieceId || !activeDraft) return;
    let cancelled = false;
    void readPendingHearthScriptProposal(workspaceId, workpieceId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setChatError(result.error);
        return;
      }
      const proposal = result.data;
      if (!proposal) {
        setPendingAiProposal((current) => current?.persistedProposal ? null : current);
        return;
      }
      const context = buildActiveEpisodeContext();
      if (!context) return;
      const normalizedOps = normalizeAiProposalOpsForScriptIngress(proposal.ops);
      setPendingAiProposal({
        assistantText: proposal.assistantText,
        ops: normalizedOps,
        originalOps: cloneHearthProposalOps(normalizedOps),
        selected: normalizedOps.map(() => true),
        context,
        fromGate: false,
        autosaveReasonCode: "ai_script",
        proposalOrigin: "ai",
        deterministicAction: null,
        formatSourceBody: null,
        formatOriginalBody: null,
        formatChanges: [],
        persistedProposal: {
          proposalId: proposal.proposalId,
          proposalState: proposal.proposalState,
          createdAt: proposal.createdAt,
          operationId: proposal.operationId,
          sourcePaidResultId: proposal.sourcePaidResultId,
          expectedDraftRevision: proposal.expectedDraftRevision,
          expectedDraftHash: proposal.expectedDraftHash,
          applicationStarted: proposal.applicationStarted,
        },
      });
    });
    return () => { cancelled = true; };
  }, [
    activeDraft,
    buildActiveEpisodeContext,
    chatContextHydrated,
    setChatError,
    setPendingAiProposal,
    workpieceId,
    workspaceId,
  ]);
  const { sendChatMessage, onSendChat, onCancelAiRequest } = useHearthConversationRuntime<
    PendingAiProposal,
    EpisodeContext,
    HearthOp
  >({
    operationAuthority,
    isChatContextReady: chatContextHydrated,
    isAiProcessing,
    aiTokenBalance,
    ownerChatCapability,
    chatDraft,
    setChatDraft,
    setChatMessages,
    setChatError,
    setPendingAiProposal,
    setAiRuntimeWarning,
    setIsAiProcessing,
    setLastTurnResult,
    setAiBillingMode,
    setAiTokenBalance,
    chatMessagesRef,
    aiRequestControllerRef,
    gateAwaitingAnswersRef,
    pendingShortcutIntentRef,
    pendingExplicitActionRef,
    chatHistoryMaxMessages: CHAT_HISTORY_MAX_MESSAGES,
    getSelectedWritingFormat: () => selectedWritingFormat,
    resolveChatRequestWritingFormat: ({ requestContent, pendingShortcutIntent, selectedFormat }) => (
      resolveHearthWritingFormatRequest({
        requestContent,
        pendingShortcutIntent,
        selectedFormat: selectedFormat as HearthWritingFormat,
      })
    ),
    rememberWritingFormat: (format) => rememberWritingFormat(format as HearthWritingFormat),
    buildActiveEpisodeContext,
    readDeterministicSourceBody: (episodeContext) => episodeContext.body,
    createDeterministicProposal: ({
      action,
      assistantText,
      sourceBody,
      resultBody,
      episodeContext,
    }) => ({
      assistantText,
      ops: [{ op: "set_body", value: resultBody }],
      originalOps: [{ op: "set_body", value: resultBody }],
      selected: [true],
      context: episodeContext,
      fromGate: false,
      autosaveReasonCode: action === "format_only" ? "format_only" : "deterministic_cleanup",
      proposalOrigin: action === "format_only" ? "format_only" : "deterministic",
      deterministicAction: action,
      formatSourceBody: action === "format_only" ? sourceBody : null,
      formatOriginalBody: resultBody,
      formatChanges: [],
      persistedProposal: null,
    }),
    detectAiAutosaveReasonCode,
    countProducerQuestions,
    cloneHearthProposalOps,
    createPendingAiProposal: (proposalArgs) => {
      const normalizedOps = normalizeAiProposalOpsForScriptIngress(proposalArgs.proposalOps);
      return {
        assistantText: proposalArgs.assistantText,
        ops: normalizedOps,
        originalOps: cloneHearthProposalOps(normalizedOps),
        selected: normalizedOps.map(() => true),
        context: proposalArgs.episodeContext,
        fromGate: proposalArgs.fromGate,
        autosaveReasonCode: proposalArgs.autosaveReasonCode ?? "ai_rewrite",
        proposalOrigin: "ai",
        deterministicAction: null,
        formatSourceBody: null,
        formatOriginalBody: null,
        formatChanges: [],
        persistedProposal: proposalArgs.scriptProposal ? {
          proposalId: proposalArgs.scriptProposal.proposalId,
          proposalState: proposalArgs.scriptProposal.proposalState,
          createdAt: null,
          operationId: null,
          sourcePaidResultId: null,
          expectedDraftRevision: null,
          expectedDraftHash: null,
          applicationStarted: false,
        } : null,
      };
    },
    resolveAiLaneFromStorage,
    requestHearthChatReply,
    persistProductionArtifact: async (artifactArgs) => {
      await persistProductionArtifact({
        action: artifactArgs.action as ProductionAction,
        scriptVersion: artifactArgs.scriptVersion,
        assistantText: artifactArgs.assistantText,
        paidOperationId: artifactArgs.paidOperationId,
        framingPackIdentity: artifactArgs.framingPackIdentity,
        thumbnailDirectionIdentity: artifactArgs.thumbnailDirectionIdentity,
      });
    },
    refreshMyAiCredits,
    recordInteractionEvent,
    publishForgeNotice,
    onResearchResult: sourcesController.commands.recordResearchResult,
    getAttachmentContext: () => {
      const attachmentIds = chatAttachments
        .filter((entry) => entry.status === "attached" || entry.status === "reading")
        .map((entry) => entry.id)
        .filter((id) => !id.startsWith("temp-"));
      return {
        includeEpisodeAttachments: attachmentIds.length > 0,
        attachmentIds,
      };
    },
  });
  const { onToggleMic } = useHearthConversationStt({
    operationAuthority,
    workpieceId,
    devMode,
    hasBrowserSpeech,
    isAiProcessing,
    aiTokenBalance,
    sttLane,
    sttTarget,
    sttState,
    setSttLane,
    setSttTarget,
    setSttState,
    setSttError,
    setSttNotice,
    setSttPreview,
    setAiRuntimeWarning,
    setAiBillingMode,
    setAiTokenBalance,
    speechRecognitionRef,
    mediaRecorderRef,
    mediaStreamRef,
    aiSttChunksRef,
    aiSttStartedAtRef,
    aiSttMimeTypeRef,
    aiSttEpisodeIdRef,
    aiSttStopTimerRef,
    aiSttDiscardNextStopRef,
    aiSttTranscribeControllerRef,
    sttNoticeTimerRef,
    sttPreviewTimerRef,
    browserSttStopTimerRef,
    sttInlineFeedbackMs: STT_INLINE_FEEDBACK_MS,
    sttPreviewMaxChars: STT_PREVIEW_MAX_CHARS,
    aiSttMaxDurationMs: AI_STT_MAX_DURATION_MS,
    aiSttMaxBytes: AI_STT_MAX_BYTES,
    resolveAiLaneFromStorage,
    resolveAiSttMimeType,
    uploadHearthSttAudio,
    requestHearthSttTranscript,
    sendChatMessage,
    commitScriptTranscript,
    getSttStartError: (target) => {
      if (target !== "script") return null;
      if (!activeDraft) return "Open a draft to dictate into the script.";
      if (isCanonicalImageMapScriptPanel) {
        return "Script dictation is unavailable while viewing the canonical script.";
      }
      return null;
    },
  });
  const applyProposalOpsToWorkspace = useCallback(async (args: {
    proposal: PendingAiProposal;
    opsToApply: HearthOp[];
  }) => {
    const episodeId = workpieceId?.trim();
    if (!episodeId || !activeDraft) {
      throw new Error("Select an Episode or Spark to start.");
    }

    let nextDraft: Draft = { ...activeDraft };
    let draftChanged = false;
    let nextPlanningSession = planningSession
      ? { ...planningSession }
      : createPlanningSessionForEpisode(episodeId, workspaceId);
    let planningChanged = false;
    let sourcesChanged = false;
    let saveRequested = false;
    const bodyWasRequested = args.opsToApply.some((op) => op.op === "set_body");

    const opsStore: HearthOpsStore = {
      setTitle: (value) => {
        if (nextDraft.title !== value) {
          nextDraft = { ...nextDraft, title: value };
          draftChanged = true;
        }
        if ((nextPlanningSession.title ?? "") !== value) {
          nextPlanningSession = { ...nextPlanningSession, title: value };
          planningChanged = true;
        }
      },
      setTitleVariant: (slot, value) => {
        const current = nextPlanningSession.title_variants ?? {};
        if ((current[slot] ?? "") === value) return;
        nextPlanningSession = {
          ...nextPlanningSession,
          title_variants: {
            ...current,
            [slot]: value,
          },
        };
        planningChanged = true;
      },
      setOutline: (value) => {
        const nextOutline = parsePlanningLines(value);
        const prevOutline = nextPlanningSession.outline ?? [];
        if (JSON.stringify(prevOutline) === JSON.stringify(nextOutline)) return;
        nextPlanningSession = {
          ...nextPlanningSession,
          outline: nextOutline,
        };
        planningChanged = true;
      },
      setBody: (value) => {
        if (nextDraft.body === value) return;
        const nextScriptAuthoringMeta = args.proposal.autosaveReasonCode === "ai_outline"
          ? deriveOutlineScriptAuthoringMeta({
            scriptText: value,
            currentMeta: nextDraft.scriptAuthoringMeta,
          })
          : args.proposal.autosaveReasonCode === "ai_script"
            ? deriveFullScriptAuthoringMeta({
              scriptText: value,
              currentMeta: nextDraft.scriptAuthoringMeta,
            })
            : nextDraft.scriptAuthoringMeta;
        nextDraft = {
          ...nextDraft,
          body: value,
          scriptAuthoringMeta: nextScriptAuthoringMeta,
        };
        draftChanged = true;
      },
      addSource: async (source) => {
        const created = await sourcesController.commands.addSource({
          title: source.title ?? "Untitled Source",
          type: "webpage",
          url: source.url ?? null,
          notes: source.note ?? null,
        }, { attachToWorkpiece: true });
        if (created) {
          sourcesChanged = true;
        }
      },
      updateSource: async (id, patch) => {
        if (patch.note !== undefined) {
          sourcesController.commands.updateSourceNotes(id, patch.note);
          sourcesChanged = true;
        }
        const updated = await sourcesController.commands.updateSource(id, {
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.url !== undefined ? { url: patch.url } : {}),
          ...(patch.note !== undefined ? { notes: patch.note } : {}),
        });
        if (updated) {
          sourcesChanged = true;
        }
      },
      removeSource: (id) => {
        sourcesController.commands.detachSourceFromWorkpiece(id);
        sourcesChanged = true;
      },
      requestSave: (reason) => {
        saveRequested = reason === "proposal_apply_ops";
      },
    };

    await applyHearthOps(opsStore, args.opsToApply);

    if (!saveRequested) {
      return;
    }

    if (draftChanged) {
      const previousBody = activeDraft.body;
      const now = Date.now();
      const stagedDraft: Draft = { ...nextDraft, updatedAt: now };
      const bodyChanged = previousBody !== stagedDraft.body;
      draftEditVersionRef.current += 1;
      activeDraftRef.current = stagedDraft;
      setActiveDraft((prev) => (prev && prev.id === stagedDraft.id ? stagedDraft : prev));
      setDrafts((prev) => {
        const exists = prev.some((draft) => draft.id === stagedDraft.id);
        const next = exists
          ? prev.map((draft) => (draft.id === stagedDraft.id ? stagedDraft : draft))
          : [stagedDraft, ...prev];
        return dedupeDraftListById(next);
      });
      const effectiveSaveReason: ProposalSaveReasonCode = args.proposal.formatSourceBody !== null
        ? evaluateHearthFormatOnlyPreservation(args.proposal.formatSourceBody, stagedDraft.body).preserved
          ? "format_only"
          : "user_editorial"
        : args.proposal.autosaveReasonCode;
      queueAiAutosave({
        draft: stagedDraft,
        previousBody,
        reasonCode: effectiveSaveReason,
      });
      if (bodyChanged) {
        publishForgeNotice({
          job: "script-completed",
          title: "Script updated",
          severity: "success",
        });
      }
    } else {
      setActiveDraft((prev) => (prev ? nextDraft : prev));
      if (bodyWasRequested) {
        publishForgeNotice({
          job: "script-completed",
          title: "No script changes made",
          severity: "warning",
        });
      }
    }

    if (planningChanged) {
      const nowIso = new Date().toISOString();
      const committedSession: HearthPlanningSession = {
        ...nextPlanningSession,
        workpiece_id: episodeId,
        workspace_id: workspaceId ?? nextPlanningSession.workspace_id ?? null,
        updated_at: nowIso,
      };
      setPlanningSession(committedSession);
      writeHearthPlanningSessionCache(
        committedSession,
        episodeId,
        workspaceId ?? committedSession.workspace_id ?? null,
      );
      setSessionTouched(true);
    }

    if (sourcesChanged) {
      sourcesController.commands.refreshSources();
    }
  }, [
    activeDraft,
    planningSession,
    queueAiAutosave,
    setActiveDraft,
    setDrafts,
    setPlanningSession,
    setSessionTouched,
    sourcesController,
    workpieceId,
    workspaceId,
    publishForgeNotice,
  ]);
  const {
    onApplyAiProposal,
    onDiscardAiProposal: onDiscardAiProposalLocal,
    onToggleAiProposalOp,
    onEditAiProposalBody,
    onResetAiProposalBody,
    isProposalBodyDirtyAt,
  } = useHearthConversationProposal<PendingAiProposal, HearthOp>({
    pendingAiProposal,
    setPendingAiProposal,
    isApplyingAiOps,
    setIsApplyingAiOps,
    setChatError,
    clearProposalUiErrors: () => {
      setScriptValidation(null);
      setError(null);
    },
    getApplyPreconditionError: () => {
      const episodeId = workpieceId?.trim();
      if (!episodeId || !activeDraft) {
        return "Select an Episode or Spark to start.";
      }
      return null;
    },
    validateProposalApply: ({ proposal, opsToApply }) => {
      const bodyWillChange = opsToApply.some((op) => op.op === "set_body");
      if (!bodyWillChange || !activeDraft) {
        return true;
      }
      const projectedBody = findNextBodyFromOps(activeDraft.body, opsToApply);
      const { validation: projectedValidation } = evaluateHearthScriptValidation(projectedBody);
      if (!projectedValidation.ok) {
        setScriptValidation({
          source: "ai_apply",
          result: projectedValidation,
        });
        setError(`Script tags must be valid before approval.\nFix the issues below to continue.\n\n${buildValidationReport(projectedValidation)}`);
      }
      if (!projectedValidation.ok) return false;
      if (proposal.formatSourceBody !== null) {
        return confirmHearthUserEditorialTransition({
          source: proposal.formatSourceBody,
          result: projectedBody,
          action: "apply",
          confirm: (message) => window.confirm(message),
        });
      }
      return true;
    },
    applyProposalOps: ({ proposal, opsToApply }) => applyProposalOpsToWorkspace({ proposal, opsToApply }),
    recordProposalApplied: ({ mode, totalOps, appliedOps, fromGate }) => {
      recordInteractionEvent("proposal_applied", {
        mode,
        total_ops: totalOps,
        applied_ops: appliedOps,
        from_gate: fromGate,
      });
    },
    recordProposalDiscarded: ({ opsCount, fromGate }) => {
      recordInteractionEvent("proposal_discarded", {
        ops_count: opsCount,
        from_gate: fromGate,
      });
    },
    updateProposalBodyOps: (ops, index, value) => updateHearthProposalBodyOp(ops, index, value),
    resetProposalBodyOps: (ops, originalOps, index) => resetHearthProposalBodyOp(ops, originalOps, index),
    isProposalBodyDirty: (ops, originalOps, index) => isHearthProposalBodyOpDirty(ops, originalOps, index),
    updateProposalAfterBodyEdit: (proposal, index, value) => {
      const next = {
        ...proposal,
        ops: updateHearthProposalBodyOp(proposal.ops, index, value),
      };
      return reclassifyHearthFormatProposal(next, value);
    },
    resetProposalAfterBodyEdit: (proposal, index) => {
      const ops = resetHearthProposalBodyOp(proposal.ops, proposal.originalOps, index);
      const bodyOp = ops[index];
      return bodyOp?.op === "set_body"
        ? reclassifyHearthFormatProposal({ ...proposal, ops }, bodyOp.value)
        : { ...proposal, ops };
    },
  });
  const onDiscardAiProposal = useCallback(async () => {
    const persisted = pendingAiProposal?.persistedProposal;
    if (persisted && workspaceId && workpieceId) {
      const rejected = await rejectHearthScriptProposal({
        workspaceId,
        workpieceId,
        proposalId: persisted.proposalId,
      });
      if (!rejected.ok) {
        setChatError(rejected.error);
        return;
      }
    }
    onDiscardAiProposalLocal();
  }, [onDiscardAiProposalLocal, pendingAiProposal, setChatError, workpieceId, workspaceId]);
  const onApproveAiProposalAsScript = useCallback(async () => {
    if (!pendingAiProposal || isApplyingAiOps) return;
    if (!activeDraft) {
      setChatError("Select an Episode or Spark to start.");
      return;
    }
    const persisted = pendingAiProposal.persistedProposal;
    const selectedOps = pendingAiProposal.ops.filter((_, index) => pendingAiProposal.selected[index]);
    const bodyOps = selectedOps.filter((op) => op.op === "set_body");
    if (bodyOps.length === 0) {
      setChatError("Select a proposed draft body before approving.");
      return;
    }

    const normalizedBodyOps = normalizeAiProposalOpsForScriptIngress(bodyOps);
    const nextBody = findNextBodyFromOps(activeDraft.body, normalizedBodyOps);
    if (pendingAiProposal.formatSourceBody !== null) {
      if (!confirmHearthUserEditorialTransition({
        source: pendingAiProposal.formatSourceBody,
        result: nextBody,
        action: "approve",
        confirm: (message) => window.confirm(message),
      })) {
        return;
      }
    }
    if (!persisted) {
      const nextScriptAuthoringMeta = pendingAiProposal.autosaveReasonCode === "ai_outline"
        ? deriveOutlineScriptAuthoringMeta({
          scriptText: nextBody,
          currentMeta: activeDraft.scriptAuthoringMeta,
        })
        : pendingAiProposal.autosaveReasonCode === "ai_script"
          ? deriveFullScriptAuthoringMeta({
            scriptText: nextBody,
            currentMeta: activeDraft.scriptAuthoringMeta,
          })
          : activeDraft.scriptAuthoringMeta;
      const approved = await approveScriptActionRef.current({
        draftOverride: {
          ...activeDraft,
          body: nextBody,
          scriptAuthoringMeta: nextScriptAuthoringMeta,
        },
      });
      if (!approved) return;
      setPendingAiProposal(null);
      publishForgeNotice({
        job: "script-completed",
        title: "Script approved",
        message: "Approved draft replaced the script panel and canonical Anvil handoff.",
        severity: "success",
      });
      return;
    }
    if (!workspaceId || !workpieceId) {
      setChatError("This proposal has no canonical application authority. Reload Hearth before approving it.");
      return;
    }
    setIsApplyingAiOps(true);
    setChatError(null);
    try {
      const begun = await beginHearthScriptProposalApplication({
        workspaceId,
        workpieceId,
        proposalId: persisted.proposalId,
      });
      if (!begun.ok) {
        setChatError(begun.error);
        return;
      }
      const canonicalProposalBody = findNextBodyFromOps(
        activeDraft.body,
        normalizeAiProposalOpsForScriptIngress(begun.data.ops.filter((op) => op.op === "set_body")),
      );
      if (begun.data.proposalId !== persisted.proposalId || canonicalProposalBody !== nextBody) {
        setChatError("The canonical proposal no longer matches the reviewed script. Reload before applying it.");
        return;
      }
      const nextScriptAuthoringMeta = deriveFullScriptAuthoringMeta({
        scriptText: nextBody,
        currentMeta: activeDraft.scriptAuthoringMeta,
      });
      const bodyAlreadyApplied = activeDraft.body === nextBody;
      if (!bodyAlreadyApplied) {
        const saved = await persistDraft({
          draft: { ...activeDraft, body: nextBody, scriptAuthoringMeta: nextScriptAuthoringMeta },
          updatedAt: Date.now(),
          createRevision: null,
          syncSources: false,
          syncSession: true,
          saveReason: `script_proposal:${persisted.proposalId}`,
        });
        if (!saved) {
          setChatError("The proposal was not applied. Its pending card remains available to retry.");
          return;
        }
      }
      const canonicalRevisions = await store.readCanonicalRevisions(workpieceId, activeDraft.id);
      if (!canonicalRevisions.ok) {
        setChatError("The canonical revision history could not be verified. The proposal remains retryable.");
        return;
      }
      if (!canonicalRevisions.revisions.some((revision) => revision.id === begun.data.canonicalRevisionId)) {
        const revision = {
          ...createRevision({
            draftId: activeDraft.id,
            title: activeDraft.title,
            body: nextBody,
            kind: "milestone",
            note: `script_proposal_applied:${persisted.proposalId}`,
          }),
          id: begun.data.canonicalRevisionId,
        };
        const acknowledgement = await store.saveRevision(workpieceId, revision);
        if (!isCanonicalHearthRevisionSave(acknowledgement)) {
          setChatError("The script was saved, but its canonical revision receipt was not. The proposal remains retryable.");
          return;
        }
      }
      const completed = await completeHearthScriptProposalApplication({
        workspaceId,
        workpieceId,
        proposalId: persisted.proposalId,
        canonicalRevisionId: begun.data.canonicalRevisionId,
      });
      if (!completed.ok) {
        setChatError(completed.error);
        return;
      }
      await refreshRevisions(workpieceId, activeDraft.id);
      setPendingAiProposal(null);
      setShowScriptPanel(true);
      publishForgeNotice({
        job: "script-completed",
        title: "Script proposal applied",
        message: "The canonical working script is ready for the existing producer-review and approval steps.",
        severity: "success",
      });
    } finally {
      setIsApplyingAiOps(false);
    }
  }, [
    activeDraft,
    approveScriptActionRef,
    isApplyingAiOps,
    pendingAiProposal,
    persistDraft,
    publishForgeNotice,
    refreshRevisions,
    setChatError,
    setIsApplyingAiOps,
    setPendingAiProposal,
    store,
    workpieceId,
    workspaceId,
  ]);
  const chatWorkspace = useHearthConversationSurface({
    chatSurfaceProps: {
      visible: activeWorkpieceTab === "script",
      chatPanelMeta,
      chatMessages: chatContextHydrated || chatReadinessStatus === "error" ? chatMessages : [],
      chatDraft,
      chatError: chatReadinessStatus === "error" ? chatError : chatAttachmentError ?? chatError,
      aiRuntimeWarning,
      aiCreditsDepleted,
      aiAdmissionBlocked: !aiActionAvailability.showArtifactActions,
      ownerChatCapability,
      hasApprovedScript,
      approvedScriptVersion,
      approvedAtText,
      approvalPersistenceStatus,
      pendingAiProposal,
      dirtyProposalBodyCount,
      isApplyingAiOps,
      isAiProcessing,
      aiEpisodeReady: aiEpisodeReady && chatContextHydrated,
      chatHydrationStatus: chatReadinessStatus,
      sttLane,
      sttTarget,
      sttState,
      hasBrowserSpeech,
      sttPreview,
      sttNotice,
      sttError,
      devMode,
      chatInputRef,
      listeningIndicator: <OscilloscopeFill stream={mediaStreamRef.current} active />,
      onClearChat: () => {
        void clearChatHistoryNow();
      },
      onRetryChatHydration: retryChatHydration,
      onRetryOwnerChatCapability: () => setAiStatusRefreshNonce((current) => current + 1),
      onCopyChat: () => {
        const completeness = store.getChatHistoryCompleteness?.(workpieceId) ?? "legacy_completeness_unknown";
        if (completeness !== "complete") {
          setChatError(completeness === "known_truncated"
            ? "This legacy conversation is known to be truncated, so Hearth cannot label a copy as complete."
            : "This legacy conversation predates complete retention, so its completeness cannot be verified.");
          return;
        }
        const title = activeDraft?.title ?? planningSession?.title ?? "Untitled Episode";
        void writeTextToClipboard(serializeHearthConversation(title, chatMessages)).then((copied) => {
          setChatError(copied ? null : "The conversation could not be copied.");
        });
      },
      onExportChatPdf: () => {
        const completeness = store.getChatHistoryCompleteness?.(workpieceId) ?? "legacy_completeness_unknown";
        if (completeness !== "complete") {
          setChatError(completeness === "known_truncated"
            ? "This legacy conversation is known to be truncated, so Hearth cannot label its PDF as complete."
            : "This legacy conversation predates complete retention, so its completeness cannot be verified.");
          return;
        }
        const title = activeDraft?.title ?? planningSession?.title ?? "Untitled Episode";
        void import("../lib/hearth-conversation-pdf")
          .then(async ({ buildHearthConversationPdf, downloadHearthConversationPdf, sanitizeHearthConversationFilename }) => {
            const bytes = await buildHearthConversationPdf(title, chatMessages);
            downloadHearthConversationPdf(bytes, sanitizeHearthConversationFilename(title));
          })
          .then(() => setChatError(null))
          .catch(() => setChatError("The conversation PDF could not be created."));
      },
      onToggleAiProposalOp,
      onEditAiProposalBody,
      onResetAiProposalBody,
      onApplyAiProposalAll: () => void onApplyAiProposal("all"),
      onApplyAiProposalSelected: () => void onApplyAiProposal("selected"),
      onApproveAiProposalAsScript: () => void onApproveAiProposalAsScript(),
      onDiscardAiProposal,
      writingFormat: selectedWritingFormat,
      writingFormatOptions,
      onSelectWritingFormat: rememberWritingFormat,
      onUseChatShortcutDraft: () => onUseChatShortcut(
        buildWritingFormatShortcutPrompt(selectedWritingFormat),
        selectedWritingFormat === "bullet_outline"
          ? { kind: "generate_outline" }
          : selectedWritingFormat === "full_script"
            ? { kind: "generate_script" }
            : { kind: "conversation" },
      ),
      draftShortcutLabel,
      onUseChatShortcutSources: () => onUseChatShortcut("Find strong sources I should cite for this Episode.", { kind: "research" }),
      onOpenComposeScript,
      onSetSttLane: (lane) => setSttLane(lane),
      onToggleMic: () => onToggleMic("chat"),
      onChatDraftChange: setChatDraft,
      onSendChat: () => void onSendChat(),
      onCancelAiRequest,
      chatAttachments,
      isAttachmentsLoading,
      onPickAttachments: (files) => void onUploadChatAttachments(files),
      onDropAttachments: (files) => void onUploadChatAttachments(files),
      onRemoveAttachment: onRemoveChatAttachment,
      onPasteAttachmentText: (id, text) => void onPasteAttachmentText(id, text),
      describeProposalOp: describeHearthOp,
      getProposalDiff: buildProposalDiff,
      validateProposalBody: (value) => evaluateHearthScriptValidation(value).validation,
      isProposalBodyDirty: isProposalBodyDirtyAt,
      buildValidationReport,
    },
  });
  const conversationController = useHearthConversationController({
    state: {
      messages: chatMessages,
      compose: {
        text: chatDraft,
        modalOpen: composeModalOpen,
      },
      attachments: chatAttachments,
      transcription: {
        lane: sttLane,
        target: sttTarget,
        state: sttState,
        preview: sttPreview,
      },
      proposal: pendingAiProposal,
      runtime: {
        billingMode: aiBillingMode,
        tokenBalance: aiTokenBalance,
        aiEnabled: !aiCreditsDepleted && !ownerChatBlocked,
      },
    },
    commands: {
      updateCompose: setChatDraft,
      submitMessage: onSendChat,
      retryMessage: onSendChat,
      attachFile: async (files) => {
        await onUploadChatAttachments(files);
      },
      removeAttachment: onRemoveChatAttachment,
      startTranscription: async (target) => {
        await onToggleMic(target);
      },
      stopTranscription: onCancelAiRequest,
      requestProposal: onSendChat,
      applyProposal: async () => {
        await onApplyAiProposal("selected");
      },
      rejectProposal: onDiscardAiProposal,
      confirmAiCreditUse: () => !aiCreditsDepleted && !ownerChatBlocked,
    },
    status: {
      history: chatError
        ? "failed"
        : chatMessages.length > 0
          ? "loaded"
          : "empty",
      send: isAiProcessing ? "sending" : chatError ? "failed" : "idle",
      attachments: isAttachmentsLoading
        ? "loading"
        : chatAttachmentError
          ? "failed"
          : "idle",
      transcription: sttState,
      ai: aiCreditsDepleted
        ? "depleted"
        : isAiProcessing
          ? "working"
          : "idle",
    },
    surface: chatWorkspace,
  });
  const activeEpisodeSparks = useMemo(
    () => sparks.filter((spark) => (
      (workpieceId && spark.links?.hearthWorkpieceId === workpieceId)
      || (activeDraft?.id && spark.links?.hearthDraftId === activeDraft.id)
    )),
    [activeDraft?.id, sparks, workpieceId],
  );
  const routeProjectSparks = useMemo(
    () => routeProjectId
      ? sparks
        .filter((spark) => spark.assignmentId === routeProjectId)
        .sort((a, b) => a.createdAt - b.createdAt)
      : [],
    [routeProjectId, sparks],
  );
  const routeProjectLabel = useMemo(
    () => routeProjectTitle?.trim() || (routeProjectId ? `Project ${routeProjectId.slice(0, 8)}` : null),
    [routeProjectId, routeProjectTitle],
  );
  const routeSpark = useMemo(
    () => routeProjectId || !routeSparkId
      ? null
      : sparks.find((spark) => spark.id === routeSparkId) ?? null,
    [routeProjectId, routeSparkId, sparks],
  );
  const deferDesktopRailCollections = !isMobile && mode === "sparks" && !hasActiveEpisode;
  const initialLoadKey = useMemo(() => [
    storeKind,
    incomingBarStockIntakeRoute ? "intake" : "standard",
    normalizeUuid(workspaceId) ?? "none",
    routeProjectId ?? "none",
    routeSparkId ?? "none",
  ].join(":"), [
    incomingBarStockIntakeRoute,
    routeProjectId,
    routeSparkId,
    storeKind,
    workspaceId,
  ]);
  const {
    visibleSparks,
    selectedSpark,
    filteredWorkpieceNavItems,
    readyScriptsForDisplay,
    visibleReadyScriptsForDisplay,
    seriesEntries,
    readyTotalCount,
    removedReadyCount,
    activeReadyScript,
  } = useHearthCollectionViewModel({
    sparks,
    selectedSparkId,
    deferCollections: deferDesktopRailCollections,
    workpieces: workpieceSummaries,
    drafts,
    readyScripts,
    searchText,
    sortKey,
    preferredDraftIdsByWorkpiece,
    showArchived,
    readyScriptsWorkspaceId,
    workspaceId,
    workpieceId,
  });
  const duplicateRailTitleKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of filteredWorkpieceNavItems) {
      const key = normalizeRailTitleKey(item.title);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Set(
      [...counts.entries()]
        .filter(([, count]) => count > 1)
        .map(([key]) => key),
    );
  }, [filteredWorkpieceNavItems]);

  const readyUrgencyCounts = useMemo(() => {
    const counts = { fresh: 0, cooling: 0, cold: 0 };
    const nowMs = Date.now();
    for (const entry of visibleReadyScriptsForDisplay) {
      const urgency = deriveReadyUrgency(entry, nowMs);
      if (!urgency || urgency === "warming") continue;
      counts[urgency] += 1;
    }
    return counts;
  }, [visibleReadyScriptsForDisplay]);

  const orderedReadyScripts = useMemo(() => {
    return visibleReadyScriptsForDisplay;
  }, [visibleReadyScriptsForDisplay]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const scriptText = activeDraft?.body ?? "";
    const detail: HearthHenrySignal = {
      surface: "hearth",
      workspaceId,
      workpieceId,
      hasActiveSpark: activeEpisodeSparks.length > 0,
      hasDraft: scriptText.trim().length > 0,
      tagValidationOk: hearthScriptState?.validation.ok ?? null,
      hasPacingCues: scriptText.trim().length
        ? /\[(?:beat|pause|reflective pause)\]/i.test(scriptText)
        : null,
      isApprovedOrReady: Boolean(hasApprovedScript || activeReadyScript),
      updatedAtIso: new Date().toISOString(),
    };
    window.dispatchEvent(new CustomEvent<HearthHenrySignal>(HENRY_HEARTH_SIGNAL_EVENT, { detail }));
  }, [
    activeDraft?.body,
    activeEpisodeSparks.length,
    activeReadyScript,
    hasApprovedScript,
    hearthScriptState?.validation.ok,
    workpieceId,
    workspaceId,
  ]);
  const activeEpisodeReadyStatus = useMemo(() => {
    if (activeWorkpieceIsArchived) {
      return {
        tone: "archived" as const,
        label: "Archived",
        detail: activeWorkpiece?.archiveReason
          ? `Archive reason: ${activeWorkpiece.archiveReason}`
          : "Restore this episode before it can return to Ready.",
      };
    }
    if (activeReadyScript) {
      return {
        tone: "ready" as const,
        label: "Ready",
        detail: resolveReadyAttribution(activeReadyScript),
      };
    }
    if (hasApprovedScript && approvedScriptVersion) {
      return {
        tone: "pending" as const,
        label: "Script Approved",
        detail: scriptApprovalState.approvedAt
          ? `Script v${approvedScriptVersion} approved ${formatRelativeUpdatedAt(scriptApprovalState.approvedAt)}, but it has not entered the canonical Ready queue.`
          : `Script v${approvedScriptVersion} approved, but it has not entered the canonical Ready queue.`,
      };
    }
    return {
      tone: "pending" as const,
      label: "Not Ready",
      detail: "Approve the exact production-valid script, then explicitly Mark Ready.",
    };
  }, [
    activeReadyScript,
    activeWorkpiece?.archiveReason,
    activeWorkpieceIsArchived,
    approvedScriptVersion,
    hasApprovedScript,
    resolveReadyAttribution,
    scriptApprovalState.approvedAt,
  ]);
  const episodeWorkspaceReadModel = useMemo(() => {
    const episodeId = workpieceId?.trim() ?? "";
    const title = activeWorkpiece?.title?.trim() ?? "";
    if (!episodeId || !title) return null;
    return {
      episodeId,
      title,
      phase: "script",
      displayStatus: activeWorkpieceIsArchived
        ? "draft"
        : activeReadyScript
        ? "ready"
        : hasApprovedScript
        ? "scripted"
        : "draft",
    } satisfies EpisodeWorkspaceReadModel;
  }, [activeReadyScript, activeWorkpiece?.title, activeWorkpieceIsArchived, hasApprovedScript, workpieceId]);

  useEffect(() => {
    onEpisodeReadModelChange?.(episodeWorkspaceReadModel);
  }, [episodeWorkspaceReadModel, onEpisodeReadModelChange]);

  useEffect(() => {
    const nextEpisodeId = hasActiveEpisode && (isLoading || isWorkpiecesLoading) && !episodeWorkspaceReadModel
      ? workpieceId ?? null
      : null;
    onEpisodeContextLoadingChange?.(nextEpisodeId);
  }, [
    episodeWorkspaceReadModel,
    hasActiveEpisode,
    isLoading,
    isWorkpiecesLoading,
    onEpisodeContextLoadingChange,
    workpieceId,
  ]);
  const metadataTagSuggestions = useHearthMetadataTagSuggestions({
    currentTags: metadataTagsDraft,
    contentCategory: activeReadyScript?.contentCategory ?? null,
    bodyText: activeDraft?.body ?? "",
    titles: metadataTitlesDraft,
  });
  const diffLines = useMemo(() => {
    if (!selectedRevision || !activeDraft) return [];
    return buildDiffLines(activeDraft.body, selectedRevision.bodySnapshot);
  }, [activeDraft, selectedRevision]);

  useEffect(() => {
    activeDraftRef.current = activeDraft;
  }, [activeDraft]);

  useHearthActiveIdentityRefSync(workpieceIdRef, workpieceId);

  useEffect(() => {
    draftSnapshotRef.current = draftSnapshot;
  }, [draftSnapshot]);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    workpieceSummariesRef.current = workpieceSummaries;
  }, [workpieceSummaries]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    let requestSequence = 0;

    const syncAiRuntime = async () => {
      const sequence = ++requestSequence;
      const lane = resolveAiLaneFromStorage();
      const visualProvider = resolveDefaultVisualProviderFromStorage();
      if (!cancelled) {
        setAiBillingMode(lane);
        setDefaultVisualProvider(visualProvider);
        setOwnerChatCapability({ status: "checking", reasonCode: null });
        if (lane === "byo") {
          setAiTokenBalance(null);
        }
      }

      const status = await fetchHearthAiStatus(workspaceId);
      if (cancelled || sequence !== requestSequence) return;
      if (!status.runtime) return;
      setOwnerChatCapability(status.runtime.ownerChatCapability ?? {
        status: "unknown",
        reasonCode: "owner_controls_unavailable",
      });
      if (lane === "byo") {
        setAiTokenBalance(null);
      } else {
        setAiTokenBalance(status.runtime.tokenBalance);
      }
    };

    void syncAiRuntime();

    const onAiSettingsChange = () => {
      setLastTurnResult((current) => current?.validation.failureKind === "admission_failure" ? null : current);
      void syncAiRuntime();
    };
    const onStorage = (event: StorageEvent) => {
      if (
        event.key
        && event.key !== "forge:hearth:aiSettings:v1"
        && event.key !== FORGE_AUTH_STORAGE_KEY
        && !SUPABASE_AUTH_KEY_RE.test(event.key)
      ) return;
      setLastTurnResult((current) => current?.validation.failureKind === "admission_failure" ? null : current);
      void syncAiRuntime();
    };

    const unsubscribeFromAuth = subscribeToForgeUserAccessToken(() => void syncAiRuntime());
    window.addEventListener("forge:ai:settings", onAiSettingsChange as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      unsubscribeFromAuth();
      window.removeEventListener("forge:ai:settings", onAiSettingsChange as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, [aiStatusRefreshNonce, workspaceId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const refresh = () => {
      if (cancelled) return;
      const greeting = readGreetingNameFromStorage();
      const userId = readAuthUserIdFromStorage();
      setForgeGreetingName(greeting);
      setHearthUser({
        userId,
        displayName: greeting,
      });
    };

    refresh();

    const runtimeWindow = window as typeof window & {
      __forge_supabase_client__?: {
        auth?: {
          getSession?: () => Promise<unknown>;
        };
      };
    };
    const runtimeClient = runtimeWindow.__forge_supabase_client__;
    const getSession = runtimeClient?.auth?.getSession;
    if (typeof getSession === "function") {
      void getSession().then(async (payload) => {
        if (cancelled) return;
        const userId = pickUserIdFromAuthPayload(payload);
        const profileName = userId
          ? await readProfileDisplayNameFromRuntimeClient(runtimeClient, userId)
          : null;
        if (cancelled) return;
        const fallbackName = pickDisplayNameFromAuthPayload(payload);
        const normalizedName = normalizeGreetingName(profileName ?? fallbackName);
        setForgeGreetingName(normalizedName);
        setHearthUser({
          userId,
          displayName: normalizedName,
        });
      }).catch(() => {
        // ignore auth session lookup failures
      });
    }

    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === FORGE_AUTH_STORAGE_KEY || SUPABASE_AUTH_KEY_RE.test(event.key)) {
        refresh();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    writeHearthAiRuntimeStatus({
      isAiProcessing: aiRuntimeBusy,
      tokenBalance: aiTokenBalance,
      billingMode: aiBillingMode,
      ownerChatCapability,
    });
  }, [aiBillingMode, aiRuntimeBusy, aiTokenBalance, ownerChatCapability]);

  useEffect(() => {
    return () => {
      aiRequestControllerRef.current?.abort();
      try {
        speechRecognitionRef.current?.stop();
      } catch {
        // ignore stop errors during teardown
      }
      speechRecognitionRef.current = null;
      writeHearthAiRuntimeStatus({ isAiProcessing: false });
    };
  }, []);

  useEffect(() => {
    if (!aiRuntimeWarning) return;
    const timer = window.setTimeout(() => setAiRuntimeWarning(null), 4000);
    return () => window.clearTimeout(timer);
  }, [aiRuntimeWarning]);

  const refreshWorkpieces = useHearthWorkpieceCollectionLoader({
    workspaceId,
    workpieceId,
    showArchived,
    operationAuthority,
    workpieceSummariesRef,
    setWorkpieceSummaries,
    setIsWorkpiecesLoading,
    setWorkpiecesError,
  });

  const refreshDrafts = useCallback(async (loadGuard?: HearthLoadGuard): Promise<Draft[]> => {
    loadGuard?.assertCurrent();
    const list = dedupeDraftListById(await store.listDrafts(loadGuard));
    loadGuard?.assertCurrent();
    draftsRef.current = list;
    setDrafts(list);
    return list;
  }, [store]);

  const resolveWorkpieceIdForDraftId = useCallback((
    draftId: string | null | undefined,
    options?: {
      drafts?: readonly Draft[];
      workpieces?: readonly HearthWorkpieceSummary[];
    },
  ): string | null => {
    const candidateDraftId = readTrimmedString(draftId);
    if (!candidateDraftId) return null;
    if (workpieceId && activeDraft?.id === candidateDraftId) {
      return workpieceId;
    }

    const availableWorkpieces = options?.workpieces ?? workpieceSummariesRef.current;
    const availableDrafts = options?.drafts ?? draftsRef.current;

    const directWorkpieceId = normalizeUuid(candidateDraftId);
    if (directWorkpieceId && availableWorkpieces.some((entry) => entry.workpieceId === directWorkpieceId)) {
      return directWorkpieceId;
    }

    for (const workpiece of availableWorkpieces) {
      const match = selectDraftForWorkpiece({
        workpieceId: workpiece.workpieceId,
        drafts: availableDrafts,
        sparks,
        preferredDraftId: candidateDraftId,
      });
      if (match?.id === candidateDraftId) {
        return workpiece.workpieceId;
      }
    }

    return null;
  }, [activeDraft?.id, sparks, workpieceId]);

  const refreshEpisodePackage = useEpisodePackageLoader({
    operationAuthority,
    workpieceId,
    resetReleasePrepState,
    setEpisodePackage,
    setEpisodePackageState,
    setEpisodePackageError,
    setRecoverableMediaMap,
    setImageMapMetadataUpdatedAt,
    setImageMapProjectionLoaded,
    setSelectedThumbnailTitleId,
    setSelectedThumbnailConceptId,
    setSelectedThumbnailVersionId,
    setSelectedLaunchVariantId,
    setSelectedMediaMapEntryId,
    setSelectedImageMapEntryId,
    setSelectedBrollBeatId,
    setSelectedReferenceClipEntryId,
    setThumbnailGenerateError,
    setThumbnailUploadError,
    setThumbnailPairingError,
    setThumbnailPreviewState,
    setThumbnailPreviewDataUrl,
    setThumbnailPreviewError,
    setImageMapSaveState,
    setImageMapSaveError,
    setImageMapExportMessage,
    setMediaMapSaveState,
    setMediaMapSaveError,
    setMediaMapMessage,
    setBrollSaveState,
    setBrollSaveError,
    setBrollMessage,
    setReferenceClipSaveState,
    setReferenceClipSaveError,
    setReferenceClipMessage,
  });

  const refreshUnifiedVisualPlanRecoveryReadback = useCallback(async () => {
    await Promise.all([refreshEpisodePackage(), canonicalBrollV2.refresh(), refreshCanonicalReferenceClips(), refreshCanonicalReferenceVisuals()]);
    window.dispatchEvent(new CustomEvent("forge:canonical-reference-clips-changed", { detail: { workspaceId, workpieceId } }));
  }, [canonicalBrollV2.refresh, refreshCanonicalReferenceClips, refreshCanonicalReferenceVisuals, refreshEpisodePackage, workspaceId, workpieceId]);
  const unifiedVisualPlanRecovery = useUnifiedVisualPlanRecovery({
    workspaceId,
    workpieceId,
    hasApprovedScript,
    setBusy: setIsMediaMapBusy,
    setSaveState: setMediaMapSaveState,
    setMessage: setMediaMapMessage,
    setError: setMediaMapSaveError,
    setOperationState: setUnifiedVisualPlanOperationState,
    refresh: refreshUnifiedVisualPlanRecoveryReadback,
  });

  const { refreshReadyScripts } = useHearthReadyCollectionLifecycle({
    workspaceId,
    setReadyScripts,
    setReadyScriptsWorkspaceId,
    setReadyScriptsError,
    setIsReadyScriptsLoading,
  });
  const setScriptValidationGateResult = useCallback((validation: ScriptValidationResult) => {
    setScriptValidation({
      source: "save_gate",
      result: validation,
    });
  }, []);
  const {
    persistApprovedDraft,
    publishApprovedScript,
    readCanonicalApprovalRevisions,
    commitCanonicalApprovalRevision,
    appendApprovalMarker,
  } = useHearthScriptApprovalPersistenceActions({
    persistDraft,
    validatorVersion: SCRIPT_TAG_VALIDATOR_VERSION,
    chatHistoryMaxMessages: CHAT_HISTORY_MAX_MESSAGES,
    flushChatHistoryNow,
    setChatMessages,
    readCanonicalRevisions: (episodeId, draftId) => store.readCanonicalRevisions(episodeId, draftId),
    saveRevision: (episodeId, revision) => store.saveRevision(episodeId, revision),
    refreshRevisions,
  });
  const onReviewForRecording = useCallback(async () => {
    if (!workspaceId || !workpieceId || !activeDraft || isReviewingPreflight || isSaving || isAiProcessing) return false;
    if (!activeDraft.body.trim()) { setPreflightError("Add script content before running the optional script check."); return false; }
    setIsReviewingPreflight(true);
    setPreflightError(null);
    try {
      const { commitHearthPreflight, readCanonicalHearthResearch } = await import("../lib/hearth-research-preflight-authority");
      const published = await publishApprovedScript({ episodeId: workpieceId, scriptText: activeDraft.body });
      if (!published) throw new Error("The working script could not be saved to canonical Tongs storage for the optional check.");
      const research = await readCanonicalHearthResearch({ workspaceId, workpieceId });
      const authority = await commitHearthPreflight({ workspaceId, workpieceId, scriptText: activeDraft.body, research });
      setPreflightAuthority(authority);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Optional script check failed.";
      setPreflightError(message);
      return false;
    } finally {
      setIsReviewingPreflight(false);
    }
  }, [activeDraft, isAiProcessing, isReviewingPreflight, isSaving, publishApprovedScript, workpieceId, workspaceId]);

  const onHandlePreflightFinding = useCallback(async (findingId: string, action: "acknowledge" | "resolve") => {
    if (!workspaceId || !workpieceId || !preflightAuthority) return;
    const finding = preflightAuthority.findings.find((entry) => entry.id === findingId);
    if (!finding) return;
    setPreflightError(null);
    try {
      const { decideHearthPreflightFinding, readCurrentHearthPreflight } = await import("../lib/hearth-research-preflight-authority");
      await decideHearthPreflightFinding({ workspaceId, workpieceId, reportId: preflightAuthority.id, finding, action });
      setPreflightAuthority(await readCurrentHearthPreflight({ workspaceId, workpieceId }));
    } catch (error) {
      setPreflightError(error instanceof Error ? error.message : "The optional script-check note was not saved.");
    }
  }, [preflightAuthority, workpieceId, workspaceId]);

  const onCompletePreflightReview = useCallback(async () => {
    if (!workspaceId || !workpieceId || !preflightAuthority) return;
    setPreflightError(null);
    try {
      const { completeHearthPreflightReview, readCurrentHearthPreflight } = await import("../lib/hearth-research-preflight-authority");
      await completeHearthPreflightReview({ workspaceId, workpieceId, reportId: preflightAuthority.id });
      setPreflightAuthority(await readCurrentHearthPreflight({ workspaceId, workpieceId }));
    } catch (error) {
      setPreflightError(error instanceof Error ? error.message : "Optional script-review status was not saved.");
    }
  }, [preflightAuthority, workpieceId, workspaceId]);
  const {
    isApprovingScript,
    isMarkingReady,
    onApproveScript,
    onMarkReady,
  } = useHearthScriptApprovalFlow({
    operationAuthority,
    activeDraft,
    workpieceId,
    workspaceId,
    isSaving,
    isAiProcessing,
    setError,
    setChatError,
    setAiRuntimeWarning,
    setApprovalPersistenceStatus,
    setScriptValidationGateResult,
    clearScriptValidation,
    evaluateScriptValidation,
    buildValidationReport,
    buildPersistedValidationMeta,
    nextApprovedScriptVersion,
    persistApprovedDraft,
    readCanonicalApprovalRevisions,
    commitCanonicalApprovalRevision,
    mirrorApprovedScript: async (params) => mirrorApprovedScriptToLocal({
      workspaceId: params.workspaceId,
      workpieceId: params.workpieceId,
      scriptPath: getHearthPrimaryScriptPath(),
      scriptText: params.scriptText,
    }),
    graduateLinkedSpark,
    setScriptApprovalState,
    writeScriptApprovalRecoveryEvidence,
    updateStyleProfileFromReadyCheckpoint,
    appendApprovalMarker,
    refreshReadyScripts,
    approvedScriptVersion,
    approvedAt: scriptApprovalState.approvedAt,
  });
  approveScriptActionRef.current = onApproveScript;
  useHearthBrollCoreCommands({
    operationAuthority,
    isApprovingScript,
    isAiProcessing,
    isBrollBusy,
    episodePackage,
    workpieceId,
    selectedBrollBeat,
    brollMotionIntentDraft,
    brollDescriptionDraft,
    brollAnchorDraft,
    brollAssetCategoryDraft,
    brollPriorityDraft,
    brollKeywordsDraft,
    brollMoodDraft,
    brollShotTypeDraft,
    brollMotionSuggestionDraft,
    brollSuggestedDurationDraft,
    brollPlacementHintDraft,
    brollProviderIdDraft,
    brollSourceUrlDraft,
    brollProviderNoteDraft,
    brollUsageNoteDraft,
    brollResultMetadataDraft,
    setIsBrollBusy,
    setBrollSaveState,
    setBrollSaveError,
    setBrollMessage,
    setSelectedBrollBeatId,
    readCanonicalScriptForImageMapGeneration,
    resolveBrollDataVisualSpecFromDraft,
    persistBrollPlan,
  });
  const {
    onDownloadBrollBrief,
  } = useHearthBrollBridgeCommands({
    operationAuthority,
    episodePackage,
    selectedBrollBeat,
    brollProviders,
    brollProviderIdDraft,
    brollSourceUrlDraft,
    brollSourceLabelDraft,
    brollProviderNoteDraft,
    brollUsageNoteDraft,
    brollResultMetadataDraft,
    brollAnchorDraft,
    brollDescriptionDraft,
    brollKeywordsDraft,
    brollMotionIntentDraft,
    brollAssetCategoryDraft,
    brollMoodDraft,
    brollDataVisualSpecFromDraft: resolveBrollDataVisualSpecFromDraft,
    workpieceId,
    activeDraftTitle: activeDraft?.title ?? null,
    isBrollBusy,
    setIsBrollBusy,
    setBrollSaveState,
    setBrollSaveError,
    setBrollMessage,
    writeTextToClipboard,
    downloadTextFile,
    persistBrollPlan,
  });
  const {
    onCreateReferenceClipEntry,
    onSaveReferenceClipEntry,
    onDeleteReferenceClipEntry,
    onGenerateReferenceClipInForge,
    onRegenerateReferenceClipEntryStub,
  } = useHearthReferenceClipsCoreCommands({
    operationAuthority,
    episodePackage,
    workpieceId,
    workspaceId,
    activeDraftTitle: activeDraft?.title ?? null,
    selectedImageMapEntry,
    selectedBrollBeatAnchorText: selectedBrollBeat?.anchor_text ?? null,
    selectedReferenceClipEntry,
    isReferenceClipBusy,
    referenceClipFormatDraft,
    referenceClipAnchorDraft,
    referenceClipDescriptionDraft,
    referenceClipPlacementHintDraft,
    referenceClipDataTypeDraft,
    referenceClipContextTypeDraft,
    referenceClipToneDraft,
    referenceClipMotionLevelDraft,
    referenceClipBackgroundContextDraft,
    referenceClipForegroundDataDraft,
    referenceClipVisualStyleDraft,
    referenceClipChartTypeDraft,
    referenceClipTitleDraft,
    referenceClipLabelsDraft,
    referenceClipEmphasisKeyDraft,
    referenceClipSourceTypeDraft,
    referenceClipProviderIdDraft,
    referenceClipSourceUrlDraft,
    referenceClipProviderNoteDraft,
    referenceClipUsageNoteDraft,
    referenceClipResultMetadataDraft,
    resolveReferenceClipValuesFromDraft,
    setIsReferenceClipBusy,
    setReferenceClipSaveState,
    setReferenceClipSaveError,
    setReferenceClipMessage,
    setSelectedReferenceClipEntryId,
    persistReferenceClipPlan,
    persistImageMapEntries,
    readCanonicalScriptForImageMapGeneration,
  });
  const {
    onCopyReferenceClipPrompt,
    onCopyReferenceClipNegativePrompt,
    onDownloadReferenceClipPromptPack,
    onDownloadReferenceClipBrief,
    onOpenReferenceClipProvider,
    onMarkReferenceClipRequestState,
    onClearReferenceClipRequestState,
    onAttachReferenceClipResultFromUrl,
    onUploadReferenceClipAsset,
    onSelectReferenceClipCandidate,
  } = useHearthReferenceClipsBridgeCommands({
    operationAuthority,
    episodePackage,
    selectedReferenceClipEntry,
    activeVisualPromptPackForReferenceClip,
    referenceClipProviders,
    referenceClipProviderIdDraft,
    referenceClipSourceUrlDraft,
    referenceClipSourceLabelDraft,
    referenceClipProviderNoteDraft,
    referenceClipUsageNoteDraft,
    referenceClipResultMetadataDraft,
    referenceClipAnchorDraft,
    referenceClipDescriptionDraft,
    referenceClipTitleDraft,
    workpieceId,
    activeDraftTitle: activeDraft?.title ?? null,
    isReferenceClipBusy,
    setIsReferenceClipBusy,
    setReferenceClipSaveState,
    setReferenceClipSaveError,
    setReferenceClipMessage,
    writeTextToClipboard,
    downloadTextFile,
    persistReferenceClipPlan,
  });
  const {
    onCreateThumbnailConcept,
    onSaveSelectedThumbnailConcept,
    onDeleteSelectedThumbnailConcept,
    onSetPrimaryThumbnailVersion,
    onSelectThumbnailTitle,
    onSelectThumbnailVersion,
    onCreateLaunchVariant,
    onSelectLaunchVariant,
    onSaveLaunchVariant,
  } = useHearthThumbnailConceptCommands({
    operationAuthority,
    episodePackage,
    thumbnailVersions,
    launchVariants,
    metadataTitlesDraft,
    selectedThumbnailTitleId,
    selectedThumbnailConceptId,
    selectedThumbnailVersionId,
    selectedLaunchVariantId,
    thumbnailConceptLabelDraft,
    thumbnailConceptPromptDraft,
    thumbnailConceptStyleDraft,
    thumbnailTitleStyleDraft,
    thumbnailConceptBrandTemplateIdDraft,
    launchVariantStatusDraft,
    launchVariantNotesDraft,
    defaultThumbnailBrandTemplateId,
    isThumbnailConceptSaving,
    isThumbnailGenerating,
    isThumbnailUploading,
    createThumbnailClientId,
    normalizeVisualStyle: normalizeHearthVisualStyle,
    normalizeThumbnailTitleStyle: normalizeEpisodeThumbnailTitleStyle,
    persistThumbnailEpisodePackage,
    setIsThumbnailConceptSaving,
    setSelectedThumbnailTitleId,
    setSelectedThumbnailConceptId,
    setSelectedThumbnailVersionId,
    setSelectedLaunchVariantId,
    setThumbnailGenerateError,
    setThumbnailPairingError,
  });
  const {
    onRetryFailedThumbnailVersion,
    onUploadThumbnailBrandLogo,
    onRemoveThumbnailBrandLogo,
    onUploadThumbnailImage,
  } = useHearthThumbnailGenerationCommands({
    operationAuthority,
    workpieceId,
    workspaceId,
    episodePackage,
    selectedThumbnailConceptId,
    selectedThumbnailBrandTemplate,
    defaultThumbnailBrandTemplateId,
    thumbnailAspect,
    isAiProcessing,
    isApprovingScript,
    isThumbnailGenerating,
    isThumbnailUploading,
    isThumbnailConceptSaving,
    aiBillingMode,
    aiTokenBalance,
    persistThumbnailEpisodePackage,
    replaceEpisodePackageImageMap,
    createThumbnailClientId,
    setEpisodePackage,
    setSelectedThumbnailConceptId,
    setSelectedThumbnailVersionId,
    setThumbnailBrandTemplates,
    setImageMapMetadataUpdatedAt,
    setAiTokenBalance,
    setAiRuntimeWarning,
    setIsThumbnailGenerating,
    setIsThumbnailUploading,
    setIsThumbnailBrandLogoUploading,
    setThumbnailGenerateError,
    setThumbnailUploadError,
    setThumbnailBrandLogoError,
    setThumbnailBrandLogoStatus,
    setThumbnailBrandLogoDataUrl,
    publishForgeNotice,
  });
  const {
    onStartImageMapReanchor,
    onCancelImageMapReanchor,
    onPickImageMapReanchor,
    onRepairImageMapNearestParagraph,
    onConvertImageMapToGlobalVisual,
    onLeaveImageMapOrphaned,
  } = useHearthImageMapReanchorCommands({
    operationAuthority,
    episodePackage,
    selectedImageMapEntry,
    imageMapReanchorDisabledReason,
    isImageMapReanchorSaving,
    canonicalImageMapScriptState,
    persistImageMapEntries,
    repairCanonicalImageMap: async () => {
      if (!workpieceId || !workspaceId || !episodePackage || !selectedImageMapEntry) return { ok: false as const, error: missingImageMapContextError };
      const { repairWorkpieceImageMapAuthority } = await import("../lib/hearth-image-map-authority");
      const repaired = await repairWorkpieceImageMapAuthority({ workpieceId, workspaceId, entryId: selectedImageMapEntry.id });
      if (!repaired.ok) return { ok: false as const, error: repaired.error ?? "Tongs could not repair the image map." };
      applyCanonicalImageMap({
        entries: repaired.imageMap.entries,
        spokenBeats: repaired.imageMap.spokenBeats,
        metadataUpdatedAt: repaired.imageMap.metadataUpdatedAt,
      });
      return { ok: true as const };
    },
    resolveManualCanonicalAnchor: async (entryId, scriptAnchor) => {
      if (!workpieceId || !workspaceId || !episodePackage) return { ok: false as const, error: missingImageMapContextError };
      const { resolveWorkpieceImageMapManualAnchorAuthority } = await import("../lib/hearth-image-map-authority");
      const resolved = await resolveWorkpieceImageMapManualAnchorAuthority({ workpieceId, workspaceId, entryId, scriptAnchor });
      if (!resolved.ok) return { ok: false as const, error: resolved.error ?? "Tongs could not resolve the anchor." };
      applyCanonicalImageMap({
        entries: resolved.imageMap.entries,
        spokenBeats: resolved.imageMap.spokenBeats,
        metadataUpdatedAt: resolved.imageMap.metadataUpdatedAt,
      });
      return { ok: true as const };
    },
    setMode,
    setShowManualDraft,
    setShowScriptPanel,
    setImageMapReanchorError,
    setImageMapCandidateError,
    setImageMapCandidateSelectionError,
    setIsImageMapReanchorMode,
    setIsImageMapReanchorSaving,
    setImageMapSaveState,
    setImageMapSaveError,
    setImageMapExportMessage,
  });
  const missingImageMapContextError = "Select an episode in an active workspace.";
  const resetImageWorkspaceScroll = useCallback(() => {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("[data-hearth-image-workspace]")?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
    });
  }, []);
  const applyCanonicalImageMap = (next: {
    entries: EpisodePackageV2["image_map"]["entries"];
    spokenBeats: EpisodePackageV2["spoken_beats"];
    metadataUpdatedAt: string | null;
  }) => {
    if (!episodePackage) return;
    setEpisodePackage(replaceEpisodePackageImageMap(episodePackage, next.entries, next.spokenBeats));
    setImageMapMetadataUpdatedAt(next.metadataUpdatedAt);
  };
  const {
    onGenerateImageMapCandidates,
    onSelectImageMapCandidate,
    onUploadImageMapAsset,
    onUploadImageMapGenerationReference,
    onRemoveImageMapGenerationReference,
  } = useHearthImageCandidateCommands({
    operationAuthority,
    workpieceId,
    workspaceId,
    episodePackage,
    selectedImageMapEntry,
    canonicalPromptRevision: imagePromptAuthority.state.revision,
    thumbnailAspect,
    imageMapSaveState,
    imageMapMetadataUpdatedAt,
    isAiProcessing,
    isApprovingScript,
    isImageMapCandidateGenerating,
    aiBillingMode,
    aiTokenBalance,
    readCanonicalScriptForImageMapGeneration,
    replaceEpisodePackageImageMap,
    persistImageMapEntries,
    setMode,
    setShowManualDraft,
    setShowScriptPanel,
    setIsImageMapReanchorMode,
    setImageMapSourceTypeDraft,
    setEpisodePackage,
    setImageMapMetadataUpdatedAt,
    setAiTokenBalance,
    setAiRuntimeWarning,
    setIsImageMapCandidateGenerating,
    setIsImageMapCandidateSelecting,
    setImageMapCandidateError,
    setImageMapCandidateSelectionError,
    setImageMapExportMessage,
    setSelectedImageMapEntryId,
    resetImageWorkspaceScroll,
    publishForgeNotice,
  });
  const {
    onCreateImageMapEntry,
    onDuplicateImageMapEntry,
    onDeleteImageMapEntry,
  } = useHearthImageEntryCommands({
    operationAuthority,
    episodePackage,
    selectedImageMapEntry,
    selectedImageMapEntryId,
    persistImageMapEntries,
    setSelectedImageMapEntryId,
    setImageMapSaveState,
    setImageMapSaveError,
  });
  const {
    onSeedImageMapFromScript,
    onCopyImageMapExportJson,
    onDownloadImageMapExportJson,
  } = useHearthImageSeedExportCommands({
    operationAuthority,
    workpieceId,
    episodePackage,
    selectedImageMapEntryId,
    effectiveComposeSetupMode: effectiveComposeSetup?.mode ?? null,
    imageMapSaveState,
    imageMapAnchorDraft,
    imageMapDescriptionDraft,
    imageMapStyleDraft,
    imageMapIntentDraft,
    imageMapSourceTypeDraft,
    imageMapAnchorScopeDraft,
    imageMapVisualPriorityDraft,
    imageMapVisualTypeDraft,
    imageMapSectionIntentNoteDraft,
    imageMapPlacementHintDraft,
    normalizeVisualStyle: normalizeHearthVisualStyle,
    readCanonicalScriptForImageMapGeneration,
    persistImageMapEntries,
    writeTextToClipboard,
    setImageMapSaveState,
    setImageMapSaveError,
    setSelectedImageMapEntryId,
    setImageMapExportMessage,
  });
  const {
    onToggleVisualScriptMode,
  } = useHearthImageMapViewCommands({
    hasApprovedScript,
    approvedScriptVersion,
    isImageMapReanchorSaving,
    selectedImageMapEntryId,
    setMode,
    setShowManualDraft,
    setShowScriptPanel,
    setIsVisualScriptMode,
    setIsImageMapReanchorMode,
    setIsImageMapReanchorSaving,
    setImageMapReanchorError,
    setSelectedImageMapEntryId,
  });

  useEffect(() => {
    setReadyScripts([]);
    setReadyScriptsWorkspaceId(null);
    setReadyScriptsError(null);
  }, [workspaceId]);

  useEffect(() => {
    if (deferDesktopRailCollections) return;
    void refreshWorkpieces();
  }, [deferDesktopRailCollections, refreshWorkpieces]);

  useEffect(() => {
    if (deferDesktopRailCollections) return;
    void refreshReadyScripts();
  }, [deferDesktopRailCollections, refreshReadyScripts]);

  useHearthResponsiveNavigationLifecycle({
    isMobile,
    mobileOverlayView,
    mode,
    activeDraft,
    workspaceId,
    setMobileOverlayView,
  });

  useHearthPresenceLifecycle({
    workspaceId,
    workpieceId,
    mode: localPresenceMode,
    displayName: activeUserDisplayName,
    heartbeatMs: PRESENCE_HEARTBEAT_MS,
    operationAuthority,
    normalizeUuid,
    setParticipants: setPresenceRows,
    setConnection: setPresenceState,
    acceptUserId: (userId) => {
      setHearthUser((previous) => (
        previous.userId === userId ? previous : { ...previous, userId }
      ));
    },
  });

  useEffect(() => {
    void refreshEpisodePackage();
  }, [refreshEpisodePackage]);

  const {
    onSetReadyScriptCategory,
    onRemoveFromReady,
    onRestoreRemovedReady,
    onReorderReady,
  } = useHearthCollectionReadyQueueActions({
    workspaceId,
    normalizeUuid,
    readyScriptsForDisplay,
    removingReadyIds,
    isRestoringReady,
    hearthUserId: hearthUser.userId,
    reorderVisibleReadyEntries,
    setReadyScripts,
    setReadyScriptsError,
    setReadyCategoryError,
    setUpdatingReadyCategoryId,
    setRemovingReadyIds,
    setIsRestoringReady,
    refreshReadyScripts,
  });

  const onReadyLabelChange = useCallback((entry: HearthReadyScript, label: ReadyLabel) => {
    const category = READY_LABEL_TO_CATEGORY[label] ?? "evergreen";
    void onSetReadyScriptCategory(entry, category);
  }, [onSetReadyScriptCategory]);

  const persistSession = useCallback(async (draftId: string | null, uiSelectedTab?: string, loadGuard?: HearthLoadGuard) => {
    loadGuard?.assertCurrent();
    const now = Date.now();
    const base: HearthSession = session ?? {
      id: "default",
      createdAt: now,
      updatedAt: now,
    };
    const next: HearthSession = {
      ...base,
      activeDraftId: draftId ?? undefined,
      activeWorkpieceId: workpieceId ?? undefined,
      lastOpenedAt: now,
      updatedAt: now,
      uiState: {
        splitPane: mode === "focus" && focusTab === "revisions",
        selectedTab: uiSelectedTab ?? base.uiState?.selectedTab,
        cursorPosition: cursorPosition ?? base.uiState?.cursorPosition,
        scrollTop: scrollTop ?? base.uiState?.scrollTop,
      },
    };
    setSession(next);
    await sessionStore.saveSession(next);
  }, [cursorPosition, focusTab, mode, scrollTop, session, sessionStore, workpieceId]);

  const selectDraft = useCallback(async (
    draft: Draft | null,
    options?: { revisionWorkpieceId?: string | null; loadGuard?: HearthLoadGuard },
  ) => {
    options?.loadGuard?.assertCurrent();
    setDraftConflictState(null);
    if (!draft) {
      restoredCursorDraftIdRef.current = null;
      setActiveDraft(null);
      setDraftSnapshot(null);
      setRevisions([]);
      setSelectedRevision(null);
      return;
    }
    restoredCursorDraftIdRef.current = null;
    setActiveDraft(draft);
    setDraftSnapshot({ title: draft.title, body: draft.body, updatedAt: draft.updatedAt });
    await refreshRevisions(resolveRevisionWorkpieceId(options?.revisionWorkpieceId), draft.id, options?.loadGuard);
    options?.loadGuard?.assertCurrent();
    await persistSession(draft.id, "draft", options?.loadGuard);
  }, [persistSession, refreshRevisions, resolveRevisionWorkpieceId]);

  const updatePlanningSession = useCallback((
    updater: (prev: HearthPlanningSession) => HearthPlanningSession,
    options?: { touched?: boolean },
  ) => {
    setPlanningSession((prev) => {
      const nowIso = new Date().toISOString();
      const base: HearthPlanningSession = prev ?? {
        schema: HEARTH_SESSION_SCHEMA,
        created_at: nowIso,
        updated_at: nowIso,
      };

      const normalizedBase: HearthPlanningSession = {
        ...base,
        schema: HEARTH_SESSION_SCHEMA,
        intent: base.intent ?? deriveIntentFromOrigin(base.origin),
      };

      const next = updater(normalizedBase);
      const updated: HearthPlanningSession = {
        ...next,
        schema: HEARTH_SESSION_SCHEMA,
        workpiece_id: workpieceId ?? next.workpiece_id ?? null,
        workspace_id: workspaceId ?? next.workspace_id ?? null,
        created_at: next.created_at || normalizedBase.created_at || nowIso,
        updated_at: nowIso,
        intent: next.intent ?? deriveIntentFromOrigin(next.origin),
      };

      writeHearthPlanningSessionCache(
        updated,
        workpieceId ?? updated.workpiece_id ?? null,
        workspaceId ?? updated.workspace_id ?? null,
      );
      return updated;
    });

    if (options?.touched !== false) {
      setSessionTouched(true);
    }
  }, [workpieceId, workspaceId]);
  const handleVisualProviderOverrideChange = useCallback((providerId: VisualProviderId | null) => {
    updatePlanningSession((prev) => ({
      ...prev,
      visual_provider_override: providerId,
    }));
  }, [updatePlanningSession]);

  const syncSessionToTongs = useCallback(async (overrideSession?: HearthPlanningSession | null) => {
    const baseSession = overrideSession ?? planningSession;
    if (!baseSession || !workpieceId) return;
    if (sessionCommitInFlight.current) {
      sessionCommitQueued.current = true;
      return;
    }

    sessionCommitInFlight.current = true;
    try {
      do {
        sessionCommitQueued.current = false;

        const sourceIds = Array.from(
          new Set(workpieceSources.map((ref) => ref.source_id).filter(Boolean)),
        ).sort();
        const sparkId = baseSession.origin?.spark_id ?? baseSession.links?.spark_id ?? null;
        const links = sparkId || sourceIds.length ? {
          spark_id: sparkId ?? null,
          source_ids: sourceIds.length ? sourceIds : undefined,
        } : null;

        const sessionForCommit: HearthPlanningSession = {
          ...baseSession,
          schema: HEARTH_SESSION_SCHEMA,
          workpiece_id: workpieceId,
          workspace_id: workspaceId ?? baseSession.workspace_id ?? null,
          intent: baseSession.intent ?? deriveIntentFromOrigin(baseSession.origin),
          links,
        };

        const fingerprint = buildSessionFingerprint(sessionForCommit);

        const allowEmpty = overrideSession ? true : sessionTouched;
        if (!allowEmpty && isPlanningSessionEmpty(sessionForCommit)) {
          continue;
        }

        if (!sessionForCommit.workspace_id) {
          continue;
        }

        if (fingerprint === sessionCommitRef.current) {
          continue;
        }

        const result = await commitHearthSession(workpieceId, sessionForCommit, { allowEmpty });
        if (result.ok && !result.skipped) {
          sessionCommitRef.current = fingerprint;
          setSessionTouched(false);
          setPlanningSession((prev) => {
            if (!prev && !overrideSession) return prev;
            const next = { ...sessionForCommit, updated_at: new Date().toISOString() };
            writeHearthPlanningSessionCache(next, workpieceId, workspaceId ?? next.workspace_id ?? null);
            return next;
          });
        }
      } while (sessionCommitQueued.current);
    } finally {
      sessionCommitInFlight.current = false;
    }
  }, [
    planningSession,
    sessionTouched,
    workpieceId,
    workpieceSources,
    workspaceId,
  ]);

  const onJumpToValidationIssue = useCallback((issue: ScriptValidationIssue) => {
    const textarea = bodyRef.current;
    if (!textarea) return;
    const lines = textarea.value.split("\n");
    const targetLine = Math.max(1, issue.line);
    const targetColumn = Math.max(1, issue.column);
    let offset = 0;
    for (let i = 0; i < targetLine - 1 && i < lines.length; i += 1) {
      offset += (lines[i]?.length ?? 0) + 1;
    }
    const nextPos = Math.min(textarea.value.length, offset + targetColumn - 1);
    textarea.focus();
    textarea.setSelectionRange(nextPos, nextPos);
    textarea.scrollTop = Math.max(0, textarea.scrollHeight * ((targetLine - 1) / Math.max(1, lines.length)));
    setCursorPosition(nextPos);
  }, []);

  const onOpenInAnvil = useHearthAnvilHandoffOpenCommand({
    activeDraft,
    activeWorkpieceIsArchived,
    workspaceId,
    workpieceId,
    isSaving,
    setError,
    buildOpenInAnvilHref: () => openInAnvilHref,
    flushChatHistoryNow,
    operationAuthority,
  });
  const anvilHandoffController = buildHearthAnvilHandoffController({
    activeDraft,
    workspaceId,
    workpieceId,
    archived: activeWorkpieceIsArchived,
    handoffBlocked,
    destination: openInAnvilHref,
    stepModeHint: anvilStepModeHint,
    openInAnvil: onOpenInAnvil,
  });

  const applySessionOrigin = useCallback((origin: HearthSessionOrigin) => {
    updatePlanningSession((prev) => ({
      ...prev,
      origin,
      intent: prev.intent ?? deriveIntentFromOrigin(origin),
      links: {
        ...prev.links,
        spark_id: origin.spark_id ?? null,
      },
    }), { touched: false });
  }, [updatePlanningSession]);

  const { hydrateOrCreateDraftBufferForWorkpiece } = useHearthScriptDraftHydration({
    hearthUser,
    sparks,
    store,
    draftsRef,
    workpieceSummariesRef,
    setDrafts,
    setAiRuntimeWarning,
    refreshDrafts,
    normalizeUuid,
    dedupeDraftListById,
    selectDraftForWorkpiece,
    parseDraftConflictError: parseHearthDraftConflictError,
    buildDraftAttribution,
    parseIsoTimestamp,
    readTrimmedString,
    isLegacyDraftScriptPlaceholder,
    safeScriptStarter: SAFE_SCRIPT_STARTER,
  });

  const {
    openWorkpieceInFocus,
    createDraftAndOpen,
    focusHandoffRef,
  } = useHearthFocusOpenActions({
    initialLoadKey,
    normalizeUuid,
    workspaceId,
    isMobile,
    draftsRef,
    workpieceSummariesRef,
    pendingFocusOpenCountRef,
    pendingDraftEditorPanelRef,
    setWorkspaceId,
    setActiveWorkpieceTab,
    setWorkpieceId,
    setFocusTab,
    setMode,
    setMobileOverlayView,
    clearActiveDraftSelection: () => {
      setDraftSnapshot(null);
      setActiveDraft(null);
    },
    writeWorkpieceWorkspaceTab,
    replaceHearthRouteContext,
    refreshWorkpieces,
    selectDraft,
    persistSession,
    hydrateOrCreateDraftBufferForWorkpiece,
  });
  const {
    onSaveDraft,
    onReloadLatestDraftAfterConflict,
    onCopyConflictLocalText,
    onCopyScriptPanelText,
    onDeleteDraft,
  } = useHearthScriptDraftCommands({
    activeDraft,
    workpieceId,
    sparks,
    mode,
    isMobile,
    mobileOverlayView,
    draftConflictLocalBody: draftConflictState?.localBody ?? null,
    scriptPanelBodyText,
    normalizeUuid,
    dedupeDraftListById,
    persistDraftManual: (manualSaveArgs) => persistDraft(manualSaveArgs),
    noteManualSaveSuccess,
    flushChatHistoryNow,
    refreshDrafts,
    listDrafts: () => store.listDrafts(),
    deleteDraftById: (draftId) => store.deleteDraft(draftId),
    getDraftById: (draftId) => store.getDraft(draftId),
    selectDraft,
    selectDraftForWorkpiece,
    openWorkpieceInFocus,
    persistSession,
    setDraftConflictState,
    setError,
    setScriptPanelCopyMessage,
    setDrafts,
    setFocusTab,
    setMode,
    setMobileOverlayView,
    writeTextToClipboard,
  });

  const startFromScratch = useCallback(async () => {
    if (isForging) return;
    setForgeError(null);
    setIsForging(true);
    try {
      const created = await createHearthCollectionWorkpiece(
        { created_from: "scratch" },
        SAFE_SCRIPT_STARTER,
      );
      if (!created.ok) {
        setForgeError("Workpiece creation failed.");
        setWorkpieceId(null);
        return;
      }
      setWorkpieceId(created.workpieceId);
      setWorkspaceId(resolveWorkspaceId());
      applySessionOrigin({ created_from: "scratch" });
      const draft = await createDraftAndOpen(created.workpieceId, undefined, "focus", {
        revisionWorkpieceId: created.workpieceId,
        workspaceId: resolveWorkspaceId(),
      });
      if (!draft) {
        setForgeError("Workpiece opened, but Hearth could not hydrate a draft buffer.");
        return;
      }
      const nextChatKey = resolveChatHistoryKey(created.workpieceId, draft.id);
      if (nextChatKey) {
        skipChatHydrationKeyRef.current = nextChatKey;
        writeChatHistoryCache(nextChatKey, []);
        void store.saveChatHistory(draft.id, [], created.workpieceId);
      }
      setChatMessages([]);
      setChatDraft("");
      setChatError(null);
      setPendingAiProposal(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start workpiece.";
      setForgeError(message);
    } finally {
      setIsForging(false);
    }
  }, [applySessionOrigin, createDraftAndOpen, isForging, store]);

  const forgeSpark = useCallback(async (spark: BarStockSpark) => {
    if (isForging) return;
    setForgeError(null);
    setIsForging(true);
    let workpieceId: string | undefined;
    try {
      const sparkTitle = deriveSparkTitle(spark);
      const scriptSeed = "[s1]\nDraft intro goes here.\n[/s1]\n";
      const created = await getOrCreateHearthSparkWorkpiece({
        sparkId: spark.id,
        origin: { created_from: "bar-stock", spark_id: spark.id },
        scriptSeed,
        title: sparkTitle,
      });
      if (!created.ok) {
        setForgeError("Workpiece creation failed.");
        setWorkpieceId(null);
        return;
      }
      workpieceId = created.workpieceId;
      setWorkpieceId(workpieceId);
      setWorkspaceId(resolveWorkspaceId());
      applySessionOrigin({ created_from: "bar-stock", spark_id: spark.id });

      const draft = await createDraftAndOpen(workpieceId, {
        title: sparkTitle,
        body: scriptSeed,
      }, "focus", {
        revisionWorkpieceId: workpieceId ?? null,
        workspaceId: resolveWorkspaceId(),
        preferredWorkspaceTab: "script",
        preferredEditorPanel: "script",
      });
      if (!draft) {
        setForgeError("Episode opened, but Hearth could not hydrate a draft buffer.");
        return;
      }

      const sparkPreview = buildSparkPreview(spark.body);
      const markerLines = [
        `Spark selected: ${sparkTitle}`,
        `Spark ID: ${spark.id}`,
      ];
      if (spark.tags?.length) {
        markerLines.push(`Tags: ${spark.tags.join(", ")}`);
      }
      if (sparkPreview) {
        markerLines.push(`Notes: ${sparkPreview}`);
      }
      const markerMessage: HearthChatMessage = { role: "assistant", content: markerLines.join("\n") };
      const nextChatKey = resolveChatHistoryKey(workpieceId ?? null, draft.id);
      if (nextChatKey) {
        skipChatHydrationKeyRef.current = nextChatKey;
        writeChatHistoryCache(nextChatKey, [markerMessage]);
        void store.saveChatHistory(draft.id, [markerMessage], workpieceId);
      }
      setChatMessages([markerMessage]);
      setChatDraft("");
      setChatError(null);
      setPendingAiProposal(null);

      const now = Date.now();
      const updatedSpark: BarStockSpark = {
        ...spark,
        status: "forged",
        updatedAt: now,
        links: {
          ...spark.links,
          hearthDraftId: draft.id,
          hearthWorkpieceId: workpieceId,
        },
      };
      const nextSparks = upsertBarStockSpark(sparks, updatedSpark);
      setSparks(nextSparks);
      writeBarStockSparks(nextSparks, workspaceId);
      enqueueBarStockSpark(updatedSpark, workspaceId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Forge failed.";
      setForgeError(message);
    } finally {
      setIsForging(false);
    }
  }, [applySessionOrigin, createDraftAndOpen, isForging, sparks, store, workspaceId]);

  const forgeProjectIntoEpisode = useCallback(async () => {
    if (isForging) return;
    if (!routeProjectId) return;

    if (routeProjectSparks.length === 0) {
      setForgeError("No sparks are attached to this Project yet.");
      return;
    }

    setIsForging(true);
    setForgeError(null);
    try {
      const title = routeProjectLabel ?? `Project ${routeProjectId.slice(0, 8)}`;
      const operationKey = projectEpisodeCreationKeyRef.current
        ?? `hearth-project-episode:${crypto.randomUUID()}`;
      projectEpisodeCreationKeyRef.current = operationKey;
      const created = await getOrCreateHearthProjectWorkpiece({
        projectId: routeProjectId,
        title,
        origin: { created_from: "bar-stock" },
        scriptSeed: SAFE_SCRIPT_STARTER,
        operationKey,
      });
      if (!created.ok || !created.workpieceId) {
        setForgeError("Hearth could not create a new episode for this Project.");
        return;
      }
      const episodeId = created.workpieceId;
      const draft = await createDraftAndOpen(episodeId, {
        title,
        body: buildProjectDraftSeed(title, routeProjectSparks),
      }, "focus");
      if (!draft) {
        setForgeError("Episode opened, but Hearth could not hydrate a draft buffer.");
        return;
      }

      applySessionOrigin({ created_from: "bar-stock", spark_id: routeProjectSparks[0]?.id });

      const ts = Date.now();
      const changedSparks: BarStockSpark[] = [];
      const nextSparks = sparks.map((spark) => {
        if (spark.assignmentId !== routeProjectId) return spark;
        const updatedSpark: BarStockSpark = {
          ...spark,
          status: spark.status === "graduated" ? "graduated" : "forged",
          updatedAt: ts,
          links: {
            ...spark.links,
            hearthDraftId: draft.id,
            hearthWorkpieceId: episodeId,
          },
        };
        changedSparks.push(updatedSpark);
        return updatedSpark;
      });

      setSparks(nextSparks);
      writeBarStockSparks(nextSparks, workspaceId);
      for (const spark of changedSparks) {
        enqueueBarStockSpark(spark, workspaceId);
      }
      projectEpisodeCreationKeyRef.current = null;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to forge this Project.";
      setForgeError(message);
    } finally {
      setIsForging(false);
    }
  }, [
    applySessionOrigin,
    createDraftAndOpen,
    isForging,
    routeProjectId,
    routeProjectLabel,
    routeProjectSparks,
    sparks,
    workspaceId,
    workpieceId,
  ]);

  const createProjectWorkpiece = useCallback(async (title: string, projectId: string) => (
    await getOrCreateHearthProjectWorkpiece({
      projectId,
      title,
      origin: { created_from: "bar-stock" },
      scriptSeed: SAFE_SCRIPT_STARTER,
    })
  ), []);

  useHearthInitialLoader({
    initialLoadKey,
    requestedWorkpieceId: workpieceId,
    focusHandoffRef,
    incomingBarStockIntakeRoute,
    workspaceId,
    routeProjectId,
    routeSparkId,
    normalizeUuid,
    resolveWorkspaceId,
    resolveWorkpieceIdForDraftId,
    openWorkpieceInFocus,
    sessionStore,
    store,
    dedupeDraftListById,
    workpieceIdRef,
    activeDraftRef,
    intakeResetKeyRef,
    restoredCursorDraftIdRef,
    draftsRef,
    workpieceSummariesRef,
    setIsLoading,
    setError,
    setSession,
    setWorkpieceSummaries,
    setDrafts,
    setWorkpiecesError,
    setRevisionView,
    setFocusTab,
    setWorkpieceId,
    setActiveDraft,
    clearDraftSnapshot: () => setDraftSnapshot(null),
    setRevisions,
    setSelectedRevision,
  });

  useHearthWorkspaceIdentitySync({
    workspaceId,
    setWorkspaceId,
    workspaceStorageKeys: WORKSPACE_STORAGE_KEYS,
  });

  useHearthWorkspaceResetLifecycle({
    workspaceId,
    projectIntakeHandledRef,
    sparkIntakeHandledRef,
    onWorkspaceChanged: () => {
      setSparks([]);
      setSparkDiscoveryWorkspaceId(null);
      setSparkDiscoveryError(null);
      setIsSparksLoading(Boolean(normalizeUuid(workspaceId)));
      setWorkpieceId(null);
      setPlanningSession(null);
      setSessionTouched(false);
      setWorkpieceSummaries([]);
      setWorkpiecesError(null);
      setDrafts([]);
      setActiveDraft(null);
      setDraftSnapshot(null);
      setRevisions([]);
      setSelectedRevision(null);
      setEditingDraftId(null);
      setDraftConflictState(null);
      clearPresence();
      setError(null);
      setForgeError(null);
      setMode("episodes");
      void sessionStore.clearSession();
    },
  });

  useHearthIntakeLifecycle({
    routeProjectId,
    routeSparkId,
    workspaceId,
    sparkDiscoveryWorkspaceId,
    isSparksLoading,
    sparkDiscoveryError,
    routeSpark,
    projectIntakeHandledRef,
    sparkIntakeHandledRef,
    resolveWorkspaceId,
    readPendingProjectWorkpieceId,
    writePendingProjectWorkpieceId,
    readProjectContext: readBarstockProjectContext,
    createProjectWorkpiece,
    openWorkpieceInFocus,
    forgeSpark,
    setIsForging,
    setForgeError,
    setRouteProjectTitle,
    setWorkspaceId,
    setWorkpieceId,
    setSelectedSparkId,
    setMode,
  });
  useHearthCollectionSparkDiscovery({
    workspaceId,
    normalizeUuid,
    setSparks,
    setSparkDiscoveryWorkspaceId,
    setIsSparksLoading,
    setSparkDiscoveryError,
  });

  useEffect(() => {
    if (visibleSparks.length === 0) {
      if (selectedSparkId) setSelectedSparkId(null);
      return;
    }
    if (!selectedSparkId) {
      setSelectedSparkId(visibleSparks[0]?.id ?? null);
      return;
    }
    const exists = visibleSparks.some((spark) => spark.id === selectedSparkId);
    if (!exists) {
      setSelectedSparkId(visibleSparks[0]?.id ?? null);
    }
  }, [selectedSparkId, visibleSparks]);

  useHearthWorkspaceSessionLifecycle({
    incomingBarStockIntakeRoute,
    workpieceId,
    workspaceId,
    planningSession,
    normalizeUuid,
    setPlanningSession,
    setSessionTouched,
    setWorkspaceId,
    setError,
    clearPresence,
    setWorkpieceId,
    sessionCommitRef,
    buildSessionFingerprint,
    updatePlanningSession,
  });

  useHearthThumbnailLifecycle({
    workspaceId,
    workpieceId,
    episodePackage,
    thumbnailConcepts,
    selectedThumbnailConcept,
    selectedThumbnailConceptId,
    defaultThumbnailBrandTemplateId,
    selectedThumbnailBrandLogoWorkpieceId,
    selectedThumbnailBrandLogoAssetPath,
    thumbnailTitleStyleDraft,
    thumbnailConceptBrandTemplateIdDraft,
    isThumbnailConceptSaving,
    isThumbnailGenerating,
    isThumbnailUploading,
    setThumbnailBrandTemplates,
    setThumbnailBrandTemplatesError,
    setIsThumbnailBrandTemplatesLoading,
    setThumbnailBrandLogoDataUrl,
    setThumbnailBrandLogoError,
    setThumbnailBrandLogoStatus,
    syncSelectedThumbnailConceptId,
    syncThumbnailConceptDraftFromConcept,
    persistThumbnailEpisodePackage,
  });

  useEffect(() => {
    if (!episodePackage) return;
    if (!shouldInvalidateMediaMapForScriptVersion(
      episodePackage.media_map.script_version_id,
      approvedScriptVersion,
    )) return;
    const currentScriptVersion = String(approvedScriptVersion);
    setEpisodePackage((prev) => {
      if (!prev) return prev;
      if (prev.media_map.script_version_id === currentScriptVersion) return prev;
      if (
        prev.media_map.status === "needs_attention"
        && prev.media_map.entries.every((entry) => entry.stale)
      ) {
        return prev;
      }
      return {
        ...prev,
        media_map: {
          ...prev.media_map,
          status: "needs_attention",
          entries: prev.media_map.entries.map((entry) => ({ ...entry, stale: true })),
        },
      };
    });
  }, [approvedScriptVersion, episodePackage]);

  useEffect(() => {
    if (imageMapSaveState !== "editing") return;
    if (!episodePackage || !selectedImageMapEntryId) return;

    const current = episodePackage.image_map.entries.find((entry) => entry.id === selectedImageMapEntryId);
    if (!current) return;

    const nextAnchor = imageMapAnchorDraft.trim();
    const nextDescription = imageMapDescriptionDraft;
    const nextStylePreset = normalizeHearthVisualStyle(imageMapStyleDraft);
    const nextIntent = imageMapIntentDraft.trim().toLowerCase();
    const nextSourceType = imageMapSourceTypeDraft.trim().toLowerCase();
    const nextAnchorScope = imageMapAnchorScopeDraft;
    const nextVisualPriority = imageMapVisualPriorityDraft;
    const nextVisualType = imageMapVisualTypeDraft;
    const nextSectionIntentNote = imageMapSectionIntentNoteDraft.trim() || null;
    const nextPlacementHint = imageMapPlacementHintDraft.trim() || null;

    const hasChanges = (
      current.anchor !== nextAnchor
      || current.description !== nextDescription
      || current.visual_intent !== nextDescription
      || current.prompt_basis !== nextDescription
      || normalizeHearthVisualStyle(current.style_preset) !== nextStylePreset
      || current.intent !== nextIntent
      || current.source_type !== nextSourceType
      || resolveImageMapEntryAnchorScope(current) !== nextAnchorScope
      || (current.visual_priority ?? "supporting") !== nextVisualPriority
      || (current.visual_type ?? "still_image") !== nextVisualType
      || (current.section_intent_note ?? null) !== nextSectionIntentNote
      || (current.placement_hint ?? null) !== nextPlacementHint
    );

    if (!hasChanges) {
      setImageMapSaveState("saved");
      return;
    }

    if (!nextAnchor) {
      setImageMapSaveState("error");
      setImageMapSaveError("Anchor is required.");
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setImageMapSaveState("saving");
        setImageMapSaveError(null);

        const nextEpisodePackage = updateImageMapEntry(
          episodePackage,
          selectedImageMapEntryId,
          {
            anchor: nextAnchor,
            description: nextDescription,
            visual_intent: nextDescription,
            prompt_basis: nextDescription,
            style_preset: nextStylePreset,
            intent: nextIntent,
            source_type: nextSourceType,
            anchor_scope: nextAnchorScope,
            visual_priority: nextVisualPriority,
            visual_type: nextVisualType,
            section_intent_note: nextSectionIntentNote,
            candidate_assets: [],
            selected_asset_id: null,
            status: nextAnchorScope === "global"
              ? "draft"
              : (hasStructuredImageMapAnchor(current) ? "mapped" : "draft"),
            script_anchor: nextAnchorScope === "global" ? null : current.script_anchor,
            beat_anchor: nextAnchorScope === "global" ? null : current.beat_anchor,
            placement_hint: nextPlacementHint,
          },
        );

        const saved = await persistImageMapEntries({
          entries: nextEpisodePackage.image_map.entries,
        });
        if (cancelled) return;
        if (!saved.ok) {
          const online = typeof navigator === "undefined" ? true : navigator.onLine;
          if (!online) {
            setImageMapSaveState("offline");
            setImageMapSaveError("Offline. Entry edits are waiting to sync.");
          } else {
            setImageMapSaveState("error");
            setImageMapSaveError(saved.error);
          }
          return;
        }
        setImageMapSaveState("saved");
        setImageMapSaveError(null);
        setImageMapCandidateError(null);
        setImageMapCandidateSelectionError(null);
      })();
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    episodePackage,
    imageMapAnchorDraft,
    imageMapDescriptionDraft,
    imageMapStyleDraft,
    imageMapIntentDraft,
    imageMapAnchorScopeDraft,
    imageMapVisualPriorityDraft,
    imageMapVisualTypeDraft,
    imageMapSectionIntentNoteDraft,
    imageMapPlacementHintDraft,
    imageMapSaveState,
    imageMapSourceTypeDraft,
    selectedImageMapEntryId,
    workpieceId,
    workspaceId,
  ]);

  useEffect(() => {
    if (!imageMapExportMessage) return;
    const timer = window.setTimeout(() => setImageMapExportMessage(null), 2600);
    return () => window.clearTimeout(timer);
  }, [imageMapExportMessage]);

  useEffect(() => {
    if (!brollMessage) return;
    const timer = window.setTimeout(() => setBrollMessage(null), 2600);
    return () => window.clearTimeout(timer);
  }, [brollMessage]);

  useEffect(() => {
    if (!scriptPanelCopyMessage) return;
    const timer = window.setTimeout(() => setScriptPanelCopyMessage(null), 2600);
    return () => window.clearTimeout(timer);
  }, [scriptPanelCopyMessage]);

  useHearthWorkpieceTabPreferenceLifecycle({
    activeWorkpieceTab,
    workspaceId,
    workpieceId,
    setActiveWorkpieceTab,
  });

  useHearthScriptApprovalIdentityReset({
    workpieceId,
    setScriptApprovalState,
    setApprovalPersistenceStatus,
  });

  useHearthCanonicalScriptApprovalLoader({
    activeDraftId: activeDraft?.id ?? null,
    workpieceId,
    revisions,
    operationAuthority,
    store,
    setScriptApprovalState,
    writeRecoveryEvidence: writeScriptApprovalRecoveryEvidence,
  });

  useHearthModeRestorationLifecycle({
    activeDraft,
    mode,
    workpieceId,
    pendingFocusOpenCountRef,
    restoredModeDraftKeyRef,
    setMode,
  });

  useEffect(() => {
    const nextPanel = pendingDraftEditorPanelRef.current;
    setShowManualDraft(nextPanel === "manual");
    setShowScriptPanel(nextPanel === "script");
    pendingDraftEditorPanelRef.current = null;
    gateAwaitingAnswersRef.current = false;
    pendingShortcutIntentRef.current = null;
    pendingExplicitActionRef.current = null;
  }, [activeDraft?.id]);

  useEffect(() => {
    if (isCanonicalImageMapScriptPanel) return;
    if ((activeDraft?.body ?? "").trim()) return;
    setShowScriptPanel(false);
  }, [activeDraft?.body, isCanonicalImageMapScriptPanel]);

  useHearthModePreferenceLifecycle({ mode, workpieceId });

  useHearthDensityPreferenceLifecycle({
    uiDensity,
    workspaceId,
    setUiDensity,
  });

  useHearthScriptRevisionLoader({
    loadScope: initialLoadKey,
    enabled: !isLoading,
    onError: (error) => setError(error instanceof Error ? error.message : "Failed to load revisions."),
    activeDraftId: activeDraft?.id ?? null,
    revisionWorkpieceId,
    refreshRevisions,
  });

  useEffect(() => {
    const textarea = bodyRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [scriptPanelBodyText]);

  useEffect(() => {
    if (isCanonicalImageMapScriptPanel) return;
    const activeDraftId = activeDraft?.id ?? null;
    const textarea = bodyRef.current;
    if (!textarea || !session?.uiState || !activeDraftId || activeDraftId !== session.activeDraftId) return;
    if (restoredCursorDraftIdRef.current === activeDraftId) return;

    restoredCursorDraftIdRef.current = activeDraftId;
    if (typeof session.uiState.cursorPosition === "number") {
      const pos = Math.min(session.uiState.cursorPosition, textarea.value.length);
      textarea.setSelectionRange(pos, pos);
      setCursorPosition(pos);
    }
    if (typeof session.uiState.scrollTop === "number") {
      textarea.scrollTop = session.uiState.scrollTop;
      setScrollTop(session.uiState.scrollTop);
    }
  }, [activeDraft?.id, isCanonicalImageMapScriptPanel, session?.activeDraftId]);

  useEffect(() => {
    if (sessionSaveTimer.current) {
      window.clearTimeout(sessionSaveTimer.current);
    }
    sessionSaveTimer.current = window.setTimeout(() => {
      const tab = mode === "focus"
        ? (focusTab === "revisions" ? revisionView : focusTab)
        : mode;
      void persistSession(activeDraft?.id ?? null, tab);
    }, SESSION_SAVE_DELAY_MS);

    return () => {
      if (sessionSaveTimer.current) {
        window.clearTimeout(sessionSaveTimer.current);
        sessionSaveTimer.current = null;
      }
    };
  }, [activeDraft?.id, cursorPosition, focusTab, mode, persistSession, revisionView, scrollTop]);

  const {
    requestWorkpieceTabChange,
    openRevisionPanel,
    closeRevisionPanel,
  } = useHearthWorkpieceTabLifecycle({
    activeWorkpieceTab,
    tabDirtyById,
    hasAnyUnsavedTab,
    hasActiveEpisode,
    hasActiveDraft: Boolean(activeDraft),
    revisionModalOpen,
    focusTab,
    activeDraftId: activeDraft?.id ?? null,
    workpieceWorkspaceTabs: WORKPIECE_WORKSPACE_TABS,
    tabSwitchUnsavedWarning: TAB_SWITCH_UNSAVED_WARNING,
    searchRef,
    setActiveWorkpieceTab,
    setFocusTab,
    setMode,
    normalizeWorkpieceWorkspaceTab,
    persistSession,
    resetRevisionSelection,
    openRevisionModal,
    onSaveDraft,
  });

  const { persistDraft: persistDraftImpl, saveDraftMeta: saveDraftMetaImpl } = useHearthScriptDraftPersistence({
    mode,
    focusTab,
    revisionView,
    activeDraftId: activeDraft?.id ?? null,
    hearthUser,
    evaluateScriptValidation,
    buildValidationReport,
    normalizeTitle,
    buildDraftAttribution,
    buildPersistedValidationMeta,
    resolveRevisionWorkpieceId: () => resolveRevisionWorkpieceId(),
    reportRevisionPersistenceWarning,
    refreshRevisions,
    persistSession,
    syncSources: () => sourcesController.commands.refreshSources(),
    syncSessionToTongs,
    dedupeDraftListById,
    draftEditVersionRef,
    activeDraftRef,
    store,
    setIsSaving,
    setDraftConflictState,
    setError,
    setScriptValidation,
    setAiAutosaveWarning,
    setAiRuntimeWarning,
    setActiveDraft,
    setDraftSnapshot,
    setDrafts,
    setSelectedRevision,
    setRevisionView,
  });

  async function persistDraft(args: {
    draft: Draft;
    updatedAt: number;
    createRevision: { kind: RevisionKind; note?: string } | null;
    syncSources?: boolean;
    syncSession?: boolean;
    showSavingState?: boolean;
    validateForAnvil?: boolean;
    quietFailure?: boolean;
    saveReason?: string;
  }): Promise<boolean> {
    return persistDraftImpl(args);
  }

  async function saveDraftMeta(draft: Draft, updates: Partial<Draft>) {
    await saveDraftMetaImpl(draft, updates);
  }

  const scriptController = useHearthScriptController({
    state: {
      draft: activeDraft,
      drafts,
      revision: {
        items: revisions,
        selected: selectedRevision,
        kind: revisionKind,
        note: revisionNote,
      },
      approval: scriptApprovalState,
      formatting: {
        writingFormat: selectedWritingFormat,
        validation: scriptValidation,
      },
      conflict: draftConflictState,
      selection: { revisionWorkpieceId },
    },
    commands: {
      selectDraft,
      updateDraft: {
        title: onDraftTitleChange,
        body: onDraftBodyChange,
      },
      saveDraft: onSaveDraft,
      retrySave: onRetryAiAutosave,
      resolveConflict: {
        reloadLatest: onReloadLatestDraftAfterConflict,
        copyLocalText: onCopyConflictLocalText,
      },
      createRevision: onConfirmRevision,
      restoreRevision: onRestoreRevision,
      approveScript: onApproveScript,
      applyApprovedScript: (draft) => onApproveScript({ draftOverride: draft }),
      formatScript: onFixScriptFormattingNoAi,
      repairScript: onAskAiRepairScript,
      refreshAuthority: async () => {
        await refreshRevisions(revisionWorkpieceId, activeDraft?.id ?? null);
      },
    },
    status: {
      hydration: isLoading ? "loading" : error ? "failed" : activeDraft ? "loaded" : "missing",
      save: isSaving ? "saving" : draftConflictState ? "failed" : isDirty ? "unsaved" : "saved",
      approval: isApprovingScript
        ? "approving"
        : scriptApprovalState.hasApprovedScript
          ? "available"
          : "absent",
      formatting: isRepairingScript ? "repairing" : "idle",
      authority: "available",
      approvalPersistence: approvalPersistenceStatus,
    },
    surfaces: {
      script: {
        draft: activeDraft,
        snapshot: draftSnapshot,
        isDirty,
        error,
      },
      history: {
        revisions,
        selectedRevision,
        view: revisionView,
      },
    },
  });

  async function onCreateDraft() {
    setError(null);
    const activeWorkpieceId = normalizeUuid(workpieceId);
    if (!activeWorkpieceId) {
      setError("Select or create an Episode first.");
      return;
    }
    try {
      await createDraftAndOpen(activeWorkpieceId, undefined, "focus", {
        workspaceId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create draft.";
      setError(message);
    }
  }

  async function onResumeLastProject() {
    const lastWorkpieceId = normalizeUuid(session?.activeWorkpieceId ?? null)
      ?? resolveWorkpieceIdForDraftId(session?.activeDraftId ?? null);
    if (!lastWorkpieceId) {
      setForgeError("No last project to resume.");
      return;
    }
    setForgeError(null);
    await openWorkpieceInFocus(lastWorkpieceId, {
      preferredDraftId: session?.activeDraftId ?? null,
    });
  }

  async function onActivateSpark(spark: BarStockSpark) {
    setSelectedSparkId(spark.id);
    const linkedWorkpieceId = resolveBarStockSparkHearthWorkpieceId(spark);
    if (linkedWorkpieceId) {
      setForgeError(null);
      await openWorkpieceInFocus(linkedWorkpieceId, {
        workspaceId,
        preferredDraftId: spark.links?.hearthDraftId ?? null,
        preferredWorkspaceTab: "script",
        preferredEditorPanel: "script",
      });
      return;
    }
    if (isSparkForged(spark)) {
      setForgeError("This spark is already attached to Hearth, but its Episode link could not be resolved.");
      return;
    }
    await forgeSpark(spark);
  }

  function resolveSparkActionLabel(spark: BarStockSpark): string {
    if (resolveBarStockSparkHearthWorkpieceId(spark)) return "Open in Hearth";
    if (isSparkForged(spark)) return "Episode link missing";
    return "Start forging";
  }

  async function onStartForgingSelectedSpark() {
    if (!selectedSpark) {
      await startFromScratch();
      return;
    }
    await onActivateSpark(selectedSpark);
  }

  function onAddDecision() {
    const text = decisionDraft.trim();
    if (!text) return;
    const entry: HearthSessionDecision = {
      at: new Date().toISOString(),
      text,
    };
    updatePlanningSession((prev) => ({
      ...prev,
      decisions: [...(prev.decisions ?? []), entry],
    }));
    setDecisionDraft("");
  }

  function onUpdateDecision(idx: number, text: string) {
    updatePlanningSession((prev) => {
      const next = [...(prev.decisions ?? [])];
      if (!next[idx]) return prev;
      next[idx] = { ...next[idx], text };
      return { ...prev, decisions: next };
    });
  }

  function onRemoveDecision(idx: number) {
    updatePlanningSession((prev) => ({
      ...prev,
      decisions: (prev.decisions ?? []).filter((_, index) => index !== idx),
    }));
  }

  const {
    archivingWorkpieceIds,
    restoringWorkpieceIds,
    onArchiveWorkpiece,
    onRestoreWorkpiece,
  } = useHearthCollectionArchiveActions({
    workspaceId,
    workpieceId,
    showArchived,
    isMobile,
    mobileOverlayView,
    activeDraftId: activeDraft?.id ?? null,
    normalizeUuid,
    setError,
    setAiRuntimeWarning,
    setWorkpieceId,
    setMode,
    setFocusTab,
    setMobileOverlayView,
    selectDraft: async () => selectDraft(null),
    persistSession,
    refreshWorkpieces,
    openWorkpieceInFocus,
  });

  function findNextBodyFromOps(baseBody: string, ops: HearthOp[]): string {
    let next = baseBody;
    for (const op of ops) {
      if (op.op === "set_body") {
        next = op.value;
      }
    }
    return next;
  }

  function normalizeAiProposalOpsForScriptIngress(ops: HearthOp[]): HearthOp[] {
    return normalizeHearthProposalOpsForScriptIngress(ops);
  }

  function graduateLinkedSpark(episodeId: string): string | null {
    const normalizedEpisodeId = episodeId.trim().toLowerCase();
    if (!normalizedEpisodeId) return null;

    const preferredSparkId = sessionSparkId?.trim() ?? "";
    const linkedSpark = (preferredSparkId
      ? sparks.find((spark) => spark.id === preferredSparkId)
      : null)
      ?? sparks.find((spark) => {
        const linkedWorkpieceId = spark.links?.hearthWorkpieceId?.trim().toLowerCase() ?? "";
        return linkedWorkpieceId && linkedWorkpieceId === normalizedEpisodeId;
      });

    if (!linkedSpark) return null;
    if (linkedSpark.status === "graduated" || linkedSpark.status === "archived") {
      return linkedSpark.id;
    }

    const now = Date.now();
    const graduatedSpark: BarStockSpark = {
      ...linkedSpark,
      status: "graduated",
      updatedAt: now,
      links: {
        ...linkedSpark.links,
        hearthWorkpieceId: linkedSpark.links?.hearthWorkpieceId ?? episodeId,
      },
    };
    const nextSparks = upsertBarStockSpark(sparks, graduatedSpark);
    setSparks(nextSparks);
    writeBarStockSparks(nextSparks, workspaceId);
    enqueueBarStockSpark(graduatedSpark, workspaceId);
    return graduatedSpark.id;
  }

  async function persistProductionArtifact(args: {
    action: ProductionAction;
    scriptVersion: number;
    assistantText: string;
    generatedAt?: string;
    reuseStoredArtifact?: boolean;
    paidOperationId?: string;
    framingPackIdentity?: {
      resultId: string;
      approvalId: string;
      approvalRevision: number;
      scriptHash: string;
    };
    thumbnailDirectionIdentity?: {
      operationId: string;
      resultId: string; approvalId: string; approvalRevision: number; scriptHash: string; createdAt: string;
      styleAuthority: Record<string, unknown>; titleInputs: Array<Record<string, unknown>>;
      thumbnailPlanningSubtreeHash: string; expectedActiveStrategyId: string | null; expectedActiveConceptSetId: string | null;
    };
    allowRecoveredPackDescriptionProjection?: boolean;
  }) {
    const result = await persistHearthProductionArtifact({
      action: args.action,
      scriptVersion: args.scriptVersion,
      assistantText: args.assistantText,
      generatedAt: args.generatedAt,
      reuseStoredArtifact: args.reuseStoredArtifact,
      paidOperationId: args.paidOperationId,
      framingPackIdentity: args.framingPackIdentity,
      thumbnailDirectionIdentity: args.thumbnailDirectionIdentity,
      allowRecoveredPackDescriptionProjection: args.allowRecoveredPackDescriptionProjection,
      workpieceId,
      workspaceId,
      refreshEpisodePackage,
      loadLatestReleasePrepPack,
      setAiRuntimeWarning,
      setMetadataTitlesDraft,
      setMetadataDescriptionShortDraft,
      setMetadataDescriptionLongDraft,
      setMetadataTagsDraft,
      onTagProposal: setGeneratedTagProposal,
    });
    lastProductionCommitResultRef.current = result ?? null;
    return result;
  }

  async function onRunProductionAction(action: ProductionAction) {
    if (productionActionInFlightRef.current) return;
    productionActionInFlightRef.current = true;
    lastProductionCommitResultRef.current = null;
    try {
      await runProductionAction({
        action,
        isAiProcessing,
        isApprovingScript,
        hasApprovedScript,
        approvedScriptVersion,
        activeDraft: activeDraft
          ? {
              body: activeDraft.body,
              title: activeDraft.title,
            }
          : null,
        planningSessionTitle: planningSession?.title ?? null,
        setChatError,
        setActiveProductionAction,
        sendChatMessage,
      });
      return lastProductionCommitResultRef.current ?? undefined;
    } finally {
      productionActionInFlightRef.current = false;
    }
  }

  async function onRecoverThumbnailConcepts() {
    if (!workpieceId) { const reason = "Select an Episode before recovering thumbnail concepts."; setAiRuntimeWarning(reason); return { ok: false as const, reason }; }
    if (!approvedScriptVersion) { const reason = "Approve a Script Version before recovering thumbnail concepts."; setAiRuntimeWarning(reason); return { ok: false as const, reason }; }
    const artifact = await readWorkpieceProductionArtifact({ workpieceId, scriptVersion: approvedScriptVersion, kind: "thumbnails" });
    const payload = artifact.ok && artifact.payload && typeof artifact.payload === "object" && !Array.isArray(artifact.payload)
      ? artifact.payload as Record<string, unknown> : null;
    const rawText = typeof payload?.raw_text === "string" ? payload.raw_text : "";
    if (!rawText.trim()) { const reason = "No saved thumbnail generation response exists for this approved script version."; setAiRuntimeWarning(reason); return { ok: false as const, reason, stage: "artifact" as const }; }
    const generatedAt = typeof payload?.generated_at === "string" ? payload.generated_at : undefined;
    return persistProductionArtifact({ action: "thumbnails", scriptVersion: approvedScriptVersion, assistantText: rawText, generatedAt, reuseStoredArtifact: true });
  }

  async function onRecoverFraming() {
    if (!workpieceId) { setAiRuntimeWarning("Select an Episode before recovering framing outputs."); return; }
    if (!approvedScriptVersion) { setAiRuntimeWarning("Approve a Script Version before recovering framing outputs."); return; }
    let found = 0;
    for (const action of ["seo", "tags"] as const) {
      const artifact = await readWorkpieceProductionArtifact({ workpieceId, scriptVersion: approvedScriptVersion, kind: action });
      const payload = artifact.ok && artifact.payload && typeof artifact.payload === "object" && !Array.isArray(artifact.payload)
        ? artifact.payload as Record<string, unknown> : null;
      const rawText = typeof payload?.raw_text === "string" ? payload.raw_text : "";
      if (!rawText.trim()) continue;
      found += 1;
      const generatedAt = typeof payload?.generated_at === "string" ? payload.generated_at : undefined;
      await persistProductionArtifact({ action, scriptVersion: approvedScriptVersion, assistantText: rawText, generatedAt, reuseStoredArtifact: true });
    }
    const packArtifact = await readWorkpieceProductionArtifact({ workpieceId, scriptVersion: approvedScriptVersion, kind: "pack" });
    const packPayload = packArtifact.ok && packArtifact.payload && typeof packArtifact.payload === "object" && !Array.isArray(packArtifact.payload)
      ? packArtifact.payload as Record<string, unknown> : null;
    const packRawText = typeof packPayload?.raw_text === "string" ? packPayload.raw_text : "";
    if (packRawText.trim()) {
      found += 1;
      const packSections = parseReleasePrepPackSections(packRawText);
      const packShort = packSections.find((section) => section.key === "short_description")?.content;
      const packLong = packSections.find((section) => section.key === "long_description")?.content;
      const canReprojectDescriptions = canReprojectRecoveredPackDescriptions({
        canonicalShort: metadataDescriptionShortDraft,
        canonicalLong: metadataDescriptionLongDraft,
        packShort,
        packLong,
      });
      if (canReprojectDescriptions) {
        await persistProductionArtifact({
          action: "release_prep_pack",
          scriptVersion: approvedScriptVersion,
          assistantText: packRawText,
          generatedAt: typeof packPayload?.generated_at === "string" ? packPayload.generated_at : undefined,
          reuseStoredArtifact: true,
          allowRecoveredPackDescriptionProjection: true,
        });
      } else {
        // Divergent drafts are creator authority. Recover only the Pack display.
        await loadLatestReleasePrepPack(approvedScriptVersion);
      }
    }
    if (!found) { setAiRuntimeWarning("No saved title, tag, or Framing Pack generation responses exist for this approved script version."); return; }
    await refreshEpisodePackage();
  }

  function onAcceptGeneratedTags(mode: "replace" | "merge") {
    if (!generatedTagProposal) return;
    const nextTags = resolveAcceptedTagProposal({
      canonicalTags: metadataTagsDraft,
      proposedTags: generatedTagProposal.tags,
      mode,
    });
    onMetadataApplyTags(nextTags);
    setGeneratedTagProposal(null);
  }

  function resolveBrollDataVisualSpecFromDraft(intent: EpisodeBrollPlanBeat["motion_intent"]) {
    return buildHearthBrollDataVisualSpec({
      intent,
      chartType: brollDataChartTypeDraft,
      title: brollDataTitleDraft,
      labels: brollDataLabelsDraft,
      values: brollDataValuesDraft,
      emphasisKey: brollDataEmphasisKeyDraft,
      animationStyle: brollDataAnimationStyleDraft,
    });
  }

  function resolveReferenceClipValuesFromDraft(): Array<number | string> {
    return parseHearthReferenceClipValues(referenceClipValuesDraft);
  }

  function onUseChatShortcut(prompt: string, explicitAction?: HearthExplicitUiAction) {
    pendingExplicitActionRef.current = explicitAction ?? null;
    if (explicitAction?.kind === "generate_outline") {
      pendingShortcutIntentRef.current = "outline";
      recordInteractionEvent("user_requested_outline", {
        source: "shortcut_chip",
      });
    } else if (explicitAction?.kind === "generate_script") {
      pendingShortcutIntentRef.current = "script";
      recordInteractionEvent("user_requested_script", {
        source: "shortcut_chip",
      });
    }
    setChatDraft((prev) => (prev.trim() ? `${prev.trim()}\n${prompt}` : prompt));
    chatInputRef.current?.focus();
  }

  function onOpenComposeScript() {
    const inferredSpeakers = activeDraft?.body ? inferSpeakersFromScript(activeDraft.body) : [];
    const conflict = resolveComposeConflicts({
      defaults: productionDefaults,
      userRequestedCustomize: false,
      isSpecialEpisode: activeEpisodeSparks.length > 0,
      importedImpliedSpeakers: inferredSpeakers.length > 0 ? inferredSpeakers : null,
      selectedMode: productionDefaults.defaultMode,
      selectedTargetSpeaker: productionDefaults.defaultTargetSpeaker,
    });
    if (!conflict.shouldPrompt && productionDefaults.assumeStandardUnlessOverridden) {
      const setup = buildSetupFromDefaults(productionDefaults);
      setComposeSetupDraft(setup);
      const request = buildComposeScriptRequest({
        setup,
        sourceText: "Compose from current episode context.",
        existingDraftText: activeDraft?.body ?? "",
      });
      setChatDraft(buildComposePrompt(request));
      chatInputRef.current?.focus();
      return;
    }
    setComposeSetupDraft(buildSetupFromDefaults(productionDefaults));
    setComposeModalOpen(true);
  }

  function onComposeSetupSubmit(setup: ComposeSetup, options?: { saveAsDefault?: boolean }) {
    const promotedDefaults = resolveProductionDefaultsUpdate({
      setup,
      currentDefaults: productionDefaults,
      promoteToDefault: options?.saveAsDefault === true,
    });
    const effectiveSetup = promotedDefaults ? buildSetupFromDefaults(promotedDefaults) : setup;
    if (promotedDefaults) {
      setProductionDefaults(promotedDefaults);
      writeProductionDefaults(promotedDefaults);
    }
    setComposeSetupDraft(effectiveSetup);
    setComposeModalOpen(false);
    setActiveDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        scriptAuthoringMeta: {
          composeMode: effectiveSetup.mode,
          targetSpeaker: effectiveSetup.targetSpeaker,
          speakers: effectiveSetup.speakers,
          speakerCount: effectiveSetup.speakerCount,
          isOverrideFromProductionDefault: effectiveSetup.isOverrideFromProductionDefault,
          lastComposedAt: new Date().toISOString(),
        },
      };
    });
    const request = buildComposeScriptRequest({
      setup: effectiveSetup,
      sourceText: "Compose from current episode context.",
      existingDraftText: activeDraft?.body ?? "",
    });
    setChatDraft(buildComposePrompt(request));
    chatInputRef.current?.focus();
  }

  function formatSourceDiffText(source: {
    id?: string;
    title?: string;
    url?: string;
    note?: string;
  }): string {
    const parts: string[] = [];
    if (source.id) parts.push(`id: ${source.id}`);
    if (source.title) parts.push(`title: ${source.title}`);
    if (source.url) parts.push(`url: ${source.url}`);
    if (source.note) parts.push(`note: ${source.note}`);
    return parts.join("\n") || "(empty)";
  }

  function buildProposalDiff(op: HearthOp): { before: string; after: string } | null {
    const context = pendingAiProposal?.context;
    if (!context) return null;

    if (op.op === "set_title") {
      return { before: context.title, after: op.value };
    }
    if (op.op === "set_title_variant") {
      return {
        before: context.titleVariants[op.slot] ?? "",
        after: op.value,
      };
    }
    if (op.op === "set_outline") {
      return { before: context.outline, after: op.value };
    }
    if (op.op === "set_body") {
      return { before: context.body, after: op.value };
    }
    if (op.op === "add_source") {
      return {
        before: "(not attached)",
        after: formatSourceDiffText(op.source),
      };
    }
    if (op.op === "update_source") {
      const existing = context.sources.find((source) => source.id === op.id);
      return {
        before: formatSourceDiffText(existing ?? { id: op.id }),
        after: formatSourceDiffText({
          id: op.id,
          title: op.patch.title ?? existing?.title,
          url: op.patch.url ?? existing?.url,
          note: op.patch.note ?? existing?.note,
        }),
      };
    }
    if (op.op === "remove_source") {
      const existing = context.sources.find((source) => source.id === op.id);
      return {
        before: formatSourceDiffText(existing ?? { id: op.id }),
        after: "(removed from Episode)",
      };
    }
    return null;
  }

  function renderSectionedBody(text: string) {
    const lines = splitLines(text);
    return (
      <div className="hs-sectioned-body">
        {lines.map((line, idx) => (
          line.trim() === "---"
            ? <hr key={`sep-${idx}`} className="hs-divider" />
            : <div key={`line-${idx}`}>{line || " "}</div>
        ))}
      </div>
    );
  }

  const {
    onOpenReadyScriptInHearth,
    onSendBackToEdit,
  } = useHearthCollectionReadyNavigationActions({
    activeDraftId: activeDraft?.id ?? null,
    sendingBackReadyIds,
    openWorkpieceInFocus,
    refreshReadyScripts,
    setError,
    setReadyScriptsError,
    setReadyScripts,
    setSendingBackReadyIds,
  });

  const {
    openReadyInMobileOverlay,
    closeMobileOverlay,
  } = useHearthMobileOverlayCommands({
    isMobile,
    setMode,
    setMobileOverlayView,
  });

  const {
    resolveWorkpiecePresenceBadge,
    resolveWorkpiecePresenceClass,
  } = useHearthPresenceBadges({
    activeWorkpieceId: workpieceId,
    connection: presenceState,
    editingParticipants: editingPeers,
    viewingParticipants: viewingPeers,
  });
  const presenceController = buildHearthPresenceController({
    participants: presenceRows,
    connection: presenceState,
    userId: hearthUser.userId,
    displayName: activeUserDisplayName,
    mode: localPresenceMode,
    editingParticipants: editingPeers,
    viewingParticipants: viewingPeers,
    clearPresence,
    refreshPresence: () => window.dispatchEvent(new Event(HEARTH_PRESENCE_REFRESH_EVENT)),
    updateActivity: () => window.dispatchEvent(new Event(HEARTH_PRESENCE_REFRESH_EVENT)),
    resolveWorkpiecePresenceBadge,
    resolveWorkpiecePresenceClass,
  });

  const renderSparksView = () => {
    return (
      <HearthSparksMode
        sessionActiveWorkpieceId={session?.activeWorkpieceId}
        sessionActiveDraftId={session?.activeDraftId}
        resolveWorkpieceIdForDraftId={resolveWorkpieceIdForDraftId}
        normalizeUuid={normalizeUuid}
        workpieceSummaries={workpieceSummaries}
        drafts={drafts}
        hasActiveEpisode={hasActiveEpisode}
        workpieceId={workpieceId}
        routeProjectId={routeProjectId}
        forgeGreetingName={forgeGreetingName}
        selectedSpark={selectedSpark}
        formatSparkStatus={formatSparkStatus}
        buildSparkPreview={buildSparkPreview}
        routeProjectLabel={routeProjectLabel}
        forgeProjectIntoEpisode={forgeProjectIntoEpisode}
        isForging={isForging}
        routeProjectSparks={routeProjectSparks}
        deriveSparkTitle={deriveSparkTitle}
        startFromScratch={startFromScratch}
        onResumeLastProject={onResumeLastProject}
        formatRelativeUpdatedAt={formatRelativeUpdatedAt}
        forgeError={forgeError}
        visibleSparks={visibleSparks}
        isSparksLoading={isSparksLoading}
        sparkDiscoveryError={sparkDiscoveryError}
        setSelectedSparkId={setSelectedSparkId}
        onActivateSpark={onActivateSpark}
        formatSparkDate={formatSparkDate}
        resolveSparkActionLabel={resolveSparkActionLabel}
        onStartForgingSelectedSpark={onStartForgingSelectedSpark}
      />
    );
  };

  const renderSparkRouteBootstrapView = () => {
    return (
      <HearthSparkBootstrapMode
        routeSpark={routeSpark}
        deriveSparkTitle={deriveSparkTitle}
        forgeError={forgeError}
      />
    );
  };

  const hearthVisualsWorkspace = useHearthVisualsWorkspace({
    status: {
      hasApprovedScript,
      approvedScriptVersion,
      mediaMapStatus: mediaMap?.status ?? null,
      mediaMapCoverageLevel,
      mediaMapScopeLabel,
      activeVisualProviderBanner: activeVisualProvider.bannerLabel,
      activeVisualProviderHelperText: activeVisualProvider.helperText,
      aiCreditsDepleted,
      isAiProcessing,
      activeProductionAction,
      releasePrepScriptVersion,
      latestReleasePrepRawText,
      releasePrepLoadState,
      latestReleasePrepSections,
    },
    commands: {
      onGenerateTitles: () => void onRunProductionAction("seo"),
      onGenerateTags: () => void onRunProductionAction("tags"),
      onGenerateFramingPack: () => void onRunProductionAction("release_prep_pack"),
      onRefreshFramingPack: () => {
        if (!approvedScriptVersion) return;
        void loadLatestReleasePrepPack(approvedScriptVersion);
      },
    },
  });

  function onChangeTonePreset(nextTonePresetRaw: string) {
    const nextTonePreset = normalizeTonePreset(nextTonePresetRaw);
    if (!nextTonePreset) return;
    updatePlanningSession((prev) => ({
      ...prev,
      tone_preset: nextTonePreset,
    }));
    if (!workspaceId) return;
    void setMyWritingTonePreset(workspaceId, nextTonePreset).then((result) => {
      if (!result.ok) return;
      setWritingProfile(result.data);
    });
  }

  const renderDraftView = () => {
    const hasScript = Boolean((activeDraft?.body ?? "").trim());
    const displayedValidation = scriptValidation?.result ?? hearthScriptState?.validation ?? null;
    const validationIssueCount = displayedValidation?.issues.length ?? 0;
    const {
      sourcesSummary,
      unusedSummary,
      showScriptEditor,
      scriptPanelTitle,
      scriptPanelMetaText,
      scriptPanelPlaceholder,
    } = buildHearthDraftScriptPanelState({
      missingSourcesCount,
      unusedSourcesCount,
      showManualDraft,
      showScriptPanel,
      isCanonicalImageMapScriptPanel,
      hasScript,
      scriptPanelSourceLabel,
      canonicalImageMapScriptStateStatus: canonicalImageMapScriptState.status,
      canonicalImageMapScriptStateError: canonicalImageMapScriptState.error ?? null,
    });
    const composeModeLabel = effectiveComposeSetup
      ? (effectiveComposeSetup.mode === "outline_by_speaker"
        ? "Outline by speaker"
        : effectiveComposeSetup.mode === "full_script_single_speaker"
          ? `Full script for ${effectiveComposeSetup.targetSpeaker ?? "speaker"}`
          : "Full script for all speakers")
      : "Not set";
    const completionBadgeLabel = scriptCompletionBadge === "approval_ready"
      ? "Approval Ready"
      : scriptCompletionBadge === "partial_script"
        ? "Partial Script"
        : "Outline Draft";
    const isScriptWorkspaceTab = activeWorkpieceTab === "script";
    const isHistoryWorkspaceTab = activeWorkpieceTab === "history";
    const thumbnailController = buildHearthThumbnailController({
      workspace: thumbnailWorkspace,
      canonical: canonicalThumbnailProjection,
      refreshThumbnails: () => void refreshEpisodePackage(),
      surfaceInput: {
      concepts: thumbnailConcepts,
      versions: thumbnailVersions,
      titleOptions: thumbnailTitleOptions,
      launchVariants,
      selectedTitleId: selectedThumbnailTitleId,
      selectedTitleText: selectedThumbnailTitle ? resolveHearthThumbnailOverlayText(selectedThumbnailTitle) : "",
      selectedConceptId: selectedThumbnailConceptId,
      selectedVersionId: selectedThumbnailVersionId,
      selectedLaunchVariantId,
      selectedLaunchVariantStatus: launchVariantStatusDraft,
      selectedLaunchVariantNotes: launchVariantNotesDraft,
      selectedLaunchVariantLastTestedAt: selectedLaunchVariant?.last_tested_at ?? null,
      selectedLaunchVariantWinnerSelectedAt: selectedLaunchVariant?.winner_selected_at ?? null,
      primaryVersionId: primaryThumbnailVersionId,
      selectedConceptLabel: thumbnailConceptLabelDraft,
      selectedConceptPrompt: thumbnailConceptPromptDraft,
      selectedConceptStylePreset: thumbnailConceptStyleDraft,
      selectedConceptTitleStyle: thumbnailTitleStyleDraft,
      brandTemplates: thumbnailBrandTemplates,
      brandTemplatesLoading: isThumbnailBrandTemplatesLoading,
      brandTemplatesError: thumbnailBrandTemplatesError,
      selectedConceptBrandTemplateId: thumbnailConceptBrandTemplateIdDraft,
      selectedBrandTemplateLogoDataUrl: thumbnailBrandLogoDataUrl,
      brandLogoUploading: isThumbnailBrandLogoUploading,
      brandLogoError: thumbnailBrandLogoError,
      brandLogoStatus: thumbnailBrandLogoStatus,
      aspect: thumbnailAspect,
      activeVisualProvider,
      visualProviderOptions,
      visualProviderOverride: planningSession?.visual_provider_override ?? null,
      safeZoneEnabled: thumbnailSafeZoneEnabled,
      previewDataUrl: thumbnailPreviewDataUrl,
      previewState: thumbnailPreviewState,
      previewError: thumbnailPreviewError,
      generateError: thumbnailGenerateError,
      uploadError: thumbnailUploadError,
      pairingError: thumbnailPairingError,
      canGenerateConcepts: !aiCreditsDepleted && thumbnailTitleOptions.length > 0,
      isGeneratingConcepts: activeProductionAction === "thumbnails" && isAiProcessing,
      canGenerateTitles: !aiCreditsDepleted,
      isGeneratingTitles: activeProductionAction === "seo" && isAiProcessing,
      isGenerating: isThumbnailGenerating,
      isSavingConcept: isThumbnailConceptSaving,
      isUploading: isThumbnailUploading,
      setSelectedConceptId: setSelectedThumbnailConceptId,
      setSelectedConceptLabel: setThumbnailConceptLabelDraft,
      setSelectedConceptPrompt: setThumbnailConceptPromptDraft,
      setSelectedConceptStyle: (value: string) => setThumbnailConceptStyleDraft(normalizeHearthVisualStyle(value)),
      setSelectedConceptTitleStyle: setThumbnailTitleStyleDraft,
      setSelectedConceptBrandTemplate: setThumbnailConceptBrandTemplateIdDraft,
      setAspect: setThumbnailAspect,
      setSafeZoneEnabled: setThumbnailSafeZoneEnabled,
      onGenerateTitles: () => void onRunProductionAction("seo"),
      onSelectTitle: onSelectThumbnailTitle,
      onUploadBrandLogo: (file: File) => void onUploadThumbnailBrandLogo(file),
      onRemoveBrandLogo: () => void onRemoveThumbnailBrandLogo(),
      onGenerateConcepts: () => void onRunProductionAction("thumbnails"),
      onCreateConcept: () => void onCreateThumbnailConcept(),
      onSaveConcept: () => void onSaveSelectedThumbnailConcept(),
      onDeleteConcept: () => void onDeleteSelectedThumbnailConcept(),
      onVisualProviderOverrideChange: handleVisualProviderOverrideChange,
      onUploadImage: (file: File) => void onUploadThumbnailImage(file),
      onSelectVersion: onSelectThumbnailVersion,
      onSetPrimary: (versionId: string) => void onSetPrimaryThumbnailVersion(versionId),
      onRetryVersion: (version: EpisodeThumbnailVersion) => void onRetryFailedThumbnailVersion(version),
      onSelectLaunchVariant,
      onCreateLaunchVariant,
      onSelectedLaunchVariantStatusChange: setLaunchVariantStatusDraft,
      onSelectedLaunchVariantNotesChange: setLaunchVariantNotesDraft,
      onSaveLaunchVariant: () => void onSaveLaunchVariant(),
      },
    });
    const visualPlanSurfaceInput = {
      entries: mediaMapEntries,
      canonicalItems: [
        ...imageMapEntries.map((entry) => ({
          id: entry.id,
          kind: "image" as const,
          focus: entry.anchor || entry.description,
          description: entry.description,
          status: entry.selected_asset_id ? "selected" : entry.status,
        })),
        ...brollBeats.map((beat) => ({
          id: beat.id,
          kind: "broll" as const,
          focus: beat.anchor_text || beat.description,
          description: beat.description,
          status: beat.selected_asset_id ? "selected" : beat.fulfillment_state ?? "planned",
        })),
        ...(canonicalReferenceClipState?.opportunities ?? []).map((opportunity) => ({
          id: opportunity.id,
          kind: "reference_clip" as const,
          focus: opportunity.focus,
          description: opportunity.editorialReason || opportunity.desiredMaterial,
          status: opportunity.selectedRevisionIds.length > 0 ? "selected" : opportunity.sourceStatus,
        })),
        ...(canonicalReferenceVisualState?.opportunities ?? []).map((opportunity) => ({
          id: opportunity.id,
          kind: "reference_visual" as const,
          focus: opportunity.focus,
          description: opportunity.editorialReason || opportunity.desiredMaterial,
          status: opportunity.selectedCandidateRevisionId ? "selected" : opportunity.sourceStatus,
        })),
      ],
      selectedEntryId: selectedMediaMapEntryId,
      approvedScriptVersion,
      mediaMap,
      saveState: mediaMapSaveState,
      saveError: mediaMapSaveError,
      packageState: episodePackageState,
      packageError: episodePackageError,
      generateDisabledReason: episodePackageState === "loading"
        ? "Episode package is loading."
        : episodePackageState === "error"
          ? (episodePackageError ?? "The episode package failed to load.")
          : episodePackageState !== "loaded" || !episodePackage
            ? "No episode package is available."
            : isApprovingScript
              ? "Script approval is in progress."
              : unifiedVisualPlanRecovery.retryBlocked
                ? "This Visual Plan has an unresolved provider submission. Normal retry is disabled; use recovery readback or API / Ledger."
              : isMediaMapBusy
                ? "A media-map operation is already in progress."
                : null,
      onRetryLoad: () => void refreshEpisodePackage(),
      canRecoverLastGeneration: Boolean(
        recoverableMediaMap
        && JSON.stringify(recoverableMediaMap) !== JSON.stringify(mediaMap)
      ),
      onRecoverLastGeneration: () => void onRecoverLastMediaMapGeneration(),
      message: mediaMapMessage,
      disabled: isApprovingScript || isMediaMapBusy || unifiedVisualPlanRecovery.retryBlocked || !episodePackage,
      operationStage: visualPlanOperationStage,
      generationScope: mediaMapGenerationScope,
      budgetPolicy: deriveFullMediaBudgetPolicy({ wordCount }),
      draft: {
        type: mediaMapTypeDraft,
        anchorMode: mediaMapAnchorModeDraft,
        anchorTarget: mediaMapAnchorTargetDraft,
        inOffsetSec: mediaMapInOffsetDraft,
        durationSec: mediaMapDurationDraft,
        description: mediaMapDescriptionDraft,
        intent: mediaMapIntentDraft,
        sourceStatus: mediaMapSourceStatusDraft,
        sourceAssetId: mediaMapSourceAssetIdDraft,
        confidence: mediaMapConfidenceDraft,
        optional: mediaMapOptionalDraft,
        critical: mediaMapCriticalDraft,
      },
      conversationState: mediaMapConversationState,
      conversationSeed: mediaMapConversationSeed,
      conversationError: mediaMapConversationError,
      onBuildAndApply: onBuildAndApplyMediaMapFromConversation,
      onSelectEntry: setSelectedMediaMapEntryId,
      onDraftChange: onMediaMapDraftChange,
      onGenerationScopeChange: onMediaMapGenerationScopeChange,
      onGenerateFromPlans: () => void onGenerateEpisodeMediaMapFromPlans(),
      onActivateMap: () => void onActivateEpisodeMediaMap(),
      onAddEntry: () => void onAddMediaMapEntry(),
      onSaveEntry: () => void onSaveMediaMapEntry(),
      onDeleteEntry: () => void onDeleteMediaMapEntry(),
    };
    const episodeImagesSurfaceInput = {
      panelTitle: "Timeline Images",
      manualOnly: false,
      entries: imageMapEntries,
      selectedEntryId: selectedImageMapEntryId,
      draftAnchor: imageMapAnchorDraft,
      draftDescription: imageMapDescriptionDraft,
      draftStylePreset: imageMapStyleDraft,
      draftIntent: imageMapIntentDraft,
      draftSourceType: imageMapSourceTypeDraft,
      draftVisualPriority: imageMapVisualPriorityDraft,
      draftVisualType: imageMapVisualTypeDraft,
      draftSectionIntentNote: imageMapSectionIntentNoteDraft,
      draftPlacementHint: imageMapPlacementHintDraft,
      saveState: imageMapSaveState,
      saveError: imageMapSaveError,
      expectedImageCount: plannedImageCount,
      exportMessage: imageMapExportMessage,
      activeVisualProvider,
      visualProviderOptions,
      visualProviderOverride: planningSession?.visual_provider_override ?? null,
      candidateCards: imageMapCandidateCards,
      candidateGenerateBusy: isImageMapCandidateGenerating,
      candidateGenerateError: imageMapCandidateError,
      candidateSelectBusy: isImageMapCandidateSelecting,
      candidateSelectionError: imageMapCandidateSelectionError,
      promptAuthorityState: imagePromptAuthority.state,
      anchorStatusLabel: imageMapAnchorStatusView?.label ?? null,
      anchorStatusTone: imageMapAnchorStatusView?.tone ?? "neutral",
      anchorStatusDetail: imageMapAnchorStatusView?.detail ?? null,
      reanchorMode: isImageMapReanchorMode,
      reanchorBusy: isImageMapReanchorSaving,
      reanchorDisabledReason: imageMapReanchorDisabledReason,
      nearestRepairAvailable: isImageMapNearestRepairAvailable,
      reanchorError: imageMapReanchorError,
      reanchorScriptSourceLabel: resolveCanonicalImageMapScriptSourceLabel(canonicalImageMapScriptState),
      reanchorScriptHint: resolveCanonicalImageMapScriptHint(canonicalImageMapScriptState),
      reanchorScriptLoading: canonicalImageMapScriptState.status === "loading",
      reanchorParagraphs: imageMapAnchorPickerParagraphs,
      activeAnchorLabel: imageMapActiveAnchorLabel,
      disabled: isApprovingScript || !episodePackage || imageMapAuthorityUnavailable,
      onRetryLoad: () => void refreshEpisodePackage(),
      onSelectEntry: setSelectedImageMapEntryId,
      onDraftAnchorChange: onImageMapDraftAnchorChange,
      onDraftDescriptionChange: onImageMapDraftDescriptionChange,
      onDraftStylePresetChange: onImageMapDraftStylePresetChange,
      onDraftIntentChange: onImageMapDraftIntentChange,
      onDraftSourceTypeChange: onImageMapDraftSourceTypeChange,
      onDraftVisualPriorityChange: onImageMapDraftVisualPriorityChange,
      onDraftVisualTypeChange: onImageMapDraftVisualTypeChange,
      onDraftSectionIntentNoteChange: onImageMapDraftSectionIntentNoteChange,
      onDraftPlacementHintChange: onImageMapDraftPlacementHintChange,
      onCreateEntry: () => {
        void onCreateImageMapEntry().then(() => {
          setShowScriptPanel(true);
          setIsImageMapReanchorMode(true);
        });
      },
      onDuplicateEntry: () => void onDuplicateImageMapEntry(),
      onDeleteEntry: () => void onDeleteImageMapEntry(),
      onSeedFromScript: () => void onSeedImageMapFromScript(),
      onGenerateCandidates: (mode?: "ai" | "stock") => void onGenerateImageMapCandidates(mode ?? "ai"),
      onInterpretPrompt: () => void imagePromptAuthority.interpret(),
      onSavePromptEdit: (finalPrompt: string) => void imagePromptAuthority.saveEdit(finalPrompt),
      onRefreshPrompt: () => void imagePromptAuthority.refresh(),
      onUploadAsset: (file: File) => void onUploadImageMapAsset(file),
      onUploadGenerationReference: (file: File, purpose: import("../lib/hearth-generation-reference").HearthGenerationReferencePurpose) => void onUploadImageMapGenerationReference(file, purpose),
      onRemoveGenerationReference: () => void onRemoveImageMapGenerationReference(),
      onSelectCandidate: (candidateId: string) => void onSelectImageMapCandidate(candidateId),
      onCopyExport: () => {
        void onCopyImageMapExportJson().then((copied) => {
          if (copied) acknowledgeCopy("image-map.export");
        });
      },
      copyExportAcknowledged: isCopyAcknowledged("image-map.export"),
      onDownloadExport: () => void onDownloadImageMapExportJson(),
      onVisualProviderOverrideChange: handleVisualProviderOverrideChange,
      onStartReanchor: onStartImageMapReanchor,
      onRepairNearestParagraph: () => void onRepairImageMapNearestParagraph(),
      onConvertToGlobalVisual: () => void onConvertImageMapToGlobalVisual(),
      onLeaveOrphaned: () => void onLeaveImageMapOrphaned(),
      onCancelReanchor: onCancelImageMapReanchor,
      onPickReanchor: (selection: ImageMapScriptSelection) => void onPickImageMapReanchor(selection),
    };
    const imagePlanningController = buildHearthImagePlanningController({
      active: Boolean(workpieceId),
      authorityAvailable: !imageMapAuthorityUnavailable,
      imageMapLoaded: imageMapProjectionLoaded,
      visualPlanEntryCount: plannedImageCount,
      visualPlanStale: shouldInvalidateMediaMapForScriptVersion(
        mediaMap?.script_version_id ?? null,
        approvedScriptVersion,
      ),
      canonicalEntryCount: imageMapEntries.length,
      selectedEntryCount: imageMapEntries.filter((entry) => Boolean(entry.selected_asset_id)).length,
      unresolvedEntryCount: imageMapEntries.filter(
        (entry) => !hasStructuredImageMapAnchor(entry),
      ).length,
      visualPlanBusy: isMediaMapBusy,
      visualPlanError: mediaMapSaveState === "error",
      repairBusy: isImageMapReanchorSaving,
      repairError: Boolean(imageMapReanchorError),
      generationBusy: isImageMapCandidateGenerating,
      generationError: Boolean(imageMapCandidateError),
      selectionBusy: isImageMapCandidateSelecting,
      selectionError: Boolean(imageMapCandidateSelectionError),
      retryImagePlanningLoad: () => void refreshEpisodePackage(),
      visualPlanSurfaceInput,
      episodeImagesSurfaceInput,
    });
    const brollSurfaceInput = {
      canonicalV2: true,
      workspaceId,
      canonicalPlanRevisionId: canonicalBrollV2.state.planRevisionId,
      canonicalPlanRevision: canonicalBrollV2.state.planRevision,
      beats: brollBeats,
      selectedBeatId: selectedBrollBeatId,
      workpieceId,
      coverageStrength: brollPlan?.coverage_strength ?? null,
      saveState: canonicalBrollV2.error ? "error" as const : canonicalBrollV2.busy || canonicalBrollV2.loading ? "saving" as const : "saved" as const,
      saveError: canonicalBrollV2.error,
      motionPromptError: canonicalBrollV2.motionPromptError,
      videoError: canonicalBrollV2.videoError,
      motionPromptQuote: canonicalBrollV2.motionPromptQuote,
      message: canonicalBrollV2.message,
      activeOperation: canonicalBrollV2.activeOperation,
      disabled: isApprovingScript || canonicalBrollV2.busy || canonicalBrollV2.loading || !episodePackage,
      draft: {
        anchorText: brollAnchorDraft,
        description: brollDescriptionDraft,
        motionIntent: brollMotionIntentDraft,
        assetCategory: brollAssetCategoryDraft,
        priority: brollPriorityDraft,
        keywords: brollKeywordsDraft,
        mood: brollMoodDraft,
        shotType: brollShotTypeDraft,
        motionSuggestion: brollMotionSuggestionDraft,
        suggestedDurationMs: brollSuggestedDurationDraft,
        placementHint: brollPlacementHintDraft,
        dataChartType: brollDataChartTypeDraft,
        dataTitle: brollDataTitleDraft,
        dataLabels: brollDataLabelsDraft,
        dataValues: brollDataValuesDraft,
        dataEmphasisKey: brollDataEmphasisKeyDraft,
        dataAnimationStyle: brollDataAnimationStyleDraft,
        providerId: brollProviderIdDraft,
        sourceLabel: brollSourceLabelDraft,
        sourceUrl: brollSourceUrlDraft,
        providerNote: brollProviderNoteDraft,
        usageNote: brollUsageNoteDraft,
        resultMetadata: brollResultMetadataDraft,
      },
      requestState: brollRequestStateLabel,
      providers: brollProviders,
      selectedCandidateId: selectedBrollBeat?.selected_asset_id ?? null,
      promptState: selectedBrollBeat ? canonicalBrollV2.state.promptsByBeat[selectedBrollBeat.id] ?? null : null,
      spendingQuote: canonicalBrollV2.spendingQuote,
      spendingReceipt: canonicalBrollV2.spendingReceipt,
      terminalGenerationAttempt: canonicalBrollV2.terminalGenerationAttempt,
      onSelectBeat: setSelectedBrollBeatId,
      onDraftChange: onBrollDraftChange,
      onSaveBeat: () => {},
      onDeleteBeat: () => {},
      onRegenerateBeat: () => {},
      onGeneratePlan: () => void canonicalBrollV2.generatePlan(readCanonicalScriptForImageMapGeneration),
      onGenerateMotionPrompt: (creatorDirection: string) => selectedBrollBeat ? void canonicalBrollV2.generatePrompt(selectedBrollBeat.id, creatorDirection) : undefined,
      onAcceptMotionPromptQuote: () => void canonicalBrollV2.acceptMotionPromptQuote(),
      onDismissMotionPromptQuote: canonicalBrollV2.dismissMotionPromptQuote,
      onSaveMotionPrompt: (finalPrompt: string) => selectedBrollBeat ? void canonicalBrollV2.editPrompt(selectedBrollBeat.id, finalPrompt) : undefined,
      onCreateRunwayReadyPrompt: () => selectedBrollBeat ? canonicalBrollV2.proposeRunwayPrompt(selectedBrollBeat.id) : Promise.resolve(null),
      onGenerateVideo: (referenceImages: Array<{ file: File; stageLabel?: string }>) => selectedBrollBeat ? void canonicalBrollV2.generateVideo(selectedBrollBeat.id, referenceImages) : undefined,
      onStartNewGenerationAttempt: () => void canonicalBrollV2.startNewGenerationAttempt(),
      onAcceptSpendingQuote: () => void canonicalBrollV2.acceptSpendingQuote(),
      onDismissSpendingQuote: canonicalBrollV2.dismissSpendingQuote,
      onFindStock: () => {},
      onUploadAsset: (file: File) => selectedBrollBeat ? void canonicalBrollV2.upload(selectedBrollBeat.id, file) : undefined,
      onSelectCandidate: (candidateId: string) => selectedBrollBeat ? void canonicalBrollV2.select(selectedBrollBeat.id, candidateId) : undefined,
      onRetryCandidateIngestion: () => void canonicalBrollV2.refresh(),
      onCopyPrompt: () => {
        const canonicalPrompt = selectedBrollBeat
          ? canonicalBrollV2.state.promptsByBeat[selectedBrollBeat.id]?.finalPrompt ?? null
          : null;
        if (!canonicalPrompt) return;
        void navigator.clipboard.writeText(canonicalPrompt).then(() => acknowledgeCopy("broll.prompt"));
      },
      copyPromptAcknowledged: isCopyAcknowledged("broll.prompt"),
      onDownloadBrief: () => void onDownloadBrollBrief("text"),
      onDownloadBriefJson: () => void onDownloadBrollBrief("json"),
      onOpenProvider: () => {},
      onMarkSent: () => {},
      onMarkAwaitingResult: () => {},
      onClearRequestState: () => {},
      onAttachResultFromUrl: () => selectedBrollBeat && brollSourceUrlDraft.trim() ? void canonicalBrollV2.attachExternal(selectedBrollBeat.id, brollSourceUrlDraft.trim()) : undefined,
    };
    const brollController = buildHearthBrollController({
      active: Boolean(workpieceId),
      loaded: episodePackageState === "loaded" && Boolean(episodePackage),
      loadFailed: episodePackageState === "error",
      authorityAvailable: imagePlanningController.status.authority === "available",
      visualPlanApplied: (
        mediaMap?.status === "activated"
        || mediaMap?.status === "fulfilling"
        || mediaMap?.status === "fulfilled"
        || mediaMap?.status === "needs_attention"
      ),
      visualPlanStale: imagePlanningController.state.visualPlan.stale,
      imagePlanningEligibility: imagePlanningController.brollEligibilityInput,
      beats: brollBeats,
      coverageStrength: brollPlan?.coverage_strength ?? null,
      busy: canonicalBrollV2.busy || canonicalBrollV2.loading,
      error: Boolean(canonicalBrollV2.error),
      retryBrollLoad: () => void canonicalBrollV2.refresh(),
      surfaceInput: brollSurfaceInput,
    });
    const referenceClipsSurfaceInput = {
      canonicalAuthorityExists: Boolean(canonicalReferenceClipState?.planRevisionId || canonicalReferenceVisualState?.planRevisionId),
      entries: referenceClipEntries,
      selectedEntryId: selectedReferenceClipEntryId,
      saveState: referenceClipSaveState,
      saveError: referenceClipSaveError,
      message: referenceClipMessage,
      disabled: isApprovingScript || isReferenceClipBusy || !episodePackage,
      workpieceId,
      draft: {
        anchorText: referenceClipAnchorDraft,
        description: referenceClipDescriptionDraft,
        placementHint: referenceClipPlacementHintDraft,
        format: referenceClipFormatDraft,
        dataType: referenceClipDataTypeDraft,
        contextType: referenceClipContextTypeDraft,
        tone: referenceClipToneDraft,
        motionLevel: referenceClipMotionLevelDraft,
        backgroundContextDescription: referenceClipBackgroundContextDraft,
        foregroundDataDescription: referenceClipForegroundDataDraft,
        visualStyle: referenceClipVisualStyleDraft,
        chartType: referenceClipChartTypeDraft,
        title: referenceClipTitleDraft,
        labels: referenceClipLabelsDraft,
        values: referenceClipValuesDraft,
        emphasisKey: referenceClipEmphasisKeyDraft,
        sourceType: referenceClipSourceTypeDraft,
        providerId: referenceClipProviderIdDraft,
        sourceLabel: referenceClipSourceLabelDraft,
        sourceUrl: referenceClipSourceUrlDraft,
        providerNote: referenceClipProviderNoteDraft,
        usageNote: referenceClipUsageNoteDraft,
        resultMetadata: referenceClipResultMetadataDraft,
      },
      requestState: referenceClipRequestStateLabel,
      providers: referenceClipProviders,
      activeVisualProviderLabel: activeVisualProvider.label,
      activeVisualProviderBanner: activeVisualProvider.bannerLabel,
      activeVisualProviderHelperText: activeVisualProvider.helperText,
      activePromptPack: activeVisualPromptPackForReferenceClip?.pack ?? null,
      selectedCandidateId: selectedReferenceClipEntry?.selected_asset_id ?? null,
      onSelectEntry: setSelectedReferenceClipEntryId,
      onDraftChange: onReferenceClipDraftChange,
      onCreateReferenceClip: () => void onCreateReferenceClipEntry(),
      onSaveEntry: () => void onSaveReferenceClipEntry(),
      onDeleteEntry: () => void onDeleteReferenceClipEntry(),
      onGenerateInForge: () => void onGenerateReferenceClipInForge(),
      onRegenerateStub: () => void onRegenerateReferenceClipEntryStub(),
      onUploadAsset: (file: File) => void onUploadReferenceClipAsset(file),
      onSelectCandidate: (candidateId: string) => void onSelectReferenceClipCandidate(candidateId),
      onCopyPrompt: () => {
        void onCopyReferenceClipPrompt().then((copied) => {
          if (copied) acknowledgeCopy("reference-clip.prompt");
        });
      },
      onCopyNegativePrompt: () => {
        void onCopyReferenceClipNegativePrompt().then((copied) => {
          if (copied) acknowledgeCopy("reference-clip.negative");
        });
      },
      copyPromptAcknowledged: isCopyAcknowledged("reference-clip.prompt"),
      copyNegativeAcknowledged: isCopyAcknowledged("reference-clip.negative"),
      onDownloadPromptPack: () => void onDownloadReferenceClipPromptPack(),
      onDownloadBrief: () => void onDownloadReferenceClipBrief("text"),
      onDownloadBriefJson: () => void onDownloadReferenceClipBrief("json"),
      onOpenProvider: () => void onOpenReferenceClipProvider(),
      onMarkSent: () => void onMarkReferenceClipRequestState("sent_external"),
      onMarkAwaitingResult: () => void onMarkReferenceClipRequestState("awaiting_result"),
      onClearRequestState: () => void onClearReferenceClipRequestState(),
      onAttachResultFromUrl: () => void onAttachReferenceClipResultFromUrl(),
    };
    const selectedReferenceClipAsset = selectedReferenceClipEntry?.candidate_assets?.find(
      (candidate) => candidate.asset_id === selectedReferenceClipEntry.selected_asset_id,
    ) ?? null;
    const referenceClipsController = buildHearthReferenceClipsController({
      active: Boolean(workpieceId),
      loaded: episodePackageState === "loaded" && Boolean(episodePackage),
      loadFailed: episodePackageState === "error",
      authorityAvailable: episodePackageState !== "error",
      entries: referenceClipEntries,
      promptActive: Boolean(activeVisualPromptPackForReferenceClip),
      busy: isReferenceClipBusy,
      error: referenceClipSaveState === "error",
      previewAvailable: Boolean(
        selectedReferenceClipAsset?.preview_path
        || selectedReferenceClipAsset?.thumbnail_path
        || selectedReferenceClipAsset?.path,
      ),
      retryReferenceClips: () => void refreshEpisodePackage(),
      surfaceInput: referenceClipsSurfaceInput,
    });
    const metadataController = buildHearthMetadataController({
      active: Boolean(workpieceId),
      loaded: episodePackageState === "loaded" && Boolean(episodePackage),
      loadFailed: episodePackageState === "error",
      authorityAvailable: episodePackageState !== "error",
      episodePackage,
      canonicalTitleCount: canonicalFramingTitleCount,
      canonicalTagCount: canonicalFramingTagCount,
      canonicalHasDescriptions: canonicalFramingHasDescriptions,
      displayedTitleCount: displayedFramingTitleCount,
      displayedTagCount: displayedFramingTagCount,
      framingPackReady,
      disabled: isApprovingScript || !episodePackage,
      tagSuggestions: metadataTagSuggestions,
      workspace: metadataWorkspace,
      retryMetadata: () => void refreshEpisodePackage(),
    });
    const productionController = buildHearthProductionController({
      package: episodePackage,
      packageStatus: episodePackageState,
      refreshPackage: () => void refreshEpisodePackage(),
      thumbnails: thumbnailController,
      imagePlanning: imagePlanningController,
      broll: brollController,
      referenceClips: referenceClipsController,
      metadata: metadataController,
      releasePreparation: releasePreparationController,
    });
    const productionViewModel = buildHearthProductionViewModel({
      controller: productionController,
      activeTab: activeWorkpieceTab,
      metadataPanelMeta: metadataController.meta,
      summary: {
        visuals: {
          visualCount: mediaWorkflowInput.visualPlan.total,
          briefCount: displayedThumbnailConceptCount,
          mediaMapStatus: String(canonicalMediaPlanStatus ?? "draft"),
          coverageLevel: canonicalMediaComplete ? "complete" : mediaMapCoverageLevel,
        },
        metadata: {
          titleCount: framingTitleCount,
          tagCount: displayedFramingTagCount,
          complete: metadataComplete,
          framingPackReady,
        },
      },
      metadata: {
        hasApprovedScript: hearthVisualsWorkspace.status.hasApprovedScript,
        approvedScriptVersion: hearthVisualsWorkspace.status.approvedScriptVersion,
        aiCreditsDepleted: hearthVisualsWorkspace.status.aiCreditsDepleted,
        isAiProcessing: hearthVisualsWorkspace.status.isAiProcessing,
        activeProductionAction: hearthVisualsWorkspace.status.activeProductionAction,
        releasePrepScriptVersion: hearthVisualsWorkspace.status.releasePrepScriptVersion,
        latestReleasePrepRawText: hearthVisualsWorkspace.status.latestReleasePrepRawText,
        releasePrepLoadState: hearthVisualsWorkspace.status.releasePrepLoadState,
        latestReleasePrepSections: hearthVisualsWorkspace.status.latestReleasePrepSections,
        onGenerateTitles: hearthVisualsWorkspace.commands.onGenerateTitles,
        onGenerateTags: hearthVisualsWorkspace.commands.onGenerateTags,
        onGenerateFramingPack: hearthVisualsWorkspace.commands.onGenerateFramingPack,
        onRefreshFramingPack: hearthVisualsWorkspace.commands.onRefreshFramingPack,
        onRecoverFraming,
        tagProposal: generatedTagProposal,
        canonicalTags: metadataTagsDraft,
        onReplaceTagProposal: () => onAcceptGeneratedTags("replace"),
        onMergeTagProposal: () => onAcceptGeneratedTags("merge"),
        onCancelTagProposal: () => setGeneratedTagProposal(null),
      },
      visuals: {
        hasApprovedScript: hearthVisualsWorkspace.status.hasApprovedScript,
        approvedScriptVersion: hearthVisualsWorkspace.status.approvedScriptVersion,
        workflowKey: workpieceId ?? "",
        workflowInput: mediaWorkflowInput,
        activeVisualProviderBanner: hearthVisualsWorkspace.status.activeVisualProviderBanner,
        activeVisualProviderHelperText: hearthVisualsWorkspace.status.activeVisualProviderHelperText,
        thumbnailAuthority: { workspaceId: workspaceId ?? null, workpieceId: workpieceId ?? null },
        onGenerateThumbnailConcepts: () => onRunProductionAction("thumbnails"),
        onRecoverThumbnailConcepts,
        onOpenThumbnailFraming: () => requestWorkpieceTabChange("metadata"),
        onCanonicalThumbnailProgress: canonicalThumbnailProjection.onCanonicalProgress,
        onCanonicalThumbnailRefresh: canonicalThumbnailProjection.refreshCanonical,
      },
    });
    const tabSummaryById: Record<WorkpieceWorkspaceTab, string> = {
      script: buildScriptTabSummary({
        hasApprovedScript,
        wordCount,
        updatedAt: activeDraft?.updatedAt,
        formatUpdatedAt,
      }),
      visuals: productionViewModel.tabSummaries.visuals,
      metadata: productionViewModel.tabSummaries.metadata,
      release: productionViewModel.tabSummaries.release,
      history: `${revisions.length} revisions · ${latestMilestoneRevision ? `Milestone ${formatUpdatedAt(latestMilestoneRevision.createdAt)}` : resolveHistoryMilestoneMarker(revisions)}`,
    };

    return (
      <HearthDraftMode
        scriptHeader={(
          <Suspense fallback={<div className="hs-muted-text-subtle">Loading script controls…</div>}>
            <HearthDraftScriptHeader
            isScriptWorkspaceTab={isScriptWorkspaceTab}
            workpieceId={workpieceId}
            activeDraft={activeDraft}
            formatUpdatedAt={formatUpdatedAt}
            activeUserDisplayName={activeUserDisplayName}
            resolveDraftEditorName={resolveDraftEditorName}
            composeModeLabel={composeModeLabel}
            completionBadgeLabel={completionBadgeLabel}
            scriptCompletionReasons={scriptCompletionReasons}
            onDraftTitleChange={onDraftTitleChange}
            onCreateDraft={onCreateDraft}
            onSaveDraft={onSaveDraft}
            isSaving={isSaving}
            onDeleteDraft={onDeleteDraft}
            openRevisionModal={openRevisionModal}
            openRevisionPanel={openRevisionPanel}
            onApproveScript={onApproveScript}
            onReviewForRecording={onReviewForRecording}
            onCompletePreflightReview={onCompletePreflightReview}
            onHandlePreflightFinding={onHandlePreflightFinding}
            preflightAuthority={preflightAuthority}
            preflightError={preflightError}
            isReviewingPreflight={isReviewingPreflight}
            onMarkReady={onMarkReady}
            isMarkingReady={isMarkingReady}
            hasScript={hasScript}
            isAiProcessing={isAiProcessing}
            isApprovingScript={isApprovingScript}
            approvalBlocked={approvalBlocked}
            activeTonePreset={activeTonePreset}
            onChangeTonePreset={onChangeTonePreset}
            tonePresetOptions={TONE_PRESET_OPTIONS}
            statusText={statusText}
            wordCount={wordCount}
            charCount={charCount}
            aiAutosaveWarning={aiAutosaveWarning}
            onRetryAiAutosave={onRetryAiAutosave}
            editingPeersCount={editingPeers.length}
            viewingPeersCount={viewingPeers.length}
            activeEditorName={activeEditorName}
            activeViewerName={activeViewerName}
            error={error}
            draftConflictState={draftConflictState}
            onReloadLatestDraftAfterConflict={onReloadLatestDraftAfterConflict}
            onCopyConflictLocalText={onCopyConflictLocalText}
            acknowledgeCopy={acknowledgeCopy}
            isCopyAcknowledged={isCopyAcknowledged}
            onDismissDraftConflict={() => setDraftConflictState(null)}
            displayedValidation={displayedValidation}
            validationIssueCount={validationIssueCount}
            buildValidationReport={buildValidationReport}
            onJumpToValidationIssue={onJumpToValidationIssue}
            onFixScriptFormattingNoAi={onFixScriptFormattingNoAi}
            onAskAiRepairScript={onAskAiRepairScript}
            aiEpisodeReady={aiEpisodeReady}
            aiCreditsDepleted={aiCreditsDepleted}
            ownerChatBlocked={ownerChatBlocked}
            isRepairingScript={isRepairingScript}
            onDismissValidation={() => setScriptValidation(null)}
            showManualDraft={showManualDraft}
            onToggleShowManualDraft={() => setShowManualDraft((prev) => !prev)}
            showScriptPanel={showScriptPanel}
            onToggleShowScriptPanel={() => setShowScriptPanel((prev) => !prev)}
            hasApprovedScript={hasApprovedScript}
            approvedScriptVersion={approvedScriptVersion}
            productionScriptStatus={!hasApprovedScript
              ? "Working Draft"
              : activeDraft && scriptApprovalState.approvedAt && activeDraft.updatedAt > scriptApprovalState.approvedAt
                ? "Draft Changed Since Approval"
                : "Approved for Production"}
            isVisualScriptMode={isVisualScriptMode}
            onToggleVisualScriptMode={onToggleVisualScriptMode}
            />
          </Suspense>
        )}
        workpieceTabProps={{
          activeTab: activeWorkpieceTab,
          tabSummaryById,
          tabDirtyById,
          onChangeTab: requestWorkpieceTabChange,
        }}
        draftStageClassName={`hs-draft-stage${(isHistoryWorkspaceTab || (isScriptWorkspaceTab && showScriptEditor)) ? " has-script-panel" : ""}`}
        chatSurfaceProps={conversationController.surface.chatSurfaceProps}
        productionContent={<HearthProductionContent viewModel={productionViewModel} />}
        historyVisible={isHistoryWorkspaceTab}
        revisionsContent={renderRevisionsView()}
        scriptSurfaceProps={buildHearthDraftScriptSurfaceProps({
          visible: isScriptWorkspaceTab,
          showScriptEditor,
          scriptPanelTitle,
          scriptPanelCopyMessage,
          scriptPanelCopyAcknowledged: isCopyAcknowledged("script-panel.copy"),
          scriptPanelHint,
          scriptPanelMetaText,
          scriptPanelBodyText,
          scriptPanelPlaceholder,
          isVisualScriptMode,
          visualScriptParagraphRail,
          isCanonicalImageMapScriptPanel,
          activeDraftExists: Boolean(scriptController.surfaces.script.draft),
          sourcesSummary,
          unusedSummary,
          canReviewSources: Boolean(workpieceId),
          sttLane,
          sttTarget,
          sttState,
          hasBrowserSpeech,
          sttNotice,
          sttError,
          bodyRef,
          copyIcon: <CopyIcon />,
          listeningIndicator: <OscilloscopeFill stream={mediaStreamRef.current} active />,
          onSetSttLane: (lane) => setSttLane(lane),
          onToggleScriptMic: () => onToggleMic("script"),
          onCopyScriptPanelText: () => {
            void onCopyScriptPanelText().then((copied) => {
              if (copied) acknowledgeCopy("script-panel.copy");
            });
          },
          onBodyChange: (nextBody) => {
            scriptController.commands.updateDraft.body(nextBody);
          },
          onBodyCompositionStart: () => setIsBodyComposing(true),
          onBodyCompositionEnd: () => setIsBodyComposing(false),
          onBodyCursorChange: (cursor) => setCursorPosition(cursor),
          onBodyScrollChange: (nextScrollTop) => setScrollTop(nextScrollTop),
          onReviewSources: () => {
            setFocusTab("sources");
            setMode("focus");
          },
        })}
      />
    );
  };

  const renderPlanningView = () => (
    <HearthPlanningMode
      sessionIntent={sessionIntent}
      sessionSparkId={sessionSparkId}
      syncSessionToTongs={syncSessionToTongs}
      planningSession={planningSession}
      workpieceId={workpieceId}
      sessionTouched={sessionTouched}
      sessionTitle={sessionTitle}
      onSessionTitleChange={(value) => {
        updatePlanningSession((prev) => ({
          ...prev,
          title: value,
        }));
      }}
      sessionGoalsText={sessionGoalsText}
      onSessionGoalsChange={(value) => {
        const nextGoals = parsePlanningLines(value);
        updatePlanningSession((prev) => ({
          ...prev,
          goals: nextGoals,
        }));
      }}
      sessionOutlineText={sessionOutlineText}
      onSessionOutlineChange={(value) => {
        const nextOutline = parsePlanningLines(value);
        updatePlanningSession((prev) => ({
          ...prev,
          outline: nextOutline,
        }));
      }}
      decisionDraft={decisionDraft}
      onDecisionDraftChange={setDecisionDraft}
      onAddDecision={onAddDecision}
      sessionDecisions={sessionDecisions}
      formatDecisionAt={formatDecisionAt}
      onUpdateDecision={onUpdateDecision}
      onRemoveDecision={onRemoveDecision}
    />
  );

  const renderSourcesView = sourcesController.surface.render;

  const renderRevisionsView = () => (
    <HearthRevisionsMode
      closeRevisionPanel={closeRevisionPanel}
      revisions={scriptController.surfaces.history.revisions}
      selectedRevision={scriptController.surfaces.history.selectedRevision}
      revisionView={scriptController.surfaces.history.view}
      formatUpdatedAt={formatUpdatedAt}
      selectRevisionPreview={selectRevisionPreview}
      selectRevisionCompare={selectRevisionCompare}
      onRestoreRevision={scriptController.commands.restoreRevision}
      updateSelectedRevisionDraftNote={updateSelectedRevisionDraftNote}
      onUpdateRevisionNote={onUpdateRevisionNote}
      renderSectionedBody={renderSectionedBody}
      diffLines={diffLines}
      diffCellClass={diffCellClass}
      isSavingRevision={isSavingRevision}
    />
  );

  const renderEpisodesView = () => (
    <HearthEpisodesMode
      isMobile={isMobile}
      startFromScratch={startFromScratch}
      isForging={isForging}
      onCreateDraft={onCreateDraft}
      openReadyInMobileOverlay={openReadyInMobileOverlay}
      searchRef={searchRef}
      searchText={searchText}
      setSearchText={setSearchText}
      sortKey={sortKey}
      setSortKey={setSortKey}
      filteredWorkpieceNavItems={filteredWorkpieceNavItems}
      draftsById={draftsById}
      workpieceId={workpieceId}
      archivingWorkpieceIds={archivingWorkpieceIds}
      restoringWorkpieceIds={restoringWorkpieceIds}
      openWorkpieceInFocus={openWorkpieceInFocus}
      resolveWorkpiecePresenceClass={presenceController.surface.resolveWorkpiecePresenceClass}
      resolveWorkpiecePresenceBadge={presenceController.surface.resolveWorkpiecePresenceBadge}
      formatUpdatedAt={formatUpdatedAt}
      resolveDraftEditorName={resolveDraftEditorName}
      saveDraftMeta={saveDraftMeta}
      onRestoreWorkpiece={onRestoreWorkpiece}
      onArchiveWorkpiece={onArchiveWorkpiece}
      onDeleteDraft={onDeleteDraft}
    />
  );

  const renderReadyView = () => (
    <HearthReadyMode
      readyTotalCount={readyTotalCount}
      isReadyScriptsLoading={isReadyScriptsLoading}
      refreshReadyScripts={refreshReadyScripts}
      removedReadyCount={removedReadyCount}
      onRestoreRemovedReady={onRestoreRemovedReady}
      isRestoringReady={isRestoringReady}
      readyScriptsError={readyScriptsError}
      orderedReadyScripts={orderedReadyScripts}
      draggingReadyId={draggingReadyId}
      onStartDraggingReady={setDraggingReadyId}
      onStopDraggingReady={() => setDraggingReadyId(null)}
      onDropReadyOnEntry={(targetId) => {
        if (draggingReadyId) onReorderReady(draggingReadyId, targetId);
        setDraggingReadyId(null);
      }}
      updatingReadyCategoryId={updatingReadyCategoryId}
      onReadyLabelChange={onReadyLabelChange}
      onOpenReadyScriptInHearth={onOpenReadyScriptInHearth}
      onSendBackToEdit={onSendBackToEdit}
      sendingBackReadyIds={sendingBackReadyIds}
      resolveReadyOpenHref={resolveReadyOpenHref}
      onRemoveFromReady={onRemoveFromReady}
      removingReadyIds={removingReadyIds}
      resolveReadyAttribution={resolveReadyAttribution}
      resolveReadyLabel={resolveReadyLabel}
    />
  );

  const renderSeriesView = () => {
    return (
      <HearthSeriesMode
        seriesEntries={seriesEntries}
        resolveReadyAttribution={resolveReadyAttribution}
        onOpenSeriesEntry={(entry) => void openWorkpieceInFocus(entry.workpieceId, {
          workspaceId: entry.workspaceId,
          preferredDraftId: entry.workpieceId,
        })}
      />
    );
  };

  const renderFocusEditor = () => {
    return (
      <HearthFocusMode
        hasActiveEpisode={hasActiveEpisode}
        onGoToEpisodes={() => setMode("episodes")}
        activeWorkpieceIsArchived={Boolean(activeWorkpieceContext.workpiece?.isArchived)}
        activeWorkpieceTitle={activeWorkpieceContext.workpiece?.title ?? "Episode"}
        activeWorkpieceArchiveReason={activeWorkpieceContext.workpiece?.archiveReason ?? null}
        activeWorkpieceId={activeWorkpieceContext.workpiece?.workpieceId ?? null}
        isRestoringArchivedWorkpiece={Boolean(
          activeWorkpieceContext.workpiece
          && restoringWorkpieceIds.includes(activeWorkpieceContext.workpiece.workpieceId),
        )}
        onRestoreArchivedWorkpiece={() => {
          const archivedWorkpieceId = activeWorkpieceContext.workpiece?.workpieceId;
          if (!archivedWorkpieceId) return;
          return onRestoreWorkpiece(archivedWorkpieceId, { openAfterRestore: true });
        }}
        hasActiveDraft={Boolean(activeDraft)}
        onRetryDraftHydration={() => {
          if (!workpieceId) return;
          return openWorkpieceInFocus(workpieceId, {
            preferredDraftId: session?.activeDraftId ?? null,
          });
        }}
        workpieceId={workpieceId}
        focusTab={focusTab}
        renderPlanningView={renderPlanningView}
        renderSourcesView={renderSourcesView}
        renderRevisionsView={renderRevisionsView}
        renderDraftView={renderDraftView}
      />
    );
  };

  const showSparkRouteBootstrap = Boolean(
    incomingBarStockIntakeRoute && routeSparkId && !routeProjectId && !hasActiveEpisode && !forgeError,
  );

  const mainContent = (
    <HearthMainContentSwitch
      showSparkRouteBootstrap={showSparkRouteBootstrap}
      mode={mode}
      renderSparkRouteBootstrapView={renderSparkRouteBootstrapView}
      renderSparksView={renderSparksView}
      renderEpisodesView={renderEpisodesView}
      renderReadyView={renderReadyView}
      renderSeriesView={renderSeriesView}
      renderFocusEditor={renderFocusEditor}
    />
  );
  const mobileMainContent = incomingBarStockIntakeRoute && routeSparkId && !routeProjectId && !hasActiveEpisode
    ? renderSparkRouteBootstrapView()
    : renderEpisodesView();

  const shouldShowWorkpieceId = useCallback(
    (title: string) => duplicateRailTitleKeys.has(normalizeRailTitleKey(title)),
    [duplicateRailTitleKeys],
  );
  const {
    openReady: onOpenReadyView,
    focusDraft: onFocusDraft,
    focusPlanning: onFocusPlanning,
    focusSources: onFocusSources,
    focusRevisions: onFocusRevisions,
    openApiLedger: onOpenApiLedger,
  } = useHearthDesktopNavigationCommands({
    hasActiveEpisode,
    setFocusTab,
    setMode,
  });
  const onRestoreActiveWorkpiece = useCallback(() => {
    if (!activeWorkpiece) return;
    return onRestoreWorkpiece(activeWorkpiece.workpieceId, { openAfterRestore: true });
  }, [activeWorkpiece, onRestoreWorkpiece]);
  const onRestoreMobileWorkpiece = useCallback(() => {
    const targetWorkpiece = activeWorkpieceContext.workpiece;
    if (!targetWorkpiece) return;
    return onRestoreWorkpiece(targetWorkpiece.workpieceId, { openAfterRestore: true });
  }, [activeWorkpieceContext.workpiece, onRestoreWorkpiece]);
  const onDeleteActiveDraftBuffer = useCallback(() => {
    if (!activeDraft) return;
    return onDeleteDraft(activeDraft);
  }, [activeDraft, onDeleteDraft]);
  const mobileNavigationViewModel = buildHearthMobileNavigationViewModel({
    isMobile,
    mobileOverlayView,
    activeDraftTitle: activeDraft?.title,
    closeMobileOverlay,
    openReadyInMobileOverlay,
    isActiveWorkpieceArchived: Boolean(activeWorkpieceContext.workpiece?.isArchived),
    hasActiveWorkpiece: Boolean(activeWorkpieceContext.workpiece),
    activeWorkpieceId: activeWorkpieceContext.workpiece?.workpieceId ?? null,
    restoringWorkpieceIds,
    onRestoreWorkpiece: onRestoreMobileWorkpiece,
    hasActiveDraft: Boolean(activeDraft),
    isSaving,
    onDeleteDraftBuffer: onDeleteActiveDraftBuffer,
    onSaveDraft,
    refreshReadyScripts,
    isReadyScriptsLoading,
    renderFocusContent: renderFocusEditor,
    renderReadyContent: renderReadyView,
  });
  const desktopRailViewModel = buildHearthDesktopRailViewModel({
    deferDesktopRailCollections,
    readyTotalCount,
    refreshReadyScripts,
    isReadyScriptsLoading,
    readyScriptsError,
    readyCategoryError,
    readyUrgencyLabelFresh: READY_URGENCY_LABEL.fresh,
    readyUrgencyLabelCooling: READY_URGENCY_LABEL.cooling,
    readyUrgencyLabelCold: READY_URGENCY_LABEL.cold,
    readyUrgencyFreshCount: readyUrgencyCounts.fresh,
    readyUrgencyCoolingCount: readyUrgencyCounts.cooling,
    readyUrgencyColdCount: readyUrgencyCounts.cold,
    removedReadyCount,
    onOpenReadyView,
    onRestoreRemovedReady,
    isRestoringReady,
    searchRef,
    searchText,
    onSearchTextChange: setSearchText,
    sortKey,
    onSortKeyChange: setSortKey,
    showArchived,
    onShowArchivedChange: setShowArchived,
    isLoading,
    isWorkpiecesLoading,
    workpiecesError,
    filteredWorkpieceNavItems,
    draftsById,
    workpieceId,
    editingDraftId,
    setEditingDraftId,
    editingTitle,
    setEditingTitle,
    shouldShowWorkpieceId,
    archivingWorkpieceIds,
    restoringWorkpieceIds,
    openWorkpieceInFocus,
    formatUpdatedAt,
    resolveDraftEditorName,
    saveDraftMeta,
    onRenameWorkpiece: async (targetWorkpieceId: string, title: string) => {
      if (!workspaceId) throw new Error("workspace_required");
      await renameHearthCollectionWorkpiece({ workspaceId, workpieceId: targetWorkpieceId, title });
      await refreshWorkpieces(workspaceId, { includeArchived: showArchived });
    },
    onRestoreWorkpiece,
    onArchiveWorkpiece,
    onDeleteDraft,
    hasActiveEpisode,
    activeEpisodeReadyStatus,
    activeWorkpieceIsArchived,
    activeWorkpieceArchiveReason: activeWorkpiece?.archiveReason ?? null,
    isRestoringActiveWorkpiece: Boolean(
      activeWorkpiece && restoringWorkpieceIds.includes(activeWorkpiece.workpieceId),
    ),
    onRestoreActiveWorkpiece,
    openInAnvilHref: anvilHandoffController.surface.openInAnvilHref,
    handoffBlocked: anvilHandoffController.surface.handoffBlocked,
    onOpenInAnvil: anvilHandoffController.surface.onOpenInAnvil,
    anvilStepModeHint: anvilHandoffController.surface.anvilStepModeHint,
    mode,
    focusTab,
    wordCount,
    revisionsCount: revisions.length,
    missingSourcesCount,
    unusedSourcesCount,
    devMode,
    onFocusDraft,
    onFocusPlanning,
    onFocusSources,
    onFocusRevisions,
    onOpenApiLedger,
  });
  const modalViewModel = buildHearthModalViewModel({
    composeModalOpen,
    productionDefaults,
    onCloseComposeModal: () => setComposeModalOpen(false),
    onComposeSetupSubmit,
    revisionModalOpen,
    revisionKind,
    onRevisionKindChange: setRevisionKind,
    revisionNote,
    onRevisionNoteChange: setRevisionNote,
    closeRevisionModal,
    onConfirmRevision,
    activeDraftId: activeDraft?.id ?? null,
  });

  return (
    <section className={`hs-shell hs-density-${uiDensity}${isMobile ? " hs-shell--mobile" : ""}`}>
      {isMobile ? (
        <main className="hs-main hs-main--mobile">
          {mobileMainContent}
        </main>
      ) : (
        <HearthDesktopFrame
          devMode={devMode}
          storeKind={storeKind}
          workpieceId={workpieceId}
          isForging={isForging}
          onStartFromScratch={startFromScratch}
          onCreateDraft={onCreateDraft}
          mode={mode}
          onModeChange={setMode}
          uiDensity={uiDensity}
          onUiDensityChange={setUiDensity}
          railContent={(
            <HearthDesktopRail {...desktopRailViewModel} />
          )}
          mainContent={mainContent}
        />
      )}

      <HearthMobileNavigation {...mobileNavigationViewModel} />

      <HearthShellModals {...modalViewModel} />
    </section>
  );
}


