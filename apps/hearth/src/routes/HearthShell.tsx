import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createDraft, type Draft } from "../domain/draft";
import type { HearthPlanningSession, HearthSessionDecision, HearthSessionOrigin } from "../domain/hearth-session";
import { HEARTH_SESSION_SCHEMA } from "../domain/hearth-session";
import { createRevision, type Revision, type RevisionKind } from "../domain/revision";
import type { HearthSession } from "../domain/session";
import {
  type BarStockSpark,
  enqueueBarStockSpark,
  isBarStockKey,
  resolveBarStockSparkHearthWorkpieceId,
  resolveBarstockSparkIdFromQuery,
  upsertBarStockSpark,
  writeBarStockSparks,
} from "../lib/barstock-sparks";
import {
  isCanonicalSparkDiscoveryResolved,
  listHearthBarStockSparks,
  resolveCanonicalSparkIntakeError,
} from "../lib/hearth-barstock-sparks";
import {
  readBarstockProjectContext,
  resolveBarstockProjectIdFromQuery,
  upsertBarstockProjectEpisodeLink,
} from "../lib/barstock-project-links";
import SourcesView from "../views/SourcesView";
import "./HearthShell.css";
import { createHearthWorkpiece } from "../lib/hearth-workpiece";
import {
  isHearthPlanningSessionKey,
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
  resolveAiThumbnailAutoApproveFromStorage,
  uploadHearthSttAudio,
  type HearthAiLane,
  type HearthChatMessage,
  type HearthInteractionEventType,
} from "../lib/hearth-chat-api";
import { writeHearthAiRuntimeStatus } from "../lib/ai-runtime-status";
import { commitHearthSession, readHearthSession } from "../lib/hearth-session-repo";
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
  chooseCanonicalImageMapScriptSource,
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
import { resolveTongsRequestApiToken, tongsFetch } from "../lib/tongs-fetch";
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
import { useScriptWorkspace } from "../hooks/useScriptWorkspace";
import { useScriptWorkspaceReadModel } from "../hooks/useScriptWorkspaceReadModel";
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
import {
  normalizeScriptTags,
  repairScriptTags,
  validateScriptTags,
  type ScriptValidationResult,
  type ScriptValidationIssue,
} from "@forge/shared/script-tags";
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
  commitWorkpieceProductionArtifact,
  readWorkpieceProductionArtifact,
  type ProductionArtifactKind,
} from "../lib/hearth-production-repo";
import {
  generateEpisodeThumbnail,
  loadThumbnailPreviewDataUrl,
  readEpisodePackageForWorkpiece,
  saveEpisodePackageForWorkpiece,
  uploadThumbnailImageVersion,
} from "../lib/hearth-thumbnail-api";
import {
  getWorkpieceImageMap,
  generateWorkpieceImageMapCandidates,
  loadImageMapCandidatePreviewDataUrl,
  saveWorkpieceImageMap,
  selectWorkpieceImageMapCandidate,
  uploadWorkpieceImageMapCandidateAsset,
} from "../lib/hearth-image-map-repo";
import {
  assessImageMapScriptAnchor,
  buildExactScriptAnchorFromSelection,
  buildImageMapAnchorPickerParagraphs,
  generateImageMapEntriesFromScript,
  reanchorImageMapEntry,
  resolveNearestParagraphSelection,
  resolveImageMapAnchorContext,
  type ImageMapScriptSelection,
} from "../lib/hearth-image-map-beats";
import {
  buildBrollPlanFromScript,
  buildStockCandidatesForBrollBeat,
  regenerateBrollBeatFromDescription,
} from "../lib/hearth-broll-plan";
import { uploadBrollBeatAsset } from "../lib/hearth-broll-plan-repo";
import {
  createReferenceClipPlan,
  inferReferenceClipSuitabilitySignals,
} from "../lib/hearth-reference-clip-plan";
import {
  deriveMediaMapPurpose,
} from "../lib/hearth-visual-purpose";
import {
  advanceExternalRequestTracker,
  buildBrollBeatBrief,
  buildReferenceClipBrief,
  createManualResultCandidate,
  formatVisualBriefAsText,
  listExternalGenerationProviders,
  type ExternalGenerationProvider,
} from "../lib/hearth-visual-actionability";
import {
  readWorkpieceEpisodeMediaMap,
  saveWorkpieceEpisodeMediaMap,
} from "../lib/hearth-media-map-repo";
import {
  activateEpisodeMediaMapForFulfillment,
} from "../lib/hearth-media-map-fulfillment";
import type {
  EpisodeBrollDataVisualSpec,
  EpisodeExternalRequestState,
  EpisodeBrollMotionAssetCategory,
  EpisodeReferenceClipChartType,
  EpisodeReferenceClipContextType,
  EpisodeReferenceClipDataType,
  EpisodeReferenceClipFormat,
  EpisodeReferenceClipMotionLevel,
  EpisodeReferenceClipPlan,
  EpisodeReferenceClipTone,
  EpisodeBrollPlan,
  EpisodeBrollPlanBeat,
  EpisodeContextualDataCompositePlan,
  EpisodeMediaMap,
  EpisodeMediaMapEntry,
  EpisodePackageV2,
  EpisodeImageMapAnchorScope,
  EpisodeLaunchVariant,
  EpisodeLaunchVariantStatus,
  EpisodeThumbnailConcept,
  EpisodeImageMapVisualPriority,
  EpisodeImageMapVisualType,
  EpisodeThumbnailVersion,
  EpisodeImageMapEntry,
  EpisodeSeoTitle,
} from "../lib/episode-package-v2";
import {
  addImageMapEntry,
  buildImageMapAnchorLabel,
  ensureBrollPlanV2,
  ensureReferenceClipPlanV2,
  ensureLaunchVariantsV2,
  ensureSeoV2,
  normalizeSeoTags,
  removeImageMapEntry,
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
  updateWorkspaceThumbnailBrandTemplate,
  uploadWorkspaceThumbnailBrandLogo,
} from "../lib/hearth-thumbnail-brand-templates";
import type { ThumbnailBrandTemplate } from "../lib/hearth-thumbnail-brand-templates";
import {
  DEFAULT_TITLE_STYLE,
  areEpisodeThumbnailTitleStylesEqual,
  normalizeEpisodeThumbnailTitleStyle,
} from "../lib/hearth-title-fonts";
import type {
  EpisodeThumbnailTitleStyle,
  TitleFontPreset,
  TitleShadowStrength,
} from "../lib/hearth-title-fonts";
import {
  HEARTH_THUMBNAIL_TITLE_CONTRACT,
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
type ProductionAction = "seo" | "tags" | "thumbnails" | "image_beat_sheet" | "release_prep_pack";
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

type MediaMapGenerationScope = "images_only" | "images_broll" | "images_reference_clips" | "full_media_plan";

function normalizeMediaMapGenerationScope(value: string | null | undefined): MediaMapGenerationScope {
  if (value === "images_reference_clips" || value === "images_cdc") return "images_reference_clips";
  if (value === "images_broll") return "images_broll";
  if (value === "images_only") return "images_only";
  return "full_media_plan";
}

type ImageBeatSheetEntry = {
  id: string;
  attach_after: string;
  description: string;
  prompt: string;
  match?: string;
};

type CanonicalImageMapScriptState = {
  status: "idle" | "loading" | "ready" | "error";
  text: string | null;
  source: "primary_script" | "saved_draft" | null;
  includesUnsavedLocalEdits: boolean;
  error: string | null;
};

type ReleasePrepSectionKey =
  | "youtube_optimized_cut"
  | "title_options"
  | "short_form_hook_20s"
  | "tone_variant_creator"
  | "audience_variant"
  | "monetization_angle";

type ReleasePrepSection = {
  key: ReleasePrepSectionKey;
  label: string;
  content: string;
};

const PRODUCTION_ACTION_LABEL: Record<ProductionAction, string> = {
  seo: "Generate SEO",
  tags: "Generate Tags",
  thumbnails: "Thumbnail Briefs",
  image_beat_sheet: "Image Beat Sheet",
  release_prep_pack: "Release Prep Pack",
};

const PRODUCTION_ACTION_ARTIFACT_KIND: Record<ProductionAction, ProductionArtifactKind> = {
  seo: "seo",
  tags: "tags",
  thumbnails: "thumbnails",
  image_beat_sheet: "image_beat_sheet",
  release_prep_pack: "pack",
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
  status: "attached" | "weak_match" | "orphaned" | "global";
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

function buildProductionPrompt(args: {
  action: ProductionAction;
  scriptVersion: number;
  scriptText: string;
  episodeTitle: string;
}): string {
  const header = [
    `Production mode request for approved Script Version ${args.scriptVersion}.`,
    "Use the approved script text below as the only source for script-derived outputs.",
    "Do not request topic basics. Do not output markdown tables.",
    "",
    `EPISODE_TITLE: ${args.episodeTitle || "Untitled Episode"}`,
    `SCRIPT_VERSION: ${args.scriptVersion}`,
    "APPROVED_SCRIPT_TEXT:",
    args.scriptText,
    "",
  ];

  if (args.action === "seo") {
    return [
      ...header,
      "Return plain text with exact sections:",
      "SEO_TITLES:",
      "- 5 options total",
      "- include labels: SAFE, SPICY, BALANCED_1, BALANCED_2, BALANCED_3",
      `- every title must preserve a thumbnail-safe hook of ${HEARTH_THUMBNAIL_TITLE_CONTRACT.preferred_max_words} words or fewer`,
      "",
      "DESCRIPTION:",
      "- one YouTube-ready description paragraph block",
      "",
      "PINNED_COMMENT_IDEAS:",
      "- 3 concise options",
    ].join("\n");
  }

  if (args.action === "tags") {
    return [
      ...header,
      "Return plain text with exact sections:",
      "TAGS_TOP10:",
      "- comma-separated (10 items)",
      "",
      "TAGS_FULL:",
      "- comma-separated (20-35 items)",
    ].join("\n");
  }

  if (args.action === "thumbnails") {
    return [
      ...header,
      "Return plain text with exactly 5 concepts in this format:",
      "THUMBNAIL_01",
      "Headline: ...",
      "Image concept: ...",
      "Mood/style: ...",
      "",
      "Repeat THUMBNAIL_02 ... THUMBNAIL_05 with same fields.",
    ].join("\n");
  }

  if (args.action === "release_prep_pack") {
    return [
      ...header,
      "Generate a Release Prep Pack from this approved script.",
      "Return plain text with exact sections in this order:",
      "YOUTUBE_OPTIMIZED_CUT:",
      "- tighter opening hook and clear promise",
      "- retention-aware structure notes",
      "",
      "TITLE_OPTIONS:",
      "- provide 3-7 options",
      "- click-optimized but honest",
      "- varied emotional framing",
      "",
      "SHORT_FORM_HOOK_20S:",
      "- one cold-open hook suitable for Shorts/TikTok/Reels",
      "- keep it to <= 20 seconds spoken length",
      "",
      "TONE_VARIANT_CREATOR:",
      "- more conversational personality-led version of the opening",
      "",
      "AUDIENCE_VARIANT:",
      "- one tailored opening variant for a likely audience angle",
      "",
      "MONETIZATION_ANGLE:",
      "- sponsorship positioning idea",
      "- one CTA direction",
      "- optional premium episode framing",
      "",
      "Rules:",
      "- Do not overwrite the primary script.",
      "- Treat this as a derived release-prep output.",
      "- Do not use markdown tables.",
      "- Keep recommendations practical and production-ready.",
    ].join("\n");
  }

  return [
    ...header,
    "Generate an image beat sheet.",
    "Return plain text with one or more blocks in this exact format:",
    "IMAGE_01",
    "Attach after: \"<EXACT QUOTE FROM APPROVED SCRIPT>\"",
    "Description: ...",
    "Prompt: ...",
    "Match: first occurrence",
    "",
    "Rules:",
    "- Attach after must be an exact quote from APPROVED_SCRIPT_TEXT.",
    "- If quote appears multiple times, include Match line with disambiguation.",
    "- Use plain text prompts only.",
  ].join("\n");
}

function parseImageBeatSheetEntries(text: string): ImageBeatSheetEntry[] {
  const lines = text.split(/\r?\n/);
  const entries: ImageBeatSheetEntry[] = [];
  let current: Partial<ImageBeatSheetEntry> | null = null;

  const flush = () => {
    if (!current) return;
    if (current.id && current.attach_after && current.description && current.prompt) {
      entries.push({
        id: current.id,
        attach_after: current.attach_after,
        description: current.description,
        prompt: current.prompt,
        ...(current.match ? { match: current.match } : {}),
      });
    }
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const imageHeader = line.match(/^IMAGE_(\d{1,3})$/i);
    if (imageHeader) {
      flush();
      current = { id: `IMAGE_${imageHeader[1]?.padStart(2, "0") ?? "01"}` };
      continue;
    }
    if (!current) continue;

    const attach = line.match(/^Attach after:\s*["“](.+)["”]\s*$/i);
    if (attach && attach[1]) {
      current.attach_after = attach[1].trim();
      continue;
    }

    const description = line.match(/^Description:\s*(.+)$/i);
    if (description && description[1]) {
      current.description = description[1].trim();
      continue;
    }

    const prompt = line.match(/^Prompt:\s*(.+)$/i);
    if (prompt && prompt[1]) {
      current.prompt = prompt[1].trim();
      continue;
    }

    const match = line.match(/^Match:\s*(.+)$/i);
    if (match && match[1]) {
      current.match = match[1].trim();
    }
  }

  flush();
  return entries;
}

function parseReleasePrepPackSections(rawText: string): ReleasePrepSection[] {
  const text = rawText.replace(/\r\n?/g, "\n").trim();
  if (!text) return [];
  const headerRe = /^(YOUTUBE_OPTIMIZED_CUT|TITLE_OPTIONS|SHORT_FORM_HOOK_20S|TONE_VARIANT_CREATOR|AUDIENCE_VARIANT|MONETIZATION_ANGLE):\s*$/gm;
  const matches = [...text.matchAll(headerRe)];
  if (matches.length === 0) {
    return [{
      key: "youtube_optimized_cut",
      label: "Release Prep Pack",
      content: text,
    }];
  }

  const out: ReleasePrepSection[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];
    const header = (current?.[1] ?? "").trim().toUpperCase();
    const start = (current?.index ?? 0) + (current?.[0]?.length ?? 0);
    const end = next?.index ?? text.length;
    const body = text.slice(start, end).trim();
    const key = header.toLowerCase() as ReleasePrepSectionKey;
    const label = header
      .toLowerCase()
      .split("_")
      .map((part) => (part === "20s" ? "20s" : part.charAt(0).toUpperCase() + part.slice(1)))
      .join(" ");
    out.push({
      key,
      label,
      content: body || "(No content generated)",
    });
  }
  return out;
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

function buildVisualScriptIntentExportDocument(
  workpieceId: string | null,
  entries: EpisodeImageMapEntry[],
): Record<string, unknown> {
  return {
    schema: "forge.hearth.visual-script-intent.v1",
    ...(workpieceId ? { workpiece_id: workpieceId } : {}),
    anchors: entries,
  };
}

function replaceEpisodePackageImageMap(
  pkg: EpisodePackageV2,
  entries: EpisodeImageMapEntry[],
): EpisodePackageV2 {
  return {
    ...pkg,
    image_map: {
      entries,
    },
  };
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
};

function detectChatIntentSignals(text: string): ChatIntentSignals {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  const requestedOutline = /\boutline\b/.test(normalized);
  const requestedScript = /\bscript\b/.test(normalized)
    || /\bdraft\b/.test(normalized)
    || /\bcold open\b/.test(normalized)
    || /\bsegments?\b/.test(normalized);
  const explicitDraftNow = /\bdraft now\b/.test(normalized)
    || /\bskip questions\b/.test(normalized)
    || /\bno questions\b/.test(normalized);
  const hasDeliverable = requestedOutline
    || requestedScript
    || /\bbullet points?\b/.test(normalized)
    || /\bthumbnail\b/.test(normalized)
    || /\bseo\b/.test(normalized)
    || /\btags?\b/.test(normalized);
  return {
    requestedOutline,
    requestedScript,
    explicitDraftNow,
    hasDeliverable,
  };
}

function detectAiAutosaveReasonCode(text: string): AiAutosaveReasonCode {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return "ai_rewrite";
  if (/\b(correct|repair|fix|tag audit|cleanup)\b/.test(normalized)) return "ai_repair";
  if (/\b(rewrite|improve|shorten|punch up|edit|revise|polish|tighten)\b/.test(normalized)) return "ai_rewrite";
  if (/\boutline|bullet points?|beats?\b/.test(normalized)) return "ai_outline";
  if (/\b(write|script|draft|cold open|segments?)\b/.test(normalized)) return "ai_script";
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
}): string {
  const assistantText = args.assistantText.trim();
  const outlineFromOps = readLatestOutlineFromOps(args.ops);

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

function evaluateScriptValidation(rawText: string): { normalizedText: string; validation: ScriptValidationResult } {
  const normalizedText = normalizeScriptTags(rawText);
  const validation = validateScriptTags(normalizedText);
  return { normalizedText, validation };
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
  return !(hasTitle || hasTitleVariants || hasGoals || hasOutline || hasDecisions || hasAudience || hasTone);
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
    chatPersistTimerRef,
    chatMessagesRef,
    latestChatHistoryKeyRef,
    latestChatDraftIdRef,
    skipChatHydrationKeyRef,
    pendingChatHydrationKeyRef,
    chatHydrationSeqRef,
  } = useChatWorkspaceState<PendingAiProposal>();
  const [latestReleasePrepRawText, setLatestReleasePrepRawText] = useState<string | null>(null);
  const [latestReleasePrepSections, setLatestReleasePrepSections] = useState<ReleasePrepSection[]>([]);
  const [releasePrepLoadState, setReleasePrepLoadState] = useState<"idle" | "loading" | "ready" | "missing" | "error">("idle");
  const [releasePrepScriptVersion, setReleasePrepScriptVersion] = useState<number | null>(null);
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
  const [episodePackage, setEpisodePackage] = useState<EpisodePackageV2 | null>(null);
  const [selectedThumbnailTitleId, setSelectedThumbnailTitleId] = useState<string | null>(null);
  const [selectedThumbnailConceptId, setSelectedThumbnailConceptId] = useState<string>("");
  const [selectedThumbnailVersionId, setSelectedThumbnailVersionId] = useState<string | null>(null);
  const [selectedLaunchVariantId, setSelectedLaunchVariantId] = useState<string | null>(null);
  const [launchVariantStatusDraft, setLaunchVariantStatusDraft] = useState<EpisodeLaunchVariantStatus>("draft");
  const [launchVariantNotesDraft, setLaunchVariantNotesDraft] = useState("");
  const [thumbnailConceptLabelDraft, setThumbnailConceptLabelDraft] = useState("");
  const [thumbnailConceptPromptDraft, setThumbnailConceptPromptDraft] = useState("");
  const [thumbnailConceptStyleDraft, setThumbnailConceptStyleDraft] = useState(DEFAULT_HEARTH_VISUAL_STYLE);
  const [thumbnailTitleStyleDraft, setThumbnailTitleStyleDraft] = useState<EpisodeThumbnailTitleStyle>(DEFAULT_TITLE_STYLE);
  const [thumbnailConceptBrandTemplateIdDraft, setThumbnailConceptBrandTemplateIdDraft] = useState<string | null>(null);
  const [thumbnailBrandTemplates, setThumbnailBrandTemplates] = useState<ThumbnailBrandTemplate[]>([]);
  const [isThumbnailBrandTemplatesLoading, setIsThumbnailBrandTemplatesLoading] = useState(false);
  const [thumbnailBrandTemplatesError, setThumbnailBrandTemplatesError] = useState<string | null>(null);
  const [thumbnailBrandLogoDataUrl, setThumbnailBrandLogoDataUrl] = useState<string | null>(null);
  const [isThumbnailBrandLogoUploading, setIsThumbnailBrandLogoUploading] = useState(false);
  const [thumbnailBrandLogoError, setThumbnailBrandLogoError] = useState<string | null>(null);
  const [thumbnailBrandLogoStatus, setThumbnailBrandLogoStatus] = useState<string | null>(null);
  const [thumbnailPromptOverride, setThumbnailPromptOverride] = useState("");
  const [thumbnailAspect, setThumbnailAspect] = useState<"16:9" | "1:1" | "9:16">("16:9");
  const [isThumbnailGenerating, setIsThumbnailGenerating] = useState(false);
  const [isThumbnailConceptSaving, setIsThumbnailConceptSaving] = useState(false);
  const [isThumbnailUploading, setIsThumbnailUploading] = useState(false);
  const [thumbnailGenerateError, setThumbnailGenerateError] = useState<string | null>(null);
  const [thumbnailUploadError, setThumbnailUploadError] = useState<string | null>(null);
  const [thumbnailPairingError, setThumbnailPairingError] = useState<string | null>(null);
  const [thumbnailPreviewState, setThumbnailPreviewState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [thumbnailPreviewDataUrl, setThumbnailPreviewDataUrl] = useState<string | null>(null);
  const [thumbnailPreviewError, setThumbnailPreviewError] = useState<string | null>(null);
  const [thumbnailSafeZoneEnabled, setThumbnailSafeZoneEnabled] = useState(false);
  const [selectedImageMapEntryId, setSelectedImageMapEntryId] = useState<string | null>(null);
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
  const [scriptPanelCopyMessage, setScriptPanelCopyMessage] = useState<string | null>(null);
  const episodePackageRequestSeqRef = useRef(0);
  const thumbnailPreviewRequestSeqRef = useRef(0);
  const imageMapCandidatePreviewRequestSeqRef = useRef(0);
  const artifactStateWorkpieceIdRef = useRef<string | null>(null);
  const [metadataTitlesDraft, setMetadataTitlesDraft] = useState<EpisodeSeoTitle[]>([]);
  const [metadataTagsDraft, setMetadataTagsDraft] = useState<string[]>([]);
  const [metadataTagInputDraft, setMetadataTagInputDraft] = useState("");
  const [metadataDescriptionShortDraft, setMetadataDescriptionShortDraft] = useState("");
  const [metadataDescriptionLongDraft, setMetadataDescriptionLongDraft] = useState("");
  const [metadataPreviewMode, setMetadataPreviewMode] = useState<"youtube" | "rss" | "plain">("youtube");
  const [metadataSaveState, setMetadataSaveState] = useState<"saved" | "editing" | "saving" | "offline" | "error">("saved");
  const [metadataSaveError, setMetadataSaveError] = useState<string | null>(null);
  const [activeWorkpieceTab, setActiveWorkpieceTab] = useState<WorkpieceWorkspaceTab>(() =>
    readWorkpieceWorkspaceTab(
      incomingBarStockIntakeRoute ? null : resolveWorkpieceId(),
      incomingBarStockIntakeRoute ? null : resolveWorkspaceId(),
    ),
  );
  const [presenceRows, setPresenceRows] = useState<HearthWorkpiecePresence[]>([]);
  const [draftConflictState, setDraftConflictState] = useState<DraftConflictState | null>(null);
  const [mobileOverlayView, setMobileOverlayView] = useState<"editor" | "ready" | null>(null);

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
  const previousWorkspaceIdRef = useRef<string | null>(workspaceId);
  const readyScriptsRequestSeqRef = useRef(0);
  const restoredCursorDraftIdRef = useRef<string | null>(null);
  const restoredModeDraftKeyRef = useRef<string | null>(null);
  const pendingFocusOpenCountRef = useRef(0);
  const pendingDraftEditorPanelRef = useRef<"script" | "manual" | null>(null);
  const gateAwaitingAnswersRef = useRef(false);
  const pendingShortcutIntentRef = useRef<"outline" | "script" | null>(null);

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
  const referenceClipProviders: ExternalGenerationProvider[] = listExternalGenerationProviders("reference_clip");
  const referenceClipRequestStateLabel = resolveVisualRequestStateLabel(selectedReferenceClipEntry?.external_request?.state);
  const selectedImageMapExactAnchor = useMemo(() => {
    if (!selectedImageMapEntry || canonicalImageMapScriptState.status !== "ready" || !canonicalImageMapScriptState.text) {
      return null;
    }
    return assessImageMapScriptAnchor(
      canonicalImageMapScriptState.text,
      selectedImageMapEntry.script_anchor,
      selectedImageMapEntry.anchor_scope ?? (selectedImageMapEntry.script_anchor ? "attached" : "orphaned"),
    );
  }, [canonicalImageMapScriptState.status, canonicalImageMapScriptState.text, selectedImageMapEntry]);
  const imageMapAnchorStatusView = useMemo(() => {
    if (!selectedImageMapEntry) return null;
    const status = selectedImageMapExactAnchor?.status
      ?? ((selectedImageMapEntry.anchor_scope === "global")
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
    let globalCount = 0;
    let orphanedCount = 0;

    for (const entry of imageMapEntries) {
      const scope = entry.anchor_scope ?? (entry.script_anchor ? "attached" : "orphaned");
      if (scope === "global") {
        globalCount += 1;
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
      globalCount,
      orphanedCount,
    };
  }, [imageMapAnchorPickerParagraphs, imageMapEntries]);
  const imageMapActiveAnchorLabel = useMemo(() => {
    const anchor = selectedImageMapExactAnchor?.exactAnchor
      ?? selectedImageMapExactAnchor?.weakAnchor
      ?? selectedImageMapEntry?.script_anchor
      ?? null;
    return buildImageMapAnchorLabel(anchor);
  }, [selectedImageMapEntry?.script_anchor, selectedImageMapExactAnchor]);
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
      && imageMapAnchorScopeDraft !== "global"
      && resolveNearestParagraphSelection(canonicalImageMapScriptState.text, selectedImageMapEntry.script_anchor),
    )
  ), [
    canonicalImageMapScriptState.status,
    canonicalImageMapScriptState.text,
    imageMapAnchorScopeDraft,
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
  const draftShortcutLabel = useMemo(() => `Start with ${getHearthWritingFormatProfile(selectedWritingFormat).shortLabel}`, [selectedWritingFormat]);
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
  const approvedAtText = scriptApprovalState.approvedAt
    ? formatUpdatedAt(scriptApprovalState.approvedAt)
    : "Unknown";
  const mediaMapCoverageLevel = useMemo(() => resolveMediaPlanCoverageLevel(mediaMapEntries), [mediaMapEntries]);
  const mediaMapScopeLabel = useMemo(() => resolveMediaPlanScopeLabel(mediaMapEntries), [mediaMapEntries]);
  const metadataComplete = Boolean(
    metadataTitlesDraft.length > 0
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
    metadata: `${metadataTitlesDraft.length} titles · ${metadataTagsDraft.length} tags · ${metadataComplete ? "Complete" : "Needs work"}`,
    release: `${releasePrepLoadState === "ready" ? "Prep ready" : "Prep pending"} · ${releaseReadiness.completeCount}/${releaseReadiness.totalCount} ready`,
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
    sttState,
    setSttLane,
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
    sttInlineFeedbackMs: STT_INLINE_FEEDBACK_MS,
    sttPreviewMaxChars: STT_PREVIEW_MAX_CHARS,
    aiSttMaxDurationMs: AI_STT_MAX_DURATION_MS,
    aiSttMaxBytes: AI_STT_MAX_BYTES,
    resolveAiLaneFromStorage,
    resolveAiSttMimeType,
    uploadHearthSttAudio,
    requestHearthSttTranscript,
    sendChatMessage,
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
        nextDraft = { ...nextDraft, body: value };
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
    } else {
      setActiveDraft((prev) => (prev ? nextDraft : prev));
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
      const projectedValidation = validateScriptTags(normalizeScriptTags(projectedBody));
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
      onToggleMic,
      onChatDraftChange: setChatDraft,
      onSendChat: () => void onSendChat(),
      onCancelAiRequest,
      describeProposalOp: describeHearthOp,
      getProposalDiff: buildProposalDiff,
      validateProposalBody: (value) => validateScriptTags(normalizeScriptTags(value)),
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
  }, [workpieceId]);

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
      if (!cancelled) {
        setAiBillingMode(lane);
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

  const refreshEpisodePackage = useCallback(async () => {
    const episodeId = workpieceId?.trim() ?? "";
    const requestSeq = episodePackageRequestSeqRef.current + 1;
    episodePackageRequestSeqRef.current = requestSeq;

    if (artifactStateWorkpieceIdRef.current !== episodeId) {
      // Clear stale artifact state as soon as the active workpiece changes so prior package
      // residue never renders as current truth for the new target.
      setEpisodePackage(null);
      setImageMapMetadataUpdatedAt(null);
      setSelectedThumbnailTitleId(null);
      setSelectedThumbnailConceptId("");
      setSelectedThumbnailVersionId(null);
      setSelectedLaunchVariantId(null);
      setSelectedMediaMapEntryId(null);
      setSelectedImageMapEntryId(null);
      setSelectedBrollBeatId(null);
      setSelectedReferenceClipEntryId(null);
      setThumbnailGenerateError(null);
      setThumbnailUploadError(null);
      setThumbnailPairingError(null);
      setThumbnailPreviewState("idle");
      setThumbnailPreviewDataUrl(null);
      setThumbnailPreviewError(null);
      setImageMapSaveState("saved");
      setImageMapSaveError(null);
      setImageMapExportMessage(null);
      setMediaMapSaveState("saved");
      setMediaMapSaveError(null);
      setMediaMapMessage(null);
      setBrollSaveState("saved");
      setBrollSaveError(null);
      setBrollMessage(null);
      setReferenceClipSaveState("saved");
      setReferenceClipSaveError(null);
      setReferenceClipMessage(null);
      setLatestReleasePrepRawText(null);
      setLatestReleasePrepSections([]);
      setReleasePrepLoadState("idle");
      setReleasePrepScriptVersion(null);
      artifactStateWorkpieceIdRef.current = episodeId || null;
    }

    if (!episodeId) {
      artifactStateWorkpieceIdRef.current = null;
      return;
    }

    const loaded = await readEpisodePackageForWorkpiece(episodeId);
    if (episodePackageRequestSeqRef.current !== requestSeq || (workpieceId?.trim() ?? "") !== episodeId) {
      return;
    }
    if (!loaded.ok) {
      setThumbnailGenerateError("Unable to load thumbnail metadata.");
      setThumbnailPreviewState("error");
      setThumbnailPreviewDataUrl(null);
      setThumbnailPreviewError("Unable to load thumbnail metadata.");
      return;
    }

    // Paint baseline episode package immediately so the primary list content can render
    // before slower image/media map hydration calls complete.
    setEpisodePackage(loaded.episodePackage);
    artifactStateWorkpieceIdRef.current = episodeId;
    setThumbnailGenerateError(null);
    setImageMapSaveError(null);
    {
      const versions = loaded.episodePackage.thumbnail.versions;
      const preferredVersionId = loaded.episodePackage.thumbnail.primary_version_id
        ?? versions[versions.length - 1]?.id
        ?? null;
      setSelectedThumbnailVersionId(preferredVersionId);
      const initialImageEntries = loaded.episodePackage.image_map.entries;
      setSelectedImageMapEntryId((prev) => {
        if (prev && initialImageEntries.some((entry) => entry.id === prev)) return prev;
        return initialImageEntries[0]?.id ?? null;
      });
    }

    const [imageMapLoaded, mediaMapLoaded] = await Promise.all([
      getWorkpieceImageMap(episodeId),
      readWorkpieceEpisodeMediaMap(episodeId),
    ]);
    if (episodePackageRequestSeqRef.current !== requestSeq || (workpieceId?.trim() ?? "") !== episodeId) {
      return;
    }

    let nextEpisodePackage = loaded.episodePackage;
    if (imageMapLoaded.ok) {
      nextEpisodePackage = replaceEpisodePackageImageMap(loaded.episodePackage, imageMapLoaded.imageMap.entries);
      setImageMapMetadataUpdatedAt(imageMapLoaded.imageMap.metadataUpdatedAt);
    } else {
      setImageMapMetadataUpdatedAt(null);
    }
    if (mediaMapLoaded.ok && mediaMapLoaded.mediaMap) {
      nextEpisodePackage = {
        ...nextEpisodePackage,
        media_map: {
          ...mediaMapLoaded.mediaMap,
          workpiece_id: episodeId,
        },
      };
    }

    setEpisodePackage(nextEpisodePackage);
    const imageEntries = nextEpisodePackage.image_map.entries;
    setSelectedImageMapEntryId((prev) => {
      if (prev && imageEntries.some((entry) => entry.id === prev)) return prev;
      return imageEntries[0]?.id ?? null;
    });
  }, [workpieceId]);

  const loadLatestReleasePrepPack = useCallback(async (scriptVersion: number) => {
    const episodeId = workpieceId?.trim() ?? "";
    if (!episodeId || !Number.isFinite(scriptVersion) || scriptVersion <= 0) {
      setLatestReleasePrepRawText(null);
      setLatestReleasePrepSections([]);
      setReleasePrepLoadState("idle");
      setReleasePrepScriptVersion(null);
      return;
    }

    setReleasePrepLoadState("loading");
    const loaded = await readWorkpieceProductionArtifact({
      workpieceId: episodeId,
      scriptVersion,
      kind: "pack",
    });
    if (!loaded.ok) {
      setLatestReleasePrepRawText(null);
      setLatestReleasePrepSections([]);
      setReleasePrepLoadState(loaded.reason === "not_found" ? "missing" : "error");
      setReleasePrepScriptVersion(scriptVersion);
      return;
    }

    const payload = loaded.payload;
    const rawText = (
      typeof payload === "object" && payload && !Array.isArray(payload)
        ? readTrimmedString((payload as Record<string, unknown>).raw_text)
        : null
    ) ?? "";
    setLatestReleasePrepRawText(rawText || null);
    setLatestReleasePrepSections(parseReleasePrepPackSections(rawText));
    setReleasePrepLoadState("ready");
    setReleasePrepScriptVersion(scriptVersion);
  }, [workpieceId]);

  useEffect(() => {
    if (!hasApprovedScript || !approvedScriptVersion) {
      setLatestReleasePrepRawText(null);
      setLatestReleasePrepSections([]);
      setReleasePrepLoadState("idle");
      setReleasePrepScriptVersion(null);
      return;
    }
    // Avoid eager fetch spam for pack.json (often legitimately absent).
    // We load on explicit Refresh or when release_prep_pack generation completes.
    setLatestReleasePrepRawText(null);
    setLatestReleasePrepSections([]);
    setReleasePrepLoadState("idle");
    setReleasePrepScriptVersion(approvedScriptVersion);
  }, [approvedScriptVersion, hasApprovedScript]);

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

  const onSaveDraft = useCallback(async () => {
    if (!activeDraft) return;
    const now = Date.now();
    const saved = await persistDraft({
      draft: activeDraft,
      updatedAt: now,
      createRevision: null,
      saveReason: "manual",
    });
    if (!saved) return;
    noteManualSaveSuccess(now);
    flushChatHistoryNow({ draftId: activeDraft.id });
  }, [activeDraft, flushChatHistoryNow, noteManualSaveSuccess]);

  const onReloadLatestDraftAfterConflict = useCallback(async () => {
    const currentDraftId = activeDraft?.id ?? null;
    await refreshDrafts();
    if (!currentDraftId) {
      setDraftConflictState(null);
      return;
    }
    const latest = await store.getDraft(currentDraftId);
    if (latest) {
      await selectDraft(latest);
    }
    setDraftConflictState(null);
  }, [activeDraft?.id, refreshDrafts, selectDraft, store]);

  const onCopyConflictLocalText = useCallback(async () => {
    const text = draftConflictState?.localBody?.trim() ?? "";
    if (!text) return;
    try {
      const copied = await writeTextToClipboard(text);
      if (!copied) {
        throw new Error("copy_failed");
      }
      setError("Copied your local draft text to clipboard.");
    } catch {
      setError("Unable to copy local text. Select and copy manually.");
    }
  }, [draftConflictState?.localBody]);

  const onCopyScriptPanelText = useCallback(async () => {
    const text = scriptPanelBodyText;
    if (!text.trim()) return;
    const copied = await writeTextToClipboard(text);
    setScriptPanelCopyMessage(copied ? "Copied to clipboard." : "Clipboard write failed.");
  }, [scriptPanelBodyText]);

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

  const openWorkpieceInFocus = useCallback(async (
    targetWorkpieceId: string,
    options?: {
      workspaceId?: string | null;
      drafts?: readonly Draft[];
      workpieces?: readonly HearthWorkpieceSummary[];
      preferredDraftId?: string | null;
      seed?: { title?: string; body?: string };
    },
  ): Promise<Draft | null> => {
    const normalizedWorkpieceId = normalizeUuid(targetWorkpieceId);
    if (!normalizedWorkpieceId) return null;

    const targetWorkspaceId = normalizeUuid(options?.workspaceId ?? workspaceId) ?? workspaceId;
    pendingFocusOpenCountRef.current += 1;
    if (targetWorkspaceId && targetWorkspaceId !== workspaceId) {
      setWorkspaceId(targetWorkspaceId);
    }
    setWorkpieceId(normalizedWorkpieceId);
    replaceHearthRouteContext(targetWorkspaceId ?? null, normalizedWorkpieceId);
    setFocusTab("draft");
    setMode("focus");

    try {
      let availableWorkpieces = options?.workpieces ?? workpieceSummariesRef.current;
      if (
        availableWorkpieces.length === 0
        || !availableWorkpieces.some((entry) => entry.workpieceId === normalizedWorkpieceId)
      ) {
        availableWorkpieces = await refreshWorkpieces(targetWorkspaceId, { includeArchived: true });
      }

      const targetWorkpiece = availableWorkpieces.find((entry) => entry.workpieceId === normalizedWorkpieceId) ?? null;
      if (targetWorkpiece?.isArchived) {
        await selectDraft(null);
        await persistSession(null, "draft");
        if (isMobile) {
          setMobileOverlayView("editor");
        }
        return null;
      }

      const draft = await hydrateOrCreateDraftBufferForWorkpiece(normalizedWorkpieceId, {
        drafts: options?.drafts ?? draftsRef.current,
        workpieces: availableWorkpieces,
        preferredDraftId: options?.preferredDraftId ?? null,
        seed: options?.seed,
      });

      if (draft) {
        await selectDraft(draft, { revisionWorkpieceId: normalizedWorkpieceId });
      } else {
        setDraftSnapshot(null);
        setActiveDraft(null);
      }

      if (isMobile) {
        setMobileOverlayView("editor");
      }

      return draft;
    } finally {
      pendingFocusOpenCountRef.current = Math.max(0, pendingFocusOpenCountRef.current - 1);
    }
  }, [
    hydrateOrCreateDraftBufferForWorkpiece,
    isMobile,
    persistSession,
    refreshWorkpieces,
    selectDraft,
    workspaceId,
  ]);

  const createDraftAndOpen = useCallback(async (
    targetWorkpieceId: string,
    seed?: { title?: string; body?: string },
    modeToSet: HearthMode = "focus",
    options?: {
      revisionWorkpieceId?: string | null;
      workspaceId?: string | null;
      drafts?: readonly Draft[];
      workpieces?: readonly HearthWorkpieceSummary[];
    },
  ) => {
    const normalizedWorkpieceId = normalizeUuid(targetWorkpieceId);
    if (!normalizedWorkpieceId) {
      throw new Error("A workpiece is required before creating a Hearth draft buffer.");
    }

    const draft = await openWorkpieceInFocus(normalizedWorkpieceId, {
      workspaceId: options?.workspaceId ?? null,
      drafts: options?.drafts,
      workpieces: options?.workpieces,
      preferredDraftId: normalizedWorkpieceId,
      seed,
    });

    if (modeToSet !== "focus") {
      setMode(modeToSet);
    }

    if (draft && options?.revisionWorkpieceId && options.revisionWorkpieceId !== normalizedWorkpieceId) {
      await selectDraft(draft, { revisionWorkpieceId: options.revisionWorkpieceId });
    }

    return draft;
  }, [openWorkpieceInFocus, selectDraft]);

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
      pendingDraftEditorPanelRef.current = "manual";

      const draft = await createDraftAndOpen(workpieceId, {
        title: sparkTitle,
        body: scriptSeed,
      }, "focus", {
        revisionWorkpieceId: workpieceId ?? null,
        workspaceId: resolveWorkspaceId(),
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

  const loadInitial = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (incomingBarStockIntakeRoute) {
        const intakeResetKey = `${normalizeUuid(workspaceId) ?? resolveWorkspaceId() ?? "none"}:${routeProjectId ?? routeSparkId ?? "none"}`;
        if (intakeResetKeyRef.current !== intakeResetKey) {
          intakeResetKeyRef.current = intakeResetKey;
          setSession(null);
          restoredCursorDraftIdRef.current = null;
          setWorkpieceSummaries([]);
          setDrafts([]);
          setWorkpieceId(null);
          setActiveDraft(null);
          setDraftSnapshot(null);
          setRevisions([]);
          setSelectedRevision(null);
        }
        return;
      }

      const workspace = normalizeUuid(workspaceId) ?? resolveWorkspaceId();
      const [storedSession, list, loadedWorkpieces] = await Promise.all([
        sessionStore.getSession(),
        store.listDrafts(),
        workspace
          ? listHearthWorkpieces(workspace, {
              includeArchived: Boolean(normalizeUuid(workpieceIdRef.current)),
            }).catch(() => [] as HearthWorkpieceSummary[])
          : Promise.resolve([] as HearthWorkpieceSummary[]),
      ]);

      setSession(storedSession);
      const dedupedDrafts = dedupeDraftListById(list);
      draftsRef.current = dedupedDrafts;
      setDrafts(dedupedDrafts);
      workpieceSummariesRef.current = loadedWorkpieces;
      setWorkpieceSummaries(loadedWorkpieces);
      setWorkpiecesError(null);

      const tab = storedSession?.uiState?.selectedTab;
      if (tab === "preview" || tab === "compare" || tab === "list") {
        setRevisionView(tab);
      }
      if (tab === "draft" || tab === "planning" || tab === "sources" || tab === "revisions") {
        setFocusTab(tab);
      }

      const candidateDraftIds: string[] = [];
      const pushCandidateDraftId = (value: string | null | undefined) => {
        const next = value?.trim();
        if (!next || candidateDraftIds.includes(next)) return;
        candidateDraftIds.push(next);
      };

      pushCandidateDraftId(storedSession?.activeDraftId ?? null);
      pushCandidateDraftId(activeDraftRef.current?.id ?? null);

      const explicitWorkpieceId = normalizeUuid(workpieceIdRef.current);
      const resolvedWorkpieceId = explicitWorkpieceId
        ?? normalizeUuid(storedSession?.activeWorkpieceId ?? null)
        ?? candidateDraftIds
          .map((draftId) => resolveWorkpieceIdForDraftId(draftId, {
            drafts: dedupedDrafts,
            workpieces: loadedWorkpieces,
          }))
          .find((value): value is string => Boolean(value))
        ?? null;

      if (resolvedWorkpieceId) {
        await openWorkpieceInFocus(resolvedWorkpieceId, {
          workspaceId: workspace,
          drafts: dedupedDrafts,
          workpieces: loadedWorkpieces,
          preferredDraftId: storedSession?.activeDraftId ?? activeDraftRef.current?.id ?? null,
        });
        return;
      }

      restoredCursorDraftIdRef.current = null;
      setWorkpieceId(null);
      setActiveDraft(null);
      setDraftSnapshot(null);
      setRevisions([]);
      setSelectedRevision(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load drafts.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [
    incomingBarStockIntakeRoute,
    openWorkpieceInFocus,
    routeProjectId,
    routeSparkId,
    resolveWorkpieceIdForDraftId,
    sessionStore,
    store,
    workspaceId,
  ]);

  const loadInitialRef = useRef<(() => Promise<void>) | null>(null);
  const lastInitialLoadKeyRef = useRef<string | null>(null);

  useEffect(() => {
    loadInitialRef.current = loadInitial;
  }, [loadInitial]);

  useEffect(() => {
    if (lastInitialLoadKeyRef.current === initialLoadKey) return;
    lastInitialLoadKeyRef.current = initialLoadKey;
    void loadInitialRef.current?.();
  }, [initialLoadKey]);

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

  useEffect(() => {
    const previousWorkspaceId = previousWorkspaceIdRef.current;
    if (previousWorkspaceId === workspaceId) return;
    previousWorkspaceIdRef.current = workspaceId;

    projectIntakeHandledRef.current = null;
    sparkIntakeHandledRef.current = null;
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
  }, [sessionStore, workspaceId]);

  useEffect(() => {
    if (!routeProjectId) return;
    if (projectIntakeHandledRef.current === routeProjectId) return;

    const workspace = workspaceId ?? resolveWorkspaceId();
    if (!workspace) {
      setForgeError("Project intake requires workspace_id.");
      return;
    }

    let cancelled = false;
    setIsForging(true);
    setForgeError(null);

    void (async () => {
      const context = await readBarstockProjectContext({
        workspaceId: workspace,
        projectId: routeProjectId,
      });
      if (cancelled) return;

      if (context.error) {
        console.warn("[hearth-project-intake] context lookup issue", context.error);
        setForgeError("Unable to resolve this Project in Tongs. Sync Bar Stock, then retry.");
        return;
      }

      const projectTitle = context.projectTitle?.trim() || null;
      setRouteProjectTitle(projectTitle);
      if (!context.projectExists) {
        setForgeError("Project not found in Tongs yet. Sync Bar Stock, then retry.");
        return;
      }

      let resolvedWorkpieceId = context.workpieceId ?? readPendingProjectWorkpieceId(workspace, routeProjectId);
      if (!resolvedWorkpieceId) {
        const created = await createHearthWorkpiece(
          { created_from: "bar-stock" },
          SAFE_SCRIPT_STARTER,
          { title: projectTitle ?? `Project ${routeProjectId.slice(0, 8)}` },
        );
        if (!created.ok) {
          setForgeError("Failed to open this Project in Hearth.");
          return;
        }
        resolvedWorkpieceId = created.workpieceId;
        writePendingProjectWorkpieceId(workspace, routeProjectId, resolvedWorkpieceId);
      }

      const linked = await upsertBarstockProjectEpisodeLink({
        workspaceId: workspace,
        projectId: routeProjectId,
        workpieceId: resolvedWorkpieceId,
      });
      if (!linked.ok) {
        console.warn("[hearth-project-intake] link upsert failed", linked.error);
        writePendingProjectWorkpieceId(workspace, routeProjectId, resolvedWorkpieceId);
        setForgeError("Failed to link this Project to an Episode. Sync and retry.");
        return;
      }
      writePendingProjectWorkpieceId(workspace, routeProjectId, null);

      if (cancelled) return;
      projectIntakeHandledRef.current = routeProjectId;
      setWorkspaceId(workspace);
      setWorkpieceId(resolvedWorkpieceId);
    })().catch((err) => {
      if (cancelled) return;
      const message = err instanceof Error ? err.message : "Failed to resolve project intake.";
      setForgeError(message);
    }).finally(() => {
      if (!cancelled) {
        setIsForging(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [routeProjectId, workspaceId]);

  useEffect(() => {
    if (routeProjectId || !routeSparkId) return;

    const intakeKey = `${workspaceId ?? "none"}:${routeSparkId}`;
    if (sparkIntakeHandledRef.current === intakeKey) return;

    const intakeError = resolveCanonicalSparkIntakeError({
      routeProjectId,
      routeSparkId,
      workspaceId,
      discoveryWorkspaceId: sparkDiscoveryWorkspaceId,
      spark: routeSpark,
    });
    if (intakeError) {
      sparkIntakeHandledRef.current = intakeKey;
      setForgeError(intakeError);
      return;
    }

    if (!isCanonicalSparkDiscoveryResolved(workspaceId, sparkDiscoveryWorkspaceId) || isSparksLoading) {
      return;
    }
    if (!routeSpark) {
      return;
    }

    sparkIntakeHandledRef.current = intakeKey;
    setSelectedSparkId(routeSpark.id);
    const linkedWorkpieceId = resolveBarStockSparkHearthWorkpieceId(routeSpark);
    if (linkedWorkpieceId) {
      setForgeError(null);
      void openWorkpieceInFocus(linkedWorkpieceId, {
        workspaceId,
        preferredDraftId: routeSpark.links?.hearthDraftId ?? null,
      });
      return;
    }
    if (isSparkForged(routeSpark)) {
      setMode("episodes");
      setForgeError("This spark is already attached to Hearth, but its Episode link could not be resolved.");
      return;
    }
    void forgeSpark(routeSpark);
  }, [
    forgeSpark,
    isSparksLoading,
    openWorkpieceInFocus,
    routeProjectId,
    routeSpark,
    routeSparkId,
    sparkDiscoveryWorkspaceId,
    workspaceId,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const refresh = async () => {
      const normalizedWorkspaceId = normalizeUuid(workspaceId);
      if (!normalizedWorkspaceId) {
        if (!cancelled) {
          setSparks([]);
          setSparkDiscoveryWorkspaceId(null);
          setIsSparksLoading(false);
        }
        return;
      }

      if (!cancelled) setIsSparksLoading(true);
      try {
        const remote = await listHearthBarStockSparks(normalizedWorkspaceId);
        if (cancelled) return;
        setSparks(remote);
      } catch {
        if (cancelled) return;
      } finally {
        if (!cancelled) {
          setSparkDiscoveryWorkspaceId(normalizedWorkspaceId);
          setIsSparksLoading(false);
        }
      }
    };

    void refresh();
    const onStorage = (event: StorageEvent) => {
      if (!isBarStockKey(event.key, workspaceId)) return;
      void refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
    };
  }, [workspaceId]);

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

  useEffect(() => {
    if (incomingBarStockIntakeRoute && !workpieceId) {
      setPlanningSession(null);
      setSessionTouched(false);
      return;
    }

    if (typeof window === "undefined") return;
    const refreshSession = () => {
      const cached = readHearthPlanningSessionCache(workpieceId, workspaceId);
      if (cached) {
        const normalizedCached: HearthPlanningSession = {
          ...cached,
          workpiece_id: normalizeUuid(cached.workpiece_id),
          workspace_id: normalizeUuid(cached.workspace_id),
        };
        setPlanningSession(normalizedCached);
      }
    };
    refreshSession();
    const onStorage = (event: StorageEvent) => {
      if (!isHearthPlanningSessionKey(event.key)) return;
      refreshSession();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [incomingBarStockIntakeRoute, workpieceId, workspaceId]);

  useEffect(() => {
    const normalizedWorkpieceId = normalizeUuid(workpieceId);
    if (!normalizedWorkpieceId) return;
    let cancelled = false;
    readHearthSession(normalizedWorkpieceId)
      .then((session) => {
        if (cancelled || !session) return;
        const normalizedSession: HearthPlanningSession = {
          ...session,
          workpiece_id: normalizeUuid(session.workpiece_id),
          workspace_id: normalizeUuid(session.workspace_id),
        };
        setPlanningSession(normalizedSession);
        setSessionTouched(false);
        sessionCommitRef.current = buildSessionFingerprint(normalizedSession);
        writeHearthPlanningSessionCache(
          normalizedSession,
          normalizedWorkpieceId,
          workspaceId ?? normalizedSession.workspace_id ?? null,
        );
        if (!workspaceId && normalizedSession.workspace_id) {
          setWorkspaceId(normalizedSession.workspace_id);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [workpieceId, workspaceId]);

  useEffect(() => {
    const workspace = normalizeUuid(workspaceId);
    const workpiece = normalizeUuid(workpieceId);
    if (!workspace || !workpiece) return;

    let cancelled = false;
    void (async () => {
      try {
        const response = await tongsFetch(
          `/tongs/workpieces/${encodeURIComponent(workpiece)}/read-file?path=${encodeURIComponent("metadata.json")}`,
          { method: "GET" },
        );
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            if (!cancelled) {
              setError("You no longer have access to this workpiece in the active workspace.");
              setWorkpieceId(null);
            }
          }
          return;
        }
        const body = await response.json() as { data?: { workspace_id?: unknown } };
        const workpieceWorkspaceId = normalizeUuid(body?.data?.workspace_id);
        if (!cancelled && workpieceWorkspaceId && workpieceWorkspaceId !== workspace) {
          setError("This workpiece belongs to another workspace. Switch workspace to open it.");
          setPlanningSession(null);
          setPresenceRows([]);
          setWorkpieceId(null);
        }
      } catch {
        // ignore metadata workspace checks when the network is unavailable
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workpieceId, workspaceId]);

  useEffect(() => {
    if (!planningSession) return;
    const needsWorkspace = workspaceId && planningSession.workspace_id !== workspaceId;
    const needsWorkpiece = workpieceId && planningSession.workpiece_id !== workpieceId;
    if (!needsWorkspace && !needsWorkpiece) return;
    updatePlanningSession((prev) => ({
      ...prev,
      workspace_id: workspaceId ?? prev.workspace_id ?? null,
      workpiece_id: workpieceId ?? prev.workpiece_id ?? null,
    }), { touched: false });
  }, [planningSession, updatePlanningSession, workspaceId, workpieceId]);

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
    if (thumbnailConcepts.length === 0) {
      setSelectedThumbnailConceptId("");
      return;
    }
    if (selectedThumbnailConceptId && thumbnailConcepts.some((concept) => concept.id === selectedThumbnailConceptId)) {
      return;
    }
    setSelectedThumbnailConceptId(thumbnailConcepts[0]?.id ?? "");
  }, [selectedThumbnailConceptId, thumbnailConcepts]);

  useEffect(() => {
    if (!selectedThumbnailConcept) {
      setThumbnailConceptLabelDraft("");
      setThumbnailConceptPromptDraft("");
      setThumbnailConceptStyleDraft(DEFAULT_HEARTH_VISUAL_STYLE);
      setThumbnailTitleStyleDraft(DEFAULT_TITLE_STYLE);
      setThumbnailConceptBrandTemplateIdDraft(defaultThumbnailBrandTemplateId);
      return;
    }
    setThumbnailConceptLabelDraft(selectedThumbnailConcept.label);
    setThumbnailConceptPromptDraft(selectedThumbnailConcept.prompt_text);
    setThumbnailConceptStyleDraft(normalizeHearthVisualStyle(selectedThumbnailConcept.style_preset));
    setThumbnailTitleStyleDraft(normalizeEpisodeThumbnailTitleStyle(selectedThumbnailConcept.title_style));
    setThumbnailConceptBrandTemplateIdDraft(selectedThumbnailConcept.brand_template_id ?? null);
  }, [defaultThumbnailBrandTemplateId, selectedThumbnailConcept]);

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
    if (launchVariants.length === 0) {
      setSelectedLaunchVariantId(null);
      return;
    }
    if (selectedLaunchVariantId && launchVariants.some((variant) => variant.id === selectedLaunchVariantId)) {
      return;
    }
    setSelectedLaunchVariantId(null);
  }, [launchVariants, selectedLaunchVariantId]);

  useEffect(() => {
    if (!selectedLaunchVariant) {
      setLaunchVariantStatusDraft("draft");
      setLaunchVariantNotesDraft("");
      return;
    }
    setLaunchVariantStatusDraft(selectedLaunchVariant.status);
    setLaunchVariantNotesDraft(selectedLaunchVariant.notes ?? "");
  }, [selectedLaunchVariant]);

  useEffect(() => {
    if (thumbnailTitleOptions.length === 0) {
      setSelectedThumbnailTitleId(null);
      return;
    }
    if (selectedThumbnailTitleId && thumbnailTitleOptions.some((title) => title.id === selectedThumbnailTitleId)) {
      return;
    }
    setSelectedThumbnailTitleId(resolvePrimarySeoTitle(thumbnailTitleOptions)?.id ?? thumbnailTitleOptions[0]?.id ?? null);
  }, [selectedThumbnailTitleId, thumbnailTitleOptions]);

  useEffect(() => {
    if (thumbnailVersions.length === 0) {
      setSelectedThumbnailVersionId(null);
      return;
    }
    const eligibleVersions = selectedThumbnailConceptId
      ? thumbnailVersions.filter((version) => version.concept_id === selectedThumbnailConceptId)
      : thumbnailVersions;
    if (selectedThumbnailConceptId && eligibleVersions.length === 0) {
      setSelectedThumbnailVersionId(null);
      return;
    }
    if (
      selectedThumbnailVersionId
      && eligibleVersions.some((version) => version.id === selectedThumbnailVersionId)
    ) {
      return;
    }
    const nextVersionId = (primaryThumbnailVersionId && eligibleVersions.some((version) => version.id === primaryThumbnailVersionId))
      ? primaryThumbnailVersionId
      : eligibleVersions
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.id
      ?? null;
    setSelectedThumbnailVersionId(nextVersionId);
  }, [primaryThumbnailVersionId, selectedThumbnailConceptId, selectedThumbnailVersionId, thumbnailVersions]);

  useEffect(() => {
    setThumbnailPromptOverride("");
    setThumbnailAspect("16:9");
    setThumbnailSafeZoneEnabled(false);
    setThumbnailPairingError(null);
    setThumbnailPreviewState("idle");
    setThumbnailPreviewDataUrl(null);
    setThumbnailPreviewError(null);
  }, [workpieceId]);

  useEffect(() => {
    setSelectedMediaMapEntryId(null);
    setMediaMapSaveState("saved");
    setMediaMapSaveError(null);
    setMediaMapMessage(null);
    setSelectedBrollBeatId(null);
    setBrollSaveState("saved");
    setBrollSaveError(null);
    setBrollMessage(null);
  }, [workpieceId]);

  useEffect(() => {
    setSelectedReferenceClipEntryId(null);
    setReferenceClipSaveState("saved");
    setReferenceClipSaveError(null);
    setReferenceClipMessage(null);
  }, [workpieceId]);

  useEffect(() => {
    const episodeId = workpieceId?.trim() ?? "";
    const previewSeq = thumbnailPreviewRequestSeqRef.current + 1;
    thumbnailPreviewRequestSeqRef.current = previewSeq;
    if (!episodeId || !selectedThumbnailVersion) {
      setThumbnailPreviewState("idle");
      setThumbnailPreviewDataUrl(null);
      setThumbnailPreviewError(null);
      return;
    }

    if (selectedThumbnailVersion.status === "failed") {
      setThumbnailPreviewState("error");
      setThumbnailPreviewDataUrl(null);
      setThumbnailPreviewError(selectedThumbnailVersion.error ?? "This version failed.");
      return;
    }

    let cancelled = false;
    setThumbnailPreviewState("loading");
    setThumbnailPreviewError(null);

    void loadThumbnailPreviewDataUrl({
      workpieceId: episodeId,
      version: selectedThumbnailVersion,
    }).then((result) => {
      if (
        cancelled
        || thumbnailPreviewRequestSeqRef.current !== previewSeq
        || (workpieceId?.trim() ?? "") !== episodeId
        || selectedThumbnailVersionId !== selectedThumbnailVersion.id
      ) {
        return;
      }
      if (!result.ok) {
        setThumbnailPreviewState("error");
        setThumbnailPreviewDataUrl(null);
        setThumbnailPreviewError(result.error);
        return;
      }
      setThumbnailPreviewState("ready");
      setThumbnailPreviewDataUrl(result.dataUrl);
      setThumbnailPreviewError(null);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedThumbnailVersion, selectedThumbnailVersionId, workpieceId]);

  useEffect(() => {
    if (mediaMapEntries.length === 0) {
      setSelectedMediaMapEntryId(null);
      return;
    }
    if (selectedMediaMapEntryId && mediaMapEntries.some((entry) => entry.id === selectedMediaMapEntryId)) {
      return;
    }
    setSelectedMediaMapEntryId(mediaMapEntries[0]?.id ?? null);
  }, [mediaMapEntries, selectedMediaMapEntryId]);

  useEffect(() => {
    if (!selectedMediaMapEntry) {
      setMediaMapTypeDraft("image");
      setMediaMapAnchorModeDraft("phrase_match");
      setMediaMapAnchorTargetDraft("");
      setMediaMapInOffsetDraft("0");
      setMediaMapDurationDraft("6");
      setMediaMapDescriptionDraft("");
      setMediaMapIntentDraft("");
      setMediaMapSourceStatusDraft("unresolved");
      setMediaMapSourceAssetIdDraft("");
      setMediaMapConfidenceDraft("medium");
      setMediaMapOptionalDraft(false);
      setMediaMapCriticalDraft(false);
      setMediaMapSaveState("saved");
      return;
    }
    setMediaMapTypeDraft(selectedMediaMapEntry.final_media_kind);
    setMediaMapAnchorModeDraft(selectedMediaMapEntry.anchor.mode);
    setMediaMapAnchorTargetDraft(selectedMediaMapEntry.anchor.target);
    setMediaMapInOffsetDraft(String(selectedMediaMapEntry.timing.in_offset_sec));
    setMediaMapDurationDraft(String(selectedMediaMapEntry.timing.duration_sec));
    setMediaMapDescriptionDraft(selectedMediaMapEntry.description);
    setMediaMapIntentDraft(selectedMediaMapEntry.intent);
    setMediaMapSourceStatusDraft(selectedMediaMapEntry.source.status);
    setMediaMapSourceAssetIdDraft(selectedMediaMapEntry.source.asset_id ?? "");
    setMediaMapConfidenceDraft(selectedMediaMapEntry.confidence);
    setMediaMapOptionalDraft(selectedMediaMapEntry.optional);
    setMediaMapCriticalDraft(selectedMediaMapEntry.critical);
    setMediaMapSaveState("saved");
    setMediaMapSaveError(null);
  }, [selectedMediaMapEntry]);

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
    if (imageMapEntries.length === 0) {
      setSelectedImageMapEntryId(null);
      setIsImageMapReanchorMode(false);
      setIsImageMapReanchorSaving(false);
      setImageMapReanchorError(null);
      return;
    }
    if (selectedImageMapEntryId && imageMapEntries.some((entry) => entry.id === selectedImageMapEntryId)) {
      return;
    }
    setSelectedImageMapEntryId(imageMapEntries[0]?.id ?? null);
  }, [imageMapEntries, selectedImageMapEntryId]);

  useEffect(() => {
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
    setImageMapAnchorScopeDraft(selectedImageMapEntry.anchor_scope ?? (selectedImageMapEntry.script_anchor ? "attached" : "orphaned"));
    setImageMapVisualPriorityDraft(selectedImageMapEntry.visual_priority ?? "supporting");
    setImageMapVisualTypeDraft(selectedImageMapEntry.visual_type ?? "still_image");
    setImageMapSectionIntentNoteDraft(selectedImageMapEntry.section_intent_note ?? "");
    setImageMapPlacementHintDraft(selectedImageMapEntry.placement_hint ?? "");
    setImageMapSaveState("saved");
    setImageMapCandidateError(null);
    setImageMapCandidateSelectionError(null);
  }, [selectedImageMapEntry]);

  useEffect(() => {
    if (brollBeats.length === 0) {
      setSelectedBrollBeatId(null);
      return;
    }
    if (selectedBrollBeatId && brollBeats.some((beat) => beat.id === selectedBrollBeatId)) {
      return;
    }
    setSelectedBrollBeatId(brollBeats[0]?.id ?? null);
  }, [brollBeats, selectedBrollBeatId]);

  useEffect(() => {
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
  }, [selectedBrollBeat]);

  useEffect(() => {
    if (referenceClipEntries.length === 0) {
      setSelectedReferenceClipEntryId(null);
      return;
    }
    if (selectedReferenceClipEntryId && referenceClipEntries.some((entry) => entry.id === selectedReferenceClipEntryId)) {
      return;
    }
    setSelectedReferenceClipEntryId(referenceClipEntries[0]?.id ?? null);
  }, [referenceClipEntries, selectedReferenceClipEntryId]);

  useEffect(() => {
    if (!selectedReferenceClipEntry) {
      setReferenceClipAnchorDraft("");
      setReferenceClipDescriptionDraft("");
      setReferenceClipPlacementHintDraft("first_occurrence");
      setReferenceClipFormatDraft("still");
      setReferenceClipDataTypeDraft("quantitative");
      setReferenceClipContextTypeDraft("historical");
      setReferenceClipToneDraft("neutral");
      setReferenceClipMotionLevelDraft("static");
      setReferenceClipBackgroundContextDraft("");
      setReferenceClipForegroundDataDraft("");
      setReferenceClipVisualStyleDraft(DEFAULT_HEARTH_VISUAL_STYLE);
      setReferenceClipChartTypeDraft("line");
      setReferenceClipTitleDraft("");
      setReferenceClipLabelsDraft("");
      setReferenceClipValuesDraft("");
      setReferenceClipEmphasisKeyDraft("");
      setReferenceClipSourceTypeDraft("planned");
      setReferenceClipProviderIdDraft("");
      setReferenceClipSourceLabelDraft("");
      setReferenceClipSourceUrlDraft("");
      setReferenceClipProviderNoteDraft("");
      setReferenceClipUsageNoteDraft("");
      setReferenceClipResultMetadataDraft("");
      setReferenceClipSaveState("saved");
      return;
    }
    setReferenceClipAnchorDraft(selectedReferenceClipEntry.anchor_text);
    setReferenceClipDescriptionDraft(selectedReferenceClipEntry.description);
    setReferenceClipPlacementHintDraft(selectedReferenceClipEntry.placement_hint ?? "first_occurrence");
    setReferenceClipFormatDraft(selectedReferenceClipEntry.format);
    setReferenceClipDataTypeDraft(selectedReferenceClipEntry.data_type);
    setReferenceClipContextTypeDraft(selectedReferenceClipEntry.context_type);
    setReferenceClipToneDraft(selectedReferenceClipEntry.tone);
    setReferenceClipMotionLevelDraft(selectedReferenceClipEntry.motion_level);
    setReferenceClipBackgroundContextDraft(selectedReferenceClipEntry.background_context_description ?? "");
    setReferenceClipForegroundDataDraft(selectedReferenceClipEntry.foreground_data_description ?? "");
    setReferenceClipVisualStyleDraft(normalizeHearthVisualStyle(selectedReferenceClipEntry.visual_style ?? null));
    setReferenceClipChartTypeDraft(selectedReferenceClipEntry.chart_type ?? "line");
    setReferenceClipTitleDraft(selectedReferenceClipEntry.title ?? "");
    setReferenceClipLabelsDraft((selectedReferenceClipEntry.labels ?? []).join(", "));
    setReferenceClipValuesDraft((selectedReferenceClipEntry.values ?? []).map((value) => String(value)).join(", "));
    setReferenceClipEmphasisKeyDraft(selectedReferenceClipEntry.emphasis_key ?? "");
    setReferenceClipSourceTypeDraft(selectedReferenceClipEntry.source_type ?? "planned");
    setReferenceClipProviderIdDraft(selectedReferenceClipEntry.external_request?.provider_id ?? "");
    setReferenceClipSourceLabelDraft(
      (selectedReferenceClipEntry.selected_asset_id
        ? (selectedReferenceClipEntry.candidate_assets ?? []).find((asset) => asset.asset_id === selectedReferenceClipEntry.selected_asset_id)?.source_label
        : null) ?? "",
    );
    setReferenceClipSourceUrlDraft(selectedReferenceClipEntry.external_request?.source_url ?? "");
    setReferenceClipProviderNoteDraft(selectedReferenceClipEntry.external_request?.provider_note ?? "");
    setReferenceClipUsageNoteDraft(selectedReferenceClipEntry.external_request?.usage_note ?? "");
    setReferenceClipResultMetadataDraft(selectedReferenceClipEntry.external_request?.result_metadata ?? "");
    setReferenceClipSaveState("saved");
    setReferenceClipSaveError(null);
  }, [selectedReferenceClipEntry]);

  useEffect(() => {
    setIsVisualScriptMode(false);
    setIsImageMapReanchorMode(false);
    setIsImageMapReanchorSaving(false);
    setImageMapReanchorError(null);
  }, [workpieceId]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedImageMapEntry || !workpieceId) {
      setCanonicalImageMapScriptState({
        status: "idle",
        text: null,
        source: null,
        includesUnsavedLocalEdits: false,
        error: null,
      });
      return;
    }

    setCanonicalImageMapScriptState((current) => ({
      status: "loading",
      text: current.text,
      source: current.source,
      includesUnsavedLocalEdits: current.includesUnsavedLocalEdits,
      error: null,
    }));

    void readCanonicalScriptForImageMapGeneration().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setCanonicalImageMapScriptState({
          status: "error",
          text: null,
          source: null,
          includesUnsavedLocalEdits: false,
          error: result.message,
        });
        return;
      }
      setCanonicalImageMapScriptState({
        status: "ready",
        text: result.text,
        source: result.source,
        includesUnsavedLocalEdits: result.includesUnsavedLocalEdits,
        error: null,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [selectedImageMapEntry, workpieceId]);

  useEffect(() => {
    const episodeId = workpieceId?.trim() ?? "";
    const previewSeq = imageMapCandidatePreviewRequestSeqRef.current + 1;
    imageMapCandidatePreviewRequestSeqRef.current = previewSeq;

    if (!episodeId || !selectedImageMapEntry) {
      setImageMapCandidatePreviewStateById({});
      setImageMapCandidatePreviewUrlById({});
      setImageMapCandidatePreviewErrorById({});
      return;
    }

    const candidates = selectedImageMapEntry.candidate_assets.filter((asset) => asset.asset_id && asset.path);
    if (candidates.length === 0) {
      setImageMapCandidatePreviewStateById({});
      setImageMapCandidatePreviewUrlById({});
      setImageMapCandidatePreviewErrorById({});
      return;
    }

    const loadingState = Object.fromEntries(candidates.map((asset) => [asset.asset_id, "loading"] as const));
    setImageMapCandidatePreviewStateById(loadingState);
    setImageMapCandidatePreviewUrlById({});
    setImageMapCandidatePreviewErrorById({});

    let cancelled = false;
    void Promise.all(candidates.map(async (asset) => {
      const result = await loadImageMapCandidatePreviewDataUrl({
        workpieceId: episodeId,
        path: asset.path,
        mimeType: asset.mime_type ?? null,
      });
      return { assetId: asset.asset_id, result };
    })).then((results) => {
      if (
        cancelled
        || imageMapCandidatePreviewRequestSeqRef.current !== previewSeq
        || (workpieceId?.trim() ?? "") !== episodeId
        || selectedImageMapEntryId !== selectedImageMapEntry.id
      ) {
        return;
      }

      const nextState: Record<string, "loading" | "ready" | "error"> = {};
      const nextUrls: Record<string, string> = {};
      const nextErrors: Record<string, string> = {};
      for (const { assetId, result } of results) {
        if (result.ok) {
          nextState[assetId] = "ready";
          nextUrls[assetId] = result.dataUrl;
        } else {
          nextState[assetId] = "error";
          nextErrors[assetId] = result.error;
        }
      }
      setImageMapCandidatePreviewStateById(nextState);
      setImageMapCandidatePreviewUrlById(nextUrls);
      setImageMapCandidatePreviewErrorById(nextErrors);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedImageMapEntry, selectedImageMapEntryId, workpieceId]);

  useEffect(() => {
    if (!workpieceId) {
      setImageMapMetadataUpdatedAt(null);
      setImageMapSaveState("saved");
      setImageMapSaveError(null);
      setImageMapExportMessage(null);
      setImageMapCandidateError(null);
      setImageMapCandidateSelectionError(null);
      setImageMapCandidatePreviewStateById({});
      setImageMapCandidatePreviewUrlById({});
      setImageMapCandidatePreviewErrorById({});
    }
  }, [workpieceId]);

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
      || (current.anchor_scope ?? (current.script_anchor ? "attached" : "orphaned")) !== nextAnchorScope
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
              : (current.script_anchor ? "mapped" : "draft"),
            script_anchor: nextAnchorScope === "global" ? null : current.script_anchor,
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
    setMetadataSaveState("saved");
    setMetadataSaveError(null);
    setMetadataTagInputDraft("");
  }, [workpieceId]);

  useEffect(() => {
    if (!episodePackage) {
      setMetadataTitlesDraft([]);
      setMetadataTagsDraft([]);
      setMetadataTagInputDraft("");
      setMetadataDescriptionShortDraft("");
      setMetadataDescriptionLongDraft("");
      setMetadataSaveState("saved");
      setMetadataSaveError(null);
      return;
    }
    if (metadataSaveState === "editing" || metadataSaveState === "saving") {
      return;
    }

    const normalized = ensureSeoV2(episodePackage);
    setMetadataTitlesDraft(normalized.seo.titles);
    setMetadataTagsDraft(normalized.seo.tags);
    setMetadataDescriptionShortDraft(normalized.seo.description_short ?? "");
    setMetadataDescriptionLongDraft(normalized.seo.description_long ?? "");
    setMetadataSaveState("saved");
    setMetadataSaveError(null);
  }, [episodePackage, metadataSaveState]);

  useEffect(() => {
    if (metadataSaveState !== "editing") return;
    if (!episodePackage) return;

    const current = ensureSeoV2(episodePackage);
    const normalizedTitles = metadataTitlesDraft.map((title, index) => ({
      id: title.id,
      label: (title.label || ["A", "B", "C"][index] || `V${index + 1}`).toUpperCase(),
      text: title.text ?? "",
      thumbnail_text: resolveHearthThumbnailOverlayText(title),
      is_primary: Boolean(title.is_primary),
    }));
    const primaryId = normalizedTitles.find((title) => title.is_primary)?.id ?? normalizedTitles[0]?.id ?? null;
    const titles = normalizedTitles.map((title) => ({
      ...title,
      is_primary: primaryId != null && title.id === primaryId,
    }));
    const nextSeo = {
      ...current.seo,
      titles,
      tags: normalizeSeoTags(metadataTagsDraft),
      description_short: metadataDescriptionShortDraft.trim() || null,
      description_long: metadataDescriptionLongDraft.trim() || null,
    };

    const hasChanges = JSON.stringify(nextSeo) !== JSON.stringify(current.seo);
    if (!hasChanges) {
      setMetadataSaveState("saved");
      setMetadataSaveError(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setMetadataSaveState("saving");
        setMetadataSaveError(null);

        const workspace = workspaceId?.trim() ?? "";
        const workpiece = workpieceId?.trim() ?? "";
        if (!workspace || !workpiece) {
          if (cancelled) return;
          setMetadataSaveState("error");
          setMetadataSaveError("Workspace or workpiece is missing.");
          return;
        }

        const nextEpisodePackage: EpisodePackageV2 = {
          ...current,
          seo: nextSeo,
        };

        const saved = await saveEpisodePackageForWorkpiece({
          workpieceId: workpiece,
          workspaceId: workspace,
          episodePackage: nextEpisodePackage,
          eventName: "hearth.metadata.autosave.v1",
          eventPayload: {
            section: "seo",
          },
        });
        if (cancelled) return;
        if (!saved.ok) {
          const online = typeof navigator === "undefined" ? true : navigator.onLine;
          if (!online) {
            setMetadataSaveState("offline");
            setMetadataSaveError("Offline. Metadata edits are waiting to sync.");
          } else {
            setMetadataSaveState("error");
            setMetadataSaveError(saved.error);
          }
          return;
        }
        setEpisodePackage(saved.episodePackage);
        setImageMapMetadataUpdatedAt(saved.metadataUpdatedAt);
        setMetadataSaveState("saved");
        setMetadataSaveError(null);
      })();
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    episodePackage,
    metadataDescriptionLongDraft,
    metadataDescriptionShortDraft,
    metadataSaveState,
    metadataTagsDraft,
    metadataTitlesDraft,
    workpieceId,
    workspaceId,
  ]);

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

  useEffect(() => {
    if (!hasAnyUnsavedTab) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = TAB_SWITCH_UNSAVED_WARNING;
      return TAB_SWITCH_UNSAVED_WARNING;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasAnyUnsavedTab]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "s") {
        event.preventDefault();
        if (event.shiftKey) {
          if (!revisionModalOpen && activeDraft) {
            openRevisionModal();
          }
          return;
        }
        void onSaveDraft();
      }

      if ((event.ctrlKey || event.metaKey) && key === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }

      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
        const tabIndex = Number(key);
        if (Number.isInteger(tabIndex) && tabIndex >= 1 && tabIndex <= WORKPIECE_WORKSPACE_TABS.length) {
          event.preventDefault();
          if (!hasActiveEpisode) return;
          requestWorkpieceTabChange(WORKPIECE_WORKSPACE_TABS[tabIndex - 1]!);
        }
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeDraft, hasActiveEpisode, onSaveDraft, openRevisionModal, revisionModalOpen, requestWorkpieceTabChange]);

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

  async function onDeleteDraft(draft: Draft) {
    const draftTitle = draft.title.trim() || "Untitled Draft";
    const confirmDelete = window.confirm(`Delete draft buffer "${draftTitle}"? This cannot be undone.`);
    if (!confirmDelete) return;
    setError(null);
    try {
      const deletingActiveDraft = activeDraft?.id === draft.id;
      await store.deleteDraft(draft.id);
      const nextDrafts = dedupeDraftListById(await store.listDrafts());
      setDrafts(nextDrafts);

      if (deletingActiveDraft) {
        const activeWorkpieceId = normalizeUuid(workpieceId);
        if (activeWorkpieceId) {
          const replacementDraft = selectDraftForWorkpiece({
            workpieceId: activeWorkpieceId,
            drafts: nextDrafts,
            sparks,
            preferredDraftId: activeWorkpieceId,
          });
          if (replacementDraft) {
            await selectDraft(replacementDraft, { revisionWorkpieceId: activeWorkpieceId });
          } else {
            await openWorkpieceInFocus(activeWorkpieceId, {
              drafts: nextDrafts,
              preferredDraftId: activeWorkpieceId,
            });
          }
          if (mode === "focus") {
            setFocusTab("draft");
          }
          return;
        }

        const replacementDraft = nextDrafts.find((candidate) => !candidate.archived) ?? nextDrafts[0] ?? null;
        if (replacementDraft) {
          await selectDraft(replacementDraft);
          if (mode === "focus") {
            setFocusTab("draft");
          }
          return;
        }

        await selectDraft(null);
        await persistSession(null, "draft");
        setFocusTab("draft");
        setMode("episodes");
        if (isMobile && mobileOverlayView === "editor") {
          setMobileOverlayView(null);
        }
      }

      await persistSession(activeDraft?.id ?? null, "draft");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete draft buffer.";
      setError(message);
    }
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

  function openRevisionPanel() {
    setFocusTab("revisions");
    if (!requestWorkpieceTabChange("history")) return;
    setMode("focus");
    resetRevisionSelection();
    void persistSession(activeDraft?.id ?? null, "list");
  }

  function closeRevisionPanel() {
    setFocusTab("draft");
    requestWorkpieceTabChange("script");
    setMode("focus");
    resetRevisionSelection();
    void persistSession(activeDraft?.id ?? null, "draft");
  }

  function requestWorkpieceTabChange(nextTab: WorkpieceWorkspaceTab): boolean {
    const normalizedNextTab = normalizeWorkpieceWorkspaceTab(nextTab);
    if (normalizedNextTab === activeWorkpieceTab) return true;
    if (tabDirtyById[activeWorkpieceTab]) {
      const shouldContinue = typeof window === "undefined"
        ? true
        : window.confirm(TAB_SWITCH_UNSAVED_WARNING);
      if (!shouldContinue) return false;
    }
    setActiveWorkpieceTab(normalizedNextTab);
    return true;
  }

  function findNextBodyFromOps(baseBody: string, ops: HearthOp[]): string {
    let next = baseBody;
    for (const op of ops) {
      if (op.op === "set_body") {
        next = op.value;
      }
    }
    return next;
  }

  async function onFixScriptFormattingNoAi() {
    if (!activeDraft) return;
    const normalized = normalizeScriptTags(activeDraft.body);
    const repaired = repairScriptTags(normalized);
    const validation = validateScriptTags(repaired.text);
    if (!validation.ok) {
      setScriptValidation({
        source: "save_gate",
        result: validation,
      });
      setError(
        `Script tags must be valid before approval.\nFix the issues below to continue.\n\n${buildValidationReport(validation)}`,
      );
    }

    const now = Date.now();
    const saved = await persistDraft({
      draft: { ...activeDraft, body: repaired.text, updatedAt: now },
      updatedAt: now,
      createRevision: null,
      syncSources: false,
      syncSession: false,
      saveReason: "repair:deterministic",
    });
    if (saved) {
      const fixedCount = repaired.repairedIssues.length;
      const remainingCount = validation.issues.length;
      if (remainingCount > 0) {
        setError(`${fixedCount} issues fixed automatically. ${remainingCount} issues remain and need manual correction.`);
      } else {
        setError(`${fixedCount} issues fixed automatically.`);
      }
      setScriptValidation(validation.ok ? null : {
        source: "save_notice",
        result: validation,
      });
    }
  }

  async function onAskAiRepairScript() {
    if (isRepairingScript || isAiProcessing) return;
    if (!activeDraft) return;

    const episodeContext = buildActiveEpisodeContext();
    if (!episodeContext) {
      setChatError("Select an Episode or Spark to start.");
      return;
    }

    const lane = resolveAiLaneFromStorage();
    setAiBillingMode(lane);
    if (lane === "forge" && aiTokenBalance != null && aiTokenBalance <= 0) {
      setChatError("No AI credits remaining.");
      return;
    }

    setChatError(null);
    setAiRuntimeWarning(null);
    setIsRepairingScript(true);

    const repairMessage = [
      "Repair this script to satisfy the canonical Anvil tag contract.",
      "Do NOT rewrite meaning, style, or wording except where required to fix markup.",
      "Return a set_body op with the repaired script.",
      "Also include script_text and tag_audit.",
      "",
      "SCRIPT TO REPAIR:",
      activeDraft.body,
    ].join("\n");

    const controller = new AbortController();
    aiRequestControllerRef.current = controller;
    setIsAiProcessing(true);

    try {
      const result = await requestHearthChatReply(
        [{ role: "user", content: repairMessage }],
        episodeContext,
        { signal: controller.signal },
      );

      setAiBillingMode(result.runtime.billingMode);
      if (result.runtime.billingMode === "byo") {
        setAiTokenBalance(null);
      }

      if (!result.ok) {
        if (!result.cancelled) {
          setChatError(result.error);
        }
        return;
      }

      const opBody = result.ops.find((op) => op.op === "set_body");
      const aiText = result.scriptText ?? (opBody && opBody.op === "set_body" ? opBody.value : "");
      const normalized = normalizeScriptTags(aiText);
      const repaired = repairScriptTags(normalized);
      const repairedBody = repaired.text;
      const validation = validateScriptTags(repairedBody);
      if (!validation.ok) {
        setScriptValidation({
          source: "ai_repair",
          result: validation,
        });
        setError(`Script tags must be valid before approval.\nFix the issues below to continue.\n\n${buildValidationReport(validation)}`);
        return;
      }

      const previousBody = activeDraft.body;
      const bodyChanged = repairedBody !== previousBody;
      if (bodyChanged) {
        const now = Date.now();
        const nextDraft: Draft = { ...activeDraft, body: repairedBody, updatedAt: now };
        draftEditVersionRef.current += 1;
        activeDraftRef.current = nextDraft;
        setActiveDraft((prev) => (prev && prev.id === nextDraft.id ? nextDraft : prev));
        setDrafts((prev) => {
          const exists = prev.some((draft) => draft.id === nextDraft.id);
          const next = exists
            ? prev.map((draft) => (draft.id === nextDraft.id ? nextDraft : draft))
            : [nextDraft, ...prev];
          return dedupeDraftListById(next);
        });
        queueAiAutosave({
          draft: nextDraft,
          previousBody,
          reasonCode: "ai_repair",
        });
      }
      setScriptValidation(null);

      const assistantMessage: HearthChatMessage = {
        role: "assistant",
        content: result.assistantText || "I cleaned up the script tags and left the wording alone.",
      };
      setChatMessages((prev) => [...prev, assistantMessage].slice(-CHAT_HISTORY_MAX_MESSAGES));

      if (result.creditsWarning) {
        setAiRuntimeWarning(result.creditsWarning);
      }

      const refreshedCredits = await refreshMyAiCredits();
      if (refreshedCredits.ok) {
        setAiBillingMode(refreshedCredits.runtime.billingMode);
        setAiTokenBalance(refreshedCredits.runtime.tokenBalance);
      }
    } finally {
      if (aiRequestControllerRef.current === controller) {
        aiRequestControllerRef.current = null;
        setIsAiProcessing(false);
      }
      setIsRepairingScript(false);
    }
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
    const episodeId = workpieceId?.trim();
    if (!episodeId) return;

    const generatedAt = new Date().toISOString();
    const artifactKind = PRODUCTION_ACTION_ARTIFACT_KIND[args.action];
    const payload = args.action === "image_beat_sheet"
      ? {
          script_version: args.scriptVersion,
          generated_at: generatedAt,
          action: args.action,
          raw_text: args.assistantText,
          entries: parseImageBeatSheetEntries(args.assistantText),
        }
      : {
          script_version: args.scriptVersion,
          generated_at: generatedAt,
          action: args.action,
          raw_text: args.assistantText,
        };

    try {
      const committed = await commitWorkpieceProductionArtifact({
        workpieceId: episodeId,
        workspaceId,
        scriptVersion: args.scriptVersion,
        kind: artifactKind,
        payload,
      });

      if (!committed.ok) {
        setAiRuntimeWarning(`Saved response in chat, but failed to persist ${PRODUCTION_ACTION_LABEL[args.action]}.`);
        return;
      }
      if (args.action === "release_prep_pack") {
        await loadLatestReleasePrepPack(args.scriptVersion);
      }
      if (args.action === "thumbnails") {
        void refreshEpisodePackage();
      }
    } catch {
      setAiRuntimeWarning(`Saved response in chat, but failed to persist ${PRODUCTION_ACTION_LABEL[args.action]}.`);
    }
  }

  async function onRunProductionAction(action: ProductionAction) {
    if (isAiProcessing || isApprovingScript) return;
    if (!activeDraft) return;
    if (!hasApprovedScript || !approvedScriptVersion) {
      setChatError("Approve a Script Version before using production actions.");
      return;
    }
    if (!activeDraft.body.trim()) {
      setChatError("Approved script body is empty.");
      return;
    }
    if (action === "image_beat_sheet") {
      setChatError("Image Beat Sheet has been replaced by Episode Media Map. Use Generate Episode Media Map in the media panel.");
      return;
    }

    const prompt = buildProductionPrompt({
      action,
      scriptVersion: approvedScriptVersion,
      scriptText: activeDraft.body,
      episodeTitle: activeDraft.title || planningSession?.title || "",
    });
    const displayContent = `${PRODUCTION_ACTION_LABEL[action]} for Script Version ${approvedScriptVersion}.`;
    setActiveProductionAction(action);
    try {
      await sendChatMessage({
        requestContent: prompt,
        displayContent,
        productionAction: action,
        productionScriptVersion: approvedScriptVersion,
      });
    } finally {
      setActiveProductionAction(null);
    }
  }

  async function persistThumbnailEpisodePackage(
    nextEpisodePackage: EpisodePackageV2,
    eventName: string,
    eventPayload: Record<string, unknown>,
  ): Promise<EpisodePackageV2 | null> {
    const episodeId = workpieceId?.trim() ?? "";
    const workspace = workspaceId?.trim() ?? "";
    if (!episodeId || !workspace) {
      setThumbnailGenerateError("Select an Episode before editing visuals.");
      return null;
    }
    const normalizedEpisodePackage = ensureLaunchVariantsV2(nextEpisodePackage);
    const saved = await saveEpisodePackageForWorkpiece({
      workpieceId: episodeId,
      workspaceId: workspace,
      episodePackage: normalizedEpisodePackage,
      eventName,
      eventPayload,
    });
    if (!saved.ok) {
      setThumbnailGenerateError(saved.error);
      return null;
    }
    setEpisodePackage(saved.episodePackage);
    setImageMapMetadataUpdatedAt(saved.metadataUpdatedAt);
    return saved.episodePackage;
  }

  async function persistImageMapEntries(args: {
    entries: EpisodeImageMapEntry[];
  }): Promise<
    | { ok: true; episodePackage: EpisodePackageV2; metadataUpdatedAt: string | null }
    | { ok: false; error: string }
  > {
    if (!episodePackage) {
      return {
        ok: false,
        error: "Unable to save image map for this episode.",
      };
    }

    const workspace = workspaceId?.trim() ?? "";
    const workpiece = workpieceId?.trim() ?? "";
    if (!workspace || !workpiece) {
      return {
        ok: false,
        error: "Workspace or workpiece is missing.",
      };
    }

    const saved = await saveWorkpieceImageMap({
      workpieceId: workpiece,
      workspaceId: workspace,
      entries: args.entries,
      expectedMetadataUpdatedAt: imageMapMetadataUpdatedAt,
    });

    if (!saved.ok) {
      if (saved.reason === "conflict" && saved.latest) {
        const latest = saved.latest;
        setEpisodePackage((prev) => (
          prev ? replaceEpisodePackageImageMap(prev, latest.entries) : prev
        ));
        setImageMapMetadataUpdatedAt(latest.metadataUpdatedAt);
        return {
          ok: false,
          error: "Image map changed on another client. Latest entries have been reloaded.",
        };
      }

      return {
        ok: false,
        error: saved.reason === "invalid_response"
          ? "Image map save returned an invalid response."
          : saved.error ?? "Unable to save image map.",
      };
    }

    const nextEpisodePackage = replaceEpisodePackageImageMap(episodePackage, saved.imageMap.entries);
    setEpisodePackage(nextEpisodePackage);
    setImageMapMetadataUpdatedAt(saved.imageMap.metadataUpdatedAt);
    return {
      ok: true,
      episodePackage: nextEpisodePackage,
      metadataUpdatedAt: saved.imageMap.metadataUpdatedAt,
    };
  }

  async function persistBrollPlan(args: {
    plan: EpisodeBrollPlan;
    eventName: string;
    eventPayload: Record<string, unknown>;
  }): Promise<
    | { ok: true; episodePackage: EpisodePackageV2 }
    | { ok: false; error: string }
  > {
    if (!episodePackage) {
      return { ok: false, error: "Unable to save B-roll plan for this episode." };
    }
    const episodeId = workpieceId?.trim() ?? "";
    const workspace = workspaceId?.trim() ?? "";
    if (!episodeId || !workspace) {
      return { ok: false, error: "Workspace or workpiece is missing." };
    }
    const nextEpisodePackage = ensureBrollPlanV2({
      ...episodePackage,
      broll_plan: {
        ...args.plan,
        workpiece_id: episodeId,
      },
    });
    const saved = await saveEpisodePackageForWorkpiece({
      workpieceId: episodeId,
      workspaceId: workspace,
      episodePackage: ensureLaunchVariantsV2(nextEpisodePackage),
      eventName: args.eventName,
      eventPayload: args.eventPayload,
    });
    if (!saved.ok) {
      return { ok: false, error: saved.error };
    }
    setEpisodePackage(saved.episodePackage);
    setImageMapMetadataUpdatedAt(saved.metadataUpdatedAt);
    return { ok: true, episodePackage: saved.episodePackage };
  }

  async function persistMediaMap(args: {
    map: EpisodeMediaMap;
    eventName: string;
    eventPayload: Record<string, unknown>;
  }): Promise<
    | { ok: true; episodePackage: EpisodePackageV2 }
    | { ok: false; error: string }
  > {
    if (!episodePackage) {
      return { ok: false, error: "Unable to save Episode Media Map for this episode." };
    }
    const episodeId = workpieceId?.trim() ?? "";
    const workspace = workspaceId?.trim() ?? "";
    if (!episodeId || !workspace) {
      return { ok: false, error: "Workspace or workpiece is missing." };
    }
    const nextEpisodePackage: EpisodePackageV2 = {
      ...episodePackage,
      media_map: {
        ...args.map,
        workpiece_id: episodeId,
      },
    };
    const savedEpisode = await saveEpisodePackageForWorkpiece({
      workpieceId: episodeId,
      workspaceId: workspace,
      episodePackage: ensureLaunchVariantsV2(nextEpisodePackage),
      eventName: args.eventName,
      eventPayload: args.eventPayload,
    });
    if (!savedEpisode.ok) {
      return { ok: false, error: savedEpisode.error };
    }
    const mediaMapSaved = await saveWorkpieceEpisodeMediaMap({
      workpieceId: episodeId,
      mediaMap: savedEpisode.episodePackage.media_map,
      eventName: "hearth.media_map.artifact.saved.v1",
      eventPayload: {
        entry_count: savedEpisode.episodePackage.media_map.entries.length,
        script_version_id: savedEpisode.episodePackage.media_map.script_version_id,
      },
    });
    if (!mediaMapSaved.ok) {
      return { ok: false, error: mediaMapSaved.error };
    }
    setEpisodePackage(savedEpisode.episodePackage);
    setImageMapMetadataUpdatedAt(savedEpisode.metadataUpdatedAt);
    return { ok: true, episodePackage: savedEpisode.episodePackage };
  }

  function setMediaMapDraftEditing<T extends string | boolean>(fieldSetter: (value: T) => void, value: T): void {
    fieldSetter(value);
    if (mediaMapSaveState !== "editing") {
      setMediaMapSaveState("editing");
    }
    setMediaMapSaveError(null);
  }

  function createMediaMapEntryId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `mm_${crypto.randomUUID()}`;
    }
    return `mm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function normalizeMediaMapNumber(text: string, fallback: number): number {
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, parsed);
  }

  function mapImageEntriesToMediaMapEntries(
    entries: EpisodeImageMapEntry[],
    nowIso: string,
    idPrefix: string,
  ): EpisodeMediaMapEntry[] {
    return entries.map((entry) => ({
      id: `${idPrefix}${entry.id}`,
      final_media_kind: entry.purpose === "explanation" ? "contextual_data_composite" : "image",
      purpose: entry.purpose,
      anchor: {
        mode: entry.anchor_scope === "global"
          ? "section_marker"
          : (entry.placement_hint === "exact_timestamp" ? "absolute_time" : "phrase_match"),
        target: entry.anchor_scope === "global"
          ? (entry.section_intent_note?.trim() || "global:image")
          : (entry.anchor || entry.prompt_basis || entry.description || "image:beat"),
      },
      timing: {
        in_offset_sec: 0,
        duration_sec: 6,
      },
      description: entry.description || entry.visual_intent || entry.prompt_basis || "Image map visual beat",
      intent: entry.intent || "visual_support",
      source: {
        status: entry.selected_asset_id ? "selected" : "unresolved",
        asset_id: entry.selected_asset_id ?? null,
      },
      confidence: entry.status === "selected" ? "high" : "medium",
      fulfillment_status: entry.selected_asset_id ? "resolved" : "planned",
      fulfillment_path: entry.selected_asset_id
        ? (entry.purpose === "explanation" ? "reference_clip" : "image")
        : null,
      optional: entry.visual_priority === "supporting",
      critical: entry.visual_priority === "primary",
      stale: false,
      created_at: nowIso,
      updated_at: nowIso,
    }));
  }

  function buildMediaMapFromExistingPlans(
    current: EpisodePackageV2,
    scriptVersionId: string | null,
    scope: MediaMapGenerationScope,
  ): EpisodeMediaMap {
    const nowIso = new Date().toISOString();
    const thumbnailVersionByConceptId = new Map<string, EpisodeThumbnailVersion>();
    for (const version of current.thumbnail.versions) {
      if (!thumbnailVersionByConceptId.has(version.concept_id)) {
        thumbnailVersionByConceptId.set(version.concept_id, version);
      }
    }
    const fromThumbnailPrompts: EpisodeMediaMapEntry[] = current.thumbnail.concepts.map((concept) => {
      const conceptLabel = concept.label.trim();
      const promptText = concept.prompt_text.trim();
      const supportingVersion = thumbnailVersionByConceptId.get(concept.id);
      return {
        id: `mm_thumbnail_${concept.id}`,
        final_media_kind: "image",
        purpose: "emphasis",
        anchor: {
          mode: "section_marker",
          target: conceptLabel ? `thumbnail:${conceptLabel}` : "thumbnail:concept",
        },
        timing: {
          in_offset_sec: 0,
          duration_sec: 6,
        },
        description: promptText || conceptLabel || "Thumbnail concept prompt",
        intent: "thumbnail_concept",
        source: {
          status: supportingVersion?.asset_id ? "selected" : "unresolved",
          asset_id: supportingVersion?.asset_id ?? null,
        },
        confidence: "medium",
        fulfillment_status: supportingVersion?.asset_id ? "resolved" : "planned",
        fulfillment_path: supportingVersion?.asset_id ? "image" : null,
        optional: false,
        critical: true,
        stale: false,
        created_at: nowIso,
        updated_at: nowIso,
      };
    });
    const fromImageMap = mapImageEntriesToMediaMapEntries(current.image_map.entries, nowIso, "mm_imap_");
    const fromBroll: EpisodeMediaMapEntry[] = current.broll_plan.beats.map((beat) => ({
      id: `mm_broll_${beat.id}`,
      final_media_kind: beat.purpose === "explanation" ? "contextual_data_composite" : "b_roll",
      purpose: beat.purpose,
      anchor: {
        mode: beat.placement_hint === "exact_timestamp" ? "absolute_time" : "phrase_match",
        target: beat.placement_hint === "exact_timestamp"
          ? String((beat.timestamp_ms ?? 0) / 1000)
          : beat.anchor_text,
      },
      timing: {
        in_offset_sec: 0,
        duration_sec: Math.max(1, (beat.suggested_duration_ms ?? 6000) / 1000),
      },
      description: beat.description,
      intent: beat.motion_intent,
      source: {
        status: beat.selected_asset_id ? "selected" : "unresolved",
        asset_id: beat.selected_asset_id ?? null,
      },
      confidence: "medium",
      fulfillment_status: beat.selected_asset_id ? "resolved" : "planned",
      fulfillment_path: beat.selected_asset_id
        ? (beat.purpose === "explanation" ? "reference_clip" : "motion_broll")
        : null,
      optional: beat.priority === "background",
      critical: beat.priority === "primary",
      stale: false,
      created_at: beat.created_at,
      updated_at: beat.updated_at,
    }));
    const fromReferenceClips: EpisodeMediaMapEntry[] = current.cdc_plan.entries.map((entry) => ({
      id: `mm_reference_clip_${entry.id}`,
      final_media_kind: "contextual_data_composite",
      purpose: entry.purpose,
      anchor: {
        mode: entry.placement_hint === "exact_timestamp" ? "absolute_time" : "phrase_match",
        target: entry.placement_hint === "exact_timestamp"
          ? String((entry.timestamp_ms ?? 0) / 1000)
          : entry.anchor_text,
      },
      timing: {
        in_offset_sec: 0,
        duration_sec: 6,
      },
      description: entry.description,
      intent: entry.data_type,
      source: {
        status: entry.selected_asset_id ? "selected" : "unresolved",
        asset_id: entry.selected_asset_id ?? null,
      },
      confidence: "medium",
      fulfillment_status: entry.selected_asset_id ? "resolved" : "planned",
      fulfillment_path: entry.selected_asset_id ? "reference_clip" : null,
      optional: false,
      critical: true,
      stale: false,
      created_at: entry.created_at,
      updated_at: entry.updated_at,
    }));
    const includeImages = true;
    const includeBroll = scope === "images_broll" || scope === "full_media_plan";
    const includeReferenceClips = scope === "images_reference_clips" || scope === "full_media_plan";
    const merged = [
      ...(includeImages ? fromThumbnailPrompts : []),
      ...(includeImages ? fromImageMap : []),
      ...(includeBroll ? fromBroll : []),
      ...(includeReferenceClips ? fromReferenceClips : []),
    ];
    return {
      id: current.media_map.id || "media-map-v1",
      workpiece_id: current.media_map.workpiece_id,
      script_version_id: scriptVersionId,
      status: "review",
      version: Math.max(1, current.media_map.version + 1),
      entries: merged,
      generated_at: nowIso,
    };
  }

  async function persistReferenceClipPlan(args: {
    plan: EpisodeReferenceClipPlan;
    eventName: string;
    eventPayload: Record<string, unknown>;
  }): Promise<
    | { ok: true; episodePackage: EpisodePackageV2 }
    | { ok: false; error: string }
  > {
    if (!episodePackage) {
      return { ok: false, error: "Unable to save Reference Clip plan for this episode." };
    }
    const episodeId = workpieceId?.trim() ?? "";
    const workspace = workspaceId?.trim() ?? "";
    if (!episodeId || !workspace) {
      return { ok: false, error: "Workspace or workpiece is missing." };
    }
    const nextEpisodePackage = ensureReferenceClipPlanV2({
      ...episodePackage,
      cdc_plan: {
        ...args.plan,
        workpiece_id: episodeId,
      },
    });
    const saved = await saveEpisodePackageForWorkpiece({
      workpieceId: episodeId,
      workspaceId: workspace,
      episodePackage: ensureLaunchVariantsV2(nextEpisodePackage),
      eventName: args.eventName,
      eventPayload: args.eventPayload,
    });
    if (!saved.ok) {
      return { ok: false, error: saved.error };
    }
    setEpisodePackage(saved.episodePackage);
    setImageMapMetadataUpdatedAt(saved.metadataUpdatedAt);
    return { ok: true, episodePackage: saved.episodePackage };
  }

  function setBrollDraftEditing(fieldSetter: (value: string) => void, value: string): void {
    fieldSetter(value);
    if (brollSaveState !== "editing") {
      setBrollSaveState("editing");
    }
    setBrollSaveError(null);
  }

  function setReferenceClipDraftEditing(fieldSetter: (value: string) => void, value: string): void {
    fieldSetter(value);
    if (referenceClipSaveState !== "editing") {
      setReferenceClipSaveState("editing");
    }
    setReferenceClipSaveError(null);
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

  async function onGenerateBrollPlan() {
    if (isApprovingScript || isAiProcessing || isBrollBusy) return;
    if (!episodePackage) return;
    const canonicalScript = await readCanonicalScriptForImageMapGeneration();
    if (!canonicalScript.ok) {
      setBrollSaveError(canonicalScript.message);
      setBrollSaveState("error");
      return;
    }
    const episodeId = workpieceId?.trim() ?? "";
    if (!episodeId) {
      setBrollSaveError("Select an Episode before generating a B-roll plan.");
      setBrollSaveState("error");
      return;
    }
    setIsBrollBusy(true);
    setBrollSaveState("saving");
    setBrollSaveError(null);
    try {
      const plan = buildBrollPlanFromScript({
        workpieceId: episodeId,
        scriptText: canonicalScript.text,
        previousPlan: episodePackage.broll_plan,
      });
      const saved = await persistBrollPlan({
        plan,
        eventName: "hearth.broll_plan.generated.v1",
        eventPayload: {
          beat_count: plan.beats.length,
          coverage_strength: plan.coverage_strength ?? null,
          source: canonicalScript.source,
        },
      });
      if (!saved.ok) {
        setBrollSaveError(saved.error);
        setBrollSaveState("error");
        return;
      }
      setSelectedBrollBeatId(plan.beats[0]?.id ?? null);
      setBrollSaveState("saved");
      setBrollMessage(`Generated ${plan.beats.length} B-roll beats from the canonical script.`);
    } finally {
      setIsBrollBusy(false);
    }
  }

  async function onSaveBrollBeat() {
    if (!episodePackage || !selectedBrollBeat) return;
    if (isBrollBusy) return;
    const nextMotionIntent = brollMotionIntentDraft as EpisodeBrollPlanBeat["motion_intent"];
    const nextDataVisualSpec = resolveBrollDataVisualSpecFromDraft(nextMotionIntent);
    const nextKeywords = brollKeywordsDraft
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    const nextBeat: EpisodeBrollPlanBeat = {
      ...selectedBrollBeat,
      anchor_text: brollAnchorDraft.trim(),
      description: brollDescriptionDraft.trim(),
      motion_intent: nextMotionIntent,
      asset_category: brollAssetCategoryDraft,
      priority: brollPriorityDraft as EpisodeBrollPlanBeat["priority"],
      keywords: nextKeywords,
      mood: brollMoodDraft.trim() || null,
      shot_type: (brollShotTypeDraft.trim() || "mixed") as EpisodeBrollPlanBeat["shot_type"],
      motion_suggestion: brollMotionSuggestionDraft.trim() || null,
      suggested_duration_ms: Number.isFinite(Number(brollSuggestedDurationDraft))
        ? Math.max(0, Math.trunc(Number(brollSuggestedDurationDraft)))
        : null,
      data_visual_spec: nextDataVisualSpec,
      placement_hint: (brollPlacementHintDraft.trim() || "first_occurrence") as EpisodeBrollPlanBeat["placement_hint"],
      external_request: advanceExternalRequestTracker(selectedBrollBeat.external_request, selectedBrollBeat.external_request?.state ?? "planned", {
        providerId: brollProviderIdDraft,
        sourceUrl: brollSourceUrlDraft,
        providerNote: brollProviderNoteDraft,
        usageNote: brollUsageNoteDraft,
        resultMetadata: brollResultMetadataDraft,
        attachedAssetId: selectedBrollBeat.selected_asset_id ?? null,
      }),
      updated_at: new Date().toISOString(),
      fulfillment_state: selectedBrollBeat.selected_asset_id ? "stale" : selectedBrollBeat.fulfillment_state,
    };
    const nextPlan: EpisodeBrollPlan = {
      ...episodePackage.broll_plan,
      version: Math.max(1, episodePackage.broll_plan.version + 1),
      beats: episodePackage.broll_plan.beats.map((beat) => (beat.id === selectedBrollBeat.id ? nextBeat : beat)),
      generated_at: new Date().toISOString(),
    };
    setIsBrollBusy(true);
    setBrollSaveState("saving");
    setBrollSaveError(null);
    try {
      const saved = await persistBrollPlan({
        plan: nextPlan,
        eventName: "hearth.broll_plan.beat_updated.v1",
        eventPayload: { beat_id: selectedBrollBeat.id },
      });
      if (!saved.ok) {
        setBrollSaveError(saved.error);
        setBrollSaveState("error");
        return;
      }
      setBrollSaveState("saved");
      setBrollMessage("B-roll beat saved.");
    } catch {
      setBrollSaveError("Unable to save this B-roll beat.");
      setBrollSaveState("error");
    } finally {
      setIsBrollBusy(false);
    }
  }

  async function onDeleteBrollBeat() {
    if (!episodePackage || !selectedBrollBeat) return;
    if (isBrollBusy) return;
    const confirmed = window.confirm("Delete this B-roll beat?");
    if (!confirmed) return;
    const nextBeats = episodePackage.broll_plan.beats.filter((beat) => beat.id !== selectedBrollBeat.id);
    const nextPlan: EpisodeBrollPlan = {
      ...episodePackage.broll_plan,
      version: Math.max(1, episodePackage.broll_plan.version + 1),
      beats: nextBeats,
      generated_at: new Date().toISOString(),
    };
    setIsBrollBusy(true);
    setBrollSaveState("saving");
    setBrollSaveError(null);
    try {
      const saved = await persistBrollPlan({
        plan: nextPlan,
        eventName: "hearth.broll_plan.beat_deleted.v1",
        eventPayload: { beat_id: selectedBrollBeat.id },
      });
      if (!saved.ok) {
        setBrollSaveError(saved.error);
        setBrollSaveState("error");
        return;
      }
      setSelectedBrollBeatId(nextBeats[0]?.id ?? null);
      setBrollSaveState("saved");
      setBrollMessage("B-roll beat removed.");
    } catch {
      setBrollSaveError("Unable to delete this B-roll beat.");
      setBrollSaveState("error");
    } finally {
      setIsBrollBusy(false);
    }
  }

  async function onRegenerateBrollBeat() {
    if (!episodePackage || !selectedBrollBeat) return;
    if (isBrollBusy) return;
    const regenerated = regenerateBrollBeatFromDescription({
      ...selectedBrollBeat,
      description: brollDescriptionDraft.trim() || selectedBrollBeat.description,
    });
    const nextPlan: EpisodeBrollPlan = {
      ...episodePackage.broll_plan,
      version: Math.max(1, episodePackage.broll_plan.version + 1),
      beats: episodePackage.broll_plan.beats.map((beat) => (beat.id === selectedBrollBeat.id ? regenerated : beat)),
      generated_at: new Date().toISOString(),
    };
    setIsBrollBusy(true);
    setBrollSaveState("saving");
    setBrollSaveError(null);
    try {
      const saved = await persistBrollPlan({
        plan: nextPlan,
        eventName: "hearth.broll_plan.beat_regenerated.v1",
        eventPayload: { beat_id: selectedBrollBeat.id },
      });
      if (!saved.ok) {
        setBrollSaveError(saved.error);
        setBrollSaveState("error");
        return;
      }
      setBrollSaveState("saved");
      setBrollMessage("B-roll beat regenerated.");
    } catch {
      setBrollSaveError("Unable to regenerate this B-roll beat.");
      setBrollSaveState("error");
    } finally {
      setIsBrollBusy(false);
    }
  }

  async function onCopyBrollPrompt() {
    if (!episodePackage || !selectedBrollBeat) return;
    const brief = buildBrollBeatBrief({
      beat: {
        ...selectedBrollBeat,
        anchor_text: brollAnchorDraft.trim() || selectedBrollBeat.anchor_text,
        description: brollDescriptionDraft.trim() || selectedBrollBeat.description,
      },
      workpieceId: workpieceId?.trim() ?? "",
      workpieceTitle: activeDraft?.title ?? null,
    });
    const text = formatVisualBriefAsText(brief);
    const copied = await writeTextToClipboard(text);
    if (!copied) {
      setBrollSaveError("Unable to copy prompt to clipboard.");
      setBrollSaveState("error");
      return;
    }
    const nextBeat: EpisodeBrollPlanBeat = {
      ...selectedBrollBeat,
      external_request: advanceExternalRequestTracker(selectedBrollBeat.external_request, "brief_exported", {
        providerId: brollProviderIdDraft,
        sourceUrl: brollSourceUrlDraft,
        providerNote: brollProviderNoteDraft,
        usageNote: brollUsageNoteDraft,
        resultMetadata: brollResultMetadataDraft,
      }),
      updated_at: new Date().toISOString(),
    };
    const nextPlan: EpisodeBrollPlan = {
      ...episodePackage.broll_plan,
      version: Math.max(1, episodePackage.broll_plan.version + 1),
      beats: episodePackage.broll_plan.beats.map((beat) => (beat.id === selectedBrollBeat.id ? nextBeat : beat)),
      generated_at: new Date().toISOString(),
    };
    const saved = await persistBrollPlan({
      plan: nextPlan,
      eventName: "hearth.broll_plan.brief_copied.v1",
      eventPayload: { beat_id: selectedBrollBeat.id },
    });
    if (!saved.ok) {
      setBrollSaveError(saved.error);
      setBrollSaveState("error");
      return;
    }
    setBrollMessage("Prompt copied. Manual bridge state updated.");
    setBrollSaveState("saved");
  }

  async function onDownloadBrollBrief(format: "text" | "json") {
    if (!episodePackage || !selectedBrollBeat) return;
    const brief = buildBrollBeatBrief({
      beat: {
        ...selectedBrollBeat,
        anchor_text: brollAnchorDraft.trim() || selectedBrollBeat.anchor_text,
        description: brollDescriptionDraft.trim() || selectedBrollBeat.description,
      },
      workpieceId: workpieceId?.trim() ?? "",
      workpieceTitle: activeDraft?.title ?? null,
    });
    const suffix = (workpieceId?.slice(0, 8) ?? "episode").toLowerCase();
    if (format === "json") {
      downloadTextFile({
        text: JSON.stringify(brief, null, 2),
        filename: `broll-brief-${suffix}-${selectedBrollBeat.id}.json`,
        mimeType: "application/json;charset=utf-8",
      });
    } else {
      downloadTextFile({
        text: formatVisualBriefAsText(brief),
        filename: `broll-brief-${suffix}-${selectedBrollBeat.id}.txt`,
      });
    }
    const nextBeat: EpisodeBrollPlanBeat = {
      ...selectedBrollBeat,
      external_request: advanceExternalRequestTracker(selectedBrollBeat.external_request, "brief_exported", {
        providerId: brollProviderIdDraft,
        sourceUrl: brollSourceUrlDraft,
        providerNote: brollProviderNoteDraft,
        usageNote: brollUsageNoteDraft,
        resultMetadata: brollResultMetadataDraft,
      }),
      updated_at: new Date().toISOString(),
    };
    const nextPlan: EpisodeBrollPlan = {
      ...episodePackage.broll_plan,
      version: Math.max(1, episodePackage.broll_plan.version + 1),
      beats: episodePackage.broll_plan.beats.map((beat) => (beat.id === selectedBrollBeat.id ? nextBeat : beat)),
      generated_at: new Date().toISOString(),
    };
    const saved = await persistBrollPlan({
      plan: nextPlan,
      eventName: "hearth.broll_plan.brief_downloaded.v1",
      eventPayload: { beat_id: selectedBrollBeat.id, format },
    });
    if (!saved.ok) {
      setBrollSaveError(saved.error);
      setBrollSaveState("error");
      return;
    }
    setBrollMessage(format === "json" ? "JSON brief downloaded." : "Brief downloaded.");
    setBrollSaveState("saved");
  }

  async function onOpenBrollProvider() {
    if (!selectedBrollBeat) return;
    const provider = brollProviders.find((entry) => entry.id === brollProviderIdDraft) ?? null;
    if (!provider) {
      setBrollSaveError("Choose a provider before opening a manual bridge.");
      setBrollSaveState("error");
      return;
    }
    const brief = buildBrollBeatBrief({
      beat: {
        ...selectedBrollBeat,
        anchor_text: brollAnchorDraft.trim() || selectedBrollBeat.anchor_text,
        description: brollDescriptionDraft.trim() || selectedBrollBeat.description,
      },
      workpieceId: workpieceId?.trim() ?? "",
      workpieceTitle: activeDraft?.title ?? null,
    });
    await writeTextToClipboard(formatVisualBriefAsText(brief));
    if (typeof window !== "undefined") {
      window.open(provider.launchUrl, "_blank", "noopener,noreferrer");
    }
    await onMarkBrollRequestState("sent_external");
    setBrollMessage(`Opened ${provider.name}. Prompt copied for manual paste.`);
  }

  async function onMarkBrollRequestState(nextState: EpisodeExternalRequestState) {
    if (!episodePackage || !selectedBrollBeat) return;
    const nextBeat: EpisodeBrollPlanBeat = {
      ...selectedBrollBeat,
      external_request: advanceExternalRequestTracker(selectedBrollBeat.external_request, nextState, {
        providerId: brollProviderIdDraft,
        sourceUrl: brollSourceUrlDraft,
        providerNote: brollProviderNoteDraft,
        usageNote: brollUsageNoteDraft,
        resultMetadata: brollResultMetadataDraft,
        attachedAssetId: selectedBrollBeat.selected_asset_id ?? null,
      }),
      updated_at: new Date().toISOString(),
    };
    const nextPlan: EpisodeBrollPlan = {
      ...episodePackage.broll_plan,
      version: Math.max(1, episodePackage.broll_plan.version + 1),
      beats: episodePackage.broll_plan.beats.map((beat) => (beat.id === selectedBrollBeat.id ? nextBeat : beat)),
      generated_at: new Date().toISOString(),
    };
    const saved = await persistBrollPlan({
      plan: nextPlan,
      eventName: "hearth.broll_plan.request_state.updated.v1",
      eventPayload: { beat_id: selectedBrollBeat.id, request_state: nextState },
    });
    if (!saved.ok) {
      setBrollSaveError(saved.error);
      setBrollSaveState("error");
      return;
    }
    setBrollSaveState("saved");
  }

  async function onClearBrollRequestState() {
    if (!episodePackage || !selectedBrollBeat) return;
    const nextBeat: EpisodeBrollPlanBeat = {
      ...selectedBrollBeat,
      external_request: {
        state: "planned",
        updated_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    };
    const nextPlan: EpisodeBrollPlan = {
      ...episodePackage.broll_plan,
      version: Math.max(1, episodePackage.broll_plan.version + 1),
      beats: episodePackage.broll_plan.beats.map((beat) => (beat.id === selectedBrollBeat.id ? nextBeat : beat)),
      generated_at: new Date().toISOString(),
    };
    const saved = await persistBrollPlan({
      plan: nextPlan,
      eventName: "hearth.broll_plan.request_state.cleared.v1",
      eventPayload: { beat_id: selectedBrollBeat.id },
    });
    if (!saved.ok) {
      setBrollSaveError(saved.error);
      setBrollSaveState("error");
      return;
    }
    setBrollSaveState("saved");
    setBrollMessage("Request state cleared.");
  }

  async function onAttachBrollResultFromUrl() {
    if (!episodePackage || !selectedBrollBeat) return;
    const sourceUrl = brollSourceUrlDraft.trim();
    if (!sourceUrl) {
      setBrollSaveError("Add a source URL before attaching a result.");
      setBrollSaveState("error");
      return;
    }
    const candidate = createManualResultCandidate({
      assetClass: "broll",
      beatId: selectedBrollBeat.id,
      sourceLabel: brollSourceLabelDraft || "External provider",
      sourceUrl,
      title: brollDescriptionDraft || selectedBrollBeat.description,
      providerNote: brollProviderNoteDraft,
      usageNote: brollUsageNoteDraft,
    });
    const nextBeat: EpisodeBrollPlanBeat = {
      ...selectedBrollBeat,
      source_type: "external",
      candidate_assets: [
        ...(selectedBrollBeat.candidate_assets ?? []).filter((asset) => asset.asset_id !== candidate.asset_id),
        candidate,
      ],
      selected_asset_id: candidate.asset_id,
      external_request: advanceExternalRequestTracker(selectedBrollBeat.external_request, "asset_attached", {
        providerId: brollProviderIdDraft,
        sourceUrl: brollSourceUrlDraft,
        providerNote: brollProviderNoteDraft,
        usageNote: brollUsageNoteDraft,
        resultMetadata: brollResultMetadataDraft,
        attachedAssetId: candidate.asset_id,
      }),
      fulfillment_state: "resolved",
      updated_at: new Date().toISOString(),
    };
    const nextPlan: EpisodeBrollPlan = {
      ...episodePackage.broll_plan,
      version: Math.max(1, episodePackage.broll_plan.version + 1),
      beats: episodePackage.broll_plan.beats.map((beat) => (beat.id === selectedBrollBeat.id ? nextBeat : beat)),
      generated_at: new Date().toISOString(),
    };
    const saved = await persistBrollPlan({
      plan: nextPlan,
      eventName: "hearth.broll_plan.result_url_attached.v1",
      eventPayload: { beat_id: selectedBrollBeat.id },
    });
    if (!saved.ok) {
      setBrollSaveError(saved.error);
      setBrollSaveState("error");
      return;
    }
    setBrollSaveState("saved");
    setBrollMessage("Result URL attached as a classed B-roll candidate.");
  }

  async function onFindStockForBrollBeat() {
    if (!episodePackage || !selectedBrollBeat) return;
    if (isBrollBusy) return;
    const nextMotionIntent = brollMotionIntentDraft as EpisodeBrollPlanBeat["motion_intent"];
    const baseBeat = {
      ...selectedBrollBeat,
      description: brollDescriptionDraft.trim() || selectedBrollBeat.description,
      keywords: brollKeywordsDraft
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
      motion_intent: nextMotionIntent,
      asset_category: brollAssetCategoryDraft,
      mood: brollMoodDraft.trim() || selectedBrollBeat.mood,
      data_visual_spec: resolveBrollDataVisualSpecFromDraft(nextMotionIntent),
    };
    const stockCandidates = buildStockCandidatesForBrollBeat(baseBeat);
    const nextBeat: EpisodeBrollPlanBeat = {
      ...baseBeat,
      source_type: "stock",
      candidate_assets: stockCandidates,
      selected_asset_id: stockCandidates[0]?.asset_id ?? null,
      fulfillment_state: stockCandidates.length > 0 ? "resolved" : "unresolved",
      updated_at: new Date().toISOString(),
    };
    const nextPlan: EpisodeBrollPlan = {
      ...episodePackage.broll_plan,
      version: Math.max(1, episodePackage.broll_plan.version + 1),
      beats: episodePackage.broll_plan.beats.map((beat) => (beat.id === selectedBrollBeat.id ? nextBeat : beat)),
      generated_at: new Date().toISOString(),
    };
    setIsBrollBusy(true);
    setBrollSaveState("saving");
    setBrollSaveError(null);
    try {
      const saved = await persistBrollPlan({
        plan: nextPlan,
        eventName: "hearth.broll_plan.stock_candidates.generated.v1",
        eventPayload: { beat_id: selectedBrollBeat.id, candidate_count: stockCandidates.length },
      });
      if (!saved.ok) {
        setBrollSaveError(saved.error);
        setBrollSaveState("error");
        return;
      }
      setBrollSaveState("saved");
      setBrollMessage(`Attached ${stockCandidates.length} stock candidate links.`);
    } catch {
      setBrollSaveError("Unable to attach stock candidates for this B-roll beat.");
      setBrollSaveState("error");
    } finally {
      setIsBrollBusy(false);
    }
  }

  async function onUploadBrollBeatAsset(file: File) {
    if (!episodePackage || !selectedBrollBeat) return;
    if (isBrollBusy) return;
    const episodeId = workpieceId?.trim() ?? "";
    if (!episodeId) {
      setBrollSaveError("Select an Episode before uploading B-roll assets.");
      setBrollSaveState("error");
      return;
    }
    setIsBrollBusy(true);
    setBrollSaveState("saving");
    setBrollSaveError(null);
    try {
    const uploaded = await uploadBrollBeatAsset({
      workpieceId: episodeId,
      beatId: selectedBrollBeat.id,
      file,
      source: "upload",
      assetClass: "broll",
      sourceLabel: brollSourceLabelDraft,
      sourceUrl: brollSourceUrlDraft,
      providerNote: brollProviderNoteDraft,
      usageNote: brollUsageNoteDraft,
    });
      if (!uploaded.ok) {
        setBrollSaveError(uploaded.error);
        setBrollSaveState("error");
        return;
      }
    const uploadedCategory: EpisodeBrollMotionAssetCategory = file.type.startsWith("video/")
      ? "uploaded_video"
      : "animated_graphic";
    const nextBeat: EpisodeBrollPlanBeat = {
      ...selectedBrollBeat,
      source_type: "upload",
      asset_category: uploadedCategory,
      origin: selectedBrollBeat.origin === "hammer" ? "mixed" : "hearth",
      candidate_assets: [
        ...(selectedBrollBeat.candidate_assets ?? []).filter((asset) => asset.asset_id !== uploaded.candidateAsset.asset_id),
        uploaded.candidateAsset,
      ],
        external_request: advanceExternalRequestTracker(selectedBrollBeat.external_request, "asset_attached", {
          providerId: brollProviderIdDraft,
          sourceUrl: brollSourceUrlDraft,
          providerNote: brollProviderNoteDraft,
          usageNote: brollUsageNoteDraft,
          resultMetadata: brollResultMetadataDraft,
          attachedAssetId: uploaded.candidateAsset.asset_id,
        }),
        selected_asset_id: uploaded.candidateAsset.asset_id,
        fulfillment_state: "resolved",
        updated_at: new Date().toISOString(),
      };
      const nextPlan: EpisodeBrollPlan = {
        ...episodePackage.broll_plan,
        version: Math.max(1, episodePackage.broll_plan.version + 1),
        beats: episodePackage.broll_plan.beats.map((beat) => (beat.id === selectedBrollBeat.id ? nextBeat : beat)),
        generated_at: new Date().toISOString(),
      };
      const saved = await persistBrollPlan({
        plan: nextPlan,
        eventName: "hearth.broll_plan.asset_uploaded.v1",
        eventPayload: { beat_id: selectedBrollBeat.id, source: "upload" },
      });
      if (!saved.ok) {
        setBrollSaveError(saved.error);
        setBrollSaveState("error");
        return;
      }
      setBrollSaveState("saved");
      setBrollMessage("Uploaded asset selected for this B-roll beat.");
    } catch {
      setBrollSaveError("Unable to upload this B-roll asset.");
      setBrollSaveState("error");
    } finally {
      setIsBrollBusy(false);
    }
  }

  async function onSelectBrollCandidate(candidateId: string) {
    if (!episodePackage || !selectedBrollBeat) return;
    if (isBrollBusy) return;
    if (selectedBrollBeat.selected_asset_id === candidateId) return;
    const candidate = (selectedBrollBeat.candidate_assets ?? []).find((asset) => asset.asset_id === candidateId) ?? null;
    if (!candidate) {
      setBrollSaveError("Selected candidate is no longer attached to this beat.");
      setBrollSaveState("error");
      return;
    }
    const nextBeat: EpisodeBrollPlanBeat = {
      ...selectedBrollBeat,
      source_type: candidate.source,
      asset_category: candidate.asset_category ?? selectedBrollBeat.asset_category,
      data_visual_spec: candidate.data_visual_spec ?? selectedBrollBeat.data_visual_spec ?? null,
      external_request: advanceExternalRequestTracker(selectedBrollBeat.external_request, "resolved", {
        providerId: brollProviderIdDraft,
        sourceUrl: candidate.source_url ?? brollSourceUrlDraft,
        providerNote: candidate.provider_note ?? brollProviderNoteDraft,
        usageNote: candidate.usage_note ?? brollUsageNoteDraft,
        resultMetadata: brollResultMetadataDraft,
        attachedAssetId: candidate.asset_id,
      }),
      selected_asset_id: candidate.asset_id,
      fulfillment_state: "resolved",
      updated_at: new Date().toISOString(),
    };
    const nextPlan: EpisodeBrollPlan = {
      ...episodePackage.broll_plan,
      version: Math.max(1, episodePackage.broll_plan.version + 1),
      beats: episodePackage.broll_plan.beats.map((beat) => (beat.id === selectedBrollBeat.id ? nextBeat : beat)),
      generated_at: new Date().toISOString(),
    };
    setIsBrollBusy(true);
    setBrollSaveState("saving");
    setBrollSaveError(null);
    try {
      const saved = await persistBrollPlan({
        plan: nextPlan,
        eventName: "hearth.broll_plan.asset_selected.v1",
        eventPayload: { beat_id: selectedBrollBeat.id, candidate_id: candidate.asset_id },
      });
      if (!saved.ok) {
        setBrollSaveError(saved.error);
        setBrollSaveState("error");
        return;
      }
      setBrollSaveState("saved");
      setBrollMessage("Selected asset attached to B-roll beat.");
    } catch {
      setBrollSaveError("Unable to select this B-roll candidate.");
      setBrollSaveState("error");
    } finally {
      setIsBrollBusy(false);
    }
  }

  async function onCreateReferenceClipEntry() {
    if (isReferenceClipBusy) return;
    if (!episodePackage) return;
    const episodeId = workpieceId?.trim() ?? "";
    if (!episodeId) {
      setReferenceClipSaveError("Select an Episode before creating Reference Clips.");
      setReferenceClipSaveState("error");
      return;
    }
    const baseAnchor = (
      selectedImageMapEntry?.anchor
      || selectedBrollBeat?.anchor_text
      || activeDraft?.title
      || "New reference clip"
    ).trim();
    const created = createReferenceClipPlan({
      workpieceId: episodeId,
      anchorText: baseAnchor,
      description: baseAnchor,
      format: (referenceClipFormatDraft.trim() || "still") as EpisodeReferenceClipFormat,
    });
    const nextPlan: EpisodeReferenceClipPlan = {
      ...episodePackage.cdc_plan,
      version: Math.max(1, episodePackage.cdc_plan.version + 1),
      entries: [...episodePackage.cdc_plan.entries, created],
      generated_at: new Date().toISOString(),
    };
    setIsReferenceClipBusy(true);
    setReferenceClipSaveState("saving");
    setReferenceClipSaveError(null);
    try {
      const saved = await persistReferenceClipPlan({
        plan: nextPlan,
        eventName: "hearth.cdc_plan.entry_created.v1",
        eventPayload: {
          cdc_id: created.id,
          format: created.format,
          data_type: created.data_type,
        },
      });
      if (!saved.ok) {
        setReferenceClipSaveError(saved.error);
        setReferenceClipSaveState("error");
        return;
      }
      setSelectedReferenceClipEntryId(created.id);
      setReferenceClipSaveState("saved");
      setReferenceClipMessage("Reference Clip created.");
    } catch {
      setReferenceClipSaveError("Unable to create this reference clip.");
      setReferenceClipSaveState("error");
    } finally {
      setIsReferenceClipBusy(false);
    }
  }

  async function onSaveReferenceClipEntry() {
    if (!episodePackage || !selectedReferenceClipEntry) return;
    if (isReferenceClipBusy) return;
    const nextEntry: EpisodeContextualDataCompositePlan = {
      ...selectedReferenceClipEntry,
      anchor_text: referenceClipAnchorDraft.trim(),
      placement_hint: (referenceClipPlacementHintDraft.trim() || "first_occurrence") as EpisodeContextualDataCompositePlan["placement_hint"],
      format: (referenceClipFormatDraft.trim() || "still") as EpisodeReferenceClipFormat,
      data_type: (referenceClipDataTypeDraft.trim() || "quantitative") as EpisodeReferenceClipDataType,
      context_type: (referenceClipContextTypeDraft.trim() || "historical") as EpisodeReferenceClipContextType,
      tone: (referenceClipToneDraft.trim() || "neutral") as EpisodeReferenceClipTone,
      motion_level: (referenceClipMotionLevelDraft.trim() || "static") as EpisodeReferenceClipMotionLevel,
      description: referenceClipDescriptionDraft.trim(),
      background_context_description: referenceClipBackgroundContextDraft.trim(),
      foreground_data_description: referenceClipForegroundDataDraft.trim(),
      visual_style: normalizeHearthVisualStyle(referenceClipVisualStyleDraft),
      chart_type: (referenceClipChartTypeDraft.trim() || "line") as EpisodeReferenceClipChartType,
      title: referenceClipTitleDraft.trim() || null,
      labels: referenceClipLabelsDraft
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
      values: resolveReferenceClipValuesFromDraft(),
      emphasis_key: referenceClipEmphasisKeyDraft.trim() || null,
      source_type: referenceClipSourceTypeDraft as EpisodeContextualDataCompositePlan["source_type"],
      external_request: advanceExternalRequestTracker(
        selectedReferenceClipEntry.external_request,
        selectedReferenceClipEntry.external_request?.state ?? "planned",
        {
          providerId: referenceClipProviderIdDraft,
          sourceUrl: referenceClipSourceUrlDraft,
          providerNote: referenceClipProviderNoteDraft,
          usageNote: referenceClipUsageNoteDraft,
          resultMetadata: referenceClipResultMetadataDraft,
          attachedAssetId: selectedReferenceClipEntry.selected_asset_id ?? null,
        },
      ),
      origin: referenceClipSourceTypeDraft === "hammer_upload" && selectedReferenceClipEntry.origin === "hearth"
        ? "mixed"
        : selectedReferenceClipEntry.origin,
      updated_at: new Date().toISOString(),
    };
    const nextPlan: EpisodeReferenceClipPlan = {
      ...episodePackage.cdc_plan,
      version: Math.max(1, episodePackage.cdc_plan.version + 1),
      entries: episodePackage.cdc_plan.entries.map((entry) => (entry.id === selectedReferenceClipEntry.id ? nextEntry : entry)),
      generated_at: new Date().toISOString(),
    };
    setIsReferenceClipBusy(true);
    setReferenceClipSaveState("saving");
    setReferenceClipSaveError(null);
    try {
      const saved = await persistReferenceClipPlan({
        plan: nextPlan,
        eventName: "hearth.cdc_plan.entry_updated.v1",
        eventPayload: { cdc_id: selectedReferenceClipEntry.id },
      });
      if (!saved.ok) {
        setReferenceClipSaveError(saved.error);
        setReferenceClipSaveState("error");
        return;
      }
      setReferenceClipSaveState("saved");
      setReferenceClipMessage("Reference Clip saved.");
    } catch {
      setReferenceClipSaveError("Unable to save this reference clip.");
      setReferenceClipSaveState("error");
    } finally {
      setIsReferenceClipBusy(false);
    }
  }

  async function onDeleteReferenceClipEntry() {
    if (!episodePackage || !selectedReferenceClipEntry) return;
    if (isReferenceClipBusy) return;
    const confirmed = window.confirm("Delete this Reference Clip?");
    if (!confirmed) return;
    const nextEntries = episodePackage.cdc_plan.entries.filter((entry) => entry.id !== selectedReferenceClipEntry.id);
    const nextPlan: EpisodeReferenceClipPlan = {
      ...episodePackage.cdc_plan,
      version: Math.max(1, episodePackage.cdc_plan.version + 1),
      entries: nextEntries,
      generated_at: new Date().toISOString(),
    };
    setIsReferenceClipBusy(true);
    setReferenceClipSaveState("saving");
    setReferenceClipSaveError(null);
    try {
      const saved = await persistReferenceClipPlan({
        plan: nextPlan,
        eventName: "hearth.cdc_plan.entry_deleted.v1",
        eventPayload: { cdc_id: selectedReferenceClipEntry.id },
      });
      if (!saved.ok) {
        setReferenceClipSaveError(saved.error);
        setReferenceClipSaveState("error");
        return;
      }
      setSelectedReferenceClipEntryId(nextEntries[0]?.id ?? null);
      setReferenceClipSaveState("saved");
      setReferenceClipMessage("Reference Clip removed.");
    } catch {
      setReferenceClipSaveError("Unable to delete this reference clip.");
      setReferenceClipSaveState("error");
    } finally {
      setIsReferenceClipBusy(false);
    }
  }

  async function onRegenerateReferenceClipEntryStub() {
    if (!episodePackage || !selectedReferenceClipEntry) return;
    if (isReferenceClipBusy) return;
    const nextDescription = referenceClipDescriptionDraft.trim() || selectedReferenceClipEntry.description || selectedReferenceClipEntry.anchor_text;
    const signals = inferReferenceClipSuitabilitySignals(nextDescription);
    const inferredDataType: EpisodeReferenceClipDataType = signals.includes("geographic")
      ? "geographic"
      : signals.includes("over_time")
        ? "timeline"
        : signals.includes("comparison")
          ? "comparison"
          : signals.includes("statistics")
            ? "quantitative"
            : "categorical";
    const inferredContextType: EpisodeReferenceClipContextType = signals.includes("geographic") ? "location" : "historical";
    const inferredChartType: EpisodeReferenceClipChartType = inferredDataType === "timeline"
      ? "timeline"
      : inferredDataType === "geographic"
        ? "map"
        : inferredDataType === "comparison"
          ? "comparison"
          : inferredDataType === "categorical"
            ? "bar"
            : "line";
    const nextEntry: EpisodeContextualDataCompositePlan = {
      ...selectedReferenceClipEntry,
      description: nextDescription,
      data_type: inferredDataType,
      context_type: inferredContextType,
      chart_type: inferredChartType,
      tone: signals.includes("policy_impact") ? "investigative" : (signals.includes("trend") ? "analytical" : selectedReferenceClipEntry.tone),
      motion_level: (referenceClipFormatDraft === "animated" || referenceClipFormatDraft === "hybrid") ? "full_animation" : "static",
      updated_at: new Date().toISOString(),
    };
    const nextPlan: EpisodeReferenceClipPlan = {
      ...episodePackage.cdc_plan,
      version: Math.max(1, episodePackage.cdc_plan.version + 1),
      entries: episodePackage.cdc_plan.entries.map((entry) => (entry.id === selectedReferenceClipEntry.id ? nextEntry : entry)),
      generated_at: new Date().toISOString(),
    };
    setIsReferenceClipBusy(true);
    setReferenceClipSaveState("saving");
    setReferenceClipSaveError(null);
    try {
      const saved = await persistReferenceClipPlan({
        plan: nextPlan,
        eventName: "hearth.cdc_plan.entry_regenerated_stub.v1",
        eventPayload: {
          cdc_id: selectedReferenceClipEntry.id,
          signal_count: signals.length,
        },
      });
      if (!saved.ok) {
        setReferenceClipSaveError(saved.error);
        setReferenceClipSaveState("error");
        return;
      }
      setReferenceClipSaveState("saved");
      setReferenceClipMessage("Reference Clip guidance refreshed.");
    } catch {
      setReferenceClipSaveError("Unable to regenerate reference clip guidance.");
      setReferenceClipSaveState("error");
    } finally {
      setIsReferenceClipBusy(false);
    }
  }

  async function onCopyReferenceClipPrompt() {
    if (!episodePackage || !selectedReferenceClipEntry) return;
    const brief = buildReferenceClipBrief({
      entry: {
        ...selectedReferenceClipEntry,
        anchor_text: referenceClipAnchorDraft.trim() || selectedReferenceClipEntry.anchor_text,
        description: referenceClipDescriptionDraft.trim() || selectedReferenceClipEntry.description,
      },
      workpieceId: workpieceId?.trim() ?? "",
      workpieceTitle: activeDraft?.title ?? null,
    });
    const text = formatVisualBriefAsText(brief);
    const copied = await writeTextToClipboard(text);
    if (!copied) {
      setReferenceClipSaveError("Unable to copy prompt to clipboard.");
      setReferenceClipSaveState("error");
      return;
    }
    const nextEntry: EpisodeContextualDataCompositePlan = {
      ...selectedReferenceClipEntry,
      external_request: advanceExternalRequestTracker(selectedReferenceClipEntry.external_request, "brief_exported", {
        providerId: referenceClipProviderIdDraft,
        sourceUrl: referenceClipSourceUrlDraft,
        providerNote: referenceClipProviderNoteDraft,
        usageNote: referenceClipUsageNoteDraft,
        resultMetadata: referenceClipResultMetadataDraft,
      }),
      updated_at: new Date().toISOString(),
    };
    const nextPlan: EpisodeReferenceClipPlan = {
      ...episodePackage.cdc_plan,
      version: Math.max(1, episodePackage.cdc_plan.version + 1),
      entries: episodePackage.cdc_plan.entries.map((entry) => (entry.id === selectedReferenceClipEntry.id ? nextEntry : entry)),
      generated_at: new Date().toISOString(),
    };
    const saved = await persistReferenceClipPlan({
      plan: nextPlan,
      eventName: "hearth.cdc_plan.brief_copied.v1",
      eventPayload: { cdc_id: selectedReferenceClipEntry.id },
    });
    if (!saved.ok) {
      setReferenceClipSaveError(saved.error);
      setReferenceClipSaveState("error");
      return;
    }
    setReferenceClipSaveState("saved");
    setReferenceClipMessage("Prompt copied. Manual bridge state updated.");
  }

  async function onDownloadReferenceClipBrief(format: "text" | "json") {
    if (!episodePackage || !selectedReferenceClipEntry) return;
    const brief = buildReferenceClipBrief({
      entry: {
        ...selectedReferenceClipEntry,
        anchor_text: referenceClipAnchorDraft.trim() || selectedReferenceClipEntry.anchor_text,
        description: referenceClipDescriptionDraft.trim() || selectedReferenceClipEntry.description,
      },
      workpieceId: workpieceId?.trim() ?? "",
      workpieceTitle: activeDraft?.title ?? null,
    });
    const suffix = (workpieceId?.slice(0, 8) ?? "episode").toLowerCase();
    if (format === "json") {
      downloadTextFile({
        text: JSON.stringify(brief, null, 2),
        filename: `reference-clip-brief-${suffix}-${selectedReferenceClipEntry.id}.json`,
        mimeType: "application/json;charset=utf-8",
      });
    } else {
      downloadTextFile({
        text: formatVisualBriefAsText(brief),
        filename: `reference-clip-brief-${suffix}-${selectedReferenceClipEntry.id}.txt`,
      });
    }
    const nextEntry: EpisodeContextualDataCompositePlan = {
      ...selectedReferenceClipEntry,
      external_request: advanceExternalRequestTracker(selectedReferenceClipEntry.external_request, "brief_exported", {
        providerId: referenceClipProviderIdDraft,
        sourceUrl: referenceClipSourceUrlDraft,
        providerNote: referenceClipProviderNoteDraft,
        usageNote: referenceClipUsageNoteDraft,
        resultMetadata: referenceClipResultMetadataDraft,
      }),
      updated_at: new Date().toISOString(),
    };
    const nextPlan: EpisodeReferenceClipPlan = {
      ...episodePackage.cdc_plan,
      version: Math.max(1, episodePackage.cdc_plan.version + 1),
      entries: episodePackage.cdc_plan.entries.map((entry) => (entry.id === selectedReferenceClipEntry.id ? nextEntry : entry)),
      generated_at: new Date().toISOString(),
    };
    const saved = await persistReferenceClipPlan({
      plan: nextPlan,
      eventName: "hearth.cdc_plan.brief_downloaded.v1",
      eventPayload: { cdc_id: selectedReferenceClipEntry.id, format },
    });
    if (!saved.ok) {
      setReferenceClipSaveError(saved.error);
      setReferenceClipSaveState("error");
      return;
    }
    setReferenceClipSaveState("saved");
    setReferenceClipMessage(format === "json" ? "JSON brief downloaded." : "Brief downloaded.");
  }

  async function onOpenReferenceClipProvider() {
    if (!selectedReferenceClipEntry) return;
    const provider = referenceClipProviders.find((entry) => entry.id === referenceClipProviderIdDraft) ?? null;
    if (!provider) {
      setReferenceClipSaveError("Choose a provider before opening a manual bridge.");
      setReferenceClipSaveState("error");
      return;
    }
    const brief = buildReferenceClipBrief({
      entry: {
        ...selectedReferenceClipEntry,
        anchor_text: referenceClipAnchorDraft.trim() || selectedReferenceClipEntry.anchor_text,
        description: referenceClipDescriptionDraft.trim() || selectedReferenceClipEntry.description,
      },
      workpieceId: workpieceId?.trim() ?? "",
      workpieceTitle: activeDraft?.title ?? null,
    });
    await writeTextToClipboard(formatVisualBriefAsText(brief));
    if (typeof window !== "undefined") {
      window.open(provider.launchUrl, "_blank", "noopener,noreferrer");
    }
    await onMarkReferenceClipRequestState("sent_external");
    setReferenceClipMessage(`Opened ${provider.name}. Prompt copied for manual paste.`);
  }

  async function onMarkReferenceClipRequestState(nextState: EpisodeExternalRequestState) {
    if (!episodePackage || !selectedReferenceClipEntry) return;
    const nextEntry: EpisodeContextualDataCompositePlan = {
      ...selectedReferenceClipEntry,
      external_request: advanceExternalRequestTracker(selectedReferenceClipEntry.external_request, nextState, {
        providerId: referenceClipProviderIdDraft,
        sourceUrl: referenceClipSourceUrlDraft,
        providerNote: referenceClipProviderNoteDraft,
        usageNote: referenceClipUsageNoteDraft,
        resultMetadata: referenceClipResultMetadataDraft,
        attachedAssetId: selectedReferenceClipEntry.selected_asset_id ?? null,
      }),
      updated_at: new Date().toISOString(),
    };
    const nextPlan: EpisodeReferenceClipPlan = {
      ...episodePackage.cdc_plan,
      version: Math.max(1, episodePackage.cdc_plan.version + 1),
      entries: episodePackage.cdc_plan.entries.map((entry) => (entry.id === selectedReferenceClipEntry.id ? nextEntry : entry)),
      generated_at: new Date().toISOString(),
    };
    const saved = await persistReferenceClipPlan({
      plan: nextPlan,
      eventName: "hearth.cdc_plan.request_state.updated.v1",
      eventPayload: { cdc_id: selectedReferenceClipEntry.id, request_state: nextState },
    });
    if (!saved.ok) {
      setReferenceClipSaveError(saved.error);
      setReferenceClipSaveState("error");
      return;
    }
    setReferenceClipSaveState("saved");
  }

  async function onClearReferenceClipRequestState() {
    if (!episodePackage || !selectedReferenceClipEntry) return;
    const nextEntry: EpisodeContextualDataCompositePlan = {
      ...selectedReferenceClipEntry,
      external_request: {
        state: "planned",
        updated_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    };
    const nextPlan: EpisodeReferenceClipPlan = {
      ...episodePackage.cdc_plan,
      version: Math.max(1, episodePackage.cdc_plan.version + 1),
      entries: episodePackage.cdc_plan.entries.map((entry) => (entry.id === selectedReferenceClipEntry.id ? nextEntry : entry)),
      generated_at: new Date().toISOString(),
    };
    const saved = await persistReferenceClipPlan({
      plan: nextPlan,
      eventName: "hearth.cdc_plan.request_state.cleared.v1",
      eventPayload: { cdc_id: selectedReferenceClipEntry.id },
    });
    if (!saved.ok) {
      setReferenceClipSaveError(saved.error);
      setReferenceClipSaveState("error");
      return;
    }
    setReferenceClipSaveState("saved");
    setReferenceClipMessage("Request state cleared.");
  }

  async function onAttachReferenceClipResultFromUrl() {
    if (!episodePackage || !selectedReferenceClipEntry) return;
    const sourceUrl = referenceClipSourceUrlDraft.trim();
    if (!sourceUrl) {
      setReferenceClipSaveError("Add a source URL before attaching a result.");
      setReferenceClipSaveState("error");
      return;
    }
    const candidate = createManualResultCandidate({
      assetClass: "reference_clip",
      beatId: selectedReferenceClipEntry.id,
      sourceLabel: referenceClipSourceLabelDraft || "External provider",
      sourceUrl,
      title: referenceClipTitleDraft || selectedReferenceClipEntry.description,
      providerNote: referenceClipProviderNoteDraft,
      usageNote: referenceClipUsageNoteDraft,
    });
    const nextEntry: EpisodeContextualDataCompositePlan = {
      ...selectedReferenceClipEntry,
      source_type: "external",
      candidate_assets: [
        ...(selectedReferenceClipEntry.candidate_assets ?? []).filter((asset) => asset.asset_id !== candidate.asset_id),
        candidate,
      ],
      selected_asset_id: candidate.asset_id,
      external_request: advanceExternalRequestTracker(selectedReferenceClipEntry.external_request, "asset_attached", {
        providerId: referenceClipProviderIdDraft,
        sourceUrl: referenceClipSourceUrlDraft,
        providerNote: referenceClipProviderNoteDraft,
        usageNote: referenceClipUsageNoteDraft,
        resultMetadata: referenceClipResultMetadataDraft,
        attachedAssetId: candidate.asset_id,
      }),
      updated_at: new Date().toISOString(),
    };
    const nextPlan: EpisodeReferenceClipPlan = {
      ...episodePackage.cdc_plan,
      version: Math.max(1, episodePackage.cdc_plan.version + 1),
      entries: episodePackage.cdc_plan.entries.map((entry) => (entry.id === selectedReferenceClipEntry.id ? nextEntry : entry)),
      generated_at: new Date().toISOString(),
    };
    const saved = await persistReferenceClipPlan({
      plan: nextPlan,
      eventName: "hearth.cdc_plan.result_url_attached.v1",
      eventPayload: { cdc_id: selectedReferenceClipEntry.id },
    });
    if (!saved.ok) {
      setReferenceClipSaveError(saved.error);
      setReferenceClipSaveState("error");
      return;
    }
    setReferenceClipSaveState("saved");
    setReferenceClipMessage("Result URL attached as a classed reference clip candidate.");
  }

  async function onUploadReferenceClipAsset(file: File) {
    if (!episodePackage || !selectedReferenceClipEntry) return;
    if (isReferenceClipBusy) return;
    const episodeId = workpieceId?.trim() ?? "";
    if (!episodeId) {
      setReferenceClipSaveError("Select an Episode before uploading Reference Clip assets.");
      setReferenceClipSaveState("error");
      return;
    }
    setIsReferenceClipBusy(true);
    setReferenceClipSaveState("saving");
    setReferenceClipSaveError(null);
    try {
      const uploaded = await uploadBrollBeatAsset({
        workpieceId: episodeId,
        beatId: selectedReferenceClipEntry.id,
        file,
        source: "upload",
        assetClass: "reference_clip",
        sourceLabel: referenceClipSourceLabelDraft,
        sourceUrl: referenceClipSourceUrlDraft,
        providerNote: referenceClipProviderNoteDraft,
        usageNote: referenceClipUsageNoteDraft,
      });
      if (!uploaded.ok) {
        setReferenceClipSaveError(uploaded.error);
        setReferenceClipSaveState("error");
        return;
      }
      const nextEntry: EpisodeContextualDataCompositePlan = {
        ...selectedReferenceClipEntry,
        source_type: "upload",
        origin: selectedReferenceClipEntry.origin === "hammer" ? "mixed" : "hearth",
        candidate_assets: [
          ...(selectedReferenceClipEntry.candidate_assets ?? []).filter((asset) => asset.asset_id !== uploaded.candidateAsset.asset_id),
          uploaded.candidateAsset,
        ],
        external_request: advanceExternalRequestTracker(selectedReferenceClipEntry.external_request, "asset_attached", {
          providerId: referenceClipProviderIdDraft,
          sourceUrl: referenceClipSourceUrlDraft,
          providerNote: referenceClipProviderNoteDraft,
          usageNote: referenceClipUsageNoteDraft,
          resultMetadata: referenceClipResultMetadataDraft,
          attachedAssetId: uploaded.candidateAsset.asset_id,
        }),
        selected_asset_id: uploaded.candidateAsset.asset_id,
        updated_at: new Date().toISOString(),
      };
      const nextPlan: EpisodeReferenceClipPlan = {
        ...episodePackage.cdc_plan,
        version: Math.max(1, episodePackage.cdc_plan.version + 1),
        entries: episodePackage.cdc_plan.entries.map((entry) => (entry.id === selectedReferenceClipEntry.id ? nextEntry : entry)),
        generated_at: new Date().toISOString(),
      };
      const saved = await persistReferenceClipPlan({
        plan: nextPlan,
        eventName: "hearth.cdc_plan.asset_uploaded.v1",
        eventPayload: { cdc_id: selectedReferenceClipEntry.id, source: "upload" },
      });
      if (!saved.ok) {
        setReferenceClipSaveError(saved.error);
        setReferenceClipSaveState("error");
        return;
      }
      setReferenceClipSaveState("saved");
      setReferenceClipMessage("Uploaded asset selected for this reference clip.");
    } catch {
      setReferenceClipSaveError("Unable to upload this reference clip asset.");
      setReferenceClipSaveState("error");
    } finally {
      setIsReferenceClipBusy(false);
    }
  }

  async function onSelectReferenceClipCandidate(candidateId: string) {
    if (!episodePackage || !selectedReferenceClipEntry) return;
    if (isReferenceClipBusy) return;
    if (selectedReferenceClipEntry.selected_asset_id === candidateId) return;
    const candidate = (selectedReferenceClipEntry.candidate_assets ?? []).find((asset) => asset.asset_id === candidateId) ?? null;
    if (!candidate) {
      setReferenceClipSaveError("Selected candidate is no longer attached to this reference clip.");
      setReferenceClipSaveState("error");
      return;
    }
    const nextEntry: EpisodeContextualDataCompositePlan = {
      ...selectedReferenceClipEntry,
      source_type: candidate.source,
      origin: candidate.source === "hammer_upload" && selectedReferenceClipEntry.origin === "hearth"
        ? "mixed"
        : selectedReferenceClipEntry.origin,
      external_request: advanceExternalRequestTracker(selectedReferenceClipEntry.external_request, "resolved", {
        providerId: referenceClipProviderIdDraft,
        sourceUrl: candidate.source_url ?? referenceClipSourceUrlDraft,
        providerNote: candidate.provider_note ?? referenceClipProviderNoteDraft,
        usageNote: candidate.usage_note ?? referenceClipUsageNoteDraft,
        resultMetadata: referenceClipResultMetadataDraft,
        attachedAssetId: candidate.asset_id,
      }),
      selected_asset_id: candidate.asset_id,
      updated_at: new Date().toISOString(),
    };
    const nextPlan: EpisodeReferenceClipPlan = {
      ...episodePackage.cdc_plan,
      version: Math.max(1, episodePackage.cdc_plan.version + 1),
      entries: episodePackage.cdc_plan.entries.map((entry) => (entry.id === selectedReferenceClipEntry.id ? nextEntry : entry)),
      generated_at: new Date().toISOString(),
    };
    setIsReferenceClipBusy(true);
    setReferenceClipSaveState("saving");
    setReferenceClipSaveError(null);
    try {
      const saved = await persistReferenceClipPlan({
        plan: nextPlan,
        eventName: "hearth.cdc_plan.asset_selected.v1",
        eventPayload: { cdc_id: selectedReferenceClipEntry.id, candidate_id: candidate.asset_id },
      });
      if (!saved.ok) {
        setReferenceClipSaveError(saved.error);
        setReferenceClipSaveState("error");
        return;
      }
      setReferenceClipSaveState("saved");
      setReferenceClipMessage("Selected asset attached to reference clip.");
    } catch {
      setReferenceClipSaveError("Unable to select this reference clip candidate.");
      setReferenceClipSaveState("error");
    } finally {
      setIsReferenceClipBusy(false);
    }
  }

  async function onGenerateEpisodeMediaMapFromPlans() {
    if (!episodePackage) return;
    if (isMediaMapBusy) return;
    const scriptVersionId = approvedScriptVersion ? String(approvedScriptVersion) : null;
    const nextMap = buildMediaMapFromExistingPlans(
      episodePackage,
      scriptVersionId,
      mediaMapGenerationScope,
    );
    setIsMediaMapBusy(true);
    setMediaMapSaveState("saving");
    setMediaMapSaveError(null);
    try {
      const saved = await persistMediaMap({
        map: nextMap,
        eventName: "hearth.media_map.generated_from_plans.v1",
        eventPayload: {
          entry_count: nextMap.entries.length,
          script_version_id: scriptVersionId,
          scope: mediaMapGenerationScope,
        },
      });
      if (!saved.ok) {
        setMediaMapSaveError(saved.error);
        setMediaMapSaveState("error");
        return;
      }
      setSelectedMediaMapEntryId(nextMap.entries[0]?.id ?? null);
      setMediaMapSaveState("saved");
      const brollCount = nextMap.entries.filter((entry) => entry.final_media_kind === "b_roll").length;
      const referenceClipCount = nextMap.entries.filter((entry) => entry.final_media_kind === "contextual_data_composite").length;
      setMediaMapMessage(
        `Generated ${nextMap.entries.length} media map entries from the current visual plans using scope: ${mediaMapGenerationScope.replaceAll("_", " ")} (image: ${nextMap.entries.filter((entry) => entry.final_media_kind === "image").length}, b-roll: ${brollCount}, reference clips: ${referenceClipCount}).`,
      );
    } catch {
      setMediaMapSaveError("Unable to generate Episode Media Map.");
      setMediaMapSaveState("error");
    } finally {
      setIsMediaMapBusy(false);
    }
  }

  async function onAddMediaMapEntry() {
    if (!episodePackage) return;
    if (isMediaMapBusy) return;
    const nowIso = new Date().toISOString();
    const entry: EpisodeMediaMapEntry = {
      id: createMediaMapEntryId(),
      final_media_kind: "image",
      purpose: "coverage",
      anchor: {
        mode: "phrase_match",
        target: "",
      },
      timing: {
        in_offset_sec: 0,
        duration_sec: 6,
      },
      description: "",
      intent: "establish_context",
      source: {
        status: "unresolved",
        asset_id: null,
      },
      confidence: "medium",
      fulfillment_status: "planned",
      fulfillment_path: null,
      optional: false,
      critical: false,
      stale: false,
      created_at: nowIso,
      updated_at: nowIso,
    };
    const nextMap: EpisodeMediaMap = {
      ...episodePackage.media_map,
      script_version_id: approvedScriptVersion ? String(approvedScriptVersion) : episodePackage.media_map.script_version_id,
      status: "draft",
      version: Math.max(1, episodePackage.media_map.version + 1),
      entries: [...episodePackage.media_map.entries, entry],
      generated_at: nowIso,
    };
    setIsMediaMapBusy(true);
    setMediaMapSaveState("saving");
    setMediaMapSaveError(null);
    try {
      const saved = await persistMediaMap({
        map: nextMap,
        eventName: "hearth.media_map.entry_created.v1",
        eventPayload: { entry_id: entry.id },
      });
      if (!saved.ok) {
        setMediaMapSaveError(saved.error);
        setMediaMapSaveState("error");
        return;
      }
      setSelectedMediaMapEntryId(entry.id);
      setMediaMapSaveState("saved");
      setMediaMapMessage("Media map entry created.");
    } catch {
      setMediaMapSaveError("Unable to create media map entry.");
      setMediaMapSaveState("error");
    } finally {
      setIsMediaMapBusy(false);
    }
  }

  async function onSaveMediaMapEntry() {
    if (!episodePackage || !selectedMediaMapEntry) return;
    if (isMediaMapBusy) return;
    const nowIso = new Date().toISOString();
    const nextFinalMediaKind = (
      mediaMapTypeDraft === "b_roll" || mediaMapTypeDraft === "contextual_data_composite"
        ? mediaMapTypeDraft
        : "image"
    );
    const nextEntry: EpisodeMediaMapEntry = {
      ...selectedMediaMapEntry,
      final_media_kind: nextFinalMediaKind,
      purpose: deriveMediaMapPurpose({
        finalMediaKind: nextFinalMediaKind,
        intent: mediaMapIntentDraft.trim(),
        description: mediaMapDescriptionDraft.trim(),
        anchorTarget: mediaMapAnchorTargetDraft.trim(),
      }),
      anchor: {
        mode: (
          mediaMapAnchorModeDraft === "line_anchor"
          || mediaMapAnchorModeDraft === "phrase_match"
          || mediaMapAnchorModeDraft === "speaker_turn"
          || mediaMapAnchorModeDraft === "section_marker"
          || mediaMapAnchorModeDraft === "absolute_time"
            ? mediaMapAnchorModeDraft
            : "phrase_match"
        ),
        target: mediaMapAnchorTargetDraft.trim(),
      },
      timing: {
        in_offset_sec: normalizeMediaMapNumber(mediaMapInOffsetDraft, selectedMediaMapEntry.timing.in_offset_sec),
        duration_sec: normalizeMediaMapNumber(mediaMapDurationDraft, selectedMediaMapEntry.timing.duration_sec),
      },
      description: mediaMapDescriptionDraft.trim(),
      intent: mediaMapIntentDraft.trim(),
      source: {
        status: (
          mediaMapSourceStatusDraft === "selected"
          || mediaMapSourceStatusDraft === "attached"
            ? mediaMapSourceStatusDraft
            : "unresolved"
        ),
        asset_id: mediaMapSourceAssetIdDraft.trim() || null,
      },
      confidence: (
        mediaMapConfidenceDraft === "high"
        || mediaMapConfidenceDraft === "low"
          ? mediaMapConfidenceDraft
          : "medium"
      ),
      fulfillment_status: (
        mediaMapSourceStatusDraft === "selected" || mediaMapSourceStatusDraft === "attached"
          ? "resolved"
          : selectedMediaMapEntry.fulfillment_status
      ),
      fulfillment_path: (
        nextFinalMediaKind === "b_roll"
          ? "motion_broll"
          : nextFinalMediaKind === "contextual_data_composite"
            ? "reference_clip"
            : "image"
      ),
      optional: mediaMapOptionalDraft,
      critical: mediaMapCriticalDraft,
      stale: false,
      updated_at: nowIso,
    };
    const nextMap: EpisodeMediaMap = {
      ...episodePackage.media_map,
      script_version_id: approvedScriptVersion ? String(approvedScriptVersion) : episodePackage.media_map.script_version_id,
      status: (
        episodePackage.media_map.status === "activated"
        || episodePackage.media_map.status === "fulfilling"
        || episodePackage.media_map.status === "fulfilled"
      )
        ? "needs_attention"
        : episodePackage.media_map.status,
      version: Math.max(1, episodePackage.media_map.version + 1),
      entries: episodePackage.media_map.entries.map((entry) => (entry.id === selectedMediaMapEntry.id ? nextEntry : entry)),
      generated_at: nowIso,
    };
    setIsMediaMapBusy(true);
    setMediaMapSaveState("saving");
    setMediaMapSaveError(null);
    try {
      const saved = await persistMediaMap({
        map: nextMap,
        eventName: "hearth.media_map.entry_updated.v1",
        eventPayload: { entry_id: selectedMediaMapEntry.id },
      });
      if (!saved.ok) {
        setMediaMapSaveError(saved.error);
        setMediaMapSaveState("error");
        return;
      }
      setMediaMapSaveState("saved");
      setMediaMapMessage("Media map entry saved.");
    } catch {
      setMediaMapSaveError("Unable to save media map entry.");
      setMediaMapSaveState("error");
    } finally {
      setIsMediaMapBusy(false);
    }
  }

  async function onDeleteMediaMapEntry() {
    if (!episodePackage || !selectedMediaMapEntry) return;
    if (isMediaMapBusy) return;
    if (!window.confirm("Delete this media map entry?")) return;
    const nextEntries = episodePackage.media_map.entries.filter((entry) => entry.id !== selectedMediaMapEntry.id);
    const nextMap: EpisodeMediaMap = {
      ...episodePackage.media_map,
      status: (
        episodePackage.media_map.status === "activated"
        || episodePackage.media_map.status === "fulfilling"
        || episodePackage.media_map.status === "fulfilled"
      )
        ? "needs_attention"
        : episodePackage.media_map.status,
      version: Math.max(1, episodePackage.media_map.version + 1),
      entries: nextEntries,
      generated_at: new Date().toISOString(),
    };
    setIsMediaMapBusy(true);
    setMediaMapSaveState("saving");
    setMediaMapSaveError(null);
    try {
      const saved = await persistMediaMap({
        map: nextMap,
        eventName: "hearth.media_map.entry_deleted.v1",
        eventPayload: { entry_id: selectedMediaMapEntry.id },
      });
      if (!saved.ok) {
        setMediaMapSaveError(saved.error);
        setMediaMapSaveState("error");
        return;
      }
      setSelectedMediaMapEntryId(nextEntries[0]?.id ?? null);
      setMediaMapSaveState("saved");
      setMediaMapMessage("Media map entry removed.");
    } catch {
      setMediaMapSaveError("Unable to delete media map entry.");
      setMediaMapSaveState("error");
    } finally {
      setIsMediaMapBusy(false);
    }
  }

  async function onActivateEpisodeMediaMap() {
    if (!episodePackage) return;
    if (isMediaMapBusy) return;
    const activated = activateEpisodeMediaMapForFulfillment({
      ...episodePackage.media_map,
      script_version_id: approvedScriptVersion ? String(approvedScriptVersion) : episodePackage.media_map.script_version_id,
    });
    setIsMediaMapBusy(true);
    setMediaMapSaveState("saving");
    setMediaMapSaveError(null);
    try {
      const saved = await persistMediaMap({
        map: activated,
        eventName: "hearth.media_map.activated.v1",
        eventPayload: {
          entry_count: activated.entries.length,
          script_version_id: activated.script_version_id,
          queued_count: activated.entries.filter((entry) => entry.fulfillment_status === "queued").length,
        },
      });
      if (!saved.ok) {
        setMediaMapSaveError(saved.error);
        setMediaMapSaveState("error");
        return;
      }
      setMediaMapSaveState("saved");
      setMediaMapMessage("Media plan activated. Beats routed to image, motion B-roll, and Reference Clip fulfillment paths.");
    } catch {
      setMediaMapSaveError("Unable to activate Episode Media Map.");
      setMediaMapSaveState("error");
    } finally {
      setIsMediaMapBusy(false);
    }
  }

  async function onCreateThumbnailConcept() {
    if (isThumbnailConceptSaving || isThumbnailGenerating || isThumbnailUploading) return;
    if (!episodePackage) return;

    const label = thumbnailConceptLabelDraft.trim();
    const promptText = thumbnailConceptPromptDraft.trim();
    if (!label || !promptText) {
      setThumbnailGenerateError("Concept label and prompt are required.");
      return;
    }

    const concept: EpisodeThumbnailConcept = {
      id: createThumbnailClientId("thumb-concept"),
      label,
      prompt_text: promptText,
      style_preset: normalizeHearthVisualStyle(thumbnailConceptStyleDraft),
      title_style: normalizeEpisodeThumbnailTitleStyle(thumbnailTitleStyleDraft),
      brand_template_id: thumbnailConceptBrandTemplateIdDraft ?? defaultThumbnailBrandTemplateId,
    };

    const nextEpisodePackage: EpisodePackageV2 = {
      ...episodePackage,
      thumbnail: {
        ...episodePackage.thumbnail,
        concepts: [...episodePackage.thumbnail.concepts, concept],
      },
    };

    setIsThumbnailConceptSaving(true);
    setThumbnailGenerateError(null);
    try {
      const saved = await persistThumbnailEpisodePackage(
        nextEpisodePackage,
        "hearth.thumbnail.concept.created.v1",
        { concept_id: concept.id },
      );
      if (!saved) return;
      setSelectedThumbnailConceptId(concept.id);
      setThumbnailPromptOverride("");
    } finally {
      setIsThumbnailConceptSaving(false);
    }
  }

  async function onSaveSelectedThumbnailConcept() {
    if (isThumbnailConceptSaving || isThumbnailGenerating || isThumbnailUploading) return;
    if (!episodePackage || !selectedThumbnailConceptId) return;

    const label = thumbnailConceptLabelDraft.trim();
    const promptText = thumbnailConceptPromptDraft.trim();
    if (!label || !promptText) {
      setThumbnailGenerateError("Concept label and prompt are required.");
      return;
    }

    const nextConcepts = episodePackage.thumbnail.concepts.map((concept) => (
      concept.id === selectedThumbnailConceptId
        ? {
            ...concept,
            label,
            prompt_text: promptText,
            style_preset: normalizeHearthVisualStyle(thumbnailConceptStyleDraft),
            title_style: normalizeEpisodeThumbnailTitleStyle(thumbnailTitleStyleDraft),
            brand_template_id: thumbnailConceptBrandTemplateIdDraft ?? null,
          }
        : concept
    ));

    const nextEpisodePackage: EpisodePackageV2 = {
      ...episodePackage,
      thumbnail: {
        ...episodePackage.thumbnail,
        concepts: nextConcepts,
      },
    };

    setIsThumbnailConceptSaving(true);
    setThumbnailGenerateError(null);
    try {
      await persistThumbnailEpisodePackage(
        nextEpisodePackage,
        "hearth.thumbnail.concept.updated.v1",
        { concept_id: selectedThumbnailConceptId },
      );
    } finally {
      setIsThumbnailConceptSaving(false);
    }
  }

  async function onDeleteSelectedThumbnailConcept() {
    if (isThumbnailConceptSaving || isThumbnailGenerating || isThumbnailUploading) return;
    if (!episodePackage || !selectedThumbnailConceptId) return;
    const confirmed = window.confirm("Delete this concept and its linked versions?");
    if (!confirmed) return;

    const nextConcepts = episodePackage.thumbnail.concepts.filter((concept) => concept.id !== selectedThumbnailConceptId);
    const nextVersions = episodePackage.thumbnail.versions.filter((version) => version.concept_id !== selectedThumbnailConceptId);
    const nextPrimary = nextVersions.some((version) => version.id === episodePackage.thumbnail.primary_version_id)
      ? episodePackage.thumbnail.primary_version_id
      : nextVersions[0]?.id ?? null;
    const nextSelectedConceptId = nextConcepts[0]?.id ?? "";
    const nextSelectedVersionId = nextPrimary ?? nextVersions[0]?.id ?? null;

    const nextEpisodePackage: EpisodePackageV2 = {
      ...episodePackage,
      thumbnail: {
        ...episodePackage.thumbnail,
        concepts: nextConcepts,
        versions: nextVersions,
        primary_version_id: nextPrimary,
      },
    };

    setIsThumbnailConceptSaving(true);
    setThumbnailGenerateError(null);
    try {
      const saved = await persistThumbnailEpisodePackage(
        nextEpisodePackage,
        "hearth.thumbnail.concept.deleted.v1",
        { concept_id: selectedThumbnailConceptId },
      );
      if (!saved) return;
      setSelectedThumbnailConceptId(nextSelectedConceptId);
      setSelectedThumbnailVersionId(nextSelectedVersionId);
    } finally {
      setIsThumbnailConceptSaving(false);
    }
  }

  async function onSetPrimaryThumbnailVersion(versionId: string) {
    if (isThumbnailConceptSaving || isThumbnailGenerating || isThumbnailUploading) return;
    if (!episodePackage) return;
    const version = episodePackage.thumbnail.versions.find((entry) => entry.id === versionId);
    if (!version || version.status !== "ready") return;

    const nextEpisodePackage: EpisodePackageV2 = {
      ...episodePackage,
      thumbnail: {
        ...episodePackage.thumbnail,
        primary_version_id: versionId,
      },
    };

    const saved = await persistThumbnailEpisodePackage(
      nextEpisodePackage,
      "hearth.thumbnail.primary.set.v1",
      { version_id: versionId },
    );
    if (!saved) return;
    setSelectedThumbnailConceptId(version.concept_id);
    setSelectedThumbnailVersionId(versionId);
  }

  function onSelectThumbnailTitle(titleId: string): void {
    setSelectedThumbnailTitleId(titleId);
    setThumbnailPairingError(null);
  }

  function onSelectThumbnailVersion(versionId: string): void {
    const version = thumbnailVersions.find((entry) => entry.id === versionId) ?? null;
    if (version) {
      setSelectedThumbnailConceptId(version.concept_id);
    }
    setSelectedThumbnailVersionId(versionId);
    setThumbnailPairingError(null);
  }

  function onCreateLaunchVariant(): void {
    setSelectedLaunchVariantId(null);
    setThumbnailPairingError(null);
  }

  function onSelectLaunchVariant(variantId: string): void {
    const variant = launchVariants.find((entry) => entry.id === variantId) ?? null;
    if (!variant) return;
    const version = thumbnailVersions.find((entry) => entry.id === variant.thumbnail_version_id) ?? null;
    if (version) {
      setSelectedThumbnailConceptId(version.concept_id);
      setSelectedThumbnailVersionId(version.id);
    }
    setSelectedThumbnailTitleId(variant.title_id);
    setSelectedLaunchVariantId(variant.id);
    setThumbnailPairingError(null);
  }

  async function onSaveLaunchVariant() {
    if (isThumbnailConceptSaving || isThumbnailGenerating || isThumbnailUploading) return;
    if (!episodePackage) return;

    const titleId = selectedThumbnailTitleId?.trim() ?? "";
    const versionId = selectedThumbnailVersionId?.trim() ?? "";
    if (!titleId || !versionId) {
      setThumbnailPairingError("Choose both a title and a thumbnail version before saving a launch variant.");
      return;
    }

    const title = metadataTitlesDraft.find((entry) => entry.id === titleId) ?? null;
    if (!title || !title.text.trim()) {
      setThumbnailPairingError("Choose a populated title before saving a launch variant.");
      return;
    }

    const version = thumbnailVersions.find((entry) => entry.id === versionId) ?? null;
    if (!version) {
      setThumbnailPairingError("Select a valid thumbnail version before saving a launch variant.");
      return;
    }

    const existingVariant = selectedLaunchVariantId
      ? episodePackage.launch_variants.find((entry) => entry.id === selectedLaunchVariantId) ?? null
      : null;
    const nowIso = new Date().toISOString();
    const status = launchVariantStatusDraft;
    const notes = launchVariantNotesDraft.trim() || null;
    const lastTestedAt = status === "tested" || status === "winner"
      ? existingVariant?.last_tested_at ?? nowIso
      : existingVariant?.last_tested_at ?? null;
    const winnerSelectedAt = status === "winner"
      ? existingVariant?.winner_selected_at ?? nowIso
      : null;
    const nextVariant: EpisodeLaunchVariant = existingVariant
      ? {
          ...existingVariant,
          title_id: titleId,
          thumbnail_version_id: versionId,
          updated_at: nowIso,
          status,
          notes,
          last_tested_at: lastTestedAt,
          winner_selected_at: winnerSelectedAt,
        }
      : {
          id: createThumbnailClientId("launch-variant"),
          title_id: titleId,
          thumbnail_version_id: versionId,
          created_at: nowIso,
          updated_at: nowIso,
          status,
          notes,
          last_tested_at: lastTestedAt,
          winner_selected_at: winnerSelectedAt,
        };

    const nextEpisodePackage: EpisodePackageV2 = {
      ...episodePackage,
      launch_variants: existingVariant
        ? episodePackage.launch_variants.map((entry) => (entry.id === nextVariant.id ? nextVariant : entry))
        : [...episodePackage.launch_variants, nextVariant],
    };

    setThumbnailPairingError(null);
    const saved = await persistThumbnailEpisodePackage(
      nextEpisodePackage,
      existingVariant ? "hearth.launch.variant.updated.v1" : "hearth.launch.variant.created.v1",
      {
        launch_variant_id: nextVariant.id,
        title_id: titleId,
        thumbnail_version_id: versionId,
        status,
      },
    );
    if (!saved) {
      setThumbnailPairingError("Unable to save launch variant.");
      return;
    }
    setSelectedLaunchVariantId(nextVariant.id);
  }

  async function onGenerateThumbnailVersion(options?: {
    forceConceptId?: string | null;
    forcePrompt?: string | null;
  }) {
    if (isAiProcessing || isApprovingScript || isThumbnailGenerating || isThumbnailUploading) return;

    const episodeId = workpieceId?.trim() ?? "";
    const workspace = workspaceId?.trim() ?? "";
    if (!episodeId || !workspace || !episodePackage) {
      setThumbnailGenerateError("Select an Episode before generating thumbnails.");
      return;
    }
    if (aiBillingMode === "forge" && aiTokenBalance != null && aiTokenBalance <= 0) {
      setThumbnailGenerateError("No AI credits remaining.");
      return;
    }

    const conceptId = options?.forceConceptId ?? (selectedThumbnailConceptId.trim() || null);
    const resolvedConcept = conceptId
      ? episodePackage.thumbnail.concepts.find((concept) => concept.id === conceptId) ?? null
      : null;
    const promptOverride = options?.forcePrompt ?? (thumbnailPromptOverride.trim() || null);
    const effectiveStylePreset = conceptId && conceptId === selectedThumbnailConceptId
      ? normalizeHearthVisualStyle(thumbnailConceptStyleDraft)
      : normalizeHearthVisualStyle(resolvedConcept?.style_preset ?? null);
    const usedPrompt = (promptOverride || resolvedConcept?.prompt_text || "").trim();
    if (!conceptId && !promptOverride) {
      setThumbnailGenerateError("Select a concept or provide a prompt override.");
      return;
    }
    if (!usedPrompt) {
      setThumbnailGenerateError("Prompt is empty.");
      return;
    }

    const alwaysApproveSpend = resolveAiThumbnailAutoApproveFromStorage();
    const confirmed = alwaysApproveSpend
      ? true
      : window.confirm("Generate thumbnail? This will spend credits.");
    if (!confirmed) return;

    setIsThumbnailGenerating(true);
    setThumbnailGenerateError(null);
    setThumbnailUploadError(null);
    setAiRuntimeWarning(null);
    try {
      const generated = await generateEpisodeThumbnail({
        workspaceId: workspace,
        workpieceId: episodeId,
        conceptId,
        prompt: promptOverride,
        preset: effectiveStylePreset,
        aspect: thumbnailAspect,
        confirmSpend: confirmed,
        alwaysApproveAiSpend: alwaysApproveSpend,
      });
      if (!generated.ok) {
        setThumbnailGenerateError(generated.error);
        const failedVersionId = createThumbnailClientId("thumb-failed-version");
        const failedVersion: EpisodeThumbnailVersion = {
          id: failedVersionId,
          concept_id: conceptId ?? resolvedConcept?.id ?? "concept-failed",
          created_at: new Date().toISOString(),
          provider: "openai",
          prompt: usedPrompt,
          asset_id: `failed:${failedVersionId}`,
          status: "failed",
          error: generated.error,
          provider_request_id: null,
          asset_path: null,
          mime_type: null,
        };
        const failedEpisodePackage: EpisodePackageV2 = {
          ...episodePackage,
          thumbnail: {
            ...episodePackage.thumbnail,
            versions: [...episodePackage.thumbnail.versions, failedVersion],
          },
        };
        const savedFailed = await persistThumbnailEpisodePackage(
          failedEpisodePackage,
          "hearth.thumbnail.version.failed.v1",
          { version_id: failedVersion.id, concept_id: failedVersion.concept_id },
        );
        if (savedFailed) {
          setSelectedThumbnailVersionId(failedVersion.id);
        }
        publishForgeNotice({
          job: "job-failed",
          title: "Thumbnail generation failed",
          message: generated.error,
          severity: "error",
        });
        return;
      }

      let nextEpisodePackage = generated.updatedEpisodePackage;
      const refreshedImageMap = await getWorkpieceImageMap(episodeId);
      if (refreshedImageMap.ok) {
        nextEpisodePackage = replaceEpisodePackageImageMap(
          generated.updatedEpisodePackage,
          refreshedImageMap.imageMap.entries,
        );
        setImageMapMetadataUpdatedAt(refreshedImageMap.imageMap.metadataUpdatedAt);
      }
      setEpisodePackage(nextEpisodePackage);
      setSelectedThumbnailConceptId(generated.version.concept_id);
      setSelectedThumbnailVersionId(generated.version.id);
      setThumbnailPromptOverride("");
      if (typeof generated.tokenBalance === "number") {
        setAiTokenBalance(generated.tokenBalance);
      }
      if (generated.creditsWarning) {
        setAiRuntimeWarning(generated.creditsWarning);
      }
      publishForgeNotice({
        job: "image-generated",
        title: "Thumbnail ready",
        message: "Hearth finished generating a thumbnail for this episode.",
        severity: "success",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Thumbnail generation failed.";
      setThumbnailGenerateError(message);
      publishForgeNotice({
        job: "job-failed",
        title: "Thumbnail generation failed",
        message,
        severity: "error",
      });
    } finally {
      setIsThumbnailGenerating(false);
    }
  }

  async function onRetryFailedThumbnailVersion(version: EpisodeThumbnailVersion) {
    await onGenerateThumbnailVersion({
      forceConceptId: version.concept_id,
      forcePrompt: version.prompt,
    });
  }

  async function onUploadThumbnailBrandLogo(file: File) {
    const template = selectedThumbnailBrandTemplate;
    const workspace = template?.workspaceId?.trim() ?? "";
    const episodeId = workpieceId?.trim() ?? "";
    if (!workspace || !episodeId || !template) {
      setThumbnailBrandLogoError("Select a brand template before uploading a logo.");
      return;
    }

    setIsThumbnailBrandLogoUploading(true);
    setThumbnailBrandLogoError(null);
    setThumbnailBrandLogoStatus(null);
    try {
      const uploaded = await uploadWorkspaceThumbnailBrandLogo({
        workpieceId: episodeId,
        templateId: template.id,
        file,
      });
      if (!uploaded.ok) {
        setThumbnailBrandLogoError(uploaded.error);
        return;
      }

      const updatedTemplateJson = {
        ...template.templateJson,
        logo: {
          ...template.templateJson.logo,
          workpiece_id: episodeId,
          asset_path: uploaded.assetPath,
          mime_type: uploaded.mimeType,
        },
      };

      const updated = await updateWorkspaceThumbnailBrandTemplate(workspace, template.id, {
        templateJson: updatedTemplateJson,
      });
      if (!updated.ok) {
        setThumbnailBrandLogoError(updated.error);
        return;
      }

      setThumbnailBrandTemplates((prev) => prev.map((item) => (
        item.id === updated.data.id ? updated.data : item
      )));
      setThumbnailBrandLogoError(null);
      setThumbnailBrandLogoStatus(`Logo uploaded for "${updated.data.name}".`);
      publishForgeNotice({
        job: "image-generated",
        title: "Brand logo uploaded",
        message: "Thumbnail branding logo was saved successfully.",
        severity: "success",
      });
    } finally {
      setIsThumbnailBrandLogoUploading(false);
    }
  }

  async function onRemoveThumbnailBrandLogo() {
    const template = selectedThumbnailBrandTemplate;
    const workspace = template?.workspaceId?.trim() ?? "";
    if (!workspace || !template) {
      setThumbnailBrandLogoError("Select a brand template before removing a logo.");
      return;
    }

    setIsThumbnailBrandLogoUploading(true);
    setThumbnailBrandLogoError(null);
    setThumbnailBrandLogoStatus(null);
    try {
      const updated = await updateWorkspaceThumbnailBrandTemplate(workspace, template.id, {
        templateJson: {
          ...template.templateJson,
          logo: {
            ...template.templateJson.logo,
            workpiece_id: null,
            asset_path: null,
            mime_type: null,
          },
        },
      });
      if (!updated.ok) {
        setThumbnailBrandLogoError(updated.error);
        return;
      }

      setThumbnailBrandTemplates((prev) => prev.map((item) => (
        item.id === updated.data.id ? updated.data : item
      )));
      setThumbnailBrandLogoDataUrl(null);
      setThumbnailBrandLogoError(null);
      setThumbnailBrandLogoStatus(`Logo removed from "${updated.data.name}".`);
    } finally {
      setIsThumbnailBrandLogoUploading(false);
    }
  }

  async function onUploadThumbnailImage(file: File) {
    if (isThumbnailUploading || isThumbnailGenerating || isThumbnailConceptSaving) return;
    if (!episodePackage) return;

    const episodeId = workpieceId?.trim() ?? "";
    const workspace = workspaceId?.trim() ?? "";
    if (!episodeId || !workspace) {
      setThumbnailUploadError("Select an Episode before uploading.");
      return;
    }

    const selectedConcept = selectedThumbnailConceptId
      ? episodePackage.thumbnail.concepts.find((concept) => concept.id === selectedThumbnailConceptId) ?? null
      : null;

    let effectiveConcept = selectedConcept;
    let workingEpisodePackage = episodePackage;
    if (!effectiveConcept) {
      effectiveConcept = {
        id: createThumbnailClientId("thumb-concept-upload"),
        label: "Uploaded",
        prompt_text: "Uploaded image",
        style_preset: DEFAULT_HEARTH_VISUAL_STYLE,
        title_style: DEFAULT_TITLE_STYLE,
        brand_template_id: defaultThumbnailBrandTemplateId,
      };
      workingEpisodePackage = {
        ...episodePackage,
        thumbnail: {
          ...episodePackage.thumbnail,
          concepts: [...episodePackage.thumbnail.concepts, effectiveConcept],
        },
      };
    }

    setIsThumbnailUploading(true);
    setThumbnailUploadError(null);
    setThumbnailGenerateError(null);
    try {
      const uploaded = await uploadThumbnailImageVersion({
        workpieceId: episodeId,
        concept: effectiveConcept,
        file,
      });
      if (!uploaded.ok) {
        setThumbnailUploadError(uploaded.error);
        return;
      }

      const nextEpisodePackage: EpisodePackageV2 = {
        ...workingEpisodePackage,
        thumbnail: {
          ...workingEpisodePackage.thumbnail,
          versions: [...workingEpisodePackage.thumbnail.versions, uploaded.version],
          primary_version_id: uploaded.version.id,
        },
      };

      const saved = await persistThumbnailEpisodePackage(
        nextEpisodePackage,
        "hearth.thumbnail.upload.version.saved.v1",
        { version_id: uploaded.version.id, concept_id: uploaded.version.concept_id },
      );
      if (!saved) return;
      setSelectedThumbnailConceptId(uploaded.version.concept_id);
      setSelectedThumbnailVersionId(uploaded.version.id);
    } finally {
      setIsThumbnailUploading(false);
    }
  }

  function resolveImageMapEntriesForExport(): EpisodeImageMapEntry[] {
    if (!episodePackage) return [];
    if (!selectedImageMapEntryId) return episodePackage.image_map.entries;
    const selected = episodePackage.image_map.entries.find((entry) => entry.id === selectedImageMapEntryId);
    if (!selected) return episodePackage.image_map.entries;
    if (imageMapSaveState !== "editing" && imageMapSaveState !== "saving") {
      return episodePackage.image_map.entries;
    }

    const nextAnchor = imageMapAnchorDraft.trim();
    if (!nextAnchor) return episodePackage.image_map.entries;
    return episodePackage.image_map.entries.map((entry) => {
      if (entry.id !== selectedImageMapEntryId) return entry;
      return {
        ...entry,
        anchor: nextAnchor,
        description: imageMapDescriptionDraft,
        visual_intent: imageMapDescriptionDraft,
        prompt_basis: imageMapDescriptionDraft,
        style_preset: normalizeHearthVisualStyle(imageMapStyleDraft),
        intent: imageMapIntentDraft.trim().toLowerCase(),
        source_type: imageMapSourceTypeDraft.trim().toLowerCase(),
        anchor_scope: imageMapAnchorScopeDraft,
        visual_priority: imageMapVisualPriorityDraft,
        visual_type: imageMapVisualTypeDraft,
        section_intent_note: imageMapSectionIntentNoteDraft.trim() || null,
        placement_hint: imageMapPlacementHintDraft.trim() || null,
      };
    });
  }

  async function readCanonicalScriptForImageMapGeneration(): Promise<{
    ok: true;
    text: string;
    source: "primary_script" | "saved_draft";
    includesUnsavedLocalEdits: boolean;
  } | {
    ok: false;
    message: string;
  }> {
    const episodeId = workpieceId?.trim() ?? "";
    if (!episodeId) {
      return { ok: false, message: "Select an Episode before generating visuals." };
    }

    const primaryScript = await readHearthPrimaryScript(episodeId);
    const canonicalDrafts = dedupeDraftListById(await store.listWorkpieceDrafts(episodeId));
    const preferredDraft = activeDraft?.id
      ? canonicalDrafts.find((draft) => draft.id === activeDraft.id) ?? null
      : null;
    const latestDraft = preferredDraft ?? canonicalDrafts
      .slice()
      .sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0))[0]
      ?? null;
    const canonicalChoice = chooseCanonicalImageMapScriptSource({
      primaryText: primaryScript.ok ? primaryScript.data.text : null,
      primaryUpdatedAtMs: primaryScript.ok ? (parseIsoTimestamp(primaryScript.data.updatedAt) ?? 0) : null,
      drafts: canonicalDrafts,
      preferredDraftId: activeDraft?.id ?? null,
    });

    if (canonicalChoice) {
      return {
        ok: true,
        text: canonicalChoice.text,
        source: canonicalChoice.source,
        includesUnsavedLocalEdits: Boolean(
          activeDraft?.body
          && activeDraft.body.trim()
          && activeDraft.body !== canonicalChoice.text
        ),
      };
    }

    if (!latestDraft?.body.trim()) {
      return { ok: false, message: "No canonical script found for this workpiece yet." };
    }

    return {
      ok: true,
      text: latestDraft.body,
      source: "saved_draft",
      includesUnsavedLocalEdits: Boolean(
        activeDraft?.body && activeDraft.body.trim() && activeDraft.body !== latestDraft.body,
      ),
    };
  }

  function onStartImageMapReanchor() {
    if (imageMapReanchorDisabledReason) {
      setImageMapReanchorError(imageMapReanchorDisabledReason);
      return;
    }
    setMode("focus");
    setShowManualDraft(false);
    setShowScriptPanel(true);
    setImageMapReanchorError(null);
    setImageMapCandidateError(null);
    setIsImageMapReanchorMode(true);
  }

  function onToggleVisualScriptMode() {
    if (!hasApprovedScript || !approvedScriptVersion) return;
    setIsVisualScriptMode((prev) => {
      const next = !prev;
      if (next) {
        setMode("focus");
        setShowManualDraft(false);
        setShowScriptPanel(true);
      }
      return next;
    });
  }

  function onCancelImageMapReanchor() {
    if (isImageMapReanchorSaving) return;
    setIsImageMapReanchorMode(false);
    setImageMapReanchorError(null);
  }

  async function onRepairImageMapNearestParagraph() {
    if (!episodePackage || !selectedImageMapEntry) return;
    if (canonicalImageMapScriptState.status !== "ready" || !canonicalImageMapScriptState.text) {
      setImageMapReanchorError("Current canonical script is not ready to repair anchors.");
      return;
    }
    const selection = resolveNearestParagraphSelection(
      canonicalImageMapScriptState.text,
      selectedImageMapEntry.script_anchor,
    );
    if (!selection) {
      setImageMapReanchorError("No deterministic nearest paragraph repair target is available.");
      return;
    }
    await onPickImageMapReanchor(selection);
  }

  async function onConvertImageMapToGlobalVisual() {
    if (!episodePackage || !selectedImageMapEntry) return;
    setImageMapSaveState("saving");
    setImageMapSaveError(null);
    setImageMapReanchorError(null);
    const saved = await persistImageMapEntries({
      entries: episodePackage.image_map.entries.map((entry) => (
        entry.id === selectedImageMapEntry.id
          ? {
              ...entry,
              anchor_scope: "global",
              script_anchor: null,
              status: "draft",
            }
          : entry
      )),
    });
    if (!saved.ok) {
      setImageMapSaveState("error");
      setImageMapSaveError(saved.error);
      return;
    }
    setImageMapSaveState("saved");
    setImageMapExportMessage("Visual anchor converted to global intent.");
  }

  async function onLeaveImageMapOrphaned() {
    if (!episodePackage || !selectedImageMapEntry) return;
    setImageMapSaveState("saving");
    setImageMapSaveError(null);
    setImageMapReanchorError(null);
    const saved = await persistImageMapEntries({
      entries: episodePackage.image_map.entries.map((entry) => (
        entry.id === selectedImageMapEntry.id
          ? {
              ...entry,
              anchor_scope: "orphaned",
              script_anchor: null,
              status: "draft",
            }
          : entry
      )),
    });
    if (!saved.ok) {
      setImageMapSaveState("error");
      setImageMapSaveError(saved.error);
      return;
    }
    setImageMapSaveState("saved");
    setImageMapExportMessage("Visual anchor left orphaned for manual review.");
  }

  async function onPickImageMapReanchor(selection: {
    paragraphId: string;
    sentenceStart: number;
    sentenceEnd: number;
  }) {
    if (!episodePackage || !selectedImageMapEntry) return;
    if (imageMapReanchorDisabledReason) {
      setImageMapReanchorError(imageMapReanchorDisabledReason);
      return;
    }
    if (canonicalImageMapScriptState.status !== "ready" || !canonicalImageMapScriptState.text) {
      setImageMapReanchorError("Current canonical script is not ready to re-anchor yet.");
      return;
    }

    const nextAnchor = buildExactScriptAnchorFromSelection(canonicalImageMapScriptState.text, selection);
    if (!nextAnchor) {
      setImageMapReanchorError("Unable to build an exact anchor from that script selection.");
      return;
    }

    const nextEntry = reanchorImageMapEntry(selectedImageMapEntry, canonicalImageMapScriptState.text, selection);
    if (!nextEntry) {
      setImageMapReanchorError("Unable to re-anchor this visual beat.");
      return;
    }

    setIsImageMapReanchorSaving(true);
    setImageMapSaveState("saving");
    setImageMapSaveError(null);
    setImageMapReanchorError(null);
    try {
      const saved = await persistImageMapEntries({
        entries: episodePackage.image_map.entries.map((entry) => (
          entry.id === selectedImageMapEntry.id
            ? {
                ...nextEntry,
                anchor_scope: "attached",
                script_anchor: nextAnchor,
              }
            : entry
        )),
      });

      if (!saved.ok) {
        setImageMapSaveState("error");
        setImageMapSaveError(saved.error);
        setImageMapReanchorError(saved.error);
        return;
      }

      setImageMapSaveState("saved");
      setImageMapCandidateError(null);
      setImageMapCandidateSelectionError(null);
      setImageMapExportMessage("Visual beat re-anchored to the current canonical script.");
      setIsImageMapReanchorMode(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to re-anchor this visual beat.";
      setImageMapSaveState("error");
      setImageMapSaveError(message);
      setImageMapReanchorError(message);
    } finally {
      setIsImageMapReanchorSaving(false);
    }
  }

  async function onGenerateImageMapCandidates(mode: "ai" | "stock" = "ai") {
    if (isAiProcessing || isApprovingScript || isImageMapCandidateGenerating) return;
    if (!episodePackage || !selectedImageMapEntry) return;

    const episodeId = workpieceId?.trim() ?? "";
    const workspace = workspaceId?.trim() ?? "";
    if (!episodeId || !workspace) {
      setImageMapCandidateError("Select an Episode before generating still candidates.");
      return;
    }
    if (imageMapSaveState === "editing" || imageMapSaveState === "saving") {
      setImageMapCandidateError("Save the image-map entry before generating candidates.");
      return;
    }
    if (aiBillingMode === "forge" && aiTokenBalance != null && aiTokenBalance <= 0) {
      setImageMapCandidateError("No AI credits remaining.");
      return;
    }

    let expectedMetadataUpdatedAt = imageMapMetadataUpdatedAt;

    const canonicalScript = await readCanonicalScriptForImageMapGeneration();
    if (!canonicalScript.ok) {
      setImageMapCandidateError(canonicalScript.message);
      return;
    }

    const exactAnchorAssessment = assessImageMapScriptAnchor(canonicalScript.text, selectedImageMapEntry.script_anchor);
    const effectiveScriptAnchor = exactAnchorAssessment.exactAnchor;
    if (!effectiveScriptAnchor) {
      setMode("focus");
      setShowManualDraft(false);
      setShowScriptPanel(true);
      setIsImageMapReanchorMode(true);
      setImageMapCandidateError("This visual beat needs an exact script anchor before candidate generation. Use Re-anchor to bind it to the current canonical script.");
      return;
    }

    const context = resolveImageMapAnchorContext(canonicalScript.text, effectiveScriptAnchor);

    const alwaysApproveSpend = resolveAiThumbnailAutoApproveFromStorage();
    const confirmed = alwaysApproveSpend
      ? true
      : window.confirm(
          mode === "stock"
            ? "Find stock-style still candidates for this visual beat? This will spend AI credits."
            : "Generate two still candidates for this visual beat? This will spend AI credits.",
        );
    if (!confirmed) return;

    const requestedSourceType = mode === "stock" ? "stock" : "ai";
    if (selectedImageMapEntry.source_type !== requestedSourceType) {
      const updatedEntries = episodePackage.image_map.entries.map((entry) => (
        entry.id === selectedImageMapEntry.id
          ? {
              ...entry,
              source_type: requestedSourceType,
              origin: "hearth" as const,
            }
          : entry
      ));
      const sourceSaved = await persistImageMapEntries({ entries: updatedEntries });
      if (!sourceSaved.ok) {
        setImageMapCandidateError(sourceSaved.error);
        return;
      }
      expectedMetadataUpdatedAt = sourceSaved.metadataUpdatedAt;
      setImageMapSourceTypeDraft(requestedSourceType);
    }

    setIsImageMapCandidateGenerating(true);
    setImageMapCandidateError(null);
    setImageMapCandidateSelectionError(null);
    setAiRuntimeWarning(null);
    try {
      const requestCandidateGeneration = (metadataUpdatedAt: string | null | undefined) => (
        generateWorkpieceImageMapCandidates({
          workpieceId: episodeId,
          workspaceId: workspace,
          imageMapEntryId: selectedImageMapEntry.id,
          expectedMetadataUpdatedAt: metadataUpdatedAt,
          contextBefore: context.before,
          contextAfter: context.after,
          aspect: thumbnailAspect,
          confirmSpend: confirmed,
          alwaysApproveAiSpend: alwaysApproveSpend,
        })
      );

      let generated = await requestCandidateGeneration(expectedMetadataUpdatedAt);

      // Resolve one stale-write race automatically by retrying against the latest
      // metadata stamp after we refresh the canonical image map snapshot.
      if (!generated.ok && generated.reason === "conflict" && generated.latest) {
        if (episodePackage) {
          setEpisodePackage(replaceEpisodePackageImageMap(episodePackage, generated.latest.entries));
        }
        setImageMapMetadataUpdatedAt(generated.latest.metadataUpdatedAt);
        generated = await requestCandidateGeneration(generated.latest.metadataUpdatedAt);
      }

      if (!generated.ok) {
        const failureMessage = generated.error
          ?? (generated.reason === "conflict"
            ? "Image map changed since last load. Reloaded the latest canonical state."
            : "Still-candidate generation failed.");
        if (generated.reason === "conflict" && generated.latest && episodePackage) {
          setEpisodePackage(replaceEpisodePackageImageMap(episodePackage, generated.latest.entries));
          setImageMapMetadataUpdatedAt(generated.latest.metadataUpdatedAt);
        }
        setImageMapCandidateError(failureMessage);
        publishForgeNotice({
          job: "job-failed",
          title: "Timeline image generation failed",
          message: failureMessage,
          severity: generated.reason === "conflict" ? "warning" : "error",
        });
        return;
      }

      if (episodePackage) {
        setEpisodePackage(replaceEpisodePackageImageMap(episodePackage, generated.imageMap.entries));
      }
      setImageMapMetadataUpdatedAt(generated.imageMap.metadataUpdatedAt);
      setImageMapCandidateSelectionError(null);
      setImageMapExportMessage(
        mode === "stock"
          ? `Found ${generated.generatedAssets.length} stock-style still candidates for the selected visual beat.`
          : `Generated ${generated.generatedAssets.length} still candidates for the selected visual beat.`,
      );
      if (typeof generated.tokenBalance === "number") {
        setAiTokenBalance(generated.tokenBalance);
      }
      if (generated.creditsWarning) {
        setAiRuntimeWarning(generated.creditsWarning);
      }
      publishForgeNotice({
        job: "image-generated",
        title: mode === "stock" ? "Stock candidates ready" : "Timeline images ready",
        message: `${mode === "stock" ? "Found" : "Generated"} ${generated.generatedAssets.length} still candidate${generated.generatedAssets.length === 1 ? "" : "s"} for the selected visual beat.`,
        severity: "success",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Still-candidate generation failed.";
      setImageMapCandidateError(message);
      publishForgeNotice({
        job: "job-failed",
        title: "Timeline image generation failed",
        message,
        severity: "error",
      });
    } finally {
      setIsImageMapCandidateGenerating(false);
    }
  }

  async function onSelectImageMapCandidate(candidateAssetId: string) {
    if (!episodePackage || !selectedImageMapEntry) return;
    if (imageMapSaveState === "editing" || imageMapSaveState === "saving") {
      setImageMapCandidateSelectionError("Save or finish editing this visual beat before selecting a still candidate.");
      return;
    }

    const workspace = workspaceId?.trim() ?? "";
    const episodeId = workpieceId?.trim() ?? "";
    if (!workspace || !episodeId) {
      setImageMapCandidateSelectionError("Workspace or workpiece is missing.");
      return;
    }

    if (selectedImageMapEntry.selected_asset_id === candidateAssetId) {
      setImageMapCandidateSelectionError(null);
      return;
    }

    setIsImageMapCandidateSelecting(true);
    setImageMapCandidateSelectionError(null);
    try {
      const selected = await selectWorkpieceImageMapCandidate({
        workpieceId: episodeId,
        workspaceId: workspace,
        imageMapEntryId: selectedImageMapEntry.id,
        candidateAssetId,
        expectedMetadataUpdatedAt: imageMapMetadataUpdatedAt,
        currentImageMap: {
          workpieceId: episodeId,
          workspaceId: workspace,
          entries: episodePackage.image_map.entries,
          metadataUpdatedAt: imageMapMetadataUpdatedAt,
          asset: null,
        },
      });

      if (!selected.ok) {
        const latest = selected.reason === "conflict" ? selected.latest ?? null : null;
        if (latest) {
          setEpisodePackage((prev) => (
            prev ? replaceEpisodePackageImageMap(prev, latest.entries) : prev
          ));
          setImageMapMetadataUpdatedAt(latest.metadataUpdatedAt);
        }
        setImageMapCandidateSelectionError(
          selected.error
            ?? (selected.reason === "candidate_not_attached"
              ? "That still candidate is no longer attached to this visual beat."
              : selected.reason === "entry_not_found"
                ? "This visual beat no longer exists in the canonical image map."
                : selected.reason === "conflict"
                  ? "Image map changed since last load. Reloaded the latest canonical state."
                  : "Unable to save the selected still candidate.")
        );
        return;
      }

      setEpisodePackage((prev) => (
        prev ? replaceEpisodePackageImageMap(prev, selected.imageMap.entries) : prev
      ));
      setImageMapMetadataUpdatedAt(selected.imageMap.metadataUpdatedAt);
      setImageMapCandidateSelectionError(null);
      setImageMapExportMessage("Selected still candidate saved canonically for this visual beat.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save the selected still candidate.";
      setImageMapCandidateSelectionError(message);
    } finally {
      setIsImageMapCandidateSelecting(false);
    }
  }

  async function onUploadImageMapAsset(file: File) {
    if (!episodePackage || !selectedImageMapEntry) return;
    if (imageMapSaveState === "editing" || imageMapSaveState === "saving") {
      setImageMapCandidateSelectionError("Save or finish editing this visual beat before uploading an asset.");
      return;
    }
    const workspace = workspaceId?.trim() ?? "";
    const episodeId = workpieceId?.trim() ?? "";
    if (!workspace || !episodeId) {
      setImageMapCandidateSelectionError("Workspace or workpiece is missing.");
      return;
    }

    setIsImageMapCandidateSelecting(true);
    setImageMapCandidateSelectionError(null);
    setImageMapCandidateError(null);
    try {
      const uploaded = await uploadWorkpieceImageMapCandidateAsset({
        workpieceId: episodeId,
        entryId: selectedImageMapEntry.id,
        file,
        source: "upload",
      });
      if (!uploaded.ok) {
        setImageMapCandidateSelectionError(uploaded.error);
        return;
      }

      const updatedEntries = episodePackage.image_map.entries.map((entry) => {
        if (entry.id !== selectedImageMapEntry.id) return entry;
        const existing = entry.candidate_assets.filter((asset) => asset.asset_id !== uploaded.candidateAsset.asset_id);
        const nextOrigin: "hearth" | "mixed" = entry.origin === "hammer" ? "mixed" : "hearth";
        return {
          ...entry,
          source_type: "upload",
          origin: nextOrigin,
          candidate_assets: [...existing, uploaded.candidateAsset],
          selected_asset_id: uploaded.candidateAsset.asset_id,
          status: "selected" as const,
        };
      });

      const saved = await persistImageMapEntries({ entries: updatedEntries });
      if (!saved.ok) {
        setImageMapCandidateSelectionError(saved.error);
        return;
      }
      setImageMapSourceTypeDraft("upload");
      setImageMapExportMessage("Uploaded visual asset attached and selected for this beat.");
      publishForgeNotice({
        job: "image-generated",
        title: "Visual asset uploaded",
        message: "Uploaded asset is now selected for this visual beat.",
        severity: "success",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to upload this visual asset.";
      setImageMapCandidateSelectionError(message);
    } finally {
      setIsImageMapCandidateSelecting(false);
    }
  }

  async function onCreateImageMapEntry() {
    if (!episodePackage) return;
    const nextAnchor = `manual:p${episodePackage.image_map.entries.length + 1}`;
    const nextEpisodePackage = addImageMapEntry(episodePackage, {
      anchor: nextAnchor,
      purpose: "coverage",
      description: "",
      visual_intent: "",
      prompt_basis: "",
      anchor_scope: "orphaned",
      style_preset: DEFAULT_HEARTH_VISUAL_STYLE,
      intent: "cutaway",
      source_type: "stock",
      visual_priority: "supporting",
      visual_type: "still_image",
      section_intent_note: null,
      beat_order: episodePackage.image_map.entries.length + 1,
      paragraph_beat_order: 1,
      candidate_assets: [],
      selected_asset_id: null,
      status: "draft",
      placement_hint: null,
    });
    const newEntry = nextEpisodePackage.image_map.entries[nextEpisodePackage.image_map.entries.length - 1] ?? null;
    if (!newEntry) {
      setImageMapSaveState("error");
      setImageMapSaveError("Unable to create entry in current episode.");
      return;
    }

    setImageMapSaveState("saving");
    setImageMapSaveError(null);
    const saved = await persistImageMapEntries({
      entries: nextEpisodePackage.image_map.entries,
    });
    if (!saved.ok) {
      setImageMapSaveState("error");
      setImageMapSaveError(saved.error);
      return;
    }
    setSelectedImageMapEntryId(newEntry.id);
    setImageMapSaveState("saved");
  }

  async function onDuplicateImageMapEntry() {
    if (!episodePackage || !selectedImageMapEntry) return;
    const nextEpisodePackage = addImageMapEntry(episodePackage, {
      anchor: selectedImageMapEntry.anchor,
      script_anchor: selectedImageMapEntry.script_anchor,
      anchor_scope: selectedImageMapEntry.anchor_scope ?? (selectedImageMapEntry.script_anchor ? "attached" : "orphaned"),
      purpose: selectedImageMapEntry.purpose,
      description: selectedImageMapEntry.description,
      visual_intent: selectedImageMapEntry.visual_intent,
      prompt_basis: selectedImageMapEntry.prompt_basis,
      style_preset: normalizeHearthVisualStyle(selectedImageMapEntry.style_preset),
      intent: selectedImageMapEntry.intent,
      source_type: selectedImageMapEntry.source_type,
      visual_priority: selectedImageMapEntry.visual_priority ?? "supporting",
      visual_type: selectedImageMapEntry.visual_type ?? "still_image",
      section_intent_note: selectedImageMapEntry.section_intent_note ?? null,
      beat_order: selectedImageMapEntry.beat_order,
      paragraph_beat_order: selectedImageMapEntry.paragraph_beat_order,
      candidate_assets: [],
      selected_asset_id: null,
      status: selectedImageMapEntry.script_anchor ? "mapped" : "draft",
      placement_hint: selectedImageMapEntry.placement_hint ?? null,
    });
    const duplicated = nextEpisodePackage.image_map.entries[nextEpisodePackage.image_map.entries.length - 1] ?? null;
    if (!duplicated) {
      setImageMapSaveState("error");
      setImageMapSaveError("Unable to duplicate entry.");
      return;
    }

    setImageMapSaveState("saving");
    setImageMapSaveError(null);
    const saved = await persistImageMapEntries({
      entries: nextEpisodePackage.image_map.entries,
    });
    if (!saved.ok) {
      setImageMapSaveState("error");
      setImageMapSaveError(saved.error);
      return;
    }
    setSelectedImageMapEntryId(duplicated.id);
    setImageMapSaveState("saved");
  }

  async function onDeleteImageMapEntry() {
    if (!episodePackage || !selectedImageMapEntryId) return;
    const confirmed = window.confirm("Delete this image map entry?");
    if (!confirmed) return;

    const nextEpisodePackage = removeImageMapEntry(episodePackage, selectedImageMapEntryId);
    setImageMapSaveState("saving");
    setImageMapSaveError(null);
    const saved = await persistImageMapEntries({
      entries: nextEpisodePackage.image_map.entries,
    });
    if (!saved.ok) {
      setImageMapSaveState("error");
      setImageMapSaveError(saved.error);
      return;
    }
    setSelectedImageMapEntryId(saved.episodePackage.image_map.entries[0]?.id ?? null);
    setImageMapSaveState("saved");
  }

  async function onSeedImageMapFromScript() {
    if (!episodePackage) return;
    if (episodePackage.image_map.entries.length > 0) {
      const confirmed = window.confirm(
        "Generate a new image map from the canonical script? This replaces the current visual beats.",
      );
      if (!confirmed) return;
    }
    const canonicalScript = await readCanonicalScriptForImageMapGeneration();
    if (!canonicalScript.ok) {
      setImageMapExportMessage(canonicalScript.message);
      return;
    }

    const generatedEntries = generateImageMapEntriesFromScript(canonicalScript.text);
    if (generatedEntries.length === 0) {
      setImageMapExportMessage("No visually meaningful beats found in the canonical script.");
      return;
    }

    setImageMapSaveState("saving");
    setImageMapSaveError(null);
    const saved = await persistImageMapEntries({
      entries: generatedEntries,
    });
    if (!saved.ok) {
      setImageMapSaveState("error");
      setImageMapSaveError(saved.error);
      return;
    }
    setSelectedImageMapEntryId(saved.episodePackage.image_map.entries[0]?.id ?? null);
    setImageMapSaveState("saved");
    const sourceLabel = canonicalScript.source === "primary_script" ? "published script" : "saved draft";
    const note = canonicalScript.includesUnsavedLocalEdits ? " Save the draft first to include unsaved local edits." : "";
    setImageMapExportMessage(`Generated ${generatedEntries.length} visual beats from the canonical ${sourceLabel}.${note}`);
  }

  async function onCopyImageMapExportJson() {
    const entries = resolveImageMapEntriesForExport();
    const payload = buildVisualScriptIntentExportDocument(workpieceId?.trim() ?? null, entries);
    const text = JSON.stringify(payload, null, 2);
    const copied = await writeTextToClipboard(text);
    setImageMapExportMessage(copied ? "Visual script intent JSON copied." : "Clipboard write failed.");
  }

  function onDownloadImageMapExportJson() {
    const entries = resolveImageMapEntriesForExport();
    const payload = buildVisualScriptIntentExportDocument(workpieceId?.trim() ?? null, entries);
    const text = JSON.stringify(payload, null, 2);
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const suffix = (workpieceId?.slice(0, 8) ?? "episode").toLowerCase();
    anchor.href = url;
    anchor.download = `visual-script-intent-${suffix}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setImageMapExportMessage("Visual script intent JSON downloaded.");
  }

  function markMetadataEditing(): void {
    if (metadataSaveState !== "editing") {
      setMetadataSaveState("editing");
    }
    setMetadataSaveError(null);
  }

  function onMetadataTitleChange(titleId: string, nextText: string): void {
    setMetadataTitlesDraft((prev) => prev.map((title) => (
      title.id === titleId
        ? {
          ...title,
          text: nextText,
          thumbnail_text: deriveHearthThumbnailOverlayText(nextText),
        }
        : title
    )));
    markMetadataEditing();
  }

  function onMetadataSetPrimaryTitle(titleId: string): void {
    setMetadataTitlesDraft((prev) => prev.map((title) => ({
      ...title,
      is_primary: title.id === titleId,
    })));
    markMetadataEditing();
  }

  function onMetadataAddTagFromInput(): void {
    const parsed = parseMetadataTagInput(metadataTagInputDraft);
    if (parsed.length === 0) return;
    setMetadataTagsDraft((prev) => normalizeSeoTags([...prev, ...parsed]));
    setMetadataTagInputDraft("");
    markMetadataEditing();
  }

  function onMetadataRemoveTag(tag: string): void {
    setMetadataTagsDraft((prev) => prev.filter((entry) => entry !== tag));
    markMetadataEditing();
  }

  function onMetadataAddTagSuggestion(tag: string): void {
    const normalized = normalizeMetadataTag(tag);
    if (!normalized) return;
    setMetadataTagsDraft((prev) => normalizeSeoTags([...prev, normalized]));
    markMetadataEditing();
  }

  function onMetadataDescriptionShortChange(nextValue: string): void {
    setMetadataDescriptionShortDraft(nextValue);
    markMetadataEditing();
  }

  function onMetadataDescriptionLongChange(nextValue: string): void {
    setMetadataDescriptionLongDraft(nextValue);
    markMetadataEditing();
  }

  function onMetadataPreviewModeChange(mode: "youtube" | "rss" | "plain"): void {
    setMetadataPreviewMode(mode);
  }

  function onSelectImageMapEntry(entryId: string) {
    if (entryId !== selectedImageMapEntryId) {
      setIsImageMapReanchorMode(false);
      setIsImageMapReanchorSaving(false);
      setImageMapReanchorError(null);
    }
    setSelectedImageMapEntryId(entryId);
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
    const thumbnailPanelProps = {
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
      promptOverride: thumbnailPromptOverride,
      aspect: thumbnailAspect,
      safeZoneEnabled: thumbnailSafeZoneEnabled,
      previewDataUrl: thumbnailPreviewDataUrl,
      previewState: thumbnailPreviewState,
      previewError: thumbnailPreviewError,
      generateError: thumbnailGenerateError,
      uploadError: thumbnailUploadError,
      pairingError: thumbnailPairingError,
      canGenerateConcepts: !aiCreditsDepleted,
      isGeneratingConcepts: activeProductionAction === "thumbnails" && isAiProcessing,
      isGenerating: isThumbnailGenerating,
      isSavingConcept: isThumbnailConceptSaving,
      isUploading: isThumbnailUploading,
      onSelectTitle: onSelectThumbnailTitle,
      onSelectConcept: setSelectedThumbnailConceptId,
      onSelectedConceptLabelChange: setThumbnailConceptLabelDraft,
      onSelectedConceptPromptChange: setThumbnailConceptPromptDraft,
      onSelectedConceptStylePresetChange: (value: string) => setThumbnailConceptStyleDraft(normalizeHearthVisualStyle(value)),
      onSelectedConceptTitleFontPresetChange: (value: string) => setThumbnailTitleStyleDraft((prev) => ({
        ...normalizeEpisodeThumbnailTitleStyle(prev),
        font_preset: value as TitleFontPreset,
      })),
      onSelectedConceptTitleColorChange: (value: string) => setThumbnailTitleStyleDraft((prev) => ({
        ...normalizeEpisodeThumbnailTitleStyle(prev),
        text_color: value.toUpperCase(),
      })),
      onSelectedConceptTitleShadowEnabledChange: (value: boolean) => setThumbnailTitleStyleDraft((prev) => ({
        ...normalizeEpisodeThumbnailTitleStyle(prev),
        shadow: {
          ...normalizeEpisodeThumbnailTitleStyle(prev).shadow,
          enabled: value,
        },
      })),
      onSelectedConceptTitleShadowStrengthChange: (value: string) => setThumbnailTitleStyleDraft((prev) => ({
        ...normalizeEpisodeThumbnailTitleStyle(prev),
        shadow: {
          ...normalizeEpisodeThumbnailTitleStyle(prev).shadow,
          strength: value as TitleShadowStrength,
        },
      })),
      onSelectedConceptBrandTemplateChange: setThumbnailConceptBrandTemplateIdDraft,
      onUploadBrandLogo: (file: File) => void onUploadThumbnailBrandLogo(file),
      onRemoveBrandLogo: () => void onRemoveThumbnailBrandLogo(),
      onGenerateConcepts: () => void onRunProductionAction("thumbnails"),
      onCreateConcept: () => void onCreateThumbnailConcept(),
      onSaveConcept: () => void onSaveSelectedThumbnailConcept(),
      onDeleteConcept: () => void onDeleteSelectedThumbnailConcept(),
      onPromptOverrideChange: setThumbnailPromptOverride,
      onAspectChange: setThumbnailAspect,
      onGenerate: () => void onGenerateThumbnailVersion(),
      onRegenerate: () => void onGenerateThumbnailVersion({ forceConceptId: selectedThumbnailConceptId || null }),
      onToggleSafeZone: () => setThumbnailSafeZoneEnabled((prev) => !prev),
      onUploadImage: (file: File) => void onUploadThumbnailImage(file),
      onSelectVersion: onSelectThumbnailVersion,
      onSetPrimary: (versionId: string) => void onSetPrimaryThumbnailVersion(versionId),
      onRetryVersion: (version: EpisodeThumbnailVersion) => void onRetryFailedThumbnailVersion(version),
      onSelectLaunchVariant,
      onCreateLaunchVariant,
      onSelectedLaunchVariantStatusChange: setLaunchVariantStatusDraft,
      onSelectedLaunchVariantNotesChange: setLaunchVariantNotesDraft,
      onSaveLaunchVariant: () => void onSaveLaunchVariant(),
    };
    const mediaMapPanelProps = {
      entries: mediaMapEntries,
      selectedEntryId: selectedMediaMapEntryId,
      scriptVersionLabel: approvedScriptVersion ? `v${approvedScriptVersion}` : "none",
      mapStatus: mediaMap?.status ?? "draft",
      stale: Boolean(
        mediaMap?.script_version_id
        && approvedScriptVersion
        && mediaMap.script_version_id !== String(approvedScriptVersion)
      ),
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
      onSelectEntry: setSelectedMediaMapEntryId,
      onDraftChange: (field: string, value: unknown) => {
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
      },
      onGenerationScopeChange: (value: string) => setMediaMapGenerationScope(normalizeMediaMapGenerationScope(value)),
      onGenerateFromPlans: () => void onGenerateEpisodeMediaMapFromPlans(),
      onActivateMap: () => void onActivateEpisodeMediaMap(),
      onAddEntry: () => void onAddMediaMapEntry(),
      onSaveEntry: () => void onSaveMediaMapEntry(),
      onDeleteEntry: () => void onDeleteMediaMapEntry(),
    };
    const setImageMapDraftEditing = <T,>(setter: (value: T) => void, value: T) => {
      setter(value);
      if (imageMapSaveState !== "editing") {
        setImageMapSaveState("editing");
      }
      setImageMapSaveError(null);
    };
    const imageMapPanelProps = {
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
      onDraftAnchorChange: (value: string) => setImageMapDraftEditing(setImageMapAnchorDraft, value),
      onDraftDescriptionChange: (value: string) => setImageMapDraftEditing(setImageMapDescriptionDraft, value),
      onDraftStylePresetChange: (value: string) => setImageMapDraftEditing(setImageMapStyleDraft, normalizeHearthVisualStyle(value)),
      onDraftIntentChange: (value: string) => setImageMapDraftEditing(setImageMapIntentDraft, value),
      onDraftSourceTypeChange: (value: string) => setImageMapDraftEditing(setImageMapSourceTypeDraft, value),
      onDraftVisualPriorityChange: (value: string) => setImageMapDraftEditing(setImageMapVisualPriorityDraft, value as EpisodeImageMapVisualPriority),
      onDraftVisualTypeChange: (value: string) => setImageMapDraftEditing(setImageMapVisualTypeDraft, value as EpisodeImageMapVisualType),
      onDraftSectionIntentNoteChange: (value: string) => setImageMapDraftEditing(setImageMapSectionIntentNoteDraft, value),
      onDraftPlacementHintChange: (value: string) => setImageMapDraftEditing(setImageMapPlacementHintDraft, value),
      onCreateEntry: () => void onCreateImageMapEntry(),
      onDuplicateEntry: () => void onDuplicateImageMapEntry(),
      onDeleteEntry: () => void onDeleteImageMapEntry(),
      onSeedFromScript: () => void onSeedImageMapFromScript(),
      onGenerateCandidates: (mode?: "ai" | "stock") => void onGenerateImageMapCandidates(mode ?? "ai"),
      onUploadAsset: (file: File) => void onUploadImageMapAsset(file),
      onSelectCandidate: (candidateId: string) => void onSelectImageMapCandidate(candidateId),
      onCopyExport: () => void onCopyImageMapExportJson(),
      onDownloadExport: () => void onDownloadImageMapExportJson(),
      onStartReanchor: onStartImageMapReanchor,
      onRepairNearestParagraph: () => void onRepairImageMapNearestParagraph(),
      onConvertToGlobalVisual: () => void onConvertImageMapToGlobalVisual(),
      onLeaveOrphaned: () => void onLeaveImageMapOrphaned(),
      onCancelReanchor: onCancelImageMapReanchor,
      onPickReanchor: (selection: ImageMapScriptSelection) => void onPickImageMapReanchor(selection),
    };
    const brollPlanPanelProps = {
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
      onDraftChange: (field: string, value: string) => {
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
      },
      onSaveBeat: () => void onSaveBrollBeat(),
      onDeleteBeat: () => void onDeleteBrollBeat(),
      onRegenerateBeat: () => void onRegenerateBrollBeat(),
      onGeneratePlan: () => void onGenerateBrollPlan(),
      onFindStock: () => void onFindStockForBrollBeat(),
      onUploadAsset: (file: File) => void onUploadBrollBeatAsset(file),
      onSelectCandidate: (candidateId: string) => void onSelectBrollCandidate(candidateId),
      onCopyPrompt: () => void onCopyBrollPrompt(),
      onDownloadBrief: () => void onDownloadBrollBrief("text"),
      onDownloadBriefJson: () => void onDownloadBrollBrief("json"),
      onOpenProvider: () => void onOpenBrollProvider(),
      onMarkSent: () => void onMarkBrollRequestState("sent_external"),
      onMarkAwaitingResult: () => void onMarkBrollRequestState("awaiting_result"),
      onClearRequestState: () => void onClearBrollRequestState(),
      onAttachResultFromUrl: () => void onAttachBrollResultFromUrl(),
    };
    const referenceClipPlanPanelProps = {
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
      selectedCandidateId: selectedReferenceClipEntry?.selected_asset_id ?? null,
      onSelectEntry: setSelectedReferenceClipEntryId,
      onDraftChange: (field: string, value: string) => {
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
      },
      onCreateReferenceClip: () => void onCreateReferenceClipEntry(),
      onSaveEntry: () => void onSaveReferenceClipEntry(),
      onDeleteEntry: () => void onDeleteReferenceClipEntry(),
      onRegenerateStub: () => void onRegenerateReferenceClipEntryStub(),
      onUploadAsset: (file: File) => void onUploadReferenceClipAsset(file),
      onSelectCandidate: (candidateId: string) => void onSelectReferenceClipCandidate(candidateId),
      onCopyPrompt: () => void onCopyReferenceClipPrompt(),
      onDownloadBrief: () => void onDownloadReferenceClipBrief("text"),
      onDownloadBriefJson: () => void onDownloadReferenceClipBrief("json"),
      onOpenProvider: () => void onOpenReferenceClipProvider(),
      onMarkSent: () => void onMarkReferenceClipRequestState("sent_external"),
      onMarkAwaitingResult: () => void onMarkReferenceClipRequestState("awaiting_result"),
      onClearRequestState: () => void onClearReferenceClipRequestState(),
      onAttachResultFromUrl: () => void onAttachReferenceClipResultFromUrl(),
    };
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
              <button type="button" onClick={() => void onCopyConflictLocalText()}>
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
                aiCreditsDepleted={aiCreditsDepleted}
                isAiProcessing={isAiProcessing}
                activeProductionAction={activeProductionAction}
                releasePrepScriptVersion={releasePrepScriptVersion}
                latestReleasePrepRawText={latestReleasePrepRawText}
                releasePrepLoadState={releasePrepLoadState}
                latestReleasePrepSections={latestReleasePrepSections}
                onGenerateSeo={() => void onRunProductionAction("seo")}
                onGenerateTags={() => void onRunProductionAction("tags")}
                onGenerateReleasePrepPack={() => void onRunProductionAction("release_prep_pack")}
                onOpenVisualsTab={() => requestWorkpieceTabChange("visuals")}
                onRefreshReleasePrepPack={() => void loadLatestReleasePrepPack(approvedScriptVersion)}
                hasMetadataComplete={metadataComplete}
                hasThumbnailsSelected={thumbnailsSelected}
                mediaMapStatus={mediaMap?.status ?? null}
                releaseReadinessCompleteCount={releaseReadiness.completeCount}
                releaseReadinessTotalCount={releaseReadiness.totalCount}
              />
            ) : null}

            <VisualsSurface
              visible={isVisualsWorkspaceTab}
              hasApprovedScript={hasApprovedScript}
              approvedScriptVersion={approvedScriptVersion}
              mediaMapStatus={mediaMap?.status ?? null}
              mediaMapCoverageLevel={mediaMapCoverageLevel}
              mediaMapScopeLabel={mediaMapScopeLabel}
              thumbnailPanelMeta={thumbnailPanelMeta}
              mediaMapPanelMeta={mediaMapPanelMeta}
              imageMapPanelMeta={imageMapPanelMeta}
              brollPanelMeta={brollPanelMeta}
              referenceClipPanelMeta={referenceClipPanelMeta}
              thumbnailPanelProps={thumbnailPanelProps}
              mediaMapPanelProps={mediaMapPanelProps}
              imageMapPanelProps={imageMapPanelProps}
              brollPlanPanelProps={brollPlanPanelProps}
              referenceClipPlanPanelProps={referenceClipPlanPanelProps}
            />
            <MetadataSurface
              visible={isMetadataWorkspaceTab}
              hasApprovedScript={hasApprovedScript}
              approvedScriptVersion={approvedScriptVersion}
              metadataPanelMeta={metadataPanelMeta}
              metadataPanelProps={metadataPanelProps}
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
            bodyRef={bodyRef}
            copyIcon={<CopyIcon />}
            onCopyScriptPanelText={() => void onCopyScriptPanelText()}
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


