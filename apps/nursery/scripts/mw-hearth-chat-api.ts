import type { IncomingMessage, ServerResponse } from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@forge/tongs";

type Next = (err?: unknown) => void;

type ChatRole = "system" | "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };
type BillingMode = "forge" | "byo";
type HearthOp =
  | { op: "set_title_variant"; slot: "A" | "B" | "C"; value: string }
  | { op: "set_title"; value: string }
  | { op: "set_outline"; value: string }
  | { op: "set_body"; value: string }
  | { op: "add_source"; source: { title?: string; url?: string; note?: string } }
  | { op: "update_source"; id: string; patch: { title?: string; url?: string; note?: string } }
  | { op: "remove_source"; id: string };

type EpisodeContext = {
  episodeId: string;
  title: string;
  titleVariants: { A: string; B: string; C: string };
  outline: string;
  body: string;
  sources: Array<{
    id: string;
    title: string;
    url: string;
    note: string;
    citedIn: string[];
  }>;
  sparks: Array<{ id: string; text: string }>;
};

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_ROOT = path.join(__dirname, "..");
const ENV_FILES = [".env.local", ".env"];
const CHAT_ROUTE = "/api/hearth/chat";
const CHAT_STATUS_ROUTE = "/api/hearth/chat/status";
const STT_ROUTE = "/api/hearth/stt";
const STT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_STT_MODEL = "gpt-4o-mini-transcribe";
const DEFAULT_STT_BUCKET = "forge-workpieces";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) {
      process.env[key] = value;
    }
  }
}

