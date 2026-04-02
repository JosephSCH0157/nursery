import crypto from "node:crypto";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@forge/tongs";
import {
  AI_USAGE_FEATURE,
  AI_USAGE_LANE,
  AI_USAGE_STATUS,
  AI_USAGE_SUBFEATURE,
  AI_USAGE_TRIGGER,
  type AiUsageFeature,
  type AiUsageSubfeature,
} from "../../../../packages/tongs/src/ai-usage-taxonomy";
import { routeForgeAiRequest } from "../../../../packages/tongs/src/ai-router";
import {
  HEARTH_AI_ROUTES,
  isHearthAiLane as isBillingMode,
  normalizeEpisodeContext,
  normalizeHearthChatMessage as toChatMessage,
  normalizeHearthOps as normalizeOps,
  readHearthBehaviorTemperature as readBehaviorTemperature,
  type EpisodeContext,
  type HearthAiLane as BillingMode,
  type HearthChatMessage as ChatMessage,
  type HearthOp,
} from "../../../hearth/src/lib/hearth-ai-runtime-contract";
import {
  buildEmptyHearthResearchResult,
  buildHearthResearchRequest,
  type HearthResearchResult,
  type HearthResearchRequest,
} from "../../../hearth/src/lib/hearth-research-contract";
import { createHearthResearchRuntime } from "./hearth-research-runtime";
import {
  FORGE_ALLOWED_CHAT_MODELS,
} from "./ai-pricing";
import {
  applyAiTokenDelta as applyAiTokenDeltaShared,
  buildTranscriptionAccounting,
  buildUsageAccounting,
  extractTotalTokens,
  recordAiUsageEvent as recordAiUsageEventShared,
  type AiUsageStatus,
  type AiUsageTrigger,
} from "../ai-usage-accounting";
import type { HearthRuntimeConfig } from "./hearth-runtime-config";

type StructuredReply = {
  assistantText: string;
  ops: HearthOp[];
  scriptText: string | null;
  tagAudit: Record<string, unknown> | null;
};

type ReadinessNudgeCategory = "sourcing" | "risk";

type CreatorProfile = {
  userId: string | null;
  clarifyFirstBias: number;
  outlineFirstBias: number;
  scriptFirstBias: number;
  toneStyle: string;
  riskSensitivity: number;
  confidence: number;
  profileJson: Record<string, unknown>;
};

type WritingProfile = {
  workspaceId: string | null;
  userId: string | null;
  defaultAudience: string | null;
  defaultStructure: string | null;
  styleNotes: string | null;
  lastUsedTonePreset: string | null;
  updatedAt: string | null;
};

type StyleSample = {
  sampleId: string;
  sourceKind: string;
  sourceLabel: string | null;
  sourceWorkpieceId: string | null;
  sourcePath: string | null;
  content: string;
  contentChars: number;
  updatedAt: string | null;
};

type RecentScriptReference = {
  workspaceId: string;
  workpieceId: string;
  scriptPath: string;
  title: string;
  markedReadyAt: string | null;
};

type ScriptExcerpt = {
  title: string;
  scriptPath: string;
  excerpt: string;
};

type CrossProjectReferenceResolution = {
  detected: boolean;
  level: "clear" | "ambiguous" | "unanchored";
  resolvedTitle: string | null;
  candidateTitles: string[];
};

type ReqBody = {
  messages?: unknown;
  episode_context?: unknown;
  behavior?: unknown;
  lane?: unknown;
  action_id?: unknown;
};

type SttReqBody = {
  workpiece_id?: unknown;
  storage_key?: unknown;
  mime_type?: unknown;
  lane?: unknown;
  action_id?: unknown;
};

const STT_MAX_BYTES = 10 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STYLE_SAMPLE_RPC_LIMIT = 10;
const STYLE_SAMPLE_EXCERPT_MAX_CHARS = 320;
const STYLE_SAMPLE_TOTAL_MAX_CHARS = 3_200;
const RECENT_SCRIPT_RPC_LIMIT = 4;
const RECENT_SCRIPT_EXCERPT_MAX_CHARS = 520;
const RECENT_SCRIPT_EXCERPT_TOTAL_MAX_CHARS = 1_800;
const STYLE_CORPUS_SNIPPET_MAX_CHARS = 5_600;
const READINESS_CHECK_RE = /\b(are we ready|ready to record|record now|can i record|good to record|ready for anvil|ship this|go live)\b/i;
const READINESS_DEEP_REVIEW_RE = /\b(again|recheck|double check|deeper|strict|hard mode|harsh|be tough|second pass)\b/i;
const SOURCING_NUDGE_RE = /\b(source|sources|sourcing|citation|citations|cite|evidence|verify|fact[- ]?check|corroborat)\b/i;
const RISK_NUDGE_RE = /\b(risk|risky|legal|defamation|liability|compliance|sensitive claim|hot take)\b/i;
const RECORD_ANYWAY_RE = /\b(record anyway|record now anyway|ok to record anyway|okay to record anyway|go ahead and record)\b/i;
const CDC_REQUEST_RE = /\b(cdc|contextual data composite|chart|graph|plot|dataset|bar chart|line chart|pie chart)\b/i;
const RESEARCH_INTENT_RE = /\b(browse|look up|lookup|find(?: me)?|search|news|reports?|reporting|examples?|case studies?|incidents?|breach(?:es)?|source|sources|citations?|evidence)\b/i;
const CROSS_PROJECT_REFERENCE_RE = /\b(use|pull in|bring in|remember|recall|like|from)\b[\s\S]{0,120}\b(script|episode|project|conversation|workspace|last week|other chat|that)\b/i;
const ALLOWED_CHAT_MODELS = new Set<string>(FORGE_ALLOWED_CHAT_MODELS);
const DEFAULT_CREATOR_PROFILE: CreatorProfile = {
  userId: null,
  clarifyFirstBias: 0.5,
  outlineFirstBias: 0.5,
  scriptFirstBias: 0.5,
  toneStyle: "neutral_conversational",
  riskSensitivity: 0.5,
  confidence: 0.0,
  profileJson: {},
};

const DEFAULT_WRITING_PROFILE: WritingProfile = {
  workspaceId: null,
  userId: null,
  defaultAudience: null,
  defaultStructure: null,
  styleNotes: null,
  lastUsedTonePreset: "neutral_conversational",
  updatedAt: null,
};

const MISSING_OPENAI_TEXT_API_KEY_ERROR = "Missing OPENAI_TEXT_API_KEY (or OPENAI_API_KEY) in server env";

function jsonResponse(status: number, obj: unknown): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function readBearerToken(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const trimmed = headerValue.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return null;
  const token = trimmed.slice(7).trim();
  return token || null;
}

