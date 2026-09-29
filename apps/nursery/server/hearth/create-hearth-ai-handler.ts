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
  executeOpenAiTextTransport,
  configuredOpenAiTextMode,
  OpenAiTextBoundaryError,
  type OpenAiTextRouteCode,
} from "../../../../packages/tongs/src/providers/openai-text-paid-boundary";
import {
  executePaidOpenAiTextRoute,
  fingerprintOpenAiTextPaidRequest,
  readSettledOpenAiTextRouteReplay,
} from "../../../../packages/tongs/src/providers/paid-openai-text-route-execution";
import {
  OpenAiTextFundingPreparationError,
  OpenAiTextQuoteRequiredError,
  resolveOrdinaryOpenAiTextFunding,
} from "../../../../packages/tongs/src/providers/openai-text-customer-funding";
import {
  buildBoundedPaidJsonOpenAiRequest,
  executePaidJsonOpenAiRoute,
  PaidJsonOpenAiRouteError,
} from "../billing/paid-json-openai-route";
import {
  coordinateOpenAiTranscription,
  OpenAiTextFundingPreparationError as OpenAiTranscriptionFundingPreparationError,
  OpenAiTextQuoteRequiredError as OpenAiTranscriptionQuoteRequiredError,
  sha256Bytes,
} from "../billing/paid-openai-transcription-route";
import {
  configuredOpenAiTranscriptionMode,
  executeOpenAiTranscriptionTransport,
} from "../../../../packages/tongs/src/providers/openai-transcription-paid-boundary";
import {
  normalizeOpenAiTextPaidExecutionHandle,
} from "../../../../packages/tongs/src/providers/paid-openai-text-route-execution";
import {
  OpenAiTextPostPersistenceContinuationError,
  OpenAiTextProviderError,
} from "../../../../packages/tongs/src/providers/paid-openai-text-execution-coordinator";
import { normalizeOpenAiTextSpendingAcceptance } from "../../../../packages/tongs/src/providers/openai-text-customer-funding";
import { readOpenAiTranscriptionUsage } from "../../../../packages/tongs/src/providers/paid-openai-transcription-route-execution";
import {
  HEARTH_AI_ROUTES,
  isHearthAiLane as isBillingMode,
  normalizeEpisodeContext,
  normalizeHearthExplicitUiAction,
  normalizeHearthOutputPreference,
  normalizeHearthChatMessage as toChatMessage,
  normalizeHearthOps as normalizeOps,
  readHearthBehaviorTemperature as readBehaviorTemperature,
  type EpisodeContext,
  type HearthAiLane as BillingMode,
  type HearthChatMessage as ChatMessage,
  type HearthOp,
} from "../../../hearth/src/lib/hearth-ai-runtime-contract";
import {
  buildHearthTurnResult,
  type HearthOutputPreference,
  type HearthTurnDecision,
  type HearthValidatedArtifact,
} from "../../../hearth/src/lib/hearth-turn-contract";
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
  applyHearthDeterministicCleanup,
  buildHearthDeterministicAssistantMessage,
} from "../../../hearth/src/lib/hearth-deterministic-cleanup";
import {
  canonicalizeHearthProductionArtifactOutput,
  validateHearthProductionArtifactOutput,
} from "../../../hearth/src/lib/hearth-production-feedback";
import {
  hasSubstantiveHearthOutline,
  hasSubstantiveHearthScript,
  readLatestSubstantiveOutlineFromOps,
  readLatestSubstantiveScriptFromOps,
  validateHearthCompositionArtifact,
} from "../../../hearth/src/lib/hearth-composition-output";
import {
  createHearthResearchRuntime,
  extractUrlToResearchSource,
} from "./hearth-research-runtime";
import { classifyResearchSourceAuthority } from "./hearth-source-evidence-policy";
import {
  buildMalformedCreatorCitationSource,
  isSubstantiveResearchFinding,
  parseCreatorSuppliedResearch,
  reconcileCreatorSuppliedResearchArtifact,
} from "./hearth-creator-research-ingest";
import {
  FORGE_ALLOWED_CHAT_MODELS,
} from "./ai-pricing";
import {
  deriveHearthCustomerPaidIdentifiers,
  buildBoundedHearthChatProviderRequest,
  executePaidHearthChatCompletion,
  fingerprintPaidHearthChatRequest,
  normalizeHearthPaidExecutionHandle,
  normalizeHearthSpendingQuoteAcceptance,
  type HearthPaidExecutionHandle,
} from "./hearth-paid-chat-execution";
import { buildPaidHearthConversationMessages } from "./hearth-paid-conversation-context";
import { buildPaidHearthScriptGenerationMessages } from "./hearth-paid-script-context";
import {
  HEARTH_TITLE_ROUTE,
  HEARTH_TITLE_MODEL,
  HEARTH_TITLE_CONTRACT,
  HEARTH_TITLE_CONTRACT_V1,
  buildPaidTitleMessages,
  hashApprovedTitleScript,
  paidTitleFingerprintPayload,
  validatePaidTitleOutput,
  type ApprovedTitleScript,
  type HearthTitleContractVersion,
} from "./hearth-paid-title-generation";
import {
  HEARTH_TAG_ROUTE,
  HEARTH_TAG_MODEL,
  HEARTH_TAG_CONTRACT,
  HEARTH_TAG_OUTPUT_CONTRACT,
  buildPaidTagMessages,
  paidTagFingerprintPayload,
  validatePaidTagOutput,
} from "./hearth-paid-tag-generation";
import {
  HEARTH_FRAMING_PACK_ROUTE,
  HEARTH_FRAMING_PACK_MODEL,
  HEARTH_FRAMING_PACK_CONTRACT,
  HEARTH_FRAMING_PACK_OUTPUT_CONTRACT,
  buildPaidFramingPackMessages,
  paidFramingPackFingerprintPayload,
  validatePaidFramingPackOutput,
} from "./hearth-paid-framing-pack-generation";
import {
  HEARTH_THUMBNAIL_DIRECTION_CONTRACT,
  HEARTH_THUMBNAIL_DIRECTION_OUTPUT_CONTRACT,
  HEARTH_THUMBNAIL_DIRECTION_ROUTE,
  HEARTH_THUMBNAIL_DIRECTION_STYLE_FALLBACK,
  buildPaidThumbnailDirectionMessages,
  paidThumbnailDirectionFingerprintPayload,
  type PaidThumbnailDirectionInput,
} from "./hearth-paid-thumbnail-direction-generation";
import { validatePaidThumbnailDirectionOutput } from "../../../hearth/src/lib/hearth-thumbnail-direction-contract";
import { resolveHearthThumbnailOverlayText } from "../../../hearth/src/lib/hearth-thumbnail-title-contract";
import {
  canonicalContentHash,
  hydrateEpisodePackageV3,
} from "../../../hearth/src/lib/episode-package-v3";
import {
  commitAndFinalizeThumbnailDirections,
  readCanonicalThumbnailMetadata,
  readLatestStagedThumbnailDirectionResult,
  thumbnailDirectionStyleAuthority,
  thumbnailDirectionTitleInputs,
} from "./hearth-thumbnail-direction-canonical";
import { ServerTongsRequestError } from "../tongs/server-tongs-request";
import {
  ForgeOwnerAuthorizationError,
  ForgeOwnerExecutionCoordinator,
  createSupabaseOwnerAuthorityReader,
  requireForgeOwnerExecutionAuthority,
  type OwnerCostRpcGate,
  type OwnerFinancialEnvironment,
  type OwnerRuntimeEnvironment,
} from "../accounting/forge-owner-execution-coordinator";
import {
  HEARTH_OWNER_TEXT_MODEL,
  executeOwnerHearthText,
  type OwnerHearthTextRoute,
} from "./owner-hearth-text-execution";
import {
  createOwnerHearthResearchCostSession,
  type OwnerHearthResearchCostSession,
} from "./owner-hearth-research-cost-execution";
import {
  ownerHearthExecutionGate,
  prepareOwnerHearthOperation,
  readOwnerHearthExecutionRequirement,
  recordOwnerCompatibilityOutcome,
} from "./owner-hearth-paid-execution";
import {
  OwnerResearchSubmissionUnknownError,
  CUSTOMER_RESEARCH_CREDITS,
  CUSTOMER_RESEARCH_MODEL,
  OWNER_RESEARCH_DEADLINE_MS,
  bindCustomerHearthResearchSynthesis,
  buildCustomerResearchPlan,
  buildOwnerResearchPlan,
  createCustomerHearthResearchFetch,
  fingerprintCustomerResearchPlan,
  freezeOwnerHearthResearchSynthesis,
  ownerHearthResearchExecutionGate,
  settleCustomerHearthResearchBeforeSynthesis,
  settleOwnerHearthResearchBeforeSynthesis,
  sha256Canonical,
  type CustomerResearchPlan,
  type OwnerResearchModel,
  type OwnerResearchPlan,
} from "./owner-hearth-research-execution";
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
import { filterHearthOperationsForDecision, resolveHearthTurnDecision } from "./hearth-turn-decision";

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
  explicit_action?: unknown;
  output_preference?: unknown;
  paid_execution?: unknown;
  spending_acceptance?: unknown;
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
  workspace_id?: unknown;
  paid_execution?: unknown;
  spending_acceptance?: unknown;
};