for (const filename of ENV_FILES) {
  loadEnvFile(path.join(ENV_ROOT, filename));
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function sendJson(res: ServerResponse, status: number, obj: unknown): void {
  const body = JSON.stringify(obj);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(body);
}

function readIntegerEnv(name: string): number | null {
  const raw = readEnv(name);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return null;
  return parsed >= 0 ? parsed : null;
}

function readBearerToken(headerValue: string | string[] | undefined): string | null {
  if (!headerValue) return null;
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return null;
  const token = trimmed.slice(7).trim();
  return token || null;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const method = (req.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return {};
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    });
    req.on("end", () => {
      if (!data.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
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

function shouldAskClarifyingQuestions(args: {
  requestText: string;
  profile: CreatorProfile;
  chatHistory: ChatMessage[];
}): boolean {
  if (isProductionSupportRequest(args.requestText)) return false;
  if (hasExplicitDraftNow(args.requestText)) return false;
  if (hasExplicitDeliverableKeyword(args.requestText)) return false;
  if (args.profile.clarifyFirstBias >= 0.6) return true;
  if (hasBroadAboutTopic(args.requestText)) return true;
  if (!historyHasAngleToneSignals(args.chatHistory)) return true;
  return false;
}

function buildClarifyingQuestionReply(profile: CreatorProfile): string {
  const riskLine = profile.riskSensitivity >= 0.65
    ? "2) Tone/risk: keep it safer and source-forward, or allow light heat?"
    : "2) Tone/risk: neutral-conversational, newsroom-neutral, or spicy-but-safe?";
  return [
    "Before I draft, answer these quick producer questions:",
    "1) Angle: what is the main claim or takeaway for this Episode?",
    riskLine,
    "3) Format: outline first or full script (S1/S2)?",
    "Answer these and I'll generate an outline/script.",
  ].join("\n");
}

function buildProfileStyleSnippet(profile: CreatorProfile, requestText: string): string {
  const lines = ["Creator Profile Guidance (soft):"];

  if (profile.toneStyle === "neutral_conversational") {
    lines.push("- Prefer neutral conversational language over newsroom stiffness.");
  } else if (profile.toneStyle === "newsroom_neutral") {
    lines.push("- Keep tone newsroom-neutral, precise, and low-heat.");
  } else if (profile.toneStyle === "spicy_but_safe") {
    lines.push("- Keep voice punchy but safe: clear claims, no reckless hot takes.");
  } else {
    lines.push(`- Respect preferred tone style: ${profile.toneStyle}.`);
  }

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

function isRole(value: unknown): value is ChatRole {
  return value === "system" || value === "user" || value === "assistant";
}

function isBillingMode(value: unknown): value is BillingMode {
  return value === "forge" || value === "byo";
}

function toChatMessage(value: unknown): ChatMessage | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!isRole(row.role)) return null;
  if (typeof row.content !== "string") return null;
  const content = row.content.trim();
  if (!content) return null;
  return {
    role: row.role,
    content,
  };
}

function readBehaviorTemperature(value: unknown): number {
  const behavior = readOptionalString(value);
  if (behavior === "deterministic") return 0.1;
  if (behavior === "careful") return 0.25;
  if (behavior === "creative") return 0.9;
  if (behavior === "fast") return 0.7;
  return 0.25;
}

function normalizeEpisodeContext(value: unknown): EpisodeContext | null {
  if (!isRecord(value)) return null;
  const episodeId = readOptionalString(value.episodeId);
  if (!episodeId) return null;

  const titleVariantsRaw = isRecord(value.titleVariants) ? value.titleVariants : {};
  const titleVariants = {
    A: readOptionalString(titleVariantsRaw.A) ?? "",
    B: readOptionalString(titleVariantsRaw.B) ?? "",
    C: readOptionalString(titleVariantsRaw.C) ?? "",
  };

  const sourcesRaw = Array.isArray(value.sources) ? value.sources : [];
  const sources = sourcesRaw
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const id = readOptionalString(entry.id);
      if (!id) return null;
      const citedInRaw = Array.isArray(entry.citedIn) ? entry.citedIn : [];
      const citedIn = citedInRaw
        .map((token) => readOptionalString(token))
        .filter((token): token is string => !!token);
      return {
        id,
        title: readOptionalString(entry.title) ?? "",
        url: readOptionalString(entry.url) ?? "",
        note: readOptionalString(entry.note) ?? "",
        citedIn,
      };
    })
    .filter((entry): entry is EpisodeContext["sources"][number] => !!entry);

  const sparksRaw = Array.isArray(value.sparks) ? value.sparks : [];
  const sparks = sparksRaw
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const id = readOptionalString(entry.id);
      if (!id) return null;
      return {
        id,
        text: readOptionalString(entry.text) ?? "",
      };
    })
    .filter((entry): entry is EpisodeContext["sparks"][number] => !!entry);

  return {
    episodeId,
    title: readOptionalString(value.title) ?? "",
    titleVariants,
    outline: readOptionalString(value.outline) ?? "",
    body: readOptionalString(value.body) ?? "",
    sources,
    sparks,
  };
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
    "- Use ops only for concrete edits requested by the user.",
    "- If the user only asks a question, return ops as [].",
    "- Do not invent source ids for update/remove ops.",
    "- When proposing or returning a script body, include script_text and tag_audit.",
    "- tag_audit must briefly confirm closure, standalone tags, and no markdown/random markup.",
    "- Keep output strictly JSON (no code fences).",
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

function normalizeOpPatch(value: unknown): { title?: string; url?: string; note?: string } | null {
  if (!isRecord(value)) return null;
  const title = readOptionalString(value.title) ?? undefined;
  const url = readOptionalString(value.url) ?? undefined;
  const note = readOptionalString(value.note) ?? undefined;
  if (!title && !url && !note) return null;
  return {
    ...(title ? { title } : {}),
    ...(url ? { url } : {}),
    ...(note ? { note } : {}),
  };
}