async function readJsonBody(request: Request): Promise<unknown> {
  const method = (request.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return {};
  const text = await request.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readErrorText(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const row = payload as Record<string, unknown>;
  const message = readOptionalString(row.error) ?? readOptionalString(row.message);
  return message ?? fallback;
}

function readOptionalNumber(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  return value;
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function isUuid(value: string | null): value is string {
  return !!value && UUID_RE.test(value);
}

function normalizeCreatorProfile(payload: unknown): CreatorProfile {
  const rowRaw = Array.isArray(payload) ? payload[0] : payload;
  if (!isRecord(rowRaw)) return { ...DEFAULT_CREATOR_PROFILE };
  const profileJson = isRecord(rowRaw.profile_json)
    ? rowRaw.profile_json
    : {};
  return {
    userId: readOptionalString(rowRaw.user_id),
    clarifyFirstBias: clamp01(readOptionalNumber(rowRaw.clarify_first_bias) ?? DEFAULT_CREATOR_PROFILE.clarifyFirstBias),
    outlineFirstBias: clamp01(readOptionalNumber(rowRaw.outline_first_bias) ?? DEFAULT_CREATOR_PROFILE.outlineFirstBias),
    scriptFirstBias: clamp01(readOptionalNumber(rowRaw.script_first_bias) ?? DEFAULT_CREATOR_PROFILE.scriptFirstBias),
    toneStyle: readOptionalString(rowRaw.tone_style) ?? DEFAULT_CREATOR_PROFILE.toneStyle,
    riskSensitivity: clamp01(readOptionalNumber(rowRaw.risk_sensitivity) ?? DEFAULT_CREATOR_PROFILE.riskSensitivity),
    confidence: clamp01(readOptionalNumber(rowRaw.confidence) ?? DEFAULT_CREATOR_PROFILE.confidence),
    profileJson,
  };
}

function normalizeWritingProfile(payload: unknown): WritingProfile {
  const rowRaw = Array.isArray(payload) ? payload[0] : payload;
  if (!isRecord(rowRaw)) return { ...DEFAULT_WRITING_PROFILE };
  const workspaceId = readOptionalString(rowRaw.workspace_id);
  const userId = readOptionalString(rowRaw.user_id);
  const tonePreset = readOptionalString(rowRaw.last_used_tone_preset);
  return {
    workspaceId: isUuid(workspaceId) ? workspaceId : null,
    userId: isUuid(userId) ? userId : null,
    defaultAudience: readOptionalString(rowRaw.default_audience),
    defaultStructure: readOptionalString(rowRaw.default_structure),
    styleNotes: readOptionalString(rowRaw.style_notes),
    lastUsedTonePreset: tonePreset ? tonePreset.toLowerCase() : DEFAULT_WRITING_PROFILE.lastUsedTonePreset,
    updatedAt: readOptionalString(rowRaw.updated_at),
  };
}

function normalizeStyleSample(payload: unknown): StyleSample | null {
  if (!isRecord(payload)) return null;
  const sampleId = readOptionalString(payload.sample_id);
  const content = readOptionalString(payload.content);
  if (!isUuid(sampleId) || !content) return null;
  return {
    sampleId,
    sourceKind: readOptionalString(payload.source_kind)?.toLowerCase() ?? "other",
    sourceLabel: readOptionalString(payload.source_label),
    sourceWorkpieceId: readOptionalString(payload.source_workpiece_id),
    sourcePath: readOptionalString(payload.source_path),
    content,
    contentChars: Math.max(0, Math.floor(readOptionalNumber(payload.content_chars) ?? content.length)),
    updatedAt: readOptionalString(payload.updated_at),
  };
}

function normalizeStyleSamples(payload: unknown): StyleSample[] {
  const rows = Array.isArray(payload) ? payload : (payload ? [payload] : []);
  const out: StyleSample[] = [];
  for (const row of rows) {
    const normalized = normalizeStyleSample(row);
    if (normalized) out.push(normalized);
  }
  return out;
}

function normalizeRecentScriptReference(payload: unknown): RecentScriptReference | null {
  if (!isRecord(payload)) return null;
  const workspaceId = readOptionalString(payload.workspace_id);
  const workpieceId = readOptionalString(payload.workpiece_id);
  const scriptPath = normalizeRelativePath(readOptionalString(payload.script_path));
  if (!isUuid(workspaceId) || !isUuid(workpieceId) || !scriptPath) return null;
  return {
    workspaceId,
    workpieceId,
    scriptPath,
    title: readOptionalString(payload.title) ?? `Episode ${workpieceId.slice(0, 8)}`,
    markedReadyAt: readOptionalString(payload.marked_ready_at),
  };
}

function normalizeRecentScriptReferences(payload: unknown): RecentScriptReference[] {
  const rows = Array.isArray(payload) ? payload : (payload ? [payload] : []);
  const out: RecentScriptReference[] = [];
  for (const row of rows) {
    const normalized = normalizeRecentScriptReference(row);
    if (normalized) out.push(normalized);
  }
  return out;
}

function normalizeRelativePath(value: string | null): string | null {
  const path = readOptionalString(value);
  if (!path) return null;
  if (path.startsWith("/")) return null;
  if (path.includes("..")) return null;
  if (path.includes("\\")) return null;
  return path;
}

function condenseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function buildStyleCorpusSnippet(args: {
  styleSamples: StyleSample[];
  recentScriptExcerpts: ScriptExcerpt[];
}): string {
  const lines: string[] = [];
  if (args.recentScriptExcerpts.length > 0) {
    lines.push("Recent approved script cues (voice-only, not factual authority):");
    for (let index = 0; index < args.recentScriptExcerpts.length; index += 1) {
      const item = args.recentScriptExcerpts[index];
      lines.push(`- Script ${index + 1}: ${item.title} [${item.scriptPath}] -> ${item.excerpt}`);
    }
  }
  if (args.styleSamples.length > 0) {
    lines.push("Imported style sample cues (voice-only, not factual authority):");
    for (let index = 0; index < args.styleSamples.length; index += 1) {
      const item = args.styleSamples[index];
      const label = item.sourceLabel ?? `sample-${index + 1}`;
      lines.push(`- Sample ${index + 1}: ${label} [${item.sourceKind}] -> ${item.content}`);
    }
  }
  if (lines.length === 0) return "";
  lines.push("Mirror cadence, phrasing, and framing from these cues while keeping facts bound to episode_context.");
  const joined = lines.join("\n");
  if (joined.length <= STYLE_CORPUS_SNIPPET_MAX_CHARS) return joined;
  const cap = Math.max(0, STYLE_CORPUS_SNIPPET_MAX_CHARS - 3);
  return `${joined.slice(0, cap)}...`;
}

function compactSpaces(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function hasExplicitDraftNow(text: string): boolean {
  const normalized = compactSpaces(text);
  return /\bdraft now\b/i.test(normalized)
    || /\bskip questions\b/i.test(normalized)
    || /\bno questions\b/i.test(normalized);
}

function hasExplicitDeliverableKeyword(text: string): boolean {
  const normalized = compactSpaces(text);
  return /\boutline\b/.test(normalized)
    || /\bscript\b/.test(normalized)
    || /\bdraft\b/.test(normalized)
    || /\btitles?\b/.test(normalized)
    || /\bhook\b/.test(normalized)
    || /\bshort-form\b/.test(normalized)
    || /\bshorts?\b/.test(normalized)
    || /\bmonetization\b/.test(normalized)
    || /\brelease prep\b/.test(normalized)
    || /\bperformance pass\b/.test(normalized)
    || /\bbullet points?\b/.test(normalized)
    || /\bcold open\b/.test(normalized)
    || /\bsegments?\b/.test(normalized)
    || /\bthumbnail\b/.test(normalized)
    || /\bimage beat sheet\b/.test(normalized)
    || /\bseo\b/.test(normalized)
    || /\btags?\b/.test(normalized);
}

function requestedOutline(text: string): boolean {
  return /\boutline\b/i.test(compactSpaces(text));
}

function requestedScript(text: string): boolean {
  const normalized = compactSpaces(text);
  return /\bscript\b/.test(normalized)
    || /\bdraft\b/.test(normalized)
    || /\bcold open\b/.test(normalized)
    || /\bsegments?\b/.test(normalized);
}

function isReadinessCheckRequest(text: string): boolean {
  const normalized = compactSpaces(text);
  return READINESS_CHECK_RE.test(normalized);
}

function requestedDeepReadinessReview(text: string): boolean {
  const normalized = compactSpaces(text);
  return READINESS_DEEP_REVIEW_RE.test(normalized);
}

function detectReadinessNudgeCategory(text: string): ReadinessNudgeCategory | null {
  const normalized = compactSpaces(text);
  if (!normalized) return null;
  if (SOURCING_NUDGE_RE.test(normalized)) return "sourcing";
  if (RISK_NUDGE_RE.test(normalized)) return "risk";
  return null;
}

function isResearchIntentRequest(text: string): boolean {
  const normalized = compactSpaces(text);
  if (!normalized) return false;
  if (RESEARCH_INTENT_RE.test(normalized)) return true;
  return /\breach\b/.test(normalized) && /\breport(?:ing|s)?\b/.test(normalized);
}

function isCrossProjectReferenceRequest(text: string): boolean {
  const normalized = compactSpaces(text);
  if (!normalized) return false;
  if (!CROSS_PROJECT_REFERENCE_RE.test(normalized)) return false;
  if (/\bthis script\b/.test(normalized) || /\bthis episode\b/.test(normalized) || /\bthis project\b/.test(normalized)) {
    return false;
  }
  return /\bthat\b/.test(normalized)
    || /\banother\b/.test(normalized)
    || /\bother\b/.test(normalized)
    || /\blast week\b/.test(normalized)
    || /\bfrom\b/.test(normalized)
    || /\bremember\b/.test(normalized)
    || /\brecall\b/.test(normalized)
    || /\bworkspace\b/.test(normalized);
}

function tokenizeReferenceText(value: string): string[] {
  const stop = new Set([
    "the",
    "that",
    "this",
    "with",
    "from",
    "into",
    "for",
    "and",
    "our",
    "your",
    "script",
    "episode",
    "project",
    "conversation",
    "workspace",
    "week",
    "last",
    "like",
    "use",
    "pull",
    "bring",
    "remember",
    "recall",
  ]);
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !stop.has(token));
}

function resolveCrossProjectReference(args: {
  requestText: string;
  currentWorkpieceId: string;
  references: RecentScriptReference[];
}): CrossProjectReferenceResolution {
  if (!isCrossProjectReferenceRequest(args.requestText)) {
    return {
      detected: false,
      level: "unanchored",
      resolvedTitle: null,
      candidateTitles: [],
    };
  }
  const candidates = args.references.filter((ref) => ref.workpieceId !== args.currentWorkpieceId);
  if (candidates.length === 0) {
    return {
      detected: true,
      level: "unanchored",
      resolvedTitle: null,
      candidateTitles: [],
    };
  }

  const requestNormalized = compactSpaces(args.requestText).toLowerCase();
  const requestTokens = new Set(tokenizeReferenceText(args.requestText));
  const scored = candidates.map((ref) => {
    const title = ref.title.trim();
    const titleNormalized = compactSpaces(title).toLowerCase();
    const titleTokens = tokenizeReferenceText(title);
    let score = 0;
    if (titleNormalized && requestNormalized.includes(titleNormalized)) {
      score += 100;
    }
    for (const token of titleTokens) {
      if (requestTokens.has(token)) score += 1;
    }
    return { ref, score };
  }).sort((left, right) => right.score - left.score);

  const top = scored[0];
  const second = scored[1];
  if (!top || top.score <= 0) {
    return {
      detected: true,
      level: "unanchored",
      resolvedTitle: null,
      candidateTitles: [],
    };
  }

  if (top.score >= 100 || (top.score >= 3 && (!second || top.score - second.score >= 2))) {
    return {
      detected: true,
      level: "clear",
      resolvedTitle: top.ref.title,
      candidateTitles: [top.ref.title],
    };
  }

  const ambiguousTitles = scored
    .filter((entry) => entry.score > 0)
    .slice(0, 2)
    .map((entry) => entry.ref.title);
  if (ambiguousTitles.length >= 2) {
    return {
      detected: true,
      level: "ambiguous",
      resolvedTitle: null,
      candidateTitles: ambiguousTitles,
    };
  }

  return {
    detected: true,
    level: "clear",
    resolvedTitle: top.ref.title,
    candidateTitles: [top.ref.title],
  };
}

function splitAssistantSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const matches = normalized.match(/[^.!?]+[.!?]*/g) ?? [];
  return matches
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function normalizeReadinessAssistantText(args: {
  assistantText: string;
  priorAssistantText: string;
  allowRepeatedNudge: boolean;
}): string {
  const sentences = splitAssistantSentences(args.assistantText);
  if (!sentences.length) {
    return "If you want, it's okay to record anyway and we can tighten one pass after.";
  }

  const priorCategory = detectReadinessNudgeCategory(args.priorAssistantText);
  const out: string[] = [];
  let keptNudgeCategory: ReadinessNudgeCategory | null = null;

  for (const sentence of sentences) {
    const sentenceCategory = detectReadinessNudgeCategory(sentence);
    if (!sentenceCategory) {
      out.push(sentence);
      continue;
    }

    // Cap readiness guidance to one nudge per check.
    if (keptNudgeCategory) continue;

    // Avoid repeating the same nudge across checks unless the user asked for strict re-review.
    if (!args.allowRepeatedNudge && priorCategory && sentenceCategory === priorCategory) continue;

    keptNudgeCategory = sentenceCategory;
    out.push(sentence);
  }

  let normalized = out.join(" ").replace(/\s+/g, " ").trim();
  if (!normalized) {
    normalized = "If you want, it's okay to record anyway and we can tighten one pass after.";
  } else if (!RECORD_ANYWAY_RE.test(normalized)) {
    normalized = `${normalized} If you want, it's okay to record anyway and we can tighten one pass after.`;
  }

  return normalized.replace(/\s+/g, " ").trim();
}

function isProductionSupportRequest(text: string): boolean {
  const normalized = compactSpaces(text);
  return normalized.includes("production mode request for approved script version")
    || normalized.includes("approved_script_text:")
    || normalized.includes("seo_titles:")
    || normalized.includes("tags_top10:")
    || normalized.includes("thumbnail_01")
    || normalized.includes("image_01");
}

function hasBroadAboutTopic(text: string): boolean {
  const normalized = compactSpaces(text);
  if (!/\babout\b/.test(normalized)) return false;
  if (hasExplicitDeliverableKeyword(normalized)) return false;
  const aboutSplit = normalized.split(/\babout\b/i);
  const tail = aboutSplit.length > 1 ? aboutSplit.slice(1).join(" ").trim() : "";
  if (!tail) return false;
  const tailWords = tail
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return tailWords.length > 0 && tailWords.length <= 10;
}

function historyHasAngleToneSignals(messages: ChatMessage[]): boolean {
  const joined = messages.map((message) => message.content.toLowerCase()).join(" ");
  return /\bangle\b/.test(joined)
    || /\btone\b/.test(joined)
    || /\bneutral\b/.test(joined)
    || /\bhot\b/.test(joined)
    || /\bbrad\b/.test(joined)
    || /\bs1\b/.test(joined)
    || /\bs2\b/.test(joined)
    || /\byoutube\b/.test(joined)
    || /\bsources?\b/.test(joined)
    || /\bformat\b/.test(joined);
}

function hasCreativeStateSignal(text: string): boolean {
  const normalized = compactSpaces(text);
  return /\bstuck\b/.test(normalized)
    || /\bfrustrat(?:ed|ing)\b/.test(normalized)
    || /\bstarting to hate\b/.test(normalized)
    || /\boverload(?:ed)?\b/.test(normalized)
    || /\btoo many directions\b/.test(normalized)
    || /\bonto something\b/.test(normalized)
    || /\bthis lands\b/.test(normalized)
    || /\btoo long\b/.test(normalized);
}

function hasMaterialToEvaluateSignal(text: string): boolean {
  const normalized = compactSpaces(text);
  return /\bhere'?s my\b/.test(normalized)
    || /\bthis is the core concept\b/.test(normalized)
    || /\bcore concept\b/.test(normalized)
    || /\bi like it the way it is\b/.test(normalized)
    || /\bleave it as is\b/.test(normalized)
    || /\bkeep it as is\b/.test(normalized)
    || /\bdraft\b/.test(normalized)
    || /\bintro\b/.test(normalized)
    || /\bsection\b/.test(normalized)
    || /\bpremise\b/.test(normalized)
    || /\bhook\b/.test(normalized)
    || /\bpayoff\b/.test(normalized)
    || /\bidea\b/.test(normalized)
    || /\bconcept\b/.test(normalized);
}

function shouldAskClarifyingQuestions(args: {
  requestText: string;
  profile: CreatorProfile;
  chatHistory: ChatMessage[];
}): boolean {
  if (isResearchIntentRequest(args.requestText)) return false;
  if (isCrossProjectReferenceRequest(args.requestText)) return false;
  const requestWordCount = compactSpaces(args.requestText)
    .split(/\s+/)
    .filter(Boolean)
    .length;
  if (isProductionSupportRequest(args.requestText)) return false;
  if (hasExplicitDraftNow(args.requestText)) return false;
  if (hasExplicitDeliverableKeyword(args.requestText)) return false;
  if (hasCreativeStateSignal(args.requestText)) return false;
  if (hasMaterialToEvaluateSignal(args.requestText)) return false;
  if (requestWordCount >= 6) return false;
  if (args.profile.clarifyFirstBias >= 0.75 && requestWordCount <= 16) return true;
  if (hasBroadAboutTopic(args.requestText)) return true;
  if (!historyHasAngleToneSignals(args.chatHistory) && requestWordCount <= 7) return true;
  return false;
}

function buildClarifyingQuestionReply(profile: CreatorProfile): string {
  return [
    "Quick unblock before I draft:",
    "1) What's the one takeaway you want this episode to leave people with?",
    profile.riskSensitivity >= 0.65
      ? "2) Any claim that needs extra source caution?"
      : "2) Any must-include fact, name, or source?",
    "Reply in one line and I'll move straight into the draft.",
  ].join("\n");
}

function resolveTonePreset(args: {
  contextTonePreset: string | null;
  writingProfile: WritingProfile;
}): string {
  const contextTone = readOptionalString(args.contextTonePreset)?.toLowerCase();
  if (contextTone) return contextTone;
  const profileTone = readOptionalString(args.writingProfile.lastUsedTonePreset)?.toLowerCase();
  if (profileTone) return profileTone;
  return "neutral_conversational";
}

function describeTonePreset(tonePreset: string): string {
  if (tonePreset === "newsroom_neutral") {
    return "Keep tone newsroom-neutral, precise, and low-heat.";
  }
  if (tonePreset === "spicy_but_safe") {
    return "Keep voice punchy but safe: clear claims, no reckless hot takes.";
  }
  return "Prefer neutral conversational language over newsroom stiffness.";
}

function buildProfileStyleSnippet(
  profile: CreatorProfile,
  writingProfile: WritingProfile,
  requestText: string,
  contextTonePreset: string | null,
): string {
  const lines = ["Creator Profile Guidance (soft):"];

  const effectiveTonePreset = resolveTonePreset({
    contextTonePreset,
    writingProfile,
  });
  lines.push(`- Tone preset for this request: ${effectiveTonePreset}. ${describeTonePreset(effectiveTonePreset)}`);

  if (profile.riskSensitivity >= 0.65) {
    lines.push("- High risk sensitivity: avoid unverified claims; emphasize sourcing and caution.");
  } else if (profile.riskSensitivity <= 0.35) {
    lines.push("- Lower risk sensitivity: still accurate, but you may use a stronger voice.");
  }

  if (profile.outlineFirstBias >= 0.6 && !/\bscript\b/i.test(requestText)) {
    lines.push("- Workflow preference leans outline-first when the user does not explicitly ask for full script.");
  } else if (profile.scriptFirstBias >= 0.6) {
    lines.push("- Workflow preference leans script-first when request is explicit.");
  }

  if (profile.clarifyFirstBias <= 0.4) {
    lines.push("- User often prefers direct drafting when the request is clear.");
  }

  if (writingProfile.defaultAudience) {
    lines.push(`- Audience default: ${writingProfile.defaultAudience}.`);
  } else {
    lines.push("- Audience default: general podcast listeners.");
  }

  if (writingProfile.defaultStructure) {
    lines.push(`- Structure default: ${writingProfile.defaultStructure}.`);
  } else {
    lines.push("- Structure default: neutral flow (hook, context, points, close).");
  }

  if (writingProfile.styleNotes) {
    lines.push(`- Style notes: ${writingProfile.styleNotes}.`);
  }

  lines.push("- Do not ask follow-up questions about audience, structure, or tone. Use these defaults and generate immediately.");

  return lines.join("\n");
}

function countNumberedQuestions(text: string): number {
  const lines = text.split(/\r?\n/);
  let count = 0;
  for (const line of lines) {
    if (/^\s*\d+[).]\s+/.test(line)) {
      count += 1;
    }
  }
  return count;
}

function canonicalizeToken(raw: string): string {
  const inner = raw.slice(1, -1).trim().toLowerCase().replace(/\s+/g, " ");
  return `[${inner}]`;
}

function buildSystemPrompt(
  context: EpisodeContext,
  creatorStyleSnippet?: string,
  options?: {
    readinessCheck?: boolean;
    allowRepeatedReadinessNudge?: boolean;
    priorReadinessNudge?: ReadinessNudgeCategory | null;
    researchMode?: boolean;
    researchRequest?: HearthResearchRequest | null;
    researchResult?: HearthResearchResult | null;
  },
): string {
  const baseLines = [
    "You are Hearth.",
    "Primary identity: smart producer + trusted writing partner + calm friend in the room.",
    "## HEARTH COLLABORATOR IDENTITY",
    "You are Hearth - a seasoned creative producer and editor.",
    "Your role is not to behave like a generic assistant, tutor, or help desk.",
    "You are a trusted collaborator in the room.",
    "Voice characteristics:",
    "- Warm, grounded, human.",
    "- Calm confidence (never hypey).",
    "- Direct without being harsh.",
    "- Occasionally wry or lightly witty when natural.",
    "- Focused on helping the work succeed.",
    "- Feels like a smart friend who tells the truth.",
    "You care about momentum and quality more than politeness rituals.",
    "You do NOT sound like:",
    "- Customer support.",
    "- A corporate AI.",
    "- A therapist.",
    "- A motivational speaker.",
    "- A professor giving a lecture.",
    "## CONTINUITY & PRESENCE",
    "Assume you have been present throughout the session.",
    "Maintain conversational continuity by:",
    "- Referencing prior ideas, decisions, or progress when relevant.",
    "- Avoiding repetition of points already established.",
    "- Treating the work as ongoing, not restarting each turn.",
    "- Using language that reflects shared context.",
    "Examples:",
    "- Building on what you said earlier...",
    "- That fits the direction you're already heading.",
    "- This tightens the idea we started.",
    "- Given where you've landed...",
    "Do NOT fabricate history. Only reference what is actually present in context.",
    "Anti-restart rule:",
    "- Do not behave as if each message is a new conversation unless the user clearly resets topic.",
    "- Avoid re-introducing concepts already discussed.",
    "Occasionally acknowledge progress or effort when meaningful.",
    "Keep it brief and natural, never praise-heavy.",
    "Example tone:",
    "- That's a solid step forward.",
    "- Nice tightening there.",
    "- This version is much stronger.",
    "You are already operating inside an Episode context.",
    "Never ask what the topic is.",
    "Use only the provided episode_context as your factual context unless the user explicitly gives new details.",
    "Return ONLY valid JSON with this shape:",
    "{\"assistantText\": string, \"ops\": HearthOp[], \"script_text\": string|null, \"tag_audit\": object|null}",
    "Allowed ops:",
    "- set_title",
    "- set_title_variant",
    "- set_outline",
    "- set_body",
    "- add_source",
    "- update_source",
    "- remove_source",
    "Tag Contract (hard rules):",
    "- Allowed speaker blocks only: [s1]...[/s1], [s2]...[/s2], [g1]...[/g1], [g2]...[/g2]",
    "- Speaker tags must be on their own line with nothing else on that line.",
    "- No overlaps, no missing closes, no cross-tagging.",
    "- Allowed inline pacing tokens: [pause], [beat], [reflective pause]",
    "- Preserve pacing tokens verbatim. Do not invent or infer extra pacing tokens.",
    "- Allowed hidden notes: [note]...[/note], and [note] tags must be on their own lines.",
    "- Forbid random markup: Host 1:, Host 2:, **Host 2:**, <speaker>, Markdown headings.",
    "- Canonical speaker mapping: S1 = Host 1, S2 = Host 2.",
    "Rules:",
    "- assistantText must be concise plain text (no markdown).",
    "- Write like a human collaborator, not customer support.",
    "- Sound warm, grounded, and direct. Never sterile, pushy, fake, or cringey.",
    "- Prefer short conversational paragraphs over rigid bullet/checklist dumps.",
    "- Use bullets only when they clearly help comparison, sequencing, decision summaries, or export handoff prep.",
    "- Default structure: short natural paragraphs, plainspoken language, minimal formatting, no unnecessary lists.",
    "- Sound like speaking, not formatting.",
    "- Encourage without flattery. Be kind without softening useful truth.",
    "- Be opinionated when useful: clearly call out weak, muddy, repetitive, or off-tone writing.",
    "- Preserve user agency: suggest strongly, but keep ownership with the user.",
    "- Preserve user voice: illuminate and sharpen, do not hijack or overwrite their intent.",
    "- Never pressure the user or imply they must follow your preference.",
    "- Do not narrate internal process unless it materially helps the user decide.",
    "- Ask fewer follow-up questions. Only ask if truly blocked; otherwise propose the strongest next version directly.",
    "- If you ask a follow-up, ask at most one high-value question that unblocks a concrete choice.",
    "- When the user sounds stuck, frustrated, uncertain, or excited, acknowledge it naturally in one grounded line and keep moving.",
    "- Avoid assistant filler and stale lead-ins. Avoid opening with: Certainly, Here's a breakdown, I'd be happy to help, Based on what you shared, Let's explore.",
    "- Never open with filler phrases such as: Certainly, Of course, I'd be happy to, Here's a breakdown, Let's explore.",
    "- Avoid robotic framing or formal tone unless the user explicitly requests it.",
    "- Avoid repetitive cadence like: Would you like me to... unless that exact question is genuinely necessary.",
    "- Agreement is not the default. Do not auto-validate weak ideas.",
    "- Do not hedge everything with maybe/possibly. Be clear when something is weak or strong.",
    "- Replace flattery with evaluation: explain what works and what fails.",
    "- Critique style: firm, calm, constructive. No harshness, no sugarcoating.",
    "- Attack the work, never the person. Critique drafts/sections/approaches, not talent or effort.",
    "- Pair every critique with direction: what to cut, what to strengthen, or a stronger rewrite.",
    "- Flag common failure modes when present: rambling, overexplaining, safe-but-bland framing, emotional drift, missing hook/payoff.",
    "- Use calibrated bluntness when the issue is obvious or user asked for feedback. Example style: This is muddy. This section is not earning its time.",
    "- Use strategic pushback for suboptimal requests: explain the tradeoff clearly without taking control away from the user.",
    "- Recognize effort without praise inflation, then move to the next improvement.",
    "- Challenge level should match user intent: if venting/exhausted/overwhelmed/celebrating or asking simple execution, keep challenge light and focus on support + forward motion.",
    "- Encourage boldness when warranted: if the draft is too safe, explicitly say so and suggest stronger language or angle.",
    "- Momentum bias (default): after critique or analysis, include one concrete best next move the user can execute immediately.",
    "- Prefer one high-confidence direction over multiple options. Avoid decision overload.",
    "- Do not end with optional brainstorming prompts like: Would you like me to... unless user explicitly asks for options.",
    "- Unless user explicitly asks for analysis-only, include a direct draft improvement, rewrite seed, or specific cut/start instruction.",
    "- Keep agency while driving momentum: use phrasing like If you want the biggest improvement quickly..., The move I'd try next..., or Fastest upgrade: ...",
    "- Emotional intelligence adaptation:",
    "- If user is excited, match energy but stay grounded.",
    "- If user is frustrated, stay calm and constructive.",
    "- If user is tired, simplify and reduce cognitive load.",
    "- If user is venting, acknowledge briefly then redirect gently.",
    "- If user is focused, be concise and task-oriented.",
    "- Closing behavior: prefer endings that move the work forward via concrete next step, direct improvement suggestion, or clear decision framing.",
    "- Avoid endings that push work back to the user unnecessarily.",
    "- Use ops only for concrete edits requested by the user.",
    "- If the user only asks a question, return ops as [].",
    "- For outline requests, prefer set_outline only and do not emit set_body unless explicitly asked for a full script.",
    "- Do not invent source ids for update/remove ops.",
    "- When proposing or returning a script body, include script_text and tag_audit.",
    "- tag_audit must briefly confirm closure, standalone tags, and no markdown/random markup.",
    "- Do not ask the user to choose audience, structure, or tone during generation.",
    "- Keep output strictly JSON (no code fences).",
    "Voice examples (style calibration):",
    "- Desired: User says \"This script feels stiff and I'm starting to hate it.\" Assistant tone: \"Yeah, it feels tight in the wrong places. The stronger pass is simpler and more spoken. Here's a cleaner version.\"",
    "- Undesired: \"I understand your frustration. Here's a structured breakdown with three strategic pillars.\"",
    "- Desired: User says \"Okay, now we're onto something.\" Assistant tone: \"Yep, this lands. Let's tighten the middle so the punchline hits faster.\"",
    "- Undesired: \"Excellent progress! Would you like me to provide a comprehensive optimization framework?\"",
    "- Desired: User says \"I've got too many directions.\" Assistant tone: \"Makes sense. Let's collapse to one core claim, then build around it.\"",
    "- Undesired: \"Please select one of the following pathways before we proceed.\"",
    "- Desired: User says \"I'm thinking of productivity tips everyone already knows.\" Assistant tone: \"Viable topic, weak novelty. Keep the premise, but pick a contrarian angle or a lived-experiment frame so it actually lands.\"",
    "- Undesired: \"Great idea, let's run with it as-is.\"",
    "- Desired: User says \"I like it the way it is.\" Assistant tone: \"Totally your call. Tradeoff is pace: this version keeps detail but loses momentum in the middle. If we keep it, I'd still trim these two lines.\"",
    "- Undesired: \"You're wrong, this needs a full rewrite.\"",
    "- Desired: User says \"This intro is too long.\" Assistant tone: \"Fastest upgrade: cut everything before the first tension point. Start here instead: <rewritten opening>.\"",
    "- Undesired: \"You could try a few different approaches if you want.\"",
    "- Desired: User says \"I have too many directions.\" Assistant tone: \"The move I'd try next: pick one claim and draft a 4-line opening around it. Use this as your base: <draft seed>.\"",
    "- Undesired: \"Here are five possible paths to consider.\"",
    "## PROJECT KNOWLEDGE ACCESS",
    "You have read access to project knowledge when available, including architecture manifests, design docs, tool contracts, roadmaps/plans, canonical memory/context files, and relevant code summaries.",
    "Use project knowledge to answer how systems work, what exists vs not implemented, next logical steps, feature ownership, and integration points.",
    "Do not default to documentation mode.",
    "If the user is not explicitly asking about implementation, prioritize creative, planning, or editorial help.",
    "When asked about next steps:",
    "1) Base recommendations on project reality, not generic advice.",
    "2) Prefer the smallest high-impact action.",
    "3) Respect existing architecture and constraints.",
    "4) Avoid suggesting work that conflicts with known plans.",
    "Implementation truth rules:",
    "- If information is incomplete or inferred, say so briefly.",
    "- Do not hallucinate missing details.",
    "- Reference code-level details only when useful.",
    "- Summarize behavior, ownership, or intent before deep technical detail.",
    "- If a precise answer needs specific files/modules, provide a where-to-look hint instead of guessing.",
    "## PERFORMANCE & RELEASE AWARENESS",
    "Assume most creative work is intended for real audiences and downstream release.",
    "When a script or concept exists, treat audience impact as a default concern and offer concrete performance upgrades when appropriate.",
    "Scripts do not exist in isolation; they may become episodes across YouTube, podcast feeds, or short-form platforms.",
    "Production awareness:",
    "- Suggest adaptations that improve performance across formats when useful.",
    "- Prioritize retention, clarity of promise, emotional hook, and shareability.",
    "- Offer packaging elements (titles, hooks, variants, positioning angles) when it helps the work land.",
    "- Prefer one high-impact suggestion over large option dumps.",
    "Optimization moment triggers (only when relevant):",
    "- User mentions script, episode, video, publish, or explainer.",
    "- Draft appears approved/locked/production-ready.",
    "- User signals satisfaction (for example: that's good, approved, this works).",
    "When triggered, offer a named bundle instead of a random checklist. Preferred bundle names: Creator Optimization Pass, Release Prep Pack, or Performance Upgrade.",
    "Offer the bundle briefly and naturally. Do not spam optimization prompts in every turn.",
    "Keep creator agency:",
    "- Never block or override creator style.",
    "- Use collaborative framing such as Want a curiosity-leaning version instead of a clicky version?",
    "- Stay supportive and non-pushy.",
    "Example (good): User says This script looks solid. Assistant says Nice-this is production-ready. Want a YouTube-optimized cut, title options, or a short-form hook before you record?",
    "Example (bad): Here is a list of additional things you might consider...",
    "## EXECUTIVE PRODUCER BEHAVIOR",
    "Operate like a showrunner-minded collaborator, not just a writer.",
    "Assume creative work is intended for a real audience and eventual release.",
    "When content appears production-ready, you may offer performance upgrades such as:",
    "- Title optimization.",
    "- Hook improvement.",
    "- Platform variants (YouTube, podcast, short-form).",
    "- Audience framing adjustments.",
    "- Retention improvements.",
    "- Monetization angles.",
    "- Tone variants for specific audiences.",
    "Guidelines:",
    "- Offer upgrades as optional suggestions, not requirements.",
    "- Prefer one high-impact direction over large option dumps.",
    "- Do not block creator intent.",
    "- Do not moralize about style (including clickbait).",
    "- Maintain supportive collaborator tone.",
    "- Preserve creator agency.",
    "Trigger conditions for executive-producer behavior:",
    "- Script exists or appears approved.",
    "- User expresses satisfaction.",
    "- User mentions publishing or recording.",
    "- Project appears near production.",
    "Deliverable format:",
    "- Offer first, do not auto-dump optimization lists.",
    "- Preferred phrasing: Want a performance pass before recording?",
    "## RELEASE PREP PACK",
    "When explicitly requested, or when user accepts a performance/release pass, generate a named Release Prep Pack.",
    "Release Prep Pack components:",
    "- YouTube-optimized episode version: faster hook, clearer promise, retention-aware structure.",
    "- Title set: 3-7 click-optimized but honest options with varied emotional framing.",
    "- Short-form hook (<=20s): cold-open style suitable for Shorts/TikTok/Reels.",
    "- Tone variant aligned to creator style (for example: a more conversational personality-led pass).",
    "- Audience-tailored variant when relevant to known creator/audience context.",
    "- Monetization angle: sponsorship positioning, CTA ideas, premium framing options.",
    "Release Prep Pack constraints:",
    "- Do not claim platform capabilities that are not present.",
    "- Do not propose generated B-roll if capability is unavailable.",
    "- For product-demo narratives, suggest real screen captures over synthetic visuals.",
    "- Do not overwrite primary script by default; treat prep outputs as derived suggestions.",
    "Packaging behavior:",
    "- Offer the bundle, then deliver clearly sectioned outputs when user confirms.",
    "- Keep output practical and shippable, not abstract commentary.",
  ];

  if (options?.readinessCheck) {
    baseLines.push(
      "Readiness check policy:",
      "- If the current draft is solid, explicitly say it is ready to record.",
      "- Provide at most one sourcing/risk nudge in this reply.",
      "- Phrase nudges as workflow guidance, not emotion or drama.",
      "- Always include an OK-to-record-anyway path in a calm producer tone.",
    );
    if (options.priorReadinessNudge && !options.allowRepeatedReadinessNudge) {
      baseLines.push(
        `- Prior assistant nudge already covered: ${options.priorReadinessNudge}. Do not repeat it unless user explicitly asks for strict re-review.`,
      );
    }
  }

  if (options?.researchMode) {
    baseLines.push(
      "Research mode behavior (hard rule):",
      "- Always attempt a first-pass answer before limitations.",
      "- Never lead with inability, missing browsing, or uncertainty statements.",
      "- Start with immediate known examples relevant to the user's angle (target: 2-5 examples).",
      "- Organize examples into clear buckets/categories.",
      "- Tie examples back to the user's thesis or production angle in one concise pattern statement.",
      "- Include verification gaps only as a lightweight follow-up section; do not block delivery on them.",
      "- Prefer fast producer momentum: first pass now, deeper sourcing next.",
      "Research response shape:",
      "1) Brief angle confirmation.",
      "2) Immediate examples.",
      "3) Categorized buckets.",
      "4) Optional verification gaps.",
      "5) One concrete next step (expand list, script spine, or source-backed pass).",
    );
    if (options.researchRequest) {
      baseLines.push(
        "Canonical research request:",
        JSON.stringify(options.researchRequest),
      );
    }
    if (options.researchResult) {
      baseLines.push(
        "Canonical research runtime result:",
        JSON.stringify(options.researchResult),
      );
    }
  }

  if (creatorStyleSnippet?.trim()) {
    baseLines.push(creatorStyleSnippet.trim());
  }
  baseLines.push(
    "episode_context:",
    JSON.stringify(context),
  );
  return baseLines.join("\n");
}

function extractAssistantReply(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const row = payload as Record<string, unknown>;
  const choices = row.choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const first = choices[0];
  if (!first || typeof first !== "object") return "";
  const message = (first as Record<string, unknown>).message;
  if (!message || typeof message !== "object") return "";
  const content = (message as Record<string, unknown>).content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  const parts: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const piece = item as Record<string, unknown>;
    const text = piece.text;
    if (typeof text === "string" && text.trim()) {
      parts.push(text.trim());
    }
  }
  return parts.join("\n").trim();
}

function classifyChatFeature(requestText: string): { feature: AiUsageFeature; subfeature: AiUsageSubfeature | null } {
  const normalized = compactSpaces(requestText);
  if (READINESS_CHECK_RE.test(normalized)) {
    return {
      feature: AI_USAGE_FEATURE.SCRIPT_ASSIST,
      subfeature: AI_USAGE_SUBFEATURE.READINESS_CHECK,
    };
  }
  if (CDC_REQUEST_RE.test(normalized)) {
    return {
      feature: AI_USAGE_FEATURE.CDC_EXTRACT,
      subfeature: AI_USAGE_SUBFEATURE.MEDIA_MAP,
    };
  }
  if (requestedOutline(normalized)) {
    return {
      feature: AI_USAGE_FEATURE.SCRIPT_ASSIST,
      subfeature: AI_USAGE_SUBFEATURE.OUTLINE,
    };
  }
  if (requestedScript(normalized)) {
    return {
      feature: AI_USAGE_FEATURE.SCRIPT_ASSIST,
      subfeature: AI_USAGE_SUBFEATURE.REWRITE,
    };
  }
  return {
    feature: AI_USAGE_FEATURE.SCRIPT_ASSIST,
    subfeature: AI_USAGE_SUBFEATURE.CHAT,
  };
}

function mapChatRequestToRouterFeature(args: {
  chatFeature: { feature: AiUsageFeature; subfeature: AiUsageSubfeature | null };
  researchModeRequested: boolean;
}): string {
  if (args.researchModeRequested) return "research";
  if (args.chatFeature.subfeature === AI_USAGE_SUBFEATURE.READINESS_CHECK) return "readiness_check";
  if (args.chatFeature.subfeature === AI_USAGE_SUBFEATURE.OUTLINE) return "outline";
  if (args.chatFeature.subfeature === AI_USAGE_SUBFEATURE.REWRITE) return "rewrite";
  return "chat";
}

function extractTranscriptionText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const text = (payload as Record<string, unknown>).text;
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  return trimmed || null;
}

