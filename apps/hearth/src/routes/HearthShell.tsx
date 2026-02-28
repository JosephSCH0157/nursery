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
  upsertBarStockSpark,
  writeBarStockSparks,
} from "../lib/barstock-sparks";
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
import { commitHearthPrimaryScript, getHearthPrimaryScriptPath } from "../lib/hearth-script-repo";
import {
  HEARTH_CONTENT_CATEGORIES,
  listHearthReadyScripts,
  setHearthReadyScriptCategory,
  type HearthContentCategory,
  type HearthReadyScript,
} from "../lib/hearth-ready-scripts";
import { resolveTongsApiToken } from "../lib/tongs-fetch";
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
import { generateEpisodeThumbnail, readEpisodePackageForWorkpiece } from "../lib/hearth-thumbnail-api";
import type { EpisodePackageV2 } from "../lib/episode-package-v2";

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
const AI_STT_MAX_DURATION_MS = 5 * 60 * 1000;
const AI_STT_MAX_BYTES = 10 * 1024 * 1024;
const STT_INLINE_FEEDBACK_MS = 2200;
const STT_PREVIEW_MAX_CHARS = 80;
const ANVIL_SCRIPT_PATH = getHearthPrimaryScriptPath();

type HearthMode = "sparks" | "draft" | "planning" | "sources" | "revisions";
type ProductionAction = "seo" | "tags" | "thumbnails" | "image_beat_sheet";
type SttLane = "browser" | "ai";
type SttState = "idle" | "listening" | "transcribing";