function normalizeOps(value: unknown): HearthOp[] {
  if (!Array.isArray(value)) return [];
  const out: HearthOp[] = [];

  for (const item of value) {
    if (!isRecord(item)) continue;
    const op = readOptionalString(item.op);
    if (!op) continue;

    if (op === "set_title") {
      const next = readOptionalString(item.value);
      if (next != null) out.push({ op, value: next });
      continue;
    }

    if (op === "set_title_variant") {
      const slot = readOptionalString(item.slot);
      const valueText = readOptionalString(item.value);
      if ((slot === "A" || slot === "B" || slot === "C") && valueText != null) {
        out.push({ op, slot, value: valueText });
      }
      continue;
    }

    if (op === "set_outline") {
      const next = readOptionalString(item.value);
      if (next != null) out.push({ op, value: next });
      continue;
    }

    if (op === "set_body") {
      const next = readOptionalString(item.value);
      if (next != null) out.push({ op, value: next });
      continue;
    }

    if (op === "add_source") {
      const source = normalizeOpPatch(item.source);
      if (source) out.push({ op, source });
      continue;
    }

    if (op === "update_source") {
      const id = readOptionalString(item.id);
      const patch = normalizeOpPatch(item.patch);
      if (id && patch) out.push({ op, id, patch });
      continue;
    }

    if (op === "remove_source") {
      const id = readOptionalString(item.id);
      if (id) out.push({ op, id });
      continue;
    }
  }

  return out;
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
  if (!assistantText && ops.length === 0) return null;
  const inferredScriptText = scriptText
    ?? (ops.find((op) => op.op === "set_body") as { op: "set_body"; value: string } | undefined)?.value
    ?? null;
  const tagAudit = isRecord(parsed.tag_audit)
    ? parsed.tag_audit
    : buildTagAuditFromScript(inferredScriptText);
  return {
    assistantText,
    ops,
    scriptText: inferredScriptText,
    tagAudit,
  };
}