function inferAudioExtension(mimeType: string | null, storageKey: string): string {
  const byMime = (mimeType ?? "").toLowerCase();
  if (byMime.includes("webm")) return "webm";
  if (byMime.includes("wav")) return "wav";
  if (byMime.includes("ogg")) return "ogg";
  if (byMime.includes("mp3") || byMime.includes("mpeg")) return "mp3";
  if (byMime.includes("mp4") || byMime.includes("m4a")) return "m4a";

  const byPath = path.extname(storageKey).replace(/^\./, "").trim().toLowerCase();
  return byPath || "webm";
}

function estimateTokenFallback(messages: ChatMessage[], reply: string): number {
  const messageChars = messages.reduce((acc, message) => acc + message.content.length, 0);
  const totalChars = messageChars + reply.length;
  return Math.max(1, Math.ceil(totalChars / 4));
}

function isGpt5FamilyModel(modelName: string): boolean {
  return /^gpt-5(?:$|-)/i.test(modelName.trim());
}

function isTemperatureUnsupportedError(detail: string): boolean {
  const text = detail.toLowerCase();
  return text.includes("temperature")
    && (text.includes("unsupported") || text.includes("only the default"));
}

function readUpstreamErrorMessage(detail: string): string | null {
  try {
    const parsed = JSON.parse(detail) as unknown;
    if (!isRecord(parsed)) return null;
    const error = parsed.error;
    if (!isRecord(error)) return null;
    const message = readOptionalString(error.message);
    return message ?? null;
  } catch {
    return null;
  }
}

function tryParseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    // continue
  }

  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced && fenced[1]) {
    try {
      const parsed = JSON.parse(fenced[1]) as unknown;
      return isRecord(parsed) ? parsed : null;
    } catch {
      // continue
    }
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const slice = trimmed.slice(start, end + 1);
    try {
      const parsed = JSON.parse(slice) as unknown;
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return null;
}

function buildTagAuditFromScript(scriptText: string | null): Record<string, unknown> | null {
  const script = scriptText?.trim();
  if (!script) return null;

  const tagMatches = script.match(/\[[^\]]+\]/g) ?? [];
  const normalizedTags = tagMatches.map((tag) => canonicalizeToken(tag));
  const allowedTags = new Set<string>([
    "[s1]", "[/s1]",
    "[s2]", "[/s2]",
    "[g1]", "[/g1]",
    "[g2]", "[/g2]",
    "[note]", "[/note]",
    "[pause]", "[beat]", "[reflective pause]",
  ]);
  const noUnknownTags = normalizedTags.every((tag) => allowedTags.has(tag));

  const speakerStandalone = !/\[(?:s1|s2|g1|g2)\]\s*\S/i.test(script) && !/\S\s*\[\/(?:s1|s2|g1|g2)\]/i.test(script);
  const noteStandalone = !/\[note\]\s*\S/i.test(script) && !/\S\s*\[\/note\]/i.test(script);
  const noForbiddenMarkup = (
    !/(^|\n)\s*#{1,6}\s+\S/.test(script)
    && !/(^|\n)\s*\*\*[^*\n]{1,80}:\*\*/i.test(script)
    && !/(^|\n)\s*(?:joe|brad|s1|s2|g1|g2)\s*:/i.test(script)
    && !/(^|\n)\s*\((?:joe|brad|s1|s2|g1|g2)\s*:\)/i.test(script)
    && !/<\s*\/?\s*[a-z][^>]*>/i.test(script)
  );

  const blockRe = /\[(\/?)(s1|s2|g1|g2|note)\]/gi;
  const stack: string[] = [];
  let noCrossTagging = true;
  let match: RegExpExecArray | null = null;
  while ((match = blockRe.exec(script)) !== null) {
    const close = Boolean(match[1]);
    const name = match[2].toLowerCase();
    if (!close) {
      stack.push(name);
      continue;
    }
    const top = stack.pop();
    if (top !== name) {
      noCrossTagging = false;
      break;
    }
  }

  return {
    speaker_blocks_closed: stack.length === 0 && noCrossTagging,
    speaker_tags_standalone_lines: speakerStandalone,
    note_blocks_standalone_lines: noteStandalone,
    no_cross_tagging: noCrossTagging,
    no_unknown_tags: noUnknownTags,
    no_forbidden_markup: noForbiddenMarkup,
  };
}