type AiKeysConnectReqBody = {
  provider?: unknown;
  api_key?: unknown;
  key_label?: unknown;
  provider_account_id?: unknown;
  validation_mode?: unknown;
  workspace_id?: unknown;
  paid_execution?: unknown;
  spending_acceptance?: unknown;
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

function ownerRuntimeEnvironment(): OwnerRuntimeEnvironment {
  const value = (process.env.CONTEXT ?? process.env.NODE_ENV ?? "").trim().toLowerCase();
  if (value === "production") return "production";
  if (value === "deploy-preview" || value === "preview") return "preview";
  return "development";
}

async function ownerFinancialEnvironment(gate: OwnerCostRpcGate): Promise<OwnerFinancialEnvironment> {
  const result = await gate.rpc("read_financial_runtime_environment");
  const value = isRecord(result.data) ? result.data.financial_environment : null;
  if (result.error || (value !== "test" && value !== "live")) {
    throw new Error("Owner-cost financial environment is unavailable");
  }
  return value;
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
  creatorClaims: NonNullable<HearthResearchResult["creatorClaims"]>;
  creatorEntities: NonNullable<HearthResearchResult["creatorEntities"]>;
  creatorInputTruncated: boolean;
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
  if (args.creatorInputTruncated) {
    uncertainties.push("The creator-supplied research note appears truncated; incomplete trailing prose was not treated as a claim.");
  }
  return {
    mode: "retrieval_first",
    runtimeStatus: args.sources.length === 0
      ? "no_results"
      : extracted > 0
        ? (failed > 0 ? "partial" : "ok")
        : "partial",
    brief: args.brief,
    creatorClaims: args.creatorClaims,
    creatorEntities: args.creatorEntities,
    creatorInputTruncated: args.creatorInputTruncated,
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
  decision: HearthTurnDecision,
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

  if (decision.requiresArtifact && profile.outlineFirstBias >= 0.6 && !/\bscript\b/i.test(requestText)) {
    lines.push("- Workflow preference leans outline-first when the user does not explicitly ask for full script.");
  } else if (decision.requiresArtifact && profile.scriptFirstBias >= 0.6) {
    lines.push("- Workflow preference leans script-first when request is explicit.");
  }

  if (decision.requiresArtifact && profile.clarifyFirstBias <= 0.4) {
    lines.push("- User often prefers direct drafting when the request is clear.");
  }

  if (decision.requiresArtifact && writingProfile.defaultAudience) {
    lines.push(`- Audience default: ${writingProfile.defaultAudience}.`);
  } else if (decision.requiresArtifact) {
    lines.push("- Audience default: general podcast listeners.");
  }

  if (decision.requiresArtifact && writingProfile.defaultStructure) {
    lines.push(`- Structure default: ${writingProfile.defaultStructure}.`);
  } else if (decision.requiresArtifact) {
    lines.push("- Structure default: neutral flow (hook, context, points, close).");
  }

  if (writingProfile.styleNotes) {
    lines.push(`- Style notes: ${writingProfile.styleNotes}.`);
  }

  if (decision.requiresArtifact) {
    lines.push("- Apply these preferences only to the requested artifact; do not use them to change turn intent.");
  } else {
    lines.push("- These preferences must not trigger drafting, research, workflow advancement, or a forced next step.");
  }

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

export function buildSystemPrompt(
  context: EpisodeContext,
  creatorStyleSnippet?: string,
  options?: {
    decision: HearthTurnDecision;
    outputPreference?: HearthOutputPreference | null;
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
    "- Ask a follow-up only when it materially helps the creator's current intent.",
    "- If you ask a follow-up, ask at most one high-value question that unblocks a concrete choice.",
    "- When the user sounds stuck, frustrated, uncertain, or excited, acknowledge it naturally in one grounded line and respond to the request they actually made.",
    "- Avoid assistant filler and stale lead-ins. Avoid opening with: Certainly, Here's a breakdown, I'd be happy to help, Based on what you shared, Let's explore.",
    "- Never open with filler phrases such as: Certainly, Of course, I'd be happy to, Here's a breakdown, Let's explore.",
    "- Avoid robotic framing or formal tone unless the user explicitly requests it.",
    "- Avoid repetitive cadence like: Would you like me to... unless that exact question is genuinely necessary.",
    "- Agreement is not the default. Do not auto-validate weak ideas.",
    "- Do not hedge everything with maybe/possibly. Be clear when something is weak or strong.",
    "- Replace flattery with evaluation: explain what works and what fails.",
    "- Critique style: firm, calm, constructive. No harshness, no sugarcoating.",
    "- Attack the work, never the person. Critique drafts/sections/approaches, not talent or effort.",
    "- Pair requested critique with useful direction without taking control of the work.",
    "- Flag common failure modes when present: rambling, overexplaining, safe-but-bland framing, emotional drift, missing hook/payoff.",
    "- Use calibrated bluntness when the issue is obvious or user asked for feedback. Example style: This is muddy. This section is not earning its time.",
    "- Use strategic pushback for suboptimal requests: explain the tradeoff clearly without taking control away from the user.",
    "- Recognize effort without praise inflation, then respond at the creator's current stage.",
    "- Challenge level should match user intent: if venting/exhausted/overwhelmed/celebrating or asking simple execution, keep challenge light and focus on the present request.",
    "- When critique is requested and the draft is too safe, say so and suggest a stronger language or angle.",
    "- When the creator asks for direction, prefer one high-confidence direction over decision overload.",
    "- Do not end with optional brainstorming prompts like: Would you like me to... unless user explicitly asks for options.",
    "- Emotional intelligence adaptation:",
    "- If user is excited, match energy but stay grounded.",
    "- If user is frustrated, stay calm and constructive.",
    "- If user is tired, simplify and reduce cognitive load.",
    "- If user is venting, acknowledge briefly then redirect gently.",
    "- If user is focused, be concise and task-oriented.",
    "- Use ops only for concrete edits requested by the user.",
    "- If the user only asks a question, return ops as [].",
    "- Conversation-versus-mutation rule: questions about how, what, or whether to change a script are editorial discussion. Answer with analysis and suggestions in assistantText and return no set_body op. Only produce set_body when the creator affirmatively asks you to apply, update, revise, rewrite, or create a script version.",
    "- Explicit no-edit language such as 'do not edit it yet' or 'I did not ask you to update it' always remains discussion, even when the same message mentions possible script changes.",
    "- Do not invent source ids for update/remove ops.",
    "- Keep output strictly JSON (no code fences).",
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
  ];

  const mode = options?.decision.mode ?? "conversation";
  baseLines.push("Authoritative turn mode:", mode);
  if (mode === "conversation") {
    baseLines.push(
      "Conversation mode (hard rule):",
      "- Discuss the creator's idea or possible editorial changes without creating an artifact.",
      "- Do not draft, rewrite, mutate, research, package, or advance workflow state.",
      "- Return ops as [] and keep script_text and research_artifact null.",
      "- Answer the question actually asked; do not force a next step.",
    );
  }
  if (mode === "outline_generate") {
    baseLines.push(
      "Outline generation mode (hard rule):",
      "- Artifact presence invariant: never claim an outline exists unless substantive outline content is present in this response.",
      "- Produce a substantive outline with at least one actual bullet or labeled section.",
      "- Return the outline in assistantText or set_outline. An announcement-only preamble is invalid.",
      "- Do not produce or mutate a full script.",
    );
  }
  if (mode === "script_generate" || mode === "script_mutate") {
    baseLines.push(
      "ANVIL SCRIPT ARTIFACT CONTRACT:",
      "- Artifact presence invariant: never claim a script exists unless substantive script content is present in this response.",
      mode === "script_mutate"
        ? "- Propose a substantive revision of the current script; do not claim it was applied."
        : "- Produce a substantive new script artifact; do not claim it was applied.",
      "- Include canonical script content in script_text and a matching set_body operation.",
      "- Allowed speaker blocks are [s1], [s2], [g1], and [g2], each opened and closed on their own lines.",
      "- Never mix speakers inside a block; keep blocks short and teleprompter-readable.",
      "- Allowed pacing tokens are [pause], [beat], and [reflective pause].",
      "- Do not use Markdown speaker labels or unrecognized control markup.",
      "- Validate tag closure and standalone placement before returning.",
      "- Include tag_audit confirming closure, standalone tags, and absence of random markup.",
      "- An introductory sentence without substantive script content is invalid.",
    );
  }
  if (mode === "readiness_review") {
    baseLines.push(
      "Producer readiness-review mode (hard rule):",
      "- Analyze the current script without editing it or generating a replacement artifact.",
      "- Return ops as [] and identify concrete strengths, risks, and unresolved issues.",
      "- Do not silently rewrite and do not claim canonical Ready state changed.",
    );
  }
  if (mode === "production_action") {
    baseLines.push(
      "Production action mode (hard rule):",
      "- Use the approved script supplied in episode_context for only the explicitly requested production action.",
      "- Do not research, discuss unrelated episodes, mutate the script, or offer additional production work.",
      "- Return the complete requested production artifact in this response.",
    );
  }
  if ((mode === "outline_generate" || mode === "script_generate" || mode === "script_mutate" || mode === "production_action")
    && options?.outputPreference) {
    baseLines.push("Creator output preference for this requested artifact:", options.outputPreference);
  }

  if (options?.listeningTurn) {
    baseLines.push(
      "Listening-turn override (hard rule):",
      "- The creator is still explaining an idea and is asking only whether you are following.",
      "- Briefly acknowledge the direction in one or two natural sentences, then invite them to continue.",
      "- Do not critique, outline, rewrite, add producer notes, propose production decisions, or ask format/host questions yet.",
      "- This mode takes precedence over critique, optimization, and concrete-next-step suggestions for this turn.",
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
      "- creatorClaims in the runtime result are creator-supplied leads, not evidence. Preserve them, attempt corroboration, and never promote them merely because the creator supplied them.",
      "- Inspect the supplied evidence excerpts and compare sources before writing findings.",
      "- Do not claim completion unless research_artifact contains substantive findings.",
      "- For complete or partial work, return research_artifact with the exact briefFingerprint and workpieceId from the brief.",
      "- Each factual finding must name one or more sourceIds from inspected current-request evidence. Use status verified_fact, reported_claim, or uncertain.",
      "- Use provenanceStatus verified_by_current_run only for a claim supported by cited inspected evidence; use reported_by_accessible_secondary for cited accessible reporting; otherwise use creator_supplied_unverified, conflicting, unsupported, or inaccessible_source_only as applicable.",
      "- Editorial interpretation, including a causal connection inferred only from chronology, must use status editorial_interpretation and must not masquerade as a sourced fact.",
      "- When evidence establishes only sequence, say that events coincided or that one followed the other; do not say an ownership or financial change caused decline.",
      "- Set finding scope to current_subject only when it answers the named subject in the brief. Label separate nearby projects or entities adjacent_context and never use their spending, scope, or timeline to answer for the current subject.",
      "- Return uncertainties and conflicts explicitly. Never fill a gap from background knowledge.",
      "- One malformed, inaccessible, or paywalled citation degrades that source only. Return partial when other inspected evidence or substantive creator-supplied leads remain usable. Use failed only when no substantive artifact can be produced.",
      "- If creatorInputTruncated is true, ignore incomplete trailing prose and do not infer its missing ending.",
      "- Business operating status is time-sensitive. A pasted name, address, description, hours listing, or colorful claim is not proof that a business is currently open.",
      "- For business findings, include businessName and businessStatus: verified_currently_operating, appears_active_unconfirmed, creator_supplied_unverified, closed_inactive, non_customer_facing, or adjacent_location.",
      "- Use verified_currently_operating or closed_inactive only when inspected current-request evidence directly supports the current status. Otherwise prefer appears_active_unconfirmed or creator_supplied_unverified.",
      "- Offices, venues, operators, institutions, and adjacent locations must not be presented as equivalent to a customer-facing business. Classify entity role and scope explicitly when the inspected evidence permits it.",
      "- Claims such as popular, only business left, rooftop access, hours, or walk-in availability require their own inspected support before reuse as factual script material.",
      "- Creator assistance is appropriate only for a source explicitly marked inaccessible with a specific accessFailureReason; continue using other inspected sources.",
      "research_artifact shape:",
      "{\"briefFingerprint\":string,\"workpieceId\":string,\"status\":\"complete\"|\"partial\"|\"failed\",\"findings\":[{\"text\":string,\"status\":\"verified_fact\"|\"reported_claim\"|\"uncertain\"|\"editorial_interpretation\",\"provenanceStatus\":\"creator_supplied_unverified\"|\"verified_by_current_run\"|\"reported_by_accessible_secondary\"|\"conflicting\"|\"unsupported\"|\"inaccessible_source_only\",\"scope\":\"current_subject\"|\"adjacent_context\",\"businessName\":string|undefined,\"businessStatus\":\"verified_currently_operating\"|\"appears_active_unconfirmed\"|\"creator_supplied_unverified\"|\"closed_inactive\"|\"non_customer_facing\"|\"adjacent_location\"|undefined,\"sourceIds\":string[]}],\"uncertainties\":string[],\"editorialInterpretation\":string[]}",
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

export function hasSufficientCustomerResearchEvidence(result: HearthResearchResult | null): boolean {
  if (!result || result.runtimeStatus === "error" || result.runtimeStatus === "no_results") return false;
  const brief = result.brief;
  const inspectedSourceIds = new Set(result.sources
    .filter((source) => (
      source.extractionStatus === "extracted"
      && source.provenance?.inspectionStatus === "inspected"
      && source.provenance.verifiedInCurrentRequest
      && (!brief || source.provenance.briefFingerprint === brief.briefFingerprint)
    ))
    .map((source) => source.sourceId));
  return (result.evidence ?? []).some((entry) => (
    entry.state === "inspected"
    && Boolean(entry.excerpt?.trim())
    && inspectedSourceIds.has(entry.sourceId)
    && (!brief || (
      entry.briefFingerprint === brief.briefFingerprint
      && entry.workpieceId === brief.workpieceId
    ))
  ));
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
  const artifact = reconcileCreatorSuppliedResearchArtifact(result);
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
  const substantive = artifact.findings.filter((finding) => (
    isSubstantiveResearchFinding(finding)
    && !ANNOUNCEMENT_ONLY_RE.test(finding.text.trim())
  ));
  if (artifact.status === "failed") return substantive.length === 0 ? artifact : null;
  if (substantive.length === 0) return null;
  for (const finding of substantive) {
    if (finding.status === "editorial_interpretation") continue;
    if (
      finding.provenanceStatus === "creator_supplied_unverified"
      || finding.provenanceStatus === "unsupported"
      || finding.provenanceStatus === "inaccessible_source_only"
    ) {
      if (finding.status !== "uncertain") return null;
      continue;
    }
    if (finding.provenanceStatus === "conflicting") {
      if (finding.status !== "uncertain" || finding.sourceIds.some((sourceId) => !result.sources.some((source) => source.sourceId === sourceId))) return null;
      continue;
    }
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
    status: artifact.status === "complete" && (
      currentRetrievalIncomplete
      || scopedFindings.every((finding) => finding.scope === "adjacent_context")
      || scopedFindings.some((finding) => finding.provenanceStatus !== "verified_by_current_run" && finding.provenanceStatus !== "reported_by_accessible_secondary")
    ) ? "partial" : artifact.status,
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
  const renderFinding = (finding: HearthResearchArtifact["findings"][number]) => {
    const citations = finding.sourceIds.map((id) => `[${id}]`).join(" ");
    return `- ${finding.text}${citations ? ` ${citations}` : ""}`;
  };
  const isBusinessFinding = (finding: HearthResearchArtifact["findings"][number]) => Boolean(finding.businessStatus || finding.entityRole);
  const verifiedOpenBusinessLines = artifact.findings.filter((finding) => (
    finding.businessStatus === "verified_currently_operating"
    && (finding.provenanceStatus === "verified_by_current_run" || finding.provenanceStatus === "reported_by_accessible_secondary")
  )).map(renderFinding);
  const appearsActiveBusinessLines = artifact.findings.filter((finding) => (
    finding.businessStatus === "appears_active_unconfirmed"
  )).map(renderFinding);
  const unverifiedBusinessLines = artifact.findings.filter((finding) => (
    finding.businessStatus === "creator_supplied_unverified"
    && (finding.entityRole === "customer_facing" || finding.entityRole === "unknown" || !finding.entityRole)
  )).map(renderFinding);
  const closedBusinessLines = artifact.findings.filter((finding) => (
    finding.businessStatus === "closed_inactive"
    && (finding.provenanceStatus === "verified_by_current_run" || finding.provenanceStatus === "reported_by_accessible_secondary")
  )).map(renderFinding);
  const nonStorefrontBusinessLines = artifact.findings.filter((finding) => (
    finding.businessStatus === "non_customer_facing" || finding.businessStatus === "adjacent_location"
    || finding.entityRole === "office" || finding.entityRole === "venue"
    || finding.entityRole === "operator" || finding.entityRole === "institution"
  )).map(renderFinding);
  const validatedFindingLines = artifact.findings.filter((finding) => (
    !isBusinessFinding(finding)
    &&
    finding.scope !== "adjacent_context"
    && (finding.provenanceStatus === "verified_by_current_run" || finding.provenanceStatus === "reported_by_accessible_secondary")
  )).map(renderFinding);
  const creatorLeadLines = artifact.findings.filter((finding) => (
    !isBusinessFinding(finding)
    &&
    finding.scope !== "adjacent_context"
    && finding.provenanceStatus === "creator_supplied_unverified"
  )).map(renderFinding);
  const unresolvedFindingLines = artifact.findings.filter((finding) => (
    !isBusinessFinding(finding)
    &&
    finding.scope !== "adjacent_context"
    && (finding.provenanceStatus === "conflicting"
      || finding.provenanceStatus === "unsupported"
      || finding.provenanceStatus === "inaccessible_source_only")
  )).map(renderFinding);
  const adjacentFindingLines = artifact.findings.filter((finding) => !isBusinessFinding(finding) && finding.scope === "adjacent_context").map(renderFinding);
  const adjacentIncludesBudget = artifact.findings.some((finding) => (
    !isBusinessFinding(finding)
    && finding.scope === "adjacent_context"
    && (/\$\s*\d/.test(finding.text) || /\b(?:budget|funding|cost|spending|investment)\b/i.test(finding.text))
  ));
  const refinementLines = refinementPresentationLines(result);
  const inaccessible = result.sources.filter((source) => source.provenance?.inspectionStatus === "inaccessible");
  const inspectedSources = result.sources.filter((source) => source.provenance?.inspectionStatus === "inspected");
  const validatedSourceIds = new Set(artifact.findings
    .filter((finding) => (
      finding.provenanceStatus === "verified_by_current_run"
      || finding.provenanceStatus === "reported_by_accessible_secondary"
    ))
    .flatMap((finding) => finding.sourceIds));
  const supportingSources = inspectedSources.filter((source) => validatedSourceIds.has(source.sourceId));
  const inspectedSourceLines = inspectedSources
    .map((source) => `- [${source.sourceId}] ${sourcePublisher(source)} — ${authorityLabel(source)} — ${source.canonicalUrl || source.url}`);
  return [
    ...(verifiedOpenBusinessLines.length ? ["Open doors I could verify", verifiedOpenBusinessLines.join("\n")] : []),
    ...(appearsActiveBusinessLines.length ? ["Appears active, but current status is not fully confirmed", appearsActiveBusinessLines.join("\n")] : []),
    ...(unverifiedBusinessLines.length ? ["Still unverified", unverifiedBusinessLines.join("\n")] : []),
    ...(closedBusinessLines.length ? ["Closed or inactive", closedBusinessLines.join("\n")] : []),
    ...(nonStorefrontBusinessLines.length ? ["Adjacent or not customer-facing", nonStorefrontBusinessLines.join("\n")] : []),
    ...(validatedFindingLines.length ? [artifact.status === "complete" ? "Validated findings" : "Validated partial findings", validatedFindingLines.join("\n")] : []),
    ...(creatorLeadLines.length ? ["Creator-supplied leads still unverified", creatorLeadLines.join("\n")] : []),
    ...(unresolvedFindingLines.length ? ["Conflicting, unsupported, or inaccessible-source-only claims", unresolvedFindingLines.join("\n")] : []),
    ...(adjacentFindingLines.length ? [
      "Adjacent context",
      `${adjacentFindingLines.join("\n")}${adjacentIncludesBudget ? "\n- These adjacent figures do not establish the current subject's project budget." : ""}`,
    ] : []),
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
    "References and source accounting",
    `- Inspected sources: ${inspectedSources.length}\n- Sources supporting a validated claim: ${supportingSources.length}`,
    "Inspected sources",
    inspectedSourceLines.length ? inspectedSourceLines.join("\n") : "- None.",
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
  const researchRuntime = config.researchRuntime
    ?? createHearthResearchRuntime({ braveApiKey: researchApiKey });
  const ownerResearchApiKey = config.ownerResearchApiKey ?? null;
  const ownerResearchRuntime = config.researchRuntime
    ?? createHearthResearchRuntime({ braveApiKey: ownerResearchApiKey });
  const researchSourceExtractor = config.researchSourceExtractor
    ?? extractUrlToResearchSource;
  const textApiKey = config.textApiKey ?? config.apiKey ?? null;
  const ownerTextApiKey = config.ownerTextApiKey ?? null;
  const ownerResearchTextApiKey = config.ownerResearchTextApiKey ?? null;
  const {
    model: configuredModel,
    sttModel,
    configuredBillingMode,
    supabaseUrl,
    supabaseServiceRoleKey,
    supabaseRpcKey,
    tongsApiToken,
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
  const openAiTextGate = config.openAiTextGate ?? (supabaseService
    ? {
        rpc: async (name: string, args: Record<string, unknown>) => {
          const client = supabaseService.schema("tongs") as unknown as {
            rpc: (fn: string, payload: Record<string, unknown>) => Promise<{
              data: unknown;
              error: { message: string } | null;
            }>;
          };
          return client.rpc(name, args);
        },
      }
    : null);
  const ownerCostGate = config.ownerCostGate ?? openAiTextGate as OwnerCostRpcGate | null;
  const ownerAuthorityReader = config.ownerAuthorityReader ?? (supabaseService
    ? createSupabaseOwnerAuthorityReader(supabaseService)
    : null);
  const ownerExecutionCoordinator = config.ownerExecutionCoordinator ?? (
    ownerCostGate && ownerAuthorityReader
      ? new ForgeOwnerExecutionCoordinator({ gate: ownerCostGate, authorityReader: ownerAuthorityReader })
      : null
  );

  type FundingReservationQuery = {
    eq(column: "id" | "operation_id" | "user_id", value: string): FundingReservationQuery;
    single(): Promise<{ data: { funding_environment: string } | null; error: { message: string } | null }>;
  };
  const withBoundFundingEnvironment = async (
    handle: Omit<HearthPaidExecutionHandle, "fundingEnvironment">,
    userId: string,
  ): Promise<HearthPaidExecutionHandle> => {
    if (!supabaseService) throw new Error("funding_context_required");
    const store = supabaseService.schema("tongs") as unknown as {
      from(table: "funding_reservations"): { select(columns: "funding_environment"): FundingReservationQuery };
    };
    const { data, error } = await store.from("funding_reservations").select("funding_environment")
      .eq("id", handle.reservationId).eq("operation_id", handle.operationId).eq("user_id", userId).single();
    const environment = data?.funding_environment;
    if (error || (environment !== "test" && environment !== "live" && environment !== "owner_internal")) {
      throw new Error("funding_context_required");
    }
    return { ...handle, fundingEnvironment: environment };
  };
  const withOwnerFundingEnvironment = (gate: NonNullable<typeof openAiTextGate>) => !supabaseService ? gate : {
    rpc: async (name: string, args: Record<string, unknown>) => {
      const result = await gate.rpc(name, args);
      if (name !== "resolve_openai_text_paid_execution_context" || result.error || !isRecord(result.data)) return result;
      const context = result.data;
      const bound = await withBoundFundingEnvironment({
        operationId: String(context.operation_id ?? ""),
        reservationId: String(context.reservation_id ?? ""),
        requestFingerprint: String(context.request_fingerprint ?? ""),
      }, String(args.p_user_id ?? ""));
      return { data: { ...context, funding_environment: bound.fundingEnvironment }, error: null };
    },
  };

  const readCanonicalTitleApproval = async (
    workspaceId: string,
    workpieceId: string,
  ): Promise<ApprovedTitleScript | null> => {
    if (config.readApprovedTitleScript) return config.readApprovedTitleScript(workspaceId, workpieceId);
    if (!supabaseService) return null;
    const store = supabaseService.schema("tongs");
    const [sequence, episode] = await Promise.all([
      store.from("workpiece_script_approval_sequences")
        .select("current_approval_id,current_revision")
        .eq("workspace_id", workspaceId).eq("workpiece_id", workpieceId).maybeSingle(),
      store.from("episodes")
        .select("label,deleted_at,archived_at")
        .eq("workspace_id", workspaceId).eq("id", workpieceId).maybeSingle(),
    ]);
    if (sequence.error || episode.error) throw new Error("title_approval_authority_unavailable");
    if (!sequence.data?.current_approval_id || !episode.data
      || episode.data.deleted_at || episode.data.archived_at) return null;
    const approval = await store.from("script_approval_revisions")
      .select("id,approval_revision,script_content_hash,script_text")
      .eq("id", sequence.data.current_approval_id)
      .eq("workspace_id", workspaceId).eq("workpiece_id", workpieceId).maybeSingle();
    if (approval.error) throw new Error("title_approval_authority_unavailable");
    if (!approval.data || approval.data.approval_revision !== sequence.data.current_revision) return null;
    return {
      approvalId: approval.data.id,
      approvalRevision: approval.data.approval_revision,
      scriptHash: approval.data.script_content_hash.toLowerCase(),
      scriptText: approval.data.script_text,
      episodeTitle: episode.data.label,
    };
  };

  const readCanonicalThumbnailDirectionInput = async (
    workspaceId: string,
    workpieceId: string,
    approved: ApprovedTitleScript,
  ): Promise<PaidThumbnailDirectionInput | null> => {
    if (!supabaseService) return null;
    const metadataKey = `workpieces/${workpieceId}/metadata.json`;
    const downloaded = await supabaseService.storage.from("forge-workpieces").download(metadataKey);
    if (downloaded.error || !downloaded.data) throw new Error("thumbnail_direction_metadata_unavailable");
    let metadata: unknown;
    try {
      metadata = JSON.parse(await downloaded.data.text());
    } catch {
      throw new Error("thumbnail_direction_metadata_invalid");
    }
    if (!isRecord(metadata)) throw new Error("thumbnail_direction_metadata_invalid");
    const episodePackage = hydrateEpisodePackageV3(metadata);
    const titleRows = episodePackage.seo.titles.slice(0, 3);
    if (titleRows.length !== 3 || titleRows.some((title) => !title.id || !title.text.trim()
      || !Number.isInteger(title.revision) || title.revision < 1)) return null;
    const keys = ["A", "B", "C"] as const;
    const titles = titleRows.map((title, index) => ({
      key: keys[index]!, id: title.id, revision: title.revision, text: title.text.trim(),
      thumbnailText: resolveHearthThumbnailOverlayText(title),
    })) as PaidThumbnailDirectionInput["titles"];
    const thumbnail = episodePackage.thumbnail;
    const planningSubtree = {
      authority_version: thumbnail.authority_version,
      active_creative_strategy_id: thumbnail.active_creative_strategy_id,
      active_concept_set_id: thumbnail.active_concept_set_id,
      creative_strategies: thumbnail.creative_strategies,
      creative_briefs: thumbnail.creative_briefs,
      concept_sets: thumbnail.concept_sets,
      concept_revisions: thumbnail.concept_revisions,
    };

    const store = supabaseService.schema("tongs");
    const bindingRead = await store.from("workpiece_brand_bindings")
      .select("id,revision,state,profile_revision_id,profile_content_hash,asset_revision_ids")
      .eq("workspace_id", workspaceId).eq("workpiece_id", workpieceId).maybeSingle();
    if (bindingRead.error) throw new Error("thumbnail_direction_brand_unavailable");
    let style: PaidThumbnailDirectionInput["style"] = {
      resolvedSource: "forge_standard", authorityRevision: HEARTH_THUMBNAIL_DIRECTION_STYLE_FALLBACK,
      bindingId: null, bindingRevision: null, profileRevisionId: null,
      profileContentHash: null, planningRules: null,
    };
    const binding = bindingRead.data;
    if (binding?.state === "profile" && binding.profile_revision_id && binding.profile_content_hash) {
      const revisionRead = await store.from("brand_profile_revisions")
        .select("id,content_hash,state,eligible_for_new_use,rules_json")
        .eq("workspace_id", workspaceId).eq("id", binding.profile_revision_id).maybeSingle();
      if (revisionRead.error) throw new Error("thumbnail_direction_brand_unavailable");
      const revision = revisionRead.data;
      const rules = revision && isRecord(revision.rules_json) ? revision.rules_json : null;
      const assetMap = rules && isRecord(rules.asset_revision_ids) ? rules.asset_revision_ids : null;
      const boundIds = Array.isArray(binding.asset_revision_ids)
        ? binding.asset_revision_ids.filter((value): value is string => typeof value === "string")
        : [];
      const logoId = assetMap
        ? ["transparent_logo", "primary_logo", "watermark_logo"]
          .map((role) => readOptionalString(assetMap[role])).find((id) => id && boundIds.includes(id)) ?? null
        : null;
      const logoRead = logoId
        ? await store.from("brand_asset_revisions").select("id,state,mime_type,content_hash")
          .eq("workspace_id", workspaceId).eq("id", logoId).maybeSingle()
        : null;
      const logoReady = logoRead && !logoRead.error && logoRead.data?.state === "ready"
        && typeof logoRead.data.mime_type === "string" && logoRead.data.mime_type.startsWith("image/")
        && typeof logoRead.data.content_hash === "string";
      if (revision && revision.state === "committed" && revision.eligible_for_new_use === true
        && revision.content_hash === binding.profile_content_hash && logoReady && rules) {
        style = {
          resolvedSource: "brand_profile",
          authorityRevision: "forge.thumbnail-direction-style.brand-profile.v1",
          bindingId: binding.id, bindingRevision: binding.revision,
          profileRevisionId: revision.id, profileContentHash: revision.content_hash,
          planningRules: {
            palette: isRecord(rules.palette) ? rules.palette : {},
            typography: isRecord(rules.typography) ? rules.typography : {},
            public_identity: isRecord(rules.public_identity) ? rules.public_identity : {},
          },
        };
      }
    }
    return {
      approved, titles, style,
      authority: {
        thumbnailAuthorityVersion: thumbnail.authority_version,
        activeStrategyId: thumbnail.active_creative_strategy_id,
        activeConceptSetId: thumbnail.active_concept_set_id,
        planningSubtreeHash: canonicalContentHash(planningSubtree),
      },
    };
  };

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
    textRouteCode?: OpenAiTextRouteCode | null;
    isRecoverableHttpError?: (response: Response) => Promise<boolean>;
    request: {
      url: string;
      init: RequestInit;
      signal: AbortSignal;
    };
  }): Promise<Response> {
    try {
      const executeLegacy = () => fetch(args.request.url, {
          ...args.request.init,
          signal: args.request.signal,
        });
      const response = args.textRouteCode
        ? await executeOpenAiTextTransport({
            routeCode: args.textRouteCode,
            executeLegacy,
          })
        : await executeLegacy();

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
    if (accessToken && config.resolveUserIdForAccessToken) {
      return config.resolveUserIdForAccessToken(accessToken);
    }
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
        const workspaceId = url.searchParams.get("workspace_id")?.trim() ?? "";
        if (!workspaceId) {
          return jsonResponse(200, {
            ok: true,
            ...buildBillingSnapshot(lane),
          });
        }
        if (!isUuid(workspaceId)) {
          return jsonResponse(400, { ok: false, error: "A valid workspace is required." });
        }
        const bearerToken = readBearerToken(request.headers.get("authorization"));
        const userId = await resolveUserId(bearerToken);
        if (!userId) {
          return jsonResponse(401, { ok: false, error: "Authentication required." });
        }

        let ownerChatCapability: {
          status: "not_required" | "available" | "unavailable" | "unknown";
          reason_code: "owner_runtime_unavailable" | "owner_controls_unavailable" | null;
        } = { status: "not_required", reason_code: null };
        if (lane === AI_USAGE_LANE.FORGE) {
          if (!openAiTextGate) {
            ownerChatCapability = {
              status: "unknown",
              reason_code: "owner_controls_unavailable",
            };
          } else {
            try {
              const requirement = await readOwnerHearthExecutionRequirement({
                gate: openAiTextGate,
                userId,
                workspaceId,
              });
              if (requirement.owner_testing_effective === true) {
                ownerChatCapability = ownerTextApiKey
                  ? { status: "available", reason_code: null }
                  : { status: "unavailable", reason_code: "owner_runtime_unavailable" };
              }
            } catch {
              ownerChatCapability = {
                status: "unknown",
                reason_code: "owner_controls_unavailable",
              };
            }
          }
        }
        return jsonResponse(200, {
          ok: true,
          ...buildBillingSnapshot(lane),
          owner_chat_capability: ownerChatCapability,
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

        const transcriptionMode = configuredOpenAiTranscriptionMode();
        if (transcriptionMode === "halt_new" && !bodyRaw.paid_execution) {
          return jsonResponse(423, {
            ok: false,
            error: "New transcription submissions are halted while existing operations remain available for reconciliation.",
            code: "paid_submissions_halted",
            ...buildBillingSnapshot(lane),
          });
        }
        if (transcriptionMode === "enforce" || transcriptionMode === "halt_new") {
          const workspaceId = readOptionalString(bodyRaw.workspace_id);
          if (!workspaceId || !isUuid(workspaceId) || !openAiTextGate || !bearerToken) {
            return jsonResponse(401, {
              ok: false,
              error: "Authenticated workspace funding is required for transcription.",
              code: "transcription_funding_context_required",
              ...buildBillingSnapshot(lane),
            });
          }
          const paidExecution = normalizeOpenAiTextPaidExecutionHandle(bodyRaw.paid_execution);
          const spendingAcceptance = normalizeOpenAiTextSpendingAcceptance(bodyRaw.spending_acceptance);
          if ((bodyRaw.paid_execution != null && !paidExecution)
            || (bodyRaw.spending_acceptance != null && !spendingAcceptance)) {
            return jsonResponse(400, {
              ok: false,
              error: "Invalid transcription funding context.",
              code: "invalid_paid_execution_context",
              ...buildBillingSnapshot(lane),
            });
          }
          const audioBytes = new Uint8Array(await audioBlob.arrayBuffer());
          const sourceSha256 = sha256Bytes(audioBytes);
          let capturedProviderRequestId: string | null = null;
          try {
            const coordinated = await executeOpenAiTranscriptionTransport({
              mode: "enforce",
              executeLegacy: async () => {
                throw new Error("legacy_transcription_unreachable_in_enforce_mode");
              },
              coordinatedExecution: () => coordinateOpenAiTranscription({
                routeCode: "hearth.speech_transcription",
                userId,
                workspaceId,
                workpieceId,
                model: sttModel,
                credentialSource: resolvedCredentials.keySource === "user_byo" ? "user_byo" : "forge_managed",
                serviceGate: openAiTextGate,
                userGate: {
                  rpc: async (name, payload) => {
                    const result = await callUserScopedTongsRpc({ accessToken: bearerToken, fn: name, payload });
                    return result.ok ? { data: result.data, error: null } : { data: null, error: { message: result.error } };
                  },
                },
                paidExecution,
                acceptance: spendingAcceptance,
                source: {
                  assetRevision: storageKey,
                  sha256: sourceSha256,
                  bytes: audioBytes.byteLength,
                  maximumDurationSeconds: null,
                  maximumChunks: 1,
                  outputContract: "forge.hearth.speech-transcript.v1",
                  providerInputUnitUpperBound: 16_000,
                },
                requestTerms: { mime_type: mimeType || audioBlob.type || null, action_id: sttActionId },
                callerClass: "interactive",
                executeProvider: async (context) => {
                  const form = new FormData();
                  form.set("model", context.model);
                  form.set("file", new Blob([audioBytes], { type: mimeType || audioBlob.type || "audio/webm" }), `speech.${inferAudioExtension(mimeType || audioBlob.type || null, storageKey)}`);
                  let upstream: Response;
                  try {
                    upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
                      method: "POST",
                      headers: { authorization: `Bearer ${resolvedCredentials.apiKey}` },
                      body: form,
                      signal: request.signal,
                    });
                  } catch (error) {
                    throw new OpenAiTextProviderError("OpenAI transcription submission outcome is uncertain", true, null, {
                      error: error instanceof Error ? error.message : String(error),
                    });
                  }
                  const providerRequestId = upstream.headers.get("x-request-id");
                  capturedProviderRequestId = providerRequestId;
                  const raw = await upstream.text();
                  let payload: unknown = {};
                  try { payload = JSON.parse(raw); } catch { payload = {}; }
                  if (!upstream.ok) {
                    throw new OpenAiTextProviderError("OpenAI rejected the bounded transcription request", false, null, {
                      provider_reference: providerRequestId,
                      status: upstream.status,
                      detail: raw.slice(0, 2_000),
                    });
                  }
                  return {
                    value: payload,
                    requestId: providerRequestId,
                    usage: readOpenAiTranscriptionUsage(payload),
                    evidence: { provider_reference: providerRequestId, response_captured: true },
                  };
                },
                validateResult: (payload) => {
                  if (!extractTranscriptionText(payload)) throw new Error("OpenAI returned empty transcription");
                },
                persistCanonical: async (payload, operationId, reservationId) => {
                  const text = extractTranscriptionText(payload);
                  const persisted = await openAiTextGate.rpc("persist_openai_transcription_result", {
                    p_operation_id: operationId,
                    p_reservation_id: reservationId,
                    p_route_code: "hearth.speech_transcription",
                    p_user_id: userId,
                    p_workspace_id: workspaceId,
                    p_workpiece_id: workpieceId,
                    p_source_sha256: sourceSha256,
                    p_provider_request_id: capturedProviderRequestId,
                    p_transcript_json: { text, schema: "forge.hearth.speech-transcript.v1" },
                  });
                  if (persisted.error) throw new Error(persisted.error.message);
                  return { text, schema: "forge.hearth.speech-transcript.v1" };
                },
              }),
            });
            if (coordinated.state !== "settled" && coordinated.state !== "settled_replay") {
              return jsonResponse(coordinated.state === "submission_unknown" ? 202 : 502, {
                ok: false,
                error: coordinated.state === "submission_unknown"
                  ? "The provider submission is unresolved. Forge will not resubmit automatically."
                  : "Transcription failed. Your customer charge is $0.",
                code: coordinated.state,
                ...buildBillingSnapshot(lane),
              });
            }
            await supabaseService.storage.from(sttBucket).remove([storageKey]).catch(() => undefined);
            return jsonResponse(200, {
              ok: true,
              text: typeof coordinated.result.text === "string" ? coordinated.result.text : "",
              provider_request_id: coordinated.requestId,
              customer_charge_micros: coordinated.customerChargeMicros,
              billing_receipt: {
                operation_id: coordinated.operationId,
                reservation_id: coordinated.reservationId,
                customer_charge_micros: coordinated.customerChargeMicros,
              },
              ...buildBillingSnapshot(lane),
              ...resolutionSnapshot,
            });
          } catch (error) {
            if (error instanceof OpenAiTranscriptionQuoteRequiredError) {
              return jsonResponse(error.quote.fundingEligible ? 409 : 402, {
                ok: false,
                error: error.message,
                code: "transcription_spending_confirmation_required",
                billing_quote: {
                  quote_id: error.quote.quoteId,
                  operation_id: error.quote.operationId,
                  quote_hash: error.quote.quoteHash,
                  request_fingerprint: error.quote.requestFingerprint,
                  currency: error.quote.currency,
                  maximum_customer_charge_micros: error.quote.maximumCustomerChargeMicros,
                  failure_customer_charge_micros: 0,
                  failure_terms: error.quote.failureTerms,
                  funding_eligible: error.quote.fundingEligible,
                  funding_source: error.quote.fundingSource,
                  funding_label: error.quote.fundingLabel,
                  model_display_name: error.quote.modelDisplayName,
                  provider_model_id: error.quote.providerModelId,
                  model_tradeoff_summary: error.quote.modelTradeoffSummary,
                  catalog_revision: error.quote.catalogRevision,
                  estimated_customer_charge_micros: error.quote.estimatedCustomerChargeMicros,
                  expires_at: error.quote.expiresAt,
                },
                ...buildBillingSnapshot(lane),
              });
            }
            if (error instanceof OpenAiTranscriptionFundingPreparationError) {
              return jsonResponse(error.status, { ok: false, error: error.message, code: error.code, ...error.details, ...buildBillingSnapshot(lane) });
            }
            throw error;
          }
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
      const lane: BillingMode = isBillingMode(bodyRaw.lane) ? bodyRaw.lane : configuredBillingMode;
      const parsedRequestExplicitAction = normalizeHearthExplicitUiAction(bodyRaw.explicit_action);
      if (bodyRaw.explicit_action != null && !parsedRequestExplicitAction) {
        return jsonResponse(400, {
          ok: false,
          error: "explicit_action is invalid",
          billing_mode: lane,
          token_balance: null,
        });
      }
      if (parsedRequestExplicitAction?.kind === "deterministic") {
        const deterministicEpisodeContext = normalizeEpisodeContext(bodyRaw.episode_context);
        if (!deterministicEpisodeContext) {
          return jsonResponse(400, {
            ok: false,
            error: "episode_context with episodeId is required",
            code: "deterministic_episode_context_required",
            billing_mode: lane,
            token_balance: null,
          });
        }
        const rawDeterministicEpisodeContext = isRecord(bodyRaw.episode_context)
          ? bodyRaw.episode_context
          : null;
        const deterministicSourceBody = typeof rawDeterministicEpisodeContext?.body === "string"
          ? rawDeterministicEpisodeContext.body
          : deterministicEpisodeContext.body;
        const cleanup = applyHearthDeterministicCleanup(
          parsedRequestExplicitAction.action,
          deterministicSourceBody,
        );
        const assistantMessage = buildHearthDeterministicAssistantMessage(cleanup);
        const operations: HearthOp[] = cleanup.changed
          ? [{ op: "set_body", value: cleanup.result }]
          : [];
        const decision = resolveHearthTurnDecision({
          creatorText: readOptionalString(bodyRaw.user_authored_text) ?? "",
          explicitAction: parsedRequestExplicitAction,
          lifecycle: {
            hasDraft: deterministicSourceBody.trim().length > 0,
            hasApprovedScript: false,
            isReady: false,
          },
        });
        return jsonResponse(200, {
          ok: true,
          turn_result: buildHearthTurnResult({
            decision,
            assistantMessage,
            artifact: { kind: "script", text: cleanup.result },
            operations,
            persistence: "pending",
          }),
          assistant_text: assistantMessage,
          reply: assistantMessage,
          ops: operations,
          script_text: cleanup.result,
          tag_audit: null,
          total_tokens: null,
          billing_mode: lane,
          token_balance: null,
          deterministic_action: parsedRequestExplicitAction.action,
        });
      }
      let paidExecutionHandle = normalizeHearthPaidExecutionHandle(bodyRaw.paid_execution);
      if (bodyRaw.paid_execution != null && !paidExecutionHandle) {
        return jsonResponse(400, {
          ok: false,
          error: "Invalid paid execution handle.",
          code: "invalid_paid_execution_handle",
        });
      }
      const spendingAcceptance = normalizeHearthSpendingQuoteAcceptance(bodyRaw.spending_acceptance);
      if (bodyRaw.spending_acceptance != null && !spendingAcceptance) {
        return jsonResponse(400, {
          ok: false,
          error: "Invalid spending quote acceptance.",
          code: "invalid_spending_quote_acceptance",
        });
      }
      if (paidExecutionHandle && spendingAcceptance) {
        return jsonResponse(400, {
          ok: false,
          error: "Provide either a quote acceptance or a reserved execution handle, not both.",
          code: "conflicting_paid_execution_context",
        });
      }
      const productionAction = (
        bodyRaw.production_action === "seo"
        || bodyRaw.production_action === "tags"
        || bodyRaw.production_action === "thumbnails"
        || bodyRaw.production_action === "image_beat_sheet"
        || bodyRaw.production_action === "release_prep_pack"
      ) ? bodyRaw.production_action : null;
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
        const creatorText = readOptionalString(bodyRaw.user_authored_text)
          ?? [...messages].reverse().find((message) => message.role === "user")?.content
          ?? "";
        const identityDecision = resolveHearthTurnDecision({
          creatorText,
          explicitAction: normalizeHearthExplicitUiAction(bodyRaw.explicit_action)
            ?? (productionAction ? { kind: "production", action: productionAction } : null),
          lifecycle: { hasDraft: false, hasApprovedScript: false, isReady: false },
        });
        const error = "episode_context with episodeId is required";
        return jsonResponse(400, {
          ok: false,
          error,
          turn_result: buildHearthTurnResult({
            decision: identityDecision,
            assistantMessage: "",
            failureKind: "identity_mismatch",
            failureMessage: error,
          }),
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
      const parsedExplicitAction = parsedRequestExplicitAction;
      const outputPreference = normalizeHearthOutputPreference(bodyRaw.output_preference);
      if (bodyRaw.output_preference != null && !outputPreference) {
        return jsonResponse(400, {
          ok: false,
          error: "output_preference is invalid",
          ...buildBillingSnapshot(lane),
        });
      }
      const explicitAction = parsedExplicitAction
        ?? (productionAction ? { kind: "production" as const, action: productionAction } : null);
      if (parsedExplicitAction?.kind === "production" && parsedExplicitAction.action !== productionAction) {
        return jsonResponse(400, {
          ok: false,
          error: "explicit_action does not match production_action",
          ...buildBillingSnapshot(lane),
        });
      }
      const productionScriptVersion = typeof bodyRaw.production_script_version === "number"
        && Number.isInteger(bodyRaw.production_script_version)
        && bodyRaw.production_script_version > 0
        ? bodyRaw.production_script_version
        : null;
      const turnDecision = resolveHearthTurnDecision({
        creatorText: requestText,
        explicitAction,
        lifecycle: {
          hasDraft: episodeContext.body.trim().length > 0,
          hasApprovedScript: productionScriptVersion !== null,
          isReady: false,
        },
      });
      const compositionRequestKind = turnDecision.mode === "outline_generate"
        ? "outline" as const
        : turnDecision.mode === "script_generate" || turnDecision.mode === "script_mutate"
          ? "script" as const
          : null;
      const buildTurnResult = (args: {
        assistantMessage: string;
        artifact?: HearthValidatedArtifact | null;
        operations?: HearthOp[];
        failureKind?: "none" | "admission_failure" | "provider_failure" | "invalid_model_output" | "identity_mismatch";
        failureMessage?: string | null;
      }) => buildHearthTurnResult({
        decision: turnDecision,
        assistantMessage: args.assistantMessage,
        artifact: args.artifact,
        operations: args.operations,
        failureKind: args.failureKind,
        failureMessage: args.failureMessage,
        persistence: args.failureKind && args.failureKind !== "none" ? "not_attempted" : "pending",
      });
      const admissionFailureResponse = (args: {
        status: number;
        error: string;
        code: string;
        extra?: Record<string, unknown>;
      }) => jsonResponse(args.status, {
        ok: false,
        error: args.error,
        code: args.code,
        turn_result: buildTurnResult({
          assistantMessage: "",
          failureKind: "admission_failure",
          failureMessage: args.error,
        }),
        ...(args.extra ?? {}),
        ...buildBillingSnapshot(lane),
      });
      const compositionProviderFailureResponse = (providerStatus: number | null): Response | null => {
        if (!compositionRequestKind) return null;
        const error = compositionRequestKind === "outline"
          ? "Hearth couldn't generate the outline because the provider request failed."
          : "Hearth couldn't generate the requested composition because the provider request failed.";
        return jsonResponse(502, {
          ok: false,
          error,
          code: "provider_request_failed",
          provider_status: providerStatus,
          turn_result: buildTurnResult({
            assistantMessage: "",
            failureKind: "provider_failure",
            failureMessage: error,
          }),
          ...buildBillingSnapshot(lane),
        });
      };
      const userId = await resolveUserId(bearerToken);
      const chatFeature = classifyChatFeature(requestText);
      const requestedReasoningEffort = isRecord(bodyRaw.behavior)
        ? readOptionalString((bodyRaw.behavior as Record<string, unknown>).reasoning_effort)
        : null;
      const requestedModel = isRecord(bodyRaw.behavior)
        ? readOptionalString((bodyRaw.behavior as Record<string, unknown>).model)
        : null;
      let ownerHearthRequirement: Record<string, unknown> | null = null;
      let ownerResearchRequirement: Record<string, unknown> | null = null;
      if (lane === AI_USAGE_LANE.FORGE && ownerAuthorityReader && userId && isUuid(episodeContext.workspaceId)) {
        try {
          const authority = await requireForgeOwnerExecutionAuthority({
            reader: ownerAuthorityReader,
            authenticatedUserId: userId,
            workspaceId: episodeContext.workspaceId,
            routeCode: turnDecision.mode === "research" ? "hearth.research_synthesis" : "hearth.chat_completion",
          });
          const requirement = {
            owner_testing_effective: true,
            authority_kind: "shared_owner_cost",
            principal_revision: authority.principalRevision,
            membership_role: authority.membershipRole,
          };
          if (turnDecision.mode === "research") ownerResearchRequirement = requirement;
          else ownerHearthRequirement = requirement;
        } catch (error) {
          if (error instanceof ForgeOwnerAuthorizationError) {
            // Not an enabled owner principal. Continue through the unchanged customer path.
          } else {
          return jsonResponse(503, {
            ok: false,
            error: "Private owner execution controls are unavailable.",
            code: "owner_hearth_control_unavailable",
            ...buildBillingSnapshot(lane),
          });
          }
        }
      }
      let policyDecision: AiPolicyResolveResult | null = null;
      try {
        // Shared owner authority selects an isolated Forge credential directly.
        // Customer/BYO policy remains exclusively on the unchanged customer path.
        if (!ownerHearthRequirement && !ownerResearchRequirement) {
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
        }
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
          forgeManagedApiKey: ownerResearchRequirement
            ? ownerResearchTextApiKey
            : ownerHearthRequirement ? ownerTextApiKey : textApiKey,
          userId,
          supabaseService,
          disableUserKeys,
          policyDecision,
        });
      } catch (error) {
        if (error instanceof MissingForgeKeyError) {
          return jsonResponse(500, {
            ok: false,
            error: ownerResearchRequirement
              ? "Private owner research requires the isolated OPENAI_HEARTH_RESEARCH_OWNER_API_KEY credential."
              : ownerHearthRequirement
              ? "Private owner AI is unavailable in this runtime."
              : MISSING_OPENAI_TEXT_API_KEY_ERROR,
            ...(ownerHearthRequirement ? { code: "owner_hearth_runtime_unavailable" } : {}),
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
      if (effectiveLane === AI_USAGE_LANE.FORGE && !ownerHearthRequirement && !ownerResearchRequirement
        && !paidExecutionHandle && productionAction !== "seo" && productionAction !== "tags" && productionAction !== "release_prep_pack"
        && tokenBalance != null && tokenBalance <= 0) {
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
      const creatorResearchInput = parseCreatorSuppliedResearch(requestText);
      const urlsInRequest = creatorResearchInput.citations
        .flatMap((citation) => citation.normalizedUrl ? [citation.normalizedUrl] : []);
      const textWithoutUrls = creatorResearchInput.textWithoutCitations;
      const researchIntentText = stripHearthInternalRequestInstructions(textWithoutUrls || requestText);
      const linkModeRequested = creatorResearchInput.citations.length > 0;
      // Production commands are version-scoped transformations of the approved
      // script. Words such as "source" in their strict output contract must not
      // route them through research or prepend a research outcome envelope.
      const researchModeRequested = turnDecision.mode === "research";
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
      // The general router currently returns the legacy model union, while the
      // owner-funded path can replace it with one exact server-approved model.
      let model: string = aiRoute.model;
      const reasoningEffort = aiRoute.reasoning;
      if (!ALLOWED_CHAT_MODELS.has(model)) {
        return jsonResponse(503, {
          ok: false,
          error: `Routed model '${model}' is not allowlisted for Forge lane.`,
          code: "model_not_allowlisted",
          ...buildBillingSnapshot(lane),
        });
      }
      // Recovery consumes only the original canonical result. Never repeat
      // search/extraction to reconstruct an expired synthesis request.
      const researchExecutionRequirement = researchModeRequested && openAiTextGate
        ? ownerResearchRequirement
          ? { data: ownerResearchRequirement, error: null }
          : await openAiTextGate.rpc("read_openai_execution_requirement", {
            p_route_code: "hearth.research_synthesis",
            p_credential_funding: resolvedCredentials.keySource === "user_byo" ? "byo_customer" : "forge",
          }) : null;
      const researchExecutionMode = isRecord(researchExecutionRequirement?.data) ? researchExecutionRequirement.data.mode : null;
      if (researchModeRequested && researchExecutionMode === "halt_new" && paidExecutionHandle && openAiTextGate && userId) {
        try {
          const recovered = await executePaidOpenAiTextRoute({
            recoveryOnly: true, gate: ownerResearchRequirement
              ? withOwnerFundingEnvironment(ownerHearthResearchExecutionGate(openAiTextGate))
              : openAiTextGate, routeCode: "hearth.research_synthesis",
            handle: paidExecutionHandle, userId, workspaceId: episodeContext.workspaceId,
            workpieceId: episodeContext.episodeId, credentialSource: resolvedCredentials.keySource,
            requestFingerprintPayload: null,
            executeProvider: async () => { throw new Error("recovery_cannot_submit"); },
            validateResult: () => { throw new Error("recovery_cannot_generate"); },
            persistCanonical: async () => { throw new Error("recovery_cannot_generate"); },
            recoverCanonical: async () => {
              const row = await openAiTextGate.rpc(ownerResearchRequirement
                ? "read_owner_hearth_research_result"
                : "read_hearth_research_synthesis_result", {
                p_operation_id: paidExecutionHandle!.operationId, p_reservation_id: paidExecutionHandle!.reservationId,
              });
              if (row.error || !isRecord(row.data)) return null;
              return { result: row.data, providerRequestId: readOptionalString(row.data.provider_request_id),
                inputUnits: Number(row.data.input_units), outputUnits: Number(row.data.output_units) };
            },
          });
          if (recovered.state === "settled" || recovered.state === "settled_replay") {
            return jsonResponse(200, { ok: true, ...recovered.result, reply: recovered.result.assistant_text,
              billing_receipt: { operation_id: paidExecutionHandle.operationId, status: recovered.state,
                customer_charge_micros: recovered.customerChargeMicros } });
          }
          return jsonResponse(409, { ok: false, code: "operation_reconciliation_required",
            error: "The original operation is unresolved. No provider request was repeated." });
        } catch {
          return jsonResponse(409, { ok: false, code: "recovery_unavailable",
            error: "Recovery requires original captured evidence and current workspace access. No provider request was repeated." });
        }
      }
      if (researchModeRequested && !openAiTextGate && configuredOpenAiTextMode() !== "inactive") {
        return jsonResponse(503, { ok: false, code: "paid_execution_control_unavailable",
          error: "Research execution controls are unavailable." });
      }
      // Search/extraction is a distinct supporting service. An accepted text
      // quote never authorizes it implicitly. No research adapter may run
      // without the complete owner-research pricing and execution authority.
      if (researchModeRequested && openAiTextGate && !ownerResearchRequirement
        && effectiveLane === AI_USAGE_LANE.BYO) {
        const earlyRequirement = researchExecutionRequirement!;
        const earlyRow = isRecord(earlyRequirement.data)
          ? earlyRequirement.data
          : {};
        const unavailableReason = earlyRequirement.error
          ? "Research pricing and execution authority could not be verified."
          : earlyRow.funding_context_required === true
            ? "Research search and extraction are not included in this text authorization."
            : "Research search and extraction have no active pricing and execution authority.";
        return jsonResponse(422, {
          ok: false,
          error: `${unavailableReason} No provider request was sent.`,
          code: "supporting_service_not_priced",
          turn_result: buildTurnResult({
            assistantMessage: "",
            failureKind: "admission_failure",
            failureMessage: `${unavailableReason} No provider request was sent.`,
          }),
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
      let ownerResearchPlan: OwnerResearchPlan | null = null;
      let customerResearchPlan: CustomerResearchPlan | null = null;
      let ownerResearchDeadlineAt: number | null = null;
      let customerResearchDeadlineAt: number | null = null;
      let ownerResearchMaximumOutputTokens: number | null = null;
      let ownerResearchFetch: typeof fetch | undefined;
      let ownerResearchCostSession: OwnerHearthResearchCostSession | null = null;
      let currentOwnerFinancialEnvironment: OwnerFinancialEnvironment | null = null;
      if (researchModeRequested && ownerResearchRequirement) {
        if (!ownerResearchApiKey) {
          return jsonResponse(503, {
            ok: false,
            error: "Owner-funded research search is unavailable because its isolated Brave credential is not configured.",
            code: "owner_research_search_unavailable",
            ...buildBillingSnapshot(lane),
          });
        }
        if (!researchBrief || !researchRequest || !userId || !ownerCostGate
          || !ownerExecutionCoordinator || !isUuid(episodeContext.workspaceId)) {
          return jsonResponse(422, {
            ok: false,
            error: "Owner-funded research requires a complete workspace-bound research plan.",
            code: "owner_research_plan_incomplete",
            ...buildBillingSnapshot(lane),
          });
        }
        ownerResearchPlan = buildOwnerResearchPlan({
          workspaceId: episodeContext.workspaceId,
          workpieceId: episodeContext.episodeId,
          userAuthoredText: requestText,
          query: researchRequest.query,
          briefFingerprint: researchBrief.briefFingerprint,
          requestedModel,
          limitProfile: "creator_session",
        });
        currentOwnerFinancialEnvironment = await ownerFinancialEnvironment(ownerCostGate);
        model = HEARTH_OWNER_TEXT_MODEL;
        ownerResearchMaximumOutputTokens = ownerResearchPlan.maximum_output_tokens;
        ownerResearchDeadlineAt = Date.now() + OWNER_RESEARCH_DEADLINE_MS;
        ownerResearchCostSession = createOwnerHearthResearchCostSession({
          coordinator: ownerExecutionCoordinator,
          authenticatedUserId: userId,
          workspaceId: episodeContext.workspaceId,
          workpieceId: episodeContext.episodeId,
          operationIntentId: chatActionId,
          financialEnvironment: currentOwnerFinancialEnvironment,
          runtimeEnvironment: ownerRuntimeEnvironment(),
          braveCredential: ownerResearchApiKey,
          plan: ownerResearchPlan,
          providerFetch: config.openAiProviderFetch,
        });
        ownerResearchFetch = ownerResearchCostSession.fetch;
      }
      if (productionAction === "seo") model = HEARTH_TITLE_MODEL;
      if (productionAction === "tags") model = HEARTH_TAG_MODEL;
      if (productionAction === "release_prep_pack") model = HEARTH_FRAMING_PACK_MODEL;
      if (researchModeRequested && !ownerResearchRequirement
        && effectiveLane === AI_USAGE_LANE.FORGE) {
        if (!researchBrief || !researchRequest || !userId || !bearerToken
          || !openAiTextGate || !isUuid(episodeContext.workspaceId)) {
          return jsonResponse(422, {
            ok: false,
            error: "Hearth research requires a complete workspace-bound plan.",
            code: "customer_research_plan_incomplete",
            ...buildBillingSnapshot(lane),
          });
        }
        customerResearchPlan = buildCustomerResearchPlan({
          workspaceId: episodeContext.workspaceId,
          workpieceId: episodeContext.episodeId,
          userAuthoredText: requestText,
          query: researchRequest.query,
        });
        const planFingerprint = fingerprintCustomerResearchPlan(customerResearchPlan);
        const operationId = deriveHearthCustomerPaidIdentifiers({
          userId,
          workspaceId: episodeContext.workspaceId,
          requestFingerprint: planFingerprint,
        }).operationId;
        try {
          paidExecutionHandle = await resolveOrdinaryOpenAiTextFunding({
            routeCode: "hearth.research_synthesis",
            operationId,
            userId,
            workspaceId: episodeContext.workspaceId,
            workpieceId: episodeContext.episodeId,
            requestFingerprint: planFingerprint,
            model: CUSTOMER_RESEARCH_MODEL,
            credentialFunding: "forge",
            acceptance: spendingAcceptance,
            serviceGate: openAiTextGate,
            deferProviderRequestBinding: true,
            userGate: {
              rpc: async (name, payload) => {
                const result = await callUserScopedTongsRpc({
                  accessToken: bearerToken,
                  fn: name,
                  payload,
                });
                return result.ok
                  ? { data: result.data, error: null }
                  : { data: null, error: { message: result.error } };
              },
            },
          });
        } catch (error) {
          if (error instanceof OpenAiTextQuoteRequiredError) {
            return jsonResponse(error.quote.fundingEligible ? 409 : 402, {
              ok: false,
              error: error.quote.fundingEligible
                ? `Current verification requires Research with Hearth. Review and accept up to ${CUSTOMER_RESEARCH_CREDITS} Forge Credits before search begins.`
                : "Not enough Forge Credits are available for this research operation.",
              code: error.quote.fundingEligible
                ? "hearth_spending_confirmation_required"
                : "hearth_insufficient_verified_funds",
              billing_quote: {
                quote_id: error.quote.quoteId,
                operation_id: error.quote.operationId,
                quote_hash: error.quote.quoteHash,
                request_fingerprint: error.quote.requestFingerprint,
                credit_charge: error.quote.customerCreditUnits,
                failure_terms: error.quote.failureTerms,
                funding_eligible: error.quote.fundingEligible,
                funding_label: error.quote.fundingLabel,
                model_display_name: "Hearth Research",
                model_tradeoff_summary: "Current sources with bounded evidence synthesis.",
                expires_at: error.quote.expiresAt,
              },
              ...buildBillingSnapshot(lane),
            });
          }
          if (error instanceof OpenAiTextFundingPreparationError) {
            return jsonResponse(error.status, {
              ok: false,
              error: error.message,
              code: error.code,
              ...error.details,
              ...buildBillingSnapshot(lane),
            });
          }
          throw error;
        }
        if (!paidExecutionHandle) {
          return jsonResponse(503, {
            ok: false,
            error: "Hearth research pricing is not active.",
            code: "customer_research_unavailable",
            ...buildBillingSnapshot(lane),
          });
        }
        const settledReplay = await readSettledOpenAiTextRouteReplay({
          gate: openAiTextGate,
          routeCode: "hearth.research_synthesis",
          handle: paidExecutionHandle,
          userId,
          workspaceId: episodeContext.workspaceId,
          workpieceId: episodeContext.episodeId,
          credentialSource: resolvedCredentials.keySource,
          requestFingerprintPayload: customerResearchPlan,
        });
        if (settledReplay) {
          const replayResult = settledReplay.result;
          const assistantText = readOptionalString(replayResult.assistant_text) ?? "";
          const replayResearchResult = isRecord(replayResult.research_result)
            ? replayResult.research_result
            : null;
          const billingReceipt = {
            operation_id: settledReplay.context.operationId,
            reservation_id: settledReplay.context.reservationId,
            status: settledReplay.state,
            funding_source: settledReplay.context.fundingSourceType,
            customer_charge_micros: settledReplay.customerChargeMicros,
            provider_request_id: settledReplay.requestId,
          };
          return jsonResponse(200, {
            ok: true,
            ...replayResult,
            reply: assistantText,
            turn_result: buildTurnResult({
              assistantMessage: assistantText,
              artifact: replayResearchResult && isRecord(replayResearchResult.artifact)
                ? { kind: "research", value: replayResearchResult as unknown as HearthResearchResult }
                : null,
              operations: normalizeOps(replayResult.ops),
            }),
            billing_receipt: billingReceipt,
            ...buildBillingSnapshot(lane),
          });
        }
        model = CUSTOMER_RESEARCH_MODEL;
        customerResearchDeadlineAt = Date.now() + OWNER_RESEARCH_DEADLINE_MS;
        ownerResearchFetch = createCustomerHearthResearchFetch({
          gate: openAiTextGate,
          handle: paidExecutionHandle,
          deadlineAt: customerResearchDeadlineAt,
          plan: customerResearchPlan,
        });
      }
      let researchResult: HearthResearchResult | null = null;
      if (linkModeRequested) {
        const linkSources = await Promise.all(
          creatorResearchInput.citations.map((citation, index) => (
            citation.normalizedUrl
              ? researchSourceExtractor({
                  url: citation.normalizedUrl,
                  sourceId: `link-${index + 1}`,
                  brief: researchBrief!,
                  signal: request.signal,
                  fetchImpl: ownerResearchFetch,
                })
              : Promise.resolve(buildMalformedCreatorCitationSource({
                  citation,
                  sourceId: `link-${index + 1}`,
                  brief: researchBrief!,
                }))
          )),
        );
        researchResult = buildLinkOnlyResearchResult({
          sources: linkSources,
          brief: researchBrief!,
          creatorClaims: creatorResearchInput.claims,
          creatorEntities: creatorResearchInput.entities,
          creatorInputTruncated: creatorResearchInput.appearsTruncated,
        });
      } else if (researchRequest && researchBrief) {
        try {
          researchResult = await (ownerResearchRequirement ? ownerResearchRuntime : researchRuntime).run({
            request: researchRequest,
            brief: researchBrief,
            signal: request.signal,
            fetchImpl: ownerResearchFetch,
          });
        } catch (error) {
          if (error instanceof OwnerResearchSubmissionUnknownError) {
            return jsonResponse(409, {
              ok: false,
              error: "A research supplier submission is unresolved. No request was repeated.",
              code: "operation_reconciliation_required",
              ...buildBillingSnapshot(lane),
            });
          }
          if (customerResearchPlan && paidExecutionHandle && openAiTextGate) {
            await settleCustomerHearthResearchBeforeSynthesis({
              gate: openAiTextGate,
              reservationId: paidExecutionHandle.reservationId,
              failureClass: "research_retrieval_failed",
              evidence: { error: error instanceof Error ? error.message : String(error) },
            });
            const safeMessage = "I couldn't verify current information right now. No Forge Credits were charged. I can still offer general background, but it would not be current verification.";
            return jsonResponse(503, {
              ok: false,
              error: safeMessage,
              code: "current_verification_unavailable",
              turn_result: buildTurnResult({
                assistantMessage: "",
                failureKind: "provider_failure",
                failureMessage: safeMessage,
              }),
              ...buildBillingSnapshot(lane),
            });
          }
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
      if (ownerResearchRequirement && !hasSufficientCustomerResearchEvidence(researchResult)) {
        return jsonResponse(503, {
          ok: false,
          error: "Hearth could not retain sufficient current research evidence. Completed provider attempts remain recorded; synthesis was not submitted.",
          code: "owner_research_evidence_insufficient",
          ...buildBillingSnapshot(lane),
        });
      }
      if (customerResearchPlan && paidExecutionHandle && openAiTextGate
        && !hasSufficientCustomerResearchEvidence(researchResult)) {
        await settleCustomerHearthResearchBeforeSynthesis({
          gate: openAiTextGate,
          reservationId: paidExecutionHandle.reservationId,
          failureClass: "research_no_verifiable_sources",
          evidence: {
            runtime_status: researchResult?.runtimeStatus ?? "missing",
            source_count: researchResult?.sources.length ?? 0,
            inspected_evidence_count: (researchResult?.evidence ?? []).filter((entry) => (
              entry.state === "inspected" && Boolean(entry.excerpt?.trim())
            )).length,
          },
        });
        const safeMessage = "I couldn't verify current information right now. No Forge Credits were charged. I can still offer general background, but it would not be current verification.";
        return jsonResponse(503, {
          ok: false,
          error: safeMessage,
          code: "current_verification_unavailable",
          turn_result: buildTurnResult({
            assistantMessage: "",
            failureKind: "provider_failure",
            failureMessage: safeMessage,
          }),
          ...buildBillingSnapshot(lane),
        });
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
        const researchArtifact: HearthValidatedArtifact | null = researchResult.artifact
          ? { kind: "research", value: researchResult }
          : null;
        return jsonResponse(200, {
          ok: true,
          assistant_text: assistantText,
          reply: assistantText,
          ops: [],
          script_text: null,
          tag_audit: null,
          research_result: researchResult,
          turn_result: buildTurnResult({
            assistantMessage: assistantText,
            artifact: researchArtifact,
          }),
          total_tokens: null,
          actual_cost_usd: 0,
          billable_tokens: 0,
          credits_warning: null,
          ...buildBillingSnapshot(lane),
        });
      }
      const readinessCheckRequested = turnDecision.mode === "readiness_review";
      const allowRepeatedReadinessNudge = requestedDeepReadinessReview(requestText);
      const framingPackRequested = isFramingPackProductionRequest(requestText);
      if (framingPackRequested && productionAction !== "release_prep_pack") {
        return admissionFailureResponse({
          status: 422,
          error: "Generate Framing Pack is available only from the explicit production action.",
          code: "framing_pack_dedicated_action_required",
        });
      }
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
          turn_result: buildTurnResult({ assistantMessage: clarifyReply }),
          total_tokens: 0,
          gate: "clarify",
          ...buildBillingSnapshot(lane),
        });
      }

      const workspaceContextRequested = turnDecision.retrievalScope === "explicit_cross_episode";
      const crossProjectRequested = turnDecision.retrievalScope === "explicit_cross_episode";

      const styleGuidanceSections = framingPackRequested
        ? []
        : [
          buildProfileStyleSnippet(
            creatorProfile,
            writingProfile,
            requestText,
            episodeContext.tonePreset,
            turnDecision,
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
            decision: turnDecision,
            outputPreference,
            readinessCheck: readinessCheckRequested,
            allowRepeatedReadinessNudge,
            priorReadinessNudge,
            researchMode: researchModeRequested,
            researchRequest,
            researchResult,
            attachmentContextSnippet,
            listeningTurn: turnDecision.mode === "listening",
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
        const boundedLatestUserMessage = latestUserMessage ?? { role: "user", content: requestText };
        const scriptGenerationRequested = turnDecision.mode === "script_generate";
        const titleGenerationRequested = productionAction === "seo";
        const tagGenerationRequested = productionAction === "tags";
        const framingPackGenerationRequested = productionAction === "release_prep_pack";
        const thumbnailDirectionGenerationRequested = productionAction === "thumbnails";
        const approvedScriptProductName = thumbnailDirectionGenerationRequested
          ? "Thumbnail Directions"
          : framingPackGenerationRequested
          ? "Framing Pack"
          : tagGenerationRequested ? "Tags" : "Titles";
        const approvedScriptProductCode = thumbnailDirectionGenerationRequested
          ? "thumbnail_direction"
          : framingPackGenerationRequested
          ? "framing_pack"
          : tagGenerationRequested ? "tag" : "title";
        let canonicalScriptResearchRows: Array<Record<string, unknown>> = [];
        if (scriptGenerationRequested && supabaseService && episodeContext.workspaceId) {
          const researchStore = supabaseService.schema("tongs") as unknown as {
            from: (table: string) => {
              select: (columns: string) => {
                eq: (column: string, value: unknown) => {
                  eq: (nextColumn: string, nextValue: unknown) => {
                    eq: (thirdColumn: string, thirdValue: unknown) => {
                      order: (field: string, options: { ascending: boolean }) => {
                        limit: (count: number) => Promise<{
                          data: Array<Record<string, unknown>> | null;
                          error: { message: string } | null;
                        }>;
                      };
                    };
                  };
                };
              };
            };
          };
          const retained = await researchStore
            .from("hearth_research_synthesis_results")
            .select("id,result_json,created_at")
            .eq("user_id", userId)
            .eq("workspace_id", episodeContext.workspaceId)
            .eq("workpiece_id", episodeContext.episodeId)
            .order("created_at", { ascending: false })
            .limit(3);
          if (retained.error) {
            return admissionFailureResponse({
              status: 503,
              error: "Hearth could not load the retained active-episode research needed for this script proposal.",
              code: "hearth_script_context_unavailable",
            });
          }
          canonicalScriptResearchRows = retained.data ?? [];
        }
        let approvedTitleScript: ApprovedTitleScript | null = null;
        if (titleGenerationRequested || tagGenerationRequested || framingPackGenerationRequested || thumbnailDirectionGenerationRequested) {
          if (!userId || !isUuid(episodeContext.workspaceId)
            || (!ownerHearthRequirement && resolvedCredentials.keySource !== "forge_managed")) {
            return admissionFailureResponse({ status: 422, error: `Generate ${approvedScriptProductName} requires an authorized Forge-funded customer scope.`, code: `${approvedScriptProductCode}_customer_scope_required` });
          }
          try {
            approvedTitleScript = await readCanonicalTitleApproval(episodeContext.workspaceId, episodeContext.episodeId);
          } catch {
            return admissionFailureResponse({ status: 503, error: "Canonical script approval is unavailable.", code: `${approvedScriptProductCode}_approval_unavailable` });
          }
          // The shared episode normalizer trims text fields. Approval hashes cover the
          // exact script bytes, including trailing newlines, so compare the raw body.
          const submittedTitleScript = bodyRaw.episode_context
            && typeof bodyRaw.episode_context === "object"
            && !Array.isArray(bodyRaw.episode_context)
            ? (bodyRaw.episode_context as Record<string, unknown>).body
            : null;
          if (!approvedTitleScript || productionScriptVersion !== approvedTitleScript.approvalRevision
            || !approvedTitleScript.scriptText.trim()
            || await hashApprovedTitleScript(approvedTitleScript.scriptText) !== approvedTitleScript.scriptHash
            || typeof submittedTitleScript !== "string"
            || await hashApprovedTitleScript(submittedTitleScript) !== approvedTitleScript.scriptHash) {
            return admissionFailureResponse({ status: 409, error: `The current approved script changed. Reload Hearth before generating ${approvedScriptProductName.toLowerCase()}.`, code: `${approvedScriptProductCode}_approval_stale` });
          }
        }
        if (tagGenerationRequested && !isUuid(providedChatActionId)) {
          return admissionFailureResponse({
            status: 422,
            error: "Generate Tags requires a stable action ID for a fresh quote and its accepted retry.",
            code: "tag_action_id_required",
          });
        }
        if (framingPackGenerationRequested && !isUuid(providedChatActionId)) {
          return admissionFailureResponse({
            status: 422,
            error: "Generate Framing Pack requires a stable action ID for a fresh quote and its accepted retry.",
            code: "framing_pack_action_id_required",
          });
        }
        if (thumbnailDirectionGenerationRequested && !isUuid(providedChatActionId)) {
          return admissionFailureResponse({
            status: 422,
            error: "Create Thumbnail Directions requires a stable action ID for a fresh quote and its accepted retry.",
            code: "thumbnail_direction_action_id_required",
          });
        }
        let thumbnailDirectionInput: PaidThumbnailDirectionInput | null = null;
        if (thumbnailDirectionGenerationRequested && approvedTitleScript) {
          try {
            thumbnailDirectionInput = await (config.readThumbnailDirectionInput ?? readCanonicalThumbnailDirectionInput)(
              episodeContext.workspaceId!, episodeContext.episodeId, approvedTitleScript,
            );
          } catch {
            return admissionFailureResponse({ status: 503, error: "Canonical Thumbnail V3 planning authority is unavailable.", code: "thumbnail_direction_authority_unavailable" });
          }
          if (!thumbnailDirectionInput) {
            return admissionFailureResponse({ status: 409, error: "Three canonical title choices are required before creating thumbnail directions.", code: "thumbnail_direction_titles_unavailable" });
          }
        }
        let titleContractVersion: HearthTitleContractVersion = 2;
        let historicalTitleV2Identity = false;
        if (titleGenerationRequested && approvedTitleScript && (spendingAcceptance || paidExecutionHandle)) {
          const priorFingerprint = spendingAcceptance?.requestFingerprint ?? paidExecutionHandle?.requestFingerprint;
          const legacyFingerprint = await fingerprintOpenAiTextPaidRequest(paidTitleFingerprintPayload({
            userId: userId!, workspaceId: episodeContext.workspaceId!,
            workpieceId: episodeContext.episodeId, approved: approvedTitleScript,
            contractVersion: 1,
          }));
          if (priorFingerprint === legacyFingerprint) {
            titleContractVersion = 1;
          } else {
            const historicalV2Fingerprint = await fingerprintOpenAiTextPaidRequest(paidTitleFingerprintPayload({
              userId: userId!, workspaceId: episodeContext.workspaceId!,
              workpieceId: episodeContext.episodeId, approved: approvedTitleScript,
              contractVersion: 2,
            }));
            historicalTitleV2Identity = priorFingerprint === historicalV2Fingerprint;
          }
        }
        if (titleGenerationRequested && titleContractVersion === 2
          && !historicalTitleV2Identity && !isUuid(providedChatActionId)) {
          return admissionFailureResponse({
            status: 422,
            error: "Generate Titles requires a stable action ID for a fresh quote and its accepted retry.",
            code: "title_action_id_required",
          });
        }
        if (titleGenerationRequested && titleContractVersion === 2) {
          // A running dev server may load this code before the forward migration.
          // Fail before quoting or authorizing a provider attempt in that window.
          const contractReadback = openAiTextGate
            ? await openAiTextGate.rpc("read_hearth_title_generation_contract_version", {})
            : null;
          if (contractReadback?.error || Number(contractReadback?.data) !== 2) {
            return admissionFailureResponse({
              status: 503,
              error: "The updated Generate Titles contract is not yet available. Please try again after the database update.",
              code: "title_contract_migration_required",
            });
          }
        }
        const paidCompletionMessages: ChatMessage[] = thumbnailDirectionGenerationRequested && thumbnailDirectionInput
          ? buildPaidThumbnailDirectionMessages(thumbnailDirectionInput)
          : framingPackGenerationRequested && approvedTitleScript
          ? buildPaidFramingPackMessages(approvedTitleScript)
          : tagGenerationRequested && approvedTitleScript
          ? buildPaidTagMessages(approvedTitleScript)
          : titleGenerationRequested && approvedTitleScript
          ? buildPaidTitleMessages(approvedTitleScript, titleContractVersion)
          : turnDecision.mode === "conversation"
          ? buildPaidHearthConversationMessages({
              episodeContext,
              messages,
              latestUserMessage: boundedLatestUserMessage,
            })
          : scriptGenerationRequested
            ? buildPaidHearthScriptGenerationMessages({
                episodeContext,
                messages,
                latestUserMessage: boundedLatestUserMessage,
                canonicalResearchRows: canonicalScriptResearchRows,
              })
          : [
              {
                role: "system",
                content: [
                  "You are Hearth, a concise podcast writing collaborator.",
                  "Answer only the creator's bounded request.",
                  "Do not browse, call tools, purchase assets, or claim work you did not perform.",
                  "Return plain text or the existing Hearth JSON reply shape.",
                ].join(" "),
              },
              boundedLatestUserMessage,
            ];
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
            textRouteCode: researchModeRequested ? "hearth.research_synthesis" : "hearth.chat_completion",
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

        const paidRouteCode: OpenAiTextRouteCode = thumbnailDirectionGenerationRequested
          ? HEARTH_THUMBNAIL_DIRECTION_ROUTE
          : framingPackGenerationRequested
          ? HEARTH_FRAMING_PACK_ROUTE
          : tagGenerationRequested
          ? HEARTH_TAG_ROUTE
          : titleGenerationRequested
          ? HEARTH_TITLE_ROUTE
          : researchModeRequested
          ? "hearth.research_synthesis"
          : scriptGenerationRequested
            ? "hearth.script_generation"
          : "hearth.chat_completion";
        const paidScopeEligible = ((titleGenerationRequested || tagGenerationRequested || framingPackGenerationRequested || thumbnailDirectionGenerationRequested) && Boolean(approvedTitleScript)
          || !productionAction)
          && !attachmentContext.includeEpisodeAttachments
          && !readinessCheckRequested
          && !crossProjectReference.detected
          && ((paidRouteCode === HEARTH_TITLE_ROUTE || paidRouteCode === HEARTH_TAG_ROUTE || paidRouteCode === HEARTH_FRAMING_PACK_ROUTE || paidRouteCode === HEARTH_THUMBNAIL_DIRECTION_ROUTE)
            || (paidRouteCode === "hearth.chat_completion"
            && !["outline_generate", "script_mutate"].includes(turnDecision.mode))
            || paidRouteCode === "hearth.script_generation"
            || (paidRouteCode === "hearth.research_synthesis" && Boolean(researchResult)
              && (Boolean(ownerResearchRequirement) || Boolean(customerResearchPlan) || linkModeRequested)));
        const paidFingerprintPayload = paidRouteCode === HEARTH_THUMBNAIL_DIRECTION_ROUTE && thumbnailDirectionInput
          ? paidThumbnailDirectionFingerprintPayload({
              userId: userId!, workspaceId: episodeContext.workspaceId!,
              workpieceId: episodeContext.episodeId, operationIntentId: chatActionId,
              input: thumbnailDirectionInput,
            })
          : paidRouteCode === HEARTH_FRAMING_PACK_ROUTE && approvedTitleScript
          ? paidFramingPackFingerprintPayload({
              userId: userId!, workspaceId: episodeContext.workspaceId!,
              workpieceId: episodeContext.episodeId, approved: approvedTitleScript,
              operationIntentId: chatActionId,
            })
          : paidRouteCode === HEARTH_TAG_ROUTE && approvedTitleScript
          ? paidTagFingerprintPayload({
              userId: userId!, workspaceId: episodeContext.workspaceId!,
              workpieceId: episodeContext.episodeId, approved: approvedTitleScript,
              operationIntentId: chatActionId,
            })
          : paidRouteCode === HEARTH_TITLE_ROUTE && approvedTitleScript
          ? paidTitleFingerprintPayload({
              userId: userId!, workspaceId: episodeContext.workspaceId!,
              workpieceId: episodeContext.episodeId, approved: approvedTitleScript,
              contractVersion: titleContractVersion,
              operationIntentId: historicalTitleV2Identity ? undefined : chatActionId,
            })
          : paidRouteCode === "hearth.chat_completion"
          ? {
              schema: "forge.hearth.paid-chat-request.v1",
              route_code: "hearth.chat_completion",
              workspace_id: episodeContext.workspaceId,
              workpiece_id: episodeContext.episodeId,
              lane: effectiveLane,
              messages,
              user_authored_text: requestText,
              behavior: bodyRaw.behavior ?? null,
            }
          : paidRouteCode === "hearth.script_generation"
            ? {
                schema: "forge.hearth.script-generation.paid.v1",
                route_code: "hearth.script_generation",
                workspace_id: episodeContext.workspaceId,
                workpiece_id: episodeContext.episodeId,
                lane: effectiveLane,
                messages: paidCompletionMessages,
                user_authored_text: requestText,
                output_contract: "immutable_script_proposal.v1",
                browsing_requests: 0,
                retrieval_requests: 0,
                model: "gpt-5.6-luna",
              }
            : ownerResearchPlan ?? customerResearchPlan ?? {
              schema: "forge.hearth.research-synthesis.paid.v1",
              route_code: "hearth.research_synthesis",
              workspace_id: episodeContext.workspaceId,
              workpiece_id: episodeContext.episodeId,
              lane: effectiveLane,
              user_authored_text: requestText,
              // Retrieval timestamps are observation metadata, not creator input.
              // Excluding them keeps quote acceptance stable when the exact
              // supplied source is re-extracted during the accepted retry.
              creator_supplied_sources: (researchResult?.sources ?? []).map((source) => {
                const stableSource: Record<string, unknown> = { ...source };
                delete stableSource.retrievedAt;
                return stableSource;
              }),
              supporting_paid_services: [],
              model,
            };
        const actualRequestFingerprint = paidRouteCode === "hearth.chat_completion"
          ? fingerprintPaidHearthChatRequest(paidFingerprintPayload)
          : customerResearchPlan
            ? fingerprintCustomerResearchPlan(customerResearchPlan)
            : await fingerprintOpenAiTextPaidRequest(paidFingerprintPayload);
        if (ownerHearthRequirement || ownerResearchRequirement) {
          if (!ownerExecutionCoordinator || !ownerCostGate || !userId
            || !isUuid(episodeContext.workspaceId)) {
            return admissionFailureResponse({ status: 503, error: "Owner execution authority is unavailable.", code: "owner_hearth_control_unavailable" });
          }
          if (!paidScopeEligible) {
            return admissionFailureResponse({ status: 422, error: "This Hearth action is outside the owner text execution scope.", code: "owner_hearth_scope_mismatch" });
          }
          if (paidRouteCode === HEARTH_THUMBNAIL_DIRECTION_ROUTE) {
            return admissionFailureResponse({
              status: 503,
              error: "Owner Thumbnail Directions remain disabled because canonical finalization still requires customer reservation authority.",
              code: "owner_thumbnail_direction_authority_unavailable",
            });
          }
          const ownerCredential = ownerResearchRequirement ? ownerResearchTextApiKey : ownerTextApiKey;
          if (!ownerCredential) {
            return admissionFailureResponse({ status: 503, error: "The isolated Hearth owner OpenAI credential is unavailable.", code: "owner_hearth_runtime_unavailable" });
          }
          currentOwnerFinancialEnvironment ??= await ownerFinancialEnvironment(ownerCostGate);
          const ownerRoute = paidRouteCode as OwnerHearthTextRoute;
          const approval = approvedTitleScript && [HEARTH_TITLE_ROUTE, HEARTH_TAG_ROUTE, HEARTH_FRAMING_PACK_ROUTE].includes(ownerRoute)
            ? { id: approvedTitleScript.approvalId, revision: approvedTitleScript.approvalRevision, scriptContentHash: approvedTitleScript.scriptHash }
            : null;
          const providerMessages = ownerRoute === "hearth.research_synthesis" ? completionMessages : paidCompletionMessages;
          const providerBody: Record<string, unknown> = {
            model: HEARTH_OWNER_TEXT_MODEL,
            messages: providerMessages,
            ...([HEARTH_TITLE_ROUTE, HEARTH_TAG_ROUTE, HEARTH_FRAMING_PACK_ROUTE].includes(ownerRoute)
              ? { reasoning_effort: "none" }
              : {}),
            ...(ownerRoute === "hearth.research_synthesis" && ownerResearchMaximumOutputTokens
              ? { max_completion_tokens: ownerResearchMaximumOutputTokens }
              : {}),
          };
          const parseOwnerResult = (providerPayload: Record<string, unknown>): Record<string, unknown> => {
            if (ownerRoute === HEARTH_TITLE_ROUTE && approvedTitleScript) {
              const output = validatePaidTitleOutput(extractAssistantReply(providerPayload), titleContractVersion);
              if (!output.ok) throw new Error(output.error);
              return { assistant_text: output.text, titles: output.titles,
                contract: titleContractVersion === 1 ? HEARTH_TITLE_CONTRACT_V1 : HEARTH_TITLE_CONTRACT,
                script_approval_id: approvedTitleScript.approvalId, script_approval_revision: approvedTitleScript.approvalRevision,
                script_content_hash: approvedTitleScript.scriptHash };
            }
            if (ownerRoute === HEARTH_TAG_ROUTE && approvedTitleScript) {
              const output = validatePaidTagOutput(extractAssistantReply(providerPayload));
              if (!output.ok) throw new Error(output.error);
              return { assistant_text: output.text, tags: output.tags, contract: HEARTH_TAG_CONTRACT,
                script_approval_id: approvedTitleScript.approvalId, script_approval_revision: approvedTitleScript.approvalRevision,
                script_content_hash: approvedTitleScript.scriptHash };
            }
            if (ownerRoute === HEARTH_FRAMING_PACK_ROUTE && approvedTitleScript) {
              const output = validatePaidFramingPackOutput(extractAssistantReply(providerPayload));
              if (!output.ok) throw new Error(output.error);
              return { assistant_text: output.text, sections: output.sections, contract: HEARTH_FRAMING_PACK_CONTRACT,
                output_contract: HEARTH_FRAMING_PACK_OUTPUT_CONTRACT,
                script_approval_id: approvedTitleScript.approvalId, script_approval_revision: approvedTitleScript.approvalRevision,
                script_content_hash: approvedTitleScript.scriptHash };
            }
            if (ownerRoute === "hearth.script_generation") {
              const rawReply = extractAssistantReply(providerPayload);
              const structured = rawReply ? normalizeStructuredReply(rawReply) : null;
              if (!structured) throw new Error("Script generation returned no valid Hearth artifact.");
              structured.ops = filterHearthOperationsForDecision(turnDecision, structured.ops);
              const validation = validateHearthCompositionArtifact({ requestKind: "script", assistantText: structured.assistantText, ops: structured.ops });
              const bodyOps = structured.ops.filter((op) => op.op === "set_body");
              const body = bodyOps[0]?.op === "set_body" ? bodyOps[0].value : null;
              if (!validation.ok || !structured.scriptText || bodyOps.length !== 1 || body !== structured.scriptText || !structured.tagAudit) {
                throw new Error(validation.error ?? "Script generation failed the strict immutable-proposal contract.");
              }
              return { assistant_text: sanitizeHearthUserFacingOutput(structured.assistantText), ops: bodyOps,
                script_text: structured.scriptText, tag_audit: structured.tagAudit, research_artifact: null };
            }
            const rawReply = extractAssistantReply(providerPayload);
            if (!rawReply) throw new Error("OpenAI returned no usable Hearth result.");
            const structured = normalizeStructuredReply(rawReply) ?? { assistantText: rawReply, ops: [], scriptText: null, tagAudit: null, researchArtifact: null };
            structured.assistantText = sanitizeHearthUserFacingOutput(enforceHearthEditorialHonesty({ assistantText: structured.assistantText, requestText }));
            if (ownerRoute === "hearth.research_synthesis") {
              if (!structured.assistantText.trim()) throw new Error("Research synthesis was empty.");
              return { assistant_text: structured.assistantText, ops: structured.ops, script_text: structured.scriptText,
                tag_audit: structured.tagAudit, research_result: researchResult as unknown as Record<string, unknown> };
            }
            const compositionValidation = validateHearthCompositionArtifact({ requestText, assistantText: structured.assistantText, ops: structured.ops });
            if (!compositionValidation.ok || (!structured.assistantText && structured.ops.length === 0)) {
              throw new Error(compositionValidation.error ?? "Hearth composition validation failed");
            }
            return { assistantText: structured.assistantText, ops: structured.ops, scriptText: structured.scriptText, tagAudit: structured.tagAudit };
          };
          const ownerExecution = await executeOwnerHearthText({
            coordinator: ownerExecutionCoordinator,
            gate: ownerCostGate,
            authenticatedUserId: userId,
            workspaceId: episodeContext.workspaceId,
            workpieceId: episodeContext.episodeId,
            routeCode: ownerRoute,
            operationIntentId: chatActionId,
            financialEnvironment: currentOwnerFinancialEnvironment,
            runtimeEnvironment: ownerRuntimeEnvironment(),
            credential: ownerCredential,
            providerBody,
            logicalRequest: ownerRoute === "hearth.research_synthesis" ? ownerResearchPlan : paidFingerprintPayload,
            attemptNumber: ownerRoute === "hearth.research_synthesis" ? ownerResearchCostSession?.nextAttemptNumber() ?? 1 : 1,
            operationIdentity: ownerRoute === "hearth.research_synthesis" ? ownerResearchCostSession?.operationIdentity : undefined,
            approval,
            signal: upstreamAbort.signal,
            providerFetch: config.openAiProviderFetch,
            parseAndValidate: parseOwnerResult,
          });
          if (ownerExecution.state !== "succeeded") {
            return admissionFailureResponse({
              status: ownerExecution.state === "submission_unknown" ? 409 : 502,
              error: ownerExecution.state === "submission_unknown"
                ? "The owner provider submission is unresolved and was not retried."
                : "The owner provider definitively rejected the request.",
              code: ownerExecution.state === "submission_unknown" ? "operation_reconciliation_required" : "owner_provider_rejected",
            });
          }
          const result = ownerExecution.value.result;
          const assistantText = readOptionalString(result.assistant_text) ?? readOptionalString(result.assistantText) ?? "";
          const ownerReceipt = { authority: "owner_cost_provider_attempt", operation_id: ownerExecution.operationId,
            owner_cost_attempt_id: ownerExecution.attemptId, replay: ownerExecution.replay, customer_charge_micros: 0 };
          if (ownerRoute === "hearth.script_generation") {
            const scriptText = readOptionalString(result.script_text);
            const operations = normalizeOps(result.ops);
            return jsonResponse(200, { ok: true, ...result, reply: assistantText, proposal_state: "proposed", canonical_draft_applied: false,
              owner_execution_receipt: ownerReceipt,
              turn_result: buildTurnResult({ assistantMessage: assistantText, artifact: scriptText ? { kind: "script", text: scriptText } : null, operations }),
              ...buildBillingSnapshot(lane) });
          }
          if (ownerRoute === "hearth.research_synthesis") {
            return jsonResponse(200, { ok: true, ...result, reply: assistantText, owner_execution_receipt: ownerReceipt,
              turn_result: buildTurnResult({ assistantMessage: assistantText,
                artifact: researchResult?.artifact ? { kind: "research", value: researchResult } : null,
                operations: normalizeOps(result.ops) }), ...buildBillingSnapshot(lane) });
          }
          return jsonResponse(200, { ok: true, ...result, assistant_text: assistantText, reply: assistantText,
            owner_execution_receipt: ownerReceipt,
            turn_result: buildTurnResult({ assistantMessage: assistantText, operations: normalizeOps(result.ops) }),
            ...buildBillingSnapshot(lane) });
        }
        if ((paidRouteCode === HEARTH_TITLE_ROUTE || paidRouteCode === HEARTH_TAG_ROUTE || paidRouteCode === HEARTH_FRAMING_PACK_ROUTE || paidRouteCode === HEARTH_THUMBNAIL_DIRECTION_ROUTE) && spendingAcceptance
          && spendingAcceptance.requestFingerprint !== actualRequestFingerprint) {
          return admissionFailureResponse({
            status: 409,
            error: "This accepted production quote does not match the current request. Review a fresh quote.",
            code: "paid_request_fingerprint_mismatch",
          });
        }
        if (paidRouteCode === HEARTH_THUMBNAIL_DIRECTION_ROUTE && thumbnailDirectionInput
          && userId && episodeContext.workspaceId && bearerToken && supabaseService && openAiTextGate
          && !spendingAcceptance && !paidExecutionHandle) {
          let retained;
          try {
            retained = await readLatestStagedThumbnailDirectionResult({
              service: supabaseService,
              userId,
              workspaceId: episodeContext.workspaceId,
              workpieceId: episodeContext.episodeId,
            });
          } catch {
            return admissionFailureResponse({
              status: 503,
              error: "Hearth could not inspect retained Thumbnail Directions safely.",
              code: "thumbnail_direction_recovery_unavailable",
            });
          }
          if (retained) {
            try {
              const recovered = await commitAndFinalizeThumbnailDirections({
                requestUrl: request.url,
                workpieceId: episodeContext.episodeId,
                operationId: retained.operationId,
                reservationId: retained.reservationId,
                input: thumbnailDirectionInput,
                staged: retained.staged,
                gate: openAiTextGate,
                tongsApiToken,
                userAccessToken: bearerToken,
                fetchImpl: config.tongsFetch,
              });
              return jsonResponse(200, {
                ok: true,
                assistant_text: recovered.assistant_text,
                reply: recovered.assistant_text,
                script_approval_id: recovered.script_approval_id,
                script_approval_revision: recovered.script_approval_revision,
                script_content_hash: recovered.script_content_hash,
                thumbnail_direction_identity: {
                  operation_id: retained.operationId,
                  result_id: recovered.thumbnail_direction_result_id,
                  created_at: recovered.created_at,
                  style_authority: recovered.style_authority,
                  title_inputs: recovered.title_inputs,
                  thumbnail_planning_subtree_hash: recovered.thumbnail_planning_subtree_hash,
                  expected_active_strategy_id: recovered.expected_active_strategy_id,
                  expected_active_concept_set_id: recovered.expected_active_concept_set_id,
                },
                recovery_receipt: {
                  operation_id: retained.operationId,
                  reservation_id: retained.reservationId,
                  result_id: recovered.thumbnail_direction_result_id,
                  canonical_set_id: recovered.canonical_set_id,
                  canonical_source_response_hash: recovered.canonical_source_response_hash,
                  canonical_committed_at: recovered.canonical_committed_at,
                  replay: Boolean(retained.canonicalReceipt),
                  customer_charge_micros: 0,
                },
                turn_result: buildTurnResult({ assistantMessage: String(recovered.assistant_text ?? "") }),
                ...buildBillingSnapshot(lane),
              });
            } catch (error) {
              const missingCredential = error instanceof ServerTongsRequestError
                && error.code === "tongs_api_credential_missing";
              return admissionFailureResponse({
                status: missingCredential ? 503 : 409,
                error: missingCredential
                  ? "Canonical Thumbnail Directions persistence is unavailable before provider submission."
                  : error instanceof Error ? error.message : "Retained Thumbnail Directions recovery failed.",
                code: missingCredential
                  ? "thumbnail_direction_persistence_preflight_unavailable"
                  : "thumbnail_direction_recovery_stale",
              });
            }
          }
        }
        if (paidRouteCode === HEARTH_THUMBNAIL_DIRECTION_ROUTE && thumbnailDirectionInput
          && (spendingAcceptance || paidExecutionHandle)) {
          try {
            if (!bearerToken) throw new Error("Customer authorization is unavailable.");
            await readCanonicalThumbnailMetadata({
              requestUrl: request.url,
              workpieceId: episodeContext.episodeId,
              tongsApiToken,
              userAccessToken: bearerToken,
              fetchImpl: config.tongsFetch,
            });
          } catch {
            return admissionFailureResponse({
              status: 503,
              error: "Canonical Thumbnail Directions persistence is unavailable before provider submission.",
              code: "thumbnail_direction_persistence_preflight_unavailable",
            });
          }
        }
        if (paidRouteCode === HEARTH_TITLE_ROUTE && titleContractVersion === 1) {
          // Historical accepted v1 quotes are read-only: replay a settled result,
          // but never submit another provider attempt under the old title policy.
          if (!openAiTextGate || !userId || !episodeContext.workspaceId) {
            return admissionFailureResponse({ status: 503, error: "Paid execution controls are unavailable.", code: "paid_execution_control_unavailable" });
          }
          const operationId = deriveHearthCustomerPaidIdentifiers({
            userId, workspaceId: episodeContext.workspaceId,
            requestFingerprint: actualRequestFingerprint,
          }).operationId;
          const stored = await openAiTextGate.rpc("read_existing_openai_text_funding_handle", {
            p_user_id: userId,
            p_operation_id: operationId,
            p_route_code: HEARTH_TITLE_ROUTE,
            p_request_fingerprint: actualRequestFingerprint,
          });
          const legacyHandle = normalizeOpenAiTextPaidExecutionHandle(stored.data);
          if (!stored.error && legacyHandle
            && (!paidExecutionHandle || paidExecutionHandle.operationId === legacyHandle.operationId
              && paidExecutionHandle.reservationId === legacyHandle.reservationId)
            && (!spendingAcceptance || spendingAcceptance.operationId === legacyHandle.operationId)) {
            try {
              const replay = await readSettledOpenAiTextRouteReplay({
                gate: openAiTextGate, routeCode: HEARTH_TITLE_ROUTE,
                handle: legacyHandle, userId,
                workspaceId: episodeContext.workspaceId,
                workpieceId: episodeContext.episodeId,
                credentialSource: resolvedCredentials.keySource,
                requestFingerprintPayload: paidFingerprintPayload,
              });
              if (replay && (!spendingAcceptance || spendingAcceptance.quoteId === replay.context.quoteId)) {
                return jsonResponse(200, {
                  ok: true,
                  assistant_text: replay.result.assistant_text,
                  reply: replay.result.assistant_text,
                  title_result_id: replay.result.title_result_id,
                  script_approval_id: replay.result.script_approval_id,
                  script_approval_revision: replay.result.script_approval_revision,
                  script_content_hash: replay.result.script_content_hash,
                  turn_result: buildTurnResult({ assistantMessage: String(replay.result.assistant_text ?? "") }),
                  billing_receipt: {
                    operation_id: replay.context.operationId,
                    reservation_id: replay.context.reservationId,
                    status: replay.state,
                    funding_source: replay.context.fundingSourceType,
                    customer_charge_micros: replay.customerChargeMicros,
                    provider_request_id: replay.requestId,
                  },
                  ...buildBillingSnapshot(lane),
                });
              }
            } catch {
              // Invalid or unsettled legacy authority cannot cross into v2 execution.
            }
          }
          return admissionFailureResponse({
            status: 409,
            error: "This earlier title quote has no settled result to replay. Request a new quote under the current title contract.",
            code: "title_legacy_quote_not_replayable",
          });
        }
        let paidRequirementRow: Record<string, unknown> = {};
        if (openAiTextGate) {
          if (ownerResearchRequirement && paidRouteCode === "hearth.research_synthesis") {
            paidRequirementRow = ownerResearchRequirement;
          } else if (ownerHearthRequirement && paidRouteCode === "hearth.chat_completion") {
            paidRequirementRow = ownerHearthRequirement;
          } else {
            const requirement = await openAiTextGate.rpc("read_openai_execution_requirement", {
              p_route_code: paidRouteCode,
              p_credential_funding: resolvedCredentials.keySource === "user_byo" ? "byo_customer" : "forge",
            });
            if (requirement.error) {
              return admissionFailureResponse({
                status: 503,
                error: "Paid execution controls are unavailable.",
                code: "paid_execution_control_unavailable",
              });
            }
            paidRequirementRow = isRecord(requirement.data) ? requirement.data : {};
          }
          if (paidRequirementRow.mode === "halt_new" && !paidExecutionHandle) {
            return admissionFailureResponse({
              status: 503,
              error: "New paid submissions are halted while existing operations remain available for reconciliation.",
              code: "paid_submissions_halted",
            });
          }
        } else if (paidExecutionHandle || spendingAcceptance) {
          return admissionFailureResponse({
            status: 503,
            error: "Paid execution controls are unavailable.",
            code: "paid_execution_control_unavailable",
          });
        }

        if ((paidRouteCode === HEARTH_TITLE_ROUTE || paidRouteCode === HEARTH_TAG_ROUTE || paidRouteCode === HEARTH_FRAMING_PACK_ROUTE || paidRouteCode === HEARTH_THUMBNAIL_DIRECTION_ROUTE)
          && (!openAiTextGate || paidRequirementRow.funding_context_required !== true)) {
          const unavailableProduct = paidRouteCode === HEARTH_THUMBNAIL_DIRECTION_ROUTE
            ? "Thumbnail Directions"
            : paidRouteCode === HEARTH_FRAMING_PACK_ROUTE
            ? "Framing Pack"
            : paidRouteCode === HEARTH_TAG_ROUTE ? "Tags" : "Titles";
          const unavailableCode = paidRouteCode === HEARTH_THUMBNAIL_DIRECTION_ROUTE
            ? "thumbnail_direction_paid_product_unavailable"
            : paidRouteCode === HEARTH_FRAMING_PACK_ROUTE
            ? "framing_pack_paid_product_unavailable"
            : paidRouteCode === HEARTH_TAG_ROUTE ? "tag_paid_product_unavailable" : "title_paid_product_unavailable";
          return admissionFailureResponse({
            status: 503,
            error: `The paid Generate ${unavailableProduct} product is not active for this customer scope.`,
            code: unavailableCode,
          });
        }

        if (paidRequirementRow.funding_context_required === true && !paidExecutionHandle) {
          if (!paidScopeEligible || !actualRequestFingerprint) {
            return admissionFailureResponse({
              status: 422,
              error: "The published customer price covers only a bounded ordinary Hearth chat completion.",
              code: "paid_quote_scope_mismatch",
            });
          }
          if (!openAiTextGate || !userId || !bearerToken || !isUuid(episodeContext.workspaceId)) {
            return admissionFailureResponse({
              status: 401,
              error: "Authentication and paid execution controls are required.",
              code: "paid_execution_auth_required",
            });
          }
          if (paidRouteCode === HEARTH_TITLE_ROUTE || paidRouteCode === HEARTH_TAG_ROUTE || paidRouteCode === HEARTH_FRAMING_PACK_ROUTE || paidRouteCode === HEARTH_THUMBNAIL_DIRECTION_ROUTE
            || paidRouteCode === "hearth.research_synthesis"
            || paidRouteCode === "hearth.script_generation"
            || paidRouteCode === "hearth.chat_completion") {
            try {
              if (ownerHearthRequirement && paidRouteCode === "hearth.chat_completion") {
                const ownerPrepared = await prepareOwnerHearthOperation({
                  gate: openAiTextGate,
                  userId,
                  workspaceId: episodeContext.workspaceId,
                  workpieceId: episodeContext.episodeId,
                  requestedProviderModelId: requestedModel,
                  requestFingerprint: actualRequestFingerprint,
                  buildRequest: (acceptedModel, maximumOutputTokens, maximumAttempts) =>
                    buildBoundedHearthChatProviderRequest({
                      messages: paidCompletionMessages,
                      model: acceptedModel,
                      maximumOutputTokens,
                      maximumAttempts,
                    }),
                });
                model = ownerPrepared.model;
                paidExecutionHandle = await withBoundFundingEnvironment(ownerPrepared.handle, userId);
              } else {
              const ordinaryOperationId = paidRouteCode === HEARTH_TITLE_ROUTE || paidRouteCode === HEARTH_TAG_ROUTE || paidRouteCode === HEARTH_FRAMING_PACK_ROUTE || paidRouteCode === HEARTH_THUMBNAIL_DIRECTION_ROUTE
                || paidRouteCode === "hearth.chat_completion"
                || paidRouteCode === "hearth.script_generation"
                ? deriveHearthCustomerPaidIdentifiers({
                  userId,
                  workspaceId: episodeContext.workspaceId,
                  requestFingerprint: actualRequestFingerprint,
                }).operationId
                : chatActionId;
              paidExecutionHandle = await resolveOrdinaryOpenAiTextFunding({
                routeCode: paidRouteCode,
                operationId: ordinaryOperationId,
                userId,
                workspaceId: episodeContext.workspaceId,
                workpieceId: episodeContext.episodeId,
                requestFingerprint: actualRequestFingerprint,
                model,
                credentialFunding: resolvedCredentials.keySource === "user_byo" ? "byo_customer" : "forge",
                acceptance: spendingAcceptance,
                serviceGate: openAiTextGate,
                prepareBoundedRequest: ({ model: acceptedModel, maximumOutputTokens, maximumAttempts }) =>
                  paidRouteCode === "hearth.chat_completion"
                    ? buildBoundedHearthChatProviderRequest({
                        messages: paidCompletionMessages,
                        model: acceptedModel,
                        maximumOutputTokens,
                        maximumAttempts,
                      })
                    : buildBoundedPaidJsonOpenAiRequest({
                        body: {
                          model: acceptedModel,
                          messages: paidRouteCode === "hearth.script_generation" || paidRouteCode === HEARTH_TITLE_ROUTE || paidRouteCode === HEARTH_TAG_ROUTE || paidRouteCode === HEARTH_FRAMING_PACK_ROUTE || paidRouteCode === HEARTH_THUMBNAIL_DIRECTION_ROUTE
                            ? paidCompletionMessages
                            : completionMessages,
                          ...(paidRouteCode === HEARTH_TITLE_ROUTE || paidRouteCode === HEARTH_TAG_ROUTE || paidRouteCode === HEARTH_FRAMING_PACK_ROUTE || paidRouteCode === HEARTH_THUMBNAIL_DIRECTION_ROUTE ? { reasoning_effort: "none" } : {}),
                        },
                        model: acceptedModel,
                        maximumOutputTokens,
                        maximumAttempts,
                      }),
                userGate: {
                  rpc: async (name, payload) => {
                    const result = await callUserScopedTongsRpc({
                      accessToken: bearerToken,
                      fn: name,
                      payload,
                    });
                    return result.ok
                      ? { data: result.data, error: null }
                      : { data: null, error: { message: result.error } };
                  },
                },
              });
              }
            } catch (error) {
              if (error instanceof OpenAiTextQuoteRequiredError) {
                const ownerBudgetRequired = !error.quote.fundingEligible && error.quote.payerKind === "owner_testing";
                return jsonResponse(error.quote.fundingEligible || ownerBudgetRequired ? 409 : 402, {
                  ok: false,
                  error: error.quote.fundingEligible
                    ? "Review and accept the maximum customer charge before Hearth uses OpenAI."
                    : ownerBudgetRequired
                      ? "Private owner testing is authorized for this account, but a separately approved active spending cap is required before OpenAI can run."
                      : "This funding source cannot cover the quoted operation. Choose Add Credits or another authorized payer, then request a fresh quote.",
                  code: error.quote.fundingEligible
                    ? "hearth_spending_confirmation_required"
                    : ownerBudgetRequired
                      ? "hearth_owner_testing_budget_required"
                      : "hearth_insufficient_verified_funds",
                  billing_quote: {
                    quote_id: error.quote.quoteId,
                    operation_id: error.quote.operationId,
                    quote_hash: error.quote.quoteHash,
                    request_fingerprint: error.quote.requestFingerprint,
                    credit_charge: error.quote.customerCreditUnits,
                    failure_terms: error.quote.failureTerms,
                    funding_eligible: error.quote.fundingEligible,
                    funding_label: error.quote.fundingLabel,
                    model_display_name: error.quote.modelDisplayName,
                    model_tradeoff_summary: error.quote.modelTradeoffSummary,
                    expires_at: error.quote.expiresAt,
                  },
                  ...buildBillingSnapshot(lane),
                });
              }
              if (error instanceof OpenAiTextFundingPreparationError) {
                const ownerBudgetRequired = error.details.payer_kind === "owner_testing";
                return jsonResponse(ownerBudgetRequired ? 409 : error.status, {
                  ok: false,
                  error: ownerBudgetRequired
                    ? "Private owner testing is authorized for this account, but its explicit spending cap is not active. Add Credits is not required for this funding lane."
                    : error.message,
                  code: ownerBudgetRequired ? "hearth_owner_testing_budget_required" : error.code,
                  ...error.details,
                  ...buildBillingSnapshot(lane),
                });
              }
              throw error;
            }
          } else {
          const identifiers = deriveHearthCustomerPaidIdentifiers({
            userId,
            workspaceId: episodeContext.workspaceId,
            requestFingerprint: actualRequestFingerprint,
          });
          if (!spendingAcceptance) {
            const quoted = await openAiTextGate.rpc("create_customer_hearth_chat_quote", {
              p_quote_id: identifiers.quoteId,
              p_user_id: userId,
              p_operation_id: identifiers.operationId,
              p_workspace_id: episodeContext.workspaceId,
              p_request_fingerprint: actualRequestFingerprint,
              p_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            });
            if (quoted.error || !isRecord(quoted.data)) {
              const unavailable = /not active|not configured|operation limit|expired/i.test(quoted.error?.message ?? "");
              const error = unavailable
                ? "Hearth cannot run this turn because no authorized funding source is available for this account and workspace. No provider request was sent and no charge was made."
                : "Hearth could not verify an authorized funding source for this turn. No provider request was sent and no charge was made.";
              return admissionFailureResponse({
                status: unavailable ? 409 : 503,
                error,
                code: unavailable ? "hearth_customer_test_not_authorized" : "hearth_quote_unavailable",
              });
            }
            const quote = quoted.data;
            const funding = isRecord(quote.funding) ? quote.funding : {};
            const billingQuote = {
              quote_id: quote.quote_id,
              operation_id: quote.operation_id,
              quote_hash: quote.quote_hash,
              request_fingerprint: quote.request_fingerprint,
              credit_charge: quote.customer_credit_units,
              failure_terms: "Failed operations do not consume Forge Credits.",
              funding_eligible: funding.eligible === true,
              funding_label: funding.eligible === true ? "Forge Credits" : "Not enough Forge Credits",
              model_display_name: "GPT-5.6 Luna",
              model_tradeoff_summary: "Fast, bounded model for everyday Hearth work.",
              expires_at: quote.expires_at,
            };
            if (funding.eligible !== true) {
              const error = "This account has no verified Live deposit or economically backed allowance eligible for this operation. No provider request was sent and no charge was made.";
              return admissionFailureResponse({
                status: 402,
                error,
                code: "hearth_insufficient_verified_funds",
                extra: { billing_quote: billingQuote },
              });
            }
            return jsonResponse(409, {
              ok: false,
              error: "Review and accept the maximum customer charge before Hearth uses OpenAI.",
              code: "hearth_spending_confirmation_required",
              billing_quote: billingQuote,
              ...buildBillingSnapshot(lane),
            });
          }
          if (spendingAcceptance.operationId !== identifiers.operationId
            || spendingAcceptance.quoteId !== identifiers.quoteId
            || spendingAcceptance.requestFingerprint !== actualRequestFingerprint) {
            return jsonResponse(409, {
              ok: false,
              error: "This accepted quote does not match the current Hearth request.",
              code: "paid_request_fingerprint_mismatch",
              ...buildBillingSnapshot(lane),
            });
          }
          const accepted = await callUserScopedTongsRpc({
            accessToken: bearerToken,
            fn: "accept_quote",
            payload: {
              p_quote_id: identifiers.quoteId,
              p_acceptance_id: identifiers.acceptanceId,
              p_acceptance_key: `hearth-customer-acceptance:${identifiers.quoteId}`,
              p_quote_hash: spendingAcceptance.quoteHash,
            },
          });
          if (!accepted.ok) {
            const expired = /expired/i.test(accepted.error);
            return jsonResponse(expired ? 409 : 400, {
              ok: false,
              error: expired
                ? "This Hearth quote expired. Request a new quote before continuing."
                : "The Hearth quote could not be accepted.",
              code: expired ? "hearth_quote_expired" : "hearth_quote_acceptance_failed",
              ...buildBillingSnapshot(lane),
            });
          }
          const reserved = await openAiTextGate.rpc("reserve_customer_hearth_chat_quote", {
            p_quote_id: identifiers.quoteId,
            p_reservation_id: identifiers.reservationId,
            p_idempotency_key: `hearth-customer-reservation:${identifiers.quoteId}`,
            p_request_fingerprint: actualRequestFingerprint,
          });
          if (reserved.error || !isRecord(reserved.data)) {
            const insufficient = /insufficient verified funding/i.test(reserved.error?.message ?? "");
            return jsonResponse(insufficient ? 402 : 403, {
              ok: false,
              error: insufficient
                ? "This account no longer has enough verified eligible funding for the accepted maximum charge."
                : "The accepted Hearth quote could not authorize provider execution.",
              code: insufficient ? "hearth_insufficient_verified_funds" : "paid_execution_denied",
              ...buildBillingSnapshot(lane),
            });
          }
          paidExecutionHandle = await withBoundFundingEnvironment({
            operationId: identifiers.operationId,
            reservationId: identifiers.reservationId,
            requestFingerprint: actualRequestFingerprint,
          }, userId);
          }
        }

        if (paidExecutionHandle) {
          if (!paidScopeEligible) {
            return jsonResponse(422, {
              ok: false,
              error: "This accepted quote covers only a bounded ordinary Hearth chat completion.",
              code: "paid_quote_scope_mismatch",
              ...buildBillingSnapshot(lane),
            });
          }
          if (!openAiTextGate || !userId) {
            return jsonResponse(401, {
              ok: false,
              error: "Authentication and paid execution controls are required.",
              code: "paid_execution_auth_required",
              ...buildBillingSnapshot(lane),
            });
          }
          if (actualRequestFingerprint !== paidExecutionHandle.requestFingerprint) {
            return jsonResponse(409, {
              ok: false,
              error: "This request no longer matches the accepted quote.",
              code: "paid_request_fingerprint_mismatch",
              ...buildBillingSnapshot(lane),
            });
          }
          try {
            if (paidRouteCode === "hearth.research_synthesis") {
              let frozenResearchRequest: Awaited<ReturnType<typeof freezeOwnerHearthResearchSynthesis>> | undefined;
              let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
              if (ownerResearchRequirement) {
                if (!ownerResearchDeadlineAt || !ownerResearchMaximumOutputTokens || !ownerResearchPlan) {
                  throw new Error("Owner research accepted authority is incomplete.");
                }
                const researchBytes = new TextEncoder().encode(JSON.stringify(researchResult ?? {})).byteLength;
                if (researchBytes > 768 * 1024) {
                  await settleOwnerHearthResearchBeforeSynthesis({
                    gate: openAiTextGate,
                    reservationId: paidExecutionHandle.reservationId,
                    failureClass: "research_package_size_exceeded",
                    evidence: { research_bytes: researchBytes, maximum_research_bytes: 768 * 1024 },
                  });
                  return jsonResponse(422, {
                    ok: false,
                    error: "The retrieved research package exceeded its accepted persistence bound. OpenAI was not called.",
                    code: "owner_research_package_size_exceeded",
                    ...buildBillingSnapshot(lane),
                  });
                }
                try {
                  frozenResearchRequest = await freezeOwnerHearthResearchSynthesis({
                    gate: openAiTextGate,
                    handle: paidExecutionHandle,
                    model: model as OwnerResearchModel,
                    messages: completionMessages,
                    maximumOutputTokens: ownerResearchMaximumOutputTokens,
                    deadlineAt: ownerResearchDeadlineAt,
                    sourceRevisionFingerprint: sha256Canonical((researchResult?.sources ?? []).map((source) => ({
                      source_id: source.sourceId,
                      canonical_url: source.canonicalUrl ?? source.url,
                      extracted_text: source.extractedText,
                      transcript: source.transcript,
                      extraction_status: source.extractionStatus,
                    }))),
                    plan: ownerResearchPlan,
                  });
                } catch (error) {
                  await settleOwnerHearthResearchBeforeSynthesis({
                    gate: openAiTextGate,
                    reservationId: paidExecutionHandle.reservationId,
                    failureClass: "frozen_synthesis_request_rejected",
                    evidence: { error: error instanceof Error ? error.message : String(error) },
                  });
                  return jsonResponse(422, {
                    ok: false,
                    error: "The final synthesis request did not fit the accepted model and cost authority. OpenAI was not called.",
                    code: "owner_research_frozen_request_rejected",
                    ...buildBillingSnapshot(lane),
                  });
                }
                const remainingMs = ownerResearchDeadlineAt - Date.now();
                if (remainingMs <= 0) {
                  await settleOwnerHearthResearchBeforeSynthesis({
                    gate: openAiTextGate,
                    reservationId: paidExecutionHandle.reservationId,
                    failureClass: "research_deadline_exhausted",
                  });
                  return jsonResponse(408, {
                    ok: false,
                    error: "The bounded research deadline expired before OpenAI submission.",
                    code: "owner_research_deadline_exhausted",
                    ...buildBillingSnapshot(lane),
                  });
                }
                deadlineTimer = setTimeout(() => upstreamAbort.abort(), remainingMs);
              } else if (customerResearchPlan) {
                if (!customerResearchDeadlineAt) {
                  throw new Error("Customer research accepted authority is incomplete.");
                }
                const researchBytes = new TextEncoder().encode(JSON.stringify(researchResult ?? {})).byteLength;
                if (researchBytes > 768 * 1024) {
                  await settleCustomerHearthResearchBeforeSynthesis({
                    gate: openAiTextGate,
                    reservationId: paidExecutionHandle.reservationId,
                    failureClass: "research_package_size_exceeded",
                    evidence: { research_bytes: researchBytes, maximum_research_bytes: 768 * 1024 },
                  });
                  return jsonResponse(422, {
                    ok: false,
                    error: "The retrieved research package exceeded its accepted bound. No Forge Credits were charged and OpenAI was not called.",
                    code: "customer_research_package_size_exceeded",
                    ...buildBillingSnapshot(lane),
                  });
                }
                try {
                  frozenResearchRequest = await buildBoundedPaidJsonOpenAiRequest({
                    body: { model: CUSTOMER_RESEARCH_MODEL, messages: completionMessages },
                    model: CUSTOMER_RESEARCH_MODEL,
                    maximumOutputTokens: customerResearchPlan.maximum_output_tokens,
                    maximumAttempts: 1,
                  });
                  if (frozenResearchRequest.boundedInputTokens > customerResearchPlan.maximum_input_tokens) {
                    throw new Error("customer_research_frozen_request_out_of_bounds");
                  }
                  await bindCustomerHearthResearchSynthesis({
                    gate: openAiTextGate,
                    handle: paidExecutionHandle,
                    bounded: frozenResearchRequest,
                  });
                } catch (error) {
                  await settleCustomerHearthResearchBeforeSynthesis({
                    gate: openAiTextGate,
                    reservationId: paidExecutionHandle.reservationId,
                    failureClass: "frozen_synthesis_request_rejected",
                    evidence: { error: error instanceof Error ? error.message : String(error) },
                  });
                  return jsonResponse(422, {
                    ok: false,
                    error: "The final synthesis request did not fit the accepted research bounds. No Forge Credits were charged and OpenAI was not called.",
                    code: "customer_research_frozen_request_rejected",
                    ...buildBillingSnapshot(lane),
                  });
                }
                const remainingMs = customerResearchDeadlineAt - Date.now();
                if (remainingMs <= 0) {
                  await settleCustomerHearthResearchBeforeSynthesis({
                    gate: openAiTextGate,
                    reservationId: paidExecutionHandle.reservationId,
                    failureClass: "research_deadline_exhausted",
                  });
                  return jsonResponse(408, {
                    ok: false,
                    error: "The bounded research deadline expired before synthesis. No Forge Credits were charged.",
                    code: "customer_research_deadline_exhausted",
                    ...buildBillingSnapshot(lane),
                  });
                }
                deadlineTimer = setTimeout(() => upstreamAbort.abort(), remainingMs);
              }
              let paidResearch;
              try {
                paidResearch = await executePaidJsonOpenAiRoute({
                gate: ownerResearchRequirement
                  ? withOwnerFundingEnvironment(ownerHearthResearchExecutionGate(openAiTextGate))
                  : openAiTextGate,
                routeCode: "hearth.research_synthesis",
                handle: paidExecutionHandle,
                userId,
                workspaceId: episodeContext.workspaceId!,
                workpieceId: episodeContext.episodeId,
                credentialSource: resolvedCredentials.keySource,
                apiKey: resolvedCredentials.apiKey,
                requestFingerprintPayload: paidFingerprintPayload,
                providerRequestBody: (acceptedModel) => ({
                  model: acceptedModel,
                  messages: completionMessages,
                }),
                frozenRequest: frozenResearchRequest,
                signal: upstreamAbort.signal,
                fetchImpl: config.openAiProviderFetch,
                persist: async (value, providerPayload) => {
                  if (!supabaseService) throw new Error("Research synthesis persistence is unavailable.");
                  const usage = isRecord(providerPayload.usage) ? providerPayload.usage : {};
                  const persisted = await (supabaseService.schema("tongs") as unknown as {
                    rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string } | null }>;
                  }).rpc(ownerResearchRequirement
                    ? "persist_owner_hearth_research_result"
                    : "persist_hearth_research_synthesis_result", {
                    p_operation_id: paidExecutionHandle!.operationId,
                    p_reservation_id: paidExecutionHandle!.reservationId,
                    p_user_id: userId,
                    p_workspace_id: episodeContext.workspaceId,
                    p_workpiece_id: episodeContext.episodeId,
                    p_request_fingerprint: paidExecutionHandle!.requestFingerprint,
                    p_provider_request_id: readOptionalString(providerPayload.id),
                    p_input_units: Number(usage.input_tokens ?? usage.prompt_tokens ?? 0),
                    p_output_units: Number(usage.output_tokens ?? usage.completion_tokens ?? 0),
                    p_result_json: value,
                    ...(ownerResearchRequirement ? {
                      p_research_result_json: researchResult,
                      p_review_state: "ready_for_review",
                    } : {}),
                  });
                  if (persisted.error || !isRecord(persisted.data)) throw new Error(persisted.error?.message ?? "Research synthesis persistence failed.");
                  return persisted.data;
                },
                recover: async () => {
                  if (!supabaseService) return null;
                  const recovered = await (supabaseService.schema("tongs") as unknown as {
                    rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string } | null }>;
                  }).rpc(ownerResearchRequirement
                    ? "read_owner_hearth_research_result"
                    : "read_hearth_research_synthesis_result", {
                    p_operation_id: paidExecutionHandle!.operationId,
                    p_reservation_id: paidExecutionHandle!.reservationId,
                  });
                  if (recovered.error || !isRecord(recovered.data)) return null;
                  return {
                    result: recovered.data,
                    providerRequestId: readOptionalString(recovered.data.provider_request_id),
                    inputUnits: Number(recovered.data.input_units ?? 0),
                    outputUnits: Number(recovered.data.output_units ?? 0),
                  };
                },
                validate: (providerPayload) => {
                  const rawReply = extractAssistantReply(providerPayload);
                  if (!rawReply) throw new Error("Research synthesis returned no usable response.");
                  const structured = normalizeStructuredReply(rawReply) ?? {
                    assistantText: rawReply,
                    ops: [],
                    scriptText: null,
                    tagAudit: null,
                    researchArtifact: null,
                  };
                  structured.assistantText = sanitizeHearthUserFacingOutput(
                    enforceHearthEditorialHonesty({ assistantText: structured.assistantText, requestText }),
                  );
                  if (!structured.assistantText.trim()) throw new Error("Research synthesis was empty.");
                  return {
                    assistant_text: structured.assistantText,
                    ops: structured.ops,
                    script_text: structured.scriptText,
                    tag_audit: structured.tagAudit,
                    research_result: researchResult as unknown as Record<string, unknown>,
                  };
                },
                });
              } catch (error) {
                if (customerResearchPlan) {
                  await settleCustomerHearthResearchBeforeSynthesis({
                    gate: openAiTextGate,
                    reservationId: paidExecutionHandle.reservationId,
                    failureClass: "synthesis_authorization_or_execution_failed",
                    evidence: { error: error instanceof Error ? error.message : String(error) },
                  });
                  return jsonResponse(503, {
                    ok: false,
                    error: "Hearth could not complete the accepted research synthesis. No Forge Credits were charged.",
                    code: "customer_research_synthesis_failed",
                    ...buildBillingSnapshot(lane),
                  });
                }
                throw error;
              } finally {
                if (deadlineTimer) clearTimeout(deadlineTimer);
              }
              return jsonResponse(200, {
                ok: true,
                ...paidResearch.result,
                reply: paidResearch.result.assistant_text,
                turn_result: buildTurnResult({
                  assistantMessage: String(paidResearch.result.assistant_text ?? ""),
                  artifact: researchResult?.artifact
                    ? { kind: "research", value: researchResult }
                    : null,
                  operations: normalizeOps(paidResearch.result.ops),
                }),
                billing_receipt: paidResearch.receipt,
                ...buildBillingSnapshot(lane),
              });
            }
            if (paidRouteCode === HEARTH_THUMBNAIL_DIRECTION_ROUTE && approvedTitleScript && thumbnailDirectionInput) {
              const thumbnailApproval = approvedTitleScript;
              const styleAuthority = thumbnailDirectionStyleAuthority(thumbnailDirectionInput);
              const titleInputs = thumbnailDirectionTitleInputs(thumbnailDirectionInput);
              const persistCanonicalThumbnailDirections = (staged: Record<string, unknown>) =>
                commitAndFinalizeThumbnailDirections({
                  requestUrl: request.url,
                  workpieceId: episodeContext.episodeId,
                  operationId: paidExecutionHandle!.operationId,
                  reservationId: paidExecutionHandle!.reservationId,
                  input: thumbnailDirectionInput,
                  staged,
                  gate: openAiTextGate,
                  tongsApiToken,
                  userAccessToken: bearerToken!,
                  fetchImpl: config.tongsFetch,
                });
              const paidThumbnailDirections = await executePaidJsonOpenAiRoute({
                gate: openAiTextGate,
                routeCode: HEARTH_THUMBNAIL_DIRECTION_ROUTE,
                handle: paidExecutionHandle,
                userId,
                workspaceId: episodeContext.workspaceId!,
                workpieceId: episodeContext.episodeId,
                credentialSource: resolvedCredentials.keySource,
                apiKey: resolvedCredentials.apiKey,
                requestFingerprintPayload: paidFingerprintPayload,
                providerRequestBody: (acceptedModel) => ({
                  model: acceptedModel,
                  reasoning_effort: "none",
                  messages: paidCompletionMessages,
                }),
                signal: upstreamAbort.signal,
                fetchImpl: config.openAiProviderFetch,
                realizedSupportingCost: {
                  amountMicros: 0,
                  authoritative: true,
                  evidence: { evidence_status: "none_verified", classification: "direct_supplier_cost_only" },
                },
                validationEvidence: {
                  contractRevision: HEARTH_THUMBNAIL_DIRECTION_OUTPUT_CONTRACT,
                  recordFailure: async (failure) => {
                    const recorded = await openAiTextGate.rpc("record_openai_text_validation_failure_evidence", {
                      p_route_code: HEARTH_THUMBNAIL_DIRECTION_ROUTE,
                      p_operation_id: failure.operationId,
                      p_reservation_id: failure.reservationId,
                      p_provider_request_id: failure.providerRequestId,
                      p_model: failure.model,
                      p_input_units: failure.inputUnits,
                      p_output_units: failure.outputUnits,
                      p_raw_provider_response_text: failure.rawProviderResponseText,
                      p_validation_error_code: failure.errorCode,
                      p_validation_contract_revision: failure.contractRevision,
                    });
                    if (recorded.error) throw new Error(recorded.error.message);
                  },
                },
                validate: (providerPayload) => {
                  const output = validatePaidThumbnailDirectionOutput(extractAssistantReply(providerPayload));
                  if (!output.ok) throw new Error(output.error);
                  return {
                    assistant_text: output.output.text,
                    strategy: output.output.strategy,
                    directions: output.output.directions,
                    contract: HEARTH_THUMBNAIL_DIRECTION_CONTRACT,
                    output_contract: HEARTH_THUMBNAIL_DIRECTION_OUTPUT_CONTRACT,
                    script_approval_id: thumbnailApproval.approvalId,
                    script_approval_revision: thumbnailApproval.approvalRevision,
                    script_content_hash: thumbnailApproval.scriptHash,
                    style_authority: styleAuthority,
                    title_inputs: titleInputs,
                    thumbnail_authority: {
                      authority_version: thumbnailDirectionInput.authority.thumbnailAuthorityVersion,
                      active_strategy_id: thumbnailDirectionInput.authority.activeStrategyId,
                      active_concept_set_id: thumbnailDirectionInput.authority.activeConceptSetId,
                      planning_subtree_hash: thumbnailDirectionInput.authority.planningSubtreeHash,
                    },
                  };
                },
                persist: async (value, providerPayload) => {
                  const usage = isRecord(providerPayload.usage) ? providerPayload.usage : {};
                  const saved = await openAiTextGate.rpc("persist_hearth_thumbnail_direction_generation_result", {
                    p_operation_id: paidExecutionHandle!.operationId,
                    p_reservation_id: paidExecutionHandle!.reservationId,
                    p_user_id: userId,
                    p_workspace_id: episodeContext.workspaceId,
                    p_workpiece_id: episodeContext.episodeId,
                    p_request_fingerprint: paidExecutionHandle!.requestFingerprint,
                    p_approval_id: thumbnailApproval.approvalId,
                    p_approval_revision: thumbnailApproval.approvalRevision,
                    p_script_hash: thumbnailApproval.scriptHash,
                    p_provider_request_id: readOptionalString(providerPayload.id),
                    p_input_units: Number(usage.input_tokens ?? usage.prompt_tokens ?? 0),
                    p_output_units: Number(usage.output_tokens ?? usage.completion_tokens ?? 0),
                    p_result_json: value,
                  });
                  if (saved.error || !isRecord(saved.data)) throw new Error(saved.error?.message ?? "Thumbnail Direction persistence failed.");
                  return persistCanonicalThumbnailDirections(saved.data);
                },
                recover: async () => {
                  const saved = await openAiTextGate.rpc("read_staged_hearth_thumbnail_direction_generation_result", {
                    p_operation_id: paidExecutionHandle!.operationId,
                    p_reservation_id: paidExecutionHandle!.reservationId,
                  });
                  if (saved.error || !isRecord(saved.data)) return null;
                  const finalized = saved.data.canonical_persisted === true
                    ? saved.data
                    : await persistCanonicalThumbnailDirections(saved.data);
                  return {
                    result: finalized,
                    providerRequestId: readOptionalString(finalized.provider_request_id),
                    inputUnits: Number(finalized.input_units ?? 0),
                    outputUnits: Number(finalized.output_units ?? 0),
                  };
                },
              });
              return jsonResponse(200, {
                ok: true,
                assistant_text: paidThumbnailDirections.result.assistant_text,
                reply: paidThumbnailDirections.result.assistant_text,
                script_approval_id: paidThumbnailDirections.result.script_approval_id,
                script_approval_revision: paidThumbnailDirections.result.script_approval_revision,
                script_content_hash: paidThumbnailDirections.result.script_content_hash,
                thumbnail_direction_identity: {
                  operation_id: paidExecutionHandle.operationId,
                  result_id: paidThumbnailDirections.result.thumbnail_direction_result_id,
                  created_at: paidThumbnailDirections.result.created_at,
                  style_authority: paidThumbnailDirections.result.style_authority,
                  title_inputs: paidThumbnailDirections.result.title_inputs,
                  thumbnail_planning_subtree_hash: paidThumbnailDirections.result.thumbnail_planning_subtree_hash,
                  expected_active_strategy_id: paidThumbnailDirections.result.expected_active_strategy_id,
                  expected_active_concept_set_id: paidThumbnailDirections.result.expected_active_concept_set_id,
                },
                turn_result: buildTurnResult({ assistantMessage: String(paidThumbnailDirections.result.assistant_text ?? "") }),
                billing_receipt: paidThumbnailDirections.receipt,
                ...buildBillingSnapshot(lane),
              });
            }
            if (paidRouteCode === HEARTH_FRAMING_PACK_ROUTE && approvedTitleScript) {
              const framingApproval = approvedTitleScript;
              const paidFramingPack = await executePaidJsonOpenAiRoute({
                gate: openAiTextGate,
                routeCode: HEARTH_FRAMING_PACK_ROUTE,
                handle: paidExecutionHandle,
                userId,
                workspaceId: episodeContext.workspaceId!,
                workpieceId: episodeContext.episodeId,
                credentialSource: resolvedCredentials.keySource,
                apiKey: resolvedCredentials.apiKey,
                requestFingerprintPayload: paidFingerprintPayload,
                providerRequestBody: (acceptedModel) => ({
                  model: acceptedModel,
                  reasoning_effort: "none",
                  messages: paidCompletionMessages,
                }),
                signal: upstreamAbort.signal,
                fetchImpl: config.openAiProviderFetch,
                realizedSupportingCost: {
                  amountMicros: 0,
                  authoritative: true,
                  evidence: { evidence_status: "none_verified", classification: "direct_supplier_cost_only" },
                },
                validationEvidence: {
                  contractRevision: HEARTH_FRAMING_PACK_OUTPUT_CONTRACT,
                  recordFailure: async (failure) => {
                    const recorded = await openAiTextGate.rpc("record_openai_text_validation_failure_evidence", {
                      p_route_code: HEARTH_FRAMING_PACK_ROUTE,
                      p_operation_id: failure.operationId,
                      p_reservation_id: failure.reservationId,
                      p_provider_request_id: failure.providerRequestId,
                      p_model: failure.model,
                      p_input_units: failure.inputUnits,
                      p_output_units: failure.outputUnits,
                      p_raw_provider_response_text: failure.rawProviderResponseText,
                      p_validation_error_code: failure.errorCode,
                      p_validation_contract_revision: failure.contractRevision,
                    });
                    if (recorded.error) throw new Error(recorded.error.message);
                  },
                },
                validate: (providerPayload) => {
                  const output = validatePaidFramingPackOutput(extractAssistantReply(providerPayload));
                  if (!output.ok) throw new Error(output.error);
                  return {
                    assistant_text: output.text,
                    sections: output.sections,
                    contract: HEARTH_FRAMING_PACK_CONTRACT,
                    output_contract: HEARTH_FRAMING_PACK_OUTPUT_CONTRACT,
                    script_approval_id: framingApproval.approvalId,
                    script_approval_revision: framingApproval.approvalRevision,
                    script_content_hash: framingApproval.scriptHash,
                  };
                },
                persist: async (value, providerPayload) => {
                  const usage = isRecord(providerPayload.usage) ? providerPayload.usage : {};
                  const saved = await openAiTextGate.rpc("persist_hearth_framing_pack_generation_result", {
                    p_operation_id: paidExecutionHandle!.operationId,
                    p_reservation_id: paidExecutionHandle!.reservationId,
                    p_user_id: userId,
                    p_workspace_id: episodeContext.workspaceId,
                    p_workpiece_id: episodeContext.episodeId,
                    p_request_fingerprint: paidExecutionHandle!.requestFingerprint,
                    p_approval_id: framingApproval.approvalId,
                    p_approval_revision: framingApproval.approvalRevision,
                    p_script_hash: framingApproval.scriptHash,
                    p_provider_request_id: readOptionalString(providerPayload.id),
                    p_input_units: Number(usage.input_tokens ?? usage.prompt_tokens ?? 0),
                    p_output_units: Number(usage.output_tokens ?? usage.completion_tokens ?? 0),
                    p_result_json: value,
                  });
                  if (saved.error || !isRecord(saved.data)) throw new Error(saved.error?.message ?? "Framing Pack persistence failed.");
                  return saved.data;
                },
                recover: async () => {
                  const saved = await openAiTextGate.rpc("read_hearth_framing_pack_generation_result", {
                    p_operation_id: paidExecutionHandle!.operationId,
                    p_reservation_id: paidExecutionHandle!.reservationId,
                  });
                  if (saved.error || !isRecord(saved.data)) return null;
                  return {
                    result: saved.data,
                    providerRequestId: readOptionalString(saved.data.provider_request_id),
                    inputUnits: Number(saved.data.input_units ?? 0),
                    outputUnits: Number(saved.data.output_units ?? 0),
                  };
                },
              });
              return jsonResponse(200, {
                ok: true,
                assistant_text: paidFramingPack.result.assistant_text,
                reply: paidFramingPack.result.assistant_text,
                framing_pack_result_id: paidFramingPack.result.framing_pack_result_id,
                script_approval_id: paidFramingPack.result.script_approval_id,
                script_approval_revision: paidFramingPack.result.script_approval_revision,
                script_content_hash: paidFramingPack.result.script_content_hash,
                turn_result: buildTurnResult({ assistantMessage: String(paidFramingPack.result.assistant_text ?? "") }),
                billing_receipt: paidFramingPack.receipt,
                ...buildBillingSnapshot(lane),
              });
            }
            if (paidRouteCode === HEARTH_TAG_ROUTE && approvedTitleScript) {
              const tagApproval = approvedTitleScript;
              const paidTags = await executePaidJsonOpenAiRoute({
                gate: openAiTextGate,
                routeCode: HEARTH_TAG_ROUTE,
                handle: paidExecutionHandle,
                userId,
                workspaceId: episodeContext.workspaceId!,
                workpieceId: episodeContext.episodeId,
                credentialSource: resolvedCredentials.keySource,
                apiKey: resolvedCredentials.apiKey,
                requestFingerprintPayload: paidFingerprintPayload,
                providerRequestBody: (acceptedModel) => ({
                  model: acceptedModel,
                  reasoning_effort: "none",
                  messages: paidCompletionMessages,
                }),
                signal: upstreamAbort.signal,
                fetchImpl: config.openAiProviderFetch,
                realizedSupportingCost: {
                  amountMicros: 0,
                  authoritative: true,
                  evidence: { evidence_status: "none_verified", classification: "direct_supplier_cost_only" },
                },
                validationEvidence: {
                  contractRevision: HEARTH_TAG_OUTPUT_CONTRACT,
                  recordFailure: async (failure) => {
                    const recorded = await openAiTextGate.rpc("record_hearth_tag_validation_failure_evidence", {
                      p_operation_id: failure.operationId,
                      p_reservation_id: failure.reservationId,
                      p_provider_request_id: failure.providerRequestId,
                      p_model: failure.model,
                      p_input_units: failure.inputUnits,
                      p_output_units: failure.outputUnits,
                      p_raw_provider_response_text: failure.rawProviderResponseText,
                      p_validation_error_code: failure.errorCode,
                      p_validation_contract_revision: failure.contractRevision,
                    });
                    if (recorded.error) throw new Error(recorded.error.message);
                  },
                },
                validate: (providerPayload) => {
                  const output = validatePaidTagOutput(extractAssistantReply(providerPayload));
                  if (!output.ok) throw new Error(output.error);
                  return {
                    assistant_text: output.text,
                    tags: output.tags,
                    contract: HEARTH_TAG_CONTRACT,
                    script_approval_id: tagApproval.approvalId,
                    script_approval_revision: tagApproval.approvalRevision,
                    script_content_hash: tagApproval.scriptHash,
                  };
                },
                persist: async (value, providerPayload) => {
                  const usage = isRecord(providerPayload.usage) ? providerPayload.usage : {};
                  const saved = await openAiTextGate.rpc("persist_hearth_tag_generation_result", {
                    p_operation_id: paidExecutionHandle!.operationId,
                    p_reservation_id: paidExecutionHandle!.reservationId,
                    p_user_id: userId,
                    p_workspace_id: episodeContext.workspaceId,
                    p_workpiece_id: episodeContext.episodeId,
                    p_request_fingerprint: paidExecutionHandle!.requestFingerprint,
                    p_approval_id: tagApproval.approvalId,
                    p_approval_revision: tagApproval.approvalRevision,
                    p_script_hash: tagApproval.scriptHash,
                    p_provider_request_id: readOptionalString(providerPayload.id),
                    p_input_units: Number(usage.input_tokens ?? usage.prompt_tokens ?? 0),
                    p_output_units: Number(usage.output_tokens ?? usage.completion_tokens ?? 0),
                    p_result_json: value,
                  });
                  if (saved.error || !isRecord(saved.data)) throw new Error(saved.error?.message ?? "Tag persistence failed.");
                  return saved.data;
                },
                recover: async () => {
                  const saved = await openAiTextGate.rpc("read_hearth_tag_generation_result", {
                    p_operation_id: paidExecutionHandle!.operationId,
                    p_reservation_id: paidExecutionHandle!.reservationId,
                  });
                  if (saved.error || !isRecord(saved.data)) return null;
                  return {
                    result: saved.data,
                    providerRequestId: readOptionalString(saved.data.provider_request_id),
                    inputUnits: Number(saved.data.input_units ?? 0),
                    outputUnits: Number(saved.data.output_units ?? 0),
                  };
                },
              });
              return jsonResponse(200, {
                ok: true,
                assistant_text: paidTags.result.assistant_text,
                reply: paidTags.result.assistant_text,
                tag_result_id: paidTags.result.tag_result_id,
                script_approval_id: paidTags.result.script_approval_id,
                script_approval_revision: paidTags.result.script_approval_revision,
                script_content_hash: paidTags.result.script_content_hash,
                turn_result: buildTurnResult({ assistantMessage: String(paidTags.result.assistant_text ?? "") }),
                billing_receipt: paidTags.receipt,
                ...buildBillingSnapshot(lane),
              });
            }
            if (paidRouteCode === HEARTH_TITLE_ROUTE && approvedTitleScript) {
              const titleApproval = approvedTitleScript;
              const paidTitles = await executePaidJsonOpenAiRoute({
                gate: openAiTextGate,
                routeCode: HEARTH_TITLE_ROUTE,
                handle: paidExecutionHandle,
                userId,
                workspaceId: episodeContext.workspaceId!,
                workpieceId: episodeContext.episodeId,
                credentialSource: resolvedCredentials.keySource,
                apiKey: resolvedCredentials.apiKey,
                requestFingerprintPayload: paidFingerprintPayload,
                providerRequestBody: (acceptedModel) => ({
                  model: acceptedModel,
                  reasoning_effort: "none",
                  messages: paidCompletionMessages,
                }),
                signal: upstreamAbort.signal,
                fetchImpl: config.openAiProviderFetch,
                realizedSupportingCost: {
                  amountMicros: 0,
                  authoritative: true,
                  evidence: { evidence_status: "none_verified", classification: "direct_supplier_cost_only" },
                },
                validate: (providerPayload) => {
                  const output = validatePaidTitleOutput(extractAssistantReply(providerPayload), titleContractVersion);
                  if (!output.ok) throw new Error(output.error);
                  return {
                    assistant_text: output.text,
                    titles: output.titles,
                    contract: titleContractVersion === 1 ? HEARTH_TITLE_CONTRACT_V1 : HEARTH_TITLE_CONTRACT,
                    script_approval_id: titleApproval.approvalId,
                    script_approval_revision: titleApproval.approvalRevision,
                    script_content_hash: titleApproval.scriptHash,
                  };
                },
                persist: async (value, providerPayload) => {
                  const usage = isRecord(providerPayload.usage) ? providerPayload.usage : {};
                  const saved = await openAiTextGate.rpc("persist_hearth_title_generation_result", {
                    p_operation_id: paidExecutionHandle!.operationId,
                    p_reservation_id: paidExecutionHandle!.reservationId,
                    p_user_id: userId,
                    p_workspace_id: episodeContext.workspaceId,
                    p_workpiece_id: episodeContext.episodeId,
                    p_request_fingerprint: paidExecutionHandle!.requestFingerprint,
                    p_approval_id: titleApproval.approvalId,
                    p_approval_revision: titleApproval.approvalRevision,
                    p_script_hash: titleApproval.scriptHash,
                    p_provider_request_id: readOptionalString(providerPayload.id),
                    p_input_units: Number(usage.input_tokens ?? usage.prompt_tokens ?? 0),
                    p_output_units: Number(usage.output_tokens ?? usage.completion_tokens ?? 0),
                    p_result_json: value,
                  });
                  if (saved.error || !isRecord(saved.data)) throw new Error(saved.error?.message ?? "Title persistence failed.");
                  return saved.data;
                },
                recover: async () => {
                  const saved = await openAiTextGate.rpc("read_hearth_title_generation_result", {
                    p_operation_id: paidExecutionHandle!.operationId,
                    p_reservation_id: paidExecutionHandle!.reservationId,
                  });
                  if (saved.error || !isRecord(saved.data)) return null;
                  return {
                    result: saved.data,
                    providerRequestId: readOptionalString(saved.data.provider_request_id),
                    inputUnits: Number(saved.data.input_units ?? 0),
                    outputUnits: Number(saved.data.output_units ?? 0),
                  };
                },
              });
              return jsonResponse(200, {
                ok: true,
                assistant_text: paidTitles.result.assistant_text,
                reply: paidTitles.result.assistant_text,
                title_result_id: paidTitles.result.title_result_id,
                script_approval_id: paidTitles.result.script_approval_id,
                script_approval_revision: paidTitles.result.script_approval_revision,
                script_content_hash: paidTitles.result.script_content_hash,
                turn_result: buildTurnResult({ assistantMessage: String(paidTitles.result.assistant_text ?? "") }),
                billing_receipt: paidTitles.receipt,
                ...buildBillingSnapshot(lane),
              });
            }
            if (paidRouteCode === "hearth.script_generation") {
              const paidScript = await executePaidJsonOpenAiRoute({
                gate: openAiTextGate,
                routeCode: "hearth.script_generation",
                handle: paidExecutionHandle,
                userId,
                workspaceId: episodeContext.workspaceId!,
                workpieceId: episodeContext.episodeId,
                credentialSource: resolvedCredentials.keySource,
                apiKey: resolvedCredentials.apiKey,
                requestFingerprintPayload: paidFingerprintPayload,
                providerRequestBody: (acceptedModel) => ({
                  model: acceptedModel,
                  messages: paidCompletionMessages,
                }),
                signal: upstreamAbort.signal,
                fetchImpl: config.openAiProviderFetch,
                realizedSupportingCost: {
                  amountMicros: 0,
                  authoritative: true,
                  evidence: {
                    evidence_status: "none_verified",
                    classification: "direct_supplier_cost_only",
                    fixed_platform_overhead_micros: 0,
                    accounting_allocation_micros: 0,
                  },
                },
                validate: (providerPayload) => {
                  const rawReply = extractAssistantReply(providerPayload);
                  const structured = rawReply ? normalizeStructuredReply(rawReply) : null;
                  if (!structured) throw new Error("Script generation returned no valid Hearth artifact.");
                  structured.ops = filterHearthOperationsForDecision(turnDecision, structured.ops);
                  const validation = validateHearthCompositionArtifact({
                    requestKind: "script",
                    assistantText: structured.assistantText,
                    ops: structured.ops,
                  });
                  const bodyOps = structured.ops.filter((op) => op.op === "set_body");
                  const body = bodyOps[0]?.op === "set_body" ? bodyOps[0].value : null;
                  if (!validation.ok || !structured.scriptText || bodyOps.length !== 1
                    || body !== structured.scriptText || !structured.tagAudit) {
                    throw new Error(validation.error ?? "Script generation failed the strict immutable-proposal contract.");
                  }
                  return {
                    assistant_text: sanitizeHearthUserFacingOutput(structured.assistantText),
                    ops: bodyOps,
                    script_text: structured.scriptText,
                    tag_audit: structured.tagAudit,
                    research_artifact: null,
                  };
                },
                persist: async (value, providerPayload) => {
                  if (!supabaseService) throw new Error("Script proposal persistence is unavailable.");
                  const usage = isRecord(providerPayload.usage) ? providerPayload.usage : {};
                  const persisted = await (supabaseService.schema("tongs") as unknown as {
                    rpc(name: string, args: Record<string, unknown>): Promise<{
                      data: unknown;
                      error: { message?: string } | null;
                    }>;
                  }).rpc("persist_hearth_script_generation_proposal", {
                    p_operation_id: paidExecutionHandle!.operationId,
                    p_reservation_id: paidExecutionHandle!.reservationId,
                    p_user_id: userId,
                    p_workspace_id: episodeContext.workspaceId,
                    p_workpiece_id: episodeContext.episodeId,
                    p_request_fingerprint: paidExecutionHandle!.requestFingerprint,
                    p_provider_request_id: readOptionalString(providerPayload.id),
                    p_input_units: Number(usage.input_tokens ?? usage.prompt_tokens ?? 0),
                    p_output_units: Number(usage.output_tokens ?? usage.completion_tokens ?? 0),
                    p_result_json: value,
                  });
                  if (persisted.error || !isRecord(persisted.data)) {
                    throw new Error(persisted.error?.message ?? "Script proposal persistence failed.");
                  }
                  return persisted.data;
                },
                recover: async () => {
                  if (!supabaseService) return null;
                  const recovered = await (supabaseService.schema("tongs") as unknown as {
                    rpc(name: string, args: Record<string, unknown>): Promise<{
                      data: unknown;
                      error: { message?: string } | null;
                    }>;
                  }).rpc("read_hearth_script_generation_proposal", {
                    p_operation_id: paidExecutionHandle!.operationId,
                    p_reservation_id: paidExecutionHandle!.reservationId,
                  });
                  if (recovered.error || !isRecord(recovered.data)) return null;
                  return {
                    result: recovered.data,
                    providerRequestId: readOptionalString(recovered.data.provider_request_id),
                    inputUnits: Number(recovered.data.input_units ?? 0),
                    outputUnits: Number(recovered.data.output_units ?? 0),
                  };
                },
              });
              const scriptOps = normalizeOps(paidScript.result.ops);
              const scriptText = readOptionalString(paidScript.result.script_text);
              return jsonResponse(200, {
                ok: true,
                assistant_text: paidScript.result.assistant_text,
                reply: paidScript.result.assistant_text,
                ops: scriptOps,
                script_text: scriptText,
                tag_audit: paidScript.result.tag_audit,
                proposal_id: paidScript.result.proposal_id,
                proposal_state: "proposed",
                canonical_draft_applied: false,
                turn_result: buildTurnResult({
                  assistantMessage: String(paidScript.result.assistant_text ?? ""),
                  artifact: scriptText ? { kind: "script", text: scriptText } : null,
                  operations: scriptOps,
                }),
                billing_receipt: paidScript.receipt,
                ...buildBillingSnapshot(lane),
              });
            }
            const ownerCompatibility = ownerHearthRequirement?.authorization_kind === "compatibility_batch";
            const paidGate = ownerHearthRequirement ? withOwnerFundingEnvironment(ownerHearthExecutionGate(openAiTextGate)) : openAiTextGate;
            const paidOutcome = await executePaidHearthChatCompletion({
              gate: paidGate,
              handle: paidExecutionHandle,
              userId,
              workspaceId: episodeContext.workspaceId,
              workpieceId: episodeContext.episodeId,
              credentialSource: resolvedCredentials.keySource,
              apiKey: resolvedCredentials.apiKey,
              messages: paidCompletionMessages,
              signal: upstreamAbort.signal,
              providerFetch: config.openAiProviderFetch,
              validateAndNormalize: (rawReply) => {
                if (ownerCompatibility && rawReply.trim() !== "Ready.") {
                  throw new Error("Owner compatibility response did not exactly match Ready.");
                }
                const structured = normalizeStructuredReply(rawReply) ?? {
                  assistantText: rawReply,
                  ops: [],
                  scriptText: null,
                  tagAudit: null,
                  researchArtifact: null,
                };
                structured.assistantText = enforceHearthEditorialHonesty({
                  assistantText: structured.assistantText,
                  requestText,
                });
                structured.assistantText = sanitizeHearthUserFacingOutput(structured.assistantText);
                const compositionValidation = validateHearthCompositionArtifact({
                  requestText,
                  assistantText: structured.assistantText,
                  ops: structured.ops,
                });
                if (!compositionValidation.ok) {
                  throw new Error(compositionValidation.error ?? "Hearth composition validation failed");
                }
                if (!structured.assistantText && structured.ops.length === 0) {
                  throw new Error("Assistant returned an invalid response");
                }
                return {
                  assistantText: structured.assistantText,
                  ops: structured.ops,
                  scriptText: structured.scriptText,
                  tagAudit: structured.tagAudit,
                };
              },
            });
            if (ownerCompatibility) {
              const ownerCompatibilityStatus = paidOutcome.state === "settled" || paidOutcome.state === "settled_replay"
                ? "passed"
                : paidOutcome.state === "submission_unknown"
                  ? "ambiguous"
                  : paidOutcome.state === "failed_released"
                    && (paidOutcome.requestId !== null || paidOutcome.supplierCostMicros !== null)
                    ? "billed_failure"
                    : "definitive_rejection";
              await recordOwnerCompatibilityOutcome({
                gate: openAiTextGate,
                reservationId: paidOutcome.context.reservationId,
                status: ownerCompatibilityStatus,
                providerRequestId: paidOutcome.state === "settled" || paidOutcome.state === "settled_replay"
                  ? paidOutcome.requestId
                  : paidOutcome.state === "failed_released" ? paidOutcome.requestId : null,
                estimatedSupplierExpenseMicros: paidOutcome.state === "failed_released"
                  ? paidOutcome.supplierCostMicros
                  : null,
                evidence: {
                  provider_response_captured: paidOutcome.state === "settled" || paidOutcome.state === "settled_replay",
                  result_validated: paidOutcome.state === "settled" || paidOutcome.state === "settled_replay",
                  canonical_result_persisted: paidOutcome.state === "settled" || paidOutcome.state === "settled_replay",
                  operation_settled_estimated: paidOutcome.state === "settled" || paidOutcome.state === "settled_replay",
                  provider_cost_reconciled_authoritative: false,
                  billed_provider_failure: ownerCompatibilityStatus === "billed_failure",
                  duplicate_replay: paidOutcome.state === "settled_replay",
                },
              });
            }
            const billingReceipt = {
              operation_id: paidOutcome.context.operationId,
              reservation_id: paidOutcome.context.reservationId,
              status: paidOutcome.state,
              funding_source: paidOutcome.context.fundingSourceType,
              customer_charge_micros: paidOutcome.state === "settled" || paidOutcome.state === "settled_replay"
                ? paidOutcome.customerChargeMicros
                : 0,
              provider_request_id: paidOutcome.state === "settled" || paidOutcome.state === "settled_replay"
                ? paidOutcome.requestId
                : null,
            };
            if (paidOutcome.state === "submission_unknown") {
              return jsonResponse(202, {
                ok: false,
                error: "The provider submission outcome is unresolved. Forge will not submit it again automatically.",
                code: "paid_submission_unknown",
                billing_receipt: billingReceipt,
                ...buildBillingSnapshot(lane),
              });
            }
            if (paidOutcome.state === "duplicate_in_progress") {
              return jsonResponse(409, {
                ok: false,
                error: "This operation is already in progress; no duplicate provider call was made.",
                code: "paid_operation_in_progress",
                billing_receipt: billingReceipt,
                ...buildBillingSnapshot(lane),
              });
            }
            if (paidOutcome.state === "failed_released") {
              return jsonResponse(502, {
                ok: false,
                error: "The AI operation failed. The customer reservation was released with no charge.",
                code: "paid_operation_failed_released",
                billing_receipt: billingReceipt,
                ...buildBillingSnapshot(lane),
              });
            }
            const spent = paidOutcome.inputUnits + paidOutcome.outputUnits;
            const paidResearchArtifact: HearthValidatedArtifact | null = researchResult?.artifact
              ? { kind: "research", value: researchResult }
              : null;
            return jsonResponse(200, {
              ok: true,
              assistant_text: paidOutcome.result.assistantText,
              reply: paidOutcome.result.assistantText,
              ops: paidOutcome.result.ops,
              script_text: paidOutcome.result.scriptText,
              tag_audit: paidOutcome.result.tagAudit,
              turn_result: buildTurnResult({
                assistantMessage: paidOutcome.result.assistantText,
                artifact: paidResearchArtifact,
                operations: normalizeOps(paidOutcome.result.ops),
              }),
              total_tokens: spent,
              billable_tokens: 0,
              credits_warning: null,
              billing_receipt: billingReceipt,
              ...buildBillingSnapshot(lane),
              ...resolutionSnapshot,
            });
          } catch (error) {
            if (clientAborted || upstreamAbort.signal.aborted) {
              return new Response(null, { status: 499 });
            }
            if (error instanceof PaidJsonOpenAiRouteError) {
              const status = error.state === "submission_unknown" ? 202
                : error.state === "duplicate_in_progress" ? 409 : 502;
              return jsonResponse(status, {
                ok: false,
                error: error.state === "submission_unknown"
                  ? "The provider submission outcome is unresolved. Forge will not submit it again automatically."
                  : error.state === "duplicate_in_progress"
                    ? "This operation is already in progress; no duplicate provider call was made."
                    : "The AI operation failed. The customer reservation was released with no charge.",
                code: error.state === "submission_unknown"
                  ? "paid_submission_unknown"
                  : error.state === "duplicate_in_progress"
                    ? "paid_operation_in_progress"
                    : "paid_operation_failed_released",
                ...buildBillingSnapshot(lane),
              });
            }
            if (error instanceof OpenAiTextPostPersistenceContinuationError) {
              return jsonResponse(502, {
                ok: false,
                error: "Hearth retained the generated result, but could not finish its billing continuation. No second provider request will be made automatically.",
                code: "paid_persistence_continuation_failed",
                ...buildBillingSnapshot(lane),
              });
            }
            const boundaryCode = error instanceof OpenAiTextBoundaryError ? error.code : null;
            const code = boundaryCode === "byo_credential_required"
              ? "byo_credential_required"
              : boundaryCode === "platform_risk_unavailable"
                ? "platform_risk_unavailable"
                : "paid_execution_denied";
            return jsonResponse(code === "byo_credential_required" ? 422 : code === "platform_risk_unavailable" ? 503 : 403, {
              ok: false,
              error: code === "byo_credential_required"
                ? "The exact customer-owned OpenAI credential required by this quote is unavailable."
                : code === "platform_risk_unavailable"
                  ? "Hearth is temporarily unable to start this AI operation. No credits were charged."
                  : "The accepted funding context did not authorize this provider call.",
              code,
              ...buildBillingSnapshot(lane),
            });
          }
        }

        let upstream: Response;
        let usedTemperatureOverride = modelAllowsTemperatureOverride;
        try {
          upstream = await callOpenAi(model, usedTemperatureOverride);
        } catch (error) {
          if (clientAborted || upstreamAbort.signal.aborted) {
            return new Response(null, { status: 499 });
          }
          const providerFailure = compositionProviderFailureResponse(null);
          if (providerFailure) return providerFailure;
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
              const providerFailure = compositionProviderFailureResponse(null);
              if (providerFailure) return providerFailure;
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
                const providerFailure = compositionProviderFailureResponse(null);
                if (providerFailure) return providerFailure;
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
            const providerFailure = compositionProviderFailureResponse(upstream.status);
            if (providerFailure) return providerFailure;
            return jsonResponse(status, {
              ok: false,
              error: upstreamMessage,
              detail,
              turn_result: buildTurnResult({
                assistantMessage: "",
                failureKind: "provider_failure",
                failureMessage: upstreamMessage,
              }),
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
          const error = "OpenAI returned empty response";
          return jsonResponse(502, {
            ok: false,
            error,
            turn_result: buildTurnResult({
              assistantMessage: "",
              failureKind: "invalid_model_output",
              failureMessage: error,
            }),
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
        structured.ops = filterHearthOperationsForDecision(turnDecision, structured.ops);

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
          const reconciledArtifact = reconcileCreatorSuppliedResearchArtifact(researchResult);
          researchResult = {
            ...researchResult,
            artifact: reconciledArtifact,
          };
          structured.researchArtifact = reconciledArtifact;
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

        let compositionValidation = validateHearthCompositionArtifact({
          requestKind: compositionRequestKind,
          assistantText: structured.assistantText,
          ops: structured.ops,
        });
        let compositionRepairAttempted = false;
        if (
          !productionAction
          && !compositionValidation.ok
          && compositionRequestKind
          && !researchModeRequested
          && !readinessCheckRequested
          && !crossProjectReference.detected
        ) {
          compositionRepairAttempted = true;
          const repairInstruction = compositionRequestKind === "outline"
            ? [
                "Your prior response announced an outline but did not contain one.",
                "Return ONLY valid JSON in the required Hearth response shape.",
                "Include either actual bullet/section content in assistantText or a set_outline operation whose value contains actual bullets.",
                "At least one line must begin with -, *, •, or a number, or be a clearly labeled section with substantive content.",
                "Do not return an introductory sentence without the outline.",
              ].join("\n")
            : [
                "Your prior response announced composed script material but did not contain a usable script artifact.",
                "Return ONLY valid JSON in the required Hearth response shape.",
                "Include substantive canonical Anvil script content in script_text and a matching set_body operation.",
                "Do not return an introductory sentence without the script content.",
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
            repairStructured.ops = filterHearthOperationsForDecision(turnDecision, repairStructured.ops);
            repairStructured.assistantText = enforceHearthEditorialHonesty({
              assistantText: repairStructured.assistantText,
              requestText,
            });
            repairStructured.assistantText = sanitizeHearthUserFacingOutput(repairStructured.assistantText);
            const repairedValidation = validateHearthCompositionArtifact({
              requestKind: compositionRequestKind,
              assistantText: repairStructured.assistantText,
              ops: repairStructured.ops,
            });
            if (repairedValidation.ok) {
              payload = repairPayload;
              rawReply = repairRawReply;
              structured = repairStructured;
              compositionValidation = repairedValidation;
              upstream = repairUpstream;
            }
          }
        }

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
              turn_result: buildTurnResult({
                assistantMessage: "",
                failureKind: "invalid_model_output",
                failureMessage: productionValidation.error,
              }),
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

        structured.ops = filterHearthOperationsForDecision(turnDecision, structured.ops);

        if (!productionAction && !compositionValidation.ok) {
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
          return jsonResponse(422, {
            ok: false,
            error: compositionValidation.error,
            code: "invalid_composition_output",
            artifact_kind: compositionValidation.kind,
            repair_attempted: compositionRepairAttempted,
            billable_tokens: 0,
            turn_result: buildTurnResult({
              assistantMessage: "",
              failureKind: "invalid_model_output",
              failureMessage: compositionValidation.error,
            }),
            ...buildBillingSnapshot(lane),
            ...resolutionSnapshot,
          });
        }

        if (!structured.assistantText && structured.ops.length === 0) {
          const error = "Assistant returned an invalid response";
          return jsonResponse(502, {
            ok: false,
            error,
            turn_result: buildTurnResult({
              assistantMessage: "",
              failureKind: "invalid_model_output",
              failureMessage: error,
            }),
            ...buildBillingSnapshot(lane),
          });
        }

        const hasOutlineOp = structured.ops.some((op) => op.op === "set_outline");
        const hasBodyOp = structured.ops.some((op) => op.op === "set_body");
        if (turnDecision.mode === "outline_generate" || turnDecision.mode === "script_generate" || turnDecision.mode === "script_mutate") {
          const generatedEventType = turnDecision.mode === "outline_generate" ? "outline_generated" : "draft_generated";
          await recordHearthEventForToken({
            accessToken: bearerToken,
            episodeId: episodeContext.episodeId,
            eventType: generatedEventType,
            payload: {
              source: "middleware",
              ops_count: structured.ops.length,
              has_outline_op: hasOutlineOp,
              has_body_op: hasBodyOp,
              requested_outline: turnDecision.mode === "outline_generate",
              requested_script: turnDecision.mode === "script_generate" || turnDecision.mode === "script_mutate",
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

        const outlineText = readLatestSubstantiveOutlineFromOps(structured.ops)
          ?? (hasSubstantiveHearthOutline(structured.assistantText) ? structured.assistantText : null);
        const scriptText = readLatestSubstantiveScriptFromOps(structured.ops)
          ?? (structured.scriptText && hasSubstantiveHearthScript(structured.scriptText) ? structured.scriptText : null);
        const validatedArtifact: HearthValidatedArtifact | null = turnDecision.mode === "research" && researchResult?.artifact
          ? { kind: "research", value: researchResult }
          : turnDecision.mode === "outline_generate" && outlineText
            ? { kind: "outline", text: outlineText }
            : (turnDecision.mode === "script_generate" || turnDecision.mode === "script_mutate") && scriptText
              ? { kind: "script", text: scriptText }
              : turnDecision.mode === "production_action" && structured.assistantText
                ? { kind: "production", action: productionAction!, value: structured.assistantText }
                : null;
        const turnResult = buildTurnResult({
          assistantMessage: structured.assistantText,
          artifact: validatedArtifact,
          operations: structured.ops,
        });

        return jsonResponse(200, {
          ok: true,
          turn_result: turnResult,
          assistant_text: structured.assistantText,
          reply: structured.assistantText,
          ops: structured.ops,
          script_text: scriptText,
          tag_audit: structured.tagAudit,
          ...(turnDecision.mode === "research" && researchResult ? { research_result: researchResult } : {}),
          ...(turnDecision.mode === "research" && researchResult ? {
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