type ScriptApprovalState = {
  hasApprovedScript: boolean;
  approvedScriptVersion: number | null;
  approvedAt: number | null;
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
    if (
      trimmed === "sparks"
      || trimmed === "draft"
      || trimmed === "planning"
      || trimmed === "sources"
      || trimmed === "revisions"
    ) {
      return trimmed;
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

function parseIsoTimestamp(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
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

const READY_URGENCY_RANK: Record<ReadyUrgencyLevel, number> = {
  fresh: 0,
  warming: 1,
  cooling: 2,
  cold: 3,
};

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

function formatSparkStatus(spark: BarStockSpark): { label: string; detail?: string } {
  const workpieceId = spark.links?.hearthWorkpieceId ?? spark.links?.hearthDraftId ?? null;
  if (workpieceId) {
    const shortId = workpieceId.length > 8 ? workpieceId.slice(0, 8) : workpieceId;
    return { label: "Used", detail: shortId };
  }
  if (spark.status === "forged") {
    return { label: "Used" };
  }
  return { label: "Unused" };
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
  const store = useMemo(() => createHearthStore(storeKind), [storeKind]);
  const sessionStore = useMemo(() => new LocalSessionStore(), []);

  const [selectedMode, setSelectedMode] = useState<HearthMode>("sparks");
  const modeTouchedRef = useRef(false);
  const [sparks, setSparks] = useState<BarStockSpark[]>(() => readBarStockSparks());
  const [selectedSparkId, setSelectedSparkId] = useState<string | null>(null);
  const [forgeError, setForgeError] = useState<string | null>(null);
  const [isForging, setIsForging] = useState(false);

  const [workspaceId, setWorkspaceId] = useState<string | null>(() => resolveWorkspaceId());
  const [workpieceId, setWorkpieceId] = useState<string | null>(() => resolveWorkpieceId());

  const [planningSession, setPlanningSession] = useState<HearthPlanningSession | null>(() =>
    readHearthPlanningSessionCache(resolveWorkpieceId()),
  );
  const [sessionTouched, setSessionTouched] = useState(false);
  const [decisionDraft, setDecisionDraft] = useState("");

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeDraft, setActiveDraft] = useState<Draft | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [selectedRevision, setSelectedRevision] = useState<Revision | null>(null);
  const [draftSnapshot, setDraftSnapshot] = useState<DraftSnapshot | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isSavingRevision, setIsSavingRevision] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
    readScriptApprovalState(resolveWorkpieceId()),
  );
  const [pendingAiProposal, setPendingAiProposal] = useState<PendingAiProposal | null>(null);
  const [isApplyingAiOps, setIsApplyingAiOps] = useState(false);
  const [isApprovingScript, setIsApprovingScript] = useState(false);
  const [activeProductionAction, setActiveProductionAction] = useState<ProductionAction | null>(null);
  const [aiRuntimeWarning, setAiRuntimeWarning] = useState<string | null>(null);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiTokenBalance, setAiTokenBalance] = useState<number | null>(null);
  const [aiBillingMode, setAiBillingMode] = useState<HearthAiLane>(() => resolveAiLaneFromStorage());
  const [episodePackage, setEpisodePackage] = useState<EpisodePackageV2 | null>(null);
  const [selectedThumbnailConceptId, setSelectedThumbnailConceptId] = useState<string>("");
  const [thumbnailPromptOverride, setThumbnailPromptOverride] = useState("");
  const [thumbnailPreset, setThumbnailPreset] = useState("");
  const [thumbnailAspect, setThumbnailAspect] = useState<"16:9" | "1:1" | "9:16">("16:9");
  const [isThumbnailGenerating, setIsThumbnailGenerating] = useState(false);
  const [thumbnailGenerateError, setThumbnailGenerateError] = useState<string | null>(null);

  const setMode = useCallback((mode: HearthMode) => {
    modeTouchedRef.current = true;
    setSelectedMode(mode);
  }, []);

  const autosaveTimer = useRef<number | null>(null);
  const autosaveInFlightRef = useRef(false);
  const autosaveQueuedRef = useRef(false);
  const lastAutosaveCommitAtRef = useRef(0);
  const draftEditVersionRef = useRef(0);
  const activeDraftRef = useRef<Draft | null>(null);
  const draftSnapshotRef = useRef<DraftSnapshot | null>(null);
  const sessionSaveTimer = useRef<number | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const sessionCommitRef = useRef<string | null>(null);
  const sessionCommitInFlight = useRef(false);
  const sessionCommitQueued = useRef(false);
  const restoredCursorDraftIdRef = useRef<string | null>(null);
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
  const statusText = isSaving ? "Saving..." : isDirty ? "Unsaved changes" : "Saved";
  const sessionTitle = planningSession?.title ?? "";
  const sessionGoalsText = useMemo(
    () => (planningSession?.goals ?? []).join("\n"),
    [planningSession?.goals],
  );
  const sessionOutlineText = useMemo(
    () => (planningSession?.outline ?? []).join("\n"),
    [planningSession?.outline],
  );
  const sessionDecisions = planningSession?.decisions ?? [];
  const sessionIntent = planningSession?.intent ?? deriveIntentFromOrigin(planningSession?.origin);
  const sessionSparkId = planningSession?.origin?.spark_id ?? planningSession?.links?.spark_id ?? null;
  const sourcesState = useSourcesState(workspaceId, workpieceId, activeDraft?.body ?? "", {
    mode: selectedMode === "sources" ? "full" : "summary",
  });
  const workpieceSources = sourcesState.workpieceSources;
  const sourceIndexById = sourcesState.sourceIndexById;
  const missingSourcesCount = sourcesState.missingCitedCount;
  const unusedSourcesCount = sourcesState.unusedRefsCount;
  const hasActiveConversation = Boolean(activeDraft);
  const showSparksLanding = selectedMode === "sparks" || !hasActiveConversation;
  const openInAnvilHref = useMemo(
    () => buildOpenInAnvilHref(workspaceId, workpieceId),
    [workspaceId, workpieceId],
  );
  const aiCreditsDepleted = aiBillingMode === "forge" && aiTokenBalance != null && aiTokenBalance <= 0;
  const aiEpisodeReady = Boolean(workpieceId?.trim());
  const thumbnailConcepts = episodePackage?.thumbnail.concepts ?? [];
  const thumbnailVersions = episodePackage?.thumbnail.versions ?? [];
  const primaryThumbnailVersionId = episodePackage?.thumbnail.primary_version_id ?? null;
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
  const selectedSpark = useMemo(() => {
    if (sortedSparks.length === 0) return null;
    if (!selectedSparkId) return sortedSparks[0] ?? null;
    return sortedSparks.find((spark) => spark.id === selectedSparkId) ?? sortedSparks[0] ?? null;
  }, [selectedSparkId, sortedSparks]);

  const filteredDrafts = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const filtered = drafts
      .filter((draft) => (showArchived ? true : !draft.archived))
      .filter((draft) => {
        if (!query) return true;
        const title = draft.title.toLowerCase();
        const body = draft.body.toLowerCase();
        return title.includes(query) || body.includes(query);
      });

    const pinned = filtered.filter((draft) => draft.pinned);
    const unpinned = filtered.filter((draft) => !draft.pinned);

    const sortFn = sortKey === "title"
      ? (a: Draft, b: Draft) => a.title.localeCompare(b.title)
      : (a: Draft, b: Draft) => b.updatedAt - a.updatedAt;

    return [...pinned.sort(sortFn), ...unpinned.sort(sortFn)];
  }, [drafts, searchText, sortKey, showArchived]);

  const categoryFilteredReadyScripts = useMemo(() => {
    if (readyCategoryFilter === "all") return readyScripts;
    if (readyCategoryFilter === "uncategorized") {
      return readyScripts.filter((entry) => !entry.contentCategory);
    }
    return readyScripts.filter((entry) => entry.contentCategory === readyCategoryFilter);
  }, [readyCategoryFilter, readyScripts]);

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
    for (const entry of readyScripts) {
      const key: ReadyCategoryGroupKey = entry.contentCategory ?? "uncategorized";
      counts[key] += 1;
    }
    return counts;
  }, [readyScripts]);

  const readyTotalCount = readyScripts.length;

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
    const nowMs = Date.now();
    const sortEntriesForGroup = (entries: HearthReadyScript[], key: ReadyCategoryGroupKey): HearthReadyScript[] => {
      const next = [...entries];
      next.sort((a, b) => {
        const aUpdated = parseIsoTimestamp(a.updatedAt) ?? 0;
        const bUpdated = parseIsoTimestamp(b.updatedAt) ?? 0;

        if (key === "hot_topic" || key === "viral_reaction") {
          const urgencyA = deriveReadyUrgency(a, nowMs);
          const urgencyB = deriveReadyUrgency(b, nowMs);
          const rankA = urgencyA ? READY_URGENCY_RANK[urgencyA] : Number.MAX_SAFE_INTEGER;
          const rankB = urgencyB ? READY_URGENCY_RANK[urgencyB] : Number.MAX_SAFE_INTEGER;
          if (rankA !== rankB) return rankA - rankB;
          if (bUpdated !== aUpdated) return bUpdated - aUpdated;
          return a.title.localeCompare(b.title);
        }

        if (key === "evergreen") {
          const aSort = aUpdated > 0 ? aUpdated : Number.MAX_SAFE_INTEGER;
          const bSort = bUpdated > 0 ? bUpdated : Number.MAX_SAFE_INTEGER;
          if (aSort !== bSort) return aSort - bSort;
          return a.title.localeCompare(b.title);
        }

        if (bUpdated !== aUpdated) return bUpdated - aUpdated;
        return a.title.localeCompare(b.title);
      });
      return next;
    };

    const sections: Array<{ key: string; label: string; entries: HearthReadyScript[] }> = [];
    for (const key of orderedKeys) {
      const entries = grouped.get(key);
      if (!entries || entries.length === 0) continue;
      const label = key === "uncategorized" ? "Uncategorized" : READY_CATEGORY_LABEL[key];
      sections.push({ key, label, entries: sortEntriesForGroup(entries, key) });
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

  const refreshDrafts = useCallback(async () => {
    const list = await store.listDrafts();
    setDrafts(dedupeDraftListById(list));
  }, [store]);

  const refreshRevisions = useCallback(async (draftId: string) => {
    const list = await store.listRevisions(draftId);
    setRevisions(list);
  }, [store]);

  const refreshEpisodePackage = useCallback(async () => {
    const episodeId = workpieceId?.trim() ?? "";
    if (!episodeId) {
      setEpisodePackage(null);
      setSelectedThumbnailConceptId("");
      setThumbnailGenerateError(null);
      return;
    }

    const loaded = await readEpisodePackageForWorkpiece(episodeId);
    if (!loaded.ok) {
      setEpisodePackage(null);
      setThumbnailGenerateError("Unable to load thumbnail metadata.");
      return;
    }

    setEpisodePackage(loaded.episodePackage);
    setThumbnailGenerateError(null);
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
    void refreshReadyScripts();
  }, [refreshReadyScripts]);

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
        splitPane: selectedMode === "revisions",
        selectedTab: uiSelectedTab ?? base.uiState?.selectedTab,
        cursorPosition: cursorPosition ?? base.uiState?.cursorPosition,
        scrollTop: scrollTop ?? base.uiState?.scrollTop,
      },
    };
    setSession(next);
    await sessionStore.saveSession(next);
  }, [cursorPosition, scrollTop, selectedMode, session, sessionStore]);

  const selectDraft = useCallback(async (draft: Draft | null) => {
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
    await refreshRevisions(draft.id);
    await persistSession(draft.id, "draft");
  }, [persistSession, refreshRevisions]);

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

      writeHearthPlanningSessionCache(updated, workpieceId ?? updated.workpiece_id ?? null);
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
            writeHearthPlanningSessionCache(next, workpieceId);
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
    await persistDraft({ draft: activeDraft, updatedAt: now, createRevision: null });
    flushChatHistoryNow({ draftId: activeDraft.id });
  }, [activeDraft, flushChatHistoryNow]);

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
      const token = resolveTongsApiToken();
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

  const createDraftAndOpen = useCallback(async (
    seed?: { title?: string; body?: string },
    mode: HearthMode = "draft",
  ) => {
    const next = createDraft(seed);
    await store.saveDraft(next);
    await refreshDrafts();
    await selectDraft(next);
    setMode(mode);
    return next;
  }, [refreshDrafts, selectDraft, setMode, store]);

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
        setForgeError("Workpiece creation failed; draft created locally.");
        setWorkpieceId(null);
      } else {
        setWorkpieceId(created.workpieceId);
      }
      setWorkspaceId(resolveWorkspaceId());
      applySessionOrigin({ created_from: "scratch" });
      const draft = await createDraftAndOpen(undefined, "draft");
      const nextChatKey = resolveChatHistoryKey(created.ok ? created.workpieceId : null, draft.id);
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
      const scriptSeed = spark.body?.trim()
        ? spark.body
        : `## ${deriveSparkTitle(spark)}\n\n`;
      const created = await createHearthWorkpiece({
        created_from: "bar-stock",
        spark_id: spark.id,
      }, scriptSeed);
      if (!created.ok) {
        setForgeError("Workpiece creation failed; draft created locally.");
        setWorkpieceId(null);
      } else {
        workpieceId = created.workpieceId;
        setWorkpieceId(workpieceId);
      }
      setWorkspaceId(resolveWorkspaceId());
      applySessionOrigin({ created_from: "bar-stock", spark_id: spark.id });

      const draft = await createDraftAndOpen({
        title: spark.title,
        body: spark.body,
      }, "draft");

      const sparkTitle = deriveSparkTitle(spark);
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
      writeBarStockSparks(nextSparks);
      enqueueBarStockSpark(updatedSpark);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Forge failed.";
      setForgeError(message);
    } finally {
      setIsForging(false);
    }
  }, [applySessionOrigin, createDraftAndOpen, isForging, sparks, store]);

  const loadInitial = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [storedSession, list] = await Promise.all([
        sessionStore.getSession(),
        store.listDrafts(),
      ]);

      setSession(storedSession);
      const dedupedDrafts = dedupeDraftListById(list);
      setDrafts(dedupedDrafts);

      const tab = storedSession?.uiState?.selectedTab;
      if (tab === "preview" || tab === "compare" || tab === "list") {
        setRevisionView(tab);
      }

      const explicitWorkpieceSelection = hasExplicitWorkpieceQuery();
      const preferredId = storedSession?.activeDraftId;
      if (explicitWorkpieceSelection && preferredId) {
        const preferredDraft = dedupedDrafts.find((draft) => draft.id === preferredId);
        if (preferredDraft) {
          restoredCursorDraftIdRef.current = null;
          setActiveDraft(preferredDraft);
          setDraftSnapshot({ title: preferredDraft.title, body: preferredDraft.body, updatedAt: preferredDraft.updatedAt });
          await refreshRevisions(preferredDraft.id);
          setSelectedMode("draft");
          return;
        }
      }

      restoredCursorDraftIdRef.current = null;
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
  }, [refreshRevisions, sessionStore, store]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => setSparks(readBarStockSparks());
    refresh();
    const onStorage = (event: StorageEvent) => {
      if (!isBarStockKey(event.key)) return;
      refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (sortedSparks.length === 0) {
      if (selectedSparkId) setSelectedSparkId(null);
      return;
    }
    if (!selectedSparkId) {
      setSelectedSparkId(sortedSparks[0]?.id ?? null);
      return;
    }
    const exists = sortedSparks.some((spark) => spark.id === selectedSparkId);
    if (!exists) {
      setSelectedSparkId(sortedSparks[0]?.id ?? null);
    }
  }, [selectedSparkId, sortedSparks]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refreshSession = () => {
      const cached = readHearthPlanningSessionCache(workpieceId);
      if (cached) {
        setPlanningSession(cached);
        if (!workpieceId && cached.workpiece_id) {
          setWorkpieceId(cached.workpiece_id);
        }
        if (!workspaceId && cached.workspace_id) {
          setWorkspaceId(cached.workspace_id);
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
  }, [workpieceId, workspaceId]);

  useEffect(() => {
    if (!workpieceId) return;
    let cancelled = false;
    readHearthSession(workpieceId)
      .then((session) => {
        if (cancelled || !session) return;
        setPlanningSession(session);
        setSessionTouched(false);
        sessionCommitRef.current = buildSessionFingerprint(session);
        writeHearthPlanningSessionCache(session, workpieceId);
        if (!workspaceId && session.workspace_id) {
          setWorkspaceId(session.workspace_id);
        }
      })
      .catch(() => {});
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
    modeTouchedRef.current = false;
  }, [workpieceId]);

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
    setThumbnailPromptOverride("");
    setThumbnailPreset("");
    setThumbnailAspect("16:9");
  }, [workpieceId]);

  useEffect(() => {
    const stored = readScriptApprovalState(workpieceId);
    setScriptApprovalState(stored);
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
      setSelectedMode("sparks");
      return;
    }

    const saved = readMode(workpieceId);
    if (saved) {
      setSelectedMode(saved);
      return;
    }

    if (modeTouchedRef.current) return;
    const defaultMode = "draft";
    setSelectedMode(defaultMode);
  }, [activeDraft, workpieceId]);

  useEffect(() => {
    setShowManualDraft(false);
    setShowScriptPanel(false);
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
    if (selectedMode === "sparks") return;
    writeMode(workpieceId, selectedMode);
  }, [selectedMode, workpieceId]);

  useEffect(() => {
    if (!activeDraft) return;
    void refreshRevisions(activeDraft.id);
  }, [activeDraft?.id, refreshRevisions]);

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
      const tab = selectedMode === "revisions"
        ? revisionView
        : selectedMode === "sparks"
          ? "draft"
          : selectedMode;
      void persistSession(activeDraft?.id ?? null, tab);
    }, SESSION_SAVE_DELAY_MS);

    return () => {
      if (sessionSaveTimer.current) {
        window.clearTimeout(sessionSaveTimer.current);
        sessionSaveTimer.current = null;
      }
    };
  }, [activeDraft?.id, cursorPosition, persistSession, revisionView, scrollTop, selectedMode]);

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

        const draftIsDirty = draft.title !== snapshot.title || draft.body !== snapshot.body;
        if (!draftIsDirty) {
          continue;
        }

        const now = Date.now();
        const shouldAutoRevision = !lastAutosaveRevisionAt
          || now - lastAutosaveRevisionAt >= AUTOSAVE_REVISION_GAP_MS;

        const saved = await persistDraft({
          draft,
          updatedAt: now,
          createRevision: shouldAutoRevision ? {
            kind: "autosave",
            note: "Autosave",
          } : null,
          syncSources: false,
          syncSession: false,
          showSavingState: false,
        });

        if (saved) {
          lastAutosaveCommitAtRef.current = now;
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
  }): Promise<boolean> {
    const showSavingState = args.showSavingState ?? true;
    if (showSavingState) {
      setIsSaving(true);
    }
    setError(null);
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

      if (args.createRevision) {
        createdRevision = createRevision({
          draftId: args.draft.id,
          title: normalizeTitle(args.draft.title),
          body: args.draft.body,
          kind: args.createRevision.kind,
          note: args.createRevision.note,
        });
        await store.saveRevision(createdRevision);
        revisionCount = (revisionCount ?? revisions.length) + 1;
        lastRevisionAt = createdRevision.createdAt;
        setRevisions((prev) => [createdRevision!, ...prev]);
      }

      const toSave: Draft = {
        ...args.draft,
        title: normalizeTitle(args.draft.title),
        updatedAt: args.updatedAt,
        revisionCount,
        lastRevisionAt,
      };

      await store.saveDraft(toSave);

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

      if (createdRevision) {
        setSelectedRevision(createdRevision);
        setRevisionView("preview");
      }

      const tab = selectedMode === "revisions" ? revisionView : "draft";
      await persistSession(toSave.id, tab);
      if (args.syncSources) {
        sourcesState.syncSources();
      }
      if (args.syncSession) {
        void syncSessionToTongs();
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save draft.";
      setError(message);
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
    try {
      const next = createDraft();
      await store.saveDraft(next);
      await refreshDrafts();
      await selectDraft(next);
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
    const lastDraft = drafts.find((draft) => draft.id === lastDraftId);
    if (!lastDraft) {
      setForgeError("Last project not found.");
      return;
    }
    setForgeError(null);
    await selectDraft(lastDraft);
    setMode("draft");
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
    const confirmDelete = window.confirm("Delete this draft? This cannot be undone.");
    if (!confirmDelete) return;
    setError(null);
    try {
      await store.deleteDraft(draft.id);
      await refreshDrafts();
      if (activeDraft?.id === draft.id) {
        await selectDraft(null);
      }
      await persistSession(activeDraft?.id === draft.id ? null : activeDraft?.id ?? null, "draft");
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

    const snapshot = await store.restoreRevision(revision.id);
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
    await persistDraft({ draft: restored, updatedAt: now, createRevision: null });
    setSelectedRevision(revision);
    setRevisionView("preview");
  }

  async function onUpdateRevisionNote(revision: Revision, note: string) {
    setIsSavingRevision(true);
    try {
      const updated: Revision = {
        ...revision,
        note: note.trim() || undefined,
      };
      await store.saveRevision(updated);
      setRevisions((prev) => prev.map((rev) => (rev.id === updated.id ? updated : rev)));
      setSelectedRevision(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update revision note.";
      setError(message);
    } finally {
      setIsSavingRevision(false);
    }
  }

  function openRevisionPanel() {
    setMode("revisions");
    setRevisionView("list");
    setSelectedRevision(null);
    void persistSession(activeDraft?.id ?? null, "list");
  }

  function closeRevisionPanel() {
    setMode("draft");
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

      const now = Date.now();
      const saved = await persistDraft({
        draft: { ...activeDraft, body: repairedBody, updatedAt: now },
        updatedAt: now,
        createRevision: null,
        syncSources: false,
        syncSession: false,
      });
      if (saved) {
        setScriptValidation(null);
      }

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
          const now = Date.now();
          const saved = await persistDraft({
            draft: { ...nextDraft, updatedAt: now },
            updatedAt: now,
            createRevision: null,
            syncSources: false,
            syncSession: false,
          });
          if (!saved) {
            return;
          }
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
          writeHearthPlanningSessionCache(committedSession, episodeId);
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

      const approvedAt = Date.now();
      const nextState: ScriptApprovalState = {
        hasApprovedScript: true,
        approvedScriptVersion: nextVersion,
        approvedAt,
      };
      setScriptApprovalState(nextState);
      writeScriptApprovalState(episodeId, nextState);

      const markerLines = [
        `🔥 Script Version ${nextVersion} Approved`,
        `script_version: ${nextVersion}`,
        `timestamp: ${new Date(approvedAt).toISOString()}`,
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

      const assistantMessage: HearthChatMessage = { role: "assistant", content: result.assistantText };
      setChatMessages((prev) => [...prev, assistantMessage].slice(-CHAT_HISTORY_MAX_MESSAGES));

      if (args.productionAction && args.productionScriptVersion) {
        await persistProductionArtifact({
          action: args.productionAction,
          scriptVersion: args.productionScriptVersion,
          assistantText: result.assistantText,
        });
      }

      if (!args.productionAction && result.ops.length > 0) {
        setPendingAiProposal({
          assistantText: result.assistantText,
          ops: result.ops,
          selected: result.ops.map(() => true),
          context: episodeContext,
          fromGate: gateAnswering,
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

  async function onGenerateThumbnailVersion() {
    if (isAiProcessing || isApprovingScript || isThumbnailGenerating) return;

    const episodeId = workpieceId?.trim() ?? "";
    const workspace = workspaceId?.trim() ?? "";
    if (!episodeId || !workspace) {
      setThumbnailGenerateError("Select an Episode before generating thumbnails.");
      return;
    }
    if (aiBillingMode === "forge" && aiTokenBalance != null && aiTokenBalance <= 0) {
      setThumbnailGenerateError("No AI credits remaining.");
      return;
    }

    const conceptId = selectedThumbnailConceptId.trim() || null;
    const promptOverride = thumbnailPromptOverride.trim() || null;
    if (!conceptId && !promptOverride) {
      setThumbnailGenerateError("Select a concept or provide a prompt override.");
      return;
    }

    const alwaysApproveSpend = resolveAiThumbnailAutoApproveFromStorage();
    const confirmed = alwaysApproveSpend
      ? true
      : window.confirm("Generate thumbnail? This will spend credits.");
    if (!confirmed) return;

    setIsThumbnailGenerating(true);
    setThumbnailGenerateError(null);
    setAiRuntimeWarning(null);
    try {
      const generated = await generateEpisodeThumbnail({
        workspaceId: workspace,
        workpieceId: episodeId,
        conceptId,
        prompt: promptOverride,
        preset: thumbnailPreset.trim() || null,
        aspect: thumbnailAspect,
        confirmSpend: confirmed,
        alwaysApproveAiSpend: alwaysApproveSpend,
      });
      if (!generated.ok) {
        setThumbnailGenerateError(generated.error);
        return;
      }

      setEpisodePackage(generated.updatedEpisodePackage);
      setSelectedThumbnailConceptId(generated.version.concept_id);
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

  const renderSparksView = () => {
    const resumeDraft = session?.activeDraftId
      ? drafts.find((draft) => draft.id === session.activeDraftId) ?? null
      : null;
    const canResumeLast = Boolean(resumeDraft);
    const selectedSparkStatus = selectedSpark ? formatSparkStatus(selectedSpark) : null;
    const selectedSparkPreview = selectedSpark ? buildSparkPreview(selectedSpark.body) : "";

    return (
      <section className="hs-home hs-sparks-landing">
        <header className="hs-home-header">
          <h2 className="hs-home-title">Hearth</h2>
          <p className="hs-home-subtext">Pick a spark, then start forging in conversation.</p>
        </header>

        <div className="hs-home-actions">
          <button type="button" onClick={() => void startFromScratch()} disabled={isForging}>
            New project
          </button>
          <button type="button" onClick={() => void onResumeLastProject()} disabled={!canResumeLast}>
            Resume last project
          </button>
        </div>
        {resumeDraft ? (
          <div className="hs-resume-context">
            Last: {resumeDraft.title || "Untitled Draft"} · updated {formatRelativeUpdatedAt(resumeDraft.updatedAt)}
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

              {sortedSparks.length === 0 ? (
                <p className="hs-home-empty">
                  No sparks yet. Capture ideas in Bar Stock first.
                </p>
              ) : (
                sortedSparks.map((spark) => {
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
    const selectedThumbnailConcept = thumbnailConcepts.find((concept) => concept.id === selectedThumbnailConceptId) ?? null;
    const recentThumbnailVersionsText = thumbnailVersions
      .slice(-3)
      .reverse()
      .map((version) => `${version.id.slice(0, 8)}:${version.status}`)
      .join(" | ");

    return (
      <section className="hs-draft hs-draft-chat-first">
        <header className="hs-draft-header hs-draft-header-chat-first">
          <div className="hs-draft-title-wrap">
            <div className="hs-draft-title">Project</div>
            <div className="hs-draft-updated">
              Last updated {formatUpdatedAt(activeDraft?.updatedAt)}
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
          <span className="hs-status-text">{statusText}</span>
          <span className="hs-count-text">{wordCount} words · {charCount} chars</span>
        </div>

        {error ? (
          <div className="hs-error-text">{error}</div>
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
              <section className="hs-ai-proposal" aria-label="Thumbnail generation">
                <div className="hs-ai-proposal-header">
                  <div className="hs-ai-proposal-title">Thumbnail Generate</div>
                  <div className="hs-ai-proposal-meta">
                    {thumbnailVersions.length} versions
                    {primaryThumbnailVersionId ? ` · primary ${primaryThumbnailVersionId.slice(0, 8)}` : ""}
                  </div>
                </div>
                <div className="hs-ai-shortcut-row" role="group" aria-label="Thumbnail controls">
                  <select
                    value={selectedThumbnailConceptId}
                    onChange={(event) => setSelectedThumbnailConceptId(event.target.value)}
                    disabled={isThumbnailGenerating}
                  >
                    <option value="">Prompt override</option>
                    {thumbnailConcepts.map((concept) => (
                      <option key={concept.id} value={concept.id}>
                        {concept.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={thumbnailAspect}
                    onChange={(event) => setThumbnailAspect(event.target.value as "16:9" | "1:1" | "9:16")}
                    disabled={isThumbnailGenerating}
                  >
                    <option value="16:9">16:9</option>
                    <option value="1:1">1:1</option>
                    <option value="9:16">9:16</option>
                  </select>
                </div>
                <input
                  type="text"
                  value={thumbnailPreset}
                  onChange={(event) => setThumbnailPreset(event.target.value)}
                  placeholder="Style preset (optional)"
                  disabled={isThumbnailGenerating}
                />
                <textarea
                  className="hs-ai-chat-input"
                  rows={2}
                  value={thumbnailPromptOverride}
                  onChange={(event) => setThumbnailPromptOverride(event.target.value)}
                  placeholder={selectedThumbnailConcept
                    ? `Prompt override (optional). Using concept: ${selectedThumbnailConcept.label}`
                    : "Prompt override (required if no concept selected)"}
                  disabled={isThumbnailGenerating}
                />
                <div className="hs-ai-proposal-actions">
                  <button
                    type="button"
                    onClick={() => void onGenerateThumbnailVersion()}
                    disabled={isThumbnailGenerating || isAiProcessing || isApprovingScript}
                  >
                    {isThumbnailGenerating ? "Generating..." : "Generate"}
                  </button>
                </div>
                {thumbnailGenerateError ? (
                  <div className="hs-error-text-small">{thumbnailGenerateError}</div>
                ) : null}
                {recentThumbnailVersionsText ? (
                  <div className="hs-field-label-muted">Recent: {recentThumbnailVersionsText}</div>
                ) : null}
              </section>
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
                <div className="hs-script-panel-meta">Sources: {sourcesSummary}{unusedSummary}</div>
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
                <button type="button" onClick={() => setMode("sources")} disabled={!workpieceId}>
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

  const mainContent = showSparksLanding
    ? renderSparksView()
    : selectedMode === "planning"
      ? renderPlanningView()
      : selectedMode === "sources"
        ? renderSourcesView()
        : selectedMode === "revisions"
          ? renderRevisionsView()
          : renderDraftView();

  const sourcesBadge = missingSourcesCount > 0 ? String(missingSourcesCount) : null;
  const sourcesBadgeTitle = missingSourcesCount > 0
    ? `Missing cited sources: ${missingSourcesCount}${unusedSourcesCount ? ` · Unused refs: ${unusedSourcesCount}` : ""}`
    : unusedSourcesCount > 0
      ? `Unused refs: ${unusedSourcesCount}`
      : "Sources";

  return (
    <section className="hs-shell">
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
            <button type="button" onClick={() => setMode("sparks")}>
              Sparks
            </button>
          </div>

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
                  ? "No items yet. Approve a script to populate this queue."
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
                        const href = buildOpenInAnvilHref(entry.workspaceId, entry.workpieceId, entry.primaryScriptPath);
                        const updatedTs = parseIsoTimestamp(entry.updatedAt);
                        const urgency = deriveReadyUrgency(entry);
                        return (
                          <li key={entry.id} className="hs-ready-record-item">
                            <div className="hs-ready-record-title">{entry.title}</div>
                            <div className="hs-ready-record-meta-row">
                              <div className="hs-ready-record-meta">
                                {updatedTs ? `Approved ${formatRelativeUpdatedAt(updatedTs)}` : "Approved script"}
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
                              onClick={() => {
                                if (!href) return;
                                window.location.assign(href);
                              }}
                              disabled={!href}
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
            <label className="hs-rail-label">Search workpieces</label>
            <input
              ref={searchRef}
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search title or body"
            />
            <div className="hs-rail-sort">
              <label className="hs-rail-label">Sort</label>
              <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
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
            <div className="hs-rail-heading">Workpieces</div>
            {isLoading ? <p>Loading drafts...</p> : null}
            {!isLoading && drafts.length === 0 ? <p>No drafts yet.</p> : null}
            <ul className="hs-workpieces-list">
              {filteredDrafts.map((draft) => {
                const isActive = activeDraft?.id === draft.id;
                const isEditing = editingDraftId === draft.id;
                return (
                  <li key={draft.id}>
                    <div
                      className={`hs-workpiece-card${isActive ? " is-active" : ""}`}
                    >
                      {isEditing ? (
                        <input
                          value={editingTitle}
                          onChange={(event) => setEditingTitle(event.target.value)}
                          onKeyDown={(event) => {
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
                            if (editingDraftId === draft.id) {
                              void saveDraftMeta(draft, { title: editingTitle });
                              setEditingDraftId(null);
                            }
                          }}
                        />
                      ) : (
                        <button
                          onClick={() => {
                            void selectDraft(draft);
                            setMode("draft");
                          }}
                          className="hs-workpiece-button"
                        >
                          <div className="hs-workpiece-title-row">
                            <div className="hs-workpiece-title">{draft.title || "Untitled Draft"}</div>
                            {draft.pinned ? (
                              <span className="hs-workpiece-pin" aria-label="Pinned" title="Pinned">
                                PIN
                              </span>
                            ) : null}
                          </div>
                          <div className="hs-workpiece-updated">
                            Updated {formatUpdatedAt(draft.updatedAt)}
                          </div>
                        </button>
                      )}
                      <div className="hs-workpiece-revisions">
                        Revisions {draft.revisionCount ?? "-"}
                      </div>
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
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {hasActiveConversation ? (
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
                onClick={() => setMode("draft")}
                className={`hs-mode-button${selectedMode === "draft" ? " is-active" : ""}`}
              >
                Draft
                <span className="hs-mode-meta">{wordCount} words</span>
              </button>
              <button
                type="button"
                onClick={() => setMode("planning")}
                className={`hs-mode-button${selectedMode === "planning" ? " is-active" : ""}`}
              >
                Planning Board
              </button>
              <button
                type="button"
                onClick={() => setMode("sources")}
                className={`hs-mode-button${selectedMode === "sources" ? " is-active" : ""}`}
                title={sourcesBadgeTitle}
              >
                Sources
                {sourcesBadge ? (
                  <span className={`hs-sources-badge${devMode ? " is-dev" : ""}`}>{sourcesBadge}</span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => setMode("revisions")}
                className={`hs-mode-button${selectedMode === "revisions" ? " is-active" : ""}`}
              >
                Revisions
                <span className="hs-mode-meta">{revisions.length}</span>
              </button>
            </div>
          ) : null}
        </aside>

        <main className="hs-main">
          {mainContent}
        </main>
      </div>

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