function normalizeStructuredReply(raw: string): StructuredReply | null {
  const parsed = tryParseJsonObject(raw);
  if (!parsed) return null;
  const assistantText = readOptionalString(parsed.assistantText) ?? readOptionalString(parsed.assistant_text) ?? "";
  const ops = normalizeOps(parsed.ops);
  const scriptText = readOptionalString(parsed.script_text) ?? null;
  const inferredScriptText = scriptText
    ?? (ops.find((op) => op.op === "set_body") as { op: "set_body"; value: string } | undefined)?.value
    ?? null;
  const normalizedOps = inferredScriptText && !ops.some((op) => op.op === "set_body")
    ? [...ops, { op: "set_body", value: inferredScriptText } satisfies HearthOp]
    : ops;
  if (!assistantText && normalizedOps.length === 0) return null;
  const tagAudit = isRecord(parsed.tag_audit)
    ? parsed.tag_audit
    : buildTagAuditFromScript(inferredScriptText);
  return {
    assistantText,
    ops: normalizedOps,
    scriptText: inferredScriptText,
    tagAudit,
  };
}

function summarizeResearchResult(result: HearthResearchResult): Record<string, number | string> {
  let extracted = 0;
  let partial = 0;
  let failed = 0;
  let skipped = 0;
  let pending = 0;
  let dated = 0;
  let undated = 0;

  for (const source of result.sources) {
    if (source.extractionStatus === "extracted") extracted += 1;
    else if (source.extractionStatus === "partial") partial += 1;
    else if (source.extractionStatus === "failed") failed += 1;
    else if (source.extractionStatus === "skipped") skipped += 1;
    else if (source.extractionStatus === "pending") pending += 1;
    if (source.publishedAt) dated += 1;
    else undated += 1;
  }

  return {
    mode: result.mode,
    runtime_status: result.runtimeStatus,
    source_count: result.sources.length,
    extracted_count: extracted,
    partial_count: partial,
    failed_count: failed,
    skipped_count: skipped,
    pending_count: pending,
    dated_count: dated,
    undated_count: undated,
  };
}

function formatResearchSourceArtifact(source: { title: string | null; domain: string | null; url: string }): string {
  const label = readOptionalString(source.title) ?? readOptionalString(source.domain) ?? source.url;
  return label;
}

const RESEARCH_REPLY_INTERNAL_MARKERS: RegExp[] = [
  /\bresponse tone\s*:/i,
  /\bthe user prefers\b/i,
  /\bif helpful,\s*ask whether\b/i,
  /\breturn only valid json\b/i,
  /\ballowed ops\s*:/i,
  /\btag contract\b/i,
  /\bvoice examples\b/i,
  /\bdo not ask follow-up questions\b/i,
  /\bdo not behave as if each message is a new conversation\b/i,
];

function hasInternalLeakMarker(line: string): boolean {
  const text = line.trim();
  if (!text) return false;
  return RESEARCH_REPLY_INTERNAL_MARKERS.some((pattern) => pattern.test(text));
}

function fallbackResearchBodyFromResult(result: HearthResearchResult): string {
  const summary = readOptionalString(result.synthesis.summary);
  if (summary) return summary;
  if (result.runtimeStatus === "no_results") {
    return "No strong source evidence surfaced in this pass.";
  }
  if (result.runtimeStatus === "error" || result.mode === "knowledge_first") {
    return "This response stays in knowledge-first mode for now.";
  }
  if (result.mode === "partial_retrieval" || result.runtimeStatus === "partial") {
    return "Some source evidence was recovered, but coverage is incomplete.";
  }
  return "Source-backed findings are available from this run.";
}

function sanitizeResearchReplyBody(rawBody: string, result: HearthResearchResult): string {
  const lines = rawBody
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const filtered = lines.filter((line) => !hasInternalLeakMarker(line));
  const compact = filtered.join("\n").trim();
  if (compact) return compact;
  return fallbackResearchBodyFromResult(result);
}

