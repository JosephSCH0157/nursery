import crypto from "node:crypto";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getAiReasonMessage,
  resolveAiPolicy,
  type AiFundingSource,
  type AiPolicyResolveResult,
  type AiMode,
  type Database,
} from "@forge/tongs";
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
  normalizeHearthResearchArtifact,
  type HearthResearchArtifact,
  type HearthResearchBrief,
  type HearthResearchEvidence,
  type HearthResearchResult,
  type HearthResearchRequest,
  type HearthResearchSource,
} from "../../../hearth/src/lib/hearth-research-contract";
import { shapeHearthScriptForRecording } from "../../../hearth/src/lib/hearth-recording-ready-script";
import {
  canonicalizeHearthProductionArtifactOutput,
  validateHearthProductionArtifactOutput,
} from "../../../hearth/src/lib/hearth-production-feedback";
import {
  createHearthResearchRuntime,
  classifyResearchSourceAuthority,
  extractUrlToResearchSource,
} from "./hearth-research-runtime";
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
import {
  connectUserAiKey,
  disconnectUserAiKey,
  getUserAiKeyStatus,
} from "./user-ai-keys-service";
import {
  MissingForgeKeyError,
  MissingUserKeyError,
  PolicyDeniedError,
  resolveEffectiveAiCredentials,
} from "./resolve-effective-ai-credentials";

type StructuredReply = {
  assistantText: string;
  ops: HearthOp[];
  scriptText: string | null;
  tagAudit: Record<string, unknown> | null;
  researchArtifact: HearthResearchArtifact | null;
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
  attachment_context?: unknown;
  production_action?: unknown;
  production_script_version?: unknown;
  user_authored_text?: unknown;
};

type AttachmentContextRequest = {
  includeEpisodeAttachments: boolean;
  attachmentIds: string[];
};

type SttReqBody = {
  workpiece_id?: unknown;
  storage_key?: unknown;
  mime_type?: unknown;
  lane?: unknown;
  action_id?: unknown;
};

type AiKeysConnectReqBody = {
  provider?: unknown;
  api_key?: unknown;
  key_label?: unknown;
  provider_account_id?: unknown;
  validation_mode?: unknown;
};

type AiKeysDisconnectReqBody = {
  provider?: unknown;
  provider_account_id?: unknown;
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
const HEARTH_ATTACHMENT_PROMPT_MAX_CHARS = 12_000;
const HEARTH_ATTACHMENT_PER_FILE_MAX_CHARS = 3_000;
const HEARTH_ATTACHMENT_PROMPT_MAX_FILES = 8;
const READINESS_CHECK_RE = /\b(are we ready|ready to record|record now|can i record|good to record|ready for anvil|ship this|go live)\b/i;
const READINESS_DEEP_REVIEW_RE = /\b(again|recheck|double check|deeper|strict|hard mode|harsh|be tough|second pass)\b/i;
const SOURCING_NUDGE_RE = /\b(source|sources|sourcing|citation|citations|cite|evidence|verify|fact[- ]?check|corroborat)\b/i;
const RISK_NUDGE_RE = /\b(risk|risky|legal|defamation|liability|compliance|sensitive claim|hot take)\b/i;
const RECORD_ANYWAY_RE = /\b(record anyway|record now anyway|ok to record anyway|okay to record anyway|go ahead and record)\b/i;
const CDC_REQUEST_RE = /\b(cdc|contextual data composite|chart|graph|plot|dataset|bar chart|line chart|pie chart)\b/i;
const RESEARCH_INTENT_RE = /\b(browse|look up|lookup|find(?: me)?|search|research|retrieval|web research|live research|live web research|news|reports?|reporting|examples?|case studies?|incidents?|breach(?:es)?|source|sources|citations?|evidence)\b/i;
const FACT_SEEKING_QUESTION_RE = /\b(?:who|what|when|where|why|how (?:much|many|long|often)|what caused|what led to)\b/i;
const NON_RESEARCH_QUESTION_RE = /\b(?:what do you think|how does this (?:sound|read|feel)|should (?:i|we)|can (?:i|we)|help me (?:write|draft|revise|rewrite)|are you with me|do you follow)\b/i;
const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;
const CROSS_PROJECT_REFERENCE_RE = /\b(use|pull in|bring in|remember|recall|like|from)\b[\s\S]{0,120}\b(script|episode|project|conversation|workspace|last week|other chat|that)\b/i;
const LISTENING_TURN_RE = /\b(are you with me(?: so far)?|do you follow(?: me)?|tracking(?: with me)?|you with me)\b/i;
const OPINION_DISCUSSION_RE = /\b(my interpretation is|i think this means|i think\b|what do you think|am i reading this right|does this argument work|does this framing work|help me pressure[- ]?test|pressure[- ]?test this|i disagree|here is my opinion|my opinion is)\b/i;
const WORKSPACE_CONTEXT_EXPLICIT_RE = /\b(use|pull|pull in|bring in|load|open|find|continue|compare|reference|grab|look at|work from|base this on|tighten|revise|rewrite)\b[\s\S]{0,120}\b(current|saved|previous|prior|earlier|last|other|workspace|project|episode|draft|script|version|notes?|bar stock|hearth|tongs|media map|framing pack|titles?|tags?)\b|\b(current|saved|previous|prior|earlier|last|other|workspace|project|episode|draft|script|version|notes?|bar stock|hearth|tongs|media map|framing pack|titles?|tags?)\b[\s\S]{0,120}\b(use|pull|pull in|bring in|load|open|find|continue|compare|reference|grab|look at|work from|base this on|tighten|revise|rewrite)\b/i;
const WORKSPACE_OWNED_MATERIAL_RE = /\b(the episode we were working on|the project we were working on|the script we were working on|the draft i saved|saved draft|previous version|prior version|earlier draft|current episode draft|current script|current draft|current workspace|current project|current episode|bar stock|media map|framing pack)\b/i;
const INTERNAL_LEAK_REWRITE_FALLBACK = "I may be missing the exact context. Paste the case name, link, or a line from the draft and I'll anchor it cleanly.";
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

function mapEffectiveKeySourceToEventKeySource(source: "forge_managed" | "user_byo" | "org_shared"): "forge" | "byo" | "org_shared" {
  if (source === "user_byo") return "byo";
  if (source === "org_shared") return "org_shared";
  return "forge";
}

function mapLaneToRequestedMode(lane: BillingMode): AiMode {
  return lane === AI_USAGE_LANE.BYO ? "PERSONAL_ONLY" : "ORG_FIRST_PERSONAL_FALLBACK";
}

function mapLaneToRequestedFundingSource(lane: BillingMode): AiFundingSource {
  return lane === AI_USAGE_LANE.BYO ? "personal_byo_key" : "forge_managed_credits";
}

async function readPersonalAiConfigured(args: {
  supabaseService: SupabaseClient<Database> | null;
  userId: string | null;
  provider: string;
}): Promise<boolean> {
  if (!args.supabaseService || !args.userId) return false;
  const tableClient = args.supabaseService.schema("tongs") as unknown as {
    from: (table: string) => {
      select: (fields: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => {
            limit: (value: number) => Promise<{ data: unknown; error: { message: string } | null }>;
          };
        };
      };
    };
  };
  const { data, error } = await tableClient
    .from("user_ai_keys")
    .select("status")
    .eq("user_id", args.userId)
    .eq("provider", args.provider)
    .limit(1);
  if (error) return false;
  const row = Array.isArray(data) ? data[0] : null;
  if (!isRecord(row)) return false;
  return readOptionalString(row.status) === "active";
}

async function resolveRuntimeAiPolicy(args: {
  supabaseService: SupabaseClient<Database> | null;
  userId: string | null;
  workspaceId: string | null;
  lane: BillingMode;
  feature: string;
  action: string;
  provider: string;
  model: string;
  estimatedCostUsd: number | null;
  requestId: string;
}): Promise<AiPolicyResolveResult | null> {
  if (!args.supabaseService || !args.userId) return null;
  const personalAiConfigured = await readPersonalAiConfigured({
    supabaseService: args.supabaseService,
    userId: args.userId,
    provider: args.provider,
  });
  const tongsSupabaseService = (
    args.supabaseService as unknown as { schema?: (name: string) => unknown }
  ).schema?.("tongs") as unknown as SupabaseClient | undefined;
  const supabaseForPolicy = tongsSupabaseService ?? (args.supabaseService as unknown as SupabaseClient);
  return resolveAiPolicy(supabaseForPolicy, {
    orgId: null,
    workspaceId: args.workspaceId,
    userId: args.userId,
    tool: "hearth",
    feature: args.feature,
    action: args.action,
    requestedMode: mapLaneToRequestedMode(args.lane),
    personalAiConfigured,
    orgAiAvailable: true,
    requestedFundingSource: mapLaneToRequestedFundingSource(args.lane),
    estimatedCostUsd: args.estimatedCostUsd,
    provider: args.provider,
    model: args.model,
    requestId: args.requestId,
    writeLedger: false,
  });
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

type AllowedForgeChatModel = (typeof FORGE_ALLOWED_CHAT_MODELS)[number];

function isOpenAiModelAccessError(detail: string): boolean {
  const normalized = (detail || "").toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("model") && normalized.includes("does not exist")) return true;
  if (normalized.includes("model") && normalized.includes("do not have access")) return true;
  if (normalized.includes("model_not_found")) return true;
  return false;
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

function extractUrls(input: string): string[] {
  const raw = String(input ?? "");
  const matches = raw.match(URL_RE) ?? [];
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    const trimmed = match.replace(/[),.;:!?]+$/g, "");
    try {
      const url = new URL(trimmed);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      const normalized = url.toString();
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      urls.push(normalized);
      if (urls.length >= 4) break;
    } catch {
      // ignore invalid URLs
    }
  }
  return urls;
}

function removeUrls(input: string): string {
  return condenseWhitespace(String(input ?? "").replace(URL_RE, " "));
}

function stripHearthInternalRequestInstructions(input: string): string {
  const text = String(input ?? "");
  const markerPatterns = [
    /\bResponse tone:/i,
    /\bRecording-ready script rules:/i,
    /\bThe user prefers\b/i,
    /\bFor full scripts:/i,
  ];
  const markerIndexes = markerPatterns
    .map((pattern) => {
      const match = pattern.exec(text);
      return match?.index ?? -1;
    })
    .filter((index) => index >= 0);
  const end = markerIndexes.length ? Math.min(...markerIndexes) : text.length;
  return condenseWhitespace(text.slice(0, end));
}

function stripResearchContextMarkup(input: string): string {
  return condenseWhitespace(String(input ?? "")
    .replace(/\[\/?(?:s1|s2|g1|g2|note)\]/gi, " ")
    .replace(/\[(?:pause|beat|reflective pause)\]/gi, " ")
    .replace(/\[[^\]]{1,48}\]/g, " ")
    .replace(URL_RE, " "));
}

const RESEARCH_SCAFFOLDING_PATTERNS: RegExp[] = [
  /\bdraft intro goes here\.?\b/gi,
  /\buntitled(?: episode| script| draft)?\b/gi,
  /\b(?:start|add|write|enter) (?:your |the )?(?:intro|introduction|script|draft|section|content) (?:here|text here)\.?\b/gi,
  /\bempty (?:intro|section|script|draft)\b/gi,
  /\b(?:intro|introduction|section) placeholder\b/gi,
];