export function mwHearthChatApi() {
  const apiKey = readEnv("OPENAI_API_KEY");
  const model = readEnv("HEARTH_AI_MODEL") || "gpt-5";
  const sttModel = readEnv("HEARTH_STT_MODEL") || DEFAULT_STT_MODEL;
  const configuredBillingMode: BillingMode = readEnv("HEARTH_AI_BILLING_MODE") === "byo" ? "byo" : "forge";
  let tokenBalance = readIntegerEnv("HEARTH_AI_TOKEN_BALANCE") ?? 12430;
  const supabaseUrl = readEnv("TONGS_SUPABASE_URL") || readEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = readEnv("TONGS_SERVICE_ROLE_KEY") || readEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseRpcKey = (
    readEnv("TONGS_SUPABASE_ANON_KEY")
    || readEnv("SUPABASE_ANON_KEY")
    || readEnv("VITE_SUPABASE_ANON_KEY")
    || supabaseServiceRoleKey
  );
  const sttBucket = (
    readEnv("TONGS_WORKPIECE_BUCKET")
    || readEnv("HEARTH_STT_BUCKET")
    || DEFAULT_STT_BUCKET
  ).trim();
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

  return async function hearthChatMiddleware(req: IncomingMessage, res: ServerResponse, next: Next) {
    try {
      const rawUrl = req.url || "";
      const origin = `http://${req.headers.host || "localhost"}`;
      const url = new URL(rawUrl, origin);
      const pathname = url.pathname;

      if (pathname !== CHAT_ROUTE && pathname !== CHAT_STATUS_ROUTE && pathname !== STT_ROUTE) {
        next();
        return;
      }

      const method = (req.method || "GET").toUpperCase();

      if (pathname === CHAT_STATUS_ROUTE) {
        if (method !== "GET") {
          sendJson(res, 405, { ok: false, error: "Method not allowed" });
          return;
        }
        const laneParam = url.searchParams.get("lane");
        const lane: BillingMode = isBillingMode(laneParam) ? laneParam : configuredBillingMode;
        sendJson(res, 200, {
          ok: true,
          ...buildBillingSnapshot(lane),
        });
        return;
      }

      if (pathname === STT_ROUTE) {
        if (method !== "POST") {
          sendJson(res, 405, { ok: false, error: "Method not allowed" });
          return;
        }

        const bodyRaw = (await readJsonBody(req)) as SttReqBody;
        const lane: BillingMode = isBillingMode(bodyRaw.lane) ? bodyRaw.lane : configuredBillingMode;
        const bearerToken = readBearerToken(req.headers.authorization);

        if (!apiKey) {
          sendJson(res, 500, {
            ok: false,
            error: "Missing OPENAI_API_KEY in server env",
            ...buildBillingSnapshot(lane),
          });
          return;
        }

        if (lane === "forge" && tokenBalance != null && tokenBalance <= 0) {
          sendJson(res, 402, {
            ok: false,
            error: "No AI credits remaining.",
            ...buildBillingSnapshot(lane),
          });
          return;
        }

        if (!supabaseService) {
          sendJson(res, 500, {
            ok: false,
            error: "Supabase service role is not configured.",
            ...buildBillingSnapshot(lane),
          });
          return;
        }

        const userId = await resolveUserId(bearerToken);
        if (!userId) {
          sendJson(res, 401, {
            ok: false,
            error: "Authentication required.",
            ...buildBillingSnapshot(lane),
          });
          return;
        }

        const workpieceId = readOptionalString(bodyRaw.workpiece_id);
        const storageKey = readOptionalString(bodyRaw.storage_key);
        const mimeType = readOptionalString(bodyRaw.mime_type);

        if (!workpieceId || !storageKey) {
          sendJson(res, 400, {
            ok: false,
            error: "workpiece_id and storage_key are required",
            ...buildBillingSnapshot(lane),
          });
          return;
        }

        const expectedPrefix = `workpieces/${workpieceId}/stt/`;
        if (!storageKey.startsWith(expectedPrefix)) {
          sendJson(res, 400, {
            ok: false,
            error: "storage_key must be inside workpiece STT path",
            ...buildBillingSnapshot(lane),
          });
          return;
        }

        const { data: audioBlob, error: downloadError } = await supabaseService.storage
          .from(sttBucket)
          .download(storageKey);

        if (downloadError || !audioBlob) {
          sendJson(res, 404, {
            ok: false,
            error: downloadError?.message || "Audio file not found.",
            ...buildBillingSnapshot(lane),
          });
          return;
        }

        if (audioBlob.size <= 0) {
          sendJson(res, 400, {
            ok: false,
            error: "Audio file is empty.",
            ...buildBillingSnapshot(lane),
          });
          return;
        }

        if (audioBlob.size > STT_MAX_BYTES) {
          sendJson(res, 413, {
            ok: false,
            error: "Audio file exceeds 10MB limit.",
            ...buildBillingSnapshot(lane),
          });
          return;
        }

        const ext = inferAudioExtension(mimeType || audioBlob.type || null, storageKey);
        const form = new FormData();
        form.set("model", sttModel);
        form.set("file", audioBlob, `speech.${ext}`);

        const upstreamAbort = new AbortController();
        let clientAborted = req.aborted === true;
        const onAborted = () => {
          clientAborted = true;
          upstreamAbort.abort();
        };
        req.once("aborted", onAborted);

        try {
          let upstream: Response;
          try {
            upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
              method: "POST",
              headers: {
                authorization: `Bearer ${apiKey}`,
              },
              body: form,
              signal: upstreamAbort.signal,
            });
          } catch (error) {
            if (clientAborted || upstreamAbort.signal.aborted) {
              return;
            }
            throw error;
          }

          if (clientAborted) {
            return;
          }

          if (!upstream.ok) {
            const detail = await upstream.text();
            const upstreamMessage = readUpstreamErrorMessage(detail) ?? "OpenAI error";
            const status = upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 502;
            sendJson(res, status, {
              ok: false,
              error: upstreamMessage,
              detail,
              ...buildBillingSnapshot(lane),
            });
            return;
          }

          const payload = (await upstream.json()) as unknown;
          const text = extractTranscriptionText(payload);
          if (!text) {
            sendJson(res, 502, {
              ok: false,
              error: "OpenAI returned empty transcription",
              ...buildBillingSnapshot(lane),
            });
            return;
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

          if (clientAborted || req.aborted) {
            return;
          }

          sendJson(res, 200, {
            ok: true,
            text,
            total_tokens: totalTokens,
            provider_request_id: openAiRequestId,
            credits_warning: creditsWarning,
            ...buildBillingSnapshot(lane),
          });
        } finally {
          req.removeListener("aborted", onAborted);
        }
        return;
      }

      if (method !== "POST") {
        sendJson(res, 405, { ok: false, error: "Method not allowed" });
        return;
      }

      const bodyRaw = (await readJsonBody(req)) as ReqBody;
      const lane: BillingMode = isBillingMode(bodyRaw.lane) ? bodyRaw.lane : configuredBillingMode;
      const bearerToken = readBearerToken(req.headers.authorization);

      if (!apiKey) {
        sendJson(res, 500, {
          ok: false,
          error: "Missing OPENAI_API_KEY in server env",
          ...buildBillingSnapshot(lane),
        });
        return;
      }

      if (lane === "forge" && tokenBalance != null && tokenBalance <= 0) {
        sendJson(res, 402, {
          ok: false,
          error: "No AI credits remaining.",
          ...buildBillingSnapshot(lane),
        });
        return;
      }

      const rawMessages = Array.isArray(bodyRaw.messages) ? bodyRaw.messages : [];
      const messages = rawMessages
        .map(toChatMessage)
        .filter((item): item is ChatMessage => Boolean(item))
        .slice(-24);

      if (!messages.length) {
        sendJson(res, 400, {
          ok: false,
          error: "messages are required",
          ...buildBillingSnapshot(lane),
        });
        return;
      }

      const episodeContext = normalizeEpisodeContext(bodyRaw.episode_context);
      if (!episodeContext) {
        sendJson(res, 400, {
          ok: false,
          error: "episode_context with episodeId is required",
          ...buildBillingSnapshot(lane),
        });
        return;
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

        sendJson(res, 200, {
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
        return;
      }

      const system: ChatMessage = {
        role: "system",
        content: buildSystemPrompt(
          episodeContext,
          buildProfileStyleSnippet(creatorProfile, requestText),
          {
            readinessCheck: readinessCheckRequested,
            allowRepeatedReadinessNudge,
            priorReadinessNudge,
          },
        ),
      };

      const upstreamAbort = new AbortController();
      let clientAborted = req.aborted === true;
      const onAborted = () => {
        clientAborted = true;
        upstreamAbort.abort();
      };
      req.once("aborted", onAborted);

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
              authorization: `Bearer ${apiKey}`,
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
            return;
          }
          throw error;
        }

        if (clientAborted) {
          return;
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
                return;
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
            sendJson(res, status, {
              ok: false,
              error: upstreamMessage,
              detail,
              ...buildBillingSnapshot(lane),
            });
            return;
          }
        }

        const payload = (await upstream.json()) as unknown;
        const rawReply = extractAssistantReply(payload);
        if (!rawReply) {
          sendJson(res, 502, {
            ok: false,
            error: "OpenAI returned empty response",
            ...buildBillingSnapshot(lane),
          });
          return;
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
          sendJson(res, 502, {
            ok: false,
            error: "Assistant returned an invalid response",
            ...buildBillingSnapshot(lane),
          });
          return;
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

        if (clientAborted || req.aborted) {
          return;
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

        if (clientAborted || req.aborted) {
          return;
        }

        sendJson(res, 200, {
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
        req.removeListener("aborted", onAborted);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      sendJson(res, 500, { ok: false, error: message });
    }
  };
}