function buildResearchOutcomeLead(args: {
  request: HearthResearchRequest;
  result: HearthResearchResult;
}): string {
  const query = args.request.query.trim() || "this query";
  const sourceCount = args.result.sources.length;
  const topArtifacts = args.result.sources
    .slice(0, 3)
    .map((source) => formatResearchSourceArtifact(source))
    .filter(Boolean);
  const keyPoints = args.result.synthesis.keyPoints
    .map((point) => point.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (args.result.runtimeStatus === "no_results") {
    return `Research outcome: No strong retrieval results were found for "${query}".`;
  }

  if (args.result.runtimeStatus === "error" || args.result.mode === "knowledge_first") {
    return `Research outcome: Live retrieval was unavailable in this run, so this answer is a knowledge-first fallback for "${query}".`;
  }

  if (args.result.mode === "partial_retrieval" || args.result.runtimeStatus === "partial") {
    const artifactLine = topArtifacts.length
      ? `Recovered sources (${sourceCount}): ${topArtifacts.join("; ")}.`
      : `Recovered sources (${sourceCount}): none surfaced in this pass.`;
    const findingsLine = keyPoints.length
      ? `Recovered findings: ${keyPoints.join(" ")}`
      : "Recovered findings are limited in this pass.";
    return `Research outcome: Retrieval was partial for "${query}". ${artifactLine} ${findingsLine}`;
  }

  const artifactLine = topArtifacts.length
    ? `Sources found (${sourceCount}): ${topArtifacts.join("; ")}.`
    : `Sources found (${sourceCount}).`;
  const findingsLine = keyPoints.length
    ? `Retrieved findings: ${keyPoints.join(" ")}`
    : readOptionalString(args.result.synthesis.summary)
      ? `Retrieved findings: ${args.result.synthesis.summary}`
      : "Retrieved findings are available from the runtime source set.";
  return `Research outcome: Retrieval found sources for "${query}". ${artifactLine} ${findingsLine}`;
}

function enforceResearchOutcomeReply(args: {
  assistantText: string;
  request: HearthResearchRequest;
  result: HearthResearchResult;
}): string {
  const lead = buildResearchOutcomeLead({
    request: args.request,
    result: args.result,
  });
  const body = sanitizeResearchReplyBody(args.assistantText.trim(), args.result);
  if (!body) return lead;
  const normalizedLead = lead.trim().toLowerCase();
  const normalizedBody = body.toLowerCase();
  if (normalizedBody.startsWith(normalizedLead)) return body;
  return `${lead}\n\n${body}`;
}

function buildCrossProjectScopeLead(resolution: CrossProjectReferenceResolution): string | null {
  if (!resolution.detected) return null;
  if (resolution.level === "clear" && resolution.resolvedTitle) {
    return `Scope note: I resolved this to the workspace artifact "${resolution.resolvedTitle}" via Tongs. I am using it as a reference while keeping the current episode as the active working fire.`;
  }
  if (resolution.level === "ambiguous" && resolution.candidateTitles.length >= 2) {
    const [first, second] = resolution.candidateTitles;
    return `Scope note: I found multiple workspace artifact matches via Tongs. I can anchor this to "${first}" or "${second}" once you pick one.`;
  }
  return "Scope note: This sounds like a reference to another workspace artifact, but I do not have a reliable anchor yet. Name the episode/project (or paste one line) and I will resolve it through Tongs.";
}

function enforceCrossProjectScopeReply(args: {
  assistantText: string;
  resolution: CrossProjectReferenceResolution;
}): string {
  const lead = buildCrossProjectScopeLead(args.resolution);
  if (!lead) return args.assistantText;
  const body = args.assistantText.trim();
  if (!body) return lead;
  const normalizedLead = lead.trim().toLowerCase();
  const normalizedBody = body.toLowerCase();
  if (normalizedBody.startsWith(normalizedLead)) return body;
  return `${lead}\n\n${body}`;
}

export function createHearthAiHandler(config: HearthRuntimeConfig) {
  const researchApiKey = (
    config.researchApiKey
    || process.env.HEARTH_RESEARCH_API_KEY
    || process.env.HEARTH_RESEARCH_BRAVE_API_KEY
    || process.env.BRAVE_SEARCH_API_KEY
    || null
  );
  const researchRuntime = createHearthResearchRuntime({ braveApiKey: researchApiKey });
  const textApiKey = config.textApiKey ?? config.apiKey ?? null;
  const {
    model: configuredModel,
    sttModel,
    configuredBillingMode,
    supabaseUrl,
    supabaseServiceRoleKey,
    supabaseRpcKey,
    sttBucket,
    disableForgeLaneAi,
    disableExpensiveAiActions,
    disableCdcGeneration,
  } = config;
  let tokenBalance = config.initialTokenBalance;
  const supabaseService: SupabaseClient<Database> | null =
    supabaseUrl && supabaseServiceRoleKey
      ? createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        })
      : null;

  function buildBillingSnapshot(mode: BillingMode) {
    return {
      billing_mode: mode,
      token_balance: mode === "forge" ? tokenBalance : null,
    };
  }

  async function recordAiUsageEvent(args: {
    userId: string | null;
    lane: BillingMode;
    provider: string;
    workspaceId: string | null;
    workpieceId: string | null;
    sessionId: string | null;
    feature: AiUsageFeature;
    subfeature?: AiUsageSubfeature | null;
    model: string;
    reasoningEffort?: string | null;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    actualCostUsd: number;
    billableTokens: number;
    trigger: AiUsageTrigger;
    status: AiUsageStatus;
    policyEnforced?: boolean;
    actionId?: string | null;
    providerRequestId?: string | null;
    correlationId?: string | null;
  }): Promise<void> {
    await recordAiUsageEventShared({
      supabaseService,
      userId: args.userId,
      lane: args.lane,
      provider: args.provider,
      workspaceId: isUuid(args.workspaceId) ? args.workspaceId : null,
      workpieceId: isUuid(args.workpieceId) ? args.workpieceId : null,
      sessionId: isUuid(args.sessionId) ? args.sessionId : null,
      feature: args.feature,
      subfeature: args.subfeature ?? null,
      model: args.model,
      reasoningEffort: args.reasoningEffort ?? null,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      totalTokens: args.totalTokens,
      estimatedCostUsd: args.estimatedCostUsd,
      actualCostUsd: args.actualCostUsd,
      billableTokens: args.billableTokens,
      trigger: args.trigger,
      status: args.status,
      policyEnforced: args.policyEnforced ?? true,
      actionId: args.actionId ?? null,
      providerRequestId: args.providerRequestId ?? null,
      correlationId: args.correlationId ?? null,
    });
  }

  async function runAIRequest(args: {
    lane: BillingMode;
    userId: string | null;
    workspaceId: string | null;
    workpieceId: string | null;
    sessionId: string | null;
    feature: AiUsageFeature;
    subfeature?: AiUsageSubfeature | null;
    model: string;
    reasoningEffort?: string | null;
    trigger: AiUsageTrigger;
    actionId?: string | null;
    isRecoverableHttpError?: (response: Response) => Promise<boolean>;
    request: {
      url: string;
      init: RequestInit;
      signal: AbortSignal;
    };
  }): Promise<Response> {
    try {
      const response = await fetch(args.request.url, {
        ...args.request.init,
        signal: args.request.signal,
      });

      if (!response.ok) {
        let isRecoverable = false;
        if (args.isRecoverableHttpError) {
          try {
            isRecoverable = await args.isRecoverableHttpError(response.clone());
          } catch {
            isRecoverable = false;
          }
        }
        if (!isRecoverable) {
          await recordAiUsageEvent({
            userId: args.userId,
            lane: args.lane,
            provider: "openai",
            workspaceId: args.workspaceId,
            workpieceId: args.workpieceId,
            sessionId: args.sessionId,
            feature: args.feature,
            subfeature: args.subfeature,
            model: args.model,
            reasoningEffort: args.reasoningEffort,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            estimatedCostUsd: 0,
            actualCostUsd: 0,
            billableTokens: 0,
            trigger: args.trigger,
            status: AI_USAGE_STATUS.ERROR,
            actionId: args.actionId,
            providerRequestId: response.headers.get("x-request-id"),
          });
        }
      }

      return response;
    } catch (error) {
      await recordAiUsageEvent({
        userId: args.userId,
        lane: args.lane,
        provider: "openai",
        workspaceId: args.workspaceId,
        workpieceId: args.workpieceId,
        sessionId: args.sessionId,
        feature: args.feature,
        subfeature: args.subfeature,
        model: args.model,
        reasoningEffort: args.reasoningEffort,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        actualCostUsd: 0,
        billableTokens: 0,
        trigger: args.trigger,
        status: AI_USAGE_STATUS.ERROR,
        actionId: args.actionId,
        providerRequestId: null,
      });
      throw error;
    }
  }

  async function resolveUserId(accessToken: string | null): Promise<string | null> {
    if (!accessToken || !supabaseService) return null;
    const { data, error } = await supabaseService.auth.getUser(accessToken);
    if (error) {
      console.warn("[hearth-chat-api] failed to resolve user from bearer token", error.message);
      return null;
    }
    return data.user?.id ?? null;
  }

  async function callUserScopedTongsRpc(args: {
    accessToken: string;
    fn: string;
    payload: Record<string, unknown>;
  }): Promise<{ ok: true; data: unknown } | { ok: false; status: number; error: string }> {
    if (!supabaseUrl || !supabaseRpcKey) {
      return { ok: false, status: 0, error: "Supabase RPC config missing" };
    }

    let response: Response;
    try {
      response = await fetch(`${supabaseUrl}/rest/v1/rpc/${args.fn}`, {
        method: "POST",
        headers: {
          apikey: supabaseRpcKey,
          authorization: `Bearer ${args.accessToken}`,
          "accept-profile": "tongs",
          "content-profile": "tongs",
          "content-type": "application/json",
        },
        body: JSON.stringify(args.payload),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network error";
      return { ok: false, status: 0, error: message };
    }

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: readErrorText(payload, `RPC ${args.fn} failed (${response.status})`),
      };
    }

    return { ok: true, data: payload };
  }

  async function loadCreatorProfileForToken(accessToken: string | null): Promise<CreatorProfile> {
    if (!accessToken) return { ...DEFAULT_CREATOR_PROFILE };
    const result = await callUserScopedTongsRpc({
      accessToken,
      fn: "get_or_create_creator_profile",
      payload: {},
    });
    if (!result.ok) {
      console.warn("[hearth-chat-api] get_or_create_creator_profile failed", {
        status: result.status,
        error: result.error,
      });
      return { ...DEFAULT_CREATOR_PROFILE };
    }
    return normalizeCreatorProfile(result.data);
  }

  async function loadWritingProfileForToken(
    accessToken: string | null,
    workspaceId: string | null,
  ): Promise<WritingProfile> {
    if (!accessToken || !isUuid(workspaceId)) {
      return {
        ...DEFAULT_WRITING_PROFILE,
        workspaceId: isUuid(workspaceId) ? workspaceId : null,
      };
    }
    const result = await callUserScopedTongsRpc({
      accessToken,
      fn: "get_my_writing_profile",
      payload: { p_workspace_id: workspaceId },
    });
    if (!result.ok) {
      console.warn("[hearth-chat-api] get_my_writing_profile failed", {
        status: result.status,
        error: result.error,
      });
      return {
        ...DEFAULT_WRITING_PROFILE,
        workspaceId,
      };
    }
    return normalizeWritingProfile(result.data);
  }

  async function loadStyleSamplesForToken(
    accessToken: string | null,
    workspaceId: string | null,
  ): Promise<StyleSample[]> {
    if (!accessToken || !isUuid(workspaceId)) return [];
    const result = await callUserScopedTongsRpc({
      accessToken,
      fn: "list_my_style_samples",
      payload: {
        p_workspace_id: workspaceId,
        p_limit: STYLE_SAMPLE_RPC_LIMIT,
      },
    });
    if (!result.ok) {
      console.warn("[hearth-chat-api] list_my_style_samples failed", {
        status: result.status,
        error: result.error,
      });
      return [];
    }

    const out: StyleSample[] = [];
    let remainingChars = STYLE_SAMPLE_TOTAL_MAX_CHARS;
    for (const row of normalizeStyleSamples(result.data)) {
      if (remainingChars < 60) break;
      const condensed = condenseWhitespace(row.content);
      if (!condensed) continue;
      const cap = Math.min(STYLE_SAMPLE_EXCERPT_MAX_CHARS, remainingChars);
      if (cap <= 0) break;
      const excerpt = condensed.length > cap ? `${condensed.slice(0, Math.max(0, cap - 3))}...` : condensed;
      if (!excerpt) continue;
      out.push({
        ...row,
        content: excerpt,
      });
      remainingChars -= excerpt.length;
    }
    return out;
  }

  async function loadRecentScriptReferencesForToken(
    accessToken: string | null,
    workspaceId: string | null,
  ): Promise<RecentScriptReference[]> {
    if (!accessToken || !isUuid(workspaceId)) return [];
    const result = await callUserScopedTongsRpc({
      accessToken,
      fn: "list_my_recent_script_references",
      payload: {
        p_workspace_id: workspaceId,
        p_limit: RECENT_SCRIPT_RPC_LIMIT,
      },
    });
    if (!result.ok) {
      console.warn("[hearth-chat-api] list_my_recent_script_references failed", {
        status: result.status,
        error: result.error,
      });
      return [];
    }
    return normalizeRecentScriptReferences(result.data)
      .filter((ref) => ref.workspaceId === workspaceId);
  }

  async function loadRecentScriptExcerpts(refs: RecentScriptReference[]): Promise<ScriptExcerpt[]> {
    if (!supabaseService || refs.length === 0) return [];

    const out: ScriptExcerpt[] = [];
    let remainingChars = RECENT_SCRIPT_EXCERPT_TOTAL_MAX_CHARS;
    for (const ref of refs) {
      if (remainingChars < 100) break;
      const storageKey = `workpieces/${ref.workpieceId}/${ref.scriptPath}`;
      const { data, error } = await supabaseService.storage
        .from(sttBucket)
        .download(storageKey);
      if (error || !data) {
        continue;
      }

      const rawText = condenseWhitespace(await data.text());
      if (!rawText) continue;

      const cap = Math.min(RECENT_SCRIPT_EXCERPT_MAX_CHARS, remainingChars);
      const excerpt = rawText.length > cap ? `${rawText.slice(0, Math.max(0, cap - 3))}...` : rawText;
      if (!excerpt) continue;

      out.push({
        title: ref.title,
        scriptPath: ref.scriptPath,
        excerpt,
      });
      remainingChars -= excerpt.length;
    }

    return out;
  }

  async function recordHearthEventForToken(args: {
    accessToken: string | null;
    episodeId: string | null;
    eventType: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    const accessToken = args.accessToken;
    if (!accessToken) return;
    const eventType = args.eventType.trim();
    if (!eventType) return;

    const rpcPayload: Record<string, unknown> = {
      p_event_type: eventType,
      p_payload: args.payload ?? {},
      p_episode_id: isUuid(args.episodeId) ? args.episodeId : null,
    };

    const result = await callUserScopedTongsRpc({
      accessToken,
      fn: "record_hearth_event",
      payload: rpcPayload,
    });

    if (!result.ok) {
      console.warn("[hearth-chat-api] record_hearth_event failed", {
        event: eventType,
        status: result.status,
        error: result.error,
      });
    }
  }

  async function applyTokenDelta(args: {
    userId: string;
    spent: number;
    requestId: string;
    openAiRequestId: string | null;
    reason: string;
  }): Promise<{ ok: true; tokenBalance: number | null } | { ok: false; warning: string }> {
    const result = await applyAiTokenDeltaShared({
      supabaseService,
      userId: args.userId,
      spent: args.spent,
      requestId: args.requestId,
      openAiRequestId: args.openAiRequestId,
      reason: args.reason,
    });
    if (!result.ok) {
      console.warn("[hearth-chat-api] apply_ai_token_delta failed", {
        request_id: args.requestId,
        openai_request_id: args.openAiRequestId,
      });
    }
    return result;
  }

  return async function hearthAiHandler(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const pathname = url.pathname;

      if (
        pathname !== HEARTH_AI_ROUTES.chat
        && pathname !== HEARTH_AI_ROUTES.chatStatus
        && pathname !== HEARTH_AI_ROUTES.stt
        && pathname !== HEARTH_AI_ROUTES.costAudit
      ) {
        return jsonResponse(404, { ok: false, error: "Not found" });
      }

      const method = (request.method || "GET").toUpperCase();

      if (pathname === HEARTH_AI_ROUTES.chatStatus) {
        if (method !== "GET") {
          return jsonResponse(405, { ok: false, error: "Method not allowed" });
        }
        const laneParam = url.searchParams.get("lane");
        const lane: BillingMode = isBillingMode(laneParam) ? laneParam : configuredBillingMode;
        return jsonResponse(200, {
          ok: true,
          ...buildBillingSnapshot(lane),
        });
      }

      if (pathname === HEARTH_AI_ROUTES.costAudit) {
        if (method !== "GET") {
          return jsonResponse(405, { ok: false, error: "Method not allowed" });
        }
        if (!supabaseService) {
          return jsonResponse(500, { ok: false, error: "Supabase service role is not configured." });
        }
        const bearerToken = readBearerToken(request.headers.get("authorization"));
        const userId = await resolveUserId(bearerToken);
        if (!userId) {
          return jsonResponse(401, { ok: false, error: "Authentication required." });
        }
        const laneParam = url.searchParams.get("lane");
        const lane: BillingMode = isBillingMode(laneParam) ? laneParam : configuredBillingMode;
        const includeUsd = lane === AI_USAGE_LANE.BYO;

        const tableClient = supabaseService.schema("tongs") as unknown as {
          from: (table: string) => {
            select: (fields: string) => {
              eq: (column: string, value: string) => {
                eq: (column: string, value: string) => {
                  gte: (column: string, value: string) => {
                    order: (column: string, options: { ascending: boolean }) => {
                      limit: (value: number) => Promise<{ data: unknown; error: { message: string } | null }>;
                    };
                  };
                };
                gte: (column: string, value: string) => {
                  order: (column: string, options: { ascending: boolean }) => {
                    limit: (value: number) => Promise<{ data: unknown; error: { message: string } | null }>;
                  };
                };
              };
            };
          };
        };

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const selectFields = includeUsd
          ? "created_at, lane, feature, subfeature, model, total_tokens, actual_cost_usd, billable_tokens, workspace_id"
          : "created_at, lane, feature, subfeature, model, total_tokens, billable_tokens, workspace_id";
        const { data, error } = await tableClient
          .from("ai_usage_events")
          .select(selectFields)
          .eq("lane", lane)
          .eq("user_id", userId)
          .gte("created_at", startOfDay.toISOString())
          .order("created_at", { ascending: false })
          .limit(200);

        if (error) {
          return jsonResponse(500, { ok: false, error: error.message });
        }

        const rows = Array.isArray(data) ? data : [];
        const totals = rows.reduce((acc, row) => {
          if (!row || typeof row !== "object") return acc;
          const record = row as Record<string, unknown>;
          const totalTokens = typeof record.total_tokens === "number" ? record.total_tokens : 0;
          const billableTokens = typeof record.billable_tokens === "number" ? record.billable_tokens : 0;
          const actualCostUsd = includeUsd && typeof record.actual_cost_usd === "number"
            ? record.actual_cost_usd
            : 0;
          return {
            totalTokens: acc.totalTokens + Math.max(0, totalTokens),
            billableTokens: acc.billableTokens + Math.max(0, billableTokens),
            actualCostUsd: Number((acc.actualCostUsd + Math.max(0, actualCostUsd)).toFixed(6)),
          };
        }, { totalTokens: 0, billableTokens: 0, actualCostUsd: 0 });

        const normalizedRows = includeUsd
          ? rows
          : rows.map((row) => {
              if (!row || typeof row !== "object") return row;
              const record = row as Record<string, unknown>;
              return {
                ...record,
                actual_cost_usd: null,
              };
            });

        return jsonResponse(200, {
          ok: true,
          generated_at: new Date().toISOString(),
          window: "today",
          lane,
          rows: normalizedRows,
          totals,
        });
      }

      if (pathname === HEARTH_AI_ROUTES.stt) {
        if (method !== "POST") {
          return jsonResponse(405, { ok: false, error: "Method not allowed" });
        }

        const bodyRaw = (await readJsonBody(request)) as SttReqBody;
        const lane: BillingMode = isBillingMode(bodyRaw.lane) ? bodyRaw.lane : configuredBillingMode;
        const bearerToken = readBearerToken(request.headers.get("authorization"));
        if (lane === AI_USAGE_LANE.FORGE && disableForgeLaneAi) {
          return jsonResponse(503, {
            ok: false,
            error: "Forge-lane AI is temporarily disabled by emergency control.",
            code: "forge_lane_disabled",
            ...buildBillingSnapshot(lane),
          });
        }
        if (disableExpensiveAiActions) {
          return jsonResponse(503, {
            ok: false,
            error: "Higher-cost AI actions are temporarily disabled.",
            code: "expensive_actions_disabled",
            ...buildBillingSnapshot(lane),
          });
        }

        if (!textApiKey) {
          return jsonResponse(500, {
            ok: false,
            error: MISSING_OPENAI_TEXT_API_KEY_ERROR,
            ...buildBillingSnapshot(lane),
          });
        }

        if (lane === AI_USAGE_LANE.FORGE && tokenBalance != null && tokenBalance <= 0) {
          return jsonResponse(402, {
            ok: false,
            error: "No AI credits remaining.",
            ...buildBillingSnapshot(lane),
          });
        }

        if (!supabaseService) {
          return jsonResponse(500, {
            ok: false,
            error: "Supabase service role is not configured.",
            ...buildBillingSnapshot(lane),
          });
        }

        const userId = await resolveUserId(bearerToken);
        if (!userId) {
          return jsonResponse(401, {
            ok: false,
            error: "Authentication required.",
            ...buildBillingSnapshot(lane),
          });
        }

        const workpieceId = readOptionalString(bodyRaw.workpiece_id);
        const storageKey = readOptionalString(bodyRaw.storage_key);
        const mimeType = readOptionalString(bodyRaw.mime_type);

        if (!workpieceId || !storageKey) {
          return jsonResponse(400, {
            ok: false,
            error: "workpiece_id and storage_key are required",
            ...buildBillingSnapshot(lane),
          });
        }

        const expectedPrefix = `workpieces/${workpieceId}/stt/`;
        if (!storageKey.startsWith(expectedPrefix)) {
          return jsonResponse(400, {
            ok: false,
            error: "storage_key must be inside workpiece STT path",
            ...buildBillingSnapshot(lane),
          });
        }

        const { data: audioBlob, error: downloadError } = await supabaseService.storage
          .from(sttBucket)
          .download(storageKey);

        if (downloadError || !audioBlob) {
          return jsonResponse(404, {
            ok: false,
            error: downloadError?.message || "Audio file not found.",
            ...buildBillingSnapshot(lane),
          });
        }

        if (audioBlob.size <= 0) {
          return jsonResponse(400, {
            ok: false,
            error: "Audio file is empty.",
            ...buildBillingSnapshot(lane),
          });
        }

        if (audioBlob.size > STT_MAX_BYTES) {
          return jsonResponse(413, {
            ok: false,
            error: "Audio file exceeds 10MB limit.",
            ...buildBillingSnapshot(lane),
          });
        }

        const ext = inferAudioExtension(mimeType || audioBlob.type || null, storageKey);
        const form = new FormData();
        form.set("model", sttModel);
        form.set("file", audioBlob, `speech.${ext}`);
        const providedSttActionId = readOptionalString(bodyRaw.action_id);
        const sttActionId = isUuid(providedSttActionId) ? providedSttActionId : crypto.randomUUID();

        const upstreamAbort = new AbortController();
        let clientAborted = request.signal.aborted;
        const onAborted = () => {
          clientAborted = true;
          upstreamAbort.abort();
        };
        request.signal.addEventListener("abort", onAborted, { once: true });

        try {
          let upstream: Response;
          try {
            upstream = await runAIRequest({
              lane,
              userId,
              workspaceId: null,
              workpieceId,
              sessionId: null,
              feature: AI_USAGE_FEATURE.SPEECH_TRANSCRIPTION,
              subfeature: AI_USAGE_SUBFEATURE.WORKPIECE_AUDIO,
              model: sttModel,
              trigger: AI_USAGE_TRIGGER.USER,
              actionId: sttActionId,
              request: {
                url: "https://api.openai.com/v1/audio/transcriptions",
                init: {
                  method: "POST",
                  headers: {
                    authorization: `Bearer ${textApiKey}`,
                  },
                  body: form,
                },
                signal: upstreamAbort.signal,
              },
            });
          } catch (error) {
            if (clientAborted || upstreamAbort.signal.aborted) {
              return new Response(null, { status: 499 });
            }
            throw error;
          }

          if (clientAborted) {
            return new Response(null, { status: 499 });
          }

          if (!upstream.ok) {
            const detail = await upstream.text();
            const upstreamMessage = readUpstreamErrorMessage(detail) ?? "OpenAI error";
            const status = upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 502;
            return jsonResponse(status, {
              ok: false,
              error: upstreamMessage,
              detail,
              ...buildBillingSnapshot(lane),
            });
          }

          const payload = (await upstream.json()) as unknown;
          const text = extractTranscriptionText(payload);
          if (!text) {
            await recordAiUsageEvent({
              userId,
              lane,
              provider: "openai",
              workspaceId: null,
              workpieceId,
              sessionId: null,
              feature: AI_USAGE_FEATURE.SPEECH_TRANSCRIPTION,
              subfeature: AI_USAGE_SUBFEATURE.WORKPIECE_AUDIO,
              model: sttModel,
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              estimatedCostUsd: 0,
              actualCostUsd: 0,
              billableTokens: 0,
              trigger: AI_USAGE_TRIGGER.USER,
              status: AI_USAGE_STATUS.ERROR,
              actionId: sttActionId,
              providerRequestId: upstream.headers.get("x-request-id"),
              correlationId: sttActionId,
            });
            return jsonResponse(502, {
              ok: false,
              error: "OpenAI returned empty transcription",
              ...buildBillingSnapshot(lane),
            });
          }

          const accounting = buildTranscriptionAccounting({
            model: sttModel,
            payload,
            text,
            billableMode: lane === AI_USAGE_LANE.FORGE ? AI_USAGE_LANE.FORGE : "non-billable",
          });
          const totalTokens = accounting.totalTokens;
          const inputTokens = accounting.inputTokens;
          const outputTokens = accounting.outputTokens;
          const estimatedCostUsd = accounting.estimatedCostUsd;
          const billableTokens = accounting.billableTokens;
          const openAiRequestId = upstream.headers.get("x-request-id");
          const creditsWarning: string | null = null;

          await recordAiUsageEvent({
            userId,
            lane,
            provider: "openai",
            workspaceId: null,
            workpieceId,
            sessionId: null,
            feature: AI_USAGE_FEATURE.SPEECH_TRANSCRIPTION,
            subfeature: AI_USAGE_SUBFEATURE.WORKPIECE_AUDIO,
            model: sttModel,
            inputTokens,
            outputTokens,
            totalTokens,
            estimatedCostUsd,
            actualCostUsd: estimatedCostUsd,
            billableTokens,
            trigger: AI_USAGE_TRIGGER.USER,
            status: AI_USAGE_STATUS.SUCCESS,
            actionId: sttActionId,
            providerRequestId: openAiRequestId,
            correlationId: sttActionId,
          });

          if (lane === AI_USAGE_LANE.FORGE && billableTokens > 0) {
            const deltaResult = await applyTokenDelta({
              userId,
              spent: billableTokens,
              requestId: sttActionId,
              openAiRequestId,
              reason: "speech_transcription:forge_billing_tokens",
            });
            if (!deltaResult.ok) {
              return jsonResponse(502, {
                ok: false,
                error: "Failed to apply Forge credit deduction.",
                code: "forge_deduction_failed",
                ...buildBillingSnapshot(lane),
              });
            } else if (deltaResult.tokenBalance != null) {
              tokenBalance = deltaResult.tokenBalance;
            }
          }

          if (clientAborted || request.signal.aborted) {
            return new Response(null, { status: 499 });
          }

          return jsonResponse(200, {
            ok: true,
            text,
            total_tokens: totalTokens,
            provider_request_id: openAiRequestId,
            credits_warning: creditsWarning,
            actual_cost_usd: estimatedCostUsd,
            billable_tokens: billableTokens,
            ...buildBillingSnapshot(lane),
          });
        } finally {
          request.signal.removeEventListener("abort", onAborted);
        }
      }

      if (method !== "POST") {
        return jsonResponse(405, { ok: false, error: "Method not allowed" });
      }

      const bodyRaw = (await readJsonBody(request)) as ReqBody;
      const lane: BillingMode = isBillingMode(bodyRaw.lane) ? bodyRaw.lane : configuredBillingMode;
      const bearerToken = readBearerToken(request.headers.get("authorization"));
      const providedChatActionId = readOptionalString(bodyRaw.action_id);
      const chatActionId = isUuid(providedChatActionId) ? providedChatActionId : crypto.randomUUID();
      if (lane === AI_USAGE_LANE.FORGE && disableForgeLaneAi) {
        return jsonResponse(503, {
          ok: false,
          error: "Forge-lane AI is temporarily disabled by emergency control.",
          code: "forge_lane_disabled",
          ...buildBillingSnapshot(lane),
        });
      }
      if (disableExpensiveAiActions) {
        return jsonResponse(503, {
          ok: false,
          error: "Higher-cost AI actions are temporarily disabled.",
          code: "expensive_actions_disabled",
          ...buildBillingSnapshot(lane),
        });
      }

      if (!textApiKey) {
        return jsonResponse(500, {
          ok: false,
          error: MISSING_OPENAI_TEXT_API_KEY_ERROR,
          ...buildBillingSnapshot(lane),
        });
      }

      if (lane === AI_USAGE_LANE.FORGE && tokenBalance != null && tokenBalance <= 0) {
        return jsonResponse(402, {
          ok: false,
          error: "No AI credits remaining.",
          ...buildBillingSnapshot(lane),
        });
      }

      const rawMessages = Array.isArray(bodyRaw.messages) ? bodyRaw.messages : [];
      const messages = rawMessages
        .map(toChatMessage)
        .filter((item): item is ChatMessage => Boolean(item))
        .slice(-24);

      if (!messages.length) {
        return jsonResponse(400, {
          ok: false,
          error: "messages are required",
          ...buildBillingSnapshot(lane),
        });
      }

      const episodeContext = normalizeEpisodeContext(bodyRaw.episode_context);
      if (!episodeContext) {
        return jsonResponse(400, {
          ok: false,
          error: "episode_context with episodeId is required",
          ...buildBillingSnapshot(lane),
        });
      }

      const latestUserMessageIndex = [...messages]
        .map((message, index) => ({ message, index }))
        .reverse()
        .find((entry) => entry.message.role === "user")
        ?.index;
      const latestUserMessage = typeof latestUserMessageIndex === "number"
        ? messages[latestUserMessageIndex] ?? null
        : null;
      const requestText = latestUserMessage?.content ?? "";
      const userId = await resolveUserId(bearerToken);
      if (lane === AI_USAGE_LANE.FORGE && !userId) {
        return jsonResponse(401, {
          ok: false,
          error: "Authentication required.",
          ...buildBillingSnapshot(lane),
        });
      }
      const chatFeature = classifyChatFeature(requestText);
      const requestedReasoningEffort = isRecord(bodyRaw.behavior)
        ? readOptionalString((bodyRaw.behavior as Record<string, unknown>).reasoning_effort)
        : null;
      const requestedModel = isRecord(bodyRaw.behavior)
        ? readOptionalString((bodyRaw.behavior as Record<string, unknown>).model)
        : null;
      if (disableCdcGeneration && CDC_REQUEST_RE.test(requestText)) {
        return jsonResponse(503, {
          ok: false,
          error: "CDC generation is temporarily disabled by emergency control.",
          code: "cdc_generation_disabled",
          ...buildBillingSnapshot(lane),
        });
      }
      const priorMessages = typeof latestUserMessageIndex === "number"
        ? messages.filter((_, index) => index !== latestUserMessageIndex)
        : messages;
      const researchModeRequested = isResearchIntentRequest(requestText);
      const estimatedInputTokens = Math.max(
        1,
        Math.ceil(
          messages.reduce((sum, message) => sum + message.content.length, 0) / 4,
        ),
      ) + 300;
      const estimatedOutputTokens = researchModeRequested ? 1400 : 900;
      let aiRoute: ReturnType<typeof routeForgeAiRequest>;
      try {
        aiRoute = routeForgeAiRequest({
          tool: "hearth",
          feature: mapChatRequestToRouterFeature({
            chatFeature,
            researchModeRequested,
          }),
          requestedModel: requestedModel ?? configuredModel,
          requestedReasoningEffort,
          estimatedTokens: {
            inputTokens: estimatedInputTokens,
            outputTokens: estimatedOutputTokens,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI routing policy rejected request";
        return jsonResponse(422, {
          ok: false,
          error: message,
          code: "ai_budget_guard_rejected",
          ...buildBillingSnapshot(lane),
        });
      }
      const model = aiRoute.model;
      const reasoningEffort = aiRoute.reasoning;
      if (!ALLOWED_CHAT_MODELS.has(model)) {
        return jsonResponse(503, {
          ok: false,
          error: `Routed model '${model}' is not allowlisted for Forge lane.`,
          code: "model_not_allowlisted",
          ...buildBillingSnapshot(lane),
        });
      }
      const researchRequest = researchModeRequested
        ? buildHearthResearchRequest({ query: requestText })
        : null;
      let researchResult: HearthResearchResult | null = null;
      if (researchRequest) {
        try {
          researchResult = await researchRuntime.run({
            request: researchRequest,
            workspaceId: episodeContext.workspaceId,
            workpieceId: episodeContext.episodeId,
            signal: request.signal,
          });
        } catch {
          researchResult = buildEmptyHearthResearchResult({
            mode: "knowledge_first",
            runtimeStatus: "error",
            summary: "Research runtime failed before synthesis.",
          });
        }
        await recordHearthEventForToken({
          accessToken: bearerToken,
          episodeId: episodeContext.episodeId,
          eventType: "research_runtime_result",
          payload: {
            source: "middleware",
            query: researchRequest.query,
            intent: researchRequest.intent,
            recency: researchRequest.recencyPreference,
            max_sources: researchRequest.maxSources,
            require_dates: researchRequest.requireDates,
            require_full_extraction: researchRequest.requireFullExtraction,
            ...summarizeResearchResult(researchResult),
          },
        });
      }
      const readinessCheckRequested = isReadinessCheckRequest(requestText);
      const allowRepeatedReadinessNudge = requestedDeepReadinessReview(requestText);
      const priorAssistantMessage = [...priorMessages]
        .reverse()
        .find((entry) => entry.role === "assistant")
        ?.content ?? "";
      const priorReadinessNudge = detectReadinessNudgeCategory(priorAssistantMessage);
      const creatorProfile = await loadCreatorProfileForToken(bearerToken);
      const writingProfile = await loadWritingProfileForToken(bearerToken, episodeContext.workspaceId);

      if (shouldAskClarifyingQuestions({
        requestText,
        profile: creatorProfile,
        chatHistory: priorMessages,
      })) {
        const clarifyReply = buildClarifyingQuestionReply(creatorProfile);
        const questionCount = countNumberedQuestions(clarifyReply);
        await recordHearthEventForToken({
          accessToken: bearerToken,
          episodeId: episodeContext.episodeId,
          eventType: "gate_questions_shown",
          payload: {
            source: "middleware",
            question_count: questionCount,
            clarify_first_bias: creatorProfile.clarifyFirstBias,
            confidence: creatorProfile.confidence,
          },
        });

        return jsonResponse(200, {
          ok: true,
          assistant_text: clarifyReply,
          reply: clarifyReply,
          ops: [],
          script_text: null,
          tag_audit: null,
          total_tokens: 0,
          gate: "clarify",
          ...buildBillingSnapshot(lane),
        });
      }

      const styleGuidanceSections = [
        buildProfileStyleSnippet(
          creatorProfile,
          writingProfile,
          requestText,
          episodeContext.tonePreset,
        ),
      ];

      const styleSamples = await loadStyleSamplesForToken(bearerToken, episodeContext.workspaceId);
      const recentScriptRefs = await loadRecentScriptReferencesForToken(bearerToken, episodeContext.workspaceId);
      const recentScriptExcerpts = await loadRecentScriptExcerpts(recentScriptRefs);
      const crossProjectReference = resolveCrossProjectReference({
        requestText,
        currentWorkpieceId: episodeContext.episodeId,
        references: recentScriptRefs,
      });
      const styleCorpusSnippet = buildStyleCorpusSnippet({
        styleSamples,
        recentScriptExcerpts,
      });
      if (styleCorpusSnippet) {
        styleGuidanceSections.push(styleCorpusSnippet);
      }

      const system: ChatMessage = {
        role: "system",
        content: buildSystemPrompt(
          episodeContext,
          styleGuidanceSections.filter((section) => section.trim().length > 0).join("\n"),
          {
            readinessCheck: readinessCheckRequested,
            allowRepeatedReadinessNudge,
            priorReadinessNudge,
            researchMode: researchModeRequested,
            researchRequest,
            researchResult,
          },
        ),
      };

      const upstreamAbort = new AbortController();
      let clientAborted = request.signal.aborted;
      const onAborted = () => {
        clientAborted = true;
        upstreamAbort.abort();
      };
      request.signal.addEventListener("abort", onAborted, { once: true });

      try {
        const modelAllowsTemperatureOverride = !isGpt5FamilyModel(model);
        const requestedTemperature = readBehaviorTemperature(bodyRaw.behavior);
        const completionMessages = [system, ...messages];
        const callOpenAi = async (allowTemperatureOverride: boolean): Promise<Response> => {
          const payload = allowTemperatureOverride
            ? {
                model,
                temperature: requestedTemperature,
                messages: completionMessages,
              }
            : {
                model,
                messages: completionMessages,
              };
          return runAIRequest({
            lane,
            userId,
            workspaceId: episodeContext.workspaceId,
            workpieceId: episodeContext.episodeId,
            sessionId: null,
            feature: chatFeature.feature,
            subfeature: chatFeature.subfeature,
            model,
            reasoningEffort,
            trigger: AI_USAGE_TRIGGER.USER,
            actionId: chatActionId,
            isRecoverableHttpError: async (response) => {
              if (!allowTemperatureOverride || response.status !== 400) return false;
              const detail = await response.text();
              return isTemperatureUnsupportedError(detail);
            },
            request: {
              url: "https://api.openai.com/v1/chat/completions",
              init: {
                method: "POST",
                headers: {
                  authorization: `Bearer ${textApiKey}`,
                  "content-type": "application/json",
                },
                body: JSON.stringify(payload),
              },
              signal: upstreamAbort.signal,
            },
          });
        };

        let upstream: Response;
        let usedTemperatureOverride = modelAllowsTemperatureOverride;
        try {
          upstream = await callOpenAi(usedTemperatureOverride);
        } catch (error) {
          if (clientAborted || upstreamAbort.signal.aborted) {
            return new Response(null, { status: 499 });
          }
          throw error;
        }

        if (clientAborted) {
          return new Response(null, { status: 499 });
        }

        if (!upstream.ok) {
          let detail = await upstream.text();
          if (
            usedTemperatureOverride
            && upstream.status === 400
            && isTemperatureUnsupportedError(detail)
          ) {
            try {
              upstream = await callOpenAi(false);
              usedTemperatureOverride = false;
            } catch (error) {
              if (clientAborted || upstreamAbort.signal.aborted) {
                return new Response(null, { status: 499 });
              }
              throw error;
            }

            if (!clientAborted && !upstream.ok) {
              detail = await upstream.text();
            }
          }

          if (!upstream.ok) {
            const upstreamMessage = readUpstreamErrorMessage(detail) ?? "OpenAI error";
            const status = upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 502;
            return jsonResponse(status, {
              ok: false,
              error: upstreamMessage,
              detail,
              ...buildBillingSnapshot(lane),
            });
          }
        }

        const payload = (await upstream.json()) as unknown;
        const rawReply = extractAssistantReply(payload);
        if (!rawReply) {
          await recordAiUsageEvent({
            userId,
            lane,
            provider: "openai",
            workspaceId: episodeContext.workspaceId,
            workpieceId: episodeContext.episodeId,
            sessionId: null,
            feature: chatFeature.feature,
            subfeature: chatFeature.subfeature,
            model,
            reasoningEffort,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            estimatedCostUsd: 0,
            actualCostUsd: 0,
            billableTokens: 0,
            trigger: AI_USAGE_TRIGGER.USER,
            status: AI_USAGE_STATUS.ERROR,
            actionId: chatActionId,
            providerRequestId: upstream.headers.get("x-request-id"),
            correlationId: chatActionId,
          });
          return jsonResponse(502, {
            ok: false,
            error: "OpenAI returned empty response",
            ...buildBillingSnapshot(lane),
          });
        }

        const structured = normalizeStructuredReply(rawReply) ?? {
          assistantText: rawReply,
          ops: [],
          scriptText: null,
          tagAudit: null,
        };

        if (readinessCheckRequested) {
          structured.assistantText = normalizeReadinessAssistantText({
            assistantText: structured.assistantText,
            priorAssistantText: priorAssistantMessage,
            allowRepeatedNudge: allowRepeatedReadinessNudge,
          });
          // Readiness checks should return guidance only, not apply edits.
          structured.ops = [];
        }

        if (researchModeRequested && researchRequest && researchResult) {
          structured.assistantText = enforceResearchOutcomeReply({
            assistantText: structured.assistantText,
            request: researchRequest,
            result: researchResult,
          });
        }

        if (crossProjectReference.detected) {
          structured.assistantText = enforceCrossProjectScopeReply({
            assistantText: structured.assistantText,
            resolution: crossProjectReference,
          });
        }

        if (!structured.assistantText && structured.ops.length === 0) {
          return jsonResponse(502, {
            ok: false,
            error: "Assistant returned an invalid response",
            ...buildBillingSnapshot(lane),
          });
        }

        const hasOutlineOp = structured.ops.some((op) => op.op === "set_outline");
        const hasBodyOp = structured.ops.some((op) => op.op === "set_body");
        if (!isProductionSupportRequest(requestText)) {
          const generatedEventType = (
            requestedOutline(requestText)
            || (hasOutlineOp && !hasBodyOp)
          ) ? "outline_generated" : "draft_generated";
          await recordHearthEventForToken({
            accessToken: bearerToken,
            episodeId: episodeContext.episodeId,
            eventType: generatedEventType,
            payload: {
              source: "middleware",
              ops_count: structured.ops.length,
              has_outline_op: hasOutlineOp,
              has_body_op: hasBodyOp,
              requested_outline: requestedOutline(requestText),
              requested_script: requestedScript(requestText),
            },
          });
        }

        if (clientAborted || request.signal.aborted) {
          return new Response(null, { status: 499 });
        }

        const totalTokens = extractTotalTokens(payload);
        const spent = totalTokens ?? estimateTokenFallback(messages, rawReply);
        const accounting = buildUsageAccounting({
          model,
          payload,
          fallbackTotalTokens: spent,
          preflightEstimatedCostUsd: aiRoute.estimatedCostUsd,
          billableMode: lane === AI_USAGE_LANE.FORGE ? AI_USAGE_LANE.FORGE : "non-billable",
        });
        const inputTokens = accounting.inputTokens;
        const outputTokens = accounting.outputTokens;
        const estimatedCostUsd = accounting.estimatedCostUsd;
        const billableTokens = accounting.billableTokens;
        const openAiRequestId = upstream.headers.get("x-request-id");
        const creditsWarning: string | null = null;

        await recordAiUsageEvent({
          userId,
          lane,
          provider: "openai",
          workspaceId: episodeContext.workspaceId,
          workpieceId: episodeContext.episodeId,
          sessionId: null,
          feature: chatFeature.feature,
          subfeature: chatFeature.subfeature,
          model,
          reasoningEffort,
          inputTokens,
          outputTokens,
          totalTokens: spent,
          estimatedCostUsd,
          actualCostUsd: estimatedCostUsd,
          billableTokens,
          trigger: AI_USAGE_TRIGGER.USER,
          status: AI_USAGE_STATUS.SUCCESS,
          actionId: chatActionId,
          providerRequestId: openAiRequestId,
          correlationId: chatActionId,
        });

        if (lane === AI_USAGE_LANE.FORGE && billableTokens > 0) {
          if (!userId) {
            return jsonResponse(401, {
              ok: false,
              error: "Authentication required.",
              ...buildBillingSnapshot(lane),
            });
          } else {
            const deltaResult = await applyTokenDelta({
              userId,
              spent: billableTokens,
              requestId: chatActionId,
              openAiRequestId,
              reason: "hearth:chat:forge_billing_tokens",
            });
            if (!deltaResult.ok) {
              return jsonResponse(502, {
                ok: false,
                error: "Failed to apply Forge credit deduction.",
                code: "forge_deduction_failed",
                ...buildBillingSnapshot(lane),
              });
            } else if (deltaResult.tokenBalance != null) {
              tokenBalance = deltaResult.tokenBalance;
            }
          }
        }

        if (clientAborted || request.signal.aborted) {
          return new Response(null, { status: 499 });
        }

        return jsonResponse(200, {
          ok: true,
          assistant_text: structured.assistantText,
          reply: structured.assistantText,
          ops: structured.ops,
          script_text: structured.scriptText,
          tag_audit: structured.tagAudit,
          ...(researchResult ? { research_result: researchResult } : {}),
          total_tokens: spent,
          actual_cost_usd: estimatedCostUsd,
          billable_tokens: billableTokens,
          credits_warning: creditsWarning,
          ...buildBillingSnapshot(lane),
        });
      } finally {
        request.signal.removeEventListener("abort", onAborted);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return jsonResponse(500, { ok: false, error: message });
    }
  };
}
