import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createDraft, type Draft } from "../domain/draft";
import type { HearthPlanningSession, HearthSessionDecision, HearthSessionOrigin } from "../domain/hearth-session";
import { HEARTH_SESSION_SCHEMA } from "../domain/hearth-session";
import { createRevision, type Revision, type RevisionKind } from "../domain/revision";
import type { HearthSession } from "../domain/session";
import {
  type BarStockSpark,
  enqueueBarStockSpark,
  resolveBarStockSparkHearthWorkpieceId,
  resolveBarstockSparkIdFromQuery,
  upsertBarStockSpark,
  writeBarStockSparks,
} from "../lib/barstock-sparks";
import {
  resolveBarstockProjectIdFromQuery,
} from "../lib/barstock-project-links";
import SourcesView from "../views/SourcesView";
import "./HearthShell.css";
import { createHearthWorkpiece } from "../lib/hearth-workpiece";
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
  type HearthAiLane,
  type HearthChatMessage,
  type HearthInteractionEventType,
} from "../lib/hearth-chat-api";
import { writeHearthAiRuntimeStatus } from "../lib/ai-runtime-status";
import { commitHearthSession } from "../lib/hearth-session-repo";
import {
  commitHearthPrimaryScript,
  getHearthPrimaryScriptPath,
  readHearthPrimaryScript,
} from "../lib/hearth-script-repo";
import {
  archiveHearthWorkpiece,
  listHearthWorkpieces,
  restoreHearthWorkpiece,
  type HearthWorkpieceSummary,
} from "../lib/hearth-workpieces";
import {
  choosePreferredHydratedDraft,
  draftHasUsableScriptBody,
  hydrateDraftBodyFromCanonicalScript,
} from "../lib/hearth-draft-hydration";
import {
  selectActiveWorkpieceContext,
  selectDraftForWorkpiece,
  selectWorkpieceNavItems,
} from "../lib/hearth-nav-model";
import { mirrorApprovedScriptToLocal } from "../lib/hearth-script-mirror";
import {
  listHearthReadyScripts,
  removeHearthReadyScripts,
  reorderHearthReadyScripts,
  setHearthReadyScriptCategory,
  setHearthReadyScriptHidden,
  updateHearthReadyQueueState,
  type HearthContentCategory,
  type HearthReadyScript,
} from "../lib/hearth-ready-scripts";
import {
  listHearthWorkpiecePresence,
  upsertHearthWorkpiecePresence,
  type HearthWorkpiecePresence,
} from "../lib/hearth-presence";
import { resolveTongsRequestApiToken } from "../lib/tongs-fetch";
import { useSourcesState } from "../hooks/useSourcesState";
import {
  useChatWorkspace,
  useChatWorkspaceHistory,
  useChatWorkspaceProposal,
  useChatWorkspaceRuntime,
  useChatWorkspaceStt,
  useChatWorkspaceState,
} from "../hooks/useChatWorkspace";
import { useHearthAutosave } from "../hooks/useHearthAutosave";
import { useApprovalFlow } from "../hooks/useApprovalFlow";
import { useHearthVisualsWorkspace } from "../hooks/useHearthVisualsWorkspace";
import { useHearthFocusOpenActions } from "../hooks/useHearthFocusOpenActions";
import { useHearthInitialLoader } from "../hooks/useHearthInitialLoader";
import { useHearthWorkspaceResetLifecycle } from "../hooks/useHearthWorkspaceResetLifecycle";
import { useHearthIntakeLifecycle } from "../hooks/useHearthIntakeLifecycle";
import { useHearthSparkDiscovery } from "../hooks/useHearthSparkDiscovery";
import { useHearthWorkspaceSessionLifecycle } from "../hooks/useHearthWorkspaceSessionLifecycle";
import { useHearthDraftController } from "../hooks/useHearthDraftController";
import { useHearthScriptRepairActions } from "../hooks/useHearthScriptRepairActions";
import { useHearthWorkpieceTabLifecycle } from "../hooks/useHearthWorkpieceTabLifecycle";
import { useClipboardButtonAcks } from "../hooks/useClipboardButtonAcks";
import { useScriptWorkspace } from "../hooks/useScriptWorkspace";
import { useScriptWorkspaceReadModel } from "../hooks/useScriptWorkspaceReadModel";
import { useMediaMapWorkspace } from "../hooks/visuals/useMediaMapWorkspace";
import { useMetadataWorkspace } from "../hooks/visuals/useMetadataWorkspace";
import { useImageMapWorkspace } from "../hooks/visuals/useImageMapWorkspace";
import { useBrollWorkspace } from "../hooks/visuals/useBrollWorkspace";
import { useReferenceClipWorkspace } from "../hooks/visuals/useReferenceClipWorkspace";
import { useThumbnailWorkspace } from "../hooks/visuals/useThumbnailWorkspace";
import { useMediaMapEntryActions } from "../hooks/visuals/useMediaMapEntryActions";
import { useMediaMapGenerationActions } from "../hooks/visuals/useMediaMapGenerationActions";
import { useBrollCoreActions } from "../hooks/visuals/useBrollCoreActions";
import { useBrollBridgeActions } from "../hooks/visuals/useBrollBridgeActions";
import { useReferenceClipCoreActions } from "../hooks/visuals/useReferenceClipCoreActions";
import { useReferenceClipBridgeActions } from "../hooks/visuals/useReferenceClipBridgeActions";
import { useThumbnailConceptActions } from "../hooks/visuals/useThumbnailConceptActions";
import { useThumbnailGenerationActions } from "../hooks/visuals/useThumbnailGenerationActions";
import { useImageMapReanchorActions } from "../hooks/visuals/useImageMapReanchorActions";
import { useImageMapCandidateActions } from "../hooks/visuals/useImageMapCandidateActions";
import { useImageMapEntryCrudActions } from "../hooks/visuals/useImageMapEntryCrudActions";
import { useImageMapSeedExportActions } from "../hooks/visuals/useImageMapSeedExportActions";
import { useMediaMapSourcePreparation } from "../hooks/visuals/useMediaMapSourcePreparation";
import { useImageMapViewActions } from "../hooks/visuals/useImageMapViewActions";
import { useCanonicalImageMapScriptReader } from "../hooks/visuals/useCanonicalImageMapScriptReader";
import { useVisualsPersistence } from "../hooks/visuals/useVisualsPersistence";
import { useReleasePrepPackWorkspace } from "../hooks/visuals/useReleasePrepPackWorkspace";
import { useEpisodePackageLoader } from "../hooks/visuals/useEpisodePackageLoader";
import { useThumbnailPreviewLoader } from "../hooks/visuals/useThumbnailPreviewLoader";
import { useImageMapCandidatePreviewLoader } from "../hooks/visuals/useImageMapCandidatePreviewLoader";
import { useVisualWorkspaceResetLifecycle } from "../hooks/visuals/useVisualWorkspaceResetLifecycle";
import { useMediaMapConversationBootstrap } from "../hooks/visuals/useMediaMapConversationBootstrap";
import { useCanonicalImageMapScriptStateLoader } from "../hooks/visuals/useCanonicalImageMapScriptStateLoader";
import { useVisualSelectionHydration } from "../hooks/visuals/useVisualSelectionHydration";
import {
  buildThumbnailPanelProps,
  buildBrollPlanPanelProps,
  buildImageMapPanelProps,
  buildMediaMapPanelProps,
  buildReferenceClipPlanPanelProps,
} from "../hooks/visuals/buildVisualsPanelProps";
import { resolveWorkpieceId, resolveWorkspaceId } from "../lib/sources-repo";
import { createHearthStore } from "../storage/store-factory";
import type { HearthStoreKind } from "../storage/hearth-store";
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
  resetHearthProposalBodyOp,
  updateHearthProposalBodyOp,
} from "../lib/hearth-ai-proposal";
import { getHearthAnvilStepModeHint } from "../lib/hearth-anvil-handoff";
import {
  deriveFullScriptAuthoringMeta,
  deriveOutlineScriptAuthoringMeta,
} from "../lib/hearth-script-authoring-meta";
import { insertVoiceTranscriptIntoScript } from "../lib/hearth-script-dictation";
import {
  buildNoScriptChangesExplanation,
  detectHearthScriptMutationIntent,
} from "../lib/hearth-script-mutation";
import {
  normalizeScriptTags,
  repairScriptTags,
  type ScriptValidationResult,
  type ScriptValidationIssue,
} from "@forge/shared/script-tags";
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
  isExplicitHearthFullScriptRequest,
  isExplicitHearthOutlineRequest,
  readLastHearthWritingFormat,
  resolveHearthWritingFormatRequest,
  writeLastHearthWritingFormat,
  type HearthWritingFormat,
} from "../lib/hearth-writing-format";
import { inferSpeakersFromScript } from "../lib/compose-content-validation";
import { buildComposePrompt } from "../lib/compose-prompt";
import ComposeSetupModal from "../ui/ComposeSetupModal";
import ChatSurface from "../views/surfaces/ChatSurface";
import HistorySurface from "../views/surfaces/HistorySurface";
import MetadataSurface from "../views/surfaces/MetadataSurface";
import ReleaseSurface from "../views/surfaces/ReleaseSurface";
import ScriptSurface from "../views/surfaces/ScriptSurface";
import VisualsSurface from "../views/surfaces/VisualsSurface";
import WorkpieceTabBar from "../views/surfaces/WorkpieceTabBar";
import {
  PRODUCTION_ACTION_LABEL,
  persistProductionArtifact as persistHearthProductionArtifact,
  runProductionAction,
  type ProductionAction,
} from "../lib/hearth-production-actions";
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
  generateImageMapEntriesFromBulletScript,
} from "../lib/hearth-spoken-beats";
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
  type MediaMapConversationSeed,
} from "../lib/hearth-media-map-conversation";
import { buildMediaMapFromExistingPlans } from "../lib/hearth-media-map-builder";
import type {
  EpisodeBrollDataVisualSpec,
  EpisodeExternalRequestState,
  EpisodeReferenceClipPlan,
  EpisodeReferenceClipTone,
  EpisodeBrollPlan,
  EpisodeBrollPlanBeat,
  EpisodeContextualDataCompositePlan,
  EpisodeMediaMap,
  EpisodeMediaMapEntry,
  EpisodePackageV2,
  EpisodeSpokenBeat,
  EpisodeLaunchVariant,
  EpisodeLaunchVariantStatus,
  EpisodeThumbnailConcept,
  EpisodeThumbnailVersion,
  EpisodeImageMapEntry,
} from "../lib/episode-package-v2";
import {
  buildBulletBeatAnchorLabel,
  buildImageMapAnchorLabel,
  normalizeSeoTags,
  resolvePrimarySeoTitle,
  updateImageMapEntry,
} from "../lib/episode-package-v2";
import {
  DEFAULT_HEARTH_VISUAL_STYLE,
  normalizeHearthVisualStyle,
} from "../lib/hearth-visual-styles";
import {
  normalizeWorkpieceWorkspaceTab,
  resolveHistoryMilestoneMarker,
  resolveMediaPlanCoverageLevel,
  resolveMediaPlanScopeLabel,
  resolveReleaseReadinessChecklist,
  resolveRestoredWorkpieceWorkspaceTab,
  type WorkpieceWorkspaceTab,
} from "../lib/hearth-workpiece-tab-shell";
import {
  loadWorkspaceThumbnailBrandLogoPreview,
  listWorkspaceThumbnailBrandTemplates,
  resolveDefaultThumbnailBrandTemplate,
  seedWorkspaceThumbnailBrandTemplates,
} from "../lib/hearth-thumbnail-brand-templates";
import type { ThumbnailBrandTemplate } from "../lib/hearth-thumbnail-brand-templates";
import {
  areEpisodeThumbnailTitleStylesEqual,
  normalizeEpisodeThumbnailTitleStyle,
} from "../lib/hearth-title-fonts";
import type {
  EpisodeThumbnailTitleStyle,
} from "../lib/hearth-title-fonts";
import {
  deriveHearthThumbnailOverlayText,
  resolveHearthThumbnailOverlayText,
} from "../lib/hearth-thumbnail-title-contract";
import { formatThumbnailPanelMeta } from "../lib/hearth-thumbnail-workflow";
import { MobilePage, useLayoutMode } from "@forge/ui-mobile";
import {
  getMyWritingProfile,
  setMyWritingTonePreset,
  updateStyleProfileFromReadyCheckpoint,
  type WritingProfile,
} from "../lib/hearth-style-service";

const AUTOSAVE_DELAY_MS = 2200;
const AUTOSAVE_MIN_GAP_MS = 5000;
const AUTOSAVE_REVISION_GAP_MS = 5 * 60 * 1000;
const SESSION_SAVE_DELAY_MS = 500;
const STORE_KIND_KEY = "hearth_store_kind";
const DEV_MODE_KEY = "tp_dev_mode";
const MODE_STORAGE_PREFIX = "hearth:ui:mode:v1:";
const UI_DENSITY_STORAGE_PREFIX = "hearth:ui:density:v1:";
const WORKPIECE_TAB_STORAGE_PREFIX = "hearth:workpiece-tab:v1:";
const WORKSPACE_TAB_STORAGE_PREFIX = "hearth:workspace-tab:v1:";
const LAST_WORKPIECE_TAB_STORAGE_KEY = "hearth:workpiece-tab:last:v1";
const SCRIPT_APPROVAL_STORAGE_PREFIX = "hearth:script-approval:v1:";
const CHAT_HISTORY_STORAGE_PREFIX = "hearth:chat:v1:";
const CHAT_HISTORY_MAX_MESSAGES = 200;
const CHAT_HISTORY_MAX_STORAGE_CHARS = 650_000;
const CHAT_HISTORY_MAX_ENTRY_CHARS = 24_000;
const CHAT_HISTORY_WRITE_DEBOUNCE_MS = 350;
const CHAT_HISTORY_TRUNCATED_SUFFIX = "\n\n[truncated in local cache]";
const WORKSPACE_STORAGE_KEYS = new Set(["forge_workspace_id_v1", "barstock_workspace_id"]);
const FORGE_AUTH_STORAGE_KEY = "forge-auth";
const SUPABASE_AUTH_KEY_RE = /supabase-auth-token/i;
const PROJECT_PENDING_WORKPIECE_PREFIX = "hearth:project-pending-workpiece:v1:";
const AI_STT_MAX_DURATION_MS = 5 * 60 * 1000;
const AI_STT_MAX_BYTES = 10 * 1024 * 1024;
const STT_INLINE_FEEDBACK_MS = 2200;
const STT_PREVIEW_MAX_CHARS = 80;
const PRESENCE_HEARTBEAT_MS = 25_000;
const ANVIL_SCRIPT_PATH = getHearthPrimaryScriptPath();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type HearthMode = "sparks" | "episodes" | "ready" | "series" | "focus";
type UiDensity = "comfortable" | "compact";
type FocusTab = "draft" | "planning" | "sources" | "revisions";
type SttLane = "browser" | "ai";
type SttState = "idle" | "listening" | "transcribing";
type AiAutosaveReasonCode = "ai_outline" | "ai_script" | "ai_repair" | "ai_rewrite";
type AiAutosaveReason = `autosave:${AiAutosaveReasonCode}`;
type ForgeNoticeSeverity = "info" | "success" | "warning" | "error";
type ForgeNoticeJob =
  | "image-generated"
  | "script-completed"
  | "sources-found"
  | "save-failed"
  | "render-finished"
  | "export-finished"
  | "job-failed";

type ForgeNoticeDetail = {
  tool: "hearth";
  job: ForgeNoticeJob;
  title: string;
  message?: string;
  route?: string;
  workspaceId?: string;
  workpieceId?: string;
  severity: ForgeNoticeSeverity;
  timestamp: number;
};

type ScriptApprovalState = {
  hasApprovedScript: boolean;
  approvedScriptVersion: number | null;
  approvedAt: number | null;
};

type ApprovalPersistenceStatus = {
  cloud: "ok";
  local: "ok" | "failed";
  localPath?: string;
  localMessage?: string;
};

type HearthUserContext = {
  userId: string | null;
  displayName: string;
};

type DraftConflictState = {
  message: string;
  localBody: string;
};

type CanonicalImageMapScriptState = {
  status: "idle" | "loading" | "ready" | "error";
  text: string | null;
  source: "primary_script" | "saved_draft" | null;
  includesUnsavedLocalEdits: boolean;
  error: string | null;
};