function stripResearchScaffolding(input: string): string {
  let cleaned = stripResearchContextMarkup(input);
  for (const pattern of RESEARCH_SCAFFOLDING_PATTERNS) {
    cleaned = cleaned.replace(pattern, " ");
  }
  return condenseWhitespace(cleaned);
}

function deriveResearchGoals(requestText: string): string[] {
  const clean = condenseWhitespace(requestText);
  const clauses = clean
    .split(/(?:\r?\n|;|\?+|\.(?=\s|$)|,\s*(?=(?:and\s+)?(?:who|what|when|where|why|how)\b)|\s+and\s+(?=(?:who|what|when|where|why|how)\b))/i)
    .map((clause) => clause.replace(/^and\s+/i, ""))
    .map((clause) => condenseWhitespace(clause.replace(/^(?:research|investigate|find|verify|look into)\s+/i, "")))
    .filter((clause) => clause.length >= 3);
  return Array.from(new Set(clauses.length ? clauses : [clean])).slice(0, 8);
}

export function buildHearthResearchBrief(args: {
  requestText: string;
  episodeContext: EpisodeContext;
  requestAuthority?: string | null;
}): HearthResearchBrief | null {
  const creatorRequest = stripHearthInternalRequestInstructions(args.requestText);
  if (!creatorRequest) return null;
  const cleanTitle = stripResearchScaffolding(args.episodeContext.title);
  const goals = deriveResearchGoals(creatorRequest);
  const episodeContextText = stripResearchScaffolding([
    args.episodeContext.outline,
    args.episodeContext.body,
    ...args.episodeContext.sparks.map((spark) => spark.text),
  ].filter(Boolean).join(" "));
  const contextSnippet = episodeContextText.length > 360
    ? episodeContextText.slice(0, 360).replace(/\s+\S*$/, "")
    : episodeContextText;
  const baseQuery = condenseWhitespace([cleanTitle, creatorRequest, contextSnippet].filter(Boolean).join(" "));
  const queries = Array.from(new Set([
    baseQuery,
    condenseWhitespace([cleanTitle, creatorRequest, "official records primary sources"].filter(Boolean).join(" ")),
    condenseWhitespace([baseQuery, goals.join(" "), "independent reporting archive data"].filter(Boolean).join(" ")),
  ].filter(Boolean))).slice(0, 3);
  const requestAuthority = readOptionalString(args.requestAuthority) ?? "deterministic-preview";
  const fingerprintPayload = JSON.stringify({
    schema: "forge.hearth.research-brief.v1",
    workspaceId: args.episodeContext.workspaceId,
    workpieceId: args.episodeContext.episodeId,
    creatorRequest,
    episodeTitle: cleanTitle,
    episodeContext: contextSnippet,
    requestAuthority,
  });
  return {
    schema: "forge.hearth.research-brief.v1",
    workspaceId: args.episodeContext.workspaceId,
    workpieceId: args.episodeContext.episodeId,
    briefFingerprint: crypto.createHash("sha256").update(fingerprintPayload).digest("hex"),
    creatorRequest,
    episodeTitle: cleanTitle,
    goals,
    queries,
    sourcePriorities: [
      "Primary records from the entity or public body responsible for the claim",
      "Independent reporting with named evidence and dates",
      "Scholarly or technical material when the request needs specialist support",
    ],
  };
}

export function buildEpisodeContextResearchQuery(args: {
  requestText: string;
  episodeContext: EpisodeContext;
}): string | null {
  return buildHearthResearchBrief(args)?.queries[0] ?? null;
}

function buildLinkOnlyResearchResult(args: {
  sources: HearthResearchSource[];
  brief: HearthResearchBrief;
}): HearthResearchResult {
  const extracted = args.sources.filter((source) => source.extractionStatus === "extracted").length;
  const failed = args.sources.length - extracted;
  const uncertainties: string[] = [];
  if (!args.sources.length) {
    uncertainties.push("No URLs were provided for link extraction.");
  }
  if (failed > 0) {
    uncertainties.push(`${failed} link(s) could not be fully extracted (blocked, timed out, or unsupported content type).`);
  }
  return {
    mode: "retrieval_first",
    runtimeStatus: args.sources.length === 0
      ? "no_results"
      : extracted > 0
        ? (failed > 0 ? "partial" : "ok")
        : "partial",
    brief: args.brief,
    evidence: args.sources.map((source, index) => ({
      evidenceId: `evidence-${index + 1}`,
      briefFingerprint: args.brief.briefFingerprint,
      workpieceId: args.brief.workpieceId,
      sourceId: source.sourceId,
      excerpt: source.extractedText?.slice(0, 700) ?? source.transcript?.slice(0, 700) ?? null,
      authority: classifyResearchSourceAuthority(source),
      state: source.extractionStatus === "extracted" ? "inspected" : "inaccessible",
      uncertainty: source.extractionStatus === "extracted" ? null : source.extractionError || "Source content could not be inspected.",
    } satisfies HearthResearchEvidence)),
    artifact: null,
    sources: args.sources,
    synthesis: {
      summary: args.sources.length
        ? `Extracted ${extracted}/${args.sources.length} link(s).`
        : "No link sources were provided.",
      keyPoints: args.sources.slice(0, 6).map((source) => {
        const label = source.title?.trim() || source.domain || source.url;
        const note = source.extractionStatus === "extracted"
          ? "extracted"
          : source.extractionError
            ? `not extracted (${source.extractionError})`
            : `not extracted (${source.extractionStatus})`;
        return `${label} — ${note}`;
      }),
      uncertainties,
      coverageNote: `Extraction coverage: ${extracted}/${args.sources.length} links extracted.`,
    },
  };
}

function shouldShortCircuitLinkIngest(requestTextWithoutUrls: string): boolean {
  const trimmed = requestTextWithoutUrls.trim();
  if (!trimmed) return true;
  if (trimmed.length <= 24 && /^(try|again|check|test|one last time|ok|please|retry)$/i.test(trimmed)) return true;
  if (/^(try|retry|check|test)\b/i.test(trimmed) && trimmed.length <= 48) return true;
  return false;
}

function buildLinkIngestOnlyReply(args: { sources: HearthResearchSource[] }): string {
  if (!args.sources.length) {
    return "I didn’t receive any URLs to ingest.";
  }

  const source = args.sources[0];
  const lines: string[] = [];
  const isYoutube = source.sourceType === "youtube_video";

  if (isYoutube) {
    const basedOn = source.transcriptAvailable
      ? "Based on video metadata and captions."
      : "Based on video metadata only.";
    lines.push(basedOn);
  } else {
    lines.push("Based on retrieved source metadata and extracted text (when available).");
  }

  const title = source.title?.trim() || null;
  const publisher = source.publisher?.trim() || null;
  const author = source.author?.trim() || null;
  const publishedAt = source.publishedAt?.trim() || null;
  const url = source.url;

  lines.push(
    "",
    `Source: ${title ?? url}`,
    ...(publisher ? [`Publisher: ${publisher}`] : []),
    ...(author ? [`Author: ${author}`] : []),
    ...(publishedAt ? [`Published: ${publishedAt}`] : []),
    ...(source.ingestMode ? [`Ingest mode: ${source.ingestMode}`] : []),
    ...(typeof source.transcriptAvailable === "boolean" ? [`Transcript available: ${source.transcriptAvailable}`] : []),
  );

  if (Array.isArray(source.warnings) && source.warnings.length) {
    lines.push("", "Warnings:");
    for (const warning of source.warnings.slice(0, 6)) {
      lines.push(`- ${warning}`);
    }
  }

  if (isYoutube) {
    if (source.transcriptAvailable && Array.isArray(source.transcriptSegments) && source.transcriptSegments.length) {
      lines.push("", `Captions: ${source.transcriptSegments.length} cue(s) extracted. Ask for timestamped quote pulls.`);
    } else {
      lines.push("", "Next step: paste YouTube “Show transcript” text (or any captions export) if you want timestamped quote pulls.");
    }
  }

  return lines.join("\n").trim();
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
  if (normalized.includes("?") && FACT_SEEKING_QUESTION_RE.test(normalized) && !NON_RESEARCH_QUESTION_RE.test(normalized)) return true;
  return /\breach\b/.test(normalized) && /\breport(?:ing|s)?\b/.test(normalized);
}

export function shouldUseWorkspaceContext(requestText: string): boolean {
  const normalized = compactSpaces(requestText);
  if (!normalized) return false;

  const explicitWorkspaceRequest = WORKSPACE_CONTEXT_EXPLICIT_RE.test(normalized)
    || WORKSPACE_OWNED_MATERIAL_RE.test(normalized);
  if (!explicitWorkspaceRequest) return false;

  // Opinion and pressure-test turns should stay conversational unless the user also
  // clearly asks Hearth to use saved/current project material.
  if (OPINION_DISCUSSION_RE.test(normalized) && !WORKSPACE_OWNED_MATERIAL_RE.test(normalized)) {
    return false;
  }

  return true;
}

function isCrossProjectReferenceRequest(text: string): boolean {
  const normalized = compactSpaces(text);
  if (!normalized) return false;
  if (!shouldUseWorkspaceContext(normalized)) return false;
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

function isFramingPackProductionRequest(text: string): boolean {
  const normalized = compactSpaces(text);
  return normalized.includes("generate a framing pack")
    || normalized.includes("release prep pack")
    || normalized.includes("release_prep_pack")
    || (normalized.includes("youtube_optimized_cut:") && normalized.includes("monetization_angle:"));
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

function normalizeAttachmentContextRequest(value: unknown): AttachmentContextRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      includeEpisodeAttachments: true,
      attachmentIds: [],
    };
  }

  const row = value as Record<string, unknown>;
  const includeEpisodeAttachments = typeof row.include_episode_attachments === "boolean"
    ? row.include_episode_attachments
    : true;
  const rawIds = Array.isArray(row.attachment_ids) ? row.attachment_ids : [];
  const attachmentIds = rawIds
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => UUID_RE.test(entry))
    .slice(0, 64);

  return {
    includeEpisodeAttachments,
    attachmentIds,
  };
}

