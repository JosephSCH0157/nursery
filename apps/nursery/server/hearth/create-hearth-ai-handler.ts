import crypto from "node:crypto";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@forge/tongs";
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

type ReqBody = {
  messages?: unknown;
  episode_context?: unknown;
  behavior?: unknown;
  lane?: unknown;
};

type SttReqBody = {
  workpiece_id?: unknown;
  storage_key?: unknown;
  mime_type?: unknown;
  lane?: unknown;
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

function shouldAskClarifyingQuestions(args: {
  requestText: string;
  profile: CreatorProfile;
  chatHistory: ChatMessage[];
}): boolean {
  const requestWordCount = compactSpaces(args.requestText)
    .split(/\s+/)
    .filter(Boolean)
    .length;
  if (isProductionSupportRequest(args.requestText)) return false;
  if (hasExplicitDraftNow(args.requestText)) return false;
  if (hasExplicitDeliverableKeyword(args.requestText)) return false;
  if (hasCreativeStateSignal(args.requestText)) return false;
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

function extractRpcTokenBalance(payload: unknown): number | null {
  const row = Array.isArray(payload) ? payload[0] : payload;
  if (!row || typeof row !== "object") return null;
  const tokenBalance = (row as Record<string, unknown>).token_balance;
  return typeof tokenBalance === "number" && Number.isFinite(tokenBalance) && tokenBalance >= 0
    ? tokenBalance
    : null;
}

function buildSystemPrompt(
  context: EpisodeContext,
  creatorStyleSnippet?: string,
  options?: {
    readinessCheck?: boolean;
    allowRepeatedReadinessNudge?: boolean;
    priorReadinessNudge?: ReadinessNudgeCategory | null;
  },
): string {
  const baseLines = [
    "You are Hearth.",
    "Primary identity: smart producer + trusted writing partner + calm friend in the room.",
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
    "- Avoid repetitive cadence like: Would you like me to... unless that exact question is genuinely necessary.",
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

function extractTotalTokens(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const usage = (payload as Record<string, unknown>).usage;
  if (!usage || typeof usage !== "object") return null;
  const total = (usage as Record<string, unknown>).total_tokens;
  return typeof total === "number" && Number.isFinite(total) && total >= 0 ? total : null;
}

function extractTranscriptionText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const text = (payload as Record<string, unknown>).text;
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  return trimmed || null;
}

function estimateTranscriptionTokenFallback(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
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

export function createHearthAiHandler(config: HearthRuntimeConfig) {
  const textApiKey = config.textApiKey ?? config.apiKey ?? null;
  const {
    model,
    sttModel,
    configuredBillingMode,
    supabaseUrl,
    supabaseServiceRoleKey,
    supabaseRpcKey,
    sttBucket,
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
    if (!supabaseService) {
      console.warn("[hearth-chat-api] apply_ai_token_delta skipped: supabase service env missing");
      return { ok: false, warning: "Unable to update credits." };
    }

    const rpcClient = supabaseService.schema("tongs") as unknown as {
      rpc: (
        fn: string,
        params: {
          p_user_id: string;
          p_delta: number;
          p_reason: string;
          p_request_id: string;
          p_provider_request_id?: string;
        },
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };

    const { data, error } = await rpcClient.rpc("apply_ai_token_delta", {
      p_user_id: args.userId,
      p_delta: -args.spent,
      p_reason: args.reason,
      p_request_id: args.requestId,
      p_provider_request_id: args.openAiRequestId ?? undefined,
    });

    if (error) {
      console.warn("[hearth-chat-api] apply_ai_token_delta failed", {
        message: error.message,
        request_id: args.requestId,
        openai_request_id: args.openAiRequestId,
      });
      return { ok: false, warning: "Unable to update credits." };
    }

    return {
      ok: true,
      tokenBalance: extractRpcTokenBalance(data),
    };
  }

  return async function hearthAiHandler(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const pathname = url.pathname;

      if (
        pathname !== HEARTH_AI_ROUTES.chat
        && pathname !== HEARTH_AI_ROUTES.chatStatus
        && pathname !== HEARTH_AI_ROUTES.stt
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

      if (pathname === HEARTH_AI_ROUTES.stt) {
        if (method !== "POST") {
          return jsonResponse(405, { ok: false, error: "Method not allowed" });
        }

        const bodyRaw = (await readJsonBody(request)) as SttReqBody;
        const lane: BillingMode = isBillingMode(bodyRaw.lane) ? bodyRaw.lane : configuredBillingMode;
        const bearerToken = readBearerToken(request.headers.get("authorization"));

        if (!textApiKey) {
          return jsonResponse(500, {
            ok: false,
            error: MISSING_OPENAI_TEXT_API_KEY_ERROR,
            ...buildBillingSnapshot(lane),
          });
        }

        if (lane === "forge" && tokenBalance != null && tokenBalance <= 0) {
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
            upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
              method: "POST",
              headers: {
                authorization: `Bearer ${textApiKey}`,
              },
              body: form,
              signal: upstreamAbort.signal,
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
            return jsonResponse(502, {
              ok: false,
              error: "OpenAI returned empty transcription",
              ...buildBillingSnapshot(lane),
            });
          }

          const totalTokens = extractTotalTokens(payload) ?? estimateTranscriptionTokenFallback(text);
          const openAiRequestId = upstream.headers.get("x-request-id");
          let creditsWarning: string | null = null;

          if (lane === "forge" && totalTokens > 0) {
            const deltaResult = await applyTokenDelta({
              userId,
              spent: totalTokens,
              requestId: crypto.randomUUID(),
              openAiRequestId,
              reason: "speech_transcription",
            });
            if (!deltaResult.ok) {
              creditsWarning = deltaResult.warning;
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

      if (!textApiKey) {
        return jsonResponse(500, {
          ok: false,
          error: MISSING_OPENAI_TEXT_API_KEY_ERROR,
          ...buildBillingSnapshot(lane),
        });
      }

      if (lane === "forge" && tokenBalance != null && tokenBalance <= 0) {
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
      const priorMessages = typeof latestUserMessageIndex === "number"
        ? messages.filter((_, index) => index !== latestUserMessageIndex)
        : messages;
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
          return fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              authorization: `Bearer ${textApiKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify(payload),
            signal: upstreamAbort.signal,
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
        const openAiRequestId = upstream.headers.get("x-request-id");
        let creditsWarning: string | null = null;

        if (lane === "forge" && spent > 0) {
          const userId = await resolveUserId(bearerToken);
          if (!userId) {
            creditsWarning = "Unable to update credits.";
          } else {
            const deltaResult = await applyTokenDelta({
              userId,
              spent,
              requestId: crypto.randomUUID(),
              openAiRequestId,
              reason: "hearth:chat",
            });
            if (!deltaResult.ok) {
              creditsWarning = deltaResult.warning;
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
          total_tokens: spent,
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