const TONE_PRESET_OPTIONS = [
  { value: "neutral_conversational", label: "Neutral conversational" },
  { value: "newsroom_neutral", label: "Newsroom neutral" },
  { value: "spicy_but_safe", label: "Spicy but safe" },
] as const;
const DEFAULT_TONE_PRESET = "neutral_conversational";
const EMPTY_WORKPIECE_SUMMARY_LIST: HearthWorkpieceSummary[] = [];
const EMPTY_READY_SCRIPT_LIST: HearthReadyScript[] = [];
const FORGE_NOTICE_EVENT = "forge:notice";
const WORKPIECE_WORKSPACE_TABS: WorkpieceWorkspaceTab[] = ["script", "visuals", "metadata", "release", "history"];
const TAB_SWITCH_UNSAVED_WARNING = "You have unsaved changes in this tab. Switch anyway?";

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeRailTitleKey(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

function buildCurrentForgeNoticeRoute(workspaceId: string | null, workpieceId: string | null): string | null {
  if (typeof window === "undefined") return null;
  const nextUrl = new URL(window.location.href);
  const normalizedWorkspaceId = readTrimmedString(workspaceId);
  const normalizedWorkpieceId = readTrimmedString(workpieceId);
  if (normalizedWorkspaceId) {
    nextUrl.searchParams.set("workspace_id", normalizedWorkspaceId);
  }
  if (normalizedWorkpieceId) {
    nextUrl.searchParams.set("workpiece_id", normalizedWorkpieceId);
  }
  return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
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

function normalizeUuid(value: unknown): string | null {
  const str = readTrimmedString(value);
  if (!str) return null;
  return UUID_RE.test(str) ? str.toLowerCase() : null;
}

function normalizeTonePreset(value: unknown): string | null {
  const raw = readTrimmedString(value);
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  return TONE_PRESET_OPTIONS.some((option) => option.value === normalized)
    ? normalized
    : null;
}

function resolveImageMapAnchorStatusView(args: {
  status: "attached" | "beat" | "weak_match" | "orphaned" | "global";
  scriptState: CanonicalImageMapScriptState;
}): { label: string; tone: "neutral" | "ok" | "warning" | "danger"; detail: string } {
  if (args.status === "global") {
    return {
      label: "global",
      tone: "neutral",
      detail: "This visual intent is global and intentionally not attached to a single script span.",
    };
  }
  if (args.status === "orphaned") {
    return {
      label: "orphaned",
      tone: "danger",
      detail: "This visual anchor is orphaned. Repair it deterministically or convert it to a global visual intent.",
    };
  }
  if (args.status === "beat") {
    return {
      label: "beat anchored",
      tone: "ok",
      detail: "This visual beat is attached to an editorial bullet beat and can be refined against the real transcript after recording.",
    };
  }
  if (args.scriptState.status === "loading") {
    return {
      label: args.status === "weak_match" ? "weak match" : "attached",
      tone: "neutral",
      detail: "Validating this structured anchor against the current canonical script.",
    };
  }
  if (args.scriptState.status === "error") {
    return {
      label: "weak match",
      tone: "warning",
      detail: args.scriptState.error ?? "Hearth could not load the current canonical script to verify this anchor.",
    };
  }
  if (args.status === "attached") {
    return {
      label: "attached",
      tone: "ok",
      detail: "This visual beat is anchored to an exact span in the current canonical script.",
    };
  }
  return {
    label: "weak match",
    tone: "warning",
    detail: "This structured anchor no longer has an exact match, but deterministic repair options are available.",
  };
}

function resolveCanonicalImageMapScriptSourceLabel(state: CanonicalImageMapScriptState): string | null {
  if (state.status !== "ready" || !state.source) return null;
  return state.source === "primary_script" ? "Source: published script" : "Source: saved draft";
}

function resolveCanonicalImageMapScriptHint(state: CanonicalImageMapScriptState): string | null {
  if (state.status === "error") return state.error;
  if (state.status !== "ready") return null;
  if (state.includesUnsavedLocalEdits) {
    return "Unsaved local script edits are not included here. Re-anchoring uses the current canonical saved script.";
  }
  return "Pick the exact sentence or paragraph that should drive still generation for this beat.";
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

function normalizeGreetingName(name: string | null): string {
  const raw = (name ?? "").trim();
  if (!raw) return "Creator";
  const seed = raw.includes("@") ? (raw.split("@")[0] ?? "").trim() : raw;
  const words = seed
    .replace(/[._-]+/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!words.length) return "Creator";
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
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

function resolveStoreKind(): HearthStoreKind {
  if (typeof window === "undefined") return "tongs";
  if (!isDevMode()) return "tongs";

  try {
    const params = new URLSearchParams(window.location.search);
    const requested = (params.get("store") ?? params.get("hearthStore") ?? "")
      .trim()
      .toLowerCase();

    if (requested === "tongs" || requested === "local") {
      try {
        window.localStorage.setItem(STORE_KIND_KEY, requested);
      } catch {
        // Ignore storage failures (private mode, access blocked, etc.).
      }
      return requested as HearthStoreKind;
    }
  } catch {
    // Ignore URL parsing failures and fall back to localStorage.
  }

  try {
    const saved = window.localStorage.getItem(STORE_KIND_KEY)?.trim().toLowerCase();
    if (saved === "tongs" || saved === "local") {
      return saved as HearthStoreKind;
    }
  } catch {
    // Ignore storage failures and fall back to tongs.
  }

  return "tongs";
}

function isDevMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has("dev") || params.get("dev") === "1") return true;
  } catch {
    // Ignore query parsing failures.
  }
  try {
    if (window.localStorage.getItem(DEV_MODE_KEY) === "1") return true;
  } catch {
    // Ignore storage failures.
  }
  try {
    const w = window as typeof window & {
      __TP_DEV?: unknown;
      __TP_DEV1?: unknown;
      __tpDevMode?: unknown;
    };
    if (w.__TP_DEV || w.__TP_DEV1 || w.__tpDevMode) return true;
  } catch {
    // Ignore global inspection failures.
  }
  return false;
}

function readMode(workpieceId: string | null): HearthMode | null {
  if (!workpieceId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${MODE_STORAGE_PREFIX}${workpieceId}`);
    if (!raw) return null;
    const trimmed = raw.trim();
    if (trimmed === "home") return "sparks";
    if (trimmed === "draft" || trimmed === "planning" || trimmed === "sources" || trimmed === "revisions") {
      return "focus";
    }
    if (
      trimmed === "sparks"
      || trimmed === "episodes"
      || trimmed === "ready"
      || trimmed === "series"
      || trimmed === "focus"
    ) {
      return trimmed as HearthMode;
    }
  } catch {
    // ignore storage failures
  }
  return null;
}

function writeMode(workpieceId: string | null, mode: HearthMode): void {
  if (!workpieceId || typeof window === "undefined") return;
  if (mode === "sparks") return;
  try {
    window.localStorage.setItem(`${MODE_STORAGE_PREFIX}${workpieceId}`, mode);
  } catch {
    // ignore storage failures
  }
}

function readWorkpieceWorkspaceTab(workpieceId: string | null, workspaceId: string | null): WorkpieceWorkspaceTab {
  if (typeof window === "undefined") return "script";
  try {
    return resolveRestoredWorkpieceWorkspaceTab({
      workpieceTab: workpieceId ? window.localStorage.getItem(`${WORKPIECE_TAB_STORAGE_PREFIX}${workpieceId}`) : null,
      workspaceTab: workspaceId ? window.localStorage.getItem(`${WORKSPACE_TAB_STORAGE_PREFIX}${workspaceId}`) : null,
      lastTab: window.localStorage.getItem(LAST_WORKPIECE_TAB_STORAGE_KEY),
    });
  } catch {
    // ignore storage failures
  }
  return "script";
}

function writeWorkpieceWorkspaceTab(workpieceId: string | null, workspaceId: string | null, tab: WorkpieceWorkspaceTab): void {
  if (typeof window === "undefined") return;
  try {
    const normalizedTab = normalizeWorkpieceWorkspaceTab(tab);
    if (workpieceId) {
      window.localStorage.setItem(`${WORKPIECE_TAB_STORAGE_PREFIX}${workpieceId}`, normalizedTab);
    }
    if (workspaceId) {
      window.localStorage.setItem(`${WORKSPACE_TAB_STORAGE_PREFIX}${workspaceId}`, normalizedTab);
    }
    window.localStorage.setItem(LAST_WORKPIECE_TAB_STORAGE_KEY, normalizedTab);
  } catch {
    // ignore storage failures
  }
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
  const trimmed = content.trim();
  if (!trimmed) return "";
  if (trimmed.length <= CHAT_HISTORY_MAX_ENTRY_CHARS) return trimmed;
  const maxLength = Math.max(1, CHAT_HISTORY_MAX_ENTRY_CHARS - CHAT_HISTORY_TRUNCATED_SUFFIX.length);
  return `${trimmed.slice(0, maxLength)}${CHAT_HISTORY_TRUNCATED_SUFFIX}`;
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
  const normalized = messages
    .map((entry) => sanitizeChatMessageForStorage(entry))
    .filter((entry): entry is HearthChatMessage => Boolean(entry));

  const out: HearthChatMessage[] = [];
  let totalChars = 0;
  for (let idx = normalized.length - 1; idx >= 0; idx -= 1) {
    if (out.length >= CHAT_HISTORY_MAX_MESSAGES) break;
    const message = normalized[idx]!;
    const nextChars = totalChars + message.content.length;
    if (out.length > 0 && nextChars > CHAT_HISTORY_MAX_STORAGE_CHARS) break;
    out.push(message);
    totalChars = nextChars;
  }
  return out.reverse();
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
      window.localStorage.removeItem(historyKey);
      return;
    }
    window.localStorage.setItem(historyKey, JSON.stringify(sanitized));
  } catch {
    // ignore storage failures
  }
}

function readScriptApprovalState(workpieceId: string | null): ScriptApprovalState {
  const fallback: ScriptApprovalState = {
    hasApprovedScript: false,
    approvedScriptVersion: null,
    approvedAt: null,
  };
  if (!workpieceId || typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(`${SCRIPT_APPROVAL_STORAGE_PREFIX}${workpieceId}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ScriptApprovalState>;
    const version = typeof parsed.approvedScriptVersion === "number" && parsed.approvedScriptVersion > 0
      ? parsed.approvedScriptVersion
      : null;
    const approvedAt = typeof parsed.approvedAt === "number" && Number.isFinite(parsed.approvedAt)
      ? parsed.approvedAt
      : null;
    return {
      hasApprovedScript: Boolean(parsed.hasApprovedScript && version),
      approvedScriptVersion: version,
      approvedAt,
    };
  } catch {
    return fallback;
  }
}

function writeScriptApprovalState(workpieceId: string | null, value: ScriptApprovalState): void {
  if (!workpieceId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${SCRIPT_APPROVAL_STORAGE_PREFIX}${workpieceId}`, JSON.stringify(value));
  } catch {
    // ignore storage failures
  }
}

function parseApprovedVersionFromNote(note: string | undefined): number | null {
  if (!note) return null;
  const normalized = note.trim();
  if (!normalized) return null;
  const tagged = normalized.match(/script_version_approved:v(\d+)/i);
  if (tagged) {
    const parsed = Number.parseInt(tagged[1] ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  const plain = normalized.match(/script\s+version\s+(\d+)\s+approved/i);
  if (plain) {
    const parsed = Number.parseInt(plain[1] ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function nextApprovedScriptVersion(revisions: Revision[]): number {
  const maxVersion = revisions.reduce((max, revision) => {
    if (revision.kind !== "milestone") return max;
    const parsed = parseApprovedVersionFromNote(revision.note);
    return parsed && parsed > max ? parsed : max;
  }, 0);
  return maxVersion + 1;
}

function findLatestApprovedScript(revisions: Revision[]): { version: number; approvedAt: number } | null {
  let latest: { version: number; approvedAt: number } | null = null;
  for (const revision of revisions) {
    if (revision.kind !== "milestone") continue;
    const version = parseApprovedVersionFromNote(revision.note);
    if (!version) continue;
    if (!latest || version > latest.version || (version === latest.version && revision.createdAt > latest.approvedAt)) {
      latest = {
        version,
        approvedAt: revision.createdAt,
      };
    }
  }
  return latest;
}

function isScriptApprovalStateEqual(a: ScriptApprovalState, b: ScriptApprovalState): boolean {
  return a.hasApprovedScript === b.hasApprovedScript
    && a.approvedScriptVersion === b.approvedScriptVersion
    && a.approvedAt === b.approvedAt;
}

function hasExplicitWorkpieceQuery(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const query = new URLSearchParams(window.location.search);
    const keys = ["workpiece_id", "workpieceId", "workpiece", "cradle_id", "cradleId"];
    return keys.some((key) => Boolean(query.get(key)?.trim()));
  } catch {
    return false;
  }
}

function hasIncomingBarStockIntakeQuery(): boolean {
  if (typeof window === "undefined") return false;
  if (hasExplicitWorkpieceQuery()) return false;
  try {
    const query = new URLSearchParams(window.location.search);
    const keys = [
      "spark_id",
      "sparkId",
      "barstock_spark_id",
      "project_id",
      "projectId",
      "barstock_project_id",
    ];
    return keys.some((key) => Boolean(query.get(key)?.trim()));
  } catch {
    return false;
  }
}

function replaceHearthRouteContext(workspaceId: string | null, workpieceId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(window.location.search);
    const workspaceKeys = ["workspace_id", "workspaceId", "workspace"];
    const workpieceKeys = ["workpiece_id", "workpieceId", "workpiece", "cradle_id", "cradleId"];
    const intakeKeys = [
      "spark_id",
      "sparkId",
      "barstock_spark_id",
      "project_id",
      "projectId",
      "barstock_project_id",
    ];

    for (const key of [...workspaceKeys, ...workpieceKeys, ...intakeKeys]) {
      params.delete(key);
    }

    const normalizedWorkspaceId = normalizeUuid(workspaceId);
    const normalizedWorkpieceId = normalizeUuid(workpieceId);
    if (normalizedWorkspaceId) {
      params.set("workspace_id", normalizedWorkspaceId);
    }
    if (normalizedWorkpieceId) {
      params.set("workpiece_id", normalizedWorkpieceId);
    }

    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
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

function readWorkspaceUiDensity(workspaceId: string | null): UiDensity {
  if (!workspaceId || typeof window === "undefined") return "comfortable";
  try {
    const raw = window.localStorage.getItem(`${UI_DENSITY_STORAGE_PREFIX}${workspaceId}`)?.trim().toLowerCase();
    if (raw === "compact") return "compact";
  } catch {
    // ignore storage failures
  }
  return "comfortable";
}

function writeWorkspaceUiDensity(workspaceId: string | null, density: UiDensity): void {
  if (!workspaceId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${UI_DENSITY_STORAGE_PREFIX}${workspaceId}`, density);
  } catch {
    // ignore storage failures
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

function resolveVisualRequestStateLabel(state: EpisodeExternalRequestState | null | undefined): string {
  switch (state) {
    case "brief_exported":
      return "brief_exported";
    case "sent_external":
      return "sent_external";
    case "awaiting_result":
      return "awaiting_result";
    case "asset_attached":
      return "asset_attached";
    case "resolved":
      return "resolved";
    default:
      return "planned";
  }
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="9" y="9" width="11" height="11" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M15 6V5a2 2 0 0 0-2-2H5A2 2 0 0 0 3 5v8a2 2 0 0 0 2 2h1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatUpdatedAt(value: number | undefined): string {
  if (!value) return "Unknown";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function formatRelativeUpdatedAt(value: number | undefined): string {
  if (!value) return "unknown";
  const diffMs = Date.now() - value;
  const absMs = Math.abs(diffMs);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const weekMs = 7 * dayMs;

  const formatUnit = (unit: Intl.RelativeTimeFormatUnit, amount: number): string => {
    try {
      return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(amount, unit);
    } catch {
      const abs = Math.abs(amount);
      const suffix = amount <= 0 ? "ago" : "from now";
      return `${abs} ${unit}${abs === 1 ? "" : "s"} ${suffix}`;
    }
  };

  if (absMs < hourMs) {
    return formatUnit("minute", -Math.max(1, Math.round(absMs / minuteMs)));
  }
  if (absMs < dayMs) {
    return formatUnit("hour", -Math.round(absMs / hourMs));
  }
  if (absMs < weekMs) {
    return formatUnit("day", -Math.round(absMs / dayMs));
  }
  return formatUnit("week", -Math.round(absMs / weekMs));
}

function dedupeDraftListById(input: Draft[]): Draft[] {
  const byId = new Map<string, Draft>();
  for (const draft of input) {
    const existing = byId.get(draft.id);
    if (!existing) {
      byId.set(draft.id, draft);
      continue;
    }
    const existingUpdatedAt = existing.updatedAt ?? existing.createdAt ?? 0;
    const nextUpdatedAt = draft.updatedAt ?? draft.createdAt ?? 0;
    if (nextUpdatedAt >= existingUpdatedAt) {
      byId.set(draft.id, draft);
    }
  }
  return [...byId.values()];
}

function buildDraftAttribution(user: HearthUserContext): { userId: string | null; displayName: string | null } {
  const displayName = user.displayName.trim() || "Creator";
  return {
    userId: user.userId,
    displayName,
  };
}

function resolveDraftEditorName(draft: Draft | null | undefined): string {
  const fromUpdated = draft?.updatedBy?.displayName?.trim();
  if (fromUpdated) return fromUpdated;
  const fromCreated = draft?.createdBy?.displayName?.trim();
  if (fromCreated) return fromCreated;
  return "Unknown";
}

function parseDraftConflictError(error: unknown): DraftConflictState | null {
  if (!error || typeof error !== "object") return null;
  const row = error as {
    code?: unknown;
    details?: unknown;
  };
  if (row.code !== "draft_conflict") return null;
  const details = row.details && typeof row.details === "object"
    ? row.details as Record<string, unknown>
    : null;
  const currentUpdatedAt = readTrimmedString(details?.current_updated_at);
  const currentLabel = currentUpdatedAt ? new Date(currentUpdatedAt).toLocaleString() : "a newer save";
  return {
    message: `This draft changed on another client at ${currentLabel}. Reload latest to continue.`,
    localBody: "",
  };
}

function parseIsoTimestamp(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function shortenUserIdForUi(value: string | null | undefined): string {
  const userId = readTrimmedString(value);
  if (!userId) return "Unknown";
  if (userId.length <= 12) return userId;
  return `${userId.slice(0, 8)}...`;
}

function createThumbnailClientId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const METADATA_TAG_SUGGESTIONS_BY_CATEGORY: Record<string, string[]> = {
  evergreen: ["evergreen", "how-to", "timeless"],
  hot_topic: ["news", "breaking", "analysis"],
  viral_reaction: ["reaction", "trending", "viral"],
  strategic_anchor: ["strategy", "framework", "playbook"],
  community: ["community", "feedback", "q-and-a"],
  reflective: ["reflection", "lessons", "behind-the-scenes"],
  explainer: ["explainer", "guide", "deep-dive"],
  experimental: ["experiment", "prototype", "iteration"],
  backup: ["backup", "quick-hit", "short-form"],
};

function normalizeMetadataTag(tag: string): string | null {
  const cleaned = tag
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || null;
}

function parseMetadataTagInput(input: string): string[] {
  return input
    .split(/[,\n]/g)
    .map((part) => normalizeMetadataTag(part))
    .filter((value): value is string => Boolean(value));
}

function buildMetadataTagSuggestions(args: {
  currentTags: string[];
  contentCategory: string | null;
}): string[] {
  const normalizedExisting = normalizeSeoTags(args.currentTags);
  const existingSet = new Set(normalizedExisting);
  const suggestions = new Set<string>();

  const categoryTags = args.contentCategory ? (METADATA_TAG_SUGGESTIONS_BY_CATEGORY[args.contentCategory] ?? []) : [];
  for (const tag of categoryTags) {
    const normalized = normalizeMetadataTag(tag);
    if (normalized) suggestions.add(normalized);
  }

  for (const tag of normalizedExisting.slice(0, 5)) {
    const tip = normalizeMetadataTag(`${tag}-tips`);
    const guide = normalizeMetadataTag(`${tag}-guide`);
    if (tip) suggestions.add(tip);
    if (guide) suggestions.add(guide);
  }

  for (const base of ["creator", "content-strategy", "video-essay"]) {
    const normalized = normalizeMetadataTag(base);
    if (normalized) suggestions.add(normalized);
  }

  return [...suggestions].filter((tag) => !existingSet.has(tag)).slice(0, 10);
}

function deriveReadyUrgency(entry: HearthReadyScript, nowMs = Date.now()): ReadyUrgencyLevel | null {
  if (!entry.contentCategory || !READY_URGENCY_APPLICABLE_CATEGORY_SET.has(entry.contentCategory)) {
    return null;
  }
  const approvedAtMs = parseIsoTimestamp(entry.updatedAt);
  if (!approvedAtMs) return null;
  const ageMs = Math.max(0, nowMs - approvedAtMs);
  if (ageMs <= 48 * 60 * 60 * 1000) return "fresh";
  if (ageMs <= 5 * 24 * 60 * 60 * 1000) return "warming";
  if (ageMs <= 10 * 24 * 60 * 60 * 1000) return "cooling";
  return "cold";
}

function reorderVisibleReadyEntries(
  entries: readonly HearthReadyScript[],
  fromId: string,
  toId: string,
): HearthReadyScript[] {
  if (!fromId || !toId || fromId === toId) return [...entries];

  const visible = entries.filter((entry) => !entry.hiddenAt);
  const fromIndex = visible.findIndex((entry) => entry.id === fromId);
  const toIndex = visible.findIndex((entry) => entry.id === toId);
  if (fromIndex < 0 || toIndex < 0) return [...entries];

  const reorderedVisible = visible.slice();
  const [moved] = reorderedVisible.splice(fromIndex, 1);
  if (!moved) return [...entries];
  reorderedVisible.splice(toIndex, 0, moved);

  let visibleIndex = 0;
  return entries.map((entry) => {
    if (entry.hiddenAt) return entry;
    const next = reorderedVisible[visibleIndex] ?? entry;
    visibleIndex += 1;
    return next;
  });
}

function normalizeTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed || "Untitled Draft";
}

function countWords(text: string): number {
  const matches = text.trim().match(/\b\w+\b/g);
  return matches ? matches.length : 0;
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
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

type ChatIntentSignals = {
  requestedOutline: boolean;
  requestedScript: boolean;
  explicitDraftNow: boolean;
  hasDeliverable: boolean;
  scriptMutationIntent: ReturnType<typeof detectHearthScriptMutationIntent>;
};

function detectChatIntentSignals(text: string): ChatIntentSignals {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  const requestedOutline = isExplicitHearthOutlineRequest(normalized);
  const requestedScript = isExplicitHearthFullScriptRequest(normalized);
  const scriptMutationIntent = detectHearthScriptMutationIntent(normalized);
  const explicitDraftNow = /\bdraft now\b/.test(normalized)
    || /\bskip questions\b/.test(normalized)
    || /\bno questions\b/.test(normalized);
  const hasDeliverable = requestedOutline
    || requestedScript
    || scriptMutationIntent.targetsScriptBody
    || /\bbullet points?\b/.test(normalized)
    || /\bthumbnail\b/.test(normalized)
    || /\bseo\b/.test(normalized)
    || /\btags?\b/.test(normalized);
  return {
    requestedOutline,
    requestedScript,
    explicitDraftNow,
    hasDeliverable,
    scriptMutationIntent,
  };
}

function detectAiAutosaveReasonCode(text: string): AiAutosaveReasonCode {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return "ai_rewrite";
  if (/\b(correct|repair|fix|tag audit|cleanup)\b/.test(normalized)) return "ai_repair";
  if (/\b(rewrite|improve|shorten|punch up|edit|revise|polish|tighten)\b/.test(normalized)) return "ai_rewrite";
  if (isExplicitHearthOutlineRequest(normalized)) return "ai_outline";
  if (isExplicitHearthFullScriptRequest(normalized)) return "ai_script";
  return "ai_rewrite";
}

function readLatestOutlineFromOps(ops: HearthOp[]): string | null {
  for (let idx = ops.length - 1; idx >= 0; idx -= 1) {
    const op = ops[idx];
    if (op?.op !== "set_outline") continue;
    const outline = op.value.trim();
    return outline.length ? outline : null;
  }
  return null;
}

function buildAssistantMessageContent(args: {
  assistantText: string;
  ops: HearthOp[];
  autosaveReasonCode: AiAutosaveReasonCode;
  scriptMutationRequested: boolean;
  scriptMutationReady: boolean;
}): string {
  const assistantText = args.assistantText.trim();
  const outlineFromOps = readLatestOutlineFromOps(args.ops);

  if (args.scriptMutationRequested && !args.scriptMutationReady) {
    if (assistantText) return assistantText;
    if (outlineFromOps) {
      return `No script changes made.\n\n${outlineFromOps}`;
    }
    return "No script changes made.";
  }

  if (args.autosaveReasonCode === "ai_outline") {
    if (outlineFromOps) {
      if (!assistantText) {
        return `I took a first pass at a bullet outline:\n${outlineFromOps}`;
      }
      if (assistantText.includes(outlineFromOps)) {
        return assistantText;
      }
      return `${assistantText}\n\n${outlineFromOps}`;
    }
  }

  if (assistantText) return assistantText;
  if (args.ops.length > 0) return "I took a first pass. Have a look and we can tighten it from there.";
  return "I’m ready when you are.";
}

function toAiAutosaveReason(reasonCode: AiAutosaveReasonCode): AiAutosaveReason {
  return `autosave:${reasonCode}`;
}

function countProducerQuestions(text: string): number {
  const lines = splitLines(text);
  let count = 0;
  for (const line of lines) {
    if (/^\s*\d+[).]\s+/.test(line)) {
      count += 1;
    }
  }
  if (count > 0) return count;
  const fallback = text.match(/\?/g)?.length ?? 0;
  if (fallback <= 0) return 0;
  return Math.min(3, fallback);
}

function OscilloscopeFill({
  stream,
  active,
}: {
  stream: MediaStream | null;
  active: boolean;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const ro = new ResizeObserver(() => {
      const r = host.getBoundingClientRect();
      const w = Math.max(1, Math.floor(r.width));
      const h = Math.max(1, Math.floor(r.height));
      setSize({ w, h });
    });

    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active || !stream) return;

    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const AudioCtx = window.AudioContext || (window as Window & typeof globalThis & {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;
    if (!AudioCtx) return;
    const audioCtx = new AudioCtx();
    audioCtxRef.current = audioCtx;

    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.85;
    source.connect(analyser);

    const bufferLength = analyser.fftSize;
    const data = new Uint8Array(bufferLength);
    const computed = getComputedStyle(canvas);
    const stroke = computed.color || "#aaa";

    const draw = () => {
      rafRef.current = window.requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(data);

      const w = canvas.width;
      const h = canvas.height;
      ctx2d.clearRect(0, 0, w, h);

      ctx2d.lineWidth = 1;
      ctx2d.strokeStyle = stroke;
      ctx2d.beginPath();

      const mid = h / 2;
      const slice = w / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i += 1) {
        const v = (data[i] - 128) / 128;
        const y = mid + v * (mid * 0.9);
        if (i === 0) ctx2d.moveTo(x, y);
        else ctx2d.lineTo(x, y);
        x += slice;
      }
      ctx2d.stroke();
    };

    draw();

    return () => {
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = null;
      try {
        source.disconnect();
      } catch {
        // ignore disconnect errors
      }
      try {
        analyser.disconnect();
      } catch {
        // ignore disconnect errors
      }
      void audioCtx.close().catch(() => {
        // ignore close errors
      });
      audioCtxRef.current = null;
    };
  }, [active, size.h, size.w, stream]);

  if (!active) return null;

  return (
    <div ref={hostRef} className="hs-stt-oscHost">
      <canvas
        ref={canvasRef}
        className="hs-stt-oscCanvas"
        width={size.w}
        height={size.h}
        aria-hidden="true"
      />
    </div>
  );
}

type SortKey = "updated" | "title";
type ReadyUrgencyLevel = "fresh" | "warming" | "cooling" | "cold";
type ReadyLabel = "hot" | "evergreen" | "series";

type DraftSnapshot = {
  title: string;
  body: string;
  updatedAt: number;
};

type DiffLine = {
  left: string;
  right: string;
  status: "same" | "changed" | "added" | "removed" | "separator";
};

type PendingAiProposal = {
  assistantText: string;
  ops: HearthOp[];
  originalOps: HearthOp[];
  selected: boolean[];
  context: EpisodeContext;
  fromGate: boolean;
  autosaveReasonCode: AiAutosaveReasonCode;
};

const READY_URGENCY_APPLICABLE_CATEGORY_SET = new Set<HearthContentCategory>([
  "hot_topic",
  "viral_reaction",
]);

const READY_URGENCY_LABEL: Record<ReadyUrgencyLevel, string> = {
  fresh: "Fresh",
  warming: "Warming",
  cooling: "Cooling",
  cold: "Cold",
};

const READY_LABEL_TO_CATEGORY: Record<ReadyLabel, HearthContentCategory> = {
  hot: "hot_topic",
  evergreen: "evergreen",
  series: "strategic_anchor",
};

function resolveReadyLabel(entry: HearthReadyScript): ReadyLabel {
  if (entry.contentCategory === "hot_topic" || entry.contentCategory === "viral_reaction") return "hot";
  if (entry.contentCategory === "strategic_anchor") return "series";
  return "evergreen";
}

function buildDiffLines(current: string, revision: string): DiffLine[] {
  const leftLines = splitLines(current);
  const rightLines = splitLines(revision);
  const maxLen = Math.max(leftLines.length, rightLines.length);
  const out: DiffLine[] = [];

  for (let i = 0; i < maxLen; i += 1) {
    const left = leftLines[i] ?? "";
    const right = rightLines[i] ?? "";
    const leftTrim = left.trim();
    const rightTrim = right.trim();
    if (leftTrim === "---" || rightTrim === "---") {
      out.push({ left, right, status: "separator" });
      continue;
    }
    if (!left && right) {
      out.push({ left, right, status: "added" });
      continue;
    }
    if (left && !right) {
      out.push({ left, right, status: "removed" });
      continue;
    }
    out.push({ left, right, status: left === right ? "same" : "changed" });
  }
  return out;
}

function diffCellClass(side: "left" | "right", status: DiffLine["status"]): string {
  const classes = ["hs-diff-cell"];
  if (status === "removed" && side === "left") classes.push("is-removed");
  if (status === "added" && side === "right") classes.push("is-added");
  if (status === "changed") {
    classes.push(side === "left" ? "is-changed-left" : "is-changed-right");
  }
  return classes.join(" ");
}

function formatSparkDate(value: number | undefined): string {
  if (!value) return "Unknown";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return String(value);
  }
}

function deriveSparkTitle(spark: BarStockSpark): string {
  const title = spark.title?.trim();
  if (title) return title;
  const line = spark.body.split(/\r?\n/).find((chunk) => chunk.trim());
  if (line) return line.trim().slice(0, 60);
  return "Untitled Spark";
}

function buildSparkPreview(text: string): string {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const preview = lines.slice(0, 2).join(" ");
  return preview.length > 180 ? `${preview.slice(0, 177)}...` : preview;
}

function buildProjectDraftSeed(projectTitle: string, sparks: BarStockSpark[]): string {
  const normalizedTitle = projectTitle.trim() || "Untitled Project";
  const introLine = sparks[0] ? buildSparkPreview(sparks[0].body) : "";
  const pointBlocks = sparks.map((spark, index) => {
    const heading = deriveSparkTitle(spark);
    const body = spark.body.trim() || "(empty spark)";
    return `### Point ${index + 1}: ${heading}\n${body}`;
  });

  return [
    `# ${normalizedTitle}`,
    "",
    "## Intro",
    introLine ? `- ${introLine}` : "- Hook and frame the episode.",
    "",
    "## Key Points",
    ...(pointBlocks.length ? pointBlocks : ["- No project sparks were found yet."]),
    "",
    "## Close",
    "- Recap the main takeaway.",
    "- Give the listener one next step.",
    "",
  ].join("\n");
}

function formatSparkStatus(spark: BarStockSpark): { label: string; detail?: string } {
  if (spark.status === "graduated") {
    return { label: "Graduated" };
  }
  const workpieceId = spark.links?.hearthWorkpieceId ?? spark.links?.hearthDraftId ?? null;
  if (workpieceId) {
    const shortId = workpieceId.length > 8 ? workpieceId.slice(0, 8) : workpieceId;
    return { label: "Forged", detail: shortId };
  }
  if (spark.status === "forged") {
    return { label: "Forged" };
  }
  return { label: "Open" };
}

function isSparkForged(spark: BarStockSpark): boolean {
  if (spark.links?.hearthWorkpieceId) return true;
  return spark.status === "forged" || spark.status === "graduated";
}

function parsePlanningLines(text: string): string[] {
  return splitLines(text)
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatDecisionAt(value: string | undefined): string {
  if (!value) return "Unknown";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function deriveIntentFromOrigin(origin: HearthSessionOrigin | null | undefined): HearthPlanningSession["intent"] {
  if (!origin?.created_from) return undefined;
  return origin.created_from === "bar-stock" ? "from_spark" : "new_idea";
}

function buildOpenInAnvilHref(
  workspaceId: string | null,
  workpieceId: string | null,
  scriptPath = ANVIL_SCRIPT_PATH,
): string | null {
  const workspace = workspaceId?.trim();
  const workpiece = workpieceId?.trim();
  if (!workspace || !workpiece) return null;
  const normalizedScriptPath = scriptPath.trim();
  if (!normalizedScriptPath || normalizedScriptPath.startsWith("/") || normalizedScriptPath.includes("..")) {
    return null;
  }

  const params = new URLSearchParams();
  params.set("workspace_id", workspace);
  params.set("workpiece_id", workpiece);
  params.set("open", "script");
  params.set("script_path", normalizedScriptPath);
  return `/app/anvil?${params.toString()}`;
}

const SCRIPT_TAG_VALIDATOR_VERSION = "shared-script-tags-v1";
const LEGACY_DRAFT_SCRIPT_PLACEHOLDER = "## Draft Script";
const SAFE_SCRIPT_STARTER = "[s1]\nDraft intro goes here.\n[/s1]\n";

function isLegacyDraftScriptPlaceholder(value: string | null | undefined): boolean {
  return readTrimmedString(value) === LEGACY_DRAFT_SCRIPT_PLACEHOLDER;
}

function buildValidationReport(result: ScriptValidationResult): string {
  if (result.issues.length === 0) return "No issues.";
  return result.issues
    .map((issue) => `[line ${issue.line}, col ${issue.column}] ${issue.message}`)
    .join("\n");
}

function buildPersistedValidationMeta(result: ScriptValidationResult) {
  return {
    ok: result.ok,
    issueCount: result.issues.length,
    issues: result.issues,
    validatorVersion: SCRIPT_TAG_VALIDATOR_VERSION,
    validatedAt: new Date().toISOString(),
  };
}

function evaluateScriptValidation(rawText: string): {
  normalizedText: string;
  validation: ScriptValidationResult;
  tagMode: "absent" | "present";
} {
  return evaluateHearthScriptValidation(rawText);
}

function resolveReadyOpenHref(entry: HearthReadyScript): string | null {
  return buildOpenInAnvilHref(entry.workspaceId, entry.workpieceId, entry.primaryScriptPath);
}

function isPlanningSessionEmpty(session: HearthPlanningSession | null): boolean {
  if (!session) return true;
  const hasTitle = Boolean(session.title && session.title.trim());
  const hasTitleVariants = Boolean(
    session.title_variants?.A?.trim()
    || session.title_variants?.B?.trim()
    || session.title_variants?.C?.trim(),
  );
  const hasGoals = (session.goals ?? []).length > 0;
  const hasOutline = (session.outline ?? []).length > 0;
  const hasDecisions = (session.decisions ?? []).length > 0;
  const hasAudience = Boolean(session.audience && session.audience.trim());
  const hasTone = Boolean(session.tone_preset && session.tone_preset.trim());
  const hasVisualProviderOverride = Boolean(session.visual_provider_override);
  return !(hasTitle || hasTitleVariants || hasGoals || hasOutline || hasDecisions || hasAudience || hasTone || hasVisualProviderOverride);
}

function buildSessionFingerprint(session: HearthPlanningSession): string {
  return JSON.stringify({
    workpiece_id: session.workpiece_id ?? null,
    workspace_id: session.workspace_id ?? null,
    origin: session.origin ?? null,
    intent: session.intent ?? null,
    title: session.title ?? "",
    title_variants: session.title_variants ?? null,
    goals: session.goals ?? [],
    outline: session.outline ?? [],
    audience: session.audience ?? "",
    tone_preset: session.tone_preset ?? "",
    visual_provider_override: session.visual_provider_override ?? null,
    links: session.links ?? null,
    decisions: session.decisions ?? [],
  });
}

function createPlanningSessionForEpisode(workpieceId: string, workspaceId: string | null): HearthPlanningSession {
  const nowIso = new Date().toISOString();
  return {
    schema: HEARTH_SESSION_SCHEMA,
    workpiece_id: workpieceId,
    workspace_id: workspaceId,
    created_at: nowIso,
    updated_at: nowIso,
    origin: null,
    intent: null,
    title: null,
    title_variants: null,
    goals: [],
    outline: [],
    audience: null,
    tone_preset: null,
    visual_provider_override: null,
    links: null,
    decisions: [],
  };
}

type HearthShellProps = {
  onEpisodeReadModelChange?: (readModel: EpisodeWorkspaceReadModel | null) => void;
  onEpisodeContextLoadingChange?: (episodeId: string | null) => void;
};

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
  const [incomingBarStockIntakeRoute] = useState<boolean>(() => hasIncomingBarStockIntakeQuery());

  const [mode, setMode] = useState<HearthMode>("sparks");
  const [focusTab, setFocusTab] = useState<FocusTab>("draft");
  const [workspaceId, setWorkspaceId] = useState<string | null>(() => resolveWorkspaceId());
  const [uiDensity, setUiDensity] = useState<UiDensity>(() => readWorkspaceUiDensity(resolveWorkspaceId()));
  const [workpieceId, setWorkpieceId] = useState<string | null>(() => (
    incomingBarStockIntakeRoute ? null : resolveWorkpieceId()
  ));
  const [sparks, setSparks] = useState<BarStockSpark[]>([]);
  const [isSparksLoading, setIsSparksLoading] = useState<boolean>(() => Boolean(normalizeUuid(resolveWorkspaceId())));
  const [sparkDiscoveryWorkspaceId, setSparkDiscoveryWorkspaceId] = useState<string | null>(null);
  const [selectedSparkId, setSelectedSparkId] = useState<string | null>(null);
  const [forgeError, setForgeError] = useState<string | null>(null);
  const [isForging, setIsForging] = useState(false);
  const [routeProjectId] = useState<string | null>(() => resolveBarstockProjectIdFromQuery());
  const [routeSparkId] = useState<string | null>(() => resolveBarstockSparkIdFromQuery());
  const [routeProjectTitle, setRouteProjectTitle] = useState<string | null>(null);

  const [planningSession, setPlanningSession] = useState<HearthPlanningSession | null>(() => (
    incomingBarStockIntakeRoute
      ? null
      : readHearthPlanningSessionCache(resolveWorkpieceId(), resolveWorkspaceId())
  ));
  const [sessionTouched, setSessionTouched] = useState(false);
  const [decisionDraft, setDecisionDraft] = useState("");

  const [workpieceSummaries, setWorkpieceSummaries] = useState<HearthWorkpieceSummary[]>([]);
  const [isWorkpiecesLoading, setIsWorkpiecesLoading] = useState(false);
  const [workpiecesError, setWorkpiecesError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeDraft, setActiveDraft] = useState<Draft | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const revisionWorkpieceId = useMemo(() => normalizeUuid(workpieceId), [workpieceId]);
  const [draftSnapshot, setDraftSnapshot] = useState<DraftSnapshot | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiAutosaveStatusAt, setAiAutosaveStatusAt] = useState<number | null>(null);
  const [aiAutosaveWarning, setAiAutosaveWarning] = useState<string | null>(null);
  const [isRepairingScript, setIsRepairingScript] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [showArchived, setShowArchived] = useState(false);
  const [readyScripts, setReadyScripts] = useState<HearthReadyScript[]>([]);
  const [readyScriptsWorkspaceId, setReadyScriptsWorkspaceId] = useState<string | null>(null);
  const [isReadyScriptsLoading, setIsReadyScriptsLoading] = useState(false);
  const [readyScriptsError, setReadyScriptsError] = useState<string | null>(null);
  const [updatingReadyCategoryId, setUpdatingReadyCategoryId] = useState<string | null>(null);
  const [readyCategoryError, setReadyCategoryError] = useState<string | null>(null);
  const [removingReadyIds, setRemovingReadyIds] = useState<string[]>([]);
  const [sendingBackReadyIds, setSendingBackReadyIds] = useState<string[]>([]);
  const [archivingWorkpieceIds, setArchivingWorkpieceIds] = useState<string[]>([]);
  const [restoringWorkpieceIds, setRestoringWorkpieceIds] = useState<string[]>([]);
  const [isRestoringReady, setIsRestoringReady] = useState(false);
  const [draggingReadyId, setDraggingReadyId] = useState<string | null>(null);
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
    skipChatHydrationKeyRef,
    pendingChatHydrationKeyRef,
    chatHydrationSeqRef,
  } = useChatWorkspaceState<PendingAiProposal>();
  const [showManualDraft, setShowManualDraft] = useState(false);
  const [showScriptPanel, setShowScriptPanel] = useState(false);
  const [isVisualScriptMode, setIsVisualScriptMode] = useState(false);
  const [composeModalOpen, setComposeModalOpen] = useState(false);
  const [productionDefaults, setProductionDefaults] = useState<ProductionDefaults>(() => readProductionDefaults());
  const [composeSetupDraft, setComposeSetupDraft] = useState<ComposeSetup>(() => buildSetupFromDefaults(readProductionDefaults()));
  const [selectedWritingFormat, setSelectedWritingFormat] = useState<HearthWritingFormat>(() => readLastHearthWritingFormat());
  const [scriptCompletionBadge, setScriptCompletionBadge] = useState<ScriptCompletionBadge | null>(null);
  const [scriptCompletionReasons, setScriptCompletionReasons] = useState<string[]>([]);
  const [scriptApprovalState, setScriptApprovalState] = useState<ScriptApprovalState>(() =>
    readScriptApprovalState(incomingBarStockIntakeRoute ? null : resolveWorkpieceId()),
  );
  const [approvalPersistenceStatus, setApprovalPersistenceStatus] = useState<ApprovalPersistenceStatus | null>(null);
  const [activeProductionAction, setActiveProductionAction] = useState<ProductionAction | null>(null);
  const [writingProfile, setWritingProfile] = useState<WritingProfile | null>(null);
  const [forgeGreetingName, setForgeGreetingName] = useState<string>(() => readGreetingNameFromStorage());
  const [hearthUser, setHearthUser] = useState<HearthUserContext>({
    userId: readAuthUserIdFromStorage(),
    displayName: readGreetingNameFromStorage(),
  });
  const [aiTokenBalance, setAiTokenBalance] = useState<number | null>(null);
  const [aiBillingMode, setAiBillingMode] = useState<HearthAiLane>(() => resolveAiLaneFromStorage());
  const [defaultVisualProvider, setDefaultVisualProvider] = useState<VisualProviderId>(() => resolveDefaultVisualProviderFromStorage());
  const [episodePackage, setEpisodePackage] = useState<EpisodePackageV2 | null>(null);
  const [scriptPanelCopyMessage, setScriptPanelCopyMessage] = useState<string | null>(null);
  const [activeWorkpieceTab, setActiveWorkpieceTab] = useState<WorkpieceWorkspaceTab>(() =>
    readWorkpieceWorkspaceTab(
      incomingBarStockIntakeRoute ? null : resolveWorkpieceId(),
      incomingBarStockIntakeRoute ? null : resolveWorkspaceId(),
    ),
  );
  const [presenceRows, setPresenceRows] = useState<HearthWorkpiecePresence[]>([]);
  const [draftConflictState, setDraftConflictState] = useState<DraftConflictState | null>(null);
  const [mobileOverlayView, setMobileOverlayView] = useState<"editor" | "ready" | null>(null);
  const { acknowledgeCopy, isCopyAcknowledged } = useClipboardButtonAcks();

  const draftEditVersionRef = useRef(0);
  const workpieceIdRef = useRef<string | null>(workpieceId);
  const activeDraftRef = useRef<Draft | null>(null);
  const draftSnapshotRef = useRef<DraftSnapshot | null>(null);
  const draftsRef = useRef<Draft[]>(drafts);
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
  const readyScriptsRequestSeqRef = useRef(0);
  const restoredCursorDraftIdRef = useRef<string | null>(null);
  const restoredModeDraftKeyRef = useRef<string | null>(null);
  const pendingFocusOpenCountRef = useRef(0);
  const pendingDraftEditorPanelRef = useRef<"script" | "manual" | null>(null);
  const gateAwaitingAnswersRef = useRef(false);
  const pendingShortcutIntentRef = useRef<"outline" | "script" | null>(null);
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
  } = useThumbnailWorkspace();
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
  } = useMediaMapWorkspace();
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
  } = useImageMapWorkspace();
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
    brollSaveError,
    setBrollSaveError,
    brollMessage,
    setBrollMessage,
    isBrollBusy,
    setIsBrollBusy,
    onBrollDraftChange,
    syncBrollDraftFromBeat,
    syncSelectedBrollBeatId,
    resetBrollWorkspaceForWorkpieceSwitch,
  } = useBrollWorkspace();
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
  } = useReferenceClipWorkspace();
  const {
    metadataTitlesDraft,
    metadataTagsDraft,
    metadataTagInputDraft,
    metadataDescriptionShortDraft,
    metadataDescriptionLongDraft,
    metadataPreviewMode,
    metadataSaveState,
    metadataSaveError,
    setMetadataTitlesDraft,
    setMetadataTagsDraft,
    setMetadataTagInputDraft,
    setMetadataDescriptionShortDraft,
    setMetadataDescriptionLongDraft,
    onMetadataTitleChange,
    onMetadataSetPrimaryTitle,
    onMetadataAddTagFromInput,
    onMetadataRemoveTag,
    onMetadataAddTagSuggestion,
    onMetadataDescriptionShortChange,
    onMetadataDescriptionLongChange,
    onMetadataPreviewModeChange,
  } = useMetadataWorkspace({
    workpieceId,
    workspaceId,
    episodePackage,
    setEpisodePackage,
    setImageMapMetadataUpdatedAt,
    parseTagInput: parseMetadataTagInput,
    normalizeTag: normalizeMetadataTag,
    deriveThumbnailOverlayText: deriveHearthThumbnailOverlayText,
  });

  const {
    hearthScriptState,
    effectiveComposeSetup,
    composeContentValidation,
    scriptReadiness,
    approvalBlocked,
    handoffBlocked,
  } = useScriptWorkspaceReadModel({
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

  const lastAutosaveRevisionAt = useMemo(() => {
    const match = revisions.find((rev) => rev.kind === "autosave");
    return match?.createdAt ?? null;
  }, [revisions]);

  const isDirty = useMemo(() => {
    if (!activeDraft || !draftSnapshot) return false;
    return activeDraft.title !== draftSnapshot.title || activeDraft.body !== draftSnapshot.body;
  }, [activeDraft, draftSnapshot]);
  const persistAutosaveIO = useCallback(async (params: {
    draft: Draft;
    updatedAt: number;
    revision: { kind: RevisionKind; note?: string } | null;
    quietFailure: boolean;
    saveReason?: string;
  }): Promise<boolean> => {
    return persistDraft({
      draft: params.draft,
      updatedAt: params.updatedAt,
      createRevision: params.revision,
      syncSources: false,
      syncSession: false,
      showSavingState: false,
      quietFailure: params.quietFailure,
      saveReason: params.saveReason,
    });
  }, [persistDraft]);
  const {
    queueAiAutosave,
    onRetryAiAutosave,
    noteManualSaveSuccess,
  } = useHearthAutosave<Draft, AiAutosaveReasonCode, RevisionKind>({
    activeDraft,
    draftSnapshot,
    isDirty,
    isBodyComposing,
    lastAutosaveRevisionAt,
    autosaveDelayMs: AUTOSAVE_DELAY_MS,
    autosaveMinGapMs: AUTOSAVE_MIN_GAP_MS,
    autosaveRevisionGapMs: AUTOSAVE_REVISION_GAP_MS,
    autosaveRevisionKind: "autosave",
    persistAutosaveIO,
    toAiAutosaveSaveReason: toAiAutosaveReason,
    retryReasonCode: "ai_rewrite",
    setAiAutosaveWarning,
    setAiAutosaveStatusAt,
  });
  const persistRevisionDraft = useCallback(async (params: {
    draft: Draft;
    updatedAt: number;
    revision: { kind: RevisionKind; note?: string };
  }): Promise<boolean> => {
    return persistDraft({
      draft: params.draft,
      updatedAt: params.updatedAt,
      createRevision: params.revision,
    });
  }, [persistDraft]);
  const resolveRevisionWorkpieceId = useCallback((override?: string | null) => (
    normalizeUuid(override) ?? revisionWorkpieceId
  ), [revisionWorkpieceId]);
  const reportRevisionPersistenceWarning = useCallback((kind: RevisionKind | null, message: string) => {
    if (kind === "autosave") {
      setAiAutosaveWarning(message);
      return;
    }
    setAiRuntimeWarning(message);
  }, []);
  const refreshRevisions = useCallback(async (
    currentWorkpieceId: string | null,
    draftId?: string | null,
  ): Promise<Revision[]> => {
    const resolvedWorkpieceId = normalizeUuid(currentWorkpieceId);
    if (!resolvedWorkpieceId) {
      setRevisions([]);
      return [];
    }
    const list = await store.listRevisions(resolvedWorkpieceId, draftId?.trim() ? draftId : null);
    setRevisions(list);
    return list;
  }, [store]);
  const {
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
  } = useScriptWorkspace({
    activeDraft,
    setActiveDraft,
    bumpDraftEditVersion: () => {
      draftEditVersionRef.current += 1;
    },
    persistRevisionDraft,
    resolveRevisionWorkpieceId: () => resolveRevisionWorkpieceId(),
    restoreRevisionSnapshot: (workpieceId, revisionId) => store.restoreRevision(workpieceId, revisionId),
    persistRestoredDraft: (params) => persistDraft({
      draft: params.draft,
      updatedAt: params.updatedAt,
      createRevision: { kind: "manual", note: "Restored from revision" },
    }),
    saveRevisionRecord: (workpieceId, revision) => store.saveRevision(workpieceId, revision),
    refreshRevisions,
    reportRevisionPersistenceWarning,
    setAiRuntimeWarning,
    setError,
    confirmRestore: (message) => window.confirm(message),
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
  const sourcesState = useSourcesState(workspaceId, workpieceId, activeDraft?.body ?? "", {
    mode: mode === "focus" && focusTab === "sources" ? "full" : "summary",
  });
  const workpieceSources = sourcesState.workpieceSources;
  const sourceIndexById = sourcesState.sourceIndexById;
  const missingSourcesCount = sourcesState.missingCitedCount;
  const unusedSourcesCount = sourcesState.unusedRefsCount;
  const preferredDraftIdsByWorkpiece = useMemo(() => {
    const next = new Map<string, string | null>();
    if (workpieceId && activeDraft?.id) {
      next.set(workpieceId, activeDraft.id);
    }
    return next;
  }, [activeDraft?.id, workpieceId]);
  const activeWorkpieceContext = useMemo(() => selectActiveWorkpieceContext({
    activeWorkpieceId: workpieceId,
    workpieces: workpieceSummaries,
    drafts,
    readyScripts,
    sparks,
    revisions,
    preferredDraftId: activeDraft?.id ?? session?.activeDraftId ?? null,
  }), [activeDraft?.id, drafts, readyScripts, revisions, session?.activeDraftId, sparks, workpieceId, workpieceSummaries]);
  const activeWorkpiece = activeWorkpieceContext.workpiece;
  const activeWorkpieceIsArchived = Boolean(activeWorkpiece?.isArchived);
  const draftsById = useMemo(() => new Map(drafts.map((draft) => [draft.id, draft] as const)), [drafts]);
  const hasActiveEpisode = Boolean(workpieceId);
  const presencePeers = useMemo(
    () => presenceRows.filter((row) => !hearthUser.userId || row.userId !== hearthUser.userId),
    [hearthUser.userId, presenceRows],
  );
  const editingPeers = useMemo(
    () => presencePeers.filter((row) => row.mode === "editing"),
    [presencePeers],
  );
  const viewingPeers = useMemo(
    () => presencePeers.filter((row) => row.mode === "viewing"),
    [presencePeers],
  );
  const activeEditorName = editingPeers[0]?.displayName?.trim() || "A teammate";
  const activeViewerName = viewingPeers[0]?.displayName?.trim() || "A teammate";
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
  const openInAnvilHref = useMemo(
    () => (activeWorkpieceIsArchived ? null : buildOpenInAnvilHref(workspaceId, workpieceId)),
    [activeWorkpieceIsArchived, workspaceId, workpieceId],
  );
  const anvilStepModeHint = useMemo(() => getHearthAnvilStepModeHint({
    composeSetup: effectiveComposeSetup,
    hasScriptText: Boolean((activeDraft?.body ?? "").trim()),
  }), [activeDraft?.body, effectiveComposeSetup]);
  const aiRuntimeBusy = isAiProcessing || isThumbnailGenerating || isImageMapCandidateGenerating;
  const aiCreditsDepleted = aiBillingMode === "forge" && aiTokenBalance != null && aiTokenBalance <= 0;
  const aiEpisodeReady = Boolean(workpieceId?.trim());
  const thumbnailConcepts = episodePackage?.thumbnail.concepts ?? [];
  const thumbnailVersions = episodePackage?.thumbnail.versions ?? [];
  const launchVariants = episodePackage?.launch_variants ?? [];
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
  const imageMapEntries = episodePackage?.image_map.entries ?? [];
  const mediaMap: EpisodeMediaMap | null = episodePackage?.media_map ?? null;
  const mediaMapEntries: EpisodeMediaMapEntry[] = mediaMap?.entries ?? [];
  const selectedMediaMapEntry = mediaMapEntries.find((entry) => entry.id === selectedMediaMapEntryId) ?? null;
  const selectedImageMapEntry = imageMapEntries.find((entry) => entry.id === selectedImageMapEntryId) ?? null;
  const brollPlan: EpisodeBrollPlan | null = episodePackage?.broll_plan ?? null;
  const brollBeats: EpisodeBrollPlanBeat[] = brollPlan?.beats ?? [];
  const selectedBrollBeat = brollBeats.find((beat) => beat.id === selectedBrollBeatId) ?? null;
  const brollProviders: ExternalGenerationProvider[] = listExternalGenerationProviders("broll");
  const brollRequestStateLabel = resolveVisualRequestStateLabel(selectedBrollBeat?.external_request?.state);
  const referenceClipPlan: EpisodeReferenceClipPlan | null = episodePackage?.cdc_plan ?? null;
  const referenceClipEntries: EpisodeContextualDataCompositePlan[] = referenceClipPlan?.entries ?? [];
  const selectedReferenceClipEntry = referenceClipEntries.find((entry) => entry.id === selectedReferenceClipEntryId) ?? null;
  const preferredThumbnailTitleId = resolvePrimarySeoTitle(thumbnailTitleOptions)?.id ?? null;
  useThumbnailPreviewLoader({
    workpieceId,
    selectedThumbnailVersion,
    selectedThumbnailVersionId,
    setThumbnailPreviewState,
    setThumbnailPreviewDataUrl,
    setThumbnailPreviewError,
  });
  useImageMapCandidatePreviewLoader({
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
    if (imageMapSaveState === "editing" || imageMapSaveState === "saving") {
      return "Save this visual beat before re-anchoring it.";
    }
    if (isImageMapCandidateGenerating || isImageMapCandidateSelecting) {
      return "Wait for the current image-map action to finish.";
    }
    return null;
  }, [
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
  }));
  const chatPanelMeta = chatMessages.length > 0
    ? `${chatMessages.length} message${chatMessages.length === 1 ? "" : "s"}`
    : "Ready";
  const thumbnailPanelMeta = formatThumbnailPanelMeta(thumbnailConcepts.length, thumbnailVersions.length);
  const mediaMapPanelMeta = `${mediaMapEntries.length} visual${mediaMapEntries.length === 1 ? "" : "s"}`;
  const imageMapPanelMeta = `${imageMapEntries.length} anchor${imageMapEntries.length === 1 ? "" : "s"}`;
  const brollPanelMeta = `${brollBeats.length} beat${brollBeats.length === 1 ? "" : "s"} · coverage ${brollPlan?.coverage_strength ?? "low"}`;
  const referenceClipPanelMeta = `${referenceClipEntries.length} Reference Clip${referenceClipEntries.length === 1 ? "" : "s"}`;
  const metadataPanelMeta = `${thumbnailTitleOptions.length} title${thumbnailTitleOptions.length === 1 ? "" : "s"} · ${metadataTagsDraft.length} tag${metadataTagsDraft.length === 1 ? "" : "s"}`;
  const hasBrowserSpeech = (
    typeof window !== "undefined"
    && (Boolean((window as any).SpeechRecognition) || Boolean((window as any).webkitSpeechRecognition))
  );
  const hasApprovedScript = Boolean(
    scriptApprovalState.hasApprovedScript
    && scriptApprovalState.approvedScriptVersion
    && scriptApprovalState.approvedScriptVersion > 0,
  );
  const approvedScriptVersion = hasApprovedScript ? scriptApprovalState.approvedScriptVersion : null;
  const {
    latestReleasePrepRawText,
    latestReleasePrepSections,
    releasePrepLoadState,
    releasePrepScriptVersion,
    loadLatestReleasePrepPack,
    resetReleasePrepState,
  } = useReleasePrepPackWorkspace({
    workpieceId,
    hasApprovedScript,
    approvedScriptVersion,
  });
  const {
    persistThumbnailEpisodePackage,
    persistImageMapEntries,
    persistBrollPlan,
    persistMediaMap,
    persistReferenceClipPlan,
  } = useVisualsPersistence({
    episodePackage,
    workpieceId,
    workspaceId,
    imageMapMetadataUpdatedAt,
    setEpisodePackage,
    setImageMapMetadataUpdatedAt,
    setThumbnailGenerateError,
  });
  const { readCanonicalScriptForImageMapGeneration } = useCanonicalImageMapScriptReader({
    workpieceId,
    activeDraft,
    listWorkpieceDrafts: (episodeId: string) => store.listWorkpieceDrafts(episodeId),
  });
  useMediaMapConversationBootstrap({
    activeWorkpieceTab,
    episodePackage,
    mediaMapEntriesLength: mediaMapEntries.length,
    mediaMapConversationState,
    setMediaMapConversationSeed,
    setMediaMapConversationState,
    setMediaMapConversationError,
    readCanonicalScriptForImageMapGeneration,
  });
  useCanonicalImageMapScriptStateLoader({
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
  } = useMediaMapEntryActions({
    episodePackage,
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
    setIsMediaMapBusy,
    setMediaMapSaveState,
    setMediaMapSaveError,
    setMediaMapMessage,
    setSelectedMediaMapEntryId,
    persistMediaMap,
  });
  const { prepareSourceEpisodePackageForMediaMapGeneration } = useMediaMapSourcePreparation({
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
  } = useMediaMapGenerationActions({
    episodePackage,
    isMediaMapBusy,
    approvedScriptVersion,
    mediaMapGenerationScope,
    setMediaMapGenerationScope,
    setIsMediaMapBusy,
    setMediaMapSaveState,
    setMediaMapSaveError,
    setMediaMapMessage,
    setSelectedMediaMapEntryId,
    prepareSourceEpisodePackageForMediaMapGeneration,
    buildMediaMapFromExistingPlans,
    persistMediaMap,
  });
  const approvedAtText = scriptApprovalState.approvedAt
    ? formatUpdatedAt(scriptApprovalState.approvedAt)
    : "Unknown";
  const mediaMapCoverageLevel = useMemo(() => resolveMediaPlanCoverageLevel(mediaMapEntries), [mediaMapEntries]);
  const mediaMapScopeLabel = useMemo(() => resolveMediaPlanScopeLabel(mediaMapEntries), [mediaMapEntries]);
  const framingTitleCount = thumbnailTitleOptions.length;
  const metadataComplete = Boolean(
    framingTitleCount > 0
    && metadataTagsDraft.length > 0
    && metadataDescriptionShortDraft.trim()
    && metadataDescriptionLongDraft.trim(),
  );
  const mediaPlanActivated = mediaMap?.status === "activated" || mediaMap?.status === "fulfilling" || mediaMap?.status === "fulfilled";
  const thumbnailsSelected = Boolean(primaryThumbnailVersionId);
  const releaseReadiness = resolveReleaseReadinessChecklist({
    hasApprovedScript,
    mediaMapStatus: mediaMap?.status ?? null,
    metadataComplete,
    thumbnailsSelected,
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
    metadata: metadataSaveState === "editing" || metadataSaveState === "saving",
    release: false,
    history: false,
  };
  const hasAnyUnsavedTab = Object.values(tabDirtyById).some(Boolean);
  const tabSummaryById: Record<WorkpieceWorkspaceTab, string> = {
    script: `${hasApprovedScript ? "Approved" : "Draft"} · ${wordCount} words · ${formatUpdatedAt(activeDraft?.updatedAt)}`,
    visuals: `${mediaMapEntries.length} visuals · ${String(mediaMap?.status ?? "draft").toUpperCase()} · ${mediaMapCoverageLevel}`,
    metadata: `${framingTitleCount} title${framingTitleCount === 1 ? "" : "s"} · ${metadataTagsDraft.length} tags · ${metadataComplete ? "Complete" : "Needs work"}`,
    release: `${releaseReadiness.completeCount}/${releaseReadiness.totalCount} ready · ${releaseReadiness.completeCount >= releaseReadiness.totalCount ? "Shippable" : "Pending"}`,
    history: `${revisions.length} revisions · ${latestMilestoneRevision ? `Milestone ${formatUpdatedAt(latestMilestoneRevision.createdAt)}` : resolveHistoryMilestoneMarker(revisions)}`,
  };
  const chatHistoryKey = useMemo(
    () => resolveChatHistoryKey(workpieceId, activeDraft?.id ?? null),
    [activeDraft?.id, workpieceId],
  );
  const buildActiveEpisodeContext = useCallback((): EpisodeContext | null => {
    const episodeId = workpieceId?.trim();
    if (!episodeId) return null;
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
  }, [activeDraft, planningSession, sourceIndexById, sparks, workpieceId, workpieceSources, workspaceId]);
  const {
    onFixScriptFormattingNoAi,
    onAskAiRepairScript,
  } = useHearthScriptRepairActions({
    activeDraft,
    isRepairingScript,
    isAiProcessing,
    aiTokenBalance,
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
  const { flushChatHistoryNow } = useChatWorkspaceHistory<PendingAiProposal>({
    store,
    activeDraftId: activeDraft?.id ?? null,
    chatHistoryKey,
    chatMessages,
    setChatMessages,
    setChatError,
    setPendingAiProposal,
    chatPersistTimerRef,
    chatMessagesRef,
    latestChatHistoryKeyRef,
    latestChatDraftIdRef,
    skipChatHydrationKeyRef,
    pendingChatHydrationKeyRef,
    chatHydrationSeqRef,
    readChatHistoryFromCache,
    writeChatHistoryCache,
    sanitizeChatMessagesForStorage,
    chatHistoryWriteDebounceMs: CHAT_HISTORY_WRITE_DEBOUNCE_MS,
  });
  const { sendChatMessage, onSendChat, onCancelAiRequest } = useChatWorkspaceRuntime<
    PendingAiProposal,
    EpisodeContext,
    HearthOp
  >({
    isAiProcessing,
    aiTokenBalance,
    chatDraft,
    setChatDraft,
    setChatMessages,
    setChatError,
    setPendingAiProposal,
    setAiRuntimeWarning,
    setIsAiProcessing,
    setAiBillingMode,
    setAiTokenBalance,
    chatMessagesRef,
    aiRequestControllerRef,
    gateAwaitingAnswersRef,
    pendingShortcutIntentRef,
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
    detectChatIntentSignals,
    detectAiAutosaveReasonCode,
    buildAssistantMessageContent,
    countProducerQuestions,
    readLatestOutlineFromOps,
    cloneHearthProposalOps,
    createPendingAiProposal: (proposalArgs) => ({
      assistantText: proposalArgs.assistantText,
      ops: proposalArgs.proposalOps,
      originalOps: cloneHearthProposalOps(proposalArgs.proposalOps),
      selected: proposalArgs.proposalOps.map(() => true),
      context: proposalArgs.episodeContext,
      fromGate: proposalArgs.fromGate,
      autosaveReasonCode: proposalArgs.autosaveReasonCode,
    }),
    resolveAiLaneFromStorage,
    requestHearthChatReply,
    persistProductionArtifact: async (artifactArgs) => {
      await persistProductionArtifact({
        action: artifactArgs.action as ProductionAction,
        scriptVersion: artifactArgs.scriptVersion,
        assistantText: artifactArgs.assistantText,
      });
    },
    refreshMyAiCredits,
    recordInteractionEvent,
    publishForgeNotice,
  });
  const { onToggleMic } = useChatWorkspaceStt({
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
        const created = await sourcesState.addSourceToLibrary({
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
          sourcesState.updateWorkpieceSourceNotes(id, patch.note);
          sourcesChanged = true;
        }
        const updated = await sourcesState.updateSourceInLibrary(id, {
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.url !== undefined ? { url: patch.url } : {}),
          ...(patch.note !== undefined ? { notes: patch.note } : {}),
        });
        if (updated) {
          sourcesChanged = true;
        }
      },
      removeSource: (id) => {
        sourcesState.removeSourceFromWorkpiece(id);
        sourcesChanged = true;
      },
      requestSave: (reason) => {
        saveRequested = reason === "ai_apply_ops";
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
      queueAiAutosave({
        draft: stagedDraft,
        previousBody,
        reasonCode: args.proposal.autosaveReasonCode,
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
      sourcesState.syncSources();
    }
  }, [
    activeDraft,
    planningSession,
    queueAiAutosave,
    setActiveDraft,
    setDrafts,
    setPlanningSession,
    setSessionTouched,
    sourcesState,
    workpieceId,
    workspaceId,
    publishForgeNotice,
  ]);
  const {
    onApplyAiProposal,
    onDiscardAiProposal,
    onToggleAiProposalOp,
    onEditAiProposalBody,
    onResetAiProposalBody,
    isProposalBodyDirtyAt,
  } = useChatWorkspaceProposal<PendingAiProposal, HearthOp>({
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
    validateProposalApply: ({ opsToApply }) => {
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
      return projectedValidation.ok;
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
  });
  const chatWorkspace = useChatWorkspace({
    chatSurfaceProps: {
      visible: activeWorkpieceTab === "script",
      chatPanelMeta,
      chatMessages,
      chatDraft,
      chatError,
      aiRuntimeWarning,
      aiCreditsDepleted,
      hasApprovedScript,
      approvedScriptVersion,
      approvedAtText,
      approvalPersistenceStatus,
      pendingAiProposal,
      dirtyProposalBodyCount,
      isApplyingAiOps,
      isAiProcessing,
      aiEpisodeReady,
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
        setChatMessages([]);
        setChatError(null);
        setPendingAiProposal(null);
      },
      onToggleAiProposalOp,
      onEditAiProposalBody,
      onResetAiProposalBody,
      onApplyAiProposalAll: () => void onApplyAiProposal("all"),
      onApplyAiProposalSelected: () => void onApplyAiProposal("selected"),
      onDiscardAiProposal,
      writingFormat: selectedWritingFormat,
      writingFormatOptions,
      onSelectWritingFormat: rememberWritingFormat,
      onUseChatShortcutDraft: () => onUseChatShortcut(buildWritingFormatShortcutPrompt(selectedWritingFormat)),
      draftShortcutLabel,
      onUseChatShortcutSources: () => onUseChatShortcut("Find strong sources I should cite for this Episode."),
      onOpenComposeScript,
      onSetSttLane: (lane) => setSttLane(lane),
      onToggleMic: () => onToggleMic("chat"),
      onChatDraftChange: setChatDraft,
      onSendChat: () => void onSendChat(),
      onCancelAiRequest,
      describeProposalOp: describeHearthOp,
      getProposalDiff: buildProposalDiff,
      validateProposalBody: (value) => evaluateHearthScriptValidation(value).validation,
      isProposalBodyDirty: isProposalBodyDirtyAt,
      buildValidationReport,
    },
  });
  const activeEpisodeSparks = useMemo(
    () => sparks.filter((spark) => (
      (workpieceId && spark.links?.hearthWorkpieceId === workpieceId)
      || (activeDraft?.id && spark.links?.hearthDraftId === activeDraft.id)
    )),
    [activeDraft?.id, sparks, workpieceId],
  );
  const sortedSparks = useMemo(
    () => sparks.slice().sort((a, b) => b.createdAt - a.createdAt),
    [sparks],
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
  const visibleSparks = useMemo(
    () => sortedSparks.filter((spark) => spark.status !== "archived"),
    [sortedSparks],
  );
  const selectedSpark = useMemo(() => {
    if (visibleSparks.length === 0) return null;
    if (!selectedSparkId) return visibleSparks[0] ?? null;
    return visibleSparks.find((spark) => spark.id === selectedSparkId) ?? visibleSparks[0] ?? null;
  }, [selectedSparkId, visibleSparks]);
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
  const workpieceNavItems = useMemo(() => selectWorkpieceNavItems({
    workpieces: deferDesktopRailCollections ? EMPTY_WORKPIECE_SUMMARY_LIST : workpieceSummaries,
    drafts,
    readyScripts,
    sparks,
    searchText,
    sortKey,
    preferredDraftIdsByWorkpiece,
  }), [
    deferDesktopRailCollections,
    drafts,
    preferredDraftIdsByWorkpiece,
    readyScripts,
    searchText,
    sortKey,
    sparks,
    workpieceSummaries,
  ]);
  const filteredWorkpieceNavItems = useMemo(() => {
    if (showArchived) return workpieceNavItems;
    return workpieceNavItems.filter((item) => !item.isArchived);
  }, [showArchived, workpieceNavItems]);
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

  const readyScriptsForDisplay = useMemo(() => {
    if (deferDesktopRailCollections) return EMPTY_READY_SCRIPT_LIST;
    const normalizedWorkspaceId = normalizeUuid(workspaceId);
    if (!normalizedWorkspaceId || readyScriptsWorkspaceId !== normalizedWorkspaceId) {
      return EMPTY_READY_SCRIPT_LIST;
    }
    return readyScripts;
  }, [deferDesktopRailCollections, readyScripts, readyScriptsWorkspaceId, workspaceId]);
  const visibleReadyScriptsForDisplay = useMemo(
    () => readyScriptsForDisplay.filter((entry) => !entry.hiddenAt),
    [readyScriptsForDisplay],
  );

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

  const readyTotalCount = visibleReadyScriptsForDisplay.length;
  const removedReadyCount = useMemo(() => {
    return readyScriptsForDisplay.filter((entry) => Boolean(entry.hiddenAt)).length;
  }, [readyScriptsForDisplay]);
  const activeReadyScript = useMemo(
    () => readyScriptsForDisplay.find((entry) => entry.workpieceId === (workpieceId ?? "")) ?? null,
    [readyScriptsForDisplay, workpieceId],
  );
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
        tone: "ready" as const,
        label: "Ready",
        detail: scriptApprovalState.approvedAt
          ? `Script v${approvedScriptVersion} approved ${formatRelativeUpdatedAt(scriptApprovalState.approvedAt)}`
          : `Script v${approvedScriptVersion} approved`,
      };
    }
    return {
      tone: "pending" as const,
      label: "Not Ready",
      detail: "Approve Script to move this episode into Ready.",
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
        : activeReadyScript || hasApprovedScript
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
  const metadataTagSuggestions = useMemo(
    () => buildMetadataTagSuggestions({
      currentTags: metadataTagsDraft,
      contentCategory: activeReadyScript?.contentCategory ?? null,
    }),
    [activeReadyScript?.contentCategory, metadataTagsDraft],
  );
  const diffLines = useMemo(() => {
    if (!selectedRevision || !activeDraft) return [];
    return buildDiffLines(activeDraft.body, selectedRevision.bodySnapshot);
  }, [activeDraft, selectedRevision]);

  useEffect(() => {
    activeDraftRef.current = activeDraft;
  }, [activeDraft]);

  useEffect(() => {
    workpieceIdRef.current = workpieceId;
  }, [resetReleasePrepState, workpieceId]);

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

    const syncAiRuntime = async () => {
      const lane = resolveAiLaneFromStorage();
      const visualProvider = resolveDefaultVisualProviderFromStorage();
      if (!cancelled) {
        setAiBillingMode(lane);
        setDefaultVisualProvider(visualProvider);
        if (lane === "byo") {
          setAiTokenBalance(null);
        }
      }

      const status = await fetchHearthAiStatus();
      if (cancelled) return;
      if (!status.runtime) return;
      if (lane === "byo") {
        setAiTokenBalance(null);
      } else {
        setAiTokenBalance(status.runtime.tokenBalance);
      }
    };

    void syncAiRuntime();

    const onAiSettingsChange = () => {
      void syncAiRuntime();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== "forge:hearth:aiSettings:v1") return;
      void syncAiRuntime();
    };

    window.addEventListener("forge:ai:settings", onAiSettingsChange as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("forge:ai:settings", onAiSettingsChange as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

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
    });
  }, [aiBillingMode, aiRuntimeBusy, aiTokenBalance]);

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

  const refreshWorkpieces = useCallback(async (
    overrideWorkspaceId?: string | null,
    options?: { includeArchived?: boolean },
  ): Promise<HearthWorkpieceSummary[]> => {
    const workspace = normalizeUuid(overrideWorkspaceId ?? workspaceId);
    const activeWorkpieceId = normalizeUuid(workpieceId);
    const currentWorkpieceSummaries = workpieceSummariesRef.current;
    const includeArchived = options?.includeArchived ?? (
      showArchived || Boolean(
        activeWorkpieceId && currentWorkpieceSummaries.some((entry) => entry.workpieceId === activeWorkpieceId && entry.isArchived)
      )
    );
    if (!workspace) {
      workpieceSummariesRef.current = [];
      setWorkpieceSummaries([]);
      setWorkpiecesError(null);
      setIsWorkpiecesLoading(false);
      return [];
    }

    setIsWorkpiecesLoading(true);
    setWorkpiecesError(null);
    try {
      const list = await listHearthWorkpieces(workspace, { includeArchived });
      workpieceSummariesRef.current = list;
      setWorkpieceSummaries(list);
      return list;
    } catch {
      workpieceSummariesRef.current = [];
      setWorkpieceSummaries([]);
      setWorkpiecesError("Failed to load Episodes.");
      return [];
    } finally {
      setIsWorkpiecesLoading(false);
    }
  }, [showArchived, workspaceId, workpieceId]);

  const refreshDrafts = useCallback(async (): Promise<Draft[]> => {
    const list = dedupeDraftListById(await store.listDrafts());
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
    workpieceId,
    replaceEpisodePackageImageMap,
    resetReleasePrepState,
    setEpisodePackage,
    setImageMapMetadataUpdatedAt,
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

  const refreshReadyScripts = useCallback(async () => {
    const workspace = normalizeUuid(workspaceId);
    const requestSeq = readyScriptsRequestSeqRef.current + 1;
    readyScriptsRequestSeqRef.current = requestSeq;
    if (!workspace) {
      setReadyScripts([]);
      setReadyScriptsWorkspaceId(null);
      setReadyScriptsError(null);
      setIsReadyScriptsLoading(false);
      return;
    }

    setIsReadyScriptsLoading(true);
    setReadyScriptsError(null);
    try {
      const entries = await listHearthReadyScripts(workspace);
      if (readyScriptsRequestSeqRef.current !== requestSeq) return;
      setReadyScripts(entries);
      setReadyScriptsWorkspaceId(workspace);
    } catch {
      if (readyScriptsRequestSeqRef.current !== requestSeq) return;
      setReadyScripts([]);
      setReadyScriptsWorkspaceId(null);
      setReadyScriptsError("Failed to load Ready to Record list.");
    } finally {
      if (readyScriptsRequestSeqRef.current === requestSeq) {
        setIsReadyScriptsLoading(false);
      }
    }
  }, [workspaceId]);
  const setScriptValidationGateResult = useCallback((validation: ScriptValidationResult) => {
    setScriptValidation({
      source: "save_gate",
      result: validation,
    });
  }, []);
  const persistApprovedDraft = useCallback(async (params: {
    draft: Draft;
    updatedAt: number;
    approvalNote: string;
  }): Promise<boolean> => {
    return persistDraft({
      draft: {
        ...params.draft,
        updatedAt: params.updatedAt,
      },
      updatedAt: params.updatedAt,
      createRevision: { kind: "milestone", note: params.approvalNote },
      syncSources: false,
      syncSession: false,
      validateForAnvil: true,
    });
  }, [persistDraft]);
  const publishApprovedScript = useCallback(async (params: {
    episodeId: string;
    scriptText: string;
  }): Promise<boolean> => {
    const published = await commitHearthPrimaryScript(params.episodeId, params.scriptText, {
      validatorVersion: SCRIPT_TAG_VALIDATOR_VERSION,
    });
    return published.ok;
  }, []);
  const appendApprovalMarker = useCallback((params: { draftId: string; content: string }) => {
    const markerMessage: HearthChatMessage = { role: "assistant", content: params.content };
    setChatMessages((prev) => {
      const next = [...prev, markerMessage].slice(-CHAT_HISTORY_MAX_MESSAGES);
      flushChatHistoryNow({ draftId: params.draftId, messages: next });
      return next;
    });
  }, [flushChatHistoryNow, setChatMessages]);
  const {
    isApprovingScript,
    onApproveScript,
  } = useApprovalFlow({
    activeDraft,
    workpieceId,
    workspaceId,
    revisions,
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
    publishApprovedScript,
    mirrorApprovedScript: async (params) => mirrorApprovedScriptToLocal({
      workspaceId: params.workspaceId,
      workpieceId: params.workpieceId,
      scriptPath: getHearthPrimaryScriptPath(),
      scriptText: params.scriptText,
    }),
    graduateLinkedSpark,
    setScriptApprovalState,
    writeScriptApprovalState,
    updateStyleProfileFromReadyCheckpoint,
    appendApprovalMarker,
    refreshReadyScripts,
  });
  const {
    onGenerateBrollPlan,
    onSaveBrollBeat,
    onDeleteBrollBeat,
    onRegenerateBrollBeat,
  } = useBrollCoreActions({
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
    onCopyBrollPrompt,
    onDownloadBrollBrief,
    onOpenBrollProvider,
    onMarkBrollRequestState,
    onClearBrollRequestState,
    onAttachBrollResultFromUrl,
    onFindStockForBrollBeat,
    onUploadBrollBeatAsset,
    onSelectBrollCandidate,
  } = useBrollBridgeActions({
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
    onRegenerateReferenceClipEntryStub,
  } = useReferenceClipCoreActions({
    episodePackage,
    workpieceId,
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
  } = useReferenceClipBridgeActions({
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
  } = useThumbnailConceptActions({
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
    onGenerateThumbnailVersion,
    onRetryFailedThumbnailVersion,
    onUploadThumbnailBrandLogo,
    onRemoveThumbnailBrandLogo,
    onUploadThumbnailImage,
  } = useThumbnailGenerationActions({
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
  } = useImageMapReanchorActions({
    episodePackage,
    selectedImageMapEntry,
    imageMapReanchorDisabledReason,
    isImageMapReanchorSaving,
    canonicalImageMapScriptState,
    persistImageMapEntries,
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
  const {
    onGenerateImageMapCandidates,
    onSelectImageMapCandidate,
    onUploadImageMapAsset,
  } = useImageMapCandidateActions({
    workpieceId,
    workspaceId,
    episodePackage,
    selectedImageMapEntry,
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
    publishForgeNotice,
  });
  const {
    onCreateImageMapEntry,
    onDuplicateImageMapEntry,
    onDeleteImageMapEntry,
  } = useImageMapEntryCrudActions({
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
  } = useImageMapSeedExportActions({
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
    onSelectImageMapEntry,
  } = useImageMapViewActions({
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

  useEffect(() => {
    if (!isMobile && mobileOverlayView) {
      setMobileOverlayView(null);
    }
  }, [isMobile, mobileOverlayView]);

  useEffect(() => {
    setMobileOverlayView(null);
  }, [workspaceId]);

  useEffect(() => {
    if (!isMobile) return;
    if (mobileOverlayView) return;
    if (mode === "focus" && activeDraft) {
      setMobileOverlayView("editor");
      return;
    }
    if (mode === "ready") {
      setMobileOverlayView("ready");
    }
  }, [activeDraft, isMobile, mobileOverlayView, mode]);

  useEffect(() => {
    const workspace = workspaceId?.trim() ?? "";
    const workpiece = workpieceId?.trim() ?? "";
    const normalizedWorkspaceId = normalizeUuid(workspace);
    const normalizedWorkpieceId = normalizeUuid(workpiece);
    if (!normalizedWorkspaceId || !normalizedWorkpieceId) {
      setPresenceRows([]);
      return;
    }

    let cancelled = false;
    let timer: number | null = null;

    const syncPresence = async () => {
      try {
        const ownPresence = await upsertHearthWorkpiecePresence({
          workspaceId: normalizedWorkspaceId,
          workpieceId: normalizedWorkpieceId,
          mode: localPresenceMode,
          displayName: activeUserDisplayName,
        });
        if (!cancelled && ownPresence?.userId) {
          setHearthUser((prev) => (
            prev.userId === ownPresence.userId
              ? prev
              : { ...prev, userId: ownPresence.userId }
          ));
        }
        const rows = await listHearthWorkpiecePresence(normalizedWorkspaceId, normalizedWorkpieceId);
        if (!cancelled) {
          setPresenceRows(rows);
        }
      } catch {
        if (!cancelled) {
          setPresenceRows([]);
        }
      }
    };

    void syncPresence();
    timer = window.setInterval(() => {
      void syncPresence();
    }, PRESENCE_HEARTBEAT_MS);

    return () => {
      cancelled = true;
      if (timer) {
        window.clearInterval(timer);
      }
    };
  }, [activeUserDisplayName, localPresenceMode, workspaceId, workpieceId]);

  useEffect(() => {
    void refreshEpisodePackage();
  }, [refreshEpisodePackage]);

  const onSetReadyScriptCategory = useCallback(async (
    entry: HearthReadyScript,
    category: HearthContentCategory | null,
  ) => {
    setReadyCategoryError(null);
    setUpdatingReadyCategoryId(entry.id);

    const previousCategory = entry.contentCategory;
    setReadyScripts((prev) => prev.map((row) => (
      row.id === entry.id ? { ...row, contentCategory: category } : row
    )));

    try {
      const result = await setHearthReadyScriptCategory({
        workspaceId: entry.workspaceId,
        workpieceId: entry.workpieceId,
        category,
      });
      if (!result.ok) {
        setReadyScripts((prev) => prev.map((row) => (
          row.id === entry.id ? { ...row, contentCategory: previousCategory } : row
        )));
        setReadyCategoryError("Failed to save script category.");
        return;
      }
      void refreshReadyScripts();
    } catch {
      setReadyScripts((prev) => prev.map((row) => (
        row.id === entry.id ? { ...row, contentCategory: previousCategory } : row
      )));
      setReadyCategoryError("Failed to save script category.");
    } finally {
      setUpdatingReadyCategoryId(null);
    }
  }, [refreshReadyScripts]);

  const onReadyLabelChange = useCallback((entry: HearthReadyScript, label: ReadyLabel) => {
    const category = READY_LABEL_TO_CATEGORY[label] ?? "evergreen";
    void onSetReadyScriptCategory(entry, category);
  }, [onSetReadyScriptCategory]);

  const onRemoveFromReady = useCallback(async (entry: HearthReadyScript) => {
    if (!entry.id || removingReadyIds.includes(entry.id)) return;

    setReadyScriptsError(null);
    setRemovingReadyIds((prev) => (prev.includes(entry.id) ? prev : [...prev, entry.id]));
    setReadyScripts((prev) => prev.map((row) => (
      row.id === entry.id
        ? {
            ...row,
            hiddenAt: new Date().toISOString(),
            hiddenBy: hearthUser.userId ?? row.hiddenBy,
          }
        : row
    )));

    try {
      const result = await setHearthReadyScriptHidden({
        workspaceId: entry.workspaceId,
        workpieceId: entry.workpieceId,
        hidden: true,
      });
      if (!result.ok) {
        setReadyScriptsError("Failed to hide script from Ready.");
        await refreshReadyScripts();
        return;
      }
      await refreshReadyScripts();
    } catch {
      setReadyScriptsError("Failed to hide script from Ready.");
      await refreshReadyScripts();
    } finally {
      setRemovingReadyIds((prev) => prev.filter((id) => id !== entry.id));
    }
  }, [
    refreshReadyScripts,
    hearthUser.userId,
    removingReadyIds,
  ]);

  const onRestoreRemovedReady = useCallback(async () => {
    const normalizedWorkspaceId = normalizeUuid(workspaceId);
    const hiddenEntries = readyScriptsForDisplay.filter((entry) => entry.hiddenAt);
    if (!normalizedWorkspaceId || hiddenEntries.length === 0 || isRestoringReady) return;

    setReadyScriptsError(null);
    setIsRestoringReady(true);
    setReadyScripts((prev) => prev.map((entry) => (
      entry.hiddenAt
        ? { ...entry, hiddenAt: null, hiddenBy: null }
        : entry
    )));

    try {
      const result = await updateHearthReadyQueueState({
        workspaceId: normalizedWorkspaceId,
        entries: hiddenEntries.map((entry) => ({
          workpieceId: entry.workpieceId,
          hidden: false,
        })),
      });
      if (!result.ok) {
        setReadyScriptsError("Failed to restore hidden Ready items.");
        await refreshReadyScripts();
        return;
      }
      await refreshReadyScripts();
    } catch {
      setReadyScriptsError("Failed to restore hidden Ready items.");
      await refreshReadyScripts();
    } finally {
      setIsRestoringReady(false);
    }
  }, [isRestoringReady, readyScriptsForDisplay, refreshReadyScripts, workspaceId]);

  const onReorderReady = useCallback(async (fromId: string, toId: string) => {
    const normalizedWorkspaceId = normalizeUuid(workspaceId);
    if (!normalizedWorkspaceId || !fromId || !toId || fromId === toId) return;

    const reordered = reorderVisibleReadyEntries(readyScriptsForDisplay, fromId, toId);
    const changed = reordered.some((entry, index) => entry !== readyScriptsForDisplay[index]);
    if (!changed) return;

    const orderedVisibleIds = reordered
      .filter((entry) => !entry.hiddenAt)
      .map((entry) => entry.workpieceId);

    setReadyScriptsError(null);
    setReadyScripts(reordered);

    try {
      const result = await reorderHearthReadyScripts({
        workspaceId: normalizedWorkspaceId,
        orderedWorkpieceIds: orderedVisibleIds,
      });
      if (!result.ok) {
        setReadyScriptsError("Failed to reorder Ready queue.");
        await refreshReadyScripts();
        return;
      }
      await refreshReadyScripts();
    } catch {
      setReadyScriptsError("Failed to reorder Ready queue.");
      await refreshReadyScripts();
    }
  }, [readyScriptsForDisplay, refreshReadyScripts, workspaceId]);

  const persistSession = useCallback(async (draftId: string | null, uiSelectedTab?: string) => {
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
    options?: { revisionWorkpieceId?: string | null },
  ) => {
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
    await refreshRevisions(resolveRevisionWorkpieceId(options?.revisionWorkpieceId), draft.id);
    await persistSession(draft.id, "draft");
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

  const onOpenInAnvil = useCallback(async () => {
    const workspace = workspaceId?.trim() ?? "";
    const episodeId = workpieceId?.trim() ?? "";
    if (!workspace || !episodeId) {
      setError("Start Recording needs a valid workspace and episode.");
      return;
    }
    if (activeWorkpieceIsArchived) {
      setError("This episode is archived. Restore it in Hearth before recording.");
      return;
    }
    const href = buildOpenInAnvilHref(workspace, episodeId);
    if (!href) {
      setError("Start Recording is unavailable until episode context finishes loading.");
      return;
    }
    setError(null);
    if (!activeDraft) {
      window.location.assign(href);
      return;
    }

    if (!activeDraft.body.trim()) {
      setError("No script yet. Write a script before opening in Anvil.");
      return;
    }

    const { normalizedText, validation } = evaluateScriptValidation(activeDraft.body);
    if (!validation.ok) {
      setScriptValidation({
        source: "save_gate",
        result: validation,
      });
      setError(`Script tags must be valid before approval.\nFix the issues below to continue.\n\n${buildValidationReport(validation)}`);
      return;
    }

    const now = Date.now();
    const saved = await persistDraft({
      draft: {
        ...activeDraft,
        body: normalizedText,
        updatedAt: now,
        scriptValidationMeta: buildPersistedValidationMeta(validation),
      },
      updatedAt: now,
      createRevision: null,
      syncSources: false,
      syncSession: false,
      validateForAnvil: true,
    });
    if (!saved) return;

    const published = await commitHearthPrimaryScript(episodeId, normalizedText, {
      validatorVersion: SCRIPT_TAG_VALIDATOR_VERSION,
    });
    if (!published.ok) {
      const statusText = published.status ? ` (${published.status})` : "";
      setError(`Failed to publish script for Anvil${statusText}. Try again.`);
      return;
    }

    // Bridge token for Anvil static runtime so /tongs calls stay authorized after redirect.
    try {
      const token = resolveTongsRequestApiToken();
      if (token) {
        window.localStorage.setItem("forge_tongs_api_token_v1", token);
      }
    } catch {
      // ignore token bridge failures
    }

    flushChatHistoryNow({ draftId: activeDraft.id });
    window.location.assign(href);
  }, [activeDraft, activeWorkpieceIsArchived, flushChatHistoryNow, persistDraft, workpieceId, workspaceId]);

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

  const hydrateOrCreateDraftBufferForWorkpiece = useCallback(async (
    targetWorkpieceId: string,
    options?: {
      drafts?: readonly Draft[];
      workpieces?: readonly HearthWorkpieceSummary[];
      preferredDraftId?: string | null;
      seed?: { title?: string; body?: string };
    },
  ): Promise<Draft | null> => {
    const normalizedWorkpieceId = normalizeUuid(targetWorkpieceId);
    if (!normalizedWorkpieceId) return null;

    const availableDrafts = options?.drafts ?? draftsRef.current;
    const existingDraft = selectDraftForWorkpiece({
      workpieceId: normalizedWorkpieceId,
      drafts: availableDrafts,
      sparks,
      preferredDraftId: options?.preferredDraftId ?? null,
    });
    let selectedDraft = existingDraft;

    if (!draftHasUsableScriptBody(selectedDraft)) {
      const canonicalDrafts = dedupeDraftListById(await store.listWorkpieceDrafts(normalizedWorkpieceId));
      if (canonicalDrafts.length > 0) {
        const mergedDrafts = dedupeDraftListById([...availableDrafts, ...canonicalDrafts]);
        draftsRef.current = mergedDrafts;
        setDrafts(mergedDrafts);
        const canonicalDraft = selectDraftForWorkpiece({
          workpieceId: normalizedWorkpieceId,
          drafts: mergedDrafts,
          sparks,
          preferredDraftId: options?.preferredDraftId ?? null,
        }) ?? (
          options?.preferredDraftId
            ? mergedDrafts.find((draft) => draft.id === options.preferredDraftId) ?? null
            : null
        ) ?? canonicalDrafts
          .slice()
          .sort((a, b) => b.updatedAt - a.updatedAt)[0]
          ?? null;
        selectedDraft = choosePreferredHydratedDraft([selectedDraft, canonicalDraft]);
      }
    }

    if (draftHasUsableScriptBody(selectedDraft)) {
      return selectedDraft;
    }

    const availableWorkpieces = options?.workpieces ?? workpieceSummariesRef.current;
    const workpieceSummary = availableWorkpieces.find((entry) => entry.workpieceId === normalizedWorkpieceId) ?? null;
    const scriptRead = await readHearthPrimaryScript(normalizedWorkpieceId);
    if (!scriptRead.ok) {
      setAiRuntimeWarning("Opened Episode, but Hearth could not load the canonical script snapshot.");
    }
    const canonicalScriptData = scriptRead.ok ? scriptRead.data : null;
    const canonicalScriptText = isLegacyDraftScriptPlaceholder(canonicalScriptData?.text)
      ? ""
      : readTrimmedString(canonicalScriptData?.text);

    if (selectedDraft && canonicalScriptText) {
      const repairedDraft = hydrateDraftBodyFromCanonicalScript({
        draft: selectedDraft,
        scriptText: canonicalScriptData?.text ?? canonicalScriptText,
        updatedAt: parseIsoTimestamp(canonicalScriptData?.updatedAt) ?? Date.now(),
        updatedBy: buildDraftAttribution(hearthUser),
      });

      try {
        await store.saveDraft(repairedDraft, { reason: "hydrate_workpiece" });
        const nextDrafts = dedupeDraftListById([repairedDraft, ...draftsRef.current]);
        draftsRef.current = nextDrafts;
        setDrafts(nextDrafts);
        return repairedDraft;
      } catch (err) {
        if (!parseDraftConflictError(err)) {
          throw err;
        }
        const latestDrafts = await refreshDrafts();
        const latestDraft = selectDraftForWorkpiece({
          workpieceId: normalizedWorkpieceId,
          drafts: latestDrafts,
          sparks,
          preferredDraftId: options?.preferredDraftId ?? null,
        });
        return choosePreferredHydratedDraft([latestDraft, repairedDraft]);
      }
    }

    const seedBody = options?.seed?.body ?? "";
    const body = seedBody.trim() && !isLegacyDraftScriptPlaceholder(seedBody)
      ? seedBody
      : canonicalScriptText
        ? (canonicalScriptData?.text ?? canonicalScriptText)
        : SAFE_SCRIPT_STARTER;
    const title = workpieceSummary?.title
      ?? readTrimmedString(options?.seed?.title)
      ?? `Episode ${normalizedWorkpieceId.slice(0, 8)}`;
    const updatedAt = scriptRead.ok
      ? parseIsoTimestamp(scriptRead.data.updatedAt) ?? Date.now()
      : Date.now();
    const attribution = buildDraftAttribution(hearthUser);
    const draft: Draft = {
      ...createDraft({ title, body }),
      id: normalizedWorkpieceId,
      title,
      body,
      createdAt: updatedAt,
      updatedAt,
      archived: false,
      pinned: false,
      createdBy: attribution,
      updatedBy: attribution,
    };

    try {
      await store.saveDraft(draft, { reason: "hydrate_workpiece" });
    } catch (err) {
      if (!parseDraftConflictError(err)) {
        throw err;
      }
    }

    const latestDrafts = await refreshDrafts();
    return selectDraftForWorkpiece({
      workpieceId: normalizedWorkpieceId,
      drafts: latestDrafts,
      sparks,
      preferredDraftId: options?.preferredDraftId ?? normalizedWorkpieceId,
    });
  }, [hearthUser, refreshDrafts, sparks, store]);

  const {
    openWorkpieceInFocus,
    createDraftAndOpen,
  } = useHearthFocusOpenActions({
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
  } = useHearthDraftController({
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
      const created = await createHearthWorkpiece(
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
        void store.saveChatHistory(draft.id, []);
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
      const created = await createHearthWorkpiece({
        created_from: "bar-stock",
        spark_id: spark.id,
      }, scriptSeed, {
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
        void store.saveChatHistory(draft.id, [markerMessage]);
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

    const episodeId = workpieceId?.trim() ?? "";
    if (!episodeId) {
      setForgeError("Project episode is still resolving.");
      return;
    }

    if (routeProjectSparks.length === 0) {
      setForgeError("No sparks are attached to this Project yet.");
      return;
    }

    setIsForging(true);
    setForgeError(null);
    try {
      const title = routeProjectLabel ?? `Project ${routeProjectId.slice(0, 8)}`;
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

  useHearthInitialLoader({
    initialLoadKey,
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refreshWorkspaceFromGlobalState = () => {
      const nextWorkspaceId = resolveWorkspaceId();
      if (!nextWorkspaceId || nextWorkspaceId === workspaceId) return;
      setWorkspaceId(nextWorkspaceId);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key && !WORKSPACE_STORAGE_KEYS.has(event.key)) return;
      refreshWorkspaceFromGlobalState();
    };

    const onWorkspaceChanged = () => {
      refreshWorkspaceFromGlobalState();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("forge:workspace-changed", onWorkspaceChanged as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("forge:workspace-changed", onWorkspaceChanged as EventListener);
    };
  }, [workspaceId]);

  useHearthWorkspaceResetLifecycle({
    workspaceId,
    projectIntakeHandledRef,
    sparkIntakeHandledRef,
    onWorkspaceChanged: () => {
      setSparks([]);
      setSparkDiscoveryWorkspaceId(null);
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
      setPresenceRows([]);
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
    routeSpark,
    projectIntakeHandledRef,
    sparkIntakeHandledRef,
    resolveWorkspaceId,
    readPendingProjectWorkpieceId,
    writePendingProjectWorkpieceId,
    createProjectWorkpiece: async (title) => (
      await createHearthWorkpiece(
        { created_from: "bar-stock" },
        SAFE_SCRIPT_STARTER,
        { title },
      )
    ),
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
  useHearthSparkDiscovery({
    workspaceId,
    normalizeUuid,
    setSparks,
    setSparkDiscoveryWorkspaceId,
    setIsSparksLoading,
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
    setPresenceRows,
    setWorkpieceId,
    sessionCommitRef,
    buildSessionFingerprint,
    updatePlanningSession,
  });

  useEffect(() => {
    const workspace = workspaceId?.trim() ?? "";
    if (!workspace) {
      setThumbnailBrandTemplates([]);
      setThumbnailBrandTemplatesError(null);
      setIsThumbnailBrandTemplatesLoading(false);
      return;
    }

    let cancelled = false;
    setIsThumbnailBrandTemplatesLoading(true);
    setThumbnailBrandTemplatesError(null);

    void (async () => {
      const seeded = await seedWorkspaceThumbnailBrandTemplates(workspace);
      if (cancelled) return;

      const listed = await listWorkspaceThumbnailBrandTemplates(workspace);
      if (cancelled) return;
      if (!listed.ok) {
        setThumbnailBrandTemplates([]);
        setThumbnailBrandTemplatesError(listed.error);
        setIsThumbnailBrandTemplatesLoading(false);
        return;
      }
      setThumbnailBrandTemplates(listed.data);
      setThumbnailBrandTemplatesError(!seeded.ok && listed.data.length === 0 ? seeded.error : null);
      setIsThumbnailBrandTemplatesLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    syncSelectedThumbnailConceptId(thumbnailConcepts);
  }, [syncSelectedThumbnailConceptId, thumbnailConcepts]);

  useEffect(() => {
    syncThumbnailConceptDraftFromConcept(selectedThumbnailConcept, defaultThumbnailBrandTemplateId);
  }, [defaultThumbnailBrandTemplateId, selectedThumbnailConcept, syncThumbnailConceptDraftFromConcept]);

  useEffect(() => {
    const logoWorkpieceId = selectedThumbnailBrandLogoWorkpieceId ?? (workpieceId?.trim() ?? "");
    const logoAssetPath = selectedThumbnailBrandLogoAssetPath;
    if (!logoWorkpieceId || !logoAssetPath) {
      setThumbnailBrandLogoDataUrl(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      const loaded = await loadWorkspaceThumbnailBrandLogoPreview({
        workpieceId: logoWorkpieceId,
        assetPath: logoAssetPath,
      });
      if (cancelled) return;
      if (!loaded.ok) {
        setThumbnailBrandLogoDataUrl(null);
        if (!isThumbnailBrandLogoUploading && !thumbnailBrandLogoError) {
          setThumbnailBrandLogoError(loaded.error);
        }
        return;
      }
      setThumbnailBrandLogoDataUrl(loaded.dataUrl);
      if (!isThumbnailBrandLogoUploading && !thumbnailBrandLogoError) {
        setThumbnailBrandLogoStatus("Brand logo loaded.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isThumbnailBrandLogoUploading,
    thumbnailBrandLogoError,
    workpieceId,
    selectedThumbnailBrandLogoWorkpieceId,
    selectedThumbnailBrandLogoAssetPath,
  ]);

  useEffect(() => {
    if (!episodePackage || !selectedThumbnailConceptId) return;
    if (isThumbnailConceptSaving || isThumbnailGenerating || isThumbnailUploading) return;
    const savedConcept = episodePackage.thumbnail.concepts.find((concept) => concept.id === selectedThumbnailConceptId);
    if (!savedConcept) return;
    if (areEpisodeThumbnailTitleStylesEqual(savedConcept.title_style, thumbnailTitleStyleDraft)) return;

    const timer = window.setTimeout(() => {
      const normalizedTitleStyle = normalizeEpisodeThumbnailTitleStyle(thumbnailTitleStyleDraft);
      const nextEpisodePackage: EpisodePackageV2 = {
        ...episodePackage,
        thumbnail: {
          ...episodePackage.thumbnail,
          concepts: episodePackage.thumbnail.concepts.map((concept) => (
            concept.id === selectedThumbnailConceptId
              ? {
                  ...concept,
                  title_style: normalizedTitleStyle,
                }
              : concept
          )),
        },
      };

      void persistThumbnailEpisodePackage(
        nextEpisodePackage,
        "hearth.thumbnail.concept.title_style.updated.v1",
        {
          concept_id: selectedThumbnailConceptId,
          font_preset: normalizedTitleStyle.font_preset,
          text_color: normalizedTitleStyle.text_color,
          shadow_enabled: normalizedTitleStyle.shadow.enabled,
          shadow_strength: normalizedTitleStyle.shadow.strength,
        },
      );
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    episodePackage,
    isThumbnailConceptSaving,
    isThumbnailGenerating,
    isThumbnailUploading,
    selectedThumbnailConceptId,
    thumbnailTitleStyleDraft,
  ]);

  useEffect(() => {
    if (!episodePackage || !selectedThumbnailConceptId) return;
    if (isThumbnailConceptSaving || isThumbnailGenerating || isThumbnailUploading) return;
    const savedConcept = episodePackage.thumbnail.concepts.find((concept) => concept.id === selectedThumbnailConceptId);
    if (!savedConcept) return;
    const savedTemplateId = savedConcept.brand_template_id ?? null;
    if (savedTemplateId === (thumbnailConceptBrandTemplateIdDraft ?? null)) return;

    const timer = window.setTimeout(() => {
      const nextEpisodePackage: EpisodePackageV2 = {
        ...episodePackage,
        thumbnail: {
          ...episodePackage.thumbnail,
          concepts: episodePackage.thumbnail.concepts.map((concept) => (
            concept.id === selectedThumbnailConceptId
              ? {
                  ...concept,
                  brand_template_id: thumbnailConceptBrandTemplateIdDraft ?? null,
                }
              : concept
          )),
        },
      };

      void persistThumbnailEpisodePackage(
        nextEpisodePackage,
        "hearth.thumbnail.concept.brand_template.updated.v1",
        {
          concept_id: selectedThumbnailConceptId,
          brand_template_id: thumbnailConceptBrandTemplateIdDraft ?? null,
        },
      );
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    episodePackage,
    isThumbnailConceptSaving,
    isThumbnailGenerating,
    isThumbnailUploading,
    selectedThumbnailConceptId,
    thumbnailConceptBrandTemplateIdDraft,
  ]);

  useEffect(() => {
    if (!episodePackage) return;
    const currentScriptVersion = approvedScriptVersion ? String(approvedScriptVersion) : null;
    if (episodePackage.media_map.script_version_id === currentScriptVersion) return;
    setEpisodePackage((prev) => {
      if (!prev) return prev;
      if (prev.media_map.script_version_id === currentScriptVersion) return prev;
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

  useEffect(() => {
    setActiveWorkpieceTab(readWorkpieceWorkspaceTab(workpieceId, workspaceId));
  }, [workpieceId, workspaceId]);

  useEffect(() => {
    writeWorkpieceWorkspaceTab(workpieceId, workspaceId, activeWorkpieceTab);
  }, [activeWorkpieceTab, workpieceId, workspaceId]);

  useEffect(() => {
    const stored = readScriptApprovalState(workpieceId);
    setScriptApprovalState(stored);
    setApprovalPersistenceStatus(null);
  }, [workpieceId]);

  useEffect(() => {
    if (!workpieceId) {
      const fallback: ScriptApprovalState = {
        hasApprovedScript: false,
        approvedScriptVersion: null,
        approvedAt: null,
      };
      setScriptApprovalState((prev) => (isScriptApprovalStateEqual(prev, fallback) ? prev : fallback));
      return;
    }

    const stored = readScriptApprovalState(workpieceId);
    const scopedRevisions = activeDraft
      ? revisions.filter((revision) => revision.draftId === activeDraft.id)
      : [];
    const latestApproved = findLatestApprovedScript(scopedRevisions);
    const fromRevisions: ScriptApprovalState = latestApproved
      ? {
          hasApprovedScript: true,
          approvedScriptVersion: latestApproved.version,
          approvedAt: latestApproved.approvedAt,
        }
      : {
          hasApprovedScript: false,
          approvedScriptVersion: null,
          approvedAt: null,
        };

    const shouldPreferRevisions = Boolean(
      fromRevisions.hasApprovedScript
      && (
        !stored.hasApprovedScript
        || (fromRevisions.approvedScriptVersion ?? 0) > (stored.approvedScriptVersion ?? 0)
        || (
          fromRevisions.approvedScriptVersion === stored.approvedScriptVersion
          && (fromRevisions.approvedAt ?? 0) > (stored.approvedAt ?? 0)
        )
      ),
    );

    const resolved = shouldPreferRevisions ? fromRevisions : stored;
    setScriptApprovalState((prev) => (isScriptApprovalStateEqual(prev, resolved) ? prev : resolved));
    if (!isScriptApprovalStateEqual(stored, resolved)) {
      writeScriptApprovalState(workpieceId, resolved);
    }
  }, [activeDraft, revisions, workpieceId]);

  useEffect(() => {
    if (!activeDraft) {
      restoredModeDraftKeyRef.current = null;
      if (mode === "focus" && pendingFocusOpenCountRef.current === 0) {
        setMode("episodes");
      }
      return;
    }

    const restoreKey = `${workpieceId ?? "none"}:${activeDraft.id}`;
    if (mode !== "sparks") {
      restoredModeDraftKeyRef.current = restoreKey;
      return;
    }
    if (restoredModeDraftKeyRef.current === restoreKey) return;

    restoredModeDraftKeyRef.current = restoreKey;
    const saved = readMode(workpieceId);
    if (!saved) return;
    if (saved !== "focus") {
      setMode(saved);
    }
  }, [activeDraft?.id, mode, workpieceId]);

  useEffect(() => {
    const nextPanel = pendingDraftEditorPanelRef.current;
    setShowManualDraft(nextPanel === "manual");
    setShowScriptPanel(nextPanel === "script");
    pendingDraftEditorPanelRef.current = null;
    gateAwaitingAnswersRef.current = false;
    pendingShortcutIntentRef.current = null;
  }, [activeDraft?.id]);

  useEffect(() => {
    if (isCanonicalImageMapScriptPanel) return;
    if ((activeDraft?.body ?? "").trim()) return;
    setShowScriptPanel(false);
  }, [activeDraft?.body, isCanonicalImageMapScriptPanel]);

  useEffect(() => {
    if (!workpieceId) return;
    if (mode === "sparks") return;
    writeMode(workpieceId, mode);
  }, [mode, workpieceId]);

  useEffect(() => {
    setUiDensity(readWorkspaceUiDensity(workspaceId));
  }, [workspaceId]);

  useEffect(() => {
    writeWorkspaceUiDensity(workspaceId, uiDensity);
  }, [uiDensity, workspaceId]);

  useEffect(() => {
    if (!activeDraft) return;
    void refreshRevisions(revisionWorkpieceId, activeDraft.id);
  }, [activeDraft?.id, refreshRevisions, revisionWorkpieceId]);

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
    const showSavingState = args.showSavingState ?? true;
    const quietFailure = args.quietFailure ?? false;
    if (showSavingState) {
      setIsSaving(true);
    }
    if (!quietFailure) {
      setDraftConflictState(null);
      setError(null);
    }
    const shouldValidateForAnvil = args.validateForAnvil === true;
    const { normalizedText, validation } = evaluateScriptValidation(args.draft.body);
    const hasAnvilTagWarning = !validation.ok;
    if (hasAnvilTagWarning) {
      setScriptValidation({
        source: shouldValidateForAnvil ? "save_gate" : "save_notice",
        result: validation,
      });
      if (shouldValidateForAnvil) {
        setError(`Script tags must be valid before approval.\nFix the issues below to continue.\n\n${buildValidationReport(validation)}`);
        if (showSavingState) setIsSaving(false);
        return false;
      }
    } else {
      setScriptValidation(null);
    }
    const editVersionAtStart = draftEditVersionRef.current;
    try {
      let revisionCount = args.draft.revisionCount;
      let lastRevisionAt = args.draft.lastRevisionAt;
      let createdRevision: Revision | null = null;
      let refreshedRevisions: Revision[] | null = null;

      if (args.createRevision) {
        createdRevision = createRevision({
          draftId: args.draft.id,
          title: normalizeTitle(args.draft.title),
          body: args.draft.body,
          kind: args.createRevision.kind,
          note: args.createRevision.note,
        });
        const activeRevisionWorkpieceId = resolveRevisionWorkpieceId();
        if (!activeRevisionWorkpieceId) {
          reportRevisionPersistenceWarning(
            args.createRevision.kind,
            "Saved draft, but revision history is unavailable until this draft is attached to an Episode.",
          );
        } else {
          try {
            await store.saveRevision(activeRevisionWorkpieceId, createdRevision);
            if (args.createRevision.kind === "autosave") {
              setAiAutosaveWarning(null);
            } else {
              setAiRuntimeWarning(null);
            }
          } catch (err) {
            const message = err instanceof Error && err.message === "revision_snapshot_sync_failed"
              ? "Saved draft, but revision history was kept locally and not synced to cloud."
              : "Saved draft, but revision history could not be synced.";
            reportRevisionPersistenceWarning(args.createRevision.kind, message);
          }

          refreshedRevisions = await refreshRevisions(activeRevisionWorkpieceId, args.draft.id);
          revisionCount = refreshedRevisions.length;
          lastRevisionAt = refreshedRevisions[0]?.createdAt;
        }
      }

      const toSave: Draft = {
        ...args.draft,
        title: normalizeTitle(args.draft.title),
        body: normalizedText,
        updatedAt: args.updatedAt,
        revisionCount,
        lastRevisionAt,
        createdBy: args.draft.createdBy ?? buildDraftAttribution(hearthUser),
        updatedBy: buildDraftAttribution(hearthUser),
        scriptValidationMeta: buildPersistedValidationMeta(validation),
      };

      await store.saveDraft(toSave, { reason: args.saveReason });

      const latestActiveDraft = activeDraftRef.current;
      const hasNewerEdits = latestActiveDraft?.id === toSave.id
        && draftEditVersionRef.current !== editVersionAtStart;

      if (!hasNewerEdits) {
        setActiveDraft(toSave);
        setDraftSnapshot({ title: toSave.title, body: toSave.body, updatedAt: toSave.updatedAt });
      }
      setDrafts((prev) => {
        const exists = prev.some((d) => d.id === toSave.id);
        const next = exists
          ? prev.map((d) => (d.id === toSave.id ? toSave : d))
          : [toSave, ...prev];
        return dedupeDraftListById(next);
      });

      if (createdRevision && refreshedRevisions) {
        const selected = refreshedRevisions.find((revision) => revision.id === createdRevision?.id) ?? null;
        setSelectedRevision(selected);
        setRevisionView("preview");
      }

      const tab = mode === "focus"
        ? (focusTab === "revisions" ? revisionView : focusTab)
        : mode;
      await persistSession(toSave.id, tab);
      if (args.syncSources) {
        sourcesState.syncSources();
      }
      if (args.syncSession) {
        void syncSessionToTongs();
      }
      setDraftConflictState(null);
      return true;
    } catch (err) {
      const conflict = parseDraftConflictError(err);
      if (conflict) {
        if (!quietFailure) {
          const withLocalBody: DraftConflictState = {
            ...conflict,
            localBody: args.draft.body,
          };
          setDraftConflictState(withLocalBody);
          setError(withLocalBody.message);
        }
        return false;
      }
      if (!quietFailure) {
        const message = err instanceof Error ? err.message : "Failed to save draft.";
        setError(message);
      }
      return false;
    } finally {
      if (showSavingState) {
        setIsSaving(false);
      }
    }
  }

  async function saveDraftMeta(draft: Draft, updates: Partial<Draft>) {
    const now = Date.now();
    const toSave: Draft = {
      ...draft,
      ...updates,
      title: normalizeTitle(updates.title ?? draft.title),
      updatedAt: now,
      createdBy: draft.createdBy ?? buildDraftAttribution(hearthUser),
      updatedBy: buildDraftAttribution(hearthUser),
    };
    setScriptValidation(null);
    await store.saveDraft(toSave);
    setDrafts((prev) => dedupeDraftListById(prev.map((d) => (d.id === toSave.id ? toSave : d))));
    if (activeDraft?.id === toSave.id) {
      setActiveDraft(toSave);
      setDraftSnapshot({ title: toSave.title, body: toSave.body, updatedAt: toSave.updatedAt });
    }
  }

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

  const onArchiveWorkpiece = useCallback(async (targetWorkpieceId: string) => {
    const normalizedWorkspaceId = normalizeUuid(workspaceId);
    const normalizedWorkpieceId = normalizeUuid(targetWorkpieceId);
    if (!normalizedWorkspaceId || !normalizedWorkpieceId || archivingWorkpieceIds.includes(normalizedWorkpieceId)) {
      return;
    }

    setError(null);
    setArchivingWorkpieceIds((prev) => (
      prev.includes(normalizedWorkpieceId) ? prev : [...prev, normalizedWorkpieceId]
    ));

    try {
      await archiveHearthWorkpiece({
        workspaceId: normalizedWorkspaceId,
        workpieceId: normalizedWorkpieceId,
      });

      const archivingActiveWorkpiece = workpieceId === normalizedWorkpieceId;
      if (archivingActiveWorkpiece) {
        await selectDraft(null);
        await persistSession(null, "draft");
        if (!showArchived) {
          setWorkpieceId(null);
          setMode("episodes");
          setFocusTab("draft");
          if (isMobile && mobileOverlayView === "editor") {
            setMobileOverlayView(null);
          }
        }
      }

      await refreshWorkpieces(normalizedWorkspaceId, { includeArchived: showArchived });
    } catch {
      setError("Failed to archive workpiece.");
    } finally {
      setArchivingWorkpieceIds((prev) => prev.filter((id) => id !== normalizedWorkpieceId));
    }
  }, [
    archivingWorkpieceIds,
    isMobile,
    mobileOverlayView,
    persistSession,
    refreshWorkpieces,
    selectDraft,
    showArchived,
    workpieceId,
    workspaceId,
  ]);

  const onRestoreWorkpiece = useCallback(async (
    targetWorkpieceId: string,
    options?: { openAfterRestore?: boolean },
  ) => {
    const normalizedWorkspaceId = normalizeUuid(workspaceId);
    const normalizedWorkpieceId = normalizeUuid(targetWorkpieceId);
    if (!normalizedWorkspaceId || !normalizedWorkpieceId || restoringWorkpieceIds.includes(normalizedWorkpieceId)) {
      return;
    }

    setError(null);
    setRestoringWorkpieceIds((prev) => (
      prev.includes(normalizedWorkpieceId) ? prev : [...prev, normalizedWorkpieceId]
    ));

    try {
      await restoreHearthWorkpiece({
        workspaceId: normalizedWorkspaceId,
        workpieceId: normalizedWorkpieceId,
      });
      setAiRuntimeWarning("Restored. Review and re-ready before recording.");
      await refreshWorkpieces(normalizedWorkspaceId, {
        includeArchived: showArchived || Boolean(options?.openAfterRestore),
      });

      if (options?.openAfterRestore) {
        await openWorkpieceInFocus(normalizedWorkpieceId, {
          workspaceId: normalizedWorkspaceId,
          preferredDraftId: activeDraft?.id ?? normalizedWorkpieceId,
        });
      }
    } catch {
      setError("Failed to restore workpiece.");
    } finally {
      setRestoringWorkpieceIds((prev) => prev.filter((id) => id !== normalizedWorkpieceId));
    }
  }, [
    activeDraft?.id,
    openWorkpieceInFocus,
    refreshWorkpieces,
    restoringWorkpieceIds,
    showArchived,
    workspaceId,
  ]);

  function findNextBodyFromOps(baseBody: string, ops: HearthOp[]): string {
    let next = baseBody;
    for (const op of ops) {
      if (op.op === "set_body") {
        next = op.value;
      }
    }
    return next;
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
  }) {
    await persistHearthProductionArtifact({
      action: args.action,
      scriptVersion: args.scriptVersion,
      assistantText: args.assistantText,
      workpieceId,
      workspaceId,
      refreshEpisodePackage,
      loadLatestReleasePrepPack,
      setAiRuntimeWarning,
      setMetadataTitlesDraft,
      setMetadataDescriptionShortDraft,
      setMetadataDescriptionLongDraft,
      setMetadataTagsDraft,
    });
  }

  async function onRunProductionAction(action: ProductionAction) {
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
  }

  function resolveBrollDataVisualSpecFromDraft(intent: EpisodeBrollPlanBeat["motion_intent"]): EpisodeBrollDataVisualSpec | null {
    if (intent !== "data_visual") return null;
    const labels = brollDataLabelsDraft
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const values = brollDataValuesDraft
      .split(",")
      .map((entry) => Number(entry.trim()))
      .filter((value) => Number.isFinite(value));
    const next: EpisodeBrollDataVisualSpec = {
      chart_type: (brollDataChartTypeDraft.trim() || "bar") as EpisodeBrollDataVisualSpec["chart_type"],
      title: brollDataTitleDraft.trim() || null,
      labels,
      values,
      emphasis_key: brollDataEmphasisKeyDraft.trim() || null,
      animation_style: brollDataAnimationStyleDraft.trim() || null,
    };
    const hasContent = Boolean(
      next.chart_type
      || next.title
      || next.labels?.length
      || next.values?.length
      || next.emphasis_key
      || next.animation_style,
    );
    return hasContent ? next : null;
  }

  function resolveReferenceClipValuesFromDraft(): Array<number | string> {
    return referenceClipValuesDraft
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((value) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : value;
      });
  }

  function onUseChatShortcut(prompt: string) {
    const signals = detectChatIntentSignals(prompt);
    if (signals.requestedOutline) {
      pendingShortcutIntentRef.current = "outline";
      recordInteractionEvent("user_requested_outline", {
        source: "shortcut_chip",
      });
    } else if (signals.requestedScript) {
      pendingShortcutIntentRef.current = "script";
      recordInteractionEvent("user_requested_script", {
        source: "shortcut_chip",
      });
    }
    if (signals.explicitDraftNow) {
      recordInteractionEvent("user_explicit_draft_now", {
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

  const onOpenReadyScriptInHearth = useCallback(async (entry: HearthReadyScript) => {
    setError(null);
    try {
      await openWorkpieceInFocus(entry.workpieceId, {
        workspaceId: entry.workspaceId,
        preferredDraftId: activeDraft?.id ?? null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to open approved script in Hearth.";
      setError(message);
    }
  }, [activeDraft?.id, openWorkpieceInFocus]);

  const onSendBackToEdit = useCallback(async (entry: HearthReadyScript) => {
    if (!entry.id || sendingBackReadyIds.includes(entry.id)) return;

    setError(null);
    setReadyScriptsError(null);
    setSendingBackReadyIds((prev) => (prev.includes(entry.id) ? prev : [...prev, entry.id]));

    try {
      await openWorkpieceInFocus(entry.workpieceId, {
        workspaceId: entry.workspaceId,
        preferredDraftId: entry.workpieceId,
      });

      const result = await removeHearthReadyScripts({
        workpieceId: entry.workpieceId,
        paths: entry.scriptPaths.length ? entry.scriptPaths : [entry.primaryScriptPath || entry.path],
      });
      if (!result.ok) {
        setError("Failed to remove the workpiece from Ready. It is still marked ready.");
        setReadyScriptsError("Failed to remove the workpiece from Ready.");
        await refreshReadyScripts();
        return;
      }

      setReadyScripts((prev) => prev.filter((row) => row.workpieceId !== entry.workpieceId));
      await refreshReadyScripts();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send the workpiece back to editing.";
      setError(message);
      setReadyScriptsError("Failed to send the workpiece back to editing.");
      await refreshReadyScripts();
    } finally {
      setSendingBackReadyIds((prev) => prev.filter((id) => id !== entry.id));
    }
  }, [openWorkpieceInFocus, refreshReadyScripts, sendingBackReadyIds]);

  const openReadyInMobileOverlay = useCallback(() => {
    setMode("ready");
    if (isMobile) {
      setMobileOverlayView("ready");
    }
  }, [isMobile]);

  const closeMobileOverlay = useCallback(() => {
    setMobileOverlayView(null);
    if (isMobile) {
      setMode("episodes");
    }
  }, [isMobile]);

  const resolveWorkpiecePresenceBadge = useCallback((targetWorkpieceId: string): string => {
    if (workpieceId !== targetWorkpieceId) return "Idle";
    if (editingPeers.length > 0) return `${activeEditorName} editing`;
    if (viewingPeers.length > 0) return `${activeViewerName} viewing`;
    return "Idle";
  }, [activeEditorName, editingPeers.length, activeViewerName, viewingPeers.length, workpieceId]);

  const resolveWorkpiecePresenceClass = useCallback((targetWorkpieceId: string): string => {
    if (workpieceId !== targetWorkpieceId) return "is-idle";
    if (editingPeers.length > 0) return "is-editing";
    if (viewingPeers.length > 0) return "is-viewing";
    return "is-idle";
  }, [editingPeers.length, viewingPeers.length, workpieceId]);

  const renderSparksView = () => {
    const resumeWorkpieceId = normalizeUuid(session?.activeWorkpieceId ?? null)
      ?? resolveWorkpieceIdForDraftId(session?.activeDraftId ?? null);
    const resumeWorkpiece = resumeWorkpieceId
      ? workpieceSummaries.find((entry) => entry.workpieceId === resumeWorkpieceId) ?? null
      : null;
    const resumeDraft = session?.activeDraftId
      ? drafts.find((draft) => draft.id === session.activeDraftId) ?? null
      : null;
    const canResumeLast = Boolean(resumeWorkpieceId);
    const selectedSparkStatus = selectedSpark ? formatSparkStatus(selectedSpark) : null;
    const selectedSparkPreview = selectedSpark ? buildSparkPreview(selectedSpark.body) : "";
    const isFreshSession = !hasActiveEpisode && !workpieceId;
    const isProjectIntake = Boolean(routeProjectId);
    const sparksSubtext = isProjectIntake
      ? "Forge this Project into an Episode."
      : isFreshSession
      ? `Hello ${forgeGreetingName}, what would you like to forge today?`
      : "Pick a spark, then start forging in conversation.";

    return (
      <section className="hs-home hs-sparks-landing">
        <header className="hs-home-header">
          <h2 className="hs-home-title">Hearth</h2>
          <p className="hs-home-subtext">{sparksSubtext}</p>
        </header>

        {isProjectIntake ? (
          <div className="hs-resume-context hs-project-intake">
            <div>
              Project: <b>{routeProjectLabel ?? "Untitled Project"}</b>
              {workpieceId ? ` · Episode ${workpieceId.slice(0, 8)}` : " · Resolving episode..."}
            </div>
            <div className="hs-project-intake-actions">
              <button
                type="button"
                onClick={() => void forgeProjectIntoEpisode()}
                disabled={isForging || routeProjectSparks.length === 0 || !workpieceId}
              >
                Forge this Project into an Episode
              </button>
              <span className="hs-project-intake-meta">
                Spark Stack: {routeProjectSparks.length}
              </span>
            </div>
            {routeProjectSparks.length > 0 ? (
              <div className="hs-project-intake-stack">
                {routeProjectSparks.map((spark) => (
                  <div key={spark.id} className="hs-project-intake-spark">
                    {deriveSparkTitle(spark)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="hs-project-intake-meta">
                No sparks attached to this Project yet.
              </div>
            )}
          </div>
        ) : null}

        <div className="hs-home-actions">
          <button type="button" onClick={() => void startFromScratch()} disabled={isForging}>
            New project
          </button>
          <button type="button" onClick={() => void onResumeLastProject()} disabled={!canResumeLast}>
            Resume last project
          </button>
        </div>
        {resumeWorkpieceId ? (
          <div className="hs-resume-context">
            Last: {resumeWorkpiece?.title ?? resumeDraft?.title ?? "Untitled Episode"} · updated {" "}
            {formatRelativeUpdatedAt(
              resumeWorkpiece?.updatedAtMs
              ?? resumeDraft?.updatedAt
              ?? Date.now(),
            )}
          </div>
        ) : null}

        {forgeError ? (
          <div className="hs-error-text-small">{forgeError}</div>
        ) : null}

        <div className="hs-sparks-layout">
          <section className="hs-home-barstock">
            <h3 className="hs-home-section-title">Sparks</h3>
            <div className="hs-home-spark-list">
              <div className="hs-spark-card hs-spark-card-new">
                <div className="hs-spark-header">
                  <div className="hs-spark-title">New project</div>
                </div>
                <div className="hs-spark-preview">
                  Start from scratch without a Spark.
                </div>
                <div className="hs-spark-footer">
                  <div className="hs-spark-status">Fresh workpiece</div>
                  <button
                    type="button"
                    onClick={() => void startFromScratch()}
                    disabled={isForging}
                  >
                    Start forging
                  </button>
                </div>
              </div>

              {visibleSparks.length === 0 ? (
                <p className="hs-home-empty">
                  {isSparksLoading
                    ? "Loading sparks from Bar Stock..."
                    : "No sparks yet. Capture ideas in Bar Stock first."}
                </p>
              ) : (
                visibleSparks.map((spark) => {
                  const status = formatSparkStatus(spark);
                  const preview = buildSparkPreview(spark.body);
                  const isSelected = selectedSpark?.id === spark.id;
                  const actionLabel = resolveSparkActionLabel(spark);
                  return (
                    <div
                      key={spark.id}
                      className={`hs-spark-card${isSelected ? " is-selected" : ""}`}
                      onMouseEnter={() => setSelectedSparkId(spark.id)}
                    >
                      <button
                        type="button"
                        className="hs-spark-select"
                        disabled={isForging}
                        onFocus={() => setSelectedSparkId(spark.id)}
                        onClick={() => void onActivateSpark(spark)}
                      >
                        <div className="hs-spark-header">
                          <div className="hs-spark-title">{deriveSparkTitle(spark)}</div>
                          <div className="hs-spark-date">
                            {formatSparkDate(spark.createdAt)}
                          </div>
                        </div>
                        <div className="hs-spark-preview">
                          {preview || "No preview available yet."}
                        </div>
                      </button>
                      <div className="hs-spark-footer">
                        <div className="hs-spark-status">
                          Status: {status.label}{status.detail ? ` · ${status.detail}` : ""}
                        </div>
                        <button
                          type="button"
                          onClick={() => void onActivateSpark(spark)}
                          disabled={isForging}
                        >
                          {actionLabel}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <aside className="hs-spark-detail-panel">
            <div className="hs-spark-detail-title">
              {selectedSpark ? deriveSparkTitle(selectedSpark) : "Select a spark"}
            </div>
            {selectedSpark ? (
              <>
                <div className="hs-spark-detail-meta">
                  {formatSparkDate(selectedSpark.createdAt)}
                  {selectedSparkStatus ? ` · ${selectedSparkStatus.label}` : ""}
                </div>
                <div className="hs-spark-detail-preview">
                  {selectedSparkPreview || selectedSpark.body || "No preview available yet."}
                </div>
                <div className="hs-spark-detail-actions">
                  <button
                    type="button"
                    onClick={() => void onStartForgingSelectedSpark()}
                    disabled={isForging}
                  >
                    {selectedSpark ? resolveSparkActionLabel(selectedSpark) : "Start forging"}
                  </button>
                </div>
              </>
            ) : (
              <p className="hs-home-empty">
                Choose a spark to preview it before forging.
              </p>
            )}
          </aside>
        </div>
      </section>
    );
  };

  const renderSparkRouteBootstrapView = () => {
    const sparkTitle = routeSpark ? deriveSparkTitle(routeSpark) : "Opening spark";
    return (
      <section className="hs-home hs-sparks-landing">
        <header className="hs-home-header">
          <h2 className="hs-home-title">Lighting the forge...</h2>
          <p className="hs-home-subtext">
            {routeSpark
              ? `Opening ${sparkTitle} from Bar Stock.`
              : "Opening your spark from Bar Stock."}
          </p>
        </header>
        {forgeError ? (
          <div className="hs-error-text-small">{forgeError}</div>
        ) : (
          <div className="hs-resume-context">
            Preparing the workpiece and dropping you into the fire.
          </div>
        )}
      </section>
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
    const sourcesSummary = missingSourcesCount > 0
      ? `${missingSourcesCount} missing citation${missingSourcesCount === 1 ? "" : "s"}`
      : "No missing citations";
    const unusedSummary = unusedSourcesCount > 0
      ? ` · ${unusedSourcesCount} unused`
      : "";
    const hasScript = Boolean((activeDraft?.body ?? "").trim());
    const displayedValidation = scriptValidation?.result ?? hearthScriptState?.validation ?? null;
    const validationIssueCount = displayedValidation?.issues.length ?? 0;
    const showScriptEditor = showManualDraft || showScriptPanel;
    const scriptPanelTitle = isCanonicalImageMapScriptPanel
      ? "Canonical Script"
      : (showScriptPanel && hasScript ? "Script" : "Manual Draft");
    const scriptPanelMetaText = isCanonicalImageMapScriptPanel
      ? (scriptPanelSourceLabel ?? "Source: canonical script")
      : `Sources: ${sourcesSummary}${unusedSummary}`;
    const scriptPanelPlaceholder = isCanonicalImageMapScriptPanel
      ? (canonicalImageMapScriptState.status === "loading"
        ? "Loading current canonical script..."
        : canonicalImageMapScriptState.error ?? "Current canonical script is unavailable.")
      : "Start writing...";
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
    const isVisualsWorkspaceTab = activeWorkpieceTab === "visuals";
    const isMetadataWorkspaceTab = activeWorkpieceTab === "metadata";
    const isReleaseWorkspaceTab = activeWorkpieceTab === "release";
    const isHistoryWorkspaceTab = activeWorkpieceTab === "history";
    const thumbnailPanelProps = buildThumbnailPanelProps({
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
    });
    const mediaMapPanelProps = buildMediaMapPanelProps({
      entries: mediaMapEntries,
      selectedEntryId: selectedMediaMapEntryId,
      approvedScriptVersion,
      mediaMap,
      saveState: mediaMapSaveState,
      saveError: mediaMapSaveError,
      message: mediaMapMessage,
      disabled: isApprovingScript || isMediaMapBusy || !episodePackage,
      generationScope: mediaMapGenerationScope,
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
    });
    const imageMapPanelProps = buildImageMapPanelProps({
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
      exportMessage: imageMapExportMessage,
      activeVisualProvider,
      visualProviderOptions,
      visualProviderOverride: planningSession?.visual_provider_override ?? null,
      candidateCards: imageMapCandidateCards,
      candidateGenerateBusy: isImageMapCandidateGenerating,
      candidateGenerateError: imageMapCandidateError,
      candidateSelectBusy: isImageMapCandidateSelecting,
      candidateSelectionError: imageMapCandidateSelectionError,
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
      disabled: isApprovingScript || !episodePackage,
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
      onCreateEntry: () => void onCreateImageMapEntry(),
      onDuplicateEntry: () => void onDuplicateImageMapEntry(),
      onDeleteEntry: () => void onDeleteImageMapEntry(),
      onSeedFromScript: () => void onSeedImageMapFromScript(),
      onGenerateCandidates: (mode?: "ai" | "stock") => void onGenerateImageMapCandidates(mode ?? "ai"),
      onUploadAsset: (file: File) => void onUploadImageMapAsset(file),
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
    });
    const brollPlanPanelProps = buildBrollPlanPanelProps({
      beats: brollBeats,
      selectedBeatId: selectedBrollBeatId,
      coverageStrength: brollPlan?.coverage_strength ?? null,
      saveState: brollSaveState,
      saveError: brollSaveError,
      message: brollMessage,
      disabled: isApprovingScript || isBrollBusy || !episodePackage,
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
      onSelectBeat: setSelectedBrollBeatId,
      onDraftChange: onBrollDraftChange,
      onSaveBeat: () => void onSaveBrollBeat(),
      onDeleteBeat: () => void onDeleteBrollBeat(),
      onRegenerateBeat: () => void onRegenerateBrollBeat(),
      onGeneratePlan: () => void onGenerateBrollPlan(),
      onFindStock: () => void onFindStockForBrollBeat(),
      onUploadAsset: (file: File) => void onUploadBrollBeatAsset(file),
      onSelectCandidate: (candidateId: string) => void onSelectBrollCandidate(candidateId),
      onCopyPrompt: () => {
        void onCopyBrollPrompt().then((copied) => {
          if (copied) acknowledgeCopy("broll.prompt");
        });
      },
      copyPromptAcknowledged: isCopyAcknowledged("broll.prompt"),
      onDownloadBrief: () => void onDownloadBrollBrief("text"),
      onDownloadBriefJson: () => void onDownloadBrollBrief("json"),
      onOpenProvider: () => void onOpenBrollProvider(),
      onMarkSent: () => void onMarkBrollRequestState("sent_external"),
      onMarkAwaitingResult: () => void onMarkBrollRequestState("awaiting_result"),
      onClearRequestState: () => void onClearBrollRequestState(),
      onAttachResultFromUrl: () => void onAttachBrollResultFromUrl(),
    });
    const referenceClipPlanPanelProps = buildReferenceClipPlanPanelProps({
      entries: referenceClipEntries,
      selectedEntryId: selectedReferenceClipEntryId,
      saveState: referenceClipSaveState,
      saveError: referenceClipSaveError,
      message: referenceClipMessage,
      disabled: isApprovingScript || isReferenceClipBusy || !episodePackage,
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
    });
    const metadataPanelProps = {
      titles: metadataTitlesDraft,
      tags: metadataTagsDraft,
      tagInput: metadataTagInputDraft,
      tagSuggestions: metadataTagSuggestions,
      descriptionShort: metadataDescriptionShortDraft,
      descriptionLong: metadataDescriptionLongDraft,
      previewMode: metadataPreviewMode,
      saveState: metadataSaveState,
      saveError: metadataSaveError,
      disabled: isApprovingScript || !episodePackage,
      onTitleChange: onMetadataTitleChange,
      onSetPrimaryTitle: onMetadataSetPrimaryTitle,
      onTagInputChange: setMetadataTagInputDraft,
      onAddTagFromInput: onMetadataAddTagFromInput,
      onRemoveTag: onMetadataRemoveTag,
      onAddTagSuggestion: onMetadataAddTagSuggestion,
      onDescriptionShortChange: onMetadataDescriptionShortChange,
      onDescriptionLongChange: onMetadataDescriptionLongChange,
      onPreviewModeChange: onMetadataPreviewModeChange,
    };
    const visualsPanelContracts = hearthVisualsWorkspace.composePanels({
      thumbnailPanelMeta,
      mediaMapPanelMeta,
      imageMapPanelMeta,
      brollPanelMeta,
      referenceClipPanelMeta,
      metadataPanelMeta,
      thumbnailPanelProps,
      mediaMapPanelProps,
      imageMapPanelProps,
      brollPlanPanelProps,
      referenceClipPlanPanelProps,
      metadataPanelProps,
    });

    return (
      <section className="hs-draft hs-draft-chat-first">
        {isScriptWorkspaceTab ? (
          <>
        <header className="hs-draft-header hs-draft-header-chat-first">
          <div className="hs-draft-title-wrap">
            <div className="hs-draft-title">Project</div>
            <div className="hs-draft-updated">
              Last updated {formatUpdatedAt(activeDraft?.updatedAt)}
            </div>
            <div className="hs-draft-updated">
              Editing as {activeUserDisplayName} · Last edited by {resolveDraftEditorName(activeDraft)}
            </div>
            <div className="hs-draft-updated">
              Mode: {composeModeLabel} · Badge: {completionBadgeLabel}
              {scriptCompletionReasons.length > 0 ? ` · ${scriptCompletionReasons.join(" ")}` : ""}
            </div>
          </div>
          <label className="hs-project-title">
            <span className="hs-field-label">Project title</span>
            <input
              type="text"
              value={activeDraft?.title ?? ""}
              placeholder="Project title"
              onChange={(event) => onDraftTitleChange(event.target.value)}
              disabled={!activeDraft}
            />
          </label>
        </header>

        <div className="hs-toolbar">
          <button onClick={onCreateDraft}>New Draft</button>
          <button onClick={onSaveDraft} disabled={!activeDraft || isSaving}>
            {isSaving ? "Saving..." : "Save draft"}
          </button>
          <button onClick={() => activeDraft && void onDeleteDraft(activeDraft)} disabled={!activeDraft || isSaving}>
            Delete Draft Buffer
          </button>
          <button onClick={openRevisionModal} disabled={!activeDraft || isSaving}>
            Create Revision
          </button>
          <button onClick={openRevisionPanel} disabled={!activeDraft}>
            Revisions
          </button>
          <button
            type="button"
            onClick={() => void onApproveScript()}
            disabled={!activeDraft || !hasScript || isSaving || isAiProcessing || isApprovingScript || approvalBlocked}
          >
            {isApprovingScript ? "Approving..." : "Approve Script"}
          </button>
          <label className="hs-tone-control">
            <span>Tone</span>
            <select
              value={activeTonePreset}
              onChange={(event) => onChangeTonePreset(event.target.value)}
              disabled={!activeDraft}
            >
              {TONE_PRESET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <span className="hs-status-text">{statusText}</span>
          <span className="hs-count-text">{wordCount} words · {charCount} chars</span>
          {aiAutosaveWarning ? (
            <span className="hs-autosave-warning" role="status" aria-live="polite">
              {aiAutosaveWarning}
              <button type="button" onClick={onRetryAiAutosave}>
                Retry
              </button>
              <button type="button" onClick={() => void onSaveDraft()}>
                Save now
              </button>
            </span>
          ) : null}
        </div>

        {editingPeers.length > 0 ? (
          <div className="hs-error-text-small">{activeEditorName} is editing this right now.</div>
        ) : viewingPeers.length > 0 ? (
          <div className="hs-muted-text-subtle">Viewed by {activeViewerName} (active)</div>
        ) : null}

        {error ? (
          <div className="hs-error-text">{error}</div>
        ) : null}

        {draftConflictState ? (
          <section className="hs-script-validation" aria-label="Draft conflict">
            <div className="hs-script-validation-title">Draft changed elsewhere</div>
            <div className="hs-script-validation-subtitle">{draftConflictState.message}</div>
            <div className="hs-script-validation-actions">
              <button type="button" onClick={() => void onReloadLatestDraftAfterConflict()}>
                Reload latest
              </button>
              <button
                type="button"
                className={isCopyAcknowledged("draft-conflict.local") ? "hs-copy-ack" : undefined}
                onClick={() => {
                  void onCopyConflictLocalText().then((copied) => {
                    if (copied) acknowledgeCopy("draft-conflict.local");
                  });
                }}
              >
                Copy my local text
              </button>
              <button type="button" onClick={() => setDraftConflictState(null)}>
                Dismiss
              </button>
            </div>
          </section>
        ) : null}

        {displayedValidation && !displayedValidation.ok ? (
          <section className="hs-script-validation" aria-label="Anvil tag validation">
            <div className="hs-script-validation-title">Tag Validation</div>
            <div className="hs-script-validation-subtitle">
              Script tags must be valid before approval.
              Fix the issues below to continue.
            </div>
            <div className="hs-script-validation-subtitle">{validationIssueCount} errors</div>
            <pre className="hs-script-validation-report">{buildValidationReport(displayedValidation)}</pre>
            <ul className="hs-script-validation-issues">
              {displayedValidation.issues.map((issue, index) => (
                <li key={`${issue.code}-${issue.line}-${issue.column}-${index}`}>
                  <button
                    type="button"
                    onClick={() => onJumpToValidationIssue(issue)}
                    className="hs-script-validation-jump"
                  >
                    line {issue.line}: {issue.message}
                  </button>
                </li>
              ))}
            </ul>
            <div className="hs-script-validation-actions">
              <button
                type="button"
                onClick={() => void onFixScriptFormattingNoAi()}
                disabled={!activeDraft || isSaving || isRepairingScript}
              >
                Fix Tag Structure
              </button>
              <button
                type="button"
                onClick={() => void onAskAiRepairScript()}
                disabled={!activeDraft || !aiEpisodeReady || aiCreditsDepleted || isAiProcessing || isRepairingScript}
              >
                {isRepairingScript ? "Repairing..." : "Ask AI to repair"}
              </button>
              <button
                type="button"
                onClick={() => setScriptValidation(null)}
                disabled={isRepairingScript}
              >
                Dismiss
              </button>
            </div>
          </section>
        ) : null}

        <div className="hs-chat-stage-controls">
          <div className="hs-manual-draft-controls">
            <button
              type="button"
              onClick={() => setShowManualDraft((prev) => !prev)}
              disabled={!activeDraft}
            >
              {showManualDraft ? "Hide Manual Draft" : "Manual Draft (no AI)"}
            </button>
            {hasScript ? (
              <button
                type="button"
                onClick={() => setShowScriptPanel((prev) => !prev)}
                disabled={!activeDraft}
              >
                {showScriptPanel ? "Hide Script panel" : "Script panel"}
              </button>
            ) : null}
            {hasApprovedScript && approvedScriptVersion ? (
              <button
                type="button"
                onClick={onToggleVisualScriptMode}
              >
                {isVisualScriptMode ? "Exit Visual Mode" : "Visual Mode"}
              </button>
            ) : null}
          </div>
          <div className="hs-field-label-muted">Write without AI (just a text editor)</div>
        </div>
          </>
        ) : null}

        <WorkpieceTabBar
          activeTab={activeWorkpieceTab}
          tabSummaryById={tabSummaryById}
          tabDirtyById={tabDirtyById}
          onChangeTab={requestWorkpieceTabChange}
        />

        <div className={`hs-draft-stage${(isHistoryWorkspaceTab || (isScriptWorkspaceTab && showScriptEditor)) ? " has-script-panel" : ""}`}>
          <div className="hs-focus-stack">
            <ChatSurface {...chatWorkspace.chatSurfaceProps} />

            {isReleaseWorkspaceTab && hasApprovedScript && approvedScriptVersion ? (
              <ReleaseSurface
                hasApprovedScript={hasApprovedScript}
                approvedScriptVersion={approvedScriptVersion}
                hasFramingComplete={metadataComplete}
                hasThumbnailsSelected={thumbnailsSelected}
                mediaMapStatus={mediaMap?.status ?? null}
                releaseReadinessCompleteCount={releaseReadiness.completeCount}
                releaseReadinessTotalCount={releaseReadiness.totalCount}
              />
            ) : null}

            <MetadataSurface
              visible={isMetadataWorkspaceTab}
              hasApprovedScript={hearthVisualsWorkspace.status.hasApprovedScript}
              approvedScriptVersion={hearthVisualsWorkspace.status.approvedScriptVersion}
              metadataPanelMeta={visualsPanelContracts.metadata.meta}
              metadataPanelProps={visualsPanelContracts.metadata.panelProps}
              aiCreditsDepleted={hearthVisualsWorkspace.status.aiCreditsDepleted}
              isAiProcessing={hearthVisualsWorkspace.status.isAiProcessing}
              activeProductionAction={hearthVisualsWorkspace.status.activeProductionAction}
              releasePrepScriptVersion={hearthVisualsWorkspace.status.releasePrepScriptVersion}
              latestReleasePrepRawText={hearthVisualsWorkspace.status.latestReleasePrepRawText}
              releasePrepLoadState={hearthVisualsWorkspace.status.releasePrepLoadState}
              latestReleasePrepSections={hearthVisualsWorkspace.status.latestReleasePrepSections}
              onGenerateTitles={hearthVisualsWorkspace.commands.onGenerateTitles}
              onGenerateTags={hearthVisualsWorkspace.commands.onGenerateTags}
              onGenerateFramingPack={hearthVisualsWorkspace.commands.onGenerateFramingPack}
              onRefreshFramingPack={hearthVisualsWorkspace.commands.onRefreshFramingPack}
            />
            <VisualsSurface
              visible={isVisualsWorkspaceTab}
              hasApprovedScript={hearthVisualsWorkspace.status.hasApprovedScript}
              approvedScriptVersion={hearthVisualsWorkspace.status.approvedScriptVersion}
              mediaMapStatus={hearthVisualsWorkspace.status.mediaMapStatus}
              mediaMapCoverageLevel={hearthVisualsWorkspace.status.mediaMapCoverageLevel}
              mediaMapScopeLabel={hearthVisualsWorkspace.status.mediaMapScopeLabel}
              thumbnailPanelMeta={visualsPanelContracts.thumbnail.meta}
              mediaMapPanelMeta={visualsPanelContracts.mediaMap.meta}
              imageMapPanelMeta={visualsPanelContracts.imageMap.meta}
              brollPanelMeta={visualsPanelContracts.broll.meta}
              referenceClipPanelMeta={visualsPanelContracts.referenceClips.meta}
              activeVisualProviderBanner={hearthVisualsWorkspace.status.activeVisualProviderBanner}
              activeVisualProviderHelperText={hearthVisualsWorkspace.status.activeVisualProviderHelperText}
              thumbnailPanelProps={visualsPanelContracts.thumbnail.panelProps}
              mediaMapPanelProps={visualsPanelContracts.mediaMap.panelProps}
              imageMapPanelProps={visualsPanelContracts.imageMap.panelProps}
              brollPlanPanelProps={visualsPanelContracts.broll.panelProps}
              referenceClipPlanPanelProps={visualsPanelContracts.referenceClips.panelProps}
            />
          </div>

          <HistorySurface visible={isHistoryWorkspaceTab}>
            {renderRevisionsView()}
          </HistorySurface>

          <ScriptSurface
            visible={isScriptWorkspaceTab}
            showScriptEditor={showScriptEditor}
            scriptPanelTitle={scriptPanelTitle}
            scriptPanelCopyMessage={scriptPanelCopyMessage}
            scriptPanelCopyAcknowledged={isCopyAcknowledged("script-panel.copy")}
            scriptPanelHint={scriptPanelHint}
            scriptPanelMetaText={scriptPanelMetaText}
            scriptPanelBodyText={scriptPanelBodyText}
            scriptPanelPlaceholder={scriptPanelPlaceholder}
            isVisualScriptMode={isVisualScriptMode}
            visualScriptParagraphRail={visualScriptParagraphRail}
            isCanonicalImageMapScriptPanel={isCanonicalImageMapScriptPanel}
            activeDraftExists={Boolean(activeDraft)}
            sourcesSummary={sourcesSummary}
            unusedSummary={unusedSummary}
            canReviewSources={Boolean(workpieceId)}
            sttLane={sttLane}
            sttTarget={sttTarget}
            sttState={sttState}
            hasBrowserSpeech={hasBrowserSpeech}
            sttNotice={sttNotice}
            sttError={sttError}
            bodyRef={bodyRef}
            copyIcon={<CopyIcon />}
            listeningIndicator={<OscilloscopeFill stream={mediaStreamRef.current} active />}
            onSetSttLane={(lane) => setSttLane(lane)}
            onToggleScriptMic={() => onToggleMic("script")}
            onCopyScriptPanelText={() => {
              void onCopyScriptPanelText().then((copied) => {
                if (copied) acknowledgeCopy("script-panel.copy");
              });
            }}
            onBodyChange={(nextBody) => {
              onDraftBodyChange(nextBody);
            }}
            onBodyCompositionStart={() => setIsBodyComposing(true)}
            onBodyCompositionEnd={() => setIsBodyComposing(false)}
            onBodyCursorChange={(cursor) => setCursorPosition(cursor)}
            onBodyScrollChange={(nextScrollTop) => setScrollTop(nextScrollTop)}
            onReviewSources={() => {
              setFocusTab("sources");
              setMode("focus");
            }}
          />
        </div>
      </section>
    );
  };

  const renderPlanningView = () => (
    <section className="hs-planning">
      <header className="hs-planning-header">
        <div className="hs-planning-title">Planning Board</div>
        <div className="hs-planning-meta">
          {sessionIntent ? `Intent: ${sessionIntent === "from_spark" ? "From Spark" : "New Idea"}` : "Intent: —"}
          {sessionSparkId ? ` · Spark ${sessionSparkId.slice(0, 8)}` : ""}
        </div>
      </header>

      <div className="hs-toolbar">
        <button
          type="button"
          onClick={() => void syncSessionToTongs()}
          disabled={!planningSession || !workpieceId}
        >
          Save Planning
        </button>
        <span className="hs-status-text">
          {sessionTouched ? "Unsaved changes" : "Saved"}
        </span>
      </div>

      <label className="hs-field">
        <span className="hs-field-label">Title</span>
        <input
          type="text"
          value={sessionTitle}
          placeholder="Episode title seed"
          onChange={(event) => {
            updatePlanningSession((prev) => ({
              ...prev,
              title: event.target.value,
            }));
          }}
        />
      </label>
      <label className="hs-field">
        <span className="hs-field-label">Goals</span>
        <textarea
          value={sessionGoalsText}
          placeholder="One per line"
          onChange={(event) => {
            const nextGoals = parsePlanningLines(event.target.value);
            updatePlanningSession((prev) => ({
              ...prev,
              goals: nextGoals,
            }));
          }}
          className="hs-textarea-small"
        />
      </label>
      <label className="hs-field">
        <span className="hs-field-label">Outline</span>
        <textarea
          value={sessionOutlineText}
          placeholder="Bullet outline, one per line"
          onChange={(event) => {
            const nextOutline = parsePlanningLines(event.target.value);
            updatePlanningSession((prev) => ({
              ...prev,
              outline: nextOutline,
            }));
          }}
          className="hs-textarea-medium"
        />
      </label>
      <div className="hs-decision-section">
        <span className="hs-decision-title">Decision notes</span>
        <div className="hs-decision-input-row">
          <input
            type="text"
            aria-label="Decision draft"
            value={decisionDraft}
            placeholder="Add a decision"
            onChange={(event) => setDecisionDraft(event.target.value)}
            className="hs-decision-input"
          />
          <button type="button" onClick={onAddDecision} disabled={!decisionDraft.trim()}>
            Add
          </button>
        </div>
        {sessionDecisions.length === 0 ? (
          <p className="hs-muted-text-small">No decisions logged yet.</p>
        ) : (
          <div className="hs-decision-list">
            {sessionDecisions.map((decision, idx) => (
              <div
                key={`${decision.at}-${idx}`}
                className="hs-decision-card"
              >
                <div className="hs-decision-time">
                  {formatDecisionAt(decision.at)}
                </div>
                <input
                  type="text"
                  aria-label={`Decision note ${idx + 1}`}
                  value={decision.text}
                  onChange={(event) => onUpdateDecision(idx, event.target.value)}
                />
                <div className="hs-decision-actions">
                  <button type="button" onClick={() => onRemoveDecision(idx)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );

  const renderSourcesView = () => (
    <section className="hs-sources-view">
      <SourcesView state={sourcesState} workspaceId={workspaceId} workpieceId={workpieceId} />
    </section>
  );

  const renderRevisionsView = () => (
    <section className="hs-revisions">
      <header className="hs-revisions-header">
        <div className="hs-revisions-title">Revisions</div>
        <button type="button" onClick={closeRevisionPanel}>
          Back to Draft
        </button>
      </header>

      {revisions.length === 0 ? (
        <p className="hs-muted-text">No revisions yet.</p>
      ) : (
        <div className="hs-revisions-grid">
          <div className="hs-revision-list">
            {revisions.map((revision) => (
              <div
                key={revision.id}
                className={`hs-revision-card${selectedRevision?.id === revision.id ? " is-active" : ""}`}
              >
                <div className="hs-revision-card-header">
                  <span>{formatUpdatedAt(revision.createdAt)}</span>
                  <span className="hs-revision-kind">
                    {revision.kind}
                  </span>
                </div>
                <div className="hs-revision-note">
                  {revision.note || "No note"}
                </div>
                <div className="hs-revision-actions">
                  <button
                    type="button"
                    onClick={() => selectRevisionPreview(revision)}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => selectRevisionCompare(revision)}
                  >
                    Compare
                  </button>
                  <button type="button" onClick={() => void onRestoreRevision(revision)}>
                    Restore
                  </button>
                </div>
              </div>
            ))}
          </div>

          {selectedRevision ? (
            <div className="hs-revision-detail">
              <div className="hs-revision-detail-title">
                {revisionView === "preview" ? "Preview" : "Compare"}
              </div>
              <div className="hs-revision-meta">
                {formatUpdatedAt(selectedRevision.createdAt)} · {selectedRevision.kind}
              </div>
              <label className="hs-revision-label">
                <span className="hs-revision-label-text">Revision note</span>
                <input
                  value={selectedRevision.note ?? ""}
                  onChange={(event) => updateSelectedRevisionDraftNote(event.target.value)}
                  onBlur={(event) => void onUpdateRevisionNote(selectedRevision, event.target.value)}
                />
              </label>
              {revisionView === "preview" ? (
                <div className="hs-revision-preview">
                  <div className="hs-revision-preview-title">{selectedRevision.titleSnapshot}</div>
                  {renderSectionedBody(selectedRevision.bodySnapshot)}
                </div>
              ) : (
                <div className="hs-revision-diff-section">
                  <div className="hs-revision-diff-block">
                    <span className="hs-diff-label">Diff</span>
                    <div className="hs-diff-list">
                      {diffLines.map((line, idx) => {
                        const isSeparator = line.status === "separator";
                        if (isSeparator) {
                          return (
                            <div key={`diff-${idx}`} className="hs-diff-separator">
                              <hr className="hs-divider" />
                            </div>
                          );
                        }
                        return (
                          <div
                            key={`diff-${idx}`}
                            className="hs-diff-row"
                          >
                            <div className={diffCellClass("left", line.status)}>{line.left || " "}</div>
                            <div className={diffCellClass("right", line.status)}>{line.right || " "}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => void onUpdateRevisionNote(selectedRevision, selectedRevision.note ?? "")}
                disabled={isSavingRevision}
              >
                {isSavingRevision ? "Saving note..." : "Save note"}
              </button>
            </div>
          ) : (
            <div className="hs-muted-text-subtle">Select a revision to preview.</div>
          )}
        </div>
      )}
    </section>
  );

  const renderEpisodesView = () => (
    <section className="hs-home">
      <header className="hs-home-header">
        <h2 className="hs-home-title">{isMobile ? "Workspace Projects" : "Episodes (In Progress)"}</h2>
        <p className="hs-home-subtext">
          {isMobile ? "Tap a project to open the mobile editor." : "Open an Episode to enter Focus Mode."}
        </p>
      </header>
      <div className="hs-home-actions">
        <button type="button" onClick={() => void startFromScratch()} disabled={isForging}>
          New Workpiece
        </button>
        <button type="button" onClick={onCreateDraft}>
          New Draft
        </button>
        {isMobile ? (
          <button type="button" onClick={openReadyInMobileOverlay}>
            Ready to Record
          </button>
        ) : null}
      </div>
      <div className="hs-rail-section">
        <label className="hs-rail-label">Search Episodes</label>
        <input
          aria-label="Search episodes"
          ref={searchRef}
          type="search"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="Search Episode titles"
        />
        <div className="hs-rail-sort">
          <label className="hs-rail-label">Sort</label>
          <select aria-label="Sort episodes" value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
            <option value="updated">Recently updated</option>
            <option value="title">Title A-Z</option>
          </select>
        </div>
      </div>
      <ul className="hs-workpieces-list">
        {filteredWorkpieceNavItems.map((item) => {
          const draft = item.draftId ? draftsById.get(item.draftId) ?? null : null;
          const isActive = workpieceId === item.workpieceId;
          const updatedAt = item.updatedAtMs || draft?.updatedAt || Date.now();
          const isArchiving = archivingWorkpieceIds.includes(item.workpieceId);
          const isRestoring = restoringWorkpieceIds.includes(item.workpieceId);
          return (
          <li key={item.workpieceId}>
            <div className={`hs-workpiece-card${isActive ? " is-active" : ""}`}>
              <button
                type="button"
                className="hs-workpiece-button"
                onClick={() => void openWorkpieceInFocus(item.workpieceId, {
                  preferredDraftId: item.draftId,
                })}
              >
                <div className="hs-workpiece-title-row">
                  <div className="hs-workpiece-title">{item.title}</div>
                  <span className={`hs-workpiece-presence ${resolveWorkpiecePresenceClass(item.workpieceId)}`}>
                    {resolveWorkpiecePresenceBadge(item.workpieceId)}
                  </span>
                </div>
                <div className="hs-workpiece-updated">Updated {formatUpdatedAt(updatedAt)}</div>
                <div className="hs-workpiece-updated">
                  {draft ? `Last edited by ${resolveDraftEditorName(draft)}` : "No attached draft buffer yet"}
                </div>
              </button>
              <div className="hs-workpiece-actions">
                {draft && !item.isArchived ? (
                  <button type="button" onClick={() => void saveDraftMeta(draft, { pinned: !draft.pinned })}>
                    {draft.pinned ? "Unpin" : "Pin"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void (
                    item.isArchived
                      ? onRestoreWorkpiece(item.workpieceId)
                      : onArchiveWorkpiece(item.workpieceId)
                  )}
                  disabled={isArchiving || isRestoring}
                >
                  {item.isArchived
                    ? isRestoring ? "Restoring..." : "Restore Workpiece"
                    : isArchiving ? "Archiving..." : "Archive Workpiece"}
                </button>
                {draft ? (
                  <button type="button" onClick={() => void onDeleteDraft(draft)}>
                    Delete Draft Buffer
                  </button>
                ) : null}
              </div>
            </div>
          </li>
        );
        })}
      </ul>
    </section>
  );

  const renderReadyView = () => (
    <section className="hs-home">
      <header className="hs-home-header">
        <h2 className="hs-home-title">Ready</h2>
        <p className="hs-home-subtext">Session List curated by Hearth.</p>
      </header>
      <div className="hs-ready-record-header">
        <div className="hs-rail-heading">
          Ready Items
          <span className="hs-ready-record-count">{readyTotalCount}</span>
        </div>
        <button type="button" onClick={() => void refreshReadyScripts()} disabled={isReadyScriptsLoading}>
          {isReadyScriptsLoading ? "Refreshing..." : "Refresh"}
        </button>
      </div>
      {removedReadyCount > 0 ? (
        <button type="button" onClick={() => void onRestoreRemovedReady()} disabled={isRestoringReady}>
          {isRestoringReady ? "Restoring..." : `Restore hidden (${removedReadyCount})`}
        </button>
      ) : null}
      {readyScriptsError ? <div className="hs-error-text-small">{readyScriptsError}</div> : null}
      <ul className="hs-ready-record-list">
        {orderedReadyScripts.map((entry) => {
          const anvilHref = resolveReadyOpenHref(entry);
          const label = resolveReadyLabel(entry);
          return (
            <li
              key={entry.id}
              className="hs-ready-record-item"
              draggable
              onDragStart={() => setDraggingReadyId(entry.id)}
              onDragEnd={() => setDraggingReadyId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggingReadyId) onReorderReady(draggingReadyId, entry.id);
                setDraggingReadyId(null);
              }}
            >
              <div className="hs-ready-record-title">{entry.title}</div>
              <div className="hs-ready-record-meta">{resolveReadyAttribution(entry)}</div>
              <label className="hs-ready-record-label">
                <span>Label</span>
                <select
                  value={label}
                  disabled={updatingReadyCategoryId === entry.id}
                  onChange={(event) => onReadyLabelChange(entry, event.target.value as ReadyLabel)}
                >
                  <option value="hot">Hot</option>
                  <option value="evergreen">Evergreen</option>
                  <option value="series">Series</option>
                </select>
              </label>
              <div className="hs-workpiece-actions">
                <button
                  type="button"
                  onClick={() => void onOpenReadyScriptInHearth(entry)}
                >
                  Open in Hearth
                </button>
                <button
                  type="button"
                  onClick={() => void onSendBackToEdit(entry)}
                  disabled={sendingBackReadyIds.includes(entry.id)}
                >
                  {sendingBackReadyIds.includes(entry.id) ? "Sending back..." : "Send Back to Edit"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!anvilHref) return;
                    window.location.assign(anvilHref);
                  }}
                  disabled={!anvilHref}
                >
                  Send to Anvil
                </button>
                <button
                  type="button"
                  onClick={() => void onRemoveFromReady(entry)}
                  disabled={removingReadyIds.includes(entry.id) || sendingBackReadyIds.includes(entry.id)}
                >
                  {removingReadyIds.includes(entry.id) ? "Hiding..." : "Hide from Ready"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );

  const renderSeriesView = () => {
    const seriesEntries = orderedReadyScripts.filter((entry) => resolveReadyLabel(entry) === "series");
    return (
      <section className="hs-home">
        <header className="hs-home-header">
          <h2 className="hs-home-title">Series</h2>
          <p className="hs-home-subtext">Series-focused queue.</p>
        </header>
        {seriesEntries.length === 0 ? (
          <p className="hs-home-empty">No series-labeled Episodes yet.</p>
        ) : (
          <ul className="hs-ready-record-list">
            {seriesEntries.map((entry) => (
              <li key={entry.id} className="hs-ready-record-item">
                <button
                  type="button"
                  className="hs-ready-record-link"
                  onClick={() => void openWorkpieceInFocus(entry.workpieceId, {
                    workspaceId: entry.workspaceId,
                    preferredDraftId: entry.workpieceId,
                  })}
                >
                  <div className="hs-ready-record-title">{entry.title}</div>
                </button>
                <div className="hs-ready-record-meta">{resolveReadyAttribution(entry)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  };

  const renderFocusEditor = () => {
    if (!hasActiveEpisode) {
      return (
        <section className="hs-home">
          <header className="hs-home-header">
            <h2 className="hs-home-title">Focus Mode</h2>
            <p className="hs-home-subtext">Open an Episode from Episodes (In Progress) first.</p>
          </header>
          <div className="hs-home-actions">
            <button type="button" onClick={() => setMode("episodes")}>
              Go to Episodes
            </button>
          </div>
        </section>
      );
    }

    if (activeWorkpieceContext.workpiece?.isArchived) {
      const archivedWorkpiece = activeWorkpieceContext.workpiece;
      const isRestoringArchivedWorkpiece = restoringWorkpieceIds.includes(archivedWorkpiece.workpieceId);
      return (
        <section className="hs-home">
          <header className="hs-home-header">
            <h2 className="hs-home-title">{archivedWorkpiece.title}</h2>
            <p className="hs-home-subtext">This workpiece is archived. Restore it to review, then re-ready it before recording.</p>
          </header>
          {archivedWorkpiece.archiveReason ? (
            <div className="hs-rail-meta">Archive reason: {archivedWorkpiece.archiveReason}</div>
          ) : null}
          <div className="hs-home-actions">
            <button
              type="button"
              onClick={() => void onRestoreWorkpiece(archivedWorkpiece.workpieceId, { openAfterRestore: true })}
              disabled={isRestoringArchivedWorkpiece}
            >
              {isRestoringArchivedWorkpiece ? "Restoring..." : "Restore Workpiece"}
            </button>
            <button type="button" onClick={() => setMode("episodes")}>
              Back to Episodes
            </button>
          </div>
        </section>
      );
    }

    if (!activeDraft) {
      return (
        <section className="hs-home">
          <header className="hs-home-header">
            <h2 className="hs-home-title">{activeWorkpieceContext.workpiece?.title ?? "Episode"}</h2>
            <p className="hs-home-subtext">Hydrating the attached draft buffer for this Episode.</p>
          </header>
          <div className="hs-home-actions">
            <button
              type="button"
              onClick={() => {
                if (!workpieceId) return;
                void openWorkpieceInFocus(workpieceId, {
                  preferredDraftId: session?.activeDraftId ?? null,
                });
              }}
              disabled={!workpieceId}
            >
              Retry draft hydration
            </button>
            <button type="button" onClick={() => setMode("episodes")}>
              Back to Episodes
            </button>
          </div>
        </section>
      );
    }

    switch (focusTab) {
      case "planning":
        return renderPlanningView();
      case "sources":
        return renderSourcesView();
      case "revisions":
        return renderRevisionsView();
      case "draft":
      default:
        return renderDraftView();
    }
  };

  const showSparkRouteBootstrap = Boolean(
    incomingBarStockIntakeRoute && routeSparkId && !routeProjectId && !hasActiveEpisode && !forgeError,
  );

  const mainContent = (() => {
    if (showSparkRouteBootstrap) {
      return renderSparkRouteBootstrapView();
    }
    switch (mode) {
      case "sparks":
        return renderSparksView();
      case "episodes":
        return renderEpisodesView();
      case "ready":
        return renderReadyView();
      case "series":
        return renderSeriesView();
      case "focus":
      default:
        return renderFocusEditor();
    }
  })();
  const mobileMainContent = renderEpisodesView();

  const sourcesBadge = missingSourcesCount > 0 ? String(missingSourcesCount) : null;
  const sourcesBadgeTitle = missingSourcesCount > 0
    ? `Missing cited sources: ${missingSourcesCount}${unusedSourcesCount ? ` · Unused refs: ${unusedSourcesCount}` : ""}`
    : unusedSourcesCount > 0
      ? `Unused refs: ${unusedSourcesCount}`
      : "Sources";

  return (
    <section className={`hs-shell hs-density-${uiDensity}${isMobile ? " hs-shell--mobile" : ""}`}>
      {isMobile ? (
        <main className="hs-main hs-main--mobile">
          {mobileMainContent}
        </main>
      ) : (
        <div className="hs-shell-grid">
        <aside
          className="hs-rail"
        >
          <div className="hs-rail-header">
            <div className="hs-rail-title">Hearth</div>
            {devMode ? (
              <div className="hs-rail-meta">Dev store: {storeKind}</div>
            ) : null}
            {workpieceId ? (
              <div className="hs-rail-meta">
                Workpiece {workpieceId.slice(0, 8)}
              </div>
            ) : null}
          </div>

          <div className="hs-rail-section">
            <div className="hs-rail-heading">Primary actions</div>
            <button type="button" onClick={() => void startFromScratch()} disabled={isForging}>
              New Workpiece
            </button>
            <button type="button" onClick={onCreateDraft}>
              New Draft
            </button>
          </div>

          <div className="hs-rail-section">
            <div className="hs-rail-heading">Modes</div>
            <button
              type="button"
              className={`hs-mode-button${mode === "sparks" ? " is-active" : ""}`}
              onClick={() => setMode("sparks")}
            >
              Sparks
            </button>
            <button
              type="button"
              className={`hs-mode-button${mode === "episodes" ? " is-active" : ""}`}
              onClick={() => setMode("episodes")}
            >
              Episodes (In Progress)
            </button>
            <button
              type="button"
              className={`hs-mode-button${mode === "ready" ? " is-active" : ""}`}
              onClick={() => setMode("ready")}
            >
              Ready
            </button>
            <button
              type="button"
              className={`hs-mode-button${mode === "series" ? " is-active" : ""}`}
              onClick={() => setMode("series")}
            >
              Series
            </button>
          </div>

          <div className="hs-rail-section">
            <label className="hs-rail-label" htmlFor="hs-density-select">Density</label>
            <select
              id="hs-density-select"
              aria-label="UI density"
              value={uiDensity}
              onChange={(event) => setUiDensity(event.target.value === "compact" ? "compact" : "comfortable")}
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </div>

          {deferDesktopRailCollections ? (
            <div className="hs-rail-section">
              <div className="hs-rail-heading">Workspace Queue</div>
              <div className="hs-rail-meta">
                Ready items and workspace projects load after you open or start an Episode.
              </div>
            </div>
          ) : (
            <>
              <div className="hs-rail-section">
                <div className="hs-ready-record-header">
                  <div className="hs-rail-heading">
                    Ready to Record
                    <span className="hs-ready-record-count">{readyTotalCount}</span>
                  </div>
                  <button type="button" onClick={() => void refreshReadyScripts()} disabled={isReadyScriptsLoading}>
                    {isReadyScriptsLoading ? "Refreshing..." : "Refresh"}
                  </button>
                </div>
                {readyScriptsError ? <div className="hs-error-text-small">{readyScriptsError}</div> : null}
                {readyCategoryError ? <div className="hs-error-text-small">{readyCategoryError}</div> : null}
                <div className="hs-rail-meta">
                  Each episode appears once in Projects. Ready state lives on the project row; queue management lives in the Ready view.
                </div>
                {isReadyScriptsLoading ? <p>Loading queue...</p> : null}
                {!isReadyScriptsLoading ? (
                  <div className="hs-ready-record-summary">
                    <div className="hs-ready-record-summary-row">
                      <span>Ready episodes</span>
                      <strong>{readyTotalCount}</strong>
                    </div>
                    <div className="hs-ready-record-summary-row">
                      <span>{READY_URGENCY_LABEL.fresh}</span>
                      <strong>{readyUrgencyCounts.fresh}</strong>
                    </div>
                    <div className="hs-ready-record-summary-row">
                      <span>{READY_URGENCY_LABEL.cooling}</span>
                      <strong>{readyUrgencyCounts.cooling}</strong>
                    </div>
                    <div className="hs-ready-record-summary-row">
                      <span>{READY_URGENCY_LABEL.cold}</span>
                      <strong>{readyUrgencyCounts.cold}</strong>
                    </div>
                    <div className="hs-ready-record-summary-row">
                      <span>Hidden</span>
                      <strong>{removedReadyCount}</strong>
                    </div>
                  </div>
                ) : null}
                <div className="hs-workpiece-actions">
                  <button
                    type="button"
                    className="hs-mode-button"
                    onClick={() => setMode("ready")}
                  >
                    Open Ready View
                  </button>
                  {removedReadyCount > 0 ? (
                    <button type="button" onClick={() => void onRestoreRemovedReady()} disabled={isRestoringReady}>
                      {isRestoringReady ? "Restoring..." : `Restore hidden (${removedReadyCount})`}
                    </button>
                  ) : null}
                </div>
                {!isReadyScriptsLoading && readyTotalCount === 0 && removedReadyCount === 0 ? (
                  <p className="hs-rail-meta">No items yet. Approve a script to populate Ready.</p>
                ) : null}
              </div>

              <div className="hs-rail-section">
                <label className="hs-rail-label">Search workspace projects</label>
                <input
                  aria-label="Search workspace projects"
                  ref={searchRef}
                  type="search"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Search Episode titles"
                />
                <div className="hs-rail-sort">
                  <label className="hs-rail-label">Sort</label>
                  <select aria-label="Sort workspace projects" value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
                    <option value="updated">Recently updated</option>
                    <option value="title">Title A-Z</option>
                  </select>
                </div>
                <label className="hs-rail-checkbox">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(event) => setShowArchived(event.target.checked)}
                  />
                  Show archived
                </label>
              </div>

              <div className="hs-rail-section">
                <div className="hs-rail-heading">Workspace Projects</div>
                {isLoading || isWorkpiecesLoading ? <p>Loading workspace projects...</p> : null}
                {workpiecesError ? <div className="hs-error-text-small">{workpiecesError}</div> : null}
                {!isLoading && !isWorkpiecesLoading && filteredWorkpieceNavItems.length === 0
                  ? <p>No workspace projects yet.</p>
                  : null}
                <ul className="hs-workpieces-list">
                  {filteredWorkpieceNavItems.map((item) => {
                    const draft = item.draftId ? draftsById.get(item.draftId) ?? null : null;
                    const draftId = draft?.id ?? null;
                    const isActive = workpieceId === item.workpieceId;
                    const isEditing = Boolean(draftId) && editingDraftId === draftId;
                    const updatedAt = item.updatedAtMs || draft?.updatedAt || Date.now();
                    const draftLabel = readTrimmedString(draft?.title ?? null);
                    const showDraftLabel = Boolean(draftLabel && draftLabel !== item.title);
                    const showWorkpieceId = duplicateRailTitleKeys.has(normalizeRailTitleKey(item.title));
                    const workpieceBadges = [
                      item.readyEntry ? { label: "Ready", tone: "ready" } : null,
                      draft ? { label: "Draft", tone: "draft" } : null,
                      draft?.revisionCount ? { label: `Revisions ${draft.revisionCount}`, tone: "count" } : null,
                      item.sparkCount > 0
                        ? { label: `${item.sparkCount} Spark${item.sparkCount === 1 ? "" : "s"}`, tone: "count" }
                        : null,
                      draft?.pinned ? { label: "Pinned", tone: "neutral" } : null,
                      item.isArchived ? { label: "Archived", tone: "archived" } : null,
                    ].filter((badge): badge is { label: string; tone: "ready" | "draft" | "count" | "neutral" | "archived" } => Boolean(badge));
                    const isArchiving = archivingWorkpieceIds.includes(item.workpieceId);
                    const isRestoring = restoringWorkpieceIds.includes(item.workpieceId);
                    return (
                      <li key={item.workpieceId}>
                        <div
                          className={`hs-workpiece-card${isActive ? " is-active" : ""}`}
                        >
                          <button
                            type="button"
                            onClick={() => void openWorkpieceInFocus(item.workpieceId, {
                              preferredDraftId: item.draftId,
                            })}
                            className="hs-workpiece-button"
                          >
                            <div className="hs-workpiece-title-row">
                              <div className="hs-workpiece-title-stack">
                                <div className="hs-workpiece-title">{item.title}</div>
                                {showWorkpieceId ? (
                                  <div className="hs-workpiece-secondary">ID {item.workpieceId.slice(0, 8)}</div>
                                ) : null}
                              </div>
                            </div>
                            {workpieceBadges.length > 0 ? (
                              <div className="hs-workpiece-badges" aria-label="Project status">
                                {workpieceBadges.map((badge) => (
                                  <span
                                    key={`${item.workpieceId}:${badge.label}`}
                                    className={`hs-workpiece-badge is-${badge.tone}`}
                                  >
                                    {badge.label}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                            <div className="hs-workpiece-updated">
                              Updated {formatUpdatedAt(updatedAt)}
                            </div>
                            <div className="hs-workpiece-updated">
                              {draft ? `Last edited by ${resolveDraftEditorName(draft)}` : "No attached draft buffer yet"}
                            </div>
                            {showDraftLabel ? (
                              <div className="hs-workpiece-updated">Draft label: {draftLabel}</div>
                            ) : null}
                          </button>
                          {draft && isEditing ? (
                            <label className="hs-workpiece-draft-label-editor">
                              <span className="hs-rail-label">Draft label</span>
                              <input
                                aria-label="Edit draft label"
                                value={editingTitle}
                                onChange={(event) => setEditingTitle(event.target.value)}
                                onKeyDown={(event) => {
                                  if (!draft) return;
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    void saveDraftMeta(draft, { title: editingTitle });
                                    setEditingDraftId(null);
                                  }
                                  if (event.key === "Escape") {
                                    setEditingDraftId(null);
                                  }
                                }}
                                onBlur={() => {
                                  if (draft && editingDraftId === draft.id) {
                                    void saveDraftMeta(draft, { title: editingTitle });
                                    setEditingDraftId(null);
                                  }
                                }}
                              />
                              <span className="hs-rail-meta">
                                Draft label only. Project title stays synced to Tongs.
                              </span>
                            </label>
                          ) : null}
                          {draft && !item.isArchived ? (
                            <div className="hs-workpiece-actions">
                              <button
                                type="button"
                                onClick={() => void saveDraftMeta(draft, { pinned: !draft.pinned })}
                              >
                                {draft.pinned ? "Unpin" : "Pin"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (editingDraftId === draft.id) {
                                    setEditingDraftId(null);
                                    return;
                                  }
                                  setEditingDraftId(draft.id);
                                  setEditingTitle(draft.title);
                                }}
                              >
                                {editingDraftId === draft.id ? "Close Draft Label" : "Edit Draft Label"}
                              </button>
                            </div>
                          ) : null}
                          <div className="hs-workpiece-actions">
                            <button
                              type="button"
                              onClick={() => void (
                                item.isArchived
                                  ? onRestoreWorkpiece(item.workpieceId)
                                  : onArchiveWorkpiece(item.workpieceId)
                              )}
                              disabled={isArchiving || isRestoring}
                            >
                              {item.isArchived
                                ? isRestoring ? "Restoring..." : "Restore Workpiece"
                                : isArchiving ? "Archiving..." : "Archive Workpiece"}
                            </button>
                            {draft ? (
                              <button type="button" onClick={() => void onDeleteDraft(draft)}>
                                Delete Draft Buffer
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}

          <div className={`hs-active-workpiece${hasActiveEpisode ? "" : " is-empty"}`}>
            <div className="hs-rail-heading">Active workpiece</div>
            {hasActiveEpisode ? (
              <>
                <div className="hs-active-workpiece-status">
                  <span className={`hs-episode-ready-pill is-${activeEpisodeReadyStatus.tone}`}>
                    {activeEpisodeReadyStatus.label}
                  </span>
                  <div className="hs-rail-meta">{activeEpisodeReadyStatus.detail}</div>
                </div>
                {activeWorkpieceIsArchived && activeWorkpiece ? (
                  <>
                    <div className="hs-rail-meta">Archived workpieces are hidden records. Restore to review, then re-ready before recording.</div>
                    {activeWorkpiece.archiveReason ? (
                      <div className="hs-rail-meta">Archive reason: {activeWorkpiece.archiveReason}</div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void onRestoreWorkpiece(activeWorkpiece.workpieceId, { openAfterRestore: true })}
                      disabled={restoringWorkpieceIds.includes(activeWorkpiece.workpieceId)}
                      className="hs-mode-button"
                    >
                      {restoringWorkpieceIds.includes(activeWorkpiece.workpieceId) ? "Restoring..." : "Restore Workpiece"}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void onOpenInAnvil()}
                      disabled={!openInAnvilHref || handoffBlocked}
                      className="hs-mode-button"
                    >
                      Start Recording
                    </button>
                    {anvilStepModeHint ? (
                      <div className="hs-rail-meta">{anvilStepModeHint}</div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setFocusTab("draft");
                        setMode("focus");
                      }}
                      className={`hs-mode-button${mode === "focus" && focusTab === "draft" ? " is-active" : ""}`}
                    >
                      Draft
                      <span className="hs-mode-meta">{wordCount} words</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusTab("planning");
                        setMode("focus");
                      }}
                      className={`hs-mode-button${mode === "focus" && focusTab === "planning" ? " is-active" : ""}`}
                    >
                      Planning Board
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusTab("sources");
                        setMode("focus");
                      }}
                      className={`hs-mode-button${mode === "focus" && focusTab === "sources" ? " is-active" : ""}`}
                      title={sourcesBadgeTitle}
                    >
                      Sources
                      {sourcesBadge ? (
                        <span className={`hs-sources-badge${devMode ? " is-dev" : ""}`}>{sourcesBadge}</span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusTab("revisions");
                        setMode("focus");
                      }}
                      className={`hs-mode-button${mode === "focus" && focusTab === "revisions" ? " is-active" : ""}`}
                    >
                      Revisions
                      <span className="hs-mode-meta">{revisions.length}</span>
                    </button>
                  </>
                )}
              </>
            ) : (
              <div className="hs-rail-meta">Select an episode to unlock recording and focus tools.</div>
            )}
          </div>

          <div className="hs-rail-section">
            <div className="hs-rail-heading">Tools</div>
            <button
              type="button"
              className="hs-mode-button"
              title={sourcesBadgeTitle}
              onClick={() => {
                if (!hasActiveEpisode) {
                  setMode("episodes");
                  return;
                }
                setFocusTab("sources");
                setMode("focus");
              }}
            >
              API / Ledger
              {sourcesBadge ? (
                <span className={`hs-sources-badge${devMode ? " is-dev" : ""}`}>{sourcesBadge}</span>
              ) : null}
            </button>
          </div>
        </aside>

          <main className="hs-main">
            {mainContent}
          </main>
        </div>
      )}

      {isMobile && mobileOverlayView === "editor" ? (
        <div className="hs-mobile-overlay">
          <MobilePage
            title={activeDraft?.title?.trim() || "Project Editor"}
            onBack={closeMobileOverlay}
            rightAction={
              <button type="button" onClick={openReadyInMobileOverlay}>
                Ready
              </button>
            }
            bottomBar={
              activeWorkpieceContext.workpiece?.isArchived ? (
                <div className="hs-mobile-overlay-actions">
                  <button
                    type="button"
                    onClick={() => activeWorkpieceContext.workpiece && void onRestoreWorkpiece(activeWorkpieceContext.workpiece.workpieceId, { openAfterRestore: true })}
                    disabled={!activeWorkpieceContext.workpiece || restoringWorkpieceIds.includes(activeWorkpieceContext.workpiece.workpieceId)}
                  >
                    {activeWorkpieceContext.workpiece && restoringWorkpieceIds.includes(activeWorkpieceContext.workpiece.workpieceId)
                      ? "Restoring..."
                      : "Restore Workpiece"}
                  </button>
                </div>
              ) : (
                <div className="hs-mobile-overlay-actions">
                  <button type="button" onClick={() => activeDraft && void onDeleteDraft(activeDraft)} disabled={!activeDraft || isSaving}>
                    Delete Draft Buffer
                  </button>
                  <button type="button" onClick={() => void onSaveDraft()} disabled={!activeDraft || isSaving}>
                    {isSaving ? "Saving..." : "Save"}
                  </button>
                </div>
              )
            }
          >
            <div className="hs-mobile-overlay-body">
              {renderFocusEditor()}
            </div>
          </MobilePage>
        </div>
      ) : null}

      {isMobile && mobileOverlayView === "ready" ? (
        <div className="hs-mobile-overlay">
          <MobilePage
            title="Ready to Record"
            onBack={closeMobileOverlay}
            rightAction={
              <button type="button" onClick={() => void refreshReadyScripts()} disabled={isReadyScriptsLoading}>
                {isReadyScriptsLoading ? "..." : "Refresh"}
              </button>
            }
          >
            <div className="hs-mobile-overlay-body">
              {renderReadyView()}
            </div>
          </MobilePage>
        </div>
      ) : null}

      <ComposeSetupModal
        open={composeModalOpen}
        defaults={productionDefaults}
        onClose={() => setComposeModalOpen(false)}
        onCompose={onComposeSetupSubmit}
      />

      {revisionModalOpen ? (
        <div
          className="hs-modal-overlay"
        >
          <div
            className="hs-modal"
          >
            <div className="hs-modal-title">Create Revision</div>
            <label className="hs-field">
              <span className="hs-field-label-muted">Kind</span>
              <select value={revisionKind} onChange={(event) => setRevisionKind(event.target.value as RevisionKind)}>
                <option value="manual">Manual</option>
                <option value="milestone">Milestone</option>
              </select>
            </label>
            <label className="hs-field">
              <span className="hs-field-label-muted">Note (optional)</span>
              <textarea
                value={revisionNote}
                onChange={(event) => setRevisionNote(event.target.value)}
                placeholder="Why this change?"
                className="hs-textarea-modal"
              />
            </label>
            <div className="hs-modal-actions">
              <button
                type="button"
                onClick={closeRevisionModal}
              >
                Cancel
              </button>
              <button type="button" onClick={() => void onConfirmRevision()} disabled={!activeDraft}>
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}