function buildAttachmentContextSnippet(attachments: Array<{
  id: string;
  filename: string;
  parse_status: string;
  parse_error: string | null;
  extracted_text: string | null;
}>): string | null {
  if (attachments.length === 0) return null;

  const lines: string[] = [
    "hearth_attachment_context:",
  ];
  let totalChars = 0;

  for (const attachment of attachments.slice(0, HEARTH_ATTACHMENT_PROMPT_MAX_FILES)) {
    const extracted = (attachment.extracted_text ?? "").trim();
    const parseStatus = attachment.parse_status === "attached" || attachment.parse_status === "failed"
      ? attachment.parse_status
      : "pending";

    lines.push(`- file: ${attachment.filename}`);
    lines.push(`  attachment_id: ${attachment.id}`);
    lines.push(`  parse_status: ${parseStatus}`);
    if (attachment.parse_error) {
      lines.push(`  parse_error: ${attachment.parse_error}`);
    }

    if (!extracted) {
      lines.push("  extracted_text: (unavailable)");
      continue;
    }

    const remaining = HEARTH_ATTACHMENT_PROMPT_MAX_CHARS - totalChars;
    if (remaining <= 0) {
      lines.push("  extracted_text: (omitted: prompt cap reached)");
      continue;
    }

    const clipCap = Math.min(HEARTH_ATTACHMENT_PER_FILE_MAX_CHARS, remaining);
    const clipped = extracted.slice(0, clipCap);
    lines.push("  extracted_text:");
    lines.push(clipped);
    if (extracted.length > clipped.length) {
      lines.push("  note: excerpt truncated for prompt cap; full retrieval is deferred to a future slice.");
    }
    totalChars += clipped.length;
  }

  return lines.join("\n");
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
    attachmentContextSnippet?: string | null;
    listeningTurn?: boolean;
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
    "{\"assistantText\": string, \"ops\": HearthOp[], \"script_text\": string|null, \"tag_audit\": object|null, \"research_artifact\": object|null}",
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
    "HEARTH OUTPUT CONTRACT FOR ANVIL SCRIPT GENERATION:",
    "You are generating a script for Anvil. Formatting is NOT optional.",
    "If you produce a blob, the output is invalid and must be regenerated.",
    "Hard requirements:",
    "1. Speaker Separation",
    "- Every block must begin with [s1] or [s2] on its own line",
    "- Only ONE speaker per block",
    "- NEVER mix speakers in the same block",
    "2. Line Length Rules",
    "- Maximum 2 sentences per line",
    "- Maximum 3 lines per speaker block",
    "- After 2-3 lines, you MUST break into a new block",
    "3. Teleprompter Readability",
    "- Use short lines",
    "- Use whitespace generously",
    "- Insert [pause], [beat], or [reflective pause] where natural",
    "4. Structure Enforcement",
    "- No paragraph-style writing",
    "- No continuous text longer than 3 lines",
    "- Output must look like a performance script, not an article",
    "5. Validation Step (MANDATORY)",
    "Before finalizing, you MUST check:",
    "- Are there any blocks longer than 3 lines? If yes, fix them",
    "- Are any speakers mixed in a block? If yes, fix them",
    "- Does any section read like a paragraph? If yes, break it up",
    "If ANY of these fail, you must regenerate the output.",
    "Do not explain. Do not apologize. Just fix it.",
    "When asked to rewrite or rebuild a script: Rebuild the script. Do NOT preserve paragraph structure. Enforce the Anvil Output Contract above.",
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
    "- Editorial honesty: never present a fictional, composite, or representative scene as the narrator's literal personal memory.",
    "- Use first-person memory framing such as 'I remember' only when the user explicitly supplied that lived memory.",
    "- For constructed scenes, use transparent documentary framing such as 'Picture the scene...' or 'A person in that situation might see...'.",
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

  if (options?.listeningTurn) {
    baseLines.push(
      "Listening-turn override (hard rule):",
      "- The creator is still explaining an idea and is asking only whether you are following.",
      "- Briefly acknowledge the direction in one or two natural sentences, then invite them to continue.",
      "- Do not critique, outline, rewrite, add producer notes, propose production decisions, or ask format/host questions yet.",
      "- This override takes precedence over momentum, critique, optimization, and concrete-next-step defaults for this turn.",
    );
  }

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
      "- The serialized research brief is the only authority for research goals and evaluation criteria in this request.",
      "- Prior conversation may inform tone and continuity, but must not add research goals, claims, or sources.",
      "- Use only current-request evidence whose workpieceId and briefFingerprint match the research brief.",
      "- Inspect the supplied evidence excerpts and compare sources before writing findings.",
      "- Do not claim completion unless research_artifact contains substantive findings.",
      "- For complete or partial work, return research_artifact with the exact briefFingerprint and workpieceId from the brief.",
      "- Each factual finding must name one or more sourceIds from inspected current-request evidence. Use status verified_fact, reported_claim, or uncertain.",
      "- Editorial interpretation, including a causal connection inferred only from chronology, must use status editorial_interpretation and must not masquerade as a sourced fact.",
      "- When evidence establishes only sequence, say that events coincided or that one followed the other; do not say an ownership or financial change caused decline.",
      "- Set finding scope to current_subject only when it answers the named subject in the brief. Label separate nearby projects or entities adjacent_context and never use their spending, scope, or timeline to answer for the current subject.",
      "- Return uncertainties and conflicts explicitly. Never fill a gap from background knowledge.",
      "- If evidence is absent or unusable, return a failed artifact with no findings and say clearly that no validated findings were produced.",
      "- Creator assistance is appropriate only for a source explicitly marked inaccessible with a specific accessFailureReason; continue using other inspected sources.",
      "research_artifact shape:",
      "{\"briefFingerprint\":string,\"workpieceId\":string,\"status\":\"complete\"|\"partial\"|\"failed\",\"findings\":[{\"text\":string,\"status\":\"verified_fact\"|\"reported_claim\"|\"uncertain\"|\"editorial_interpretation\",\"scope\":\"current_subject\"|\"adjacent_context\",\"sourceIds\":string[]}],\"uncertainties\":string[],\"editorialInterpretation\":string[]}",
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
  if (options?.attachmentContextSnippet?.trim()) {
    baseLines.push(options.attachmentContextSnippet.trim());
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
  const shapedScriptText = inferredScriptText
    ? shapeHearthScriptForRecording(inferredScriptText)
    : null;
  const normalizedOps = shapedScriptText
    ? (
        ops.some((op) => op.op === "set_body")
          ? ops.map((op) => (op.op === "set_body" ? { ...op, value: shapedScriptText } satisfies HearthOp : op))
          : [...ops, { op: "set_body", value: shapedScriptText } satisfies HearthOp]
      )
    : ops;
  if (!assistantText && normalizedOps.length === 0) return null;
  const tagAudit = isRecord(parsed.tag_audit)
    ? parsed.tag_audit
    : buildTagAuditFromScript(shapedScriptText);
  return {
    assistantText,
    ops: normalizedOps,
    scriptText: shapedScriptText,
    tagAudit,
    researchArtifact: normalizeHearthResearchArtifact(parsed.research_artifact),
  };
}

function appendSavedEpisodeSourceProvenance(
  result: HearthResearchResult,
  episodeContext: EpisodeContext,
  brief: HearthResearchBrief,
): HearthResearchResult {
  const currentUrls = new Set(result.sources.map((source) => (source.canonicalUrl || source.url).trim().toLowerCase()));
  const savedEarlier: HearthResearchSource[] = episodeContext.sources.flatMap((source, index) => {
    const url = source.url.trim();
    if (!url || currentUrls.has(url.toLowerCase())) return [];
    return [{
      sourceId: `saved-${source.id || index + 1}`,
      title: source.title.trim() || null,
      url,
      domain: (() => { try { return new URL(url).hostname.toLowerCase(); } catch { return null; } })(),
      publishedAt: null,
      snippet: source.note.trim() || null,
      extractedText: null,
      extractionStatus: "skipped" as const,
      extractionError: "Saved earlier and not reverified during this research request.",
      provenance: {
        origin: "saved_episode_source" as const,
        briefFingerprint: brief.briefFingerprint,
        inspectedAt: null,
        inspectionStatus: "metadata_only" as const,
        accessFailureReason: null,
        verifiedInCurrentRequest: false,
      },
    }];
  });
  return savedEarlier.length ? { ...result, sources: [...result.sources, ...savedEarlier] } : result;
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

function cleanResearchPresentationText(input: string | null | undefined): string {
  return condenseWhitespace(String(input ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|amp|quot|#39);/gi, " ")
    .replace(URL_RE, " ")
    .replace(/\b(?:subscribe|sign up|share this|cookie policy|privacy policy|skip to content|navigation|read more)\b/gi, " "));
}

function authorityLabel(source: HearthResearchSource): string {
  return classifyResearchSourceAuthority(source).replace(/_/g, " ");
}

function sourcePublisher(source: HearthResearchSource): string {
  return cleanResearchPresentationText(source.publisher || source.title || source.domain || "Retrieved source");
}

const ANNOUNCEMENT_ONLY_RE = /^(?:(?:great|done|okay|all set)[,!.\s]+)?(?:here(?:'s| is) (?:the |your )?(?:research|research pack)|i(?:'ve| have)? (?:rebuilt|completed|finished|prepared) (?:the |your )?(?:research|research pack)|research (?:is )?complete|the research pack (?:is )?(?:ready|complete|rebuilt))\b[^.?!]*[.?!]?$/i;

function validateResearchArtifact(result: HearthResearchResult): HearthResearchArtifact | null {
  const brief = result.brief;
  const artifact = result.artifact;
  if (!brief || !artifact) return null;
  if (artifact.briefFingerprint !== brief.briefFingerprint || artifact.workpieceId !== brief.workpieceId) return null;
  if ((result.evidence ?? []).some((entry) => entry.briefFingerprint !== brief.briefFingerprint || entry.workpieceId !== brief.workpieceId)) return null;
  const inspectedSourceIds = new Set(result.sources
    .filter((source) => (
      source.provenance?.briefFingerprint === brief.briefFingerprint
      && source.provenance.inspectionStatus === "inspected"
      && source.provenance.verifiedInCurrentRequest
    ))
    .map((source) => source.sourceId));
  const inspectedIds = new Set((result.evidence ?? [])
    .filter((entry) => entry.state === "inspected" && Boolean(entry.excerpt))
    .filter((entry) => inspectedSourceIds.has(entry.sourceId))
    .map((entry) => entry.sourceId));
  const substantive = artifact.findings.filter((finding) => finding.text.trim().length >= 24 && !ANNOUNCEMENT_ONLY_RE.test(finding.text.trim()));
  if (artifact.status === "failed") return substantive.length === 0 ? artifact : null;
  if (substantive.length === 0) return null;
  for (const finding of substantive) {
    if (finding.status === "editorial_interpretation") continue;
    if (finding.sourceIds.length === 0 || finding.sourceIds.some((sourceId) => !inspectedIds.has(sourceId))) return null;
  }
  const currentRetrievalIncomplete = result.runtimeStatus !== "ok"
    || result.mode !== "retrieval_first"
    || result.sources.some((source) => (
      source.provenance?.origin !== "saved_episode_source"
      && source.provenance?.inspectionStatus !== "inspected"
    ));
  const scopedFindings = substantive.flatMap((finding) => {
    const split = splitBlendedAdjacentContext(finding.text);
    if (split) {
      return [
        { ...finding, text: split.currentSubject, scope: "current_subject" as const },
        { ...finding, text: split.adjacentContext, scope: "adjacent_context" as const },
      ];
    }
    return [{
      ...finding,
      scope: finding.scope === "adjacent_context"
        || describesNamedProjectOutsideBrief(finding.text, brief)
        || /\b(?:separate(?:ly)?|adjacent|nearby|broader)\b|\b(?:projects?|initiatives?|developments?)\s+(?:such as|like|including)\b/i.test(finding.text)
        ? "adjacent_context" as const
        : "current_subject" as const,
    }];
  });
  return {
    ...artifact,
    status: artifact.status === "complete" && (currentRetrievalIncomplete || scopedFindings.every((finding) => finding.scope === "adjacent_context")) ? "partial" : artifact.status,
    findings: scopedFindings,
    editorialInterpretation: artifact.editorialInterpretation.flatMap(normalizeEditorialInterpretation),
  };
}

function sentenceCase(value: string): string {
  const clean = value.trim().replace(/[.]+$/, "");
  return clean ? `${clean[0].toUpperCase()}${clean.slice(1)}.` : "";
}

function describesNamedProjectOutsideBrief(value: string, brief: HearthResearchBrief): boolean {
  const match = value.match(/\bproject\s+(?:called|named)\s+(?:the\s+)?([A-Z][A-Za-z0-9'’&-]*(?:\s+[A-Z][A-Za-z0-9'’&-]*){0,4})\b/);
  if (!match?.[1]) return false;
  const namedTokens = normalizedRepeatedRequest(match[1]).split(" ").filter((token) => token.length >= 3);
  if (namedTokens.length === 0) return false;
  const briefTokens = new Set(normalizedRepeatedRequest(`${brief.episodeTitle} ${brief.creatorRequest}`).split(" "));
  const overlapCount = namedTokens.filter((token) => briefTokens.has(token)).length;
  return overlapCount < Math.min(2, namedTokens.length);
}

function splitBlendedAdjacentContext(value: string): { currentSubject: string; adjacentContext: string } | null {
  const match = value.trim().match(/^(.+?)(?:\s*\+\s*|\s+and\s+)([^.;]*\b(?:projects?|initiatives?|developments?)\s+(?:such as|like|including)\s+.+?)\.?$/i);
  if (!match) return null;
  const currentSubject = sentenceCase(match[1]);
  const adjacentDescription = match[2].trim().replace(/^adjacent\s+/i, "").replace(/[.]+$/, "");
  if (!currentSubject || !adjacentDescription) return null;
  return {
    currentSubject,
    adjacentContext: `Separately, adjacent ${adjacentDescription} may affect the broader context.`,
  };
}

function normalizeEditorialInterpretation(value: string): string[] {
  const split = splitBlendedAdjacentContext(value);
  const parts = split ? [split.currentSubject, split.adjacentContext] : [value];
  return parts.map((part) => {
    let normalized = part
      .replace(/\bownership\s*(?:\/|and)\s*financial turbulence\b/gi, "ownership transition")
      .replace(/\bfinancial turbulence\b/gi, "ownership transition");
    if (/\bownership transition\b/i.test(normalized) && !/\bcoincid(?:e|ed|ing)\b/i.test(normalized)) {
      normalized = normalized.replace(/\bownership transition\b/i, "ownership transition (which coincided with the later decline)");
    }
    return normalized.trim();
  }).filter(Boolean);
}

function refinementPresentationLines(result: HearthResearchResult): string[] {
  const refinementQueries = result.synthesis.refinementQueries ?? [];
  const unresolvedGoals = result.synthesis.unresolvedGoals ?? [];
  const attemptCount = refinementQueries.length;
  if (attemptCount === 0) return [];
  const attemptLabel = attemptCount === 1 ? "follow-up search was" : "follow-up searches were";
  const lines = [`- ${attemptCount} bounded goal-specific ${attemptLabel} attempted.`];
  const moneyPattern = /\b(?:how much|spend|spending|budget|cost|funding|investment|contract award)\b/i;
  if ([...unresolvedGoals, ...refinementQueries].some((value) => moneyPattern.test(value))) {
    lines.push("- I tried the official-budget refinement and still could not verify the exact project amount from accessible current-request sources.");
  }
  for (const goal of unresolvedGoals.filter((value) => !moneyPattern.test(value))) {
    lines.push(`- I tried a goal-specific refinement and still could not verify: ${goal}.`);
  }
  return lines;
}

export function composeGroundedResearchAnswer(result: HearthResearchResult): string | null {
  const artifact = validateResearchArtifact(result);
  if (!artifact || artifact.status === "failed") return null;
  const sourceById = new Map(result.sources.map((source) => [source.sourceId, source]));
  const citedIds = new Set(artifact.findings.flatMap((finding) => finding.sourceIds));
  const renderFinding = (finding: HearthResearchArtifact["findings"][number]) => {
    const citations = finding.sourceIds.map((id) => `[${id}]`).join(" ");
    return `- ${finding.text}${citations ? ` ${citations}` : ""}`;
  };
  const currentFindingLines = artifact.findings.filter((finding) => finding.scope !== "adjacent_context").map(renderFinding);
  const adjacentFindingLines = artifact.findings.filter((finding) => finding.scope === "adjacent_context").map(renderFinding);
  const refinementLines = refinementPresentationLines(result);
  const inaccessible = result.sources.filter((source) => source.provenance?.inspectionStatus === "inaccessible");
  const referenceLines = [...citedIds]
    .map((sourceId) => sourceById.get(sourceId))
    .filter((source): source is HearthResearchSource => Boolean(source))
    .map((source) => `- [${source.sourceId}] ${sourcePublisher(source)} — ${authorityLabel(source)} — ${source.canonicalUrl || source.url}`);
  return [
    ...(currentFindingLines.length ? [artifact.status === "complete" ? "Validated findings" : "Validated partial findings", currentFindingLines.join("\n")] : []),
    ...(adjacentFindingLines.length ? ["Adjacent context", adjacentFindingLines.join("\n")] : []),
    "Research coverage",
    `- ${result.synthesis.coverageNote || "Coverage details unavailable."}`,
    ...(refinementLines.length ? [
      "Bounded refinement attempts",
      refinementLines.join("\n"),
    ] : []),
    ...(result.synthesis.unresolvedGoals?.length ? [
      "Unresolved explicit goals",
      result.synthesis.unresolvedGoals.map((goal) => `- ${goal}`).join("\n"),
    ] : []),
    "Uncertainty and conflicts",
    artifact.uncertainties.length ? artifact.uncertainties.map((item) => `- ${item}`).join("\n") : "- None identified in the inspected evidence.",
    "Editorial interpretation",
    artifact.editorialInterpretation.length ? artifact.editorialInterpretation.map((item) => `- ${item}`).join("\n") : "- No additional editorial interpretation.",
    "References inspected for this request",
    referenceLines.length ? referenceLines.join("\n") : "- No cited references.",
    ...(inaccessible.length ? [
      "Inaccessible sources",
      inaccessible.map((source) => `- ${source.url} — ${source.provenance?.accessFailureReason || "extraction_failed"}.`).join("\n"),
    ] : []),
  ].join("\n\n");
}

export function enforceResearchOutcomeReply(args: {
  assistantText: string;
  request: HearthResearchRequest;
  result: HearthResearchResult;
  repeatedRequestCount?: number;
}): string {
  const repeatLead = (args.repeatedRequestCount ?? 0) > 0
    ? (args.repeatedRequestCount ?? 0) > 1
      ? "You’ve asked this exact question a few times in this Episode, so I treated this as another fresh research check."
      : "You’ve asked this exact question before in this Episode, so I treated this as a fresh research check."
    : null;
  const groundedAnswer = composeGroundedResearchAnswer(args.result);
  if (groundedAnswer) {
    const groundedLead = args.result.artifact?.status === "partial" || args.result.runtimeStatus === "partial"
      ? "Research outcome: Partial. The validated findings and remaining uncertainty are separated below."
      : "Research outcome: Complete. A validated findings artifact is present below."
    return [repeatLead, groundedLead, groundedAnswer].filter(Boolean).join("\n\n");
  }
  const inaccessible = args.result.sources.filter((source) => source.provenance?.inspectionStatus === "inaccessible");
  const reason = args.result.providerStatus === "not_configured"
    ? "Live retrieval is not configured."
    : args.result.providerStatus === "provider_rate_limited"
      ? "The search provider rate limited this request."
      : args.result.providerStatus === "configured_but_provider_failing"
        ? "The search provider failed during this request."
        : args.result.runtimeStatus === "no_results"
          ? "No source candidates were returned for the current brief."
          : "Hearth did not produce a validated, substantive findings artifact from the current-request evidence.";
  const accessLines = inaccessible.map((source) => `- ${source.url} — ${source.provenance?.accessFailureReason || "extraction_failed"}.`);
  return [
    ...(repeatLead ? [repeatLead] : []),
    "Research outcome: Failed. No research pack was completed.",
    reason,
    ...(accessLines.length ? ["Inaccessible sources (creator assistance may be needed only for these):", accessLines.join("\n")] : []),
  ].join("\n\n");
}

function normalizedRepeatedRequest(value: string): string {
  return stripHearthInternalRequestInstructions(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .trim();
}

function countRepeatedCreatorRequests(requestText: string, priorMessages: ChatMessage[]): number {
  const target = normalizedRepeatedRequest(requestText);
  if (target.length < 12) return 0;
  return priorMessages.filter((message) => (
    message.role === "user" && normalizedRepeatedRequest(message.content) === target
  )).length;
}

function buildCrossProjectScopeLead(resolution: CrossProjectReferenceResolution): string | null {
  if (!resolution.detected) return null;
  if (resolution.level === "clear" && resolution.resolvedTitle) {
    return `I found the referenced draft "${resolution.resolvedTitle}" and can use it as background while keeping this episode as the active working fire.`;
  }
  if (resolution.level === "ambiguous" && resolution.candidateTitles.length >= 2) {
    const [first, second] = resolution.candidateTitles;
    return `I found more than one possible draft match: "${first}" or "${second}". Pick one and I will anchor to it cleanly.`;
  }
  return INTERNAL_LEAK_REWRITE_FALLBACK;
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

const REPRESENTATIVE_SCENE_REQUEST_RE = /\b(representative|composite|fictional|illustrative|constructed)\b[\s\S]{0,100}\b(scene|moment|grower|manager|worker)|\b(?:grower|manager|worker) scene\b/i;
const SUPPLIED_PERSONAL_MEMORY_RE = /\b(i remember|i recall|when i was|i saw|i watched|i experienced|i used to|this happened to me|my memory)\b/i;

export function enforceHearthEditorialHonesty(args: {
  assistantText: string;
  requestText: string;
}): string {
  if (!REPRESENTATIVE_SCENE_REQUEST_RE.test(args.requestText)) return args.assistantText;
  if (SUPPLIED_PERSONAL_MEMORY_RE.test(args.requestText)) return args.assistantText;
  return args.assistantText
    .replace(/\bI remember(?:ed)?\b/gi, "Picture the scene:")
    .replace(/\bframe (?:it|this) as (?:a )?(?:personal )?memory\b/gi, "frame it as a representative scene");
}

const FRAMING_PACK_INTERNAL_MARKERS: RegExp[] = [
  /\bi found\b/i,
  /\bi can anchor\b/i,
  /\bvia\s+tongs\b/i,
  /\btongs\b/i,
  /\bworkspace artifact\b/i,
  /\bscope note\b/i,
  /\bresolve it through tongs\b/i,
  /\binternal\/debug\b/i,
];

function sanitizeFramingPackReply(input: string): string {
  const raw = String(input ?? "").trim();
  if (!raw) return "Framing Pack generated from the current episode context.";

  const filteredLines = raw
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      return !FRAMING_PACK_INTERNAL_MARKERS.some((pattern) => pattern.test(trimmed));
    });

  const cleaned = filteredLines
    .join("\n")
    .replace(/\bScope note:\s*/gi, "")
    .replace(/\bvia\s+Tongs\b/gi, "")
    .replace(/\bworkspace artifact(s)?\b/gi, "episode context")
    .replace(/\s{2,}/g, " ")
    .trim();

  return cleaned || "Framing Pack generated from the current episode context.";
}

const USER_FACING_INTERNAL_LEAK_MARKERS: RegExp[] = [
  /\btongs\b/i,
  /\bworkspace artifact(s)?\b/i,
  /\bartifact matches\b/i,
  /\bscope note\b/i,
  /\breliable anchor\b/i,
  /\bresolve it through\b/i,
  /\bcross-project\b/i,
  /\binternal reference\b/i,
  /\bstyle corpus\b/i,
  /\benrichment\b/i,
];

function containsInternalLeak(text: string): boolean {
  return USER_FACING_INTERNAL_LEAK_MARKERS.some((pattern) => pattern.test(text));
}

export function sanitizeHearthUserFacingOutput(input: string): string {
  const raw = String(input ?? "").trim();
  if (!raw) return raw;

  const filtered = raw
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      return !containsInternalLeak(trimmed);
    })
    .join("\n")
    .replace(/\bTongs\b/gi, "the project context")
    .replace(/\bworkspace artifact(s)?\b/gi, "draft context")
    .replace(/\bartifact matches\b/gi, "possible draft matches")
    .replace(/\bscope note:?\s*/gi, "")
    .replace(/\breliable anchor\b/gi, "exact context")
    .replace(/\bresolve it through\b/gi, "anchor it with")
    .replace(/\bcross-project\b/gi, "between drafts")
    .replace(/\binternal reference\b/gi, "reference")
    .replace(/\bstyle corpus\b/gi, "style examples")
    .replace(/\benrichment\b/gi, "context")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!filtered) return INTERNAL_LEAK_REWRITE_FALLBACK;
  if (containsInternalLeak(filtered)) return INTERNAL_LEAK_REWRITE_FALLBACK;
  return filtered;
}

