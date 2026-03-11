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
  readBarStockSparks,
  resolveBarStockSparkHearthWorkpieceId,
  resolveBarstockSparkIdFromQuery,
  upsertBarStockSpark,
  writeBarStockSparks,
} from "../lib/barstock-sparks";
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
  listHearthWorkpieces,
  type HearthWorkpieceSummary,
} from "../lib/hearth-workpieces";
import {
  selectActiveWorkpieceContext,
  selectDraftForWorkpiece,
  selectWorkpieceNavItems,
} from "../lib/hearth-nav-model";
import { mirrorApprovedScriptToLocal, type MirrorApprovedScriptResult } from "../lib/hearth-script-mirror";
import {
  HEARTH_CONTENT_CATEGORIES,
  listHearthReadyScripts,
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
  formatScriptToAnvilTagsNoAi,
  validateAnvilTagContract,
  type AnvilTagValidation,
} from "../lib/anvil-tag-contract";
import { commitWorkpieceProductionArtifact, type ProductionArtifactKind } from "../lib/hearth-production-repo";
import {
  generateEpisodeThumbnail,
  loadThumbnailPreviewDataUrl,
  readEpisodePackageForWorkpiece,
  saveEpisodePackageForWorkpiece,
  uploadThumbnailImageVersion,
} from "../lib/hearth-thumbnail-api";
import {
  getWorkpieceImageMap,
  saveWorkpieceImageMap,
} from "../lib/hearth-image-map-repo";
import type {
  EpisodePackageV2,
  EpisodeThumbnailConcept,
  EpisodeThumbnailVersion,
  EpisodeImageMapEntry,
  EpisodeSeoTitle,
} from "../lib/episode-package-v2";
import {
  addImageMapEntry,
  ensureSeoV2,
  normalizeSeoTags,
  removeImageMapEntry,
  updateImageMapEntry,
} from "../lib/episode-package-v2";
import ThumbnailPanel from "../components/visuals/ThumbnailPanel";
import ImageMapPanel from "../components/visuals/ImageMapPanel";
import MetadataPanel from "../components/metadata/MetadataPanel";
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
type FocusTab = "draft" | "planning" | "sources" | "revisions";
type ProductionAction = "seo" | "tags" | "thumbnails" | "image_beat_sheet";
type SttLane = "browser" | "ai";
type SttState = "idle" | "listening" | "transcribing";
type AiAutosaveReasonCode = "ai_outline" | "ai_script" | "ai_repair" | "ai_rewrite";
type AiAutosaveReason = `autosave:${AiAutosaveReasonCode}`;

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

type PendingAiAutosave = {
  draftId: string;
  body: string;
  reasonCode: AiAutosaveReasonCode;
};

type ImageBeatSheetEntry = {
  id: string;
  attach_after: string;
  description: string;
  prompt: string;
  match?: string;
};

const PRODUCTION_ACTION_LABEL: Record<ProductionAction, string> = {
  seo: "Generate SEO",
  tags: "Generate Tags",
  thumbnails: "Thumbnail Concepts",
  image_beat_sheet: "Image Beat Sheet",
};

const PRODUCTION_ACTION_ARTIFACT_KIND: Record<ProductionAction, ProductionArtifactKind> = {
  seo: "seo",
  tags: "tags",
  thumbnails: "thumbnails",
  image_beat_sheet: "image_beat_sheet",
};

const TONE_PRESET_OPTIONS = [
  { value: "neutral_conversational", label: "Neutral conversational" },
  { value: "newsroom_neutral", label: "Newsroom neutral" },
  { value: "spicy_but_safe", label: "Spicy but safe" },
] as const;
const DEFAULT_TONE_PRESET = "neutral_conversational";
const EMPTY_WORKPIECE_SUMMARY_LIST: HearthWorkpieceSummary[] = [];
const EMPTY_READY_SCRIPT_LIST: HearthReadyScript[] = [];

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
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

function buildImageMapExportDocument(
  workpieceId: string | null,
  entries: EpisodeImageMapEntry[],
): Record<string, unknown> {
  return {
    schema: "forge.image-map.v1",
    ...(workpieceId ? { workpiece_id: workpieceId } : {}),
    entries,
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

function deriveScriptParagraphAnchors(scriptText: string): string[] {
  const normalized = scriptText.replace(/\r\n?/g, "\n");
  const paragraphs = normalized
    .split(/\n\s*\n/g)
    .map((chunk) => chunk.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const anchors: string[] = [];
  for (let index = 0; index < paragraphs.length; index += 1) {
    anchors.push(`s1:para${index + 1}`);
  }
  return anchors;
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
    || /\bimage beat sheet\b/.test(normalized)
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
        return `Outline draft:\n${outlineFromOps}`;
      }
      if (assistantText.includes(outlineFromOps)) {
        return assistantText;
      }
      return `${assistantText}\n\n${outlineFromOps}`;
    }
  }

  if (assistantText) return assistantText;
  if (args.ops.length > 0) return "Proposed updates are ready to review.";
  return "Response received.";
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
type ReadyCategoryFilter = "all" | "uncategorized" | HearthContentCategory;
type ReadyCategoryGroupKey = HearthContentCategory | "uncategorized";
type ReadyUrgencyFilter = "all" | "fresh" | "cooling" | "cold";
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
  selected: boolean[];
  context: EpisodeContext;
  fromGate: boolean;
  autosaveReasonCode: AiAutosaveReasonCode;
};

type ScriptValidationState = {
  source: "save_notice" | "save_gate" | "ai_apply" | "ai_repair";
  result: AnvilTagValidation;
};