export function createHearthAiHandler(config: HearthRuntimeConfig) {
  const researchApiKey = (
    config.researchApiKey
    || process.env.HEARTH_RESEARCH_API_KEY
    || process.env.HEARTH_RESEARCH_BRAVE_API_KEY
    || process.env.BRAVE_SEARCH_API_KEY
    || process.env.BRAVE_API_KEY
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
    disableUserKeys,
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
    keySource?: "forge" | "byo" | "org_shared" | null;
    effectiveAiKeySource?: "forge_managed" | "user_byo" | "org_shared" | null;
    keyResolutionStatus?: "available" | "missing_required_key" | "provider_not_supported" | "policy_denied" | null;
    effectiveBillingLane?: BillingMode | null;
    policyDecisionType?: "ALLOW" | "SOFT_DENY" | "HARD_DENY" | null;
    policyReasonCode?: string | null;
    policySnapshot?: Record<string, unknown> | null;
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
      keySource: args.keySource ?? null,
      effectiveAiKeySource: args.effectiveAiKeySource ?? null,
      keyResolutionStatus: args.keyResolutionStatus ?? null,
      effectiveBillingLane: args.effectiveBillingLane ?? null,
      policyDecisionType: args.policyDecisionType ?? null,
      policyReasonCode: args.policyReasonCode ?? null,
      policySnapshot: args.policySnapshot ?? null,
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
    keySource?: "forge" | "byo" | "org_shared" | null;
    effectiveAiKeySource?: "forge_managed" | "user_byo" | "org_shared" | null;
    keyResolutionStatus?: "available" | "missing_required_key" | "provider_not_supported" | "policy_denied" | null;
    effectiveBillingLane?: BillingMode | null;
    policyDecisionType?: "ALLOW" | "SOFT_DENY" | "HARD_DENY" | null;
    policyReasonCode?: string | null;
    policySnapshot?: Record<string, unknown> | null;
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
            keySource: args.keySource ?? null,
            effectiveAiKeySource: args.effectiveAiKeySource ?? null,
            keyResolutionStatus: args.keyResolutionStatus ?? null,
            effectiveBillingLane: args.effectiveBillingLane ?? null,
            policyDecisionType: args.policyDecisionType ?? null,
            policyReasonCode: args.policyReasonCode ?? null,
            policySnapshot: args.policySnapshot ?? null,
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
        keySource: args.keySource ?? null,
        effectiveAiKeySource: args.effectiveAiKeySource ?? null,
        keyResolutionStatus: args.keyResolutionStatus ?? null,
        effectiveBillingLane: args.effectiveBillingLane ?? null,
        policyDecisionType: args.policyDecisionType ?? null,
        policyReasonCode: args.policyReasonCode ?? null,
        policySnapshot: args.policySnapshot ?? null,
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
        && pathname !== HEARTH_AI_ROUTES.researchReadiness
        && pathname !== HEARTH_AI_ROUTES.stt
        && pathname !== HEARTH_AI_ROUTES.costAudit
        && pathname !== HEARTH_AI_ROUTES.aiKeysConnect
        && pathname !== HEARTH_AI_ROUTES.aiKeysDisconnect
        && pathname !== HEARTH_AI_ROUTES.aiKeysStatus
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

      if (pathname === HEARTH_AI_ROUTES.researchReadiness) {
        if (method !== "GET") {
          return jsonResponse(405, { ok: false, error: "Method not allowed" });
        }
        const bearerToken = readBearerToken(request.headers.get("authorization"));
        const userId = await resolveUserId(bearerToken);
        if (!userId) {
          return jsonResponse(401, { ok: false, error: "Authentication required." });
        }
        const readinessBrief: HearthResearchBrief = {
          schema: "forge.hearth.research-brief.v1",
          workspaceId: null,
          workpieceId: "production-readiness",
          briefFingerprint: crypto.createHash("sha256").update("hearth-production-research-readiness").digest("hex"),
          creatorRequest: "Verify that the production research provider can retrieve one official OpenAI documentation source.",
          episodeTitle: "Production research readiness",
          goals: ["Retrieve one official OpenAI documentation source."],
          queries: ["OpenAI official documentation"],
          sourcePriorities: ["Official OpenAI documentation"],
        };
        const readinessResult = await researchRuntime.run({
          request: buildHearthResearchRequest({
            query: "OpenAI official documentation",
            maxSources: 1,
            requireDates: false,
            requireFullExtraction: false,
          }),
          brief: readinessBrief,
          signal: request.signal,
        });
        const providerStatus = readinessResult.providerStatus ?? "configured_but_provider_failing";
        return jsonResponse(providerStatus === "configured_and_operational" ? 200 : 503, {
          ok: providerStatus === "configured_and_operational",
          provider_status: providerStatus,
          runtime_status: readinessResult.runtimeStatus,
          source_count: readinessResult.sources.length,
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

      if (pathname === HEARTH_AI_ROUTES.aiKeysStatus) {
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
        const provider = url.searchParams.get("provider");
        const result = await getUserAiKeyStatus({
          supabaseService,
          provider,
        });
        if (!result.ok) {
          return jsonResponse(result.statusCode, { ok: false, error: result.error });
        }
        return jsonResponse(200, {
          ok: true,
          statuses: result.statuses,
        });
      }

      if (pathname === HEARTH_AI_ROUTES.aiKeysConnect) {
        if (method !== "POST") {
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

        const bodyRaw = (await readJsonBody(request)) as AiKeysConnectReqBody;
        const result = await connectUserAiKey({
          supabaseService,
          provider: bodyRaw.provider,
          rawKey: bodyRaw.api_key,
          keyLabel: bodyRaw.key_label,
          providerAccountId: bodyRaw.provider_account_id,
          validationMode: bodyRaw.validation_mode,
        });
        if (!result.ok) {
          return jsonResponse(result.statusCode, { ok: false, error: result.error });
        }
        return jsonResponse(200, {
          ok: true,
          status: result.status,
        });
      }

      if (pathname === HEARTH_AI_ROUTES.aiKeysDisconnect) {
        if (method !== "POST") {
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
        const bodyRaw = (await readJsonBody(request)) as AiKeysDisconnectReqBody;
        const result = await disconnectUserAiKey({
          supabaseService,
          provider: bodyRaw.provider,
          providerAccountId: bodyRaw.provider_account_id,
        });
        if (!result.ok) {
          return jsonResponse(result.statusCode, { ok: false, error: result.error });
        }
        return jsonResponse(200, {
          ok: true,
          status: result.status,
        });
      }

      if (pathname === HEARTH_AI_ROUTES.stt) {
        if (method !== "POST") {
          return jsonResponse(405, { ok: false, error: "Method not allowed" });
        }

        const bodyRaw = (await readJsonBody(request)) as SttReqBody;
        const lane: BillingMode = isBillingMode(bodyRaw.lane) ? bodyRaw.lane : configuredBillingMode;
        const bearerToken = readBearerToken(request.headers.get("authorization"));
        const providedSttActionId = readOptionalString(bodyRaw.action_id);
        const sttActionId = isUuid(providedSttActionId) ? providedSttActionId : crypto.randomUUID();
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

        if (lane === AI_USAGE_LANE.FORGE && tokenBalance != null && tokenBalance <= 0) {
          return jsonResponse(402, {
            ok: false,
            error: "No AI credits remaining.",
            ...buildBillingSnapshot(lane),
          });
        }

        const userId = await resolveUserId(bearerToken);
        let policyDecision: AiPolicyResolveResult | null = null;
        try {
          policyDecision = await resolveRuntimeAiPolicy({
            supabaseService,
            userId,
            workspaceId: null,
            lane,
            feature: AI_USAGE_FEATURE.SPEECH_TRANSCRIPTION,
            action: "transcribe",
            provider: "openai",
            model: sttModel,
            estimatedCostUsd: null,
            requestId: sttActionId,
          });
        } catch {
          return jsonResponse(500, {
            ok: false,
            error: "Failed resolving AI policy.",
            ...buildBillingSnapshot(lane),
          });
        }

        let resolvedCredentials;
        try {
          resolvedCredentials = await resolveEffectiveAiCredentials({
            requestedLane: lane,
            provider: "openai",
            forgeManagedApiKey: textApiKey,
            userId,
            supabaseService,
            disableUserKeys,
            policyDecision,
          });
        } catch (error) {
          if (error instanceof MissingForgeKeyError) {
            return jsonResponse(500, {
              ok: false,
              error: MISSING_OPENAI_TEXT_API_KEY_ERROR,
              ...buildBillingSnapshot(lane),
            });
          }
          if (error instanceof MissingUserKeyError) {
            await recordAiUsageEvent({
              userId,
              lane,
              provider: "openai",
              workspaceId: null,
              workpieceId: null,
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
              keySource: "byo",
              effectiveAiKeySource: "user_byo",
              keyResolutionStatus: "missing_required_key",
              effectiveBillingLane: lane,
              policyDecisionType: policyDecision?.decisionType ?? "SOFT_DENY",
              policyReasonCode: policyDecision?.reasonCode ?? "PERSONAL_AI_REQUIRED_NOT_CONFIGURED",
              policySnapshot: {
                tool: "hearth",
                requested_feature: AI_USAGE_FEATURE.SPEECH_TRANSCRIPTION,
                requested_subfeature: AI_USAGE_SUBFEATURE.WORKPIECE_AUDIO,
                requested_lane: lane,
                provider: "openai",
                model: sttModel,
                kill_switch_user_keys_disabled: disableUserKeys,
                byo_required: true,
              },
              actionId: sttActionId,
              correlationId: sttActionId,
            });
            return jsonResponse(422, {
              ok: false,
              error: error.message,
              code: "missing_user_byo_key",
              effective_ai_key_source: "user_byo",
              key_resolution_status: "missing_required_key",
              ...buildBillingSnapshot(lane),
            });
          }
          if (error instanceof PolicyDeniedError) {
            await recordAiUsageEvent({
              userId,
              lane,
              provider: "openai",
              workspaceId: null,
              workpieceId: null,
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
              keySource: lane === AI_USAGE_LANE.BYO ? "byo" : "forge",
              effectiveAiKeySource: policyDecision?.effectiveAiKeySource ?? null,
              keyResolutionStatus: "policy_denied",
              effectiveBillingLane: lane,
              policyDecisionType: policyDecision?.decisionType ?? "HARD_DENY",
              policyReasonCode: policyDecision?.reasonCode ?? error.reasonCode,
              policySnapshot: {
                tool: "hearth",
                requested_feature: AI_USAGE_FEATURE.SPEECH_TRANSCRIPTION,
                requested_subfeature: AI_USAGE_SUBFEATURE.WORKPIECE_AUDIO,
                requested_lane: lane,
                provider: "openai",
                model: sttModel,
                kill_switch_user_keys_disabled: disableUserKeys,
                byo_required: lane === AI_USAGE_LANE.BYO,
              },
              actionId: sttActionId,
              correlationId: sttActionId,
            });
            return jsonResponse(403, {
              ok: false,
              error: error.reasonCode ? getAiReasonMessage(error.reasonCode) : error.message,
              code: "policy_denied",
              key_resolution_status: error.keyResolutionStatus,
              policy_decision_type: policyDecision?.decisionType ?? "HARD_DENY",
              policy_reason_code: policyDecision?.reasonCode ?? error.reasonCode,
              ...buildBillingSnapshot(lane),
            });
          }
          return jsonResponse(500, {
            ok: false,
            error: "Failed resolving effective AI credentials.",
            ...buildBillingSnapshot(lane),
          });
        }
        const effectiveLane = resolvedCredentials.billingLane;
        const resolutionSnapshot = {
          effective_ai_key_source: resolvedCredentials.keySource,
          key_resolution_status: resolvedCredentials.keyResolutionStatus,
          policy_decision_type: policyDecision?.decisionType ?? null,
          policy_reason_code: policyDecision?.reasonCode ?? null,
        };
        const policySnapshot = {
          tool: "hearth",
          requested_feature: AI_USAGE_FEATURE.SPEECH_TRANSCRIPTION,
          requested_subfeature: AI_USAGE_SUBFEATURE.WORKPIECE_AUDIO,
          requested_lane: lane,
          effective_billing_lane: effectiveLane,
          requested_mode: mapLaneToRequestedMode(lane),
          requested_funding_source: mapLaneToRequestedFundingSource(lane),
          policy_decision_type: policyDecision?.decisionType ?? null,
          policy_reason_code: policyDecision?.reasonCode ?? null,
          policy_fallback_allowed: policyDecision?.fallbackAvailable ?? null,
          policy_fallback_used: policyDecision?.fallbackUsed ?? null,
          policy_effective_key_source: policyDecision?.effectiveAiKeySource ?? null,
          policy_key_resolution_status: policyDecision?.keyResolutionStatus ?? null,
          provider: "openai",
          model: sttModel,
          workspace_id: null,
          org_id: null,
          user_id: userId,
          byo_allowed: true,
          byo_required: lane === AI_USAGE_LANE.BYO,
          kill_switch_user_keys_disabled: disableUserKeys,
        };
        const usageAttribution = {
          keySource: mapEffectiveKeySourceToEventKeySource(resolvedCredentials.keySource),
          effectiveAiKeySource: resolvedCredentials.keySource,
          keyResolutionStatus: resolvedCredentials.keyResolutionStatus,
          effectiveBillingLane: effectiveLane,
          policyDecisionType: policyDecision?.decisionType ?? null,
          policyReasonCode: policyDecision?.reasonCode ?? null,
          policySnapshot,
        } as const;
        if (!supabaseService) {
          return jsonResponse(500, {
            ok: false,
            error: "Supabase service role is not configured.",
            ...buildBillingSnapshot(lane),
            ...resolutionSnapshot,
          });
        }
        if (!userId) {
          return jsonResponse(401, {
            ok: false,
            error: "Authentication required.",
            ...buildBillingSnapshot(lane),
            ...resolutionSnapshot,
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
              lane: resolvedCredentials.billingLane,
              userId,
              workspaceId: null,
              workpieceId,
              sessionId: null,
              feature: AI_USAGE_FEATURE.SPEECH_TRANSCRIPTION,
              subfeature: AI_USAGE_SUBFEATURE.WORKPIECE_AUDIO,
              model: sttModel,
              trigger: AI_USAGE_TRIGGER.USER,
              ...usageAttribution,
              actionId: sttActionId,
              request: {
                url: "https://api.openai.com/v1/audio/transcriptions",
                init: {
                  method: "POST",
                  headers: {
                    authorization: `Bearer ${resolvedCredentials.apiKey}`,
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
              ...resolutionSnapshot,
            });
          }

          const payload = (await upstream.json()) as unknown;
          const text = extractTranscriptionText(payload);
          if (!text) {
            await recordAiUsageEvent({
              userId,
              lane: effectiveLane,
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
              ...usageAttribution,
              actionId: sttActionId,
              providerRequestId: upstream.headers.get("x-request-id"),
              correlationId: sttActionId,
            });
            return jsonResponse(502, {
              ok: false,
              error: "OpenAI returned empty transcription",
              ...buildBillingSnapshot(lane),
              ...resolutionSnapshot,
            });
          }

          const accounting = buildTranscriptionAccounting({
            model: sttModel,
            payload,
            text,
            billableMode: effectiveLane === AI_USAGE_LANE.FORGE ? AI_USAGE_LANE.FORGE : "non-billable",
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
            lane: effectiveLane,
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
            ...usageAttribution,
            actionId: sttActionId,
            providerRequestId: openAiRequestId,
            correlationId: sttActionId,
          });

          if (effectiveLane === AI_USAGE_LANE.FORGE && billableTokens > 0) {
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
                ...resolutionSnapshot,
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
            ...resolutionSnapshot,
          });
        } finally {
          request.signal.removeEventListener("abort", onAborted);
        }
      }

      if (method !== "POST") {
        return jsonResponse(405, { ok: false, error: "Method not allowed" });
      }

      const bodyRaw = (await readJsonBody(request)) as ReqBody;
      const productionAction = (
        bodyRaw.production_action === "seo"
        || bodyRaw.production_action === "tags"
        || bodyRaw.production_action === "thumbnails"
        || bodyRaw.production_action === "image_beat_sheet"
        || bodyRaw.production_action === "release_prep_pack"
      ) ? bodyRaw.production_action : null;
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

      const rawMessages = Array.isArray(bodyRaw.messages) ? bodyRaw.messages : [];
      const messages = rawMessages
        .map(toChatMessage)
        .filter((item): item is ChatMessage => Boolean(item))
        // Production generation is a version-scoped command, not a continuation
        // of conversational chat. Keeping prior production prompts here can replay
        // the approved script many times and overflow the upstream context.
        .slice(productionAction ? -1 : -24);

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
      const attachmentContext = productionAction
        ? { includeEpisodeAttachments: false, attachmentIds: [] }
        : normalizeAttachmentContextRequest(bodyRaw.attachment_context);

      const latestUserMessageIndex = [...messages]
        .map((message, index) => ({ message, index }))
        .reverse()
        .find((entry) => entry.message.role === "user")
        ?.index;
      const latestUserMessage = typeof latestUserMessageIndex === "number"
        ? messages[latestUserMessageIndex] ?? null
        : null;
      // Intent must be derived from creator-authored text, never from hidden UI
      // writing-format or tone instructions appended to the provider message.
      const requestText = readOptionalString(bodyRaw.user_authored_text)
        ?? stripHearthInternalRequestInstructions(latestUserMessage?.content ?? "");
      const userId = await resolveUserId(bearerToken);
      const chatFeature = classifyChatFeature(requestText);
      const requestedReasoningEffort = isRecord(bodyRaw.behavior)
        ? readOptionalString((bodyRaw.behavior as Record<string, unknown>).reasoning_effort)
        : null;
      const requestedModel = isRecord(bodyRaw.behavior)
        ? readOptionalString((bodyRaw.behavior as Record<string, unknown>).model)
        : null;
      let policyDecision: AiPolicyResolveResult | null = null;
      try {
        policyDecision = await resolveRuntimeAiPolicy({
          supabaseService,
          userId,
          workspaceId: episodeContext.workspaceId,
          lane,
          feature: chatFeature.feature,
          action: "chat",
          provider: "openai",
          model: requestedModel ?? configuredModel,
          estimatedCostUsd: null,
          requestId: chatActionId,
        });
      } catch {
        return jsonResponse(500, {
          ok: false,
          error: "Failed resolving AI policy.",
          ...buildBillingSnapshot(lane),
        });
      }
      let resolvedCredentials;
      try {
        resolvedCredentials = await resolveEffectiveAiCredentials({
          requestedLane: lane,
          provider: "openai",
          forgeManagedApiKey: textApiKey,
          userId,
          supabaseService,
          disableUserKeys,
          policyDecision,
        });
      } catch (error) {
        if (error instanceof MissingForgeKeyError) {
          return jsonResponse(500, {
            ok: false,
            error: MISSING_OPENAI_TEXT_API_KEY_ERROR,
            ...buildBillingSnapshot(lane),
          });
        }
        if (error instanceof MissingUserKeyError) {
          await recordAiUsageEvent({
            userId,
            lane,
            provider: "openai",
            workspaceId: episodeContext.workspaceId,
            workpieceId: episodeContext.episodeId,
            sessionId: null,
            feature: chatFeature.feature,
            subfeature: chatFeature.subfeature,
            model: requestedModel ?? configuredModel,
            reasoningEffort: requestedReasoningEffort,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            estimatedCostUsd: 0,
            actualCostUsd: 0,
            billableTokens: 0,
            trigger: AI_USAGE_TRIGGER.USER,
            status: AI_USAGE_STATUS.ERROR,
            keySource: "byo",
            effectiveAiKeySource: "user_byo",
            keyResolutionStatus: "missing_required_key",
            effectiveBillingLane: lane,
            policyDecisionType: policyDecision?.decisionType ?? "SOFT_DENY",
            policyReasonCode: policyDecision?.reasonCode ?? "PERSONAL_AI_REQUIRED_NOT_CONFIGURED",
            policySnapshot: {
              tool: "hearth",
              requested_feature: chatFeature.feature,
              requested_subfeature: chatFeature.subfeature,
              requested_lane: lane,
              provider: "openai",
              model: requestedModel ?? configuredModel,
              reasoning_effort: requestedReasoningEffort,
              workspace_id: episodeContext.workspaceId,
              org_id: null,
              user_id: userId,
              kill_switch_user_keys_disabled: disableUserKeys,
              byo_required: true,
            },
            actionId: chatActionId,
            correlationId: chatActionId,
          });
          return jsonResponse(422, {
            ok: false,
            error: error.message,
            code: "missing_user_byo_key",
            effective_ai_key_source: "user_byo",
            key_resolution_status: "missing_required_key",
            ...buildBillingSnapshot(lane),
          });
        }
        if (error instanceof PolicyDeniedError) {
          await recordAiUsageEvent({
            userId,
            lane,
            provider: "openai",
            workspaceId: episodeContext.workspaceId,
            workpieceId: episodeContext.episodeId,
            sessionId: null,
            feature: chatFeature.feature,
            subfeature: chatFeature.subfeature,
            model: requestedModel ?? configuredModel,
            reasoningEffort: requestedReasoningEffort,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            estimatedCostUsd: 0,
            actualCostUsd: 0,
            billableTokens: 0,
            trigger: AI_USAGE_TRIGGER.USER,
            status: AI_USAGE_STATUS.ERROR,
            keySource: lane === AI_USAGE_LANE.BYO ? "byo" : "forge",
            effectiveAiKeySource: policyDecision?.effectiveAiKeySource ?? null,
            keyResolutionStatus: "policy_denied",
            effectiveBillingLane: lane,
            policyDecisionType: policyDecision?.decisionType ?? "HARD_DENY",
            policyReasonCode: policyDecision?.reasonCode ?? error.reasonCode,
            policySnapshot: {
              tool: "hearth",
              requested_feature: chatFeature.feature,
              requested_subfeature: chatFeature.subfeature,
              requested_lane: lane,
              provider: "openai",
              model: requestedModel ?? configuredModel,
              reasoning_effort: requestedReasoningEffort,
              workspace_id: episodeContext.workspaceId,
              org_id: null,
              user_id: userId,
              kill_switch_user_keys_disabled: disableUserKeys,
              byo_required: lane === AI_USAGE_LANE.BYO,
            },
            actionId: chatActionId,
            correlationId: chatActionId,
          });
          return jsonResponse(403, {
            ok: false,
            error: error.reasonCode ? getAiReasonMessage(error.reasonCode) : error.message,
            code: "policy_denied",
            key_resolution_status: error.keyResolutionStatus,
            policy_decision_type: policyDecision?.decisionType ?? "HARD_DENY",
            policy_reason_code: policyDecision?.reasonCode ?? error.reasonCode,
            ...buildBillingSnapshot(lane),
          });
        }
        return jsonResponse(500, {
          ok: false,
          error: "Failed resolving effective AI credentials.",
          ...buildBillingSnapshot(lane),
        });
      }
      const effectiveLane = resolvedCredentials.billingLane;
      const resolutionSnapshot = {
        effective_ai_key_source: resolvedCredentials.keySource,
        key_resolution_status: resolvedCredentials.keyResolutionStatus,
        policy_decision_type: policyDecision?.decisionType ?? null,
        policy_reason_code: policyDecision?.reasonCode ?? null,
      };
      const policySnapshot = {
        tool: "hearth",
        requested_feature: chatFeature.feature,
        requested_subfeature: chatFeature.subfeature,
        requested_lane: lane,
        effective_billing_lane: effectiveLane,
        requested_mode: mapLaneToRequestedMode(lane),
        requested_funding_source: mapLaneToRequestedFundingSource(lane),
        policy_decision_type: policyDecision?.decisionType ?? null,
        policy_reason_code: policyDecision?.reasonCode ?? null,
        policy_fallback_allowed: policyDecision?.fallbackAvailable ?? null,
        policy_fallback_used: policyDecision?.fallbackUsed ?? null,
        policy_effective_key_source: policyDecision?.effectiveAiKeySource ?? null,
        policy_key_resolution_status: policyDecision?.keyResolutionStatus ?? null,
        provider: "openai",
        model: requestedModel ?? configuredModel,
        reasoning_effort: requestedReasoningEffort,
        workspace_id: episodeContext.workspaceId,
        org_id: null,
        user_id: userId,
        byo_allowed: true,
        byo_required: lane === AI_USAGE_LANE.BYO,
        kill_switch_user_keys_disabled: disableUserKeys,
      };
      const usageAttribution = {
        keySource: mapEffectiveKeySourceToEventKeySource(resolvedCredentials.keySource),
        effectiveAiKeySource: resolvedCredentials.keySource,
        keyResolutionStatus: resolvedCredentials.keyResolutionStatus,
        effectiveBillingLane: effectiveLane,
        policyDecisionType: policyDecision?.decisionType ?? null,
        policyReasonCode: policyDecision?.reasonCode ?? null,
        policySnapshot,
      } as const;
      if (effectiveLane === AI_USAGE_LANE.FORGE && !userId) {
        return jsonResponse(401, {
          ok: false,
          error: "Authentication required.",
          ...buildBillingSnapshot(lane),
        });
      }
      if (effectiveLane === AI_USAGE_LANE.FORGE && tokenBalance != null && tokenBalance <= 0) {
        return jsonResponse(402, {
          ok: false,
          error: "No AI credits remaining.",
          ...buildBillingSnapshot(lane),
          ...resolutionSnapshot,
        });
      }
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
      const urlsInRequest = extractUrls(requestText);
      const textWithoutUrls = removeUrls(requestText);
      const researchIntentText = stripHearthInternalRequestInstructions(textWithoutUrls || requestText);
      const linkModeRequested = urlsInRequest.length > 0;
      // Production commands are version-scoped transformations of the approved
      // script. Words such as "source" in their strict output contract must not
      // route them through research or prepend a research outcome envelope.
      const researchModeRequested = !productionAction
        && (linkModeRequested || isResearchIntentRequest(researchIntentText || requestText));
      const repeatedResearchRequestCount = researchModeRequested
        ? countRepeatedCreatorRequests(researchIntentText || requestText, priorMessages)
        : 0;
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
      let model = aiRoute.model;
      const reasoningEffort = aiRoute.reasoning;
      if (!ALLOWED_CHAT_MODELS.has(model)) {
        return jsonResponse(503, {
          ok: false,
          error: `Routed model '${model}' is not allowlisted for Forge lane.`,
          code: "model_not_allowlisted",
          ...buildBillingSnapshot(lane),
        });
      }
      const researchBrief = researchModeRequested
        ? buildHearthResearchBrief({
            requestText: researchIntentText || requestText,
            episodeContext,
            requestAuthority: chatActionId,
          })
        : null;
      const researchQuery = researchBrief?.queries[0] || researchIntentText || urlsInRequest.join(" ");
      const researchRequest = researchModeRequested && researchQuery
        ? buildHearthResearchRequest({ query: researchQuery })
        : null;
      let researchResult: HearthResearchResult | null = null;
      if (linkModeRequested) {
        const linkSources = await Promise.all(
          urlsInRequest.slice(0, 3).map((url, index) => extractUrlToResearchSource({
            url,
            sourceId: `link-${index + 1}`,
            brief: researchBrief!,
            signal: request.signal,
          })),
        );
        researchResult = buildLinkOnlyResearchResult({ sources: linkSources, brief: researchBrief! });
      } else if (researchRequest && researchBrief) {
        try {
          researchResult = await researchRuntime.run({
            request: researchRequest,
            brief: researchBrief,
            signal: request.signal,
          });
        } catch {
          researchResult = {
            ...buildEmptyHearthResearchResult({
              mode: "knowledge_first",
              runtimeStatus: "error",
              summary: "Research runtime failed before synthesis.",
            }),
            brief: researchBrief,
            evidence: [],
            artifact: null,
          };
        }
      }
      if (researchResult && researchBrief) {
        researchResult = appendSavedEpisodeSourceProvenance(researchResult, episodeContext, researchBrief);
      }
      if (researchRequest && researchResult) {
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

      if (linkModeRequested && researchResult && shouldShortCircuitLinkIngest(researchIntentText || textWithoutUrls)) {
        const assistantText = buildLinkIngestOnlyReply({ sources: researchResult.sources });
        return jsonResponse(200, {
          ok: true,
          assistant_text: assistantText,
          reply: assistantText,
          ops: [],
          script_text: null,
          tag_audit: null,
          research_result: researchResult,
          total_tokens: null,
          actual_cost_usd: 0,
          billable_tokens: 0,
          credits_warning: null,
          ...buildBillingSnapshot(lane),
        });
      }
      const readinessCheckRequested = isReadinessCheckRequest(requestText);
      const allowRepeatedReadinessNudge = requestedDeepReadinessReview(requestText);
      const framingPackRequested = isFramingPackProductionRequest(requestText);
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

      const workspaceContextRequested = shouldUseWorkspaceContext(requestText);
      const crossProjectRequested = isCrossProjectReferenceRequest(requestText);

      const styleGuidanceSections = framingPackRequested
        ? []
        : [
          buildProfileStyleSnippet(
            creatorProfile,
            writingProfile,
            requestText,
            episodeContext.tonePreset,
          ),
        ];

      const styleSamples = framingPackRequested
        ? []
        : workspaceContextRequested
          ? await loadStyleSamplesForToken(bearerToken, episodeContext.workspaceId)
          : [];
      const recentScriptRefs = framingPackRequested
        ? []
        : crossProjectRequested
          ? await loadRecentScriptReferencesForToken(bearerToken, episodeContext.workspaceId)
          : [];
      const recentScriptExcerpts = framingPackRequested
        ? []
        : crossProjectRequested
          ? await loadRecentScriptExcerpts(recentScriptRefs)
          : [];
      const crossProjectReference = framingPackRequested || !crossProjectRequested
        ? {
          detected: false,
          level: "unanchored" as const,
          resolvedTitle: null,
          candidateTitles: [],
        }
        : resolveCrossProjectReference({
          requestText,
          currentWorkpieceId: episodeContext.episodeId,
          references: recentScriptRefs,
        });
      const styleCorpusSnippet = framingPackRequested
        ? null
        : buildStyleCorpusSnippet({
          styleSamples,
          recentScriptExcerpts,
        });
      if (styleCorpusSnippet) {
        styleGuidanceSections.push(styleCorpusSnippet);
      }

      let attachmentContextSnippet: string | null = null;
      if (attachmentContext.includeEpisodeAttachments && episodeContext.workspaceId) {
        if (!supabaseService) {
          return new Response(
            JSON.stringify({
              error: "Server storage not configured.",
              code: "storage_unavailable",
            }),
            {
              status: 503,
              headers: { "content-type": "application/json; charset=utf-8" },
            },
          );
        }
        const tongsUntyped = supabaseService.schema("tongs") as unknown as {
          from: (table: string) => {
            select: (columns: string) => {
              eq: (column: string, value: unknown) => {
                eq: (nextColumn: string, nextValue: unknown) => {
                  order: (field: string, options: { ascending: boolean }) => Promise<{
                    data: Array<Record<string, unknown>> | null;
                    error: { message: string } | null;
                  }>;
                };
              };
            };
          };
        };

        const { data: rawAttachmentRows, error: attachmentReadError } = await tongsUntyped
          .from("hearth_attachments")
          .select("id,filename,parse_status,parse_error,extracted_text,created_at")
          .eq("workspace_id", episodeContext.workspaceId)
          .eq("episode_id", episodeContext.episodeId)
          .order("created_at", { ascending: false });
        if (!attachmentReadError) {
          const requestedIds = new Set(attachmentContext.attachmentIds);
          const filteredRows = (rawAttachmentRows ?? [])
            .filter((row) => {
              if (requestedIds.size === 0) return true;
              const id = typeof row.id === "string" ? row.id : "";
              return requestedIds.has(id);
            })
            .map((row) => ({
              id: typeof row.id === "string" ? row.id : "",
              filename: typeof row.filename === "string" ? row.filename : "attachment",
              parse_status: typeof row.parse_status === "string" ? row.parse_status : "pending",
              parse_error: typeof row.parse_error === "string" ? row.parse_error : null,
              extracted_text: typeof row.extracted_text === "string" ? row.extracted_text : null,
            }))
            .filter((row) => row.id);
          attachmentContextSnippet = buildAttachmentContextSnippet(filteredRows);
        }
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
            attachmentContextSnippet,
            listeningTurn: LISTENING_TURN_RE.test(requestText),
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
        const callOpenAi = async (
          currentModel: string,
          allowTemperatureOverride: boolean,
          messageOverride: ChatMessage[] = completionMessages,
        ): Promise<Response> => {
          const payload = allowTemperatureOverride
            ? {
                model: currentModel,
                temperature: requestedTemperature,
                messages: messageOverride,
              }
            : {
                model: currentModel,
                messages: messageOverride,
              };
          return runAIRequest({
            lane: effectiveLane,
            userId,
            workspaceId: episodeContext.workspaceId,
            workpieceId: episodeContext.episodeId,
            sessionId: null,
            feature: chatFeature.feature,
            subfeature: chatFeature.subfeature,
            model: currentModel,
            reasoningEffort,
            trigger: AI_USAGE_TRIGGER.USER,
            ...usageAttribution,
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
                  authorization: `Bearer ${resolvedCredentials.apiKey}`,
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
          upstream = await callOpenAi(model, usedTemperatureOverride);
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
              upstream = await callOpenAi(model, false);
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

          if (
            !upstream.ok
            && upstream.status >= 400
            && upstream.status <= 499
            && isOpenAiModelAccessError(detail)
          ) {
            const fallbackModels: AllowedForgeChatModel[] = model === "gpt-5.3"
              ? ["gpt-5.2", "gpt-5.1"]
              : model === "gpt-5.2"
                ? ["gpt-5.1"]
                : [];
            for (const candidateModel of fallbackModels) {
              if (!ALLOWED_CHAT_MODELS.has(candidateModel)) continue;
              try {
                upstream = await callOpenAi(candidateModel, usedTemperatureOverride);
              } catch (error) {
                if (clientAborted || upstreamAbort.signal.aborted) {
                  return new Response(null, { status: 499 });
                }
                throw error;
              }
              if (clientAborted) return new Response(null, { status: 499 });
              if (upstream.ok) {
                model = candidateModel;
                break;
              }
              detail = await upstream.text();
              if (!isOpenAiModelAccessError(detail)) break;
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

        let payload = (await upstream.json()) as unknown;
        let rawReply = extractAssistantReply(payload);
        if (!rawReply) {
          await recordAiUsageEvent({
            userId,
            lane: effectiveLane,
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
            ...usageAttribution,
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

        let structured = normalizeStructuredReply(rawReply) ?? {
          assistantText: rawReply,
          ops: [],
          scriptText: null,
          tagAudit: null,
          researchArtifact: null,
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
          researchResult = {
            ...researchResult,
            artifact: structured.researchArtifact,
          };
          structured.assistantText = enforceResearchOutcomeReply({
            assistantText: structured.assistantText,
            request: researchRequest,
            result: researchResult,
            repeatedRequestCount: repeatedResearchRequestCount,
          });
        }

        if (crossProjectReference.detected) {
          structured.assistantText = enforceCrossProjectScopeReply({
            assistantText: structured.assistantText,
            resolution: crossProjectReference,
          });
        }

        if (framingPackRequested) {
          structured.assistantText = sanitizeFramingPackReply(structured.assistantText);
        }

        structured.assistantText = enforceHearthEditorialHonesty({
          assistantText: structured.assistantText,
          requestText: researchIntentText || requestText,
        });
        structured.assistantText = sanitizeHearthUserFacingOutput(structured.assistantText);

        if (productionAction === "seo" || productionAction === "tags" || productionAction === "thumbnails") {
          let productionValidation = validateHearthProductionArtifactOutput({
            action: productionAction,
            assistantText: structured.assistantText,
          });
          if (!productionValidation.ok) {
            const recoveredOutput = canonicalizeHearthProductionArtifactOutput({
              action: productionAction,
              assistantText: rawReply,
            });
            if (recoveredOutput) {
              structured.assistantText = recoveredOutput;
              productionValidation = validateHearthProductionArtifactOutput({
                action: productionAction,
                assistantText: recoveredOutput,
              });
            }
          }
          if (!productionValidation.ok) {
            const repairInstruction = productionAction === "seo"
              ? [
                  "Your prior response could not be parsed. Return ONLY this exact five-line title block, with real titles replacing the angle-bracket values:",
                  "SEO_TITLES:",
                  "SAFE: <real title>",
                  "SPICY: <real title>",
                  "BALANCED_1: <real title>",
                  "BALANCED_2: <real title>",
                  "BALANCED_3: <real title>",
                  "SHORT_DESCRIPTION:",
                  "<one real concise episode summary of 160 characters or fewer>",
                  "LONG_DESCRIPTION:",
                  "<one real detailed YouTube-ready description paragraph>",
                  "Do not return JSON, markdown, commentary, placeholders, or an explanation.",
                ].join("\n")
              : productionAction === "tags"
                ? [
                    "Your prior response could not be parsed. Return ONLY this exact tag block with 6 to 10 real comma-separated tags, strongest and most specific first:",
                    "TAGS_TOP10:",
                    "<real tag 1>, <real tag 2>, <real tag 3>, ...",
                    "Use only precise tags directly supported by the approved episode. Do not add generic filler, near-duplicates, or adjacent topics.",
                    "Do not return JSON, markdown, commentary, placeholders, or an explanation.",
                  ].join("\n")
                : [
                    "Your prior response could not be parsed. Return ONLY the thumbnail strategy and exactly five complete thumbnail blocks in the structure below.",
                    "THUMBNAIL_STRATEGY",
                    "Episode promise: <truthful promise supported by the approved script>",
                    "Intended viewer: <specific intended viewer>",
                    "Curiosity mechanism: <honest reason to click>",
                    "Editorial positioning: <distinct truthful angle>",
                    "Truthful connection: <connection to the approved script>",
                    "Prohibited exaggerations: <claims the thumbnail must avoid>",
                    "",
                    "THUMBNAIL_01",
                    "Headline: <short internal concept name>",
                    "Subject: <primary subject>",
                    "Focal action: <subject action or expression>",
                    "Composition: <layout and crop>",
                    "Emotional tone: <intended feeling>",
                    "Visual hierarchy: <first, second, and last noticed>",
                    "Title compatibility: <how title text fits>",
                    "Integrity rationale: <why it represents the script truthfully>",
                    "Render direction: <base artwork with no text, letters, logos, or watermarks>",
                    "Mood/style: <visual style>",
                    "",
                    "Repeat THUMBNAIL_02 through THUMBNAIL_05 with every field present and meaningfully different subjects or compositions.",
                    "Use the approved script already supplied in episode_context. Do not discuss research access or ask questions.",
                    "Do not return JSON, markdown, commentary, placeholders, or an explanation.",
                  ].join("\n");
            const repairMessages: ChatMessage[] = [
              ...completionMessages,
              { role: "assistant", content: rawReply },
              { role: "user", content: repairInstruction },
            ];
            let repairUpstream: Response | null = null;
            try {
              repairUpstream = await callOpenAi(model, usedTemperatureOverride, repairMessages);
            } catch {
              repairUpstream = null;
            }
            if (repairUpstream?.ok) {
              const repairPayload = (await repairUpstream.json()) as unknown;
              const repairRawReply = extractAssistantReply(repairPayload);
              const repairStructured = normalizeStructuredReply(repairRawReply) ?? {
                assistantText: repairRawReply,
                ops: [],
                scriptText: null,
                tagAudit: null,
                researchArtifact: null,
              };
              repairStructured.assistantText = sanitizeHearthUserFacingOutput(repairStructured.assistantText);
              const repairedCanonical = canonicalizeHearthProductionArtifactOutput({
                action: productionAction,
                assistantText: repairStructured.assistantText,
              }) ?? canonicalizeHearthProductionArtifactOutput({
                action: productionAction,
                assistantText: repairRawReply,
              });
              if (repairedCanonical) {
                payload = repairPayload;
                rawReply = repairRawReply;
                structured = repairStructured;
                structured.assistantText = repairedCanonical;
                productionValidation = validateHearthProductionArtifactOutput({
                  action: productionAction,
                  assistantText: repairedCanonical,
                });
                upstream = repairUpstream;
              }
            }
          }
          if (!productionValidation.ok) {
            const rejectedTokens = extractTotalTokens(payload) ?? estimateTokenFallback(messages, rawReply);
            const rejectedAccounting = buildUsageAccounting({
              model,
              payload,
              fallbackTotalTokens: rejectedTokens,
              preflightEstimatedCostUsd: aiRoute.estimatedCostUsd,
              billableMode: "non-billable",
            });
            await recordAiUsageEvent({
              userId,
              lane: effectiveLane,
              provider: "openai",
              workspaceId: episodeContext.workspaceId,
              workpieceId: episodeContext.episodeId,
              sessionId: null,
              feature: chatFeature.feature,
              subfeature: chatFeature.subfeature,
              model,
              reasoningEffort,
              inputTokens: rejectedAccounting.inputTokens,
              outputTokens: rejectedAccounting.outputTokens,
              totalTokens: rejectedTokens,
              estimatedCostUsd: rejectedAccounting.estimatedCostUsd,
              actualCostUsd: rejectedAccounting.estimatedCostUsd,
              billableTokens: 0,
              trigger: AI_USAGE_TRIGGER.USER,
              status: AI_USAGE_STATUS.ERROR,
              ...usageAttribution,
              actionId: chatActionId,
              providerRequestId: upstream.headers.get("x-request-id"),
              correlationId: chatActionId,
            });
            return jsonResponse(502, {
              ok: false,
              error: productionValidation.error,
              code: "invalid_production_output",
              billable_tokens: 0,
              output_diagnostic: {
                action: productionAction,
                assistant_text_chars: structured.assistantText.length,
                raw_reply_chars: rawReply.length,
                assistant_text_preview: structured.assistantText.slice(0, 240),
              },
              ...buildBillingSnapshot(lane),
              ...resolutionSnapshot,
            });
          }
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
          billableMode: effectiveLane === AI_USAGE_LANE.FORGE ? AI_USAGE_LANE.FORGE : "non-billable",
        });
        const inputTokens = accounting.inputTokens;
        const outputTokens = accounting.outputTokens;
        const estimatedCostUsd = accounting.estimatedCostUsd;
        const billableTokens = accounting.billableTokens;
        const openAiRequestId = upstream.headers.get("x-request-id");
        const creditsWarning: string | null = null;

        await recordAiUsageEvent({
          userId,
          lane: effectiveLane,
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
          ...usageAttribution,
          actionId: chatActionId,
          providerRequestId: openAiRequestId,
          correlationId: chatActionId,
        });

        if (effectiveLane === AI_USAGE_LANE.FORGE && billableTokens > 0 && userId) {
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
              ...resolutionSnapshot,
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
          assistant_text: structured.assistantText,
          reply: structured.assistantText,
          ops: structured.ops,
          script_text: structured.scriptText,
          tag_audit: structured.tagAudit,
          ...(researchResult ? { research_result: researchResult } : {}),
          ...(researchResult ? {
            research_context: {
              provider_status: researchResult.providerStatus,
              source_count: researchResult.sources.length,
              model_context_injected: true,
            },
          } : {}),
          total_tokens: spent,
          actual_cost_usd: estimatedCostUsd,
          billable_tokens: billableTokens,
          credits_warning: creditsWarning,
          ...buildBillingSnapshot(lane),
          ...resolutionSnapshot,
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