const READY_CATEGORY_LABEL: Record<HearthContentCategory, string> = {
  evergreen: "Evergreen",
  hot_topic: "Hot Topic",
  viral_reaction: "Viral / Reaction",
  strategic_anchor: "Strategic Anchor",
  community: "Community",
  reflective: "Personal / Reflective",
  explainer: "Educational / Explainer",
  experimental: "Experimental",
  backup: "Backup / Filler",
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

export default function HearthShell() {
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
  const [workpieceId, setWorkpieceId] = useState<string | null>(() => (
    incomingBarStockIntakeRoute ? null : resolveWorkpieceId()
  ));
  const [sparks, setSparks] = useState<BarStockSpark[]>(() => readBarStockSparks(resolveWorkspaceId()));
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
  const [selectedRevision, setSelectedRevision] = useState<Revision | null>(null);
  const revisionWorkpieceId = useMemo(() => normalizeUuid(workpieceId), [workpieceId]);
  const [draftSnapshot, setDraftSnapshot] = useState<DraftSnapshot | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isSavingRevision, setIsSavingRevision] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiAutosaveStatusAt, setAiAutosaveStatusAt] = useState<number | null>(null);
  const [aiAutosaveWarning, setAiAutosaveWarning] = useState<string | null>(null);
  const [scriptValidation, setScriptValidation] = useState<ScriptValidationState | null>(null);
  const [isRepairingScript, setIsRepairingScript] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [showArchived, setShowArchived] = useState(false);
  const [readyScripts, setReadyScripts] = useState<HearthReadyScript[]>([]);
  const [isReadyScriptsLoading, setIsReadyScriptsLoading] = useState(false);
  const [readyScriptsError, setReadyScriptsError] = useState<string | null>(null);
  const [readyCategoryFilter, setReadyCategoryFilter] = useState<ReadyCategoryFilter>("all");
  const [readyUrgencyFilter, setReadyUrgencyFilter] = useState<ReadyUrgencyFilter>("all");
  const [updatingReadyCategoryId, setUpdatingReadyCategoryId] = useState<string | null>(null);
  const [readyCategoryError, setReadyCategoryError] = useState<string | null>(null);
  const [removingReadyIds, setRemovingReadyIds] = useState<string[]>([]);
  const [isRestoringReady, setIsRestoringReady] = useState(false);
  const [draggingReadyId, setDraggingReadyId] = useState<string | null>(null);
  const [revisionModalOpen, setRevisionModalOpen] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [revisionKind, setRevisionKind] = useState<RevisionKind>("manual");
  const [revisionView, setRevisionView] = useState<"list" | "preview" | "compare">("list");
  const [session, setSession] = useState<HearthSession | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [cursorPosition, setCursorPosition] = useState<number | null>(null);
  const [scrollTop, setScrollTop] = useState<number | null>(null);
  const [isBodyComposing, setIsBodyComposing] = useState(false);
  const [chatMessages, setChatMessages] = useState<HearthChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [sttLane, setSttLane] = useState<SttLane>("browser");
  const [sttState, setSttState] = useState<SttState>("idle");
  const [sttError, setSttError] = useState<string | null>(null);
  const [sttNotice, setSttNotice] = useState<string | null>(null);
  const [sttPreview, setSttPreview] = useState<string | null>(null);
  const [showManualDraft, setShowManualDraft] = useState(false);
  const [showScriptPanel, setShowScriptPanel] = useState(false);
  const [scriptApprovalState, setScriptApprovalState] = useState<ScriptApprovalState>(() =>
    readScriptApprovalState(incomingBarStockIntakeRoute ? null : resolveWorkpieceId()),
  );
  const [pendingAiProposal, setPendingAiProposal] = useState<PendingAiProposal | null>(null);
  const [isApplyingAiOps, setIsApplyingAiOps] = useState(false);
  const [isApprovingScript, setIsApprovingScript] = useState(false);
  const [approvalPersistenceStatus, setApprovalPersistenceStatus] = useState<ApprovalPersistenceStatus | null>(null);
  const [activeProductionAction, setActiveProductionAction] = useState<ProductionAction | null>(null);
  const [aiRuntimeWarning, setAiRuntimeWarning] = useState<string | null>(null);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [writingProfile, setWritingProfile] = useState<WritingProfile | null>(null);
  const [forgeGreetingName, setForgeGreetingName] = useState<string>(() => readGreetingNameFromStorage());
  const [hearthUser, setHearthUser] = useState<HearthUserContext>({
    userId: readAuthUserIdFromStorage(),
    displayName: readGreetingNameFromStorage(),
  });
  const [aiTokenBalance, setAiTokenBalance] = useState<number | null>(null);
  const [aiBillingMode, setAiBillingMode] = useState<HearthAiLane>(() => resolveAiLaneFromStorage());
  const [episodePackage, setEpisodePackage] = useState<EpisodePackageV2 | null>(null);
  const [selectedThumbnailConceptId, setSelectedThumbnailConceptId] = useState<string>("");
  const [selectedThumbnailVersionId, setSelectedThumbnailVersionId] = useState<string | null>(null);
  const [thumbnailConceptLabelDraft, setThumbnailConceptLabelDraft] = useState("");
  const [thumbnailConceptPromptDraft, setThumbnailConceptPromptDraft] = useState("");
  const [thumbnailConceptStyleDraft, setThumbnailConceptStyleDraft] = useState("");
  const [thumbnailPromptOverride, setThumbnailPromptOverride] = useState("");
  const [thumbnailAspect, setThumbnailAspect] = useState<"16:9" | "1:1" | "9:16">("16:9");
  const [isThumbnailGenerating, setIsThumbnailGenerating] = useState(false);
  const [isThumbnailConceptSaving, setIsThumbnailConceptSaving] = useState(false);
  const [isThumbnailUploading, setIsThumbnailUploading] = useState(false);
  const [thumbnailGenerateError, setThumbnailGenerateError] = useState<string | null>(null);
  const [thumbnailUploadError, setThumbnailUploadError] = useState<string | null>(null);
  const [thumbnailPreviewState, setThumbnailPreviewState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [thumbnailPreviewDataUrl, setThumbnailPreviewDataUrl] = useState<string | null>(null);
  const [thumbnailPreviewError, setThumbnailPreviewError] = useState<string | null>(null);
  const [thumbnailSafeZoneEnabled, setThumbnailSafeZoneEnabled] = useState(false);
  const [selectedImageMapEntryId, setSelectedImageMapEntryId] = useState<string | null>(null);
  const [imageMapAnchorDraft, setImageMapAnchorDraft] = useState("");
  const [imageMapDescriptionDraft, setImageMapDescriptionDraft] = useState("");
  const [imageMapIntentDraft, setImageMapIntentDraft] = useState("broll");
  const [imageMapSourceTypeDraft, setImageMapSourceTypeDraft] = useState("stock");
  const [imageMapPlacementHintDraft, setImageMapPlacementHintDraft] = useState("");
  const [imageMapMetadataUpdatedAt, setImageMapMetadataUpdatedAt] = useState<string | null>(null);
  const [imageMapSaveState, setImageMapSaveState] = useState<"saved" | "editing" | "saving" | "error" | "offline">("saved");
  const [imageMapSaveError, setImageMapSaveError] = useState<string | null>(null);
  const [imageMapExportMessage, setImageMapExportMessage] = useState<string | null>(null);
  const [scriptPanelCopyMessage, setScriptPanelCopyMessage] = useState<string | null>(null);
  const [metadataTitlesDraft, setMetadataTitlesDraft] = useState<EpisodeSeoTitle[]>([]);
  const [metadataTagsDraft, setMetadataTagsDraft] = useState<string[]>([]);
  const [metadataTagInputDraft, setMetadataTagInputDraft] = useState("");
  const [metadataDescriptionShortDraft, setMetadataDescriptionShortDraft] = useState("");
  const [metadataDescriptionLongDraft, setMetadataDescriptionLongDraft] = useState("");
  const [metadataPreviewMode, setMetadataPreviewMode] = useState<"youtube" | "rss" | "plain">("youtube");
  const [metadataSaveState, setMetadataSaveState] = useState<"saved" | "editing" | "saving" | "offline" | "error">("saved");
  const [metadataSaveError, setMetadataSaveError] = useState<string | null>(null);
  const [presenceRows, setPresenceRows] = useState<HearthWorkpiecePresence[]>([]);
  const [draftConflictState, setDraftConflictState] = useState<DraftConflictState | null>(null);
  const [mobileOverlayView, setMobileOverlayView] = useState<"editor" | "ready" | null>(null);

  const autosaveTimer = useRef<number | null>(null);
  const autosaveInFlightRef = useRef(false);
  const autosaveQueuedRef = useRef(false);
  const pendingAiAutosaveRef = useRef<PendingAiAutosave | null>(null);
  const lastAutosaveCommitAtRef = useRef(0);
  const draftEditVersionRef = useRef(0);
  const workpieceIdRef = useRef<string | null>(workpieceId);
  const activeDraftRef = useRef<Draft | null>(null);
  const draftSnapshotRef = useRef<DraftSnapshot | null>(null);
  const sessionSaveTimer = useRef<number | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const sessionCommitRef = useRef<string | null>(null);
  const sessionCommitInFlight = useRef(false);
  const sessionCommitQueued = useRef(false);
  const projectIntakeHandledRef = useRef<string | null>(null);
  const sparkIntakeHandledRef = useRef<string | null>(null);
  const intakeResetKeyRef = useRef<string | null>(null);
  const previousWorkspaceIdRef = useRef<string | null>(workspaceId);
  const restoredCursorDraftIdRef = useRef<string | null>(null);
  const restoredModeDraftKeyRef = useRef<string | null>(null);
  const pendingDraftEditorPanelRef = useRef<"script" | "manual" | null>(null);
  const aiRequestControllerRef = useRef<AbortController | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const aiSttChunksRef = useRef<BlobPart[]>([]);
  const aiSttStartedAtRef = useRef<number | null>(null);
  const aiSttMimeTypeRef = useRef<string>("audio/webm");
  const aiSttEpisodeIdRef = useRef<string | null>(null);
  const aiSttStopTimerRef = useRef<number | null>(null);
  const aiSttDiscardNextStopRef = useRef(false);
  const aiSttTranscribeControllerRef = useRef<AbortController | null>(null);
  const sttNoticeTimerRef = useRef<number | null>(null);
  const sttPreviewTimerRef = useRef<number | null>(null);
  const chatPersistTimerRef = useRef<number | null>(null);
  const chatMessagesRef = useRef<HearthChatMessage[]>([]);
  const latestChatHistoryKeyRef = useRef<string | null>(null);
  const latestChatDraftIdRef = useRef<string | null>(null);
  const skipChatHydrationKeyRef = useRef<string | null>(null);
  const pendingChatHydrationKeyRef = useRef<string | null>(null);
  const chatHydrationSeqRef = useRef(0);
  const gateAwaitingAnswersRef = useRef(false);
  const pendingShortcutIntentRef = useRef<"outline" | "script" | null>(null);

  const flushChatHistoryNow = useCallback((options?: {
    historyKey?: string | null;
    draftId?: string | null;
    messages?: HearthChatMessage[];
  }) => {
    const historyKey = options?.historyKey ?? latestChatHistoryKeyRef.current;
    const draftId = options?.draftId ?? latestChatDraftIdRef.current;
    if (!historyKey) return;
    if (chatPersistTimerRef.current) {
      window.clearTimeout(chatPersistTimerRef.current);
      chatPersistTimerRef.current = null;
    }
    const messages = options?.messages ?? chatMessagesRef.current;
    writeChatHistoryCache(historyKey, messages);
    if (draftId) {
      void store.saveChatHistory(draftId, messages);
    }
  }, [store]);

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
    () => buildOpenInAnvilHref(workspaceId, workpieceId),
    [workspaceId, workpieceId],
  );
  const aiCreditsDepleted = aiBillingMode === "forge" && aiTokenBalance != null && aiTokenBalance <= 0;
  const aiEpisodeReady = Boolean(workpieceId?.trim());
  const thumbnailConcepts = episodePackage?.thumbnail.concepts ?? [];
  const thumbnailVersions = episodePackage?.thumbnail.versions ?? [];
  const primaryThumbnailVersionId = episodePackage?.thumbnail.primary_version_id ?? null;
  const selectedThumbnailConcept = thumbnailConcepts.find((concept) => concept.id === selectedThumbnailConceptId) ?? null;
  const selectedThumbnailVersion = thumbnailVersions.find((version) => version.id === selectedThumbnailVersionId) ?? null;
  const imageMapEntries = episodePackage?.image_map.entries ?? [];
  const selectedImageMapEntry = imageMapEntries.find((entry) => entry.id === selectedImageMapEntryId) ?? null;
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
  const chatHistoryKey = useMemo(
    () => resolveChatHistoryKey(workpieceId, activeDraft?.id ?? null),
    [activeDraft?.id, workpieceId],
  );
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
  const forgeableSparks = useMemo(
    () => sortedSparks.filter((spark) => !isSparkForged(spark)),
    [sortedSparks],
  );
  const selectedSpark = useMemo(() => {
    if (forgeableSparks.length === 0) return null;
    if (!selectedSparkId) return forgeableSparks[0] ?? null;
    return forgeableSparks.find((spark) => spark.id === selectedSparkId) ?? forgeableSparks[0] ?? null;
  }, [forgeableSparks, selectedSparkId]);
  const deferDesktopRailCollections = !isMobile && mode === "sparks" && !hasActiveEpisode;
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
    return workpieceNavItems.filter((item) => {
      const draft = item.draftId ? draftsById.get(item.draftId) ?? null : null;
      return !draft?.archived;
    });
  }, [draftsById, showArchived, workpieceNavItems]);

  const readyScriptsForDisplay = deferDesktopRailCollections ? EMPTY_READY_SCRIPT_LIST : readyScripts;
  const visibleReadyScriptsForDisplay = useMemo(
    () => readyScriptsForDisplay.filter((entry) => !entry.hiddenAt),
    [readyScriptsForDisplay],
  );

  const categoryFilteredReadyScripts = useMemo(() => {
    if (readyCategoryFilter === "all") return visibleReadyScriptsForDisplay;
    if (readyCategoryFilter === "uncategorized") {
      return visibleReadyScriptsForDisplay.filter((entry) => !entry.contentCategory);
    }
    return visibleReadyScriptsForDisplay.filter((entry) => entry.contentCategory === readyCategoryFilter);
  }, [readyCategoryFilter, visibleReadyScriptsForDisplay]);

  const readyUrgencyCounts = useMemo(() => {
    const counts = { fresh: 0, cooling: 0, cold: 0 };
    const nowMs = Date.now();
    for (const entry of categoryFilteredReadyScripts) {
      const urgency = deriveReadyUrgency(entry, nowMs);
      if (!urgency || urgency === "warming") continue;
      counts[urgency] += 1;
    }
    return counts;
  }, [categoryFilteredReadyScripts]);

  const filteredReadyScripts = useMemo(() => {
    if (readyUrgencyFilter === "all") return categoryFilteredReadyScripts;
    const nowMs = Date.now();
    return categoryFilteredReadyScripts.filter((entry) => deriveReadyUrgency(entry, nowMs) === readyUrgencyFilter);
  }, [categoryFilteredReadyScripts, readyUrgencyFilter]);

  const visibleReadyScripts = useMemo(() => {
    return filteredReadyScripts;
  }, [filteredReadyScripts]);

  const orderedReadyScripts = useMemo(() => {
    return visibleReadyScripts;
  }, [visibleReadyScripts]);

  const readyCategoryCounts = useMemo(() => {
    const counts: Record<ReadyCategoryGroupKey, number> = {
      uncategorized: 0,
      evergreen: 0,
      hot_topic: 0,
      viral_reaction: 0,
      strategic_anchor: 0,
      community: 0,
      reflective: 0,
      explainer: 0,
      experimental: 0,
      backup: 0,
    };
    for (const entry of visibleReadyScriptsForDisplay) {
      const key: ReadyCategoryGroupKey = entry.contentCategory ?? "uncategorized";
      counts[key] += 1;
    }
    return counts;
  }, [visibleReadyScriptsForDisplay]);

  const readyTotalCount = visibleReadyScriptsForDisplay.length;
  const removedReadyCount = useMemo(() => {
    return readyScriptsForDisplay.filter((entry) => Boolean(entry.hiddenAt)).length;
  }, [readyScriptsForDisplay]);
  const activeReadyScript = useMemo(
    () => readyScriptsForDisplay.find((entry) => entry.workpieceId === (workpieceId ?? "")) ?? null,
    [readyScriptsForDisplay, workpieceId],
  );
  const metadataTagSuggestions = useMemo(
    () => buildMetadataTagSuggestions({
      currentTags: metadataTagsDraft,
      contentCategory: activeReadyScript?.contentCategory ?? null,
    }),
    [activeReadyScript?.contentCategory, metadataTagsDraft],
  );

  const groupedReadyScripts = useMemo(() => {
    if (filteredReadyScripts.length === 0) return [] as Array<{
      key: string;
      label: string;
      entries: HearthReadyScript[];
    }>;

    if (readyCategoryFilter !== "all") {
      const label = readyCategoryFilter === "uncategorized"
        ? "Uncategorized"
        : READY_CATEGORY_LABEL[readyCategoryFilter];
      return [{ key: readyCategoryFilter, label, entries: filteredReadyScripts }];
    }

    const grouped = new Map<ReadyCategoryGroupKey, HearthReadyScript[]>();
    for (const entry of filteredReadyScripts) {
      const key: ReadyCategoryGroupKey = entry.contentCategory ?? "uncategorized";
      const existing = grouped.get(key);
      if (existing) {
        existing.push(entry);
      } else {
        grouped.set(key, [entry]);
      }
    }

    const orderedKeys: ReadyCategoryGroupKey[] = [...HEARTH_CONTENT_CATEGORIES, "uncategorized"];
    const sections: Array<{ key: string; label: string; entries: HearthReadyScript[] }> = [];
    for (const key of orderedKeys) {
      const entries = grouped.get(key);
      if (!entries || entries.length === 0) continue;
      const label = key === "uncategorized" ? "Uncategorized" : READY_CATEGORY_LABEL[key];
      sections.push({ key, label, entries });
    }
    return sections;
  }, [filteredReadyScripts, readyCategoryFilter]);
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
    pendingAiAutosaveRef.current = null;
    setAiAutosaveWarning(null);
    setAiAutosaveStatusAt(null);
  }, [activeDraft?.id]);

  useEffect(() => {
    draftSnapshotRef.current = draftSnapshot;
  }, [draftSnapshot]);

  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const flush = () => flushChatHistoryNow();
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [flushChatHistoryNow]);

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
      isAiProcessing,
      tokenBalance: aiTokenBalance,
      billingMode: aiBillingMode,
    });
  }, [aiBillingMode, aiTokenBalance, isAiProcessing]);

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

  const refreshWorkpieces = useCallback(async (overrideWorkspaceId?: string | null): Promise<HearthWorkpieceSummary[]> => {
    const workspace = normalizeUuid(overrideWorkspaceId ?? workspaceId);
    if (!workspace) {
      setWorkpieceSummaries([]);
      setWorkpiecesError(null);
      setIsWorkpiecesLoading(false);
      return [];
    }

    setIsWorkpiecesLoading(true);
    setWorkpiecesError(null);
    try {
      const list = await listHearthWorkpieces(workspace);
      setWorkpieceSummaries(list);
      return list;
    } catch {
      setWorkpieceSummaries([]);
      setWorkpiecesError("Failed to load Episodes.");
      return [];
    } finally {
      setIsWorkpiecesLoading(false);
    }
  }, [workspaceId]);

  const refreshDrafts = useCallback(async (): Promise<Draft[]> => {
    const list = dedupeDraftListById(await store.listDrafts());
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

    const availableWorkpieces = options?.workpieces ?? workpieceSummaries;
    const availableDrafts = options?.drafts ?? drafts;

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
  }, [activeDraft?.id, drafts, sparks, workpieceId, workpieceSummaries]);

  const refreshRevisions = useCallback(async (
    currentWorkpieceId: string | null,
    draftId?: string | null,
  ): Promise<Revision[]> => {
    const resolvedWorkpieceId = normalizeUuid(currentWorkpieceId);
    if (!resolvedWorkpieceId) {
      setRevisions([]);
      setSelectedRevision(null);
      return [];
    }
    const list = await store.listRevisions(resolvedWorkpieceId, draftId?.trim() ? draftId : null);
    setRevisions(list);
    setSelectedRevision((prev) => {
      if (!prev) return null;
      return list.find((revision) => revision.id === prev.id) ?? null;
    });
    return list;
  }, [store]);

  const refreshEpisodePackage = useCallback(async () => {
    const episodeId = workpieceId?.trim() ?? "";
    if (!episodeId) {
      setEpisodePackage(null);
      setImageMapMetadataUpdatedAt(null);
      setSelectedThumbnailConceptId("");
      setSelectedThumbnailVersionId(null);
      setSelectedImageMapEntryId(null);
      setThumbnailGenerateError(null);
      setThumbnailUploadError(null);
      setThumbnailPreviewState("idle");
      setThumbnailPreviewDataUrl(null);
      setThumbnailPreviewError(null);
      setImageMapSaveState("saved");
      setImageMapSaveError(null);
      setImageMapExportMessage(null);
      return;
    }

    const loaded = await readEpisodePackageForWorkpiece(episodeId);
    if (!loaded.ok) {
      setEpisodePackage(null);
      setImageMapMetadataUpdatedAt(null);
      setThumbnailGenerateError("Unable to load thumbnail metadata.");
      setThumbnailPreviewState("error");
      setThumbnailPreviewDataUrl(null);
      setThumbnailPreviewError("Unable to load thumbnail metadata.");
      return;
    }

    let nextEpisodePackage = loaded.episodePackage;
    const imageMapLoaded = await getWorkpieceImageMap(episodeId);
    if (imageMapLoaded.ok) {
      nextEpisodePackage = replaceEpisodePackageImageMap(loaded.episodePackage, imageMapLoaded.imageMap.entries);
      setImageMapMetadataUpdatedAt(imageMapLoaded.imageMap.metadataUpdatedAt);
    } else {
      setImageMapMetadataUpdatedAt(null);
    }

    setEpisodePackage(nextEpisodePackage);
    setThumbnailGenerateError(null);
    setImageMapSaveError(null);
    const versions = nextEpisodePackage.thumbnail.versions;
    const preferredVersionId = nextEpisodePackage.thumbnail.primary_version_id
      ?? versions[versions.length - 1]?.id
      ?? null;
    setSelectedThumbnailVersionId(preferredVersionId);
    const imageEntries = nextEpisodePackage.image_map.entries;
    setSelectedImageMapEntryId((prev) => {
      if (prev && imageEntries.some((entry) => entry.id === prev)) return prev;
      return imageEntries[0]?.id ?? null;
    });
  }, [workpieceId]);

  const refreshReadyScripts = useCallback(async () => {
    const workspace = workspaceId?.trim() ?? "";
    if (!workspace) {
      setReadyScripts([]);
      setReadyScriptsError(null);
      setIsReadyScriptsLoading(false);
      return;
    }

    setIsReadyScriptsLoading(true);
    setReadyScriptsError(null);
    try {
      const entries = await listHearthReadyScripts(workspace);
      setReadyScripts(entries);
    } catch {
      setReadyScripts([]);
      setReadyScriptsError("Failed to load Ready to Record list.");
    } finally {
      setIsReadyScriptsLoading(false);
    }
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
    const hiddenEntries = readyScripts.filter((entry) => entry.hiddenAt);
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
  }, [isRestoringReady, readyScripts, refreshReadyScripts, workspaceId]);

  const onReorderReady = useCallback(async (fromId: string, toId: string) => {
    const normalizedWorkspaceId = normalizeUuid(workspaceId);
    if (!normalizedWorkspaceId || !fromId || !toId || fromId === toId) return;

    const reordered = reorderVisibleReadyEntries(readyScripts, fromId, toId);
    const changed = reordered.some((entry, index) => entry !== readyScripts[index]);
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
  }, [readyScripts, refreshReadyScripts, workspaceId]);

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
  }, [cursorPosition, focusTab, mode, scrollTop, session, sessionStore]);

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
    pendingAiAutosaveRef.current = null;
    setAiAutosaveWarning(null);
    setAiAutosaveStatusAt(now);
    flushChatHistoryNow({ draftId: activeDraft.id });
  }, [activeDraft, flushChatHistoryNow]);

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
    const text = activeDraft?.body ?? "";
    if (!text.trim()) return;
    const copied = await writeTextToClipboard(text);
    setScriptPanelCopyMessage(copied ? "Copied to clipboard." : "Clipboard write failed.");
  }, [activeDraft?.body]);

  const onOpenInAnvil = useCallback(async () => {
    const workspace = workspaceId?.trim() ?? "";
    const episodeId = workpieceId?.trim() ?? "";
    if (!workspace || !episodeId) {
      setError("Open in Anvil requires a valid workspace and workpiece.");
      return;
    }
    const href = buildOpenInAnvilHref(workspace, episodeId);
    if (!href) {
      setError("Open in Anvil is unavailable until context is resolved.");
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

    const now = Date.now();
    const saved = await persistDraft({
      draft: { ...activeDraft, updatedAt: now },
      updatedAt: now,
      createRevision: null,
      syncSources: false,
      syncSession: false,
      validateForAnvil: true,
    });
    if (!saved) return;

    const published = await commitHearthPrimaryScript(episodeId, activeDraft.body);
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
  }, [activeDraft, flushChatHistoryNow, workpieceId, workspaceId]);

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

    const availableDrafts = options?.drafts ?? drafts;
    const existingDraft = selectDraftForWorkpiece({
      workpieceId: normalizedWorkpieceId,
      drafts: availableDrafts,
      sparks,
      preferredDraftId: options?.preferredDraftId ?? null,
    });
    if (existingDraft) return existingDraft;

    const availableWorkpieces = options?.workpieces ?? workpieceSummaries;
    const workpieceSummary = availableWorkpieces.find((entry) => entry.workpieceId === normalizedWorkpieceId) ?? null;
    const scriptRead = await readHearthPrimaryScript(normalizedWorkpieceId);
    if (!scriptRead.ok) {
      setAiRuntimeWarning("Opened Episode, but Hearth could not load the canonical script snapshot.");
    }

    const seedBody = options?.seed?.body ?? "";
    const body = seedBody.trim()
      ? seedBody
      : scriptRead.ok && scriptRead.data.text != null
        ? scriptRead.data.text
        : "## Draft Script\n\n";
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
  }, [drafts, hearthUser, refreshDrafts, sparks, store, workpieceSummaries]);

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
    if (targetWorkspaceId && targetWorkspaceId !== workspaceId) {
      setWorkspaceId(targetWorkspaceId);
    }
    setWorkpieceId(normalizedWorkpieceId);
    replaceHearthRouteContext(targetWorkspaceId ?? null, normalizedWorkpieceId);
    setFocusTab("draft");
    setMode("focus");

    let availableWorkpieces = options?.workpieces ?? workpieceSummaries;
    if (
      availableWorkpieces.length === 0
      || !availableWorkpieces.some((entry) => entry.workpieceId === normalizedWorkpieceId)
    ) {
      availableWorkpieces = await refreshWorkpieces(targetWorkspaceId);
    }

    const draft = await hydrateOrCreateDraftBufferForWorkpiece(normalizedWorkpieceId, {
      drafts: options?.drafts ?? drafts,
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
  }, [
    drafts,
    hydrateOrCreateDraftBufferForWorkpiece,
    isMobile,
    refreshWorkpieces,
    selectDraft,
    workpieceSummaries,
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
        "## Draft Script\n\n",
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
      const scriptSeed = spark.body?.trim()
        ? spark.body
        : `## ${sparkTitle}\n\n`;
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
      pendingDraftEditorPanelRef.current = scriptSeed.trim() ? "script" : "manual";

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
          ? listHearthWorkpieces(workspace).catch(() => [] as HearthWorkpieceSummary[])
          : Promise.resolve([] as HearthWorkpieceSummary[]),
      ]);

      setSession(storedSession);
      const dedupedDrafts = dedupeDraftListById(list);
      setDrafts(dedupedDrafts);
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

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

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
          "## Draft Script\n\n",
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
    if (!routeSpark) {
      if (sparks.length > 0) {
        sparkIntakeHandledRef.current = intakeKey;
        setForgeError("Spark not found in Bar Stock. Sync and retry.");
      }
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
  }, [forgeSpark, openWorkpieceInFocus, routeProjectId, routeSpark, routeSparkId, sparks.length, workspaceId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => setSparks(readBarStockSparks(workspaceId));
    refresh();
    const onStorage = (event: StorageEvent) => {
      if (!isBarStockKey(event.key, workspaceId)) return;
      refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [workspaceId]);

  useEffect(() => {
    if (forgeableSparks.length === 0) {
      if (selectedSparkId) setSelectedSparkId(null);
      return;
    }
    if (!selectedSparkId) {
      setSelectedSparkId(forgeableSparks[0]?.id ?? null);
      return;
    }
    const exists = forgeableSparks.some((spark) => spark.id === selectedSparkId);
    if (!exists) {
      setSelectedSparkId(forgeableSparks[0]?.id ?? null);
    }
  }, [forgeableSparks, selectedSparkId]);

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
        if (!workpieceId && normalizedCached.workpiece_id) {
          setWorkpieceId(normalizedCached.workpiece_id);
        }
        if (!workspaceId && normalizedCached.workspace_id) {
          setWorkspaceId(normalizedCached.workspace_id);
        }
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
      setThumbnailConceptStyleDraft("");
      return;
    }
    setThumbnailConceptLabelDraft(selectedThumbnailConcept.label);
    setThumbnailConceptPromptDraft(selectedThumbnailConcept.prompt_text);
    setThumbnailConceptStyleDraft(selectedThumbnailConcept.style_preset ?? "");
  }, [selectedThumbnailConcept]);

  useEffect(() => {
    if (thumbnailVersions.length === 0) {
      setSelectedThumbnailVersionId(null);
      return;
    }
    if (
      selectedThumbnailVersionId
      && thumbnailVersions.some((version) => version.id === selectedThumbnailVersionId)
    ) {
      return;
    }
    const nextVersionId = primaryThumbnailVersionId
      ?? thumbnailVersions[thumbnailVersions.length - 1]?.id
      ?? null;
    setSelectedThumbnailVersionId(nextVersionId);
  }, [primaryThumbnailVersionId, selectedThumbnailVersionId, thumbnailVersions]);

  useEffect(() => {
    setThumbnailPromptOverride("");
    setThumbnailAspect("16:9");
    setThumbnailSafeZoneEnabled(false);
    setThumbnailPreviewState("idle");
    setThumbnailPreviewDataUrl(null);
    setThumbnailPreviewError(null);
  }, [workpieceId]);

  useEffect(() => {
    const episodeId = workpieceId?.trim() ?? "";
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
      if (cancelled) return;
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
  }, [selectedThumbnailVersion, workpieceId]);

  useEffect(() => {
    if (imageMapEntries.length === 0) {
      setSelectedImageMapEntryId(null);
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
      setImageMapIntentDraft("broll");
      setImageMapSourceTypeDraft("stock");
      setImageMapPlacementHintDraft("");
      setImageMapSaveState("saved");
      return;
    }
    setImageMapAnchorDraft(selectedImageMapEntry.anchor);
    setImageMapDescriptionDraft(selectedImageMapEntry.description);
    setImageMapIntentDraft(selectedImageMapEntry.intent || "broll");
    setImageMapSourceTypeDraft(selectedImageMapEntry.source_type || "stock");
    setImageMapPlacementHintDraft(selectedImageMapEntry.placement_hint ?? "");
    setImageMapSaveState("saved");
  }, [selectedImageMapEntry]);

  useEffect(() => {
    if (!workpieceId) {
      setImageMapMetadataUpdatedAt(null);
      setImageMapSaveState("saved");
      setImageMapSaveError(null);
      setImageMapExportMessage(null);
    }
  }, [workpieceId]);

  useEffect(() => {
    if (imageMapSaveState !== "editing") return;
    if (!episodePackage || !selectedImageMapEntryId) return;

    const current = episodePackage.image_map.entries.find((entry) => entry.id === selectedImageMapEntryId);
    if (!current) return;

    const nextAnchor = imageMapAnchorDraft.trim();
    const nextDescription = imageMapDescriptionDraft;
    const nextIntent = imageMapIntentDraft.trim().toLowerCase();
    const nextSourceType = imageMapSourceTypeDraft.trim().toLowerCase();
    const nextPlacementHint = imageMapPlacementHintDraft.trim() || null;

    const hasChanges = (
      current.anchor !== nextAnchor
      || current.description !== nextDescription
      || current.intent !== nextIntent
      || current.source_type !== nextSourceType
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
            intent: nextIntent,
            source_type: nextSourceType,
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
    imageMapIntentDraft,
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
    if (!scriptPanelCopyMessage) return;
    const timer = window.setTimeout(() => setScriptPanelCopyMessage(null), 2600);
    return () => window.clearTimeout(timer);
  }, [scriptPanelCopyMessage]);

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
      if (mode === "focus") {
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
    const previousKey = latestChatHistoryKeyRef.current;
    const previousDraftId = latestChatDraftIdRef.current;
    const nextDraftId = activeDraft?.id ?? null;
    const shouldFlushPrevious = previousKey
      && (previousKey !== chatHistoryKey || previousDraftId !== nextDraftId);
    if (shouldFlushPrevious) {
      flushChatHistoryNow({ historyKey: previousKey, draftId: previousDraftId });
    }
    latestChatHistoryKeyRef.current = chatHistoryKey;
    latestChatDraftIdRef.current = nextDraftId;

    if (!chatHistoryKey) {
      pendingChatHydrationKeyRef.current = null;
      setChatMessages([]);
      setChatError(null);
      setPendingAiProposal(null);
      return;
    }

    if (skipChatHydrationKeyRef.current === chatHistoryKey) {
      skipChatHydrationKeyRef.current = null;
      pendingChatHydrationKeyRef.current = null;
      return;
    }

    const hydrationSeq = chatHydrationSeqRef.current + 1;
    chatHydrationSeqRef.current = hydrationSeq;
    pendingChatHydrationKeyRef.current = chatHistoryKey;

    const draftId = nextDraftId;
    void (async () => {
      let hydratedMessages: HearthChatMessage[] = [];
      let loadedFromStore = false;

      if (draftId) {
        try {
          const storeMessages = await store.getChatHistory(draftId);
          hydratedMessages = sanitizeChatMessagesForStorage(storeMessages);
          loadedFromStore = hydratedMessages.length > 0;
        } catch {
          loadedFromStore = false;
        }
      }

      if (!loadedFromStore) {
        hydratedMessages = readChatHistoryFromCache(chatHistoryKey);
        if (draftId && hydratedMessages.length > 0) {
          void store.saveChatHistory(draftId, hydratedMessages);
        }
      } else {
        writeChatHistoryCache(chatHistoryKey, hydratedMessages);
      }

      if (chatHydrationSeqRef.current !== hydrationSeq) return;
      pendingChatHydrationKeyRef.current = null;
      setChatMessages(hydratedMessages);
      setChatError(null);
      setPendingAiProposal(null);
    })();
  }, [activeDraft?.id, chatHistoryKey, flushChatHistoryNow, store]);

  useEffect(() => {
    if (!chatHistoryKey) return;
    if (pendingChatHydrationKeyRef.current === chatHistoryKey) {
      pendingChatHydrationKeyRef.current = null;
      return;
    }
    const draftId = activeDraft?.id ?? null;

    if (chatPersistTimerRef.current) {
      window.clearTimeout(chatPersistTimerRef.current);
      chatPersistTimerRef.current = null;
    }
    chatPersistTimerRef.current = window.setTimeout(() => {
      writeChatHistoryCache(chatHistoryKey, chatMessages);
      if (draftId) {
        void store.saveChatHistory(draftId, chatMessages);
      }
      chatPersistTimerRef.current = null;
    }, CHAT_HISTORY_WRITE_DEBOUNCE_MS);

    return () => {
      if (chatPersistTimerRef.current) {
        window.clearTimeout(chatPersistTimerRef.current);
        chatPersistTimerRef.current = null;
      }
    };
  }, [activeDraft?.id, chatHistoryKey, chatMessages, store]);

  useEffect(() => {
    if (hasBrowserSpeech || sttLane !== "browser") return;
    setSttLane("ai");
    setSttState("idle");
    setSttError("Browser speech not supported.");
  }, [hasBrowserSpeech, sttLane]);

  useEffect(() => {
    return () => {
      try {
        speechRecognitionRef.current?.abort?.();
      } catch {
        // ignore
      }
      speechRecognitionRef.current = null;

      aiSttTranscribeControllerRef.current?.abort();
      aiSttTranscribeControllerRef.current = null;

      if (sttNoticeTimerRef.current) {
        window.clearTimeout(sttNoticeTimerRef.current);
        sttNoticeTimerRef.current = null;
      }
      if (sttPreviewTimerRef.current) {
        window.clearTimeout(sttPreviewTimerRef.current);
        sttPreviewTimerRef.current = null;
      }
      if (aiSttStopTimerRef.current) {
        window.clearTimeout(aiSttStopTimerRef.current);
        aiSttStopTimerRef.current = null;
      }
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        aiSttDiscardNextStopRef.current = true;
        try {
          recorder.stop();
        } catch {
          // ignore
        }
      }
      mediaRecorderRef.current = null;
      aiSttChunksRef.current = [];
      aiSttStartedAtRef.current = null;
      aiSttEpisodeIdRef.current = null;
      const stream = mediaStreamRef.current;
      if (stream) {
        for (const track of stream.getTracks()) {
          try {
            track.stop();
          } catch {
            // ignore
          }
        }
      }
      mediaStreamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if ((activeDraft?.body ?? "").trim()) return;
    setShowScriptPanel(false);
  }, [activeDraft?.body]);

  useEffect(() => {
    if (!workpieceId) return;
    if (mode === "sparks") return;
    writeMode(workpieceId, mode);
  }, [mode, workpieceId]);

  useEffect(() => {
    if (!activeDraft) return;
    void refreshRevisions(revisionWorkpieceId, activeDraft.id);
  }, [activeDraft?.id, refreshRevisions, revisionWorkpieceId]);

  useEffect(() => {
    if (!activeDraft) return;
    if (!isDirty) return;
    if (isBodyComposing) return;

    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current);
    }

    const now = Date.now();
    const remainingGap = Math.max(0, AUTOSAVE_MIN_GAP_MS - (now - lastAutosaveCommitAtRef.current));
    const delay = Math.max(AUTOSAVE_DELAY_MS, remainingGap);
    autosaveTimer.current = window.setTimeout(() => {
      void handleAutosave();
    }, delay);

    return () => {
      if (autosaveTimer.current) {
        window.clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
    };
  }, [activeDraft?.title, activeDraft?.body, activeDraft?.id, isBodyComposing, isDirty]);

  useEffect(() => {
    const textarea = bodyRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [activeDraft?.body]);

  useEffect(() => {
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
  }, [activeDraft?.id, session?.activeDraftId]);

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
    function handleKey(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "s") {
        event.preventDefault();
        if (event.shiftKey) {
          if (!revisionModalOpen && activeDraft) {
            setRevisionModalOpen(true);
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
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeDraft, onSaveDraft, revisionModalOpen]);

  function queueAiAutosave(args: {
    draft: Draft;
    previousBody: string;
    reasonCode: AiAutosaveReasonCode;
  }) {
    if (args.draft.body === args.previousBody) return;
    pendingAiAutosaveRef.current = {
      draftId: args.draft.id,
      body: args.draft.body,
      reasonCode: args.reasonCode,
    };
    setAiAutosaveWarning(null);
    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    void handleAutosave();
  }

  function onRetryAiAutosave() {
    const active = activeDraftRef.current;
    const snapshot = draftSnapshotRef.current;
    if (!active || !snapshot) return;
    if (active.body === snapshot.body) {
      setAiAutosaveWarning(null);
      pendingAiAutosaveRef.current = null;
      return;
    }
    if (!pendingAiAutosaveRef.current || pendingAiAutosaveRef.current.draftId !== active.id) {
      pendingAiAutosaveRef.current = {
        draftId: active.id,
        body: active.body,
        reasonCode: "ai_rewrite",
      };
    }
    setAiAutosaveWarning(null);
    void handleAutosave();
  }

  async function handleAutosave() {
    if (autosaveInFlightRef.current) {
      autosaveQueuedRef.current = true;
      return;
    }

    autosaveInFlightRef.current = true;
    try {
      do {
        autosaveQueuedRef.current = false;

        if (isBodyComposing) {
          continue;
        }

        const draft = activeDraftRef.current;
        const snapshot = draftSnapshotRef.current;
        if (!draft || !snapshot) {
          continue;
        }

        const titleIsDirty = draft.title !== snapshot.title;
        const bodyIsDirty = draft.body !== snapshot.body;
        const draftIsDirty = titleIsDirty || bodyIsDirty;
        if (!draftIsDirty) {
          const pending = pendingAiAutosaveRef.current;
          if (pending && pending.draftId === draft.id && pending.body === draft.body) {
            pendingAiAutosaveRef.current = null;
          }
          continue;
        }

        const pendingAiAutosave = pendingAiAutosaveRef.current;
        const aiAutosaveForActiveDraft = pendingAiAutosave && pendingAiAutosave.draftId === draft.id
          ? pendingAiAutosave
          : null;
        const aiAutosaveMatchesCurrentBody = Boolean(aiAutosaveForActiveDraft && aiAutosaveForActiveDraft.body === draft.body);
        const isAiAutosave = Boolean(aiAutosaveMatchesCurrentBody && bodyIsDirty);

        if (aiAutosaveForActiveDraft && !aiAutosaveMatchesCurrentBody) {
          pendingAiAutosaveRef.current = null;
        }

        const now = Date.now();
        const aiAutosaveReason = isAiAutosave && aiAutosaveForActiveDraft
          ? toAiAutosaveReason(aiAutosaveForActiveDraft.reasonCode)
          : null;
        const shouldAutoRevision = isAiAutosave || !lastAutosaveRevisionAt
          || now - lastAutosaveRevisionAt >= AUTOSAVE_REVISION_GAP_MS;

        const saved = await persistDraft({
          draft,
          updatedAt: now,
          createRevision: shouldAutoRevision ? {
            kind: "autosave",
            note: aiAutosaveReason ?? "Autosave",
          } : null,
          syncSources: false,
          syncSession: false,
          showSavingState: false,
          quietFailure: isAiAutosave,
          saveReason: aiAutosaveReason ?? "autosave:typing",
        });

        if (saved) {
          lastAutosaveCommitAtRef.current = now;
          if (isAiAutosave) {
            pendingAiAutosaveRef.current = null;
            setAiAutosaveWarning(null);
            setAiAutosaveStatusAt(now);
          }
        } else if (isAiAutosave) {
          setAiAutosaveWarning("Not saved (offline/permission).");
        }
      } while (autosaveQueuedRef.current);
    } finally {
      autosaveInFlightRef.current = false;
    }
  }

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
    const tagValidation = shouldValidateForAnvil
      ? validateAnvilTagContract(args.draft.body)
      : null;
    const hasAnvilTagWarning = Boolean(tagValidation && !tagValidation.ok);
    if (hasAnvilTagWarning && tagValidation) {
      setScriptValidation({
        source: "save_notice",
        result: tagValidation,
      });
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
        updatedAt: args.updatedAt,
        revisionCount,
        lastRevisionAt,
        createdBy: args.draft.createdBy ?? buildDraftAttribution(hearthUser),
        updatedBy: buildDraftAttribution(hearthUser),
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
    const lastDraftId = session?.activeDraftId ?? null;
    if (!lastDraftId) {
      setForgeError("No last project to resume.");
      return;
    }
    const lastWorkpieceId = resolveWorkpieceIdForDraftId(lastDraftId);
    if (!lastWorkpieceId) {
      setForgeError("Last project not found.");
      return;
    }
    setForgeError(null);
    await openWorkpieceInFocus(lastWorkpieceId, {
      preferredDraftId: lastDraftId,
    });
  }

  async function onStartForgingSelectedSpark() {
    if (!selectedSpark) {
      await startFromScratch();
      return;
    }
    await forgeSpark(selectedSpark);
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
    const confirmDelete = window.confirm(`Delete "${draftTitle}"? This cannot be undone.`);
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
      const message = err instanceof Error ? err.message : "Failed to delete draft.";
      setError(message);
    }
  }

  async function onConfirmRevision() {
    if (!activeDraft) return;
    const now = Date.now();
    await persistDraft({
      draft: activeDraft,
      updatedAt: now,
      createRevision: { kind: revisionKind, note: revisionNote.trim() || undefined },
    });
    setRevisionModalOpen(false);
    setRevisionNote("");
    setRevisionKind("manual");
  }

  async function onRestoreRevision(revision: Revision) {
    if (!activeDraft) return;
    const confirmRestore = window.confirm("Restore this revision? This will overwrite the current draft content.");
    if (!confirmRestore) return;

    const activeRevisionWorkpieceId = resolveRevisionWorkpieceId();
    if (!activeRevisionWorkpieceId) {
      reportRevisionPersistenceWarning(
        revision.kind,
        "Revision restore is unavailable until this draft is attached to an Episode.",
      );
      return;
    }

    const snapshot = await store.restoreRevision(activeRevisionWorkpieceId, revision.id);
    if (!snapshot) {
      setError("Revision not found.");
      return;
    }

    const now = Date.now();
    const restored: Draft = {
      ...activeDraft,
      title: snapshot.title,
      body: snapshot.body,
      updatedAt: now,
    };
    const restoredOk = await persistDraft({
      draft: restored,
      updatedAt: now,
      createRevision: { kind: "manual", note: "Restored from revision" },
    });
    if (restoredOk) {
      setRevisionView("preview");
    }
  }

  async function onUpdateRevisionNote(revision: Revision, note: string) {
    setIsSavingRevision(true);
    try {
      const activeRevisionWorkpieceId = resolveRevisionWorkpieceId();
      if (!activeRevisionWorkpieceId) {
        reportRevisionPersistenceWarning(
          revision.kind,
          "Revision note updates are unavailable until this draft is attached to an Episode.",
        );
        return;
      }

      const updated: Revision = {
        ...revision,
        note: note.trim() || undefined,
      };
      try {
        await store.saveRevision(activeRevisionWorkpieceId, updated);
        setAiRuntimeWarning(null);
      } catch {
        reportRevisionPersistenceWarning(
          revision.kind,
          "Saved revision note locally, but cloud sync failed.",
        );
      }

      const latest = await refreshRevisions(activeRevisionWorkpieceId, updated.draftId);
      setSelectedRevision(latest.find((item) => item.id === updated.id) ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update revision note.";
      setError(message);
    } finally {
      setIsSavingRevision(false);
    }
  }

  function openRevisionPanel() {
    setFocusTab("revisions");
    setMode("focus");
    setRevisionView("list");
    setSelectedRevision(null);
    void persistSession(activeDraft?.id ?? null, "list");
  }

  function closeRevisionPanel() {
    setFocusTab("draft");
    setMode("focus");
    setRevisionView("list");
    setSelectedRevision(null);
    void persistSession(activeDraft?.id ?? null, "draft");
  }

  function onCancelAiRequest() {
    aiRequestControllerRef.current?.abort();
  }

  const buildActiveEpisodeContext = useCallback((): EpisodeContext | null => {
    const episodeId = workpieceId?.trim();
    if (!episodeId) return null;
    return buildEpisodeContext({
      episodeId,
      workspaceId,
      draft: activeDraft,
      planningSession,
      workpieceSources,
      sourceIndexById,
      sparks: activeEpisodeSparks,
    });
  }, [
    activeDraft,
    activeEpisodeSparks,
    planningSession,
    sourceIndexById,
    workpieceId,
    workpieceSources,
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

  async function onFixScriptFormattingNoAi() {
    if (!activeDraft) return;
    const formattedBody = formatScriptToAnvilTagsNoAi(activeDraft.body);
    const validation = validateAnvilTagContract(formattedBody);
    if (!validation.ok) {
      setScriptValidation({
        source: "save_gate",
        result: validation,
      });
      setError(`Script tag validation failed:\n${validation.report}`);
      return;
    }

    const now = Date.now();
    const saved = await persistDraft({
      draft: { ...activeDraft, body: formattedBody, updatedAt: now },
      updatedAt: now,
      createRevision: null,
      syncSources: false,
      syncSession: false,
    });
    if (saved) {
      setScriptValidation(null);
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
      const repairedBody = result.scriptText ?? (opBody && opBody.op === "set_body" ? opBody.value : "");
      const validation = validateAnvilTagContract(repairedBody);
      if (!validation.ok) {
        setScriptValidation({
          source: "ai_repair",
          result: validation,
        });
        setError(`Script tag validation failed after AI repair:\n${validation.report}`);
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
        content: result.assistantText || "Applied repaired script tags.",
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

  async function onApplyAiProposal(mode: "all" | "selected") {
    if (!pendingAiProposal || isApplyingAiOps) return;
    const episodeId = workpieceId?.trim();
    if (!episodeId || !activeDraft) {
      setChatError("Select an Episode or Spark to start.");
      return;
    }

    const opsToApply = mode === "all"
      ? pendingAiProposal.ops
      : pendingAiProposal.ops.filter((_, index) => pendingAiProposal.selected[index]);

    if (opsToApply.length === 0) {
      setChatError("Select at least one proposed change.");
      return;
    }

    const bodyWillChange = opsToApply.some((op) => op.op === "set_body");
    if (bodyWillChange) {
      const projectedBody = findNextBodyFromOps(activeDraft.body, opsToApply);
      const projectedValidation = validateAnvilTagContract(projectedBody);
      if (!projectedValidation.ok) {
        setScriptValidation({
          source: "ai_apply",
          result: projectedValidation,
        });
        setError(`Script tag validation failed:\n${projectedValidation.report}`);
        return;
      }
    }

    setIsApplyingAiOps(true);
    setChatError(null);
    setError(null);
    setScriptValidation(null);

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

    try {
      await applyHearthOps(opsStore, opsToApply);

      if (saveRequested) {
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
            reasonCode: pendingAiProposal.autosaveReasonCode,
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
          await syncSessionToTongs(committedSession);
        }

        if (sourcesChanged) {
          sourcesState.syncSources();
        }
      }

      recordInteractionEvent("proposal_applied", {
        mode,
        total_ops: pendingAiProposal.ops.length,
        applied_ops: opsToApply.length,
        from_gate: pendingAiProposal.fromGate,
      });

      if (mode === "all") {
        setPendingAiProposal(null);
      } else {
        setPendingAiProposal((prev) => {
          if (!prev) return prev;
          const remainingOps = prev.ops.filter((_, index) => !prev.selected[index]);
          if (remainingOps.length === 0) return null;
          return {
            ...prev,
            ops: remainingOps,
            selected: remainingOps.map(() => true),
          };
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to apply AI changes.";
      setChatError(message);
    } finally {
      setIsApplyingAiOps(false);
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

  async function onApproveScript() {
    if (isApprovingScript || isSaving || isAiProcessing) return;
    if (!activeDraft) return;
    const episodeId = workpieceId?.trim();
    if (!episodeId) {
      setChatError("Select an Episode or Spark to start.");
      return;
    }
    if (!activeDraft.body.trim()) {
      setError("Script body is empty. Add script content before approval.");
      return;
    }

    const validation = validateAnvilTagContract(activeDraft.body);
    if (!validation.ok) {
      setScriptValidation({
        source: "save_gate",
        result: validation,
      });
      setError(`Script tag validation failed:\n${validation.report}`);
      return;
    }

    const scopedRevisions = revisions.filter((revision) => revision.draftId === activeDraft.id);
    const nextVersion = nextApprovedScriptVersion(scopedRevisions);
    const approvalNote = `script_version_approved:v${nextVersion}`;
    setScriptValidation(null);
    setError(null);
    setChatError(null);
    setAiRuntimeWarning(null);
    setApprovalPersistenceStatus(null);
    setIsApprovingScript(true);
    try {
      const now = Date.now();
      const saved = await persistDraft({
        draft: { ...activeDraft, updatedAt: now },
        updatedAt: now,
        createRevision: { kind: "milestone", note: approvalNote },
        syncSources: false,
        syncSession: false,
      });
      if (!saved) return;

      const published = await commitHearthPrimaryScript(episodeId, activeDraft.body);
      if (!published.ok) {
        setError("Failed to publish approved script to Tongs. Try approving again.");
        return;
      }

      const scriptPath = getHearthPrimaryScriptPath();
      const mirror = await mirrorApprovedScriptToLocal({
        workspaceId,
        workpieceId: episodeId,
        scriptPath,
        scriptText: activeDraft.body,
      });
      const graduatedSparkId = graduateLinkedSpark(episodeId);
      if (mirror.ok) {
        setApprovalPersistenceStatus({
          cloud: "ok",
          local: "ok",
          localPath: mirror.relativePath,
        });
        try {
          console.log("[hearth-approve] saved to cloud and local mirror", {
            workpieceId: episodeId,
            scriptPath,
            graduatedSparkId,
            localRelativePath: mirror.relativePath,
            mirrorWorkspaceId: mirror.workspaceId,
            vaultKey: mirror.vaultKey,
          });
        } catch {
          // ignore logging failures
        }
      } else {
        setApprovalPersistenceStatus({
          cloud: "ok",
          local: "failed",
          localMessage: mirror.message,
        });
        setAiRuntimeWarning(`Saved to cloud. Local mirror failed: ${mirror.message}`);
        try {
          console.warn("[hearth-approve] local mirror failed", {
            workpieceId: episodeId,
            scriptPath,
            graduatedSparkId,
            mirrorWorkspaceId: mirror.workspaceId,
            reason: mirror.reason,
            message: mirror.message,
          });
        } catch {
          // ignore logging failures
        }
      }

      const approvedAt = Date.now();
      const nextState: ScriptApprovalState = {
        hasApprovedScript: true,
        approvedScriptVersion: nextVersion,
        approvedAt,
      };
      setScriptApprovalState(nextState);
      writeScriptApprovalState(episodeId, nextState);

      let styleAlignmentMarker: string | null = null;
      const styleUpdate = await updateStyleProfileFromReadyCheckpoint({
        workspaceId,
        scriptText: activeDraft.body,
      });
      if (styleUpdate.ok) {
        if (!styleUpdate.skipped) {
          const scriptsCount = styleUpdate.profile.scriptsAnalyzedCount;
          styleAlignmentMarker = `style_alignment: updated (scripts_analyzed: ${scriptsCount})`;
        } else if (styleUpdate.reason === "paused") {
          styleAlignmentMarker = "style_alignment: paused";
        }
      } else {
        try {
          console.warn("[hearth-style] style profile update skipped after approval", {
            status: styleUpdate.status,
            error: styleUpdate.error,
          });
        } catch {
          // ignore logging failures
        }
      }

      const markerLines = [
        `🔥 Script Version ${nextVersion} Approved`,
        `script_version: ${nextVersion}`,
        `timestamp: ${new Date(approvedAt).toISOString()}`,
        "saved_to_cloud: ok",
        mirrorStatusLine(mirror),
        graduatedSparkId ? `spark_status: graduated (${graduatedSparkId})` : "spark_status: no_linked_spark",
        ...(styleAlignmentMarker ? [styleAlignmentMarker] : []),
        "Production Mode available",
      ];
      const markerMessage: HearthChatMessage = { role: "assistant", content: markerLines.join("\n") };
      setChatMessages((prev) => {
        const next = [...prev, markerMessage].slice(-CHAT_HISTORY_MAX_MESSAGES);
        flushChatHistoryNow({ draftId: activeDraft.id, messages: next });
        return next;
      });
      void refreshReadyScripts();
    } finally {
      setIsApprovingScript(false);
    }
  }

  function mirrorStatusLine(result: MirrorApprovedScriptResult): string {
    if (result.ok) {
      return `saved_to_local_mirror: ok (${result.relativePath})`;
    }
    return `saved_to_local_mirror: failed (${result.message})`;
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
      if (args.action === "thumbnails") {
        void refreshEpisodePackage();
      }
    } catch {
      setAiRuntimeWarning(`Saved response in chat, but failed to persist ${PRODUCTION_ACTION_LABEL[args.action]}.`);
    }
  }

  async function sendChatMessage(args: {
    requestContent: string;
    displayContent?: string;
    productionAction?: ProductionAction;
    productionScriptVersion?: number;
    source?: "typed" | "voice" | "shortcut";
  }) {
    if (isAiProcessing) return;
    const requestContent = args.requestContent.trim();
    if (!requestContent) return;

    const displayContent = (args.displayContent ?? requestContent).trim();
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
    if (lane === "byo") {
      setAiTokenBalance(null);
    }

    const source = args.source ?? "typed";
    const isProductionRequest = Boolean(args.productionAction);
    const intentSignals = detectChatIntentSignals(requestContent);
    const autosaveReasonCode = detectAiAutosaveReasonCode(requestContent);
    const pendingShortcutIntent = pendingShortcutIntentRef.current;
    pendingShortcutIntentRef.current = null;

    recordInteractionEvent("chat_sent", {
      source,
      chars: requestContent.length,
      lane,
      has_deliverable: intentSignals.hasDeliverable,
      production_action: args.productionAction ?? null,
    });

    if (!isProductionRequest) {
      if (intentSignals.requestedOutline && pendingShortcutIntent !== "outline") {
        recordInteractionEvent("user_requested_outline", {
          source,
        });
      }
      if (intentSignals.requestedScript && pendingShortcutIntent !== "script") {
        recordInteractionEvent("user_requested_script", {
          source,
        });
      }
      if (intentSignals.explicitDraftNow) {
        recordInteractionEvent("user_explicit_draft_now", {
          source,
        });
      }
    }

    const gateAnswering = gateAwaitingAnswersRef.current;
    if (gateAnswering) {
      gateAwaitingAnswersRef.current = false;
      recordInteractionEvent("gate_answers_provided", {
        source,
      });
    }

    const requestUserMessage: HearthChatMessage = { role: "user", content: requestContent };
    const displayUserMessage: HearthChatMessage = { role: "user", content: displayContent || requestContent };
    const baseMessages = chatMessagesRef.current;
    const requestMessages = [...baseMessages, requestUserMessage].slice(-CHAT_HISTORY_MAX_MESSAGES);
    const displayMessages = [...baseMessages, displayUserMessage].slice(-CHAT_HISTORY_MAX_MESSAGES);
    setChatMessages(displayMessages);
    setChatDraft("");
    setChatError(null);
    setAiRuntimeWarning(null);
    setPendingAiProposal(null);

    const controller = new AbortController();
    aiRequestControllerRef.current = controller;
    setIsAiProcessing(true);

    try {
      const result = await requestHearthChatReply(requestMessages, episodeContext, { signal: controller.signal });
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

      if (result.gate === "clarify") {
        gateAwaitingAnswersRef.current = true;
        recordInteractionEvent("gate_questions_shown", {
          source: "server_gate",
          question_count: countProducerQuestions(result.assistantText),
        });
      }

      const keepOutlineInChatOnly = !args.productionAction && autosaveReasonCode === "ai_outline";
      const assistantContent = buildAssistantMessageContent({
        assistantText: result.assistantText,
        ops: result.ops,
        autosaveReasonCode,
      });
      const assistantMessage: HearthChatMessage = { role: "assistant", content: assistantContent };
      setChatMessages((prev) => [...prev, assistantMessage].slice(-CHAT_HISTORY_MAX_MESSAGES));

      if (args.productionAction && args.productionScriptVersion) {
        await persistProductionArtifact({
          action: args.productionAction,
          scriptVersion: args.productionScriptVersion,
          assistantText: result.assistantText,
        });
      }

      const proposalOps = keepOutlineInChatOnly ? [] : result.ops;
      if (keepOutlineInChatOnly) {
        recordInteractionEvent("outline_generated", {
          source,
          has_outline: Boolean(readLatestOutlineFromOps(result.ops)),
          ops_count: result.ops.length,
        });
      } else if (!args.productionAction && result.ops.some((op) => op.op === "set_body")) {
        recordInteractionEvent("draft_generated", {
          source,
          ops_count: result.ops.length,
        });
      }

      if (!args.productionAction && proposalOps.length > 0) {
        setPendingAiProposal({
          assistantText: assistantContent,
          ops: proposalOps,
          selected: proposalOps.map(() => true),
          context: episodeContext,
          fromGate: gateAnswering,
          autosaveReasonCode,
        });
      }

      if (result.creditsWarning) {
        setAiRuntimeWarning(result.creditsWarning);
      }

      const refreshedCredits = await refreshMyAiCredits();
      const laneNow = resolveAiLaneFromStorage();
      if (laneNow === "byo") {
        setAiBillingMode("byo");
        setAiTokenBalance(null);
      } else if (refreshedCredits.ok) {
        setAiBillingMode(refreshedCredits.runtime.billingMode);
        setAiTokenBalance(refreshedCredits.runtime.tokenBalance);
      } else {
        setAiRuntimeWarning("Unable to update credits.");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      const message = err instanceof Error ? err.message : "AI request failed.";
      setChatError(message);
    } finally {
      if (aiRequestControllerRef.current === controller) {
        aiRequestControllerRef.current = null;
        setIsAiProcessing(false);
      }
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
    const saved = await saveEpisodePackageForWorkpiece({
      workpieceId: episodeId,
      workspaceId: workspace,
      episodePackage: nextEpisodePackage,
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
  }): Promise<{ ok: true; episodePackage: EpisodePackageV2 } | { ok: false; error: string }> {
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
          : "Unable to save image map.",
      };
    }

    const nextEpisodePackage = replaceEpisodePackageImageMap(episodePackage, saved.imageMap.entries);
    setEpisodePackage(nextEpisodePackage);
    setImageMapMetadataUpdatedAt(saved.imageMap.metadataUpdatedAt);
    return {
      ok: true,
      episodePackage: nextEpisodePackage,
    };
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
      style_preset: thumbnailConceptStyleDraft.trim() || null,
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
            style_preset: thumbnailConceptStyleDraft.trim() || null,
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
    setSelectedThumbnailVersionId(versionId);
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
        preset: resolvedConcept?.style_preset ?? null,
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Thumbnail generation failed.";
      setThumbnailGenerateError(message);
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
        style_preset: null,
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
        intent: imageMapIntentDraft.trim().toLowerCase(),
        source_type: imageMapSourceTypeDraft.trim().toLowerCase(),
        placement_hint: imageMapPlacementHintDraft.trim() || null,
      };
    });
  }

  async function onCreateImageMapEntry() {
    if (!episodePackage) return;
    const nextAnchor = `s1:para${episodePackage.image_map.entries.length + 1}`;
    const nextEpisodePackage = addImageMapEntry(episodePackage, {
      anchor: nextAnchor,
      description: "",
      intent: "broll",
      source_type: "stock",
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
      description: selectedImageMapEntry.description,
      intent: selectedImageMapEntry.intent,
      source_type: selectedImageMapEntry.source_type,
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
    const scriptText = activeDraft?.body ?? "";
    const anchors = deriveScriptParagraphAnchors(scriptText);
    if (anchors.length === 0) {
      setImageMapExportMessage("No script paragraphs found to seed.");
      return;
    }

    const existingAnchors = new Set(episodePackage.image_map.entries.map((entry) => entry.anchor.trim().toLowerCase()));
    let nextEpisodePackage = episodePackage;
    let seededCount = 0;
    for (const anchor of anchors) {
      const key = anchor.trim().toLowerCase();
      if (!key || existingAnchors.has(key)) continue;
      nextEpisodePackage = addImageMapEntry(nextEpisodePackage, {
        anchor,
        description: "",
        intent: "broll",
        source_type: "stock",
        placement_hint: null,
      });
      existingAnchors.add(key);
      seededCount += 1;
    }

    if (seededCount === 0) {
      setImageMapExportMessage("All script anchors are already present.");
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
    setSelectedImageMapEntryId(saved.episodePackage.image_map.entries[0]?.id ?? null);
    setImageMapSaveState("saved");
    setImageMapExportMessage(`Seeded ${seededCount} anchor entries from script.`);
  }

  async function onCopyImageMapExportJson() {
    const entries = resolveImageMapEntriesForExport();
    const payload = buildImageMapExportDocument(workpieceId?.trim() ?? null, entries);
    const text = JSON.stringify(payload, null, 2);
    const copied = await writeTextToClipboard(text);
    setImageMapExportMessage(copied ? "Image map JSON copied." : "Clipboard write failed.");
  }

  function onDownloadImageMapExportJson() {
    const entries = resolveImageMapEntriesForExport();
    const payload = buildImageMapExportDocument(workpieceId?.trim() ?? null, entries);
    const text = JSON.stringify(payload, null, 2);
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const suffix = (workpieceId?.slice(0, 8) ?? "episode").toLowerCase();
    anchor.href = url;
    anchor.download = `image-map-${suffix}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setImageMapExportMessage("Image map JSON downloaded.");
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
        ? { ...title, text: nextText }
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

  async function onSendChat() {
    const content = chatDraft.trim();
    if (!content) return;
    await sendChatMessage({ requestContent: content });
  }

  function onDiscardAiProposal() {
    if (pendingAiProposal) {
      recordInteractionEvent("proposal_discarded", {
        ops_count: pendingAiProposal.ops.length,
        from_gate: pendingAiProposal.fromGate,
      });
    }
    setPendingAiProposal(null);
  }

  function onToggleAiProposalOp(index: number) {
    setPendingAiProposal((prev) => {
      if (!prev) return prev;
      const selected = prev.selected.slice();
      selected[index] = !selected[index];
      return { ...prev, selected };
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

  function clearSttNoticeTimer() {
    if (sttNoticeTimerRef.current) {
      window.clearTimeout(sttNoticeTimerRef.current);
      sttNoticeTimerRef.current = null;
    }
  }

  function clearSttPreviewTimer() {
    if (sttPreviewTimerRef.current) {
      window.clearTimeout(sttPreviewTimerRef.current);
      sttPreviewTimerRef.current = null;
    }
  }

  function showSttNotice(message: string) {
    const text = message.trim();
    if (!text) return;
    clearSttNoticeTimer();
    setSttNotice(text);
    sttNoticeTimerRef.current = window.setTimeout(() => {
      setSttNotice(null);
      sttNoticeTimerRef.current = null;
    }, STT_INLINE_FEEDBACK_MS);
  }

  function showSttPreviewLine(transcript: string) {
    if (!devMode) return;
    const normalized = transcript.replace(/\s+/g, " ").trim();
    if (!normalized) return;
    const snippet = normalized.length > STT_PREVIEW_MAX_CHARS
      ? `${normalized.slice(0, STT_PREVIEW_MAX_CHARS).trimEnd()}...`
      : normalized;
    clearSttPreviewTimer();
    setSttPreview(`STT: "${snippet}"`);
    sttPreviewTimerRef.current = window.setTimeout(() => {
      setSttPreview(null);
      sttPreviewTimerRef.current = null;
    }, STT_INLINE_FEEDBACK_MS);
  }

  async function commitVoiceTranscript(rawTranscript: string) {
    const text = rawTranscript.trim();
    if (!text) {
      setSttError(null);
      showSttNotice("No speech detected.");
      return;
    }
    showSttPreviewLine(text);
    await sendChatMessage({ requestContent: text, source: "voice" });
  }

  function clearAiSttStopTimer() {
    if (aiSttStopTimerRef.current) {
      window.clearTimeout(aiSttStopTimerRef.current);
      aiSttStopTimerRef.current = null;
    }
  }

  function stopAiSttStream() {
    const stream = mediaStreamRef.current;
    if (!stream) return;
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // ignore
      }
    }
    mediaStreamRef.current = null;
  }

  async function commitAiSttBlob(args: {
    episodeId: string;
    blob: Blob;
    mimeType: string;
  }) {
    const episodeId = args.episodeId.trim();
    if (!episodeId) {
      setSttError("Select an Episode or Spark to start.");
      return;
    }

    const uploaded = await uploadHearthSttAudio({
      workpieceId: episodeId,
      blob: args.blob,
    });
    if (!uploaded.ok) {
      setSttError(uploaded.error);
      return;
    }

    const controller = new AbortController();
    aiSttTranscribeControllerRef.current = controller;
    let transcriptResult: Awaited<ReturnType<typeof requestHearthSttTranscript>>;
    try {
      transcriptResult = await requestHearthSttTranscript({
        workpieceId: episodeId,
        storageKey: uploaded.storageKey,
        mimeType: uploaded.mimeType || args.mimeType,
        signal: controller.signal,
      });
    } finally {
      if (aiSttTranscribeControllerRef.current === controller) {
        aiSttTranscribeControllerRef.current = null;
      }
    }

    setAiBillingMode(transcriptResult.runtime.billingMode);
    if (transcriptResult.runtime.billingMode === "byo") {
      setAiTokenBalance(null);
    } else {
      setAiTokenBalance(transcriptResult.runtime.tokenBalance);
    }

    if (!transcriptResult.ok) {
      if (!transcriptResult.cancelled) {
        setSttError(transcriptResult.error);
      }
      if (transcriptResult.creditsWarning) {
        setAiRuntimeWarning(transcriptResult.creditsWarning);
      }
      return;
    }

    if (transcriptResult.creditsWarning) {
      setAiRuntimeWarning(transcriptResult.creditsWarning);
    }

    await commitVoiceTranscript(transcriptResult.text);
  }

  async function startAiStt() {
    if (typeof window === "undefined") return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setSttError("Microphone capture is not supported in this browser.");
      setSttState("idle");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setSttError("MediaRecorder is not available in this browser.");
      setSttState("idle");
      return;
    }
    const episodeId = workpieceId?.trim();
    if (!episodeId) {
      setSttError("Select an Episode or Spark to start.");
      setSttState("idle");
      return;
    }
    if (isAiProcessing) {
      setSttError("Wait for the current AI request to finish.");
      setSttState("idle");
      return;
    }

    const lane = resolveAiLaneFromStorage();
    if (lane === "forge" && aiTokenBalance != null && aiTokenBalance <= 0) {
      setSttError("No AI credits remaining.");
      setSttState("idle");
      return;
    }

    clearSttNoticeTimer();
    setSttNotice(null);
    clearSttPreviewTimer();
    setSttPreview(null);
    setSttError(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to access microphone.";
      setSttError(message);
      setSttState("idle");
      return;
    }

    const mimeType = resolveAiSttMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch (error) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      const message = error instanceof Error ? error.message : "Unable to start recorder.";
      setSttError(message);
      setSttState("idle");
      return;
    }

    mediaStreamRef.current = stream;
    mediaRecorderRef.current = recorder;
    aiSttChunksRef.current = [];
    aiSttStartedAtRef.current = Date.now();
    aiSttEpisodeIdRef.current = episodeId;
    aiSttMimeTypeRef.current = recorder.mimeType || mimeType || "audio/webm";
    aiSttDiscardNextStopRef.current = false;

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        aiSttChunksRef.current.push(event.data);
      }
    };

    recorder.onerror = () => {
      aiSttDiscardNextStopRef.current = true;
      clearAiSttStopTimer();
      mediaRecorderRef.current = null;
      aiSttChunksRef.current = [];
      aiSttStartedAtRef.current = null;
      aiSttEpisodeIdRef.current = null;
      stopAiSttStream();
      setSttState("idle");
      setSttError("Recording failed.");
    };

    recorder.onstop = async () => {
      const shouldDiscard = aiSttDiscardNextStopRef.current;
      const chunks = aiSttChunksRef.current.slice();
      const startedAt = aiSttStartedAtRef.current;
      const durationMs = startedAt ? Date.now() - startedAt : 0;
      const recordedMimeType = aiSttMimeTypeRef.current || "audio/webm";
      const episodeId = aiSttEpisodeIdRef.current;

      aiSttDiscardNextStopRef.current = false;
      mediaRecorderRef.current = null;
      aiSttChunksRef.current = [];
      aiSttStartedAtRef.current = null;
      aiSttEpisodeIdRef.current = null;
      clearAiSttStopTimer();
      stopAiSttStream();

      if (shouldDiscard) {
        setSttState("idle");
        return;
      }

      const blob = new Blob(chunks, { type: recordedMimeType });
      if (!blob.size) {
        await commitVoiceTranscript("");
        setSttState("idle");
        return;
      }
      if (!episodeId) {
        setSttState("idle");
        setSttError("Select an Episode or Spark to start.");
        return;
      }
      if (durationMs > AI_STT_MAX_DURATION_MS + 1500) {
        setSttState("idle");
        setSttError("Recording exceeded the 5 minute limit.");
        return;
      }
      if (blob.size > AI_STT_MAX_BYTES) {
        setSttState("idle");
        setSttError("Recording exceeds the 10MB limit.");
        return;
      }

      setSttState("transcribing");
      try {
        await commitAiSttBlob({
          episodeId,
          blob,
          mimeType: recordedMimeType,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Transcription failed.";
        setSttError(message);
      } finally {
        setSttState("idle");
      }
    };

    try {
      recorder.start(1000);
      setSttState("listening");
      clearAiSttStopTimer();
      aiSttStopTimerRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current !== recorder) return;
        if (recorder.state === "inactive") return;
        stopAiStt();
      }, AI_STT_MAX_DURATION_MS);
    } catch (error) {
      mediaRecorderRef.current = null;
      aiSttChunksRef.current = [];
      aiSttStartedAtRef.current = null;
      aiSttEpisodeIdRef.current = null;
      clearAiSttStopTimer();
      stopAiSttStream();
      const message = error instanceof Error ? error.message : "Unable to start recorder.";
      setSttState("idle");
      setSttError(message);
    }
  }

  function stopAiStt() {
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      setSttState("idle");
      return;
    }
    if (recorder.state === "inactive") {
      setSttState("idle");
      return;
    }
    setSttState("transcribing");
    clearAiSttStopTimer();
    try {
      recorder.stop();
    } catch {
      aiSttDiscardNextStopRef.current = true;
      mediaRecorderRef.current = null;
      aiSttChunksRef.current = [];
      aiSttStartedAtRef.current = null;
      aiSttEpisodeIdRef.current = null;
      stopAiSttStream();
      setSttState("idle");
      setSttError("Unable to stop recorder.");
    }
  }

  async function startBrowserStt() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSttError("Browser speech not supported.");
      setSttState("idle");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    let finalTranscript = "";

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          const chunk = result[0]?.transcript;
          if (typeof chunk === "string" && chunk.trim()) {
            finalTranscript += `${chunk.trim()} `;
          }
        }
      }
    };

    recognition.onerror = () => {
      speechRecognitionRef.current = null;
      stopAiSttStream();
      setSttState("idle");
      setSttError("Speech recognition error.");
    };

    recognition.onend = async () => {
      speechRecognitionRef.current = null;
      stopAiSttStream();
      setSttState("idle");
      await commitVoiceTranscript(finalTranscript);
    };

    stopAiSttStream();
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const previewStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = previewStream;
      } catch {
        mediaStreamRef.current = null;
      }
    }

    speechRecognitionRef.current = recognition;
    clearSttNoticeTimer();
    setSttNotice(null);
    clearSttPreviewTimer();
    setSttPreview(null);
    setSttError(null);
    setSttState("listening");
    try {
      recognition.start();
    } catch {
      speechRecognitionRef.current = null;
      stopAiSttStream();
      setSttState("idle");
      setSttError("Unable to start speech recognition.");
    }
  }

  function stopBrowserStt() {
    stopAiSttStream();
    try {
      speechRecognitionRef.current?.stop();
    } catch {
      // onend will settle state
    }
  }

  function onToggleMic() {
    if (sttState === "transcribing") return;
    if (sttState === "idle") {
      setSttError(null);
      clearSttNoticeTimer();
      setSttNotice(null);
      if (sttLane === "browser") {
        void startBrowserStt();
        return;
      }
      void startAiStt();
      return;
    }
    if (sttState === "listening") {
      if (sttLane === "browser") {
        stopBrowserStt();
        return;
      }
      stopAiStt();
    }
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
    const resumeWorkpieceId = resolveWorkpieceIdForDraftId(session?.activeDraftId ?? null);
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

              {forgeableSparks.length === 0 ? (
                <p className="hs-home-empty">
                  No sparks yet. Capture ideas in Bar Stock first.
                </p>
              ) : (
                forgeableSparks.map((spark) => {
                  const status = formatSparkStatus(spark);
                  const preview = buildSparkPreview(spark.body);
                  const isSelected = selectedSpark?.id === spark.id;
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
                        onClick={() => void forgeSpark(spark)}
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
                          onClick={() => void forgeSpark(spark)}
                          disabled={isForging}
                        >
                          Start forging
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
                    Start forging
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
    const showScriptEditor = showManualDraft || showScriptPanel;
    const approvedAtText = scriptApprovalState.approvedAt
      ? formatUpdatedAt(scriptApprovalState.approvedAt)
      : "Unknown";

    return (
      <section className="hs-draft hs-draft-chat-first">
        <header className="hs-draft-header hs-draft-header-chat-first">
          <div className="hs-draft-title-wrap">
            <div className="hs-draft-title">Project</div>
            <div className="hs-draft-updated">
              Last updated {formatUpdatedAt(activeDraft?.updatedAt)}
            </div>
            <div className="hs-draft-updated">
              Editing as {activeUserDisplayName} · Last edited by {resolveDraftEditorName(activeDraft)}
            </div>
          </div>
          <label className="hs-project-title">
            <span className="hs-field-label">Project title</span>
            <input
              type="text"
              value={activeDraft?.title ?? ""}
              placeholder="Project title"
              onChange={(event) => {
                setActiveDraft((prev) => {
                  if (!prev) return prev;
                  draftEditVersionRef.current += 1;
                  return { ...prev, title: event.target.value };
                });
              }}
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
            Delete Draft
          </button>
          <button onClick={() => setRevisionModalOpen(true)} disabled={!activeDraft || isSaving}>
            Create Revision
          </button>
          <button onClick={openRevisionPanel} disabled={!activeDraft}>
            Revisions
          </button>
          <button
            type="button"
            onClick={() => void onApproveScript()}
            disabled={!activeDraft || !hasScript || isSaving || isAiProcessing || isApprovingScript}
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

        {scriptValidation ? (
          <section className="hs-script-validation" aria-label="Anvil tag validation">
            <div className="hs-script-validation-title">
              {scriptValidation.source === "save_notice"
                ? "Script Tag Contract Warning"
                : "Script Tag Contract Failed"}
            </div>
            <div className="hs-script-validation-subtitle">
              {scriptValidation.source === "save_notice"
                ? "Saved draft. Script tags still need fixing before Anvil export."
                : scriptValidation.source === "ai_apply"
                ? "AI proposed script changes are invalid."
                : scriptValidation.source === "ai_repair"
                  ? "AI repair result is still invalid."
                  : "Script tags must be valid for this action."}
            </div>
            <pre className="hs-script-validation-report">{scriptValidation.result.report}</pre>
            <div className="hs-script-validation-actions">
              <button
                type="button"
                onClick={() => void onFixScriptFormattingNoAi()}
                disabled={!activeDraft || isSaving || isRepairingScript}
              >
                Fix formatting (no AI)
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
          </div>
          <div className="hs-field-label-muted">Write without AI (just a text editor)</div>
        </div>

        <div className={`hs-draft-stage${showScriptEditor ? " has-script-panel" : ""}`}>
          <section className="hs-ai-chat" aria-label="Hearth AI chat">
            <div className="hs-ai-chat-header">
              <div className="hs-ai-chat-title">Conversation</div>
              <button
                type="button"
                onClick={() => {
                  setChatMessages([]);
                  setChatError(null);
                  setPendingAiProposal(null);
                }}
                disabled={isAiProcessing || chatMessages.length === 0}
              >
                Clear
              </button>
            </div>

            <div className="hs-ai-chat-log" role="log" aria-live="polite">
              {chatMessages.length === 0 ? (
                <div className="hs-ai-chat-empty">
                  Ask a question about this Episode. Context is attached automatically.
                </div>
              ) : (
                chatMessages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={`hs-ai-chat-msg is-${message.role}`}>
                    <span className="hs-ai-chat-role">{message.role === "assistant" ? "Hearth" : "You"}</span>
                    <span className="hs-ai-chat-content">{message.content}</span>
                  </div>
                ))
              )}
            </div>

            {pendingAiProposal && pendingAiProposal.ops.length > 0 ? (
              <div className="hs-ai-proposal" aria-label="Proposed AI changes">
                <div className="hs-ai-proposal-header">
                  <div className="hs-ai-proposal-title">Proposed changes</div>
                  <div className="hs-ai-proposal-meta">
                    {pendingAiProposal.selected.filter(Boolean).length} selected · {pendingAiProposal.ops.length} total
                  </div>
                </div>

                <div className="hs-ai-proposal-list">
                  {pendingAiProposal.ops.map((op, index) => {
                    const diff = buildProposalDiff(op);
                    return (
                      <label key={`ai-op-${index}`} className="hs-ai-op-row">
                        <input
                          type="checkbox"
                          checked={Boolean(pendingAiProposal.selected[index])}
                          onChange={() => onToggleAiProposalOp(index)}
                          disabled={isApplyingAiOps}
                        />
                        <div className="hs-ai-op-body">
                          <div className="hs-ai-op-title">{describeHearthOp(op)}</div>
                          {diff ? (
                            <div className="hs-ai-op-diff">
                              <pre>{`- ${diff.before || "(empty)"}`}</pre>
                              <pre>{`+ ${diff.after || "(empty)"}`}</pre>
                            </div>
                          ) : null}
                        </div>
                      </label>
                    );
                  })}
                </div>

                <div className="hs-ai-proposal-actions">
                  <button
                    type="button"
                    onClick={() => void onApplyAiProposal("all")}
                    disabled={isApplyingAiOps}
                  >
                    {isApplyingAiOps ? "Applying..." : "Apply"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onApplyAiProposal("selected")}
                    disabled={isApplyingAiOps || pendingAiProposal.selected.every((value) => !value)}
                  >
                    Apply selected
                  </button>
                  <button
                    type="button"
                    onClick={onDiscardAiProposal}
                    disabled={isApplyingAiOps}
                  >
                    Discard
                  </button>
                </div>
              </div>
            ) : null}

            {chatError ? (
              <div className="hs-error-text-small">{chatError}</div>
            ) : null}

            {aiRuntimeWarning ? (
              <div className="hs-error-text-small">{aiRuntimeWarning}</div>
            ) : null}

            {aiCreditsDepleted ? (
              <div className="hs-error-text-small">No AI credits remaining.</div>
            ) : null}

            {hasApprovedScript && approvedScriptVersion ? (
              <div className="hs-production-mode-status">
                Script v{approvedScriptVersion} approved · {approvedAtText}
              </div>
            ) : null}

            {approvalPersistenceStatus ? (
              <div className="hs-field-label-muted">
                Saved to: Cloud [OK] · Local{" "}
                {approvalPersistenceStatus.local === "ok"
                  ? `[OK] ${approvalPersistenceStatus.localPath ?? ""}`.trim()
                  : `[WARN] ${approvalPersistenceStatus.localMessage ?? "mirror failed"}`}
              </div>
            ) : null}

            {hasApprovedScript && approvedScriptVersion ? (
              <div className="hs-production-action-row" role="group" aria-label="Production actions">
                <button
                  type="button"
                  onClick={() => void onRunProductionAction("seo")}
                  disabled={isAiProcessing || aiCreditsDepleted}
                >
                  {activeProductionAction === "seo" && isAiProcessing ? "Generating..." : "Generate SEO"}
                </button>
                <button
                  type="button"
                  onClick={() => void onRunProductionAction("tags")}
                  disabled={isAiProcessing || aiCreditsDepleted}
                >
                  {activeProductionAction === "tags" && isAiProcessing ? "Generating..." : "Generate Tags"}
                </button>
                <button
                  type="button"
                  onClick={() => void onRunProductionAction("thumbnails")}
                  disabled={isAiProcessing || aiCreditsDepleted}
                >
                  {activeProductionAction === "thumbnails" && isAiProcessing ? "Generating..." : "Thumbnail Concepts"}
                </button>
                <button
                  type="button"
                  onClick={() => void onRunProductionAction("image_beat_sheet")}
                  disabled={isAiProcessing || aiCreditsDepleted}
                >
                  {activeProductionAction === "image_beat_sheet" && isAiProcessing ? "Generating..." : "Image Beat Sheet"}
                </button>
              </div>
            ) : null}

            {hasApprovedScript && approvedScriptVersion ? (
              <ThumbnailPanel
                concepts={thumbnailConcepts}
                versions={thumbnailVersions}
                selectedConceptId={selectedThumbnailConceptId}
                selectedVersionId={selectedThumbnailVersionId}
                primaryVersionId={primaryThumbnailVersionId}
                selectedConceptLabel={thumbnailConceptLabelDraft}
                selectedConceptPrompt={thumbnailConceptPromptDraft}
                selectedConceptStylePreset={thumbnailConceptStyleDraft}
                promptOverride={thumbnailPromptOverride}
                aspect={thumbnailAspect}
                safeZoneEnabled={thumbnailSafeZoneEnabled}
                previewDataUrl={thumbnailPreviewDataUrl}
                previewState={thumbnailPreviewState}
                previewError={thumbnailPreviewError}
                generateError={thumbnailGenerateError}
                uploadError={thumbnailUploadError}
                isGenerating={isThumbnailGenerating}
                isSavingConcept={isThumbnailConceptSaving}
                isUploading={isThumbnailUploading}
                onSelectConcept={setSelectedThumbnailConceptId}
                onSelectedConceptLabelChange={setThumbnailConceptLabelDraft}
                onSelectedConceptPromptChange={setThumbnailConceptPromptDraft}
                onSelectedConceptStylePresetChange={setThumbnailConceptStyleDraft}
                onCreateConcept={() => void onCreateThumbnailConcept()}
                onSaveConcept={() => void onSaveSelectedThumbnailConcept()}
                onDeleteConcept={() => void onDeleteSelectedThumbnailConcept()}
                onPromptOverrideChange={setThumbnailPromptOverride}
                onAspectChange={setThumbnailAspect}
                onGenerate={() => void onGenerateThumbnailVersion()}
                onRegenerate={() => void onGenerateThumbnailVersion({ forceConceptId: selectedThumbnailConceptId || null })}
                onToggleSafeZone={() => setThumbnailSafeZoneEnabled((prev) => !prev)}
                onUploadImage={(file) => void onUploadThumbnailImage(file)}
                onSelectVersion={setSelectedThumbnailVersionId}
                onSetPrimary={(versionId) => void onSetPrimaryThumbnailVersion(versionId)}
                onRetryVersion={(version) => void onRetryFailedThumbnailVersion(version)}
              />
            ) : null}

            {hasApprovedScript && approvedScriptVersion ? (
              <ImageMapPanel
                entries={imageMapEntries}
                selectedEntryId={selectedImageMapEntryId}
                draftAnchor={imageMapAnchorDraft}
                draftDescription={imageMapDescriptionDraft}
                draftIntent={imageMapIntentDraft}
                draftSourceType={imageMapSourceTypeDraft}
                draftPlacementHint={imageMapPlacementHintDraft}
                saveState={imageMapSaveState}
                saveError={imageMapSaveError}
                exportMessage={imageMapExportMessage}
                disabled={isAiProcessing || isApprovingScript}
                onSelectEntry={setSelectedImageMapEntryId}
                onDraftAnchorChange={(value) => {
                  setImageMapAnchorDraft(value);
                  setImageMapSaveState("editing");
                  setImageMapSaveError(null);
                }}
                onDraftDescriptionChange={(value) => {
                  setImageMapDescriptionDraft(value);
                  setImageMapSaveState("editing");
                  setImageMapSaveError(null);
                }}
                onDraftIntentChange={(value) => {
                  setImageMapIntentDraft(value);
                  setImageMapSaveState("editing");
                  setImageMapSaveError(null);
                }}
                onDraftSourceTypeChange={(value) => {
                  setImageMapSourceTypeDraft(value);
                  setImageMapSaveState("editing");
                  setImageMapSaveError(null);
                }}
                onDraftPlacementHintChange={(value) => {
                  setImageMapPlacementHintDraft(value);
                  setImageMapSaveState("editing");
                  setImageMapSaveError(null);
                }}
                onCreateEntry={() => void onCreateImageMapEntry()}
                onDuplicateEntry={() => void onDuplicateImageMapEntry()}
                onDeleteEntry={() => void onDeleteImageMapEntry()}
                onSeedFromScript={() => void onSeedImageMapFromScript()}
                onCopyExport={() => void onCopyImageMapExportJson()}
                onDownloadExport={onDownloadImageMapExportJson}
              />
            ) : null}

            {hasApprovedScript && approvedScriptVersion ? (
              <MetadataPanel
                titles={metadataTitlesDraft}
                tags={metadataTagsDraft}
                tagInput={metadataTagInputDraft}
                tagSuggestions={metadataTagSuggestions}
                descriptionShort={metadataDescriptionShortDraft}
                descriptionLong={metadataDescriptionLongDraft}
                previewMode={metadataPreviewMode}
                saveState={metadataSaveState}
                saveError={metadataSaveError}
                disabled={isApprovingScript || !episodePackage}
                onTitleChange={onMetadataTitleChange}
                onSetPrimaryTitle={onMetadataSetPrimaryTitle}
                onTagInputChange={setMetadataTagInputDraft}
                onAddTagFromInput={onMetadataAddTagFromInput}
                onRemoveTag={onMetadataRemoveTag}
                onAddTagSuggestion={onMetadataAddTagSuggestion}
                onDescriptionShortChange={onMetadataDescriptionShortChange}
                onDescriptionLongChange={onMetadataDescriptionLongChange}
                onPreviewModeChange={onMetadataPreviewModeChange}
              />
            ) : null}

            <div className="hs-ai-shortcut-row" role="group" aria-label="Chat shortcuts">
              <button type="button" onClick={() => onUseChatShortcut("Create a clear outline for this Episode.")}>
                Outline
              </button>
              <button type="button" onClick={() => onUseChatShortcut("Find strong sources I should cite for this Episode.")}>
                Find sources
              </button>
              <button type="button" onClick={() => onUseChatShortcut("Write a record-ready script using canonical Anvil tags.")}>
                Write script
              </button>
            </div>

            <div className="hs-ai-chat-compose">
              <select
                aria-label="Voice lane"
                value={sttLane}
                onChange={(event) => setSttLane(event.target.value as SttLane)}
                className="stt-lane-select"
                disabled={sttState !== "idle"}
                title={
                  sttState !== "idle"
                    ? "Voice lane is locked while listening/transcribing."
                    : !hasBrowserSpeech
                      ? "Browser speech not supported"
                      : undefined
                }
              >
                <option value="browser" disabled={!hasBrowserSpeech}>
                  Browser (Free)
                </option>
                <option value="ai">AI</option>
              </select>
              <button
                type="button"
                onClick={onToggleMic}
                className={`mic-button ${sttState}`}
                title={
                  sttState === "idle"
                    ? sttLane === "browser"
                      ? "Voice (Free)"
                      : "Voice (AI)"
                    : sttState === "listening"
                      ? "Listening... tap to stop"
                      : "Transcribing..."
                }
              >
                {sttState === "idle" ? "🎙️" : null}
                {sttState === "listening" ? "🔴🎙️" : null}
                {sttState === "transcribing" ? "⏳🎙️" : null}
              </button>
              <div className="hs-ai-chat-inputWrap">
                {sttState === "listening" ? (
                  <div className="hs-stt-inputPanel" role="status" aria-live="polite">
                    <OscilloscopeFill stream={mediaStreamRef.current} active />
                    <div className="hs-stt-hint">Listening... tap 🎙️ to stop</div>
                  </div>
                ) : (
                  <textarea
                    ref={chatInputRef}
                    value={chatDraft}
                    onChange={(event) => setChatDraft(event.target.value)}
                    placeholder={aiEpisodeReady ? "Talk it out... paste links... ask for an outline..." : "Select an Episode or Spark to start."}
                    className="hs-ai-chat-input"
                    rows={2}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" || event.shiftKey) return;
                      event.preventDefault();
                      void onSendChat();
                    }}
                    disabled={isAiProcessing || aiCreditsDepleted || !aiEpisodeReady}
                  />
                )}
              </div>
              {isAiProcessing ? (
                <button type="button" onClick={onCancelAiRequest}>
                  Cancel
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void onSendChat()}
                disabled={isAiProcessing || aiCreditsDepleted || !aiEpisodeReady || !chatDraft.trim()}
              >
                {isAiProcessing ? "Sending..." : "Send"}
              </button>
            </div>
            {devMode && sttPreview ? (
              <div className="hs-field-label-muted">{sttPreview}</div>
            ) : null}
            {sttNotice ? (
              <div className="hs-field-label-muted">{sttNotice}</div>
            ) : null}
            {sttError ? (
              <div className="hs-error-text-small">{sttError}</div>
            ) : null}
          </section>

          {showScriptEditor ? (
            <section className="hs-script-panel" aria-label="Manual draft editor">
              <header className="hs-script-panel-header">
                <div className="hs-script-panel-title">
                  {showScriptPanel && hasScript ? "Script" : "Manual Draft"}
                </div>
                <div className="hs-script-panel-header-actions">
                  {scriptPanelCopyMessage ? (
                    <div className="hs-field-label-muted">{scriptPanelCopyMessage}</div>
                  ) : null}
                  <div className="hs-script-panel-meta">Sources: {sourcesSummary}{unusedSummary}</div>
                  <button
                    type="button"
                    className="hs-script-panel-copy"
                    onClick={() => void onCopyScriptPanelText()}
                    disabled={!activeDraft || !activeDraft.body.trim()}
                    title="Copy panel text to clipboard"
                    aria-label="Copy panel text to clipboard"
                  >
                    <CopyIcon />
                    <span>Copy</span>
                  </button>
                </div>
              </header>

              <label className="hs-field">
                <span className="hs-field-label">Body</span>
                <textarea
                  ref={bodyRef}
                  value={activeDraft?.body ?? ""}
                  placeholder="Start writing..."
                  onChange={(event) => {
                    setScriptValidation(null);
                    setActiveDraft((prev) => {
                      if (!prev) return prev;
                      draftEditVersionRef.current += 1;
                      return { ...prev, body: event.target.value };
                    });
                  }}
                  onCompositionStart={() => setIsBodyComposing(true)}
                  onCompositionEnd={() => setIsBodyComposing(false)}
                  onSelect={(event) => {
                    const target = event.target as HTMLTextAreaElement;
                    setCursorPosition(target.selectionStart);
                  }}
                  onKeyUp={(event) => {
                    const target = event.target as HTMLTextAreaElement;
                    setCursorPosition(target.selectionStart);
                  }}
                  onScroll={(event) => {
                    const target = event.target as HTMLTextAreaElement;
                    setScrollTop(target.scrollTop);
                  }}
                  disabled={!activeDraft}
                  className="hs-textarea-body hs-textarea-script-panel"
                />
              </label>

              <div className="hs-sources-row">
                <span className="hs-sources-summary">Sources: {sourcesSummary}{unusedSummary}</span>
                <button
                  type="button"
                  onClick={() => {
                    setFocusTab("sources");
                    setMode("focus");
                  }}
                  disabled={!workpieceId}
                >
                  Review sources
                </button>
              </div>
            </section>
          ) : null}
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
                    onClick={() => {
                      setSelectedRevision(revision);
                      setRevisionView("preview");
                    }}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRevision(revision);
                      setRevisionView("compare");
                    }}
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
                  onChange={(event) => {
                    setSelectedRevision({ ...selectedRevision, note: event.target.value });
                  }}
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
              {draft ? (
                <div className="hs-workpiece-actions">
                  <button type="button" onClick={() => void saveDraftMeta(draft, { pinned: !draft.pinned })}>
                    {draft.pinned ? "Unpin" : "Pin"}
                  </button>
                  <button type="button" onClick={() => void saveDraftMeta(draft, { archived: !draft.archived })}>
                    {draft.archived ? "Unarchive" : "Archive"}
                  </button>
                  <button type="button" onClick={() => void onDeleteDraft(draft)}>
                    Delete
                  </button>
                </div>
              ) : null}
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
                  disabled={removingReadyIds.includes(entry.id)}
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
    <section className={`hs-shell${isMobile ? " hs-shell--mobile" : ""}`}>
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
                <div className="hs-ready-record-chips" role="group" aria-label="Ready queue category filters">
                  <button
                    type="button"
                    className={`hs-ready-chip${readyCategoryFilter === "all" ? " is-active" : ""}`}
                    onClick={() => setReadyCategoryFilter("all")}
                  >
                    All ({readyTotalCount})
                  </button>
                  {HEARTH_CONTENT_CATEGORIES.map((category) => (
                    <button
                      key={category}
                      type="button"
                      className={`hs-ready-chip${readyCategoryFilter === category ? " is-active" : ""}`}
                      onClick={() => setReadyCategoryFilter(category)}
                    >
                      {READY_CATEGORY_LABEL[category]} ({readyCategoryCounts[category]})
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`hs-ready-chip${readyCategoryFilter === "uncategorized" ? " is-active" : ""}`}
                    onClick={() => setReadyCategoryFilter("uncategorized")}
                  >
                    Uncategorized ({readyCategoryCounts.uncategorized})
                  </button>
                </div>
                <div className="hs-ready-record-chips" role="group" aria-label="Ready queue urgency filters">
                  <button
                    type="button"
                    className={`hs-ready-chip${readyUrgencyFilter === "all" ? " is-active" : ""}`}
                    onClick={() => setReadyUrgencyFilter("all")}
                  >
                    Urgency: All ({categoryFilteredReadyScripts.length})
                  </button>
                  <button
                    type="button"
                    className={`hs-ready-chip${readyUrgencyFilter === "fresh" ? " is-active" : ""}`}
                    onClick={() => setReadyUrgencyFilter("fresh")}
                  >
                    Fresh ({readyUrgencyCounts.fresh})
                  </button>
                  <button
                    type="button"
                    className={`hs-ready-chip${readyUrgencyFilter === "cooling" ? " is-active" : ""}`}
                    onClick={() => setReadyUrgencyFilter("cooling")}
                  >
                    Cooling ({readyUrgencyCounts.cooling})
                  </button>
                  <button
                    type="button"
                    className={`hs-ready-chip${readyUrgencyFilter === "cold" ? " is-active" : ""}`}
                    onClick={() => setReadyUrgencyFilter("cold")}
                  >
                    Cold ({readyUrgencyCounts.cold})
                  </button>
                </div>
                {readyScriptsError ? <div className="hs-error-text-small">{readyScriptsError}</div> : null}
                {readyCategoryError ? <div className="hs-error-text-small">{readyCategoryError}</div> : null}
                <div className="hs-rail-meta">Approved scripts stay here until a recording asset is committed.</div>
                {isReadyScriptsLoading ? <p>Loading queue...</p> : null}
                {!isReadyScriptsLoading && filteredReadyScripts.length === 0 ? (
                  <p className="hs-rail-meta">
                    {readyTotalCount === 0
                      ? removedReadyCount > 0
                        ? "All ready items are hidden. Restore hidden items to show them here."
                        : "No items yet. Approve a script to populate this queue."
                      : readyUrgencyFilter !== "all"
                        ? "No scripts match this urgency filter."
                        : "No scripts match this category filter."}
                  </p>
                ) : null}
                {groupedReadyScripts.length > 0 ? (
                  <div className="hs-ready-record-groups">
                    {groupedReadyScripts.map((section) => (
                      <div key={section.key} className="hs-ready-record-group">
                        <div className="hs-ready-record-group-title">{section.label}</div>
                        <ul className="hs-ready-record-list">
                          {section.entries.map((entry) => {
                            const anvilHref = resolveReadyOpenHref(entry);
                            const urgency = deriveReadyUrgency(entry);
                            return (
                              <li key={entry.id} className="hs-ready-record-item">
                                <button
                                  type="button"
                                  className="hs-ready-record-link"
                                  onClick={() => void onOpenReadyScriptInHearth(entry)}
                                >
                                  <div className="hs-ready-record-title">{entry.title}</div>
                                </button>
                                <div className="hs-ready-record-meta-row">
                                  <div className="hs-ready-record-meta">
                                    {resolveReadyAttribution(entry)}
                                  </div>
                                  {urgency ? (
                                    <span className={`hs-ready-urgency-badge is-${urgency}`}>
                                      {READY_URGENCY_LABEL[urgency]}
                                    </span>
                                  ) : null}
                                </div>
                                <label className="hs-ready-record-label">
                                  <span>Category</span>
                                  <select
                                    value={entry.contentCategory ?? ""}
                                    disabled={updatingReadyCategoryId === entry.id}
                                    onChange={(event) => {
                                      const value = event.target.value;
                                      const nextCategory = value ? value as HearthContentCategory : null;
                                      void onSetReadyScriptCategory(entry, nextCategory);
                                    }}
                                  >
                                    <option value="">Uncategorized</option>
                                    {HEARTH_CONTENT_CATEGORIES.map((category) => (
                                      <option key={category} value={category}>{READY_CATEGORY_LABEL[category]}</option>
                                    ))}
                                  </select>
                                </label>
                                <button
                                  type="button"
                                  onClick={() => void onOpenReadyScriptInHearth(entry)}
                                >
                                  Open in Hearth
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!anvilHref) return;
                                    window.location.assign(anvilHref);
                                  }}
                                  disabled={!anvilHref}
                                >
                                  Open in Anvil
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
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
                    return (
                      <li key={item.workpieceId}>
                        <div
                          className={`hs-workpiece-card${isActive ? " is-active" : ""}`}
                        >
                          {isEditing ? (
                            <input
                              aria-label="Edit project title"
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
                          ) : (
                            <button
                              onClick={() => void openWorkpieceInFocus(item.workpieceId, {
                                preferredDraftId: item.draftId,
                              })}
                              className="hs-workpiece-button"
                            >
                              <div className="hs-workpiece-title-row">
                                <div className="hs-workpiece-title">{item.title}</div>
                                {draft?.pinned ? (
                                  <span className="hs-workpiece-pin" aria-label="Pinned" title="Pinned">
                                    PIN
                                  </span>
                                ) : null}
                              </div>
                              <div className="hs-workpiece-updated">
                                Updated {formatUpdatedAt(updatedAt)}
                              </div>
                              <div className="hs-workpiece-updated">
                                {draft ? `Last edited by ${resolveDraftEditorName(draft)}` : "No attached draft buffer yet"}
                              </div>
                            </button>
                          )}
                          <div className="hs-workpiece-revisions">
                            Revisions {draft?.revisionCount ?? "-"}
                          </div>
                          {draft ? (
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
                                  setEditingDraftId(draft.id);
                                  setEditingTitle(draft.title);
                                }}
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                onClick={() => void saveDraftMeta(draft, { archived: !draft.archived })}
                              >
                                {draft.archived ? "Unarchive" : "Archive"}
                              </button>
                              <button type="button" onClick={() => void onDeleteDraft(draft)}>
                                Delete
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}

          {hasActiveEpisode ? (
            <div className="hs-active-workpiece">
              <div className="hs-rail-heading">Active workpiece</div>
              <button
                type="button"
                onClick={() => void onOpenInAnvil()}
                disabled={!openInAnvilHref}
                className="hs-mode-button"
              >
                Open in Anvil
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
            </div>
          ) : null}

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
              <div className="hs-mobile-overlay-actions">
                <button type="button" onClick={() => activeDraft && void onDeleteDraft(activeDraft)} disabled={!activeDraft || isSaving}>
                  Delete
                </button>
                <button type="button" onClick={() => void onSaveDraft()} disabled={!activeDraft || isSaving}>
                  {isSaving ? "Saving..." : "Save"}
                </button>
              </div>
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
                onClick={() => {
                  setRevisionModalOpen(false);
                  setRevisionNote("");
                  setRevisionKind("manual");
                }}
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

